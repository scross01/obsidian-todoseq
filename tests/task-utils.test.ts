import { Task } from '../src/task';
import {
  extractPriority,
  getFilename,
  taskComparator,
  isCompletedState,
  getCheckboxStatus,
  PRIORITY_TOKEN_REGEX,
  CHECKBOX_REGEX,
} from '../src/utils/task-utils';

describe('task-utils', () => {
  describe('extractPriority', () => {
    test('should extract high priority [#A] and clean text', () => {
      const result = extractPriority('Some task [#A] with priority');
      expect(result.priority).toBe('high');
      expect(result.cleanedText).toBe('Some task with priority');
    });

    test('should extract medium priority [#B] and clean text', () => {
      const result = extractPriority('Another [#B] task here');
      expect(result.priority).toBe('med');
      expect(result.cleanedText).toBe('Another task here');
    });

    test('should extract low priority [#C] and clean text', () => {
      const result = extractPriority('Low priority [#C] item');
      expect(result.priority).toBe('low');
      expect(result.cleanedText).toBe('Low priority item');
    });

    test('should return null priority and original text when no priority token', () => {
      const result = extractPriority('Regular task without priority');
      expect(result.priority).toBeNull();
      expect(result.cleanedText).toBe('Regular task without priority');
    });

    test('should handle priority token with surrounding spaces', () => {
      const result = extractPriority('Task  [#A]  with spaces');
      expect(result.priority).toBe('high');
      expect(result.cleanedText).toBe('Task with spaces');
    });

    test('should handle priority token at beginning of text', () => {
      const result = extractPriority('[#B] Task at beginning');
      expect(result.priority).toBe('med');
      expect(result.cleanedText).toBe('Task at beginning');
    });

    test('should handle priority token at end of text', () => {
      const result = extractPriority('Task at end [#C]');
      expect(result.priority).toBe('low');
      expect(result.cleanedText).toBe('Task at end ');
    });
  });

  describe('getFilename', () => {
    test('should extract filename from Unix path', () => {
      const result = getFilename('/path/to/file.txt');
      expect(result).toBe('file.txt');
    });

    test('should extract filename from Windows path', () => {
      const result = getFilename('C:/Users/test/document.md');
      expect(result).toBe('document.md');
    });

    test('should return original string when no path separators', () => {
      const result = getFilename('filename.txt');
      expect(result).toBe('filename.txt');
    });

    test('should handle path with multiple separators', () => {
      const result = getFilename('/deeply/nested/path/to/file.md');
      expect(result).toBe('file.md');
    });

    test('should handle path ending with separator', () => {
      const result = getFilename('/path/to/directory/');
      expect(result).toBe('');
    });
  });

  describe('taskComparator', () => {
    const createTask = (path: string, line: number): Task => ({
      path,
      line,
      rawText: '',
      indent: '',
      listMarker: '',
      text: '',
      state: 'TODO',
      completed: false,
      priority: null,
      scheduledDate: null,
      deadlineDate: null,
      urgency: null,
      isDailyNote: false,
      dailyNoteDate: null,
    });

    test('should sort tasks by path first', () => {
      const taskA = createTask('a/file.md', 1);
      const taskB = createTask('b/file.md', 1);

      expect(taskComparator(taskA, taskB)).toBeLessThan(0);
      expect(taskComparator(taskB, taskA)).toBeGreaterThan(0);
    });

    test('should sort tasks by line number when paths are equal', () => {
      const task1 = createTask('same/file.md', 5);
      const task2 = createTask('same/file.md', 10);

      expect(taskComparator(task1, task2)).toBeLessThan(0);
      expect(taskComparator(task2, task1)).toBeGreaterThan(0);
    });

    test('should return 0 for identical tasks', () => {
      const task1 = createTask('same/file.md', 5);
      const task2 = createTask('same/file.md', 5);

      expect(taskComparator(task1, task2)).toBe(0);
    });

    test('should handle different path lengths', () => {
      const taskShort = createTask('file.md', 1);
      const taskLong = createTask('very/long/path/to/file.md', 1);

      expect(taskComparator(taskShort, taskLong)).toBeLessThan(0);
      expect(taskComparator(taskLong, taskShort)).toBeGreaterThan(0);
    });
  });

  describe('isCompletedState', () => {
    test('should return true for DONE state', () => {
      expect(isCompletedState('DONE')).toBe(true);
    });

    test('should return true for CANCELED state', () => {
      expect(isCompletedState('CANCELED')).toBe(true);
    });

    test('should return true for CANCELLED state', () => {
      expect(isCompletedState('CANCELLED')).toBe(true);
    });

    test('should return false for TODO state', () => {
      expect(isCompletedState('TODO')).toBe(false);
    });

    test('should return false for DOING state', () => {
      expect(isCompletedState('DOING')).toBe(false);
    });

    test('should return false for unknown state', () => {
      expect(isCompletedState('UNKNOWN')).toBe(false);
    });

    test('should be case sensitive', () => {
      expect(isCompletedState('done')).toBe(false);
      expect(isCompletedState('Done')).toBe(false);
    });
  });

  describe('getCheckboxStatus', () => {
    test('should return "x" for completed tasks', () => {
      expect(getCheckboxStatus(true)).toBe('x');
    });

    test('should return " " (space) for incomplete tasks', () => {
      expect(getCheckboxStatus(false)).toBe(' ');
    });
  });

  describe('PRIORITY_TOKEN_REGEX', () => {
    test('should match priority tokens with different letters', () => {
      expect(PRIORITY_TOKEN_REGEX.test('[#A]')).toBe(true);
      expect(PRIORITY_TOKEN_REGEX.test('[#B]')).toBe(true);
      expect(PRIORITY_TOKEN_REGEX.test('[#C]')).toBe(true);
    });

    test('should not match invalid priority letters', () => {
      expect(PRIORITY_TOKEN_REGEX.test('[#D]')).toBe(false);
      expect(PRIORITY_TOKEN_REGEX.test('[#Z]')).toBe(false);
    });

    test('should match priority tokens with surrounding spaces', () => {
      expect(PRIORITY_TOKEN_REGEX.test(' [#A] ')).toBe(true);
      expect(PRIORITY_TOKEN_REGEX.test('\t[#B]\t')).toBe(true);
    });

    test('should capture priority letter in group 2', () => {
      const match = PRIORITY_TOKEN_REGEX.exec('Task [#B] here');
      expect(match?.[2]).toBe('B');
    });
  });

  describe('CHECKBOX_REGEX', () => {
    test('should match markdown checkbox patterns with required spacing', () => {
      expect(CHECKBOX_REGEX.test('- [x] some task text')).toBe(true);
      expect(CHECKBOX_REGEX.test('* [ ] another test')).toBe(true);
      expect(CHECKBOX_REGEX.test('+ [x] more words here')).toBe(true);
    });

    test('should capture checkbox components', () => {
      const match = CHECKBOX_REGEX.exec('- [x] some task text');
      expect(match?.[1]).toBe(''); // leading spaces
      expect(match?.[2]).toBe('- [x]'); // full checkbox (note: no trailing space in capture)
      expect(match?.[3]).toBe('x'); // checkbox status
      expect(match?.[4]).toBe('some'); // first word
      expect(match?.[5]).toBe('task text'); // rest of text
    });

    test('should match with leading indentation', () => {
      const match = CHECKBOX_REGEX.exec('  - [ ] indented task here');
      expect(match?.[1]).toBe('  '); // leading spaces
      expect(match?.[2]).toBe('- [ ]'); // full checkbox (note: no trailing space in capture)
    });

    test('should not match invalid checkbox patterns', () => {
      expect(CHECKBOX_REGEX.test('- [X] task')).toBe(false); // uppercase X
      expect(CHECKBOX_REGEX.test('- [] task')).toBe(false); // no space inside
      expect(CHECKBOX_REGEX.test('[] task')).toBe(false); // no list marker
    });

    test('should not match single word after checkbox', () => {
      expect(CHECKBOX_REGEX.test('- [ ] task')).toBe(false); // only one word
      expect(CHECKBOX_REGEX.test('- [x] single')).toBe(false); // only one word
    });
  });
});
