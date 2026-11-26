import { orgClosedDate, orgDate } from '../helpers.ts';

/**
 * Editor-specific notes: the checkbox/keyword pairing and the bare task the
 * date-autocomplete scene types into.
 */
export const EDITOR_SEEDS: Record<string, string> = {
  'Checkbox Demo.md': `A checkbox and a state keyword can sit on the same line — TODOseq keeps them in sync when you change state from the task list.

## Tasks

- [ ] TODO Task with empty checkbox
SCHEDULED: ${orgDate(0)}

- [x] DONE Task with checked checkbox
CLOSED: ${orgClosedDate(-1)}

TODO Plain keyword task, no checkbox
`,
  'Date Demo.md': `Type a date keyword and the org-mode date is filled in for you.

## Tasks

TODO Book conference flights
`,
};
