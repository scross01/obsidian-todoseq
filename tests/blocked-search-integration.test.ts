import { Search } from '../src/search/search';
import { SearchSuggestions } from '../src/search/search-suggestions';
import { SearchTokenizer } from '../src/search/search-tokenizer';
import { TaskDependencyManager } from '../src/services/task-dependency-manager';
import { TaskStateManager } from '../src/services/task-state-manager';
import { Task } from '../src/types/task';
import { DashboardAggregator } from '../src/view/embedded-dashboard/aggregation';
import { TodoseqDashboardParser } from '../src/view/embedded-dashboard/dashboard-parser';
import {
  createBaseSettings,
  createBaseTask,
  createTestKeywordManager,
} from './helpers/test-helper';

function makeTask(overrides: Partial<Task>): Task {
  return createBaseTask(overrides);
}

function setup() {
  const keywordManager = createTestKeywordManager();
  const state = new TaskStateManager(keywordManager);
  const tasks = [
    makeTask({
      path: 'blocked.md',
      line: 0,
      id: 'blocked',
      text: 'Blocked',
      state: 'TODO',
      blockedBy: ['prereq'],
    }),
    makeTask({
      path: 'prereq.md',
      line: 0,
      id: 'prereq',
      text: 'Prerequisite',
      state: 'TODO',
    }),
    makeTask({
      path: 'free.md',
      line: 0,
      id: 'free',
      text: 'Free',
      state: 'TODO',
    }),
    makeTask({
      path: 'done.md',
      line: 0,
      id: 'done',
      text: 'Done',
      state: 'DONE',
      completed: true,
      blockedBy: ['prereq'],
    }),
  ];
  state.setTasks(tasks);
  return {
    engine: new TaskDependencyManager(state),
    state,
    tasks,
    settings: createBaseSettings(),
    keywordManager,
  };
}

describe('blocked: search integration', () => {
  it('tokenizes only the closed lowercase boolean forms as a prefix value', () => {
    expect(SearchTokenizer.tokenize('blocked:true')[0]).toEqual(
      expect.objectContaining({ type: 'prefix', value: 'blocked' }),
    );
    expect(SearchTokenizer.tokenize('blocked:true')[1]).toEqual(
      expect.objectContaining({ type: 'prefix_value', value: 'true' }),
    );
    expect(SearchTokenizer.tokenize('blocked')).toEqual([
      expect.objectContaining({ type: 'word', value: 'blocked' }),
    ]);
  });

  it('rejects invalid, uppercase, quoted and empty values', () => {
    for (const query of [
      'blocked:',
      'blocked:yes',
      'blocked:TRUE',
      'blocked:"true"',
    ]) {
      expect(Search.getError(query)).not.toBeNull();
    }
    expect(Search.getError('blocked:true')).toBeNull();
  });

  it('matches blocked and unblocked tasks through row and bulk evaluation', async () => {
    const { engine, tasks, settings } = setup();
    const blockedTask = tasks[0];
    const freeTask = tasks[2];
    const doneTask = tasks[3];

    expect(
      await Search.evaluate(
        'blocked:true',
        blockedTask,
        false,
        settings,
        undefined,
        engine,
      ),
    ).toBe(true);
    expect(
      await Search.evaluate(
        'blocked:false',
        freeTask,
        false,
        settings,
        undefined,
        engine,
      ),
    ).toBe(true);
    expect(
      await Search.evaluate(
        'blocked:false',
        doneTask,
        false,
        settings,
        undefined,
        engine,
      ),
    ).toBe(true);

    expect(
      await Search.filterTasks(
        tasks,
        'blocked:true',
        false,
        settings,
        undefined,
        engine,
      ),
    ).toEqual([blockedTask]);
    expect(
      await Search.filterTasks(
        tasks,
        'blocked:false',
        false,
        settings,
        undefined,
        engine,
      ),
    ).toEqual([tasks[1], freeTask, doneTask]);
  });

  it('composes with state filters, negation and OR', async () => {
    const { engine, tasks, settings } = setup();
    const run = (query: string) =>
      Search.filterTasks(tasks, query, false, settings, undefined, engine);

    expect(await run('state:TODO blocked:true')).toEqual([tasks[0]]);
    expect(await run('-blocked:true')).toEqual([tasks[1], tasks[2], tasks[3]]);
    expect(await run('blocked:true OR state:DONE')).toEqual([
      tasks[0],
      tasks[3],
    ]);
  });

  it('treats pending validation as blocked and refreshes after completion', async () => {
    const { engine, state, tasks, settings } = setup();
    engine.setValidationReady(false);
    expect(
      await Search.filterTasks(
        tasks,
        'blocked:true',
        false,
        settings,
        undefined,
        engine,
      ),
    ).toEqual([tasks[0]]);

    engine.setValidationReady(true);
    state.updateTaskByPathAndLine('prereq.md', 0, {
      completed: true,
      state: 'DONE',
    });
    expect(
      await Search.filterTasks(
        tasks,
        'blocked:true',
        false,
        settings,
        undefined,
        engine,
      ),
    ).toEqual([]);
  });

  it('fails closed when a blocked query has no dependency snapshot', async () => {
    const { tasks, settings } = setup();
    expect(
      await Search.filterTasks(tasks, 'blocked:true', false, settings),
    ).toEqual([]);
    expect(
      await Search.evaluate('blocked:true', tasks[0], false, settings),
    ).toBe(false);
  });

  it('offers true and false suggestions', () => {
    expect(SearchSuggestions.getBlockedOptions()).toEqual(['true', 'false']);
  });

  it('aggregates a blocked dashboard and composes click-through filters', async () => {
    const { engine, settings, keywordManager, tasks } = setup();
    expect(TodoseqDashboardParser.parse('group-by: blocked').groupBy).toBe(
      'blocked',
    );
    const aggregator = new DashboardAggregator(
      settings,
      keywordManager,
      null,
      engine,
    );
    const result = await aggregator.aggregate(tasks, {
      groupBy: 'blocked',
      showEmpty: true,
    });
    expect(result.groups).toEqual([
      expect.objectContaining({
        key: 'blocked:true',
        label: 'Blocked',
        count: 1,
        filter: 'blocked:true',
      }),
      expect.objectContaining({
        key: 'blocked:false',
        label: 'Unblocked',
        count: 3,
        filter: 'blocked:false',
      }),
    ]);

    const supplied = await aggregator.aggregate(tasks, {
      groupBy: 'blocked',
      searchQuery: 'state:TODO OR state:DONE',
      showEmpty: true,
    });
    expect(supplied.groups.map((group) => group.count)).toEqual([1, 3]);
  });
});
