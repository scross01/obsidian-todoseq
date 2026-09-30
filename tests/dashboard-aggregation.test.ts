/**
 * Unit tests for the dashboard aggregation engine (plan 020 Step 1).
 *
 * Pure tests: no DOM, no Obsidian-specific setup. The obsidian module is
 * mapped to __mocks__/obsidian.ts by jest; the aggregator itself only
 * touches Search/KeywordManager, both safe under the mock.
 */
import {
  DashboardAggregator,
  composeFilterQuery,
  LATER_FILTER,
  NEXT_7_DAYS_BUCKET_FILTER,
  WINDOW_BUCKET_FILTERS,
  DashboardAggregationParams,
  DashboardResult,
} from '../src/view/embedded-dashboard/aggregation';
import { Search } from '../src/search/search';
import { Task } from '../src/types/task';
import {
  createBaseTask,
  createBaseSettings,
  createTestKeywordManager,
  createDate,
} from './helpers/test-helper';
import { TodoTrackerSettings } from '../src/settings/settings-types';

/** Local-midnight date `offset` days from today (timezone-independent). */
function dayOffset(offset: number): Date {
  const now = new Date();
  return createDate(
    now.getFullYear(),
    now.getMonth() + 1,
    now.getDate() + offset,
  );
}

/** Local 'YYYY-MM-DD' key for a date (matches the aggregator's day keys). */
function toDateKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function makeTask(overrides: Partial<Task>): Task {
  return createBaseTask(overrides);
}

