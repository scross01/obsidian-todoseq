import { TaskParser } from '../src/parser/task-parser';
import { TodoTrackerSettings } from '../src/settings/settings';
import { baseCodeLanguageSettings } from './helpers/code-language-test-helper';

describe('Task parsing within R file comments in code blocks', () => {
  let parser: TaskParser;
  let settings: TodoTrackerSettings;

  beforeEach(() => {
    settings = baseCodeLanguageSettings;
    parser = TaskParser.create(settings, null);
  });

  describe('Tasks in r code blocks', () => {
    test(`should match tasks in r comments when enabled`, () => {
      const lines = `
\`\`\` r
# TODO test task text
\`\`\`
`;
      const tasks = parser.parseFile(lines, 'test.md');
      expect(tasks).toHaveLength(1);
      expect(tasks[0].text).toBe('test task text');
    });
  });
});
