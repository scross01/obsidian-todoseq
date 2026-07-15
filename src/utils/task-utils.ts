import { Task } from '../types/task';

export type TaskSource = 'markdown' | 'org' | 'code';

/**
 * Get a unique key for a task. For table tasks, includes cell index.
 */
export function getTaskKey(task: Task): string {
  const base = `${task.path}:${task.line}`;
  return task.isTableTask && task.tableCell
    ? `${base}:${task.tableCell.cellIndex}`
    : base;
}

export function getTaskSource(path: string): TaskSource {
  const ext = path.split('.').pop()?.toLowerCase();
  if (ext === 'org') return 'org';
  if (ext === 'md') return 'markdown';
  return 'code';
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
 * Truncate a description string to a max length, appending ellipsis if needed.
 */
export function truncateDescription(text: string, max = 256): string {
  return text.length > max ? text.substring(0, max) + '...' : text;
}

/**
 * Build a description display element with icon and truncated text.
 * Returns [container, iconElement] so caller can call setIcon on the icon.
 * In span mode (no-wrap), CSS handles truncation via text-overflow: ellipsis.
 * In div mode (wrap), JavaScript truncates at 256 characters.
 */
export function buildDescriptionDisplay(
  parent: HTMLElement,
  description: string,
  tag: 'div' | 'span' = 'div',
): [HTMLElement, HTMLElement] {
  const descEl = parent.createEl(tag, { cls: 'todoseq-task-description' });
  const iconEl = descEl.createSpan({ cls: 'todoseq-task-description-icon' });
  const textEl = descEl.createSpan({ cls: 'todoseq-task-description-text' });
  const stripped = stripDescriptionMarkdown(description);
  // Only truncate in wrap mode (div); no-wrap mode uses CSS ellipsis
  const displayText = tag === 'div' ? truncateDescription(stripped) : stripped;
  textEl.setText(displayText);
  return [descEl, iconEl];
}

/**
 * Truncate a string in the middle with ellipsis
 * @param str The string to truncate
 * @param maxLength Maximum length of the result string
 * @returns Truncated string with '..' in middle if needed
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

/**
 * Strip markdown from description text for display in task lists.
 * Includes link stripping (wiki links, markdown links, raw URLs)
 * since descriptions are display-only and don't need clickable links.
 */
export function stripDescriptionMarkdown(input: string): string {
  let out = stripMarkdownForDisplay(input);

  // Wiki links: [[page|alias]] -> alias, [[page]] -> page
  out = out.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2');
  out = out.replace(/\[\[([^\]]+)\]\]/g, '$1');

  // Markdown links: [text](url) -> text
  out = out.replace(/\[([^[\]]*(?:\[[^[\]]*\][^[\]]*)*)\]\(([^)]+)\)/g, '$1');

  // Raw URLs: https://... -> (removed)
  out = out.replace(/\bhttps?:\/\/[^\s)]+/g, '');

  // Normalize extra whitespace left by removals
  out = out.replace(/\s{2,}/g, ' ').trim();

  return out;
}

/**
 * Check if a task has subtasks
 * @param task The task to check
 * @returns True if the task has one or more subtasks
 */
export function hasSubtasks(task: Task): boolean {
  return task.subtaskCount > 0;
}

/**
 * Get the subtask display text for a task
 * @param task The task to get subtask display text for
 * @returns Formatted string like "[1/3]" or empty string if no subtasks
 */
export function getSubtaskDisplayText(task: Task): string {
  if (!hasSubtasks(task)) {
    return '';
  }
  return `${task.subtaskCompletedCount}/${task.subtaskCount}`;
}
