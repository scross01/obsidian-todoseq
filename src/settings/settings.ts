import { PluginSettingTab, App, Setting, ToggleComponent } from 'obsidian';
import TodoTracker from '../main';
import { TaskParser } from '../parser/task-parser';
import {
  parseKeywordInput,
  formatKeywordsForInput,
} from '../utils/settings-utils';
import { validateKeywordGroupsDetailed } from '../utils/task-utils';
import { TodoTrackerSettings } from './settings-types';
import { TaskListView } from '../view/task-list/task-list-view';
import { KeywordGroup } from '../types/task';

type KeywordSettingKey = keyof Pick<
  TodoTrackerSettings,
  | 'additionalActiveKeywords'
  | 'additionalInactiveKeywords'
  | 'additionalWaitingKeywords'
  | 'additionalCompletedKeywords'
  | 'additionalArchivedKeywords'
>;

interface KeywordFieldBinding {
  settingKey: KeywordSettingKey;
  inputEl: HTMLInputElement;
  settingEl: HTMLElement;
}

export class TodoTrackerSettingTab extends PluginSettingTab {
  plugin: TodoTracker;
  // Separate debounce timers for each keyword group input
  private keywordGroupDebounceTimers: Map<
    string,
    ReturnType<typeof setTimeout>
  > = new Map();
  private fileExtensionsDebounceTimer: ReturnType<typeof setTimeout> | null =
    null;
  private readonly KEYWORD_DEBOUNCE_MS = 500;
  private readonly FILE_EXTENSIONS_DEBOUNCE_MS = 500;
  private readonly keywordFieldBindings = new Map<
    KeywordSettingKey,
    KeywordFieldBinding
  >();

  private readonly keywordSettingToGroup: Record<
    KeywordSettingKey,
    KeywordGroup
  > = {
    additionalActiveKeywords: 'activeKeywords',
    additionalInactiveKeywords: 'inactiveKeywords',
    additionalWaitingKeywords: 'waitingKeywords',
    additionalCompletedKeywords: 'completedKeywords',
    additionalArchivedKeywords: 'archivedKeywords',
  };

  constructor(app: App, plugin: TodoTracker) {
    super(app, plugin);
    this.plugin = plugin;
  }

  private refreshAllTaskListViews = async () => {
    const leaves = this.app.workspace.getLeavesOfType('todoseq-view');
    const tasks = this.plugin.getTasks();
    for (const leaf of leaves) {
      if (leaf.view instanceof TaskListView) {
        const taskListView = leaf.view;
        taskListView.updateTasks(tasks);
        // Sync each view's mode from settings before render
        const mode = this.plugin.settings.taskListViewMode;
        taskListView.setViewMode(mode);
        // Use lighter refresh instead of full onOpen rebuild
        taskListView.refreshVisibleList();
      }
    }
  };

  /**
   * Validate and parse file extensions from user input
   * @param input The raw user input string
   * @returns Object with valid extensions and invalid extensions
   */
  private validateFileExtensions(input: string): {
    valid: string[];
    invalid: string[];
  } {
    const valid: string[] = [];
    const invalid: string[] = [];

    // Parse CSV, trim whitespace
    const parsed = input
      .split(',')
      .map((ext) => ext.trim().toLowerCase())
      .filter((ext) => ext.length > 0);

    for (const ext of parsed) {
      // Must start with a dot
      if (!ext.startsWith('.')) {
        invalid.push(ext);
        continue;
      }

      // Must have at least one character after the dot
      if (ext.length < 2) {
        invalid.push(ext);
        continue;
      }

      // Must contain only valid characters (letters, numbers, dots, hyphens, underscores)
      // Allow multi-level extensions like .txt.bak
      if (!/^\.[a-zA-Z0-9._-]+$/.test(ext)) {
        invalid.push(ext);
        continue;
      }

      valid.push(ext);
    }

    return { valid, invalid };
  }

