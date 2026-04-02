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
      async (task, newDate, repeat) => {
        return {
          ...task,
          scheduledDate: newDate,
          scheduledDateRepeat: repeat,
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
      async (task, newDate, repeat) => {
        return {
          ...task,
          deadlineDate: newDate,
          deadlineDateRepeat: repeat,
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

      expect(mockPlugin.taskEditor.updateTaskScheduledDate).toHaveBeenCalled();
    });

    it('should call removeTaskScheduledDate when newScheduledDate is null', async () => {
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

      expect(mockPlugin.taskEditor.removeTaskScheduledDate).toHaveBeenCalled();
    });

    it('should call updateTaskDeadlineDate when newDeadlineDate is provided', async () => {
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

      expect(mockPlugin.taskEditor.updateTaskDeadlineDate).toHaveBeenCalled();
    });

    it('should call removeTaskDeadlineDate when newDeadlineDate is null', async () => {
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

      expect(mockPlugin.taskEditor.removeTaskDeadlineDate).toHaveBeenCalled();
    });

    it('should call updateTaskState when newStateForRecurrence is provided', async () => {
      const task: Task = {
        ...createBaseTask(),
        path: 'test.md',
        line: 0,
        state: 'DONE',
      };

      await taskUpdateCoordinator.updateTaskRecurrence(task, {
        newStateForRecurrence: 'TODO',
      });

      expect(mockPlugin.taskEditor.updateTaskState).toHaveBeenCalled();
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

  afterEach(() => {
    jest.useRealTimers();
    taskUpdateCoordinator.destroy();
  });
});
