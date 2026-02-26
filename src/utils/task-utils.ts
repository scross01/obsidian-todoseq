import { KeywordGroup, Task } from '../types/task';
import { KeywordManager } from './keyword-manager';
import {
  BUILTIN_ACTIVE_KEYWORDS,
  BUILTIN_INACTIVE_KEYWORDS,
  BUILTIN_WAITING_KEYWORDS,
  BUILTIN_COMPLETED_KEYWORDS,
  BUILTIN_ARCHIVED_KEYWORDS,
} from './constants';

type KeywordGroupValidationInput = {
  activeKeywords?: string[];
  inactiveKeywords?: string[];
  waitingKeywords?: string[];
  completedKeywords?: string[];
  archivedKeywords?: string[];
};

type KeywordSettings = {
  additionalInactiveKeywords?: string[];
  additionalActiveKeywords?: string[];
  additionalWaitingKeywords?: string[];
  additionalCompletedKeywords?: string[];
  additionalArchivedKeywords?: string[];
};

/**
 * Result of building the task keyword list
 */
export interface TaskKeywordResult {
  /** All unique keywords (pending + active + completed + additional) */
  allKeywords: string[];
  /** Non-completed keywords (pending + active + additional) */
  nonCompletedKeywords: string[];
  /** Normalized additional keywords from settings */
  normalizedAdditional: string[];
}

/**
 * Build the complete list of task keywords from settings
 * Combines default pending/active/completed states with user-defined additional keywords
 * @param additionalTaskKeywords Array of additional keywords from settings
 * @returns TaskKeywordResult containing all keyword arrays
 * @deprecated Use buildKeywordsFromGroups() instead, which supports all four keyword groups
 */
export function buildTaskKeywords(
  additionalTaskKeywords: unknown[],
): TaskKeywordResult {
  // Normalize additional keywords: ensure strings, trim, filter empties
  const normalizedAdditional: string[] = Array.isArray(additionalTaskKeywords)
    ? (additionalTaskKeywords as string[])
        .filter((k): k is string => typeof k === 'string')
        .map((k) => k.trim())
        .filter((k) => k.length > 0)
    : [];

  // Build non-completed keywords using new constants
  // Note: DEFAULT_PENDING_STATES includes both inactive and waiting keywords for backward compatibility
  const nonCompletedKeywords: string[] = [
    ...BUILTIN_INACTIVE_KEYWORDS,
    ...BUILTIN_ACTIVE_KEYWORDS,
    ...BUILTIN_WAITING_KEYWORDS,
    ...normalizedAdditional,
  ];

  // Build all keywords (non-completed + completed)
  const allKeywords: string[] = [
    ...nonCompletedKeywords,
    ...BUILTIN_COMPLETED_KEYWORDS,
  ];

  return {
    allKeywords: Array.from(new Set(allKeywords)),
    nonCompletedKeywords: Array.from(new Set(nonCompletedKeywords)),
    normalizedAdditional,
  };
}

/**
 * Get all keywords for a specific group (built-in + custom)
 * @param group The keyword group to get keywords for
 * @param settings Settings object containing flat keyword properties
 * @returns Array of all keywords for the group (built-in + custom)
 */
export function getKeywordsForGroup(
  group: KeywordGroup,
  settings: KeywordSettings,
): string[] {
  const keywordManager = new KeywordManager(settings);
  return keywordManager.getKeywordsForGroup(group);
}

/**
 * Get all keywords across all groups
 * @param settings Settings object containing taskKeywordGroups
 * @returns Array of all unique keywords across all groups
 */
export function getAllKeywords(settings: KeywordSettings): string[] {
  const allKeywords = [
    ...getKeywordsForGroup('activeKeywords', settings),
    ...getKeywordsForGroup('inactiveKeywords', settings),
    ...getKeywordsForGroup('waitingKeywords', settings),
    ...getKeywordsForGroup('completedKeywords', settings),
    ...getKeywordsForGroup('archivedKeywords', settings),
  ];

  // Remove duplicates while preserving order
  return Array.from(new Set(allKeywords));
}

/**
 * Determine which group a keyword belongs to
 * @param keyword The keyword to look up
 * @param settings Settings object containing taskKeywordGroups
 * @returns The group name if found, null if keyword is not in any group
 */
export function getKeywordGroup(
  keyword: string,
  settings: KeywordSettings,
): KeywordGroup | 'inactiveKeywords' | null {
  // Check inactive keywords first (from additionalTaskKeywords)
  const inactiveKeywords = getKeywordsForGroup('inactiveKeywords', settings);
  if (inactiveKeywords.includes(keyword)) {
    return 'inactiveKeywords';
  }

  // Check other groups
  const groups: KeywordGroup[] = [
    'activeKeywords',
    'waitingKeywords',
    'completedKeywords',
    'archivedKeywords',
  ];

  for (const group of groups) {
    const keywords = getKeywordsForGroup(group, settings);
    if (keywords.includes(keyword)) {
      return group;
    }
  }

  return null;
}

