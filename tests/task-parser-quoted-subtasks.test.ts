import { TaskParser } from '../src/parser/task-parser';
import { TodoTrackerSettings } from '../src/settings/settings-types';
import {
  createBaseSettings,
  createTestKeywordManager,
} from './helpers/test-helper';
import {
  CHECKBOX_REGEX,
  CHECKBOX_DETECTION_REGEX,
} from '../src/utils/patterns';

describe('Debug quoted task with subtasks', () => {
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

  test('should parse quoted task with subtasks', () => {
    const lines = `> TODO a quoted task with subtasks
>   - [ ] subtask 1
>   - [ ] subtask 2`;
    const tasks = parser.parseFile(lines, 'test.md');

    expect(tasks).toHaveLength(1);
    const task = tasks[0];

    console.debug('=== Task Debug Info ===');
    console.debug('Parent Line:', JSON.stringify(task.rawText));
    console.debug('Indent:', JSON.stringify(task.indent));
    console.debug('List Marker:', JSON.stringify(task.listMarker));
    console.debug('Subtask Count:', task.subtaskCount);
    console.debug('=== ===');

    // Check each line after the task
    for (let i = task.line + 1; i < lines.split('\n').length; i++) {
      const nextLine = lines.split('\n')[i];
      console.debug(`\nLine ${i} (raw):`, JSON.stringify(nextLine));

      const trimmedLine = nextLine.trim();
      if (trimmedLine === '') continue;

      const lineIndent = nextLine.substring(
        0,
        nextLine.length - trimmedLine.length,
      );
      console.debug('Line Indent:', JSON.stringify(lineIndent));

      const parentIndentLength = (task.indent.match(/[ \t]/g) || []).length;
      const lineIndentLength = (lineIndent.match(/[ \t]/g) || []).length;
      console.debug('Parent Indent Length:', parentIndentLength);
      console.debug('Line Indent Length:', lineIndentLength);

      const isCheckbox = CHECKBOX_DETECTION_REGEX.test(trimmedLine);
      console.debug('Is Checkbox Line:', isCheckbox);

      // Check if it's a subtask using the parser
      const isSubtaskResult = parser['isSubtaskLine'](
        nextLine,
        task.indent,
        CHECKBOX_REGEX.test(task.rawText),
      );
      console.debug('isSubtask:', isSubtaskResult.isSubtask);
      console.debug('completed:', isSubtaskResult.completed);
    }

    expect(task.subtaskCount).toBeGreaterThan(0);
  });
});
