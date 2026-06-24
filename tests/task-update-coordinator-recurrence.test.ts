/**
 * Tests for TaskUpdateCoordinator - Recurrence Update Behavior
 */

import { TaskUpdateCoordinator } from '../src/services/task-update-coordinator';
import { TaskStateManager } from '../src/services/task-state-manager';
import { Task } from '../src/types/task';
import {
  createBaseTask,
  createTestKeywordManager,
  createBaseSettings,
} from './helpers/test-helper';
import { TFile } from 'obsidian';

// Mock document for DOM operations
global.document = {
  querySelectorAll: jest.fn(() => []),
} as any;

// Mock Obsidian App
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

// Mock TodoTracker plugin
const mockPlugin = {
  app: mockApp,
  settings: createBaseSettings(),
  isUserInitiatedUpdate: false,
  taskEditor: {
    updateTaskState: jest.fn(),
    updateTaskScheduledDate: jest.fn(),
    removeTaskScheduledDate: jest.fn(),
    updateTaskDeadlineDate: jest.fn(),
    removeTaskDeadlineDate: jest.fn(),
    applyRecurrenceUpdate: jest.fn(),
  },
  taskStateManager: null as any,
  embeddedTaskListProcessor: {
    refreshAllEmbeddedTaskLists: jest.fn(),
  },
  refreshVisibleEditorDecorations: jest.fn(),
  vaultScanner: {
    processIncrementalChange: jest.fn(),
    addSkipIncrementalChange: jest.fn(),
  },
};

