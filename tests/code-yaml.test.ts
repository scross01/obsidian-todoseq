import { TaskParser } from '../src/parser/task-parser';
import { TodoTrackerSettings } from '../src/settings/settings';

describe('Task parsing within YAML file comments in code blocks', () => {
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

  describe('Tasks in yaml code blocks', () => {
    test(`should match tasks in yaml comments when enabled`, () => {
      const lines = `
\`\`\` yaml
---
# TODO test task text
test:
  items: # TODO test task text
    - key = value # TODO test task text
\`\`\`
`;
      const tasks = parser.parseFile(lines, 'test.md');
      expect(tasks).toHaveLength(3);
      expect(tasks[0].indent).toBe("# ");
      expect(tasks[0].text).toBe("test task text");
      expect(tasks[1].indent).toBe("  items: # ");
      expect(tasks[1].text).toBe("test task text");
      expect(tasks[2].indent).toBe("    - key = value # ");
      expect(tasks[2].text).toBe("test task text");
    });

    test(`should match tasks in yml comments when enabled`, () => {
      const lines = `
\`\`\` yml
---
# TODO test task text
\`\`\`
`;
      const tasks = parser.parseFile(lines, 'test.md');
      expect(tasks).toHaveLength(1);
      expect(tasks[0].indent).toBe("# ");
      expect(tasks[0].text).toBe("test task text");
    });
  });
});