  /**
   * Create the Task Keywords settings section with sub-sections for each group
   */
  private createTaskKeywordsSettings(containerEl: HTMLElement): void {
    // Task Keywords heading
    new Setting(containerEl)
      .setName('Task keywords')
      .setHeading()
      .setDesc('Add custom keywords to extend the built-in task states.');

    // Active keywords sub-section
    this.createKeywordGroupSetting(
      containerEl,
      'additionalActiveKeywords',
      'Active keywords',
      'Keywords for tasks currently being worked on (e.g. STARTED). Built-in: DOING, NOW, IN-PROGRESS.',
      this.plugin.settings.additionalActiveKeywords,
    );

    // Inactive keywords sub-section
    this.createKeywordGroupSetting(
      containerEl,
      'additionalInactiveKeywords',
      'Inactive keywords',
      'Keywords for tasks not yet started (e.g. FIXME, HACK). Built-in: TODO, LATER.',
      this.plugin.settings.additionalInactiveKeywords,
    );

    // Waiting keywords sub-section
    this.createKeywordGroupSetting(
      containerEl,
      'additionalWaitingKeywords',
      'Waiting keywords',
      'Keywords for blocked or paused tasks (e.g. ON-HOLD). Built-in: WAIT, WAITING.',
      this.plugin.settings.additionalWaitingKeywords,
    );

    // Completed keywords sub-section
    this.createKeywordGroupSetting(
      containerEl,
      'additionalCompletedKeywords',
      'Completed keywords',
      'Keywords for finished or abandoned tasks (e.g. NEVER). Built-in: DONE, CANCELLED, CANCELED.',
      this.plugin.settings.additionalCompletedKeywords,
    );

    // Archived keywords sub-section
    this.createKeywordGroupSetting(
      containerEl,
      'additionalArchivedKeywords',
      'Archived keywords',
      'Keywords for archived tasks (e.g. OLD). These tasks are styled but NOT collected during vault scans. Built-in: ARCHIVED.',
      this.plugin.settings.additionalArchivedKeywords,
    );

    // Run initial validation on open so existing warnings/errors are visible
    const parsedBySetting = this.parseKeywordInputsFromUI();
    const regexValidation =
      this.validateKeywordRegexForAllGroups(parsedBySetting);
    const groupsForValidation = this.toGroupKeywordInput(
      regexValidation.validBySetting,
    );
    const keywordValidation =
      validateKeywordGroupsDetailed(groupsForValidation);

    this.renderKeywordValidationState(
      regexValidation.errorsByGroup,
      keywordValidation.errors,
      keywordValidation.warnings,
    );
  }

  /**
   * Create a keyword group setting with validation
   * Uses flat settings properties: additionalActiveKeywords, additionalInactiveKeywords,
   * additionalWaitingKeywords, additionalCompletedKeywords, additionalArchivedKeywords
   */
  private createKeywordGroupSetting(
    containerEl: HTMLElement,
    settingKey: KeywordSettingKey,
    name: string,
    description: string,
    currentValue: string[],
  ): void {
    const setting = new Setting(containerEl).setName(name).setDesc(description);

    setting.addText((text) => {
      text
        .setValue(formatKeywordsForInput(currentValue))
        .setPlaceholder('KEYWORD')
        .onChange((value) => {
          this.keywordFieldBindings.set(settingKey, {
            settingKey,
            inputEl: text.inputEl,
            settingEl: setting.settingEl,
          });

          // Force uppercase in the UI field immediately
          const forced = value.toUpperCase();
          if (forced !== value) {
            try {
              text.setValue(forced);
            } catch {
              // no-op if API surface changes
            }
          }

          // Clear any pending debounce timer for this specific group
          const existingTimer = this.keywordGroupDebounceTimers.get(settingKey);
          if (existingTimer) {
            clearTimeout(existingTimer);
          }

          // Debounce the expensive operations
          const newTimer = setTimeout(async () => {
            // Clear the timer from the map when it executes
            this.keywordGroupDebounceTimers.delete(settingKey);

            // Parse and validate all keyword fields so all groups get updated warnings/errors
            const parsedBySetting = this.parseKeywordInputsFromUI();
            const regexValidation =
              this.validateKeywordRegexForAllGroups(parsedBySetting);
            const groupsForValidation = this.toGroupKeywordInput(
              regexValidation.validBySetting,
            );
            const keywordValidation =
              validateKeywordGroupsDetailed(groupsForValidation);

            this.renderKeywordValidationState(
              regexValidation.errorsByGroup,
              keywordValidation.errors,
              keywordValidation.warnings,
            );

            // Persist parsed values that pass regex safety. KeywordManager handles
            // semantic validation for duplicates/group placement conflicts.
            for (const [key, values] of Object.entries(
              regexValidation.validBySetting,
            )) {
              this.plugin.settings[key as KeywordSettingKey] = values;
            }
            await this.plugin.saveSettings();

            // Recreate parser and rescan
            try {
              await this.plugin.recreateParser();
              await this.plugin.scanVault();
              await this.refreshAllTaskListViews();
              this.plugin.refreshVisibleEditorDecorations();
              this.plugin.refreshReaderViewFormatter();
            } catch (parseError) {
              console.error(
                'Failed to recreate parser with keywords:',
                parseError,
              );
            }
          }, this.KEYWORD_DEBOUNCE_MS);

          // Store the timer in the map
          this.keywordGroupDebounceTimers.set(settingKey, newTimer);
        });

      this.keywordFieldBindings.set(settingKey, {
        settingKey,
        inputEl: text.inputEl,
        settingEl: setting.settingEl,
      });
    });
  }

