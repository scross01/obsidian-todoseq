import { buildTaskStructure } from '../src/utils/task-structure';
import { Task } from '../src/types/task';
import type { StructuralEntry } from '../src/types/task-structure';
import { createBaseTask } from './helpers/test-helper';

function task(overrides: Partial<Task>): Task {
  return createBaseTask(overrides);
}

function entry(overrides: Partial<StructuralEntry>): StructuralEntry {
  return {
    kind: 'heading',
    path: 'tree.md',
    line: 0,
    indent: '',
    indentLength: 0,
    quotePrefix: '',
    ...overrides,
  };
}

describe('task structure boundaries', () => {
  it('does not bridge ancestry across a non-task heading', () => {
    const structure = buildTaskStructure(
      [
        task({ path: 'tree.md', line: 0, headingLevel: 1, text: 'Launch' }),
        task({ path: 'tree.md', line: 4, text: 'Gather' }),
      ],
      new Map([
        [
          'tree.md',
          [entry({ line: 2, headingLevel: 2, text: 'Research' })],
        ],
      ]),
    );

    expect(structure.parentByKey.has('tree.md:4')).toBe(false);
    expect(structure.previousSiblingByKey.has('tree.md:4')).toBe(false);
  });

  it('closes an indented group at dedented prose but not at blank lines', () => {
    const tasks = [
      task({ path: 'tree.md', line: 0, text: 'Parent' }),
      task({ path: 'tree.md', line: 2, indent: '  ', text: 'Child' }),
    ];

    expect(
      buildTaskStructure(tasks).parentByKey.get('tree.md:2'),
    ).toBe('tree.md:0');

    const closed = buildTaskStructure(
      tasks,
      new Map([
        [
          'tree.md',
          [entry({ kind: 'prose', line: 1, indent: '', indentLength: 0 })],
        ],
      ]),
    );
    expect(closed.parentByKey.has('tree.md:2')).toBe(false);
  });

  it('keeps a group open when prose is deeper than the parent', () => {
    const structure = buildTaskStructure(
      [
        task({ path: 'tree.md', line: 0, text: 'Parent' }),
        task({ path: 'tree.md', line: 2, indent: '  ', text: 'Child' }),
      ],
      new Map([
        [
          'tree.md',
          [
            entry({
              kind: 'prose',
              line: 1,
              indent: '    ',
              indentLength: 4,
            }),
          ],
        ],
      ]),
    );
    expect(structure.parentByKey.get('tree.md:2')).toBe('tree.md:0');
  });

  it('attaches keywordless checkboxes to their structural parent', () => {
    const structure = buildTaskStructure(
      [task({ path: 'tree.md', line: 0, text: 'Parent' })],
      new Map([
        [
          'tree.md',
          [
            entry({
              kind: 'checkbox',
              line: 1,
              indent: '  ',
              indentLength: 2,
              checked: false,
            }),
          ],
        ],
      ]),
    );
    expect(
      structure.checkboxEntriesByParentKey.get('tree.md:0'),
    ).toHaveLength(1);
  });

  it('treats an archived branch as a boundary', () => {
    const structure = buildTaskStructure(
      [
        task({ path: 'tree.md', line: 0, text: 'Outer' }),
        task({
          path: 'tree.md',
          line: 2,
          indent: '    ',
          text: 'Grandchild',
        }),
      ],
      new Map([
        [
          'tree.md',
          [
            entry({
              kind: 'archived',
              line: 1,
              indent: '  ',
              indentLength: 2,
              archived: true,
            }),
          ],
        ],
      ]),
    );
    expect(structure.parentByKey.has('tree.md:2')).toBe(false);
  });

  it('does not create a previous sibling across a non-task heading', () => {
    const structure = buildTaskStructure(
      [
        task({ path: 'tree.md', line: 0, text: 'First' }),
        task({ path: 'tree.md', line: 2, text: 'Second' }),
      ],
      new Map([
        ['tree.md', [entry({ line: 1, headingLevel: 2, text: 'Notes' })]],
      ]),
    );
    expect(structure.previousSiblingByKey.has('tree.md:2')).toBe(false);
    expect(structure.groupByKey.get('tree.md:0')).not.toBe(
      structure.groupByKey.get('tree.md:2'),
    );
  });
});
