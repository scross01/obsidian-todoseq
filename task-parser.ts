import { Task, DEFAULT_COMPLETED_STATES, DEFAULT_PENDING_STATES, DEFAULT_ACTIVE_STATES } from './task';
import { TodoTrackerSettings } from "./settings";

type RegexPair = { test: RegExp; capture: RegExp };

// Regex patterns for supported date formats
const DATE_ONLY = /^<(\d{4}-\d{2}-\d{2})>/;
const DATE_WITH_DOW = /^<(\d{4}-\d{2}-\d{2})\s+(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+(\d{2}:\d{2})>/;
const DATE_WITH_TIME = /^<(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})>/;

// Date keyword patterns
const SCHEDULED_PATTERN = /^SCHEDULED:\s*/;
const DEADLINE_PATTERN = /^DEADLINE:\s*/;

export class TaskParser {
  private readonly testRegex: RegExp;
  private readonly captureRegex: RegExp;
  private readonly includeCodeBlocks: boolean;

  private constructor(regex: RegexPair, includeCodeBlocks: boolean) {
    this.testRegex = regex.test;
    this.captureRegex = regex.capture;
    this.includeCodeBlocks = includeCodeBlocks;
  }

  static create(settings: TodoTrackerSettings): TaskParser {
    // Build union of non-completed states (defaults + user additional) and completed states (defaults only)
    const additional: string[] = Array.isArray(settings.additionalTaskKeywords)
      ? (settings.additionalTaskKeywords as string[])
      : [];

    // Ensure values are strings and already capitalised by settings UI; filter out empties defensively
    const normalizedAdditional: string[] = additional
      .filter((k): k is string => typeof k === 'string')
      .map(k => k.trim())
      .filter(k => k.length > 0);

    const nonCompletedArray: string[] = [
      ...Array.from(DEFAULT_PENDING_STATES),
      ...Array.from(DEFAULT_ACTIVE_STATES),
      ...normalizedAdditional,
    ];
    const nonCompleted = new Set<string>(nonCompletedArray);

    const allKeywordsArray: string[] = [
      ...Array.from(nonCompleted),
      ...Array.from(DEFAULT_COMPLETED_STATES),
    ];

    const regex = TaskParser.buildRegex(allKeywordsArray);
    return new TaskParser(regex, !!settings.includeCodeBlocks);
  }

  static buildRegex(keywords: string[]): RegexPair {
    const escaped = keywords
      .map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('|');
    const listMarkerPart = `(?:(?:[-*+]|\\d+[.)]|[A-Za-z][.)]|\\([A-Za-z0-9]+\\))\\s+)?`;
    // Intentionally case-sensitive (no flags). Matches capitalised keywords only.
    const test = new RegExp(`^[ \\t]*${listMarkerPart}(?:${escaped})\\s+`);
    const capture = new RegExp(`^([ \\t]*)(${listMarkerPart})?(${escaped})\\s+`);
    return { test, capture };
  }

  /**
   * Parse a date from a line containing SCHEDULED: or DEADLINE: prefix
   * @param line The line to parse
   * @returns Parsed Date object or null if parsing fails
   */
  parseDateFromLine(line: string): Date | null {
    // Remove the SCHEDULED: or DEADLINE: prefix and trim
    // The regex needs to account for leading whitespace
    const content = line.replace(/^\s*(SCHEDULED|DEADLINE):\s*/, '').trim();
    
    // Try to match date patterns
    let match = DATE_WITH_DOW.exec(content);
    if (match) {
      const [, dateStr, , timeStr] = match;
      return this.parseDateTimeString(dateStr, timeStr);
    }

    match = DATE_WITH_TIME.exec(content);
    if (match) {
      const [, dateStr, timeStr] = match;
      return this.parseDateTimeString(dateStr, timeStr);
    }

    match = DATE_ONLY.exec(content);
    if (match) {
      const [, dateStr] = match;
      return this.parseDateString(dateStr);
    }

    return null;
  }

  /**
   * Parse a date string with optional time
   * @param dateStr Date string in YYYY-MM-DD format
   * @param timeStr Optional time string in HH:mm format
   * @returns Date object in local time (timezone independent)
   */
  private parseDateTimeString(dateStr: string, timeStr: string): Date {
    const [year, month, day] = dateStr.split('-').map(Number);
    const [hours, minutes] = timeStr.split(':').map(Number);
    
    // Create date in local time to preserve the intended time
    return new Date(year, month - 1, day, hours, minutes);
  }

  /**
   * Parse a date string (date only)
   * @param dateStr Date string in YYYY-MM-DD format
   * @returns Date object at midnight local time (timezone independent)
   */
  private parseDateString(dateStr: string): Date {
    const [year, month, day] = dateStr.split('-').map(Number);
    
    // Create date at midnight local time
    return new Date(year, month - 1, day, 0, 0, 0, 0);
  }

