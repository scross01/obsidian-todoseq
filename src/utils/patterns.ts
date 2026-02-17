/**
 * Centralized regex patterns for task parsing.
 * This module provides a single source of truth for all regex patterns
 * used across the plugin to ensure consistency.
 */

// ============================================================================
// List Marker Patterns
// ============================================================================

/**
 * Bullet points: matches -, *, or + characters followed by whitespace
 * Example: "- ", "* ", "+ "
 */
export const BULLET_LIST_PATTERN = /[-*+]\s+/;
export const BULLET_LIST_PATTERN_SOURCE = BULLET_LIST_PATTERN.source;

/**
 * Numbered lists: matches digits followed by . or ) and whitespace
 * Example: "1. ", "2) ", "12. "
 */
export const NUMBERED_LIST_PATTERN = /\d+[.)]\s+/;
export const NUMBERED_LIST_PATTERN_SOURCE = NUMBERED_LIST_PATTERN.source;

/**
 * Letter lists: matches letters followed by . or ) and whitespace
 * Example: "a. ", "B) "
 */
export const LETTER_LIST_PATTERN = /[A-Za-z][.)]\s+/;
export const LETTER_LIST_PATTERN_SOURCE = LETTER_LIST_PATTERN.source;

/**
 * Custom lists: matches parentheses-enclosed alphanumeric identifiers
 * Example: "(A1) ", "(A2) "
 */
export const CUSTOM_LIST_PATTERN = /\([A-Za-z0-9]+\)\s+/;
export const CUSTOM_LIST_PATTERN_SOURCE = CUSTOM_LIST_PATTERN.source;

// ============================================================================
// Checkbox Patterns
// ============================================================================

/**
 * Checkbox pattern for task parsing (source version for composition)
 * Matches: [ ] (unchecked), [x] (checked) or [*] (other checkbox states)
 */
export const CHECKBOX_PATTERN = /\[[ x\S]\]\s+/;
export const CHECKBOX_PATTERN_SOURCE = CHECKBOX_PATTERN.source;

/**
 * Checkbox regex for detecting markdown checkbox tasks with capture groups.
 * Matches: - [ ], - [x], * [ ], * [x], + [ ], + [x]
 *
 * Capture groups:
 * 1: Leading whitespace
 * 2: Full checkbox marker (e.g., "- [x]")
 * 3: Checkbox status (" " or "x")
 * 4: First word after checkbox
 * 5: Rest of the text
 */
export const CHECKBOX_REGEX =
  /^(\s*)([-*+]\s*\[(\s|x)\]\s*)\s+([^\s]+)\s+(.+)$/;

/**
 * Simple checkbox detection regex (without capture groups for state)
 * Matches: - [ ], - [x], etc.
 */
export const CHECKBOX_DETECTION_REGEX = /^(-|\*|\+)\s+\[[ x]\]\s*/;

// ============================================================================
// Prefix Patterns
// ============================================================================

/**
 * Leading whitespace only
 */
export const STANDARD_PREFIX_PATTERN = /\s*/;
export const STANDARD_PREFIX_SOURCE = STANDARD_PREFIX_PATTERN.source;

/**
 * Quoted lines with leading ">"
 * Example: "> ", ">  ", "> > ", "> > > "
 */
export const QUOTED_PREFIX_PATTERN = /\s*(?:>\s*)+/;
export const QUOTED_PREFIX_SOURCE = QUOTED_PREFIX_PATTERN.source;

/**
 * Callout block declaration
 * Example: "> [!info] ", "> [!warning]- "
 */
export const CALLOUT_PREFIX_PATTERN = /\s*>\s*\[!\w+\]-?\s+/;
export const CALLOUT_PREFIX_SOURCE = CALLOUT_PREFIX_PATTERN.source;

// ============================================================================
// Block Patterns
// ============================================================================

/**
 * Code block marker ``` or ~~~ with optional language
 * Example: "```", "```javascript", "~~~python"
 */
