import { TFile } from 'obsidian';

export interface Task {
  path: string; // path to the page in the vault
  line: number; // line number of the task in the page
  rawText: string; // original full line
  indent: string; // leading whitespace before any list marker/state
  listMarker: string; // the exact list marker plus trailing space if present (e.g., "- ", "1. ", "(a) ")
  footnoteMarker?: string; // footnote marker if present (e.g., "[^1]: ")
  text: string; // content after the state keyword with priority token removed
  state: string; // state keyword, TODO, DOING, DONE etc.
  completed: boolean; // is the task considered complete
  priority: 'high' | 'med' | 'low' | null;
  scheduledDate: Date | null; // scheduled date from SCHEDULED: line
  deadlineDate: Date | null; // deadline date from DEADLINE: line
  tail?: string; // trailing end characters after the task text (e.g., " */")
  urgency: number | null; // calculated urgency score
  file?: TFile; // reference to the file for daily notes detection
  tags?: string[]; // array of tags extracted from task text
  isDailyNote: boolean; // true if the task is on a daily note page
  dailyNoteDate: Date | null; // the date of the daily note if it's a daily note
  embedReference?: string; // Obsidian embed reference like ^abc123
  footnoteReference?: string; // footnote reference like [^2]
  quoteNestingLevel?: number; // number of nested quote levels (e.g., 1 for "> ", 2 for "> > ")
}

export const DEFAULT_PENDING_STATES = new Set<string>([
  'TODO',
  'LATER',
  'WAIT',
  'WAITING',
]);
export const DEFAULT_ACTIVE_STATES = new Set<string>([
  'DOING',
  'NOW',
  'IN-PROGRESS',
]);
export const DEFAULT_COMPLETED_STATES = new Set<string>([
  'DONE',
  'CANCELED',
  'CANCELLED',
]);

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

// State transitions for cycle task state
export const CYCLE_TASK_STATE = new Map<string, string>([
  ['TODO', 'DOING'],
  ['DOING', 'DONE'],
  ['DONE', ''], // DONE goes back to no task keyword (empty state)
  ['LATER', 'NOW'],
  ['NOW', 'DONE'],
  ['WAIT', 'IN-PROGRESS'],
  ['WAITING', 'IN-PROGRESS'],
  ['IN-PROGRESS', 'DONE'],
  ['CANCELED', 'TODO'],
  ['CANCELLED', 'TODO'],
  ['', 'TODO'], // No task keyword goes to TODO
]);
