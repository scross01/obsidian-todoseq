import { TaskParser } from '../src/parser/task-parser';
import { TodoTrackerSettings } from '../src/settings/settings-types';
import {
  createBaseSettings,
  createTestKeywordManager,
} from './helpers/test-helper';
import { CHECKBOX_DETECTION_REGEX } from '../src/utils/patterns';

describe('Debug simple quoted task', () => {
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

  test('should manually trace extractSubtasks for quoted lines', () => {
    const lines = `> TODO a quoted task with subtasks
>   - [ ] subtask 1
>   - [ ] subtask 2`;

    const splitLines = lines.split('\n');

    const tasks = parser.parseFile(lines, 'test.md');
    console.debug('\n=== Parsed Tasks (' + tasks.length + ') ===');
    tasks.forEach((task) => {
      console.debug('\n  Line: ' + task.line);
      console.debug('  Text: "' + task.text + '"');
      console.debug('  Indent: "' + task.indent + '"'); // => "> "
      console.debug('  List Marker: "' + task.listMarker + '"');
      console.debug('  Subtasks: ' + task.subtaskCount);

      // Let's trace what extractSubtasks is doing
      console.debug('\n  Tracing extractSubtasks:');
      const targetIndent = task.indent; // "> "
      const parentHasCheckbox = false;

      for (let i = task.line + 1; i < splitLines.length; i++) {
        const nextLine = splitLines[i];
        const trimmedLine = nextLine.trim();

        console.debug('\n  Line ' + i + ': "' + nextLine + '"');

        if (trimmedLine === '') {
          console.debug('  Skip empty line');
          continue;
        }

        // Step 1: Call getDateLineType()
        const dateLineType = parser['getDateLineType'](nextLine, targetIndent);
        if (dateLineType !== null) {
          console.debug('  Skip date line');
          continue;
        }

        // Step 2: Calculate line indent and compare
        const lineIndent = nextLine.substring(
          0,
          nextLine.length - trimmedLine.length,
        );
        console.debug('  Line indent: "' + lineIndent + '"');

        const parentIndentLength = parser['getIndentLength'](targetIndent);
        const lineIndentLength = parser['getIndentLength'](lineIndent);

        console.debug(
          `  Length comparison: line(${lineIndentLength}) vs parent(${parentIndentLength})`,
        );

        if (lineIndentLength < parentIndentLength) {
          console.debug('  Line indent < parent indent: break');
          break;
        } else if (lineIndentLength === parentIndentLength) {
          // Check if it's a checkbox line
          const isCheckboxLine = CHECKBOX_DETECTION_REGEX.test(trimmedLine);
          if (!isCheckboxLine) {
            console.debug('  Same indent and NOT checkbox: break');
            break;
          }
        }

        // Step 3: Check isSubtaskLine()
        const isSubtaskResult = parser['isSubtaskLine'](
          nextLine,
          targetIndent,
          parentHasCheckbox,
        );
        console.debug(
          '  isSubtaskLine() result: ' + JSON.stringify(isSubtaskResult),
        );

        if (isSubtaskResult.isSubtask) {
          console.debug('  YES! Is subtask!');
        }
      }
    });
  });
});
