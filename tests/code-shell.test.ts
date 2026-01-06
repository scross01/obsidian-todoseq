import { TaskParser } from '../src/parser/task-parser';
import { TodoTrackerSettings } from '../src/settings/settings';

describe('Task parsing within Shell file comments in code blocks', () => {
  let parser: TaskParser;
  let settings: TodoTrackerSettings;

  beforeEach(() => {
    settings = {
      refreshInterval: 60,
      includeCalloutBlocks: true,
      includeCodeBlocks: true,
      includeCommentBlocks: false,
      languageCommentSupport: {
        enabled: true,
      },
      additionalTaskKeywords: [],
      taskViewMode: 'showAll',
      weekStartsOn: 'Monday',
      formatTaskKeywords: true
    };
    parser = TaskParser.create(settings);
  });

  describe('Tasks in shell code blocks', () => {
    test(`should match tasks in shell comments when enabled`, () => {
      const lines = `
\`\`\` shell
# TODO test task text
\`\`\`
`;
      const tasks = parser.parseFile(lines, 'test.md');
      expect(tasks).toHaveLength(1);
      expect(tasks[0].text).toBe("test task text");
    });

    test(`should match tasks in sh comments when enabled`, () => {
      const lines = `
\`\`\` sh
# TODO test task text
\`\`\`
`;
      const tasks = parser.parseFile(lines, 'test.md');
      expect(tasks).toHaveLength(1);
      expect(tasks[0].text).toBe("test task text");
    });

    test(`should match tasks in bash comments when enabled`, () => {
      const lines = `
\`\`\` bash
# TODO test task text
\`\`\`
`;
      const tasks = parser.parseFile(lines, 'test.md');
      expect(tasks).toHaveLength(1);
      expect(tasks[0].text).toBe("test task text");
    });

  });
});