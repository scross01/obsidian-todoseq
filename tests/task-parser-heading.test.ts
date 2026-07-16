import { TaskParser } from '../src/parser/task-parser';
import {
  createBaseSettings,
  createTestKeywordManager,
} from './helpers/test-helper';

describe('TaskParser - Heading tasks', () => {
  let parser: TaskParser;

  beforeEach(() => {
    const settings = createBaseSettings();
    parser = TaskParser.create(
      createTestKeywordManager(settings),
      null,
      undefined,
      settings,
    );
  });

  describe('Heading task parsing', () => {
    test('should parse H1 with TODO keyword', () => {
      const tasks = parser.parseFile('# TODO Project', 'test.md');
      expect(tasks).toHaveLength(1);
      expect(tasks[0].state).toBe('TODO');
      expect(tasks[0].text).toBe('Project');
      expect(tasks[0].headingLevel).toBe(1);
      expect(tasks[0].indent).toBe('# ');
    });

    test('should parse H2 with DONE keyword', () => {
      const tasks = parser.parseFile('## DONE Task completed', 'test.md');
      expect(tasks).toHaveLength(1);
      expect(tasks[0].state).toBe('DONE');
      expect(tasks[0].text).toBe('Task completed');
      expect(tasks[0].headingLevel).toBe(2);
      expect(tasks[0].indent).toBe('## ');
    });

    test('should parse H3 with DOING keyword', () => {
      const tasks = parser.parseFile('### DOING Work in progress', 'test.md');
      expect(tasks).toHaveLength(1);
      expect(tasks[0].headingLevel).toBe(3);
      expect(tasks[0].indent).toBe('### ');
    });

    test('should parse H6 heading', () => {
      const tasks = parser.parseFile('###### WAIT Deeply nested', 'test.md');
      expect(tasks).toHaveLength(1);
      expect(tasks[0].headingLevel).toBe(6);
    });

    test('should parse heading with keyword only (no text)', () => {
      const tasks = parser.parseFile('# TODO', 'test.md');
      expect(tasks).toHaveLength(1);
      expect(tasks[0].state).toBe('TODO');
      expect(tasks[0].text).toBe('');
      expect(tasks[0].headingLevel).toBe(1);
    });

    test('should not parse heading without a keyword', () => {
      const tasks = parser.parseFile('# Regular heading', 'test.md');
      expect(tasks).toHaveLength(0);
    });

    test('should not parse heading with non-keyword word', () => {
      const tasks = parser.parseFile('## NOTAKEYWORD task', 'test.md');
      expect(tasks).toHaveLength(0);
    });

    test('should parse heading with priority token', () => {
      const tasks = parser.parseFile('# TODO [#A] Important', 'test.md');
      expect(tasks).toHaveLength(1);
      expect(tasks[0].priority).toBe('high');
      expect(tasks[0].text).toBe('Important');
    });

    test('should handle multiple heading tasks at different levels', () => {
      const content = [
        '# TODO Project Alpha',
        '## DOING Task 1',
        '### DONE Subtask 1.1',
        '## TODO Task 2',
      ].join('\n');
      const tasks = parser.parseFile(content, 'test.md');
      expect(tasks).toHaveLength(4);
      expect(tasks[0].headingLevel).toBe(1);
      expect(tasks[1].headingLevel).toBe(2);
      expect(tasks[2].headingLevel).toBe(3);
      expect(tasks[3].headingLevel).toBe(2);
    });

    test('should not affect regular list task parsing', () => {
      const tasks = parser.parseFile('- TODO Regular task', 'test.md');
      expect(tasks).toHaveLength(1);
      expect(tasks[0].headingLevel).toBeUndefined();
      expect(tasks[0].listMarker).toBe('- ');
    });

    test('should parse heading with SCHEDULED date on next line', () => {
      const content = ['# TODO Project', '  SCHEDULED: <2026-07-20 Mon>'].join(
        '\n',
      );
      const tasks = parser.parseFile(content, 'test.md');
      expect(tasks).toHaveLength(1);
      expect(tasks[0].scheduledDate).toBeTruthy();
    });

    test('should parse heading with DEADLINE date on next line', () => {
      const content = ['## DOING Task', '   DEADLINE: <2026-07-25 Fri>'].join(
        '\n',
      );
      const tasks = parser.parseFile(content, 'test.md');
      expect(tasks).toHaveLength(1);
      expect(tasks[0].deadlineDate).toBeTruthy();
    });

    test('should parse heading with both SCHEDULED and DEADLINE', () => {
      const content = [
        '### TODO Task',
        '    SCHEDULED: <2026-07-20 Mon>',
        '    DEADLINE: <2026-07-25 Fri>',
      ].join('\n');
      const tasks = parser.parseFile(content, 'test.md');
      expect(tasks).toHaveLength(1);
      expect(tasks[0].scheduledDate).toBeTruthy();
      expect(tasks[0].deadlineDate).toBeTruthy();
    });

    test('should detect heading as task line', () => {
      expect(parser.isTaskLine('# TODO task')).toBe(true);
      expect(parser.isTaskLine('## DONE task')).toBe(true);
      expect(parser.isTaskLine('# Regular heading')).toBe(false);
    });

    test('should parse heading via parseLine', () => {
      const task = parser.parseLine('# TODO Project', 0, 'test.md');
      expect(task).not.toBeNull();
      expect(task?.state).toBe('TODO');
      expect(task?.headingLevel).toBe(1);
    });

    test('should return null for non-task heading in parseLine', () => {
      const task = parser.parseLine('# Regular', 0, 'test.md');
      expect(task).toBeNull();
    });

    test('should correctly identify completed status', () => {
      const todoTasks = parser.parseFile('# TODO Task', 'test.md');
      expect(todoTasks[0].completed).toBe(false);

      const doneTasks = parser.parseFile('# DONE Task', 'test.md');
      expect(doneTasks[0].completed).toBe(true);
    });

    test('should handle heading inside blockquote', () => {
      // "> # TODO task" — heading inside blockquote
      // The blockquote prefix is consumed by QUOTED_PREFIX, leaving "# TODO task"
      // But "#" is not a keyword, so this should NOT match as a task.
      const tasks = parser.parseFile('> # TODO task', 'test.md');
      expect(tasks).toHaveLength(0);
    });

    test('should not parse heading tasks inside code blocks', () => {
      const content = [
        '```',
        '# TODO task in code block',
        '```',
        '- TODO task outside code block',
      ].join('\n');
      const tasks = parser.parseFile(content, 'test.md');
      expect(tasks).toHaveLength(1);
      expect(tasks[0].text).toBe('task outside code block');
    });

    test('should parse heading with custom keyword', () => {
      const settings = createBaseSettings({
        additionalInactiveKeywords: ['FIXME'],
      });
      const customParser = TaskParser.create(
        createTestKeywordManager(settings),
        null,
        undefined,
        settings,
      );
      const tasks = customParser.parseFile('# FIXME Bug report', 'test.md');
      expect(tasks).toHaveLength(1);
      expect(tasks[0].state).toBe('FIXME');
    });
  });
});
