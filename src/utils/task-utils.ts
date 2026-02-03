import {
  DEFAULT_COMPLETED_STATES,
  DEFAULT_PENDING_STATES,
  DEFAULT_ACTIVE_STATES,
} from '../types/task';

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

  // Build non-completed keywords (pending + active + additional)
  const nonCompletedKeywords: string[] = [
    ...Array.from(DEFAULT_PENDING_STATES),
    ...Array.from(DEFAULT_ACTIVE_STATES),
    ...normalizedAdditional,
  ];

  // Build all keywords (non-completed + completed)
  const allKeywords: string[] = [
    ...nonCompletedKeywords,
    ...Array.from(DEFAULT_COMPLETED_STATES),
  ];

  return {
    allKeywords: Array.from(new Set(allKeywords)),
    nonCompletedKeywords: Array.from(new Set(nonCompletedKeywords)),
    normalizedAdditional,
  };
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
