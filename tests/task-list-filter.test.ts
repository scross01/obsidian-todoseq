import { TaskListFilter } from '../src/view/task-list/task-list-filter';
import { createBaseTask, createBaseSettings } from './helpers/test-helper';
import { TodoTrackerSettings } from '../src/settings/settings-types';
import TodoTracker from '../src/main';

describe('TaskListFilter', () => {
  const createPluginMock = (
    settings: Partial<TodoTrackerSettings> = {},
  ): TodoTracker => {
    return {
      settings: {
        ...createBaseSettings(),
        ...settings,
      },
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
      const filter = new TaskListFilter(createPluginMock());
      const result = filter.filterTasksByViewMode(tasks, 'showAll');
      expect(result).toHaveLength(3);
    });

    it('should filter completed tasks for hideCompleted', () => {
      const filter = new TaskListFilter(createPluginMock());
      const result = filter.filterTasksByViewMode(tasks, 'hideCompleted');
      expect(result).toHaveLength(2);
      expect(result.every((t) => !t.completed)).toBe(true);
    });

    it('should return copy for sortCompletedLast', () => {
      const filter = new TaskListFilter(createPluginMock());
      const result = filter.filterTasksByViewMode(tasks, 'sortCompletedLast');
      expect(result).toHaveLength(3);
    });
  });

  describe('getViewMode/setViewMode', () => {
    it('should read view mode from element attribute', () => {
      const filter = new TaskListFilter(createPluginMock());
      const el = mockElement({ 'data-view-mode': 'hideCompleted' });
      expect(filter.getViewMode(el)).toBe('hideCompleted');
    });

    it('should default to showAll for invalid attribute', () => {
      const filter = new TaskListFilter(createPluginMock());
      const el = mockElement();
      expect(filter.getViewMode(el)).toBe('showAll');
    });

    it('should handle legacy mode names', () => {
      const filter = new TaskListFilter(createPluginMock());

      let el = mockElement({ 'data-view-mode': 'default' });
      expect(filter.getViewMode(el)).toBe('showAll');

      el = mockElement({ 'data-view-mode': 'sortCompletedLast' });
      expect(filter.getViewMode(el)).toBe('sortCompletedLast');
    });

    it('should write view mode to element attribute', () => {
      const filter = new TaskListFilter(createPluginMock());
      const el = mockElement();

      filter.setViewMode(el, 'hideCompleted');
      expect(el.getAttr('data-view-mode')).toBe('hideCompleted');
    });
  });

  describe('getSortMethod/setSortMethod', () => {
    it('should read sort method from element attribute', () => {
      const filter = new TaskListFilter(createPluginMock());
      const el = mockElement({ 'data-sort-method': 'sortByPriority' });
      expect(filter.getSortMethod(el, 'default')).toBe('sortByPriority');
    });

    it('should fallback to default when attribute missing', () => {
      const filter = new TaskListFilter(createPluginMock());
      const el = mockElement();
      expect(filter.getSortMethod(el, 'sortByDeadline')).toBe('sortByDeadline');
    });

    it('should handle all valid sort method values', () => {
      const filter = new TaskListFilter(createPluginMock());

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
      const filter = new TaskListFilter(createPluginMock());
      const el = mockElement();

      filter.setSortMethod(el, 'sortByDeadline');
      expect(el.getAttr('data-sort-method')).toBe('sortByDeadline');
    });
  });

  describe('transformForView', () => {
    it('should transform tasks with showAll mode', () => {
      const filter = new TaskListFilter(createPluginMock());
      const result = filter.transformForView(tasks, 'showAll', 'default');
      expect(result).toHaveLength(3);
    });

    it('should transform tasks with sortByKeyword', () => {
      const filter = new TaskListFilter(
        createPluginMock({ futureTaskSorting: 'showAll' }),
      );
      const result = filter.transformForView(tasks, 'showAll', 'sortByKeyword');
      expect(result).toHaveLength(3);
    });
  });

  describe('getKeywordSortConfig', () => {
    it('should cache keyword config', () => {
      const filter = new TaskListFilter(createPluginMock());

      const config1 = filter.getKeywordSortConfig();
      const config2 = filter.getKeywordSortConfig();

      expect(config1).toBe(config2);
    });
  });
});
