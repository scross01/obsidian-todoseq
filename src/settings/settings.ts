import {
  PluginSettingTab,
  App,
  Setting,
  Notice,
  DropdownComponent,
  SettingDefinitionItem,
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
  setting.nameEl.classList.add('todoseq-hidden');
  setting.controlEl.classList.add('todoseq-hidden');
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

  private readonly sideEffectHandlers: Record<
    string,
    (value: unknown) => Promise<void> | void
  > = {
    formatTaskKeywords: () => this.plugin.updateTaskFormatting(),
    includeCalloutBlocks: () => this.rescanAndRefresh(),
    includeCommentBlocks: () => this.rescanAndRefresh(),
    includeCodeBlocks: (value) => {
      if (!value) this.plugin.settings.languageCommentSupport = false;
      this.refreshDomState();
      return this.rescanAndRefresh();
    },
    languageCommentSupport: () => this.rescanAndRefresh(),
    enableSmartDateRecognition: (value) => {
      if (!value) this.plugin.settings.smartDateRemoveKeywords = false;
      this.plugin.smartDateProcessor?.setEnabled(Boolean(value));
      this.refreshDomState();
    },
    weekStartsOn: () => this.refreshViews(),
    taskListViewMode: () => this.refreshViews(),
    futureTaskSorting: () => this.refreshViews(),
    taskDescriptionDisplay: () => this.refreshViews(),
    upcomingPeriod: () => this.refreshViews(),
    defaultDeadlineWarningPeriod: () => this.refreshViews(),
    defaultScheduledWarningPeriod: () => this.refreshViews(),
    skipScheduledWarningPeriodIfDeadline: () => this.refreshViews(),
    skipDeadlinePrewarningIfScheduled: () => this.refreshViews(),
    migrateToTodayState: () => {
      this.plugin.embeddedTaskListProcessor?.updateSettings();
      return this.refreshViews();
    },
    detectOrgModeFiles: (value) => {
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
      return this.rescanAndRefresh();
    },
    scanCodeFiles: (value) => {
      // Sync code file extensions with additionalFileExtensions
      const codeExtensions = SUPPORTED_EXTENSIONS;
      const currentExtensions = [
        ...(this.plugin.settings.additionalFileExtensions ?? []),
      ];

      if (value) {
        // Snapshot pre-existing extensions before adding code extensions
        if (!this.codeExtensionsSnapshot) {
          this.codeExtensionsSnapshot = [...currentExtensions];
        }
        // Add code extensions not already present
        for (const ext of codeExtensions) {
          if (!currentExtensions.includes(ext)) {
            currentExtensions.push(ext);
          }
        }
      } else {
        // Only remove extensions that were added by this feature,
        // preserving any that the user had manually configured before
        const snapshot = this.codeExtensionsSnapshot ?? [];
        for (const ext of codeExtensions) {
          if (!snapshot.includes(ext)) {
            const idx = currentExtensions.indexOf(ext);
            if (idx !== -1) {
              currentExtensions.splice(idx, 1);
            }
          }
        }
      }

      this.plugin.settings.additionalFileExtensions = currentExtensions;
      return this.rescanAndRefresh();
    },
    useExtendedCheckboxStyles: async () => {
      // Re-create parser to update KeywordManager with new settings
      await this.plugin.recreateParser();
      // Update KeywordManager in TaskWriter with new settings
      this.plugin.updateTaskWriterKeywordManager();
    },
  };

  private codeExtensionsSnapshot: string[] | null = null;

  private readonly controlsRequiringTabUpdate = new Set<string>([
    'includeCodeBlocks',
    'enableSmartDateRecognition',
  ]);

  constructor(app: App, plugin: TodoTracker) {
    super(app, plugin);
    this.plugin = plugin;
  }

  private refreshAllTaskListViews = async () => {
    // Ensure the vault scanner's keyword manager has fresh settings
    // (keyword manager is a snapshot; it must be recreated when settings change)
    if (this.plugin.vaultScanner) {
      await this.plugin.vaultScanner.updateSettings(this.plugin.settings);
      // Sync main.ts keywordManager reference so embedded task lists see fresh settings
      this.plugin.keywordManager = this.plugin.vaultScanner.getKeywordManager();
    }

    const leaves = this.app.workspace.getLeavesOfType('todoseq-view');
    const tasks = this.plugin.getTasks();
    for (const leaf of leaves) {
      if (leaf.view instanceof TaskListView) {
        const taskListView = leaf.view;
        // Update keyword manager with new settings before rendering
        taskListView.updateSettings();
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

  private async rescanAndRefresh(): Promise<void> {
    try {
      await this.plugin.recreateParser();
      await this.plugin.scanVault();
      await this.refreshAllTaskListViews();
      this.plugin.refreshVisibleEditorDecorations();
      this.plugin.refreshReaderViewFormatter();
    } catch (parseError) {
      console.error('Failed to rescan vault:', parseError);
    }
  }

  private refreshViews(): Promise<void> {
    return this.refreshAllTaskListViews();
  }

  async setControlValue(key: string, value: unknown): Promise<void> {
    (this.plugin.settings as unknown as Record<string, unknown>)[key] = value;
    await this.sideEffectHandlers[key]?.(value);
    await this.plugin.saveSettings();
    if (this.controlsRequiringTabUpdate.has(key)) {
      this.update();
    }
  }

  getSettingDefinitions(): SettingDefinitionItem[] {
    // Compute default values for each state
    const keywordManager = new KeywordManager(this.plugin.settings);
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

    return [
      {
        name: 'Format task keywords',
        desc: 'Highlight task keywords (todo, doing, etc.) in bold with accent color in the editor.',
        control: { type: 'toggle', key: 'formatTaskKeywords' },
      },
      {
        type: 'group',
        heading: 'Task detection',
        items: [
          {
            name: 'Include tasks inside quote and callout blocks',
            desc: 'When enabled, include tasks inside quote and callout blocks (>, >[!info], >[!todo], etc.).',
            control: { type: 'toggle', key: 'includeCalloutBlocks' },
          },
          {
            name: 'Include tasks inside comments',
            desc: 'When enabled, include tasks inside comments (%%).',
            control: { type: 'toggle', key: 'includeCommentBlocks' },
          },
          {
            name: 'Include tasks inside code blocks',
            desc: 'When enabled, tasks inside fenced code blocks (``` or ~~~) will be included.',
            control: { type: 'toggle', key: 'includeCodeBlocks' },
          },
          {
            name: 'Enable language comment support',
            desc: 'When enabled, tasks inside code blocks will be detected using language-specific comment patterns e.g. `// TODO`',
            control: {
              type: 'toggle',
              key: 'languageCommentSupport',
              disabled: () => !this.plugin.settings.includeCodeBlocks,
            },
          },
        ],
      },
      {
        type: 'group',
        heading: 'Smart date recognition',
        items: [
          {
            name: 'Enable smart date recognition',
            desc: 'Automatically convert natural language dates like "today", "tomorrow", "due next week".',
            control: { type: 'toggle', key: 'enableSmartDateRecognition' },
          },
          {
            name: 'Remove date keywords',
            desc: 'Remove natural language text (e.g., "today", "tomorrow") after conversion to structured dates.',
            control: {
              type: 'toggle',
              key: 'smartDateRemoveKeywords',
              disabled: () => !this.plugin.settings.enableSmartDateRecognition,
            },
          },
        ],
      },
      {
        type: 'group',
        heading: 'Task list search and filter',
        items: [
          {
            name: 'Week starts on',
            desc: 'Choose which day the week starts on for date filtering.',
            control: {
              type: 'dropdown',
              key: 'weekStartsOn',
              options: { Monday: 'Monday', Sunday: 'Sunday' },
              defaultValue: 'Monday',
            },
          },
          {
            name: 'Completed tasks',
            desc: 'Choose how completed items are shown in the task list.',
            control: {
              type: 'dropdown',
              key: 'taskListViewMode',
              options: {
                showAll: 'Show all tasks',
                sortCompletedLast: 'Sort completed to end',
                hideCompleted: 'Hide completed',
              },
              defaultValue: 'showAll',
            },
          },
          {
            name: 'Future dated tasks',
            desc: 'Choose how tasks with future dates are displayed in the task list.',
            control: {
              type: 'dropdown',
              key: 'futureTaskSorting',
              options: {
                showAll: 'Show all tasks',
                showUpcoming: 'Show upcoming',
                sortToEnd: 'Sort future to end',
                hideFuture: 'Hide future',
              },
              defaultValue: 'showAll',
            },
          },
          {
            name: 'Task descriptions',
            desc: 'Controls how task descriptions (description: lines) are displayed in the task list.',
            control: {
              type: 'dropdown',
              key: 'taskDescriptionDisplay',
              options: { hide: 'Hide', show: 'Show' },
              defaultValue: 'show',
            },
          },
          {
            name: 'Upcoming period (days)',
            desc: 'Tasks within this many days are shown as "upcoming" when using the show upcoming option.',
            control: {
              type: 'number',
              key: 'upcomingPeriod',
              min: 0,
              max: 30,
              defaultValue: 7,
              // Accept every committed value: Obsidian's runtime shows the
              // range warning for out-of-range commits and calls `validate` on
              // valid ones to deterministically clear that warning.
              validate: () => undefined,
            },
          },
          {
            name: 'Default sort method',
            desc: 'Choose the default sort method for the task list.',
            control: {
              type: 'dropdown',
              key: 'defaultSortMethod',
              options: {
                default: 'Default (file path)',
                sortByScheduled: 'Scheduled date',
                sortByDeadline: 'Deadline date',
                sortByClosedDate: 'Closed date',
                sortByStarted: 'Started date',
                sortByPriority: 'Priority',
                sortByUrgency: 'Urgency',
                sortByKeyword: 'Keyword',
              },
              defaultValue: 'default',
            },
          },
        ],
      },
      {
        type: 'group',
        heading: 'Task keywords',
        items: [
          {
            name: 'Inactive keywords',
            desc: 'Keywords for tasks not yet started (e.g. FIXME, HACK). Built-in: TODO, LATER.',
            render: (setting) => {
              this.configureKeywordGroupSetting(
                setting,
                'additionalInactiveKeywords',
                'Inactive keywords',
                'Keywords for tasks not yet started (e.g. FIXME, HACK). Built-in: TODO, LATER.',
                this.plugin.settings.additionalInactiveKeywords,
              );
              // Run initial validation on open so existing warnings/errors are visible
              // for all keyword groups, not just archived keywords
              window.setTimeout(() => {
                const parsed = this.parseKeywordInputsFromUI();
                const regex = this.validateKeywordRegexForAllGroups(parsed);
                const groups = this.toGroupKeywordInput(regex.validBySetting);
                const validation = validateKeywordGroupsDetailed(groups);
                this.renderKeywordValidationState(
                  regex.errorsByGroup,
                  validation.errors,
                  validation.warnings,
                );
              }, 0);
            },
          },
          {
            name: 'Active keywords',
            desc: 'Keywords for tasks currently being worked on (e.g. STARTED). Built-in: DOING, NOW, IN-PROGRESS.',
            render: (setting) =>
              this.configureKeywordGroupSetting(
                setting,
                'additionalActiveKeywords',
                'Active keywords',
                'Keywords for tasks currently being worked on (e.g. STARTED). Built-in: DOING, NOW, IN-PROGRESS.',
                this.plugin.settings.additionalActiveKeywords,
              ),
          },
          {
            name: 'Waiting keywords',
            desc: 'Keywords for blocked or paused tasks (e.g. ON-HOLD). Built-in: WAIT, WAITING.',
            render: (setting) =>
              this.configureKeywordGroupSetting(
                setting,
                'additionalWaitingKeywords',
                'Waiting keywords',
                'Keywords for blocked or paused tasks (e.g. ON-HOLD). Built-in: WAIT, WAITING.',
                this.plugin.settings.additionalWaitingKeywords,
              ),
          },
          {
            name: 'Completed keywords',
            desc: 'Keywords for finished or abandoned tasks (e.g. NEVER). Built-in: DONE, CANCELLED, CANCELED.',
            render: (setting) =>
              this.configureKeywordGroupSetting(
                setting,
                'additionalCompletedKeywords',
                'Completed keywords',
                'Keywords for finished or abandoned tasks (e.g. NEVER). Built-in: DONE, CANCELLED, CANCELED.',
                this.plugin.settings.additionalCompletedKeywords,
              ),
          },
          {
            name: 'Archived keywords',
            desc: 'Keywords for archived tasks (e.g. OLD). These tasks are styled but NOT collected during vault scans. Built-in: ARCHIVED.',
            render: (setting) =>
              this.configureKeywordGroupSetting(
                setting,
                'additionalArchivedKeywords',
                'Archived keywords',
                'Keywords for archived tasks (e.g. OLD). These tasks are styled but NOT collected during vault scans. Built-in: ARCHIVED.',
                this.plugin.settings.additionalArchivedKeywords,
              ),
          },
          {
            name: 'Migrated state keyword',
            desc: 'Keyword or text to set on the source task after migrating to daily note. Leave empty to disable.',
            control: {
              type: 'text',
              key: 'migrateToTodayState',
              placeholder: '(disabled)',
            },
          },
        ],
      },
      {
        type: 'group',
        heading: 'Task state transitions',
        items: [
          {
            name: 'State transitions',
            desc: 'Define how states transition. Each line: STATE -> next_state. Use (a | b) to define multiple initial states.',
            render: (setting) => {
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
                      // workaround agressive obsidianmd/ui/sentence-case lint rule -- states are capitalized
                      'TODO -> DOING -> DONE' +
                        '\n' +
                        '(WAIT | WAITING) -> IN-PROGRESS' +
                        '\n' +
                        'LATER -> NOW -> DONE',
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
                        window.clearTimeout(
                          this.transitionValidationDebounceTimer,
                        );
                      }
                      this.transitionValidationDebounceTimer =
                        window.setTimeout(() => {
                          this.transitionValidationDebounceTimer = null;
                          this.validateTransitionSettings();
                          // Update task list views with new state transition settings
                          this.plugin.updateTaskListViewSettings();
                          // Update task update coordinator with new settings
                          this.plugin.updateTaskUpdateCoordinatorSettings();
                        }, this.TRANSITION_VALIDATION_DEBOUNCE_MS);
                    });
                });
            },
          },
          {
            name: 'Default inactive state',
            desc: 'The default state for inactive tasks when no explicit transition is defined.',
            render: (setting) => {
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
                    this.plugin.settings.stateTransitions.defaultInactive =
                      value;
                    await this.plugin.saveSettings();
                    this.validateTransitionSettings();
                    // Update task list views with new state transition settings
                    this.plugin.updateTaskListViewSettings();
                    // Update task update coordinator with new settings
                    this.plugin.updateTaskUpdateCoordinatorSettings();
                  });
                });
            },
          },
          {
            name: 'Default active state',
            desc: 'The default state for active tasks when no explicit transition is defined.',
            render: (setting) => {
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
            },
          },
          {
            name: 'Default completed state',
            desc: 'The default state for completed tasks when no explicit transition is defined.',
            render: (setting) => {
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
                    this.plugin.settings.stateTransitions.defaultCompleted =
                      value;
                    await this.plugin.saveSettings();
                    this.validateTransitionSettings();
                    // Update task list views with new state transition settings
                    this.plugin.updateTaskListViewSettings();
                    // Update task update coordinator with new settings
                    this.plugin.updateTaskUpdateCoordinatorSettings();
                  });
                });

              // Initial validation
              window.setTimeout(() => this.validateTransitionSettings(), 0);
            },
          },
          {
            name: 'Track closed date',
            desc: 'Add closed: timestamp when tasks are marked as completed.',
            control: { type: 'toggle', key: 'trackClosedDate' },
          },
          {
            name: 'Track started date',
            desc: 'Add started: timestamp when tasks first enter an active state. Written once and never removed automatically.',
            control: { type: 'toggle', key: 'trackStartedDate' },
          },
        ],
      },
      {
        type: 'group',
        heading: 'Warning period',
        items: [
          {
            name: 'Deadline advance notice (days)',
            desc: 'Tasks appear this many days before their deadline. Set to 0 to disable.',
            control: {
              type: 'number',
              key: 'defaultDeadlineWarningPeriod',
              min: 0,
              max: 30,
              defaultValue: 0,
              validate: () => undefined,
            },
          },
          {
            name: 'Scheduled delay (days)',
            desc: 'Tasks appear this many days after their scheduled date. Set to 0 to disable.',
            control: {
              type: 'number',
              key: 'defaultScheduledWarningPeriod',
              min: 0,
              max: 30,
              defaultValue: 0,
              validate: () => undefined,
            },
          },
          {
            name: 'Ignore scheduled delay when deadline is set',
            desc: 'If a task has both a scheduled date and a deadline, the scheduled delay is ignored.',
            control: {
              type: 'toggle',
              key: 'skipScheduledWarningPeriodIfDeadline',
            },
          },
          {
            name: 'Ignore deadline advance notice when scheduled is set',
            desc: 'If a task has both a scheduled date and a deadline, the deadline advance notice is ignored.',
            control: {
              type: 'toggle',
              key: 'skipDeadlinePrewarningIfScheduled',
            },
          },
        ],
      },
      {
        type: 'group',
        heading: '⚠︎ Experimental features',
        items: [
          {
            name: 'Experimental features',
            render: (setting) => {
              setting.setDesc(
                'Experimental features may be changed significantly or removed entirely in future versions.',
              );
              hideSettingNameAndControl(setting);
            },
          },
          {
            name: 'Detect org-mode files',
            desc: 'When enabled, scans for .org files in vault and detects tasks using org-mode syntax.',
            control: { type: 'toggle', key: 'detectOrgModeFiles' },
          },
          {
            name: 'Scan code files for comments',
            desc: 'When enabled, scans code files (.js, .ts, .py, .rb, .java, .rs, .go, .c, .cpp, .cs, .swift, .kt, .sh, .YAML, .yml, .toml, .SQL, .ini, .r, .dockerfile, .ps1) for todo-style comments and detects them as tasks. Supports multi-line comments and skips keywords inside string literals.',
            control: { type: 'toggle', key: 'scanCodeFiles' },
          },
          {
            name: 'Use extended Markdown checkbox styles',
            desc: 'When enabled, uses themed checkbox styles ([/], [-]) for active and cancelled tasks.',
            control: { type: 'toggle', key: 'useExtendedCheckboxStyles' },
          },
        ],
      },
    ];
  }

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
        const errorDiv = settingInfo.createDiv({
          cls: 'todoseq-setting-item-error',
        });
        for (const message of groupErrors) {
          errorDiv.createDiv({ text: message });
        }
        binding.inputEl.classList.add('todoseq-invalid-input');
      }

      if (groupWarnings.length > 0) {
        const warningDiv = settingInfo.createDiv({
          cls: 'todoseq-setting-item-warning',
        });
        for (const message of groupWarnings) {
          warningDiv.createDiv({ text: message });
        }
      }
    }
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
      dropdown.selectEl.createEl('option', {
        text: keyword,
        attr: { value: keyword },
      });
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
      infoDiv = settingInfo.createDiv({
        cls: 'todoseq-setting-item-warning',
      });
    }

    infoDiv.createDiv({ text: message });
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

    const errorDiv = settingInfo.createDiv({
      cls: 'todoseq-setting-item-error',
    });
    for (const message of messages) {
      errorDiv.createDiv({ text: message });
    }

    // Highlight the input field
    const textArea = setting.settingEl.querySelector('textarea');
    if (textArea) {
      textArea.classList.add('todoseq-invalid-input');
    }
  }
}
