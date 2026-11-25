/**
 * Task line utility functions for handling date line detection and task indent calculation.
 * Provides shared logic used across multiple services to avoid code duplication.
 */

import { Task } from '../types/task';
import { isDrawerEndLine, splitTrailingBlockAnchor } from './block-anchor';
import { KeywordManager } from './keyword-manager';
import { CHECKBOX_DETECTION_REGEX } from './patterns';

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

export interface DescriptionLineSource {
  lineCount(): number;
  getLine(line: number): string;
}

/** Return the closing :END: index for a drawer starting at i, if bounded. */
function drawerEndAt(
  source: DescriptionLineSource,
  i: number,
  format: 'markdown' | 'org' = 'markdown',
  isBoundary?: (line: string) => boolean,
): number {
  for (let j = i + 1; j < source.lineCount(); j++) {
    const line = source.getLine(j);
    // Quoted drawers close with `> :END:`; parse the metadata body before
    // looking for the drawer end. The anchored form is accepted too.
    const body = line.match(/^([ \t]*)((?:>[ \t]*)*)(.*)$/)?.[3] ?? line;
    if (isDrawerEndLine(body, format)) return j;
    // Blank lines and metadata-like lines (including unknown keys) continue
    // the drawer, exactly as readTaskPropertiesDrawer does.
    if (line.trim() === '') continue;
    // A task, heading task or checkbox boundary means the parser would stop
    // with this drawer unclosed rather than scan past it.
    if (isBoundary?.(line)) return -1;
    // The Org parser ends an entry at any line whose first character is '*',
    // including a body line such as '*bold*'. Markdown has no such rule: a
    // '* item: value' line is drawer content, not a heading.
    if (format === 'org' && /^\*/.test(line)) {
      return -1;
    }
    // Prose without a colon is not drawer content; the parser stops here with
    // the drawer unclosed, so a later :END: must not revive it.
    if (!line.includes(':')) return -1;
  }
  return -1;
}

/** Return the closing :END: index for an array-backed drawer, if bounded. */
function propertiesDrawerEnd(
  lines: string[],
  i: number,
  format: 'markdown' | 'org' = 'markdown',
): number {
  if (lines[i]?.trim() !== ':PROPERTIES:') return -1;
  return drawerEndAt(
    { lineCount: () => lines.length, getLine: (line) => lines[line] },
    i,
    format,
  );
}

/**
 * Find a date line of specified type after a task line.
 * Uses regex-based detection consistent with parser's getDateLineType logic.
 *
 * @param lines - Array of lines to search
 * @param startIndex - Starting line index (typically task.line + 1)
 * @param dateType - Type of date to find ('SCHEDULED', 'DEADLINE', 'CLOSED', or 'STARTED')
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
  dateType: 'SCHEDULED' | 'DEADLINE' | 'CLOSED' | 'STARTED',
  taskIndent: string,
  keywordManager: KeywordManager,
): number {
  const maxLines = Math.min(startIndex + 9, lines.length);
  const keyword = `${dateType}:`;

  for (let i = startIndex; i < maxLines; i++) {
    const line = lines[i];
    const trimmedLine = line.trimStart();

    const drawerEnd = propertiesDrawerEnd(lines, i);
    if (drawerEnd >= 0) {
      i = drawerEnd;
      continue;
    }

    if (isOwnedDateLine(line, keyword, taskIndent)) {
      return i;
    }

    // A date line is never a task boundary — even when a configured
    // keyword collides with a date keyword (e.g. STARTED set as an active
    // keyword, the documented keyword-groups example). Without this, a
    // STARTED date line above a SCHEDULED/CLOSED line would break the
    // scan: un-completion could not remove CLOSED, completion inserted a
    // duplicate, and recurrence rollovers stacked date lines.
    if (
      isTaskLine(trimmedLine, keywordManager) &&
      !isDateKeywordLine(trimmedLine)
    ) {
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
 * Check if a line is a date keyword line. Date lookup uses this to avoid
 * treating date-looking metadata as a task boundary even when that line is
 * not the selected date type.
 */
function isDateKeywordLine(line: string): boolean {
  const trimmed = line.trimStart();
  if (
    trimmed.startsWith('SCHEDULED:') ||
    trimmed.startsWith('DEADLINE:') ||
    trimmed.startsWith('CLOSED:') ||
    trimmed.startsWith('STARTED:') ||
    trimmed.startsWith('DESCRIPTION:')
  ) {
    return true;
  }
  return (
    trimmed.startsWith('>') &&
    /^(>\s*)+(SCHEDULED|DEADLINE|CLOSED|STARTED|DESCRIPTION):/.test(trimmed)
  );
}

