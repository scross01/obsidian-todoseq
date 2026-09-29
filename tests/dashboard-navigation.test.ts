/**
 * Unit tests for the dashboard drill-through navigation API (plan 020 Step 5):
 * TaskListView.applyQueryAndRefresh and UIManager.showTasksWithQuery.
 *
 * @jest-environment jsdom
 */
import { TaskListView } from '../src/view/task-list/task-list-view';
import { UIManager } from '../src/ui-manager';
import TodoTracker from '../src/main';
import { WorkspaceLeaf } from 'obsidian';
import { installObsidianDomMocks } from './helpers/obsidian-dom-mock';
import { createBaseSettings } from './helpers/test-helper';

installObsidianDomMocks();

// Minimal obsidian mock: callable/constructible stubs for every name the
// task-list-view and ui-manager module graphs reference at import time.
jest.mock('obsidian', () => {
  const anyStub = (): unknown =>
    jest.fn() as unknown as new (...args: unknown[]) => unknown;
  const base: Record<string, unknown> = {
    Platform: { isMobile: false, isMacOS: false, isIosApp: false },
  };
  return new Proxy(base, {
    get(target, prop) {
      if (prop in target) {
        return target[prop];
      }
      if (prop === '__esModule') {
        return true;
      }
      target[prop as string] = anyStub();
      return target[prop as string];
    },
    has() {
      return true;
    },
  });
});

jest.mock('../src/main', () => ({
  TASK_VIEW_ICON: 'list-todo',
  default: class MockTodoTracker {},
}));

jest.mock('@codemirror/view', () => ({
  EditorView: jest.fn(),
}));

jest.mock('../src/view/editor-extensions/task-formatting', () => ({
  taskKeywordPlugin: jest.fn().mockReturnValue([]),
}));

jest.mock('../src/view/editor-extensions/date-autocomplete', () => ({
  dateAutocompleteExtension: jest.fn().mockReturnValue([]),
}));

jest.mock('../src/services/task-update-coordinator', () => ({
  getStateTransitionManager: jest.fn().mockReturnValue({
    getNextState: jest.fn().mockReturnValue('DOING'),
    isCompletedState: jest.fn().mockReturnValue(false),
  }),
}));

type ViewWithStubs = TaskListView & {
  applyQueryAndRefresh: jest.Mock;
};

/** Attach Obsidian's getAttr/setAttr extensions to a plain element. */
function withObsidianAttrs(el: HTMLElement): HTMLElement {
  const host = el as HTMLElement & {
    getAttr: (name: string) => string | null;
    setAttr: (name: string, value: string) => void;
  };
  host.getAttr = function (name: string): string | null {
    return this.getAttribute(name);
  };
  host.setAttr = function (name: string, value: string): void {
    this.setAttribute(name, value);
  };
  return el;
}

/** A view instance built without running the (heavy) constructor. */
function makeBareView(): ViewWithStubs {
  return Object.create(TaskListView.prototype) as ViewWithStubs;
}

describe('TaskListView.applyQueryAndRefresh', () => {
  it('sets the input value, the data-search view state, and refreshes', async () => {
    const view = makeBareView();
    const input = document.createElement('input');
    const contentEl = withObsidianAttrs(document.createElement('div'));
    const updateSaveSearchBtnVisibility = jest.fn();
    const refreshVisibleList = jest.fn().mockResolvedValue(undefined);

    Object.defineProperty(view, 'contentEl', { value: contentEl });
    Object.defineProperty(view, 'searchInputEl', { value: input });
    Object.defineProperty(view, 'updateSaveSearchBtnVisibility', {
      value: updateSaveSearchBtnVisibility,
    });
    Object.defineProperty(view, 'refreshVisibleList', {
      value: refreshVisibleList,
    });

    await view.applyQueryAndRefresh('(tag:project) priority:high');

    expect(input.value).toBe('(tag:project) priority:high');
    expect(
      (
        contentEl as HTMLElement & { getAttr: (n: string) => string | null }
      ).getAttr('data-search'),
    ).toBe('(tag:project) priority:high');
    expect(updateSaveSearchBtnVisibility).toHaveBeenCalledWith(
      '(tag:project) priority:high',
    );
    expect(refreshVisibleList).toHaveBeenCalledWith(true);
  });

  it('still records the query when the toolbar input is not rendered yet', async () => {
    const view = makeBareView();
    const contentEl = withObsidianAttrs(document.createElement('div'));
    Object.defineProperty(view, 'contentEl', { value: contentEl });
    // searchInputEl stays unset (view never opened its toolbar)
    const updateSaveSearchBtnVisibility = jest.fn();
    Object.defineProperty(view, 'updateSaveSearchBtnVisibility', {
      value: updateSaveSearchBtnVisibility,
    });
    Object.defineProperty(view, 'refreshVisibleList', {
      value: jest.fn().mockResolvedValue(undefined),
    });

    await expect(
      view.applyQueryAndRefresh('state:active'),
    ).resolves.toBeUndefined();
    expect(
      (
        contentEl as HTMLElement & { getAttr: (n: string) => string | null }
      ).getAttr('data-search'),
    ).toBe('state:active');
  });
});

