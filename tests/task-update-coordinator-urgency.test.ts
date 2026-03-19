import { TaskUpdateCoordinator } from '../src/services/task-update-coordinator';
import { TaskStateManager } from '../src/services/task-state-manager';
import {
  createBaseTask,
  createTestKeywordManager,
  createBaseSettings,
} from './helpers/test-helper';
import { TFile } from 'obsidian';
import { getDefaultCoefficients } from '../src/utils/task-urgency';

global.document = {
  querySelectorAll: jest.fn(() => []),
} as any;

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

function expectNotNull<T>(value: T | null | undefined): T {
  expect(value).not.toBeNull();
  expect(value).toBeDefined();
  return value as T;
}

describe('TaskUpdateCoordinator - Urgency Recalculation', () => {
  let taskUpdateCoordinator: TaskUpdateCoordinator;
  let taskStateManager: TaskStateManager;
  let keywordManager: any;

  beforeEach(() => {
    jest.clearAllMocks();

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

    taskUpdateCoordinator = new TaskUpdateCoordinator(
      mockPlugin as any,
      taskStateManager,
      keywordManager,
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

  describe('urgency recalculation on state changes', () => {
    it('should recalculate urgency when task state changes to active', async () => {
      const task = createBaseTask({
        path: 'test.md',
        line: 0,
        state: 'TODO',
        rawText: 'TODO Test task',
        urgency: null,
      });

      taskStateManager.addTask(task);
      expect(taskStateManager.getTaskCount()).toBe(1);

      mockPlugin.taskEditor.updateTaskState.mockImplementation(
        async (task, newState) => ({
          ...task,
          state: newState,
          rawText: task.rawText.replace(/TODO/, newState),
          completed: keywordManager.isCompleted(newState),
        }),
      );

      await taskUpdateCoordinator.updateTaskState(
        task,
        'IN_PROGRESS',
        'task-list',
      );

      const updatedTask = taskStateManager.findTaskByPathAndLine('test.md', 0);
      const notNullTask = expectNotNull(updatedTask);
      const urgency = expectNotNull(notNullTask.urgency);
      expect(urgency).toBeGreaterThan(0);
    });

    it('should set urgency to null when task is completed', async () => {
      const task = createBaseTask({
        path: 'test.md',
        line: 0,
        state: 'TODO',
        rawText: 'TODO Test task',
        urgency: 10.0,
      });

      taskStateManager.addTask(task);

      await taskUpdateCoordinator.updateTaskState(task, 'DONE', 'task-list');

      const updatedTask = taskStateManager.findTaskByPathAndLine('test.md', 0);
      const notNullTask = expectNotNull(updatedTask);
      expect(notNullTask.urgency).toBeNull();
    });

    it('should recalculate urgency when task transitions from active to inactive', async () => {
      const task = createBaseTask({
        path: 'test.md',
        line: 0,
        state: 'IN_PROGRESS',
        rawText: 'IN_PROGRESS Test task',
        urgency: 5.0,
      });

      taskStateManager.addTask(task);

      mockPlugin.taskEditor.updateTaskState.mockImplementation(
        async (task, newState) => ({
          ...task,
          state: newState,
          rawText: task.rawText.replace(/IN_PROGRESS/, newState),
          completed: keywordManager.isCompleted(newState),
        }),
      );

      await taskUpdateCoordinator.updateTaskState(task, 'TODO', 'task-list');

      const updatedTask = taskStateManager.findTaskByPathAndLine('test.md', 0);
      const notNullTask = expectNotNull(updatedTask);
      const urgency = expectNotNull(notNullTask.urgency);
      expect(urgency).toBeGreaterThan(0);
    });
  });

  describe('urgency recalculation on priority changes', () => {
    beforeEach(() => {
      mockPlugin.taskEditor.updateTaskPriority.mockImplementation(
        async (task, newPriority) => ({
          ...task,
          priority: newPriority,
        }),
      );
    });

    it('should recalculate urgency when priority changes to high', async () => {
      const task = createBaseTask({
        path: 'test.md',
        line: 0,
        state: 'TODO',
        rawText: 'TODO Test task',
        priority: null,
        urgency: 3.0,
      });

      taskStateManager.addTask(task);

      await taskUpdateCoordinator.updateTaskPriority(task, 'high');

      const updatedTask = taskStateManager.findTaskByPathAndLine('test.md', 0);
      const notNullTask = expectNotNull(updatedTask);
      const urgency = expectNotNull(notNullTask.urgency);
      expect(urgency).toBeGreaterThan(3.0);
    });

    it('should recalculate urgency when priority changes from high to low', async () => {
      const coefficients = getDefaultCoefficients();
      const task = createBaseTask({
        path: 'test.md',
        line: 0,
        state: 'TODO',
        rawText: 'TODO Test task',
        priority: 'high',
        urgency: 10.0,
      });

      taskStateManager.addTask(task);

      await taskUpdateCoordinator.updateTaskPriority(task, 'low');

      const updatedTask = taskStateManager.findTaskByPathAndLine('test.md', 0);
      const notNullTask = expectNotNull(updatedTask);
      const urgency = expectNotNull(notNullTask.urgency);
      const originalUrgency = expectNotNull(task.urgency);
      expect(urgency).toBeLessThan(10.0);
      expect(urgency).toBeLessThan(originalUrgency + coefficients.priorityHigh);
    });
  });

  describe('urgency recalculation on scheduled date changes', () => {
    beforeEach(() => {
      mockPlugin.taskEditor.updateTaskScheduledDate.mockImplementation(
        async (task, newDate) => ({
          ...task,
          scheduledDate: newDate,
        }),
      );
    });

    it('should recalculate urgency when scheduled date is set to today', async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const task = createBaseTask({
        path: 'test.md',
        line: 0,
        state: 'TODO',
        rawText: 'TODO Test task',
        scheduledDate: null,
        urgency: 2.0,
      });

      taskStateManager.addTask(task);

      await taskUpdateCoordinator.updateTaskScheduledDate(task, today);

      const updatedTask = taskStateManager.findTaskByPathAndLine('test.md', 0);
      const notNullTask = expectNotNull(updatedTask);
      const urgency = expectNotNull(notNullTask.urgency);
      const originalUrgency = expectNotNull(task.urgency);
      expect(urgency).toBeGreaterThan(originalUrgency);
    });

    it('should recalculate urgency when scheduled date is removed', async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const task = createBaseTask({
        path: 'test.md',
        line: 0,
        state: 'TODO',
        rawText: 'TODO Test task',
        scheduledDate: today,
        urgency: 7.0,
      });

      taskStateManager.addTask(task);

      mockPlugin.taskEditor.removeTaskScheduledDate.mockResolvedValue({
        ...task,
        scheduledDate: null,
      });

      await taskUpdateCoordinator.updateTaskScheduledDate(task, null);

      const updatedTask = taskStateManager.findTaskByPathAndLine('test.md', 0);
      const notNullTask = expectNotNull(updatedTask);
      const originalUrgency = expectNotNull(task.urgency);
      expect(notNullTask.urgency).toBeLessThan(originalUrgency);
    });
  });

  describe('urgency recalculation on deadline date changes', () => {
    beforeEach(() => {
      mockPlugin.taskEditor.updateTaskDeadlineDate.mockImplementation(
        async (task, newDate) => ({
          ...task,
          deadlineDate: newDate,
        }),
      );
    });

    it('should recalculate urgency when deadline is set to today', async () => {
      const today = new Date();
      today.setHours(23, 59, 59, 999);

      const task = createBaseTask({
        path: 'test.md',
        line: 0,
        state: 'TODO',
        rawText: 'TODO Test task',
        deadlineDate: null,
        urgency: 2.0,
      });

      taskStateManager.addTask(task);

      await taskUpdateCoordinator.updateTaskDeadlineDate(task, today);

      const updatedTask = taskStateManager.findTaskByPathAndLine('test.md', 0);
      const notNullTask = expectNotNull(updatedTask);
      const urgency = expectNotNull(notNullTask.urgency);
      const originalUrgency = expectNotNull(task.urgency);
      expect(urgency).toBeGreaterThan(originalUrgency);
    });

    it('should recalculate urgency when deadline is removed', async () => {
      const today = new Date();
      today.setHours(23, 59, 59, 999);

      const task = createBaseTask({
        path: 'test.md',
        line: 0,
        state: 'TODO',
        rawText: 'TODO Test task',
        deadlineDate: today,
        urgency: 14.0,
      });

      taskStateManager.addTask(task);

      mockPlugin.taskEditor.removeTaskDeadlineDate.mockResolvedValue({
        ...task,
        deadlineDate: null,
      });

      await taskUpdateCoordinator.updateTaskDeadlineDate(task, null);

      const updatedTask = taskStateManager.findTaskByPathAndLine('test.md', 0);
      const notNullTask = expectNotNull(updatedTask);
      const originalUrgency = expectNotNull(task.urgency);
      expect(notNullTask.urgency).toBeLessThan(originalUrgency);
    });
  });

  describe('urgency recalculation on recurrence updates', () => {
    it('should recalculate urgency after recurrence reschedules task', async () => {
      const task = createBaseTask({
        path: 'test.md',
        line: 0,
        state: 'TODO',
        rawText: 'TODO Test task',
        scheduledDate: new Date('2024-01-01'),
        scheduledDateRepeat: {
          type: '+',
          unit: 'd',
          value: 1,
          raw: '+1d',
        },
        urgency: 7.0,
      });

      taskStateManager.addTask(task);

      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(0, 0, 0, 0);

      mockPlugin.taskEditor.updateTaskRecurrence.mockImplementation(
        async (task) => ({
          ...task,
          state: 'TODO',
          scheduledDate: tomorrow,
          rawText: task.rawText,
        }),
      );

      await taskUpdateCoordinator.updateTaskRecurrence(task, {});

      const updatedTask = taskStateManager.findTaskByPathAndLine('test.md', 0);
      const notNullTask = expectNotNull(updatedTask);
      expectNotNull(notNullTask.urgency);
    });
  });

  describe('setUrgencyCoefficients', () => {
    it('should update urgency coefficients and recalculate correctly', async () => {
      const customCoefficients = {
        ...getDefaultCoefficients(),
        priorityHigh: 10.0,
        deadline: 20.0,
      };

      taskUpdateCoordinator.setUrgencyCoefficients(customCoefficients);

      const task = createBaseTask({
        path: 'test.md',
        line: 0,
        state: 'TODO',
        rawText: 'TODO Test task',
        priority: 'high',
        urgency: 3.0,
      });

      taskStateManager.addTask(task);

      mockPlugin.taskEditor.updateTaskPriority.mockImplementation(
        async (task, newPriority) => ({
          ...task,
          priority: newPriority,
        }),
      );

      await taskUpdateCoordinator.updateTaskPriority(task, 'high');

      const updatedTask = taskStateManager.findTaskByPathAndLine('test.md', 0);
      const notNullTask = expectNotNull(updatedTask);
      const urgency = expectNotNull(notNullTask.urgency);
      expect(urgency).toBeGreaterThan(0);
    });
  });
});
