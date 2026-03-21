/**
 * Task line utility functions for handling date line detection and task indent calculation.
 * Provides shared logic used across multiple services to avoid code duplication.
 */

import { Task } from '../types/task';
import { KeywordManager } from './keyword-manager';

/**
 * Calculate the total indentation length (treating tabs as 2 spaces).
 * Matches the logic in TaskParser.getIndentLength().
 * @param indent The indent string (may contain tabs and spaces)
 * @returns The visual indentation length
 */
export function getIndentLength(indent: string): number {
  let length = 0;
  for (const char of indent) {
    if (char === '\t') {
      length += 2; // Count tabs as 2 spaces (existing convention)
    } else {
      length += 1;
    }
  }
  return length;
}

/**
 * Find a date line of specified type after a task line.
 * Uses regex-based detection consistent with parser's getDateLineType logic.
 *
 * @param lines - Array of lines to search
 * @param startIndex - Starting line index (typically task.line + 1)
 * @param dateType - Type of date to find ('SCHEDULED', 'DEADLINE', or 'CLOSED')
 * @param taskIndent - The task's indent level (for proper nesting detection)
 * @param keywordManager - KeywordManager for dynamic keyword detection
 * @returns Line index of found date line, or -1 if not found
 *
 * @example
 * findDateLine(lines, 5, 'SCHEDULED', '  ', keywordManager)
 * // Returns: 7 if SCHEDULED line found at index 7, -1 otherwise
 */
export function findDateLine(
  lines: string[],
  startIndex: number,
  dateType: 'SCHEDULED' | 'DEADLINE' | 'CLOSED',
  taskIndent: string,
  keywordManager: KeywordManager,
): number {
  // Search limited to 9 lines after task (max nesting depth)
  const maxLines = Math.min(startIndex + 9, lines.length);
  const keyword = `${dateType}:`;

  for (let i = startIndex; i < maxLines; i++) {
    const line = lines[i];
    const trimmedLine = line.trimStart();

    // For quoted lines, check if trimmed line starts with > and rest starts with keyword
    // Handle both single > and nested > > quotes
    if (trimmedLine.startsWith('>')) {
      // Remove quote prefix and check if keyword follows
      const quotePrefix = trimmedLine.match(/^(>\s*)+/)?.[0] ?? '';
      const contentAfterQuotes = trimmedLine
        .substring(quotePrefix.length)
        .trim();
      if (contentAfterQuotes.startsWith(keyword)) {
        // For quoted lines, ensure the quote level matches
        // Any indent after the quote prefix is allowed
        const lineQuotePrefix = quotePrefix;
        // Extract quote prefix from task indent (including any leading whitespace before quotes)
        const taskQuotePrefix = taskIndent.match(/(\s*(>\s*)+)/)?.[1] ?? '';
        // Quote levels must match (or date line can be at deeper quote level)
        if (
          taskQuotePrefix !== '' &&
          lineQuotePrefix.startsWith(taskQuotePrefix)
        ) {
          return i;
        }
      }
    }

    // For regular lines, check if trimmed line starts with keyword
    // Any indent level is allowed - no indent check needed
    // But only if the task is NOT quoted (quote levels must match)
    const taskHasQuotes = taskIndent.match(/(>\s*)+/)?.[0] ?? '';
    if (taskHasQuotes === '' && trimmedLine.startsWith(keyword)) {
      return i;
    }

    // Check if this is a task line (we should stop searching if we find one)
    if (isTaskLine(trimmedLine, keywordManager)) {
      // Found another task - stop searching
      break;
    }

    // Stop if we hit a non-date, non-empty line at same or lower indent
    // Check for both regular and quoted date lines
    const isDateLine =
      trimmedLine.startsWith('SCHEDULED:') ||
      trimmedLine.startsWith('DEADLINE:') ||
      trimmedLine.startsWith('CLOSED:') ||
      /^(>\s*)+(SCHEDULED|DEADLINE|CLOSED):/.test(trimmedLine);

    if (trimmedLine !== '' && !isDateLine) {
      const lineIndent = line.substring(0, line.length - trimmedLine.length);
      const effectiveLineIndent =
        line.match(/^(\s*(>\s*)+)/)?.[1] ?? lineIndent;
      const effectiveTaskIndent =
        taskIndent.match(/^(\s*(>\s*)+)/)?.[1] ?? taskIndent;

      if (
        getIndentLength(effectiveLineIndent) <=
        getIndentLength(effectiveTaskIndent)
      ) {
        break;
      }
    }
  }

  return -1;
}

