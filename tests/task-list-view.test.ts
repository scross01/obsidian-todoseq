/**
 * @jest-environment jsdom
 */

import {
  TaskListView,
  TaskListViewMode,
  SortMethod,
} from '../src/view/task-list/task-list-view';
import { installObsidianDomMocks } from './helpers/obsidian-dom-mock';
import { createBaseTask, createBaseSettings } from './helpers/test-helper';
import { Task } from '../src/types/task';

// Mock obsidian
jest.mock('obsidian', () => ({
  ItemView: class MockItemView {
    contentEl: HTMLElement;
    app = { workspace: {}, vault: {} };
    constructor() {
      this.contentEl = activeDocument.createElement('div');
      // Add Obsidian's getAttr/setAttr methods
      (this.contentEl as any).getAttr = function (name: string) {
        return this.getAttribute(name);
      };
      (this.contentEl as any).setAttr = function (
        name: string,
        value: string | boolean | number,
      ) {
        if (value === true) {
          this.setAttribute(name, '');
        } else if (value === false || value === null || value === undefined) {
          this.removeAttribute(name);
        } else {
          this.setAttribute(name, String(value));
        }
      };
    }
  },
  WorkspaceLeaf: jest.fn(),
  TFile: jest.fn(),
  Platform: { isMobile: false, isMacOS: false },
  MarkdownView: jest.fn(),
  setIcon: jest.fn(),
  Notice: jest.fn(),
}));

// Mock dependencies
jest.mock('../src/view/components/state-menu-builder', () => ({
  StateMenuBuilder: jest.fn().mockImplementation(() => ({
    buildStateMenu: jest.fn().mockReturnValue({ showAtPosition: jest.fn() }),
  })),
}));

jest.mock('../src/view/components/task-context-menu', () => ({
  TaskContextMenu: jest.fn().mockImplementation(() => ({
    showAtMouseEvent: jest.fn(),
    cleanup: jest.fn(),
    updateConfig: jest.fn(),
  })),
}));

jest.mock('../src/view/task-list/task-item-renderer', () => ({
  TaskItemRenderer: jest.fn().mockImplementation(() => ({
    buildText: jest.fn().mockReturnValue(activeDocument.createElement('span')),
    buildTaskListItem: jest.fn().mockImplementation((task: Task) => {
      const li = activeDocument.createElement('li');
      li.setAttribute('data-path', task.path);
      li.setAttribute('data-line', String(task.line));
      li.classList.add('todoseq-task-item');
      return li;
    }),
    updateTaskElementContent: jest.fn(),
    renderTaskTextWithLinks: jest.fn(),
  })),
}));

jest.mock('../src/view/task-list/task-drag-drop', () => ({
  TaskDragDropHandler: jest.fn().mockImplementation(() => ({
    initialize: jest.fn(),
    destroy: jest.fn(),
  })),
}));

jest.mock('../src/view/task-list/task-list-filter', () => ({
  TaskListFilter: jest.fn().mockImplementation(() => ({
    transformForView: jest
      .fn()
      .mockImplementation((tasks: Task[]) => tasks.slice()),
    filterTasksByViewMode: jest
      .fn()
      .mockImplementation((tasks: Task[]) => tasks.slice()),
  })),
}));

jest.mock('../src/services/task-update-coordinator', () => ({
  getStateTransitionManager: jest.fn().mockReturnValue({
    getNextState: jest.fn().mockReturnValue('DOING'),
    isCompletedState: jest.fn().mockReturnValue(false),
  }),
}));

jest.mock('../src/utils/daily-note-utils', () => ({
  getTodayDailyNote: jest.fn().mockResolvedValue(null),
  isTaskOnTodayDailyNote: jest.fn().mockReturnValue(false),
}));

jest.mock('../src/utils/task-sub-bullets', () => ({
  getTaskRemovalRange: jest.fn().mockReturnValue({ start: 0, end: 0 }),
  modifyLinesForMigration: jest.fn().mockReturnValue([]),
  readTaskBlockFromVault: jest.fn().mockResolvedValue(['TODO Test task']),
}));

jest.mock('../src/search/search', () => ({
  Search: {
    evaluate: jest.fn().mockResolvedValue(true),
    getError: jest.fn().mockReturnValue(null),
  },
}));