describe('UIManager.showTasksWithQuery', () => {
  let workspace: Record<string, jest.Mock>;

  function makeLeaf(options: { inRightSidebar?: boolean } = {}): WorkspaceLeaf {
    const view = makeBareView();
    Object.defineProperty(view, 'applyQueryAndRefresh', {
      value: jest.fn().mockResolvedValue(undefined),
      writable: true,
      configurable: true,
    });
    const inRight = options.inRightSidebar ?? false;
    return {
      view,
      getRoot: () => ({
        containerEl: {
          classList: {
            contains: (cls: string): boolean =>
              cls === 'mod-right-split' && inRight,
          },
        },
      }),
      setViewState: jest.fn().mockResolvedValue(undefined),
    } as unknown as WorkspaceLeaf;
  }

  const viewOf = (leaf: WorkspaceLeaf): ViewWithStubs =>
    (leaf as unknown as { view: ViewWithStubs }).view;

  function makeUiManager(
    leaves: WorkspaceLeaf[],
    overrides: Partial<Record<string, jest.Mock>> = {},
  ): UIManager {
    workspace = {
      getLeavesOfType: jest.fn().mockReturnValue(leaves),
      getLeaf: jest.fn().mockReturnValue({}),
      revealLeaf: jest.fn().mockResolvedValue(undefined),
      getRightLeaf: jest.fn().mockReturnValue(null),
      createLeafBySplit: jest.fn(),
      ...overrides,
    };
    const pluginMock = {
      settings: createBaseSettings(),
      app: {
        workspace: workspace as unknown as TodoTracker['app']['workspace'],
      },
    };
    return new UIManager(pluginMock as unknown as TodoTracker);
  }

  it('reuses the existing leaf in priority order (right sidebar first)', async () => {
    const rightLeaf = makeLeaf({ inRightSidebar: true });
    const tabLeaf = makeLeaf();
    const active = {};
    const uiManager = makeUiManager([rightLeaf, tabLeaf], {
      getLeaf: jest.fn().mockReturnValue(active),
    });

    await uiManager.showTasksWithQuery('state:active');

    expect(viewOf(rightLeaf).applyQueryAndRefresh).toHaveBeenCalledWith(
      'state:active',
    );
    expect(viewOf(tabLeaf).applyQueryAndRefresh).not.toHaveBeenCalled();
    expect(workspace.revealLeaf).toHaveBeenCalledWith(rightLeaf);
  });

  it('does not reveal when the chosen leaf is already active', async () => {
    const rightLeaf = makeLeaf({ inRightSidebar: true });
    const uiManager = makeUiManager([rightLeaf], {
      getLeaf: jest.fn().mockReturnValue(rightLeaf),
    });

    await uiManager.showTasksWithQuery('priority:high');

    expect(workspace.revealLeaf).not.toHaveBeenCalled();
    expect(viewOf(rightLeaf).applyQueryAndRefresh).toHaveBeenCalledWith(
      'priority:high',
    );
  });

  it('falls back to the active tab leaf when no sidebar leaf exists', async () => {
    const tabLeaf = makeLeaf();
    const uiManager = makeUiManager([tabLeaf], {
      getLeaf: jest.fn().mockReturnValue({}),
    });

    await uiManager.showTasksWithQuery('priority:low');

    expect(viewOf(tabLeaf).applyQueryAndRefresh).toHaveBeenCalledWith(
      'priority:low',
    );
  });

  it('creates the task list in the right sidebar when none exists', async () => {
    const createdLeaf = makeLeaf({ inRightSidebar: true });
    const uiManager = makeUiManager([], {
      getLeaf: jest.fn().mockReturnValue({}),
      getRightLeaf: jest.fn().mockReturnValue(createdLeaf),
    });

    await uiManager.showTasksWithQuery('state:waiting');

    expect(workspace.getRightLeaf).toHaveBeenCalledWith(false);
    expect(createdLeaf.setViewState).toHaveBeenCalledWith({
      type: TaskListView.viewType,
      active: false,
    });
    expect(viewOf(createdLeaf).applyQueryAndRefresh).toHaveBeenCalledWith(
      'state:waiting',
    );
  });

  it('opens a new tab and applies the query when newTab is set', async () => {
    const newLeaf = makeLeaf();
    const uiManager = makeUiManager([makeLeaf({ inRightSidebar: true })], {
      getLeaf: jest.fn((arg: string | boolean) =>
        arg === 'tab' ? newLeaf : {},
      ),
    });

    await uiManager.showTasksWithQuery('tag:project', true);

    expect(workspace.getLeaf).toHaveBeenCalledWith('tab');
    expect(newLeaf.setViewState).toHaveBeenCalledWith({
      type: TaskListView.viewType,
      active: true,
    });
    expect(viewOf(newLeaf).applyQueryAndRefresh).toHaveBeenCalledWith(
      'tag:project',
    );
  });
});
