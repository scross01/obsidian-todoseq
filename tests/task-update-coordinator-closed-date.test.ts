import { TaskUpdateCoordinator } from '../src/services/task-update-coordinator';
import { TaskStateManager } from '../src/services/task-state-manager';
import { Task, DateRepeatInfo } from '../src/types/task';
import {
  createBaseTask,
  createTestKeywordManager,
  createBaseSettings,
} from './helpers/test-helper';
import { TFile } from 'obsidian';
import { getPluginSettings } from '../src/utils/settings-utils';

// Mock the settings utility
jest.mock('../src/utils/settings-utils', () => ({
  getPluginSettings: jest.fn(),
}));

// Mock document for DOM operations
global.document = {
  querySelectorAll: jest.fn(() => []),
} as any;

// Mock the Obsidian App
const mockApp = {
  vault: {
    getAbstractFileByPath: jest.fn(),
    process: jest.fn(),
  },
  workspace: {
    getActiveViewOfType: jest.fn(),
  },
};

// Mock the TodoTracker plugin
const mockPlugin = {
  app: mockApp,
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
  },
};

describe('TaskUpdateCoordinator - CLOSED Date Behavior', () => {
  let taskUpdateCoordinator: TaskUpdateCoordinator;
  let taskStateManager: TaskStateManager;
  let keywordManager: any;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Create a mock file
    const mockTFile = new TFile('test.md', 'test.md');
    mockApp.vault.getAbstractFileByPath.mockReturnValue(mockTFile);
    mockApp.vault.process.mockImplementation((file, callback) => {
      const data = 'TODO Task text';
      return callback(data);
    });

    // Create settings with trackClosedDate enabled
    const settings = createBaseSettings({
      trackClosedDate: true,
      additionalArchivedKeywords: ['ARCHIVED'],
    });

    // Mock getPluginSettings to return our settings
    (getPluginSettings as jest.Mock).mockReturnValue(settings);

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
    mockPlugin.taskEditor.updateTaskState.mockImplementation(
      async (task, newState) => {
        const keywordManager = createTestKeywordManager(
          createBaseSettings({
            trackClosedDate: true,
            additionalArchivedKeywords: ['ARCHIVED'],
          }),
        );
        const isCompleted = keywordManager.isCompleted(newState);
        return {
          ...task,
          rawText: task.rawText.replace(task.state, newState),
          state: newState as Task['state'],
          completed: isCompleted,
        };
      },
    );

    mockPlugin.taskEditor.updateTaskClosedDate.mockImplementation(
      async (task, date) => {
        return {
          ...task,
          closedDate: date,
        };
      },
    );

    mockPlugin.taskEditor.removeTaskClosedDate.mockImplementation(
      async (task) => {
        return {
          ...task,
          closedDate: null,
        };
      },
    );
  });

  describe('DONE -> TODO transition (non-recurring)', () => {
    it('should remove CLOSED date when transitioning from DONE to TODO', async () => {
      const task = createBaseTask({
        state: 'DONE' as Task['state'],
        completed: true,
        closedDate: new Date('2026-03-09'),
      });

      taskStateManager.addTask(task);

      const result = await taskUpdateCoordinator.updateTaskState(task, 'TODO');

      expect(mockPlugin.taskEditor.removeTaskClosedDate).toHaveBeenCalledWith(
        expect.objectContaining({ state: 'TODO' }),
      );
      expect(result.closedDate).toBeNull();
    });

    it('should remove CLOSED date when transitioning from DONE to LATER', async () => {
      const task = createBaseTask({
        state: 'DONE' as Task['state'],
        completed: true,
        closedDate: new Date('2026-03-09'),
      });

      taskStateManager.addTask(task);

      await taskUpdateCoordinator.updateTaskState(task, 'LATER');

      expect(mockPlugin.taskEditor.removeTaskClosedDate).toHaveBeenCalled();
    });

    it('should remove CLOSED date when transitioning from DONE to DOING', async () => {
      const task = createBaseTask({
        state: 'DONE' as Task['state'],
        completed: true,
        closedDate: new Date('2026-03-09'),
      });

      taskStateManager.addTask(task);

      await taskUpdateCoordinator.updateTaskState(task, 'DOING');

      expect(mockPlugin.taskEditor.removeTaskClosedDate).toHaveBeenCalled();
    });
  });

  describe('DONE -> TODO transition (recurring task)', () => {
    it('should NOT remove CLOSED date for recurring task with scheduled date', async () => {
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

      await taskUpdateCoordinator.updateTaskState(task, 'TODO');

      // Should NOT call removeTaskClosedDate for recurring tasks
      expect(mockPlugin.taskEditor.removeTaskClosedDate).not.toHaveBeenCalled();
    });

    it('should NOT remove CLOSED date for recurring task with deadline date', async () => {
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

      await taskUpdateCoordinator.updateTaskState(task, 'TODO');

      // Should NOT call removeTaskClosedDate for recurring tasks
      expect(mockPlugin.taskEditor.removeTaskClosedDate).not.toHaveBeenCalled();
    });

    it('should NOT remove CLOSED date for recurring task with both dates', async () => {
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

      await taskUpdateCoordinator.updateTaskState(task, 'TODO');

      // Should NOT call removeTaskClosedDate for recurring tasks
      expect(mockPlugin.taskEditor.removeTaskClosedDate).not.toHaveBeenCalled();
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

      await taskUpdateCoordinator.updateTaskState(task, 'ARCHIVED');

      // Should NOT call updateTaskClosedDate or removeTaskClosedDate for archived state
      expect(mockPlugin.taskEditor.updateTaskClosedDate).not.toHaveBeenCalled();
      expect(mockPlugin.taskEditor.removeTaskClosedDate).not.toHaveBeenCalled();
    });

    it('should NOT update or remove CLOSED date when transitioning from TODO to ARCHIVED', async () => {
      const task = createBaseTask({
        state: 'TODO' as Task['state'],
        completed: false,
        closedDate: new Date('2026-03-09'),
      });

      taskStateManager.addTask(task);

      await taskUpdateCoordinator.updateTaskState(task, 'ARCHIVED');

      // Should NOT call updateTaskClosedDate or removeTaskClosedDate for archived state
      expect(mockPlugin.taskEditor.updateTaskClosedDate).not.toHaveBeenCalled();
      expect(mockPlugin.taskEditor.removeTaskClosedDate).not.toHaveBeenCalled();
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

      await taskUpdateCoordinator.updateTaskState(task, 'DONE');

      expect(mockPlugin.taskEditor.updateTaskClosedDate).toHaveBeenCalledWith(
        expect.objectContaining({ state: 'DONE' }),
        expect.any(Date),
      );
    });

    it('should add CLOSED date when transitioning from LATER to DONE', async () => {
      const task = createBaseTask({
        state: 'LATER' as Task['state'],
        completed: false,
        closedDate: null,
      });

      taskStateManager.addTask(task);

      await taskUpdateCoordinator.updateTaskState(task, 'DONE');

      expect(mockPlugin.taskEditor.updateTaskClosedDate).toHaveBeenCalled();
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

      await taskUpdateCoordinator.updateTaskState(task, 'LATER');

      // Should NOT call updateTaskClosedDate or removeTaskClosedDate
      expect(mockPlugin.taskEditor.updateTaskClosedDate).not.toHaveBeenCalled();
      expect(mockPlugin.taskEditor.removeTaskClosedDate).not.toHaveBeenCalled();
    });

    it('should NOT modify CLOSED date when transitioning from DOING to TODO', async () => {
      const task = createBaseTask({
        state: 'DOING' as Task['state'],
        completed: false,
        closedDate: new Date('2026-03-09'),
      });

      taskStateManager.addTask(task);

      await taskUpdateCoordinator.updateTaskState(task, 'TODO');

      // Should NOT call updateTaskClosedDate or removeTaskClosedDate
      expect(mockPlugin.taskEditor.updateTaskClosedDate).not.toHaveBeenCalled();
      expect(mockPlugin.taskEditor.removeTaskClosedDate).not.toHaveBeenCalled();
    });
  });

  describe('trackClosedDate setting disabled', () => {
    beforeEach(() => {
      // Create settings with trackClosedDate disabled
      const settings = createBaseSettings({
        trackClosedDate: false,
      });

      // Update the mock for getPluginSettings to return the new settings
      (getPluginSettings as jest.Mock).mockReturnValue(settings);

      keywordManager = createTestKeywordManager(settings);
      taskStateManager = new TaskStateManager(keywordManager);
      mockPlugin.taskStateManager = taskStateManager;

      taskUpdateCoordinator = new TaskUpdateCoordinator(
        mockPlugin as any,
        taskStateManager,
        keywordManager,
      );
    });

    it('should NOT add CLOSED date when trackClosedDate is false', async () => {
      const task = createBaseTask({
        state: 'TODO' as Task['state'],
        completed: false,
        closedDate: null,
      });

      taskStateManager.addTask(task);

      await taskUpdateCoordinator.updateTaskState(task, 'DONE');

      expect(mockPlugin.taskEditor.updateTaskClosedDate).not.toHaveBeenCalled();
    });

    it('should NOT remove CLOSED date when trackClosedDate is false', async () => {
      const task = createBaseTask({
        state: 'DONE' as Task['state'],
        completed: true,
        closedDate: new Date('2026-03-09'),
      });

      taskStateManager.addTask(task);

      await taskUpdateCoordinator.updateTaskState(task, 'TODO');

      expect(mockPlugin.taskEditor.removeTaskClosedDate).not.toHaveBeenCalled();
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

      await taskUpdateCoordinator.updateTaskState(task, 'TODO');

      // Should NOT call removeTaskClosedDate for recurring tasks
      expect(mockPlugin.taskEditor.removeTaskClosedDate).not.toHaveBeenCalled();
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

      await taskUpdateCoordinator.updateTaskState(task, 'TODO');

      // Should NOT call removeTaskClosedDate for recurring tasks
      expect(mockPlugin.taskEditor.removeTaskClosedDate).not.toHaveBeenCalled();
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
        scheduledDate: null, // Date is null even though repeat info exists
        scheduledDateRepeat: scheduledRepeatInfo,
      });

      taskStateManager.addTask(task);

      await taskUpdateCoordinator.updateTaskState(task, 'TODO');

      // Should call removeTaskClosedDate because scheduledDate is null
      expect(mockPlugin.taskEditor.removeTaskClosedDate).toHaveBeenCalled();
    });
  });
});
