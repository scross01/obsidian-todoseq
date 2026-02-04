import {
  getFilename,
  isCompletedState,
  getCheckboxStatus,
  truncateMiddle,
} from '../src/utils/task-utils';

describe('task-utils', () => {
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

  describe('truncateMiddle', () => {
    test('should return original string if length <= maxLength', () => {
      const result = truncateMiddle('short string', 20);
      expect(result).toBe('short string');
    });

    test('should truncate string longer than maxLength', () => {
      const result = truncateMiddle(
        'this is a very long string that needs truncation',
        20,
      );
      expect(result.length).toBeLessThanOrEqual(20);
      expect(result).toContain('..');
    });

    test('should handle odd maxLength', () => {
      const result = truncateMiddle('1234567890', 7);
      expect(result).toHaveLength(7);
      expect(result).toEqual('123..90'); // 3 + 2 + 2 = 7
    });

    test('should handle even maxLength', () => {
      const result = truncateMiddle('1234567890', 8);
      expect(result).toHaveLength(8);
      expect(result).toEqual('123..890'); // 4 + 2 + 2 = 8
    });

    test('should handle exactly maxLength with ellipsis', () => {
      const result = truncateMiddle('123456789', 5);
      expect(result).toHaveLength(5);
      expect(result).toEqual('12..9'); // 1 + 2 + 2 = 5
    });

    test('should handle very short strings', () => {
      expect(truncateMiddle('a', 0)).toBe('..'); // Even when maxLength is 0, returns ellipsis
      expect(truncateMiddle('a', 1)).toBe('a'); // Ellipsis is 2 characters
      expect(truncateMiddle('ab', 1)).toEqual('..');
    });

    test('should handle empty string', () => {
      expect(truncateMiddle('', 0)).toBe('');
      expect(truncateMiddle('', 10)).toBe('');
    });

    test('should handle strings with special characters', () => {
      const result = truncateMiddle('你好世界，这是一个测试字符串', 10);
      expect(result.length).toBeLessThanOrEqual(10);
      expect(result).toContain('..');
    });

    test('should preserve start and end parts', () => {
      const original = 'abcdefghijklmnopqrstuvwxyz';
      const result = truncateMiddle(original, 10);
      expect(result.startsWith('abc')).toBe(true);
      expect(result.endsWith('xyz')).toBe(true);
    });
  });
});
