/**
 * Unit tests for RecurrenceCoordinator
 */

import { RecurrenceCoordinator } from '../src/services/recurrence-coordinator';
import { TaskStateManager } from '../src/services/task-state-manager';
import { App, TFile } from 'obsidian';
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

    it('should propagate keyword manager to recurrence manager', () => {
      const newKeywordManager = createTestKeywordManager();
      const setKmSpy = jest.spyOn(
        (coordinator as any).recurrenceManager,
        'setKeywordManager',
      );

      coordinator.setKeywordManager(newKeywordManager);

      expect(setKmSpy).toHaveBeenCalledWith(newKeywordManager);
    });
  });
});
