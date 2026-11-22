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

function setup(tasks: Task[]) {
  const state = new TaskStateManager(createTestKeywordManager());
  state.setTasks(tasks);
  return { engine: new TaskDependencyManager(state), state };
}

describe('previous-sibling relation', () => {
  it('resolves the immediately preceding sibling and follows its state', () => {
    const { engine, state } = setup([
      task({ path: 'org.org', line: 0, text: 'First', state: 'TODO' }),
      task({
        path: 'org.org',
        line: 1,
        text: 'Second',
        state: 'TODO',
        blockedBy: ['previous-sibling'],
      }),
    ]);
    expect(engine.isBlocked('org.org:1')).toBe(true);

    state.updateTaskByPathAndLine('org.org', 0, {
      state: 'DONE',
      completed: true,
    });
    expect(engine.isBlocked('org.org:1')).toBe(false);
  });

  it('does not treat the reserved token as a literal ID', () => {
    const { engine } = setup([
      task({
        path: 'a.org',
        line: 0,
        id: 'previous-sibling',
        state: 'TODO',
      }),
      task({
        path: 'b.org',
        line: 0,
        blockedBy: ['previous-sibling'],
        state: 'TODO',
      }),
    ]);
    expect(engine.isBlocked('b.org:0')).toBe(true);
    expect(engine.getBlockingReasons('b.org:0')[0].code).toBe(
      'missing-reference',
    );
  });

  it('resolves mixed sibling and ID references independently', () => {
    const { engine } = setup([
      task({
        path: 'a.org',
        line: 0,
        text: 'First',
        state: 'DONE',
        completed: true,
      }),
      task({
        path: 'a.org',
        line: 1,
        id: 'second',
        text: 'Second',
        state: 'TODO',
        blockedBy: ['external'],
      }),
      task({ path: 'other.org', line: 0, id: 'external', state: 'TODO' }),
      task({
        path: 'a.org',
        line: 2,
        text: 'Third',
        state: 'TODO',
        blockedBy: ['previous-sibling', 'external'],
      }),
    ]);
    expect(engine.isBlocked('a.org:2')).toBe(true);
    expect(
      engine.getBlockers('a.org:2').map((blocker) => blocker.path),
    ).toEqual(['a.org', 'other.org']);
  });
});
