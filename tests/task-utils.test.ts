/**
 * @jest-environment jsdom
 */
import {
  getFilename,
  isCompletedState,
  getCheckboxStatus,
  truncateMiddle,
  getTaskTextDisplay,
  stripMarkdownForDisplay,
  hasSubtasks,
  getSubtaskDisplayText,
} from '../src/utils/task-utils';
import { Task } from '../src/types/task';
import { KeywordManager } from '../src/utils/keyword-manager';
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
        const result = KeywordManager.getKeywordsForGroup(
          'activeKeywords',
          settings,
        );
        expect(result).toEqual(
          expect.arrayContaining([...BUILTIN_ACTIVE_KEYWORDS, 'WORKING']),
        );
      });

      test('should return waiting keywords with custom additions', () => {
        const settings = { additionalWaitingKeywords: ['BLOCKED'] };
        const result = KeywordManager.getKeywordsForGroup(
          'waitingKeywords',
          settings,
        );
        expect(result).toEqual(
          expect.arrayContaining([...BUILTIN_WAITING_KEYWORDS, 'BLOCKED']),
        );
      });

      test('should return completed keywords with custom additions', () => {
        const settings = { additionalCompletedKeywords: ['FINISHED'] };
        const result = KeywordManager.getKeywordsForGroup(
          'completedKeywords',
          settings,
        );
        expect(result).toEqual(
          expect.arrayContaining([...BUILTIN_COMPLETED_KEYWORDS, 'FINISHED']),
        );
      });

      test('should return empty array for invalid group', () => {
        const settings = {};
        const result = KeywordManager.getKeywordsForGroup(
          'invalid' as any,
          settings,
        );
        expect(result).toEqual([]);
      });
    });

    describe('getKeywordsForGroup - inactiveKeywords', () => {
      test('should return inactive keywords with custom additions', () => {
        const settings = { additionalInactiveKeywords: ['PENDING'] };
        const result = KeywordManager.getKeywordsForGroup(
          'inactiveKeywords',
          settings,
        );
        expect(result).toEqual(
          expect.arrayContaining([...BUILTIN_INACTIVE_KEYWORDS, 'PENDING']),
        );
      });

      test('should return default inactive keywords when no custom', () => {
        const settings = {};
        const result = KeywordManager.getKeywordsForGroup(
          'inactiveKeywords',
          settings,
        );
        expect(result).toEqual(
          expect.arrayContaining(BUILTIN_INACTIVE_KEYWORDS),
        );
      });
    });

    describe('getAllKeywords', () => {
      test('should return all keywords from all groups', () => {
        const settings = {
          additionalInactiveKeywords: ['PENDING'],
          additionalActiveKeywords: ['WORKING'],
          additionalWaitingKeywords: ['BLOCKED'],
          additionalCompletedKeywords: ['FINISHED'],
        };
        const result = KeywordManager.getAllKeywords(settings);
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
          additionalInactiveKeywords: ['TODO'], // Duplicate of built-in
          additionalActiveKeywords: ['DOING'], // Duplicate of built-in
        };
        const result = KeywordManager.getAllKeywords(settings);
        expect(result.filter((k: string) => k === 'TODO').length).toBe(1);
        expect(result.filter((k: string) => k === 'DOING').length).toBe(1);
      });
    });

    describe('getKeywordGroup', () => {
      test('should return active group for active keywords', () => {
        const settings = {};
        expect(KeywordManager.getKeywordGroup('DOING', settings)).toBe(
          'activeKeywords',
        );
      });

      test('should return inactive group for inactive keywords', () => {
        const settings = {};
        expect(KeywordManager.getKeywordGroup('TODO', settings)).toBe(
          'inactiveKeywords',
        );
      });

      test('should return waiting group for waiting keywords', () => {
        const settings = {};
        expect(KeywordManager.getKeywordGroup('WAIT', settings)).toBe(
          'waitingKeywords',
        );
      });

      test('should return completed group for completed keywords', () => {
        const settings = {};
        expect(KeywordManager.getKeywordGroup('DONE', settings)).toBe(
          'completedKeywords',
        );
      });

      test('should return inactive group for custom additional keywords', () => {
        const settings = { additionalInactiveKeywords: ['PENDING'] };
        expect(KeywordManager.getKeywordGroup('PENDING', settings)).toBe(
          'inactiveKeywords',
        );
      });

      test('should return null for unknown keyword', () => {
        const settings = {};
        expect(KeywordManager.getKeywordGroup('UNKNOWN', settings)).toBeNull();
      });
    });

    describe('isBuiltinKeyword', () => {
      test('should return true for built-in active keywords', () => {
        BUILTIN_ACTIVE_KEYWORDS.forEach((keyword) => {
          expect(KeywordManager.isBuiltin(keyword)).toBe(true);
        });
      });

      test('should return true for built-in inactive keywords', () => {
        BUILTIN_INACTIVE_KEYWORDS.forEach((keyword) => {
          expect(KeywordManager.isBuiltin(keyword)).toBe(true);
        });
      });

      test('should return true for built-in waiting keywords', () => {
        BUILTIN_WAITING_KEYWORDS.forEach((keyword) => {
          expect(KeywordManager.isBuiltin(keyword)).toBe(true);
        });
      });

      test('should return true for built-in completed keywords', () => {
        BUILTIN_COMPLETED_KEYWORDS.forEach((keyword) => {
          expect(KeywordManager.isBuiltin(keyword)).toBe(true);
        });
      });

      test('should return false for custom keywords', () => {
        expect(KeywordManager.isBuiltin('CUSTOM')).toBe(false);
        expect(KeywordManager.isBuiltin('PENDING')).toBe(false);
      });
    });

    describe('keyword type detection', () => {
      test('isCompletedKeyword should detect completed keywords', () => {
        const settings = {};
        BUILTIN_COMPLETED_KEYWORDS.forEach((keyword) => {
          expect(KeywordManager.isCompletedKeyword(keyword, settings)).toBe(
            true,
          );
        });
        expect(KeywordManager.isCompletedKeyword('DOING', settings)).toBe(
          false,
        );
      });

      test('isActiveKeyword should detect active keywords', () => {
        const settings = {};
        BUILTIN_ACTIVE_KEYWORDS.forEach((keyword) => {
          expect(KeywordManager.isActiveKeyword(keyword, settings)).toBe(true);
        });
        expect(KeywordManager.isActiveKeyword('TODO', settings)).toBe(false);
      });

      test('isWaitingKeyword should detect waiting keywords', () => {
        const settings = {};
        BUILTIN_WAITING_KEYWORDS.forEach((keyword) => {
          expect(KeywordManager.isWaitingKeyword(keyword, settings)).toBe(true);
        });
        expect(KeywordManager.isWaitingKeyword('DONE', settings)).toBe(false);
      });

      test('isInactiveKeyword should detect inactive keywords', () => {
        const settings = {};
        BUILTIN_INACTIVE_KEYWORDS.forEach((keyword) => {
          expect(KeywordManager.isInactiveKeyword(keyword, settings)).toBe(
            true,
          );
        });
        expect(KeywordManager.isInactiveKeyword('DOING', settings)).toBe(false);
      });

      test('should detect custom additional keywords', () => {
        const settings = {
          additionalInactiveKeywords: ['PENDING'],
          additionalActiveKeywords: ['WORKING'],
          additionalWaitingKeywords: ['BLOCKED'],
          additionalCompletedKeywords: ['FINISHED'],
        };

        expect(KeywordManager.isInactiveKeyword('PENDING', settings)).toBe(
          true,
        );
        expect(KeywordManager.isActiveKeyword('WORKING', settings)).toBe(true);
        expect(KeywordManager.isWaitingKeyword('BLOCKED', settings)).toBe(true);
        expect(KeywordManager.isCompletedKeyword('FINISHED', settings)).toBe(
          true,
        );
      });
    });
  });

  function createTask(overrides: Partial<Task> = {}): Task {
    return {
      path: '',
      line: 0,
      rawText: '',
      indent: '',
      listMarker: '- ',
      text: '',
      state: 'TODO',
      completed: false,
      priority: null,
      scheduledDate: null,
      scheduledDateRepeat: null,
      deadlineDate: null,
      deadlineDateRepeat: null,
      closedDate: null,
      urgency: null,
      isDailyNote: false,
      dailyNoteDate: null,
      subtaskCount: 0,
      subtaskCompletedCount: 0,
      ...overrides,
    };
  }

  describe('getTaskTextDisplay', () => {
    test('returns cached textDisplay if already set', () => {
      const task = createTask({ text: 'hello', textDisplay: 'cached' });
      expect(getTaskTextDisplay(task)).toBe('cached');
    });

    test('computes and caches textDisplay from text', () => {
      const task = createTask({ text: '**bold** task' });
      expect(task.textDisplay).toBeUndefined();
      const result = getTaskTextDisplay(task);
      expect(result).toBe('bold task');
      expect(task.textDisplay).toBe('bold task');
    });

    test('returns same cached value on second call', () => {
      const task = createTask({ text: '**bold**' });
      const first = getTaskTextDisplay(task);
      task.text = 'changed';
      const second = getTaskTextDisplay(task);
      expect(first).toBe(second);
    });
  });

  describe('stripMarkdownForDisplay', () => {
    test('returns empty string for empty input', () => {
      expect(stripMarkdownForDisplay('')).toBe('');
    });

    test('strips HTML tags', () => {
      expect(stripMarkdownForDisplay('<b>bold</b> and <i>italic</i>')).toBe(
        'bold and italic',
      );
    });

    test('strips image syntax preserving alt text', () => {
      expect(stripMarkdownForDisplay('see ![photo](img.png) here')).toBe(
        'see photo here',
      );
    });

    test('strips image with empty alt', () => {
      expect(stripMarkdownForDisplay('![](img.png)')).toBe('');
    });

    test('strips inline code backticks', () => {
      expect(stripMarkdownForDisplay('use `console.debug` please')).toBe(
        'use console.debug please',
      );
    });

    test('strips headings', () => {
      expect(stripMarkdownForDisplay('## Heading text')).toBe('Heading text');
    });

    test('strips heading with leading spaces', () => {
      expect(stripMarkdownForDisplay('   ### Deep heading')).toBe(
        'Deep heading',
      );
    });

    test('strips bold with asterisks', () => {
      expect(stripMarkdownForDisplay('this is **bold** text')).toBe(
        'this is bold text',
      );
    });

    test('strips bold with underscores', () => {
      expect(stripMarkdownForDisplay('this is __bold__ text')).toBe(
        'this is bold text',
      );
    });

    test('strips italic with asterisks', () => {
      expect(stripMarkdownForDisplay('this is *italic* text')).toBe(
        'this is italic text',
      );
    });

    test('strips italic with underscores', () => {
      expect(stripMarkdownForDisplay('this is _italic_ text')).toBe(
        'this is italic text',
      );
    });

    test('strips strikethrough', () => {
      expect(stripMarkdownForDisplay('this is ~~removed~~ text')).toBe(
        'this is removed text',
      );
    });

    test('strips highlight', () => {
      expect(stripMarkdownForDisplay('this is ==highlighted== text')).toBe(
        'this is highlighted text',
      );
    });

    test('strips math blocks', () => {
      expect(stripMarkdownForDisplay('formula $$E=mc^2$$ here')).toBe(
        'formula E=mc^2 here',
      );
    });

    test('normalizes carriage returns', () => {
      expect(stripMarkdownForDisplay('line1\r\nline2')).toBe('line1\nline2');
    });

    test('normalizes trailing spaces on lines', () => {
      expect(stripMarkdownForDisplay('line1   \nline2')).toBe('line1\nline2');
    });

    test('collapses multiple blank lines', () => {
      expect(stripMarkdownForDisplay('line1\n\n\n\nline2')).toBe(
        'line1\n\nline2',
      );
    });

    test('trims leading and trailing whitespace', () => {
      expect(stripMarkdownForDisplay('  hello world  ')).toBe('hello world');
    });

    test('handles plain text without markdown unchanged', () => {
      expect(stripMarkdownForDisplay('just plain text')).toBe(
        'just plain text',
      );
    });

    test('handles combination of multiple markdown features', () => {
      const input = '## **Bold** and *italic* with `code`';
      expect(stripMarkdownForDisplay(input)).toBe('Bold and italic with code');
    });
  });

  describe('hasSubtasks', () => {
    test('returns false when subtaskCount is 0', () => {
      const task = createTask({ subtaskCount: 0 });
      expect(hasSubtasks(task)).toBe(false);
    });

    test('returns true when subtaskCount is positive', () => {
      const task = createTask({ subtaskCount: 3 });
      expect(hasSubtasks(task)).toBe(true);
    });

    test('returns true when subtaskCount is 1', () => {
      const task = createTask({ subtaskCount: 1 });
      expect(hasSubtasks(task)).toBe(true);
    });
  });

  describe('getSubtaskDisplayText', () => {
    test('returns empty string when no subtasks', () => {
      const task = createTask({ subtaskCount: 0, subtaskCompletedCount: 0 });
      expect(getSubtaskDisplayText(task)).toBe('');
    });

    test('returns completed/total format', () => {
      const task = createTask({ subtaskCount: 3, subtaskCompletedCount: 1 });
      expect(getSubtaskDisplayText(task)).toBe('1/3');
    });

    test('returns all completed format', () => {
      const task = createTask({ subtaskCount: 5, subtaskCompletedCount: 5 });
      expect(getSubtaskDisplayText(task)).toBe('5/5');
    });

    test('returns zero completed format', () => {
      const task = createTask({ subtaskCount: 4, subtaskCompletedCount: 0 });
      expect(getSubtaskDisplayText(task)).toBe('0/4');
    });
  });
});
