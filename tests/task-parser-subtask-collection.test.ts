import { TaskParser } from '../src/parser/task-parser';
import { KeywordManager } from '../src/utils/keyword-manager';

describe('Debug test case from user', () => {
  let parser: TaskParser;

  beforeEach(() => {
    // Create a default parser instance for testing
    const keywordManager = new KeywordManager(['TODO']);
    parser = TaskParser.create(keywordManager, null);
  });

  test('should parse the test case correctly', () => {
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

    // Debug test4's subtask detection
    const debugTest4 = tasks.find((task) => task.text.includes('test 4'));
    console.debug('\n=== Debug Test4 Subtask Detection ===');
    console.debug('test4 task details:', debugTest4);

    const lines = content.split('\n');
    if (debugTest4) {
      for (let i = debugTest4.line + 1; i < lines.length; i++) {
        const line = lines[i];
        console.debug(`\nChecking line ${i}: '${line}'`);
        if (!line.trim()) continue;

        const isSubtask = parser['isSubtaskLine'](
          line,
          debugTest4.indent,
          true,
        );
        console.debug('isSubtask:', isSubtask);

        const dateLineType = parser['getDateLineType'](line, debugTest4.indent);
        console.debug('dateLineType:', dateLineType);

        // Check if it's a task line
        const isTaskLine = parser['testRegex'].test(line);
        console.debug('isTaskLine:', isTaskLine);

        // Check for breaking conditions
        let shouldBreak = false;
        const trimmedLine = line.trim();
        const lineIndent = line.substring(0, line.length - trimmedLine.length);
        const parentIndentLength = parser['getIndentLength'](debugTest4.indent);
        const lineIndentLength = parser['getIndentLength'](lineIndent);

        if (lineIndentLength < parentIndentLength) {
          shouldBreak = true;
        } else if (lineIndentLength === parentIndentLength) {
          const isCheckboxLine = /^\s*[-*+]\s*\[[ xX]\]/.test(trimmedLine);
          if (!isCheckboxLine) {
            shouldBreak = true;
          }
        }

        console.debug('shouldBreak:', shouldBreak);

        if (shouldBreak) {
          console.debug('Breaking subtask collection');
          break;
        }
      }
    }

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
