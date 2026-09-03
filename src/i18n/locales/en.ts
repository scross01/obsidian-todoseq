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
  },
} as const;

/**
 * Recursively widens `as const` string literals to `string` so other locales
 * can be typed against the same shape without inheriting English literals.
 */
export type WidenStrings<T> = {
  [K in keyof T]: T[K] extends string ? string : WidenStrings<T[K]>;
};