describe('TaskUpdateCoordinator - Recurrence Update Behavior', () => {
  let taskUpdateCoordinator: TaskUpdateCoordinator;
  let taskStateManager: TaskStateManager;
  let keywordManager: any;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    // Create a mock file
    const mockTFile = new TFile();
    mockTFile.path = 'test.md';
    mockTFile.name = 'test.md';
    mockApp.vault.getAbstractFileByPath.mockReturnValue(mockTFile);
    mockApp.vault.process.mockImplementation((file, callback) => {
      const data = 'TODO Task text\n  SCHEDULED: <2026-03-10 Mon +1w>';
      return callback(data);
    });
    mockApp.vault.read.mockResolvedValue(
      'TODO Task text\n  SCHEDULED: <2026-03-10 Mon +1w>',
    );

    // Create settings
    const settings = createBaseSettings({
      additionalArchivedKeywords: ['ARCHIVED'],
    });

    // Add settings to mock plugin
    mockPlugin.settings = settings;

    // Create keyword manager
    keywordManager = createTestKeywordManager(settings);

    // Create task state manager
    taskStateManager = new TaskStateManager(keywordManager);
    mockPlugin.taskStateManager = taskStateManager;

    // Create task update coordinator
    taskUpdateCoordinator = new TaskUpdateCoordinator(
      mockPlugin as any,
      taskStateManager,
      keywordManager,
    );

    // Mock task editor methods to return task
    mockPlugin.taskEditor.updateTaskState.mockImplementation(
      async (task, newState) => {
        return {
          ...task,
          state: newState,
          rawText: task.rawText.replace(task.state, newState),
        };
      },
    );

    mockPlugin.taskEditor.updateTaskScheduledDate.mockImplementation(
      async (task, newDate, repeat, warningPeriod) => {
        return {
          ...task,
          scheduledDate: newDate,
          scheduledDateRepeat: repeat,
          scheduledWarningPeriod: warningPeriod,
          lineDelta: 1,
        };
      },
    );

    mockPlugin.taskEditor.removeTaskScheduledDate.mockImplementation(
      async (task) => {
        return {
          ...task,
          scheduledDate: null,
          scheduledDateRepeat: null,
          lineDelta: -1,
        };
      },
    );

    mockPlugin.taskEditor.updateTaskDeadlineDate.mockImplementation(
      async (task, newDate, repeat, warningPeriod) => {
        return {
          ...task,
          deadlineDate: newDate,
          deadlineDateRepeat: repeat,
          deadlineWarningPeriod: warningPeriod,
          lineDelta: 1,
        };
      },
    );

    mockPlugin.taskEditor.removeTaskDeadlineDate.mockImplementation(
      async (task) => {
        return {
          ...task,
          deadlineDate: null,
          deadlineDateRepeat: null,
          lineDelta: -1,
        };
      },
    );

    mockPlugin.taskEditor.applyRecurrenceUpdate.mockImplementation(
      async (task, options) => {
        const result = { ...task };
        if (options.newScheduledDate !== undefined) {
          result.scheduledDate = options.newScheduledDate;
          result.scheduledDateRepeat =
            options.newScheduledRepeat ?? task.scheduledDateRepeat;
          result.scheduledWarningPeriod =
            options.newScheduledWarningPeriod !== undefined
              ? options.newScheduledWarningPeriod
              : task.scheduledWarningPeriod;
        }
        if (options.newDeadlineDate !== undefined) {
          result.deadlineDate = options.newDeadlineDate;
          result.deadlineDateRepeat =
            options.newDeadlineRepeat ?? task.deadlineDateRepeat;
          result.deadlineWarningPeriod =
            options.newDeadlineWarningPeriod !== undefined
              ? options.newDeadlineWarningPeriod
              : task.deadlineWarningPeriod;
        }
        if (options.newState !== undefined) {
          result.state = options.newState;
          result.completed = false;
          result.rawText = task.rawText.replace(task.state, options.newState);
        }
        return result;
      },
    );
  });

  describe('updateTaskRecurrence', () => {
    it('should call updateTaskScheduledDate when newScheduledDate is provided', async () => {
      const task: Task = {
        ...createBaseTask(),
        path: 'test.md',
        line: 0,
        scheduledDate: new Date('2026-03-10'),
        scheduledDateRepeat: { type: '+', unit: 'w', value: 1, raw: '+1w' },
      };

      const newScheduledDate = new Date('2026-03-17');

      await taskUpdateCoordinator.updateTaskRecurrence(task, {
        newScheduledDate,
      });

      expect(mockPlugin.taskEditor.applyRecurrenceUpdate).toHaveBeenCalled();
      const args = mockPlugin.taskEditor.applyRecurrenceUpdate.mock.calls[0];
      expect(args[1].newScheduledDate).toEqual(newScheduledDate);
    });

    it('should call applyRecurrenceUpdate when newScheduledDate is null to remove', async () => {
      const task: Task = {
        ...createBaseTask(),
        path: 'test.md',
        line: 0,
        scheduledDate: new Date('2026-03-10'),
        scheduledDateRepeat: { type: '+', unit: 'w', value: 1, raw: '+1w' },
      };

      await taskUpdateCoordinator.updateTaskRecurrence(task, {
        newScheduledDate: null,
      });

      expect(mockPlugin.taskEditor.applyRecurrenceUpdate).toHaveBeenCalled();
      const args = mockPlugin.taskEditor.applyRecurrenceUpdate.mock.calls[0];
      expect(args[1].newScheduledDate).toBeNull();
    });

    it('should call applyRecurrenceUpdate when newDeadlineDate is provided', async () => {
      const task: Task = {
        ...createBaseTask(),
        path: 'test.md',
        line: 0,
        deadlineDate: new Date('2026-03-10'),
        deadlineDateRepeat: { type: '+', unit: 'w', value: 1, raw: '+1w' },
      };

      const newDeadlineDate = new Date('2026-03-17');

      await taskUpdateCoordinator.updateTaskRecurrence(task, {
        newDeadlineDate,
      });

      expect(mockPlugin.taskEditor.applyRecurrenceUpdate).toHaveBeenCalled();
      const args = mockPlugin.taskEditor.applyRecurrenceUpdate.mock.calls[0];
      expect(args[1].newDeadlineDate).toEqual(newDeadlineDate);
    });

    it('should call applyRecurrenceUpdate when newDeadlineDate is null to remove', async () => {
      const task: Task = {
        ...createBaseTask(),
        path: 'test.md',
        line: 0,
        deadlineDate: new Date('2026-03-10'),
        deadlineDateRepeat: { type: '+', unit: 'w', value: 1, raw: '+1w' },
      };

      await taskUpdateCoordinator.updateTaskRecurrence(task, {
        newDeadlineDate: null,
      });

      expect(mockPlugin.taskEditor.applyRecurrenceUpdate).toHaveBeenCalled();
      const args = mockPlugin.taskEditor.applyRecurrenceUpdate.mock.calls[0];
      expect(args[1].newDeadlineDate).toBeNull();
    });

    it('should call applyRecurrenceUpdate when newStateForRecurrence is provided', async () => {
      const task: Task = {
        ...createBaseTask(),
        path: 'test.md',
        line: 0,
        state: 'DONE',
      };

      await taskUpdateCoordinator.updateTaskRecurrence(task, {
        newStateForRecurrence: 'TODO',
      });

      expect(mockPlugin.taskEditor.applyRecurrenceUpdate).toHaveBeenCalled();
      const args = mockPlugin.taskEditor.applyRecurrenceUpdate.mock.calls[0];
      expect(args[1].newState).toBe('TODO');
    });

    it('should update state manager with all updated fields', async () => {
      const task: Task = {
        ...createBaseTask(),
        path: 'test.md',
        line: 0,
        state: 'DONE',
        scheduledDate: new Date('2026-03-10'),
        scheduledDateRepeat: { type: '+', unit: 'w', value: 1, raw: '+1w' },
        deadlineDate: new Date('2026-03-10'),
        deadlineDateRepeat: { type: '+', unit: 'w', value: 1, raw: '+1w' },
      };

      const newScheduledDate = new Date('2026-03-17');
      const newDeadlineDate = new Date('2026-03-17');
      const newStateForRecurrence = 'TODO';

      // Add task to state manager
      taskStateManager.setTasks([task]);

      await taskUpdateCoordinator.updateTaskRecurrence(task, {
        newScheduledDate,
        newDeadlineDate,
        newStateForRecurrence,
      });

      const updatedTask = taskStateManager.findTaskByPathAndLine('test.md', 0);
      expect(updatedTask).toBeDefined();
      // Check that the scheduled date was updated (compare using time value)
      expect(updatedTask?.scheduledDate?.getTime()).toEqual(
        newScheduledDate.getTime(),
      );
      expect(updatedTask?.deadlineDate?.getTime()).toEqual(
        newDeadlineDate.getTime(),
      );
      expect(updatedTask?.state).toBe(newStateForRecurrence);
    });
  });

  describe('first-only warning period stripping on recurrence', () => {
    it('should strip scheduled warning period when null is passed', async () => {
      const task: Task = {
        ...createBaseTask(),
        path: 'test.md',
        line: 0,
        scheduledDate: new Date('2026-03-10'),
        scheduledDateRepeat: { type: '+', unit: 'w', value: 1, raw: '+1w' },
        scheduledWarningPeriod: { value: 3, unit: 'd', isFirstOnly: true },
      };

      const newScheduledDate = new Date('2026-03-17');

      await taskUpdateCoordinator.updateTaskRecurrence(task, {
        newScheduledDate,
        newScheduledWarningPeriod: null, // strip --Nd
      });

      const calls = mockPlugin.taskEditor.applyRecurrenceUpdate.mock.calls;
      expect(calls.length).toBe(1);
      const options = calls[0][1];
      expect(options.newScheduledWarningPeriod).toBeNull();
    });

    it('should strip deadline warning period when null is passed', async () => {
      const task: Task = {
        ...createBaseTask(),
        path: 'test.md',
        line: 0,
        deadlineDate: new Date('2026-03-10'),
        deadlineDateRepeat: { type: '+', unit: 'w', value: 1, raw: '+1w' },
        deadlineWarningPeriod: { value: 5, unit: 'd', isFirstOnly: true },
      };

      const newDeadlineDate = new Date('2026-03-17');

      await taskUpdateCoordinator.updateTaskRecurrence(task, {
        newDeadlineDate,
        newDeadlineWarningPeriod: null, // strip --Nd
      });

      const calls = mockPlugin.taskEditor.applyRecurrenceUpdate.mock.calls;
      expect(calls.length).toBe(1);
      const options = calls[0][1];
      expect(options.newDeadlineWarningPeriod).toBeNull();
    });

    it('should preserve existing warning period when undefined is passed', async () => {
      const task: Task = {
        ...createBaseTask(),
        path: 'test.md',
        line: 0,
        scheduledDate: new Date('2026-03-10'),
        scheduledDateRepeat: { type: '+', unit: 'w', value: 1, raw: '+1w' },
        scheduledWarningPeriod: { value: 3, unit: 'd', isFirstOnly: true },
      };

      const newScheduledDate = new Date('2026-03-17');

      // Don't pass newScheduledWarningPeriod (undefined)
      await taskUpdateCoordinator.updateTaskRecurrence(task, {
        newScheduledDate,
      });

      const calls = mockPlugin.taskEditor.applyRecurrenceUpdate.mock.calls;
      expect(calls.length).toBe(1);
      const options = calls[0][1];
      // resolveRecurrenceWarningPeriod(undefined, existing) => existing
      expect(options.newScheduledWarningPeriod).toEqual({
        value: 3,
        unit: 'd',
        isFirstOnly: true,
      });
    });

    it('should pass through a new warning period', async () => {
      const task: Task = {
        ...createBaseTask(),
        path: 'test.md',
        line: 0,
        scheduledDate: new Date('2026-03-10'),
        scheduledDateRepeat: { type: '+', unit: 'w', value: 1, raw: '+1w' },
        scheduledWarningPeriod: { value: 3, unit: 'd', isFirstOnly: true },
      };

      const newScheduledDate = new Date('2026-03-17');

      await taskUpdateCoordinator.updateTaskRecurrence(task, {
        newScheduledDate,
        newScheduledWarningPeriod: { value: 7, unit: 'w', isFirstOnly: false },
      });

      const calls = mockPlugin.taskEditor.applyRecurrenceUpdate.mock.calls;
      expect(calls.length).toBe(1);
      const options = calls[0][1];
      expect(options.newScheduledWarningPeriod).toEqual({
        value: 7,
        unit: 'w',
        isFirstOnly: false,
      });
    });

    it('should preserve existing deadline warning period when undefined is passed', async () => {
      const task: Task = {
        ...createBaseTask(),
        path: 'test.md',
        line: 0,
        deadlineDate: new Date('2026-03-10'),
        deadlineDateRepeat: { type: '+', unit: 'w', value: 1, raw: '+1w' },
        deadlineWarningPeriod: { value: 5, unit: 'd', isFirstOnly: true },
      };

      const newDeadlineDate = new Date('2026-03-17');

      // Don't pass newDeadlineWarningPeriod (undefined)
      await taskUpdateCoordinator.updateTaskRecurrence(task, {
        newDeadlineDate,
      });

      const calls = mockPlugin.taskEditor.applyRecurrenceUpdate.mock.calls;
      expect(calls.length).toBe(1);
      const options = calls[0][1];
      // resolveRecurrenceWarningPeriod(undefined, existing) => existing
      expect(options.newDeadlineWarningPeriod).toEqual({
        value: 5,
        unit: 'd',
        isFirstOnly: true,
      });
    });

    it('should preserve regular -Nd warning period when null is passed (recurring periods persist)', async () => {
      const task: Task = {
        ...createBaseTask(),
        path: 'test.md',
        line: 0,
        scheduledDate: new Date('2026-03-10'),
        scheduledDateRepeat: { type: '+', unit: 'w', value: 1, raw: '+1w' },
        scheduledWarningPeriod: { value: 3, unit: 'd', isFirstOnly: false },
      };

      const newScheduledDate = new Date('2026-03-17');

      await taskUpdateCoordinator.updateTaskRecurrence(task, {
        newScheduledDate,
        newScheduledWarningPeriod: null, // null means "keep existing" for regular -Nd
      });

      const calls = mockPlugin.taskEditor.applyRecurrenceUpdate.mock.calls;
      expect(calls.length).toBe(1);
      const options = calls[0][1];
      // resolveRecurrenceWarningPeriod(null, non-firstOnly) => existing (regular periods persist)
      expect(options.newScheduledWarningPeriod).toEqual({
        value: 3,
        unit: 'd',
        isFirstOnly: false,
      });
    });

    it('should update state manager with stripped warning period', async () => {
      const task: Task = {
        ...createBaseTask(),
        path: 'test.md',
        line: 0,
        state: 'DONE',
        scheduledDate: new Date('2026-03-10'),
        scheduledDateRepeat: { type: '+', unit: 'w', value: 1, raw: '+1w' },
        scheduledWarningPeriod: { value: 3, unit: 'd', isFirstOnly: true },
      };

      // Add task to state manager
      taskStateManager.setTasks([task]);

      // Verify the task initially has warningPeriod
      const beforeTask = taskStateManager.findTaskByPathAndLine('test.md', 0);
      expect(beforeTask?.scheduledWarningPeriod).toEqual({
        value: 3,
        unit: 'd',
        isFirstOnly: true,
      });

      await taskUpdateCoordinator.updateTaskRecurrence(task, {
        newScheduledDate: new Date('2026-03-17'),
        newScheduledWarningPeriod: null, // strip
        newStateForRecurrence: 'TODO',
      });

      // State manager should reflect the stripped value
      const afterTask = taskStateManager.findTaskByPathAndLine('test.md', 0);
      expect(afterTask?.scheduledWarningPeriod).toBeNull();
    });

    it('should update state manager with stripped deadline warning period', async () => {
      const task: Task = {
        ...createBaseTask(),
        path: 'test.md',
        line: 0,
        state: 'DONE',
        deadlineDate: new Date('2026-03-10'),
        deadlineDateRepeat: { type: '+', unit: 'w', value: 1, raw: '+1w' },
        deadlineWarningPeriod: { value: 5, unit: 'd', isFirstOnly: true },
      };

      // Add task to state manager
      taskStateManager.setTasks([task]);

      // Verify the task initially has warningPeriod
      const beforeTask = taskStateManager.findTaskByPathAndLine('test.md', 0);
      expect(beforeTask?.deadlineWarningPeriod).toEqual({
        value: 5,
        unit: 'd',
        isFirstOnly: true,
      });

      await taskUpdateCoordinator.updateTaskRecurrence(task, {
        newDeadlineDate: new Date('2026-03-17'),
        newDeadlineWarningPeriod: null, // strip
        newStateForRecurrence: 'TODO',
      });

      // State manager should reflect the stripped value
      const afterTask = taskStateManager.findTaskByPathAndLine('test.md', 0);
      expect(afterTask?.deadlineWarningPeriod).toBeNull();
    });
  });

  afterEach(() => {
    jest.useRealTimers();
    taskUpdateCoordinator.destroy();
  });
});
