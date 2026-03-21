import { TaskStateManager } from '../src/services/task-state-manager';
import { Task } from '../src/types/task';
import {
  createBaseTask,
  createCheckboxTask,
  createTestKeywordManager,
  createBaseSettings,
} from './helpers/test-helper';

describe('TaskStateManager - Subtask Parent Updates', () => {
  let stateManager: TaskStateManager;

  beforeEach(() => {
    const keywordManager = createTestKeywordManager(createBaseSettings());
    stateManager = new TaskStateManager(keywordManager);
  });

  describe('findParentTasks', () => {
    test('should find parent task for indented subtask', () => {
      // Create a parent task with checkbox
      const parentTask = createCheckboxTask({
        line: 0,
        rawText: '- [ ] TODO Parent task',
        text: 'Parent task',
        indent: '',
        subtaskCount: 1,
        subtaskCompletedCount: 0,
      });

      // Create a subtask indented under parent
      const subtask = createCheckboxTask({
        line: 1,
        rawText: '  - [ ] TODO Subtask',
        text: 'Subtask',
        indent: '  ',
        subtaskCount: 0,
        subtaskCompletedCount: 0,
      });

      // Add tasks to state manager
      stateManager.addTask(parentTask);
      stateManager.addTask(subtask);

      // Access private method via type assertion for testing
      const findParentTasks = (stateManager as any).findParentTasks.bind(
        stateManager,
      );
      const parents = findParentTasks(subtask);

      expect(parents).toHaveLength(1);
      expect(parents[0].line).toBe(0);
    });

    test('should find multiple parent tasks for nested subtasks', () => {
      // Create root task
      const rootTask = createCheckboxTask({
        line: 0,
        rawText: '- [ ] TODO Root task',
        text: 'Root task',
        indent: '',
        subtaskCount: 1,
        subtaskCompletedCount: 0,
      });

      // Create middle task indented under root
      const middleTask = createCheckboxTask({
        line: 1,
        rawText: '  - [ ] TODO Middle task',
        text: 'Middle task',
        indent: '  ',
        subtaskCount: 1,
        subtaskCompletedCount: 0,
      });

      // Create subtask indented under middle
      const subtask = createCheckboxTask({
        line: 2,
        rawText: '    - [ ] TODO Subtask',
        text: 'Subtask',
        indent: '    ',
        subtaskCount: 0,
        subtaskCompletedCount: 0,
      });

      // Add tasks to state manager
      stateManager.addTask(rootTask);
      stateManager.addTask(middleTask);
      stateManager.addTask(subtask);

      const findParentTasks = (stateManager as any).findParentTasks.bind(
        stateManager,
      );
      const parents = findParentTasks(subtask);

      expect(parents).toHaveLength(2);
      expect(parents[0].line).toBe(1); // Immediate parent first
      expect(parents[1].line).toBe(0); // Root parent second
    });

    test('should not find parent for task with no indent', () => {
      const task = createCheckboxTask({
        line: 0,
        rawText: '- [ ] TODO Task',
        text: 'Task',
        indent: '',
        subtaskCount: 0,
        subtaskCompletedCount: 0,
      });

      stateManager.addTask(task);

      const findParentTasks = (stateManager as any).findParentTasks.bind(
        stateManager,
      );
      const parents = findParentTasks(task);

      expect(parents).toHaveLength(0);
    });

    test('should not find parent in different file', () => {
      const parentTask = createCheckboxTask({
        line: 0,
        rawText: '- [ ] TODO Parent task',
        text: 'Parent task',
        indent: '',
        path: 'parent.md',
        subtaskCount: 0,
        subtaskCompletedCount: 0,
      });

      const subtask = createCheckboxTask({
        line: 0,
        rawText: '  - [ ] TODO Subtask',
        text: 'Subtask',
        indent: '  ',
        path: 'subtask.md',
        subtaskCount: 0,
        subtaskCompletedCount: 0,
      });

      stateManager.addTask(parentTask);
      stateManager.addTask(subtask);

      const findParentTasks = (stateManager as any).findParentTasks.bind(
        stateManager,
      );
      const parents = findParentTasks(subtask);

      expect(parents).toHaveLength(0);
    });

    test('should handle tasks without checkboxes', () => {
      // Parent without checkbox
      const parentTask = createBaseTask({
        line: 0,
        rawText: 'TODO Parent task',
        text: 'Parent task',
        indent: '',
        subtaskCount: 1,
        subtaskCompletedCount: 0,
      });

      // Subtask at same indent (valid for parents without checkbox)
      const subtask = createBaseTask({
        line: 1,
        rawText: 'TODO Subtask',
        text: 'Subtask',
        indent: '',
        subtaskCount: 0,
        subtaskCompletedCount: 0,
      });

      stateManager.addTask(parentTask);
      stateManager.addTask(subtask);

      const findParentTasks = (stateManager as any).findParentTasks.bind(
        stateManager,
      );
      const parents = findParentTasks(subtask);

      expect(parents).toHaveLength(1);
    });
  });

  describe('updateParentSubtaskCounts', () => {
    test('should increment completed count when subtask becomes completed', () => {
      const parentTask = createCheckboxTask({
        line: 0,
        rawText: '- [ ] TODO Parent task',
        text: 'Parent task',
        subtaskCount: 1,
        subtaskCompletedCount: 0,
      });

      stateManager.addTask(parentTask);

      const updateParentSubtaskCounts = (
        stateManager as any
      ).updateParentSubtaskCounts.bind(stateManager);
      updateParentSubtaskCounts(parentTask, false, true);

      const updatedParent = stateManager.findTaskByPathAndLine('test.md', 0);
      expect(updatedParent?.subtaskCompletedCount).toBe(1);
    });

    test('should decrement completed count when subtask becomes incomplete', () => {
      const parentTask = createCheckboxTask({
        line: 0,
        rawText: '- [ ] TODO Parent task',
        text: 'Parent task',
        subtaskCount: 1,
        subtaskCompletedCount: 1,
      });

      stateManager.addTask(parentTask);

      const updateParentSubtaskCounts = (
        stateManager as any
      ).updateParentSubtaskCounts.bind(stateManager);
      updateParentSubtaskCounts(parentTask, true, false);

      const updatedParent = stateManager.findTaskByPathAndLine('test.md', 0);
      expect(updatedParent?.subtaskCompletedCount).toBe(0);
    });

    test('should not go below zero when decrementing', () => {
      const parentTask = createCheckboxTask({
        line: 0,
        rawText: '- [ ] TODO Parent task',
        text: 'Parent task',
        subtaskCount: 1,
        subtaskCompletedCount: 0,
      });

      stateManager.addTask(parentTask);

      const updateParentSubtaskCounts = (
        stateManager as any
      ).updateParentSubtaskCounts.bind(stateManager);
      updateParentSubtaskCounts(parentTask, true, false);

      const updatedParent = stateManager.findTaskByPathAndLine('test.md', 0);
      expect(updatedParent?.subtaskCompletedCount).toBe(0);
    });

    test('should not change count when completion status does not change', () => {
      const parentTask = createCheckboxTask({
        line: 0,
        rawText: '- [ ] TODO Parent task',
        text: 'Parent task',
        subtaskCount: 1,
        subtaskCompletedCount: 0,
      });

      stateManager.addTask(parentTask);

      const updateParentSubtaskCounts = (
        stateManager as any
      ).updateParentSubtaskCounts.bind(stateManager);
      updateParentSubtaskCounts(parentTask, false, false);

      const updatedParent = stateManager.findTaskByPathAndLine('test.md', 0);
      expect(updatedParent?.subtaskCompletedCount).toBe(0);
    });
  });

  describe('optimisticUpdate - parent subtask counts', () => {
    test('should increment parent completed count when subtask is marked done', () => {
      const parentTask = createCheckboxTask({
        line: 0,
        rawText: '- [ ] TODO Parent task',
        text: 'Parent task',
        indent: '',
        subtaskCount: 1,
        subtaskCompletedCount: 0,
      });

      const subtask = createCheckboxTask({
        line: 1,
        rawText: '  - [ ] TODO Subtask',
        text: 'Subtask',
        indent: '  ',
        subtaskCount: 0,
        subtaskCompletedCount: 0,
      });

      stateManager.addTask(parentTask);
      stateManager.addTask(subtask);

      // Mark subtask as done
      stateManager.optimisticUpdate(subtask, 'DONE');

      const updatedParent = stateManager.findTaskByPathAndLine('test.md', 0);
      expect(updatedParent?.subtaskCompletedCount).toBe(1);
    });

    test('should decrement parent completed count when subtask is unmarked done', () => {
      const parentTask = createCheckboxTask({
        line: 0,
        rawText: '- [ ] TODO Parent task',
        text: 'Parent task',
        indent: '',
        subtaskCount: 1,
        subtaskCompletedCount: 1,
      });

      const subtask = createCheckboxTask({
        line: 1,
        rawText: '  - [x] DONE Subtask',
        text: 'Subtask',
        indent: '  ',
        subtaskCount: 0,
        subtaskCompletedCount: 0,
        state: 'DONE',
        completed: true,
      });

      stateManager.addTask(parentTask);
      stateManager.addTask(subtask);

      // Mark subtask as not done
      stateManager.optimisticUpdate(subtask, 'TODO');

      const updatedParent = stateManager.findTaskByPathAndLine('test.md', 0);
      expect(updatedParent?.subtaskCompletedCount).toBe(0);
    });

    test('should update all ancestor counts for nested subtasks', () => {
      const rootTask = createCheckboxTask({
        line: 0,
        rawText: '- [ ] TODO Root task',
        text: 'Root task',
        indent: '',
        subtaskCount: 1,
        subtaskCompletedCount: 0,
      });

      const middleTask = createCheckboxTask({
        line: 1,
        rawText: '  - [ ] TODO Middle task',
        text: 'Middle task',
        indent: '  ',
        subtaskCount: 1,
        subtaskCompletedCount: 0,
      });

      const subtask = createCheckboxTask({
        line: 2,
        rawText: '    - [ ] TODO Subtask',
        text: 'Subtask',
        indent: '    ',
        subtaskCount: 0,
        subtaskCompletedCount: 0,
      });

      stateManager.addTask(rootTask);
      stateManager.addTask(middleTask);
      stateManager.addTask(subtask);

      // Mark subtask as done
      stateManager.optimisticUpdate(subtask, 'DONE');

      const updatedRoot = stateManager.findTaskByPathAndLine('test.md', 0);
      const updatedMiddle = stateManager.findTaskByPathAndLine('test.md', 1);

      expect(updatedRoot?.subtaskCompletedCount).toBe(1);
      expect(updatedMiddle?.subtaskCompletedCount).toBe(1);
    });

    test('should not update parent when completion status does not change', () => {
      const parentTask = createCheckboxTask({
        line: 0,
        rawText: '- [ ] TODO Parent task',
        text: 'Parent task',
        indent: '',
        subtaskCount: 1,
        subtaskCompletedCount: 0,
      });

      const subtask = createCheckboxTask({
        line: 1,
        rawText: '  - [ ] TODO Subtask',
        text: 'Subtask',
        indent: '  ',
        subtaskCount: 0,
        subtaskCompletedCount: 0,
      });

      stateManager.addTask(parentTask);
      stateManager.addTask(subtask);

      // Change state but not completion status
      stateManager.optimisticUpdate(subtask, 'DOING');

      const updatedParent = stateManager.findTaskByPathAndLine('test.md', 0);
      expect(updatedParent?.subtaskCompletedCount).toBe(0);
    });
  });

  describe('updateTask - parent subtask counts', () => {
    test('should increment parent completed count when subtask is marked done', () => {
      const parentTask = createCheckboxTask({
        line: 0,
        rawText: '- [ ] TODO Parent task',
        text: 'Parent task',
        indent: '',
        subtaskCount: 1,
        subtaskCompletedCount: 0,
      });

      const subtask = createCheckboxTask({
        line: 1,
        rawText: '  - [ ] TODO Subtask',
        text: 'Subtask',
        indent: '  ',
        subtaskCount: 0,
        subtaskCompletedCount: 0,
      });

      stateManager.addTask(parentTask);
      stateManager.addTask(subtask);

      // Mark subtask as done via updateTaskByPathAndLine
      stateManager.updateTaskByPathAndLine('test.md', 1, {
        state: 'DONE',
        completed: true,
        rawText: '  - [x] DONE Subtask',
      });

      const updatedParent = stateManager.findTaskByPathAndLine('test.md', 0);
      expect(updatedParent?.subtaskCompletedCount).toBe(1);
    });

    test('should decrement parent completed count when subtask is unmarked done', () => {
      const parentTask = createCheckboxTask({
        line: 0,
        rawText: '- [ ] TODO Parent task',
        text: 'Parent task',
        indent: '',
        subtaskCount: 1,
        subtaskCompletedCount: 1,
      });

      const subtask = createCheckboxTask({
        line: 1,
        rawText: '  - [x] DONE Subtask',
        text: 'Subtask',
        indent: '  ',
        subtaskCount: 0,
        subtaskCompletedCount: 0,
        state: 'DONE',
        completed: true,
      });

      stateManager.addTask(parentTask);
      stateManager.addTask(subtask);

      // Mark subtask as not done via updateTaskByPathAndLine
      stateManager.updateTaskByPathAndLine('test.md', 1, {
        state: 'TODO',
        completed: false,
        rawText: '  - [ ] TODO Subtask',
      });

      const updatedParent = stateManager.findTaskByPathAndLine('test.md', 0);
      expect(updatedParent?.subtaskCompletedCount).toBe(0);
    });

    test('should not update parent when completed field is not changed', () => {
      const parentTask = createCheckboxTask({
        line: 0,
        rawText: '- [ ] TODO Parent task',
        text: 'Parent task',
        indent: '',
        subtaskCount: 1,
        subtaskCompletedCount: 0,
      });

      const subtask = createCheckboxTask({
        line: 1,
        rawText: '  - [ ] TODO Subtask',
        text: 'Subtask',
        indent: '  ',
        subtaskCount: 0,
        subtaskCompletedCount: 0,
      });

      stateManager.addTask(parentTask);
      stateManager.addTask(subtask);

      // Update without changing completed status
      stateManager.updateTaskByPathAndLine('test.md', 1, {
        rawText: '  - [ ] TODO Updated subtask',
      });

      const updatedParent = stateManager.findTaskByPathAndLine('test.md', 0);
      expect(updatedParent?.subtaskCompletedCount).toBe(0);
    });
  });

  describe('getIndentLength', () => {
    test('should count spaces correctly', () => {
      const getIndentLength = (stateManager as any).getIndentLength.bind(
        stateManager,
      );
      expect(getIndentLength('')).toBe(0);
      expect(getIndentLength(' ')).toBe(1);
      expect(getIndentLength('  ')).toBe(2);
      expect(getIndentLength('    ')).toBe(4);
    });

    test('should count tabs as 2 spaces', () => {
      const getIndentLength = (stateManager as any).getIndentLength.bind(
        stateManager,
      );
      expect(getIndentLength('\t')).toBe(2);
      expect(getIndentLength('\t\t')).toBe(4);
      expect(getIndentLength(' \t ')).toBe(4);
    });
  });

  describe('isSubtaskOf', () => {
    test('should identify indented subtask under checkbox parent', () => {
      const parentTask = createCheckboxTask({
        line: 0,
        rawText: '- [ ] TODO Parent',
        text: 'Parent',
        indent: '',
      });

      const subtask = createCheckboxTask({
        line: 1,
        rawText: '  - [ ] TODO Subtask',
        text: 'Subtask',
        indent: '  ',
      });

      const isSubtaskOf = (stateManager as any).isSubtaskOf.bind(stateManager);
      expect(isSubtaskOf(subtask, parentTask)).toBe(true);
    });

    test('should not identify same-level task as subtask under checkbox parent', () => {
      const parentTask = createCheckboxTask({
        line: 0,
        rawText: '- [ ] TODO Parent',
        text: 'Parent',
        indent: '',
      });

      const sameLevelTask = createCheckboxTask({
        line: 1,
        rawText: '- [ ] TODO Same level',
        text: 'Same level',
        indent: '',
      });

      const isSubtaskOf = (stateManager as any).isSubtaskOf.bind(stateManager);
      expect(isSubtaskOf(sameLevelTask, parentTask)).toBe(false);
    });

    test('should identify same-level task as subtask under non-checkbox parent', () => {
      const parentTask = createBaseTask({
        line: 0,
        rawText: 'TODO Parent',
        text: 'Parent',
        indent: '',
      });

      const sameLevelTask = createBaseTask({
        line: 1,
        rawText: 'TODO Same level',
        text: 'Same level',
        indent: '',
      });

      const isSubtaskOf = (stateManager as any).isSubtaskOf.bind(stateManager);
      expect(isSubtaskOf(sameLevelTask, parentTask)).toBe(true);
    });
  });

  describe('findParentTasksForCheckbox', () => {
    test('should find parent task for checkbox-only subtask', () => {
      const parentTask = createCheckboxTask({
        line: 0,
        rawText: '- [ ] TODO Parent task',
        text: 'Parent task',
        indent: '',
        subtaskCount: 1,
        subtaskCompletedCount: 0,
      });

      stateManager.addTask(parentTask);

      const parents = stateManager.findParentTasksForCheckbox(
        'test.md',
        1,
        '  ',
      );

      expect(parents).toHaveLength(1);
      expect(parents[0].line).toBe(0);
    });

    test('should find multiple parent tasks for nested checkbox-only subtask', () => {
      const rootTask = createCheckboxTask({
        line: 0,
        rawText: '- [ ] TODO Root task',
        text: 'Root task',
        indent: '',
        subtaskCount: 1,
        subtaskCompletedCount: 0,
      });

      const middleTask = createCheckboxTask({
        line: 1,
        rawText: '  - [ ] TODO Middle task',
        text: 'Middle task',
        indent: '  ',
        subtaskCount: 1,
        subtaskCompletedCount: 0,
      });

      stateManager.addTask(rootTask);
      stateManager.addTask(middleTask);

      const parents = stateManager.findParentTasksForCheckbox(
        'test.md',
        2,
        '    ',
      );

      expect(parents).toHaveLength(2);
      expect(parents[0].line).toBe(1); // Immediate parent first
      expect(parents[1].line).toBe(0); // Root parent second
    });

    test('should return empty array when no parent task exists', () => {
      const parents = stateManager.findParentTasksForCheckbox('test.md', 0, '');
      expect(parents).toHaveLength(0);
    });

    test('should return empty array for task in different file', () => {
      const parentTask = createCheckboxTask({
        line: 0,
        rawText: '- [ ] TODO Parent task',
        text: 'Parent task',
        indent: '',
        path: 'other.md',
      });

      stateManager.addTask(parentTask);

      const parents = stateManager.findParentTasksForCheckbox(
        'test.md',
        1,
        '  ',
      );
      expect(parents).toHaveLength(0);
    });
  });

  describe('updateParentSubtaskCountsForCheckbox', () => {
    let parentTask: Task;
    let notifySubscriber: jest.Mock;

    beforeEach(() => {
      notifySubscriber = jest.fn();
      stateManager.subscribe(notifySubscriber);

      parentTask = createCheckboxTask({
        line: 0,
        rawText: '- [ ] TODO Parent task',
        text: 'Parent task',
        indent: '',
        subtaskCount: 2,
        subtaskCompletedCount: 0,
      });

      stateManager.addTask(parentTask);
    });

    test('should increment completed count when checkbox-only subtask is checked', () => {
      stateManager.updateParentSubtaskCountsForCheckbox(
        'test.md',
        1,
        '  ',
        false, // was not completed
        true, // now completed
        true,
      );

      const updatedParent = stateManager.findTaskByPathAndLine('test.md', 0);
      expect(updatedParent?.subtaskCompletedCount).toBe(1);
      expect(notifySubscriber).toHaveBeenCalled();
    });

    test('should decrement completed count when checkbox-only subtask is unchecked', () => {
      // Set up with one completed subtask
      stateManager.updateParentSubtaskCountsForCheckbox(
        'test.md',
        1,
        '  ',
        false,
        true,
        false,
      );

      notifySubscriber.mockClear();

      stateManager.updateParentSubtaskCountsForCheckbox(
        'test.md',
        1,
        '  ',
        true, // was completed
        false, // now not completed
        true,
      );

      const updatedParent = stateManager.findTaskByPathAndLine('test.md', 0);
      expect(updatedParent?.subtaskCompletedCount).toBe(0);
      expect(notifySubscriber).toHaveBeenCalled();
    });

    test('should not change count when completion status does not change', () => {
      notifySubscriber.mockClear();

      stateManager.updateParentSubtaskCountsForCheckbox(
        'test.md',
        1,
        '  ',
        false,
        false,
        true,
      );

      const updatedParent = stateManager.findTaskByPathAndLine('test.md', 0);
      expect(updatedParent?.subtaskCompletedCount).toBe(0);
      expect(notifySubscriber).not.toHaveBeenCalled();
    });

    test('should not decrement below zero', () => {
      stateManager.updateParentSubtaskCountsForCheckbox(
        'test.md',
        1,
        '  ',
        true, // was completed
        false, // now not completed
        true,
      );

      const updatedParent = stateManager.findTaskByPathAndLine('test.md', 0);
      expect(updatedParent?.subtaskCompletedCount).toBe(0);
    });

    test('should update all parent counts for nested checkbox-only subtask', () => {
      const rootTask = createCheckboxTask({
        line: 0,
        rawText: '- [ ] TODO Root task',
        text: 'Root task',
        indent: '',
        subtaskCount: 1,
        subtaskCompletedCount: 0,
      });

      const middleTask = createCheckboxTask({
        line: 1,
        rawText: '  - [ ] TODO Middle task',
        text: 'Middle task',
        indent: '  ',
        subtaskCount: 1,
        subtaskCompletedCount: 0,
      });

      stateManager.clearTasks();
      stateManager.addTask(rootTask);
      stateManager.addTask(middleTask);

      stateManager.updateParentSubtaskCountsForCheckbox(
        'test.md',
        2,
        '    ',
        false,
        true,
        true,
      );

      const updatedRoot = stateManager.findTaskByPathAndLine('test.md', 0);
      const updatedMiddle = stateManager.findTaskByPathAndLine('test.md', 1);

      expect(updatedRoot?.subtaskCompletedCount).toBe(1);
      expect(updatedMiddle?.subtaskCompletedCount).toBe(1);
    });
  });
});
