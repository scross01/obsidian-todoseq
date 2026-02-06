/**
 * @jest-environment jsdom
 */
import { PropertySearchEngine } from '../src/services/property-search-engine';
import { App, TFile } from 'obsidian';

// Create simple mock files with known properties
const createMockFile = (
  index: number,
  hasProperties: boolean = true,
): TFile => {
  const fileNum = index;
  const frontmatter: any = hasProperties
    ? {
        status: fileNum % 2 === 0 ? 'draft' : 'published',
        priority: fileNum % 3 === 0 ? 'high' : 'normal',
        tags: fileNum % 4 === 0 ? ['work', 'urgent'] : ['personal'],
        type: 'task',
      }
    : {};

  const mockFile = {
    path: `file-${index}.md`,
    name: `file-${index}.md`,
    basename: `file-${index}`,
    extension: 'md',
    stat: { size: 1024, mtime: Date.now() },
    // Add isTFile property to help with type check
    isTFile: true,
  };

  // Make it recognize as TFile instance
  Object.setPrototypeOf(mockFile, {
    constructor: { name: 'TFile' },
    __proto__: { __proto__: Object.prototype },
  });

  return mockFile as unknown as TFile;
};

// Mock TaskStateManager
const mockTaskStateManager = {
  getTasks: () => {
    // Create mock tasks for all test files
    const tasks = [];
    for (let i = 0; i < 20; i++) {
      tasks.push({
        path: `file-${i}.md`,
        text: `Test task ${i}`,
        completed: false,
        state: 'TODO',
        priority: null,
        scheduledDate: null,
        deadlineDate: null,
        tags: [],
        context: '',
        project: '',
        urgency: 0,
        estimatedDuration: 0,
        isRecurring: false,
        recurrenceRule: '',
        lineNumber: 1,
        listType: 'bullet',
      });
    }
    return tasks;
  },
};

// Simple mock app with known files
const mockApp = {
  vault: {
    getMarkdownFiles: () => {
      // Create 20 test files with properties
      const files = [];
      for (let i = 0; i < 20; i++) {
        files.push(createMockFile(i, i % 5 !== 0)); // 80% have properties
      }
      return files;
    },
    getAbstractFileByPath: (path: string) => {
      // Return mock file from cache for given path
      return testFilesCache.get(path) || null;
    },
    on: jest.fn(),
  },
  metadataCache: {
    getFileCache: (file: TFile) => {
      const fileNum = parseInt(
        file.path.replace('file-', '').replace('.md', ''),
      );
      const hasProperties = fileNum % 5 !== 0;

      if (!hasProperties) return null;

      const frontmatter: any = {
        status: fileNum % 2 === 0 ? 'draft' : 'published',
        priority: fileNum % 3 === 0 ? 'high' : 'normal',
        tags: fileNum % 4 === 0 ? ['work', 'urgent'] : ['personal'],
        type: 'task',
      };

      return { frontmatter };
    },
    getAllPropertyInfos: () => {
      return {
        status: { type: 'string' },
        priority: { type: 'string' },
        tags: { type: 'array' },
        type: { type: 'string' },
      };
    },
    on: jest.fn(),
  },
} as unknown as App;

// Create a cache of test files for quick lookup
const testFilesCache = new Map<string, TFile>();
for (let i = 0; i < 20; i++) {
  const file = createMockFile(i, i % 5 !== 0);
  testFilesCache.set(file.path, file);
}

// Expose plugin instance with task state manager for testing
(window as unknown as { todoSeqPlugin?: any }).todoSeqPlugin = {
  taskStateManager: mockTaskStateManager,
};

describe('PropertySearchEngine Simple Tests', () => {
  let propertySearchEngine: PropertySearchEngine;

  beforeEach(() => {
    propertySearchEngine = PropertySearchEngine.getInstance(mockApp);
  });

  test('should initialize and find property keys', async () => {
    // Log what our metadata cache knows
    testFilesCache.forEach((file, path) => {
      const cache = mockApp.metadataCache.getFileCache(file);
    });

    await propertySearchEngine.initialize();

    expect(propertySearchEngine.isReady()).toBe(true);
    expect(propertySearchEngine.getPropertyCount()).toBeGreaterThan(0);
    expect(propertySearchEngine.getPropertyKeys().size).toBe(4); // status, priority, tags, type
  });

  test('should search for specific property values', async () => {
    await propertySearchEngine.initialize();

    const results =
      await propertySearchEngine.searchProperties('[status:draft]');

    expect(results.size).toBeGreaterThan(0);
    expect(results.size).toBeLessThanOrEqual(10); // Should be roughly half of files with properties
  });

  test('should handle key-only searches', async () => {
    await propertySearchEngine.initialize();

    const results = await propertySearchEngine.searchProperties('[priority]');

    expect(results.size).toBeGreaterThan(0);
    expect(results.size).toBeGreaterThan(5); // Most files should have priority
  });

  test('should handle array property searches', async () => {
    await propertySearchEngine.initialize();

    const results = await propertySearchEngine.searchProperties('[tags:work]');
    expect(results.size).toBeGreaterThan(0);
  });

  test('should get files with property key', async () => {
    await propertySearchEngine.initialize();

    const files = propertySearchEngine.getFilesWithPropertyKey('status');

    expect(files.size).toBeGreaterThan(0);
  });

  test('should get files with specific property value', async () => {
    await propertySearchEngine.initialize();

    const files = propertySearchEngine.getFilesWithProperty('status', 'draft');

    expect(files.size).toBeGreaterThan(0);
  });

  test('should handle invalid queries gracefully', async () => {
    await propertySearchEngine.initialize();

    const results =
      await propertySearchEngine.searchProperties('[invalid:query');
    expect(results.size).toBe(0);
  });

  test('should handle file invalidation', async () => {
    await propertySearchEngine.initialize();

    const initialCount = propertySearchEngine.getFileCountForProperty('status');
    const mockFile = createMockFile(21);

    propertySearchEngine.invalidateFile(mockFile);

    // After invalidation, the property count should remain the same (no rebuild in this simple test)
    const newCount = propertySearchEngine.getFileCountForProperty('status');
    expect(newCount).toBe(initialCount);
  });
});
