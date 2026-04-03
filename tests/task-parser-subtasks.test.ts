import { TaskParser } from '../src/parser/task-parser';
import { TodoTrackerSettings } from '../src/settings/settings-types';
import {
  createBaseSettings,
  createTestKeywordManager,
} from './helpers/test-helper';

describe('Task Parser - Subtasks', () => {
  let parser: TaskParser;

  beforeEach(() => {
    // Create a default parser instance for testing
    const keywordManager = createTestKeywordManager({
      additionalActiveKeywords: ['TODO'],
    });
    parser = TaskParser.create(keywordManager, null);
  });

  describe('Basic subtask counting', () => {
    test('should count subtasks with and without spaces', () => {
      const content = `TODO test 1
- [ ] subtask1
- [ ] subtask2

TODO test 2
- [ ] subtask 1
- [ ] subtask 2`;

      const tasks = parser.parseFile(content, 'test.md');

      // Verify test1 has 2 subtasks
      const test1 = tasks.find((task) => task.text.includes('test 1'));
      expect(test1).not.toBeUndefined();
      expect(test1?.subtaskCount).toBe(2);

      // Verify test2 has 2 subtasks
      const test2 = tasks.find((task) => task.text.includes('test 2'));
      expect(test2).not.toBeUndefined();
      expect(test2?.subtaskCount).toBe(2);
    });

    test('should parse quoted task with subtasks', () => {
      const lines = `> TODO a quoted task with subtasks
>   - [ ] subtask 1
>   - [ ] subtask 2`;
      const tasks = parser.parseFile(lines, 'test.md');

      expect(tasks).toHaveLength(1);
      const task = tasks[0];

      // Verify the task has exactly 2 subtasks
      expect(task.subtaskCount).toBe(2);
    });
  });

  describe('Nested subtasks', () => {
    test('should parse tasks with nested subtasks', () => {
      const content = `TODO a task with subtasks
 - [ ] subtask 1
 - [ ] subtask 2
 - [ ] TODO subtask 3 is also a task
 - [ ] TODO subtask 4 has subtasks
 	 - [ ] next level subtask`;

      const tasks = parser.parseFile(content, 'test.md');

      // Verify main task has 5 subtasks (including nested subtask)
      const mainTask = tasks.find((task) =>
        task.text.includes('a task with subtasks'),
      );
      expect(mainTask).not.toBeUndefined();
      expect(mainTask?.subtaskCount).toBe(5);

      // Verify subtask 4 has 1 subtask
      const subtask4 = tasks.find((task) =>
        task.text.includes('subtask 4 has subtasks'),
      );
      expect(subtask4).not.toBeUndefined();
      expect(subtask4?.subtaskCount).toBe(1);
    });
  });

  describe('Different task types with subtasks', () => {
    test('should parse different task types correctly', () => {
      const content = `- TODO a bulleted task with subtasks
	- [ ] subtask 1
	- [ ] subtask 2

- [ ] TODO a checkbox task with subtasks
	- [ ] subtask 1
	- [ ] subtask 2

> TODO a quoted task with subtasks
>   - [ ] subtask 1
>   - [ ] subtask 2 `;

      const tasks = parser.parseFile(content, 'test.md');

      // Verify bulleted task has 2 subtasks
      const bulletedTask = tasks.find((task) =>
        task.text.includes('a bulleted task with subtasks'),
      );
      expect(bulletedTask).not.toBeUndefined();
      expect(bulletedTask?.subtaskCount).toBe(2);

      // Verify checkbox task has 2 subtasks
      const checkboxTask = tasks.find((task) =>
        task.text.includes('a checkbox task with subtasks'),
      );
      expect(checkboxTask).not.toBeUndefined();
      expect(checkboxTask?.subtaskCount).toBe(2);

      // Verify quoted task has 2 subtasks
      const quotedTask = tasks.find((task) =>
        task.text.includes('a quoted task with subtasks'),
      );
      expect(quotedTask).not.toBeUndefined();
      expect(quotedTask?.subtaskCount).toBe(2);
    });
  });

  describe('Complex subtask collection scenarios', () => {
    test('should parse complex subtask scenarios correctly', () => {
      const content = `TODO test 1 with subtasks
- [ ] subtask 1 
- [ ] subtask 2

TODO test 2 with subtasks
- [ ] subtask 1
	- some none task content within the subtask
- [ ] subtask 2

Some other text
- [ ] not a subtask

- [ ] TODO test 3 with subtasks
	- [ ] subtask 1
	- [ ] subtask 2
- [ ] not a subtask
- [ ] also not a subtask
- [ ] TODO test 4 with no subtasks 
- [ ] TODO test 5 with no subtasks 
- [ ] another not a subtask`;

      const tasks = parser.parseFile(content, 'test.md');

      // Verify test1 has 2 subtasks
      const test1 = tasks.find((task) => task.text.includes('test 1'));
      expect(test1).not.toBeUndefined();
      expect(test1?.subtaskCount).toBe(2);

      // Verify test2 has 2 subtasks
      const test2 = tasks.find((task) => task.text.includes('test 2'));
      expect(test2).not.toBeUndefined();
      expect(test2?.subtaskCount).toBe(2);

      // Verify test3 has 2 subtasks
      const test3 = tasks.find((task) => task.text.includes('test 3'));
      expect(test3).not.toBeUndefined();
      expect(test3?.subtaskCount).toBe(2);

      // Verify test4 has 0 subtasks
      const test4 = tasks.find((task) => task.text.includes('test 4'));
      expect(test4).not.toBeUndefined();
      expect(test4?.subtaskCount).toBe(0);

      // Verify test5 has 0 subtasks
      const test5 = tasks.find((task) => task.text.includes('test 5'));
      expect(test5).not.toBeUndefined();
      expect(test5?.subtaskCount).toBe(0);
    });
  });
});

