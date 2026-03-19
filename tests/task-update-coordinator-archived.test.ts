import { TaskUpdateCoordinator } from '../src/services/task-update-coordinator';
import { TaskStateManager } from '../src/services/task-state-manager';
import {
  createBaseTask,
  createTestKeywordManager,
  createBaseSettings,
} from './helpers/test-helper';
import { TFile } from 'obsidian';

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

describe('TaskUpdateCoordinator - Archived State Removal', () => {
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

    const settings = createBaseSettings({
      additionalArchivedKeywords: ['ARCHIVED', 'OLD'],
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
      async (task, newState) => ({
        ...task,
        state: newState,
        rawText: task.rawText.replace(/TODO/, newState),
      }),
    );
  });

  it('should remove task from state manager when transitioning to ARCHIVED state', async () => {
    const task = createBaseTask({
      path: 'test.md',
      line: 0,
      state: 'TODO',
      rawText: 'TODO Test task',
    });

    taskStateManager.addTask(task);

    expect(taskStateManager.getTaskCount()).toBe(1);

    await taskUpdateCoordinator.updateTaskState(task, 'ARCHIVED', 'task-list');

    expect(taskStateManager.getTaskCount()).toBe(0);
  });

  it('should remove task from state manager when transitioning to custom archived keyword', async () => {
    const task = createBaseTask({
      path: 'test.md',
      line: 0,
      state: 'TODO',
      rawText: 'TODO Test task',
    });

    taskStateManager.addTask(task);

    expect(taskStateManager.getTaskCount()).toBe(1);

    await taskUpdateCoordinator.updateTaskState(task, 'OLD', 'task-list');

    expect(taskStateManager.getTaskCount()).toBe(0);
  });

  it('should remove task after recurrence update if final state is archived', async () => {
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
    });

    taskStateManager.addTask(task);

    expect(taskStateManager.getTaskCount()).toBe(1);

    mockPlugin.taskEditor.updateTaskState.mockImplementation(
      async (task, newState) => ({
        ...task,
        state: newState,
        rawText: task.rawText.replace(/TODO/, newState),
      }),
    );

    await taskUpdateCoordinator.updateTaskRecurrence(task, {
      newStateForRecurrence: 'ARCHIVED',
    });

    expect(taskStateManager.getTaskCount()).toBe(0);
  });

  it('should NOT remove task when transitioning to non-archived state', async () => {
    const task = createBaseTask({
      path: 'test.md',
      line: 0,
      state: 'TODO',
      rawText: 'TODO Test task',
    });

    taskStateManager.addTask(task);

    expect(taskStateManager.getTaskCount()).toBe(1);

    await taskUpdateCoordinator.updateTaskState(task, 'DONE', 'task-list');

    expect(taskStateManager.getTaskCount()).toBe(1);
    const updatedTask = taskStateManager.findTaskByPathAndLine('test.md', 0);
    expect(updatedTask?.state).toBe('DONE');
  });

  it('should remove task from state manager after async phase completes', async () => {
    const task = createBaseTask({
      path: 'test.md',
      line: 0,
      state: 'TODO',
      rawText: 'TODO Test task',
    });

    taskStateManager.addTask(task);

    expect(taskStateManager.getTaskCount()).toBe(1);

    const updatePromise = taskUpdateCoordinator.updateTaskState(
      task,
      'ARCHIVED',
      'editor',
    );

    await updatePromise;

    expect(taskStateManager.getTaskCount()).toBe(0);
  });

  it('should notify subscribers after task removal', async () => {
    const task = createBaseTask({
      path: 'test.md',
      line: 0,
      state: 'TODO',
      rawText: 'TODO Test task',
    });

    taskStateManager.addTask(task);

    const subscriber = jest.fn();
    taskStateManager.subscribe(subscriber);

    await taskUpdateCoordinator.updateTaskState(task, 'ARCHIVED', 'task-list');

    expect(subscriber).toHaveBeenCalled();
    const lastCall = subscriber.mock.calls[subscriber.mock.calls.length - 1][0];
    expect(lastCall.length).toBe(0);
  });

  it('should only remove the specific task when multiple tasks exist', async () => {
    const task1 = createBaseTask({
      path: 'test.md',
      line: 0,
      state: 'TODO',
      rawText: 'TODO Task 1',
    });

    const task2 = createBaseTask({
      path: 'test.md',
      line: 1,
      state: 'TODO',
      rawText: 'TODO Task 2',
    });

    const task3 = createBaseTask({
      path: 'test.md',
      line: 2,
      state: 'TODO',
      rawText: 'TODO Task 3',
    });

    taskStateManager.addTask(task1);
    taskStateManager.addTask(task2);
    taskStateManager.addTask(task3);

    expect(taskStateManager.getTaskCount()).toBe(3);

    await taskUpdateCoordinator.updateTaskState(task2, 'ARCHIVED', 'task-list');

    expect(taskStateManager.getTaskCount()).toBe(2);
    expect(taskStateManager.findTaskByPathAndLine('test.md', 0)).not.toBeNull();
    expect(taskStateManager.findTaskByPathAndLine('test.md', 1)).toBeNull();
    expect(taskStateManager.findTaskByPathAndLine('test.md', 2)).not.toBeNull();
  });
});

