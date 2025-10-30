import { TaskParser } from '../src/parser/task-parser';
import { TodoTrackerSettings } from '../src/settings/settings';

describe('Task parsing within TOML file comments in code blocks', () => {
  let parser: TaskParser;
  let settings: TodoTrackerSettings;

  beforeEach(() => {
    settings = {
      refreshInterval: 60,
      includeCalloutBlocks: true,
      includeCodeBlocks: true,
      languageCommentSupport: {
        enabled: true,
      },
      additionalTaskKeywords: [],
      taskViewMode: 'default'
    };
    parser = TaskParser.create(settings);
  });

  describe('Tasks in toml code blocks', () => {
    test(`should match tasks in toml comments when enabled`, () => {
      const lines = `
\`\`\` toml
# TODO test task text
[section]
key = value # TODO test task text
\`\`\`
`;
      const tasks = parser.parseFile(lines, 'test.md');
      expect(tasks).toHaveLength(2);
      expect(tasks[0].text).toBe("test task text");
      expect(tasks[1].indent).toBe("key = value # ");
      expect(tasks[1].text).toBe("test task text");
    });
  });
});