/**
 * Check if a line is a task line.
 * Uses KeywordManager to check for task keywords and checkbox patterns.
 * @param line - The line to check
 * @param keywordManager - KeywordManager for dynamic keyword detection
 * @returns true if the line appears to be a task
 */
export function isTaskLine(
  line: string,
  keywordManager: KeywordManager,
): boolean {
  // Check for checkbox pattern: - [ ] or - [x]
  if (/^[\s]*- \[[ x]\]/i.test(line)) {
    return true;
  }

  const allKeywords = keywordManager.getAllKeywords();
  for (let i = 0; i < allKeywords.length; i++) {
    const keyword = allKeywords[i];
    const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Accept the same prefixes the parser allows: indentation, blockquote
    // markers and an optional bullet marker before the keyword.
    const taskPattern = new RegExp(
      `^(?:\\s*>\\s*)*\\s*(?:[-*+]\\s+)?${escaped}\\b`,
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
 * @param dateType - Type of date to find ('SCHEDULED', 'DEADLINE', 'CLOSED', or 'STARTED')
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
  dateType: 'SCHEDULED' | 'DEADLINE' | 'CLOSED' | 'STARTED',
  taskIndent: string,
  parser:
    | {
        getDateLineType: (
          line: string,
          indent: string,
        ) => 'scheduled' | 'deadline' | 'closed' | 'started' | null;
      }
    | null
    | undefined,
  keywordManager: KeywordManager,
): number {
  // If parser is provided, use it for detection
  if (parser) {
    const maxLines = Math.min(startIndex + 9, lines.length);
    const targetDateType = dateType.toLowerCase() as
      'scheduled' | 'deadline' | 'closed' | 'started';

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

/** One supported Org planning timestamp inside an entry. */
export interface OrgPlanningToken {
  lineIndex: number;
  /** Keyword start, after the line's leading whitespace. */
  start: number;
  /** End of the timestamp token. */
  end: number;
  /** `<...>` or `[...]` timestamp text. */
  dateText: string;
}

/**
 * Find one planning token in an Org entry. Unlike findDateLine this searches
 * inside shared planning lines and stops at the next headline, so SCHEDULED
 * and DEADLINE can coexist in either order without hiding each other.
 */
export function findOrgPlanningToken(
  lines: string[],
  startIndex: number,
  dateType: 'SCHEDULED' | 'DEADLINE' | 'CLOSED' | 'STARTED',
): OrgPlanningToken | null {
  for (let i = startIndex; i < lines.length; i++) {
    const line = lines[i];
    // Mirror extractTaskDates: any leading '*' ends the entry, not just a
    // heading-shaped '* ' line, so '*bold*' body text is a boundary too.
    if (/^\*/.test(line)) break;

    // Property values are not planning metadata. A closed drawer is skipped
    // whole; an unclosed one stops the entry exactly as the Org parser does.
    if (line.trim() === ':PROPERTIES:') {
      const drawerEnd = propertiesDrawerEnd(lines, i, 'org');
      if (drawerEnd < 0) break;
      i = drawerEnd;
      continue;
    }

    // Mirror OrgModeTaskParser.extractTaskDates: CLOSED and STARTED are
    // anchored to the start of the line; a matching token inside prose is
    // body text, not history metadata.
    const anchored = dateType === 'CLOSED' || dateType === 'STARTED';
    const match = new RegExp(
      anchored
        ? `^\\s*${dateType}:\\s*(<[^>]+>|\\[[^\\]]+\\])`
        : `\\b${dateType}:\\s*(<[^>]+>|\\[[^\\]]+\\])`,
      'i',
    ).exec(line);
    if (!match) continue;

    const start = match.index;
    return {
      lineIndex: i,
      start,
      end: start + match[0].length,
      dateText: match[1],
    };
  }
  return null;
}

/**
 * Replace or remove one Org planning token without touching the other tokens
 * or the authored whitespace around them. Returns null when removal leaves an
 * empty line.
 */
export function replaceOrgPlanningToken(
  line: string,
  token: OrgPlanningToken,
  replacement: string | null,
): string | null {
  if (replacement !== null) {
    return line.slice(0, token.start) + replacement + line.slice(token.end);
  }

  const indent = line.match(/^\s*/)?.[0] ?? '';
  const before = line.slice(indent.length, token.start).trimEnd();
  const after = line.slice(token.end).trim();
  const body = [before, after].filter(Boolean).join(' ');
  return body ? indent + body : null;
}

/**
 * Location details for a parser-owned DESCRIPTION line. The offsets are
 * character indices in the original line and let editor commands place the
 * cursor without searching for the value text again.
 */
export interface DescriptionLineInfo {
  value: string;
  /** First character of the trimmed value, after any whitespace. */
  valueStart: number;
  /** End of the trimmed value, before trailing whitespace or an anchor. */
  valueEnd: number;
}

/**
 * Parse a DESCRIPTION: line exactly as TaskParser.getDescriptionText does:
 * only a quote marker in column zero starts the quoted branch, and all quote
 * markers are stripped before indentation is ignored. Returns null when the
 * line is not a description.
 */
export function parseDescriptionLineInfo(
  line: string,
): DescriptionLineInfo | null {
  const quotePrefix = line.startsWith('>')
    ? (line.match(/^(>\s*)+/)?.[0] ?? '')
    : '';
  const afterQuotes = line.slice(quotePrefix.length);
  const indentation = afterQuotes.match(/^\s*/)?.[0].length ?? 0;
  const prefixStart = quotePrefix.length + indentation;
  if (!line.slice(prefixStart).startsWith('DESCRIPTION:')) return null;

  const prefixEnd = prefixStart + 'DESCRIPTION:'.length;
  const rest = line.slice(prefixEnd);
  const valueStart = prefixEnd + (rest.match(/^\s*/)?.[0].length ?? 0);
  const value = splitTrailingBlockAnchor(rest).text.trim();
  return {
    value,
    valueStart,
    valueEnd: valueStart + value.length,
  };
}

/** Value of a parser-owned DESCRIPTION line, or null for any other line. */
export function parseDescriptionLine(line: string): string | null {
  return parseDescriptionLineInfo(line)?.value ?? null;
}

/**
 * Find a DESCRIPTION: line after a task line. Ownership mirrors
 * TaskParser.getDescriptionText; the search follows the task's metadata block
 * and stops at prose, a heading or the next task.
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
  keywordManager?: KeywordManager,
): number {
  return findDescriptionLineInSource(
    { lineCount: () => lines.length, getLine: (line) => lines[line] },
    startIndex,
    taskIndent,
    keywordManager,
  );
}

/**
 * Find a parser-owned DESCRIPTION line through a line source. This lets the
 * editor read only the task's metadata block instead of materialising the rest
 * of the note before the same bounded scan runs.
 */
export function findDescriptionLineInSource(
  source: DescriptionLineSource,
  startIndex: number,
  taskIndent: string,
  keywordManager?: KeywordManager,
): number {
  const lineCount = source.lineCount();
  const keywords = keywordManager?.getAllKeywords() ?? [];
  const isBoundary = (line: string): boolean => {
    const withoutQuote = line.replace(/^\s*(?:>\s*)+/, '');
    // A callout is only a parser prefix immediately after one quote marker.
    // `> > [!note] …` is quoted content, not a callout task.
    const hasCalloutPrefix = /^\s*>\s*\[![^\]]+\]-?\s+/.test(line);
    const withoutCallout = hasCalloutPrefix
      ? withoutQuote.replace(/^\s*\[![^\]]+\]-?\s+/, '')
      : withoutQuote;
    // Strip the parser's optional heading, list and checkbox prefixes so
    // numbered, letter and custom-list tasks are recognised just like bullet
    // tasks. A keyword followed immediately by ':' is drawer metadata, not a
    // task line; the parser accepts it as drawer content.
    // Heading syntax is column-zero-only for the parser; a quoted or callout
    // line that happens to contain `# TODO` is not a heading task.
    const hasHeadingPrefix = /^#{1,6}\s+/.test(line);
    const withoutHeading = hasHeadingPrefix
      ? withoutCallout.replace(/^#{1,6}\s+/, '')
      : withoutCallout;
    const listMarker = /^\s*(?:[-*+]|\d+[.)]|[A-Za-z][.)]|\([A-Za-z0-9]+\))\s+/;
    const hadList = listMarker.test(withoutHeading);
    const withoutList = hadList
      ? withoutHeading.replace(listMarker, '')
      : withoutHeading;
    const checkboxMarker = /^\s*\[[ xX\-/]\]\s+/;
    const hadCheckbox = checkboxMarker.test(withoutList);
    const taskCandidate = hadCheckbox
      ? withoutList.replace(checkboxMarker, '')
      : withoutList;
    const isMetadataLike = /^\s*[^:\s]+:/.test(taskCandidate);
    // The parser accepts at most one list marker, followed only by an optional
    // checkbox and the keyword. Quote/heading syntax left after that point is
    // prose, not a second task prefix.
    const hasResidualTaskPrefix =
      listMarker.test(withoutList) ||
      listMarker.test(taskCandidate) ||
      /^\s*>/.test(taskCandidate) ||
      /^#{1,6}\s+/.test(taskCandidate);
    // A non-heading task needs whitespace after its keyword. Heading tasks may
    // end at the keyword, but only when they have no list/checkbox prefix.
    const allowKeywordAtEnd = hasHeadingPrefix && !hadList && !hadCheckbox;
    const keywordContent = taskCandidate.replace(/^\s*/, '');
    // TaskParser's keyword regex is case-sensitive; lowercase `todo` is prose.
    const hasKeywordPrefix = keywords.some((keyword) => {
      if (!keywordContent.startsWith(keyword)) return false;
      const next = keywordContent.charAt(keyword.length);
      return next === '' ? allowKeywordAtEnd : /\s/.test(next);
    });
    return (
      CHECKBOX_DETECTION_REGEX.test(line) ||
      (hasKeywordPrefix && !isMetadataLike && !hasResidualTaskPrefix)
    );
  };

  for (let i = startIndex; i < lineCount; i++) {
    const line = source.getLine(i);
    if (line.trim() === '') continue;

    if (isOwnedPropertiesDrawerStart(line, taskIndent)) {
      const drawerEnd = drawerEndAt(source, i, 'markdown', isBoundary);
      if (drawerEnd < 0) return -1;
      i = drawerEnd;
      continue;
    }

    if (parseDescriptionLineInfo(line) !== null) return i;

    if (
      isOwnedDateLine(line, 'SCHEDULED:', taskIndent) ||
      isOwnedDateLine(line, 'DEADLINE:', taskIndent) ||
      isOwnedDateLine(line, 'CLOSED:', taskIndent) ||
      isOwnedDateLine(line, 'STARTED:', taskIndent)
    ) {
      continue;
    }

    return -1;
  }

  return -1;
}

/**
 * Whether a Markdown properties drawer starts on this line for this task.
 * Mirrors TaskParser's drawer ownership: quoted drawers must share the task's
 * quote prefix, and indentation must reach the task's indentation.
 */
function isOwnedPropertiesDrawerStart(
  line: string,
  taskIndent: string,
): boolean {
  const parts = line.match(/^([ \t]*)((?:>[ \t]*)*)(.*)$/);
  if (!parts) return false;
  const lineIndent = parts[1] ?? '';
  const lineQuotePrefix = parts[2] ?? '';
  if ((parts[3] ?? '').trim() !== ':PROPERTIES:') return false;

  const taskQuotePrefix = taskIndent.match(/(?:>[ \t]*)+/)?.[0] ?? '';
  if (taskQuotePrefix && !lineQuotePrefix.startsWith(taskQuotePrefix)) {
    return false;
  }
  if (!taskQuotePrefix && lineQuotePrefix.trim() !== '') return false;

  const taskWhitespace = taskQuotePrefix
    ? taskIndent.slice(0, taskIndent.indexOf(taskQuotePrefix))
    : taskIndent;
  const taskIndentLength = /^#{1,6}\s+$/.test(taskIndent)
    ? 0
    : getIndentLength(taskWhitespace);
  return getIndentLength(lineIndent) >= taskIndentLength;
}

/**
 * Parser-exact date-line ownership (TaskParser.getDateLineType): a line that
 * starts with '>' owns exactly one quote marker, whatever the task's own quote
 * level or indentation; an unquoted date line must be indented at least as far
 * as the task (headings use column 0). Matching this exactly keeps the writer
 * on the line the parser read instead of inserting a duplicate or editing body
 * text.
 */
function isOwnedDateLine(
  line: string,
  keyword: string,
  taskIndent: string,
): boolean {
  if (line.startsWith('>')) {
    return line.trim().substring(1).trim().startsWith(keyword);
  }

  const trimmed = line.trimStart();
  if (!trimmed.startsWith(keyword)) return false;
  const isHeadingIndent = /^#{1,6}\s+$/.test(taskIndent);
  const taskIndentLength = isHeadingIndent ? 0 : getIndentLength(taskIndent);
  const lineIndent = line.substring(0, line.length - trimmed.length);
  return getIndentLength(lineIndent) >= taskIndentLength;
}

/**
 * Get the proper indent for date lines under a task.
 * Uses the position of the task state keyword in the raw text to determine indent.
 *
 * @param task - The task object
 * @returns The proper indent string for date lines
 */
export function getTaskIndent(task: Task): string {
  if (task.sourceFormat === 'org') {
    // Org tasks store the heading stars in `indent`; metadata belongs on a
    // whitespace-indented line below the headline, never on a new headline.
    return ' '.repeat((task.indent?.length ?? 0) + 1);
  }

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
  if (task.sourceFormat === 'org') {
    return getTaskIndent(task);
  }
  if (task.sourceFormat === 'code-comment') {
    // Metadata is not supported in code comments; callers that still ask get
    // the comment prefix rather than inventing executable syntax.
    return task.indent ?? '';
  }

  // Extract quote prefix (e.g., "> ", "> > ") if present
  const quotePrefix = task.rawText.match(/^(\s*(>\s*)+)/)?.[1] ?? '';

  // For quoted tasks, preserve the quote prefix without adding extra spaces
  if (quotePrefix && quotePrefix.trim().length > 0) {
    return quotePrefix;
  }

  // For heading tasks, no indent - metadata goes on its own line
  if (task.headingLevel && task.headingLevel > 0) {
    return '';
  }

  // Check if task has a list marker (bullet, checkbox, numbered, etc.)
  const hasListMarker = /^\s*[-*]\s|^\s*\d+[.)]\s|^\s*[a-zA-Z][.)]\s/i.test(
    task.rawText,
  );

  // For tasks with list markers, add 2 spaces to the leading whitespace
  // For keyword-only tasks, use the same indent as the task
  return hasListMarker ? task.indent + '  ' : task.indent;
}

