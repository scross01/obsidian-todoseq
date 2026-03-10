/**
 * Tests for recurrence-manager.ts
 */

import { RecurrenceManager } from '../src/services/recurrence-manager';
import { Task } from '../src/types/task';

describe('RecurrenceManager', () => {
  let recurrenceManager: RecurrenceManager;

  beforeEach(() => {
    recurrenceManager = new RecurrenceManager();
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
        'TODO',
      );

      expect(result.updated).toBe(false);
      expect(result.lines).toEqual(lines);
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
        'TODO',
      );

      expect(result.updated).toBe(true);
      expect(result.newScheduledDate?.getDate()).toBe(11); // Just check the day, ignore time zone
      expect(result.lines[1]).toContain('2026-03-11');
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
        'TODO',
      );

      expect(result.updated).toBe(true);
      expect(result.newDeadlineDate?.getDate()).toBe(17); // Just check the day, ignore time zone
      expect(result.lines[1]).toContain('2026-03-17');
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
        'TODO',
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
        'TODO',
      );

      expect(mockParser.getDateLineType).toHaveBeenCalled();
      expect(result.updated).toBe(true);
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
      const lines = ['IN_PROGRESS task', '  SCHEDULED: <2026-03-10>'];
      const result = recurrenceManager.updateTaskKeyword(lines, 0, 'TODO');

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