describe('DashboardAggregator', () => {
  let settings: TodoTrackerSettings;

  beforeEach(() => {
    settings = createBaseSettings();
  });

  const makeAggregator = (
    overrides: Partial<TodoTrackerSettings> = {},
  ): DashboardAggregator => {
    const s = { ...settings, ...overrides };
    return new DashboardAggregator(s, createTestKeywordManager(overrides));
  };

  describe('priority grouping', () => {
    it('buckets by task.priority in fixed order and drops zero groups', async () => {
      const aggregator = makeAggregator();
      const tasks = [
        makeTask({ path: 'a.md', line: 0, priority: 'high' }),
        makeTask({ path: 'a.md', line: 1, priority: 'high' }),
        makeTask({ path: 'a.md', line: 2, priority: 'med' }),
        makeTask({ path: 'a.md', line: 3, priority: null }),
        makeTask({ path: 'a.md', line: 4, priority: null }),
        makeTask({ path: 'a.md', line: 5, priority: null }),
      ];

      const result = await aggregator.aggregate(tasks, { groupBy: 'priority' });

      expect(result.total).toBe(6);
      expect(result.overlapsTotal).toBe(false);
      // Low has zero count and is dropped by default
      expect(result.groups.map((g) => g.key)).toEqual([
        'priority:high',
        'priority:medium',
        'priority:none',
      ]);
      expect(result.groups.map((g) => g.count)).toEqual([2, 1, 3]);
      expect(result.groups.map((g) => g.label)).toEqual([
        'High',
        'Medium',
        'None',
      ]);
      expect(result.groups.map((g) => g.filter)).toEqual([
        'priority:high',
        'priority:medium',
        'priority:none',
      ]);
    });

    it('emits zero-count buckets when show-empty is set', async () => {
      const aggregator = makeAggregator();
      const tasks = [
        makeTask({ path: 'a.md', line: 0, priority: 'high' }),
        makeTask({ path: 'a.md', line: 1, priority: null }),
      ];

      const result = await aggregator.aggregate(tasks, {
        groupBy: 'priority',
        showEmpty: true,
      });

      expect(result.groups.map((g) => g.key)).toEqual([
        'priority:high',
        'priority:medium',
        'priority:low',
        'priority:none',
      ]);
      expect(result.groups.map((g) => g.count)).toEqual([1, 0, 0, 1]);
    });
  });

  describe('state grouping', () => {
    it('counts the four settings groups plus archived, exhaustive over total', async () => {
      const aggregator = makeAggregator();
      const tasks = [
        makeTask({ path: 'a.md', line: 0, state: 'TODO' }),
        makeTask({ path: 'a.md', line: 1, state: 'TODO' }),
        makeTask({ path: 'a.md', line: 2, state: 'DOING' }),
        makeTask({ path: 'a.md', line: 3, state: 'WAIT' }),
        makeTask({ path: 'a.md', line: 4, state: 'DONE' }),
        makeTask({ path: 'a.md', line: 5, state: 'DONE' }),
        makeTask({ path: 'a.md', line: 6, state: 'ARCHIVED' }),
      ];

      const result = await aggregator.aggregate(tasks, { groupBy: 'state' });

      expect(result.total).toBe(7);
      expect(result.groups.map((g) => g.key)).toEqual([
        'state:active',
        'state:inactive',
        'state:waiting',
        'state:completed',
        'state:archived',
      ]);
      expect(result.groups.map((g) => g.count)).toEqual([1, 2, 1, 2, 1]);
      // sum(counts) == total — the archived wrinkle keeps grouping exhaustive
      const sum = result.groups.reduce((acc, g) => acc + g.count, 0);
      expect(sum).toBe(result.total);
    });

    it('builds the archived filter from OR-joined individual keywords', async () => {
      const aggregator = makeAggregator({
        additionalArchivedKeywords: ['SHIPPED'],
      });
      const archived = makeTask({ path: 'a.md', line: 0, state: 'ARCHIVED' });
      const shipped = makeTask({ path: 'a.md', line: 1, state: 'SHIPPED' });
      const active = makeTask({ path: 'a.md', line: 2, state: 'DOING' });

      const result = await aggregator.aggregate([archived, shipped, active], {
        groupBy: 'state',
      });

      const archivedGroup = result.groups.find(
        (g) => g.key === 'state:archived',
      );
      expect(archivedGroup).toBeDefined();
      expect(archivedGroup?.filter).toBe('state:ARCHIVED OR state:SHIPPED');
      expect(archivedGroup?.count).toBe(2);

      // The OR-joined filter must actually resolve through the evaluator —
      // individual keywords resolve where the group name does not.
      expect(
        await Search.evaluate(
          archivedGroup?.filter ?? '',
          archived,
          false,
          settings,
        ),
      ).toBe(true);
      expect(
        await Search.evaluate(
          archivedGroup?.filter ?? '',
          shipped,
          false,
          settings,
        ),
      ).toBe(true);
      expect(
        await Search.evaluate(
          archivedGroup?.filter ?? '',
          active,
          false,
          settings,
        ),
      ).toBe(false);
    });

    it('uses KeywordManager so custom keywords land in the right group', async () => {
      const customSettings = createBaseSettings({
        additionalActiveKeywords: ['WIP'],
      });
      const aggregator = new DashboardAggregator(
        customSettings,
        createTestKeywordManager({ additionalActiveKeywords: ['WIP'] }),
      );
      const wip = makeTask({ path: 'a.md', line: 0, state: 'WIP' });
      const todo = makeTask({ path: 'a.md', line: 1, state: 'TODO' });

      const result = await aggregator.aggregate([wip, todo], {
        groupBy: 'state',
      });

      const active = result.groups.find((g) => g.key === 'state:active');
      expect(active?.count).toBe(1);
      // The dashboard count and the Task List filter agree for custom keywords
      expect(
        await Search.evaluate('state:active', wip, false, customSettings),
      ).toBe(true);
    });
  });

  describe('keyword grouping', () => {
    const keywordTasks = (): Task[] => [
      makeTask({ path: 'a.md', line: 0, state: 'TODO' }),
      makeTask({ path: 'a.md', line: 1, state: 'TODO' }),
      makeTask({ path: 'a.md', line: 2, state: 'DOING' }),
      makeTask({ path: 'a.md', line: 3, state: 'DONE' }),
      makeTask({ path: 'a.md', line: 4, state: 'WAIT' }),
      // Stray: not a settings keyword — sorts after known keywords
      makeTask({ path: 'a.md', line: 5, state: 'FIXME' }),
    ];

    it('orders by settings keyword order, then strays alphabetically', async () => {
      const aggregator = makeAggregator();
      const result = await aggregator.aggregate(keywordTasks(), {
        groupBy: 'keyword',
        sort: 'fixed',
      });

      expect(result.groups.map((g) => g.label)).toEqual([
        'DOING',
        'TODO',
        'WAIT',
        'DONE',
        'FIXME',
      ]);
      expect(result.groups.map((g) => g.count)).toEqual([1, 2, 1, 1, 1]);
      expect(result.groups.every((g) => g.filter === `state:${g.label}`)).toBe(
        true,
      );
    });

    it('defaults to count-desc for keyword grouping', async () => {
      const aggregator = makeAggregator();
      const result = await aggregator.aggregate(keywordTasks(), {
        groupBy: 'keyword',
      });

      expect(result.groups.map((g) => g.label)).toEqual([
        'TODO',
        'DOING',
        'DONE',
        'FIXME',
        'WAIT',
      ]);
    });

    it('truncates to max-groups with an N-more tail entry', async () => {
      const aggregator = makeAggregator();
      const result = await aggregator.aggregate(keywordTasks(), {
        groupBy: 'keyword',
        sort: 'fixed',
        maxGroups: 2,
      });

      expect(result.groups).toHaveLength(3);
      expect(result.groups[0].label).toBe('DOING');
      expect(result.groups[1].label).toBe('TODO');
      const tail = result.groups[2];
      expect(tail.key).toBe('more');
      expect(tail.label).toBe('3 more');
      expect(tail.filter).toBe('');
    });

    it('resolves keyword filters through the evaluator', async () => {
      const aggregator = makeAggregator();
      const doing = makeTask({ path: 'a.md', line: 0, state: 'DOING' });
      expect(await Search.evaluate('state:DOING', doing, false, settings)).toBe(
        true,
      );
    });
  });

  describe('tag grouping', () => {
    const tagTasks = (): Task[] => [
      makeTask({ path: 'a.md', line: 0, tags: ['project', 'home'] }),
      makeTask({ path: 'a.md', line: 1, tags: ['project'] }),
      makeTask({ path: 'a.md', line: 2, tags: ['home'] }),
      makeTask({ path: 'a.md', line: 3, tags: ['A'] }), // priority tag
      makeTask({ path: 'a.md', line: 4, tags: [] }),
    ];

    it('counts per tag, excludes priority tags, flags overlapsTotal', async () => {
      const aggregator = makeAggregator();
      const result = await aggregator.aggregate(tagTasks(), {
        groupBy: 'tag',
      });

      expect(result.total).toBe(5);
      expect(result.overlapsTotal).toBe(true);
      // count-desc, ties broken by label; #A excluded
      expect(result.groups.map((g) => g.label)).toEqual(['#home', '#project']);
      expect(result.groups.map((g) => g.count)).toEqual([2, 2]);
      expect(result.groups.map((g) => g.filter)).toEqual([
        'tag:home',
        'tag:project',
      ]);
      // Column sums may exceed the card total for tags (overlap is expected)
      const sum = result.groups.reduce((acc, g) => acc + g.count, 0);
      expect(sum).toBe(4);
      expect(sum).not.toBe(result.total);
    });

    it('truncates tags to max-groups with an N-more tail', async () => {
      const aggregator = makeAggregator();
      const tasks = [
        makeTask({ path: 'a.md', line: 0, tags: ['alpha'] }),
        makeTask({ path: 'a.md', line: 1, tags: ['beta'] }),
        makeTask({ path: 'a.md', line: 2, tags: ['gamma'] }),
      ];
      const result = await aggregator.aggregate(tasks, {
        groupBy: 'tag',
        maxGroups: 1,
      });

      expect(result.groups).toHaveLength(2);
      expect(result.groups[0].label).toBe('#alpha');
      expect(result.groups[1].key).toBe('more');
      expect(result.groups[1].label).toBe('2 more');
    });
  });

  describe('scheduled/deadline buckets', () => {
    const bucketTasks = (): Task[] => [
      makeTask({ path: 'a.md', line: 0, scheduledDate: dayOffset(-2) }),
      makeTask({ path: 'a.md', line: 1, scheduledDate: dayOffset(-1) }),
      makeTask({ path: 'a.md', line: 2, scheduledDate: dayOffset(0) }),
      makeTask({ path: 'a.md', line: 3, scheduledDate: dayOffset(3) }),
      makeTask({ path: 'a.md', line: 4, scheduledDate: dayOffset(7) }),
      makeTask({ path: 'a.md', line: 5, scheduledDate: dayOffset(40) }),
      makeTask({ path: 'a.md', line: 6, scheduledDate: null }),
    ];

    it('assigns buckets evaluator-first-wins in urgency order', async () => {
      const aggregator = makeAggregator();
      const result = await aggregator.aggregate(bucketTasks(), {
        groupBy: 'scheduled',
      });

      expect(result.total).toBe(7);
      expect(result.groups.map((g) => g.label)).toEqual([
        'Overdue',
        'Due today',
        'Next 7 days',
        'Later',
        'No date',
      ]);
      expect(result.groups.map((g) => g.count)).toEqual([2, 1, 2, 1, 1]);
      // Property: exactly one bucket claims every matched task
      const sum = result.groups.reduce((acc, g) => acc + g.count, 0);
      expect(sum).toBe(result.total);
    });

    it('keeps every bucket filter consistent with its count via the evaluator', async () => {
      const aggregator = makeAggregator();
      const tasks = bucketTasks();
      const result = await aggregator.aggregate(tasks, {
        groupBy: 'scheduled',
      });

      for (const group of result.groups) {
        const matched = await Promise.all(
          tasks.map((task) =>
            Search.evaluate(group.filter, task, false, settings),
          ),
        );
        const evalCount = matched.filter(Boolean).length;
        expect(evalCount).toBe(group.count);
      }
    });

    it('works for the deadline field too', async () => {
      const aggregator = makeAggregator();
      const tasks = [
        makeTask({ path: 'a.md', line: 0, deadlineDate: dayOffset(-3) }),
        makeTask({ path: 'a.md', line: 1, deadlineDate: dayOffset(2) }),
        makeTask({ path: 'a.md', line: 2, deadlineDate: dayOffset(40) }),
        makeTask({ path: 'a.md', line: 3, deadlineDate: null }),
      ];
      const result = await aggregator.aggregate(tasks, {
        groupBy: 'deadline',
      });

      expect(result.groups.map((g) => g.count)).toEqual([1, 1, 1, 1]);
      expect(result.groups.map((g) => g.filter)).toEqual([
        'deadline:overdue',
        'deadline:"next 7 days" -deadline:today',
        LATER_FILTER('deadline'),
        'deadline:none',
      ]);
      const sum = result.groups.reduce((acc, g) => acc + g.count, 0);
      expect(sum).toBe(4);
    });

    it('pins the window filter constants (quoted next-7-days composition)', () => {
      expect(WINDOW_BUCKET_FILTERS('scheduled')).toEqual([
        'scheduled:overdue',
        'scheduled:today',
        'scheduled:"next 7 days"',
      ]);
      expect(NEXT_7_DAYS_BUCKET_FILTER('scheduled')).toBe(
        'scheduled:"next 7 days" -scheduled:today',
      );
      // Later is the open-ended range from today+8 onward (local dates),
      // matching the first-true-wins bucket assignment exactly.
      const bound = new Date();
      bound.setDate(bound.getDate() + 8);
      const key = `${bound.getFullYear()}-${String(bound.getMonth() + 1).padStart(2, '0')}-${String(bound.getDate()).padStart(2, '0')}`;
      expect(LATER_FILTER('scheduled')).toBe(`scheduled:${key}..`);
    });

    it('Later filter contract: only far-future dated tasks match', async () => {
      const filter = LATER_FILTER('scheduled');
      const cases: Array<{ date: Date | null; expected: boolean }> = [
        { date: dayOffset(30), expected: true },
        { date: dayOffset(8), expected: true },
        { date: dayOffset(7), expected: false }, // inside the 7-day window
        { date: dayOffset(3), expected: false },
        { date: dayOffset(0), expected: false },
        { date: dayOffset(-1), expected: false },
        { date: null, expected: false },
      ];

      for (const c of cases) {
        const task = makeTask({ path: 'a.md', line: 0, scheduledDate: c.date });
        expect(await Search.evaluate(filter, task, false, settings)).toBe(
          c.expected,
        );
      }
    });
  });

  describe('heatmap', () => {
    it('buckets matched tasks by local calendar day inside the window', async () => {
      const aggregator = makeAggregator();
      const tasks = [
        makeTask({ path: 'a.md', line: 0, scheduledDate: dayOffset(0) }),
        makeTask({ path: 'a.md', line: 1, scheduledDate: dayOffset(2) }),
        makeTask({ path: 'a.md', line: 2, scheduledDate: dayOffset(2) }),
        // Past day within the current week: stays empty (dimmed in the UI)
        makeTask({ path: 'a.md', line: 3, scheduledDate: dayOffset(-1) }),
        // Beyond the 4-week window: not counted anywhere
        makeTask({ path: 'a.md', line: 4, scheduledDate: dayOffset(40) }),
        makeTask({ path: 'a.md', line: 5, scheduledDate: null }),
      ];

      const result = await aggregator.aggregate(tasks, {
        groupBy: 'scheduled',
        display: 'heatmap',
        heatmapWindow: 4,
      });

      expect(result.total).toBe(6);
      expect(result.groups).toEqual([]);
      expect(result.days).toHaveLength(28);
      expect(result.today).toBe(toDateKey(new Date()));

      const days = result.days ?? [];
      // Every day before today is empty
      const todayKey = result.today ?? '';
      for (const day of days) {
        if (day.date < todayKey) {
          expect(day.count).toBe(0);
        }
      }
      // Today and today+2 hold their tasks
      const todayCell = days.find((d) => d.date === todayKey);
      expect(todayCell?.count).toBe(1);
      const plusTwo = days.find((d) => d.date === toDateKey(dayOffset(2)));
      expect(plusTwo?.count).toBe(2);
      // Sum of day counts equals tasks dated within [today, window end)
      const daySum = days.reduce((acc, d) => acc + d.count, 0);
      expect(daySum).toBe(3);
    });

    it('uses the day date as the click filter', async () => {
      const aggregator = makeAggregator();
      const todayTask = makeTask({
        path: 'a.md',
        line: 0,
        scheduledDate: dayOffset(0),
      });
      const result = await aggregator.aggregate([todayTask], {
        groupBy: 'scheduled',
        display: 'heatmap',
      });

      const todayKey = toDateKey(dayOffset(0));
      expect(result.days?.some((d) => d.date === todayKey)).toBe(true);
      // The day filter resolves through the evaluator
      expect(
        await Search.evaluate(
          `scheduled:${todayKey}`,
          todayTask,
          false,
          settings,
        ),
      ).toBe(true);
    });

    function weekdayOf(dateKey: string): number {
      // Local parse (never UTC) per the test timezone-independence rule.
      const [y, m, d] = dateKey.split('-').map(Number);
      return new Date(y, m - 1, d).getDay();
    }

    it('starts weeks on Monday by default (first column is a Monday)', async () => {
      const aggregator = makeAggregator({ weekStartsOn: 'Monday' });
      const task = makeTask({
        path: 'a.md',
        line: 0,
        scheduledDate: dayOffset(0),
      });
      const result = await aggregator.aggregate([task], {
        groupBy: 'scheduled',
        display: 'heatmap',
        heatmapWindow: 4,
      });

      const days = result.days ?? [];
      expect(days).toHaveLength(28);
      expect(weekdayOf(days[0].date)).toBe(1); // Monday
      // Today stays inside the window regardless of the week start
      expect(days.some((d) => d.date === result.today)).toBe(true);
    });

    it('starts weeks on Sunday when weekStartsOn is Sunday', async () => {
      const aggregator = makeAggregator({ weekStartsOn: 'Sunday' });
      const task = makeTask({
        path: 'a.md',
        line: 0,
        scheduledDate: dayOffset(0),
      });
      const result = await aggregator.aggregate([task], {
        groupBy: 'scheduled',
        display: 'heatmap',
        heatmapWindow: 4,
      });

      const days = result.days ?? [];
      expect(days).toHaveLength(28);
      expect(weekdayOf(days[0].date)).toBe(0); // Sunday
      // Every 8th cell from the second column must be the next Sunday
      // (7-row column flow: each column is one week)
      expect(weekdayOf(days[7].date)).toBe(0);
      // Today stays inside the window regardless of the week start
      expect(days.some((d) => d.date === result.today)).toBe(true);
      // Dated tasks still land in their own day cell
      const todayCell = days.find((d) => d.date === result.today);
      expect(todayCell?.count).toBe(1);
    });
  });

  describe('base query filtering', () => {
    it('filters tasks through Search.evaluate before grouping', async () => {
      const aggregator = makeAggregator();
      const tasks = [
        makeTask({
          path: 'a.md',
          line: 0,
          priority: 'high',
          rawText: 'TODO tagged #x',
          tags: ['x'],
        }),
        makeTask({ path: 'a.md', line: 1, priority: 'high' }),
        makeTask({ path: 'a.md', line: 2, priority: 'low' }),
      ];
      const result = await aggregator.aggregate(tasks, {
        searchQuery: 'tag:x',
        groupBy: 'priority',
      });

      expect(result.total).toBe(1);
      expect(result.groups[0].count).toBe(1);
    });

    it('treats an empty query as all tasks', async () => {
      const aggregator = makeAggregator();
      const tasks = [
        makeTask({ path: 'a.md', line: 0 }),
        makeTask({ path: 'b.md', line: 0 }),
      ];
      const result = await aggregator.aggregate(tasks, { groupBy: 'state' });

      expect(result.total).toBe(2);
    });
  });

  describe('sorting', () => {
    const sortTasks = (): Task[] => [
      makeTask({ path: 'a.md', line: 0, priority: 'high' }),
      makeTask({ path: 'a.md', line: 1, priority: 'high' }),
      makeTask({ path: 'a.md', line: 2, priority: 'med' }),
      makeTask({ path: 'a.md', line: 3, priority: null }),
      makeTask({ path: 'a.md', line: 4, priority: null }),
      makeTask({ path: 'a.md', line: 5, priority: null }),
    ];

    it('count-desc orders by count then label', async () => {
      const aggregator = makeAggregator();
      const result = await aggregator.aggregate(sortTasks(), {
        groupBy: 'priority',
        showEmpty: true,
        sort: 'count-desc',
      });
      expect(result.groups.map((g) => g.label)).toEqual([
        'None',
        'High',
        'Medium',
        'Low',
      ]);
    });

    it('count-asc orders ascending', async () => {
      const aggregator = makeAggregator();
      const result = await aggregator.aggregate(sortTasks(), {
        groupBy: 'priority',
        showEmpty: true,
        sort: 'count-asc',
      });
      expect(result.groups.map((g) => g.label)).toEqual([
        'Low',
        'Medium',
        'High',
        'None',
      ]);
    });

    it('label sorts alphabetically', async () => {
      const aggregator = makeAggregator();
      const result = await aggregator.aggregate(sortTasks(), {
        groupBy: 'priority',
        showEmpty: true,
        sort: 'label',
      });
      expect(result.groups.map((g) => g.label)).toEqual([
        'High',
        'Low',
        'Medium',
        'None',
      ]);
    });
  });

  describe('aggregation cache', () => {
    it('returns the memoized result for the same tasks reference and params', async () => {
      const aggregator = makeAggregator();
      const tasks = [makeTask({ path: 'a.md', line: 0, priority: 'high' })];
      const params: DashboardAggregationParams = { groupBy: 'priority' };

      const first = await aggregator.aggregate(tasks, params);
      const second = await aggregator.aggregate(tasks, params);
      expect(second).toBe(first);
    });

    it('recomputes when the tasks array identity changes', async () => {
      const aggregator = makeAggregator();
      const params: DashboardAggregationParams = { groupBy: 'priority' };
      const before = await aggregator.aggregate(
        [makeTask({ path: 'a.md', line: 0, priority: 'high' })],
        params,
      );
      const after = await aggregator.aggregate(
        [makeTask({ path: 'a.md', line: 0, priority: 'high' })],
        params,
      );
      expect(after).not.toBe(before);
      expect(after).toEqual(before);
    });

    it('recomputes after invalidateCache', async () => {
      const aggregator = makeAggregator();
      const tasks = [makeTask({ path: 'a.md', line: 0, priority: 'high' })];
      const params: DashboardAggregationParams = { groupBy: 'priority' };
      const first = await aggregator.aggregate(tasks, params);
      aggregator.invalidateCache();
      const second = await aggregator.aggregate(tasks, params);
      expect(second).not.toBe(first);
      expect(second).toEqual(first);
    });
  });
});

