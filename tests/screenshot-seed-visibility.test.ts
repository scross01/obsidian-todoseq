import { WARNING_PERIOD_SEEDS } from '../scripts/screenshots/scenarios/helpers';
import { extractDateMetadata } from '../src/utils/date-repeater';
import {
  getEffectiveVisibilityDate,
  type WarningPeriodSettings,
} from '../src/utils/task-sort';
import type { Task } from '../src/types/task';
import { createBaseTask } from './helpers/test-helper';

/**
 * The warning-period docs screenshot crops the task list rows, so a seeded row
 * only reaches the image if the task list actually renders it — and what the
 * list renders is the task's *effective* visibility date, not its raw date. A
 * warning period moves that date (`SCHEDULED` + delay, `DEADLINE` − advance),
 * and anything beyond the 7-day upcoming window is not shown at all.
 *
 * The failure this guards against is silent and total: nudge one offset and the
 * row drops out of the panel, the crop captures the other row alone, and the
 * docs then illustrate one arrow while the prose claims both.
 */

/** The plugin defaults the capture runs against (src/settings/settings-types.ts). */
const CAPTURE_SETTINGS: WarningPeriodSettings = {
  upcomingPeriod: 7,
  defaultDeadlineWarningPeriod: 0,
  defaultScheduledWarningPeriod: 0,
  skipScheduledWarningPeriodIfDeadline: false,
  skipDeadlinePrewarningIfScheduled: false,
};

/** One dated row lifted out of a seed note. */
interface SeedRow {
  field: 'SCHEDULED' | 'DEADLINE';
  line: string;
}

/** Every `SCHEDULED:`/`DEADLINE:` line across the warning-period seeds. */
const SEED_ROWS: SeedRow[] = Object.values(WARNING_PERIOD_SEEDS).flatMap(
  (note) =>
    note
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => /^(SCHEDULED|DEADLINE):\s*</.test(line))
      .map(
        (line) =>
          ({
            field: line.split(':')[0] as SeedRow['field'],
            line,
          }) satisfies SeedRow,
      ),
);

/** Local midnight today, so a boundary comparison is not a time-of-day coin flip. */
function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Build the task a date line describes, warning period included. */
function taskFor(row: SeedRow): Task {
  const token = row.line.slice(
    row.line.indexOf('<'),
    row.line.lastIndexOf('>') + 1,
  );
  const { baseDateStr, warningPeriod } = extractDateMetadata(token);
  const [year, month, day] = baseDateStr
    .replace(/[<>]/g, '')
    .split('-')
    .map(Number);
  const date = new Date(year, month - 1, day);
  return createBaseTask(
    row.field === 'SCHEDULED'
      ? { scheduledDate: date, scheduledWarningPeriod: warningPeriod }
      : { deadlineDate: date, deadlineWarningPeriod: warningPeriod },
  );
}

describe('warning-period screenshot seeds', () => {
  it('seeds one delayed-scheduled row and one advance-deadline row', () => {
    // Two rows, one per arrow direction: the task list renders → for a
    // scheduled delay (task-item-renderer) and ← for a deadline advance. A
    // third row would shrink both in the crop without teaching anything.
    expect(SEED_ROWS.map((r) => r.field)).toEqual(['SCHEDULED', 'DEADLINE']);
  });

  it.each(SEED_ROWS)(
    '$field row carries a warning period, which is what renders the arrow',
    (row) => {
      const task = taskFor(row);
      const warning =
        row.field === 'SCHEDULED'
          ? task.scheduledWarningPeriod
          : task.deadlineWarningPeriod;
      expect(warning).not.toBeNull();
      expect(warning?.value).toBeGreaterThan(0);
    },
  );

  it.each(SEED_ROWS)(
    '$field row is visible in the task list on capture day',
    (row) => {
      const effective = getEffectiveVisibilityDate(
        taskFor(row),
        CAPTURE_SETTINGS,
      );
      expect(effective).not.toBeNull();

      const today = startOfToday();
      const windowEnd = new Date(today);
      windowEnd.setDate(windowEnd.getDate() + CAPTURE_SETTINGS.upcomingPeriod);

      // Inside the window in both directions: a row effective before today is
      // fine (it shows as overdue), one past the window is not rendered.
      expect(effective!.getTime()).toBeGreaterThanOrEqual(today.getTime());
      expect(effective!.getTime()).toBeLessThanOrEqual(windowEnd.getTime());
    },
  );
});
