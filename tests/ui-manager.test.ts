/**
 * @jest-environment jsdom
 */

import { UIManager } from '../src/ui-manager';
import { installObsidianDomMocks } from './helpers/obsidian-dom-mock';

// Mock obsidian
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

  describe('constructor', () => {
    it('should create ui manager with plugin reference', () => {
      expect(uiManager).toBeDefined();
    });
  });

  describe('setupTaskFormatting', () => {
    it('should setup editor decorations when enabled', () => {
      uiManager.setupTaskFormatting();
      expect(pluginMock.registerEditorExtension).toHaveBeenCalled();
    });

    it('should setup checkbox event listeners', () => {
      uiManager.setupTaskFormatting();
      // The checkbox listeners setup triggers registerEvent
      expect(pluginMock.registerEvent).toHaveBeenCalled();
    });
  });

  describe('updateTaskFormatting', () => {
    it('should clear and re-setup decorations', () => {
      uiManager.updateTaskFormatting();
      expect(pluginMock.registerEditorExtension).toHaveBeenCalled();
    });
  });

  describe('clearEditorDecorations', () => {
    it('should register empty extension', () => {
      uiManager.clearEditorDecorations();
      expect(pluginMock.registerEditorExtension).toHaveBeenCalledWith([]);
    });
  });

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

  describe('showTasks', () => {
    it('should find existing task leaf and reveal it', async () => {
      const existingLeaf = {
        view: { getViewType: jest.fn().mockReturnValue('todoseq-view') },
        getRoot: jest.fn().mockReturnValue({
          containerEl: activeDocument.createElement('div'),
        }),
      };
      (existingLeaf.getRoot as jest.Mock).mockReturnValue({
        containerEl: (() => {
          const el = activeDocument.createElement('div');
          el.classList.add('mod-right-split');
          return el;
        })(),
      });

      const workspace = (pluginMock.app as any).workspace;
      workspace.getLeavesOfType = jest.fn().mockReturnValue([existingLeaf]);

      await uiManager.showTasks();

      expect(workspace.getLeavesOfType).toHaveBeenCalledWith('todoseq-view');
    });

    it('should create new leaf when no existing task list found', async () => {
      const workspace = (pluginMock.app as any).workspace;
      workspace.getLeavesOfType = jest.fn().mockReturnValue([]);

      await uiManager.showTasks();

      expect(workspace.getLeaf).toHaveBeenCalled();
    });
  });

  describe('showTasksInNewTab', () => {
    it('should create a new tab with task list view', async () => {
      const workspace = (pluginMock.app as any).workspace;
      const newLeaf = {
        setViewState: jest.fn().mockResolvedValue(undefined),
      };
      workspace.getLeaf = jest.fn().mockReturnValue(newLeaf);

      await uiManager.showTasksInNewTab();

      expect(workspace.getLeaf).toHaveBeenCalledWith('tab');
      expect(newLeaf.setViewState).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'todoseq-view' }),
      );
    });
  });

  describe('cleanup', () => {
    it('should remove all event listeners', () => {
      // Add a mock listener
      const target = activeDocument.createElement('div');
      const handler = jest.fn();
      target.addEventListener('click', handler);

      (uiManager as any).registeredEventListeners = [
        { target, type: 'click', handler },
      ];

      uiManager.cleanup();

      // Verify cleanup doesn't throw
      expect(() => uiManager.cleanup()).not.toThrow();
    });

    it('should clear pending timeouts', () => {
      (uiManager as any).pendingClickTimeout = window.setTimeout(
        () => {},
        1000,
      );
      uiManager.cleanup();
      // Should not throw
      expect(() => uiManager.cleanup()).not.toThrow();
    });
  });

  describe('refreshOpenTaskListViews', () => {
    it('should refresh all open task list views', async () => {
      // TaskListView is mocked at the top of the file; instantiate via the mock constructor
      const TaskListViewMock = (
        jest.requireMock('../src/view/task-list/task-list-view') as any
      ).TaskListView;
      const taskListViewMock = new TaskListViewMock();

      const leafMock = {
        view: taskListViewMock,
      };

      const workspace = (pluginMock.app as any).workspace;
      workspace.getLeavesOfType = jest.fn().mockReturnValue([leafMock]);

      await uiManager.refreshOpenTaskListViews();

      expect(taskListViewMock.updateTasks).toHaveBeenCalled();
      expect(taskListViewMock.refreshVisibleList).toHaveBeenCalled();
    });
  });

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

  describe('setupEditorDecorations', () => {
    it('should register task formatting and date autocomplete extensions', () => {
      uiManager.setupEditorDecorations();

      const { taskKeywordPlugin } = jest.requireMock(
        '../src/view/editor-extensions/task-formatting',
      );
      const { dateAutocompleteExtension } = jest.requireMock(
        '../src/view/editor-extensions/date-autocomplete',
      );

      expect(taskKeywordPlugin).toHaveBeenCalledWith(
        pluginMock.settings,
        expect.any(Function),
      );
      expect(dateAutocompleteExtension).toHaveBeenCalledWith(
        pluginMock.settings,
      );
      expect(pluginMock.registerEditorExtension).toHaveBeenCalledWith(
        expect.arrayContaining([expect.any(Array), expect.any(Array)]),
      );
      expect(
        pluginMock.taskFormatters.has('editor-extension'),
      ).toBe(true);
    });
  });

  describe('setupCheckboxEventListeners (formatting disabled)', () => {
    it('should return early when formatTaskKeywords is false', () => {
      (pluginMock.settings as any).formatTaskKeywords = false;
      const workspace = (pluginMock.app as any).workspace;

      uiManager.setupCheckboxEventListeners();

      // Should not query leaves or register events when disabled
      expect(workspace.getLeavesOfType).not.toHaveBeenCalled();
      expect(pluginMock.registerEvent).not.toHaveBeenCalled();
    });
  });

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

      expect(
        () => (uiManager as any).cancelPendingClick(),
      ).not.toThrow();
    });
  });

  describe('handleTaskKeywordClick', () => {
    it('should call handleUpdateTaskStateAtLine with correct args', async () => {
      const keywordElement = activeDocument.createElement('span');
      keywordElement.setAttribute('data-task-keyword', 'TODO');

      const view = { editor: {} };
      const getLineSpy = jest
        .spyOn(uiManager as any, 'getLineForElement')
        .mockReturnValue(5);

      await (uiManager as any).handleTaskKeywordClick(
        keywordElement,
        view,
      );

      expect(getLineSpy).toHaveBeenCalledWith(keywordElement);
      expect(
        (pluginMock.editorController as any)
          .handleUpdateTaskStateAtLine,
      ).toHaveBeenCalledWith(false, 4, view.editor, view);
    });

    it('should do nothing when keyword element has no data-task-keyword', async () => {
      const keywordElement = activeDocument.createElement('span');
      const view = { editor: {} };

      await (uiManager as any).handleTaskKeywordClick(
        keywordElement,
        view,
      );

      expect(
        (pluginMock.editorController as any)
          .handleUpdateTaskStateAtLine,
      ).not.toHaveBeenCalled();
    });

    it('should do nothing when getLineForElement returns null', async () => {
      const keywordElement = activeDocument.createElement('span');
      keywordElement.setAttribute('data-task-keyword', 'TODO');
      const view = { editor: {} };

      jest
        .spyOn(uiManager as any, 'getLineForElement')
        .mockReturnValue(null);

      await (uiManager as any).handleTaskKeywordClick(
        keywordElement,
        view,
      );

      expect(
        (pluginMock.editorController as any)
          .handleUpdateTaskStateAtLine,
      ).not.toHaveBeenCalled();
    });

    it('should call preventDefault and stopPropagation when event is provided', async () => {
      const keywordElement = activeDocument.createElement('span');
      keywordElement.setAttribute('data-task-keyword', 'TODO');

      const view = { editor: {} };
      const event = new MouseEvent('click', { bubbles: true });
      const preventDefaultSpy = jest.spyOn(event, 'preventDefault');
      const stopPropagationSpy = jest.spyOn(event, 'stopPropagation');

      jest
        .spyOn(uiManager as any, 'getLineForElement')
        .mockReturnValue(3);

      await (uiManager as any).handleTaskKeywordClick(
        keywordElement,
        view,
        event,
      );

      expect(preventDefaultSpy).toHaveBeenCalled();
      expect(stopPropagationSpy).toHaveBeenCalled();
    });
  });

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
      jest
        .spyOn(Date, 'now')
        .mockImplementation(() => fakeTime);

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
      jest
        .spyOn(Date, 'now')
        .mockImplementation(() => fakeTime);

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
      jest
        .spyOn(Date, 'now')
        .mockImplementation(() => fakeTime);

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

  describe('setupTaskKeywordContextMenu', () => {
    it('should register file-open event and add context menu immediately', () => {
      const addContextMenuSpy = jest.spyOn(
        uiManager as any,
        'addContextMenuToEditor',
      );

      uiManager.setupTaskKeywordContextMenu();

      expect(pluginMock.registerEvent).toHaveBeenCalled();
      expect(addContextMenuSpy).toHaveBeenCalledTimes(1);
    });

    it('should trigger addContextMenuToEditor when .md file is opened', () => {
      jest.useFakeTimers();

      const addContextMenuSpy = jest.spyOn(
        uiManager as any,
        'addContextMenuToEditor',
      );

      uiManager.setupTaskKeywordContextMenu();

      // Reset to count only subsequent calls
      addContextMenuSpy.mockClear();

      // Get the file-open callback
      const { TFile } = jest.requireMock('obsidian');
      const fileOpenCallback = (
        pluginMock.app.workspace.on as jest.Mock
      ).mock.calls.find(
        (call: [string]) => call[0] === 'file-open',
      )?.[1];

      expect(fileOpenCallback).toBeDefined();

      // Trigger with a .md file — set extension since mock TFile doesn't define it
      const mdFile = new TFile('test.md');
      mdFile.extension = 'md';
      fileOpenCallback(mdFile);

      // Should not be called yet (waiting for 100ms timeout)
      expect(addContextMenuSpy).not.toHaveBeenCalled();

      jest.advanceTimersByTime(100);

      expect(addContextMenuSpy).toHaveBeenCalledTimes(1);

      // Non-.md files should not trigger the context menu
      addContextMenuSpy.mockClear();
      const nonMdFile = new TFile('notes.txt');
      nonMdFile.extension = 'txt';
      fileOpenCallback(nonMdFile);
      jest.advanceTimersByTime(100);
      expect(addContextMenuSpy).not.toHaveBeenCalled();

      jest.useRealTimers();
    });
  });

  describe('setupCheckboxEventListeners with active editor', () => {
    it('should attach click/touch listeners to editor DOM', () => {
      const { MarkdownView } = jest.requireMock('obsidian');
      const view = new MarkdownView() as any;
      const editorDom = activeDocument.createElement('div');
      view.editor = { cm: { dom: editorDom } };
      view.file = { path: 'test.md' };

      const workspace = (pluginMock.app as any).workspace;
      workspace.getLeavesOfType = jest
        .fn()
        .mockImplementation((type: string) => {
          if (type === 'markdown') return [{ view }];
          return [];
        });

      const addEventListenerSpy = jest.spyOn(
        editorDom,
        'addEventListener',
      );

      uiManager.setupCheckboxEventListeners();

      // Should have registered workspace events
      expect(pluginMock.registerEvent).toHaveBeenCalled();

      // Should have attached click listener with capture
      expect(addEventListenerSpy).toHaveBeenCalledWith(
        'click',
        expect.any(Function),
        { capture: true },
      );

      // Should have attached touchstart listener with capture + passive
      expect(addEventListenerSpy).toHaveBeenCalledWith(
        'touchstart',
        expect.any(Function),
        { capture: true, passive: true },
      );

      // Should have attached touchend listener with capture
      expect(addEventListenerSpy).toHaveBeenCalledWith(
        'touchend',
        expect.any(Function),
        { capture: true },
      );

      // Should have tracked listeners in registeredEventListeners
      const registeredListeners = (
        uiManager as any
      ).registeredEventListeners;
      const editorListeners = registeredListeners.filter(
        (l: { target: HTMLElement }) => l.target === editorDom,
      );
      expect(editorListeners.length).toBe(3);
    });
  });
});
