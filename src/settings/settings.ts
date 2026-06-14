import {
  PluginSettingTab,
  App,
  Setting,
  SettingGroup,
  ToggleComponent,
  Notice,
  DropdownComponent,
} from 'obsidian';
import TodoTracker from '../main';
import { TaskParser } from '../parser/task-parser';
import {
  parseKeywordInput,
  formatKeywordsForInput,
  validateKeywordGroupsDetailed,
} from '../utils/settings-utils';
import { TodoTrackerSettings } from './settings-types';
import { SUPPORTED_EXTENSIONS } from '../parser/code-comment-task-parser';
import { TaskListView } from '../view/task-list/task-list-view';
import { KeywordGroup } from '../types/task';
import { TransitionParser } from '../services/transition-parser';
import { KeywordManager } from '../utils/keyword-manager';

function hideSettingNameAndControl(setting: Setting): void {
  // eslint-disable-next-line obsidianmd/no-static-styles-assignment -- nameEl created by Setting API, can't target via CSS class
  setting.nameEl.style.display = 'none';
  // eslint-disable-next-line obsidianmd/no-static-styles-assignment -- controlEl created by Setting API, can't target via CSS class
  setting.controlEl.style.display = 'none';
}

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
  private keywordGroupDebounceTimers: Map<string, number> = new Map();
  private fileExtensionsDebounceTimer: number | null = null;
  private transitionValidationDebounceTimer: number | null = null;
  private readonly KEYWORD_DEBOUNCE_MS = 500;
  private readonly FILE_EXTENSIONS_DEBOUNCE_MS = 500;
  private readonly TRANSITION_VALIDATION_DEBOUNCE_MS = 500;
  private readonly keywordFieldBindings = new Map<
    KeywordSettingKey,
    KeywordFieldBinding
  >();
  // Store dropdown components for default state settings to update when keywords change
  private defaultStateDropdowns: {
    inactive?: DropdownComponent;
    active?: DropdownComponent;
    completed?: DropdownComponent;
  } = {};

  // Store Setting instances for transition settings to attach validation errors
  private transitionSettings: {
    inactive?: Setting;
    active?: Setting;
    completed?: Setting;
    transitions?: Setting;
  } = {};

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
        // Update context menu config for settings changes
        taskListView.updateContextMenuConfig();
        // Use lighter refresh instead of full onOpen rebuild
        taskListView.refreshVisibleList().catch((error) => {
          new Notice('Failed to refresh task list');
          console.error('Error refreshing task list:', error);
        });
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
    new SettingGroup(containerEl)
      .setHeading('Task keywords')
      .addSetting((setting) =>
        this.configureKeywordGroupSetting(
          setting,
          'additionalInactiveKeywords',
          'Inactive keywords',
          'Keywords for tasks not yet started (e.g. FIXME, HACK). Built-in: TODO, LATER.',
          this.plugin.settings.additionalInactiveKeywords,
        ),
      )
      .addSetting((setting) =>
        this.configureKeywordGroupSetting(
          setting,
          'additionalActiveKeywords',
          'Active keywords',
          'Keywords for tasks currently being worked on (e.g. STARTED). Built-in: DOING, NOW, IN-PROGRESS.',
          this.plugin.settings.additionalActiveKeywords,
        ),
      )
      .addSetting((setting) =>
        this.configureKeywordGroupSetting(
          setting,
          'additionalWaitingKeywords',
          'Waiting keywords',
          'Keywords for blocked or paused tasks (e.g. ON-HOLD). Built-in: WAIT, WAITING.',
          this.plugin.settings.additionalWaitingKeywords,
        ),
      )
      .addSetting((setting) =>
        this.configureKeywordGroupSetting(
          setting,
          'additionalCompletedKeywords',
          'Completed keywords',
          'Keywords for finished or abandoned tasks (e.g. NEVER). Built-in: DONE, CANCELLED, CANCELED.',
          this.plugin.settings.additionalCompletedKeywords,
        ),
      )
      .addSetting((setting) =>
        this.configureKeywordGroupSetting(
          setting,
          'additionalArchivedKeywords',
          'Archived keywords',
          'Keywords for archived tasks (e.g. OLD). These tasks are styled but NOT collected during vault scans. Built-in: ARCHIVED.',
          this.plugin.settings.additionalArchivedKeywords,
        ),
      )
      .addSetting((setting) => {
        setting
          .setName('Migrated state keyword')
          .setDesc(
            'Keyword or text to set on the source task after migrating to daily note. Leave empty to disable.',
          )
          .addText((text) => {
            const currentValue = this.plugin.settings.migrateToTodayState;
            text.setValue(currentValue);
            text.setPlaceholder(currentValue || '(disabled)');
            text.onChange(async (value) => {
              this.plugin.settings.migrateToTodayState = value;
              await this.plugin.saveSettings();
              // Update embedded task list settings to refresh context menu
              if (this.plugin.embeddedTaskListProcessor) {
                this.plugin.embeddedTaskListProcessor.updateSettings();
              }
              // Refresh all task list views to update context menu
              await this.refreshAllTaskListViews();
            });
          });
      });

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
   * Configure a keyword group setting with validation
   * Uses flat settings properties: additionalActiveKeywords, additionalInactiveKeywords,
   * additionalWaitingKeywords, additionalCompletedKeywords, additionalArchivedKeywords
   */
  private configureKeywordGroupSetting(
    setting: Setting,
    settingKey: KeywordSettingKey,
    name: string,
    description: string,
    currentValue: string[],
  ): void {
    setting.setName(name).setDesc(description);

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
            window.clearTimeout(existingTimer);
          }

          // Debounce the expensive operations
          const newTimer = window.setTimeout(() => {
            void (async () => {
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

              // Update default state dropdowns when keywords change
              await this.updateDefaultStateDropdowns();

              // Re-validate transition settings when keywords change
              this.validateTransitionSettings();

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
            })();
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
        const errorDiv = window.activeDocument.createElement('div');
        errorDiv.className = 'todoseq-setting-item-error';
        for (const message of groupErrors) {
          const row = window.activeDocument.createElement('div');
          row.textContent = message;
          errorDiv.appendChild(row);
        }
        settingInfo.appendChild(errorDiv);
        binding.inputEl.classList.add('todoseq-invalid-input');
      }

      if (groupWarnings.length > 0) {
        const warningDiv = window.activeDocument.createElement('div');
        warningDiv.className = 'todoseq-setting-item-warning';
        for (const message of groupWarnings) {
          const row = window.activeDocument.createElement('div');
          row.textContent = message;
          warningDiv.appendChild(row);
        }
        settingInfo.appendChild(warningDiv);
      }
    }
  }

  /**
   * Creates the task state transitions settings section.
   */
  private createStateTransitionsSettings(containerEl: HTMLElement): void {
    // Get keyword manager to populate dropdown options
    const keywordManager = new KeywordManager(this.plugin.settings);

    // Compute default values for each state
    const defaultInactive = this.getDefaultForGroup(
      keywordManager,
      'inactiveKeywords',
      'TODO',
    );
    const defaultActive = this.getDefaultForGroup(
      keywordManager,
      'activeKeywords',
      'DOING',
    );
    const defaultCompleted = this.getDefaultForGroup(
      keywordManager,
      'completedKeywords',
      'DONE',
    );

    new SettingGroup(containerEl)
      .setHeading('Task state transitions')
      .addSetting((setting) => {
        this.transitionSettings.transitions = setting;
        setting
          .setName('State transitions')
          .setDesc(
            'Define how states transition. Each line: STATE -> next_state. Use (a | b) to define multiple initial states.',
          )
          .addTextArea((textArea) => {
            // Set the size of the textarea directly on the underlying element
            textArea.inputEl.cols = 48;
            textArea.inputEl.rows = 4;
            textArea
              .setValue(
                this.plugin.settings.stateTransitions.transitionStatements.join(
                  '\n',
                ),
              )
              .setPlaceholder(
                // eslint-disable-next-line obsidianmd/ui/sentence-case -- states are capitalized
                'TODO -> DOING -> DONE\n(WAIT | WAITING) -> IN-PROGRESS\nLATER -> NOW -> DONE',
              )
              .onChange(async (value: string) => {
                const statements = value
                  .split('\n')
                  .map((s: string) => s.trim())
                  .filter((s: string) => s.length > 0);
                this.plugin.settings.stateTransitions.transitionStatements =
                  statements;
                await this.plugin.saveSettings();

                // Debounce validation to allow user to finish typing
                if (this.transitionValidationDebounceTimer) {
                  window.clearTimeout(this.transitionValidationDebounceTimer);
                }
                this.transitionValidationDebounceTimer = window.setTimeout(
                  () => {
                    this.transitionValidationDebounceTimer = null;
                    this.validateTransitionSettings();
                    // Update task list views with new state transition settings
                    this.plugin.updateTaskListViewSettings();
                    // Update task update coordinator with new settings
                    this.plugin.updateTaskUpdateCoordinatorSettings();
                  },
                  this.TRANSITION_VALIDATION_DEBOUNCE_MS,
                );
              });
          });
      })
      .addSetting((setting) => {
        this.transitionSettings.inactive = setting;
        setting
          .setName('Default inactive state')
          .setDesc(
            'The default state for inactive tasks when no explicit transition is defined.',
          )
          .addDropdown((dropdown) => {
            this.defaultStateDropdowns.inactive = dropdown;
            this.populateDefaultStateDropdown(
              dropdown,
              keywordManager.getInactiveSet(),
            );
            dropdown.setValue(
              this.plugin.settings.stateTransitions.defaultInactive ||
                defaultInactive,
            );
            dropdown.onChange(async (value) => {
              this.plugin.settings.stateTransitions.defaultInactive = value;
              await this.plugin.saveSettings();
              this.validateTransitionSettings();
              // Update task list views with new state transition settings
              this.plugin.updateTaskListViewSettings();
              // Update task update coordinator with new settings
              this.plugin.updateTaskUpdateCoordinatorSettings();
            });
          });
      })
      .addSetting((setting) => {
        this.transitionSettings.active = setting;
        setting
          .setName('Default active state')
          .setDesc(
            'The default state for active tasks when no explicit transition is defined.',
          )
          .addDropdown((dropdown) => {
            this.defaultStateDropdowns.active = dropdown;
            this.populateDefaultStateDropdown(
              dropdown,
              keywordManager.getActiveSet(),
            );
            dropdown.setValue(
              this.plugin.settings.stateTransitions.defaultActive ||
                defaultActive,
            );
            dropdown.onChange(async (value) => {
              this.plugin.settings.stateTransitions.defaultActive = value;
              await this.plugin.saveSettings();
              this.validateTransitionSettings();
              // Update task list views with new state transition settings
              this.plugin.updateTaskListViewSettings();
              // Update task update coordinator with new settings
              this.plugin.updateTaskUpdateCoordinatorSettings();
            });
          });
      })
      .addSetting((setting) => {
        this.transitionSettings.completed = setting;
        setting
          .setName('Default completed state')
          .setDesc(
            'The default state for completed tasks when no explicit transition is defined.',
          )
          .addDropdown((dropdown) => {
            this.defaultStateDropdowns.completed = dropdown;
            this.populateDefaultStateDropdown(
              dropdown,
              keywordManager.getCompletedSet(),
            );
            dropdown.setValue(
              this.plugin.settings.stateTransitions.defaultCompleted ||
                defaultCompleted,
            );
            dropdown.onChange(async (value) => {
              this.plugin.settings.stateTransitions.defaultCompleted = value;
              await this.plugin.saveSettings();
              this.validateTransitionSettings();
              // Update task list views with new state transition settings
              this.plugin.updateTaskListViewSettings();
              // Update task update coordinator with new settings
              this.plugin.updateTaskUpdateCoordinatorSettings();
            });
          });
      })
      .addSetting((setting) => {
        setting
          .setName('Track closed date')
          .setDesc('Add closed: timestamp when tasks are marked as completed.')
          .addToggle((toggle) =>
            toggle
              .setValue(this.plugin.settings.trackClosedDate)
              .onChange(async (value) => {
                this.plugin.settings.trackClosedDate = value;
                await this.plugin.saveSettings();
              }),
          );
      });

    // Initial validation
    this.validateTransitionSettings();
  }

  /**
   * Populate a default state dropdown with keywords from the specified group.
   */
  private populateDefaultStateDropdown(
    dropdown: DropdownComponent,
    keywords: Set<string>,
  ): void {
    // Clear existing options
    dropdown.selectEl.empty();

    // Add keywords in sorted order
    const sortedKeywords = Array.from(keywords).sort();
    for (const keyword of sortedKeywords) {
      const option = window.activeDocument.createElement('option');
      option.value = keyword;
      option.textContent = keyword;
      dropdown.selectEl.appendChild(option);
    }
  }

  /**
   * Get the default value for a keyword group.
   * Uses the preferred default (TODO/DOING/DONE) if it exists in the keyword set,
   * otherwise uses the first keyword from the ordered list for that group.
   */
  private getDefaultForGroup(
    keywordManager: KeywordManager,
    group: 'inactiveKeywords' | 'activeKeywords' | 'completedKeywords',
    preferredDefault: string,
  ): string {
    const keywordSet = keywordManager.getKeywordsForGroup(group);
    if (keywordSet.length === 0) {
      return preferredDefault;
    }
    if (keywordSet.includes(preferredDefault)) {
      return preferredDefault;
    }
    return keywordSet[0];
  }

  /**
   * Update all default state dropdowns when keywords change.
   */
  private async updateDefaultStateDropdowns(): Promise<void> {
    const keywordManager = new KeywordManager(this.plugin.settings);
    let needsSave = false;

    if (this.defaultStateDropdowns.inactive) {
      const currentValue = this.defaultStateDropdowns.inactive.getValue();
      this.populateDefaultStateDropdown(
        this.defaultStateDropdowns.inactive,
        keywordManager.getInactiveSet(),
      );
      // Restore current value if it still exists, otherwise use computed default
      if (currentValue && keywordManager.getInactiveSet().has(currentValue)) {
        this.defaultStateDropdowns.inactive.setValue(currentValue);
      } else {
        const defaultInactive = this.getDefaultForGroup(
          keywordManager,
          'inactiveKeywords',
          'TODO',
        );
        this.defaultStateDropdowns.inactive.setValue(defaultInactive);
        this.plugin.settings.stateTransitions.defaultInactive = defaultInactive;
        needsSave = true;
      }
    }

    if (this.defaultStateDropdowns.active) {
      const currentValue = this.defaultStateDropdowns.active.getValue();
      this.populateDefaultStateDropdown(
        this.defaultStateDropdowns.active,
        keywordManager.getActiveSet(),
      );
      if (currentValue && keywordManager.getActiveSet().has(currentValue)) {
        this.defaultStateDropdowns.active.setValue(currentValue);
      } else {
        const defaultActive = this.getDefaultForGroup(
          keywordManager,
          'activeKeywords',
          'DOING',
        );
        this.defaultStateDropdowns.active.setValue(defaultActive);
        this.plugin.settings.stateTransitions.defaultActive = defaultActive;
        needsSave = true;
      }
    }

    if (this.defaultStateDropdowns.completed) {
      const currentValue = this.defaultStateDropdowns.completed.getValue();
      this.populateDefaultStateDropdown(
        this.defaultStateDropdowns.completed,
        keywordManager.getCompletedSet(),
      );
      if (currentValue && keywordManager.getCompletedSet().has(currentValue)) {
        this.defaultStateDropdowns.completed.setValue(currentValue);
      } else {
        const defaultCompleted = this.getDefaultForGroup(
          keywordManager,
          'completedKeywords',
          'DONE',
        );
        this.defaultStateDropdowns.completed.setValue(defaultCompleted);
        this.plugin.settings.stateTransitions.defaultCompleted =
          defaultCompleted;
        needsSave = true;
      }
    }

    if (needsSave) {
      await this.plugin.saveSettings();
    }
  }

  /**
   * Validate and display transition settings errors.
   * Attaches errors to individual settings using the same pattern as keyword errors.
   */
  private validateTransitionSettings(): void {
    const keywordManager = new KeywordManager(this.plugin.settings);
    const parser = new TransitionParser(keywordManager);
    const result = parser.parse(
      this.plugin.settings.stateTransitions.transitionStatements,
    );

    // Clear previous errors from all transition settings
    this.clearTransitionSettingErrors();

    // Check for default state errors (only if value is not empty)
    const allKeywords = keywordManager.getAllKeywords();

    // Validate inactive default
    const inactive = this.plugin.settings.stateTransitions.defaultInactive;
    if (inactive && !allKeywords.includes(inactive)) {
      this.attachInfoToSetting(
        this.transitionSettings.inactive,
        `Default inactive state '${inactive}' not found in keywords.`,
      );
    }

    // Validate active default
    const active = this.plugin.settings.stateTransitions.defaultActive;
    if (active && !allKeywords.includes(active)) {
      this.attachInfoToSetting(
        this.transitionSettings.active,
        `Default active state '${active}' not found in keywords.`,
      );
    }

    // Validate completed default
    const completed = this.plugin.settings.stateTransitions.defaultCompleted;
    if (completed && !allKeywords.includes(completed)) {
      this.attachInfoToSetting(
        this.transitionSettings.completed,
        `Default completed state '${completed}' not found in keywords.`,
      );
    }

    // Display transition errors - use same styling as keyword errors
    if (result.errors.length > 0) {
      this.attachErrorsToSetting(
        this.transitionSettings.transitions,
        result.errors.map((e) => e.message),
      );
    }
  }

  /**
   * Clear previous error/warning elements from transition settings.
   */
  private clearTransitionSettingErrors(): void {
    const settings = [
      this.transitionSettings.inactive,
      this.transitionSettings.active,
      this.transitionSettings.completed,
      this.transitionSettings.transitions,
    ];

    for (const setting of settings) {
      if (!setting) continue;

      // Clear error divs
      const existingErrors = setting.settingEl.querySelectorAll(
        '.todoseq-setting-item-error',
      );
      for (const el of Array.from(existingErrors)) {
        el.remove();
      }

      // Clear info/warning divs
      const existingInfos = setting.settingEl.querySelectorAll(
        '.todoseq-setting-item-info',
      );
      for (const el of Array.from(existingInfos)) {
        el.remove();
      }

      // Clear invalid input highlighting
      const textArea = setting.settingEl.querySelector('textarea');
      if (textArea) {
        textArea.classList.remove('todoseq-invalid-input');
      }
    }
  }

  /**
   * Attach info messages to a setting's info area.
   */
  private attachInfoToSetting(
    setting: Setting | undefined,
    message: string,
  ): void {
    if (!setting) return;

    const settingInfo = setting.settingEl.querySelector('.setting-item-info');
    if (!settingInfo) return;

    let infoDiv = settingInfo.querySelector('.todoseq-info-message');
    if (!infoDiv) {
      infoDiv = window.activeDocument.createElement('div');
      infoDiv.className = 'todoseq-setting-item-warning';
      settingInfo.appendChild(infoDiv);
    }

    const row = window.activeDocument.createElement('div');
    row.textContent = `${message}`;
    infoDiv.appendChild(row);
  }

  /**
   * Attach error messages to a setting, similar to keyword errors.
   */
  private attachErrorsToSetting(
    setting: Setting | undefined,
    messages: string[],
  ): void {
    if (!setting || messages.length === 0) return;

    const settingInfo = setting.settingEl.querySelector('.setting-item-info');
    if (!settingInfo) return;

    const errorDiv = window.activeDocument.createElement('div');
    errorDiv.className = 'todoseq-setting-item-error';
    for (const message of messages) {
      const row = window.activeDocument.createElement('div');
      row.textContent = message;
      errorDiv.appendChild(row);
    }
    settingInfo.appendChild(errorDiv);

    // Highlight the input field
    const textArea = setting.settingEl.querySelector('textarea');
    if (textArea) {
      textArea.classList.add('todoseq-invalid-input');
    }
  }

  /**
   * Creates the task detection settings section.
   */
  private createTaskDetectionSettings(containerEl: HTMLElement) {
    let languageToggleComponent: ToggleComponent | null = null;
    let languageSetting: Setting | null = null;

    new SettingGroup(containerEl)
      .setHeading('Task detection')
      .addSetting((setting) => {
        setting
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
      })
      .addSetting((setting) => {
        setting
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
      })
      .addSetting((setting) => {
        setting
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
                // Update language toggle visual state
                if (languageToggleComponent) {
                  languageToggleComponent.setValue(
                    this.plugin.settings.languageCommentSupport,
                  );
                }
                if (languageSetting) {
                  languageSetting.setDisabled(!value);
                }
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
      })
      .addSetting((setting) => {
        languageSetting = setting;
        setting
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
        setting.setDisabled(!this.plugin.settings.includeCodeBlocks);
      });
  }

  /**
   * Creates the settings for task list search and filter options
   */
  private createTaskSearchFilterSettings(containerEl: HTMLElement) {
    new SettingGroup(containerEl)
      .setHeading('Task list search and filter')
      .addSetting((setting) => {
        setting
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
      })
      .addSetting((setting) => {
        setting
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
      })
      .addSetting((setting) => {
        setting
          .setName('Future dated tasks')
          .setDesc(
            'Choose how tasks with future dates are displayed in the task list.',
          )
          .addDropdown((drop) => {
            drop.addOption('showAll', 'Show all tasks');
            drop.addOption('showUpcoming', 'Show upcoming');
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
      })
      .addSetting((setting) => {
        setting
          .setName('Upcoming period (days)')
          .setDesc(
            'Tasks within this many days are shown as "upcoming" when using the show upcoming option.',
          )
          .addText((text) => {
            text
              .setPlaceholder('7')
              .setValue(String(this.plugin.settings.upcomingPeriod))
              .onChange(async (value) => {
                const num = parseInt(value, 10);
                if (!isNaN(num) && num >= 1 && num <= 30) {
                  this.plugin.settings.upcomingPeriod = num;
                  await this.plugin.saveSettings();
                  await this.refreshAllTaskListViews();
                }
              });
            text.inputEl.type = 'number';
            text.inputEl.min = '1';
            text.inputEl.max = '30';
          });
      })
      .addSetting((setting) => {
        setting
          .setName('Default sort method')
          .setDesc('Choose the default sort method for the task list.')
          .addDropdown((drop) => {
            drop.addOption('default', 'Default (file path)');
            drop.addOption('sortByScheduled', 'Scheduled date');
            drop.addOption('sortByDeadline', 'Deadline date');
            drop.addOption('sortByClosedDate', 'Closed date');
            drop.addOption('sortByPriority', 'Priority');
            drop.addOption('sortByUrgency', 'Urgency');
            drop.setValue(this.plugin.settings.defaultSortMethod);
            drop.onChange(async (value: string) => {
              const sortMethod = value as
                | 'default'
                | 'sortByScheduled'
                | 'sortByDeadline'
                | 'sortByClosedDate'
                | 'sortByPriority'
                | 'sortByUrgency';
              this.plugin.settings.defaultSortMethod = sortMethod;
              await this.plugin.saveSettings();
            });
          });
      });
  }

  /**
   * Creates smart date recognition settings
   */
  private createSmartDateRecognitionSettings(containerEl: HTMLElement) {
    let removeKeywordsToggleComponent: ToggleComponent | null = null;
    let removeKeywordsSetting: Setting | null = null;

    new SettingGroup(containerEl)
      .setHeading('Smart date recognition')
      .addSetting((setting) => {
        setting
          .setName('Enable smart date recognition')
          .setDesc(
            'Automatically convert natural language dates like "today", "tomorrow", "due next week".',
          )
          .addToggle((toggle) =>
            toggle
              .setValue(this.plugin.settings.enableSmartDateRecognition)
              .onChange(async (value) => {
                this.plugin.settings.enableSmartDateRecognition = value;
                // If disabling smart date recognition, also disable remove date keywords
                if (!value) {
                  this.plugin.settings.smartDateRemoveKeywords = false;
                }
                await this.plugin.saveSettings();
                // Update remove keywords toggle visual state
                if (removeKeywordsToggleComponent) {
                  removeKeywordsToggleComponent.setValue(
                    this.plugin.settings.smartDateRemoveKeywords,
                  );
                }
                if (removeKeywordsSetting) {
                  removeKeywordsSetting.setDisabled(!value);
                }
                // Update smart date processor if it exists
                if (this.plugin.smartDateProcessor) {
                  this.plugin.smartDateProcessor.setEnabled(value);
                }
              }),
          );
      })
      .addSetting((setting) => {
        removeKeywordsSetting = setting;
        setting
          .setName('Remove date keywords')
          .setDesc(
            'Remove natural language text (e.g., "today", "tomorrow") after conversion to structured dates.',
          )
          .addToggle((toggle) => {
            removeKeywordsToggleComponent = toggle;
            return toggle
              .setValue(this.plugin.settings.smartDateRemoveKeywords)
              .onChange(async (value) => {
                this.plugin.settings.smartDateRemoveKeywords = value;
                await this.plugin.saveSettings();
              });
          });

        // Set initial disabled state based on enableSmartDateRecognition setting
        setting.setDisabled(!this.plugin.settings.enableSmartDateRecognition);
      });
  }

  /**
   * Creates warning period settings
   */
  private createWarningPeriodSettings(containerEl: HTMLElement) {
    new SettingGroup(containerEl)
      .setHeading('Warning period')
      .addSetting((setting) => {
        setting
          .setName('Deadline advance notice (days)')
          .setDesc(
            'Tasks appear this many days before their deadline. Set to 0 to disable.',
          )
          .addText((text) => {
            text
              .setPlaceholder('0')
              .setValue(
                String(this.plugin.settings.defaultDeadlineWarningPeriod),
              )
              .onChange(async (value) => {
                const num = parseInt(value, 10);
                if (!isNaN(num) && num >= 0 && num <= 30) {
                  this.plugin.settings.defaultDeadlineWarningPeriod = num;
                  await this.plugin.saveSettings();
                  await this.refreshAllTaskListViews();
                }
              });
            text.inputEl.type = 'number';
            text.inputEl.min = '0';
            text.inputEl.max = '30';
          });
      })
      .addSetting((setting) => {
        setting
          .setName('Scheduled delay (days)')
          .setDesc(
            'Tasks appear this many days after their scheduled date. Set to 0 to disable.',
          )
          .addText((text) => {
            text
              .setPlaceholder('0')
              .setValue(
                String(this.plugin.settings.defaultScheduledWarningPeriod),
              )
              .onChange(async (value) => {
                const num = parseInt(value, 10);
                if (!isNaN(num) && num >= 0 && num <= 30) {
                  this.plugin.settings.defaultScheduledWarningPeriod = num;
                  await this.plugin.saveSettings();
                  await this.refreshAllTaskListViews();
                }
              });
            text.inputEl.type = 'number';
            text.inputEl.min = '0';
            text.inputEl.max = '30';
          });
      })
      .addSetting((setting) => {
        setting
          .setName('Ignore scheduled delay when deadline is set')
          .setDesc(
            'If a task has both a scheduled date and a deadline, the scheduled delay is ignored.',
          )
          .addToggle((toggle) =>
            toggle
              .setValue(
                this.plugin.settings.skipScheduledWarningPeriodIfDeadline,
              )
              .onChange(async (value) => {
                this.plugin.settings.skipScheduledWarningPeriodIfDeadline =
                  value;
                await this.plugin.saveSettings();
                await this.refreshAllTaskListViews();
              }),
          );
      })
      .addSetting((setting) => {
        setting
          .setName('Ignore deadline advance notice when scheduled is set')
          .setDesc(
            'If a task has both a scheduled date and a deadline, the deadline advance notice is ignored.',
          )
          .addToggle((toggle) =>
            toggle
              .setValue(this.plugin.settings.skipDeadlinePrewarningIfScheduled)
              .onChange(async (value) => {
                this.plugin.settings.skipDeadlinePrewarningIfScheduled = value;
                await this.plugin.saveSettings();
                await this.refreshAllTaskListViews();
              }),
          );
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
        'Highlight task keywords (todo, doing, etc.) in bold with accent color in the editor.',
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

    // Smart date recognition Group
    this.createSmartDateRecognitionSettings(containerEl);

    // Task list search and filter Group
    this.createTaskSearchFilterSettings(containerEl);

    // Task Keywords section with sub-sections for each group
    this.createTaskKeywordsSettings(containerEl);

    // Task state transitions section
    this.createStateTransitionsSettings(containerEl);

    // Warning period settings
    this.createWarningPeriodSettings(containerEl);

    // Experimental features section
    new SettingGroup(containerEl)
      .setHeading('⚠︎ Experimental features')
      .addSetting((setting) => {
        setting.setDesc(
          'Experimental features may be changed significantly or removed entirely in future versions.',
        );
        hideSettingNameAndControl(setting);
      })
      .addSetting((setting) => {
        setting
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

                this.plugin.settings.additionalFileExtensions =
                  currentExtensions;
                await this.plugin.saveSettings();

                // Re-create parser with new settings
                await this.plugin.recreateParser();

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
      })
      .addSetting((setting) => {
        setting
          .setName('Scan code files for comments')
          .setDesc(
            'When enabled, scans code files (.js, .ts, .py, .rb, .java, .rs, .go, .c, .cpp, .cs, .swift, .kt, .sh, .YAML, .yml, .toml, .SQL, .ini, .r, .dockerfile, .ps1) for todo-style comments and detects them as tasks. Supports multi-line comments and skips keywords inside string literals.',
          )
          .addToggle((toggle) => {
            let extensionsBeforeCodeToggle: string[] | null = null;

            toggle
              .setValue(this.plugin.settings.scanCodeFiles)
              .onChange(async (value) => {
                this.plugin.settings.scanCodeFiles = value;

                // Sync code file extensions with additionalFileExtensions
                const codeExtensions = SUPPORTED_EXTENSIONS;
                const currentExtensions = [
                  ...(this.plugin.settings.additionalFileExtensions ?? []),
                ];

                if (value) {
                  // Snapshot pre-existing extensions before adding code extensions
                  extensionsBeforeCodeToggle = [...currentExtensions];
                  // Add code extensions not already present
                  for (const ext of codeExtensions) {
                    if (!currentExtensions.includes(ext)) {
                      currentExtensions.push(ext);
                    }
                  }
                } else {
                  // Only remove extensions that were added by this feature,
                  // preserving any that the user had manually configured before
                  const snapshot = extensionsBeforeCodeToggle ?? [];
                  for (const ext of codeExtensions) {
                    if (!snapshot.includes(ext)) {
                      const idx = currentExtensions.indexOf(ext);
                      if (idx !== -1) {
                        currentExtensions.splice(idx, 1);
                      }
                    }
                  }
                }

                this.plugin.settings.additionalFileExtensions =
                  currentExtensions;
                await this.plugin.saveSettings();

                // Re-create parser with new settings
                await this.plugin.recreateParser();

                // Rescan vault to pick up or remove code files
                try {
                  await this.plugin.scanVault();
                  await this.refreshAllTaskListViews();
                  this.plugin.refreshVisibleEditorDecorations();
                  this.plugin.refreshReaderViewFormatter();
                } catch (scanError) {
                  console.error('Failed to rescan vault:', scanError);
                }
              });
          });
      })
      .addSetting((setting) => {
        setting
          .setName('Use extended Markdown checkbox styles')
          .setDesc(
            'When enabled, uses themed checkbox styles ([/], [-]) for active and cancelled tasks.',
          )
          .addToggle((toggle) =>
            toggle
              .setValue(this.plugin.settings.useExtendedCheckboxStyles)
              .onChange(async (value) => {
                this.plugin.settings.useExtendedCheckboxStyles = value;
                await this.plugin.saveSettings();
                // Re-create parser to update KeywordManager with new settings
                await this.plugin.recreateParser();
                // Update KeywordManager in TaskWriter with new settings
                this.plugin.updateTaskWriterKeywordManager();
              }),
          );
      });
  }
}
