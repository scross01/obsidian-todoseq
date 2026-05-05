import { VaultScanner } from '../src/services/vault-scanner';
import { TaskStateManager } from '../src/services/task-state-manager';
import { TaskParser } from '../src/parser/task-parser';
import { ParserRegistry } from '../src/parser/parser-registry';
import { PropertySearchEngine } from '../src/services/property-search-engine';
import {
  createBaseSettings,
  createTestKeywordManager,
  createBaseTask,
} from './helpers/test-helper';
import { Task } from '../src/types/task';
import { App, TFile } from 'obsidian';
import TodoTracker from '../src/main';

/**
 * Helper function to create a TFile instance for testing
 */
function createMockFile(path: string, name: string): TFile {
  return Object.assign(new TFile(), { path, name });
}

describe('VaultScanner', () => {
  let vaultScanner: VaultScanner;
  let taskStateManager: TaskStateManager;
  let mockApp: jest.Mocked<App>;
  let settings: ReturnType<typeof createBaseSettings>;

  beforeEach(() => {
    settings = createBaseSettings();
    const keywordManager = createTestKeywordManager(settings);
    taskStateManager = new TaskStateManager(keywordManager);

    // Create a minimal mock app
    mockApp = {
      vault: {
        getFiles: jest.fn(),
        cachedRead: jest.fn(),
        getAbstractFileByPath: jest.fn(),
        read: jest.fn(),
        modify: jest.fn(),
        getConfig: jest.fn(),
      },
      plugins: {
        getPlugin: jest.fn(),
      },
    } as unknown as jest.Mocked<App>;

    // Create a minimal mock plugin
    const mockPlugin = {
      app: mockApp,
      settings,
      taskStateManager,
      keywordManager,
    } as unknown as TodoTracker;

    const urgencyCoefficients = {
      priorityHigh: 6,
      priorityMedium: 4,
      priorityLow: 2,
      scheduled: 8,
      scheduledTime: 1,
      deadline: 12,
      deadlineTime: 1,
      active: 4,
      age: 2,
      tags: 1,
      waiting: -3,
    };

    // Create parser registry and parsers
    const parserRegistry = new ParserRegistry();
    const taskParser = TaskParser.create(
      keywordManager,
      mockApp,
      urgencyCoefficients,
      {
        includeCalloutBlocks: settings.includeCalloutBlocks,
        includeCodeBlocks: settings.includeCodeBlocks,
        includeCommentBlocks: settings.includeCommentBlocks,
        languageCommentSupport: settings.languageCommentSupport,
      },
    );
    parserRegistry.register(taskParser);

    vaultScanner = new VaultScanner(
      mockPlugin,
      settings,
      taskStateManager,
      urgencyCoefficients,
      keywordManager,
      parserRegistry,
    );
  });

  afterEach(() => {
    vaultScanner.destroy();
  });

  describe('Event Management', () => {
    it('should register event listeners with on()', () => {
      const listener = jest.fn();
      vaultScanner.on('tasks-changed', listener);

      vaultScanner.emit('tasks-changed', []);

      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('should unregister event listeners with off()', () => {
      const listener = jest.fn();
      vaultScanner.on('tasks-changed', listener);
      vaultScanner.off('tasks-changed', listener);

      vaultScanner.emit('tasks-changed', []);

      expect(listener).not.toHaveBeenCalled();
    });

    it('should emit events to all registered listeners', () => {
      const listener1 = jest.fn();
      const listener2 = jest.fn();
      vaultScanner.on('tasks-changed', listener1);
      vaultScanner.on('tasks-changed', listener2);

      const tasks: Task[] = [];
      vaultScanner.emit('tasks-changed', tasks);

      expect(listener1).toHaveBeenCalledWith(tasks);
      expect(listener2).toHaveBeenCalledWith(tasks);
    });

    it('should handle errors in event listeners gracefully', () => {
      const errorListener = jest.fn(() => {
        throw new Error('Listener error');
      });
      const normalListener = jest.fn();

      vaultScanner.on('tasks-changed', errorListener);
      vaultScanner.on('tasks-changed', normalListener);

      vaultScanner.emit('tasks-changed', []);

      expect(normalListener).toHaveBeenCalled();
    });

    it('should emit scan-started event', () => {
      const listener = jest.fn();
      vaultScanner.on('scan-started', listener);

      vaultScanner.emit('scan-started');

      expect(listener).toHaveBeenCalled();
    });

    it('should emit scan-completed event', () => {
      const listener = jest.fn();
      vaultScanner.on('scan-completed', listener);

      vaultScanner.emit('scan-completed');

      expect(listener).toHaveBeenCalled();
    });

    it('should emit scan-error event', () => {
      const listener = jest.fn();
      vaultScanner.on('scan-error', listener);

      const error = new Error('Test error');
      vaultScanner.emit('scan-error', error);

      expect(listener).toHaveBeenCalledWith(error);
    });

    it('should emit file-changed event', () => {
      const listener = jest.fn();
      vaultScanner.on('file-changed', listener);

      const file = createMockFile('test.md', 'test.md');
      vaultScanner.emit('file-changed', file);

      expect(listener).toHaveBeenCalledWith(file);
    });

    it('should emit file-deleted event', () => {
      const listener = jest.fn();
      vaultScanner.on('file-deleted', listener);

      const file = createMockFile('test.md', 'test.md');
      vaultScanner.emit('file-deleted', file);

      expect(listener).toHaveBeenCalledWith(file);
    });
  });

  describe('State Management', () => {
    it('should return scanning state with isScanning()', () => {
      expect(vaultScanner.isScanning()).toBe(false);
    });

    it('should return Obsidian initialization state with isObsidianInitializing()', () => {
      expect(vaultScanner.isObsidianInitializing()).toBe(true);
    });

    it('should mark initialization complete with setInitializationComplete()', () => {
      vaultScanner.setInitializationComplete();
      expect(vaultScanner.isObsidianInitializing()).toBe(false);
    });

    it('should return true for shouldShowScanningMessage when scanning', () => {
      expect(vaultScanner.shouldShowScanningMessage()).toBe(true);
    });

    it('should return false for shouldShowScanningMessage when tasks exist', () => {
      const task = createBaseTask();
      taskStateManager.setTasks([task]);

      expect(vaultScanner.shouldShowScanningMessage()).toBe(false);
    });

    it('should return false for shouldShowScanningMessage after initialization complete', () => {
      vaultScanner.setInitializationComplete();

      expect(vaultScanner.shouldShowScanningMessage()).toBe(false);
    });

    it('should get tasks from state manager with getTasks()', () => {
      const task = createBaseTask();
      taskStateManager.setTasks([task]);

      const tasks = vaultScanner.getTasks();

      expect(tasks).toEqual([task]);
    });

    it('should get task state manager with getTaskStateManager()', () => {
      const manager = vaultScanner.getTaskStateManager();

      expect(manager).toBe(taskStateManager);
    });

    it('should get parser with getParser()', () => {
      const parser = vaultScanner.getParser();

      expect(parser).toBeInstanceOf(TaskParser);
    });

    it('should return null for getParser when no markdown parser registered', () => {
      // Create a new vault scanner without any parsers
      const keywordManager = createTestKeywordManager(settings);
      const newTaskStateManager = new TaskStateManager(keywordManager);
      const newMockPlugin = {
        app: mockApp,
        settings,
        taskStateManager: newTaskStateManager,
        keywordManager,
      } as unknown as TodoTracker;
      const newUrgencyCoefficients = {
        priorityHigh: 6,
        priorityMedium: 4,
        priorityLow: 2,
        scheduled: 8,
        scheduledTime: 1,
        deadline: 12,
        deadlineTime: 1,
        active: 4,
        age: 2,
        tags: 1,
        waiting: -3,
      };
      const newParserRegistry = new ParserRegistry();
      const newVaultScanner = new VaultScanner(
        newMockPlugin,
        settings,
        newTaskStateManager,
        newUrgencyCoefficients,
        keywordManager,
        newParserRegistry,
      );

      const parser = newVaultScanner.getParser();

      expect(parser).toBeNull();

      newVaultScanner.destroy();
    });
  });

  describe('Parser Registry', () => {
    it('should get parser registry with getParserRegistry()', () => {
      const registry = vaultScanner.getParserRegistry();

      expect(registry).toBeDefined();
      expect(registry.getParser('markdown')).toBeInstanceOf(TaskParser);
    });

    it('should get keyword manager with getKeywordManager()', () => {
      const keywordManager = vaultScanner.getKeywordManager();

      expect(keywordManager).toBeDefined();
      expect(keywordManager.getAllKeywords()).toBeDefined();
    });
  });

  describe('Settings Update', () => {
    it('should update settings and clear regex cache', async () => {
      const newSettings = createBaseSettings({
        additionalFileExtensions: ['.txt'],
      });

      await vaultScanner.updateSettings(newSettings);

      expect(vaultScanner['settings']).toEqual(newSettings);
    });

    it('should update keyword manager on settings update', async () => {
      const newSettings = createBaseSettings({
        additionalActiveKeywords: ['NEXT'],
      });

      await vaultScanner.updateSettings(newSettings);

      const newKeywords = vaultScanner.getKeywordManager().getAllKeywords();
      // NEXT should be in the new keywords
      expect(newKeywords).toContain('NEXT');
    });

    it('should update all parsers with new config', async () => {
      const newSettings = createBaseSettings({
        includeCodeBlocks: true,
      });

      const parser = vaultScanner.getParser();
      if (!parser) {
        throw new Error('Parser not available');
      }
      const updateConfigSpy = jest.spyOn(parser, 'updateConfig');

      await vaultScanner.updateSettings(newSettings);

      expect(updateConfigSpy).toHaveBeenCalled();
    });

    it('should respect default settings for includeCodeBlocks and includeCommentBlocks during initialization', async () => {
      // Create settings with code blocks and comment blocks disabled (default values)
      const settingsWithDefaultsDisabled = createBaseSettings({
        includeCodeBlocks: false,
        includeCommentBlocks: false,
      });

      const keywordManager = createTestKeywordManager(
        settingsWithDefaultsDisabled,
      );
      const newTaskStateManager = new TaskStateManager(keywordManager);
      const newMockPlugin = {
        app: mockApp,
        settings: settingsWithDefaultsDisabled,
        taskStateManager: newTaskStateManager,
        keywordManager,
      } as unknown as TodoTracker;
      const newUrgencyCoefficients = {
        priorityHigh: 6,
        priorityMedium: 4,
        priorityLow: 2,
        scheduled: 8,
        scheduledTime: 1,
        deadline: 12,
        deadlineTime: 1,
        active: 4,
        age: 2,
        tags: 1,
        waiting: -3,
      };
      const newParserRegistry = new ParserRegistry();
      // Register TaskParser with the new registry
      const taskParser = TaskParser.create(
        keywordManager,
        mockApp,
        newUrgencyCoefficients,
        {
          includeCalloutBlocks:
            settingsWithDefaultsDisabled.includeCalloutBlocks,
          includeCodeBlocks: settingsWithDefaultsDisabled.includeCodeBlocks,
          includeCommentBlocks:
            settingsWithDefaultsDisabled.includeCommentBlocks,
          languageCommentSupport:
            settingsWithDefaultsDisabled.languageCommentSupport,
        },
      );
      newParserRegistry.register(taskParser);
      const newVaultScanner = new VaultScanner(
        newMockPlugin,
        settingsWithDefaultsDisabled,
        newTaskStateManager,
        newUrgencyCoefficients,
        keywordManager,
        newParserRegistry,
      );

      // Get the parser and verify it has the correct settings
      const parser = newVaultScanner.getParser();
      if (!parser) {
        throw new Error('Parser not available');
      }

      // Parse content with tasks in code blocks and comment blocks
      const content = `
\`\`\`
TODO task in code block
\`\`\`

%% TODO task in comment block %%

TODO task outside blocks
`;

      const tasks = parser.parseFile(content, 'test.md');

      // Should only collect the task outside blocks (not in code or comment blocks)
      expect(tasks).toHaveLength(1);
      expect(tasks[0].text).toBe('task outside blocks');

      newVaultScanner.destroy();
    });

    it('should respect enabled settings for includeCodeBlocks and includeCommentBlocks during initialization', async () => {
      // Create settings with code blocks and comment blocks enabled
      const settingsWithEnabled = createBaseSettings({
        includeCodeBlocks: true,
        includeCommentBlocks: true,
      });

      const keywordManager = createTestKeywordManager(settingsWithEnabled);
      const newTaskStateManager = new TaskStateManager(keywordManager);
      const newMockPlugin = {
        app: mockApp,
        settings: settingsWithEnabled,
        taskStateManager: newTaskStateManager,
        keywordManager,
      } as unknown as TodoTracker;
      const newUrgencyCoefficients = {
        priorityHigh: 6,
        priorityMedium: 4,
        priorityLow: 2,
        scheduled: 8,
        scheduledTime: 1,
        deadline: 12,
        deadlineTime: 1,
        active: 4,
        age: 2,
        tags: 1,
        waiting: -3,
      };
      const newParserRegistry = new ParserRegistry();
      // Register TaskParser with the new registry
      const taskParser = TaskParser.create(
        keywordManager,
        mockApp,
        newUrgencyCoefficients,
        {
          includeCalloutBlocks: settingsWithEnabled.includeCalloutBlocks,
          includeCodeBlocks: settingsWithEnabled.includeCodeBlocks,
          includeCommentBlocks: settingsWithEnabled.includeCommentBlocks,
          languageCommentSupport: settingsWithEnabled.languageCommentSupport,
        },
      );
      newParserRegistry.register(taskParser);
      const newVaultScanner = new VaultScanner(
        newMockPlugin,
        settingsWithEnabled,
        newTaskStateManager,
        newUrgencyCoefficients,
        keywordManager,
        newParserRegistry,
      );

      // Get the parser and verify it has the correct settings
      const parser = newVaultScanner.getParser();
      if (!parser) {
        throw new Error('Parser not available');
      }

      // Parse content with tasks in code blocks and comment blocks
      const content = `
\`\`\`
TODO task in code block
\`\`\`

%% TODO task in comment block %%

TODO task outside blocks
`;

      const tasks = parser.parseFile(content, 'test.md');

      // Should collect all three tasks (code block, comment block, and outside)
      expect(tasks).toHaveLength(3);
      expect(tasks[0].text).toBe('task in code block');
      expect(tasks[1].text).toBe('task in comment block');
      expect(tasks[2].text).toBe('task outside blocks');

      newVaultScanner.destroy();
    });
  });

  describe('Property Search Engine', () => {
    it('should set property search engine', () => {
      const mockPropertySearchEngine = {
        buildIndex: jest.fn(),
        search: jest.fn(),
      } as unknown as PropertySearchEngine;

      vaultScanner.setPropertySearchEngine(mockPropertySearchEngine);

      expect(vaultScanner['propertySearchEngine']).toBe(
        mockPropertySearchEngine,
      );
    });
  });

  describe('File Processing', () => {
    it('should process file deletion', async () => {
      const task1 = createBaseTask({ path: 'file1.md' });
      const task2 = createBaseTask({ path: 'file2.md' });
      taskStateManager.setTasks([task1, task2]);

      const file = createMockFile('file1.md', 'file1.md');
      await vaultScanner.processFileDelete(file);

      const tasks = vaultScanner.getTasks();
      expect(tasks).toHaveLength(1);
      expect(tasks[0].path).toBe('file2.md');
    });

    it('should emit tasks-changed event after file deletion', async () => {
      const task = createBaseTask({ path: 'file1.md' });
      taskStateManager.setTasks([task]);

      const listener = jest.fn();
      vaultScanner.on('tasks-changed', listener);

      const file = createMockFile('file1.md', 'file1.md');
      await vaultScanner.processFileDelete(file);

      expect(listener).toHaveBeenCalled();
    });

    it('should handle file deletion with no matching tasks', async () => {
      const task = createBaseTask({ path: 'file1.md' });
      taskStateManager.setTasks([task]);

      const file = createMockFile('file2.md', 'file2.md');
      await vaultScanner.processFileDelete(file);

      const tasks = vaultScanner.getTasks();
      expect(tasks).toHaveLength(1);
      expect(tasks[0].path).toBe('file1.md');
    });

    it('should process file rename', async () => {
      const task1 = createBaseTask({ path: 'old-name.md' });
      const task2 = createBaseTask({ path: 'other.md' });
      taskStateManager.setTasks([task1, task2]);

      const file = createMockFile('new-name.md', 'new-name.md');

      // Mock the scanFile to return empty array for simplicity
      jest.spyOn(vaultScanner, 'scanFile').mockResolvedValue([]);

      await vaultScanner.processFileRename(file, 'old-name.md');

      const tasks = vaultScanner.getTasks();
      expect(tasks).toHaveLength(1);
      expect(tasks[0].path).toBe('other.md');
    });

    it('should emit tasks-changed event after file rename', async () => {
      const task = createBaseTask({ path: 'old-name.md' });
      taskStateManager.setTasks([task]);

      const listener = jest.fn();
      vaultScanner.on('tasks-changed', listener);

      const file = createMockFile('new-name.md', 'new-name.md');
      jest.spyOn(vaultScanner, 'scanFile').mockResolvedValue([]);

      await vaultScanner.processFileRename(file, 'old-name.md');

      expect(listener).toHaveBeenCalled();
    });

    it('should handle file rename with no matching tasks', async () => {
      const task = createBaseTask({ path: 'other.md' });
      taskStateManager.setTasks([task]);

      const file = createMockFile('new-name.md', 'new-name.md');
      jest.spyOn(vaultScanner, 'scanFile').mockResolvedValue([]);

      await vaultScanner.processFileRename(file, 'old-name.md');

      const tasks = vaultScanner.getTasks();
      expect(tasks).toHaveLength(1);
      expect(tasks[0].path).toBe('other.md');
    });

    it('should add tasks from renamed file', async () => {
      const task = createBaseTask({ path: 'other.md' });
      taskStateManager.setTasks([task]);

      const newTask = createBaseTask({ path: 'new-name.md' });
      const file = createMockFile('new-name.md', 'new-name.md');
      jest.spyOn(vaultScanner, 'scanFile').mockResolvedValue([newTask]);

      await vaultScanner.processFileRename(file, 'old-name.md');

      const tasks = vaultScanner.getTasks();
      expect(tasks).toHaveLength(2);
      expect(tasks.some((t) => t.path === 'new-name.md')).toBe(true);
    });
  });

  describe('Cleanup', () => {
    it('should clear event listeners on destroy', () => {
      const listener = jest.fn();
      vaultScanner.on('tasks-changed', listener);

      vaultScanner.destroy();

      vaultScanner.emit('tasks-changed', []);

      expect(listener).not.toHaveBeenCalled();
    });

    it('should allow multiple destroy calls without error', () => {
      expect(() => {
        vaultScanner.destroy();
        vaultScanner.destroy();
      }).not.toThrow();
    });
  });

  describe('tasksIdentical method', () => {
    it('should return true for identical tasks', () => {
      const date = new Date(2024, 0, 15);

      const tasks1: Task[] = [
        {
          path: 'test.md',
          line: 0,
          rawText: '- TODO test task',
          indent: '',
          listMarker: '- ',
          text: 'test task',
          state: 'TODO',
          completed: false,
          priority: null,
          scheduledDate: date,
          deadlineDate: null,
          urgency: null,
          isDailyNote: false,
          dailyNoteDate: null,
          subtaskCount: 0,
          subtaskCompletedCount: 0,
        },
      ];

      const tasks2: Task[] = [
        {
          path: 'test.md',
          line: 0,
          rawText: '- TODO test task',
          indent: '',
          listMarker: '- ',
          text: 'test task',
          state: 'TODO',
          completed: false,
          priority: null,
          scheduledDate: date,
          deadlineDate: null,
          urgency: null,
          isDailyNote: false,
          dailyNoteDate: null,
          subtaskCount: 0,
          subtaskCompletedCount: 0,
        },
      ];

      // @ts-ignore - Accessing private method for testing
      const result = vaultScanner.tasksIdentical(tasks1, tasks2);
      expect(result).toBe(true);
    });

    it('should return false when scheduled date changes', () => {
      const tasks1: Task[] = [
        {
          path: 'test.md',
          line: 0,
          rawText: '- TODO test task',
          indent: '',
          listMarker: '- ',
          text: 'test task',
          state: 'TODO',
          completed: false,
          priority: null,
          scheduledDate: new Date(2024, 0, 15),
          deadlineDate: null,
          urgency: null,
          isDailyNote: false,
          dailyNoteDate: null,
          subtaskCount: 0,
          subtaskCompletedCount: 0,
        },
      ];

      const tasks2: Task[] = [
        {
          path: 'test.md',
          line: 0,
          rawText: '- TODO test task',
          indent: '',
          listMarker: '- ',
          text: 'test task',
          state: 'TODO',
          completed: false,
          priority: null,
          scheduledDate: new Date(2024, 0, 16),
          deadlineDate: null,
          urgency: null,
          isDailyNote: false,
          dailyNoteDate: null,
          subtaskCount: 0,
          subtaskCompletedCount: 0,
        },
      ];

      // @ts-ignore - Accessing private method for testing
      const result = vaultScanner.tasksIdentical(tasks1, tasks2);
      expect(result).toBe(false);
    });

    it('should return false when arrays have different lengths', () => {
      const date = new Date(2024, 0, 15);

      const tasks1: Task[] = [
        {
          path: 'test.md',
          line: 0,
          rawText: '- TODO test task',
          indent: '',
          listMarker: '- ',
          text: 'test task',
          state: 'TODO',
          completed: false,
          priority: null,
          scheduledDate: date,
          deadlineDate: null,
          urgency: null,
          isDailyNote: false,
          dailyNoteDate: null,
          subtaskCount: 0,
          subtaskCompletedCount: 0,
        },
      ];

      const tasks2: Task[] = [
        {
          path: 'test.md',
          line: 0,
          rawText: '- TODO test task',
          indent: '',
          listMarker: '- ',
          text: 'test task',
          state: 'TODO',
          completed: false,
          priority: null,
          scheduledDate: date,
          deadlineDate: null,
          urgency: null,
          isDailyNote: false,
          dailyNoteDate: null,
          subtaskCount: 0,
          subtaskCompletedCount: 0,
        },
        {
          path: 'test.md',
          line: 1,
          rawText: '- DOING another task',
          indent: '',
          listMarker: '- ',
          text: 'another task',
          state: 'DOING',
          completed: false,
          priority: null,
          scheduledDate: null,
          deadlineDate: null,
          urgency: null,
          isDailyNote: false,
          dailyNoteDate: null,
          subtaskCount: 0,
          subtaskCompletedCount: 0,
        },
      ];

      // @ts-ignore - Accessing private method for testing
      const result = vaultScanner.tasksIdentical(tasks1, tasks2);
      expect(result).toBe(false);
    });

    it('should return false when subtask counts differ', () => {
      const date = new Date(2024, 0, 15);

      const tasks1: Task[] = [
        {
          path: 'test.md',
          line: 0,
          rawText: '- TODO test task',
          indent: '',
          listMarker: '- ',
          text: 'test task',
          state: 'TODO',
          completed: false,
          priority: null,
          scheduledDate: date,
          deadlineDate: null,
          urgency: null,
          isDailyNote: false,
          dailyNoteDate: null,
          subtaskCount: 2,
          subtaskCompletedCount: 1,
        },
      ];

      const tasks2: Task[] = [
        {
          path: 'test.md',
          line: 0,
          rawText: '- TODO test task',
          indent: '',
          listMarker: '- ',
          text: 'test task',
          state: 'TODO',
          completed: false,
          priority: null,
          scheduledDate: date,
          deadlineDate: null,
          urgency: null,
          isDailyNote: false,
          dailyNoteDate: null,
          subtaskCount: 3,
          subtaskCompletedCount: 1,
        },
      ];

      // @ts-ignore - Accessing private method for testing
      const result = vaultScanner.tasksIdentical(tasks1, tasks2);
      expect(result).toBe(false);
    });

    it('should return false when subtask completed counts differ', () => {
      const date = new Date(2024, 0, 15);

      const tasks1: Task[] = [
        {
          path: 'test.md',
          line: 0,
          rawText: '- TODO test task',
          indent: '',
          listMarker: '- ',
          text: 'test task',
          state: 'TODO',
          completed: false,
          priority: null,
          scheduledDate: date,
          deadlineDate: null,
          urgency: null,
          isDailyNote: false,
          dailyNoteDate: null,
          subtaskCount: 2,
          subtaskCompletedCount: 1,
        },
      ];

      const tasks2: Task[] = [
        {
          path: 'test.md',
          line: 0,
          rawText: '- TODO test task',
          indent: '',
          listMarker: '- ',
          text: 'test task',
          state: 'TODO',
          completed: false,
          priority: null,
          scheduledDate: date,
          deadlineDate: null,
          urgency: null,
          isDailyNote: false,
          dailyNoteDate: null,
          subtaskCount: 2,
          subtaskCompletedCount: 2,
        },
      ];

      // @ts-ignore - Accessing private method for testing
      const result = vaultScanner.tasksIdentical(tasks1, tasks2);
      expect(result).toBe(false);
    });
  });
});
