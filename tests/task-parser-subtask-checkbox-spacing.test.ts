import { TaskParser } from '../src/parser/task-parser';
import { KeywordManager } from '../src/utils/keyword-manager';

describe('Debug subtask spacing issue', () => {
  let parser: TaskParser;

  beforeEach(() => {
    // Create a default parser instance for testing
    const keywordManager = new KeywordManager(['TODO']);
    parser = TaskParser.create(keywordManager, null);
  });

  test('should count subtasks with and without spaces', () => {
    const content = `TODO test 1
- [ ] subtask1
- [ ] subtask2

TODO test 2
- [ ] subtask 1
- [ ] subtask 2`;

    const tasks = parser.parseFile(content, 'test.md');

    // Log parsed tasks for debugging
    console.debug('=== Parsed Tasks ===');
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

    // Debug subtasks for test 1
    const test1 = tasks.find((task) => task.text.includes('test 1'));
    console.debug('\n=== Debug Test1 Subtasks ===');
    if (test1) {
      const lines = content.split('\n');
      console.debug(`Task line ${test1.line}: '${test1.rawText}'`);
      console.debug(`Indent: '${JSON.stringify(test1.indent)}'`);
      console.debug(`Indent length: ${test1.indent.length}`);

      for (let i = test1.line + 1; i < lines.length; i++) {
        const line = lines[i];
        if (!line.trim()) break; // Stop at empty line

        console.debug(`Line ${i}: '${line}'`);

        // Check if this is a task line
        const isTask = parser.testRegex.test(line);
        console.debug(`  isTask: ${isTask}`);

        // Check if it's a subtask
        const isSubtask = parser['isSubtaskLine'](line, test1.indent, false);
        console.debug(`  isSubtask: ${JSON.stringify(isSubtask)}`);
      }
    }

    // Debug subtasks for test 2
    const test2 = tasks.find((task) => task.text.includes('test 2'));
    console.debug('\n=== Debug Test2 Subtasks ===');
    if (test2) {
      const lines = content.split('\n');
      console.debug(`Task line ${test2.line}: '${test2.rawText}'`);
      console.debug(`Indent: '${JSON.stringify(test2.indent)}'`);
      console.debug(`Indent length: ${test2.indent.length}`);

      for (let i = test2.line + 1; i < lines.length; i++) {
        const line = lines[i];
        if (!line.trim()) break; // Stop at empty line

        console.debug(`Line ${i}: '${line}'`);

        // Check if this is a task line
        const isTask = parser.testRegex.test(line);
        console.debug(`  isTask: ${isTask}`);

        // Check if it's a subtask
        const isSubtask = parser['isSubtaskLine'](line, test2.indent, false);
        console.debug(`  isSubtask: ${JSON.stringify(isSubtask)}`);
      }
    }

    // Verify test1 has 2 subtasks
    expect(test1).not.toBeUndefined();
    expect(test1?.subtaskCount).toBe(2);

    // Verify test2 has 2 subtasks
    expect(test2).not.toBeUndefined();
    expect(test2?.subtaskCount).toBe(2);
  });
});