describe('composeFilterQuery', () => {
  it('returns the filter alone for an empty base query', () => {
    expect(composeFilterQuery('', 'priority:high')).toBe('priority:high');
    expect(composeFilterQuery('   ', 'priority:high')).toBe('priority:high');
  });

  it('wraps an OR-containing base query before appending the filter', () => {
    expect(
      composeFilterQuery(
        'tag:project scheduled:due OR scheduled:overdue',
        'priority:high',
      ),
    ).toBe('(tag:project scheduled:due OR scheduled:overdue) priority:high');
  });

  it('wraps an OR-containing filter so its OR cannot re-scope over the base', () => {
    expect(
      composeFilterQuery('tag:project', 'state:ARCHIVED OR state:SHIPPED'),
    ).toBe('(tag:project) (state:ARCHIVED OR state:SHIPPED)');
  });

  it('leaves an already-parenthesized filter untouched', () => {
    expect(
      composeFilterQuery('tag:project', '(state:ARCHIVED OR state:SHIPPED)'),
    ).toBe('(tag:project) (state:ARCHIVED OR state:SHIPPED)');
  });

  it('does not double-wrap an already-wrapped base query', () => {
    expect(
      composeFilterQuery('(tag:project OR tag:home)', 'priority:high'),
    ).toBe('(tag:project OR tag:home) priority:high');
  });

  it('appends to a plain base query with the wrapped form', () => {
    expect(composeFilterQuery('tag:project', 'priority:high')).toBe(
      '(tag:project) priority:high',
    );
  });

  it('keeps the click count equal to the Task List count through the evaluator', async () => {
    const base = 'tag:project scheduled:due OR scheduled:overdue';
    const composed = composeFilterQuery(base, 'priority:high');
    const settings = createBaseSettings();

    // Matches the first OR arm but has low priority: the composed (wrapped)
    // query must NOT match. The unwrapped form WOULD match — the grammar's
    // implicit AND binds tighter than OR, so without the wrap the filter
    // leaks into the first OR arm. Pin both sides of that difference.
    const lowPriorityDue = makeTask({
      path: 'a.md',
      line: 0,
      text: 'tagged task',
      rawText: 'TODO tagged task #project',
      tags: ['project'],
      scheduledDate: dayOffset(-1),
      priority: 'low',
    });
    // High priority overdue project task: must match composed
    const highPriorityOverdue = makeTask({
      path: 'b.md',
      line: 0,
      text: 'urgent tagged task',
      rawText: 'TODO urgent tagged task #project',
      tags: ['project'],
      scheduledDate: dayOffset(-2),
      priority: 'high',
    });
    // No tag, but overdue: matches the base's standalone second OR arm
    // (AND binds tighter than OR), so the composed query matches it too.
    const untaggedOverdue = makeTask({
      path: 'c.md',
      line: 0,
      scheduledDate: dayOffset(-2),
      priority: 'high',
    });

    expect(
      await Search.evaluate(composed, lowPriorityDue, false, settings),
    ).toBe(false);
    expect(
      await Search.evaluate(composed, highPriorityOverdue, false, settings),
    ).toBe(true);
    expect(
      await Search.evaluate(composed, untaggedOverdue, false, settings),
    ).toBe(true);
  });

  it('keeps an OR-joined filter consistent with its group count via the evaluator', async () => {
    const settings = createBaseSettings();
    const filter = 'state:ARCHIVED OR state:SHIPPED';
    const composed = composeFilterQuery('tag:project', filter);

    // Project task in an archived state: matches
    const projectArchived = makeTask({
      path: 'a.md',
      line: 0,
      rawText: 'DOING tagged #project',
      tags: ['project'],
      state: 'ARCHIVED',
    });
    // Project task in a non-archived state: does not match
    const projectActive = makeTask({
      path: 'b.md',
      line: 0,
      rawText: 'DOING tagged #project',
      tags: ['project'],
      state: 'DOING',
    });
    // Archived but not tagged: does not match the composed query
    const untaggedArchived = makeTask({
      path: 'c.md',
      line: 0,
      state: 'ARCHIVED',
    });

    expect(
      await Search.evaluate(composed, projectArchived, false, settings),
    ).toBe(true);
    expect(
      await Search.evaluate(composed, projectActive, false, settings),
    ).toBe(false);
    expect(
      await Search.evaluate(composed, untaggedArchived, false, settings),
    ).toBe(false);

    // The unwrapped concatenation is mis-scoped: the OR re-scopes over the
    // base, so an untagged SHIPPED task (the second OR arm) would leak in.
    // This is why composeFilterQuery parenthesizes a top-level-OR filter.
    const untaggedShipped = makeTask({
      path: 'c.md',
      line: 0,
      state: 'SHIPPED',
    });
    const unwrapped = `tag:project ${filter}`;
    expect(
      await Search.evaluate(unwrapped, untaggedShipped, false, settings),
    ).toBe(true);
    expect(
      await Search.evaluate(composed, untaggedShipped, false, settings),
    ).toBe(false);
  });
});

describe('DashboardResult shape', () => {
  it('exposes groups with key/label/count/filter and total', async () => {
    const settings = createBaseSettings();
    const aggregator = new DashboardAggregator(
      settings,
      createTestKeywordManager(),
    );
    const result: DashboardResult = await aggregator.aggregate(
      [makeTask({ path: 'a.md', line: 0, priority: 'high' })],
      { groupBy: 'priority' },
    );
    expect(result).toEqual({
      total: 1,
      overlapsTotal: false,
      groups: [
        {
          key: 'priority:high',
          label: 'High',
          count: 1,
          filter: 'priority:high',
        },
      ],
    });
  });
});
