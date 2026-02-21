import { TaskParser } from '../../src/parser/task-parser';
import { TodoTrackerSettings } from '../src/settings/settings-types';
import { baseCodeLanguageSettings } from '../helpers/code-language-test-helper';

describe('Task parsing within Python comments in code blocks', () => {
  let parser: TaskParser;
  let settings: TodoTrackerSettings;

  beforeEach(() => {
    settings = baseCodeLanguageSettings;
    parser = TaskParser.create(settings, null);
  });

  describe('Tasks in python code blocks', () => {
    test(`should match tasks in python comments when enabled`, () => {
      const lines = `
\`\`\` python
# TODO test task text

def test():  # TODO test task text

  """
  TODO test task text
  """

  '''
  TODO test task text
  '''
\`\`\`
`;
      const tasks = parser.parseFile(lines, 'test.md');
      expect(tasks).toHaveLength(4);
      expect(tasks[0].indent).toBe('# ');
      expect(tasks[0].text).toBe('test task text');
      expect(tasks[1].indent).toBe('def test():  # ');
      expect(tasks[1].text).toBe('test task text');
    });
    test(`should match tasks in py comments when enabled`, () => {
      const lines = `
\`\`\`py
# TODO test task text

def test():  # TODO test task text

  """
  TODO test task text
  """

  '''
  TODO test task text
  '''
\`\`\`
`;
      const tasks = parser.parseFile(lines, 'test.md');
      expect(tasks).toHaveLength(4);
      expect(tasks[0].indent).toBe('# ');
      expect(tasks[0].text).toBe('test task text');
      expect(tasks[1].indent).toBe('def test():  # ');
      expect(tasks[1].text).toBe('test task text');
    });
  });
});
