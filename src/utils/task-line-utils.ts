/**
 * Task line utility functions for handling date line detection and task indent calculation.
 * Provides shared logic used across multiple services to avoid code duplication.
 */

/**
 * Find a date line of specified type after a task line.
 * Uses regex-based detection consistent with parser's getDateLineType logic.
 *
 * @param lines - Array of lines to search
 * @param startIndex - Starting line index (typically task.line + 1)
 * @param dateType - Type of date to find ('SCHEDULED', 'DEADLINE', or 'CLOSED')
 * @param taskIndent - The task's indent level (for proper nesting detection)
 * @returns Line index of found date line, or -1 if not found
 *
 * @example
 * findDateLine(lines, 5, 'SCHEDULED', '  ')
 * // Returns: 7 if SCHEDULED line found at index 7, -1 otherwise
 */
export function findDateLine(
  lines: string[],
  startIndex: number,
  dateType: 'SCHEDULED' | 'DEADLINE' | 'CLOSED',
  taskIndent: string,
): number {
  // Search limited to 8 lines after task (max nesting depth)
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
        // Verify indent matches (or is nested under task indent)
        const lineIndent = line.substring(0, line.length - trimmedLine.length);
        if (lineIndent === taskIndent || lineIndent.startsWith(taskIndent)) {
          return i;
        }
      }
    }

    // For regular lines, check if trimmed line starts with keyword
    if (trimmedLine.startsWith(keyword)) {
      // Verify indent matches (or is nested under task indent)
      const lineIndent = line.substring(0, line.length - trimmedLine.length);
      if (lineIndent === taskIndent || lineIndent.startsWith(taskIndent)) {
        return i;
      }
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

      if (effectiveLineIndent.length <= effectiveTaskIndent.length) {
        break;
      }
    }
  }

  return -1;
}

/**
 * Get the proper indent for date lines under a task.
 * Handles quote prefix, checkbox, bullet, and plain tasks.
 *
 * @param line - The task line
 * @returns The proper indent string for date lines
 *
 * @example
 * getTaskIndent('  - [ ] TODO task')
 * // Returns: '    ' (leading whitespace + 2 spaces)
 *
 * @example
 * getTaskIndent('> TODO task')
 * // Returns: '> '
 *
 * @example
 * getTaskIndent('  TODO task')
 * // Returns: '  '
 */
export function getTaskIndent(line: string): string {
  // Check for quote block tasks: > TODO task or > > TODO task
  const quotePrefixMatch = line.match(/^(\s*)(>\s*)+/);
  if (quotePrefixMatch) {
    return quotePrefixMatch[0];
  }

  // Check for checkbox tasks: - [ ] TODO task
  const checkboxMatch = line.match(/^(\s*)- \[([ xX])\] /);
  if (checkboxMatch) {
    return checkboxMatch[1] + '  ';
  }

  // Check for bulleted tasks: - TODO task or + TODO task or * TODO task
  const bulletMatch = line.match(/^(\s*)([-*+])\s+(.*)/);
  if (bulletMatch) {
    return bulletMatch[1] + '  ';
  }

  // Regular task: just use whitespace indent
  return line.match(/^(\s*)/)?.[1] ?? '';
}
