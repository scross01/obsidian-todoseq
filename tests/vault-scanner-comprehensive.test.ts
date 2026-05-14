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
import { ChangeTracker } from '../src/services/change-tracker';

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
  let changeTracker: ChangeTracker;

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

    changeTracker = new ChangeTracker();

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
      changeTracker,
    );
  });

  afterEach(() => {
    vaultScanner.destroy();
    changeTracker.destroy();
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

    it('should accept urgency coefficients parameter', async () => {
      const newSettings = createBaseSettings();
      const customCoefficients = {
        priorityHigh: 10,
        priorityMedium: 8,
        priorityLow: 4,
        scheduled: 16,
        scheduledTime: 2,
        deadline: 24,
        deadlineTime: 2,
        active: 8,
        age: 4,
        tags: 2,
        waiting: -6,
      };

      await vaultScanner.updateSettings(newSettings, customCoefficients);

      // @ts-ignore - accessing private field
      expect(vaultScanner['urgencyCoefficients']).toEqual(customCoefficients);
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

    it('should handle errors during file deletion', async () => {
      jest.spyOn(taskStateManager, 'getTasks').mockImplementationOnce(() => {
        throw new Error('State error');
      });

      const scanError = jest.fn();
      vaultScanner.on('scan-error', scanError);

      const file = createMockFile('file1.md', 'file1.md');
      await vaultScanner.processFileDelete(file);

      expect(scanError).toHaveBeenCalled();
    });

    it('should handle errors during file rename', async () => {
      jest.spyOn(taskStateManager, 'getTasks').mockImplementationOnce(() => {
        throw new Error('State error');
      });

      const scanError = jest.fn();
      vaultScanner.on('scan-error', scanError);

      const file = createMockFile('new-name.md', 'new-name.md');
      await vaultScanner.processFileRename(file, 'old-name.md');

      expect(scanError).toHaveBeenCalled();
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

  describe('scanVault', () => {
    it('should scan files and collect tasks', async () => {
      const file1 = new TFile('file1.md', 'file1.md', 'md');
      const file2 = new TFile('file2.md', 'file2.md', 'md');

      mockApp.vault.getFiles.mockReturnValue([file1, file2]);
      mockApp.vault.cachedRead.mockResolvedValue('- TODO test task');

      const tasksChanged = jest.fn();
      const scanStarted = jest.fn();
      const scanCompleted = jest.fn();
      vaultScanner.on('tasks-changed', tasksChanged);
      vaultScanner.on('scan-started', scanStarted);
      vaultScanner.on('scan-completed', scanCompleted);

      await vaultScanner.scanVault();

      expect(vaultScanner.isScanning()).toBe(false);
      expect(vaultScanner.getTasks()).toHaveLength(2);
      expect(scanStarted).toHaveBeenCalledTimes(1);
      expect(tasksChanged).toHaveBeenCalled();
      expect(scanCompleted).toHaveBeenCalledTimes(1);
    });

    it('should return early if already scanning', async () => {
      // @ts-ignore - setting private property
      vaultScanner['_isScanning'] = true;
      mockApp.vault.getFiles.mockReturnValue([]);

      await vaultScanner.scanVault();

      expect(mockApp.vault.getFiles).not.toHaveBeenCalled();
      expect(vaultScanner.isScanning()).toBe(true);
    });

    it('should filter archived tasks', async () => {
      const file = new TFile('test.md', 'test.md', 'md');

      mockApp.vault.getFiles.mockReturnValue([file]);
      mockApp.vault.cachedRead.mockResolvedValue(
        '- TODO active task\n- ARCHIVED old task',
      );

      await vaultScanner.scanVault();

      const tasks = vaultScanner.getTasks();
      expect(tasks).toHaveLength(1);
      expect(tasks[0].text).toBe('active task');
    });

    it('should handle read errors gracefully', async () => {
      const file = new TFile('test.md', 'test.md', 'md');
      mockApp.vault.getFiles.mockReturnValue([file]);
      mockApp.vault.cachedRead = jest
        .fn()
        .mockRejectedValue(new Error('Read error'));

      await vaultScanner.scanVault();

      expect(vaultScanner.isScanning()).toBe(false);
      expect(vaultScanner.getTasks()).toHaveLength(0);
    });

    it('should handle errors during vault scan', async () => {
      mockApp.vault.getFiles.mockImplementation(() => {
        throw new Error('Vault error');
      });

      const scanError = jest.fn();
      vaultScanner.on('scan-error', scanError);

      await vaultScanner.scanVault();

      expect(scanError).toHaveBeenCalled();
      expect(vaultScanner.isScanning()).toBe(false);
    });
  });

  describe('shouldScanFile', () => {
    it('should scan markdown files', () => {
      const file = new TFile('test.md', 'test.md', 'md');

      // @ts-ignore - Accessing private method for testing
      const result = vaultScanner.shouldScanFile(file);

      expect(result).toBe(true);
    });

    it('should not scan non-markdown files without additional extensions', () => {
      const file = new TFile('test.txt', 'test.txt', 'txt');

      // @ts-ignore - Accessing private method for testing
      const result = vaultScanner.shouldScanFile(file);

      expect(result).toBe(false);
    });

    it('should scan non-markdown files with matching additional extensions', async () => {
      const newSettings = createBaseSettings({
        additionalFileExtensions: ['.txt'],
      });
      await vaultScanner.updateSettings(newSettings);

      const file = new TFile('test.txt', 'test.txt', 'txt');

      // @ts-ignore - Accessing private method for testing
      const result = vaultScanner.shouldScanFile(file);

      expect(result).toBe(true);
    });

    it('should not scan excluded files', () => {
      mockApp.vault.getConfig.mockReturnValue(['secret']);

      const file = new TFile('secret/notes.md', 'notes.md', 'md');

      // @ts-ignore - Accessing private method for testing
      const result = vaultScanner.shouldScanFile(file);

      expect(result).toBe(false);
    });

    it('should match multi-level extensions', async () => {
      const newSettings = createBaseSettings({
        additionalFileExtensions: ['.txt.bak'],
      });
      await vaultScanner.updateSettings(newSettings);

      const file = new TFile('backup/test.txt.bak', 'test.txt.bak', 'bak');

      // @ts-ignore - Accessing private method for testing
      const result = vaultScanner.shouldScanFile(file);

      expect(result).toBe(true);
    });
  });

  describe('isExcluded', () => {
    it('should return false when no ignore filters are configured', () => {
      mockApp.vault.getConfig.mockReturnValue(null);

      // @ts-ignore - Accessing private method for testing
      const result = vaultScanner.isExcluded('test.md');

      expect(result).toBe(false);
    });

    it('should exclude by regex pattern', () => {
      mockApp.vault.getConfig.mockReturnValue(['/^secret/']);

      // @ts-ignore
      expect(vaultScanner.isExcluded('secret/file.md')).toBe(true);
      // @ts-ignore
      expect(vaultScanner.isExcluded('public/file.md')).toBe(false);
    });

    it('should exclude by directory path pattern', () => {
      mockApp.vault.getConfig.mockReturnValue(['archive/']);

      // @ts-ignore
      expect(vaultScanner.isExcluded('archive/file.md')).toBe(true);
      // @ts-ignore
      expect(vaultScanner.isExcluded('notes/file.md')).toBe(false);
    });

    it('should exclude by simple string match', () => {
      mockApp.vault.getConfig.mockReturnValue(['draft']);

      // @ts-ignore
      expect(vaultScanner.isExcluded('draft/notes.md')).toBe(true);
      // @ts-ignore
      expect(vaultScanner.isExcluded('notes/draft.md')).toBe(true);
      // @ts-ignore
      expect(vaultScanner.isExcluded('final/notes.md')).toBe(false);
    });

    it('should handle invalid patterns gracefully', () => {
      mockApp.vault.getConfig.mockReturnValue(['/[invalid/']);

      // @ts-ignore
      const result = vaultScanner.isExcluded('test.md');

      expect(result).toBe(false);
    });

    it('should return false when getConfig is unavailable', () => {
      const vaultWithoutConfig = {
        getFiles: jest.fn(),
        cachedRead: jest.fn(),
        read: jest.fn(),
        getConfig: jest.fn().mockImplementation(() => {
          throw new Error('Config not available');
        }),
      };
      const originalVault = mockApp.vault;
      mockApp.vault = vaultWithoutConfig as typeof mockApp.vault;

      // @ts-ignore
      const result = vaultScanner.isExcluded('test.md');

      expect(result).toBe(false);

      mockApp.vault = originalVault;
    });
  });

  describe('scanFile', () => {
    it('should return tasks from a markdown file', async () => {
      const file = new TFile('test.md', 'test.md', 'md');
      mockApp.vault.cachedRead.mockResolvedValue('- TODO test task');

      const tasks = await vaultScanner.scanFile(file);

      expect(tasks).toHaveLength(1);
      expect(tasks[0].text).toBe('test task');
      expect(tasks[0].state).toBe('TODO');
    });

    it('should return empty array when no keywords match', async () => {
      const file = new TFile('test.md', 'test.md', 'md');
      mockApp.vault.cachedRead.mockResolvedValue('Just some regular text');

      const tasks = await vaultScanner.scanFile(file);

      expect(tasks).toHaveLength(0);
    });

    it('should return empty array when no parser for extension', async () => {
      const file = new TFile('test.xyz', 'test.xyz', 'xyz');
      mockApp.vault.cachedRead.mockResolvedValue('- TODO test task');

      const tasks = await vaultScanner.scanFile(file);

      expect(tasks).toHaveLength(0);
    });

    it('should handle cachedRead errors', async () => {
      const file = new TFile('test.md', 'test.md', 'md');
      mockApp.vault.cachedRead = jest
        .fn()
        .mockRejectedValue(new Error('Read error'));

      const scanError = jest.fn();
      vaultScanner.on('scan-error', scanError);

      const tasks = await vaultScanner.scanFile(file);

      expect(tasks).toHaveLength(0);
      expect(scanError).toHaveBeenCalled();
    });
  });

  describe('processIncrementalChange', () => {
    it('should update tasks when file changes', async () => {
      const file = new TFile('test.md', 'test.md', 'md');
      const existingTask = createBaseTask({ path: 'other.md', text: 'other' });
      taskStateManager.setTasks([existingTask]);

      mockApp.vault.cachedRead.mockResolvedValue('- TODO new task');
      mockApp.vault.read.mockResolvedValue('- TODO new task');

      const tasksChanged = jest.fn();
      vaultScanner.on('tasks-changed', tasksChanged);

      await vaultScanner.processIncrementalChange(file);

      expect(tasksChanged).toHaveBeenCalled();
      const tasks = vaultScanner.getTasks();
      expect(tasks).toHaveLength(2);
      expect(tasks.some((t) => t.text === 'new task')).toBe(true);
    });

    it('should skip excluded files', async () => {
      mockApp.vault.getConfig.mockReturnValue(['secret/']);

      const file = new TFile('secret/test.md', 'test.md', 'md');

      await vaultScanner.processIncrementalChange(file);

      expect(mockApp.vault.cachedRead).not.toHaveBeenCalled();
    });

    it('should skip when tasks are unchanged', async () => {
      const file = new TFile('test.md', 'test.md', 'md');
      const existingTask = createBaseTask({
        path: 'test.md',
        line: 0,
        rawText: '- TODO test task',
        text: 'test task',
        state: 'TODO',
      });
      taskStateManager.setTasks([existingTask]);

      mockApp.vault.cachedRead.mockResolvedValue('- TODO test task');
      mockApp.vault.read.mockResolvedValue('- TODO test task');

      const tasksChanged = jest.fn();
      vaultScanner.on('tasks-changed', tasksChanged);

      await vaultScanner.processIncrementalChange(file);

      expect(tasksChanged).not.toHaveBeenCalled();
      expect(vaultScanner.getTasks()).toHaveLength(1);
    });

    it('should skip when change is tracked as expected', async () => {
      const file = new TFile('test.md', 'test.md', 'md');
      const existingTask = createBaseTask({
        path: 'test.md',
        text: 'old text',
      });
      taskStateManager.setTasks([existingTask]);

      changeTracker.registerExpectedChange('test.md', '- TODO new text');

      mockApp.vault.cachedRead.mockResolvedValue('- TODO new text');
      mockApp.vault.read.mockResolvedValue('- TODO new text');

      const tasksChanged = jest.fn();
      vaultScanner.on('tasks-changed', tasksChanged);

      await vaultScanner.processIncrementalChange(file);

      expect(tasksChanged).not.toHaveBeenCalled();
      expect(vaultScanner.getTasks()[0].text).toBe('old text');
    });

    it('should skip during addSkipIncrementalChange window', async () => {
      const file = new TFile('test.md', 'test.md', 'md');

      vaultScanner.addSkipIncrementalChange('test.md');

      mockApp.vault.cachedRead.mockResolvedValue('- TODO new task');

      await vaultScanner.processIncrementalChange(file);

      expect(mockApp.vault.cachedRead).not.toHaveBeenCalled();
    });

    it('should handle errors during read', async () => {
      const file = new TFile('test.md', 'test.md', 'md');
      mockApp.vault.cachedRead.mockResolvedValue('- TODO new task');
      mockApp.vault.read = jest.fn().mockRejectedValue(new Error('Read error'));

      const scanError = jest.fn();
      vaultScanner.on('scan-error', scanError);

      await vaultScanner.processIncrementalChange(file);

      expect(scanError).toHaveBeenCalled();
    });

    it('should process change when skip entry has expired', async () => {
      const file = new TFile('test.md', 'test.md', 'md');

      // Set an expired timestamp (6 seconds in the past)
      vaultScanner['skipIncrementalChanges'].set('test.md', Date.now() - 6000);

      mockApp.vault.cachedRead.mockResolvedValue('- TODO new task');
      mockApp.vault.read.mockResolvedValue('- TODO new task');

      await vaultScanner.processIncrementalChange(file);

      const tasks = vaultScanner.getTasks();
      expect(tasks).toHaveLength(1);
    });

    it('should handle missing timestamp in skip entry', async () => {
      const file = new TFile('test.md', 'test.md', 'md');

      // Set entry with undefined timestamp (edge case)
      // @ts-ignore - accessing private property
      vaultScanner['skipIncrementalChanges'].set('test.md', undefined as any);

      mockApp.vault.cachedRead.mockResolvedValue('- TODO new task');
      mockApp.vault.read.mockResolvedValue('- TODO new task');

      await vaultScanner.processIncrementalChange(file);

      const tasks = vaultScanner.getTasks();
      expect(tasks).toHaveLength(1);
    });
  });

  describe('addSkipIncrementalChange', () => {
    it('should record a skip entry for the file path', () => {
      vaultScanner.addSkipIncrementalChange('test.md');

      // @ts-ignore - accessing private property
      expect(vaultScanner['skipIncrementalChanges'].has('test.md')).toBe(true);
      // @ts-ignore
      const timestamp = vaultScanner['skipIncrementalChanges'].get('test.md');
      expect(typeof timestamp).toBe('number');
    });
  });
});
