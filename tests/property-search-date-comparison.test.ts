/**
 * @jest-environment jsdom
 */
import { PropertySearchEngine } from '../src/services/property-search-engine';
import { App, TFile } from 'obsidian';

// Create mock files with date properties
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

// Test files with various date properties
const testFilesData = [
  {
    path: 'task-past.md',
    target: '2025-12-31',
    due: '2025-11-15',
    created: '2025-01-01',
  },
  {
    path: 'task-today.md',
    target: '2026-02-06',
    due: '2026-02-06',
    created: '2026-01-15',
  },
  {
    path: 'task-future-1.md',
    target: '2026-03-01',
    due: '2026-03-15',
    created: '2026-02-01',
  },
  {
    path: 'task-future-2.md',
    target: '2026-06-15',
    due: '2026-07-01',
    created: '2026-02-05',
  },
  {
    path: 'task-future-3.md',
    target: '2027-01-01',
    due: '2027-01-15',
    created: '2026-02-06',
  },
  { path: 'task-no-date.md', target: null, due: null, created: '2026-01-01' },
];

// Create a cache of test files
const testFilesCache = new Map<string, TFile>();
testFilesData.forEach((data) => {
  testFilesCache.set(data.path, createMockFile(data.path));
});

// Mock TaskStateManager
const mockTaskStateManager = {
  getTasks: () => {
    return testFilesData.map((data) => ({
      path: data.path,
      text: `Task in ${data.path}`,
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
    }));
  },
};

// Mock app with date property support
const mockApp = {
  vault: {
    getMarkdownFiles: () => Array.from(testFilesCache.values()),
    getAbstractFileByPath: (path: string) => testFilesCache.get(path) || null,
    on: jest.fn(),
  },
  metadataCache: {
    getFileCache: (file: TFile) => {
      const data = testFilesData.find((d) => d.path === file.path);
      if (!data) return null;

      const frontmatter: Record<string, string | null> = {};
      if (data.target) frontmatter.target = data.target;
      if (data.due) frontmatter.due = data.due;
      if (data.created) frontmatter.created = data.created;

      if (Object.keys(frontmatter).length === 0) return null;
      return { frontmatter };
    },
    on: jest.fn(),
  },
} as unknown as App;

// Expose plugin instance
(window as unknown as { todoSeqPlugin?: unknown }).todoSeqPlugin = {
  taskStateManager: mockTaskStateManager,
};

