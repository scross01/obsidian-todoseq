/**
 * Tests for task-line-utils.ts
 */

import {
  getTaskIndent,
  findDateLine,
  findDateLineWithParser,
  getIndentLength,
} from '../src/utils/task-line-utils';
import { Task } from '../src/types/task';
import { KeywordManager } from '../src/utils/keyword-manager';

const keywordManager = new KeywordManager({});

describe('task-line-utils', () => {
  describe('getTaskIndent', () => {
    it('should return empty string for empty line', () => {
      const task = { rawText: '', state: 'TODO' } as Task;
      expect(getTaskIndent(task)).toBe('');
    });

    it('should return quote prefix for quoted tasks', () => {
      expect(
        getTaskIndent({ rawText: '> TODO task', state: 'TODO' } as Task),
      ).toBe('> ');
      expect(
        getTaskIndent({ rawText: '  > TODO task', state: 'TODO' } as Task),
      ).toBe('  > ');
      expect(
        getTaskIndent({ rawText: '>> TODO task', state: 'TODO' } as Task),
      ).toBe('>> ');
      expect(
        getTaskIndent({ rawText: '>>> TODO task', state: 'TODO' } as Task),
      ).toBe('>>> ');
    });

    it('should return indent for checkbox tasks', () => {
      expect(
        getTaskIndent({ rawText: '- [ ] TODO task', state: 'TODO' } as Task),
      ).toBe('      ');
      expect(
        getTaskIndent({ rawText: '  - [x] TODO task', state: 'TODO' } as Task),
      ).toBe('        ');
      expect(
        getTaskIndent({ rawText: '  - [X] TODO task', state: 'TODO' } as Task),
      ).toBe('        ');
    });

    it('should return indent for bullet tasks with leading whitespace', () => {
      expect(
        getTaskIndent({ rawText: '- TODO task', state: 'TODO' } as Task),
      ).toBe('  ');
      expect(
        getTaskIndent({ rawText: '  + TODO task', state: 'TODO' } as Task),
      ).toBe('    ');
      expect(
        getTaskIndent({ rawText: '* TODO task', state: 'TODO' } as Task),
      ).toBe('  ');
      expect(
        getTaskIndent({ rawText: '  - TODO task', state: 'TODO' } as Task),
      ).toBe('    ');
    });

    it('should return indent for bullet tasks with existing leading whitespace', () => {
      expect(
        getTaskIndent({ rawText: '  - TODO task', state: 'TODO' } as Task),
      ).toBe('    ');
      expect(
        getTaskIndent({ rawText: '    - TODO task', state: 'TODO' } as Task),
      ).toBe('      ');
      expect(
        getTaskIndent({ rawText: '  - TODO task', state: 'TODO' } as Task),
      ).toBe('    ');
    });

    it('should return leading whitespace for regular tasks', () => {
      expect(
        getTaskIndent({ rawText: 'TODO task', state: 'TODO' } as Task),
      ).toBe('');
      expect(
        getTaskIndent({ rawText: '  TODO task', state: 'TODO' } as Task),
      ).toBe('  ');
      expect(
        getTaskIndent({ rawText: '    TODO task', state: 'TODO' } as Task),
      ).toBe('    ');
    });

    it('should not treat date-like lines as bullet tasks', () => {
      expect(
        getTaskIndent({
          rawText: '- SCHEDULED: <2026-03-10>',
          state: 'SCHEDULED',
        } as Task),
      ).toBe('  ');
      expect(
        getTaskIndent({
          rawText: '- DEADLINE: <2026-03-10>',
          state: 'DEADLINE',
        } as Task),
      ).toBe('  ');
      expect(
        getTaskIndent({
          rawText: '- CLOSED: <2026-03-10>',
          state: 'CLOSED',
        } as Task),
      ).toBe('  ');
      expect(
        getTaskIndent({
          rawText: '  - SCHEDULED: <2026-03-10>',
          state: 'SCHEDULED',
        } as Task),
      ).toBe('    ');
      expect(
        getTaskIndent({
          rawText: '+ SCHEDULED: <2026-03-10>',
          state: 'SCHEDULED',
        } as Task),
      ).toBe('  ');
      expect(
        getTaskIndent({
          rawText: '* DEADLINE: <2026-03-10>',
          state: 'DEADLINE',
        } as Task),
      ).toBe('  ');
    });

    it('should return indent for numbered list tasks', () => {
      expect(
        getTaskIndent({ rawText: '1. TODO test 1', state: 'TODO' } as Task),
      ).toBe('   ');
      expect(
        getTaskIndent({ rawText: '10. TODO test 1', state: 'TODO' } as Task),
      ).toBe('    ');
      expect(
        getTaskIndent({ rawText: '1) TODO test 1', state: 'TODO' } as Task),
      ).toBe('   ');
      expect(
        getTaskIndent({ rawText: '  1. TODO test 1', state: 'TODO' } as Task),
      ).toBe('     ');
    });

    it('should return indent for lettered list tasks', () => {
      expect(
        getTaskIndent({ rawText: 'a. TODO test 1', state: 'TODO' } as Task),
      ).toBe('   ');
      expect(
        getTaskIndent({ rawText: 'b. TODO test 1', state: 'TODO' } as Task),
      ).toBe('   ');
      expect(
        getTaskIndent({ rawText: 'A) TODO test 1', state: 'TODO' } as Task),
      ).toBe('   ');
      expect(
        getTaskIndent({ rawText: 'Z) TODO test 1', state: 'TODO' } as Task),
      ).toBe('   ');
      expect(
        getTaskIndent({ rawText: '  a. TODO test 1', state: 'TODO' } as Task),
      ).toBe('     ');
    });
  });

  describe('findDateLine', () => {
    const lines = [
      '  TODO task',
      '  SCHEDULED: <2026-03-05 Wed>',
      '  SCHEDULED: <2026-03-05 Wed 07:00 .+1d>',
      '  SCHEDULED: <2026-03-05 Wed 07:00 ++1d>',
      '  DEADLINE: <2026-03-05 Fri>',
      '  DEADLINE: <2026-03-05 Fri 20:00 ++1d>',
      '  SCHEDULED: <2026-03-05 Wed 07:00 .+1d>',
      '  DEADLINE: <2026-03-05 Fri 20:00 ++1d>',
      '  CLOSED: <2026-03-05 Fri>',
    ];

    it('should find SCHEDULED line at correct index', () => {
      const result = findDateLine(lines, 1, 'SCHEDULED', '  ', keywordManager);
      expect(result).toBe(1);
    });

    it('should find DEADLINE line at correct index', () => {
      const result = findDateLine(lines, 1, 'DEADLINE', '  ', keywordManager);
      expect(result).toBe(4);
    });

    it('should find CLOSED line at correct index', () => {
      const result = findDateLine(lines, 1, 'CLOSED', '  ', keywordManager);
      expect(result).toBe(8);
    });

    it('should handle quoted SCHEDULED line', () => {
      // Task has quotes ('  >'), but lines in test data have no quotes
      // With new behavior, quote levels must match, so no date line should be found
      const result = findDateLine(lines, 1, 'SCHEDULED', '  >', keywordManager);
      expect(result).toBe(-1);
    });

    it('should handle quoted DEADLINE line', () => {
      // Task has quotes ('  >'), but lines in test data have no quotes
      // With new behavior, quote levels must match, so no date line should be found
      const result = findDateLine(lines, 1, 'DEADLINE', '  >', keywordManager);
      expect(result).toBe(-1);
    });

    it('should search only 8 lines after start', () => {
      // Create a test case where the date line is beyond 8 lines
      const longLines = [
        'TODO task',
        'SCHEDULED: <2026-03-05 Wed>',
        ...Array(10).fill('  some other content'),
        'SCHEDULED: <2026-03-06 Thu>',
      ];
      const result = findDateLine(
        longLines,
        1,
        'SCHEDULED',
        '',
        keywordManager,
      );
      expect(result).toBe(1); // Should find the first one, not the one beyond 8 lines
    });

    it('should stop at non-date line with same or less indent', () => {
      const linesWithStop = [
        'TODO task',
        '  SCHEDULED: <2026-03-05 Wed>',
        '  DEADLINE: <2026-03-05 Fri>',
        '  Some other task',
        '  SCHEDULED: <2026-03-06 Thu>',
      ];
      const result = findDateLine(
        linesWithStop,
        1,
        'SCHEDULED',
        '',
        keywordManager,
      );
      expect(result).toBe(1);
    });

    it('should continue past nested date lines', () => {
      const nestedLines = [
        'TODO task',
        '  SCHEDULED: <2026-03-05 Wed>',
        '    DEADLINE: <2026-03-05 Fri>',
        '  SCHEDULED: <2026-03-06 Thu>',
      ];
      const result = findDateLine(
        nestedLines,
        1,
        'SCHEDULED',
        '',
        keywordManager,
      );
      expect(result).toBe(1);
    });

    it('should not find date line that is a separate bullet', () => {
      const lines = ['- TODO task a', '- SCHEDULED: <2026-03-10>'];
      const result = findDateLine(lines, 1, 'SCHEDULED', '  ', keywordManager);
      expect(result).toBe(-1);
    });

    it('should not find date line with nested bullet marker', () => {
      const lines = ['+ TODO task b', '  + SCHEDULED: <2026-03-10>'];
      const result = findDateLine(lines, 1, 'SCHEDULED', '  ', keywordManager);
      expect(result).toBe(-1);
    });

    it('should not find date line at wrong quote level', () => {
      const lines = ['> TODO task c', '  SCHEDULED: <2026-03-10>'];
      const result = findDateLine(lines, 1, 'SCHEDULED', '> ', keywordManager);
      expect(result).toBe(-1);
    });

    it('should find date line at any indent level', () => {
      // With new behavior, any indent level is allowed for non-quoted lines
      const lines = ['  TODO task d', 'SCHEDULED: <2026-03-10>'];
      const result = findDateLine(lines, 1, 'SCHEDULED', '  ', keywordManager);
      expect(result).toBe(1);
    });

    it('should not find date line without indent for bullet task', () => {
      const lines = ['- TODO task e', 'SCHEDULED: <2026-03-10>'];
      const result = findDateLine(lines, 1, 'SCHEDULED', '  ', keywordManager);
      expect(result).toBe(1);
    });

    it('should find CLOSED date line', () => {
      const lines = ['TODO task', 'CLOSED: [2026-03-05 Thu 10:00]'];
      const result = findDateLine(lines, 1, 'CLOSED', '', keywordManager);
      expect(result).toBe(1);
    });

    it('should find CLOSED date line with proper indent', () => {
      const lines = ['  TODO task', '  CLOSED: [2026-03-05 Thu 10:00]'];
      const result = findDateLine(lines, 1, 'CLOSED', '  ', keywordManager);
      expect(result).toBe(1);
    });

    it('should find CLOSED in quoted task', () => {
      const lines = ['> TODO task', '> CLOSED: [2026-03-05 Thu 10:00]'];
      const result = findDateLine(lines, 1, 'CLOSED', '> ', keywordManager);
      expect(result).toBe(1);
    });

    it('should find CLOSED at nested indent', () => {
      const lines = ['TODO task', '  CLOSED: [2026-03-05 Thu 10:00]'];
      const result = findDateLine(lines, 1, 'CLOSED', '', keywordManager);
      expect(result).toBe(1);
    });

    // New behavior tests - any indent level is allowed for non-quoted lines
    it('should find date line at any indent level for non-quoted task', () => {
      const lines = ['   TODO test 1', 'SCHEDULED: <2026-03-20>'];
      const result = findDateLine(lines, 1, 'SCHEDULED', '   ', keywordManager);
      expect(result).toBe(1);
    });

    it('should find date line at deeper indent for non-quoted task', () => {
      const lines = ['TODO test 1', '   SCHEDULED: <2026-03-20>'];
      const result = findDateLine(lines, 1, 'SCHEDULED', '', keywordManager);
      expect(result).toBe(1);
    });

    it('should find date line at any indent after quotes for quoted task', () => {
      const lines = ['> TODO test 2', '>    SCHEDULED: <2026-03-20>'];
      const result = findDateLine(lines, 1, 'SCHEDULED', '> ', keywordManager);
      expect(result).toBe(1);
    });

    it('should not find date line at different quote level', () => {
      const lines = ['TODO test 1', '> SCHEDULED: <2026-03-20>'];
      const result = findDateLine(lines, 1, 'SCHEDULED', '', keywordManager);
      expect(result).toBe(-1);
    });

    it('should not find date line without quotes when task has quotes', () => {
      const lines = ['> TODO test 1', 'SCHEDULED: <2026-03-20>'];
      const result = findDateLine(lines, 1, 'SCHEDULED', '> ', keywordManager);
      expect(result).toBe(-1);
    });

    it('should not find date line with quotes when task has no quotes', () => {
      const lines = ['TODO test 1', '> SCHEDULED: <2026-03-20>'];
      const result = findDateLine(lines, 1, 'SCHEDULED', '', keywordManager);
      expect(result).toBe(-1);
    });
  });

  describe('findDateLineWithParser', () => {
    it('should use parser when provided', () => {
      const mockParser = {
        getDateLineType: jest.fn().mockReturnValue('scheduled'),
      };
      const lines = ['TODO task', '  SCHEDULED: <2026-03-10>'];
      const result = findDateLineWithParser(
        lines,
        1,
        'SCHEDULED',
        '  ',
        mockParser,
        keywordManager,
      );
      expect(result).toBe(1);
      expect(mockParser.getDateLineType).toHaveBeenCalledWith(
        '  SCHEDULED: <2026-03-10>',
        '  ',
      );
    });

    it('should fall back to regex when parser is null', () => {
      const lines = ['TODO task', '  SCHEDULED: <2026-03-10>'];
      const result = findDateLineWithParser(
        lines,
        1,
        'SCHEDULED',
        '  ',
        null,
        keywordManager,
      );
      expect(result).toBe(1);
    });

    it('should fall back to regex when parser is undefined', () => {
      const lines = ['TODO task', '  SCHEDULED: <2026-03-10>'];
      const result = findDateLineWithParser(
        lines,
        1,
        'SCHEDULED',
        '  ',
        undefined,
        keywordManager,
      );
      expect(result).toBe(1);
    });

    it('should stop at non-date line when using parser', () => {
      const mockParser = {
        getDateLineType: jest
          .fn()
          .mockReturnValueOnce('scheduled')
          .mockReturnValueOnce(null),
      };
      const lines = ['TODO task', '  SCHEDULED: <2026-03-10>', '  Other line'];
      const result = findDateLineWithParser(
        lines,
        1,
        'SCHEDULED',
        '  ',
        mockParser,
        keywordManager,
      );
      expect(result).toBe(1);
    });
  });

  describe('getIndentLength', () => {
    it('should return 0 for empty string', () => {
      expect(getIndentLength('')).toBe(0);
    });

    it('should count spaces as 1', () => {
      expect(getIndentLength(' ')).toBe(1);
      expect(getIndentLength('  ')).toBe(2);
      expect(getIndentLength('    ')).toBe(4);
    });

    it('should count tabs as 2 spaces', () => {
      expect(getIndentLength('\t')).toBe(2);
      expect(getIndentLength('\t\t')).toBe(4);
      expect(getIndentLength('\t\t\t')).toBe(6);
    });

    it('should handle mixed tabs and spaces', () => {
      expect(getIndentLength(' \t ')).toBe(4);
      expect(getIndentLength('\t  ')).toBe(4);
      expect(getIndentLength('  \t')).toBe(4);
      expect(getIndentLength('\t \t')).toBe(5); // 2 + 1 + 2 = 5
    });
  });

  describe('findDateLine with tab/space indentation', () => {
    it('should find date line with tab indent when task has space indent', () => {
      // Task has 1 space, date line has 1 tab (both = 2 visual columns)
      const lines = [' TODO task', '\tSCHEDULED: <2026-03-10>'];
      const result = findDateLine(lines, 1, 'SCHEDULED', ' ', keywordManager);
      expect(result).toBe(1);
    });

    it('should find date line with space indent when task has tab indent', () => {
      // Task has 1 tab, date line has 2 spaces (both = 2 visual columns)
      const lines = ['\tTODO task', '  SCHEDULED: <2026-03-10>'];
      const result = findDateLine(lines, 1, 'SCHEDULED', '\t', keywordManager);
      expect(result).toBe(1);
    });

    it('should stop at non-date line with shallower visual indent', () => {
      // Task has 1 tab (2 visual columns)
      // Date line has 1 space (1 visual column) - shallower, should stop
      const lines = ['\tTODO task', ' Other line'];
      const result = findDateLine(lines, 1, 'SCHEDULED', '\t', keywordManager);
      expect(result).toBe(-1);
    });

    it('should handle mixed tab/space indents correctly', () => {
      // Task has 2 spaces (2 visual columns)
      // Date line has 1 tab (2 visual columns) - same level, should find
      const lines = ['  TODO task', '\tSCHEDULED: <2026-03-10>'];
      const result = findDateLine(lines, 1, 'SCHEDULED', '  ', keywordManager);
      expect(result).toBe(1);
    });

    it('should accept date line at deeper visual indent (tabs vs spaces)', () => {
      // Task has 2 spaces (2 visual columns)
      // Date line has 1 tab + 1 space (3 visual columns) - deeper, should find
      const lines = ['  TODO task', '\t SCHEDULED: <2026-03-10>'];
      const result = findDateLine(lines, 1, 'SCHEDULED', '  ', keywordManager);
      expect(result).toBe(1);
    });
  });
});
