export interface TodoTrackerSettings {
  additionalInactiveKeywords: string[]; // Custom inactive keywords (TODO, LATER, FIXME, etc.)
  additionalActiveKeywords: string[]; // Custom active keywords (DOING, NOW, etc.)
  additionalWaitingKeywords: string[]; // Custom waiting keywords (WAIT, WAITING, etc.)
  additionalCompletedKeywords: string[]; // Custom completed keywords (DONE, CANCELLED, etc.)
  additionalArchivedKeywords: string[]; // Custom archived keywords (ARCHIVED, etc.) - styled but not collected
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
  languageCommentSupport: boolean; // language-specific comment support settings
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
};
