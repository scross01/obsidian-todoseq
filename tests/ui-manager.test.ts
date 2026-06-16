/**
 * @jest-environment jsdom
 *
 * Tests focusing on pure algorithmic logic: double-click detection timing,
 * leaf priority ordering, click handler delegation, cleanup, and edge cases.
 * Setup/formatting/rendering tests that mock everything are covered by
 * integration tests (smoke, editor-interactions, task-list-view).
 */

import { UIManager } from '../src/ui-manager';
import { installObsidianDomMocks } from './helpers/obsidian-dom-mock';

// Mock obsidian - kept minimal, only what the kept tests need
jest.mock('obsidian', () => ({
  MarkdownView: jest.fn().mockImplementation(function () {
    this.file = null;
    this.editor = { cm: null };
    this.containerEl = activeDocument.createElement('div');
  }),
  WorkspaceLeaf: jest.fn(),
  TFile: jest.fn().mockImplementation(function (path: string) {
    this.path = path;
  }),
  Notice: jest.fn(),
  Platform: { isMobile: false },
}));

jest.mock('@codemirror/view', () => ({
  EditorView: jest.fn().mockImplementation(function () {
    this.dom = activeDocument.createElement('div');
    this.state = { doc: { lineAt: jest.fn().mockReturnValue({ number: 1 }) } };
  }),
}));

jest.mock('../src/view/editor-extensions/task-formatting', () => ({
  taskKeywordPlugin: jest.fn().mockReturnValue([]),
}));

jest.mock('../src/view/editor-extensions/date-autocomplete', () => ({
  dateAutocompleteExtension: jest.fn().mockReturnValue([]),
}));

jest.mock('../src/view/task-list/task-list-view', () => {
  const TaskListView = jest.fn().mockImplementation(function () {
    this.getViewType = jest.fn().mockReturnValue('todoseq-view');
    this.updateTasks = jest.fn();
    this.refreshVisibleList = jest.fn().mockResolvedValue(undefined);
  }) as any;
  TaskListView.viewType = 'todoseq-view';
  return { TaskListView, TaskListViewMode: jest.fn() };
});

jest.mock('../src/services/task-update-coordinator', () => ({
  getStateTransitionManager: jest.fn().mockReturnValue({
    getNextState: jest.fn().mockReturnValue('DOING'),
    getNextCompletedOrArchivedState: jest.fn().mockReturnValue('DONE'),
    isCompletedState: jest.fn().mockReturnValue(false),
  }),
}));

beforeAll(() => {
  installObsidianDomMocks();
});

