import {
  appendBlockAnchor,
  splitTrailingBlockAnchor,
} from '../src/utils/block-anchor';
import {
  findTaskBlockAnchor,
  findTaskBlockEndLine,
} from '../src/utils/task-block-anchor';

describe('splitTrailingBlockAnchor', () => {
  test('splits a whitespace-separated terminal anchor', () => {
    expect(splitTrailingBlockAnchor('Task text ^abc123')).toEqual({
      text: 'Task text',
      anchor: 'abc123',
    });
    expect(splitTrailingBlockAnchor('  :END: ^todoseq-abc123')).toEqual({
      text: '  :END:',
      anchor: 'todoseq-abc123',
    });
    expect(splitTrailingBlockAnchor('Task ^ab_c-1   ')).toEqual({
      text: 'Task',
      anchor: 'ab_c-1',
    });
  });

  test('splits an anchor that is the whole line', () => {
    expect(splitTrailingBlockAnchor('^anchor')).toEqual({
      text: '',
      anchor: 'anchor',
    });
  });

  test('rejects suffixes that are not block anchors', () => {
    for (const line of [
      'Task foo^bar',
      'Task [^1]',
      'Task ^',
      'Task ^anchor tail',
      'Task ^anchor]',
      'Task [^anchor]',
      'Task ^anchor^other',
    ]) {
      expect(splitTrailingBlockAnchor(line)).toEqual({
        text: line,
        anchor: null,
      });
    }
  });
});

describe('appendBlockAnchor', () => {
  test('appends exactly one space before the anchor', () => {
    expect(appendBlockAnchor('  SCHEDULED: <2026-11-23 Mon>', 'abc')).toBe(
      '  SCHEDULED: <2026-11-23 Mon> ^abc',
    );
    expect(appendBlockAnchor('  SCHEDULED: <2026-11-23 Mon>   ', '^abc')).toBe(
      '  SCHEDULED: <2026-11-23 Mon> ^abc',
    );
  });

  test('does not add a leading space on an empty line', () => {
    expect(appendBlockAnchor('', 'abc')).toBe('^abc');
    expect(appendBlockAnchor('   ', 'abc')).toBe('^abc');
  });

  test('round-trips with splitTrailingBlockAnchor', () => {
    expect(splitTrailingBlockAnchor(appendBlockAnchor('task', 'abc'))).toEqual({
      text: 'task',
      anchor: 'abc',
    });
  });
});

describe('findTaskBlockEndLine', () => {
  test('returns the task line when no metadata follows', () => {
    const lines = ['TODO task', '', 'TODO next'];
    expect(findTaskBlockEndLine(lines, 0, '')).toBe(0);
  });

  test('returns the last contiguous metadata line', () => {
    const lines = [
      '- [ ] TODO task',
      '  SCHEDULED: <2026-11-23 Mon>',
      '  DESCRIPTION: details',
      '',
      '  DEADLINE: <2026-11-24 Tue>',
    ];
    expect(findTaskBlockEndLine(lines, 0, '')).toBe(2);
  });

  test('returns the anchored :END: of a properties drawer', () => {
    const lines = [
      'TODO task',
      'SCHEDULED: <2026-11-23 Mon>',
      ':PROPERTIES:',
      ':ID: probe-1',
      ':END: ^todoseq-abc123',
      'TODO next',
    ];
    expect(findTaskBlockEndLine(lines, 0, '')).toBe(4);
  });

  test('stops at a child task', () => {
    const lines = [
      'TODO parent',
      '  SCHEDULED: <2026-11-23 Mon>',
      '  - [ ] TODO child',
    ];
    expect(findTaskBlockEndLine(lines, 0, '')).toBe(1);
  });

  test('handles quoted and heading tasks', () => {
    const quoted = [
      '> - [ ] TODO task',
      '> SCHEDULED: <2026-11-23 Mon>',
      '> :PROPERTIES:',
      '> :ID: q-1',
      '> :END: ^quoted',
    ];
    expect(findTaskBlockEndLine(quoted, 0, '> ')).toBe(4);

    const heading = [
      '# TODO task',
      'SCHEDULED: <2026-11-23 Mon>',
      'DESCRIPTION: details',
    ];
    expect(findTaskBlockEndLine(heading, 0, '# ')).toBe(2);
  });
});

describe('findTaskBlockAnchor', () => {
  test('prefers a task-line anchor over a block-end anchor', () => {
    const lines = [
      'TODO task ^taskline',
      'SCHEDULED: <2026-11-23 Mon> ^blockend',
    ];
    expect(findTaskBlockAnchor(lines, 0, '')).toEqual({
      anchor: 'taskline',
      line: 0,
    });
  });

  test('reads a block-end anchor when the task line has none', () => {
    const lines = ['TODO task', 'SCHEDULED: <2026-11-23 Mon> ^blockend'];
    expect(findTaskBlockAnchor(lines, 0, '')).toEqual({
      anchor: 'blockend',
      line: 1,
    });
  });

  test('reads an anchor after :END:', () => {
    const lines = [
      'TODO task',
      ':PROPERTIES:',
      ':ID: probe-1',
      ':END: ^drawerend',
    ];
    expect(findTaskBlockAnchor(lines, 0, '')).toEqual({
      anchor: 'drawerend',
      line: 3,
    });
  });

  test('ignores an anchor on an intermediate metadata line', () => {
    const lines = [
      'TODO task',
      'SCHEDULED: <2026-11-23 Mon> ^middle',
      'DESCRIPTION: details',
    ];
    expect(findTaskBlockAnchor(lines, 0, '')).toBeNull();
  });

  test('ignores metadata separated by a blank line for anchoring', () => {
    const lines = ['TODO task', '', 'SCHEDULED: <2026-11-23 Mon> ^blockend'];
    expect(findTaskBlockAnchor(lines, 0, '')).toBeNull();
  });

  test('ignores an anchor on a continuation prose line', () => {
    const lines = ['TODO task', '  Continuation prose. ^prose'];
    expect(findTaskBlockAnchor(lines, 0, '')).toBeNull();
  });
});
