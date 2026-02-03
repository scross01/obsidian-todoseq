import { TaskParser } from '../../src/parser/task-parser';
import { TodoTrackerSettings } from '../../src/settings/settings';
import { baseCodeLanguageSettings } from '../helpers/code-language-test-helper';

describe('Task parsing within Ruby comments in code blocks', () => {
  let parser: TaskParser;
  let settings: TodoTrackerSettings;

  beforeEach(() => {
    settings = baseCodeLanguageSettings;
    parser = TaskParser.create(settings, null);
  });

  describe('Tasks in ruby code blocks', () => {
    test(`should match tasks in ruby comments when enabled`, () => {
      const lines = `
\`\`\` ruby
# TODO test task text

=begin
This is commented out
TODO test task text
=end
\`\`\`
`;
      const tasks = parser.parseFile(lines, 'test.md');
      expect(tasks).toHaveLength(2);
      expect(tasks[0].indent).toBe('# ');
      expect(tasks[0].text).toBe('test task text');
      expect(tasks[1].text).toBe('test task text');
    });
  });
});
