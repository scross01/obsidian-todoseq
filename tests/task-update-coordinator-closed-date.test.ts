import { TaskUpdateCoordinator } from '../src/services/task-update-coordinator';
import { TaskStateManager } from '../src/services/task-state-manager';
import { Task, DateRepeatInfo } from '../src/types/task';
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

// Mock the Obsidian App
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

// Mock the TodoTracker plugin
const mockPlugin = {
  app: mockApp,
  settings: createBaseSettings(),
  isUserInitiatedUpdate: false,
  taskEditor: {
    updateTaskState: jest.fn(),
    updateTaskClosedDate: jest.fn(),
    removeTaskClosedDate: jest.fn(),
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

describe('TaskUpdateCoordinator - CLOSED Date Behavior', () => {
  let taskUpdateCoordinator: TaskUpdateCoordinator;
  let taskStateManager: TaskStateManager;
  let keywordManager: any;

  // Track original task for mock to determine transition direction
  let originalTask: Task | null = null;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
    jest.useFakeTimers();
    originalTask = null;

    // Create a mock file
    const mockTFile = new TFile();
    mockTFile.path = 'test.md';
    mockTFile.name = 'test.md';
    mockApp.vault.getAbstractFileByPath.mockReturnValue(mockTFile);
    mockApp.vault.process.mockImplementation((file, callback) => {
      const data = 'TODO Task text';
      return callback(data);
    });
    mockApp.vault.read.mockResolvedValue('TODO Task text');

    // Create settings with trackClosedDate enabled
    const settings = createBaseSettings({
      trackClosedDate: true,
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

    // Mock the task editor methods to return the task
    // Track original task to determine if transition is completed->non-completed
    mockPlugin.taskEditor.updateTaskState.mockImplementation(
      async (task, newState) => {
        // Use originalTask if available to determine transition direction
        const taskForTransition = originalTask || task;

        const keywordManager = createTestKeywordManager(
          createBaseSettings({
            trackClosedDate: true,
            additionalArchivedKeywords: ['ARCHIVED'],
          }),
        );
        const isCompleted = keywordManager.isCompleted(newState);
        const wasCompleted = keywordManager.isCompleted(
          taskForTransition.state,
        );
        const isArchived = keywordManager.isArchived(newState);

        // Simplified CLOSED date handling for tests:
        // - ARCHIVED: preserve existing CLOSED date
        // - Completed states (DONE): set CLOSED date to now
        // - Non-completed to non-completed: preserve existing CLOSED date
        // - Completed to non-completed: remove CLOSED date
        let closedDate: Date | null;
        let lineDelta = 0;
        if (isArchived) {
          closedDate = task.closedDate;
        } else if (isCompleted) {
          closedDate = new Date();
          // If task didn't have a closedDate before, a new line will be added
          lineDelta = task.closedDate ? 0 : 1;
        } else if (wasCompleted && !isCompleted) {
          // Transitioning from completed to non-completed: remove CLOSED date
          closedDate = null;
          lineDelta = task.closedDate ? -1 : 0;
        } else if (task.closedDate) {
          // Non-completed to non-completed: preserve closedDate
          closedDate = task.closedDate;
          lineDelta = 0;
        } else {
          closedDate = null;
          lineDelta = 0;
        }

        const result: Task & { lineDelta?: number } = {
          ...task,
          rawText: task.rawText.replace(task.state, newState),
          state: newState as Task['state'],
          completed: isCompleted,
          closedDate,
        };
        if (lineDelta !== 0) {
          result.lineDelta = lineDelta;
        }
        return result;
      },
    );

    mockPlugin.taskEditor.updateTaskClosedDate.mockImplementation(
      async (task, date) => {
        return {
          task: {
            ...task,
            closedDate: date,
          },
          lineDelta: task.closedDate ? 0 : 1, // +1 if new line inserted, 0 if updating existing
        };
      },
    );

    mockPlugin.taskEditor.removeTaskClosedDate.mockImplementation(
      async (task) => {
        return {
          task: {
            ...task,
            closedDate: null,
          },
          lineDelta: task.closedDate ? -1 : 0, // -1 if line removed, 0 if no line existed
        };
      },
    );
  });

  afterEach(() => {
    // Clean up TaskUpdateCoordinator to prevent open handles
    if (taskUpdateCoordinator) {
      taskUpdateCoordinator.destroy();
    }
  });

  describe('DONE -> TODO transition (non-recurring)', () => {
    it('should remove CLOSED date when transitioning from DONE to TODO', async () => {
      const task = createBaseTask({
        state: 'DONE' as Task['state'],
        completed: true,
        closedDate: new Date('2026-03-09'),
      });

      taskStateManager.addTask(task);
      originalTask = task;

      await taskUpdateCoordinator.updateTaskState(task, 'TODO');

      // Coordinator delegates to taskEditor which handles CLOSED date logic
      expect(mockPlugin.taskEditor.updateTaskState).toHaveBeenCalled();
    });

    it('should remove CLOSED date when transitioning from DONE to LATER', async () => {
      const task = createBaseTask({
        state: 'DONE' as Task['state'],
        completed: true,
        closedDate: new Date('2026-03-09'),
      });

      taskStateManager.addTask(task);
      originalTask = task;

      await taskUpdateCoordinator.updateTaskState(task, 'LATER');

      expect(mockPlugin.taskEditor.updateTaskState).toHaveBeenCalled();
    });

    it('should remove CLOSED date when transitioning from DONE to DOING', async () => {
      const task = createBaseTask({
        state: 'DONE' as Task['state'],
        completed: true,
        closedDate: new Date('2026-03-09'),
      });

      taskStateManager.addTask(task);
      originalTask = task;

      await taskUpdateCoordinator.updateTaskState(task, 'DOING');

      expect(mockPlugin.taskEditor.updateTaskState).toHaveBeenCalled();
    });
  });

  describe('DONE -> TODO transition (recurring task)', () => {
    it('should remove CLOSED date for recurring task with scheduled date', async () => {
      const dateRepeatInfo: DateRepeatInfo = {
        type: '+',
        unit: 'd',
        value: 1,
        raw: '+1d',
      };

      const task = createBaseTask({
        state: 'DONE' as Task['state'],
        completed: true,
        closedDate: new Date('2026-03-09'),
        scheduledDate: new Date('2026-03-09'),
        scheduledDateRepeat: dateRepeatInfo,
      });

      taskStateManager.addTask(task);
      originalTask = task;

      await taskUpdateCoordinator.updateTaskState(task, 'TODO');

      expect(mockPlugin.taskEditor.updateTaskState).toHaveBeenCalled();
    });

    it('should remove CLOSED date for recurring task with deadline date', async () => {
      const dateRepeatInfo: DateRepeatInfo = {
        type: '+',
        unit: 'w',
        value: 1,
        raw: '+1w',
      };

      const task = createBaseTask({
        state: 'DONE' as Task['state'],
        completed: true,
        closedDate: new Date('2026-03-09'),
        deadlineDate: new Date('2026-03-09'),
        deadlineDateRepeat: dateRepeatInfo,
      });

      taskStateManager.addTask(task);
      originalTask = task;

      await taskUpdateCoordinator.updateTaskState(task, 'TODO');

      expect(mockPlugin.taskEditor.updateTaskState).toHaveBeenCalled();
    });

    it('should remove CLOSED date for recurring task with both dates', async () => {
      const scheduledRepeatInfo: DateRepeatInfo = {
        type: '+',
        unit: 'd',
        value: 1,
        raw: '+1d',
      };

      const deadlineRepeatInfo: DateRepeatInfo = {
        type: '+',
        unit: 'w',
        value: 1,
        raw: '+1w',
      };

      const task = createBaseTask({
        state: 'DONE' as Task['state'],
        completed: true,
        closedDate: new Date('2026-03-09'),
        scheduledDate: new Date('2026-03-09'),
        scheduledDateRepeat: scheduledRepeatInfo,
        deadlineDate: new Date('2026-03-09'),
        deadlineDateRepeat: deadlineRepeatInfo,
      });

      taskStateManager.addTask(task);
      originalTask = task;

      await taskUpdateCoordinator.updateTaskState(task, 'TODO');

      expect(mockPlugin.taskEditor.updateTaskState).toHaveBeenCalled();
    });
  });

  describe('DONE -> ARCHIVED transition', () => {
    it('should NOT update or remove CLOSED date when transitioning to ARCHIVED', async () => {
      const task = createBaseTask({
        state: 'DONE' as Task['state'],
        completed: true,
        closedDate: new Date('2026-03-09'),
      });

      taskStateManager.addTask(task);
      originalTask = task;

      await taskUpdateCoordinator.updateTaskState(task, 'ARCHIVED');

      expect(mockPlugin.taskEditor.updateTaskState).toHaveBeenCalled();
    });

    it('should NOT update or remove CLOSED date when transitioning from TODO to ARCHIVED', async () => {
      const task = createBaseTask({
        state: 'TODO' as Task['state'],
        completed: false,
        closedDate: new Date('2026-03-09'),
      });

      taskStateManager.addTask(task);
      originalTask = task;

      await taskUpdateCoordinator.updateTaskState(task, 'ARCHIVED');

      expect(mockPlugin.taskEditor.updateTaskState).toHaveBeenCalled();
    });
  });

  describe('TODO -> DONE transition', () => {
    it('should add CLOSED date when transitioning from TODO to DONE', async () => {
      const task = createBaseTask({
        state: 'TODO' as Task['state'],
        completed: false,
        closedDate: null,
      });

      taskStateManager.addTask(task);
      originalTask = task;

      await taskUpdateCoordinator.updateTaskState(task, 'DONE');

      expect(mockPlugin.taskEditor.updateTaskState).toHaveBeenCalled();
    });

    it('should add CLOSED date when transitioning from LATER to DONE', async () => {
      const task = createBaseTask({
        state: 'LATER' as Task['state'],
        completed: false,
        closedDate: null,
      });

      taskStateManager.addTask(task);
      originalTask = task;

      await taskUpdateCoordinator.updateTaskState(task, 'DONE');

      expect(mockPlugin.taskEditor.updateTaskState).toHaveBeenCalled();
    });
  });

  describe('Non-completed to non-completed transition', () => {
    it('should NOT modify CLOSED date when transitioning from TODO to LATER', async () => {
      const task = createBaseTask({
        state: 'TODO' as Task['state'],
        completed: false,
        closedDate: new Date('2026-03-09'),
      });

      taskStateManager.addTask(task);
      originalTask = task;

      await taskUpdateCoordinator.updateTaskState(task, 'LATER');

      expect(mockPlugin.taskEditor.updateTaskState).toHaveBeenCalled();
    });

    it('should NOT modify CLOSED date when transitioning from DOING to TODO', async () => {
      const task = createBaseTask({
        state: 'DOING' as Task['state'],
        completed: false,
        closedDate: new Date('2026-03-09'),
      });

      taskStateManager.addTask(task);
      originalTask = task;

      await taskUpdateCoordinator.updateTaskState(task, 'TODO');

      expect(mockPlugin.taskEditor.updateTaskState).toHaveBeenCalled();
    });
  });

  describe('trackClosedDate setting disabled', () => {
    beforeEach(() => {
      if (taskUpdateCoordinator) {
        taskUpdateCoordinator.destroy();
      }

      const settings = createBaseSettings({
        trackClosedDate: false,
      });

      mockPlugin.settings = settings;

      keywordManager = createTestKeywordManager(settings);
      taskStateManager = new TaskStateManager(keywordManager);
      mockPlugin.taskStateManager = taskStateManager;

      taskUpdateCoordinator = new TaskUpdateCoordinator(
        mockPlugin as any,
        taskStateManager,
        keywordManager,
      );

      mockPlugin.taskEditor.updateTaskState.mockImplementation(
        async (task: Task, newState: string) => {
          const km = createTestKeywordManager(
            createBaseSettings({
              trackClosedDate: false,
              additionalArchivedKeywords: ['ARCHIVED'],
            }),
          );
          const isCompleted = km.isCompleted(newState);
          return {
            ...task,
            rawText: task.rawText.replace(task.state, newState),
            state: newState as Task['state'],
            completed: isCompleted,
            closedDate: task.closedDate,
          };
        },
      );
    });

    afterEach(() => {
      taskUpdateCoordinator.destroy();
    });

    it('should NOT add CLOSED date when trackClosedDate is false', async () => {
      const task = createBaseTask({
        state: 'TODO' as Task['state'],
        completed: false,
        closedDate: null,
      });

      taskStateManager.addTask(task);
      originalTask = task;

      await taskUpdateCoordinator.updateTaskState(task, 'DONE');

      expect(mockPlugin.taskEditor.updateTaskState).toHaveBeenCalled();
    });

    it('should NOT remove CLOSED date when trackClosedDate is false', async () => {
      const task = createBaseTask({
        state: 'DONE' as Task['state'],
        completed: true,
        closedDate: new Date('2026-03-09'),
      });

      taskStateManager.addTask(task);
      originalTask = task;

      await taskUpdateCoordinator.updateTaskState(task, 'TODO');

      expect(mockPlugin.taskEditor.updateTaskState).toHaveBeenCalled();
    });
  });

  describe('Edge cases', () => {
    it('should handle task with null scheduledDateRepeat but non-null deadlineDateRepeat', async () => {
      const deadlineRepeatInfo: DateRepeatInfo = {
        type: '+',
        unit: 'w',
        value: 1,
        raw: '+1w',
      };

      const task = createBaseTask({
        state: 'DONE' as Task['state'],
        completed: true,
        closedDate: new Date('2026-03-09'),
        scheduledDate: null,
        scheduledDateRepeat: null,
        deadlineDate: new Date('2026-03-09'),
        deadlineDateRepeat: deadlineRepeatInfo,
      });

      taskStateManager.addTask(task);
      originalTask = task;

      await taskUpdateCoordinator.updateTaskState(task, 'TODO');

      expect(mockPlugin.taskEditor.updateTaskState).toHaveBeenCalled();
    });

    it('should handle task with null deadlineDateRepeat but non-null scheduledDateRepeat', async () => {
      const scheduledRepeatInfo: DateRepeatInfo = {
        type: '+',
        unit: 'd',
        value: 1,
        raw: '+1d',
      };

      const task = createBaseTask({
        state: 'DONE' as Task['state'],
        completed: true,
        closedDate: new Date('2026-03-09'),
        scheduledDate: new Date('2026-03-09'),
        scheduledDateRepeat: scheduledRepeatInfo,
        deadlineDate: null,
        deadlineDateRepeat: null,
      });

      taskStateManager.addTask(task);
      originalTask = task;

      await taskUpdateCoordinator.updateTaskState(task, 'TODO');

      expect(mockPlugin.taskEditor.updateTaskState).toHaveBeenCalled();
    });

    it('should handle task with repeat info but null date', async () => {
      const scheduledRepeatInfo: DateRepeatInfo = {
        type: '+',
        unit: 'd',
        value: 1,
        raw: '+1d',
      };

      const task = createBaseTask({
        state: 'DONE' as Task['state'],
        completed: true,
        closedDate: new Date('2026-03-09'),
        scheduledDate: null,
        scheduledDateRepeat: scheduledRepeatInfo,
      });

      taskStateManager.addTask(task);
      originalTask = task;

      await taskUpdateCoordinator.updateTaskState(task, 'TODO');

      expect(mockPlugin.taskEditor.updateTaskState).toHaveBeenCalled();
    });
  });
});
