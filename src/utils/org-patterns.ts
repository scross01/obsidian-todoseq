/**
 * Org-mode regex patterns for task parsing.
 * Provides patterns for parsing org-mode task syntax.
 */

import { RegexCache } from './regex-cache';

// ============================================================================
// Org-Mode Headline Patterns
// ============================================================================

/**
 * Build org-mode headline regex with dynamic keywords.
 * Uses buildTaskKeywords() to include custom keywords from settings.
 *
 * @param keywords Array of all task keywords from buildTaskKeywords()
 * @param regexCache Optional RegexCache instance for caching
 * @returns RegExp for matching org-mode headlines
 *
 * Capture groups:
 * 1: Asterisks (indentation level, e.g., "**" for level 2)
 * 2: TODO keyword (e.g., "TODO", "DONE")
 * 3: Rest of headline (priority + text)
 *
 * @example
 * ```typescript
 * const regex = buildOrgHeadlineRegex(['TODO', 'DONE', 'WAIT']);
 * const match = regex.exec('* TODO [#A] Task text');
 * // match[1] = '*', match[2] = 'TODO', match[3] = '[#A] Task text'
 * ```
 */
export function buildOrgHeadlineRegex(
  keywords: string[],
  regexCache?: RegexCache,
): RegExp {
  // Escape keywords for regex safety
  const escapedKeywords = keywords
    .map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|');

  const patternSource = `^(\\*+)\\s+(${escapedKeywords})\\s+(.*)$`;

  if (regexCache) {
    return regexCache.get(patternSource);
  }
  return new RegExp(patternSource);
}

/**
 * Build org-mode headline regex pattern source.
 * Useful for testing or when you need the pattern string.
 *
 * @param keywords Array of all task keywords
 * @returns Pattern source string
 */
export function buildOrgHeadlinePatternSource(keywords: string[]): string {
  const escapedKeywords = keywords
    .map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|');
  return `^(\\*+)\\s+(${escapedKeywords})\\s+(.*)$`;
}

// ============================================================================
// Priority Patterns
// ============================================================================

/**
 * Priority pattern in org-mode.
 * Matches: [#A], [#B], [#C] or #A, #B, #C
 *
 * Capture groups:
 * 1: Priority letter (A, B, or C)
 *
 * @example
 * ```typescript
 * const match = ORG_PRIORITY_PATTERN.exec('[#A] Task text');
 * // match[1] = 'A'
 * ```
 */
export const ORG_PRIORITY_PATTERN = /\[?#([ABC])\]?\s*/;

// ============================================================================
// Date Line Patterns
// ============================================================================

/**
 * Scheduled date line pattern.
 * Matches: SCHEDULED: <date> or SCHEDULED: [date]
 * Extracts the date content for use with DateParser.parseDate()
 *
 * Capture groups:
 * 1: Full date bracket content (e.g., "<2026-02-12 Thu>")
 *
 * @example
 * ```typescript
 * const match = ORG_SCHEDULED_LINE_PATTERN.exec('   SCHEDULED: <2026-02-12 Thu>');
 * // match[1] = '<2026-02-12 Thu>'
 * ```
 */
export const ORG_SCHEDULED_LINE_PATTERN = /^\s+SCHEDULED:\s*([<[].*[>\]])/;

/**
 * Deadline date line pattern.
 * Matches: DEADLINE: <date> or DEADLINE: [date]
 * Extracts the date content for use with DateParser.parseDate()
 *
 * Capture groups:
 * 1: Full date bracket content (e.g., "<2026-02-15 Sun>")
 *
 * @example
 * ```typescript
 * const match = ORG_DEADLINE_LINE_PATTERN.exec('   DEADLINE: <2026-02-15 Sun>');
 * // match[1] = '<2026-02-15 Sun>'
 * ```
 */
export const ORG_DEADLINE_LINE_PATTERN = /^\s+DEADLINE:\s*([<[].*[>\]])/;

// ============================================================================
// Properties Drawer Patterns
// ============================================================================

/**
 * Properties drawer start pattern.
 * Matches: :PROPERTIES:
 */
export const ORG_PROPERTIES_START = /^\s*:PROPERTIES:\s*$/;

/**
 * Properties drawer end pattern.
 * Matches: :END:
 */
export const ORG_PROPERTIES_END = /^\s*:END:\s*$/;

// ============================================================================
// CLOSED Timestamp Pattern
// ============================================================================

/**
 * CLOSED timestamp pattern.
 * Matches: CLOSED: [YYYY-MM-DD DOW HH:mm] or similar
 * Used to identify completed task timestamps.
 */
export const ORG_CLOSED_PATTERN =
  /^\s+CLOSED:\s*\[\d{4}-\d{2}-\d{2}(?:\s+\w+)?(?:\s+\d{2}:\d{2})?\]/;

// ============================================================================
// File Directive Pattern
// ============================================================================

/**
 * Org-mode file directive pattern.
 * Matches: #+TITLE:, #+AUTHOR:, #+OPTIONS:, etc.
 * Used to identify org-mode files.
 */
export const ORG_FILE_DIRECTIVE = /^#\+[A-Z]+:/;

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Extract priority from org-mode headline text.
 *
 * @param headlineText The text portion of a headline (after keyword)
 * @returns Object with priority and cleaned text
 *
 * @example
 * ```typescript
 * const result = extractOrgPriority('[#A] Task text');
 * // result.priority = 'high', result.cleanedText = 'Task text'
 * ```
 */
export function extractOrgPriority(headlineText: string): {
  priority: 'high' | 'med' | 'low' | null;
  cleanedText: string;
} {
  const match = ORG_PRIORITY_PATTERN.exec(headlineText);
  if (!match) {
    return { priority: null, cleanedText: headlineText.trim() };
  }

  const letter = match[1];
  let priority: 'high' | 'med' | 'low' | null = null;

  if (letter === 'A') {
    priority = 'high';
  } else if (letter === 'B') {
    priority = 'med';
  } else if (letter === 'C') {
    priority = 'low';
  }

  // Remove the priority token from the text
  const cleanedText = headlineText
    .slice(0, match.index)
    .concat(headlineText.slice(match.index + match[0].length))
    .trim();

  return { priority, cleanedText };
}

/**
 * Calculate nesting level from asterisks.
 *
 * @param asterisks The asterisk string from a headline (e.g., "***")
 * @returns Nesting level (1 for "*", 2 for "**", etc.)
 */
export function getNestingLevel(asterisks: string): number {
  return asterisks.length;
}

/**
 * Check if a line is inside a properties drawer.
 * Used to skip date extraction inside property blocks.
 *
 * @param lines All lines in the file
 * @param lineIndex Index of the line to check
 * @returns true if the line is inside a properties drawer
 */
export function isInPropertiesDrawer(
  lines: string[],
  lineIndex: number,
): boolean {
  // Look backwards for :PROPERTIES: without a closing :END:
  for (let i = lineIndex - 1; i >= 0; i--) {
    const line = lines[i];

    if (ORG_PROPERTIES_END.test(line)) {
      // Found :END: before :PROPERTIES:, not in drawer
      return false;
    }

    if (ORG_PROPERTIES_START.test(line)) {
      // Found :PROPERTIES: without :END:, inside drawer
      return true;
    }

    // Stop at next headline (line starting with *)
    if (/^\*/.test(line)) {
      return false;
    }
  }

  return false;
}