  /**
   * Check if a line contains SCHEDULED: or DEADLINE: at the same indent level
   * @param line The line to check
   * @param indent The expected indent level
   * @returns The type of date line found or null
   */
  getDateLineType(line: string, taskIndent: string): 'scheduled' | 'deadline' | null {
    const trimmedLine = line.trim();
    if (!trimmedLine.startsWith('SCHEDULED:') && !trimmedLine.startsWith('DEADLINE:')) {
      return null;
    }

    // Check if the indent matches (same level) OR is indented (more spaces/tabs than task)
    const lineIndent = line.substring(0, line.length - trimmedLine.length);
    
    // Allow same indent OR more indent (Logseq style)
    if (lineIndent !== taskIndent && !lineIndent.startsWith(taskIndent)) {
      return null;
    }

    return trimmedLine.startsWith('SCHEDULED:') ? 'scheduled' : 'deadline';
  }

  isTask(line: string): boolean {
    return this.testRegex.test(line);
  }

  // Parse a single file content into Task[], pure and stateless w.r.t. external app
  parseFile(content: string, path: string): Task[] {
    const lines = content.split('\n');

    // Fence state
    let inFence = false;
    let fenceMarker: '`' | '~' | null = null;

    const tasks: Task[] = [];

    for (let index = 0; index < lines.length; index++) {
      const line = lines[index];

      // Update fence state and skip delimiter lines
      const toggled = this.toggleFenceIfDelimiter(line, inFence, fenceMarker);
      if (toggled.didToggle) {
        inFence = toggled.inFence;
        fenceMarker = toggled.fenceMarker;
        continue;
      }

      if (inFence && !this.includeCodeBlocks) {
        continue;
      }

      if (!this.isTask(line)) continue;

      const m = this.captureRegex.exec(line);
      if (!m) continue;

      const indent = m[1] ?? '';
      const listMarker = (m[2] ?? '') as string;
      const state = m[3] ?? '';
      const afterPrefix = line.slice(m[0].length);

      // Priority parsing: first occurrence wins, then remove it preserving spacing semantics
      let priority: 'high' | 'med' | 'low' | null = null;
      const priMatch = /(\s*)\[#([ABC])\](\s*)/.exec(afterPrefix);
      let cleanedText = afterPrefix;
      if (priMatch) {
        const letter = priMatch[2];
        if (letter === 'A') priority = 'high';
        else if (letter === 'B') priority = 'med';
        else if (letter === 'C') priority = 'low';

        const before = cleanedText.slice(0, priMatch.index);
        const after = cleanedText.slice(priMatch.index + priMatch[0].length);
        cleanedText = (before + ' ' + after).replace(/[ \t]+/g, ' ').trimStart();
      }

      const text = cleanedText;

      // Initialize task with date fields
      const task: Task = {
        path,
        line: index,
        rawText: line,
        indent,
        listMarker,
        text,
        state,
        completed: DEFAULT_COMPLETED_STATES.has(state),
        priority,
        scheduledDate: null,
        deadlineDate: null,
      };

      // Look for SCHEDULED: and DEADLINE: lines immediately after the task line
      let scheduledFound = false;
      let deadlineFound = false;

      for (let i = index + 1; i < lines.length; i++) {
        const nextLine = lines[i];
        
        // Check if we've moved to a different indent level or non-empty line that's not a date line
        const nextLineTrimmed = nextLine.trim();
        if (nextLineTrimmed === '') {
          continue; // Skip empty lines
        }

        const dateLineType = this.getDateLineType(nextLine, indent);
        
        if (dateLineType === 'scheduled' && !scheduledFound) {
          const date = this.parseDateFromLine(nextLine);
          if (date) {
            task.scheduledDate = date;
            scheduledFound = true;
          } else {
            console.warn(`Invalid scheduled date format at ${path}:${i + 1}: "${nextLine.trim()}"`);
          }
        } else if (dateLineType === 'deadline' && !deadlineFound) {
          const date = this.parseDateFromLine(nextLine);
          if (date) {
            task.deadlineDate = date;
            deadlineFound = true;
          } else {
            console.warn(`Invalid deadline date format at ${path}:${i + 1}: "${nextLine.trim()}"`);
          }
        } else {
          // Stop looking for date lines if we encounter a non-empty line that's not a date line
          // or if we've already found both scheduled and deadline dates
          if (dateLineType === null || (scheduledFound && deadlineFound)) {
            break;
          }
        }
      }

      tasks.push(task);
    }

    return tasks;
  }

  // Pure fence delimiter tracker: detects ``` or ~~~ at start (with indent), toggles when matching opener char.
  private toggleFenceIfDelimiter(
    line: string,
    inFence: boolean,
    fenceMarker: '`' | '~' | null
  ): { didToggle: boolean; inFence: boolean; fenceMarker: '`' | '~' | null } {
    const fenceMatch = /^[ \t]*(`{3,}|~{3,})/.exec(line);
    if (!fenceMatch) {
      return { didToggle: false, inFence, fenceMarker };
    }
    const markerRun = fenceMatch[1];
    const currentMarker: '`' | '~' = markerRun[0] === '`' ? '`' : '~';
    if (!inFence) {
      return { didToggle: true, inFence: true, fenceMarker: currentMarker };
    } else {
      if (fenceMarker === currentMarker) {
        return { didToggle: true, inFence: false, fenceMarker: null };
      }
      // Different fence char while inside: ignore as plain text
      return { didToggle: false, inFence, fenceMarker };
    }
  }
}