/**
 * Check if a keyword is a built-in keyword
 * @param keyword The keyword to check
 * @returns True if the keyword is a built-in keyword
 */
export function isBuiltinKeyword(keyword: string): boolean {
  return (
    BUILTIN_ACTIVE_KEYWORDS.includes(
      keyword as (typeof BUILTIN_ACTIVE_KEYWORDS)[number],
    ) ||
    BUILTIN_INACTIVE_KEYWORDS.includes(
      keyword as (typeof BUILTIN_INACTIVE_KEYWORDS)[number],
    ) ||
    BUILTIN_WAITING_KEYWORDS.includes(
      keyword as (typeof BUILTIN_WAITING_KEYWORDS)[number],
    ) ||
    BUILTIN_COMPLETED_KEYWORDS.includes(
      keyword as (typeof BUILTIN_COMPLETED_KEYWORDS)[number],
    ) ||
    BUILTIN_ARCHIVED_KEYWORDS.includes(
      keyword as (typeof BUILTIN_ARCHIVED_KEYWORDS)[number],
    )
  );
}

/**
 * Checks if any keyword appears in multiple groups
 * @param groups The keyword groups to validate (with flat properties)
 * @returns Array of duplicate keywords found (empty if no duplicates)
 */
export function validateKeywordGroups(groups: {
  activeKeywords?: string[];
  inactiveKeywords?: string[];
  waitingKeywords?: string[];
  completedKeywords?: string[];
  archivedKeywords?: string[];
}): string[] {
  return Array.from(
    new Set(
      validateKeywordGroupsDetailed(groups).errors.map(
        (issue) => issue.keyword,
      ),
    ),
  );
}

/**
 * Detailed validation result for settings UI.
 */
export function validateKeywordGroupsDetailed(
  groups: KeywordGroupValidationInput,
) {
  const keywordManager = new KeywordManager({
    additionalActiveKeywords: groups.activeKeywords ?? [],
    additionalInactiveKeywords: groups.inactiveKeywords ?? [],
    additionalWaitingKeywords: groups.waitingKeywords ?? [],
    additionalCompletedKeywords: groups.completedKeywords ?? [],
    additionalArchivedKeywords: groups.archivedKeywords ?? [],
  });

  return keywordManager.getValidationResult();
}

/**
 * Result of building keywords from taskKeywordGroups setting
 */
export interface TaskKeywordGroupsResult {
  /** All unique keywords across all groups */
  allKeywords: string[];
  /** Keywords that indicate a task is completed */
  completedKeywords: string[];
  /** Keywords that indicate a task is active (being worked on) */
  activeKeywords: string[];
  /** Keywords that indicate a task is inactive/pending */
  inactiveKeywords: string[];
  /** Keywords that indicate a task is waiting/blocked */
  waitingKeywords: string[];
  /** Keywords that indicate a task is archived (styled but not collected) */
  archivedKeywords: string[];
}

/**
 * Build keyword lists from taskKeywordGroups setting
 * Combines built-in keywords with custom keywords from settings
 * @param settings Settings object containing taskKeywordGroups
 * @returns TaskKeywordGroupsResult with all keyword arrays
 */
export function buildKeywordsFromGroups(
  settings: KeywordSettings,
): TaskKeywordGroupsResult {
  const activeKeywords = getKeywordsForGroup('activeKeywords', settings);
  const inactiveKeywords = getKeywordsForGroup('inactiveKeywords', settings);
  const waitingKeywords = getKeywordsForGroup('waitingKeywords', settings);
  const completedKeywords = getKeywordsForGroup('completedKeywords', settings);
  const archivedKeywords = getKeywordsForGroup('archivedKeywords', settings);

  // Build all keywords, removing duplicates while preserving order
  const allKeywords = Array.from(
    new Set([
      ...activeKeywords,
      ...inactiveKeywords,
      ...waitingKeywords,
      ...completedKeywords,
      ...archivedKeywords,
    ]),
  );

  return {
    allKeywords,
    completedKeywords,
    activeKeywords,
    inactiveKeywords,
    waitingKeywords,
    archivedKeywords,
  };
}

/**
 * Determine if a keyword indicates a completed task
 * @param keyword The task state keyword
 * @param settings Settings object containing taskKeywordGroups
 * @returns True if the keyword is in the completed group
 */
export function isCompletedKeyword(
  keyword: string,
  settings: KeywordSettings,
): boolean {
  const completedKeywords = getKeywordsForGroup('completedKeywords', settings);
  return completedKeywords.includes(keyword);
}

/**
 * Determine if a keyword indicates an archived task
 * Archived tasks are styled but NOT collected during vault scans
 * @param keyword The task state keyword
 * @param settings Settings object containing taskKeywordGroups
 * @returns True if the keyword is in the archived group
 */
