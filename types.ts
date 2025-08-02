export interface Task {
  path: string;    // path to the page in the vault
  line: number;    // line number of the task in the page
  rawText: string; // original full line
  indent: string;  // leading whitespace before any list marker/state
  listMarker: string; // the exact list marker plus trailing space if present (e.g., "- ", "1. ", "(a) ")
  text: string;    // content after the state keyword with priority token removed
  state: string;   // state keyword, TODO, DOING, DONE etc.
  completed: boolean; // is the task considered complete
  priority: 'high' | 'med' | 'low' | null;
}

/** Controls how tasks are displayed in the TodoView */
export type TaskViewMode = 'default' | 'sortCompletedLast' | 'hideCompleted';

export interface TodoTrackerSettings {
  refreshInterval: number;    // refresh interval in seconds
  taskKeywords: string[];     // supported task state keywords, used to limit or expand the default set
  includeCodeBlocks: boolean; // when false, tasks inside fenced code blocks are ignored
  taskViewMode: TaskViewMode; // controls view transformation in the task view
}

// Shared constants so modules don’t re-declare different sources of truth
export const DEFAULT_SETTINGS: TodoTrackerSettings = {
  refreshInterval: 60,
  taskKeywords: ['TODO', 'DOING', 'DONE', 'NOW', 'LATER', 'WAIT', 'WAITING', 'IN-PROGRESS', 'CANCELED', 'CANCELLED'],
  includeCodeBlocks: false,
  taskViewMode: 'default',
};

export const PENDING_STATES = new Set<string>(['TODO', 'LATER', 'WAIT', 'WAITING']);
export const ACTIVE_STATES = new Set<string>(['DOING', 'NOW', 'IN-PROGRESS']); 
export const COMPLETED_STATES = new Set<string>(['DONE', 'CANCELED', 'CANCELLED']);

export const NEXT_STATE = new Map<string, string>([
  ['TODO', 'DOING'],
  ['DOING', 'DONE'],
  ['DONE', 'TODO'],
  ['LATER', 'NOW'],
  ['NOW', 'DONE'],
  ['WAIT', 'IN-PROGRESS'],
  ['WAITING', 'IN-PROGRESS'],
  ['IN-PROGRESS', 'DONE'],
  ['CANCELED', 'TODO'],
  ['CANCELLED', 'TODO'],
]);