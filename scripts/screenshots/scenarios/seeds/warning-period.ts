import { orgWarningDate } from '../helpers.ts';

/**
 * Seeds for the warning-period docs screenshot (docs/warning-periods.md and the
 * Warning Period Indicators section of docs/task-list.md).
 *
 * Exactly two tasks, one per arrow direction, and nothing else in the vault:
 * the asset is a detail crop of the task list rows, so a third task would
 * appear in it and shrink the two that are being demonstrated.
 *
 * The offsets are chosen so each task's *effective* visibility date lands inside
 * the default 7-day upcoming window. That is the constraint that is easy to
 * miss: the task list filters on the effective date, not the raw one, so
 * "a scheduled date in the past" does not by itself keep a row on screen —
 * add a delay long enough and it has moved out of the window and vanished.
 * tests/screenshot-seed-visibility.test.ts pins it.
 */
export const WARNING_PERIOD_SEEDS: Record<string, string> = {
  // Named for the demo rather than for the feature: every panel row ends with
  // a `file:line` provenance line, so a seed called "Warning Periods.md"
  // stamped that name under both rows in the crop. "Quarter Close" reads as
  // the note the tasks actually live in.
  'Quarter Close.md': `Work that has to land before the quarter closes.

TODO [#B] Chase the vendor invoice
SCHEDULED: ${orgWarningDate(-1, '-3d')}

TODO [#B] File the quarterly report
DEADLINE: ${orgWarningDate(10, '-7d')}
`,
};