export function isArchivedKeyword(
  keyword: string,
  settings: KeywordSettings,
): boolean {
  const archivedKeywords = getKeywordsForGroup('archivedKeywords', settings);
  return archivedKeywords.includes(keyword);
}

/**
 * Determine if a keyword indicates an active task
 * @param keyword The task state keyword
 * @param settings Settings object containing taskKeywordGroups
 * @returns True if the keyword is in the active group
 */
export function isActiveKeyword(
  keyword: string,
  settings: KeywordSettings,
): boolean {
  const activeKeywords = getKeywordsForGroup('activeKeywords', settings);
  return activeKeywords.includes(keyword);
}

/**
 * Determine if a keyword indicates a waiting task
 * @param keyword The task state keyword
 * @param settings Settings object containing taskKeywordGroups
 * @returns True if the keyword is in the waiting group
 */
export function isWaitingKeyword(
  keyword: string,
  settings: KeywordSettings,
): boolean {
  const waitingKeywords = getKeywordsForGroup('waitingKeywords', settings);
  return waitingKeywords.includes(keyword);
}

/**
 * Determine if a keyword indicates an inactive/pending task
 * @param keyword The task state keyword
 * @param settings Settings object containing taskKeywordGroups
 * @returns True if the keyword is in the inactive group
 */
export function isInactiveKeyword(
  keyword: string,
  settings: KeywordSettings,
): boolean {
  const inactiveKeywords = getKeywordsForGroup('inactiveKeywords', settings);
  return inactiveKeywords.includes(keyword);
}

/**
 * Extract filename from a task path
 * @param path The full file path
 * @returns The filename without directory components
 */
export function getFilename(path: string): string {
  const lastSlash = path.lastIndexOf('/');
  return lastSlash >= 0 ? path.slice(lastSlash + 1) : path;
}

/**
 * Check if a state is a completed state
 * @param state The task state to check
 * @returns True if the state is considered completed
 */
export function isCompletedState(state: string): boolean {
  const completedStates = new Set(['DONE', 'CANCELED', 'CANCELLED']);
  return completedStates.has(state);
}

/**
 * Generate checkbox status character based on completion state
 * @param completed Whether the task is completed
 * @returns 'x' for completed, ' ' for not completed
 */
export function getCheckboxStatus(completed: boolean): string {
  return completed ? 'x' : ' ';
}

/**
 * Truncate a string in the middle with ellipsis
 * @param str The string to truncate
 * @param maxLength Maximum length of the result string
 * @returns Truncated string with '...' in middle if needed
 */
export function truncateMiddle(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;

  const ellipsis = '..';
  const availableChars = maxLength - ellipsis.length;
  const startChars = Math.ceil(availableChars / 2);
  const endChars = Math.floor(availableChars / 2);

  return (
    str.substring(0, startChars) +
    ellipsis +
    str.substring(str.length - endChars)
  );
}

/**
 * Lazy-computed stripMarkdown for task text display.
 * Computes on first access, then caches on the task object.
 * @param task The task to get display text for
 * @returns Markdown-stripped text for display
 */
export function getTaskTextDisplay(task: Task): string {
  // Return cached value if already computed
  if (task.textDisplay !== undefined) {
    return task.textDisplay;
  }

  // Compute and cache
  const textDisplay = stripMarkdownForDisplay(task.text);
  task.textDisplay = textDisplay;
  return textDisplay;
}

/**
 * Strip Markdown formatting to produce display-only plain text.
 * Used for task text display in views.
 * @param input The text to strip
 * @returns Plain text suitable for display
 */
export function stripMarkdownForDisplay(input: string): string {
  if (!input) return '';
  let out = input;

  // HTML tags - use DOMParser to safely strip HTML tags
  const doc = new DOMParser().parseFromString(out, 'text/html');
  out = doc.body.textContent || '';

  // Images: ![alt](url) -> alt
  out = out.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1');

  // Inline code: `code` -> code
  out = out.replace(/`([^`]+)`/g, '$1');

  // Headings
  out = out.replace(/^\s{0,3}#{1,6}\s+/gm, '');

  // Emphasis/strong
  out = out.replace(/(\*\*|__)(.*?)\1/g, '$2');
  out = out.replace(/(\*|_)(.*?)\1/g, '$2');

  // Strike/highlight/math
  out = out.replace(/~~(.*?)~~/g, '$1');
  out = out.replace(/==(.*?)==/g, '$1');
  out = out.replace(/\$\$(.*?)\$\$/g, '$1');

  // Normalize whitespace
  out = out.replace(/\r/g, '');
  out = out.replace(/[ \t]+\n/g, '\n');
  out = out.replace(/\n{3,}/g, '\n\n');
  out = out.trim();

  return out;
}
