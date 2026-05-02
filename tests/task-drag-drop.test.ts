/**
 * @jest-environment jsdom
 */

import {
  getDropAction,
  buildRemovalRange,
  modifyLinesForMigration,
  findSubtaskEnd,
  extractSubtaskLines,
} from '../src/view/task-list/task-drag-drop';

describe('getDropAction', () => {
  it('returns copy with no modifiers', () => {
    expect(getDropAction(false, false, false)).toBe('copy');
  });

  it('returns copy with only Ctrl key', () => {
    expect(getDropAction(true, false, false)).toBe('copy');
  });

  it('returns copy with only Meta key', () => {
    expect(getDropAction(false, true, false)).toBe('copy');
  });

  it('returns move with Alt key', () => {
    expect(getDropAction(false, false, true)).toBe('move');
  });

  it('returns move with Alt+Meta', () => {
    expect(getDropAction(false, true, true)).toBe('move');
  });

  it('returns migrate with Ctrl+Alt', () => {
    expect(getDropAction(true, false, true)).toBe('migrate');
  });

  it('returns migrate with all modifiers', () => {
    expect(getDropAction(true, true, true)).toBe('migrate');
  });
});

describe('buildRemovalRange', () => {
  it('returns single line range when no date lines follow', () => {
    const lines = ['TODO some task', 'NEXT_LINE content', 'ANOTHER line'];
    expect(buildRemovalRange(lines, 0)).toEqual({ start: 0, end: 0 });
  });

  it('includes SCHEDULED line', () => {
    const lines = [
      'TODO some task',
      'SCHEDULED: <2026-04-02 Thu>',
      'NEXT_LINE content',
    ];
    expect(buildRemovalRange(lines, 0)).toEqual({ start: 0, end: 1 });
  });

  it('includes DEADLINE line', () => {
    const lines = [
      'TODO some task',
      'DEADLINE: <2026-04-03 Fri>',
      'NEXT_LINE content',
    ];
    expect(buildRemovalRange(lines, 0)).toEqual({ start: 0, end: 1 });
  });

  it('includes both SCHEDULED and DEADLINE lines', () => {
    const lines = [
      'TODO some task',
      'SCHEDULED: <2026-04-02 Thu>',
      'DEADLINE: <2026-04-03 Fri>',
      'NEXT_LINE content',
    ];
    expect(buildRemovalRange(lines, 0)).toEqual({ start: 0, end: 2 });
  });

  it('stops at first non-date line', () => {
    const lines = [
      'some other line',
      'TODO some task',
      'SCHEDULED: <2026-04-02 Thu>',
      'NOT A DATE',
      'DEADLINE: <2026-04-03 Fri>',
    ];
    expect(buildRemovalRange(lines, 1)).toEqual({ start: 1, end: 2 });
  });

  it('handles task at end of file with no trailing lines', () => {
    const lines = ['some other line', 'TODO some task'];
    expect(buildRemovalRange(lines, 1)).toEqual({ start: 1, end: 1 });
  });

  it('handles task at end of file with date lines', () => {
    const lines = [
      'some other line',
      'TODO some task',
      'SCHEDULED: <2026-04-02 Thu>',
      'DEADLINE: <2026-04-03 Fri>',
    ];
    expect(buildRemovalRange(lines, 1)).toEqual({ start: 1, end: 3 });
  });

  it('handles indented SCHEDULED/DEADLINE with leading whitespace', () => {
    const lines = [
      'TODO some task',
      '  SCHEDULED: <2026-04-02 Thu>',
      '  DEADLINE: <2026-04-03 Fri>',
      'NEXT content',
    ];
    expect(buildRemovalRange(lines, 0)).toEqual({ start: 0, end: 2 });
  });

  it('stops at CLOSED line (not a date line to remove)', () => {
    const lines = [
      'TODO some task',
      'SCHEDULED: <2026-04-02 Thu>',
      'CLOSED: [2026-04-01 Wed]',
      'DEADLINE: <2026-04-03 Fri>',
    ];
    expect(buildRemovalRange(lines, 0)).toEqual({ start: 0, end: 1 });
  });
});