/**
 * Check if a line is a task line.
 * Uses KeywordManager to check for task keywords and checkbox patterns.
 * @param line - The line to check
 * @param keywordManager - KeywordManager for dynamic keyword detection
 * @returns true if the line appears to be a task
 */
function isTaskLine(line: string, keywordManager: KeywordManager): boolean {
  // Check for checkbox pattern: - [ ] or - [x]
  if (/^[\s]*- \[[ x]\]/i.test(line)) {
    return true;
  }

  const allKeywords = keywordManager.getAllKeywords();
  for (let i = 0; i < allKeywords.length; i++) {
    const keyword = allKeywords[i];
    const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const taskPattern = new RegExp(
      `^[\\s]*${escaped}\\b|^>+\\s+${escaped}\\b`,
      'i',
    );
    if (taskPattern.test(line)) {
      return true;
    }
  }

  return false;
}

/**
 * Find a date line using optional parser for enhanced detection.
 * If parser is provided, uses parser.getDateLineType() for more accurate detection.
 * Otherwise, falls back to regex-based detection.
 *
 * @param lines - Array of lines to search
 * @param startIndex - Starting line index (typically task.line + 1)
 * @param dateType - Type of date to find ('SCHEDULED', 'DEADLINE', or 'CLOSED')
 * @param taskIndent - The task's indent level (for proper nesting detection)
 * @param parser - Optional TaskParser for enhanced date line detection
 * @param keywordManager - KeywordManager for dynamic keyword detection (used when parser is null)
 * @returns Line index of found date line, or -1 if not found
 *
 * @example
 * findDateLineWithParser(lines, 5, 'SCHEDULED', '  ', parser, keywordManager)
 * // Returns: 7 if SCHEDULED line found at index 7, -1 otherwise
 */
export function findDateLineWithParser(
  lines: string[],
  startIndex: number,
  dateType: 'SCHEDULED' | 'DEADLINE' | 'CLOSED',
  taskIndent: string,
  parser:
    | {
        getDateLineType: (
          line: string,
          indent: string,
        ) => 'scheduled' | 'deadline' | 'closed' | null;
      }
    | null
    | undefined,
  keywordManager: KeywordManager,
): number {
  // If parser is provided, use it for detection
  if (parser) {
    const maxLines = Math.min(startIndex + 9, lines.length);
    const targetDateType = dateType.toLowerCase() as
      | 'scheduled'
      | 'deadline'
      | 'closed';

    for (let i = startIndex; i < maxLines; i++) {
      const line = lines[i];
      const detectedType = parser.getDateLineType(line, taskIndent);

      if (detectedType === targetDateType) {
        return i;
      }

      // Stop if this is not a date line (indicates we've moved past the task's date lines)
      if (detectedType === null && line.trim() !== '') {
        break;
      }
    }

    return -1;
  }

  // Fall back to regex-based detection
  return findDateLine(lines, startIndex, dateType, taskIndent, keywordManager);
}

/**
 * Get the proper indent for date lines under a task.
 * Uses the position of the task state keyword in the raw text to determine indent.
 *
 * @param task - The task object
 * @returns The proper indent string for date lines
 */
export function getTaskIndent(task: Task): string {
  const stateIndex = task.rawText.indexOf(task.state);
  if (stateIndex === -1) {
    // Fallback to leading whitespace if state not found
    return task.rawText.match(/^(\s*)/)?.[1] ?? '';
  }
  const indent = task.rawText.substring(0, stateIndex);
  // Replace any characters that are not '>' or whitespace with spaces
  return indent.replace(/[^>\s]/g, ' ');
}
