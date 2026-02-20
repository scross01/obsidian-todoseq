import { PluginSettingTab, App, Setting, ToggleComponent } from 'obsidian';
import TodoTracker from '../main';
import { TaskListView } from '../view/task-list/task-list-view';
import { LanguageCommentSupportSettings } from '../parser/language-registry';
import { TaskParser } from '../parser/task-parser';

export interface TodoTrackerSettings {
  additionalTaskKeywords: string[]; // capitalised keywords treated as NOT COMPLETED (e.g., FIXME, HACK)
  includeCodeBlocks: boolean; // when false, tasks inside fenced code blocks are ignored
  includeCalloutBlocks: boolean; // when true, tasks inside callout blocks are included
  includeCommentBlocks: boolean; // when true, tasks inside multiline comment blocks ($$) are included
  taskListViewMode: 'showAll' | 'sortCompletedLast' | 'hideCompleted'; // controls view transformation in the task view
  futureTaskSorting: 'showAll' | 'showUpcoming' | 'sortToEnd' | 'hideFuture'; // controls how future tasks are handled
  defaultSortMethod:
    | 'default'
    | 'sortByScheduled'
    | 'sortByDeadline'
    | 'sortByPriority'
    | 'sortByUrgency'; // default sort method for task list view
  languageCommentSupport: LanguageCommentSupportSettings; // language-specific comment support settings
  weekStartsOn: 'Monday' | 'Sunday'; // controls which day the week starts on for date filtering
  formatTaskKeywords: boolean; // format task keywords in editor
  additionalFileExtensions: string[]; // additional file extensions to scan for tasks (e.g., ['.org', '.txt']) - hidden from UI, managed by detectOrgModeFiles
  detectOrgModeFiles: boolean; // experimental: when enabled, adds .org to additionalFileExtensions and registers org-mode parser
  // Property search engine instance
  propertySearchEngine?: import('../services/property-search-engine').PropertySearchEngine; // Property search engine instance
  // Hidden setting - not exposed in UI, used to track first install
  _hasShownFirstInstallView?: boolean; // true after first install view has been shown
}

export const DefaultSettings: TodoTrackerSettings = {
  // No additional keywords by default; built-in defaults live in task.ts
  additionalTaskKeywords: [],
  includeCodeBlocks: false,
  includeCalloutBlocks: true, // Enabled by default
  includeCommentBlocks: false, // Disabled by default
  taskListViewMode: 'showAll',
  futureTaskSorting: 'showAll',
  defaultSortMethod: 'default', // Default to file path sorting
  languageCommentSupport: {
    enabled: true,
  },
  weekStartsOn: 'Monday', // Default to Monday as requested
  formatTaskKeywords: true, // Default to enabled
  additionalFileExtensions: [], // No additional extensions by default - managed by detectOrgModeFiles
  detectOrgModeFiles: false, // Experimental feature - disabled by default
};

export class TodoTrackerSettingTab extends PluginSettingTab {
  plugin: TodoTracker;
  private keywordDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private fileExtensionsDebounceTimer: ReturnType<typeof setTimeout> | null =
    null;
  private readonly KEYWORD_DEBOUNCE_MS = 500;
  private readonly FILE_EXTENSIONS_DEBOUNCE_MS = 500;

  constructor(app: App, plugin: TodoTracker) {
    super(app, plugin);
    this.plugin = plugin;
  }

