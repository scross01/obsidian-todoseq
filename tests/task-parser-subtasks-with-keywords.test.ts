import { TaskParser } from '../src/parser/task-parser';
import { KeywordManager } from '../src/utils/keyword-manager';

describe('Debug multiple task types test case', () => {
  let parser: TaskParser;

  beforeEach(() => {
    // Create a default parser instance for testing
    const keywordManager = new KeywordManager(['TODO']);
    parser = TaskParser.create(keywordManager, null);
  });

  test('should parse tasks with subtasks that contain keywords', () => {
    const content = `TODO a task with subtasks
 - [ ] subtask 1
 - [ ] subtask 2
 - [ ] TODO subtask 3 is also a task
 - [ ] TODO subtask 4 has subtasks
	 - [ ] next level subtask`;

    const tasks = parser.parseFile(content, 'test.md');

    // Log parsed tasks for debugging
    console.debug('=== Tasks with subtasks containing keywords ===');
    tasks.forEach((task, index) => {
      console.debug(`
      Task ${index + 1}:
        Line: ${task.line}
        Text: ${task.text}
        Raw: ${task.rawText}
        Subtasks: ${task.subtaskCount}
        Completed: ${task.completed}
        Indent: '${task.indent}'
      `);
    });

    // Debug: Show which lines are being counted as subtasks for the main task
    const mainTask = tasks.find((task) =>
      task.text.includes('a task with subtasks'),
    );
    console.debug('\n=== Debug Main Task Subtasks ===');
    if (mainTask) {
      const lines = content.split('\n');
      console.debug(`Task line ${mainTask.line}: '${mainTask.rawText}'`);
      console.debug(`Indent: '${JSON.stringify(mainTask.indent)}'`);
      console.debug(`Indent length: ${mainTask.indent.length}`);

      for (let i = mainTask.line + 1; i < lines.length; i++) {
        const line = lines[i];
        if (!line.trim()) break; // Stop at empty line

        console.debug(`Line ${i}: '${line}'`);

        // Check if this is a task line
        const isTask = parser.testRegex.test(line);
        console.debug(`  isTask: ${isTask}`);

        // Check if it's a subtask
        const isSubtask = parser['isSubtaskLine'](line, mainTask.indent, false);
        console.debug(`  isSubtask: ${JSON.stringify(isSubtask)}`);
      }
    }

    // Verify main task has 3 subtasks (subtask 1, subtask 2, and subtask 3)
    const mainTaskUpdated = tasks.find((task) =>
      task.text.includes('a task with subtasks'),
    );
    expect(mainTaskUpdated).not.toBeUndefined();
    expect(mainTaskUpdated?.subtaskCount).toBe(5);

    // Verify subtask 4 has 1 subtask
    const subtask4 = tasks.find((task) =>
      task.text.includes('subtask 4 has subtasks'),
    );
    expect(subtask4).not.toBeUndefined();
    expect(subtask4?.subtaskCount).toBe(1);
  });

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

    // Log parsed tasks for debugging
    console.debug('=== Different task types ===');
    tasks.forEach((task, index) => {
      console.debug(`
      Task ${index + 1}:
        Line: ${task.line}
        Text: ${task.text}
        Raw: ${task.rawText}
        Subtasks: ${task.subtaskCount}
        Completed: ${task.completed}
        Indent: '${task.indent}'
      `);
    });

    // Debug: Show what lines are being counted as subtasks for bulleted task
    const lines = content.split('\n');
    const bulletedTask = tasks.find((task) =>
      task.text.includes('a bulleted task with subtasks'),
    );
    console.debug('\n=== Debug Bulleted Task Subtasks ===');
    if (bulletedTask) {
      console.debug(
        `Task line ${bulletedTask.line}: '${bulletedTask.rawText}'`,
      );
      console.debug(`Indent: '${JSON.stringify(bulletedTask.indent)}'`);
      console.debug(`Indent length: ${bulletedTask.indent.length}`);

      for (let i = bulletedTask.line + 1; i < lines.length; i++) {
        const line = lines[i];
        if (!line.trim()) break; // Stop at empty line
        console.debug(`Line ${i}: '${line}'`);

        // Check if this is a task line
        const isTask = parser.testRegex.test(line);
        console.debug(`  isTask: ${isTask}`);

        // Check if it's a subtask
        const isSubtask = parser['isSubtaskLine'](
          line,
          bulletedTask.indent,
          false,
        );
        console.debug(`  isSubtask: ${JSON.stringify(isSubtask)}`);
      }
    }

    // Verify bulleted task has 2 subtasks
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