describe('Task Parser - Edge Cases', () => {
  beforeEach(() => {
    const keywordManager = createTestKeywordManager({
      additionalActiveKeywords: ['TODO'],
    });
    parser = TaskParser.create(keywordManager, null);
  });

  test('should handle tasks with no subtasks', () => {
    const content = `TODO task with no subtasks
Some content here`;
    const tasks = parser.parseFile(content, 'test.md');

    const task = tasks.find((t) => t.text.includes('task with no subtasks'));
    expect(task).not.toBeUndefined();
    expect(task?.subtaskCount).toBe(0);
  });

  test('should handle deeply nested subtasks', () => {
    const content = `TODO parent task
- [ ] level 1 subtask
  - [ ] level 2 subtask
    - [ ] level 3 subtask
      - [ ] level 4 subtask`;
    const tasks = parser.parseFile(content, 'test.md');

    const parentTask = tasks.find((t) => t.text.includes('parent task'));
    expect(parentTask).not.toBeUndefined();
    // All 4 nested checkboxes should be counted as subtasks
    expect(parentTask?.subtaskCount).toBe(4);
  });

  test('should handle mixed tab and space indentation', () => {
    const content = `TODO task
 - [ ] tab indented
  - [ ] space indented
 - [ ] tab again`;
    const tasks = parser.parseFile(content, 'test.md');

    const task = tasks.find((t) => t.text.includes('task'));
    expect(task).not.toBeUndefined();
    expect(task?.subtaskCount).toBe(3);
  });

  test('should count subtasks with different checkbox states', () => {
    const content = `TODO task
- [ ] incomplete
- [x] completed`;
    const tasks = parser.parseFile(content, 'test.md');

    const task = tasks.find((t) => t.text.includes('task'));
    expect(task).not.toBeUndefined();
    // Both incomplete and completed checkboxes should be counted
    expect(task?.subtaskCount).toBe(2);
  });

  test('should handle empty lines between subtasks', () => {
    const content = `TODO task
- [ ] subtask 1

- [ ] subtask 2`;
    const tasks = parser.parseFile(content, 'test.md');

    const task = tasks.find((t) => t.text.includes('task'));
    expect(task).not.toBeUndefined();
    // Empty lines should stop subtask counting
    expect(task?.subtaskCount).toBe(1);
  });

  test('should count subtasks with priority markers', () => {
    const content = `TODO task
- [ ] 🔴 high priority subtask
- [ ] 🟡 medium priority subtask
- [ ] 🟢 low priority subtask`;
    const tasks = parser.parseFile(content, 'test.md');

    const task = tasks.find((t) => t.text.includes('task'));
    expect(task).not.toBeUndefined();
    expect(task?.subtaskCount).toBe(3);
  });

  test('should handle different list marker types', () => {
    const content = `TODO task
- [ ] dash marker
* [ ] asterisk marker
+ [ ] plus marker`;
    const tasks = parser.parseFile(content, 'test.md');

    const task = tasks.find((t) => t.text.includes('task'));
    expect(task).not.toBeUndefined();
    expect(task?.subtaskCount).toBe(3);
  });
});

