import { Search } from '../src/search/search';
import { KeywordManager } from '../src/utils/keyword-manager';
import { Task } from '../src/types/task';
import { createBaseTask, createBaseSettings } from './helpers/test-helper';

const settings = createBaseSettings({
  additionalActiveKeywords: ['NEXT'],
  additionalWaitingKeywords: ['HOLD'],
});

const keywordManager = new KeywordManager(settings);
const activeState = keywordManager.getKeywordsForGroup('activeKeywords')[0];
const waitingState = keywordManager.getKeywordsForGroup('waitingKeywords')[0];
const completedState =
  keywordManager.getKeywordsForGroup('completedKeywords')[0];

function stateTask(state: string, line: number): Task {
  return createBaseTask({
    path: 'notes/states.md',
    line,
    rawText: `- [ ] ${state} task`,
    text: `${state} task`,
    state,
    completed: state === completedState,
  });
}

const tasks: Task[] = [
  stateTask(activeState, 0),
  stateTask(waitingState, 1),
  stateTask(completedState, 2),
  stateTask('NEXT', 3),
  stateTask('HOLD', 4),
  stateTask('ACTIVE', 5),
  stateTask('LATER', 6),
];

function lines(result: Task[]): number[] {
  return result.map((task) => task.line);
}

describe('state group search batches', () => {
  it('matches the same group membership as per-row evaluation', async () => {
    for (const query of [
      'state:active',
      'state:waiting',
      'state:completed',
      'state:active OR state:completed',
      'state:active -DONE',
    ]) {
      const bulk = await Search.filterTasks(tasks, query, false, settings);
      const perRow: Task[] = [];
      for (const task of tasks) {
        if (await Search.evaluate(query, task, false, settings)) {
          perRow.push(task);
        }
      }
      expect(lines(bulk)).toEqual(lines(perRow));
    }
  });

  it('keeps custom keywords and uppercase ACTIVE literal distinct', async () => {
    const active = lines(
      await Search.filterTasks(tasks, 'state:active', false, settings),
    );
    expect(active).toContain(0);
    expect(active).toContain(3);
    expect(active).not.toContain(5);

    const waiting = lines(
      await Search.filterTasks(tasks, 'state:waiting', false, settings),
    );
    expect(waiting).toContain(1);
    expect(waiting).toContain(4);

    expect(
      lines(await Search.filterTasks(tasks, 'state:ACTIVE', false, settings)),
    ).toEqual([5]);
  });

  it('resolves each query group once for a large batch', async () => {
    const spy = jest.spyOn(KeywordManager, 'getKeywordsForGroup');
    const many = Array.from({ length: 500 }, (_, index) =>
      stateTask(index % 2 === 0 ? activeState : completedState, index),
    );

    const result = await Search.filterTasks(
      many,
      'state:active OR state:completed',
      false,
      settings,
    );

    expect(result).toHaveLength(500);
    // Two distinct groups may be resolved, never once per row.
    expect(spy.mock.calls.length).toBeLessThanOrEqual(2);
    spy.mockRestore();
  });

  it('re-resolves after settings changes between batches', async () => {
    const mutable = {
      ...settings,
      additionalActiveKeywords: ['NEXT'],
    };
    const withNext = lines(
      await Search.filterTasks(tasks, 'state:active', false, mutable),
    );
    expect(withNext).toContain(3);

    mutable.additionalActiveKeywords = ['LATER'];
    const withoutNext = lines(
      await Search.filterTasks(tasks, 'state:active', false, mutable),
    );
    expect(withoutNext).not.toContain(3);
    expect(withoutNext).toContain(6);
  });
});