  private parseKeywordInputsFromUI(): Record<KeywordSettingKey, string[]> {
    const fallback: Record<KeywordSettingKey, string[]> = {
      additionalActiveKeywords: [
        ...(this.plugin.settings.additionalActiveKeywords ?? []),
      ],
      additionalInactiveKeywords: [
        ...(this.plugin.settings.additionalInactiveKeywords ?? []),
      ],
      additionalWaitingKeywords: [
        ...(this.plugin.settings.additionalWaitingKeywords ?? []),
      ],
      additionalCompletedKeywords: [
        ...(this.plugin.settings.additionalCompletedKeywords ?? []),
      ],
      additionalArchivedKeywords: [
        ...(this.plugin.settings.additionalArchivedKeywords ?? []),
      ],
    };

    for (const [settingKey, binding] of this.keywordFieldBindings.entries()) {
      fallback[settingKey] = parseKeywordInput(
        binding.inputEl.value.toUpperCase(),
      );
    }

    return fallback;
  }

  private validateKeywordRegexForAllGroups(
    parsedBySetting: Record<KeywordSettingKey, string[]>,
  ): {
    validBySetting: Record<KeywordSettingKey, string[]>;
    errorsByGroup: Record<KeywordGroup, string[]>;
  } {
    const validBySetting: Record<KeywordSettingKey, string[]> = {
      additionalActiveKeywords: [],
      additionalInactiveKeywords: [],
      additionalWaitingKeywords: [],
      additionalCompletedKeywords: [],
      additionalArchivedKeywords: [],
    };

    const errorsByGroup: Record<KeywordGroup, string[]> = {
      activeKeywords: [],
      inactiveKeywords: [],
      waitingKeywords: [],
      completedKeywords: [],
      archivedKeywords: [],
    };

    for (const settingKey of Object.keys(
      parsedBySetting,
    ) as KeywordSettingKey[]) {
      const group = this.keywordSettingToGroup[settingKey];
      for (const token of parsedBySetting[settingKey]) {
        const keywordToValidate = token.startsWith('-')
          ? token.slice(1)
          : token;
        try {
          TaskParser.validateKeywords([keywordToValidate]);
          validBySetting[settingKey].push(token);
        } catch {
          errorsByGroup[group].push(`Invalid keyword syntax: ${token}`);
        }
      }
    }

    return { validBySetting, errorsByGroup };
  }

  private toGroupKeywordInput(bySetting: Record<KeywordSettingKey, string[]>): {
    activeKeywords: string[];
    inactiveKeywords: string[];
    waitingKeywords: string[];
    completedKeywords: string[];
    archivedKeywords: string[];
  } {
    return {
      activeKeywords: bySetting.additionalActiveKeywords,
      inactiveKeywords: bySetting.additionalInactiveKeywords,
      waitingKeywords: bySetting.additionalWaitingKeywords,
      completedKeywords: bySetting.additionalCompletedKeywords,
      archivedKeywords: bySetting.additionalArchivedKeywords,
    };
  }

