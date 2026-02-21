/**
 * @jest-environment jsdom
 */
import { PropertySearchEngine } from '../src/services/property-search-engine';
import { App, TFile } from 'obsidian';

// Create mock file objects
const createMockFile = (index: number): TFile => {
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
    // Create mock tasks for files with properties
    const tasks = [];
    for (let i = 0; i < 1000; i++) {
      // Create tasks for files that have properties (about 20% of files)
      if (
        i % 5 === 0 ||
        i % 7 === 0 ||
        i % 11 === 0 ||
        i % 13 === 0 ||
        i % 17 === 0
      ) {
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
    }
    return tasks;
  },
};

// Create a cache of test files for quick lookup
const performanceTestFilesCache = new Map<string, TFile>();
for (let i = 0; i < 1000; i++) {
  const file = createMockFile(i);
  performanceTestFilesCache.set(file.path, file);
}

// Mock the Obsidian app
const mockApp = {
  vault: {
    getMarkdownFiles: () => {
      // Simulate a large vault with 1000 files
      const files = [];
      for (let i = 0; i < 1000; i++) {
        const file = performanceTestFilesCache.get(`file-${i}.md`);
        if (file) {
          files.push(file);
        }
      }
      return files;
    },
    getAbstractFileByPath: (path: string) => {
      // Return mock file from cache for given path
      return performanceTestFilesCache.get(path) || null;
    },
    on: jest.fn(),
  },
  metadataCache: {
    getFileCache: (file: TFile) => {
      // Simulate files with different properties
      const fileNum = parseInt(
        file.path.replace('file-', '').replace('.md', ''),
      );
      const frontmatter: any = {};

      // Add properties to about 20% of files
      if (fileNum % 5 === 0) frontmatter.status = 'draft';
      if (fileNum % 7 === 0) frontmatter.priority = 'high';
      if (fileNum % 11 === 0) frontmatter.tags = ['work', 'urgent'];
      if (fileNum % 13 === 0) frontmatter.due = '2023-12-31';
      if (fileNum % 17 === 0) frontmatter.type = 'task';

      return Object.keys(frontmatter).length > 0 ? { frontmatter } : null;
    },
    getAllPropertyInfos: () => {
      // Simulate known property types
      return {
        status: { type: 'string' },
        priority: { type: 'string' },
        tags: { type: 'array' },
        due: { type: 'date' },
        type: { type: 'string' },
      };
    },
    on: jest.fn(),
  },
} as unknown as App;

// Expose plugin instance with task state manager for testing
(window as unknown as { todoSeqPlugin?: any }).todoSeqPlugin = {
  taskStateManager: mockTaskStateManager,
};

describe('PropertySearchEngine Performance', () => {
  let propertySearchEngine: PropertySearchEngine;

  beforeEach(() => {
    propertySearchEngine = PropertySearchEngine.getInstance(mockApp, {
      taskStateManager: mockTaskStateManager,
      refreshAllTaskListViews: jest.fn(),
      vaultScanner: undefined,
    });
  });

  test('should handle file invalidation efficiently', async () => {
    await propertySearchEngine.initialize();

    // Simulate file change
    const mockFile = createMockFile(1);

    const startTime = Date.now();
    propertySearchEngine.invalidateFile(mockFile);
    const endTime = Date.now();

    expect(endTime - startTime).toBeLessThan(50); // Should be very fast (< 50ms)
  });
});
