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

export type KeywordGroup =
  | 'activeKeywords'
  | 'inactiveKeywords'
  | 'waitingKeywords'
  | 'completedKeywords'
  | 'archivedKeywords';