describe('PropertySearchEngine Date Comparison Operators', () => {
  let propertySearchEngine: PropertySearchEngine;

  beforeEach(() => {
    // Reset singleton - first get instance with dependencies to call reset
    PropertySearchEngine.getInstance(mockApp, {
      taskStateManager: mockTaskStateManager,
      refreshAllTaskListViews: jest.fn(),
      vaultScanner: undefined,
    }).reset();
    propertySearchEngine = PropertySearchEngine.getInstance(mockApp, {
      taskStateManager: mockTaskStateManager,
      refreshAllTaskListViews: jest.fn(),
      vaultScanner: undefined,
    });
  });

  describe('Greater than (>) operator', () => {
    test('should find files with target date > 2026-01-01', async () => {
      await propertySearchEngine.initialize();

      const results = await propertySearchEngine.searchProperties(
        '[target:>2026-01-01]',
      );

      // Should include: task-today (2026-02-06), task-future-1 (2026-03-01), task-future-2 (2026-06-15), task-future-3 (2027-01-01)
      expect(results.size).toBe(4);
      expect(results.has('task-today.md')).toBe(true);
      expect(results.has('task-future-1.md')).toBe(true);
      expect(results.has('task-future-2.md')).toBe(true);
      expect(results.has('task-future-3.md')).toBe(true);
      expect(results.has('task-past.md')).toBe(false);
    });

    test('should find files with due date > 2026-03-01', async () => {
      await propertySearchEngine.initialize();

      const results =
        await propertySearchEngine.searchProperties('[due:>2026-03-01]');

      // Should include: task-future-1 (2026-03-15), task-future-2 (2026-07-01), task-future-3 (2027-01-15)
      expect(results.size).toBe(3);
      expect(results.has('task-future-1.md')).toBe(true);
      expect(results.has('task-future-2.md')).toBe(true);
      expect(results.has('task-future-3.md')).toBe(true);
    });

    test('should return empty set when no dates match > condition', async () => {
      await propertySearchEngine.initialize();

      const results = await propertySearchEngine.searchProperties(
        '[target:>2030-01-01]',
      );

      expect(results.size).toBe(0);
    });
  });

  describe('Less than (<) operator', () => {
    test('should find files with target date < 2026-02-06', async () => {
      await propertySearchEngine.initialize();

      const results = await propertySearchEngine.searchProperties(
        '[target:<2026-02-06]',
      );

      // Should include: task-past (2025-12-31)
      expect(results.size).toBe(1);
      expect(results.has('task-past.md')).toBe(true);
      expect(results.has('task-today.md')).toBe(false);
    });

    test('should find files with created date < 2026-02-01', async () => {
      await propertySearchEngine.initialize();

      const results = await propertySearchEngine.searchProperties(
        '[created:<2026-02-01]',
      );

      // Should include files with created date before 2026-02-01
      expect(results.size).toBeGreaterThan(0);
      expect(results.has('task-past.md')).toBe(true); // created 2025-01-01
    });
  });

  describe('Greater than or equal (>=) operator', () => {
    test('should find files with target date >= 2026-02-06', async () => {
      await propertySearchEngine.initialize();

      const results = await propertySearchEngine.searchProperties(
        '[target:>=2026-02-06]',
      );

      // Should include: task-today (2026-02-06), task-future-1, task-future-2, task-future-3
      expect(results.size).toBe(4);
      expect(results.has('task-today.md')).toBe(true);
      expect(results.has('task-future-1.md')).toBe(true);
      expect(results.has('task-future-2.md')).toBe(true);
      expect(results.has('task-future-3.md')).toBe(true);
    });

    test('should include the exact date when using >=', async () => {
      await propertySearchEngine.initialize();

      // Use a date that exactly matches one file
      const results = await propertySearchEngine.searchProperties(
        '[target:>=2026-03-01]',
      );

      // Should include task-future-1 (2026-03-01) and later
      expect(results.has('task-future-1.md')).toBe(true);
    });
  });

  describe('Less than or equal (<=) operator', () => {
    test('should find files with target date <= 2026-02-06', async () => {
      await propertySearchEngine.initialize();

      const results = await propertySearchEngine.searchProperties(
        '[target:<=2026-02-06]',
      );

      // Should include: task-past (2025-12-31), task-today (2026-02-06)
      expect(results.size).toBe(2);
      expect(results.has('task-past.md')).toBe(true);
      expect(results.has('task-today.md')).toBe(true);
    });

    test('should include the exact date when using <=', async () => {
      await propertySearchEngine.initialize();

      const results = await propertySearchEngine.searchProperties(
        '[target:<=2026-03-01]',
      );

      // Should include task-future-1 (2026-03-01) and earlier
      expect(results.has('task-future-1.md')).toBe(true);
    });
  });

  describe('Edge cases', () => {
    test('should handle files without the date property', async () => {
      await propertySearchEngine.initialize();

      // task-no-date.md has no target property
      const results = await propertySearchEngine.searchProperties(
        '[target:>2025-01-01]',
      );

      // Should not include task-no-date.md since it has no target
      expect(results.has('task-no-date.md')).toBe(false);
    });

    test('should handle invalid date format gracefully', async () => {
      await propertySearchEngine.initialize();

      const results = await propertySearchEngine.searchProperties(
        '[target:>invalid-date]',
      );

      // Should return empty set for invalid date
      expect(results.size).toBe(0);
    });

    test('should work with year-only dates', async () => {
      await propertySearchEngine.initialize();

      const results =
        await propertySearchEngine.searchProperties('[target:>2025]');

      // All dates in 2026 and beyond should match
      expect(results.size).toBeGreaterThan(0);
    });

    test('should work with year-month dates', async () => {
      await propertySearchEngine.initialize();

      const results =
        await propertySearchEngine.searchProperties('[target:>=2026-02]');

      // All dates in Feb 2026 and beyond should match
      expect(results.size).toBeGreaterThan(0);
      expect(results.has('task-today.md')).toBe(true);
    });
  });

  describe('Combined with OR operator', () => {
    test('should handle OR with date comparisons', async () => {
      await propertySearchEngine.initialize();

      // Note: Within a property search, OR separates values for the same key
      const results = await propertySearchEngine.searchProperties(
        '[target:<2026-01-01 OR >2026-12-31]',
      );

      // Should include: task-past (before 2026), task-future-3 (2027)
      expect(results.size).toBe(2);
      expect(results.has('task-past.md')).toBe(true);
      expect(results.has('task-future-3.md')).toBe(true);
    });
  });
});