  private renderKeywordValidationState(
    regexErrorsByGroup: Record<KeywordGroup, string[]>,
    keywordErrors: Array<{ group: KeywordGroup; message: string }>,
    keywordWarnings: Array<{ group: KeywordGroup; message: string }>,
  ): void {
    const errorsByGroup: Record<KeywordGroup, string[]> = {
      activeKeywords: [...regexErrorsByGroup.activeKeywords],
      inactiveKeywords: [...regexErrorsByGroup.inactiveKeywords],
      waitingKeywords: [...regexErrorsByGroup.waitingKeywords],
      completedKeywords: [...regexErrorsByGroup.completedKeywords],
      archivedKeywords: [...regexErrorsByGroup.archivedKeywords],
    };
    const warningsByGroup: Record<KeywordGroup, string[]> = {
      activeKeywords: [],
      inactiveKeywords: [],
      waitingKeywords: [],
      completedKeywords: [],
      archivedKeywords: [],
    };

    for (const issue of keywordErrors) {
      errorsByGroup[issue.group].push(issue.message);
    }

    for (const issue of keywordWarnings) {
      warningsByGroup[issue.group].push(issue.message);
    }

    for (const binding of this.keywordFieldBindings.values()) {
      binding.inputEl.classList.remove('todoseq-invalid-input');

      const existingErrors = binding.settingEl.querySelectorAll(
        '.todoseq-setting-item-error',
      );
      for (const el of Array.from(existingErrors)) {
        el.remove();
      }

      const existingWarnings = binding.settingEl.querySelectorAll(
        '.todoseq-setting-item-warning',
      );
      for (const el of Array.from(existingWarnings)) {
        el.remove();
      }

      const group = this.keywordSettingToGroup[binding.settingKey];
      const groupErrors = Array.from(new Set(errorsByGroup[group]));
      const groupWarnings = Array.from(new Set(warningsByGroup[group]));
      const settingInfo = binding.settingEl.querySelector('.setting-item-info');
      if (!settingInfo) {
        continue;
      }

      if (groupErrors.length > 0) {
        const errorDiv = document.createElement('div');
        errorDiv.className = 'todoseq-setting-item-error';
        for (const message of groupErrors) {
          const row = document.createElement('div');
          row.textContent = message;
          errorDiv.appendChild(row);
        }
        settingInfo.appendChild(errorDiv);
        binding.inputEl.classList.add('todoseq-invalid-input');
      }

      if (groupWarnings.length > 0) {
        const warningDiv = document.createElement('div');
        warningDiv.className = 'todoseq-setting-item-warning';
        for (const message of groupWarnings) {
          const row = document.createElement('div');
          row.textContent = message;
          warningDiv.appendChild(row);
        }
        settingInfo.appendChild(warningDiv);
      }
    }
  }

