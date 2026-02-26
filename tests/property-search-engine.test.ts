/**
 * @jest-environment jsdom
 */
import { PropertySearchEngine } from '../src/services/property-search-engine';
import { TFile } from 'obsidian';

// Create mock files
const createMockFile = (path: string): TFile => {
  const mockFile = {
    path,
    name: path.split('/').pop() || path,
    basename: path.replace('.md', ''),
    extension: 'md',
    stat: { size: 1024, mtime: Date.now() },
    isTFile: true,
  };

  Object.setPrototypeOf(mockFile, {
    constructor: { name: 'TFile' },
    __proto__: { __proto__: Object.prototype },
  });

  return mockFile as unknown as TFile;
};

// Mock TaskStateManager
const mockTaskStateManager = {
  getTasks: jest.fn(() => {
    return [];
  }),
};

// Mock vault scanner
const mockVaultScanner = {
  isScanning: jest.fn(() => false),
  isObsidianInitializing: jest.fn(() => false),
};

// Base mock app
const baseMockApp = {
  vault: {
    getMarkdownFiles: jest.fn(() => []),
    getAbstractFileByPath: jest.fn(() => null),
    on: jest.fn(),
    offref: jest.fn(),
  },
  metadataCache: {
    getFileCache: jest.fn(() => null),
    on: jest.fn(),
    offref: jest.fn(),
  },
};