describe('Task Parser - Quoted Task Indentation', () => {
  let parser: TaskParser;
  let settings: TodoTrackerSettings;

  beforeEach(() => {
    settings = createBaseSettings({
      additionalInactiveKeywords: [],
      languageCommentSupport: false,
    });
    parser = TaskParser.create(
      createTestKeywordManager(settings),
      null,
      undefined,
      settings,
    );
  });

  test('should parse quoted task with correct subtask count and properties', () => {
    const lines = `> TODO a quoted task with subtasks
>   - [ ] subtask 1
>   - [ ] subtask 2`;

    const tasks = parser.parseFile(lines, 'test.md');
    expect(tasks).toHaveLength(1);
    const task = tasks[0];

    // Verify the task has the correct text
    expect(task.text).toBe('a quoted task with subtasks');

    // Verify the task has 2 subtasks
    expect(task.subtaskCount).toBe(2);

    // Verify the task is on the correct line
    expect(task.line).toBe(0);
  });
});

describe('Task Parser - Checkbox Task Subtask Detection', () => {
  let parser: TaskParser;

  beforeEach(() => {
    const keywordManager = createTestKeywordManager({
      additionalActiveKeywords: ['TODO', 'DOING'],
    });
    parser = TaskParser.create(keywordManager, null);
  });

  test('should NOT treat same-indent checkbox lines as subtasks when parent has [-] checkbox', () => {
    const content = `- [-] DOING active task with checkbox
- [ ] next line at same indent
- [ ] another line at same indent`;

    const tasks = parser.parseFile(content, 'test.md');

    const activeTask = tasks.find((t) =>
      t.text.includes('active task with checkbox'),
    );
    expect(activeTask).not.toBeUndefined();
    // Parent has a checkbox, so same-indent checkbox lines are NOT subtasks
    expect(activeTask?.subtaskCount).toBe(0);
  });

  test('should NOT treat same-indent checkbox lines as subtasks when parent has [/] checkbox', () => {
    const content = `- [/] DOING active task with checkbox
- [ ] next line at same indent
- [ ] another line at same indent`;

    const tasks = parser.parseFile(content, 'test.md');

    const activeTask = tasks.find((t) =>
      t.text.includes('active task with checkbox'),
    );
    expect(activeTask).not.toBeUndefined();
    // Parent has a checkbox, so same-indent checkbox lines are NOT subtasks
    expect(activeTask?.subtaskCount).toBe(0);
  });

  test('should count indented checkbox lines as subtasks when parent has [/] checkbox', () => {
    const content = `- [/] DOING active task with checkbox
  - [ ] indented subtask 1
  - [ ] indented subtask 2`;

    const tasks = parser.parseFile(content, 'test.md');

    const activeTask = tasks.find((t) =>
      t.text.includes('active task with checkbox'),
    );
    expect(activeTask).not.toBeUndefined();
    // Parent has a checkbox, indented lines ARE subtasks
    expect(activeTask?.subtaskCount).toBe(2);
  });

  test('should NOT treat same-indent checkbox lines as subtasks when parent has [x] checkbox', () => {
    const content = `- [x] DONE completed task with checkbox
- [ ] next line at same indent
- [ ] another line at same indent`;

    const keywordManager = createTestKeywordManager({
      additionalActiveKeywords: ['TODO'],
      additionalCompletedKeywords: ['DONE'],
    });
    const completedParser = TaskParser.create(keywordManager, null);

    const tasks = completedParser.parseFile(content, 'test.md');

    const completedTask = tasks.find((t) =>
      t.text.includes('completed task with checkbox'),
    );
    expect(completedTask).not.toBeUndefined();
    // Parent has a checkbox, so same-indent checkbox lines are NOT subtasks
    expect(completedTask?.subtaskCount).toBe(0);
  });

  test('SHOULD treat same-indent checkbox lines as subtasks when parent has NO checkbox', () => {
    const content = `TODO task without checkbox
- [ ] subtask at same indent
- [ ] another subtask at same indent`;

    const tasks = parser.parseFile(content, 'test.md');

    const parentTask = tasks.find((t) =>
      t.text.includes('task without checkbox'),
    );
    expect(parentTask).not.toBeUndefined();
    // Parent has NO checkbox, so same-indent checkbox lines ARE subtasks
    expect(parentTask?.subtaskCount).toBe(2);
  });

  test('should separate checkbox tasks with [/] at same indent level', () => {
    const content = `- [/] DOING first task
- [ ] TODO second task
  - [ ] subtask of second task`;

    const tasks = parser.parseFile(content, 'test.md');

    const firstTask = tasks.find((t) => t.text.includes('first task'));
    const secondTask = tasks.find((t) => t.text.includes('second task'));

    expect(firstTask).not.toBeUndefined();
    expect(secondTask).not.toBeUndefined();

    // First task should have NO subtasks (checkbox parent, same indent lines are not subtasks)
    expect(firstTask?.subtaskCount).toBe(0);

    // Second task should have 1 subtask (indented)
    expect(secondTask?.subtaskCount).toBe(1);
  });
});
