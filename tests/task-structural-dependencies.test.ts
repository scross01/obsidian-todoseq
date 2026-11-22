import { TaskDependencyManager } from '../src/services/task-dependency-manager';
import { TaskStateManager } from '../src/services/task-state-manager';
import { Task } from '../src/types/task';
import {
  createBaseTask,
  createTestKeywordManager,
} from './helpers/test-helper';

function task(overrides: Partial<Task>): Task {
  return createBaseTask(overrides);
}

function setup(tasks: Task[], settings = { hierarchy: true, checkbox: false }) {
  const state = new TaskStateManager(createTestKeywordManager());
  state.setTasks(tasks);
  return {
    engine: new TaskDependencyManager(state, {
      getStructuralSettings: () => settings,
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
