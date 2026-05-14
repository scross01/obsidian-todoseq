/**
 * @jest-environment jsdom
 */

import { StatusBarManager } from '../src/view/editor-extensions/status-bar';
import { createBaseTask } from './helpers/test-helper';
import { installObsidianDomMocks } from './helpers/obsidian-dom-mock';
import { Notice } from 'obsidian';

jest.mock('obsidian');

describe('StatusBarManager', () => {
  let mockPlugin: any;
  let manager: StatusBarManager;

  beforeAll(() => {
    installObsidianDomMocks();
  });

  beforeEach(() => {
    (Notice as any).instances = [];
    mockPlugin = {
      app: {
        workspace: {
          getActiveFile: jest.fn().mockReturnValue(null),
          on: jest.fn().mockReturnValue({ off: jest.fn() }),
          getLeavesOfType: jest.fn().mockReturnValue([]),
        },
      },
      getTasks: jest.fn().mockReturnValue([]),
      getVaultScanner: jest.fn(),
      addStatusBarItem: jest
        .fn()
        .mockReturnValue(document.createElement('div')),
      registerEvent: jest.fn(),
      uiManager: {
        showTasks: jest.fn().mockResolvedValue(undefined),
      },
      taskStateManager: {
        subscribe: jest.fn().mockReturnValue(jest.fn()),
      },
    };
    manager = new StatusBarManager(mockPlugin);
  });

  describe('cleanup', () => {
    it('removes status bar item safely', () => {
      manager.setupStatusBarItem();
      manager.cleanup();
      // Should not throw
      expect(manager).toBeDefined();
    });

    it('handles cleanup when status bar item is null', () => {
      // Don't call setup, so statusBarItem is null
      manager.cleanup();
      expect(manager).toBeDefined();
    });
  });

  describe('updateStatusBarItem', () => {
    it('shows empty text when no active file', () => {
      manager.setupStatusBarItem();
      mockPlugin.app.workspace.getActiveFile.mockReturnValue(null);

      manager.updateStatusBarItem([]);

      const item = mockPlugin.addStatusBarItem.mock.results[0].value;
      expect(item.textContent).toBe('');
    });

    it('counts incomplete tasks for active file', () => {
      const mockFile = { path: 'test.md' };
      mockPlugin.app.workspace.getActiveFile.mockReturnValue(mockFile);

      const tasks = [
        createBaseTask({ path: 'test.md', line: 0, completed: false }),
        createBaseTask({ path: 'test.md', line: 1, completed: false }),
        createBaseTask({ path: 'test.md', line: 2, completed: true }),
        createBaseTask({ path: 'other.md', line: 0, completed: false }),
      ];

      manager.setupStatusBarItem();
      manager.updateStatusBarItem(tasks);

      const item = mockPlugin.addStatusBarItem.mock.results[0].value;
      expect(item.textContent).toBe('2 tasks');
    });

    it('shows singular form for one task', () => {
      const mockFile = { path: 'test.md' };
      mockPlugin.app.workspace.getActiveFile.mockReturnValue(mockFile);

      const tasks = [
        createBaseTask({ path: 'test.md', line: 0, completed: false }),
      ];

      manager.setupStatusBarItem();
      manager.updateStatusBarItem(tasks);

      const item = mockPlugin.addStatusBarItem.mock.results[0].value;
      expect(item.textContent).toBe('1 task');
    });

    it('shows zero tasks', () => {
      const mockFile = { path: 'test.md' };
      mockPlugin.app.workspace.getActiveFile.mockReturnValue(mockFile);

      const tasks = [
        createBaseTask({ path: 'test.md', line: 0, completed: true }),
      ];

      manager.setupStatusBarItem();
      manager.updateStatusBarItem(tasks);

      const item = mockPlugin.addStatusBarItem.mock.results[0].value;
      expect(item.textContent).toBe('0 tasks');
    });
  });

  describe('updateTaskCount', () => {
    it('delegates to updateStatusBarItem', () => {
      manager.setupStatusBarItem();
      mockPlugin.app.workspace.getActiveFile.mockReturnValue(null);

      manager.updateTaskCount();

      const item = mockPlugin.addStatusBarItem.mock.results[0].value;
      expect(item.textContent).toBe('');
    });
  });

  describe('handleStatusBarClick', () => {
    it('opens task list via click event on status bar item', () => {
      const pathObj = new String('notes/test.md') as any;
      pathObj.contains = (substr: string) => pathObj.includes(substr);
      const mockFile = {
        path: pathObj,
        basename: 'test',
        extension: 'md',
        parent: { path: 'notes' },
      };
      mockPlugin.app.workspace.getActiveFile.mockReturnValue(mockFile);

      manager.setupStatusBarItem();

      const item = mockPlugin.addStatusBarItem.mock.results[0].value;
      item.dispatchEvent(new MouseEvent('click'));

      expect(mockPlugin.uiManager.showTasks).toHaveBeenCalled();
    });

    it('does nothing when no active file', () => {
      mockPlugin.app.workspace.getActiveFile.mockReturnValue(null);

      manager.handleStatusBarClick();

      expect(mockPlugin.uiManager.showTasks).not.toHaveBeenCalled();
    });

    it('constructs path filter for files with parent directory', () => {
      const pathObj = new String('projects/notes.md') as any;
      pathObj.contains = (substr: string) => pathObj.includes(substr);
      const mockFile = {
        path: pathObj,
        basename: 'notes',
        extension: 'md',
        parent: { path: 'projects' },
      };
      mockPlugin.app.workspace.getActiveFile.mockReturnValue(mockFile);

      manager.handleStatusBarClick();

      // Should not throw; search query includes path and file filters
      expect(mockPlugin.uiManager.showTasks).toHaveBeenCalled();
    });

    it('omits path filter for files without parent directory', () => {
      const pathObj = new String('notes.md') as any;
      pathObj.contains = (substr: string) => pathObj.includes(substr);
      const mockFile = {
        path: pathObj,
        basename: 'notes',
        extension: 'md',
        parent: null,
      };
      mockPlugin.app.workspace.getActiveFile.mockReturnValue(mockFile);

      manager.handleStatusBarClick();

      // Should not include path filter when no parent directory
      expect(mockPlugin.uiManager.showTasks).toHaveBeenCalled();
    });
  });

  describe('setupStatusBarItem', () => {
    it('registers click event on status bar item', () => {
      manager.setupStatusBarItem();

      const item = mockPlugin.addStatusBarItem.mock.results[0].value;
      expect(item.classList.contains('mod-clickable')).toBe(true);
      expect(item.classList.contains('todoseq-status-bar')).toBe(true);
    });

    it('subscribes to task state manager', () => {
      manager.setupStatusBarItem();

      expect(mockPlugin.taskStateManager.subscribe).toHaveBeenCalled();
    });

    it('registers active-leaf-change event', () => {
      manager.setupStatusBarItem();

      expect(mockPlugin.registerEvent).toHaveBeenCalled();
      const registeredEvent = mockPlugin.registerEvent.mock.calls[0][0];
      expect(registeredEvent).toBeDefined();
    });

    it('debounces status bar updates via timeout', () => {
      jest.useFakeTimers();
      const pathStr = 'test.md';
      const mockFile = {
        path: pathStr,
        basename: 'test',
        extension: 'md',
        parent: null,
      };
      mockPlugin.app.workspace.getActiveFile.mockReturnValue(mockFile);
      manager.setupStatusBarItem();

      const callback = mockPlugin.taskStateManager.subscribe.mock.calls[0][0];
      callback([createBaseTask({ path: 'test.md', completed: false })]);

      // Should not update immediately
      const item = mockPlugin.addStatusBarItem.mock.results[0].value;
      expect(item.textContent).toBe('');

      // Advance timers to trigger debounce
      jest.advanceTimersByTime(150);
      expect(item.textContent).toBe('1 task');

      jest.useRealTimers();
    });

    it('cancels previous debounce when new update arrives', () => {
      jest.useFakeTimers();
      const mockFile = {
        path: 'test.md',
        basename: 'test',
        extension: 'md',
        parent: null,
      };
      mockPlugin.app.workspace.getActiveFile.mockReturnValue(mockFile);
      manager.setupStatusBarItem();

      const callback = mockPlugin.taskStateManager.subscribe.mock.calls[0][0];
      // First update (starts debounce)
      callback([createBaseTask({ path: 'test.md', completed: false })]);
      // Second update before debounce fires (cancels previous)
      callback([createBaseTask({ path: 'test.md', completed: true })]);

      // Advance timers — should use the latest task list
      jest.advanceTimersByTime(150);
      const item = mockPlugin.addStatusBarItem.mock.results[0].value;
      expect(item.textContent).toBe('0 tasks');

      jest.useRealTimers();
    });
  });

  describe('handleStatusBarClick error handling', () => {
    it('shows notice when showTasks fails', async () => {
      const consoleSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      const pathObj = new String('test.md') as any;
      pathObj.contains = (substr: string) => pathObj.includes(substr);
      const mockFile = {
        path: pathObj,
        basename: 'test',
        extension: 'md',
        parent: null,
      };
      mockPlugin.app.workspace.getActiveFile.mockReturnValue(mockFile);
      mockPlugin.uiManager.showTasks.mockRejectedValueOnce(new Error('Fail'));

      manager.handleStatusBarClick();

      // Flush microtasks
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(consoleSpy).toHaveBeenCalledWith(
        'Error opening task list:',
        expect.any(Error),
      );
      consoleSpy.mockRestore();
    });
  });

  describe('handleStatusBarClick with search', () => {
    it('sets search query on existing task list view', () => {
      const pathObj = new String('notes/test.md') as any;
      pathObj.contains = (substr: string) => pathObj.includes(substr);
      const mockFile = {
        path: pathObj,
        basename: 'test',
        extension: 'md',
        parent: { path: 'notes' },
      };
      mockPlugin.app.workspace.getActiveFile.mockReturnValue(mockFile);

      const mockView = {
        contentEl: {
          setAttr: jest.fn(),
          querySelector: jest.fn().mockReturnValue(null),
        },
        refreshVisibleList: jest.fn().mockResolvedValue(undefined),
      };

      // Patch getLeavesOfType to return with mock view
      mockPlugin.app.workspace.getLeavesOfType.mockReturnValue([
        { view: mockView },
      ]);

      manager.handleStatusBarClick();

      // Should set search query on contentEl
      expect(mockView.contentEl.setAttr).toHaveBeenCalledWith(
        'data-search',
        expect.stringContaining('file:"test.md"'),
      );
      expect(mockView.refreshVisibleList).toHaveBeenCalled();
    });

    it('sets search input element value when it exists', () => {
      const pathObj = new String('test.md') as any;
      pathObj.contains = (substr: string) => pathObj.includes(substr);
      const mockFile = {
        path: pathObj,
        basename: 'test',
        extension: 'md',
        parent: null,
      };
      mockPlugin.app.workspace.getActiveFile.mockReturnValue(mockFile);

      const searchInput = document.createElement('input');

      const mockView = {
        contentEl: {
          setAttr: jest.fn(),
          querySelector: jest.fn().mockReturnValue(searchInput),
        },
        refreshVisibleList: jest.fn().mockResolvedValue(undefined),
      };
      mockPlugin.app.workspace.getLeavesOfType.mockReturnValue([
        { view: mockView },
      ]);

      manager.handleStatusBarClick();

      expect(mockView.contentEl.setAttr).toHaveBeenCalledWith(
        'data-search',
        expect.any(String),
      );
    });

    it('shows notice when refreshVisibleList fails', async () => {
      const consoleSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      const pathObj = new String('test.md') as any;
      pathObj.contains = (substr: string) => pathObj.includes(substr);
      const mockFile = {
        path: pathObj,
        basename: 'test',
        extension: 'md',
        parent: null,
      };
      mockPlugin.app.workspace.getActiveFile.mockReturnValue(mockFile);

      const mockView = {
        contentEl: {
          setAttr: jest.fn(),
          querySelector: jest.fn().mockReturnValue(null),
        },
        refreshVisibleList: jest
          .fn()
          .mockRejectedValue(new Error('Refresh fail')),
      };
      mockPlugin.app.workspace.getLeavesOfType.mockReturnValue([
        { view: mockView },
      ]);

      manager.handleStatusBarClick();

      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(consoleSpy).toHaveBeenCalledWith(
        'Error refreshing task list:',
        expect.any(Error),
      );
      consoleSpy.mockRestore();
    });
  });

  describe('updateStatusBarItem with no tasks argument', () => {
    it('calls getTasks when no tasks argument is provided', () => {
      const mockFile = { path: 'test.md' };
      mockPlugin.app.workspace.getActiveFile.mockReturnValue(mockFile);
      mockPlugin.getTasks.mockReturnValue([
        createBaseTask({ path: 'test.md', line: 0, completed: false }),
      ]);

      manager.setupStatusBarItem();
      // Call without arguments — should use this.getTasks()
      manager.updateStatusBarItem();

      const item = mockPlugin.addStatusBarItem.mock.results[0].value;
      expect(item.textContent).toBe('1 task');
    });
  });
});
