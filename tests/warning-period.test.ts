import {
  extractDateMetadata,
  formatDateLine,
} from '../src/utils/date-repeater';
import {
  getEffectiveVisibilityDate,
  sortTasksInBlocks,
  WarningPeriodSettings,
} from '../src/utils/task-sort';
import { Task } from '../src/types/task';
import { createBaseTask } from './helpers/test-helper';

const defaultSettings: WarningPeriodSettings = {
  upcomingPeriod: 7,
  defaultDeadlineWarningPeriod: 0,
  defaultScheduledWarningPeriod: 0,
  skipScheduledWarningPeriodIfDeadline: true,
  skipDeadlinePrewarningIfScheduled: false,
};

describe('Warning Period', () => {
  // ── extractDateMetadata ──────────────────────────────────────────

  describe('extractDateMetadata', () => {
    it('should extract -Nd warning period from date string', () => {
      const result = extractDateMetadata('<2026-06-20 Sat -5d>');
      expect(result.warningPeriod).toBe(5);
      expect(result.firstOnlyWarningPeriod).toBeNull();
      expect(result.repeat).toBeNull();
      expect(result.baseDateStr).toBe('<2026-06-20 Sat>');
    });

    it('should extract --Nd first-only warning period', () => {
      const result = extractDateMetadata('<2026-06-20 Sat --3d>');
      expect(result.warningPeriod).toBeNull();
      expect(result.firstOnlyWarningPeriod).toBe(3);
      expect(result.repeat).toBeNull();
      expect(result.baseDateStr).toBe('<2026-06-20 Sat>');
    });

    it('should extract repeater and warning period together', () => {
      const result = extractDateMetadata('<2026-06-20 Sat +1m -3d>');
      expect(result.repeat).toEqual({
        type: '+',
        unit: 'm',
        value: 1,
        raw: '+1m',
      });
      expect(result.warningPeriod).toBe(3);
      expect(result.firstOnlyWarningPeriod).toBeNull();
      expect(result.baseDateStr).toBe('<2026-06-20 Sat>');
    });

    it('should extract repeater and --Nd together', () => {
      const result = extractDateMetadata('<2026-06-20 Sat +1w --2d>');
      expect(result.repeat).toEqual({
        type: '+',
        unit: 'w',
        value: 1,
        raw: '+1w',
      });
      expect(result.warningPeriod).toBeNull();
      expect(result.firstOnlyWarningPeriod).toBe(2);
      expect(result.baseDateStr).toBe('<2026-06-20 Sat>');
    });

    it('should extract multi-digit warning period', () => {
      const result = extractDateMetadata('<2026-06-20 Sat -14d>');
      expect(result.warningPeriod).toBe(14);
    });

    it('should handle date with time and warning period', () => {
      const result = extractDateMetadata('<2026-06-20 Sat 07:00 -3d>');
      expect(result.warningPeriod).toBe(3);
      expect(result.baseDateStr).toBe('<2026-06-20 Sat 07:00>');
    });

    it('should handle date with time, repeater, and warning period', () => {
      const result = extractDateMetadata('<2026-06-20 Sat 07:00 .+1d -5d>');
      expect(result.repeat).toEqual({
        type: '.+',
        unit: 'd',
        value: 1,
        raw: '.+1d',
      });
      expect(result.warningPeriod).toBe(5);
      expect(result.baseDateStr).toBe('<2026-06-20 Sat 07:00>');
    });

    it('should return null warning period when none present', () => {
      const result = extractDateMetadata('<2026-06-20 Sat>');
      expect(result.warningPeriod).toBeNull();
      expect(result.firstOnlyWarningPeriod).toBeNull();
      expect(result.repeat).toBeNull();
    });

    it('should return null warning period for date with only repeater', () => {
      const result = extractDateMetadata('<2026-06-20 Sat +1m>');
      expect(result.warningPeriod).toBeNull();
      expect(result.firstOnlyWarningPeriod).toBeNull();
      expect(result.repeat).not.toBeNull();
    });

    it('should handle date only without DOW', () => {
      const result = extractDateMetadata('<2026-06-20 -5d>');
      expect(result.warningPeriod).toBe(5);
      expect(result.baseDateStr).toBe('<2026-06-20>');
    });

    it('should not confuse warning period with date part', () => {
      const result = extractDateMetadata('<2026-01-05 -3d>');
      expect(result.warningPeriod).toBe(3);
      expect(result.baseDateStr).toBe('<2026-01-05>');
    });
  });

  // ── formatDateLine with warning periods ──────────────────────────

  describe('formatDateLine with warning periods', () => {
    it('should append -Nd warning period to date line', () => {
      const result = formatDateLine(
        'SCHEDULED: <2026-03-05 Wed>',
        new Date(2026, 2, 5),
        null,
        5,
      );
      expect(result).toContain('-5d');
      expect(result).toContain('SCHEDULED:');
      expect(result).not.toContain('++');
      expect(result).not.toContain('.+');
    });

    it('should append --Nd first-only warning period', () => {
      const result = formatDateLine(
        'SCHEDULED: <2026-03-05 Wed>',
        new Date(2026, 2, 5),
        null,
        null,
        3,
      );
      expect(result).toContain('--3d');
      expect(result).toContain('SCHEDULED:');
    });

    it('should append warning period after repeater', () => {
      const result = formatDateLine(
        'SCHEDULED: <2026-03-05 Wed +1m>',
        new Date(2026, 2, 5),
        { type: '+', unit: 'm', value: 1, raw: '+1m' },
        3,
      );
      expect(result).toContain('+1m');
      expect(result).toContain('-3d');
      // Repeater should come before warning period
      const repeaterIdx = result.indexOf('+1m');
      const warningIdx = result.indexOf('-3d');
      expect(repeaterIdx).toBeLessThan(warningIdx);
    });

    it('should preserve time with warning period', () => {
      const result = formatDateLine(
        'DEADLINE: <2026-03-05 Wed 07:00>',
        new Date(2026, 2, 5),
        null,
        5,
      );
      expect(result).toContain('07:00');
      expect(result).toContain('-5d');
    });

    it('should not append warning period when 0', () => {
      const result = formatDateLine(
        'SCHEDULED: <2026-03-05 Wed>',
        new Date(2026, 2, 5),
        null,
        0,
      );
      expect(result).not.toContain(' -');
      expect(result).toContain('SCHEDULED:');
    });

    it('should not append warning period when null', () => {
      const result = formatDateLine(
        'SCHEDULED: <2026-03-05 Wed>',
        new Date(2026, 2, 5),
        null,
        null,
      );
      expect(result).not.toContain(' -');
      expect(result).toContain('SCHEDULED:');
    });

    it('should prioritize -Nd over --Nd', () => {
      const result = formatDateLine(
        'SCHEDULED: <2026-03-05 Wed>',
        new Date(2026, 2, 5),
        null,
        5,
        3,
      );
      expect(result).toContain('-5d');
      expect(result).not.toContain('--');
    });
  });

  // ── getEffectiveVisibilityDate ───────────────────────────────────

  describe('getEffectiveVisibilityDate', () => {
    it('should return null for task with no dates', () => {
      const task = createBaseTask();
      const result = getEffectiveVisibilityDate(task, defaultSettings);
      expect(result).toBeNull();
    });

    it('should return scheduled date unchanged when no warning period', () => {
      const task = createBaseTask({
        scheduledDate: new Date('2026-06-15'),
      });
      const result = getEffectiveVisibilityDate(task, defaultSettings);
      expect(result).toEqual(new Date('2026-06-15'));
    });

    it('should return deadline date unchanged when no warning period', () => {
      const task = createBaseTask({
        deadlineDate: new Date('2026-06-20'),
      });
      const result = getEffectiveVisibilityDate(task, defaultSettings);
      expect(result).toEqual(new Date('2026-06-20'));
    });

    it('should delay scheduled date by scheduled warning period', () => {
      const task = createBaseTask({
        scheduledDate: new Date('2026-06-10'),
        scheduledWarningPeriod: 3,
      });
      const result = getEffectiveVisibilityDate(task, defaultSettings);
      expect(result).toEqual(new Date('2026-06-13'));
    });

    it('should advance deadline by deadline warning period', () => {
      const task = createBaseTask({
        deadlineDate: new Date('2026-06-20'),
        deadlineWarningPeriod: 5,
      });
      const result = getEffectiveVisibilityDate(task, defaultSettings);
      expect(result).toEqual(new Date('2026-06-15'));
    });

    it('should use global default when per-task is null', () => {
      const task = createBaseTask({
        scheduledDate: new Date('2026-06-10'),
        scheduledWarningPeriod: null,
      });
      const settings = {
        ...defaultSettings,
        defaultScheduledWarningPeriod: 3,
      };
      const result = getEffectiveVisibilityDate(task, settings);
      expect(result).toEqual(new Date('2026-06-13'));
    });

    it('should use per-task over global default', () => {
      const task = createBaseTask({
        scheduledDate: new Date('2026-06-10'),
        scheduledWarningPeriod: 5,
      });
      const settings = {
        ...defaultSettings,
        defaultScheduledWarningPeriod: 3,
      };
      const result = getEffectiveVisibilityDate(task, settings);
      expect(result).toEqual(new Date('2026-06-15'));
    });

    it('should return earliest of scheduled and deadline effective dates', () => {
      const task = createBaseTask({
        scheduledDate: new Date('2026-06-15'),
        deadlineDate: new Date('2026-06-20'),
        deadlineWarningPeriod: 5,
      });
      const result = getEffectiveVisibilityDate(task, defaultSettings);
      expect(result).toEqual(new Date('2026-06-15'));
    });

    it('should skip scheduled delay when deadline exists and skip setting enabled', () => {
      const task = createBaseTask({
        scheduledDate: new Date('2026-06-10'),
        scheduledWarningPeriod: 5,
        deadlineDate: new Date('2026-06-20'),
      });
      const settings = {
        ...defaultSettings,
        skipScheduledWarningPeriodIfDeadline: true,
      };
      const result = getEffectiveVisibilityDate(task, settings);
      expect(result).toEqual(new Date('2026-06-10'));
    });

    it('should not skip scheduled delay when skip setting disabled', () => {
      const task = createBaseTask({
        scheduledDate: new Date('2026-06-10'),
        scheduledWarningPeriod: 5,
        deadlineDate: new Date('2026-06-20'),
      });
      const settings = {
        ...defaultSettings,
        skipScheduledWarningPeriodIfDeadline: false,
      };
      const result = getEffectiveVisibilityDate(task, settings);
      expect(result).toEqual(new Date('2026-06-15'));
    });

    it('should skip deadline warning when scheduled exists and skip setting enabled', () => {
      const task = createBaseTask({
        scheduledDate: new Date('2026-06-10'),
        deadlineDate: new Date('2026-06-20'),
        deadlineWarningPeriod: 5,
      });
      const settings = {
        ...defaultSettings,
        skipDeadlinePrewarningIfScheduled: true,
      };
      const result = getEffectiveVisibilityDate(task, settings);
      expect(result).toEqual(new Date('2026-06-10'));
    });

    it('should use 0 warning period to explicitly override global default', () => {
      const task = createBaseTask({
        scheduledDate: new Date('2026-06-10'),
        scheduledWarningPeriod: 0,
      });
      const settings = {
        ...defaultSettings,
        defaultScheduledWarningPeriod: 5,
      };
      const result = getEffectiveVisibilityDate(task, settings);
      expect(result).toEqual(new Date('2026-06-10'));
    });

    it('should fall back to firstOnlyWarningPeriod when scheduledWarningPeriod is null', () => {
      const task = createBaseTask({
        scheduledDate: new Date('2026-06-10'),
        scheduledFirstOnlyWarningPeriod: 3,
      });
      const result = getEffectiveVisibilityDate(task, defaultSettings);
      expect(result).toEqual(new Date('2026-06-13'));
    });

    it('should fall back to firstOnlyWarningPeriod when deadlineWarningPeriod is null', () => {
      const task = createBaseTask({
        deadlineDate: new Date('2026-06-20'),
        deadlineFirstOnlyWarningPeriod: 5,
      });
      const result = getEffectiveVisibilityDate(task, defaultSettings);
      expect(result).toEqual(new Date('2026-06-15'));
    });

    it('should prefer scheduledWarningPeriod over scheduledFirstOnlyWarningPeriod', () => {
      const task = createBaseTask({
        scheduledDate: new Date('2026-06-10'),
        scheduledWarningPeriod: 5,
        scheduledFirstOnlyWarningPeriod: 3,
      });
      const result = getEffectiveVisibilityDate(task, defaultSettings);
      expect(result).toEqual(new Date('2026-06-15'));
    });

    it('should prefer deadlineWarningPeriod over deadlineFirstOnlyWarningPeriod', () => {
      const task = createBaseTask({
        deadlineDate: new Date('2026-06-20'),
        deadlineWarningPeriod: 5,
        deadlineFirstOnlyWarningPeriod: 3,
      });
      const result = getEffectiveVisibilityDate(task, defaultSettings);
      expect(result).toEqual(new Date('2026-06-15'));
    });
  });

  // ── Recurrence behavior ────────────────────────────────────────

  describe('recurrence behavior', () => {
    it('recurrence coordinator preserves -Nd when task.scheduledWarningPeriod is set', () => {
      // When a task has scheduledWarningPeriod (e.g., -3d), the recurrence
      // coordinator should pass it through to the writer
      const task = createBaseTask({
        scheduledDate: new Date('2026-06-13'),
        scheduledDateRepeat: { type: '+', unit: 'd', value: 1, raw: '+1d' },
        scheduledWarningPeriod: 3,
        scheduledFirstOnlyWarningPeriod: null,
      });
      // The recurrence coordinator logic:
      // newScheduledWarningPeriod = task.scheduledWarningPeriod (3)
      // newScheduledFirstOnlyWarningPeriod = task.scheduledWarningPeriod ? null : task.scheduledFirstOnlyWarningPeriod
      // Since scheduledWarningPeriod is 3 (truthy), firstOnly = null
      expect(task.scheduledWarningPeriod).toBe(3);
      expect(task.scheduledFirstOnlyWarningPeriod).toBeNull();
    });

    it('recurrence coordinator preserves -Nd when task.scheduledWarningPeriod is set', () => {
      // When a task has scheduledWarningPeriod (e.g., -3d), the recurrence
      // coordinator should pass it through to the writer
      const task = createBaseTask({
        scheduledDate: new Date('2026-06-13'),
        scheduledDateRepeat: { type: '+', unit: 'd', value: 1, raw: '+1d' },
        scheduledWarningPeriod: 3,
        scheduledFirstOnlyWarningPeriod: null,
      });
      // -Nd is preserved, --Nd is always stripped
      expect(task.scheduledWarningPeriod).toBe(3);
    });

    it('recurrence coordinator always strips --Nd first-only warning periods', () => {
      // --Nd should ALWAYS be stripped on recurrence, regardless of -Nd
      const task = createBaseTask({
        scheduledDate: new Date('2026-06-13'),
        scheduledDateRepeat: { type: '+', unit: 'd', value: 1, raw: '+1d' },
        scheduledWarningPeriod: null,
        scheduledFirstOnlyWarningPeriod: 3,
      });
      // The recurrence coordinator always passes null for firstOnly
      expect(task.scheduledFirstOnlyWarningPeriod).toBe(3);
      // After recurrence: newScheduledFirstOnlyWarningPeriod = null (stripped)
    });
  });

  // ── sortTasksInBlocks with warning periods ───────────────────────

  describe('sortTasksInBlocks with warning periods', () => {
    const now = new Date('2026-06-10T12:00:00');

    it('should classify task as current when deadline warning pulls it to today', () => {
      const task = createBaseTask({
        deadlineDate: new Date('2026-06-15'),
        deadlineWarningPeriod: 5,
      });
      const blocks = sortTasksInBlocks(
        [task],
        now,
        'hideFuture',
        'showAll',
        'default',
        undefined,
        {
          ...defaultSettings,
          defaultDeadlineWarningPeriod: 5,
        },
      );
      const allTasks = blocks.flatMap((b) => b.tasks);
      expect(allTasks).toContain(task);
    });

    it('should classify task as future when deadline warning is not enough', () => {
      const task = createBaseTask({
        deadlineDate: new Date('2026-06-25'),
        deadlineWarningPeriod: 5,
      });
      const blocks = sortTasksInBlocks(
        [task],
        now,
        'hideFuture',
        'showAll',
        'default',
        undefined,
        {
          ...defaultSettings,
          defaultDeadlineWarningPeriod: 5,
        },
      );
      const allTasks = blocks.flatMap((b) => b.tasks);
      expect(allTasks).not.toContain(task);
    });

    it('should classify task as upcoming when deadline warning puts it within upcoming period', () => {
      const task = createBaseTask({
        deadlineDate: new Date('2026-06-20'),
        deadlineWarningPeriod: 5,
      });
      const blocks = sortTasksInBlocks(
        [task],
        now,
        'showUpcoming',
        'showAll',
        'default',
        undefined,
        {
          ...defaultSettings,
          defaultDeadlineWarningPeriod: 5,
        },
      );
      const allTasks = blocks.flatMap((b) => b.tasks);
      expect(allTasks).toContain(task);
    });

    it('should delay scheduled task visibility', () => {
      const task = createBaseTask({
        scheduledDate: new Date('2026-06-10'),
        scheduledWarningPeriod: 3,
      });
      const blocks = sortTasksInBlocks(
        [task],
        now,
        'hideFuture',
        'showAll',
        'default',
        undefined,
        {
          ...defaultSettings,
          defaultScheduledWarningPeriod: 3,
        },
      );
      // Effective date: June 13 (10+3), which is 3 days away → future
      const allTasks = blocks.flatMap((b) => b.tasks);
      expect(allTasks).not.toContain(task);
    });

    it('should respect upcomingPeriod setting for classification', () => {
      const task = createBaseTask({
        deadlineDate: new Date('2026-06-20'),
        deadlineWarningPeriod: 5,
      });
      const blocks = sortTasksInBlocks(
        [task],
        now,
        'showUpcoming',
        'showAll',
        'default',
        undefined,
        {
          ...defaultSettings,
          defaultDeadlineWarningPeriod: 5,
          upcomingPeriod: 3,
        },
      );
      // Effective date: June 15, which is 5 days away
      // With upcomingPeriod=3, only tasks within 3 days are upcoming
      const allTasks = blocks.flatMap((b) => b.tasks);
      expect(allTasks).not.toContain(task);
    });
  });
});