export const CODE_BLOCK_REGEX = /^\s*(```|~~~)\s*(\S+)?$/;

/**
 * Math block marker $$
 * Ignores open and close on same line
 */
export const MATH_BLOCK_REGEX = /^\s*\$\$(?!.*\$\$).*/;

/**
 * Comment block marker %%
 * Matches both single-line (%% ... %%) and multi-line start
 */
export const COMMENT_BLOCK_REGEX = /^\s*%%.*%%$|^\s*%%(?!.*%%).*/;
export const COMMENT_BLOCK_SOURCE = COMMENT_BLOCK_REGEX.source;

/**
 * Single-line comment pattern
 * Example: "%% TODO task %%"
 */
export const SINGLE_LINE_COMMENT_REGEX = /^\s*%%.*%%$/;
export const SINGLE_LINE_COMMENT_SOURCE = SINGLE_LINE_COMMENT_REGEX.source;

/**
 * Callout block marker (lines starting with >)
 */
export const CALLOUT_BLOCK_REGEX = /^\s*>.*/;
export const CALLOUT_BLOCK_SOURCE = CALLOUT_BLOCK_REGEX.source;

/**
 * Footnote definition marker
 * Example: "[^1]: ", "[^10]: "
 */
export const FOOTNOTE_DEFINITION_REGEX = /^\[\^\d+\]:\s*/;
export const FOOTNOTE_DEFINITION_SOURCE = FOOTNOTE_DEFINITION_REGEX.source;

// ============================================================================
// Task Content Patterns
// ============================================================================

/**
 * Task text pattern: at least one non-whitespace character, then any characters
 */
export const TASK_TEXT_PATTERN = /[\S][\s\S]*?/;
export const TASK_TEXT_SOURCE = TASK_TEXT_PATTERN.source;

/**
 * Code prefix pattern for language-aware parsing
 * Non-greedy match for content before comment
 */
export const CODE_PREFIX_PATTERN = /\s*[\s\S]*?/;
export const CODE_PREFIX_SOURCE = CODE_PREFIX_PATTERN.source;

/**
 * Priority token regex pattern for extracting priority from task text
 * Matches patterns like: [#A], [#B], [#C]
 *
 * Capture groups:
 * 1: Leading whitespace
 * 2: Priority letter (A, B, or C)
 * 3: Trailing whitespace
 */
export const PRIORITY_TOKEN_REGEX = /(\s*)\[#([ABC])\](\s*)/;

// ============================================================================
// List Detection Patterns (for editor operations)
// ============================================================================

/**
 * Bullet list detection with capture
 * Example: "- task", "* task", "+ task"
 *
 * Capture groups:
 * 1: Bullet character (-, *, +)
 * 2: Rest of the line
 */
export const BULLET_MATCH_REGEX = /^([-*+])\s*(.*)$/;

/**
 * Numbered list detection with capture
 * Example: "1. task", "2) task"
 *
 * Capture groups:
 * 1: Number and delimiter (e.g., "1.", "2)")
 * 2: Rest of the line
 */
export const NUMBERED_MATCH_REGEX = /^(\d+[.)])\s*(.*)$/;

/**
 * Letter list detection with capture
 * Example: "a. task", "B) task"
 *
 * Capture groups:
 * 1: Letter and delimiter (e.g., "a.", "B)")
 * 2: Rest of the line
 */
export const LETTER_MATCH_REGEX = /^([A-Za-z][.)])\s*(.*)$/;

/**
 * Quote line detection
 * Example: "> task"
 */
export const QUOTE_LINE_REGEX = /^>\s*(.*)$/;

// ============================================================================
// Tag Patterns
// ============================================================================

/**
 * Tag pattern for matching valid Obsidian tags
 * Matches: #tag, #context/home, #multi-word-tag, #emoji🎯
 * Supports: alphanumeric (including multibyte/emoji), /, -, _
 * Excludes: URL anchors (via negative lookbehind)
 */
export const TAG_PATTERN = /(?<![\w/:?#[\]])#([^\s)\]}>]+)/gu;
export const TAG_PATTERN_SOURCE = TAG_PATTERN.source;

// ============================================================================
// Task Keyword Patterns
// ============================================================================

/**
 * Escape keywords for use in regex patterns
 * @param keywords Array of keywords to escape
 * @returns Escaped keywords joined with OR operator
 */
export function escapeKeywordsForRegex(keywords: string[]): string {
  return keywords
    .map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|');
}

/**
 * Build a task keyword pattern from an array of keywords
 * @param keywords Array of task keywords (e.g., ['TODO', 'DOING', 'DONE'])
 * @returns Regex pattern string that matches any of the keywords
 */
export function buildTaskKeywordPattern(keywords: string[]): string {
  if (keywords.length === 0) {
    // Return a pattern that never matches if no keywords
    return '(?!x)x';
  }
  return `(${escapeKeywordsForRegex(keywords)})`;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Detect the type of list marker in a line
 * @param line The line to check
 * @returns Object with marker type and captured groups, or null if no marker found
 */
export function detectListMarker(line: string): {
  type: 'bullet' | 'numbered' | 'letter' | 'checkbox' | 'quote' | 'none';
  indent: string;
  marker: string;
  text: string;
} {
  const trimmed = line.trim();
  const indentMatch = line.match(/^(\s*)/);
  const indent = indentMatch ? indentMatch[1] : '';

  // Check for checkbox first (most specific)
  const checkboxMatch = trimmed.match(CHECKBOX_DETECTION_REGEX);
  if (checkboxMatch) {
    const text = trimmed.substring(checkboxMatch[0].length);
    return {
      type: 'checkbox',
      indent,
      marker: checkboxMatch[0].trimEnd() + ' ',
      text,
    };
  }

  // Check for bullet list
  const bulletMatch = trimmed.match(BULLET_MATCH_REGEX);
  if (bulletMatch) {
    return {
      type: 'bullet',
      indent,
      marker: bulletMatch[1] + ' ',
      text: bulletMatch[2],
    };
  }

  // Check for numbered list
  const numberedMatch = trimmed.match(NUMBERED_MATCH_REGEX);
  if (numberedMatch) {
    return {
      type: 'numbered',
      indent,
      marker: numberedMatch[1] + ' ',
      text: numberedMatch[2],
    };
  }

  // Check for letter list
  const letterMatch = trimmed.match(LETTER_MATCH_REGEX);
  if (letterMatch) {
    return {
      type: 'letter',
      indent,
      marker: letterMatch[1] + ' ',
      text: letterMatch[2],
    };
  }

  // Check for quote line
  if (trimmed.startsWith('>')) {
    const text = trimmed.substring(1).trim();
    return {
      type: 'quote',
      indent,
      marker: '> ',
      text,
    };
  }

  return {
    type: 'none',
    indent,
    marker: '',
    text: trimmed,
  };
}
