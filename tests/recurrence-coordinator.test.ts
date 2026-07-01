/**
 * Unit tests for RecurrenceCoordinator
 *
 * Includes both orchestration tests (timeout/lifecycle/performRecurrenceUpdate)
 * and pure-math tests for calculateNextDates (the pure-math coverage was
 * historically in tests/recurrence-manager.test.ts before that class was
 * inlined into RecurrenceCoordinator).
 */

import { RecurrenceCoordinator } from '../src/services/recurrence-coordinator';
import { TaskStateManager } from '../src/services/task-state-manager';
import { App, MarkdownView, TFile } from 'obsidian';
import { Task } from '../src/types/task';
import {
  createTestKeywordManager,
  createBaseSettings,
} from './helpers/test-helper';

// Mock console methods to reduce noise
const originalDebug = console.debug;
const originalError = console.error;

beforeAll(() => {
  console.debug = jest.fn();
  console.error = jest.fn();
});

afterAll(() => {
  console.debug = originalDebug;
  console.error = originalError;
});

// Mock App and TFile
const mockFile = new TFile('test.md', 'test.md', 'md');
Object.assign(mockFile, {
  stat: { mtime: Date.now(), ctime: Date.now(), size: 100 },
});

const mockParser = {
  getDateLineType: jest.fn(),
  parseDateFromLine: jest.fn(() => new Date('2024-01-01')),
};

const mockApp = {
  vault: {
    getAbstractFileByPath: jest.fn().mockReturnValue(mockFile),
    read: jest
      .fn()
      .mockResolvedValue('- [x] Test task\nSCHEDULED: <2024-01-01 Mon +1w>'),
    modify: jest.fn().mockResolvedValue(undefined),
  },
  plugins: {
    getPlugin: jest.fn().mockReturnValue({
      vaultScanner: {
        getParser: () => mockParser,
      },
    }),
  },
} as unknown as App;

// Mock TodoTracker plugin
const mockPlugin = {
  app: mockApp,
  settings: createBaseSettings(),
} as any;

// Create keyword manager for tests
const keywordManager = createTestKeywordManager();

// Mock TaskStateManager
const mockTaskStateManager = {
  findTaskByPathAndLine: jest.fn(),
  updateTask: jest.fn(),
  getTasks: jest.fn(),
  setTasks: jest.fn(),
} as unknown as TaskStateManager;

// Create a mock task
const createMockTask = (overrides: Partial<Task> = {}): Task => ({
  path: 'test.md',
  line: 0,
  rawText: '- [ ] Test task',
  state: 'DONE',
  completed: true,
  scheduledDate: new Date('2024-01-01'),
  deadlineDate: null,
  scheduledDateRepeat: '+1w',
  deadlineDateRepeat: null,
  closedDate: new Date(),
  priority: null,
  tags: [],
  indent: '',
  listMarker: '',
  text: 'Test task',
  urgency: null,
  isDailyNote: false,
  dailyNoteDate: null,
  subtaskCount: 0,
  subtaskCompletedCount: 0,
  ...overrides,
});

