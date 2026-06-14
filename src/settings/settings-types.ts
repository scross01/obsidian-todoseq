export interface StateTransitionSettings {
  // Default states for each category
  defaultInactive: string; // e.g., "TODO"
  defaultActive: string; // e.g., "DOING"
  defaultCompleted: string; // e.g., "DONE"

  // Multiline transition declarations
  transitionStatements: string[];
}

export interface TodoTrackerSettings {
  additionalInactiveKeywords: string[]; // Custom inactive keywords (TODO, LATER, FIXME, etc.)
  additionalActiveKeywords: string[]; // Custom active keywords (DOING, NOW, etc.)
  additionalWaitingKeywords: string[]; // Custom waiting keywords (WAIT, WAITING, etc.)
  additionalCompletedKeywords: string[]; // Custom completed keywords (DONE, CANCELLED, etc.)
  additionalArchivedKeywords: string[]; // Custom archived keywords (ARCHIVED, etc.) - styled but not collected
  includeCodeBlocks: boolean; // when false, tasks inside fenced code blocks are ignored
  includeCalloutBlocks: boolean; // when true, tasks inside callout blocks are included
  includeCommentBlocks: boolean; // when true, tasks inside multiline comment blocks (%%) are included
  taskListViewMode: 'showAll' | 'sortCompletedLast' | 'hideCompleted'; // controls view transformation in the task view
  futureTaskSorting: 'showAll' | 'showUpcoming' | 'sortToEnd' | 'hideFuture'; // controls how future tasks are handled
  defaultSortMethod:
    | 'default'
    | 'sortByScheduled'
    | 'sortByDeadline'
    | 'sortByClosedDate'
    | 'sortByPriority'
    | 'sortByUrgency'; // default sort method for task list view
  languageCommentSupport: boolean; // language-specific comment support settings
  weekStartsOn: 'Monday' | 'Sunday'; // controls which day the week starts on for date filtering
  formatTaskKeywords: boolean; // format task keywords in editor
  additionalFileExtensions: string[]; // additional file extensions to scan for tasks (e.g., ['.org', '.txt']) - hidden from UI, managed by detectOrgModeFiles
  detectOrgModeFiles: boolean; // experimental: when enabled, adds .org to additionalFileExtensions and registers org-mode parser
  scanCodeFiles: boolean; // experimental: when enabled, scans code files for TODO-style comments
  // Migrate to today settings
  migrateToTodayState: string; // keyword to set on source task after migrating to today
  // Property search engine instance
  propertySearchEngine?: import('../services/property-search-engine').PropertySearchEngine; // Property search engine instance
  // Hidden setting - not exposed in UI, used to track first install
  _hasShownFirstInstallView?: boolean; // true after first install view has been shown
  // State transition settings
  stateTransitions: StateTransitionSettings;
  // Task completion settings
  trackClosedDate: boolean; // when true, adds CLOSED: timestamp when tasks are marked as completed
  // Experimental features
  useExtendedCheckboxStyles: boolean; // when true, uses themed markdown checkbox styles ([/], [-]) for active and cancelled tasks
  // Smart date recognition settings
  enableSmartDateRecognition: boolean; // when true, enables natural language date parsing
  smartDateRemoveKeywords: boolean; // when true, removes natural language text after conversion
  // Warning period settings
  upcomingPeriod: number; // days for "upcoming" window (default: 7)
  defaultDeadlineWarningPeriod: number; // default advance notice for deadlines in days (0 = disabled)
  defaultScheduledWarningPeriod: number; // default delayed notice for scheduled in days (0 = disabled)
  skipScheduledWarningPeriodIfDeadline: boolean; // ignore scheduled delay when task has deadline
  skipDeadlinePrewarningIfScheduled: boolean; // ignore deadline advance notice when task has scheduled date
}

export const DefaultStateTransitionSettings: StateTransitionSettings = {
  defaultInactive: 'TODO',
  defaultActive: 'DOING',
  defaultCompleted: 'DONE',
  transitionStatements: [],
};

export const DefaultSettings: TodoTrackerSettings = {
  additionalInactiveKeywords: [],
  additionalActiveKeywords: [],
  additionalWaitingKeywords: [],
  additionalCompletedKeywords: [],
  additionalArchivedKeywords: [],
  includeCodeBlocks: false,
  includeCalloutBlocks: true, // Enabled by default
  includeCommentBlocks: false, // Disabled by default
  taskListViewMode: 'showAll',
  futureTaskSorting: 'showAll',
  defaultSortMethod: 'default', // Default to file path sorting
  languageCommentSupport: false,
  weekStartsOn: 'Monday', // Default to Monday as requested
  formatTaskKeywords: true, // Default to enabled
  additionalFileExtensions: [], // No additional extensions by default - managed by detectOrgModeFiles
  detectOrgModeFiles: false, // Experimental feature - disabled by default
  scanCodeFiles: false, // Experimental feature - disabled by default
  migrateToTodayState: '', // Default state to set on source task after migrating (empty = disabled)
  stateTransitions: DefaultStateTransitionSettings,
  trackClosedDate: false, // Disabled by default
  useExtendedCheckboxStyles: false, // Experimental feature - disabled by default
  // Smart date recognition settings
  enableSmartDateRecognition: true, // Enabled by default
  smartDateRemoveKeywords: true, // Remove natural language text after conversion
  // Warning period settings
  upcomingPeriod: 7, // 7-day upcoming window (matches previous hardcoded value)
  defaultDeadlineWarningPeriod: 0, // Disabled by default
  defaultScheduledWarningPeriod: 0, // No delay by default
  skipScheduledWarningPeriodIfDeadline: false, // Don't skip scheduled delay when deadline exists (Org Mode default: nil)
  skipDeadlinePrewarningIfScheduled: false, // Don't skip deadline warning when scheduled exists (Org Mode default: nil)
};