/**
 * Whether a task's source format can carry TODOseq metadata lines
 * (SCHEDULED/DEADLINE/CLOSED/STARTED/DESCRIPTION). Code comments cannot:
 * inserting bare metadata there changes executable source.
 */
export function supportsTaskMetadata(task: Task): boolean {
  return task.sourceFormat !== 'code-comment';
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
  // Scan for delimiters instead of splitting: a backslash escapes the next
  // character, so `a\|b` is one displayed cell even though it contains a pipe.
  const delimiters: number[] = [];
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '\\') {
      i++;
      continue;
    }
    if (line[i] === '|') delimiters.push(i);
  }
  if (delimiters.length === 0) return [];

  const cells: TableCellInfo[] = [];
  const push = (cellStart: number, cellEnd: number): void => {
    const raw = line.slice(cellStart, cellEnd);
    cells.push({ raw, content: raw.trim(), start: cellStart, end: cellEnd });
  };
  push(0, delimiters[0]);
  for (let i = 0; i < delimiters.length - 1; i++) {
    push(delimiters[i] + 1, delimiters[i + 1]);
  }
  push(delimiters[delimiters.length - 1] + 1, line.length);

  // The empty text outside the outer pipes is not a cell (leading indentation
  // and trailing whitespace keep their existing meaning).
  let first = 0;
  let last = cells.length;
  if (cells[first].content === '') first++;
  if (last > first && cells[last - 1].content === '') last--;
  return cells.slice(first, last);
}

