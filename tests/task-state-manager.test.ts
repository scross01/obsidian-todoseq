import { TaskStateManager } from '../src/services/task-state-manager';
import { Task } from '../src/types/task';
import { createBaseTask, createCheckboxTask } from './helpers/test-helper';

describe('TaskStateManager.optimisticUpdate', () => {
  let stateManager: TaskStateManager;

  beforeEach(() => {
    stateManager = new TaskStateManager();
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
