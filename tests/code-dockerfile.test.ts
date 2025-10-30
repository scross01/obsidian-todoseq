import { TaskParser } from '../src/parser/task-parser';
import { TodoTrackerSettings } from '../src/settings/settings';

describe('Task parsing within Dockerfile comments in code blocks', () => {
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

  describe('Tasks in dockerfile code blocks', () => {
    test(`should match tasks in dockerfile comments when enabled`, () => {
      const lines = `
\`\`\` dockerfile
# example dockerfile
FROM alpine:latest

# TODO test task text
WORKDIR /root/  # TODO test task text
\`\`\`
`;
      const tasks = parser.parseFile(lines, 'test.md');
      expect(tasks).toHaveLength(2);
      expect(tasks[0].indent).toBe("# ");
      expect(tasks[0].text).toBe("test task text");
      expect(tasks[1].indent).toBe("WORKDIR /root/  # ");
      expect(tasks[1].text).toBe("test task text");
    });
  });
});