describe('UIManager', () => {
  let uiManager: UIManager;
  let pluginMock: Record<string, unknown>;

  beforeEach(() => {
    const workspaceMock = {
      getLeavesOfType: jest.fn().mockReturnValue([]),
      getLeaf: jest.fn().mockReturnValue({
        setViewState: jest.fn().mockResolvedValue(undefined),
        view: null,
      }),
      getActiveViewOfType: jest.fn().mockReturnValue(null),
      revealLeaf: jest.fn().mockResolvedValue(undefined),
      rightSplit: { collapse: jest.fn() },
      on: jest.fn().mockReturnValue({ off: jest.fn() }),
    };

    const vaultMock = {
      getAbstractFileByPath: jest.fn().mockReturnValue(null),
    };

    const appMock = {
      workspace: workspaceMock,
      vault: vaultMock,
    };

    const taskFormatters = new Map();

    const editorControllerMock = {
      handleToggleTaskStateAtCursor: jest.fn().mockReturnValue(true),
      handleCycleTaskStateAtCursor: jest.fn().mockReturnValue(true),
      handleUpdateTaskStateAtLine: jest.fn(),
      parseTaskFromLine: jest.fn(),
    };

    const taskStateManagerMock = {
      findTaskByPathAndLine: jest.fn().mockReturnValue(null),
      updateParentSubtaskCountsForCheckbox: jest.fn(),
    };

    pluginMock = {
      app: appMock,
      settings: {
        formatTaskKeywords: true,
      },
      taskFormatters: taskFormatters,
      registerEditorExtension: jest.fn().mockReturnValue([]),
      registerEvent: jest.fn().mockReturnValue({
        unload: jest.fn(),
      }),
      editorController: editorControllerMock,
      taskStateManager: taskStateManagerMock,
      taskUpdateCoordinator: {
        updateTaskByPath: jest.fn().mockResolvedValue(undefined),
      },
      taskEditor: null,
      getTasks: jest.fn().mockReturnValue([]),
      refreshAllTaskListViews: jest.fn(),
      vaultScanner: { getParser: jest.fn().mockReturnValue(null) },
      editorKeywordMenu: {
        openStateMenuAtMouseEvent: jest.fn(),
      },
    };

    uiManager = new UIManager(pluginMock as any);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ---------------------------------------------------------------------------
  // Construction
  // ---------------------------------------------------------------------------
  describe('constructor', () => {
    it('should create ui manager with plugin reference', () => {
      expect(uiManager).toBeDefined();
    });
  });

  // ---------------------------------------------------------------------------
  // DOM helpers (pure utility)
  // ---------------------------------------------------------------------------
  describe('getLineForElement', () => {
    it('should return null when no editor view found', () => {
      const element = activeDocument.createElement('div');
      const result = uiManager.getLineForElement(element);
      expect(result).toBeNull();
    });
  });

  describe('getEditorViewFromElement', () => {
    it('should return null when no editor container found', () => {
      const element = activeDocument.createElement('span');
      const result = uiManager.getEditorViewFromElement(element);
      expect(result).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // Cleanup (lifecycle)
  // ---------------------------------------------------------------------------
  describe('cleanup', () => {
    it('should remove all event listeners', () => {
      const target = activeDocument.createElement('div');
      const handler = jest.fn();
      target.addEventListener('click', handler);

      (uiManager as any).registeredEventListeners = [
        { target, type: 'click', handler },
      ];

      uiManager.cleanup();

      expect(() => uiManager.cleanup()).not.toThrow();
    });

    it('should clear pending timeouts', () => {
      (uiManager as any).pendingClickTimeout = window.setTimeout(
        () => {},
        1000,
      );
      uiManager.cleanup();
      expect(() => uiManager.cleanup()).not.toThrow();
    });
  });

  // ---------------------------------------------------------------------------
  // Leaf priority ordering (pure algorithmic logic)
  // ---------------------------------------------------------------------------
  describe('findTaskLeafInPriorityOrder', () => {
    it('should prioritize right sidebar leaf', () => {
      const rightLeaf = {
        getRoot: jest.fn().mockReturnValue({
          containerEl: (() => {
            const el = activeDocument.createElement('div');
            el.classList.add('mod-right-split');
            return el;
          })(),
        }),
      };
      const leftLeaf = {
        getRoot: jest.fn().mockReturnValue({
          containerEl: (() => {
            const el = activeDocument.createElement('div');
            el.classList.add('mod-left-split');
            return el;
          })(),
        }),
      };

      const result = (uiManager as any).findTaskLeafInPriorityOrder([
        leftLeaf,
        rightLeaf,
      ]);
      expect(result).toBe(rightLeaf);
    });

    it('should fallback to left sidebar if no right sidebar', () => {
      const leftLeaf = {
        getRoot: jest.fn().mockReturnValue({
          containerEl: (() => {
            const el = activeDocument.createElement('div');
            el.classList.add('mod-left-split');
            return el;
          })(),
        }),
      };

      const result = (uiManager as any).findTaskLeafInPriorityOrder([leftLeaf]);
      expect(result).toBe(leftLeaf);
    });

    it('should fallback to first leaf if no sidebar match', () => {
      const tabLeaf = {
        getRoot: jest.fn().mockReturnValue({
          containerEl: activeDocument.createElement('div'),
        }),
      };

      const result = (uiManager as any).findTaskLeafInPriorityOrder([tabLeaf]);
      expect(result).toBe(tabLeaf);
    });

    it('should return null for empty leaves array', () => {
      const result = (uiManager as any).findTaskLeafInPriorityOrder([]);
      expect(result).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // Click state management (pure timing logic)
  // ---------------------------------------------------------------------------
  describe('cancelPendingClick', () => {
    it('should clear pending timeout and reset state', () => {
      const clearTimeoutSpy = jest.spyOn(window, 'clearTimeout');
      const removeEventListenerSpy = jest.spyOn(
        window.activeDocument,
        'removeEventListener',
      );

      const timeout = window.setTimeout(() => {}, 1000);
      (uiManager as any).pendingClickTimeout = timeout;
      (uiManager as any).mouseMoveHandler = jest.fn();
      (uiManager as any).mouseUpHandler = jest.fn();
      (uiManager as any).lastClickedElement =
        activeDocument.createElement('div');
      (uiManager as any).lastClickTime = 999;
      (uiManager as any).isMouseDownOnKeyword = true;

      (uiManager as any).cancelPendingClick();

      expect(clearTimeoutSpy).toHaveBeenCalledWith(timeout);
      expect(removeEventListenerSpy).toHaveBeenCalledWith(
        'mousemove',
        expect.any(Function),
      );
      expect(removeEventListenerSpy).toHaveBeenCalledWith(
        'mouseup',
        expect.any(Function),
      );
      expect((uiManager as any).pendingClickTimeout).toBeNull();
      expect((uiManager as any).mouseMoveHandler).toBeNull();
      expect((uiManager as any).mouseUpHandler).toBeNull();
      expect((uiManager as any).lastClickedElement).toBeNull();
      expect((uiManager as any).lastClickTime).toBe(0);
      expect((uiManager as any).isMouseDownOnKeyword).toBe(false);
    });

    it('should handle case with no pending state', () => {
      (uiManager as any).pendingClickTimeout = null;
      (uiManager as any).mouseMoveHandler = null;
      (uiManager as any).mouseUpHandler = null;

      expect(() => (uiManager as any).cancelPendingClick()).not.toThrow();
    });
  });

  // ---------------------------------------------------------------------------
  // Keyword click handler (delegation logic)
  // ---------------------------------------------------------------------------
  describe('handleTaskKeywordClick', () => {
    it('should call handleUpdateTaskStateAtLine with correct args', async () => {
      const keywordElement = activeDocument.createElement('span');
      keywordElement.setAttribute('data-task-keyword', 'TODO');

      const view = { editor: {} };
      const getLineSpy = jest
        .spyOn(uiManager as any, 'getLineForElement')
        .mockReturnValue(5);

      await (uiManager as any).handleTaskKeywordClick(keywordElement, view);

      expect(getLineSpy).toHaveBeenCalledWith(keywordElement);
      expect(
        (pluginMock.editorController as any).handleUpdateTaskStateAtLine,
      ).toHaveBeenCalledWith(false, 4, view.editor, view);
    });

    it('should do nothing when keyword element has no data-task-keyword', async () => {
      const keywordElement = activeDocument.createElement('span');
      const view = { editor: {} };

      await (uiManager as any).handleTaskKeywordClick(keywordElement, view);

      expect(
        (pluginMock.editorController as any).handleUpdateTaskStateAtLine,
      ).not.toHaveBeenCalled();
    });

    it('should do nothing when getLineForElement returns null', async () => {
      const keywordElement = activeDocument.createElement('span');
      keywordElement.setAttribute('data-task-keyword', 'TODO');
      const view = { editor: {} };

      jest.spyOn(uiManager as any, 'getLineForElement').mockReturnValue(null);

      await (uiManager as any).handleTaskKeywordClick(keywordElement, view);

      expect(
        (pluginMock.editorController as any).handleUpdateTaskStateAtLine,
      ).not.toHaveBeenCalled();
    });

    it('should call preventDefault and stopPropagation when event is provided', async () => {
      const keywordElement = activeDocument.createElement('span');
      keywordElement.setAttribute('data-task-keyword', 'TODO');

      const view = { editor: {} };
      const event = new MouseEvent('click', { bubbles: true });
      const preventDefaultSpy = jest.spyOn(event, 'preventDefault');
      const stopPropagationSpy = jest.spyOn(event, 'stopPropagation');

      jest.spyOn(uiManager as any, 'getLineForElement').mockReturnValue(3);

      await (uiManager as any).handleTaskKeywordClick(
        keywordElement,
        view,
        event,
      );

      expect(preventDefaultSpy).toHaveBeenCalled();
      expect(stopPropagationSpy).toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // Double-click detection (pure timing logic — needs fake timers)
  // ---------------------------------------------------------------------------
  describe('handleTaskKeywordClickWithDoubleClickDetection', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
      jest.restoreAllMocks();
    });

    it('should process single click after 300ms timeout', () => {
      let fakeTime = 1000;
      jest.spyOn(Date, 'now').mockImplementation(() => fakeTime);

      const keywordElement = activeDocument.createElement('span');
      keywordElement.setAttribute('data-task-keyword', 'TODO');
      const view = { editor: {} };
      const event = new MouseEvent('click');

      const handleTaskKeywordClickSpy = jest
        .spyOn(uiManager as any, 'handleTaskKeywordClick')
        .mockResolvedValue(undefined);

      (uiManager as any).handleTaskKeywordClickWithDoubleClickDetection(
        keywordElement,
        view,
        event,
      );

      // Not called yet - waiting for timeout
      expect(handleTaskKeywordClickSpy).not.toHaveBeenCalled();

      // Advance timers past the 300ms threshold
      jest.advanceTimersByTime(300);

      expect(handleTaskKeywordClickSpy).toHaveBeenCalledWith(
        keywordElement,
        view,
        event,
      );
    });

    it('should suppress double-click within 300ms', () => {
      let fakeTime = 1000;
      jest.spyOn(Date, 'now').mockImplementation(() => fakeTime);

      const keywordElement = activeDocument.createElement('span');
      keywordElement.setAttribute('data-task-keyword', 'TODO');
      const view = { editor: {} };

      const handleTaskKeywordClickSpy = jest
        .spyOn(uiManager as any, 'handleTaskKeywordClick')
        .mockResolvedValue(undefined);

      // First click at time 1000
      (uiManager as any).handleTaskKeywordClickWithDoubleClickDetection(
        keywordElement,
        view,
        new MouseEvent('click'),
      );

      // Second click at time 1150 (within 300ms)
      fakeTime = 1150;
      (uiManager as any).handleTaskKeywordClickWithDoubleClickDetection(
        keywordElement,
        view,
        new MouseEvent('click'),
      );

      // Advance timers past the 300ms threshold
      jest.advanceTimersByTime(300);

      // handleTaskKeywordClick should NOT have been called
      expect(handleTaskKeywordClickSpy).not.toHaveBeenCalled();
    });

    it('should cancel click when mouse leaves element during click', () => {
      let fakeTime = 1000;
      jest.spyOn(Date, 'now').mockImplementation(() => fakeTime);

      const keywordElement = activeDocument.createElement('span');
      keywordElement.setAttribute('data-task-keyword', 'TODO');
      const view = { editor: {} };
      const event = new MouseEvent('click');

      const handleTaskKeywordClickSpy = jest
        .spyOn(uiManager as any, 'handleTaskKeywordClick')
        .mockResolvedValue(undefined);

      (uiManager as any).handleTaskKeywordClickWithDoubleClickDetection(
        keywordElement,
        view,
        event,
      );

      // Simulate mouse moving outside the keyword element while button is down
      const moveEvent = new MouseEvent('mousemove', { buttons: 1 });
      Object.defineProperty(moveEvent, 'relatedTarget', {
        value: activeDocument.createElement('div'),
      });
      window.activeDocument.dispatchEvent(moveEvent);

      // Also simulate mouseup outside the keyword element
      const upEvent = new MouseEvent('mouseup');
      Object.defineProperty(upEvent, 'target', {
        value: activeDocument.body,
      });
      window.activeDocument.dispatchEvent(upEvent);

      // Advance timers past the 300ms threshold
      jest.advanceTimersByTime(300);

      // Should NOT have been called because click was cancelled
      expect(handleTaskKeywordClickSpy).not.toHaveBeenCalled();
    });

    it('should clean up mouse event listeners after timeout', () => {
      const removeEventListenerSpy = jest.spyOn(
        window.activeDocument,
        'removeEventListener',
      );

      const keywordElement = activeDocument.createElement('span');
      keywordElement.setAttribute('data-task-keyword', 'TODO');
      const view = { editor: {} };
      const event = new MouseEvent('click');

      jest
        .spyOn(uiManager as any, 'handleTaskKeywordClick')
        .mockResolvedValue(undefined);

      (uiManager as any).handleTaskKeywordClickWithDoubleClickDetection(
        keywordElement,
        view,
        event,
      );

      jest.advanceTimersByTime(300);

      expect(removeEventListenerSpy).toHaveBeenCalledWith(
        'mousemove',
        expect.any(Function),
      );
      expect(removeEventListenerSpy).toHaveBeenCalledWith(
        'mouseup',
        expect.any(Function),
      );
    });
  });
});
