import { EditorState } from '@codemirror/state';
import { findPropertyDrawerFoldRange } from '../src/utils/property-drawer-fold';

const isTaskLine = (line: string): boolean => /\bTODO\b/.test(line);

const stateFor = (lines: string[]): EditorState =>
  EditorState.create({ doc: lines.join('\n') });

const foldAtLine = (
  state: EditorState,
  lineNumber: number,
  predicate: typeof isTaskLine | null = isTaskLine,
) => {
  const header = state.doc.line(lineNumber);
  return findPropertyDrawerFoldRange(state, header.from, predicate);
};

describe('property drawer folding', () => {
  it('finds a closed non-empty drawer under a task', () => {
    const state = stateFor([
      'TODO task',
      ':PROPERTIES:',
      ':ID: paper-01',
      ':END:',
      'after',
    ]);

    expect(foldAtLine(state, 2)).toEqual({
      from: state.doc.line(2).to,
      to: state.doc.line(4).to,
    });
  });

  it('keeps the :PROPERTIES: header visible', () => {
    const state = stateFor([
      'TODO task',
      ':PROPERTIES:',
      ':ID: paper-01',
      ':END:',
    ]);
    const header = state.doc.line(2);

    expect(foldAtLine(state, 2)?.from).toBe(header.to);
    expect(foldAtLine(state, 2)?.from).not.toBe(header.from);
  });

  it('does not fold an unclosed drawer', () => {
    const state = stateFor([
      'TODO task',
      ':PROPERTIES:',
      ':ID: paper-01',
      'after',
    ]);

    expect(foldAtLine(state, 2)).toBeNull();
  });

  it('does not fold an empty drawer', () => {
    const state = stateFor(['TODO task', ':PROPERTIES:', ':END:']);

    expect(foldAtLine(state, 2)).toBeNull();
  });

  it('does not fold a standalone drawer', () => {
    const state = stateFor([
      'Prose above',
      ':PROPERTIES:',
      ':ID: standalone-01',
      ':END:',
    ]);

    expect(foldAtLine(state, 2)).toBeNull();
  });

  it('does not fold when the task is more than 60 lines above', () => {
    const state = stateFor([
      'TODO task',
      ...Array.from({ length: 61 }, () => ''),
      ':PROPERTIES:',
      ':ID: far-away',
      ':END:',
    ]);

    expect(foldAtLine(state, 63)).toBeNull();
  });

  it('skips date and description lines when finding the owner', () => {
    const state = stateFor([
      'TODO task',
      'SCHEDULED: <2026-11-23 Mon>',
      'DEADLINE: <2026-11-30 Mon>',
      'CLOSED: [2026-11-23 Mon]',
      'STARTED: [2026-11-20 Thu]',
      'DESCRIPTION: A task with metadata',
      ':PROPERTIES:',
      ':ID: paper-01',
      ':END:',
    ]);

    expect(foldAtLine(state, 7)).toEqual({
      from: state.doc.line(7).to,
      to: state.doc.line(9).to,
    });
  });

  it('supports indented and quoted drawers', () => {
    const indented = stateFor([
      '  TODO Indented task',
      '  :PROPERTIES:',
      '  :ID: indented-01',
      '  :END:',
      'after',
    ]);
    const quoted = stateFor([
      '> TODO Quoted task',
      '> :PROPERTIES:',
      '> :ID: quoted-01',
      '> :END:',
      '> after',
    ]);

    expect(foldAtLine(indented, 2)).toEqual({
      from: indented.doc.line(2).to,
      to: indented.doc.line(4).to,
    });
    expect(foldAtLine(quoted, 2)).toEqual({
      from: quoted.doc.line(2).to,
      to: quoted.doc.line(4).to,
    });
  });

  it('folds through an anchored :END: line', () => {
    const state = stateFor([
      'TODO task',
      ':PROPERTIES:',
      ':ID: anchored-01',
      ':END: ^todo-anchor',
      'after',
    ]);

    expect(foldAtLine(state, 2)).toEqual({
      from: state.doc.line(2).to,
      to: state.doc.line(4).to,
    });
  });

  it('does not fold when no parser is available', () => {
    const state = stateFor([
      'TODO task',
      ':PROPERTIES:',
      ':ID: paper-01',
      ':END:',
    ]);

    expect(foldAtLine(state, 2, null)).toBeNull();
  });
});