  private refreshAllTaskListViews = async () => {
    const leaves = this.app.workspace.getLeavesOfType(TaskListView.viewType);
    const tasks = this.plugin.getTasks();
    for (const leaf of leaves) {
      if (leaf.view instanceof TaskListView) {
        leaf.view.updateTasks(tasks);
        // Sync each view's mode from settings before render
        const mode = this.plugin.settings.taskListViewMode;
        leaf.view.setViewMode(mode);
        // Use lighter refresh instead of full onOpen rebuild
        leaf.view.refreshVisibleList();
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
   * Create the file extensions setting with validation
   */
  private createFileExtensionsSetting(containerEl: HTMLElement): void {
    const setting = new Setting(containerEl)
      .setName('Additional file types')
      .setDesc(
        'Additional file extensions to scan for tasks (e.g., .org, .txt). Files must be text-based.',
      );

    setting.addText((text) => {
      const current = this.plugin.settings.additionalFileExtensions ?? [];
      text.setValue(current.join(', ')).onChange((value) => {
        // Clear any pending debounce timer
        if (this.fileExtensionsDebounceTimer) {
          clearTimeout(this.fileExtensionsDebounceTimer);
        }

        // Debounce the expensive operations
        this.fileExtensionsDebounceTimer = setTimeout(async () => {
          const { valid, invalid } = this.validateFileExtensions(value);

          // Find the setting container
          const settingContainer = text.inputEl.closest('.setting-item');
          if (!settingContainer) {
            console.error('Could not find setting container');
            return;
          }

          const settingInfo =
            settingContainer.querySelector('.setting-item-info');
          if (!settingInfo) {
            console.error('Could not find setting info container');
            return;
          }

          // Remove any existing error display
          const existingError = settingContainer.querySelector(
            '.todoseq-setting-item-error',
          );
          if (existingError) {
            existingError.remove();
            text.inputEl.classList.remove('todoseq-invalid-input');
          }

          // Show errors if any
          if (invalid.length > 0) {
            const errorDiv = document.createElement('div');
            errorDiv.className = 'todoseq-setting-item-error';
            errorDiv.textContent = `Invalid extension${invalid.length > 1 ? 's' : ''}: ${invalid.join(', ')}. Extensions must start with "." and contain only letters, numbers, dots, hyphens, or underscores.`;
            text.inputEl.classList.add('todoseq-invalid-input');
            settingInfo.appendChild(errorDiv);
          }

          // Save valid extensions and rescan
          this.plugin.settings.additionalFileExtensions = valid;
          await this.plugin.saveSettings();

          // Rescan vault to pick up new file types
          try {
            await this.plugin.scanVault();
            await this.refreshAllTaskListViews();
            this.plugin.refreshVisibleEditorDecorations();
            this.plugin.refreshReaderViewFormatter();
          } catch (scanError) {
            console.error('Failed to rescan vault:', scanError);
          }
        }, this.FILE_EXTENSIONS_DEBOUNCE_MS);
      });

      // Set placeholder
      text.setPlaceholder('.org, .txt');
    });
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    // Keep these at top level (no grouping)
    new Setting(containerEl)
      .setName('Additional task keywords')
      .setDesc(
        'Capitalized list of keywords to treat as tasks (e.g. FIXME, HACK). Leave empty for none.',
      )
      .addText((text) => {
        const current = this.plugin.settings.additionalTaskKeywords ?? [];
        text.setValue(current.join(', ')).onChange((value) => {
          // Force uppercase in the UI field immediately
          const forced = value.toUpperCase();
          if (forced !== value) {
            // Update the input control to reflect forced uppercase
            try {
              // Obsidian's TextComponent exposes a setValue method via the same reference.
              text.setValue(forced);
            } catch {
              // no-op if API surface changes
            }
          }

          // Clear any pending debounce timer
          if (this.keywordDebounceTimer) {
            clearTimeout(this.keywordDebounceTimer);
          }

          // Debounce the expensive operations
          this.keywordDebounceTimer = setTimeout(async () => {
            // Parse CSV, trim, filter non-empty (already uppercased)
            const parsed = forced
              .split(',')
              .map((k) => k.trim())
              .filter((k) => k.length > 0);

            // Create error display element
            const settingContainer = text.inputEl.closest('.setting-item');
            if (!settingContainer) {
              console.error('Could not find setting container');
              return;
            }

            const settingInfo =
              settingContainer.querySelector('.setting-item-info');
            if (!settingInfo) {
              console.error('Could not find setting info container');
              return;
            }
            // Remove any existing error display
            const existingError = settingContainer.querySelector(
              '.todoseq-setting-item-error',
            );
            if (existingError) {
              existingError.remove();
              text.inputEl.classList.remove('todoseq-invalid-input');
            }

            // Filter out invalid keywords and collect errors
            const validKeywords: string[] = [];
            const invalidKeywords: string[] = [];
            const errorMessages: string[] = [];

            for (const keyword of parsed) {
              try {
                // Test if this single keyword is valid by trying to create a parser with just this keyword
                // This will throw if the keyword is invalid
                TaskParser.validateKeywords([keyword]);
                validKeywords.push(keyword);
              } catch (error) {
                invalidKeywords.push(keyword);
                errorMessages.push(`"${keyword}": ${error.message}`);
              }
            }

            if (invalidKeywords.length > 0) {
              // Show error under the field
              const errorDiv = document.createElement('div');
              errorDiv.className = 'todoseq-setting-item-error';
              errorDiv.textContent = `Invalid keyword ${invalidKeywords.join(', ')} will be ignored.`;
              text.inputEl.classList.add('todoseq-invalid-input');

              // Insert error after the setting description
              settingInfo.appendChild(errorDiv);

              // Continue with valid keywords only for parsing, but keep original input for editing
              this.plugin.settings.additionalTaskKeywords = validKeywords;
              await this.plugin.saveSettings();

              // Always recreate parser and rescan with valid keywords
              try {
                await this.plugin.recreateParser();
                await this.plugin.scanVault();
                await this.refreshAllTaskListViews();
                // Force refresh of visible editor decorations to apply new keywords
                this.plugin.refreshVisibleEditorDecorations();
                this.plugin.refreshReaderViewFormatter();
              } catch (parseError) {
                console.error(
                  'Failed to recreate parser with valid keywords:',
                  parseError,
                );
              }
            } else {
              // All keywords are valid, proceed normally
              this.plugin.settings.additionalTaskKeywords = parsed;
              await this.plugin.saveSettings();
              // Recreate parser according to new settings and rescan
              await this.plugin.recreateParser();
              await this.plugin.scanVault();
              await this.refreshAllTaskListViews();
              // Force refresh of visible editor decorations to apply new keywords
              this.plugin.refreshVisibleEditorDecorations();
              this.plugin.refreshReaderViewFormatter();
            }
          }, this.KEYWORD_DEBOUNCE_MS);
        });
      });

    // Format task keywords in editor
    new Setting(containerEl)
      .setName('Format task keywords')
      .setDesc(
        'Highlight task keywords (TODO, DOING, etc.) in bold with accent color in the editor',
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
    new Setting(containerEl).setName('Task detection').setHeading();

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
              this.plugin.settings.languageCommentSupport.enabled = false;
            }
            await this.plugin.saveSettings();
            // Update language toggle visual state by recreating it
            if (languageToggleComponent) {
              languageToggleComponent.setValue(
                this.plugin.settings.languageCommentSupport.enabled,
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
          .setValue(this.plugin.settings.languageCommentSupport.enabled)
          .onChange(async (value) => {
            this.plugin.settings.languageCommentSupport.enabled = value;
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

    // Include tasks inside callout blocks
    new Setting(containerEl)
      .setName('Include tasks inside quote and callout blocks')
      .setDesc(
        'When enabled, include tasks inside quote and callout blocks (>, >[!info], >[!todo], etc.)',
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

    // Task list search and filter Group
    new Setting(containerEl)
      .setName('Task list search and filter')
      .setHeading();

    new Setting(containerEl)
      .setName('Completed tasks')
      .setDesc('Choose how completed items are shown in the task view.')
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
      .setDesc('Chooose how tasks with future dates are displayed')
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
      .setName('Default sort method')
      .setDesc('Choose the default sort method for the task list view.')
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
          // Note: This setting only applies when the plugin is started/reloaded
          // Changing the selection in the Task view does not update this setting
        });
      });

    // Experimental Features Group
    new Setting(containerEl)
      .setName('Experimental Features')
      .setHeading()
      .setDesc(
        'Experimental features may be changed significantly or removed entirely in future versions.',
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