jest.mock('../src/main', () => ({
  TASK_VIEW_ICON: 'list-todo',
  default: class MockTodoTracker {
    settings = createBaseSettings();
    app = { workspace: {}, vault: {} };
    taskUpdateCoordinator = {};
    keywordManager = {};
    taskStateManager = { getTasks: jest.fn().mockReturnValue([]) };
  },
}));

beforeAll(() => {
  installObsidianDomMocks();
});

describe('TaskListView', () => {
  let view: TaskListView;
  let taskStateManagerMock: Record<string, unknown>;
  let pluginMock: Record<string, unknown>;

  beforeEach(() => {
    const tasks = [
      createBaseTask({
        path: 'test1.md',
        line: 0,
        text: 'Task 1',
        state: 'TODO',
        completed: false,
      }),
      createBaseTask({
        path: 'test2.md',
        line: 1,
        text: 'Task 2',
        state: 'DONE',
        completed: true,
      }),
    ];

    taskStateManagerMock = {
      getTasks: jest.fn().mockReturnValue(tasks),
      subscribe: jest.fn().mockReturnValue(jest.fn()),
      findTaskByPathAndLine: jest.fn().mockReturnValue(tasks[0]),
      getKeywordManager: jest.fn().mockReturnValue({}),
    };

    pluginMock = {
      settings: createBaseSettings(),
      app: {
        workspace: {
          getLeavesOfType: jest.fn().mockReturnValue([]),
        },
        vault: {
          getAbstractFileByPath: jest.fn().mockReturnValue(null),
        },
      },
      taskUpdateCoordinator: {
        updateTaskState: jest.fn().mockResolvedValue(undefined),
        updateTaskPriority: jest.fn().mockResolvedValue(undefined),
        updateTaskScheduledDate: jest.fn().mockResolvedValue(undefined),
        updateTaskDeadlineDate: jest.fn().mockResolvedValue(undefined),
      },
      keywordManager: {},
      taskStateManager: taskStateManagerMock,
      propertySearchEngine: null,
    };

    const leafMock = {};

    view = new TaskListView(
      leafMock as any,
      taskStateManagerMock as any,
      'showAll' as TaskListViewMode,
      pluginMock as any,
      {} as any,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getViewType', () => {
    it('should return the correct view type', () => {
      expect(view.getViewType()).toBe('todoseq-view');
    });
  });

  describe('getDisplayText', () => {
    it('should return Todoseq as display text', () => {
      expect(view.getDisplayText()).toBe('Todoseq');
    });
  });

  describe('getIcon', () => {
    it('should return the task view icon', () => {
      expect(view.getIcon()).toBe('list-todo');
    });
  });

  describe('updateTasks', () => {
    it('should update tasks reference', () => {
      const newTasks = [createBaseTask({ text: 'New task' })];
      view.updateTasks(newTasks);
      expect(view.tasks).toBe(newTasks);
    });
  });

  describe('view mode accessors', () => {
    it('should set and get view mode', () => {
      // Ensure contentEl exists
      if (!view['contentEl']) {
        view['contentEl'] = activeDocument.createElement('div');
      }
      view.setViewMode('hideCompleted');
      expect(view['getViewMode']()).toBe('hideCompleted');
    });

    it('should migrate old mode names', () => {
      if (!view['contentEl']) {
        view['contentEl'] = activeDocument.createElement('div');
      }
      view['contentEl'].setAttribute('data-view-mode', 'default');
      expect(view['getViewMode']()).toBe('showAll');
    });

    it('should default to showAll for invalid mode', () => {
      if (!view['contentEl']) {
        view['contentEl'] = activeDocument.createElement('div');
      }
      view['contentEl'].setAttribute('data-view-mode', 'invalid');
      expect(view['getViewMode']()).toBe('showAll');
    });
  });

  describe('sort method accessors', () => {
    it('should set and get sort method', () => {
      if (!view['contentEl']) {
        view['contentEl'] = activeDocument.createElement('div');
      }
      view.setSortMethod('sortByPriority');
      expect(view['getSortMethod']()).toBe('sortByPriority');
    });

    it('should fallback to default sort method', () => {
      if (!view['contentEl']) {
        view['contentEl'] = activeDocument.createElement('div');
      }
      view['defaultSortMethod'] = 'sortByDeadline' as SortMethod;
      expect(view['getSortMethod']()).toBe('sortByDeadline');
    });
  });

  describe('search query', () => {
    it('should set and get search query', () => {
      if (!view['contentEl']) {
        view['contentEl'] = activeDocument.createElement('div');
      }
      view['setSearchQuery']('test query');
      expect(view['getSearchQuery']()).toBe('test query');
    });

    it('should default to empty string', () => {
      if (!view['contentEl']) {
        view['contentEl'] = activeDocument.createElement('div');
      }
      expect(view['getSearchQuery']()).toBe('');
    });
  });

  describe('filterTasksByViewMode', () => {
    it('should hide completed tasks', () => {
      const tasks = [
        createBaseTask({ completed: false }),
        createBaseTask({ completed: true }),
      ];
      const result = view['filterTasksByViewMode'](tasks, 'hideCompleted');
      expect(result).toHaveLength(1);
      expect(result[0].completed).toBe(false);
    });

    it('should return all tasks for showAll', () => {
      const tasks = [
        createBaseTask({ completed: false }),
        createBaseTask({ completed: true }),
      ];
      const result = view['filterTasksByViewMode'](tasks, 'showAll');
      expect(result).toHaveLength(2);
    });
  });

  describe('announceTaskStateChange', () => {
    it('should update aria live region', () => {
      const region = activeDocument.createElement('div');
      view['ariaLiveRegion'] = region;

      const task = createBaseTask({ text: 'Test task', state: 'DOING' });
      view['announceTaskStateChange'](task, 'TODO');

      expect(region.textContent).toContain('Test task');
      expect(region.textContent).toContain('TODO');
      expect(region.textContent).toContain('DOING');
    });

    it('should not throw when aria live region is null', () => {
      view['ariaLiveRegion'] = null;
      const task = createBaseTask({ text: 'Test task', state: 'DOING' });
      expect(() => view['announceTaskStateChange'](task, 'TODO')).not.toThrow();
    });
  });

  describe('handleSearchHistoryDebounce', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should start debounce timer when both dropdowns closed', () => {
      const captureSpy = jest
        .spyOn(view as any, 'captureSearchToHistory')
        .mockImplementation(() => {});
      const setTimeoutSpy = jest.spyOn(window, 'setTimeout');

      view['searchHistoryDebounceTimer'] = null;
      view['suggestionDropdown'] = null;
      view['optionsDropdown'] = null;

      view['handleSearchHistoryDebounce']('test query');

      expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 3000);

      jest.advanceTimersByTime(3000);

      expect(captureSpy).toHaveBeenCalledWith('test query');

      setTimeoutSpy.mockRestore();
      captureSpy.mockRestore();
    });

    it('should not start timer when suggestion dropdown is visible', () => {
      const setTimeoutSpy = jest.spyOn(window, 'setTimeout');
      view['suggestionDropdown'] = {
        isVisible: jest.fn().mockReturnValue(true),
      } as any;
      view['optionsDropdown'] = {
        isVisible: jest.fn().mockReturnValue(false),
      } as any;
      view['searchHistoryDebounceTimer'] = null;

      view['handleSearchHistoryDebounce']('test query');

      expect(setTimeoutSpy).not.toHaveBeenCalled();
      setTimeoutSpy.mockRestore();
    });

    it('should not start timer when options dropdown is visible', () => {
      const setTimeoutSpy = jest.spyOn(window, 'setTimeout');
      view['suggestionDropdown'] = {
        isVisible: jest.fn().mockReturnValue(false),
      } as any;
      view['optionsDropdown'] = {
        isVisible: jest.fn().mockReturnValue(true),
      } as any;
      view['searchHistoryDebounceTimer'] = null;

      view['handleSearchHistoryDebounce']('test query');

      expect(setTimeoutSpy).not.toHaveBeenCalled();
      setTimeoutSpy.mockRestore();
    });

    it('should clear existing timer before starting new one', () => {
      const clearTimeoutSpy = jest.spyOn(window, 'clearTimeout');
      view['searchHistoryDebounceTimer'] = 123 as unknown as number;
      view['suggestionDropdown'] = null;
      view['optionsDropdown'] = null;

      view['handleSearchHistoryDebounce']('new query');

      expect(clearTimeoutSpy).toHaveBeenCalledWith(123);
      clearTimeoutSpy.mockRestore();
    });

    it('should still set timer for whitespace-only query', () => {
      const setTimeoutSpy = jest.spyOn(window, 'setTimeout');

      view['searchHistoryDebounceTimer'] = null;
      view['suggestionDropdown'] = null;
      view['optionsDropdown'] = null;

      view['handleSearchHistoryDebounce']('  ');

      expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 3000);

      setTimeoutSpy.mockRestore();
    });

    it('should capture only the last query when called rapidly', () => {
      const captureSpy = jest
        .spyOn(view as any, 'captureSearchToHistory')
        .mockImplementation(() => {});

      view['searchHistoryDebounceTimer'] = null;
      view['suggestionDropdown'] = null;
      view['optionsDropdown'] = null;

      view['handleSearchHistoryDebounce']('first query');
      view['handleSearchHistoryDebounce']('second query');
      view['handleSearchHistoryDebounce']('final query');

      expect(captureSpy).not.toHaveBeenCalled();

      jest.advanceTimersByTime(3000);

      expect(captureSpy).toHaveBeenCalledTimes(1);
      expect(captureSpy).toHaveBeenCalledWith('final query');

      captureSpy.mockRestore();
    });
  });

  describe('handleDropdownVisibilityChange', () => {
    it('should clear debounce timer when any dropdown visible', () => {
      const clearTimeoutSpy = jest.spyOn(window, 'clearTimeout');
      view['searchHistoryDebounceTimer'] = 456 as unknown as number;
      view['suggestionDropdown'] = {
        isVisible: jest.fn().mockReturnValue(true),
      } as any;
      view['optionsDropdown'] = {
        isVisible: jest.fn().mockReturnValue(false),
      } as any;

      view['handleDropdownVisibilityChange'](true);

      expect(clearTimeoutSpy).toHaveBeenCalledWith(456);
      expect(view['searchHistoryDebounceTimer']).toBeNull();
      clearTimeoutSpy.mockRestore();
    });

    it('should restart debounce timer when both dropdowns close', () => {
      jest.useFakeTimers();
      const handleDebounceSpy = jest
        .spyOn(view as any, 'handleSearchHistoryDebounce')
        .mockImplementation(() => {});

      view['searchHistoryDebounceTimer'] = null;
      view['suggestionDropdown'] = {
        isVisible: jest.fn().mockReturnValue(false),
      } as any;
      view['optionsDropdown'] = {
        isVisible: jest.fn().mockReturnValue(false),
      } as any;
      view['getSearchQuery'] = jest.fn().mockReturnValue('active query');

      view['handleDropdownVisibilityChange'](false);

      expect(handleDebounceSpy).toHaveBeenCalledWith('active query');

      handleDebounceSpy.mockRestore();
      jest.useRealTimers();
    });

    it('should not restart debounce when query is empty', () => {
      const handleDebounceSpy = jest
        .spyOn(view as any, 'handleSearchHistoryDebounce')
        .mockImplementation(() => {});

      view['suggestionDropdown'] = {
        isVisible: jest.fn().mockReturnValue(false),
      } as any;
      view['optionsDropdown'] = {
        isVisible: jest.fn().mockReturnValue(false),
      } as any;
      view['getSearchQuery'] = jest.fn().mockReturnValue('');

      view['handleDropdownVisibilityChange'](false);

      expect(handleDebounceSpy).not.toHaveBeenCalled();
      handleDebounceSpy.mockRestore();
    });
  });

  describe('captureSearchToHistory', () => {
    it('should delegate to optionsDropdown.addToHistory', () => {
      const addToHistory = jest.fn();
      view['optionsDropdown'] = { addToHistory } as any;

      view['captureSearchToHistory']('search term');

      expect(addToHistory).toHaveBeenCalledWith('search term');
    });

    it('should not throw when optionsDropdown is null', () => {
      view['optionsDropdown'] = null;
      expect(() => view['captureSearchToHistory']('search term')).not.toThrow();
    });
  });

  describe('updateContextMenuConfig', () => {
    it('should update context menu with new settings', () => {
      const updateConfig = jest.fn();
      view['taskContextMenu'] = { updateConfig } as any;
      view['plugin'] = {
        settings: {
          weekStartsOn: 'Monday',
          migrateToTodayState: 'MIGRATED',
        },
      } as any;

      view.updateContextMenuConfig();

      expect(updateConfig).toHaveBeenCalledWith({
        weekStartsOn: 'Monday',
        migrateToTodayState: 'MIGRATED',
      });
    });

    it('should not throw when taskContextMenu is null', () => {
      view['taskContextMenu'] = null;
      expect(() => view.updateContextMenuConfig()).not.toThrow();
    });
  });

  describe('onClose', () => {
    it('should clean up all listeners and timers', async () => {
      const removeEventListenerSpy = jest.spyOn(window, 'removeEventListener');

      const handler = jest.fn();
      const unsubscribeMock = jest.fn();
      view['_searchKeyHandler'] = handler;
      view['searchHistoryDebounceTimer'] = 100 as unknown as number;
      view['searchRefreshDebounceTimer'] = 200 as unknown as number;
      view['taskRefreshTimeout'] = 300 as unknown as number;
      view['unsubscribeFromStateManager'] = unsubscribeMock;
      view['resizeObserver'] = { disconnect: jest.fn() } as any;
      view['sentinelObserver'] = { disconnect: jest.fn() } as any;
      view['scrollEventListener'] = jest.fn();
      view['lazyLoadScrollHandler'] = jest.fn();
      view['taskListContainer'] = activeDocument.createElement('div');
      view['taskElementCache'] = { clear: jest.fn() } as any;
      view['renderQueue'] = { clear: jest.fn() } as any;
      view['optionsDropdown'] = { cleanup: jest.fn() } as any;
      view['suggestionDropdown'] = { cleanup: jest.fn() } as any;
      view['taskContextMenu'] = { cleanup: jest.fn() } as any;
      view['taskDragDropHandler'] = { destroy: jest.fn() } as any;

      await view.onClose();

      expect(removeEventListenerSpy).toHaveBeenCalledWith('keydown', handler);
      expect(view['_searchKeyHandler']).toBeUndefined();
      expect(unsubscribeMock).toHaveBeenCalled();
      expect(view['optionsDropdown']).toBeNull();
      expect(view['suggestionDropdown']).toBeNull();
      expect(view['taskDragDropHandler']).toBeNull();

      removeEventListenerSpy.mockRestore();
    });

    it('should handle null cleanup gracefully', async () => {
      view['_searchKeyHandler'] = undefined;
      view['searchHistoryDebounceTimer'] = null;
      view['searchRefreshDebounceTimer'] = null;
      view['taskRefreshTimeout'] = null;
      view['unsubscribeFromStateManager'] = null;
      view['resizeObserver'] = null;
      view['sentinelObserver'] = null;
      view['scrollEventListener'] = null;
      view['lazyLoadScrollHandler'] = null;
      view['taskListContainer'] = null;
      view['optionsDropdown'] = null;
      view['suggestionDropdown'] = null;
      view['taskContextMenu'] = null;
      view['taskDragDropHandler'] = null;
      view['taskElementCache'] = { clear: jest.fn() } as any;
      view['renderQueue'] = { clear: jest.fn() } as any;

      await expect(view.onClose()).resolves.not.toThrow();
    });
  });

  describe('updateTasks', () => {
    it('should update suggestion and options dropdown task references', () => {
      const updateTasks1 = jest.fn();
      const updateTasks2 = jest.fn();
      view['optionsDropdown'] = { updateTasks: updateTasks1 } as any;
      view['suggestionDropdown'] = { updateTasks: updateTasks2 } as any;

      const newTasks = [createBaseTask({ text: 'Updated task' })];
      view.updateTasks(newTasks);

      expect(view.tasks).toBe(newTasks);
      expect(updateTasks1).toHaveBeenCalledWith(newTasks);
      expect(updateTasks2).toHaveBeenCalledWith(newTasks);
    });

    it('should handle null dropdowns gracefully', () => {
      view['optionsDropdown'] = null;
      view['suggestionDropdown'] = null;

      const newTasks = [createBaseTask({ text: 'Updated task' })];
      expect(() => view.updateTasks(newTasks)).not.toThrow();
      expect(view.tasks).toBe(newTasks);
    });
  });

  describe('openTaskLocationForRenderer', () => {
    it('should delegate to openTaskLocation', () => {
      const openTaskLocationSpy = jest
        .spyOn(view as any, 'openTaskLocation')
        .mockResolvedValue(undefined);

      const task = createBaseTask({ text: 'Test task' });
      view['openTaskLocationForRenderer'](task);

      expect(openTaskLocationSpy).toHaveBeenCalled();
      const callArgs = openTaskLocationSpy.mock.calls[0];
      expect(callArgs[1]).toBe(task);
      expect(callArgs[0]).toBeInstanceOf(MouseEvent);

      openTaskLocationSpy.mockRestore();
    });
  });
});
