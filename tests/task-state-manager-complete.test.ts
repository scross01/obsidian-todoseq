import { TaskStateManager } from '../src/services/task-state-manager';
import { Task } from '../src/types/task';
import {
  createBaseTask,
  createTestKeywordManager,
  createBaseSettings,
} from './helpers/test-helper';

describe('TaskStateManager - Complete Coverage', () => {
  let stateManager: TaskStateManager;

  beforeEach(() => {
    const keywordManager = createTestKeywordManager(createBaseSettings());
    stateManager = new TaskStateManager(keywordManager);
  });

  describe('Basic operations', () => {
    it('should initialize with empty tasks', () => {
      const tasks = stateManager.getTasks();
      expect(tasks).toEqual([]);
      expect(stateManager.getTaskCount()).toBe(0);
      expect(stateManager.getIncompleteTaskCount()).toBe(0);
    });

    it('should add tasks', () => {
      const task1 = createBaseTask();
      const task2 = createBaseTask({ line: 1 });

      stateManager.addTask(task1);
      stateManager.addTask(task2);

      expect(stateManager.getTaskCount()).toBe(2);
    });

    it('should remove tasks', () => {
      const task1 = createBaseTask();
      const task2 = createBaseTask({ line: 1 });

      stateManager.addTask(task1);
      stateManager.addTask(task2);

      stateManager.removeTasks((task) => task.line === 1);
      expect(stateManager.getTaskCount()).toBe(1);
      expect(stateManager.findTaskByPathAndLine('test.md', 1)).toBeNull();
    });

    it('should update tasks with updater function', () => {
      const task1 = createBaseTask();
      const task2 = createBaseTask({ line: 1 });

      stateManager.addTask(task1);
      stateManager.addTask(task2);

      stateManager.updateTasks((tasks) =>
        tasks.map((task) =>
          task.line === 1 ? { ...task, state: 'DOING' as Task['state'] } : task,
        ),
      );

      const updatedTask = stateManager.findTaskByPathAndLine('test.md', 1);
      expect(updatedTask?.state).toBe('DOING');
    });

    it('should clear all tasks', () => {
      const task1 = createBaseTask();
      const task2 = createBaseTask({ line: 1 });

      stateManager.addTask(task1);
      stateManager.addTask(task2);

      stateManager.clearTasks();

      expect(stateManager.getTaskCount()).toBe(0);
      expect(stateManager.getTasks()).toEqual([]);
    });
  });

  describe('Task management', () => {
    it('should find task by path and line', () => {
      const task = createBaseTask();
      stateManager.addTask(task);

      const found = stateManager.findTaskByPathAndLine('test.md', 0);
      expect(found).toEqual(task);
    });

    it('should return null when task not found', () => {
      const found = stateManager.findTaskByPathAndLine('nonexistent.md', 0);
      expect(found).toBeNull();
    });

    it('should update task properties', () => {
      const task = createBaseTask();
      stateManager.addTask(task);

      stateManager.updateTask(task, {
        priority: 'high',
        completed: true,
      });

      const updatedTask = stateManager.findTaskByPathAndLine('test.md', 0);
      expect(updatedTask?.priority).toBe('high');
      expect(updatedTask?.completed).toBe(true);
    });

    it('should set tasks directly', () => {
      const tasks = [createBaseTask(), createBaseTask({ line: 1 })];
      stateManager.setTasks(tasks);

      expect(stateManager.getTaskCount()).toBe(2);
    });
  });

  describe('Incomplete task count', () => {
    it('should count incomplete tasks', () => {
      const task1 = createBaseTask({ completed: false });
      const task2 = createBaseTask({ line: 1, completed: true });
      const task3 = createBaseTask({ line: 2, completed: false });

      stateManager.addTask(task1);
      stateManager.addTask(task2);
      stateManager.addTask(task3);

      expect(stateManager.getIncompleteTaskCount()).toBe(2);
    });
  });

  describe('Subscription system', () => {
    it('should notify subscribers of task changes', () => {
      const callback = jest.fn();
      const unsubscribe = stateManager.subscribe(callback);

      expect(callback).toHaveBeenCalledWith([]);

      const task = createBaseTask();
      stateManager.addTask(task);

      expect(callback).toHaveBeenCalledTimes(2);
      expect(callback).toHaveBeenCalledWith([task]);

      unsubscribe();
    });

    it('should allow unsubscribing from task changes', () => {
      const callback = jest.fn();
      const unsubscribe = stateManager.subscribe(callback);

      const task = createBaseTask();
      stateManager.addTask(task);

      expect(callback).toHaveBeenCalledTimes(2);

      unsubscribe();
      stateManager.addTask(createBaseTask({ line: 1 }));

      expect(callback).toHaveBeenCalledTimes(2);
    });
  });

  describe('notifySubscribers guard', () => {
    it('should handle re-entrant notifications', () => {
      const callback = jest.fn((tasks) => {
        if (tasks.length === 1) {
          stateManager.addTask(createBaseTask({ line: 1 }));
        }
      });

      stateManager.subscribe(callback);
      stateManager.addTask(createBaseTask());

      expect(callback).toHaveBeenCalledTimes(3);
    });

    it('should handle errors in subscribers', () => {
      const consoleError = jest.spyOn(console, 'error').mockImplementation();

      // Subscribe after initial callback
      const errorCallback = jest.fn((tasks) => {
        if (tasks.length > 0) {
          throw new Error('Subscriber error');
        }
      });

      stateManager.subscribe(errorCallback);

      // Now trigger a notification
      stateManager.addTask(createBaseTask());

      expect(consoleError).toHaveBeenCalled();
      consoleError.mockRestore();
    });
  });

  describe('optimisticUpdate fallback', () => {
    it('should handle case when task not found by path and line', () => {
      const task = createBaseTask();

      const updatedLine = stateManager.optimisticUpdate(task, 'DOING');

      expect(updatedLine).toContain('DOING');
    });
  });
});