describe('modifyLinesForMigration', () => {
  it('replaces keyword with migrate state', () => {
    const lines = ['TODO buy groceries', 'other content'];
    const result = modifyLinesForMigration(lines, 0, 'TODO', 'DONE');
    expect(result).toEqual(['DONE buy groceries', 'other content']);
  });

  it('replaces keyword and removes SCHEDULED line', () => {
    const lines = [
      'TODO buy groceries',
      'SCHEDULED: <2026-04-02 Thu>',
      'other content',
    ];
    const result = modifyLinesForMigration(lines, 0, 'TODO', 'DONE');
    expect(result).toEqual(['DONE buy groceries', 'other content']);
  });

  it('replaces keyword and removes DEADLINE line', () => {
    const lines = [
      'TODO buy groceries',
      'DEADLINE: <2026-04-03 Fri>',
      'other content',
    ];
    const result = modifyLinesForMigration(lines, 0, 'TODO', 'DONE');
    expect(result).toEqual(['DONE buy groceries', 'other content']);
  });

  it('replaces keyword and removes both SCHEDULED and DEADLINE lines', () => {
    const lines = [
      'TODO buy groceries',
      'SCHEDULED: <2026-04-02 Thu> +1w',
      'DEADLINE: <2026-04-03 Fri>',
      'other content',
    ];
    const result = modifyLinesForMigration(lines, 0, 'TODO', 'MIGRATED');
    expect(result).toEqual(['MIGRATED buy groceries', 'other content']);
  });

  it('removes keyword entirely when migrateState is empty string', () => {
    const lines = [
      'TODO buy groceries',
      'SCHEDULED: <2026-04-02 Thu>',
      'other content',
    ];
    const result = modifyLinesForMigration(lines, 0, 'TODO', '');
    expect(result).toEqual(['buy groceries', 'other content']);
  });

  it('handles task with no date lines (keyword change only)', () => {
    const lines = ['DOING write tests', 'other content'];
    const result = modifyLinesForMigration(lines, 0, 'DOING', 'DONE');
    expect(result).toEqual(['DONE write tests', 'other content']);
  });

  it('handles task with list marker', () => {
    const lines = [
      '- TODO buy groceries',
      'SCHEDULED: <2026-04-02 Thu>',
      'other content',
    ];
    const result = modifyLinesForMigration(lines, 0, 'TODO', 'DONE');
    expect(result).toEqual(['- DONE buy groceries', 'other content']);
  });

  it('handles task with priority', () => {
    const lines = [
      'TODO [#A] important task',
      'SCHEDULED: <2026-04-02 Thu>',
      'other content',
    ];
    const result = modifyLinesForMigration(lines, 0, 'TODO', 'DONE');
    expect(result).toEqual(['DONE [#A] important task', 'other content']);
  });

  it('handles task with indented date lines', () => {
    const lines = [
      'TODO buy groceries',
      '  SCHEDULED: <2026-04-02 Thu>',
      '  DEADLINE: <2026-04-03 Fri>',
      'other content',
    ];
    const result = modifyLinesForMigration(lines, 0, 'TODO', 'DONE');
    expect(result).toEqual(['DONE buy groceries', 'other content']);
  });

  it('preserves lines before and after the task', () => {
    const lines = [
      '# Header',
      'TODO buy groceries',
      'SCHEDULED: <2026-04-02 Thu>',
      'DEADLINE: <2026-04-03 Fri>',
      '- [ ] subtask',
      '# Another section',
    ];
    const result = modifyLinesForMigration(lines, 1, 'TODO', 'DONE');
    expect(result).toEqual([
      '# Header',
      'DONE buy groceries',
      '- [ ] subtask',
      '# Another section',
    ]);
  });

  it('handles case-insensitive keyword replacement', () => {
    const lines = ['todo buy groceries', 'other content'];
    const result = modifyLinesForMigration(lines, 0, 'todo', 'DONE');
    expect(result).toEqual(['DONE buy groceries', 'other content']);
  });

  it('handles task at end of file with date lines', () => {
    const lines = [
      '# Header',
      'TODO buy groceries',
      'SCHEDULED: <2026-04-02 Thu>',
    ];
    const result = modifyLinesForMigration(lines, 1, 'TODO', 'DONE');
    expect(result).toEqual(['# Header', 'DONE buy groceries']);
  });

  it('handles empty migrateState removing keyword with list marker', () => {
    const lines = ['- TODO buy groceries', 'SCHEDULED: <2026-04-02 Thu>'];
    const result = modifyLinesForMigration(lines, 0, 'TODO', '');
    expect(result).toEqual(['- buy groceries']);
  });
});

