import { TaskParser } from '../src/parser/task-parser';
import { TodoTrackerSettings } from '../src/settings/settings';

describe('TaskParser.parseLineAsTask', () => {
  let parser: TaskParser;
  let settings: TodoTrackerSettings;

  beforeEach(() => {
    settings = {
      additionalTaskKeywords: ['FIXME'],
      additionalActiveKeywords: [],
      additionalWaitingKeywords: [],
      additionalCompletedKeywords: [],
      includeCalloutBlocks: true,
      includeCodeBlocks: false,
      includeCommentBlocks: false,
      taskListViewMode: 'showAll',
      futureTaskSorting: 'showAll',
      defaultSortMethod: 'default',
      languageCommentSupport: {
        enabled: false,
      },
      weekStartsOn: 'Monday',
      formatTaskKeywords: true,
      additionalFileExtensions: [],
      detectOrgModeFiles: false,
    } as TodoTrackerSettings;
    parser = TaskParser.create(settings, null);
  });

  describe('Basic task parsing', () => {
    test('should parse simple task', () => {
      const line = 'TODO Task text';
      const result = parser.parseLineAsTask(line, 0, 'test.md');

      expect(result).not.toBeNull();
      expect(result?.state).toBe('TODO');
      expect(result?.text).toBe('Task text');
      expect(result?.completed).toBe(false);
    });

    test('should parse task with priority', () => {
      const line = 'TODO [#A] High priority task';
      const result = parser.parseLineAsTask(line, 0, 'test.md');

      expect(result).not.toBeNull();
      expect(result?.priority).toBe('high');
      expect(result?.text).toBe('High priority task');
    });

    test('should parse checkbox task', () => {
      const line = '- [x] DONE Completed task';
      const result = parser.parseLineAsTask(line, 0, 'test.md');

      expect(result).not.toBeNull();
      expect(result?.state).toBe('DONE');
      expect(result?.completed).toBe(true);
    });

    test('should parse task with tags', () => {
      const line = 'DOING Task with #tag and #another';
      const result = parser.parseLineAsTask(line, 0, 'test.md');

      expect(result).not.toBeNull();
      expect(result?.state).toBe('DOING');
      expect(result?.text).toBe('Task with #tag and #another');
    });
  });

  describe('List marker detection', () => {
    test('should parse bullet list task', () => {
      const line = '- TODO Bullet list task';
      const result = parser.parseLineAsTask(line, 0, 'test.md');

      expect(result).not.toBeNull();
      expect(result?.state).toBe('TODO');
      expect(result?.text).toBe('Bullet list task');
    });

    test('should parse numbered list task', () => {
      const line = '1. TODO Numbered list task';
      const result = parser.parseLineAsTask(line, 0, 'test.md');

      expect(result).not.toBeNull();
      expect(result?.state).toBe('TODO');
      expect(result?.text).toBe('Numbered list task');
    });

    test('should parse letter list task', () => {
      const line = 'a) TODO Letter list task';
      const result = parser.parseLineAsTask(line, 0, 'test.md');

      expect(result).not.toBeNull();
      expect(result?.state).toBe('TODO');
      expect(result?.text).toBe('Letter list task');
    });
  });

  describe('Indentation handling', () => {
    test('should preserve indentation', () => {
      const line = '  TODO Indented task';
      const result = parser.parseLineAsTask(line, 0, 'test.md');

      expect(result).not.toBeNull();
      expect(result?.indent).toBe('  ');
      expect(result?.text).toBe('Indented task');
    });
  });

  describe('Non-task lines', () => {
    test('should return null for non-task lines', () => {
      const line = 'This is not a task';
      const result = parser.parseLineAsTask(line, 0, 'test.md');

      expect(result).toBeNull();
    });

    test('should return null for empty lines', () => {
      const line = '';
      const result = parser.parseLineAsTask(line, 0, 'test.md');

      expect(result).toBeNull();
    });
  });

  describe('Custom keywords', () => {
    test('should parse tasks with custom keywords', () => {
      const line = 'FIXME Custom keyword task';
      const result = parser.parseLineAsTask(line, 0, 'test.md');

      expect(result).not.toBeNull();
      expect(result?.state).toBe('FIXME');
      expect(result?.text).toBe('Custom keyword task');
    });
  });
});
