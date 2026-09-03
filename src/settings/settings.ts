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
import { t } from '../i18n';

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
          new Notice(t('notices.failedToRefreshTaskList'));
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
        name: t('settings.general.formatTaskKeywords.name'),
        desc: t('settings.general.formatTaskKeywords.desc'),
        control: { type: 'toggle', key: 'formatTaskKeywords' },
      },
      {
        type: 'group',
        heading: t('settings.headings.taskDetection'),
        items: [
          {
            name: t('settings.taskDetection.includeCalloutBlocks.name'),
            desc: t('settings.taskDetection.includeCalloutBlocks.desc'),
            control: { type: 'toggle', key: 'includeCalloutBlocks' },
          },
          {
            name: t('settings.taskDetection.includeCommentBlocks.name'),
            desc: t('settings.taskDetection.includeCommentBlocks.desc'),
            control: { type: 'toggle', key: 'includeCommentBlocks' },
          },
          {
            name: t('settings.taskDetection.includeCodeBlocks.name'),
            desc: t('settings.taskDetection.includeCodeBlocks.desc'),
            control: { type: 'toggle', key: 'includeCodeBlocks' },
          },
          {
            name: t('settings.taskDetection.languageCommentSupport.name'),
            desc: t('settings.taskDetection.languageCommentSupport.desc'),
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
        heading: t('settings.headings.smartDates'),
        items: [
          {
            name: t('settings.smartDates.enableSmartDateRecognition.name'),
            desc: t('settings.smartDates.enableSmartDateRecognition.desc'),
            control: { type: 'toggle', key: 'enableSmartDateRecognition' },
          },
          {
            name: t('settings.smartDates.smartDateRemoveKeywords.name'),
            desc: t('settings.smartDates.smartDateRemoveKeywords.desc'),
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
        heading: t('settings.headings.searchFilter'),
        items: [
          {
            name: t('settings.searchFilter.weekStartsOn.name'),
            desc: t('settings.searchFilter.weekStartsOn.desc'),
            control: {
              type: 'dropdown',
              key: 'weekStartsOn',
              options: {
                Monday: t('settings.options.monday'),
                Sunday: t('settings.options.sunday'),
              },
              defaultValue: 'Monday',
            },
          },
          {
            name: t('settings.searchFilter.taskListViewMode.name'),
            desc: t('settings.searchFilter.taskListViewMode.desc'),
            control: {
              type: 'dropdown',
              key: 'taskListViewMode',
              options: {
                showAll: t('settings.options.showAllTasks'),
                sortCompletedLast: t('settings.options.sortCompletedToEnd'),
                hideCompleted: t('settings.options.hideCompleted'),
              },
              defaultValue: 'showAll',
            },
          },
          {
            name: t('settings.searchFilter.futureTaskSorting.name'),
            desc: t('settings.searchFilter.futureTaskSorting.desc'),
            control: {
              type: 'dropdown',
              key: 'futureTaskSorting',
              options: {
                showAll: t('settings.options.showAllTasks'),
                showUpcoming: t('settings.options.showUpcoming'),
                sortToEnd: t('settings.options.sortFutureToEnd'),
                hideFuture: t('settings.options.hideFuture'),
              },
              defaultValue: 'showAll',
            },
          },
          {
            name: t('settings.searchFilter.taskDescriptionDisplay.name'),
            desc: t('settings.searchFilter.taskDescriptionDisplay.desc'),
            control: {
              type: 'dropdown',
              key: 'taskDescriptionDisplay',
              options: {
                hide: t('settings.options.hide'),
                show: t('settings.options.show'),
              },
              defaultValue: 'show',
            },
          },
          {
            name: t('settings.searchFilter.upcomingPeriod.name'),
            desc: t('settings.searchFilter.upcomingPeriod.desc'),
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
            name: t('settings.searchFilter.defaultSortMethod.name'),
            desc: t('settings.searchFilter.defaultSortMethod.desc'),
            control: {
              type: 'dropdown',
              key: 'defaultSortMethod',
              options: {
                default: t('settings.options.defaultFilePath'),
                sortByScheduled: t('settings.options.scheduledDate'),
                sortByDeadline: t('settings.options.deadlineDate'),
                sortByClosedDate: t('settings.options.closedDate'),
                sortByStarted: t('settings.options.startedDate'),
                sortByPriority: t('settings.options.priority'),
                sortByUrgency: t('settings.options.urgency'),
                sortByKeyword: t('settings.options.keyword'),
              },
              defaultValue: 'default',
            },
          },
        ],
      },
      {
        type: 'group',
        heading: t('settings.headings.taskKeywords'),
        items: [
          {
            name: t('settings.keywords.inactive.name'),
            desc: t('settings.keywords.inactive.desc'),
            render: (setting) => {
              this.configureKeywordGroupSetting(
                setting,
                'additionalInactiveKeywords',
                t('settings.keywords.inactive.name'),
                t('settings.keywords.inactive.desc'),
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
            name: t('settings.keywords.active.name'),
            desc: t('settings.keywords.active.desc'),
            render: (setting) =>
              this.configureKeywordGroupSetting(
                setting,
                'additionalActiveKeywords',
                t('settings.keywords.active.name'),
                t('settings.keywords.active.desc'),
                this.plugin.settings.additionalActiveKeywords,
              ),
          },
          {
            name: t('settings.keywords.waiting.name'),
            desc: t('settings.keywords.waiting.desc'),
            render: (setting) =>
              this.configureKeywordGroupSetting(
                setting,
                'additionalWaitingKeywords',
                t('settings.keywords.waiting.name'),
                t('settings.keywords.waiting.desc'),
                this.plugin.settings.additionalWaitingKeywords,
              ),
          },
          {
            name: t('settings.keywords.completed.name'),
            desc: t('settings.keywords.completed.desc'),
            render: (setting) =>
              this.configureKeywordGroupSetting(
                setting,
                'additionalCompletedKeywords',
                t('settings.keywords.completed.name'),
                t('settings.keywords.completed.desc'),
                this.plugin.settings.additionalCompletedKeywords,
              ),
          },
          {
            name: t('settings.keywords.archived.name'),
            desc: t('settings.keywords.archived.desc'),
            render: (setting) =>
              this.configureKeywordGroupSetting(
                setting,
                'additionalArchivedKeywords',
                t('settings.keywords.archived.name'),
                t('settings.keywords.archived.desc'),
                this.plugin.settings.additionalArchivedKeywords,
              ),
          },
          {
            name: t('settings.keywords.migratedState.name'),
            desc: t('settings.keywords.migratedState.desc'),
            control: {
              type: 'text',
              key: 'migrateToTodayState',
              placeholder: t('settings.placeholders.disabled'),
            },
          },
        ],
      },
      {
        type: 'group',
        heading: t('settings.headings.transitions'),
        items: [
          {
            name: t('settings.transitions.stateTransitions.name'),
            desc: t('settings.transitions.stateTransitions.desc'),
            render: (setting) => {
              this.transitionSettings.transitions = setting;
              setting
                .setName(t('settings.transitions.stateTransitions.name'))
                .setDesc(t('settings.transitions.stateTransitions.desc'))
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
            name: t('settings.transitions.defaultInactive.name'),
            desc: t('settings.transitions.defaultInactive.desc'),
            render: (setting) => {
              this.transitionSettings.inactive = setting;
              setting
                .setName(t('settings.transitions.defaultInactive.name'))
                .setDesc(t('settings.transitions.defaultInactive.desc'))
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
            name: t('settings.transitions.defaultActive.name'),
            desc: t('settings.transitions.defaultActive.desc'),
            render: (setting) => {
              this.transitionSettings.active = setting;
              setting
                .setName(t('settings.transitions.defaultActive.name'))
                .setDesc(t('settings.transitions.defaultActive.desc'))
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
            name: t('settings.transitions.defaultCompleted.name'),
            desc: t('settings.transitions.defaultCompleted.desc'),
            render: (setting) => {
              this.transitionSettings.completed = setting;
              setting
                .setName(t('settings.transitions.defaultCompleted.name'))
                .setDesc(t('settings.transitions.defaultCompleted.desc'))
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
            name: t('settings.transitions.trackClosedDate.name'),
            desc: t('settings.transitions.trackClosedDate.desc'),
            control: { type: 'toggle', key: 'trackClosedDate' },
          },
          {
            name: t('settings.transitions.trackStartedDate.name'),
            desc: t('settings.transitions.trackStartedDate.desc'),
            control: { type: 'toggle', key: 'trackStartedDate' },
          },
        ],
      },
      {
        type: 'group',
        heading: t('settings.headings.warningPeriod'),
        items: [
          {
            name: t('settings.warningPeriod.defaultDeadlineWarningPeriod.name'),
            desc: t('settings.warningPeriod.defaultDeadlineWarningPeriod.desc'),
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
            name: t(
              'settings.warningPeriod.defaultScheduledWarningPeriod.name',
            ),
            desc: t(
              'settings.warningPeriod.defaultScheduledWarningPeriod.desc',
            ),
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
            name: t(
              'settings.warningPeriod.skipScheduledWarningPeriodIfDeadline.name',
            ),
            desc: t(
              'settings.warningPeriod.skipScheduledWarningPeriodIfDeadline.desc',
            ),
            control: {
              type: 'toggle',
              key: 'skipScheduledWarningPeriodIfDeadline',
            },
          },
          {
            name: t(
              'settings.warningPeriod.skipDeadlinePrewarningIfScheduled.name',
            ),
            desc: t(
              'settings.warningPeriod.skipDeadlinePrewarningIfScheduled.desc',
            ),
            control: {
              type: 'toggle',
              key: 'skipDeadlinePrewarningIfScheduled',
            },
          },
        ],
      },
      {
        type: 'group',
        heading: t('settings.headings.experimental'),
        items: [
          {
            name: t('settings.experimental.experimentalFeatures.name'),
            render: (setting) => {
              setting.setDesc(
                t('settings.experimental.experimentalFeatures.desc'),
              );
              hideSettingNameAndControl(setting);
            },
          },
          {
            name: t('settings.experimental.detectOrgModeFiles.name'),
            desc: t('settings.experimental.detectOrgModeFiles.desc'),
            control: { type: 'toggle', key: 'detectOrgModeFiles' },
          },
          {
            name: t('settings.experimental.scanCodeFiles.name'),
            desc: t('settings.experimental.scanCodeFiles.desc'),
            control: { type: 'toggle', key: 'scanCodeFiles' },
          },
          {
            name: t('settings.experimental.useExtendedCheckboxStyles.name'),
            desc: t('settings.experimental.useExtendedCheckboxStyles.desc'),
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
        .setPlaceholder(t('settings.placeholders.keyword'))
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
