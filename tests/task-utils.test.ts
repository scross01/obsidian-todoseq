import {
  extractPriority,
  getFilename,
  isCompletedState,
  getCheckboxStatus,
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
});