describe('RecurrenceCoordinator', () => {
  let coordinator: RecurrenceCoordinator;
  let mockTask: Task;

  beforeEach(() => {
    jest.clearAllMocks();
    mockParser.getDateLineType.mockReturnValue(undefined);
    coordinator = new RecurrenceCoordinator(
      mockPlugin,
      mockTaskStateManager,
      keywordManager,
      {},
    );
    mockTask = createMockTask();
  });

  afterEach(() => {
    coordinator.destroy();
  });

  describe('scheduleRecurrence', () => {
    it('should schedule a recurrence update for a task', () => {
      const task = createMockTask();

      expect(() => coordinator.scheduleRecurrence(task, 3000)).not.toThrow();
    });

    it('should cancel existing timeout for the same task', () => {
      const task = createMockTask();

      coordinator.scheduleRecurrence(task, 3000);
      coordinator.scheduleRecurrence(task, 5000);
    });

    it('should use default delay if not provided', () => {
      const task = createMockTask();

      expect(() => coordinator.scheduleRecurrence(task)).not.toThrow();
    });

    it('should handle multiple tasks', () => {
      const task1 = createMockTask({ path: 'test1.md', line: 0 });
      const task2 = createMockTask({ path: 'test2.md', line: 0 });

      coordinator.scheduleRecurrence(task1);
      coordinator.scheduleRecurrence(task2);
    });

    it('should call setTimeout with the provided delay', () => {
      const spy = jest.spyOn(window, 'setTimeout').mockReturnValue(42 as never);
      const task = createMockTask();

      coordinator.scheduleRecurrence(task, 3000);

      expect(spy).toHaveBeenCalledWith(expect.any(Function), 3000);
      spy.mockRestore();
    });

    it('should store the timeout in the internal map', () => {
      const task1 = createMockTask({ path: 'a.md', line: 0 });
      const task2 = createMockTask({ path: 'b.md', line: 5 });

      coordinator.scheduleRecurrence(task1);
      coordinator.scheduleRecurrence(task2);

      const timeouts = (coordinator as any).recurrenceTimeouts as Map<
        string,
        number
      >;
      expect(timeouts.has('a.md:0')).toBe(true);
      expect(timeouts.has('b.md:5')).toBe(true);
      expect(timeouts.size).toBe(2);
    });

    it('should cancel previous timeout when re-scheduling the same task', () => {
      const clearTimeoutSpy = jest.spyOn(window, 'clearTimeout');
      const task = createMockTask({ path: 'test.md', line: 0 });

      coordinator.scheduleRecurrence(task, 3000);
      coordinator.scheduleRecurrence(task, 5000);

      expect(clearTimeoutSpy).toHaveBeenCalledTimes(1);
      clearTimeoutSpy.mockRestore();
    });

    it('should fire timeout callback and clean up map entry', () => {
      const setTimeoutSpy = jest.spyOn(window, 'setTimeout');
      const performSpy = jest
        .spyOn(RecurrenceCoordinator.prototype, 'performRecurrenceUpdate')
        .mockResolvedValue({ success: true });

      const task = createMockTask({
        scheduledDateRepeat: null,
        deadlineDateRepeat: null,
      });
      coordinator.scheduleRecurrence(task, 50);

      const timeouts = (coordinator as any).recurrenceTimeouts as Map<
        string,
        number
      >;
      expect(timeouts.has('test.md:0')).toBe(true);

      const callback = setTimeoutSpy.mock.calls[0][0] as () => void;
      callback();

      expect(timeouts.has('test.md:0')).toBe(false);
      expect(performSpy).toHaveBeenCalledWith(task);

      performSpy.mockRestore();
      setTimeoutSpy.mockRestore();
    });
  });

  describe('cancelRecurrence', () => {
    it('should cancel a pending recurrence update', () => {
      const task = createMockTask();

      coordinator.scheduleRecurrence(task);
      coordinator.cancelRecurrence(task);
    });

    it('should do nothing if no pending recurrence exists', () => {
      const task = createMockTask();

      expect(() => coordinator.cancelRecurrence(task)).not.toThrow();
    });

    it('should call clearTimeout when canceling', () => {
      const clearTimeoutSpy = jest.spyOn(window, 'clearTimeout');
      const task = createMockTask();

      coordinator.scheduleRecurrence(task);
      coordinator.cancelRecurrence(task);

      expect(clearTimeoutSpy).toHaveBeenCalled();
      clearTimeoutSpy.mockRestore();
    });
  });

  describe('performRecurrenceUpdate', () => {
    it('should return error when task has no repeat dates', async () => {
      const task = createMockTask({
        scheduledDateRepeat: null,
        deadlineDateRepeat: null,
      });

      const result = await coordinator.performRecurrenceUpdate(task);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Task has no repeat dates');
    });

    it('should handle errors gracefully', async () => {
      (mockApp.vault.read as jest.Mock).mockImplementationOnce(() =>
        Promise.reject(new Error('Read error')),
      );

      const result = await coordinator.performRecurrenceUpdate(mockTask);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should return success for scheduled date recurrence', async () => {
      const mockUpdateCoordinator = {
        updateTaskRecurrence: jest.fn().mockResolvedValue(undefined),
      };
      coordinator.setTaskUpdateCoordinator(mockUpdateCoordinator as any);
      mockParser.getDateLineType.mockReturnValue('scheduled');

      const task = createMockTask({
        scheduledDateRepeat: { type: '+', unit: 'w', value: 1, raw: '+1w' },
        deadlineDateRepeat: null,
      });

      const result = await coordinator.performRecurrenceUpdate(task);

      expect(result.success).toBe(true);
    });

    it('should return success for deadline date recurrence', async () => {
      const mockUpdateCoordinator = {
        updateTaskRecurrence: jest.fn().mockResolvedValue(undefined),
      };
      coordinator.setTaskUpdateCoordinator(mockUpdateCoordinator as any);
      mockParser.getDateLineType.mockReturnValue('deadline');

      (mockApp.vault.read as jest.Mock).mockResolvedValueOnce(
        '- [x] Test task\nDEADLINE: <2024-01-01 Mon +1w>',
      );

      const task = createMockTask({
        scheduledDateRepeat: null,
        scheduledDate: null,
        deadlineDate: new Date('2024-01-01'),
        deadlineDateRepeat: { type: '+', unit: 'w', value: 1, raw: '+1w' },
      });

      const result = await coordinator.performRecurrenceUpdate(task);

      expect(result.success).toBe(true);
    });

    it('should return success for both scheduled and deadline recurrence', async () => {
      const mockUpdateCoordinator = {
        updateTaskRecurrence: jest.fn().mockResolvedValue(undefined),
      };
      coordinator.setTaskUpdateCoordinator(mockUpdateCoordinator as any);
      mockParser.getDateLineType.mockImplementation(
        (line: string, _indent: string) => {
          if (line.includes('SCHEDULED')) return 'scheduled';
          if (line.includes('DEADLINE')) return 'deadline';
          return null;
        },
      );

      (mockApp.vault.read as jest.Mock).mockResolvedValueOnce(
        [
          '- [x] Test task',
          'SCHEDULED: <2024-01-01 Mon +1w>',
          'DEADLINE: <2024-01-08 Mon +1w>',
        ].join('\n'),
      );

      const task = createMockTask({
        scheduledDateRepeat: { type: '+', unit: 'w', value: 1, raw: '+1w' },
        deadlineDate: new Date('2024-01-08'),
        deadlineDateRepeat: { type: '+', unit: 'w', value: 1, raw: '+1w' },
      });

      const result = await coordinator.performRecurrenceUpdate(task);

      expect(result.success).toBe(true);
      expect(mockUpdateCoordinator.updateTaskRecurrence).toHaveBeenCalledTimes(
        1,
      );
    });

    it('should return error when task line exceeds file line count', async () => {
      const task = createMockTask({ line: 10 });

      (mockApp.vault.read as jest.Mock).mockResolvedValueOnce('Only one line');

      const result = await coordinator.performRecurrenceUpdate(task);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Task line out of bounds');
    });

    it('should return error when parser is not available', async () => {
      (mockApp.plugins.getPlugin as jest.Mock).mockReturnValueOnce({
        vaultScanner: {
          getParser: () => null,
        },
      });

      const result = await coordinator.performRecurrenceUpdate(mockTask);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Parser not available for recurrence update');
    });

    it('should return error when no dates need updating', async () => {
      const mockUpdateCoordinator = {
        updateTaskRecurrence: jest.fn(),
      };
      coordinator.setTaskUpdateCoordinator(mockUpdateCoordinator as any);

      const result = await coordinator.performRecurrenceUpdate(mockTask);

      expect(result.success).toBe(false);
      expect(result.error).toBe('No dates needed updating');
      expect(mockUpdateCoordinator.updateTaskRecurrence).not.toHaveBeenCalled();
    });

    it('should return error when file is not found', async () => {
      (mockApp.vault.getAbstractFileByPath as jest.Mock).mockReturnValueOnce(
        null,
      );

      const result = await coordinator.performRecurrenceUpdate(mockTask);

      expect(result.success).toBe(false);
      expect(result.error).toContain('File not found');
    });

    it('should pass correct parameters to updateTaskRecurrence', async () => {
      const mockUpdateCoordinator = {
        updateTaskRecurrence: jest.fn().mockResolvedValue(undefined),
      };
      coordinator.setTaskUpdateCoordinator(mockUpdateCoordinator as any);
      mockParser.getDateLineType.mockReturnValue('scheduled');

      const repeatWeekly = {
        type: '+' as const,
        unit: 'w' as const,
        value: 1,
        raw: '+1w',
      };

      const task = createMockTask({
        scheduledDateRepeat: repeatWeekly,
        deadlineDateRepeat: null,
      });

      await coordinator.performRecurrenceUpdate(task);

      expect(mockUpdateCoordinator.updateTaskRecurrence).toHaveBeenCalledWith(
        task,
        expect.objectContaining({
          newScheduledDate: expect.any(Date),
          newDeadlineDate: null,
          newScheduledRepeat: repeatWeekly,
          newDeadlineRepeat: null,
          newStateForRecurrence: 'TODO',
        }),
      );
    });
  });

  describe('destroy', () => {
    it('should clean up all pending recurrences', () => {
      const task1 = createMockTask({ path: 'test1.md', line: 0 });
      const task2 = createMockTask({ path: 'test2.md', line: 0 });

      coordinator.scheduleRecurrence(task1);
      coordinator.scheduleRecurrence(task2);

      expect(() => coordinator.destroy()).not.toThrow();
    });

    it('should clear all timeouts', () => {
      const clearTimeoutSpy = jest.spyOn(window, 'clearTimeout');

      const task1 = createMockTask({ path: 'test1.md', line: 0 });
      const task2 = createMockTask({ path: 'test2.md', line: 0 });

      coordinator.scheduleRecurrence(task1);
      coordinator.scheduleRecurrence(task2);

      coordinator.destroy();

      expect(clearTimeoutSpy).toHaveBeenCalledTimes(2);
      clearTimeoutSpy.mockRestore();
    });
  });

  describe('getTaskKey', () => {
    it('should create unique keys for different tasks', () => {
      const task1 = createMockTask({ path: 'test1.md', line: 0 });
      const task2 = createMockTask({ path: 'test2.md', line: 0 });
      const task3 = createMockTask({ path: 'test1.md', line: 5 });

      const keys = [
        coordinator['getTaskKey'](task1),
        coordinator['getTaskKey'](task2),
        coordinator['getTaskKey'](task3),
      ];

      expect(new Set(keys).size).toBe(3);
    });

    it('should create same key for same task', () => {
      const task = createMockTask({ path: 'test.md', line: 3 });

      const key1 = coordinator['getTaskKey'](task);
      const key2 = coordinator['getTaskKey'](task);

      expect(key1).toBe(key2);
    });
  });

  describe('setTaskUpdateCoordinator', () => {
    it('should set the task update coordinator reference', () => {
      const mockTuc = { updateTaskRecurrence: jest.fn() };

      coordinator.setTaskUpdateCoordinator(mockTuc as any);

      expect((coordinator as any).taskUpdateCoordinator).toBe(mockTuc);
    });
  });

  describe('setKeywordManager', () => {
    it('should update keyword manager on the coordinator', () => {
      const newKeywordManager = createTestKeywordManager();

      coordinator.setKeywordManager(newKeywordManager);

      expect((coordinator as any).keywordManager).toBe(newKeywordManager);
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // calculateNextDates — pure recurrence date math
  // (migrated from tests/recurrence-manager.test.ts)
  // ─────────────────────────────────────────────────────────────────────
  describe('calculateNextDates', () => {
    const mockParserLocal = {
      getDateLineType: jest.fn(),
    };

    beforeEach(() => {
      // Default to "no detection" so tests that don't care don't accidentally
      // hit a stale scheduled/deadline return from a previous case.
      mockParserLocal.getDateLineType.mockReturnValue(null);
    });

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
        indent: '',
        listMarker: '',
        isDailyNote: false,
        dailyNoteDate: null,
        subtaskCount: 0,
        subtaskCompletedCount: 0,
        closedDate: null,
      };

      const lines = ['TODO task', '  SCHEDULED: <2026-03-10>'];
      const result = coordinator.calculateNextDates(
        task,
        lines,
        mockParserLocal,
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
        indent: '',
        listMarker: '',
        isDailyNote: false,
        dailyNoteDate: null,
        subtaskCount: 0,
        subtaskCompletedCount: 0,
        closedDate: null,
      };

      mockParserLocal.getDateLineType.mockReturnValue('scheduled');
      const lines = ['DONE task', '  SCHEDULED: <2026-03-10>'];
      const result = coordinator.calculateNextDates(
        task,
        lines,
        mockParserLocal,
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
        indent: '',
        listMarker: '',
        isDailyNote: false,
        dailyNoteDate: null,
        subtaskCount: 0,
        subtaskCompletedCount: 0,
        closedDate: null,
      };

      mockParserLocal.getDateLineType.mockReturnValue('deadline');
      const lines = ['DONE task', '  DEADLINE: <2026-03-10>'];
      const result = coordinator.calculateNextDates(
        task,
        lines,
        mockParserLocal,
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
        indent: '',
        listMarker: '',
        isDailyNote: false,
        dailyNoteDate: null,
        subtaskCount: 0,
        subtaskCompletedCount: 0,
        closedDate: null,
      };

      mockParserLocal.getDateLineType
        .mockReturnValueOnce('scheduled')
        .mockReturnValueOnce('deadline');
      const lines = [
        'DONE task',
        '  SCHEDULED: <2026-03-10> +1d>',
        '  DEADLINE: <2026-03-10> +1w>',
      ];
      const result = coordinator.calculateNextDates(
        task,
        lines,
        mockParserLocal,
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
        indent: '',
        listMarker: '',
        isDailyNote: false,
        dailyNoteDate: null,
        subtaskCount: 0,
        subtaskCompletedCount: 0,
        closedDate: null,
      };

      mockParserLocal.getDateLineType.mockReturnValue('scheduled');
      const lines = ['DONE task', '  SCHEDULED: <2026-03-10>'];
      const result = coordinator.calculateNextDates(
        task,
        lines,
        mockParserLocal,
      );

      expect(mockParserLocal.getDateLineType).toHaveBeenCalled();
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
        listMarker: '',
        isDailyNote: false,
        dailyNoteDate: null,
        subtaskCount: 0,
        subtaskCompletedCount: 0,
        closedDate: null,
      };

      mockParserLocal.getDateLineType.mockReturnValue('scheduled');

      // File content matching the integration test fixture.
      const lines = [
        '# Recurrence Test',
        '',
        '- [ ] TODO Recurring daily task',
        '  SCHEDULED: <2026-06-15 Mon +1d>',
        '',
      ];

      coordinator.calculateNextDates(task, lines, mockParserLocal);

      // The parser should be called with taskIndent = '' (the actual
      // leading whitespace), NOT 6 spaces from the old keyword-position
      // calculation.
      const calls = mockParserLocal.getDateLineType.mock.calls;
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
        listMarker: '',
        isDailyNote: false,
        dailyNoteDate: null,
        subtaskCount: 0,
        subtaskCompletedCount: 0,
        closedDate: null,
      };

      mockParserLocal.getDateLineType.mockReturnValue('scheduled');

      const lines = [
        '# Test',
        '',
        '  - [ ] TODO Indented task',
        '    SCHEDULED: <2026-06-15 Mon +1d>',
        '',
      ];

      coordinator.calculateNextDates(task, lines, mockParserLocal);

      const calls = mockParserLocal.getDateLineType.mock.calls;
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
        listMarker: '',
        isDailyNote: false,
        dailyNoteDate: null,
        subtaskCount: 0,
        subtaskCompletedCount: 0,
        closedDate: null,
      };

      mockParserLocal.getDateLineType.mockReturnValue('scheduled');

      const lines = ['DONE task', '  SCHEDULED: <2026-03-10>'];

      coordinator.calculateNextDates(task, lines, mockParserLocal);

      const calls = mockParserLocal.getDateLineType.mock.calls;
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
        indent: '',
        listMarker: '',
        isDailyNote: false,
        dailyNoteDate: null,
        subtaskCount: 0,
        subtaskCompletedCount: 0,
        closedDate: null,
      };

      mockParserLocal.getDateLineType.mockReturnValue('scheduled');
      const lines = ['DONE task', '  SCHEDULED: <2026-03-10 Mon +1w --2d>'];
      const result = coordinator.calculateNextDates(
        task,
        lines,
        mockParserLocal,
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
        indent: '',
        listMarker: '',
        isDailyNote: false,
        dailyNoteDate: null,
        subtaskCount: 0,
        subtaskCompletedCount: 0,
        closedDate: null,
      };

      mockParserLocal.getDateLineType.mockReturnValue('scheduled');
      const lines = ['DONE task', '  SCHEDULED: <2026-03-10 Mon +1w -3d>'];
      const result = coordinator.calculateNextDates(
        task,
        lines,
        mockParserLocal,
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
        indent: '',
        listMarker: '',
        isDailyNote: false,
        dailyNoteDate: null,
        subtaskCount: 0,
        subtaskCompletedCount: 0,
        closedDate: null,
      };

      mockParserLocal.getDateLineType.mockReturnValue('scheduled');
      const lines = ['DONE task', '  SCHEDULED: <2026-03-10 Mon +1w>'];
      const result = coordinator.calculateNextDates(
        task,
        lines,
        mockParserLocal,
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
        indent: '',
        listMarker: '',
        isDailyNote: false,
        dailyNoteDate: null,
        subtaskCount: 0,
        subtaskCompletedCount: 0,
        closedDate: null,
      };

      mockParserLocal.getDateLineType.mockReturnValue('deadline');
      const lines = ['DONE task', '  DEADLINE: <2026-03-10 Mon +1w --1w>'];
      const result = coordinator.calculateNextDates(
        task,
        lines,
        mockParserLocal,
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
        indent: '',
        listMarker: '',
        isDailyNote: false,
        dailyNoteDate: null,
        subtaskCount: 0,
        subtaskCompletedCount: 0,
        closedDate: null,
      };

      mockParserLocal.getDateLineType.mockReturnValue('deadline');
      const lines = ['DONE task', '  DEADLINE: <2026-03-10 Mon +1w -5d>'];
      const result = coordinator.calculateNextDates(
        task,
        lines,
        mockParserLocal,
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
        indent: '',
        listMarker: '',
        isDailyNote: false,
        dailyNoteDate: null,
        subtaskCount: 0,
        subtaskCompletedCount: 0,
        closedDate: null,
      };

      mockParserLocal.getDateLineType.mockReturnValue('deadline');
      const lines = ['DONE task', '  DEADLINE: <2026-03-10 Mon +1w>'];
      const result = coordinator.calculateNextDates(
        task,
        lines,
        mockParserLocal,
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
        indent: '',
        listMarker: '',
        isDailyNote: false,
        dailyNoteDate: null,
        subtaskCount: 0,
        subtaskCompletedCount: 0,
        closedDate: null,
      };

      mockParserLocal.getDateLineType
        .mockReturnValueOnce('scheduled')
        .mockReturnValueOnce('deadline');
      const lines = [
        'DONE task',
        '  SCHEDULED: <2026-03-10 Mon +1w --2d>',
        '  DEADLINE: <2026-03-10 Mon +1w --5d>',
      ];
      const result = coordinator.calculateNextDates(
        task,
        lines,
        mockParserLocal,
      );

      expect(result.updated).toBe(true);
      expect(result.newScheduledWarningPeriod).toBeNull();
      expect(result.newDeadlineWarningPeriod).toBeNull();
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // getFileContent — live editor buffer preference. Previously read only
  // from on-disk (vault.read()), which silently destroyed any unsaved edits
  // the user made while the 50ms-delayed recurrence fired. Now reads from
  // the active source-mode editor buffer when available, falling back to
  // vault.read() otherwise.
  // ─────────────────────────────────────────────────────────────────────
  describe('getFileContent prefers live editor buffer', () => {
    /**
     * Build a real MarkdownView-shaped leaf whose editor.getValue() returns
     * `content`. The view is an actual `MarkdownView` instance so the
     * `view instanceof MarkdownView` guard inside `getLiveEditorBuffer`
     * recognizes it; the editor mock is wired onto its `editor` slot.
     */
    const buildLeaf = (params: {
      path: string;
      content: string;
      mode?: 'source' | 'preview';
    }) => {
      const editor = {
        getValue: jest.fn().mockReturnValue(params.content),
      };
      const view = new MarkdownView();
      view.file = new TFile(params.path, params.path, 'md');
      view.editor = editor;
      if (params.mode && params.mode !== 'source') {
        view.getMode = jest.fn().mockReturnValue(params.mode);
      }
      return { leaf: { view }, editor, view };
    };

    beforeEach(() => {
      // Each new test sets up its own workspace mock; start from a clean slate.
      (mockApp as Record<string, unknown>).workspace = {
        getLeavesOfType: jest.fn(),
      };
    });

    afterEach(() => {
      delete (mockApp as Record<string, unknown>).workspace;
    });

    it('reads from the editor buffer when the file is open in a source-mode MarkdownView', async () => {
      const editorBuffer =
        '- [x] Test task\n  SCHEDULED: <2024-01-01 Mon +1w>\n';
      const { leaf } = buildLeaf({
        path: 'test.md',
        content: editorBuffer,
      });
      (mockApp.workspace.getLeavesOfType as jest.Mock).mockReturnValue([leaf]);

      const mockUpdateCoordinator = {
        updateTaskRecurrence: jest.fn().mockResolvedValue(undefined),
      };
      coordinator.setTaskUpdateCoordinator(mockUpdateCoordinator as any);
      mockParser.getDateLineType.mockReturnValue('scheduled');

      // calculateNextRepeatDate expects a structured DateRepeatInfo, not the
      // loose string '+1w' carried by the default mockTask.
      const task = createMockTask({
        scheduledDateRepeat: { type: '+', unit: 'w', value: 1, raw: '+1w' },
        deadlineDateRepeat: null,
      });

      const result = await coordinator.performRecurrenceUpdate(task);

      expect(result.success).toBe(true);
      // On-disk read must NOT have been called when the editor buffer is
      // authoritative — otherwise we would lose unsaved edits at write-back.
      expect(mockApp.vault.read).not.toHaveBeenCalled();
    });

    it('falls back to vault.read() when no markdown leaf has this file', async () => {
      const { leaf: otherLeaf } = buildLeaf({
        path: 'other.md',
        content: 'unrelated',
      });
      (mockApp.workspace.getLeavesOfType as jest.Mock).mockReturnValue([
        otherLeaf,
      ]);

      const mockUpdateCoordinator = {
        updateTaskRecurrence: jest.fn().mockResolvedValue(undefined),
      };
      coordinator.setTaskUpdateCoordinator(mockUpdateCoordinator as any);
      mockParser.getDateLineType.mockReturnValue('scheduled');

      await coordinator.performRecurrenceUpdate(mockTask);

      // Disk read should happen because no source-mode editor has 'test.md'.
      expect(mockApp.vault.read).toHaveBeenCalledTimes(1);
    });

    it('falls back to vault.read() when the matching leaf is in preview mode', async () => {
      // The file is open only as a reading view — the editor buffer is not
      // authoritative there, so we should not trust it.
      const { leaf } = buildLeaf({
        path: 'test.md',
        content: 'preview-rendered-content-not-source',
        mode: 'preview',
      });
      (mockApp.workspace.getLeavesOfType as jest.Mock).mockReturnValue([leaf]);

      const mockUpdateCoordinator = {
        updateTaskRecurrence: jest.fn().mockResolvedValue(undefined),
      };
      coordinator.setTaskUpdateCoordinator(mockUpdateCoordinator as any);
      mockParser.getDateLineType.mockReturnValue('scheduled');

      await coordinator.performRecurrenceUpdate(mockTask);

      expect(mockApp.vault.read).toHaveBeenCalledTimes(1);
    });

    it('falls back to vault.read() when getLeavesOfType returns no leaves', async () => {
      (mockApp.workspace.getLeavesOfType as jest.Mock).mockReturnValue([]);

      const mockUpdateCoordinator = {
        updateTaskRecurrence: jest.fn().mockResolvedValue(undefined),
      };
      coordinator.setTaskUpdateCoordinator(mockUpdateCoordinator as any);
      mockParser.getDateLineType.mockReturnValue('scheduled');

      await coordinator.performRecurrenceUpdate(mockTask);

      expect(mockApp.vault.read).toHaveBeenCalledTimes(1);
    });

    it('uses the editor buffer from the first matching source leaf when the file is open in multiple panes', async () => {
      const firstBuffer =
        '- [x] Test task\n  SCHEDULED: <2024-01-01 Mon +1w>\n';
      const secondBuffer =
        '- [x] Test task\n  SCHEDULED: <2099-01-01 Mon +1w>\n';
      const first = buildLeaf({ path: 'test.md', content: firstBuffer });
      const second = buildLeaf({ path: 'test.md', content: secondBuffer });
      (mockApp.workspace.getLeavesOfType as jest.Mock).mockReturnValue([
        first.leaf,
        second.leaf,
      ]);

      const mockUpdateCoordinator = {
        updateTaskRecurrence: jest.fn().mockResolvedValue(undefined),
      };
      coordinator.setTaskUpdateCoordinator(mockUpdateCoordinator as any);
      mockParser.getDateLineType.mockReturnValue('scheduled');

      // Use the first buffer's SCHEDULED date so calculateNextDates picks
      // the right hint and returns success.
      const task = createMockTask({
        scheduledDate: new Date('2024-01-01'),
        scheduledDateRepeat: { type: '+', unit: 'w', value: 1, raw: '+1w' },
        deadlineDateRepeat: null,
      });

      const result = await coordinator.performRecurrenceUpdate(task);

      expect(result.success).toBe(true);
      // First pane was consulted (its buffer is used); second pane is left
      // alone — disk write-back through TaskWriter will refresh both.
      expect(first.editor.getValue).toHaveBeenCalled();
      expect(second.editor.getValue).not.toHaveBeenCalled();
      expect(mockApp.vault.read).not.toHaveBeenCalled();
    });

    it('falls back to vault.read() when the matching MarkdownView has no usable editor.getValue()', async () => {
      // Real-world scenario: the buffer wouldn't crash on a missing getter;
      // guard with a typeof check.
      const view = new MarkdownView();
      view.file = new TFile('test.md', 'test.md', 'md');
      view.editor = {/* no getValue */};
      (mockApp.workspace.getLeavesOfType as jest.Mock).mockReturnValue([
        { view },
      ]);

      const mockUpdateCoordinator = {
        updateTaskRecurrence: jest.fn().mockResolvedValue(undefined),
      };
      coordinator.setTaskUpdateCoordinator(mockUpdateCoordinator as any);
      mockParser.getDateLineType.mockReturnValue('scheduled');

      await coordinator.performRecurrenceUpdate(mockTask);

      expect(mockApp.vault.read).toHaveBeenCalledTimes(1);
    });

    it('preserves on-disk fallback behavior when app.workspace is undefined (legacy mock)', async () => {
      // Existing tests in this file define mockApp WITHOUT workspace.
      // This regression guard ensures the end-to-end getFileContent →
      // vault.read() path still works when workspace is missing.
      delete (mockApp as Record<string, unknown>).workspace;

      const mockUpdateCoordinator = {
        updateTaskRecurrence: jest.fn().mockResolvedValue(undefined),
      };
      coordinator.setTaskUpdateCoordinator(mockUpdateCoordinator as any);
      mockParser.getDateLineType.mockReturnValue('scheduled');

      // Use structured repeat so calculateNextDates can compute a next
      // occurrence (the default mockTask carries the loose string '+1w').
      const task = createMockTask({
        scheduledDateRepeat: { type: '+', unit: 'w', value: 1, raw: '+1w' },
        deadlineDateRepeat: null,
      });

      const result = await coordinator.performRecurrenceUpdate(task);

      expect(result.success).toBe(true);
      expect(mockApp.vault.read).toHaveBeenCalledTimes(1);
    });
  });
});
