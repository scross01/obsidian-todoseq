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
  const maxLines = Math.min(startIndex + 9, lines.length);
  const keyword = `${dateType}:`;

  for (let i = startIndex; i < maxLines; i++) {
    const line = lines[i];
    const trimmedLine = line.trimStart();

    if (lineStartsWithKeyword(line, keyword, taskIndent)) {
      return i;
    }

    if (isTaskLine(trimmedLine, keywordManager)) {
      break;
    }

    // Stop if we hit a non-date, non-empty line at same or lower indent
    if (trimmedLine !== '' && !isDateKeywordLine(trimmedLine)) {
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
      'scheduled' | 'deadline' | 'closed';

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
 * Find a DESCRIPTION: line after a task line.
 * Uses the same search pattern as findDateLine.
 *
 * @param lines - Array of lines to search
 * @param startIndex - Starting line index (typically task.line + 1)
 * @param taskIndent - The task's indent level
 * @returns Line index of found description line, or -1 if not found
 */
export function findDescriptionLine(
  lines: string[],
  startIndex: number,
  taskIndent: string,
): number {
  return findKeywordLine(lines, startIndex, 'DESCRIPTION:', taskIndent);
}

/**
 * Find a keyword line after a task line, handling quoted lines.
 */
function findKeywordLine(
  lines: string[],
  startIndex: number,
  keyword: string,
  taskIndent: string,
): number {
  const maxLines = Math.min(startIndex + 9, lines.length);

  for (let i = startIndex; i < maxLines; i++) {
    const line = lines[i];
    const trimmedLine = line.trimStart();

    if (lineStartsWithKeyword(line, keyword, taskIndent)) {
      return i;
    }

    // Stop at non-empty, non-date/keyword lines
    if (trimmedLine !== '' && !isDateKeywordLine(trimmedLine)) {
      break;
    }
  }

  return -1;
}

/**
 * Check if a line is a date keyword line (SCHEDULED:, DEADLINE:, CLOSED:, DESCRIPTION:).
 * Handles both bare and quoted (>, > >) forms.
 */
function isDateKeywordLine(line: string): boolean {
  const trimmed = line.trimStart();
  // Fast path: bare keywords (most common in vault-scan hot path)
  if (
    trimmed.startsWith('SCHEDULED:') ||
    trimmed.startsWith('DEADLINE:') ||
    trimmed.startsWith('CLOSED:') ||
    trimmed.startsWith('DESCRIPTION:')
  ) {
    return true;
  }
  // Slow path: quoted keywords (only test regex for lines starting with >)
  return (
    trimmed.startsWith('>') &&
    /^(>\s*)+(SCHEDULED|DEADLINE|CLOSED|DESCRIPTION):/.test(trimmed)
  );
}

/**
 * Shared quote-aware keyword matcher. Returns true if `line` starts with
 * `keyword` after stripping quote prefixes, respecting `taskIndent` quote level.
 */
function lineStartsWithKeyword(
  line: string,
  keyword: string,
  taskIndent: string,
): boolean {
  const trimmedLine = line.trimStart();

  if (trimmedLine.startsWith('>')) {
    const quotePrefix = trimmedLine.match(/^(>\s*)+/)?.[0] ?? '';
    const contentAfterQuotes = trimmedLine.substring(quotePrefix.length).trim();
    if (contentAfterQuotes.startsWith(keyword)) {
      const taskQuotePrefix = taskIndent.match(/(\s*(>\s*)+)/)?.[1] ?? '';
      return taskQuotePrefix !== '' && quotePrefix.startsWith(taskQuotePrefix);
    }
    return false;
  }

  const taskHasQuotes = taskIndent.match(/(>\s*)+/)?.[0] ?? '';
  return taskHasQuotes === '' && trimmedLine.startsWith(keyword);
}

/**
 * Get the proper indent for date lines under a task.
 * Uses the position of the task state keyword in the raw text to determine indent.
 *
 * @param task - The task object
 * @returns The proper indent string for date lines
 */
export function getTaskIndent(task: Task): string {
  // Return the task's leading whitespace indent.
  // Previously computed indent from rawText.indexOf(state) which included
  // list marker characters (e.g. "- [ ] " → 6 spaces), causing date-line
  // indent comparisons to fail for tasks with list markers but no leading
  // whitespace (6 > 2 fails, but 0 < 2 passes correctly).
  return task.indent ?? '';
}

/**
 * Get the proper indent for date lines (SCHEDULED, DEADLINE, CLOSED) under a task.
 * For tasks with list markers (bullets, checkboxes), date lines should be indented 2 spaces more than the task's leading whitespace.
 * For keyword-only tasks (no list marker), date lines should be at the same indent level as the task.
 * For quoted tasks, the date line should be at the same quote level as the task.
 *
 * @param task - The task object
 * @returns The proper indent string for date lines
 */
export function getDateLineIndent(task: Task): string {
  // Extract quote prefix (e.g., "> ", "> > ") if present
  const quotePrefix = task.rawText.match(/^(\s*(>\s*)+)/)?.[1] ?? '';

  // For quoted tasks, preserve the quote prefix without adding extra spaces
  if (quotePrefix && quotePrefix.trim().length > 0) {
    return quotePrefix;
  }

  // Check if task has a list marker (bullet, checkbox, numbered, etc.)
  const hasListMarker = /^\s*[-*]\s|^\s*\d+[.)]\s|^\s*[a-zA-Z][.)]\s/i.test(
    task.rawText,
  );

  // For tasks with list markers, add 2 spaces to the leading whitespace
  // For keyword-only tasks, use the same indent as the task
  return hasListMarker ? task.indent + '  ' : task.indent;
}

// ─── Table cell utilities ─────────────────────────────────────────────────────

export interface TableCellInfo {
  /** Raw cell content (with leading/trailing whitespace) */
  raw: string;
  /** Trimmed cell content */
  content: string;
  /** Character offset of this cell's content start within the line (after opening |) */
  start: number;
  /** Character offset of this cell's content end within the line (before closing |) */
  end: number;
}

/**
 * Parse a pipe-delimited table line into its cells.
 * Returns cell info with character offsets for precise DOM/edit operations.
 */
export function parseTableCells(line: string): TableCellInfo[] {
  const cells: TableCellInfo[] = [];
  const parts = line.split('|');
  let start = 0;
  if (parts.length > 0 && parts[0].trim() === '') start = 1;
  let end = parts.length;
  if (end > start && parts[end - 1].trim() === '') end--;

  // Account for leading whitespace before the first |
  let pos = parts[0].length;
  for (let i = start; i < end; i++) {
    const raw = parts[i];
    const contentStart = pos + 1; // after the |
    const contentEnd = contentStart + raw.length;
    cells.push({
      raw,
      content: raw.trim(),
      start: contentStart,
      end: contentEnd,
    });
    pos = contentEnd; // past this cell's content, before next |
  }
  return cells;
}

/**
 * Check if a line is a markdown table row (starts with |).
 */
export function isTableRow(line: string): boolean {
  return /^\s*\|/.test(line);
}

/**
 * Check if a cell content is a separator row (e.g., ---, :---:).
 */
export function isSeparatorCell(content: string): boolean {
  return /^[-:]+$/.test(content);
}

/**
 * Extract the first <br>-split part of a cell (the task line portion).
 */
export function getCellTaskLine(content: string): string {
  return content.split(/<br\s*\/?>/i)[0]?.trim() || content.trim();
}
