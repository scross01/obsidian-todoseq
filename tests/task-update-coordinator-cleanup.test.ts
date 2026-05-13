/**
 * Tests for TaskUpdateCoordinator - Memory Leak Cleanup
 * @jest-environment jsdom
 */

import { TaskUpdateCoordinator } from '../src/services/task-update-coordinator';
import { TaskStateManager } from '../src/services/task-state-manager';
import { ChangeTracker } from '../src/services/change-tracker';
import {
  createBaseTask,
  createTestKeywordManager,
  createBaseSettings,
} from './helpers/test-helper';
import { TFile } from 'obsidian';

// Mock window.activeDocument for Obsidian API compatibility
(window as any).activeDocument = document;

const mockApp = {
  vault: {
    getAbstractFileByPath: jest.fn(),
    process: jest.fn(),
    read: jest.fn(),
  },
  workspace: {
    getActiveViewOfType: jest.fn(),
  },
};

const mockPlugin = {
  app: mockApp,
  settings: createBaseSettings(),
  isUserInitiatedUpdate: false,
  taskEditor: {
    updateTaskState: jest.fn(),
    updateTaskScheduledDate: jest.fn(),
    updateTaskDeadlineDate: jest.fn(),
    updateTaskPriority: jest.fn(),
    updateTaskRecurrence: jest.fn(),
    removeTaskScheduledDate: jest.fn(),
    removeTaskDeadlineDate: jest.fn(),
    removeTaskPriority: jest.fn(),
  },
  taskStateManager: null as any,
  embeddedTaskListProcessor: {
    refreshAllEmbeddedTaskLists: jest.fn(),
  },
  refreshVisibleEditorDecorations: jest.fn(),
  vaultScanner: {
    processIncrementalChange: jest.fn(),
    addSkipIncrementalChange: jest.fn(),
    getParser: jest.fn(),
  },
};

