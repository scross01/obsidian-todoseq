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
const mockFile = {
  path: 'test.md',
  extension: 'md',
  name: 'test.md',
  stat: {
    mtime: Date.now(),
    ctime: Date.now(),
    size: 100,
  },
} as unknown as TFile;

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
  keywordManager: createTestKeywordManager(),
} as any;

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
  ...overrides,
});

describe('RecurrenceCoordinator', () => {
  let coordinator: RecurrenceCoordinator;
  let mockTask: Task;

  beforeEach(() => {
    jest.clearAllMocks();
    coordinator = new RecurrenceCoordinator(
      mockPlugin,
      mockTaskStateManager,
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
      const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout');

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
});