/**
 * Replace one cell's content, preserving every byte outside that cell.
 * Returns null when the row has no cell at that index.
 */
export function replaceTableCellContent(
  line: string,
  cellIndex: number,
  newContent: string,
): string | null {
  const cell = parseTableCells(line)[cellIndex];
  if (!cell) return null;
  return line.slice(0, cell.start) + ` ${newContent} ` + line.slice(cell.end);
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

/**
 * Get the cell index of a table cell element within its row.
 * Uses a consistent selector that works for both reader view (td elements)
 * and live preview/editor view (.table-cell-wrapper elements).
 * @param element The table cell element (td or .table-cell-wrapper)
 * @returns The cell index (0-based), or 0 if the element is not in a table
 */
export function getTableCellIndex(element: HTMLElement): number {
  // First, find the parent <tr> element
  let row: HTMLElement | null = element.closest('tr');

  // If no row found, try finding via td parent
  if (!row) {
    const parentTd = element.closest('td');
    if (parentTd) {
      row = parentTd.parentElement;
    }
  }

  if (!row) return 0;

  // Count td siblings to determine cell index
  const cells = Array.from(row.querySelectorAll<HTMLElement>('td'));

  for (let i = 0; i < cells.length; i++) {
    // Check if the element is inside this td or if the element itself is the td
    if (cells[i] === element || cells[i].contains(element)) {
      return i;
    }
  }

  return 0;
}
