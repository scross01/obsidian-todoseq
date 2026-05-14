/**
 * @jest-environment jsdom
 */

import { EmbeddedTaskListRenderer } from '../src/view/embedded-task-list/task-list-renderer';
import { installObsidianDomMocks } from './helpers/obsidian-dom-mock';
import { createBaseSettings, createBaseTask } from './helpers/test-helper';
import { TodoseqParameters } from '../src/view/embedded-task-list/code-block-parser';

describe('EmbeddedTaskListRenderer', () => {
  let renderer: any;

  beforeAll(() => {
    installObsidianDomMocks();
  });

  beforeEach(() => {
    const mockPlugin = {
      settings: createBaseSettings(),
      app: {},
      vaultScanner: {
        shouldShowScanningMessage: jest.fn().mockReturnValue(false),
        getTasks: jest.fn().mockReturnValue([]),
      },
      taskStateManager: {},
      taskUpdateCoordinator: {},
      keywordManager: {
        getSettings: jest
          .fn()
          .mockReturnValue({ useExtendedCheckboxStyles: false }),
        getCheckboxState: jest.fn().mockReturnValue(' '),
        isActive: jest.fn().mockReturnValue(false),
        isCompleted: jest.fn().mockReturnValue(false),
      },
    };
    renderer = new (EmbeddedTaskListRenderer as any)(mockPlugin);
  });

  describe('hasHeaderContent', () => {
    it('returns true when search query is present', () => {
      const params: TodoseqParameters = { searchQuery: 'todo' };
      const result = renderer.hasHeaderContent(params);
      expect(result).toBe(true);
    });

    it('returns true when sort method is non-default', () => {
      const params: TodoseqParameters = { sortMethod: 'priority' };
      const result = renderer.hasHeaderContent(params);
      expect(result).toBe(true);
    });

    it('returns true when completed filter is set', () => {
      const params: TodoseqParameters = { completed: 'hide' };
      const result = renderer.hasHeaderContent(params);
      expect(result).toBe(true);
    });

    it('returns true when future filter is set', () => {
      const params: TodoseqParameters = { future: 'hide' };
      const result = renderer.hasHeaderContent(params);
      expect(result).toBe(true);
    });

    it('returns true when limit is set', () => {
      const params: TodoseqParameters = { limit: 10 };
      const result = renderer.hasHeaderContent(params);
      expect(result).toBe(true);
    });

    it('returns true for default parameters (sortMethod undefined triggers content check)', () => {
      // Note: hasHeaderContent returns true when sortMethod is undefined because
      // undefined !== 'default' evaluates to true in the source code
      const params: TodoseqParameters = {};
      const result = renderer.hasHeaderContent(params);
      expect(result).toBe(true);
    });

    it('returns false when showQuery is false', () => {
      const params: TodoseqParameters = {
        searchQuery: 'todo',
        showQuery: false,
      };
      const result = renderer.hasHeaderContent(params);
      expect(result).toBe(false);
    });

    it('returns false when only sortMethod is default', () => {
      const params: TodoseqParameters = { sortMethod: 'default' };
      const result = renderer.hasHeaderContent(params);
      expect(result).toBe(false);
    });
  });

  describe('renderError', () => {
    it('renders error message in container', () => {
      const container = document.createElement('div');
      renderer.renderError(container, 'Something went wrong');

      expect(
        container.querySelector('.todoseq-embedded-task-list-error'),
      ).toBeTruthy();
      expect(
        container.querySelector('.todoseq-embedded-task-list-error-title')
          ?.textContent,
      ).toBe('Error rendering task list');
      expect(
        container.querySelector('.todoseq-embedded-task-list-error-message')
          ?.textContent,
      ).toBe('Something went wrong');
    });
  });

  describe('renderEmptyState', () => {
    it('shows scanning message when vault is scanning', () => {
      renderer.plugin.vaultScanner.shouldShowScanningMessage = jest
        .fn()
        .mockReturnValue(true);

      const container = document.createElement('div');
      renderer.renderEmptyState(container);

      const title = container.querySelector(
        '.todoseq-embedded-task-list-empty-title',
      );
      expect(title?.textContent).toBe('Scanning vault...');
    });

    it('shows loading message when no tasks exist yet', () => {
      renderer.plugin.vaultScanner.shouldShowScanningMessage = jest
        .fn()
        .mockReturnValue(false);
      renderer.plugin.vaultScanner.getTasks = jest.fn().mockReturnValue([]);

      const container = document.createElement('div');
      renderer.renderEmptyState(container);

      const title = container.querySelector(
        '.todoseq-embedded-task-list-empty-title',
      );
      expect(title?.textContent).toBe('Loading tasks...');
    });

    it('shows no tasks found when vault scan is complete', () => {
      renderer.plugin.vaultScanner.shouldShowScanningMessage = jest
        .fn()
        .mockReturnValue(false);
      renderer.plugin.vaultScanner.getTasks = jest
        .fn()
        .mockReturnValue([createBaseTask()]);

      const container = document.createElement('div');
      renderer.renderEmptyState(container);

      const title = container.querySelector(
        '.todoseq-embedded-task-list-empty-title',
      );
      expect(title?.textContent).toBe('No tasks found');
    });
  });

  describe('renderCollapsedFooter', () => {
    it('shows count from totalTasksCount when provided', () => {
      const container = document.createElement('div');
      renderer.renderCollapsedFooter(container, 5, 10);

      expect(container.textContent).toBe('10 matching tasks');
    });

    it('shows singular form for one task', () => {
      const container = document.createElement('div');
      renderer.renderCollapsedFooter(container, 1, 1);

      expect(container.textContent).toBe('1 matching task');
    });

    it('falls back to taskCount when totalTasksCount is undefined', () => {
      const container = document.createElement('div');
      renderer.renderCollapsedFooter(container, 3, undefined);

      expect(container.textContent).toBe('3 matching tasks');
    });
  });

  describe('renderCollapsibleTitle', () => {
    it('creates title with correct text and role', () => {
      const container = document.createElement('div');
      const params: TodoseqParameters = { title: 'My Tasks' };
      const titleEl = renderer.renderCollapsibleTitle(
        container,
        params,
        true,
        5,
      );

      expect(titleEl.textContent).toContain('My Tasks');
      expect(titleEl.getAttribute('role')).toBe('button');
      expect(titleEl.getAttribute('aria-expanded')).toBe('false');
    });

    it('adds click handler when toggle callback provided', () => {
      const container = document.createElement('div');
      const params: TodoseqParameters = { title: 'Tasks' };
      const toggle = jest.fn();

      const titleEl = renderer.renderCollapsibleTitle(
        container,
        params,
        false,
        3,
        toggle,
        'id-1',
      );

      titleEl.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      expect(toggle).toHaveBeenCalledWith('id-1');
    });

    it('responds to Enter key for accessibility', () => {
      const container = document.createElement('div');
      const params: TodoseqParameters = { title: 'Tasks' };
      const toggle = jest.fn();

      const titleEl = renderer.renderCollapsibleTitle(
        container,
        params,
        false,
        3,
        toggle,
        'id-1',
      );

      titleEl.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
      );
      expect(toggle).toHaveBeenCalledWith('id-1');
    });

    it('does not add handlers when toggle callback missing', () => {
      const container = document.createElement('div');
      const params: TodoseqParameters = { title: 'Tasks' };

      const titleEl = renderer.renderCollapsibleTitle(
        container,
        params,
        true,
        3,
      );

      // Should not throw when clicked
      expect(() =>
        titleEl.dispatchEvent(new MouseEvent('click', { bubbles: true })),
      ).not.toThrow();
    });
  });

  describe('renderCollapsibleHeaderNoTitle', () => {
    it('renders search query in header', () => {
      const container = document.createElement('div');
      const params: TodoseqParameters = { searchQuery: 'test' };
      const header = renderer.renderCollapsibleHeaderNoTitle(
        container,
        params,
        true,
        5,
      );

      const searchSpan = header.querySelector(
        '.todoseq-embedded-task-list-search',
      );
      expect(searchSpan?.textContent).toBe('Search: test');
    });

    it('renders sort method in header', () => {
      const container = document.createElement('div');
      const params: TodoseqParameters = { sortMethod: 'priority' };
      const header = renderer.renderCollapsibleHeaderNoTitle(
        container,
        params,
        true,
        5,
      );

      const sortSpan = header.querySelector('.todoseq-embedded-task-list-sort');
      expect(sortSpan?.textContent).toBe('Sort: priority');
    });

    it('renders completed filter in header', () => {
      const container = document.createElement('div');
      const params: TodoseqParameters = { completed: 'hide' };
      const header = renderer.renderCollapsibleHeaderNoTitle(
        container,
        params,
        true,
        5,
      );

      const completedSpan = header.querySelector(
        '.todoseq-embedded-task-list-completed',
      );
      expect(completedSpan?.textContent).toBe('Completed: hide');
    });

    it('adds expanded class to chevron when not collapsed', () => {
      const container = document.createElement('div');
      const params: TodoseqParameters = {};
      const header = renderer.renderCollapsibleHeaderNoTitle(
        container,
        params,
        false,
        5,
      );

      const chevron = header.querySelector('.todoseq-collapse-toggle-icon');
      expect(chevron?.classList.contains('is-expanded')).toBe(true);
    });

    it('does not add expanded class when collapsed', () => {
      const container = document.createElement('div');
      const params: TodoseqParameters = {};
      const header = renderer.renderCollapsibleHeaderNoTitle(
        container,
        params,
        true,
        5,
      );

      const chevron = header.querySelector('.todoseq-collapse-toggle-icon');
      expect(chevron?.classList.contains('is-expanded')).toBe(false);
    });

    it('calls toggleCollapse when header clicked with callback', () => {
      const container = document.createElement('div');
      const params: TodoseqParameters = {};
      const toggle = jest.fn();

      const header = renderer.renderCollapsibleHeaderNoTitle(
        container,
        params,
        true,
        5,
        toggle,
        'id-42',
      );

      header.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      expect(toggle).toHaveBeenCalledWith('id-42');
    });

    it('responds to Enter key for accessibility', () => {
      const container = document.createElement('div');
      const params: TodoseqParameters = {};
      const toggle = jest.fn();

      const header = renderer.renderCollapsibleHeaderNoTitle(
        container,
        params,
        true,
        5,
        toggle,
        'id-42',
      );

      header.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
      );
      expect(toggle).toHaveBeenCalledWith('id-42');
    });
  });

  describe('renderTaskList - collapsible mode', () => {
    it('renders collapsed state with title', () => {
      const container = document.createElement('div');
      const params: TodoseqParameters = { collapse: true, title: 'My Tasks' };
      const toggle = jest.fn();

      renderer.renderTaskList(
        container,
        [createBaseTask({ text: 'Task 1' })],
        params,
        1,
        true,
        toggle,
        'id-1',
      );

      expect(
        container.querySelector('.todoseq-embedded-task-list-title'),
      ).toBeTruthy();
      expect(
        container.querySelector('.todoseq-result-count-footer'),
      ).toBeTruthy();
      expect(
        container.querySelector('.todoseq-embedded-task-list'),
      ).toBeFalsy();
    });

    it('renders expanded state with title and task list', () => {
      const container = document.createElement('div');
      const params: TodoseqParameters = { collapse: true, title: 'My Tasks' };
      const toggle = jest.fn();

      renderer.renderTaskList(
        container,
        [createBaseTask({ text: 'Task 1' })],
        params,
        1,
        false,
        toggle,
        'id-1',
      );

      expect(
        container.querySelector('.todoseq-embedded-task-list'),
      ).toBeTruthy();
    });

    it('does not render task list when collapsed without title', () => {
      const container = document.createElement('div');
      const params: TodoseqParameters = { collapse: true };
      const toggle = jest.fn();

      renderer.renderTaskList(
        container,
        [createBaseTask({ text: 'Task 1' })],
        params,
        1,
        true,
        toggle,
        'id-1',
      );

      expect(
        container.querySelector('.todoseq-result-count-footer'),
      ).toBeTruthy();
      expect(
        container.querySelector('.todoseq-embedded-task-list'),
      ).toBeFalsy();
    });

    it('renders empty state when no tasks in expanded mode', () => {
      const container = document.createElement('div');
      const params: TodoseqParameters = { collapse: true };
      const toggle = jest.fn();

      renderer.renderTaskList(container, [], params, 0, false, toggle, 'id-1');

      expect(
        container.querySelector('.todoseq-embedded-task-list-empty'),
      ).toBeTruthy();
    });

    it('renders truncated indicator when limit exceeded', () => {
      const container = document.createElement('div');
      const params: TodoseqParameters = {
        collapse: true,
        limit: 1,
      };
      const toggle = jest.fn();

      renderer.renderTaskList(
        container,
        [createBaseTask({ text: 'Task 1' })],
        params,
        3,
        false,
        toggle,
        'id-1',
      );

      const truncated = container.querySelector(
        '.todoseq-embedded-task-list-truncated',
      );
      expect(truncated?.textContent).toBe('2 more tasks not shown');
    });

    it('uses incremental update when container already exists', () => {
      const container = document.createElement('div');
      const params: TodoseqParameters = { collapse: true };
      const toggle = jest.fn();

      // First render to create the container
      renderer.renderTaskList(
        container,
        [createBaseTask({ text: 'Task 1' })],
        params,
        1,
        true,
        toggle,
        'id-1',
      );

      // Second render with same container ID should use updateCollapsibleList
      renderer.renderTaskList(
        container,
        [createBaseTask({ text: 'Task 2' })],
        params,
        1,
        false,
        toggle,
        'id-1',
      );

      // Should still have task list since expanded
      expect(
        container.querySelector('.todoseq-embedded-task-list'),
      ).toBeTruthy();
    });

    it('toggles container classes between collapsed and expanded', () => {
      const container = document.createElement('div');
      const params: TodoseqParameters = { collapse: true, title: 'Tasks' };
      const toggle = jest.fn();

      renderer.renderTaskList(
        container,
        [createBaseTask({ text: 'Task 1' })],
        params,
        1,
        true,
        toggle,
        'id-1',
      );

      const listContainer = container.querySelector(
        '.todoseq-embedded-task-list-container',
      ) as HTMLElement;
      expect(
        listContainer.classList.contains(
          'todoseq-embedded-task-list-collapsed',
        ),
      ).toBe(true);

      const titleEl = container.querySelector(
        '.todoseq-embedded-task-list-title',
      ) as HTMLElement;
      titleEl.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      expect(toggle).toHaveBeenCalledWith('id-1');

      renderer.renderTaskList(
        container,
        [createBaseTask({ text: 'Task 1' })],
        params,
        1,
        false,
        toggle,
        'id-1',
      );

      expect(
        listContainer.classList.contains(
          'todoseq-embedded-task-list-collapsed',
        ),
      ).toBe(false);
      expect(
        listContainer.classList.contains('todoseq-embedded-task-list-expanded'),
      ).toBe(true);
    });

    it('toggles container classes via header without title', () => {
      const container = document.createElement('div');
      const params: TodoseqParameters = {
        collapse: true,
        searchQuery: 'test',
      };
      const toggle = jest.fn();

      renderer.renderTaskList(
        container,
        [createBaseTask({ text: 'Task 1' })],
        params,
        1,
        true,
        toggle,
        'id-2',
      );

      const listContainer = container.querySelector(
        '.todoseq-embedded-task-list-container',
      ) as HTMLElement;
      expect(
        listContainer.classList.contains(
          'todoseq-embedded-task-list-collapsed',
        ),
      ).toBe(true);

      const header = container.querySelector(
        '.todoseq-embedded-task-list-header',
      ) as HTMLElement;
      header.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      expect(toggle).toHaveBeenCalledWith('id-2');

      renderer.renderTaskList(
        container,
        [createBaseTask({ text: 'Task 1' })],
        params,
        1,
        false,
        toggle,
        'id-2',
      );

      expect(
        listContainer.classList.contains('todoseq-embedded-task-list-expanded'),
      ).toBe(true);
      expect(
        listContainer.classList.contains(
          'todoseq-embedded-task-list-collapsed',
        ),
      ).toBe(false);
    });
  });

  describe('renderTaskList - standard mode', () => {
    it('renders title when provided', () => {
      const container = document.createElement('div');
      const params: TodoseqParameters = { title: 'Standard List' };

      renderer.renderTaskList(
        container,
        [createBaseTask({ text: 'Task 1' })],
        params,
      );

      const title = container.querySelector(
        '.todoseq-embedded-task-list-title',
      );
      expect(title?.textContent).toBe('Standard List');
    });

    it('renders bordered title when no header content', () => {
      const container = document.createElement('div');
      // sortMethod must be explicitly 'default' because undefined !== 'default'
      // evaluates to true in hasHeaderContent, which would prevent the border
      const params: TodoseqParameters = {
        title: 'Standard List',
        sortMethod: 'default',
      };

      renderer.renderTaskList(
        container,
        [createBaseTask({ text: 'Task 1' })],
        params,
      );

      const title = container.querySelector(
        '.todoseq-embedded-task-list-title',
      );
      expect(
        title?.classList.contains('todoseq-embedded-task-list-title-bordered'),
      ).toBe(true);
    });

    it('renders tasks in list', () => {
      const container = document.createElement('div');
      const params: TodoseqParameters = {};

      renderer.renderTaskList(
        container,
        [createBaseTask({ text: 'Task 1' })],
        params,
      );

      expect(
        container.querySelector('.todoseq-embedded-task-list'),
      ).toBeTruthy();
    });

    it('renders empty state when no tasks', () => {
      const container = document.createElement('div');
      const params: TodoseqParameters = {};

      renderer.renderTaskList(container, [], params);

      expect(
        container.querySelector('.todoseq-embedded-task-list-empty'),
      ).toBeTruthy();
    });
  });

  describe('updateSettings', () => {
    it('updates context menu config', () => {
      const mockUpdateConfig = jest.fn();
      renderer.taskContextMenu = { updateConfig: mockUpdateConfig };
      renderer.plugin.settings.weekStartsOn = 'Monday';
      renderer.plugin.settings.migrateToTodayState = 'MIGRATED';

      renderer.updateSettings();

      expect(mockUpdateConfig).toHaveBeenCalledWith({
        weekStartsOn: 'Monday',
        migrateToTodayState: 'MIGRATED',
      });
    });

    it('does not throw when taskContextMenu is null', () => {
      renderer.taskContextMenu = null;
      expect(() => renderer.updateSettings()).not.toThrow();
    });
  });
});