describe('findSubtaskEnd', () => {
  it('returns afterLine when no subtasks follow', () => {
    const lines = ['TODO task', 'NEXT_LINE'];
    expect(findSubtaskEnd(lines, 0, '')).toBe(0);
  });

  it('includes indented subtask lines', () => {
    const lines = [
      'TODO task',
      'SCHEDULED: <2026-04-02 Thu>',
      '  - [ ] subtask 1',
      '  - [x] subtask 2',
      'NEXT_LINE',
    ];
    expect(findSubtaskEnd(lines, 1, '')).toBe(3);
  });

  it('stops at empty line', () => {
    const lines = ['TODO task', '  - [ ] subtask 1', '', '  - [ ] subtask 2'];
    expect(findSubtaskEnd(lines, 0, '')).toBe(1);
  });

  it('stops at line with same indent as parent', () => {
    const lines = ['TODO task', '  - [ ] subtask 1', 'NEXT task'];
    expect(findSubtaskEnd(lines, 0, '')).toBe(1);
  });

  it('stops at line with less indent than parent', () => {
    const lines = ['  TODO task', '    - [ ] subtask 1', 'NEXT task'];
    expect(findSubtaskEnd(lines, 0, '  ')).toBe(1);
  });

  it('handles indented parent task with deeper subtasks', () => {
    const lines = [
      '    TODO task',
      '    SCHEDULED: <2026-04-02 Thu>',
      '      - [ ] subtask 1',
      '      - [x] subtask 2',
      'NEXT',
    ];
    expect(findSubtaskEnd(lines, 1, '    ')).toBe(3);
  });

  it('returns afterLine when next line is not indented', () => {
    const lines = ['TODO task', 'NEXT_LINE'];
    expect(findSubtaskEnd(lines, 0, '')).toBe(0);
  });

  it('handles subtasks at end of file', () => {
    const lines = ['TODO task', '  - [ ] subtask 1', '  - [x] subtask 2'];
    expect(findSubtaskEnd(lines, 0, '')).toBe(2);
  });
});

describe('extractSubtaskLines', () => {
  it('returns empty array when no subtasks', () => {
    const lines = ['TODO task', 'NEXT_LINE'];
    expect(extractSubtaskLines(lines, 0, '')).toEqual([]);
  });

  it('extracts subtask lines with parent indent stripped', () => {
    const lines = [
      'TODO task',
      'SCHEDULED: <2026-04-02 Thu>',
      '  - [ ] subtask 1',
      '  - [x] subtask 2',
      'NEXT',
    ];
    expect(extractSubtaskLines(lines, 1, '')).toEqual([
      '  - [ ] subtask 1',
      '  - [x] subtask 2',
    ]);
  });

  it('strips parent indent from subtask lines', () => {
    const lines = [
      '    TODO task',
      '    SCHEDULED: <2026-04-02 Thu>',
      '      - [ ] subtask 1',
      '      - [x] subtask 2',
      'NEXT',
    ];
    expect(extractSubtaskLines(lines, 1, '    ')).toEqual([
      '  - [ ] subtask 1',
      '  - [x] subtask 2',
    ]);
  });

  it('returns empty when subtasks are at same indent as parent', () => {
    const lines = [
      '  TODO task',
      '  SCHEDULED: <2026-04-02 Thu>',
      '  - [ ] not a subtask (same indent)',
    ];
    expect(extractSubtaskLines(lines, 1, '  ', true)).toEqual([]);
  });
});