describe('TaskUpdateCoordinator - Re-adding Tasks from Archived', () => {
  let taskUpdateCoordinator: TaskUpdateCoordinator;
  let taskStateManager: TaskStateManager;
  let keywordManager: any;

  beforeEach(() => {
    jest.clearAllMocks();

    const mockTFile = new TFile();
    mockTFile.path = 'test.md';
    mockTFile.name = 'test.md';
    mockApp.vault.getAbstractFileByPath.mockReturnValue(mockTFile);
    mockApp.vault.read.mockResolvedValue('TODO Task text');

    const settings = createBaseSettings({
      additionalArchivedKeywords: ['ARCHIVED', 'OLD'],
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
  });

  it('should re-add task when transitioning from archived to non-archived state', async () => {
    const mockParser = {
      parseLine: jest.fn().mockReturnValue(
        createBaseTask({
          path: 'test.md',
          line: 0,
          state: 'TODO',
          rawText: 'TODO Reactivated task',
        }),
      ),
    };

    mockPlugin.vaultScanner.getParser.mockReturnValue(mockParser);

    expect(taskStateManager.getTaskCount()).toBe(0);

    await taskUpdateCoordinator.updateTaskByPath(
      'test.md',
      0,
      'TODO',
      'editor',
    );

    expect(taskStateManager.getTaskCount()).toBe(1);
    const reactivatedTask = taskStateManager.findTaskByPathAndLine(
      'test.md',
      0,
    );
    expect(reactivatedTask).not.toBeNull();
    expect(reactivatedTask?.state).toBe('TODO');
  });

  it('should NOT re-add task when transitioning to archived state', async () => {
    const mockParser = {
      parseLine: jest.fn().mockReturnValue(
        createBaseTask({
          path: 'test.md',
          line: 0,
          state: 'ARCHIVED',
          rawText: 'ARCHIVED Task',
        }),
      ),
    };

    mockPlugin.vaultScanner.getParser.mockReturnValue(mockParser);

    expect(taskStateManager.getTaskCount()).toBe(0);

    await taskUpdateCoordinator.updateTaskByPath(
      'test.md',
      0,
      'ARCHIVED',
      'editor',
    );

    expect(taskStateManager.getTaskCount()).toBe(0);
    expect(mockParser.parseLine).not.toHaveBeenCalled();
  });

  it('should use existing task if already in state manager when reactivating', async () => {
    const existingTask = createBaseTask({
      path: 'test.md',
      line: 0,
      state: 'TODO',
      rawText: 'TODO Existing task',
    });

    taskStateManager.addTask(existingTask);

    const mockParser = {
      parseLine: jest.fn().mockReturnValue(
        createBaseTask({
          path: 'test.md',
          line: 0,
          state: 'DOING',
          rawText: 'DOING Existing task',
        }),
      ),
    };

    mockPlugin.vaultScanner.getParser.mockReturnValue(mockParser);

    expect(taskStateManager.getTaskCount()).toBe(1);

    await taskUpdateCoordinator.updateTaskByPath(
      'test.md',
      0,
      'DOING',
      'editor',
    );

    expect(taskStateManager.getTaskCount()).toBe(1);
    const updatedTask = taskStateManager.findTaskByPathAndLine('test.md', 0);
    expect(updatedTask?.state).toBe('DOING');
    expect(mockParser.parseLine).not.toHaveBeenCalled();
  });

  it('should not re-add task if file cannot be found', async () => {
    mockApp.vault.getAbstractFileByPath.mockReturnValue(null);

    expect(taskStateManager.getTaskCount()).toBe(0);

    await taskUpdateCoordinator.updateTaskByPath(
      'nonexistent.md',
      0,
      'TODO',
      'editor',
    );

    expect(taskStateManager.getTaskCount()).toBe(0);
  });

  it('should not re-add task if line is out of bounds', async () => {
    const mockParser = {
      parseLine: jest.fn(),
    };

    mockPlugin.vaultScanner.getParser.mockReturnValue(mockParser);

    expect(taskStateManager.getTaskCount()).toBe(0);

    await taskUpdateCoordinator.updateTaskByPath(
      'test.md',
      100,
      'TODO',
      'editor',
    );

    expect(taskStateManager.getTaskCount()).toBe(0);
    expect(mockParser.parseLine).not.toHaveBeenCalled();
  });

  it('should not re-add task if parsed task is null', async () => {
    const mockParser = {
      parseLine: jest.fn().mockReturnValue(null),
    };

    mockPlugin.vaultScanner.getParser.mockReturnValue(mockParser);

    expect(taskStateManager.getTaskCount()).toBe(0);

    await taskUpdateCoordinator.updateTaskByPath(
      'test.md',
      0,
      'TODO',
      'editor',
    );

    expect(taskStateManager.getTaskCount()).toBe(0);
  });
});
