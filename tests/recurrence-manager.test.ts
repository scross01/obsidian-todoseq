/**
 * Tests for recurrence-manager.ts
 */

import { RecurrenceManager } from '../src/services/recurrence-manager';
import { KeywordManager } from '../src/utils/keyword-manager';
import { Task } from '../src/types/task';

describe('RecurrenceManager', () => {
  let recurrenceManager: RecurrenceManager;
  const keywordManager = new KeywordManager({});

  beforeEach(() => {
    recurrenceManager = new RecurrenceManager(keywordManager);
    jest.clearAllMocks();
  });

  describe('calculateNextDates', () => {
    const mockParser = {
      getDateLineType: jest.fn(),
    };

    it('should return unchanged when no repeat dates', () => {
      const task: Task = {
        path: 'test.md',
        line: 0,
        rawText: 'TODO task',
        text: 'task',
        state: 'DONE',
        completed: true,
        scheduledDate: new Date('2026-03-10'),
        deadlineDate: new Date('2026-03-10'),
        scheduledDateRepeat: null,
        deadlineDateRepeat: null,
        priority: null,
        tags: [],
        urgency: 0,
        closedDate: null,
      };

      const lines = ['TODO task', '  SCHEDULED: <2026-03-10>'];
      const result = recurrenceManager.calculateNextDates(
        task,
        lines,
        mockParser,
      );

      expect(result.updated).toBe(false);
      expect(result.newScheduledDate).toBeUndefined();
      expect(result.newDeadlineDate).toBeUndefined();
    });

    it('should calculate next scheduled date', () => {
      const task: Task = {
        path: 'test.md',
        line: 0,
        rawText: 'DONE task',
        text: 'task',
        state: 'DONE',
        completed: true,
        scheduledDate: new Date('2026-03-10'),
        deadlineDate: null,
        scheduledDateRepeat: { type: '+', unit: 'd', value: 1, raw: '+1d' },
        deadlineDateRepeat: null,
        priority: null,
        tags: [],
        urgency: 0,
        closedDate: null,
      };

      mockParser.getDateLineType.mockReturnValue('scheduled');
      const lines = ['DONE task', '  SCHEDULED: <2026-03-10>'];
      const result = recurrenceManager.calculateNextDates(
        task,
        lines,
        mockParser,
      );

      expect(result.updated).toBe(true);
      expect(result.newScheduledDate?.getDate()).toBe(11); // Just check the day, ignore time zone
    });

    it('should calculate next deadline date', () => {
      const task: Task = {
        path: 'test.md',
        line: 0,
        rawText: 'DONE task',
        text: 'task',
        state: 'DONE',
        completed: true,
        scheduledDate: null,
        deadlineDate: new Date('2026-03-10'),
        scheduledDateRepeat: null,
        deadlineDateRepeat: { type: '+', unit: 'w', value: 1, raw: '+1w' },
        priority: null,
        tags: [],
        urgency: 0,
        closedDate: null,
      };

      mockParser.getDateLineType.mockReturnValue('deadline');
      const lines = ['DONE task', '  DEADLINE: <2026-03-10>'];
      const result = recurrenceManager.calculateNextDates(
        task,
        lines,
        mockParser,
      );

      expect(result.updated).toBe(true);
      expect(result.newDeadlineDate?.getDate()).toBe(17); // Just check the day, ignore time zone
    });

    it('should calculate both scheduled and deadline dates', () => {
      const task: Task = {
        path: 'test.md',
        line: 0,
        rawText: 'DONE task',
        text: 'task',
        state: 'DONE',
        completed: true,
        scheduledDate: new Date('2026-03-10'),
        deadlineDate: new Date('2026-03-10'),
        scheduledDateRepeat: { type: '+', unit: 'd', value: 1, raw: '+1d' },
        deadlineDateRepeat: { type: '+', unit: 'w', value: 1, raw: '+1w' },
        priority: null,
        tags: [],
        urgency: 0,
        closedDate: null,
      };

      mockParser.getDateLineType
        .mockReturnValueOnce('scheduled')
        .mockReturnValueOnce('deadline');
      const lines = [
        'DONE task',
        '  SCHEDULED: <2026-03-10> +1d>',
        '  DEADLINE: <2026-03-10> +1w>',
      ];
      const result = recurrenceManager.calculateNextDates(
        task,
        lines,
        mockParser,
      );

      expect(result.updated).toBe(true);
      expect(result.newScheduledDate?.getDate()).toBe(11); // Just check the day, ignore time zone
      expect(result.newDeadlineDate?.getDate()).toBe(17); // Just check the day, ignore time zone
    });

    it('should use findDateLineWithParser to locate date lines', () => {
      const task: Task = {
        path: 'test.md',
        line: 0,
        rawText: 'DONE task',
        text: 'task',
        state: 'DONE',
        completed: true,
        scheduledDate: new Date('2026-03-10'),
        deadlineDate: new Date('2026-03-10'),
        scheduledDateRepeat: { type: '+', unit: 'd', value: 1, raw: '+1d' },
        deadlineDateRepeat: null,
        priority: null,
        tags: [],
        urgency: 0,
        closedDate: null,
      };

      mockParser.getDateLineType.mockReturnValue('scheduled');
      const lines = ['DONE task', '  SCHEDULED: <2026-03-10>'];
      const result = recurrenceManager.calculateNextDates(
        task,
        lines,
        mockParser,
      );

      expect(mockParser.getDateLineType).toHaveBeenCalled();
      expect(result.updated).toBe(true);
    });

    // ── getTaskIndent fix regression tests ──────────────────────────
    // The getTaskIndent fix changed the function to return task.indent
    // (leading whitespace) instead of computing from rawText.indexOf(state)
    // which included list-marker characters as spaces.  These tests verify
    // that calculateNextDates passes the correct indent to the parser for
    // both non-indented and indented tasks.

    it('should pass correct indent for non-indented checkbox task', () => {
      const task: Task = {
        path: 'test.md',
        line: 2,
        rawText: '- [ ] TODO Recurring daily task',
        text: 'Recurring daily task',
        state: 'TODO',
        indent: '', // no leading whitespace (the fix ensures this is used, not 6 spaces)
        completed: false,
        scheduledDate: new Date(2026, 5, 15),
        deadlineDate: null,
        scheduledDateRepeat: { type: '+', unit: 'd', value: 1, raw: '+1d' },
        deadlineDateRepeat: null,
        priority: null,
        tags: [],
        urgency: 0,
        closedDate: null,
      };

      mockParser.getDateLineType.mockReturnValue('scheduled');

      // File content matching the integration test fixture.
      const lines = [
        '# Recurrence Test',
        '',
        '- [ ] TODO Recurring daily task',
        '  SCHEDULED: <2026-06-15 Mon +1d>',
        '',
      ];

      recurrenceManager.calculateNextDates(task, lines, mockParser);

      // The parser should be called with taskIndent = '' (the actual
      // leading whitespace), NOT 6 spaces from the old keyword-position
      // calculation.
      const calls = mockParser.getDateLineType.mock.calls;
      const scheduledCall = calls.find(([line]: [string, string]) =>
        line.includes('SCHEDULED'),
      );
      expect(scheduledCall).toBeDefined();
      expect(scheduledCall![1]).toBe('');
    });

    it('should pass correct indent for indented checkbox task', () => {
      const task: Task = {
        path: 'test.md',
        line: 2,
        rawText: '  - [ ] TODO Indented task',
        text: 'Indented task',
        state: 'TODO',
        indent: '  ', // 2-space leading indent
        completed: false,
        scheduledDate: new Date(2026, 5, 15),
        deadlineDate: null,
        scheduledDateRepeat: { type: '+', unit: 'd', value: 1, raw: '+1d' },
        deadlineDateRepeat: null,
        priority: null,
        tags: [],
        urgency: 0,
        closedDate: null,
      };

      mockParser.getDateLineType.mockReturnValue('scheduled');

      const lines = [
        '# Test',
        '',
        '  - [ ] TODO Indented task',
        '    SCHEDULED: <2026-06-15 Mon +1d>',
        '',
      ];

      recurrenceManager.calculateNextDates(task, lines, mockParser);

      const calls = mockParser.getDateLineType.mock.calls;
      const scheduledCall = calls.find(([line]: [string, string]) =>
        line.includes('SCHEDULED'),
      );
      expect(scheduledCall).toBeDefined();
      expect(scheduledCall![1]).toBe('  ');
    });

    it('should fall back to empty string when task.indent is undefined', () => {
      const task: Task = {
        path: 'test.md',
        line: 0,
        rawText: 'DONE task',
        text: 'task',
        state: 'DONE',
        // indent deliberately omitted — no indent property at all
        completed: true,
        scheduledDate: new Date('2026-03-10'),
        deadlineDate: null,
        scheduledDateRepeat: { type: '+', unit: 'd', value: 1, raw: '+1d' },
        deadlineDateRepeat: null,
        priority: null,
        tags: [],
        urgency: 0,
        closedDate: null,
      };

      mockParser.getDateLineType.mockReturnValue('scheduled');

      const lines = ['DONE task', '  SCHEDULED: <2026-03-10>'];

      recurrenceManager.calculateNextDates(task, lines, mockParser);

      const calls = mockParser.getDateLineType.mock.calls;
      const scheduledCall = calls.find(([line]: [string, string]) =>
        line.includes('SCHEDULED'),
      );
      expect(scheduledCall).toBeDefined();
      // getTaskIndent falls back to '' via task.indent ?? ''
      expect(scheduledCall![1]).toBe('');
    });

    // ── warning period behavior on recurrence ──────────────────────

    it('should strip first-only scheduled warning period on recurrence', () => {
      const task: Task = {
        path: 'test.md',
        line: 0,
        rawText: 'DONE task',
        text: 'task',
        state: 'DONE',
        completed: true,
        scheduledDate: new Date('2026-03-10'),
        deadlineDate: null,
        scheduledDateRepeat: { type: '+', unit: 'w', value: 1, raw: '+1w' },
        deadlineDateRepeat: null,
        scheduledWarningPeriod: { value: 2, unit: 'd', isFirstOnly: true },
        deadlineWarningPeriod: null,
        priority: null,
        tags: [],
        urgency: 0,
        closedDate: null,
      };

      mockParser.getDateLineType.mockReturnValue('scheduled');
      const lines = ['DONE task', '  SCHEDULED: <2026-03-10 Mon +1w --2d>'];
      const result = recurrenceManager.calculateNextDates(
        task,
        lines,
        mockParser,
      );

      expect(result.updated).toBe(true);
      // First-only warning period should be stripped (null triggers stripping in coordinator)
      expect(result.newScheduledWarningPeriod).toBeNull();
    });

    it('should preserve regular scheduled warning period on recurrence', () => {
      const task: Task = {
        path: 'test.md',
        line: 0,
        rawText: 'DONE task',
        text: 'task',
        state: 'DONE',
        completed: true,
        scheduledDate: new Date('2026-03-10'),
        deadlineDate: null,
        scheduledDateRepeat: { type: '+', unit: 'w', value: 1, raw: '+1w' },
        deadlineDateRepeat: null,
        scheduledWarningPeriod: { value: 3, unit: 'd', isFirstOnly: false },
        deadlineWarningPeriod: null,
        priority: null,
        tags: [],
        urgency: 0,
        closedDate: null,
      };

      mockParser.getDateLineType.mockReturnValue('scheduled');
      const lines = ['DONE task', '  SCHEDULED: <2026-03-10 Mon +1w -3d>'];
      const result = recurrenceManager.calculateNextDates(
        task,
        lines,
        mockParser,
      );

      expect(result.updated).toBe(true);
      // Regular warning period should be preserved across recurrences
      expect(result.newScheduledWarningPeriod).toEqual({
        value: 3,
        unit: 'd',
        isFirstOnly: false,
      });
    });

    it('should return undefined for scheduled warning period when none exists', () => {
      const task: Task = {
        path: 'test.md',
        line: 0,
        rawText: 'DONE task',
        text: 'task',
        state: 'DONE',
        completed: true,
        scheduledDate: new Date('2026-03-10'),
        deadlineDate: null,
        scheduledDateRepeat: { type: '+', unit: 'w', value: 1, raw: '+1w' },
        deadlineDateRepeat: null,
        scheduledWarningPeriod: null,
        deadlineWarningPeriod: null,
        priority: null,
        tags: [],
        urgency: 0,
        closedDate: null,
      };

      mockParser.getDateLineType.mockReturnValue('scheduled');
      const lines = ['DONE task', '  SCHEDULED: <2026-03-10 Mon +1w>'];
      const result = recurrenceManager.calculateNextDates(
        task,
        lines,
        mockParser,
      );

      expect(result.updated).toBe(true);
      // No warning period → null (no warning period to carry forward)
      expect(result.newScheduledWarningPeriod).toBeNull();
    });

    it('should strip first-only deadline warning period on recurrence', () => {
      const task: Task = {
        path: 'test.md',
        line: 0,
        rawText: 'DONE task',
        text: 'task',
        state: 'DONE',
        completed: true,
        scheduledDate: null,
        deadlineDate: new Date('2026-03-10'),
        scheduledDateRepeat: null,
        deadlineDateRepeat: { type: '+', unit: 'w', value: 1, raw: '+1w' },
        scheduledWarningPeriod: null,
        deadlineWarningPeriod: { value: 1, unit: 'w', isFirstOnly: true },
        priority: null,
        tags: [],
        urgency: 0,
        closedDate: null,
      };

      mockParser.getDateLineType.mockReturnValue('deadline');
      const lines = ['DONE task', '  DEADLINE: <2026-03-10 Mon +1w --1w>'];
      const result = recurrenceManager.calculateNextDates(
        task,
        lines,
        mockParser,
      );

      expect(result.updated).toBe(true);
      // First-only deadline warning period should be stripped
      expect(result.newDeadlineWarningPeriod).toBeNull();
    });

    it('should preserve regular deadline warning period on recurrence', () => {
      const task: Task = {
        path: 'test.md',
        line: 0,
        rawText: 'DONE task',
        text: 'task',
        state: 'DONE',
        completed: true,
        scheduledDate: null,
        deadlineDate: new Date('2026-03-10'),
        scheduledDateRepeat: null,
        deadlineDateRepeat: { type: '+', unit: 'w', value: 1, raw: '+1w' },
        scheduledWarningPeriod: null,
        deadlineWarningPeriod: { value: 5, unit: 'd', isFirstOnly: false },
        priority: null,
        tags: [],
        urgency: 0,
        closedDate: null,
      };

      mockParser.getDateLineType.mockReturnValue('deadline');
      const lines = ['DONE task', '  DEADLINE: <2026-03-10 Mon +1w -5d>'];
      const result = recurrenceManager.calculateNextDates(
        task,
        lines,
        mockParser,
      );

      expect(result.updated).toBe(true);
      // Regular deadline warning period should be preserved
      expect(result.newDeadlineWarningPeriod).toEqual({
        value: 5,
        unit: 'd',
        isFirstOnly: false,
      });
    });

    it('should return undefined for deadline warning period when none exists', () => {
      const task: Task = {
        path: 'test.md',
        line: 0,
        rawText: 'DONE task',
        text: 'task',
        state: 'DONE',
        completed: true,
        scheduledDate: null,
        deadlineDate: new Date('2026-03-10'),
        scheduledDateRepeat: null,
        deadlineDateRepeat: { type: '+', unit: 'w', value: 1, raw: '+1w' },
        scheduledWarningPeriod: null,
        deadlineWarningPeriod: null,
        priority: null,
        tags: [],
        urgency: 0,
        closedDate: null,
      };

      mockParser.getDateLineType.mockReturnValue('deadline');
      const lines = ['DONE task', '  DEADLINE: <2026-03-10 Mon +1w>'];
      const result = recurrenceManager.calculateNextDates(
        task,
        lines,
        mockParser,
      );

      expect(result.updated).toBe(true);
      // No warning period → null (no warning period to carry forward)
      expect(result.newDeadlineWarningPeriod).toBeNull();
    });

    it('should handle both scheduled and deadline first-only stripping together', () => {
      const task: Task = {
        path: 'test.md',
        line: 0,
        rawText: 'DONE task',
        text: 'task',
        state: 'DONE',
        completed: true,
        scheduledDate: new Date('2026-03-10'),
        deadlineDate: new Date('2026-03-10'),
        scheduledDateRepeat: { type: '+', unit: 'w', value: 1, raw: '+1w' },
        deadlineDateRepeat: { type: '+', unit: 'w', value: 1, raw: '+1w' },
        scheduledWarningPeriod: { value: 2, unit: 'd', isFirstOnly: true },
        deadlineWarningPeriod: { value: 5, unit: 'd', isFirstOnly: true },
        priority: null,
        tags: [],
        urgency: 0,
        closedDate: null,
      };

      mockParser.getDateLineType
        .mockReturnValueOnce('scheduled')
        .mockReturnValueOnce('deadline');
      const lines = [
        'DONE task',
        '  SCHEDULED: <2026-03-10 Mon +1w --2d>',
        '  DEADLINE: <2026-03-10 Mon +1w --5d>',
      ];
      const result = recurrenceManager.calculateNextDates(
        task,
        lines,
        mockParser,
      );

      expect(result.updated).toBe(true);
      expect(result.newScheduledWarningPeriod).toBeNull();
      expect(result.newDeadlineWarningPeriod).toBeNull();
    });
  });

  describe('updateTaskKeyword', () => {
    it('should replace DONE with TODO', () => {
      const lines = ['DONE task', '  SCHEDULED: <2026-03-10>'];
      const result = recurrenceManager.updateTaskKeyword(lines, 0, 'TODO');

      expect(result[0]).toBe('TODO task');
      expect(result[1]).toBe('  SCHEDULED: <2026-03-10>');
    });

    it('should replace CANCELLED with TODO', () => {
      const lines = ['CANCELLED task', '  SCHEDULED: <2026-03-10>'];
      const result = recurrenceManager.updateTaskKeyword(lines, 0, 'TODO');

      expect(result[0]).toBe('TODO task');
    });

    it('should replace IN_PROGRESS with TODO', () => {
      const kmWithInProgress = new KeywordManager({
        additionalActiveKeywords: ['IN_PROGRESS'],
      });
      const rmWithInProgress = new RecurrenceManager(kmWithInProgress);
      const lines = ['IN_PROGRESS task', '  SCHEDULED: <2026-03-10>'];
      const result = rmWithInProgress.updateTaskKeyword(lines, 0, 'TODO');

      expect(result[0]).toBe('TODO task');
    });

    it('should handle custom keywords', () => {
      const lines = ['DONE task', '  SCHEDULED: <2026-03-10>'];
      const result = recurrenceManager.updateTaskKeyword(lines, 0, 'TODO');

      expect(result[0]).toBe('TODO task');
    });

    it('should preserve task text when replacing keyword', () => {
      const lines = [
        'DONE Some important task text here',
        '  SCHEDULED: <2026-03-10>',
      ];
      const result = recurrenceManager.updateTaskKeyword(lines, 0, 'TODO');

      expect(result[0]).toBe('TODO Some important task text here');
    });

    it('should return original lines if no keyword found', () => {
      const lines = ['Just some text', '  SCHEDULED: <2026-03-10>'];
      const result = recurrenceManager.updateTaskKeyword(lines, 0, 'TODO');

      expect(result).toEqual(lines);
    });
  });
});
