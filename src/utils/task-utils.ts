import { Task } from '../task';

/**
 * Priority token regex pattern for extracting priority from task text
 * Matches patterns like: [#A], [#B], [#C]
 */
export const PRIORITY_TOKEN_REGEX = /(\s*)\[#([ABC])\](\s*)/;

/**
 * Checkbox regex pattern for detecting markdown checkbox tasks
 * Matches: - [ ], - [x], * [ ], * [x], + [ ], + [x]
 */
export const CHECKBOX_REGEX =
  /^(\s*)([-*+]\s*\[(\s|x)\]\s*)\s+([^\s]+)\s+(.+)$/;

/**
 * Extract priority from task text and return cleaned text
 * @param taskText The task text to parse
 * @returns Object containing priority and cleaned text
 */
export function extractPriority(taskText: string): {
  priority: 'high' | 'med' | 'low' | null;
  cleanedText: string;
} {
  let priority: 'high' | 'med' | 'low' | null = null;
  let cleanedText = taskText;

  const priMatch = PRIORITY_TOKEN_REGEX.exec(taskText);
  if (priMatch) {
    const letter = priMatch[2];
    if (letter === 'A') priority = 'high';
    else if (letter === 'B') priority = 'med';
    else if (letter === 'C') priority = 'low';

    const before = taskText.slice(0, priMatch.index);
    const after = taskText.slice(priMatch.index + priMatch[0].length);
    cleanedText = (before + ' ' + after).replace(/[ \t]+/g, ' ').trimStart();
  }

  return { priority, cleanedText };
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
 * Shared task comparator for consistent ordering across views
 * Sorts by file path first, then by line number
 * @param a First task
 * @param b Second task
 * @returns Comparison result (-1, 0, or 1)
 */
export const taskComparator = (a: Task, b: Task): number => {
  if (a.path === b.path) return a.line - b.line;
  return a.path.localeCompare(b.path);
};

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