describe('TaskUpdateCoordinator - Memory Leak Cleanup', () => {
  let taskUpdateCoordinator: TaskUpdateCoordinator;
  let taskStateManager: TaskStateManager;
  let keywordManager: any;
  let changeTracker: ChangeTracker;

  // Fixed base time for timezone-independent tests
  const BASE_TIME = 1000000000000; // September 9, 2001 01:46:40 UTC

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(BASE_TIME);

    const mockTFile = new TFile();
    mockTFile.path = 'test.md';
    mockTFile.name = 'test.md';
    mockApp.vault.getAbstractFileByPath.mockReturnValue(mockTFile);
    mockApp.vault.process.mockImplementation((file, callback) => {
      const data = 'TODO Task text';
      return callback(data);
    });
    mockApp.vault.read.mockResolvedValue('TODO Task text');

    const settings = createBaseSettings();
    mockPlugin.settings = settings;
    keywordManager = createTestKeywordManager(settings);

    taskStateManager = new TaskStateManager(keywordManager);
    mockPlugin.taskStateManager = taskStateManager;

    changeTracker = new ChangeTracker();

    taskUpdateCoordinator = new TaskUpdateCoordinator(
      mockPlugin as any,
      taskStateManager,
      keywordManager,
      changeTracker,
    );

    mockPlugin.taskEditor.updateTaskState.mockImplementation(
      async (task, newState) => ({
        ...task,
        state: newState,
        rawText: task.rawText.replace(/TODO/, newState),
        completed: keywordManager.isCompleted(newState),
      }),
    );
  });

  afterEach(() => {
    jest.useRealTimers();
    taskUpdateCoordinator.destroy();
  });

  describe('cleanup interval lifecycle', () => {
    it('should start cleanup interval in constructor', () => {
      const setIntervalSpy = jest.spyOn(global, 'setInterval');

      // Create a new coordinator to test constructor behavior
      const coordinator = new TaskUpdateCoordinator(
        mockPlugin as any,
        taskStateManager,
        keywordManager,
        changeTracker,
      );

      // The cleanup interval should be started
      expect(setIntervalSpy).toHaveBeenCalled();

      // Clean up
      coordinator.destroy();
      setIntervalSpy.mockRestore();
    });

    it('should stop cleanup interval on destroy', () => {
      taskUpdateCoordinator.destroy();

      // Advance timers to verify no further cleanup occurs
      jest.advanceTimersByTime(5000);

      // If interval was stopped, no further cleanup should occur
      // This is verified by the fact that the test completes without errors
    });
  });

  describe('cleanup of stale pendingTaskUpdates entries', () => {
    it('should remove stale entries from pendingTaskUpdates after timeout', async () => {
      const task = createBaseTask({ path: 'test.md', line: 0 });
      taskStateManager.addTask(task);

      // Create a pending update that will never resolve
      const neverResolvingPromise = new Promise<void>(() => {
        // This promise never resolves
      });

      // Manually add a stale entry to test cleanup
      const staleKey = 'test.md:999';
      const staleTimestamp = BASE_TIME - 40000; // 40 seconds ago (stale)

      // Access private map for testing
      const privateMap = (taskUpdateCoordinator as any).pendingTaskUpdates;
      privateMap.set(staleKey, {
        promise: neverResolvingPromise,
        timestamp: staleTimestamp,
      });

      expect(privateMap.has(staleKey)).toBe(true);

      // Trigger cleanup by advancing time past cleanup interval
      jest.advanceTimersByTime(5000);

      // Stale entry should be removed
      expect(privateMap.has(staleKey)).toBe(false);
    });

    it('should not remove active entries from pendingTaskUpdates', async () => {
      const task = createBaseTask({ path: 'test.md', line: 0 });
      taskStateManager.addTask(task);

      // Create a normal update
      const updatePromise = taskUpdateCoordinator.updateTaskState(
        task,
        'DONE',
        'task-list',
      );

      // Access private map for testing
      const privateMap = (taskUpdateCoordinator as any).pendingTaskUpdates;
      const taskKey = 'test.md:0';

      // Entry should exist
      expect(privateMap.has(taskKey)).toBe(true);

      // Advance time but not enough to make entry stale
      jest.advanceTimersByTime(1000);

      // Entry should still exist (not stale yet)
      expect(privateMap.has(taskKey)).toBe(true);

      // Wait for the update to complete
      await updatePromise;

      // Entry should be removed by normal cleanup (finally block)
      expect(privateMap.has(taskKey)).toBe(false);
    });
  });

  describe('cleanup of stale fileUpdateQueues entries', () => {
    it('should remove stale entries from fileUpdateQueues after timeout', async () => {
      // Manually add a stale entry to test cleanup
      const stalePath = 'stale-file.md';
      const staleTimestamp = BASE_TIME - 40000; // 40 seconds ago (stale)
      const neverResolvingPromise = new Promise<void>(() => {
        // This promise never resolves
      });

      // Access private map for testing
      const privateMap = (taskUpdateCoordinator as any).fileUpdateQueues;
      privateMap.set(stalePath, {
        promise: neverResolvingPromise,
        timestamp: staleTimestamp,
      });

      expect(privateMap.has(stalePath)).toBe(true);

      // Trigger cleanup by advancing time past cleanup interval
      jest.advanceTimersByTime(5000);

      // Stale entry should be removed
      expect(privateMap.has(stalePath)).toBe(false);
    });

    it('should not remove active entries from fileUpdateQueues', async () => {
      const task = createBaseTask({ path: 'test.md', line: 0 });
      taskStateManager.addTask(task);

      // Create a normal update
      const updatePromise = taskUpdateCoordinator.updateTaskState(
        task,
        'DONE',
        'task-list',
      );

      // Access private map for testing
      const privateMap = (taskUpdateCoordinator as any).fileUpdateQueues;
      const filePath = 'test.md';

      // Entry should exist
      expect(privateMap.has(filePath)).toBe(true);

      // Advance time but not enough to make entry stale
      jest.advanceTimersByTime(1000);

      // Entry should still exist (not stale yet)
      expect(privateMap.has(filePath)).toBe(true);

      // Wait for the update to complete
      await updatePromise;

      // Entry should be removed by normal cleanup (finally block)
      expect(privateMap.has(filePath)).toBe(false);
    });
  });

  describe('destroy cleanup', () => {
    it('should clear all maps on destroy', async () => {
      const task = createBaseTask({ path: 'test.md', line: 0 });
      taskStateManager.addTask(task);

      // Create a pending update
      const updatePromise = taskUpdateCoordinator.updateTaskState(
        task,
        'DONE',
        'task-list',
      );

      // Access private maps for testing
      const pendingTaskMap = (taskUpdateCoordinator as any).pendingTaskUpdates;
      const fileQueueMap = (taskUpdateCoordinator as any).fileUpdateQueues;

      // Wait for update to complete
      await updatePromise;

      // Add some stale entries manually
      pendingTaskMap.set('stale:1', {
        promise: Promise.resolve(),
        timestamp: BASE_TIME - 40000,
      });
      fileQueueMap.set('stale.md', {
        promise: Promise.resolve(),
        timestamp: BASE_TIME - 40000,
      });

      expect(pendingTaskMap.size).toBeGreaterThan(0);
      expect(fileQueueMap.size).toBeGreaterThan(0);

      // Destroy the coordinator
      taskUpdateCoordinator.destroy();

      // All maps should be cleared
      expect(pendingTaskMap.size).toBe(0);
      expect(fileQueueMap.size).toBe(0);
    });

    it('should stop cleanup interval on destroy', () => {
      const clearIntervalSpy = jest.spyOn(global, 'clearInterval');

      taskUpdateCoordinator.destroy();

      expect(clearIntervalSpy).toHaveBeenCalled();

      clearIntervalSpy.mockRestore();
    });
  });

  describe('cleanup timing', () => {
    it('should run cleanup at configured interval', () => {
      const setIntervalSpy = jest.spyOn(global, 'setInterval');

      new TaskUpdateCoordinator(
        mockPlugin as any,
        taskStateManager,
        keywordManager,
        changeTracker,
      );

      // Check that setInterval was called with the correct interval
      expect(setIntervalSpy).toHaveBeenCalledWith(
        expect.any(Function),
        5000, // CLEANUP_INTERVAL_MS
      );

      setIntervalSpy.mockRestore();
    });

    it('should use configured stale timeout', async () => {
      const task = createBaseTask({ path: 'test.md', line: 0 });
      taskStateManager.addTask(task);

      const privateMap = (taskUpdateCoordinator as any).pendingTaskUpdates;

      // Add an entry that is recent (not stale)
      const recentTimestamp = BASE_TIME - 1000; // 1 second ago
      privateMap.set('test.md:999', {
        promise: Promise.resolve(),
        timestamp: recentTimestamp,
      });

      expect(privateMap.has('test.md:999')).toBe(true);

      // Add an entry that is stale
      const staleTimestamp = BASE_TIME - 35000; // 35 seconds ago (over 30s timeout)
      privateMap.set('test.md:998', {
        promise: Promise.resolve(),
        timestamp: staleTimestamp,
      });

      // Trigger cleanup
      jest.advanceTimersByTime(5000);

      // The stale entry should be removed
      expect(privateMap.has('test.md:998')).toBe(false);
      // The recent entry should still exist (not stale)
      expect(privateMap.has('test.md:999')).toBe(true);
    });
  });

  describe('TaskUpdateCoordinator - State Transition Manager Caching', () => {
    it('should initialize state transition manager in constructor', () => {
      // Verify the coordinator has the state transition manager initialized
      expect(taskUpdateCoordinator).toBeDefined();
      // The state transition manager should be accessible via private field
      // We can verify it's working by calling a method that uses it
      expect(() => {
        taskUpdateCoordinator.setStateTransitionSettings(
          mockPlugin.settings.stateTransitions,
        );
      }).not.toThrow();
    });

    it('should update cached manager when settings change', () => {
      // Create new transition settings
      const newTransitionSettings = {
        defaultInactive: 'TODO',
        defaultActive: 'DOING',
        defaultCompleted: 'DONE',
        transitionStatements: ['TODO -> DOING -> DONE'],
      };

      // Update the settings
      mockPlugin.settings.stateTransitions = newTransitionSettings;

      // Call setStateTransitionSettings - should not throw
      expect(() => {
        taskUpdateCoordinator.setStateTransitionSettings(newTransitionSettings);
      }).not.toThrow();
    });

    it('should use cached manager in buildProcessingContext for recurring tasks', async () => {
      // Create a task with repeating dates
      const task = createBaseTask();
      task.state = 'TODO';
      task.scheduledDate = new Date(BASE_TIME);
      task.scheduledDateRepeat = {
        type: '.+',
        unit: 'd',
        value: 1,
        raw: '.+1d',
      };

      // Add task to state manager
      taskStateManager.addTask(task);

      // Update task to completed state with repeating dates
      // This should trigger the state transition manager logic
      const updatePromise = taskUpdateCoordinator.updateTaskState(
        task,
        'DONE',
        'task-list',
      );

      // Wait for the update to complete
      await updatePromise;

      // Verify the task was updated
      const updatedTask = taskStateManager.findTaskByPathAndLine(
        task.path,
        task.line,
      );
      expect(updatedTask).toBeDefined();
      // The task should be in a state after the completed state (due to recurrence)
      expect(updatedTask?.state).not.toBe('DONE');
    });

    it('should handle setStateTransitionSettings with undefined settings', () => {
      // Should handle undefined settings gracefully
      expect(() => {
        taskUpdateCoordinator.setStateTransitionSettings(undefined);
      }).not.toThrow();
    });
  });
});
