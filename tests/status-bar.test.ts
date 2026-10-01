/**
 * @jest-environment jsdom
 */

import { StatusBarManager } from '../src/view/editor-extensions/status-bar';
import { createBaseTask } from './helpers/test-helper';
import { installObsidianDomMocks } from './helpers/obsidian-dom-mock';
import { Notice, TFile } from 'obsidian';

jest.mock('obsidian');

describe('StatusBarManager', () => {
  let mockPlugin: any;
  let manager: StatusBarManager;

  /** TFile-like mock: Obsidian patches String#contains, so emulate it. */
  function makeFile(path: string, parentPath: string | null): TFile {
    const pathObj = new String(path) as unknown as Record<string, unknown>;
    pathObj.contains = (substr: string) =>
      String.prototype.includes.call(pathObj, substr);
    const segments = path.split('/');
    const basename = segments[segments.length - 1].replace(/\.md$/, '');
    return Object.assign(Object.create(TFile.prototype), {
      path: pathObj,
      basename,
      extension: 'md',
      parent: parentPath ? { path: parentPath } : null,
    });
  }

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
        showTasksWithQuery: jest.fn().mockResolvedValue(undefined),
      },
      taskStateManager: {
        subscribe: jest.fn().mockReturnValue(jest.fn()),
      },
    };
    manager = new StatusBarManager(mockPlugin);
  });

  describe('cleanup', () => {
    it('removes status bar item and unsubscribes safely', () => {
      manager.setupStatusBarItem();
      const unsubscribe =
        mockPlugin.taskStateManager.subscribe.mock.results[0].value;

      manager.cleanup();
      manager.cleanup();

      expect(unsubscribe).toHaveBeenCalledTimes(1);
      expect(manager).toBeDefined();
    });

    it('cancels a pending debounce during cleanup', () => {
      jest.useFakeTimers();
      try {
        const mockFile = { path: 'test.md' };
        mockPlugin.app.workspace.getActiveFile.mockReturnValue(mockFile);
        manager.setupStatusBarItem();

        const callback = mockPlugin.taskStateManager.subscribe.mock.calls[0][0];
        callback([createBaseTask({ path: 'test.md', completed: false })]);

        const item = mockPlugin.addStatusBarItem.mock.results[0].value;
        manager.cleanup();
        jest.advanceTimersByTime(150);

        expect(item.textContent).toBe('');
      } finally {
        jest.useRealTimers();
      }
    });

    it('handles cleanup when status bar item is null', () => {
      // Don't call setup, so statusBarItem and subscription are null
      manager.cleanup();
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
    it('plain click applies the file filter via the sidebar-priority path', () => {
      mockPlugin.app.workspace.getActiveFile.mockReturnValue(
        makeFile('notes/test.md', 'notes'),
      );

      manager.setupStatusBarItem();
      const item = mockPlugin.addStatusBarItem.mock.results[0].value;
      item.dispatchEvent(new MouseEvent('click'));

      expect(mockPlugin.uiManager.showTasksWithQuery).toHaveBeenCalledWith(
        expect.stringContaining('file:"test.md"'),
        false,
      );
      // The untargeted showTasks path must not run: it could reveal a
      // different leaf than the one the filter lands on (the bug where a
      // background main-tab task list swallowed the query).
      expect(mockPlugin.uiManager.showTasks).not.toHaveBeenCalled();
    });

    it('cmd-click opens the filtered list in a new main tab', () => {
      mockPlugin.app.workspace.getActiveFile.mockReturnValue(
        makeFile('notes/test.md', 'notes'),
      );

      manager.handleStatusBarClick(new MouseEvent('click', { metaKey: true }));

      expect(mockPlugin.uiManager.showTasksWithQuery).toHaveBeenCalledWith(
        expect.stringContaining('file:"test.md"'),
        true,
      );
    });

    it('ctrl-click opens the filtered list in a new main tab', () => {
      mockPlugin.app.workspace.getActiveFile.mockReturnValue(
        makeFile('notes/test.md', 'notes'),
      );

      manager.handleStatusBarClick(new MouseEvent('click', { ctrlKey: true }));

      expect(mockPlugin.uiManager.showTasksWithQuery).toHaveBeenCalledWith(
        expect.any(String),
        true,
      );
    });

    it('does nothing when no active file', () => {
      mockPlugin.app.workspace.getActiveFile.mockReturnValue(null);

      manager.handleStatusBarClick();

      expect(mockPlugin.uiManager.showTasksWithQuery).not.toHaveBeenCalled();
    });

    it('includes the path filter for files with a parent directory', () => {
      const file = makeFile('projects/notes.md', 'projects');
      // instanceof TFile gates the path filter in production.
      Object.setPrototypeOf(file, TFile.prototype);
      mockPlugin.app.workspace.getActiveFile.mockReturnValue(file);

      manager.handleStatusBarClick();

      const [query] = mockPlugin.uiManager.showTasksWithQuery.mock.calls[0];
      expect(query).toContain('path:"projects"');
      expect(query).toContain('file:"notes.md"');
    });

    it('omits the path filter for files without a parent directory', () => {
      const file = makeFile('notes.md', null);
      Object.setPrototypeOf(file, TFile.prototype);
      mockPlugin.app.workspace.getActiveFile.mockReturnValue(file);

      manager.handleStatusBarClick();

      const [query] = mockPlugin.uiManager.showTasksWithQuery.mock.calls[0];
      expect(query).not.toContain('path:');
      expect(query).toContain('file:"notes.md"');
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

    it('does not create duplicate subscriptions when setup repeats', () => {
      manager.setupStatusBarItem();
      manager.setupStatusBarItem();

      expect(mockPlugin.addStatusBarItem).toHaveBeenCalledTimes(1);
      expect(mockPlugin.taskStateManager.subscribe).toHaveBeenCalledTimes(1);
    });

    it('registers active-leaf-change event', () => {
      manager.setupStatusBarItem();

      expect(mockPlugin.registerEvent).toHaveBeenCalled();
      const registeredEvent = mockPlugin.registerEvent.mock.calls[0][0];
      expect(registeredEvent).toBeDefined();
    });

    it('debounces status bar updates via timeout', () => {
      jest.useFakeTimers();
      try {
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
      } finally {
        jest.useRealTimers();
      }
    });

    it('cancels previous debounce when new update arrives', () => {
      jest.useFakeTimers();
      try {
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
      } finally {
        jest.useRealTimers();
      }
    });
  });

  describe('handleStatusBarClick error handling', () => {
    it('shows notice when showTasksWithQuery fails', async () => {
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
      mockPlugin.uiManager.showTasksWithQuery.mockRejectedValueOnce(
        new Error('Fail'),
      );

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
    it('passes the full path + file filter query to the UI manager', () => {
      const file = makeFile('notes/test.md', 'notes');
      // instanceof TFile gates the path filter in production.
      Object.setPrototypeOf(file, TFile.prototype);
      mockPlugin.app.workspace.getActiveFile.mockReturnValue(file);

      manager.handleStatusBarClick();

      const [query, newTab] =
        mockPlugin.uiManager.showTasksWithQuery.mock.calls[0];
      expect(query).toContain('path:"notes"');
      expect(query).toContain('file:"test.md"');
      expect(newTab).toBe(false);
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
