import { TaskDependencyManager } from '../src/services/task-dependency-manager';
import { TaskStateManager } from '../src/services/task-state-manager';
import { Task } from '../src/types/task';
import type { StructuralEntry } from '../src/types/task-structure';
import {
  createBaseTask,
  createTestKeywordManager,
} from './helpers/test-helper';

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

function setup(
  tasks: Task[],
  settings = { hierarchy: true, checkbox: false },
  entries: Map<string, readonly StructuralEntry[]> = new Map(),
) {
  const state = new TaskStateManager(createTestKeywordManager());
  state.setTasks(tasks);
  return {
    engine: new TaskDependencyManager(state, {
      getStructuralSettings: () => settings,
      getStructureEntries: () => entries,
      getStructureRevision: () => 1,
    }),
    state,
  };
}

describe('opt-in structural dependencies', () => {
  it('blocks a parent while an indented child is unfinished', () => {
    const { engine } = setup([
      task({ path: 'tree.md', line: 0, text: 'Parent', state: 'TODO' }),
      task({
        path: 'tree.md',
        line: 1,
        indent: '  ',
        text: 'Child',
        state: 'TODO',
      }),
    ]);
    expect(engine.isBlocked('tree.md:0')).toBe(true);
    expect(engine.getBlockingReasons('tree.md:0')[0].code).toBe('structural');

    const disabled = setup(
      [
        task({ path: 'tree.md', line: 0, text: 'Parent', state: 'TODO' }),
        task({
          path: 'tree.md',
          line: 1,
          indent: '  ',
          text: 'Child',
          state: 'TODO',
        }),
      ],
      { hierarchy: false, checkbox: false },
    );
    expect(disabled.engine.isBlocked('tree.md:0')).toBe(false);
  });

  it('tracks ORDERED on the previous sibling', () => {
    const { engine } = setup([
      task({
        path: 'tree.md',
        line: 0,
        text: 'First',
        state: 'TODO',
        ordered: true,
      }),
      task({ path: 'tree.md', line: 1, text: 'Second', state: 'TODO' }),
    ]);
    expect(engine.isBlocked('tree.md:1')).toBe(true);
    expect(engine.getBlockingReasons('tree.md:1')[0].message).toContain(
      'Ordered after First',
    );
  });

  it('makes every later sibling wait for an incomplete ORDERED task', () => {
    const { engine } = setup([
      task({
        path: 'tree.md',
        line: 0,
        text: 'First',
        state: 'TODO',
        ordered: true,
      }),
      task({ path: 'tree.md', line: 1, text: 'Second', state: 'TODO' }),
      task({ path: 'tree.md', line: 2, text: 'Third', state: 'TODO' }),
    ]);

    expect(engine.isBlocked('tree.md:2')).toBe(true);
    expect(engine.getBlockingReasons('tree.md:2')[0].message).toContain(
      'Ordered after First',
    );
  });

  it('picks up a structural settings change after invalidation', () => {
    const settings = { hierarchy: true, checkbox: false };
    const state = new TaskStateManager(createTestKeywordManager());
    state.setTasks([
      task({ path: 'tree.md', line: 0, text: 'Parent', state: 'TODO' }),
      task({
        path: 'tree.md',
        line: 1,
        indent: '  ',
        text: 'Child',
        state: 'TODO',
      }),
    ]);
    const engine = new TaskDependencyManager(state, {
      getStructuralSettings: () => settings,
    });
    expect(engine.isBlocked('tree.md:0')).toBe(true);

    settings.hierarchy = false;
    engine.clearCache();

    expect(engine.isBlocked('tree.md:0')).toBe(false);
  });

  it('applies checkbox reasons independently of hierarchy', () => {
    const { engine } = setup(
      [
        task({ path: 'tree.md', line: 0, text: 'Parent', state: 'TODO' }),
        task({
          path: 'tree.md',
          line: 1,
          indent: '  ',
          text: 'Child',
          rawText: '- [ ] TODO Child',
          state: 'TODO',
        }),
      ],
      { hierarchy: false, checkbox: true },
    );
    expect(engine.isBlocked('tree.md:0')).toBe(true);
    expect(engine.getBlockingReasons('tree.md:0')[0].code).toBe('checkbox');
  });

  it('does not pass ancestry through a non-task heading', () => {
    const { engine } = setup(
      [
        task({
          path: 'tree.md',
          line: 0,
          headingLevel: 1,
          text: 'Launch',
          state: 'TODO',
        }),
        task({
          path: 'tree.md',
          line: 2,
          indent: '  ',
          text: 'Gather',
          state: 'TODO',
        }),
      ],
      { hierarchy: true, checkbox: false },
      new Map([
        [
          'tree.md',
          [entry({ line: 1, headingLevel: 2, text: 'Research' })],
        ],
      ]),
    );
    expect(engine.isBlocked('tree.md:0')).toBe(false);
  });

  it('lets a dedented prose line close an indented group', () => {
    const { engine } = setup(
      [
        task({ path: 'tree.md', line: 0, text: 'Parent', state: 'TODO' }),
        task({
          path: 'tree.md',
          line: 2,
          indent: '  ',
          text: 'Child',
          state: 'TODO',
        }),
      ],
      { hierarchy: true, checkbox: false },
      new Map([
        [
          'tree.md',
          [entry({ kind: 'prose', line: 1, indent: '', indentLength: 0 })],
        ],
      ]),
    );
    expect(engine.isBlocked('tree.md:0')).toBe(false);
  });

  it('blocks an ancestor on an unchecked keywordless checkbox', () => {
    const { engine } = setup(
      [task({ path: 'tree.md', line: 0, text: 'Parent', state: 'TODO' })],
      { hierarchy: false, checkbox: true },
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
    expect(engine.isBlocked('tree.md:0')).toBe(true);
    expect(engine.getBlockingReasons('tree.md:0')[0].code).toBe('checkbox');
  });

  it('does not order tasks across a non-task heading', () => {
    const { engine } = setup(
      [
        task({
          path: 'tree.md',
          line: 0,
          text: 'First',
          state: 'TODO',
          ordered: true,
        }),
        task({ path: 'tree.md', line: 2, text: 'Second', state: 'TODO' }),
      ],
      { hierarchy: true, checkbox: false },
      new Map([
        ['tree.md', [entry({ line: 1, headingLevel: 2, text: 'Notes' })]],
      ]),
    );
    expect(engine.isBlocked('tree.md:2')).toBe(false);
  });

  it('keeps archived branches out of outer structural obligations', () => {
    const { engine } = setup(
      [
        task({ path: 'tree.md', line: 0, text: 'Outer', state: 'TODO' }),
        task({
          path: 'tree.md',
          line: 2,
          indent: '    ',
          text: 'Grandchild',
          state: 'TODO',
        }),
      ],
      { hierarchy: true, checkbox: false },
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
    expect(engine.isBlocked('tree.md:0')).toBe(false);
  });

  it('scopes Org checkbox dependencies to the current entry body', () => {
    const { engine } = setup(
      [
        task({
          path: 'tree.org',
          line: 0,
          text: 'Parent',
          state: 'TODO',
          sourceFormat: 'org',
          quoteNestingLevel: 1,
        }),
        task({
          path: 'tree.org',
          line: 2,
          text: 'Child',
          state: 'TODO',
          sourceFormat: 'org',
          quoteNestingLevel: 2,
        }),
      ],
      { hierarchy: false, checkbox: true },
      new Map([
        [
          'tree.org',
          [
            entry({ path: 'tree.org', line: 0, headingLevel: 1, text: 'TODO Parent' }),
            entry({
              path: 'tree.org',
              kind: 'checkbox',
              line: 1,
              indent: '  ',
              indentLength: 2,
              checked: true,
            }),
            entry({ path: 'tree.org', line: 2, headingLevel: 2, text: 'TODO Child' }),
            entry({
              path: 'tree.org',
              kind: 'checkbox',
              line: 3,
              indent: '   ',
              indentLength: 3,
              checked: false,
            }),
          ],
        ],
      ]),
    );

    expect(engine.isBlocked('tree.org:0')).toBe(false);
    expect(engine.isBlocked('tree.org:2')).toBe(true);
    expect(engine.getBlockingReasons('tree.org:2')[0].code).toBe('checkbox');
  });

  it('honours local NOBLOCKING, including broken explicit references', () => {
    const { engine } = setup([
      task({
        path: 'tree.md',
        line: 0,
        text: 'Parent',
        state: 'TODO',
        blockedBy: ['missing'],
      }),
      task({
        path: 'tree.md',
        line: 1,
        indent: '  ',
        text: 'Child',
        state: 'TODO',
      }),
      task({
        path: 'tree.md',
        line: 2,
        text: 'Never blocked',
        state: 'TODO',
        noblocking: true,
        blockedBy: ['missing'],
      }),
    ]);
    expect(engine.isBlocked('tree.md:0')).toBe(true);
    expect(engine.isBlocked('tree.md:2')).toBe(false);
    expect(engine.getBlockingReasons('tree.md:2')).toEqual([]);
  });
});
