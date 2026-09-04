/**
 * English locale — source of truth for the translation shape.
 *
 * Keys are organized by the settings-definition categories in
 * `src/settings/settings.ts` so a reviewer can map keys to UI sections:
 * each leaf `{ name, desc }` corresponds to one setting row.
 *
 * When adding strings: add here first, then mirror in `zh.ts` (TypeScript
 * enforces the shape), then use `t()` at the call site.
 */
export const en = {
  settings: {
    general: {
      formatTaskKeywords: {
        name: 'Format task keywords',
        desc: 'Highlight task keywords (todo, doing, etc.) in bold with accent color in the editor.',
      },
    },
    headings: {
      taskDetection: 'Task detection',
      smartDates: 'Smart date recognition',
      searchFilter: 'Task list search and filter',
      taskKeywords: 'Task keywords',
      transitions: 'Task state transitions',
      warningPeriod: 'Warning period',
      experimental: '⚠︎ Experimental features',
    },
    taskDetection: {
      includeCalloutBlocks: {
        name: 'Include tasks inside quote and callout blocks',
        desc: 'When enabled, include tasks inside quote and callout blocks (>, >[!info], >[!todo], etc.).',
      },
      includeCommentBlocks: {
        name: 'Include tasks inside comments',
        desc: 'When enabled, include tasks inside comments (%%).',
      },
      includeCodeBlocks: {
        name: 'Include tasks inside code blocks',
        desc: 'When enabled, tasks inside fenced code blocks (``` or ~~~) will be included.',
      },
      languageCommentSupport: {
        name: 'Enable language comment support',
        desc: 'When enabled, tasks inside code blocks will be detected using language-specific comment patterns e.g. `// TODO`',
      },
    },
    smartDates: {
      enableSmartDateRecognition: {
        name: 'Enable smart date recognition',
        desc: 'Automatically convert natural language dates like "today", "tomorrow", "due next week".',
      },
      smartDateRemoveKeywords: {
        name: 'Remove date keywords',
        desc: 'Remove natural language text (e.g., "today", "tomorrow") after conversion to structured dates.',
      },
    },
    searchFilter: {
      weekStartsOn: {
        name: 'Week starts on',
        desc: 'Choose which day the week starts on for date filtering.',
      },
      taskListViewMode: {
        name: 'Completed tasks',
        desc: 'Choose how completed items are shown in the task list.',
      },
      futureTaskSorting: {
        name: 'Future dated tasks',
        desc: 'Choose how tasks with future dates are displayed in the task list.',
      },
      taskDescriptionDisplay: {
        name: 'Task descriptions',
        desc: 'Controls how task descriptions (description: lines) are displayed in the task list.',
      },
      upcomingPeriod: {
        name: 'Upcoming period (days)',
        desc: 'Tasks within this many days are shown as "upcoming" when using the show upcoming option.',
      },
      defaultSortMethod: {
        name: 'Default sort method',
        desc: 'Choose the default sort method for the task list.',
      },
    },
    keywords: {
      inactive: {
        name: 'Inactive keywords',
        desc: 'Keywords for tasks not yet started (e.g. FIXME, HACK). Built-in: TODO, LATER.',
      },
      active: {
        name: 'Active keywords',
        desc: 'Keywords for tasks currently being worked on (e.g. STARTED). Built-in: DOING, NOW, IN-PROGRESS.',
      },
      waiting: {
        name: 'Waiting keywords',
        desc: 'Keywords for blocked or paused tasks (e.g. ON-HOLD). Built-in: WAIT, WAITING.',
      },
      completed: {
        name: 'Completed keywords',
        desc: 'Keywords for finished or abandoned tasks (e.g. NEVER). Built-in: DONE, CANCELLED, CANCELED.',
      },
      archived: {
        name: 'Archived keywords',
        desc: 'Keywords for archived tasks (e.g. OLD). These tasks are styled but NOT collected during vault scans. Built-in: ARCHIVED.',
      },
      migratedState: {
        name: 'Migrated state keyword',
        desc: 'Keyword or text to set on the source task after migrating to daily note. Leave empty to disable.',
      },
    },
    transitions: {
      stateTransitions: {
        name: 'State transitions',
        desc: 'Define how states transition. Each line: STATE -> next_state. Use (a | b) to define multiple initial states.',
      },
      defaultInactive: {
        name: 'Default inactive state',
        desc: 'The default state for inactive tasks when no explicit transition is defined.',
      },
      defaultActive: {
        name: 'Default active state',
        desc: 'The default state for active tasks when no explicit transition is defined.',
      },
      defaultCompleted: {
        name: 'Default completed state',
        desc: 'The default state for completed tasks when no explicit transition is defined.',
      },
      trackClosedDate: {
        name: 'Track closed date',
        desc: 'Add closed: timestamp when tasks are marked as completed.',
      },
      trackStartedDate: {
        name: 'Track started date',
        desc: 'Add started: timestamp when tasks first enter an active state. Written once and never removed automatically.',
      },
    },
    warningPeriod: {
      defaultDeadlineWarningPeriod: {
        name: 'Deadline advance notice (days)',
        desc: 'Tasks appear this many days before their deadline. Set to 0 to disable.',
      },
      defaultScheduledWarningPeriod: {
        name: 'Scheduled delay (days)',
        desc: 'Tasks appear this many days after their scheduled date. Set to 0 to disable.',
      },
      skipScheduledWarningPeriodIfDeadline: {
        name: 'Ignore scheduled delay when deadline is set',
        desc: 'If a task has both a scheduled date and a deadline, the scheduled delay is ignored.',
      },
      skipDeadlinePrewarningIfScheduled: {
        name: 'Ignore deadline advance notice when scheduled is set',
        desc: 'If a task has both a scheduled date and a deadline, the deadline advance notice is ignored.',
      },
    },
    experimental: {
      experimentalFeatures: {
        name: 'Experimental features',
        desc: 'Experimental features may be changed significantly or removed entirely in future versions.',
      },
      detectOrgModeFiles: {
        name: 'Detect org-mode files',
        desc: 'When enabled, scans for .org files in vault and detects tasks using org-mode syntax.',
      },
      scanCodeFiles: {
        name: 'Scan code files for comments',
        desc: 'When enabled, scans code files (.js, .ts, .py, .rb, .java, .rs, .go, .c, .cpp, .cs, .swift, .kt, .sh, .YAML, .yml, .toml, .SQL, .ini, .r, .dockerfile, .ps1) for todo-style comments and detects them as tasks. Supports multi-line comments and skips keywords inside string literals.',
      },
      useExtendedCheckboxStyles: {
        name: 'Use extended Markdown checkbox styles',
        desc: 'When enabled, uses themed checkbox styles ([/], [-]) for active and cancelled tasks.',
      },
    },
    // Dropdown OPTION labels (user-visible values inside settings dropdowns).
    options: {
      monday: 'Monday',
      sunday: 'Sunday',
      showAllTasks: 'Show all tasks',
      sortCompletedToEnd: 'Sort completed to end',
      hideCompleted: 'Hide completed',
      showUpcoming: 'Show upcoming',
      sortFutureToEnd: 'Sort future to end',
      hideFuture: 'Hide future',
      hide: 'Hide',
      show: 'Show',
      defaultFilePath: 'Default (file path)',
      scheduledDate: 'Scheduled date',
      deadlineDate: 'Deadline date',
      closedDate: 'Closed date',
      startedDate: 'Started date',
      priority: 'Priority',
      urgency: 'Urgency',
      keyword: 'Keyword',
    },
    placeholders: {
      // Uppercase format hint — kept as-is across locales.
      keyword: 'KEYWORD',
      disabled: '(disabled)',
    },
  },
  notices: {
    failedToRefreshTaskList: 'Failed to refresh task list',
    taskCopiedToClipboard: 'Task copied to clipboard',
    failedToCopyTask: 'Failed to copy task',
    failedToGetTodayNote: 'Failed to get or create today daily note',
    taskAlreadyOnToday: 'Task is already on today daily note',
    taskCopiedToToday: 'Task copied to today daily note',
    failedToCopyTaskToToday: 'Failed to copy task to today',
    taskMovedToToday: 'Task moved to today daily note',
    failedToMoveTaskToToday: 'Failed to move task to today',
    taskMigratedToToday: 'Task migrated to today daily note',
    failedToMigrateTaskToToday: 'Failed to migrate task to today',
    failedToOpenTaskList: 'Failed to open task list',
    failedToUpdateTask: 'Failed to update task',
    failedToUpdateTaskPriority: 'Failed to update task priority',
    failedToUpdateTaskDate: 'Failed to update task date',
    failedToUpdateTaskDeadline: 'Failed to update task deadline',
    failedToSetViewState: 'Failed to set view state',
    failedToActivateTask: 'Failed to activate task',
    failedToLoadMoreTasks: 'Failed to load more tasks',
    failedToUpdateSourceTask: 'Failed to update source task',
    failedToFindSourceFile: 'Failed to find source file',
    taskAlreadyInFile: 'Task is already in this file',
    failedToShowContextMenu: 'Failed to show context menu',
    failedToShowDatePicker: 'Failed to show date picker',
    failedToOpenTaskLocation: 'Failed to open task location',
    migrationDisabled:
      'Migration is disabled. Configure the migrated state keyword in TODOseq settings.',
    dragTaskCopied: 'Task copied',
    dragTaskMoved: 'Task moved',
    dragTaskMigrated: 'Task migrated',
    savedSearchCreated: 'Saved search "{name}" created',
    savedSearchUpdated: 'Saved search "{name}" updated',
    savedSearchDeleted: 'Saved search "{name}" deleted',
  },
  commands: {
    showTaskList: 'Show task list',
    showTaskListInNewTab: 'Open task list in new tab',
    rescanVault: 'Rescan vault',
    toggleTaskState: 'Toggle task state',
    cycleTaskState: 'Cycle task state',
    addScheduledDate: 'Add scheduled date',
    addDeadlineDate: 'Add deadline date',
    addDescription: 'Add description',
    setPriorityHigh: 'Set priority high',
    setPriorityMedium: 'Set priority medium',
    setPriorityLow: 'Set priority low',
    copyToToday: 'Copy task to today',
    moveToToday: 'Move task to today',
    migrateToToday: 'Migrate task to today',
    openContextMenu: 'Open context menu',
    openScheduledDatePicker: 'Open scheduled date picker',
    openDeadlineDatePicker: 'Open deadline date picker',
  },
  contextMenu: {
    goToTask: 'Go to task',
    copy: 'Copy',
    copyToToday: 'Copy to today',
    moveToToday: 'Move to today',
    migrateToToday: 'Migrate to today',
    scheduled: 'Scheduled',
    priority: 'Priority',
    deadline: 'Deadline',
    priorityA: 'Priority A (high)',
    priorityB: 'Priority B (medium)',
    priorityC: 'Priority C (low)',
  },
  datePicker: {
    scheduledDate: 'Scheduled Date',
    deadlineDate: 'Deadline Date',
    today: 'Today',
    tomorrow: 'Tomorrow',
    nextWeekend: 'Next weekend',
    nextWeek: 'Next week',
    daily: 'Daily',
    weekly: 'Weekly',
    monthly: 'Monthly',
    yearly: 'Yearly',
    custom: 'Custom...',
    customRepeat: 'Custom repeat',
    repeat: 'Repeat',
    repeatType: 'Repeat type',
    repeatEvery: 'Repeat every',
    noDate: 'No date',
    clearRepeat: 'Clear repeat',
    delayedNotice: 'Delayed notice',
    advanceNotice: 'Advance notice',
    unitHour: 'hour(s)',
    unitDay: 'day(s)',
    unitWeek: 'week(s)',
    unitMonth: 'month(s)',
    unitYear: 'year(s)',
    warningNone: 'None',
    warning1Day: '1 day',
    warning3Days: '3 days',
    warning5Days: '5 days',
    warning7Days: '7 days',
    warning1Week: '1 week',
    warning2Weeks: '2 weeks',
    warning1Month: '1 month',
    warningPeriod: 'Warning period',
    customWarningPeriod: 'Custom warning period',
    cancel: 'Cancel',
    save: 'Save',
  },
  taskList: {
    searchLabel: 'Search',
    searchPlaceholder: 'Search tasks…',
    searchAriaLabel: 'Search tasks',
    clearSearch: 'Clear search',
    matchCase: 'Match case',
    saveSearch: 'Save search',
    taskListSettings: 'Task List settings',
    showCompletedTasks: 'Show completed tasks',
    futureTaskSorting: 'Future task sorting',
    taskDescriptionDisplay: 'Task description display',
    sortTasksBy: 'Sort tasks by',
    scanningTitle: 'Scanning vault...',
    scanningSubtitle: 'Please wait while your tasks are being indexed.',
    loadingTitle: 'Loading tasks...',
    loadingSubtitle: 'Please wait while your vault is being indexed.',
    noTasksFound: 'No tasks found',
    noTasksSubtitle:
      'Create tasks in your notes using "TODO your task". They will appear here automatically.',
    allTasksCompleted: 'All tasks are completed',
    allCompletedSubtitle:
      'You are hiding completed tasks. Switch view mode or add new tasks to see more.',
    noMatchingTasks: 'No matching tasks',
    noMatchingSubtitle: 'Try clearing the search or switching view modes.',
  },
  dragDrop: {
    copyHere: 'Copy task here',
    moveHere: 'Move task here',
    migrateHere: 'Migrate task here',
  },
  taskItem: {
    scheduled: 'Scheduled',
    scheduledPrefix: 'Scheduled: ',
    deadline: 'Deadline',
    deadlinePrefix: 'Deadline: ',
    closedPrefix: 'Closed: ',
  },
  savedSearch: {
    editTitle: 'Edit saved search',
    saveTitle: 'Save search',
    nameLabel: 'Name',
    namePlaceholder: 'E.g., agenda, overdue, work active',
    queryLabel: 'Search query',
    queryPlaceholder: 'E.g., scheduled:today, state:active, tag:work',
    matchCaseLabel: 'Match case',
    matchCaseUseCurrent: 'Use current setting',
    matchCaseOff: 'Off',
    matchCaseOn: 'On',
    sortLabel: 'Sort tasks by',
    completedTasksLabel: 'Completed tasks',
    futureTasksLabel: 'Future dated tasks',
    useCurrentSetting: 'Use current setting',
    viewModeShow: 'Show',
    viewModeSortToEnd: 'Sort to end',
    viewModeHide: 'Hide',
    showUpcoming: 'Show upcoming',
    deleteButton: 'Delete',
    saveChanges: 'Save changes',
  },
  searchOptions: {
    title: 'Search options',
    readMore: 'Read more',
    savedSearches: 'Saved searches',
    addSavedSearch: 'Add saved search',
    editSavedSearch: 'Edit saved search',
    deleteSavedSearch: 'Delete saved search',
    history: 'History',
    clearHistory: 'Clear history',
    caseSensitive: 'Case sensitive',
    saveAsSavedSearch: 'Save as saved search',
  },
  statusBar: {
    taskCountOne: '{count} task',
    taskCount: '{count} tasks',
  },
  embedded: {
    collapseTaskList: 'Collapse task list',
    expandTaskListAria: 'Expand task list, {count} tasks',
    priorityAria: 'Priority {priority}',
  },
} as const;

/**
 * Recursively widens `as const` string literals to `string` so other locales
 * can be typed against the same shape without inheriting English literals.
 */
export type WidenStrings<T> = {
  [K in keyof T]: T[K] extends string ? string : WidenStrings<T[K]>;
};
