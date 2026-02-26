import { TaskParser } from '../../src/parser/task-parser';
import { TodoTrackerSettings } from '../src/settings/settings-types';
import { createTestKeywordManager } from '../helpers/test-helper';
import { baseCodeLanguageSettings } from '../helpers/code-language-test-helper';

describe('Task parsing within SQL comments in code blocks', () => {
  let parser: TaskParser;
  let settings: TodoTrackerSettings;

  beforeEach(() => {
    settings = baseCodeLanguageSettings;
    parser = TaskParser.create(
      createTestKeywordManager(settings),
      null,
      undefined,
      settings,
    );
  });

  describe('Tasks in sql code blocks', () => {
    test(`should match tasks in sql comments when enabled`, () => {
      const lines = `
\`\`\` sql
/* TODO test task text */

/*
TODO test task text
 */

/**
 * TODO test task text
 */

-- TODO test task text

select * from users; -- TODO test task text
select * from users; /* TODO test task text */
\`\`\`
`;
      const tasks = parser.parseFile(lines, 'test.md');
      expect(tasks).toHaveLength(6);
      expect(tasks[0].indent).toBe('/* ');
      expect(tasks[0].text).toBe('test task text');
      expect(tasks[0].tail).toBe(' */');
      expect(tasks[1].indent).toBe('');
      expect(tasks[2].indent).toBe(' ');
      expect(tasks[2].listMarker).toBe('* ');
      expect(tasks[3].indent).toBe('-- ');
      expect(tasks[4].indent).toBe('select * from users; -- ');
      expect(tasks[5].indent).toBe('select * from users; /* ');
      expect(tasks[5].tail).toBe(' */');
    });
  });
});
