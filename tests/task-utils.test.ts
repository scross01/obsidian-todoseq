import {
  getFilename,
  isCompletedState,
  getCheckboxStatus,
  truncateMiddle,
  getKeywordsForGroup,
  getInactiveKeywords,
  getAllKeywords,
  getKeywordGroup,
  isBuiltinKeyword,
  validateKeywordGroups,
  buildKeywordsFromGroups,
  isCompletedKeyword,
  isActiveKeyword,
  isWaitingKeyword,
  isInactiveKeyword,
  getTaskTextDisplay,
  stripMarkdownForDisplay,
} from '../src/utils/task-utils';
import {
  BUILTIN_ACTIVE_KEYWORDS,
  BUILTIN_INACTIVE_KEYWORDS,
  BUILTIN_WAITING_KEYWORDS,
  BUILTIN_COMPLETED_KEYWORDS,
} from '../src/utils/constants';

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

  describe('keyword management', () => {
    describe('getKeywordsForGroup', () => {
      test('should return active keywords with custom additions', () => {
        const settings = { additionalActiveKeywords: ['WORKING'] };
        const result = getKeywordsForGroup('activeKeywords', settings);
        expect(result).toEqual(
          expect.arrayContaining([...BUILTIN_ACTIVE_KEYWORDS, 'WORKING']),
        );
      });

      test('should return waiting keywords with custom additions', () => {
        const settings = { additionalWaitingKeywords: ['BLOCKED'] };
        const result = getKeywordsForGroup('waitingKeywords', settings);
        expect(result).toEqual(
          expect.arrayContaining([...BUILTIN_WAITING_KEYWORDS, 'BLOCKED']),
        );
      });

      test('should return completed keywords with custom additions', () => {
        const settings = { additionalCompletedKeywords: ['FINISHED'] };
        const result = getKeywordsForGroup('completedKeywords', settings);
        expect(result).toEqual(
          expect.arrayContaining([...BUILTIN_COMPLETED_KEYWORDS, 'FINISHED']),
        );
      });

      test('should return empty array for invalid group', () => {
        const settings = {};
        const result = getKeywordsForGroup('invalid' as any, settings);
        expect(result).toEqual([]);
      });
    });

    describe('getInactiveKeywords', () => {
      test('should return inactive keywords with custom additions', () => {
        const settings = { additionalTaskKeywords: ['PENDING'] };
        const result = getInactiveKeywords(settings);
        expect(result).toEqual(
          expect.arrayContaining([...BUILTIN_INACTIVE_KEYWORDS, 'PENDING']),
        );
      });

      test('should return default inactive keywords when no custom', () => {
        const settings = {};
        const result = getInactiveKeywords(settings);
        expect(result).toEqual(
          expect.arrayContaining(BUILTIN_INACTIVE_KEYWORDS),
        );
      });
    });

    describe('getAllKeywords', () => {
      test('should return all keywords from all groups', () => {
        const settings = {
          additionalTaskKeywords: ['PENDING'],
          additionalActiveKeywords: ['WORKING'],
          additionalWaitingKeywords: ['BLOCKED'],
          additionalCompletedKeywords: ['FINISHED'],
        };
        const result = getAllKeywords(settings);
        expect(result).toEqual(
          expect.arrayContaining([
            ...BUILTIN_INACTIVE_KEYWORDS,
            ...BUILTIN_ACTIVE_KEYWORDS,
            ...BUILTIN_WAITING_KEYWORDS,
            ...BUILTIN_COMPLETED_KEYWORDS,
            'PENDING',
            'WORKING',
            'BLOCKED',
            'FINISHED',
          ]),
        );
      });

      test('should remove duplicates', () => {
        const settings = {
          additionalTaskKeywords: ['TODO'], // Duplicate of built-in
          additionalActiveKeywords: ['DOING'], // Duplicate of built-in
        };
        const result = getAllKeywords(settings);
        expect(result.filter((k) => k === 'TODO').length).toBe(1);
        expect(result.filter((k) => k === 'DOING').length).toBe(1);
      });
    });

    describe('getKeywordGroup', () => {
      test('should return active group for active keywords', () => {
        const settings = {};
        expect(getKeywordGroup('DOING', settings)).toBe('activeKeywords');
      });

      test('should return inactive group for inactive keywords', () => {
        const settings = {};
        expect(getKeywordGroup('TODO', settings)).toBe('inactiveKeywords');
      });

      test('should return waiting group for waiting keywords', () => {
        const settings = {};
        expect(getKeywordGroup('WAIT', settings)).toBe('waitingKeywords');
      });

      test('should return completed group for completed keywords', () => {
        const settings = {};
        expect(getKeywordGroup('DONE', settings)).toBe('completedKeywords');
      });

      test('should return inactive group for custom additional keywords', () => {
        const settings = { additionalTaskKeywords: ['PENDING'] };
        expect(getKeywordGroup('PENDING', settings)).toBe('inactiveKeywords');
      });

      test('should return null for unknown keyword', () => {
        const settings = {};
        expect(getKeywordGroup('UNKNOWN', settings)).toBeNull();
      });
    });

    describe('isBuiltinKeyword', () => {
      test('should return true for built-in active keywords', () => {
        BUILTIN_ACTIVE_KEYWORDS.forEach((keyword) => {
          expect(isBuiltinKeyword(keyword)).toBe(true);
        });
      });

      test('should return true for built-in inactive keywords', () => {
        BUILTIN_INACTIVE_KEYWORDS.forEach((keyword) => {
          expect(isBuiltinKeyword(keyword)).toBe(true);
        });
      });

      test('should return true for built-in waiting keywords', () => {
        BUILTIN_WAITING_KEYWORDS.forEach((keyword) => {
          expect(isBuiltinKeyword(keyword)).toBe(true);
        });
      });

      test('should return true for built-in completed keywords', () => {
        BUILTIN_COMPLETED_KEYWORDS.forEach((keyword) => {
          expect(isBuiltinKeyword(keyword)).toBe(true);
        });
      });

      test('should return false for custom keywords', () => {
        expect(isBuiltinKeyword('CUSTOM')).toBe(false);
        expect(isBuiltinKeyword('PENDING')).toBe(false);
      });
    });

    describe('validateKeywordGroups', () => {
      test('should return duplicates from multiple groups', () => {
        const groups = {
          activeKeywords: ['CUSTOM'],
          waitingKeywords: ['CUSTOM'],
          completedKeywords: ['ANOTHER'],
        };
        const result = validateKeywordGroups(groups);
        expect(result).toEqual(['CUSTOM']);
      });

      test('should return empty array when no duplicates', () => {
        const groups = {
          activeKeywords: ['WORKING'],
          waitingKeywords: ['BLOCKED'],
          completedKeywords: ['FINISHED'],
        };
        const result = validateKeywordGroups(groups);
        expect(result).toEqual([]);
      });

      test('should check additionalTaskKeywords for duplicates', () => {
        const groups = {
          activeKeywords: ['CUSTOM'],
          waitingKeywords: ['BLOCKED'],
          completedKeywords: ['FINISHED'],
        };
        const result = validateKeywordGroups(groups, ['CUSTOM']);
        expect(result).toEqual(['CUSTOM']);
      });

      test('should handle empty groups', () => {
        const groups = {
          activeKeywords: [],
          waitingKeywords: [],
          completedKeywords: [],
        };
        const result = validateKeywordGroups(groups, []);
        expect(result).toEqual([]);
      });
    });

    describe('buildKeywordsFromGroups', () => {
      test('should build all keyword groups correctly', () => {
        const settings = {
          additionalTaskKeywords: ['PENDING'],
          additionalActiveKeywords: ['WORKING'],
          additionalWaitingKeywords: ['BLOCKED'],
          additionalCompletedKeywords: ['FINISHED'],
        };
        const result = buildKeywordsFromGroups(settings);

        expect(result.allKeywords).toEqual(
          expect.arrayContaining([
            ...BUILTIN_INACTIVE_KEYWORDS,
            ...BUILTIN_ACTIVE_KEYWORDS,
            ...BUILTIN_WAITING_KEYWORDS,
            ...BUILTIN_COMPLETED_KEYWORDS,
            'PENDING',
            'WORKING',
            'BLOCKED',
            'FINISHED',
          ]),
        );

        expect(result.activeKeywords).toEqual(
          expect.arrayContaining([...BUILTIN_ACTIVE_KEYWORDS, 'WORKING']),
        );
        expect(result.inactiveKeywords).toEqual(
          expect.arrayContaining([...BUILTIN_INACTIVE_KEYWORDS, 'PENDING']),
        );
        expect(result.waitingKeywords).toEqual(
          expect.arrayContaining([...BUILTIN_WAITING_KEYWORDS, 'BLOCKED']),
        );
        expect(result.completedKeywords).toEqual(
          expect.arrayContaining([...BUILTIN_COMPLETED_KEYWORDS, 'FINISHED']),
        );
      });

      test('should handle empty settings', () => {
        const settings = {};
        const result = buildKeywordsFromGroups(settings);

        expect(result.activeKeywords).toEqual(
          expect.arrayContaining(BUILTIN_ACTIVE_KEYWORDS),
        );
        expect(result.inactiveKeywords).toEqual(
          expect.arrayContaining(BUILTIN_INACTIVE_KEYWORDS),
        );
        expect(result.waitingKeywords).toEqual(
          expect.arrayContaining(BUILTIN_WAITING_KEYWORDS),
        );
        expect(result.completedKeywords).toEqual(
          expect.arrayContaining(BUILTIN_COMPLETED_KEYWORDS),
        );
      });
    });

    describe('keyword type detection', () => {
      test('isCompletedKeyword should detect completed keywords', () => {
        const settings = {};
        BUILTIN_COMPLETED_KEYWORDS.forEach((keyword) => {
          expect(isCompletedKeyword(keyword, settings)).toBe(true);
        });
        expect(isCompletedKeyword('DOING', settings)).toBe(false);
      });

      test('isActiveKeyword should detect active keywords', () => {
        const settings = {};
        BUILTIN_ACTIVE_KEYWORDS.forEach((keyword) => {
          expect(isActiveKeyword(keyword, settings)).toBe(true);
        });
        expect(isActiveKeyword('TODO', settings)).toBe(false);
      });

      test('isWaitingKeyword should detect waiting keywords', () => {
        const settings = {};
        BUILTIN_WAITING_KEYWORDS.forEach((keyword) => {
          expect(isWaitingKeyword(keyword, settings)).toBe(true);
        });
        expect(isWaitingKeyword('DONE', settings)).toBe(false);
      });

      test('isInactiveKeyword should detect inactive keywords', () => {
        const settings = {};
        BUILTIN_INACTIVE_KEYWORDS.forEach((keyword) => {
          expect(isInactiveKeyword(keyword, settings)).toBe(true);
        });
        expect(isInactiveKeyword('DOING', settings)).toBe(false);
      });

      test('should detect custom additional keywords', () => {
        const settings = {
          additionalTaskKeywords: ['PENDING'],
          additionalActiveKeywords: ['WORKING'],
          additionalWaitingKeywords: ['BLOCKED'],
          additionalCompletedKeywords: ['FINISHED'],
        };

        expect(isInactiveKeyword('PENDING', settings)).toBe(true);
        expect(isActiveKeyword('WORKING', settings)).toBe(true);
        expect(isWaitingKeyword('BLOCKED', settings)).toBe(true);
        expect(isCompletedKeyword('FINISHED', settings)).toBe(true);
      });
    });

    describe('task text display', () => {
      test('getTaskTextDisplay should cache results', () => {
        const task = {
          text: 'Test task with **markdown**',
          textDisplay: undefined,
        };

        const firstResult = getTaskTextDisplay(task);
        const secondResult = getTaskTextDisplay(task);

        expect(firstResult).toEqual(secondResult);
        expect(task.textDisplay).not.toBeUndefined();
      });

      test('stripMarkdownForDisplay should strip HTML tags', () => {
        const input = 'Task with <b>bold</b> and <i>italic</i> text';
        const result = stripMarkdownForDisplay(input);
        expect(result).toEqual('Task with bold and italic text');
      });

      test('stripMarkdownForDisplay should handle images', () => {
        const input = 'Task with ![alt text](image.jpg)';
        const result = stripMarkdownForDisplay(input);
        expect(result).toEqual('Task with alt text');
      });

      test('stripMarkdownForDisplay should handle inline code', () => {
        const input = 'Task with `code` example';
        const result = stripMarkdownForDisplay(input);
        expect(result).toEqual('Task with code example');
      });

      test('stripMarkdownForDisplay should handle headings', () => {
        const input = '# Heading 1\n## Heading 2\n### Heading 3';
        const result = stripMarkdownForDisplay(input);
        expect(result).toEqual('Heading 1\nHeading 2\nHeading 3');
      });

      test('stripMarkdownForDisplay should handle emphasis', () => {
        const input = '**Bold** and *italic* text';
        const result = stripMarkdownForDisplay(input);
        expect(result).toEqual('Bold and italic text');
      });

      test('stripMarkdownForDisplay should handle strike and highlight', () => {
        const input = '~~Strikethrough~~ and ==highlighted== text';
        const result = stripMarkdownForDisplay(input);
        expect(result).toEqual('Strikethrough and highlighted text');
      });

      test('stripMarkdownForDisplay should handle math blocks', () => {
        const input = 'Task with $$E = mc^2$$ formula';
        const result = stripMarkdownForDisplay(input);
        expect(result).toEqual('Task with E = mc^2 formula');
      });

      test('stripMarkdownForDisplay should normalize whitespace', () => {
        const input =
          '  Task with   extra   spaces  \n\n  and\n\nmultiple\n\n\nlines  ';
        const result = stripMarkdownForDisplay(input);
        // The function only normalizes newlines, not spaces within lines
        expect(result).toEqual(
          'Task with   extra   spaces\n\n  and\n\nmultiple\n\nlines',
        );
      });

      test('stripMarkdownForDisplay should handle empty input', () => {
        expect(stripMarkdownForDisplay('')).toEqual('');
        expect(stripMarkdownForDisplay(null as any)).toEqual('');
        expect(stripMarkdownForDisplay(undefined as any)).toEqual('');
      });
    });
  });
});
