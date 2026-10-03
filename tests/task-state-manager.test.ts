import { TaskStateManager } from '../src/services/task-state-manager';
import { Task } from '../src/types/task';
import {
  createBaseTask,
  createCheckboxTask,
  createTestKeywordManager,
  createBaseSettings,
} from './helpers/test-helper';

describe('TaskStateManager.optimisticUpdate - re-add for removed tasks', () => {
  let stateManager: TaskStateManager;

  beforeEach(() => {
    const keywordManager = createTestKeywordManager(createBaseSettings());
    stateManager = new TaskStateManager(keywordManager);
  });

  // Regression: archive runs remove tasks from the manager (archived tasks
  // are not collected), so undo must be able to re-add them — otherwise the
  // task never returns to views or the archive dialog's candidate list.
  it('re-adds a task that is no longer in the manager (archive → undo)', () => {
    const task = createBaseTask({
      rawText: '- [x] DONE Old task',
      state: 'DONE',
      completed: true,
      closedDate: new Date(2026, 0, 15),
    });

    const updatedLine = stateManager.optimisticUpdate(task, 'DONE');

    expect(updatedLine).toContain('DONE');
    const stored = stateManager.findTaskByPathAndLine(task.path, task.line);
    expect(stored).not.toBeNull();
    expect(stored?.state).toBe('DONE');
    expect(stored?.completed).toBe(true);
    expect(stored?.closedDate?.getTime()).toBe(task.closedDate?.getTime());
  });

  it('re-adds a table-cell task with its cell identity preserved', () => {
    const task = createBaseTask({
      path: 'table.md',
      line: 3,
      rawText: 'DONE Cell task',
      state: 'DONE',
      completed: true,
      isTableTask: true,
      tableCell: { cellIndex: 1 },
    });

    stateManager.optimisticUpdate(task, 'DONE');

    const stored = stateManager.findTaskByPathAndLine(
      task.path,
      task.line,
      task.tableCell.cellIndex,
    );
    expect(stored).not.toBeNull();
    expect(stored?.isTableTask).toBe(true);
    expect(stored?.tableCell?.cellIndex).toBe(1);
  });

  it('re-adds a task that was removed by an earlier archive run (undo scenario)', () => {
    const task = createBaseTask({
      rawText: '- [x] DONE Previously archived',
      state: 'DONE',
      completed: true,
    });
    stateManager.addTask(task);
    // Simulate the archive run removing the task (archived tasks are not
    // collected) — the manager no longer knows this task.
    stateManager.removeTasks((t) => t === task);
    expect(stateManager.findTaskByPathAndLine(task.path, task.line)).toBeNull();

    // Undo calls optimisticUpdate with the journaled state.
    stateManager.optimisticUpdate(task, 'DONE');

    const stored = stateManager.findTaskByPathAndLine(task.path, task.line);
    expect(stored).not.toBeNull();
    expect(stored?.state).toBe('DONE');
    expect(stateManager.getTaskCount()).toBe(1);
  });

  it('re-add notifies subscribers', () => {
    const subscriber = jest.fn();
    stateManager.subscribe(subscriber);
    subscriber.mockClear();

    const task = createBaseTask({ state: 'DONE', completed: true });
    stateManager.optimisticUpdate(task, 'DONE');

    expect(subscriber).toHaveBeenCalledTimes(1);
    const tasks = subscriber.mock.calls[0][0] as Task[];
    expect(
      tasks.some((t) => t.path === task.path && t.line === task.line),
    ).toBe(true);
  });

  it('re-add of an existing task still replaces the stored entry (no duplicates)', () => {
    const task = createBaseTask({
      rawText: '- [x] DONE First',
      text: 'First',
      state: 'DONE',
      completed: true,
    });
    stateManager.addTask(task);

    const updated = { ...task, text: 'First (changed)' };
    stateManager.optimisticUpdate(updated, 'DONE');

    expect(stateManager.getTaskCount()).toBe(1);
    const stored = stateManager.findTaskByPathAndLine(task.path, task.line);
    expect(stored?.rawText).toBe('- [x] DONE First (changed)');
  });
});