describe('PropertySearchEngine - Comprehensive Tests', () => {
  let propertySearchEngine: PropertySearchEngine;
  let mockApp: any;
  let refreshAllTaskListViews: jest.Mock;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Create fresh mocks for each test
    refreshAllTaskListViews = jest.fn();
    mockApp = { ...baseMockApp };

    // Reset the singleton instance
    (PropertySearchEngine as any).resetInstance();

    propertySearchEngine = PropertySearchEngine.getInstance(mockApp, {
      taskStateManager: mockTaskStateManager,
      refreshAllTaskListViews,
      vaultScanner: mockVaultScanner,
    });
  });

  describe('Initialization', () => {
    test('should reset instance properly', () => {
      // Create an instance first
      const initialInstance = PropertySearchEngine.getInstance(mockApp, {
        taskStateManager: mockTaskStateManager,
        refreshAllTaskListViews,
        vaultScanner: mockVaultScanner,
      });

      // Reset it
      (PropertySearchEngine as any).resetInstance();

      // Create a new instance
      const newInstance = PropertySearchEngine.getInstance(mockApp, {
        taskStateManager: mockTaskStateManager,
        refreshAllTaskListViews,
        vaultScanner: mockVaultScanner,
      });

      expect(initialInstance).not.toBe(newInstance);
    });

    test('should handle startup scan settings', async () => {
      // Disable startup scan
      propertySearchEngine.setStartupScanEnabled(false);
      expect(propertySearchEngine.isStartupScanEnabled()).toBe(false);

      // Enable startup scan
      propertySearchEngine.setStartupScanEnabled(true);
      expect(propertySearchEngine.isStartupScanEnabled()).toBe(true);
    });

    test('should return proper state from isReady()', async () => {
      expect(propertySearchEngine.isReady()).toBe(false);

      // Initialize
      await propertySearchEngine.initialize();
      expect(propertySearchEngine.isReady()).toBe(true);
    });

    test('should handle vault scanner availability', async () => {
      // Test without vault scanner
      (PropertySearchEngine as any).resetInstance();
      const engineWithoutScanner = PropertySearchEngine.getInstance(mockApp, {
        taskStateManager: mockTaskStateManager,
        refreshAllTaskListViews,
      });

      await engineWithoutScanner.initialize();
      expect(engineWithoutScanner.isReady()).toBe(true);
    });
  });

  describe('Cache Management', () => {
    test('should return property count', async () => {
      await propertySearchEngine.initialize();
      expect(propertySearchEngine.getPropertyCount()).toBe(0);
    });

    test('should handle property key operations', async () => {
      await propertySearchEngine.initialize();

      expect(propertySearchEngine.getPropertyKeys().size).toBe(0);
      expect(propertySearchEngine.hasPropertyKey('nonexistent')).toBe(false);
    });

    test('should reset engine state', async () => {
      await propertySearchEngine.initialize();
      propertySearchEngine.reset();

      expect(propertySearchEngine.isReady()).toBe(false);
      expect(propertySearchEngine.getPropertyCount()).toBe(0);
    });

    test('should destroy engine properly', async () => {
      await propertySearchEngine.initialize();

      // Register some event listeners to test unregistering
      (propertySearchEngine as any).registerEventListeners();

      propertySearchEngine.destroy();

      expect(propertySearchEngine.isReady()).toBe(false);
      expect(propertySearchEngine.getPropertyCount()).toBe(0);
    });
  });

  describe('File Operations', () => {
    test('should handle file invalidation', async () => {
      const mockFile = createMockFile('test-file.md');

      // Test with non-task file
      (mockTaskStateManager.getTasks as jest.Mock).mockReturnValue([]);
      propertySearchEngine.invalidateFile(mockFile);

      // Should not process invalid file
      expect((propertySearchEngine as any).pendingUpdates.size).toBe(0);
    });

    test('should handle file rename events', async () => {
      const oldFile = createMockFile('old-file.md');
      const newFile = createMockFile('new-file.md');

      // Make the file contain tasks
      (mockTaskStateManager.getTasks as jest.Mock).mockReturnValue([
        { path: oldFile.path },
      ]);

      propertySearchEngine.onFileRenamed(newFile, oldFile.path);

      expect(
        (propertySearchEngine as any).pendingUpdates.has(oldFile.path),
      ).toBe(true);
      expect(
        (propertySearchEngine as any).pendingUpdates.has(newFile.path),
      ).toBe(true);
    });

    test('should remove file from cache', async () => {
      // Create test file
      const testFile = createMockFile('test.md');

      // Add some properties to cache
      (propertySearchEngine as any).propertyCache.set(
        'testProp',
        new Map([
          ['value1', new Set([testFile.path])],
          ['value2', new Set([testFile.path])],
        ]),
      );

      (propertySearchEngine as any).propertyKeys.add('testProp');

      // Remove the file from cache
      (propertySearchEngine as any).removeFileFromCache(testFile.path);

      // Verify properties are removed
      const value1Set = (propertySearchEngine as any).propertyCache
        .get('testProp')
        ?.get('value1');
      const value2Set = (propertySearchEngine as any).propertyCache
        .get('testProp')
        ?.get('value2');

      expect(value1Set).toBeUndefined();
      expect(value2Set).toBeUndefined();
    });
  });

  describe('Event Handling', () => {
    test('should register and unregister event listeners', async () => {
      const engine = PropertySearchEngine.getInstance(mockApp, {
        taskStateManager: mockTaskStateManager,
        refreshAllTaskListViews,
        vaultScanner: mockVaultScanner,
      });

      (engine as any).registerEventListeners();
      expect((engine as any).eventListenersRegistered).toBe(true);

      (engine as any).unregisterEventListeners();
      expect((engine as any).eventListenersRegistered).toBe(false);
    });

    test('should handle file change events', async () => {
      const mockFile = createMockFile('changed-file.md');
      const invalidateFileSpy = jest.spyOn(
        propertySearchEngine as any,
        'invalidateFile',
      );

      propertySearchEngine.onFileChanged(mockFile);

      expect(invalidateFileSpy).toHaveBeenCalledWith(mockFile);
    });

    test('should handle file deletion events', async () => {
      const mockFile = createMockFile('deleted-file.md');
      const invalidateFileSpy = jest.spyOn(
        propertySearchEngine as any,
        'invalidateFile',
      );

      propertySearchEngine.onFileDeleted(mockFile);

      expect(invalidateFileSpy).toHaveBeenCalledWith(mockFile);
    });
  });

  describe('Pending Updates', () => {
    test('should handle process pending updates', async () => {
      // Create test file with properties
      const testFile = createMockFile('test-file.md');

      // Mock that file has tasks
      (mockTaskStateManager.getTasks as jest.Mock).mockReturnValue([
        { path: testFile.path },
      ]);

      // Mock file cache
      (mockApp.metadataCache.getFileCache as jest.Mock).mockReturnValue({
        frontmatter: {
          testProp: 'testValue',
          anotherProp: 42,
        },
      });

      (mockApp.vault.getAbstractFileByPath as jest.Mock).mockReturnValue(
        testFile,
      );

      // Initialize engine (this will scan property keys)
      await propertySearchEngine.initialize();

      // Verify properties were scanned
      expect(propertySearchEngine.getPropertyCount()).toBeGreaterThan(0);
    });
  });

  describe('Search Functionality', () => {
    test('should handle comparison operators for numbers', async () => {
      // Create test files with numeric properties
      const files = [
        createMockFile('file1.md'),
        createMockFile('file2.md'),
        createMockFile('file3.md'),
      ];

      // Mock tasks in these files
      (mockTaskStateManager.getTasks as jest.Mock).mockReturnValue(
        files.map((file) => ({
          path: file.path,
          line: 1,
          rawText: 'TODO test',
          text: 'test',
          completed: false,
          state: 'TODO',
        })),
      );

      // Mock file cache with numeric properties
      (mockApp.metadataCache.getFileCache as jest.Mock).mockImplementation(
        (file) => {
          const fileIndex = files.findIndex((f) => f.path === file.path);
          if (fileIndex === 0) {
            return { frontmatter: { priority: 1 } };
          } else if (fileIndex === 1) {
            return { frontmatter: { priority: 2 } };
          } else if (fileIndex === 2) {
            return { frontmatter: { priority: 3 } };
          }
          return null;
        },
      );

      (mockApp.vault.getAbstractFileByPath as jest.Mock).mockImplementation(
        (path) => {
          return files.find((f) => f.path === path) || null;
        },
      );

      await propertySearchEngine.initialize();

      // Test numeric comparisons
      const results1 =
        await propertySearchEngine.searchProperties('[priority:>1]');
      expect(results1.size).toBe(2); // files with priority > 1

      const results2 =
        await propertySearchEngine.searchProperties('[priority:<3]');
      expect(results2.size).toBe(2); // files with priority < 3

      const results3 =
        await propertySearchEngine.searchProperties('[priority:>=2]');
      expect(results3.size).toBe(2); // files with priority >= 2
    });

    test('should handle boolean property searches', async () => {
      // Create test files with boolean properties
      const files = [
        createMockFile('file1.md'),
        createMockFile('file2.md'),
        createMockFile('file3.md'),
      ];

      // Mock tasks in these files
      (mockTaskStateManager.getTasks as jest.Mock).mockReturnValue(
        files.map((file) => ({
          path: file.path,
          line: 1,
          rawText: 'TODO test',
          text: 'test',
          completed: false,
          state: 'TODO',
        })),
      );

      // Mock file cache with boolean properties
      (mockApp.metadataCache.getFileCache as jest.Mock).mockImplementation(
        (file) => {
          const fileIndex = files.findIndex((f) => f.path === file.path);
          if (fileIndex === 0) {
            return { frontmatter: { completed: true } };
          } else if (fileIndex === 1) {
            return { frontmatter: { completed: false } };
          } else if (fileIndex === 2) {
            return { frontmatter: { completed: true } };
          }
          return null;
        },
      );

      (mockApp.vault.getAbstractFileByPath as jest.Mock).mockImplementation(
        (path) => {
          return files.find((f) => f.path === path) || null;
        },
      );

      await propertySearchEngine.initialize();

      // Test boolean searches
      const trueResults =
        await propertySearchEngine.searchProperties('[completed:true]');
      expect(trueResults.size).toBe(2); // files with completed: true

      const falseResults =
        await propertySearchEngine.searchProperties('[completed:false]');
      expect(falseResults.size).toBe(1); // files with completed: false
    });

    test('should handle array property searches', async () => {
      // Create test files with array properties
      const files = [
        createMockFile('file1.md'),
        createMockFile('file2.md'),
        createMockFile('file3.md'),
      ];

      // Mock tasks in these files
      (mockTaskStateManager.getTasks as jest.Mock).mockReturnValue(
        files.map((file) => ({
          path: file.path,
          line: 1,
          rawText: 'TODO test',
          text: 'test',
          completed: false,
          state: 'TODO',
        })),
      );

      // Mock file cache with array properties
      (mockApp.metadataCache.getFileCache as jest.Mock).mockImplementation(
        (file) => {
          const fileIndex = files.findIndex((f) => f.path === file.path);
          if (fileIndex === 0) {
            return { frontmatter: { tags: ['work', 'urgent'] } };
          } else if (fileIndex === 1) {
            return { frontmatter: { tags: ['personal'] } };
          } else if (fileIndex === 2) {
            return { frontmatter: { tags: ['urgent', 'important'] } };
          }
          return null;
        },
      );

      (mockApp.vault.getAbstractFileByPath as jest.Mock).mockImplementation(
        (path) => {
          return files.find((f) => f.path === path) || null;
        },
      );

      await propertySearchEngine.initialize();

      // Test array property searches
      const urgentResults =
        await propertySearchEngine.searchProperties('[tags:urgent]');
      expect(urgentResults.size).toBe(2); // files with 'urgent' tag
    });
  });

  describe('Data Parsing', () => {
    test('should parse date for comparison', () => {
      const engine = PropertySearchEngine.getInstance(mockApp, {
        taskStateManager: mockTaskStateManager,
        refreshAllTaskListViews,
        vaultScanner: mockVaultScanner,
      });

      // Test date parsing
      const fullDate = (engine as any).parseDateForComparison('2026-02-21');
      expect(fullDate).toBeInstanceOf(Date);
      expect(fullDate.getFullYear()).toBe(2026);
      expect(fullDate.getMonth()).toBe(1); // February is 1
      expect(fullDate.getDate()).toBe(21);

      const yearMonth = (engine as any).parseDateForComparison('2026-02');
      expect(yearMonth).toBeInstanceOf(Date);
      expect(yearMonth.getFullYear()).toBe(2026);
      expect(yearMonth.getMonth()).toBe(1);
      expect(yearMonth.getDate()).toBe(1);

      const year = (engine as any).parseDateForComparison('2026');
      expect(year).toBeInstanceOf(Date);
      expect(year.getFullYear()).toBe(2026);
      expect(year.getMonth()).toBe(0); // January
      expect(year.getDate()).toBe(1);
    });

    test('should parse property value as date', () => {
      const engine = PropertySearchEngine.getInstance(mockApp, {
        taskStateManager: mockTaskStateManager,
        refreshAllTaskListViews,
        vaultScanner: mockVaultScanner,
      });

      // Test various date formats
      const dateStr = (engine as any).parsePropertyValueAsDate('2026-02-21');
      expect(dateStr).toBeInstanceOf(Date);

      const dateObj = (engine as any).parsePropertyValueAsDate(
        new Date(2026, 1, 21),
      );
      expect(dateObj).toBeInstanceOf(Date);
    });
  });

  describe('Utility Methods', () => {
    test('should check if file contains tasks', async () => {
      const mockFile = createMockFile('test-file.md');

      // Test file with tasks
      (mockTaskStateManager.getTasks as jest.Mock).mockReturnValue([
        { path: mockFile.path },
      ]);
      expect((propertySearchEngine as any).fileContainsTasks(mockFile)).toBe(
        true,
      );

      // Test file without tasks
      (mockTaskStateManager.getTasks as jest.Mock).mockReturnValue([]);
      expect((propertySearchEngine as any).fileContainsTasks(mockFile)).toBe(
        false,
      );
    });

    test('should check if file path contains tasks', async () => {
      const testPath = 'test-file.md';

      // Test file with tasks
      (mockTaskStateManager.getTasks as jest.Mock).mockReturnValue([
        { path: testPath },
      ]);
      expect(
        (propertySearchEngine as any).filePathContainsTasks(testPath),
      ).toBe(true);

      // Test file without tasks
      (mockTaskStateManager.getTasks as jest.Mock).mockReturnValue([]);
      expect(
        (propertySearchEngine as any).filePathContainsTasks(testPath),
      ).toBe(false);
    });
  });
});