  /**
   * Creates the task detection settings section.
   */
  private createTaskDetectionSettings(containerEl: HTMLElement) {
    new Setting(containerEl)
      .setName('Task detection')
      .setHeading()
      .setDesc('Select where task are detected in the vault content.');

    // Include tasks inside callout blocks
    new Setting(containerEl)
      .setName('Include tasks inside quote and callout blocks')
      .setDesc(
        'When enabled, include tasks inside quote and callout blocks (>, >[!info], >[!todo], etc.).',
      )
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.includeCalloutBlocks)
          .onChange(async (value) => {
            this.plugin.settings.includeCalloutBlocks = value;
            await this.plugin.saveSettings();
            // Recreate parser to reflect includeCalloutBlocks change and rescan
            await this.plugin.recreateParser();
            await this.plugin.scanVault();
            await this.refreshAllTaskListViews();
            // Force refresh of visible editor decorations to apply new CSS classes
            this.plugin.refreshVisibleEditorDecorations();
            // Force refresh of reader view to apply new formatting
            this.plugin.refreshReaderViewFormatter();
          }),
      );

    // Include tasks inside comment blocks
    new Setting(containerEl)
      .setName('Include tasks inside comments')
      .setDesc('When enabled, include tasks inside comments (%%).')
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.includeCommentBlocks)
          .onChange(async (value) => {
            this.plugin.settings.includeCommentBlocks = value;
            await this.plugin.saveSettings();
            // Recreate parser to reflect includeCommentBlocks change and rescan
            await this.plugin.recreateParser();
            await this.plugin.scanVault();
            await this.refreshAllTaskListViews();
            // Force refresh of visible editor decorations to apply new CSS classes
            this.plugin.refreshVisibleEditorDecorations();
            // Force refresh of reader view to apply new formatting
            this.plugin.refreshReaderViewFormatter();
          }),
      );

    // Include tasks inside code blocks

    // Include tasks inside code blocks (parent setting)
    let languageToggleComponent: ToggleComponent | null = null;

    new Setting(containerEl)
      .setName('Include tasks inside code blocks')
      .setDesc(
        'When enabled, tasks inside fenced code blocks (``` or ~~~) will be included.',
      )
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.includeCodeBlocks)
          .onChange(async (value) => {
            this.plugin.settings.includeCodeBlocks = value;
            // If disabling code blocks, also disable language comment support
            if (!value) {
              this.plugin.settings.languageCommentSupport = false;
            }
            await this.plugin.saveSettings();
            // Update language toggle visual state by recreating it
            if (languageToggleComponent) {
              languageToggleComponent.setValue(
                this.plugin.settings.languageCommentSupport,
              );
            }
            languageSetting.setDisabled(!value);
            // Recreate parser to reflect includeCodeBlocks change and rescan
            await this.plugin.recreateParser();
            await this.plugin.scanVault();
            await this.refreshAllTaskListViews();
            // Force refresh of visible editor decorations to apply new CSS classes
            this.plugin.refreshVisibleEditorDecorations();
            // Force refresh of reader view to apply new formatting
            this.plugin.refreshReaderViewFormatter();
          }),
      );

    // Language comment support settings (dependent on includeCodeBlocks)
    const languageSettingContainer = containerEl.createDiv();
    const languageSetting = new Setting(languageSettingContainer)
      .setName('Enable language comment support')
      .setDesc(
        'When enabled, tasks inside code blocks will be detected using language-specific comment patterns e.g. `// TODO`',
      )
      .addToggle((toggle) => {
        languageToggleComponent = toggle;
        return toggle
          .setValue(this.plugin.settings.languageCommentSupport)
          .onChange(async (value) => {
            this.plugin.settings.languageCommentSupport = value;
            await this.plugin.saveSettings();
            await this.plugin.recreateParser();
            await this.plugin.scanVault();
            await this.refreshAllTaskListViews();
            // Force refresh of visible editor decorations to apply new CSS classes
            this.plugin.refreshVisibleEditorDecorations();
            // Force refresh of reader view to apply new formatting
            this.plugin.refreshReaderViewFormatter();
          });
      });

    // Set initial disabled state based on includeCodeBlocks setting
    languageSetting.setDisabled(!this.plugin.settings.includeCodeBlocks);

    // Update language toggle when includeCodeBlocks changes
    const updateLanguageToggle = (enabled: boolean) => {
      const languageToggle = languageSetting.settingEl.querySelector(
        'input[type="checkbox"]',
      ) as HTMLInputElement;
      if (languageToggle) {
        languageToggle.checked = enabled;
      }
      languageSetting.setDisabled(!enabled);
    };

    // Listen for includeCodeBlocks changes and update language toggle accordingly
    updateLanguageToggle(this.plugin.settings.includeCodeBlocks);
  }

  /**
   * Creates the settings for task list search and filter options
   */
  private createTaskSearchFilterSettings(containerEl: HTMLElement) {
    new Setting(containerEl)
      .setName('Task list search and filter')
      .setHeading()
      .setDesc(
        'Set the default search and filter settings for the task list view.',
      );

    new Setting(containerEl)
      .setName('Week starts on')
      .setDesc('Choose which day the week starts on for date filtering.')
      .addDropdown((drop) => {
        drop.addOption('Monday', 'Monday');
        drop.addOption('Sunday', 'Sunday');
        drop.setValue(this.plugin.settings.weekStartsOn);
        drop.onChange(async (value: string) => {
          const weekStart = value as 'Monday' | 'Sunday';
          this.plugin.settings.weekStartsOn = weekStart;
          await this.plugin.saveSettings();
          await this.refreshAllTaskListViews();
        });
      });

    new Setting(containerEl)
      .setName('Completed tasks')
      .setDesc('Choose how completed items are shown in the task list.')
      .addDropdown((drop) => {
        drop.addOption('showAll', 'Show all tasks');
        drop.addOption('sortCompletedLast', 'Sort completed to end');
        drop.addOption('hideCompleted', 'Hide completed');
        drop.setValue(this.plugin.settings.taskListViewMode);
        drop.onChange(async (value: string) => {
          const mode = value as
            | 'showAll'
            | 'sortCompletedLast'
            | 'hideCompleted';
          this.plugin.settings.taskListViewMode = mode;
          await this.plugin.saveSettings();
          await this.refreshAllTaskListViews();
        });
      });

    new Setting(containerEl)
      .setName('Future dated tasks')
      .setDesc(
        'Chooose how tasks with future dates are displayed in the task list.',
      )
      .addDropdown((drop) => {
        drop.addOption('showAll', 'Show all tasks');
        drop.addOption('showUpcoming', 'Show upcoming (7 days)');
        drop.addOption('sortToEnd', 'Sort future to end');
        drop.addOption('hideFuture', 'Hide future');
        drop.setValue(this.plugin.settings.futureTaskSorting);
        drop.onChange(async (value: string) => {
          const mode = value as
            | 'showAll'
            | 'showUpcoming'
            | 'sortToEnd'
            | 'hideFuture';
          this.plugin.settings.futureTaskSorting = mode;
          await this.plugin.saveSettings();
          await this.refreshAllTaskListViews();
        });
      });

    new Setting(containerEl)
      .setName('Default sort method')
      .setDesc('Choose the default sort method for the task list.')
      .addDropdown((drop) => {
        drop.addOption('default', 'Default (file path)');
        drop.addOption('sortByScheduled', 'Scheduled date');
        drop.addOption('sortByDeadline', 'Deadline date');
        drop.addOption('sortByPriority', 'Priority');
        drop.addOption('sortByUrgency', 'Urgency');
        drop.setValue(this.plugin.settings.defaultSortMethod);
        drop.onChange(async (value: string) => {
          const sortMethod = value as
            | 'default'
            | 'sortByScheduled'
            | 'sortByDeadline'
            | 'sortByPriority'
            | 'sortByUrgency';
          this.plugin.settings.defaultSortMethod = sortMethod;
          await this.plugin.saveSettings();
        });
      });
  }

  /**
   * Creates main settings
   */
  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    // Format task keywords in editor
    new Setting(containerEl)
      .setName('Format task keywords')
      .setDesc(
        'Highlight task keywords (TODO, DOING, etc.) in bold with accent color in the editor.',
      )
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.formatTaskKeywords)
          .onChange(async (value) => {
            this.plugin.settings.formatTaskKeywords = value;
            await this.plugin.saveSettings();
            // Trigger formatting updates
            this.plugin.updateTaskFormatting();
          }),
      );

    // Task detection Group
    this.createTaskDetectionSettings(containerEl);

    // Task list search and filter Group
    this.createTaskSearchFilterSettings(containerEl);

    // Task Keywords section with sub-sections for each group
    this.createTaskKeywordsSettings(containerEl);

    // Experimental Features Group
    new Setting(containerEl)
      .setName('Experimental Features')
      .setHeading()
      .setDesc(
        '⚠︎ Experimental features may be changed significantly or removed entirely in future versions.',
      );

    // Org-mode file detection toggle
    new Setting(containerEl)
      .setName('Detect org-mode files')
      .setDesc(
        'When enabled, scans for .org files in vault and detects tasks using org-mode syntax.',
      )
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.detectOrgModeFiles)
          .onChange(async (value) => {
            this.plugin.settings.detectOrgModeFiles = value;

            // Sync .org extension with additionalFileExtensions
            const currentExtensions = [
              ...(this.plugin.settings.additionalFileExtensions ?? []),
            ];
            const orgExtension = '.org';

            if (value) {
              // Add .org if not already present
              if (!currentExtensions.includes(orgExtension)) {
                currentExtensions.push(orgExtension);
              }
            } else {
              // Remove .org if present
              const orgIndex = currentExtensions.indexOf(orgExtension);
              if (orgIndex !== -1) {
                currentExtensions.splice(orgIndex, 1);
              }
            }

            this.plugin.settings.additionalFileExtensions = currentExtensions;
            await this.plugin.saveSettings();

            // Re-register parsers based on new settings
            await this.plugin.updateOrgModeParserRegistration();

            // Rescan vault to pick up or remove .org files
            try {
              await this.plugin.scanVault();
              await this.refreshAllTaskListViews();
              this.plugin.refreshVisibleEditorDecorations();
              this.plugin.refreshReaderViewFormatter();
            } catch (scanError) {
              console.error('Failed to rescan vault:', scanError);
            }
          }),
      );
  }
}
