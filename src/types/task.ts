import { TFile } from 'obsidian';

export interface Task {
  path: string; // path to the page in the vault
  line: number; // line number of the task in the page
  rawText: string; // original full line
  indent: string; // leading whitespace before any list marker/state
  listMarker: string; // the exact list marker plus trailing space if present (e.g., "- ", "1. ", "(a) ")
  footnoteMarker?: string; // footnote marker if present (e.g., "[^1]: ")
  text: string; // content after the state keyword with priority token removed
  textDisplay?: string; // lazy-computed markdown-stripped text for display
  state: string; // state keyword, TODO, DOING, DONE etc.
  completed: boolean; // is the task considered complete
  priority: 'high' | 'med' | 'low' | null;
  scheduledDate: Date | null; // scheduled date from SCHEDULED: line
  scheduledDateRepeat?: DateRepeatInfo | null; // repeater info for scheduled date (optional for backward compat)
  deadlineDate: Date | null; // deadline date from DEADLINE: line
  deadlineDateRepeat?: DateRepeatInfo | null; // repeater info for deadline date (optional for backward compat)
  tail?: string; // trailing end characters after the task text (e.g., " */")
  urgency: number | null; // calculated urgency score
  file?: TFile; // reference to the file for daily notes detection
  tags?: string[]; // array of tags extracted from task text
  isDailyNote: boolean; // true if the task is on a daily note page
  dailyNoteDate: Date | null; // the date of the daily note if it's a daily note
  embedReference?: string; // Obsidian embed reference like ^abc123
  footnoteReference?: string; // footnote reference like [^2]
  quoteNestingLevel?: number; // number of nested quote levels (e.g., 1 for "> ", 2 for "> > ")
  subtaskCount: number; // total number of subtasks (checkbox lines indented under this task)
  subtaskCompletedCount: number; // number of completed subtasks
}

export type KeywordGroup =
  | 'activeKeywords'
  | 'inactiveKeywords'
  | 'waitingKeywords'
  | 'completedKeywords'
  | 'archivedKeywords';

/**
 * Information about a repeating date (repeater cookie).
 * Used for SCHEDULED and DEADLINE dates with org-mode compatible repeaters.
 *
 * @example
 * // For date like <2026-03-05 Wed 07:00 .+1d>
 * { type: '.+', unit: 'd', value: 1, raw: '.+1d' }
 */
export interface DateRepeatInfo {
  /** Repeater type: '+' (plain), '.+' (shift from now), '++' (catch-up) */
  type: '+' | '.+' | '++';
  /** Time unit: y=year, m=month, w=week, d=day, h=hour */
  unit: 'y' | 'm' | 'w' | 'd' | 'h';
  /** Numeric value (e.g., 1 for +1w, 3 for +3m) */
  value: number;
  /** Original repeater string (e.g., ".+1d", "++1w") */
  raw: string;
}