describe('TaskStateManager.optimisticUpdate', () => {
  let stateManager: TaskStateManager;

  beforeEach(() => {
    const keywordManager = createTestKeywordManager(createBaseSettings());
    stateManager = new TaskStateManager(keywordManager);
  });

  describe('Optimistic updates', () => {
    test('should update task in memory with new state', () => {
      const task: Task = createBaseTask();

      // Add task to state manager
      stateManager.addTask(task);

      // Perform optimistic update
      const updatedLine = stateManager.optimisticUpdate(task, 'DOING');

      // Verify task was updated
      const updatedTask = stateManager.findTaskByPathAndLine('test.md', 0);
      expect(updatedTask).not.toBeNull();
      expect(updatedTask?.state).toBe('DOING');
      expect(updatedTask?.completed).toBe(false);

      // Verify the raw text was updated
      expect(updatedLine).toContain('DOING');
    });

    test('should mark task as completed when setting to DONE', () => {
      const task: Task = createBaseTask();

      stateManager.addTask(task);
      stateManager.optimisticUpdate(task, 'DONE');

      const updatedTask = stateManager.findTaskByPathAndLine('test.md', 0);
      expect(updatedTask?.completed).toBe(true);
    });

    test('should preserve priority when updating state', () => {
      const task: Task = createBaseTask({
        rawText: 'TODO [#A] High priority task',
        text: 'High priority task',
        priority: 'high',
      });

      stateManager.addTask(task);
      stateManager.optimisticUpdate(task, 'DOING');

      const updatedTask = stateManager.findTaskByPathAndLine('test.md', 0);
      expect(updatedTask?.priority).toBe('high');
    });

    test('should update checkbox state for completed tasks', () => {
      const task: Task = createCheckboxTask();

      stateManager.addTask(task);
      const updatedLine = stateManager.optimisticUpdate(task, 'DONE');

      expect(updatedLine).toContain('[x]');
    });

    test('should handle tasks without list markers', () => {
      const task: Task = createBaseTask({
        rawText: 'TODO No list marker',
        text: 'No list marker',
      });

      stateManager.addTask(task);
      const updatedLine = stateManager.optimisticUpdate(task, 'DOING');

      expect(updatedLine).toBe('DOING No list marker');
    });
  });

  describe('State transitions', () => {
    test('should update task state from TODO to DOING', () => {
      const task: Task = createBaseTask({
        rawText: 'TODO Initial state',
        text: 'Initial state',
      });

      stateManager.addTask(task);
      stateManager.optimisticUpdate(task, 'DOING');

      const updatedTask = stateManager.findTaskByPathAndLine('test.md', 0);
      expect(updatedTask?.state).toBe('DOING');
    });

    test('should update task state from DOING to DONE', () => {
      const task: Task = createBaseTask({
        rawText: 'DOING In progress',
        text: 'In progress',
        state: 'DOING',
      });

      stateManager.addTask(task);
      stateManager.optimisticUpdate(task, 'DONE');

      const updatedTask = stateManager.findTaskByPathAndLine('test.md', 0);
      expect(updatedTask?.state).toBe('DONE');
      expect(updatedTask?.completed).toBe(true);
    });
  });
});

describe('TaskStateManager.getTasks() mutation safety', () => {
  let stateManager: TaskStateManager;

  beforeEach(() => {
    const keywordManager = createTestKeywordManager(createBaseSettings());
    stateManager = new TaskStateManager(keywordManager);
  });

  test('should return a shallow copy, not the original array', () => {
    const task: Task = createBaseTask();
    stateManager.addTask(task);

    const tasks1 = stateManager.getTasks();
    const tasks2 = stateManager.getTasks();

    // Different array references
    expect(tasks1).not.toBe(tasks2);
    // Same contents
    expect(tasks1).toEqual(tasks2);
  });

  test('should prevent external array mutations', () => {
    const task: Task = createBaseTask();
    stateManager.addTask(task);

    const tasks = stateManager.getTasks();
    const originalLength = tasks.length;

    // Try to mutate the returned array with push
    tasks.push({ ...task, line: 999 });

    // Internal state should be unchanged
    expect(stateManager.getTasks().length).toBe(originalLength);
    expect(stateManager.getTasks().length).toBe(1);
  });

  test('should prevent external array mutations with pop', () => {
    const task1: Task = createBaseTask();
    const task2: Task = createBaseTask({ line: 1 });
    stateManager.addTask(task1);
    stateManager.addTask(task2);

    const tasks = stateManager.getTasks();
    const originalLength = tasks.length;

    // Try to mutate the returned array with pop
    tasks.pop();

    // Internal state should be unchanged
    expect(stateManager.getTasks().length).toBe(originalLength);
    expect(stateManager.getTasks().length).toBe(2);
  });

  test('should allow task object mutations by design', () => {
    const task: Task = createBaseTask();
    stateManager.addTask(task);

    const tasks = stateManager.getTasks();
    // This is allowed by design for performance
    tasks[0].line = 999;

    // Task object is mutable
    expect(tasks[0].line).toBe(999);
    // Note: This is intentional - task objects are mutable by design
  });

  test('should return copy that can be safely filtered', () => {
    const task1: Task = createBaseTask({ completed: false });
    const task2: Task = createBaseTask({ line: 1, completed: true });
    stateManager.addTask(task1);
    stateManager.addTask(task2);

    const tasks = stateManager.getTasks();
    const incompleteTasks = tasks.filter((t) => !t.completed);

    // Filtering should work normally
    expect(incompleteTasks.length).toBe(1);
    expect(incompleteTasks[0].completed).toBe(false);

    // Original state unchanged
    expect(stateManager.getTasks().length).toBe(2);
  });
});
