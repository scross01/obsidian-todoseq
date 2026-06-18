/**
 * Regression tests for the fileUpdateQueues and pendingTaskUpdates promise chains
 * in TaskUpdateCoordinator.
 *
 * Bug: When a previously-stored promise rejected, the next chained update was
 * silently dropped because:
 *   - fileUpdateQueues used `.then(() => doAsyncWork())` (onFulfilled only)
 *   - pendingTaskUpdates used `await existingUpdate.promise` inside an async
 *     function, which propagates the rejection and aborts the new update.
 *
 * Fix: fileUpdateQueues now uses `.then(doAsyncWork, doAsyncWork)` and
 * pendingTaskUpdates wraps the await in try/catch so new work always runs.
 *
 * @jest-environment jsdom
 */

import { TaskUpdateCoordinator } from '../src/services/task-update-coordinator';
import { TaskStateManager } from '../src/services/task-state-manager';
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

describe('TaskUpdateCoordinator - rejection recovery in queues', () => {
  let coordinator: TaskUpdateCoordinator;
  let taskStateManager: TaskStateManager;
  let keywordManager: any;
  let finalizeSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();

    const mockTFile = new TFile();
    mockTFile.path = 'file.md';
    mockTFile.name = 'file.md';
    mockApp.vault.getAbstractFileByPath.mockReturnValue(mockTFile);
    mockApp.vault.read.mockResolvedValue('TODO Task text');

    const settings = createBaseSettings();
    mockPlugin.settings = settings;
    keywordManager = createTestKeywordManager(settings);
    taskStateManager = new TaskStateManager(keywordManager);
    mockPlugin.taskStateManager = taskStateManager;

    coordinator = new TaskUpdateCoordinator(
      mockPlugin as any,
      taskStateManager,
      keywordManager,
    );

    // Succeed at file write so the inner try/catch does NOT swallow our error
    mockPlugin.taskEditor.updateTaskState.mockImplementation(
      async (task, newState) => ({
        ...task,
        state: newState,
        rawText: task.rawText.replace(/TODO|DONE/, newState),
        completed: keywordManager.isCompleted(newState),
      }),
    );
  });

  afterEach(() => {
    coordinator.destroy();
  });

  /**
   * Force finalizeTaskState to throw on the FIRST call only.
   * finalizeTaskState runs AFTER the performFileWrite try/catch, so its
   * throw propagates out of doAsyncWork and rejects the queuePromise.
   * Returns the error message so callers can assert against it.
   */
  function setupFinalizeToThrowOnce(
    errorMessage = 'Forced rejection on first update',
  ): string {
    let calls = 0;
    finalizeSpy = jest
      .spyOn(coordinator, 'finalizeTaskState' as any)
      .mockImplementation(() => {
        calls++;
        if (calls === 1) {
          throw new Error(errorMessage);
        }
      });
    return errorMessage;
  }

  describe('per-file queue (fileUpdateQueues)', () => {
    it('runs the second file update after a rejected one for the same file', async () => {
      const { errorMessage } = setupFinalizeToThrowOnce();

      // Two tasks, same file, different lines so they hit different taskKeys
      // but the same fileUpdateQueues entry (per-file serialization).
      const task1 = createBaseTask({
        path: 'file.md',
        line: 0,
        state: 'TODO',
        rawText: 'TODO Task one',
      });
      const task2 = createBaseTask({
        path: 'file.md',
        line: 1,
        state: 'TODO',
        rawText: 'TODO Task two',
      });
      taskStateManager.addTask(task1);
      taskStateManager.addTask(task2);

      // Kick both updates off synchronously so both queue before either
      // performs its async phase.
      const p1 = coordinator.updateTaskState(task1, 'DONE', 'task-list');
      const p2 = coordinator.updateTaskState(task2, 'DONE', 'task-list');

      await expect(p1).rejects.toThrow(errorMessage);
      await expect(p2).resolves.toBeUndefined();

      // Most important assertion: the second update actually executed
      // doAsyncWork (i.e., reached finalizeTaskState). Without the fix,
      // finalizeTaskState was called exactly once.
      expect(finalizeSpy).toHaveBeenCalledTimes(2);
    });

    it('drops nothing across N updates when the first rejects', async () => {
      setupFinalizeToThrowOnce();
      const taskCount = 5;

      const tasks = Array.from({ length: taskCount }, (_, i) =>
        createBaseTask({
          path: 'file.md',
          line: i,
          state: 'TODO',
          rawText: `TODO Task ${i}`,
        }),
      );
      tasks.forEach((t) => taskStateManager.addTask(t));

      const promises = tasks.map((t) =>
        coordinator.updateTaskState(t, 'DONE', 'task-list'),
      );

      const settled = await Promise.allSettled(promises);

      // First update rejects; the others must all fulfil (not be dropped).
      expect(settled[0].status).toBe('rejected');
      expect(settled.slice(1).map((s) => s.status)).toEqual([
        'fulfilled',
        'fulfilled',
        'fulfilled',
        'fulfilled',
      ]);

      // All N reached finalizeTaskState (the post-file-write hook).
      expect(finalizeSpy).toHaveBeenCalledTimes(taskCount);
    });
  });

  describe('per-task queue (pendingTaskUpdates)', () => {
    it('runs the second update for the same task after the first rejected', async () => {
      const { errorMessage } = setupFinalizeToThrowOnce();

      // Same file, same line: hits both pendingTaskUpdates AND fileUpdateQueues.
      const task = createBaseTask({
        path: 'file.md',
        line: 0,
        state: 'TODO',
        rawText: 'TODO Same task',
      });
      taskStateManager.addTask(task);

      const p1 = coordinator.updateTaskState(task, 'DONE', 'task-list');
      const p2 = coordinator.updateTaskState(task, 'TODO', 'task-list');

      await expect(p1).rejects.toThrow(errorMessage);
      await expect(p2).resolves.toBeUndefined();

      expect(finalizeSpy).toHaveBeenCalledTimes(2);
    });

    it('cleans up pendingTaskUpdates and fileUpdateQueues maps after a rejection in the chain', async () => {
      setupFinalizeToThrowOnce();

      const task = createBaseTask({
        path: 'file.md',
        line: 0,
        state: 'TODO',
        rawText: 'TODO Same task',
      });
      taskStateManager.addTask(task);

      const p1 = coordinator
        .updateTaskState(task, 'DONE', 'task-list')
        .catch(() => undefined);
      const p2 = coordinator.updateTaskState(task, 'TODO', 'task-list');

      await p1;
      await p2;

      const pendingMap = (coordinator as any).pendingTaskUpdates as Map<
        string,
        unknown
      >;
      const fileQueueMap = (coordinator as any).fileUpdateQueues as Map<
        string,
        unknown
      >;

      // Both maps must be empty after the chained updates settle, otherwise
      // an unhandled rejection would lurk in a stale entry.
      expect(pendingMap.size).toBe(0);
      expect(fileQueueMap.size).toBe(0);
    });

    it("propagates the new (second) update's error to the caller while still swallowing the prior one", async () => {
      const firstError = 'Forced rejection on first update';
      const secondError = 'Forced rejection on second update';
      let calls = 0;
      jest
        .spyOn(coordinator, 'finalizeTaskState' as any)
        .mockImplementation(() => {
          calls++;
          if (calls === 1) throw new Error(firstError);
          if (calls === 2) throw new Error(secondError);
        });

      const task = createBaseTask({
        path: 'file.md',
        line: 0,
        state: 'TODO',
        rawText: 'TODO Same task',
      });
      taskStateManager.addTask(task);

      const p1 = coordinator.updateTaskState(task, 'DONE', 'task-list');
      const p2 = coordinator.updateTaskState(task, 'TODO', 'task-list');

      // First update rejects with first error.
      await expect(p1).rejects.toThrow(firstError);
      // Second update runs to completion AND its error propagates (we do
      // NOT accidentally swallow the new error). Without this guarantee
      // the fix would be a regression, hiding real failures.
      await expect(p2).rejects.toThrow(secondError);
    });
  });

  describe('error logging for diagnosability', () => {
    it('logs a debug message when swallowing a prior task-update rejection', async () => {
      const debugSpy = jest
        .spyOn(console, 'debug')
        .mockImplementation(() => undefined);

      setupFinalizeToThrowOnce();

      const task = createBaseTask({
        path: 'file.md',
        line: 0,
        state: 'TODO',
        rawText: 'TODO Same task',
      });
      taskStateManager.addTask(task);

      const p1 = coordinator
        .updateTaskState(task, 'DONE', 'task-list')
        .catch(() => undefined);
      const p2 = coordinator.updateTaskState(task, 'TODO', 'task-list');

      await p1;
      await p2;

      // The pendingTaskUpdates catch block should have logged the prior
      // rejection at debug level for future diagnosability.
      expect(debugSpy).toHaveBeenCalledWith(
        expect.stringContaining('Prior task-update rejected'),
        expect.any(Error),
      );

      debugSpy.mockRestore();
    });

    it('logs a debug message when swallowing a prior file-update rejection', async () => {
      const debugSpy = jest
        .spyOn(console, 'debug')
        .mockImplementation(() => undefined);

      setupFinalizeToThrowOnce();

      // Two tasks in the same file but different lines so the fileUpdateQueues
      // branch (not pendingTaskUpdates) is the one whose prior promise rejected.
      const task1 = createBaseTask({
        path: 'file.md',
        line: 0,
        state: 'TODO',
        rawText: 'TODO Task one',
      });
      const task2 = createBaseTask({
        path: 'file.md',
        line: 1,
        state: 'TODO',
        rawText: 'TODO Task two',
      });
      taskStateManager.addTask(task1);
      taskStateManager.addTask(task2);

      const p1 = coordinator
        .updateTaskState(task1, 'DONE', 'task-list')
        .catch(() => undefined);
      const p2 = coordinator.updateTaskState(task2, 'DONE', 'task-list');

      await p1;
      await p2;

      expect(debugSpy).toHaveBeenCalledWith(
        expect.stringContaining('Prior file-update rejected'),
        expect.any(Error),
      );

      debugSpy.mockRestore();
    });
  });
});
