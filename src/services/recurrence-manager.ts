/**
 * RecurrenceManager handles all recurrence-related logic for tasks.
 * Provides centralized calculation and update of recurring task dates.
 */

import { Task } from '../types/task';
import {
  calculateNextRepeatDate,
  formatDateLine,
} from '../utils/date-repeater';
import {
  findDateLineWithParser,
  getTaskIndent,
} from '../utils/task-line-utils';

/**
 * Result of a recurrence update operation.
 */
export interface RecurrenceUpdateResult {
  /** The modified lines array */
  lines: string[];
  /** Whether any changes were made */
  updated: boolean;
  /** The new scheduled date (if updated) */
  newScheduledDate?: Date;
  /** The new deadline date (if updated) */
  newDeadlineDate?: Date;
  /** The new task state keyword */
  newState?: string;
}

/**
 * Parser interface for date line detection.
 */
export interface DateLineParser {
  getDateLineType: (
    line: string,
    indent: string,
  ) => 'scheduled' | 'deadline' | 'closed' | null;
}

/**
 * RecurrenceManager handles all recurrence-related logic for tasks.
 * Provides centralized calculation and update of recurring task dates.
 */
import { KeywordManager } from '../utils/keyword-manager';

export class RecurrenceManager {
  private keywordManager?: KeywordManager;

  constructor(keywordManager?: KeywordManager) {
    this.keywordManager = keywordManager;
  }

  setKeywordManager(keywordManager: KeywordManager): void {
    this.keywordManager = keywordManager;
  }
  /**
   * Calculate the next recurrence dates for a task.
   *
   * @param task - The task to calculate recurrence for
   * @param fileContent - The full file content as lines
   * @param parser - The task parser for date line detection
   * @param defaultInactive - The default inactive keyword (e.g., 'TODO')
   * @returns RecurrenceUpdateResult with updated lines and new dates
   */
  calculateNextDates(
    task: Task,
    fileContent: string[],
    parser: DateLineParser,
    defaultInactive: string,
  ): RecurrenceUpdateResult {
    const lines = [...fileContent]; // Create a copy to avoid mutating input
    const taskLine = lines[task.line];
    const taskIndent = getTaskIndent(taskLine);

    const now = new Date();
    let newScheduledDate: Date | null = null;
    let newDeadlineDate: Date | null = null;

    // Find SCHEDULED and DEADLINE line indices using the shared utility
    const scheduledLineIndex =
      task.scheduledDateRepeat != null
        ? findDateLineWithParser(
            lines,
            task.line + 1,
            'SCHEDULED',
            taskIndent,
            parser,
          )
        : -1;
    const deadlineLineIndex =
      task.deadlineDateRepeat != null
        ? findDateLineWithParser(
            lines,
            task.line + 1,
            'DEADLINE',
            taskIndent,
            parser,
          )
        : -1;

    // Parse and calculate next dates for SCHEDULED line
    if (scheduledLineIndex >= 0 && task.scheduledDateRepeat != null) {
      const line = lines[scheduledLineIndex];
      const date = this.parseDateFromLine(line);
      if (date) {
        newScheduledDate = calculateNextRepeatDate(
          date,
          task.scheduledDateRepeat,
          now,
        );
      }
    }

    // Parse and calculate next dates for DEADLINE line
    if (deadlineLineIndex >= 0 && task.deadlineDateRepeat != null) {
      const line = lines[deadlineLineIndex];
      const date = this.parseDateFromLine(line);
      if (date) {
        newDeadlineDate = calculateNextRepeatDate(
          date,
          task.deadlineDateRepeat,
          now,
        );
      }
    }

    // If no dates need updating, return early
    if (!newScheduledDate && !newDeadlineDate) {
      return { lines, updated: false };
    }

    // Update the date lines in the file
    if (scheduledLineIndex >= 0 && newScheduledDate) {
      lines[scheduledLineIndex] = formatDateLine(
        lines[scheduledLineIndex],
        newScheduledDate,
        task.scheduledDateRepeat,
      );
    }

    if (deadlineLineIndex >= 0 && newDeadlineDate) {
      lines[deadlineLineIndex] = formatDateLine(
        lines[deadlineLineIndex],
        newDeadlineDate,
        task.deadlineDateRepeat,
      );
    }

    return {
      lines,
      updated: true,
      newScheduledDate: newScheduledDate ?? undefined,
      newDeadlineDate: newDeadlineDate ?? undefined,
    };
  }

  /**
   * Update a task's keyword to the inactive state.
   *
   * @param lines - The file lines
   * @param taskLine - The line number of the task
   * @param defaultInactive - The default inactive keyword
   * @returns The updated lines
   */
  updateTaskKeyword(
    lines: string[],
    taskLine: number,
    defaultInactive: string,
  ): string[] {
    const updatedLines = [...lines];
    const taskLineContent = updatedLines[taskLine];

    // Use keywordManager if available, otherwise fall back to hardcoded pattern
    if (this.keywordManager) {
      const allKeywords = this.keywordManager.getAllKeywords();
      for (const keyword of allKeywords) {
        if (taskLineContent.includes(keyword)) {
          updatedLines[taskLine] = taskLineContent.replace(
            keyword,
            defaultInactive,
          );
          break;
        }
      }
    } else {
      // Fallback to hardcoded pattern for backward compatibility
      const keywordPattern =
        /\b(TODO|DONE|CANCELLED|IN_PROGRESS|WAITING|BLOCKED|REJECTED|ARCHIVED|FIXME)\b/i;
      const match = taskLineContent.match(keywordPattern);

      if (match) {
        updatedLines[taskLine] = taskLineContent.replace(
          match[0],
          defaultInactive,
        );
      }
    }

    return updatedLines;
  }

  /**
   * Parse a date from a date line.
   * Extracts the date from angle brackets in the line.
   *
   * @param line - The date line (e.g., "SCHEDULED: <2026-03-10>")
   * @returns The parsed date or null if not found
   */
  private parseDateFromLine(line: string): Date | null {
    // Match dates like <2026-03-10>, <2026-03-10 Tue>, <2026-03-10 11:30>, <2026-03-10 Tue 11:30>
    const dateMatch = line.match(
      /<(\d{4}-\d{2}-\d{2})(?: [A-Za-z]{3})?(?: (\d{1,2}:\d{2}))?/,
    );
    if (!dateMatch) {
      return null;
    }

    const [, dateStr, timeStr] = dateMatch;
    const [year, month, day] = dateStr.split('-').map(Number);

    if (timeStr) {
      const [hours, minutes] = timeStr.split(':').map(Number);
      return new Date(year, month - 1, day, hours, minutes);
    }

    return new Date(year, month - 1, day);
  }
}
