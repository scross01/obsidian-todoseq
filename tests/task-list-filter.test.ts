import { TaskListFilter } from '../src/view/task-list/task-list-filter';
import {
  createBaseTask,
  createBaseSettings,
  createDate,
} from './helpers/test-helper';
import { TodoTrackerSettings } from '../src/settings/settings-types';
import TodoTracker from '../src/main';
import { KeywordManager } from '../src/utils/keyword-manager';

describe('TaskListFilter', () => {
  const createPluginMock = (
    settings: Partial<TodoTrackerSettings> = {},
  ): TodoTracker => {
    const fullSettings = {
      ...createBaseSettings(),
      ...settings,
    };
    return {
      settings: fullSettings,
      keywordManager: new KeywordManager(fullSettings),
    } as unknown as TodoTracker;
  };

  const mockElement = (attrs: Record<string, string> = {}): HTMLElement => {
    const attrsStore: Record<string, string> = { ...attrs };
    const element = {
      getAttr: (key: string) => attrsStore[key] || null,
      setAttr: (key: string, value: string) => {
        attrsStore[key] = value;
      },
    } as unknown as HTMLElement;
    return element;
  };

  const tasks = [
    createBaseTask({ completed: false, state: 'TODO' }),
    createBaseTask({ completed: true, state: 'DONE' }),
    createBaseTask({ completed: false, state: 'DOING' }),
  ];

  describe('filterTasksByViewMode', () => {
    it('should return all tasks for showAll', () => {
      const filter = new TaskListFilter(
        createPluginMock(),
        (createPluginMock() as any).keywordManager,
      );
      const result = filter.filterTasksByViewMode(tasks, 'showAll');
      expect(result).toHaveLength(3);
    });

    it('should filter completed tasks for hideCompleted', () => {
      const filter = new TaskListFilter(
        createPluginMock(),
        (createPluginMock() as any).keywordManager,
      );
      const result = filter.filterTasksByViewMode(tasks, 'hideCompleted');
      expect(result).toHaveLength(2);
      expect(result.every((t) => !t.completed)).toBe(true);
    });

    it('should return copy for sortCompletedLast', () => {
      const filter = new TaskListFilter(
        createPluginMock(),
        (createPluginMock() as any).keywordManager,
      );
      const result = filter.filterTasksByViewMode(tasks, 'sortCompletedLast');
      expect(result).toHaveLength(3);
    });
  });

  describe('getViewMode/setViewMode', () => {
    it('should read view mode from element attribute', () => {
      const filter = new TaskListFilter(
        createPluginMock(),
        (createPluginMock() as any).keywordManager,
      );
      const el = mockElement({ 'data-view-mode': 'hideCompleted' });
      expect(filter.getViewMode(el)).toBe('hideCompleted');
    });

    it('should default to showAll for invalid attribute', () => {
      const filter = new TaskListFilter(
        createPluginMock(),
        (createPluginMock() as any).keywordManager,
      );
      const el = mockElement();
      expect(filter.getViewMode(el)).toBe('showAll');
    });

    it('should handle legacy mode names', () => {
      const filter = new TaskListFilter(
        createPluginMock(),
        (createPluginMock() as any).keywordManager,
      );

      let el = mockElement({ 'data-view-mode': 'default' });
      expect(filter.getViewMode(el)).toBe('showAll');

      el = mockElement({ 'data-view-mode': 'sortCompletedLast' });
      expect(filter.getViewMode(el)).toBe('sortCompletedLast');
    });

    it('should write view mode to element attribute', () => {
      const filter = new TaskListFilter(
        createPluginMock(),
        (createPluginMock() as any).keywordManager,
      );
      const el = mockElement();

      filter.setViewMode(el, 'hideCompleted');
      expect(el.getAttr('data-view-mode')).toBe('hideCompleted');
    });
  });

  describe('getSortMethod/setSortMethod', () => {
    it('should read sort method from element attribute', () => {
      const filter = new TaskListFilter(
        createPluginMock(),
        (createPluginMock() as any).keywordManager,
      );
      const el = mockElement({ 'data-sort-method': 'sortByPriority' });
      expect(filter.getSortMethod(el, 'default')).toBe('sortByPriority');
    });

    it('should fallback to default when attribute missing', () => {
      const filter = new TaskListFilter(
        createPluginMock(),
        (createPluginMock() as any).keywordManager,
      );
      const el = mockElement();
      expect(filter.getSortMethod(el, 'sortByDeadline')).toBe('sortByDeadline');
    });

    it('should handle all valid sort method values', () => {
      const filter = new TaskListFilter(
        createPluginMock(),
        (createPluginMock() as any).keywordManager,
      );

      const methods = [
        'default',
        'sortByScheduled',
        'sortByDeadline',
        'sortByPriority',
        'sortByUrgency',
        'sortByKeyword',
      ] as const;

      for (const method of methods) {
        const el = mockElement({ 'data-sort-method': method });
        expect(filter.getSortMethod(el, 'default')).toBe(method);
      }
    });

    it('should write sort method to element attribute', () => {
      const filter = new TaskListFilter(
        createPluginMock(),
        (createPluginMock() as any).keywordManager,
      );
      const el = mockElement();

      filter.setSortMethod(el, 'sortByDeadline');
      expect(el.getAttr('data-sort-method')).toBe('sortByDeadline');
    });
  });

  describe('transformForView', () => {
    it('should transform tasks with showAll mode', () => {
      const filter = new TaskListFilter(
        createPluginMock(),
        (createPluginMock() as any).keywordManager,
      );
      const result = filter.transformForView(tasks, 'showAll', 'default');
      expect(result).toHaveLength(3);
    });

    it('should transform tasks with sortByKeyword', () => {
      const pluginMock = createPluginMock({ futureTaskSorting: 'showAll' });
      const filter = new TaskListFilter(
        pluginMock,
        (pluginMock as any).keywordManager,
      );
      const result = filter.transformForView(tasks, 'showAll', 'sortByKeyword');
      expect(result).toHaveLength(3);
    });
  });

  describe('countHiddenByFilters', () => {
    const createFilter = (settings: Partial<TodoTrackerSettings> = {}) => {
      const pluginMock = createPluginMock(settings);
      return new TaskListFilter(pluginMock, (pluginMock as any).keywordManager);
    };

    beforeEach(() => {
      jest.useFakeTimers();
      // Today is 2026-10-05. With the default 7-day upcoming window:
      // 2026-10-08 is 'upcoming' and 2026-10-20 is 'future'.
      jest.setSystemTime(createDate(2026, 10, 5, 12, 0));
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    const undated = createBaseTask({ text: 'No date' });
    const upcoming = createBaseTask({
      text: 'Upcoming',
      scheduledDate: createDate(2026, 10, 8),
    });
    const futureTask = createBaseTask({
      text: 'Future',
      scheduledDate: createDate(2026, 10, 20),
    });

    it('counts upcoming and future tasks when hideFuture is set', () => {
      const filter = createFilter({ futureTaskSorting: 'hideFuture' });
      const hidden = filter.countHiddenByFilters(
        [undated, upcoming, futureTask],
        'showAll',
      );
      expect(hidden).toEqual({ future: 2, completed: 0 });
    });

    it('counts only future tasks when showUpcoming is set', () => {
      const filter = createFilter({ futureTaskSorting: 'showUpcoming' });
      const hidden = filter.countHiddenByFilters(
        [undated, upcoming, futureTask],
        'showAll',
      );
      expect(hidden).toEqual({ future: 1, completed: 0 });
    });

    it('counts nothing when sortToEnd is set - future tasks get their own block', () => {
      const filter = createFilter({ futureTaskSorting: 'sortToEnd' });
      const hidden = filter.countHiddenByFilters(
        [undated, upcoming, futureTask],
        'showAll',
      );
      expect(hidden).toEqual({ future: 0, completed: 0 });
    });

    it('counts nothing when showAll is set', () => {
      const filter = createFilter({ futureTaskSorting: 'showAll' });
      const hidden = filter.countHiddenByFilters(
        [undated, upcoming, futureTask],
        'showAll',
      );
      expect(hidden).toEqual({ future: 0, completed: 0 });
    });

    it('counts completed tasks when hideCompleted is set', () => {
      const filter = createFilter({ futureTaskSorting: 'showAll' });
      const completed = createBaseTask({ completed: true, state: 'DONE' });
      const hidden = filter.countHiddenByFilters(
        [undated, completed],
        'hideCompleted',
      );
      expect(hidden).toEqual({ future: 0, completed: 1 });
    });

    it('counts nothing when completed tasks are sorted to the end', () => {
      const filter = createFilter({ futureTaskSorting: 'showAll' });
      const completed = createBaseTask({ completed: true, state: 'DONE' });
      const hidden = filter.countHiddenByFilters(
        [undated, completed],
        'sortCompletedLast',
      );
      expect(hidden.completed).toBe(0);
    });

    it('counts nothing when completed tasks are shown', () => {
      const filter = createFilter({ futureTaskSorting: 'showAll' });
      const completed = createBaseTask({ completed: true, state: 'DONE' });
      const hidden = filter.countHiddenByFilters(
        [undated, completed],
        'showAll',
      );
      expect(hidden.completed).toBe(0);
    });

    it('counts a completed future-dated task once, as completed', () => {
      const filter = createFilter({ futureTaskSorting: 'hideFuture' });
      const completedNoDate = createBaseTask({
        completed: true,
        state: 'DONE',
      });
      const completedFuture = createBaseTask({
        completed: true,
        state: 'DONE',
        scheduledDate: createDate(2026, 10, 20),
      });
      const hidden = filter.countHiddenByFilters(
        [undated, upcoming, futureTask, completedNoDate, completedFuture],
        'hideCompleted',
      );
      expect(hidden).toEqual({ future: 2, completed: 2 });
    });

    it('does not count a task the deadline warning period pulls into the current window', () => {
      // 2026-10-20 minus a 16-day default deadline warning is 2026-10-04,
      // so this is 'current' and hideFuture does not hide it.
      const filter = createFilter({
        futureTaskSorting: 'hideFuture',
        defaultDeadlineWarningPeriod: 16,
      });
      const deadlineOnly = createBaseTask({
        text: 'Deadline only',
        deadlineDate: createDate(2026, 10, 20),
      });
      const hidden = filter.countHiddenByFilters([deadlineOnly], 'showAll');
      expect(hidden).toEqual({ future: 0, completed: 0 });
    });

    it('counts the same task as hidden once the warning period is removed', () => {
      const filter = createFilter({ futureTaskSorting: 'hideFuture' });
      const deadlineOnly = createBaseTask({
        text: 'Deadline only',
        deadlineDate: createDate(2026, 10, 20),
      });
      const hidden = filter.countHiddenByFilters([deadlineOnly], 'showAll');
      expect(hidden).toEqual({ future: 1, completed: 0 });
    });

    it('honours a per-task scheduled warning period', () => {
      const filter = createFilter({ futureTaskSorting: 'hideFuture' });
      const delayedNotice = createBaseTask({
        text: 'Delayed notice',
        scheduledDate: createDate(2026, 10, 5),
        scheduledWarningPeriod: { value: 3, unit: 'd', isFirstOnly: false },
      });
      expect(filter.countHiddenByFilters([delayedNotice], 'showAll')).toEqual({
        future: 1,
        completed: 0,
      });

      const plain = createBaseTask({
        text: 'Delayed notice',
        scheduledDate: createDate(2026, 10, 5),
      });
      expect(filter.countHiddenByFilters([plain], 'showAll')).toEqual({
        future: 0,
        completed: 0,
      });
    });

    it('accounts for every task: shown + hidden === total, for all settings combinations', () => {
      const modes = ['showAll', 'sortCompletedLast', 'hideCompleted'] as const;
      const futureSettings = [
        'showAll',
        'showUpcoming',
        'sortToEnd',
        'hideFuture',
      ] as const;
      const tasks = [
        undated,
        upcoming,
        futureTask,
        createBaseTask({ completed: true, state: 'DONE' }),
        createBaseTask({
          completed: true,
          state: 'DONE',
          scheduledDate: createDate(2026, 10, 20),
        }),
      ];

      for (const futureTaskSorting of futureSettings) {
        const filter = createFilter({ futureTaskSorting });
        for (const mode of modes) {
          const shown = filter.transformForView(tasks, mode, 'default').length;
          const hidden = filter.countHiddenByFilters(tasks, mode);
          expect(
            `${futureTaskSorting}/${mode}: ${shown + hidden.future + hidden.completed}`,
          ).toBe(`${futureTaskSorting}/${mode}: ${tasks.length}`);
        }
      }
    });
  });

  describe('getKeywordSortConfig', () => {
    it('should cache keyword config', () => {
      const filter = new TaskListFilter(
        createPluginMock(),
        (createPluginMock() as any).keywordManager,
      );

      const config1 = filter.getKeywordSortConfig();
      const config2 = filter.getKeywordSortConfig();

      expect(config1).toBe(config2);
    });
  });
});
