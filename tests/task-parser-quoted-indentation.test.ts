import { TaskParser } from '../src/parser/task-parser';
import { TodoTrackerSettings } from '../src/settings/settings-types';
import {
  createBaseSettings,
  createTestKeywordManager,
} from './helpers/test-helper';
import { CHECKBOX_DETECTION_REGEX } from '../src/utils/patterns';

describe('Debug quoted task indent calculation', () => {
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

  test('should debug indent calculation for quoted subtasks', () => {
    const lines = `> TODO a quoted task with subtasks
>   - [ ] subtask 1
>   - [ ] subtask 2`;

    const tasks = parser.parseFile(lines, 'test.md');
    expect(tasks).toHaveLength(1);
    const task = tasks[0];

    console.debug('=== Task Debug Info ===');
    console.debug('Parent Line:', JSON.stringify(task.rawText));
    console.debug('Parent Line Trimmed:', JSON.stringify(task.rawText.trim()));
    console.debug('Parent Indent:', JSON.stringify(task.indent));
    console.debug('List Marker:', JSON.stringify(task.listMarker));
    console.debug(
      'Parent Has Checkbox:',
      CHECKBOX_DETECTION_REGEX.test(task.rawText),
    );

    const getIndentLength = (indent: string): number => {
      let length = 0;
      for (const char of indent) {
        if (char === '\t') {
          length += 2;
        } else {
          length += 1;
        }
      }
      return length;
    };

    console.debug('Parent Indent Length:', getIndentLength(task.indent));

    // Check each line after the task
    for (let i = task.line + 1; i < lines.split('\n').length; i++) {
      const nextLine = lines.split('\n')[i];
      console.debug(`\n=== Line ${i} ===`);
      console.debug('Raw Line:', JSON.stringify(nextLine));

      const trimmedLine = nextLine.trim();
      if (trimmedLine === '') {
        console.debug('Skipping empty line');
        continue;
      }

      console.debug('Trimmed Line:', JSON.stringify(trimmedLine));

      // Calculate indent
      const lineIndent = nextLine.substring(
        0,
        nextLine.length - trimmedLine.length,
      );
      console.debug('Line Indent:', JSON.stringify(lineIndent));

      // Check if it's a quoted line
      if (nextLine.startsWith('>')) {
        console.debug('Line is quoted');
      }

      // Check checkbox
      const isCheckbox = CHECKBOX_DETECTION_REGEX.test(trimmedLine);
      console.debug('Is Checkbox Line:', isCheckbox);

      // Check if it's a subtask using the parser
      const isSubtaskResult = parser['isSubtaskLine'](
        nextLine,
        task.indent,
        CHECKBOX_DETECTION_REGEX.test(task.rawText),
      );
      console.debug('isSubtask:', isSubtaskResult.isSubtask);
      console.debug('completed:', isSubtaskResult.completed);
    }
  });
});
