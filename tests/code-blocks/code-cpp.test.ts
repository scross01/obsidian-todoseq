import { TaskParser } from '../../src/parser/task-parser';
import { TodoTrackerSettings } from '../src/settings/settings-types';
import { baseCodeLanguageSettings } from '../helpers/code-language-test-helper';

describe('Task parsing within C++ comments in code blocks', () => {
  let parser: TaskParser;
  let settings: TodoTrackerSettings;

  beforeEach(() => {
    settings = baseCodeLanguageSettings;
    parser = TaskParser.create(settings, null);
  });

  describe('Tasks in c++ code blocks', () => {
    test(`should match tasks in c++ comments when enabled`, () => {
      const lines = `
\`\`\` c++
/* TODO test task text */

/*
TODO test task text
 */

/**
 * TODO test task text
 */

// TODO test task text

private test() {
  const key1 = value; // TODO test task text
  const key2 = value; /* TODO test task text */
  TODO task task
}
\`\`\`
`;
      const tasks = parser.parseFile(lines, 'test.md');
      expect(tasks).toHaveLength(7);
      expect(tasks[0].indent).toBe('/* ');
      expect(tasks[0].text).toBe('test task text');
      expect(tasks[0].tail).toBe(' */');
      expect(tasks[1].indent).toBe('');
      expect(tasks[2].indent).toBe(' ');
      expect(tasks[2].listMarker).toBe('* ');
      expect(tasks[3].indent).toBe('// ');
      expect(tasks[4].indent).toBe('  const key1 = value; // ');
      expect(tasks[5].indent).toBe('  const key2 = value; /* ');
      expect(tasks[5].tail).toBe(' */');
      expect(tasks[6].indent).toBe('  ');
    });

    test(`should match tasks in cpp comments when enabled`, () => {
      const lines = `
\`\`\`cpp
// TODO test task text
\`\`\`
`;
      const tasks = parser.parseFile(lines, 'test.md');
      expect(tasks).toHaveLength(1);
      expect(tasks[0].indent).toBe('// ');
      expect(tasks[0].text).toBe('test task text');
    });
  });
});
