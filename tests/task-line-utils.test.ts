/**
 * Tests for task-line-utils.ts
 */

import { getTaskIndent, findDateLine } from '../src/utils/task-line-utils';

describe('task-line-utils', () => {
  describe('getTaskIndent', () => {
    it('should return empty string for empty line', () => {
      expect(getTaskIndent('')).toBe('');
    });

    it('should return quote prefix for quoted tasks', () => {
      expect(getTaskIndent('> TODO task')).toBe('> ');
      expect(getTaskIndent('  > TODO task')).toBe('  > ');
      expect(getTaskIndent('>> TODO task')).toBe('>> ');
      expect(getTaskIndent('>>> TODO task')).toBe('>>> ');
    });

    it('should return 2-space indent for checkbox tasks', () => {
      expect(getTaskIndent('- [ ] TODO task')).toBe('  ');
      expect(getTaskIndent('  - [x] TODO task')).toBe('    ');
      expect(getTaskIndent('  - [X] TODO task')).toBe('    ');
    });

    it('should return 2-space indent for bullet tasks with leading whitespace', () => {
      expect(getTaskIndent('- TODO task')).toBe('  ');
      expect(getTaskIndent('  + TODO task')).toBe('    ');
      expect(getTaskIndent('* TODO task')).toBe('  ');
      expect(getTaskIndent('  - TODO task')).toBe('    ');
    });

    it('should return 2-space indent for bullet tasks with existing leading whitespace', () => {
      expect(getTaskIndent('  - TODO task')).toBe('    ');
      expect(getTaskIndent('    - TODO task')).toBe('      ');
      expect(getTaskIndent('  - TODO task')).toBe('    ');
    });

    it('should return leading whitespace for regular tasks', () => {
      expect(getTaskIndent('TODO task')).toBe('');
      expect(getTaskIndent('  TODO task')).toBe('  ');
      expect(getTaskIndent('    TODO task')).toBe('    ');
    });

    it('should not treat date-like lines as bullet tasks', () => {
      expect(getTaskIndent('- SCHEDULED: <2026-03-10>')).toBe('  ');
      expect(getTaskIndent('- DEADLINE: <2026-03-10>')).toBe('  ');
      expect(getTaskIndent('- CLOSED: <2026-03-10>')).toBe('  ');
      expect(getTaskIndent('  - SCHEDULED: <2026-03-10>')).toBe('    ');
      expect(getTaskIndent('+ SCHEDULED: <2026-03-10>')).toBe('  ');
      expect(getTaskIndent('* DEADLINE: <2026-03-10>')).toBe('  ');
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
      '  > SCHEDULED: <2026-03-05 Wed>',
      '  > > SCHEDULED: <2026-03-05 Wed>',
      '  CLOSED: <2026-03-05 Fri>',
    ];

    it('should find SCHEDULED line at correct index', () => {
      const result = findDateLine(lines, 1, 'SCHEDULED', '  ');
      expect(result).toBe(1);
    });

    it('should find DEADLINE line at correct index', () => {
      const result = findDateLine(lines, 1, 'DEADLINE', '  ');
      expect(result).toBe(4);
    });

    it('should find SCHEDULED line with time at correct index', () => {
      const result = findDateLine(lines, 1, 'SCHEDULED', '  ');
      expect(result).toBe(1);
    });

    it('should find DEADLINE line with time at correct index', () => {
      const result = findDateLine(lines, 1, 'DEADLINE', '  ');
      expect(result).toBe(4);
    });

    it('should find SCHEDULED line with repeater at correct index', () => {
      const result = findDateLine(lines, 1, 'SCHEDULED', '  ');
      expect(result).toBe(1);
    });

    it('should find DEADLINE line with repeater at correct index', () => {
      const result = findDateLine(lines, 1, 'DEADLINE', '  ');
      expect(result).toBe(4);
    });

    it('should return -1 when date line not found', () => {
      // CLOSED line is at index 10, but search only goes up to index 9 (8 lines after start)
      const result = findDateLine(lines, 1, 'CLOSED', '  ');
      expect(result).toBe(-1);
    });

    it('should handle quoted SCHEDULED line', () => {
      // Line 8 has indent '  ', not '  >', so this should return -1
      const result = findDateLine(lines, 1, 'SCHEDULED', '  >');
      expect(result).toBe(-1);
    });

    it('should handle quoted DEADLINE line', () => {
      // There is no quoted DEADLINE line in test data, so this should return -1
      const result = findDateLine(lines, 1, 'DEADLINE', '  >');
      expect(result).toBe(-1);
    });

    it('should handle nested quote SCHEDULED line', () => {
      // Line 9 has indent '  ', not '  > >', so this should return -1
      const result = findDateLine(lines, 1, 'SCHEDULED', '  > >');
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
      const result = findDateLine(longLines, 1, 'SCHEDULED', '');
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
      const result = findDateLine(linesWithStop, 1, 'SCHEDULED', '');
      expect(result).toBe(1);
    });

    it('should continue past nested date lines', () => {
      const nestedLines = [
        'TODO task',
        '  SCHEDULED: <2026-03-05 Wed>',
        '    DEADLINE: <2026-03-05 Fri>',
        '  SCHEDULED: <2026-03-06 Thu>',
      ];
      const result = findDateLine(nestedLines, 1, 'SCHEDULED', '');
      expect(result).toBe(1);
    });

    it('should not find date line that is a separate bullet', () => {
      const lines = ['- TODO task a', '- SCHEDULED: <2026-03-10>'];
      const result = findDateLine(lines, 1, 'SCHEDULED', '  ');
      expect(result).toBe(-1);
    });

    it('should not find date line with nested bullet marker', () => {
      const lines = ['+ TODO task b', '  + SCHEDULED: <2026-03-10>'];
      const result = findDateLine(lines, 1, 'SCHEDULED', '  ');
      expect(result).toBe(-1);
    });

    it('should not find date line at wrong quote level', () => {
      const lines = ['> TODO task c', '  SCHEDULED: <2026-03-10>'];
      const result = findDateLine(lines, 1, 'SCHEDULED', '> ');
      expect(result).toBe(-1);
    });

    it('should not find date line at lower indent than task', () => {
      const lines = ['  TODO task d', 'SCHEDULED: <2026-03-10>'];
      const result = findDateLine(lines, 1, 'SCHEDULED', '  ');
      expect(result).toBe(-1);
    });

    it('should not find date line without indent for bullet task', () => {
      const lines = ['- TODO task e', 'SCHEDULED: <2026-03-10>'];
      const result = findDateLine(lines, 1, 'SCHEDULED', '  ');
      expect(result).toBe(-1);
    });

    it('should find CLOSED date line', () => {
      const lines = ['TODO task', 'CLOSED: [2026-03-05 Thu 10:00]'];
      const result = findDateLine(lines, 1, 'CLOSED', '');
      expect(result).toBe(1);
    });

    it('should find CLOSED date line with proper indent', () => {
      const lines = ['  TODO task', '  CLOSED: [2026-03-05 Thu 10:00]'];
      const result = findDateLine(lines, 1, 'CLOSED', '  ');
      expect(result).toBe(1);
    });

    it('should find CLOSED in quoted task', () => {
      const lines = ['> TODO task', '> CLOSED: [2026-03-05 Thu 10:00]'];
      const result = findDateLine(lines, 1, 'CLOSED', '> ');
      expect(result).toBe(1);
    });

    it('should find CLOSED at nested indent', () => {
      const lines = ['TODO task', '  CLOSED: [2026-03-05 Thu 10:00]'];
      const result = findDateLine(lines, 1, 'CLOSED', '');
      expect(result).toBe(1);
    });
  });
});
