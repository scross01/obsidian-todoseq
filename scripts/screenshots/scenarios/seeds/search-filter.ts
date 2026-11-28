import { orgDate } from '../helpers.ts';

/**
 * Volume seed for search and filter scenarios ONLY.
 *
 * This is the one place a long task list is the point: filtering, sorting and
 * "n of m" counts are only legible when there is something to narrow. Keep it
 * out of the focused seeds — a list this long in a task-list or reader shot
 * shrinks every row until the feature being demonstrated is unreadable.
 */
export const SEARCH_FILTER_SEEDS: Record<string, string> = {
  'Backlog.md': `Everything queued but not yet started, kept in one place so the filters have something to work against.

## Unscheduled backlog

${Array.from({ length: 14 }, (_, i) => {
  const state = i % 4 === 0 ? 'DOING' : i % 7 === 0 ? 'WAITING' : 'TODO';
  const priority = i % 3 === 0 ? '[#A] ' : '';
  return `${state} ${priority}Backlog item ${i + 1} #backlog\nSCHEDULED: ${orgDate(i % 9)}`;
}).join('\n\n')}
`,
};
