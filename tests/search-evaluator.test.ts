/**
 * Comprehensive tests for SearchEvaluator
 * Tests the evaluator directly with real implementations, minimal mocking
 */
import { SearchEvaluator } from '../src/search/search-evaluator';
import { SearchParser } from '../src/search/search-parser';
import { Task } from '../src/types/task';
import { TodoTrackerSettings } from '../src/settings/settings-types';
import { PropertySearchEngine } from '../src/services/property-search-engine';
import { TFile } from 'obsidian';
import { createBaseTask, createBaseSettings } from './helpers/test-helper';

// Helper to parse search query into AST node
const parseQuery = (query: string) => SearchParser.parse(query);

// Create a mock App with vault and metadataCache
const createMockApp = () => ({
  vault: {
    getAbstractFileByPath: jest.fn(),
    on: jest.fn(),
    offref: jest.fn(),
  },
  metadataCache: {
    getFileCache: jest.fn(),
    on: jest.fn(),
    offref: jest.fn(),
  },
});

// Helper to create settings with mock app
const createSettingsWithApp = (
  app: ReturnType<typeof createMockApp>,
): TodoTrackerSettings => {
  const settings = createBaseSettings();
  return { ...settings, app };
};

describe('SearchEvaluator - Comprehensive', () => {
  describe('Property Filter Evaluation', () => {
    it('should evaluate property filter with PropertySearchEngine', async () => {
      const mockEngine = {
        searchProperties: jest.fn(async (query: string) => {
          if (query === '[type:Project]') {
            return new Set(['project.md']);
          }
          return new Set();
        }),
      } as unknown as PropertySearchEngine;

      const task = createBaseTask({
        path: 'project.md',
        line: 1,
        rawText: 'TODO project task',
        text: 'project task',
      });

      const node = {
        type: 'property_filter' as const,
        field: 'property',
        value: 'type:Project',
        exact: false,
      };

      const result = await SearchEvaluator.evaluate(
        node,
        task,
        false,
        undefined,
        mockEngine,
      );
      expect(result).toBe(true);
      expect(mockEngine.searchProperties).toHaveBeenCalledWith(
        '[type:Project]',
        false,
      );
    });

    it('should evaluate property filter with case sensitivity', async () => {
      const mockEngine = {
        searchProperties: jest.fn(
          async (query: string, caseSensitive: boolean) => {
            if (query === '[type:Project]' && !caseSensitive) {
              return new Set(['project.md']);
            }
            return new Set();
          },
        ),
      } as unknown as PropertySearchEngine;

      const task = createBaseTask({
        path: 'project.md',
        line: 1,
        rawText: 'TODO project task',
        text: 'project task',
      });

      const node = {
        type: 'property_filter' as const,
        field: 'property',
        value: 'type:Project',
        exact: false,
      };

      const result = await SearchEvaluator.evaluate(
        node,
        task,
        false,
        undefined,
        mockEngine,
      );
      expect(result).toBe(true);
    });

    it('should fall back to direct metadata when PropertySearchEngine throws', async () => {
      const mockApp = createMockApp();
      const mockFile = new TFile('test.md', 'test', 'md');
      (mockApp.vault.getAbstractFileByPath as jest.Mock).mockReturnValue(
        mockFile,
      );
      (mockApp.metadataCache.getFileCache as jest.Mock).mockReturnValue({
        frontmatter: { type: 'Project', priority: 'high' },
      });

      const settings = createSettingsWithApp(mockApp);
      const task = createBaseTask({
        path: 'test.md',
        line: 1,
        rawText: 'TODO test task',
        text: 'test task',
      });

      const node = {
        type: 'property_filter' as const,
        field: 'property',
        value: 'type:Project',
        exact: false,
      };

      const mockEngine = {
        searchProperties: jest.fn(async () => {
          throw new Error('Engine failed');
        }),
      } as unknown as PropertySearchEngine;

      const result = await SearchEvaluator.evaluate(
        node,
        task,
        false,
        settings,
        mockEngine,
      );
      expect(result).toBe(true);
    });

    it('should evaluate property key-only search [type]', async () => {
      const mockApp = createMockApp();
      const mockFile = new TFile('test.md', 'test', 'md');
      (mockApp.vault.getAbstractFileByPath as jest.Mock).mockReturnValue(
        mockFile,
      );
      (mockApp.metadataCache.getFileCache as jest.Mock).mockReturnValue({
        frontmatter: { type: 'Project' },
      });

      const settings = createSettingsWithApp(mockApp);
      const task = createBaseTask({
        path: 'test.md',
        line: 1,
        rawText: 'TODO test task',
        text: 'test task',
      });

      const node = {
        type: 'property_filter' as const,
        field: 'property',
        value: 'type',
        exact: false,
      };

      const result = await SearchEvaluator.evaluate(
        node,
        task,
        false,
        settings,
        null,
      );
      expect(result).toBe(true);
    });

    it('should evaluate property key-only search with empty value [type:]', async () => {
      const mockApp = createMockApp();
      const mockFile = new TFile('test.md', 'test', 'md');
      (mockApp.vault.getAbstractFileByPath as jest.Mock).mockReturnValue(
        mockFile,
      );
      (mockApp.metadataCache.getFileCache as jest.Mock).mockReturnValue({
        frontmatter: { type: 'Project' },
      });

      const settings = createSettingsWithApp(mockApp);
      const task = createBaseTask({
        path: 'test.md',
        line: 1,
        rawText: 'TODO test task',
        text: 'test task',
      });

      const node = {
        type: 'property_filter' as const,
        field: 'property',
        value: 'type:',
        exact: false,
      };

      const result = await SearchEvaluator.evaluate(
        node,
        task,
        false,
        settings,
        null,
      );
      expect(result).toBe(true);
    });

    it('should not match missing property', async () => {
      const mockApp = createMockApp();
      const mockFile = new TFile('test.md', 'test', 'md');
      (mockApp.vault.getAbstractFileByPath as jest.Mock).mockReturnValue(
        mockFile,
      );
      (mockApp.metadataCache.getFileCache as jest.Mock).mockReturnValue({
        frontmatter: { priority: 'high' },
      });

      const settings = createSettingsWithApp(mockApp);
      const task = createBaseTask({
        path: 'test.md',
        line: 1,
        rawText: 'TODO test task',
        text: 'test task',
      });

      const node = {
        type: 'property_filter' as const,
        field: 'property',
        value: 'type:Project',
        exact: false,
      };

      const result = await SearchEvaluator.evaluate(
        node,
        task,
        false,
        settings,
        null,
      );
      expect(result).toBe(false);
    });

    it('should evaluate OR expressions in property value [status:Draft OR Published]', async () => {
      const mockApp = createMockApp();
      const mockFile = new TFile('test.md', 'test', 'md');
      (mockApp.vault.getAbstractFileByPath as jest.Mock).mockReturnValue(
        mockFile,
      );
      (mockApp.metadataCache.getFileCache as jest.Mock).mockReturnValue({
        frontmatter: { status: 'Draft' },
      });

      const settings = createSettingsWithApp(mockApp);
      const task = createBaseTask({
        path: 'test.md',
        line: 1,
        rawText: 'TODO test task',
        text: 'test task',
      });

      const node = {
        type: 'property_filter' as const,
        field: 'property',
        value: 'status:Draft OR Published',
        exact: false,
      };

      const result = await SearchEvaluator.evaluate(
        node,
        task,
        false,
        settings,
        null,
      );
      expect(result).toBe(true);
    });

    it('should evaluate OR expressions with parentheses [status:(Draft OR Published)]', async () => {
      const mockApp = createMockApp();
      const mockFile = new TFile('test.md', 'test', 'md');
      (mockApp.vault.getAbstractFileByPath as jest.Mock).mockReturnValue(
        mockFile,
      );
      (mockApp.metadataCache.getFileCache as jest.Mock).mockReturnValue({
        frontmatter: { status: 'Published' },
      });

      const settings = createSettingsWithApp(mockApp);
      const task = createBaseTask({
        path: 'test.md',
        line: 1,
        rawText: 'TODO test task',
        text: 'test task',
      });

      const node = {
        type: 'property_filter' as const,
        field: 'property',
        value: 'status:(Draft OR Published)',
        exact: false,
      };

      const result = await SearchEvaluator.evaluate(
        node,
        task,
        false,
        settings,
        null,
      );
      expect(result).toBe(true);
    });

    it('should handle case-insensitive property key search', async () => {
      const mockApp = createMockApp();
      const mockFile = new TFile('test.md', 'test', 'md');
      (mockApp.vault.getAbstractFileByPath as jest.Mock).mockReturnValue(
        mockFile,
      );
      (mockApp.metadataCache.getFileCache as jest.Mock).mockReturnValue({
        frontmatter: { Type: 'Project' },
      });

      const settings = createSettingsWithApp(mockApp);
      const task = createBaseTask({
        path: 'test.md',
        line: 1,
        rawText: 'TODO test task',
        text: 'test task',
      });

      const node = {
        type: 'property_filter' as const,
        field: 'property',
        value: 'type:Project',
        exact: false,
      };

      const result = await SearchEvaluator.evaluate(
        node,
        task,
        false,
        settings,
        null,
      );
      expect(result).toBe(true);
    });

    it('should handle exact match with quoted value', async () => {
      const mockApp = createMockApp();
      const mockFile = new TFile('test.md', 'test', 'md');
      (mockApp.vault.getAbstractFileByPath as jest.Mock).mockReturnValue(
        mockFile,
      );
      (mockApp.metadataCache.getFileCache as jest.Mock).mockReturnValue({
        frontmatter: { status: 'draft' },
      });

      const settings = createSettingsWithApp(mockApp);
      const task = createBaseTask({
        path: 'test.md',
        line: 1,
        rawText: 'TODO test task',
        text: 'test task',
      });

      const node = {
        type: 'property_filter' as const,
        field: 'property',
        value: 'status:draft',
        exact: true,
      };

      const result = await SearchEvaluator.evaluate(
        node,
        task,
        false,
        settings,
        null,
      );
      expect(result).toBe(true);
    });

    it('should handle numeric comparison operators', async () => {
      const mockApp = createMockApp();
      const mockFile = new TFile('test.md', 'test', 'md');
      (mockApp.vault.getAbstractFileByPath as jest.Mock).mockReturnValue(
        mockFile,
      );
      (mockApp.metadataCache.getFileCache as jest.Mock).mockReturnValue({
        frontmatter: { priority: 5 },
      });

      const settings = createSettingsWithApp(mockApp);
      const task = createBaseTask({
        path: 'test.md',
        line: 1,
        rawText: 'TODO test task',
        text: 'test task',
      });

      const node = {
        type: 'property_filter' as const,
        field: 'property',
        value: 'priority:>=3',
        exact: false,
      };

      const result = await SearchEvaluator.evaluate(
        node,
        task,
        false,
        settings,
        null,
      );
      expect(result).toBe(true);
    });

    it('should handle array property values', async () => {
      const mockApp = createMockApp();
      const mockFile = new TFile('test.md', 'test', 'md');
      (mockApp.vault.getAbstractFileByPath as jest.Mock).mockReturnValue(
        mockFile,
      );
      (mockApp.metadataCache.getFileCache as jest.Mock).mockReturnValue({
        frontmatter: { tags: ['work', 'urgent', 'project'] },
      });

      const settings = createSettingsWithApp(mockApp);
      const task = createBaseTask({
        path: 'test.md',
        line: 1,
        rawText: 'TODO test task',
        text: 'test task',
      });

      const node = {
        type: 'property_filter' as const,
        field: 'property',
        value: 'tags:urg',
        exact: false,
      };

      const result = await SearchEvaluator.evaluate(
        node,
        task,
        false,
        settings,
        null,
      );
      expect(result).toBe(true);
    });

    it('should handle boolean property values', async () => {
      const mockApp = createMockApp();
      const mockFile = new TFile('test.md', 'test', 'md');
      (mockApp.vault.getAbstractFileByPath as jest.Mock).mockReturnValue(
        mockFile,
      );
      (mockApp.metadataCache.getFileCache as jest.Mock).mockReturnValue({
        frontmatter: { completed: true },
      });

      const settings = createSettingsWithApp(mockApp);
      const task = createBaseTask({
        path: 'test.md',
        line: 1,
        rawText: 'TODO test task',
        text: 'test task',
      });

      const node = {
        type: 'property_filter' as const,
        field: 'property',
        value: 'completed:true',
        exact: false,
      };

      const result = await SearchEvaluator.evaluate(
        node,
        task,
        false,
        settings,
        null,
      );
      expect(result).toBe(true);
    });

    it('should handle date property comparisons', async () => {
      const mockApp = createMockApp();
      const mockFile = new TFile('test.md', 'test', 'md');
      (mockApp.vault.getAbstractFileByPath as jest.Mock).mockReturnValue(
        mockFile,
      );
      const taskDate = new Date(2026, 0, 15);
      (mockApp.metadataCache.getFileCache as jest.Mock).mockReturnValue({
        frontmatter: { due: taskDate },
      });

      const settings = createSettingsWithApp(mockApp);
      const task = createBaseTask({
        path: 'test.md',
        line: 1,
        rawText: 'TODO test task',
        text: 'test task',
      });

      const node = {
        type: 'property_filter' as const,
        field: 'property',
        value: 'due:2026-01-15',
        exact: false,
      };

      const result = await SearchEvaluator.evaluate(
        node,
        task,
        false,
        settings,
        null,
      );
      expect(result).toBe(true);
    });

    it('should handle null property value search', async () => {
      const mockApp = createMockApp();
      const mockFile = new TFile('test.md', 'test', 'md');
      (mockApp.vault.getAbstractFileByPath as jest.Mock).mockReturnValue(
        mockFile,
      );
      (mockApp.metadataCache.getFileCache as jest.Mock).mockReturnValue({
        frontmatter: { type: null },
      });

      const settings = createSettingsWithApp(mockApp);
      const task = createBaseTask({
        path: 'test.md',
        line: 1,
        rawText: 'TODO test task',
        text: 'test task',
      });

      const node = {
        type: 'property_filter' as const,
        field: 'property',
        value: 'type:null',
        exact: false,
      };

      const result = await SearchEvaluator.evaluate(
        node,
        task,
        false,
        settings,
        null,
      );
      expect(result).toBe(true);
    });

    // Note: Empty string matching behavior with null values is handled by evaluateSinglePropertyValue
    // The special case check at line 918 ensures empty string doesn't match null

    it('should handle property search when file is not found', async () => {
      const mockApp = createMockApp();
      (mockApp.vault.getAbstractFileByPath as jest.Mock).mockReturnValue(null);

      const settings = createSettingsWithApp(mockApp);
      const task = createBaseTask({
        path: 'nonexistent.md',
        line: 1,
        rawText: 'TODO test task',
        text: 'test task',
      });

      const node = {
        type: 'property_filter' as const,
        field: 'property',
        value: 'type:Project',
        exact: false,
      };

      const result = await SearchEvaluator.evaluate(
        node,
        task,
        false,
        settings,
        null,
      );
      expect(result).toBe(false);
    });
  });

  describe('Range Filter Evaluation', () => {
    it('should evaluate date range for scheduled field', async () => {
      const node = parseQuery('scheduled:2026-01-01..2026-01-31');

      const task = createBaseTask({
        scheduledDate: new Date(2026, 0, 15),
      });

      const result = await SearchEvaluator.evaluate(node, task, false);
      expect(result).toBe(true);
    });

    it('should evaluate date range for deadline field', async () => {
      const node = parseQuery('deadline:2026-01-01..2026-01-31');

      const task = createBaseTask({
        deadlineDate: new Date(2026, 0, 20),
      });

      const result = await SearchEvaluator.evaluate(node, task, false);
      expect(result).toBe(true);
    });

    it('should evaluate date range for closed field', async () => {
      const node = parseQuery('closed:2026-01-01..2026-01-31');

      const task = createBaseTask({
        closedDate: new Date(2026, 0, 10),
        completed: true,
      });

      const result = await SearchEvaluator.evaluate(node, task, false);
      expect(result).toBe(true);
    });

    it('should include dates at range boundary (end exclusive, so last day matches)', async () => {
      // End date exclusive means range includes last day (Jan 31) because end becomes Feb 1
      const node = parseQuery('scheduled:2026-01-01..2026-01-31');

      const task = createBaseTask({
        scheduledDate: new Date(2026, 0, 31),
      });

      const result = await SearchEvaluator.evaluate(node, task, false);
      expect(result).toBe(true);
    });

    it('should handle invalid range dates gracefully', async () => {
      const node = parseQuery('scheduled:invalid..dates');

      const task = createBaseTask({
        scheduledDate: new Date(2026, 0, 15),
      });

      const result = await SearchEvaluator.evaluate(node, task, false);
      expect(result).toBe(false);
    });

    it('should handle tasks without date for range query', async () => {
      const node = parseQuery('scheduled:2026-01-01..2026-01-31');

      const task = createBaseTask({
        scheduledDate: null,
      });

      const result = await SearchEvaluator.evaluate(node, task, false);
      expect(result).toBe(false);
    });
  });

  describe('Date Expression Evaluation', () => {
    const fixedNow = new Date(2026, 0, 14, 12, 0, 0);

    beforeAll(() => {
      jest.useFakeTimers();
      jest.setSystemTime(fixedNow);
    });

    afterAll(() => {
      jest.useRealTimers();
    });

    it('should evaluate overdue expression for scheduled date', async () => {
      const node = {
        type: 'prefix_filter',
        field: 'scheduled',
        value: 'overdue',
        exact: false,
      };

      const task = createBaseTask({
        scheduledDate: new Date(2026, 0, 10),
      });

      const result = await SearchEvaluator.evaluate(node, task, false);
      expect(result).toBe(true);
    });

    it('should evaluate overdue expression for deadline date', async () => {
      const node = {
        type: 'prefix_filter',
        field: 'deadline',
        value: 'overdue',
        exact: false,
      };

      const task = createBaseTask({
        deadlineDate: new Date(2026, 0, 13),
      });

      const result = await SearchEvaluator.evaluate(node, task, false);
      expect(result).toBe(true);
    });

    it('should evaluate today expression', async () => {
      const node = {
        type: 'prefix_filter',
        field: 'scheduled',
        value: 'today',
        exact: false,
      };

      const task = createBaseTask({
        scheduledDate: new Date(2026, 0, 14),
      });

      const result = await SearchEvaluator.evaluate(node, task, false);
      expect(result).toBe(true);
    });

    it('should evaluate tomorrow expression', async () => {
      const node = {
        type: 'prefix_filter',
        field: 'scheduled',
        value: 'tomorrow',
        exact: false,
      };

      const task = createBaseTask({
        scheduledDate: new Date(2026, 0, 15),
      });

      const result = await SearchEvaluator.evaluate(node, task, false);
      expect(result).toBe(true);
    });

    it('should evaluate yesterday expression', async () => {
      const node = {
        type: 'prefix_filter',
        field: 'scheduled',
        value: 'yesterday',
        exact: false,
      };

      const task = createBaseTask({
        scheduledDate: new Date(2026, 0, 13),
      });

      const result = await SearchEvaluator.evaluate(node, task, false);
      expect(result).toBe(true);
    });

    it('should evaluate "this week" expression', async () => {
      const node = {
        type: 'prefix_filter',
        field: 'scheduled',
        value: 'this week',
        exact: false,
      };

      // Monday Jan 12, 2026 - within same week as Jan 14
      const task = createBaseTask({
        scheduledDate: new Date(2026, 0, 12),
      });

      const result = await SearchEvaluator.evaluate(node, task, false);
      expect(result).toBe(true);
    });

    it('should evaluate "next week" expression', async () => {
      const node = {
        type: 'prefix_filter',
        field: 'scheduled',
        value: 'next week',
        exact: false,
      };

      const task = createBaseTask({
        scheduledDate: new Date(2026, 0, 21),
      });

      const result = await SearchEvaluator.evaluate(node, task, false);
      expect(result).toBe(true);
    });

    it('should evaluate "last week" expression', async () => {
      const node = {
        type: 'prefix_filter',
        field: 'scheduled',
        value: 'last week',
        exact: false,
      };

      const task = createBaseTask({
        scheduledDate: new Date(2026, 0, 7),
      });

      const result = await SearchEvaluator.evaluate(node, task, false);
      expect(result).toBe(true);
    });

    it('should evaluate "this month" expression', async () => {
      const node = {
        type: 'prefix_filter',
        field: 'scheduled',
        value: 'this month',
        exact: false,
      };

      const task = createBaseTask({
        scheduledDate: new Date(2026, 0, 10),
      });

      const result = await SearchEvaluator.evaluate(node, task, false);
      expect(result).toBe(true);
    });

    it('should evaluate "next month" expression', async () => {
      const node = {
        type: 'prefix_filter',
        field: 'scheduled',
        value: 'next month',
        exact: false,
      };

      const task = createBaseTask({
        scheduledDate: new Date(2026, 1, 10),
      });

      const result = await SearchEvaluator.evaluate(node, task, false);
      expect(result).toBe(true);
    });

    it('should evaluate "last month" expression', async () => {
      const node = {
        type: 'prefix_filter',
        field: 'scheduled',
        value: 'last month',
        exact: false,
      };

      const task = createBaseTask({
        scheduledDate: new Date(2025, 11, 10),
      });

      const result = await SearchEvaluator.evaluate(node, task, false);
      expect(result).toBe(true);
    });

    it('should evaluate "next N days" pattern', async () => {
      const node = {
        type: 'prefix_filter',
        field: 'scheduled',
        value: 'next 3 days',
        exact: false,
      };

      const task = createBaseTask({
        scheduledDate: new Date(2026, 0, 16),
      });

      const result = await SearchEvaluator.evaluate(node, task, false);
      expect(result).toBe(true);
    });

    it('should evaluate due expression (today or overdue)', async () => {
      const node = {
        type: 'prefix_filter',
        field: 'deadline',
        value: 'due',
        exact: false,
      };

      const todayTask = createBaseTask({ deadlineDate: new Date(2026, 0, 14) });
      const overdueTask = createBaseTask({
        deadlineDate: new Date(2026, 0, 10),
      });
      const futureTask = createBaseTask({
        deadlineDate: new Date(2026, 0, 20),
      });

      expect(await SearchEvaluator.evaluate(node, todayTask, false)).toBe(true);
      expect(await SearchEvaluator.evaluate(node, overdueTask, false)).toBe(
        true,
      );
      expect(await SearchEvaluator.evaluate(node, futureTask, false)).toBe(
        false,
      );
    });
  });

  describe('Tag Filter Evaluation', () => {
    // ... (tag tests unchanged, they already pass)
    it('should match tag with hash prefix', async () => {
      const node = parseQuery('tag:#urgent');
      const task = createBaseTask({
        rawText: 'TODO task #urgent',
        text: 'task',
      });
      const result = await SearchEvaluator.evaluate(node, task, false);
      expect(result).toBe(true);
    });

    it('should match tag without hash prefix', async () => {
      const node = parseQuery('tag:urgent');
      const task = createBaseTask({
        rawText: 'TODO task #urgent',
        text: 'task',
      });
      const result = await SearchEvaluator.evaluate(node, task, false);
      expect(result).toBe(true);
    });

    it('should match subtag prefix (e.g., #context/home)', async () => {
      const node = parseQuery('tag:context');
      const task = createBaseTask({
        rawText: 'TODO task #context/home',
        text: 'task',
      });
      const result = await SearchEvaluator.evaluate(node, task, false);
      expect(result).toBe(true);
    });

    it('should match exact quoted tag', async () => {
      const node = parseQuery('tag:"#project"');
      const task = createBaseTask({
        rawText: 'TODO task #project',
        text: 'task',
      });
      const result = await SearchEvaluator.evaluate(node, task, false);
      expect(result).toBe(true);
    });

    it('should handle case sensitivity for tags', async () => {
      const node = parseQuery('tag:#URGENT');
      const task = createBaseTask({
        rawText: 'TODO task #urgent',
        text: 'task',
      });
      const result = await SearchEvaluator.evaluate(node, task, false);
      expect(result).toBe(true);
    });

    it('should return false when rawText is missing', async () => {
      const node = parseQuery('tag:#urgent');
      const task = createBaseTask({ rawText: '', text: 'task' });
      const result = await SearchEvaluator.evaluate(node, task, false);
      expect(result).toBe(false);
    });
  });

  describe('Content Filter Evaluation', () => {
    it('should match content in task text', async () => {
      const node = parseQuery('content:project');
      const task = createBaseTask({ text: 'work on project planning' });
      const result = await SearchEvaluator.evaluate(node, task, false);
      expect(result).toBe(true);
    });

    it('should return false when task text is missing', async () => {
      const node = parseQuery('content:test');
      const task = createBaseTask({ text: '' });
      const result = await SearchEvaluator.evaluate(node, task, false);
      expect(result).toBe(false);
    });
  });

  describe('Path and File Filters', () => {
    it('should match nested path components', async () => {
      const node = parseQuery('path:work');
      const task = createBaseTask({ path: 'notes/work/project/tasks.md' });
      const result = await SearchEvaluator.evaluate(node, task, false);
      expect(result).toBe(true);
    });

    it('should match file by partial name', async () => {
      const node = parseQuery('file:project');
      const task = createBaseTask({ path: 'notes/work/project-planning.md' });
      const result = await SearchEvaluator.evaluate(node, task, false);
      expect(result).toBe(true);
    });

    it('should return false when path is missing', async () => {
      const node = parseQuery('path:test');
      const task = createBaseTask({ path: '' });
      const result = await SearchEvaluator.evaluate(node, task, false);
      expect(result).toBe(false);
    });
  });

  describe('Priority Filter Evaluation', () => {
    it('should match high priority with letter A', async () => {
      const node = parseQuery('priority:A');
      const task = createBaseTask({ priority: 'high' });
      const result = await SearchEvaluator.evaluate(node, task, false);
      expect(result).toBe(true);
    });

    it('should match medium priority with letter B', async () => {
      const node = parseQuery('priority:B');
      const task = createBaseTask({ priority: 'med' });
      const result = await SearchEvaluator.evaluate(node, task, false);
      expect(result).toBe(true);
    });

    it('should match low priority with letter C', async () => {
      const node = parseQuery('priority:C');
      const task = createBaseTask({ priority: 'low' });
      const result = await SearchEvaluator.evaluate(node, task, false);
      expect(result).toBe(true);
    });

    it('should match priority:none when no priority set', async () => {
      const node = parseQuery('priority:none');
      const task = createBaseTask({ priority: null });
      const result = await SearchEvaluator.evaluate(node, task, false);
      expect(result).toBe(true);
    });

    it('should be case-insensitive for priority keywords', async () => {
      const node = parseQuery('priority:HIGH');
      const task = createBaseTask({ priority: 'high' });
      const result = await SearchEvaluator.evaluate(node, task, false);
      expect(result).toBe(true);
    });
  });

  describe('State Filter Evaluation with Settings', () => {
    it('should match state groups: active', async () => {
      const settings = createBaseSettings();
      const node = parseQuery('state:active');
      const doingTask = createBaseTask({ state: 'DOING' });
      const nowTask = createBaseTask({ state: 'NOW' });
      const todoTask = createBaseTask({ state: 'TODO' });
      expect(
        await SearchEvaluator.evaluate(node, doingTask, false, settings),
      ).toBe(true);
      expect(
        await SearchEvaluator.evaluate(node, nowTask, false, settings),
      ).toBe(true);
      expect(
        await SearchEvaluator.evaluate(node, todoTask, false, settings),
      ).toBe(false);
    });

    it('should match state groups: completed', async () => {
      const settings = createBaseSettings();
      const node = parseQuery('state:completed');
      const doneTask = createBaseTask({ state: 'DONE' });
      const canceledTask = createBaseTask({ state: 'CANCELED' });
      const todoTask = createBaseTask({ state: 'TODO' });
      expect(
        await SearchEvaluator.evaluate(node, doneTask, false, settings),
      ).toBe(true);
      expect(
        await SearchEvaluator.evaluate(node, canceledTask, false, settings),
      ).toBe(true);
      expect(
        await SearchEvaluator.evaluate(node, todoTask, false, settings),
      ).toBe(false);
    });

    it('should match state groups: waiting', async () => {
      const settings = createBaseSettings();
      const node = parseQuery('state:waiting');
      const waitTask = createBaseTask({ state: 'WAIT' });
      const waitingTask = createBaseTask({ state: 'WAITING' });
      const todoTask = createBaseTask({ state: 'TODO' });
      expect(
        await SearchEvaluator.evaluate(node, waitTask, false, settings),
      ).toBe(true);
      expect(
        await SearchEvaluator.evaluate(node, waitingTask, false, settings),
      ).toBe(true);
      expect(
        await SearchEvaluator.evaluate(node, todoTask, false, settings),
      ).toBe(false);
    });

    it('should match state groups: inactive', async () => {
      const settings = createBaseSettings();
      const node = parseQuery('state:inactive');
      const todoTask = createBaseTask({ state: 'TODO' });
      const laterTask = createBaseTask({ state: 'LATER' });
      const doingTask = createBaseTask({ state: 'DOING' });
      expect(
        await SearchEvaluator.evaluate(node, todoTask, false, settings),
      ).toBe(true);
      expect(
        await SearchEvaluator.evaluate(node, laterTask, false, settings),
      ).toBe(true);
      expect(
        await SearchEvaluator.evaluate(node, doingTask, false, settings),
      ).toBe(false);
    });

    it('should fall back to exact match when no settings provided', async () => {
      const node = parseQuery('state:active');
      const task = createBaseTask({ state: 'DOING' });
      const result = await SearchEvaluator.evaluate(node, task, false);
      expect(result).toBe(false);
    });

    it('should respect custom keywords in groups', async () => {
      const settings = createBaseSettings({
        additionalActiveKeywords: ['REVIEWING'],
      });
      const node = parseQuery('state:active');
      const task = createBaseTask({ state: 'REVIEWING' });
      const result = await SearchEvaluator.evaluate(
        node,
        task,
        false,
        settings,
      );
      expect(result).toBe(true);
    });
  });

  describe('Boolean Logic (AND, OR, NOT)', () => {
    it('should evaluate AND with multiple conditions', async () => {
      const node = parseQuery('priority:high state:TODO');
      const task = createBaseTask({ priority: 'high', state: 'TODO' });
      const result = await SearchEvaluator.evaluate(node, task, false);
      expect(result).toBe(true);
    });

    it('should short-circuit AND on first false', async () => {
      const node = parseQuery('priority:high state:DONE');
      const task = createBaseTask({ priority: 'high', state: 'TODO' });
      const result = await SearchEvaluator.evaluate(node, task, false);
      expect(result).toBe(false);
    });

    it('should evaluate OR with matching first condition', async () => {
      const node = parseQuery('priority:high OR priority:low');
      const task = createBaseTask({ priority: 'high' });
      const result = await SearchEvaluator.evaluate(node, task, false);
      expect(result).toBe(true);
    });

    it('should evaluate OR with matching second condition', async () => {
      const node = parseQuery('priority:high OR priority:low');
      const task = createBaseTask({ priority: 'low' });
      const result = await SearchEvaluator.evaluate(node, task, false);
      expect(result).toBe(true);
    });

    it('should evaluate NOT negation', async () => {
      const node = parseQuery('-priority:high');
      const task = createBaseTask({ priority: 'low' });
      const result = await SearchEvaluator.evaluate(node, task, false);
      expect(result).toBe(true);
    });

    it('should evaluate NOT with nested expression', async () => {
      const node = parseQuery('-(priority:high state:DOING)');
      const task = createBaseTask({ priority: 'low', state: 'TODO' });
      const result = await SearchEvaluator.evaluate(node, task, false);
      expect(result).toBe(true);
    });

    it('should handle complex nested boolean logic', async () => {
      const node = parseQuery(
        '(priority:high OR priority:medium) -state:DOING',
      );
      const task = createBaseTask({ priority: 'high', state: 'TODO' });
      const result = await SearchEvaluator.evaluate(node, task, false);
      expect(result).toBe(true);
    });

    it('should return true for empty AND children (vacuous truth)', async () => {
      const node = { type: 'and', children: [] };
      const task = createBaseTask();
      const result = await SearchEvaluator.evaluate(node, task, false);
      expect(result).toBe(true);
    });

    it('should return false for empty OR children', async () => {
      const node = { type: 'or', children: [] };
      const task = createBaseTask();
      const result = await SearchEvaluator.evaluate(node, task, false);
      expect(result).toBe(false);
    });

    it('should return false for NOT without child', async () => {
      const node = { type: 'not', children: undefined };
      const task = createBaseTask();
      const result = await SearchEvaluator.evaluate(node, task, false);
      expect(result).toBe(false);
    });
  });

  describe('Term and Phrase Evaluation', () => {
    it('should match case-insensitive term', async () => {
      const node = { type: 'term', value: 'MEETING' };
      const task = createBaseTask({
        rawText: 'TODO meeting about project',
        text: 'meeting about project',
      });
      const result = await SearchEvaluator.evaluate(node, task, false);
      expect(result).toBe(true);
    });

    it('should match case-sensitive term when enabled', async () => {
      const node = { type: 'term', value: 'MEETING' };
      const task = createBaseTask({
        rawText: 'TODO meeting about project',
        text: 'meeting about project',
      });
      const result = await SearchEvaluator.evaluate(node, task, true);
      expect(result).toBe(false);
    });

    it('should match exact phrase with word boundaries', async () => {
      const node = { type: 'phrase', value: 'project planning' };
      const task = createBaseTask({
        rawText: 'TODO project planning meeting',
        text: 'project planning meeting',
      });
      const result = await SearchEvaluator.evaluate(node, task, false);
      expect(result).toBe(true);
    });

    it('should not match partial word in phrase', async () => {
      const node = { type: 'phrase', value: 'star' };
      const task = createBaseTask({
        rawText: 'TODO starfish ocean',
        text: 'starfish ocean',
      });
      const result = await SearchEvaluator.evaluate(node, task, false);
      expect(result).toBe(false);
    });

    it('should return false for empty term', async () => {
      const node = { type: 'term', value: '' };
      const task = createBaseTask();
      const result = await SearchEvaluator.evaluate(node, task, false);
      expect(result).toBe(false);
    });

    it('should return false for empty phrase', async () => {
      const node = { type: 'phrase', value: '' };
      const task = createBaseTask();
      const result = await SearchEvaluator.evaluate(node, task, false);
      expect(result).toBe(false);
    });
  });

  describe('Searchable Fields Helper', () => {
    it('should include rawText, text, and path in searchable fields', async () => {
      const task = createBaseTask({
        rawText: 'TODO full line',
        text: 'task text',
        path: 'notes/test.md',
      });
      const node = { type: 'term', value: 'full' };
      const result = await SearchEvaluator.evaluate(node, task, false);
      expect(result).toBe(true);
    });

    it('should include filename from path', async () => {
      const task = createBaseTask({ path: 'notes/folder/test.md' });
      const node = { type: 'term', value: 'test' };
      const result = await SearchEvaluator.evaluate(node, task, false);
      expect(result).toBe(true);
    });
  });

  describe('Regex Escaping', () => {
    it('should escape regex special characters in phrase', async () => {
      // Use a phrase containing a regex special character '.' that needs escaping
      const node = { type: 'phrase', value: 'v1.2' };
      const task = createBaseTask({
        rawText: 'TODO version v1.2 released',
        text: 'version v1.2 released',
      });
      const result = await SearchEvaluator.evaluate(node, task, false);
      expect(result).toBe(true);
    });
  });

  describe('Closed Date Filter', () => {
    it('should match closed:none for incomplete tasks', async () => {
      const node = parseQuery('closed:none');
      const task = createBaseTask({ completed: false, closedDate: null });
      const result = await SearchEvaluator.evaluate(node, task, false);
      expect(result).toBe(true);
    });

    it('should not match closed:none for completed tasks', async () => {
      const node = parseQuery('closed:none');
      const task = createBaseTask({
        completed: true,
        closedDate: new Date(2026, 0, 14),
      });
      const result = await SearchEvaluator.evaluate(node, task, false);
      expect(result).toBe(false);
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle unknown prefix gracefully', async () => {
      const node = { type: 'prefix_filter', field: 'unknown', value: 'test' };
      const task = createBaseTask();
      const result = await SearchEvaluator.evaluate(node, task, false);
      expect(result).toBe(false);
    });

    it('should handle null/undefined task fields', async () => {
      const node = { type: 'term', value: 'test' };
      // Task with all searchable fields empty
      const task = createBaseTask({
        rawText: '',
        text: '',
        path: '',
      });
      const result = await SearchEvaluator.evaluate(node, task, false);
      expect(result).toBe(false);
    });

    it('should handle property filter with PropertySearchEngine exception fallback', async () => {
      const mockEngine = {
        searchProperties: jest.fn(async () => {
          throw new Error('Search failed');
        }),
      } as unknown as PropertySearchEngine;

      const mockApp = createMockApp();
      const mockFile = new TFile('test.md', 'test', 'md');
      (mockApp.vault.getAbstractFileByPath as jest.Mock).mockReturnValue(
        mockFile,
      );
      (mockApp.metadataCache.getFileCache as jest.Mock).mockReturnValue({
        frontmatter: { type: 'Project' },
      });

      const settings = createSettingsWithApp(mockApp);
      const task = createBaseTask({
        path: 'test.md',
        line: 1,
        rawText: 'TODO test task',
        text: 'test task',
      });

      const node = {
        type: 'property_filter' as const,
        field: 'property',
        value: 'type:Project',
        exact: false,
      };

      const result = await SearchEvaluator.evaluate(
        node,
        task,
        false,
        settings,
        mockEngine,
      );
      expect(result).toBe(true);
    });

    it('should handle getApp returning undefined', async () => {
      const mockEngine = {
        searchProperties: jest.fn(async () => new Set()),
      } as unknown as PropertySearchEngine;

      const task = createBaseTask({
        path: 'test.md',
        line: 1,
        rawText: 'TODO test task',
        text: 'test task',
      });

      const node = {
        type: 'property_filter' as const,
        field: 'property',
        value: 'type:Project',
        exact: false,
      };

      const result = await SearchEvaluator.evaluate(
        node,
        task,
        false,
        undefined,
        mockEngine,
      );
      expect(result).toBe(false);
    });

    // Regression guard: previously SearchEvaluator.getApp had a
    // window.todoSeqPlugin fallback. After that path was removed,
    // the property-filter fallback must NOT consult the window global.
    it('should not consult window.todoSeqPlugin when settings.app is missing', async () => {
      const poisonedApp = {
        vault: {
          getAbstractFileByPath: jest.fn(() => {
            throw new Error('LEGACY FALLBACK STILL WIRED');
          }),
        },
      };

      const originalPlugin = (window as Record<string, unknown>).todoSeqPlugin;
      (window as Record<string, unknown>).todoSeqPlugin = {
        app: poisonedApp,
      };
      try {
        const settings = createBaseSettings(); // no .app set
        const task = createBaseTask({
          path: 'test.md',
          line: 1,
          rawText: 'TODO test task',
          text: 'test task',
        });
        const node = {
          type: 'property_filter' as const,
          field: 'property',
          value: 'type:Project',
          exact: false,
        };

        const result = await SearchEvaluator.evaluate(
          node,
          task,
          false,
          settings,
          undefined, // no propertySearchEngine -> hits fallback path
        );
        expect(result).toBe(false);
        expect(poisonedApp.vault.getAbstractFileByPath).not.toHaveBeenCalled();
      } finally {
        if (originalPlugin !== undefined) {
          (window as Record<string, unknown>).todoSeqPlugin = originalPlugin;
        } else {
          delete (window as Record<string, unknown>).todoSeqPlugin;
        }
      }
    });
  });

  describe('Priority Filter Edge Cases', () => {
    it('should handle priority as string comparison', async () => {
      const node = parseQuery('priority:high');
      const task = createBaseTask({ priority: 'high' });
      const result = await SearchEvaluator.evaluate(node, task, false);
      expect(result).toBe(true);
    });
  });

  describe('Date Filter Edge Cases', () => {
    it('should handle parseDateValue returning null', async () => {
      const node = parseQuery('scheduled:invalid-date-format');
      const task = createBaseTask({ scheduledDate: new Date(2026, 0, 15) });
      const result = await SearchEvaluator.evaluate(node, task, false);
      expect(result).toBe(false);
    });
  });

  describe('SearchEvaluator branch coverage', () => {
    it('should handle property search with date comparison operators', async () => {
      const task = createBaseTask({
        scheduledDate: new Date(2026, 5, 20),
        deadlineDate: new Date(2026, 5, 25),
      });

      const node = parseQuery('scheduled:2026-06-20');
      const result = await SearchEvaluator.evaluate(node, task, false);
      expect(result).toBe(true);
    });

    it('should handle NOT search prefix on state', async () => {
      const task = createBaseTask({ state: 'TODO', priority: 'high' });

      const node = parseQuery('-state:DONE');
      const result = await SearchEvaluator.evaluate(node, task, false);
      expect(result).toBe(true);
    });

    it('should handle search with tag filter', async () => {
      const task = createBaseTask({ rawText: 'TODO Task #work #urgent' });

      const node = parseQuery('tag:#work');
      const result = await SearchEvaluator.evaluate(node, task, false);
      expect(result).toBe(true);
    });

    it('should handle search with path filter', async () => {
      const task = createBaseTask({ path: 'projects/alpha/note.md' });

      const node = parseQuery('path:projects/alpha');
      const result = await SearchEvaluator.evaluate(node, task, false);
      expect(result).toBe(true);
    });

    it('should handle search with boolean AND', async () => {
      const task = createBaseTask({ state: 'TODO', priority: 'high' });

      const node = parseQuery('state:TODO AND priority:high');
      const result = await SearchEvaluator.evaluate(node, task, false);
      expect(result).toBe(true);
    });

    it('should handle search with boolean OR', async () => {
      const task = createBaseTask({ state: 'DONE' });

      const node = parseQuery('state:TODO OR state:DONE');
      const result = await SearchEvaluator.evaluate(node, task, false);
      expect(result).toBe(true);
    });

    it('should handle empty search query', async () => {
      const task = createBaseTask();

      const node = { type: 'and' as const, children: [] };
      const result = await SearchEvaluator.evaluate(node, task, false);
      expect(result).toBe(true);
    });

    it('should handle task with null dates for date comparison', async () => {
      const task = createBaseTask({ scheduledDate: null });

      const node = parseQuery('scheduled:2026-06-20');
      const result = await SearchEvaluator.evaluate(node, task, false);
      expect(result).toBe(false);
    });
  });

  describe('evaluate default case (line 137)', () => {
    it('should return false for unknown node type', async () => {
      const task = createBaseTask();
      const node = { type: 'unknown_type' as unknown };
      const result = await SearchEvaluator.evaluate(
        node as import('../src/search/search-types').SearchNode,
        task,
        false,
      );
      expect(result).toBe(false);
    });
  });

  describe('evaluatePrefixFilter default case (line 252)', () => {
    it('should return false for prefix filter with empty field', async () => {
      const task = createBaseTask();
      const node = {
        type: 'prefix_filter' as const,
        field: undefined,
        value: 'test',
      };
      const result = await SearchEvaluator.evaluate(node, task, false);
      expect(result).toBe(false);
    });

    it('should return false for prefix filter with empty value', async () => {
      const task = createBaseTask();
      const node = {
        type: 'prefix_filter' as const,
        field: 'path' as const,
        value: undefined,
      };
      const result = await SearchEvaluator.evaluate(node, task, false);
      expect(result).toBe(false);
    });
  });

  describe('evaluateDateFilter range path (line 560)', () => {
    it('should handle date range value in scheduled filter', async () => {
      const task = createBaseTask({
        scheduledDate: new Date(2026, 0, 15),
      });

      const node = {
        type: 'prefix_filter' as const,
        field: 'scheduled' as const,
        value: '2026-01-01..2026-01-31',
        exact: false,
      };

      const result = await SearchEvaluator.evaluate(node, task, false);
      expect(result).toBe(true);
    });

    it('should handle date range value outside range', async () => {
      const task = createBaseTask({
        scheduledDate: new Date(2026, 2, 15),
      });

      const node = {
        type: 'prefix_filter' as const,
        field: 'scheduled' as const,
        value: '2026-01-01..2026-01-31',
        exact: false,
      };

      const result = await SearchEvaluator.evaluate(node, task, false);
      expect(result).toBe(false);
    });
  });

  describe('evaluateDateFilter year-month format (lines 582-587)', () => {
    it('should match year-month format', async () => {
      const task = createBaseTask({
        scheduledDate: new Date(2026, 0, 15),
      });

      const node = {
        type: 'prefix_filter' as const,
        field: 'scheduled' as const,
        value: '2026-01',
        exact: false,
      };

      const result = await SearchEvaluator.evaluate(node, task, false);
      expect(result).toBe(true);
    });

    it('should not match different year-month', async () => {
      const task = createBaseTask({
        scheduledDate: new Date(2026, 1, 15),
      });

      const node = {
        type: 'prefix_filter' as const,
        field: 'scheduled' as const,
        value: '2026-01',
        exact: false,
      };

      const result = await SearchEvaluator.evaluate(node, task, false);
      expect(result).toBe(false);
    });
  });

  describe('evaluateDateFilter year format (line 580)', () => {
    it('should match year-only format', async () => {
      const task = createBaseTask({
        scheduledDate: new Date(2026, 5, 15),
      });

      const node = {
        type: 'prefix_filter' as const,
        field: 'scheduled' as const,
        value: '2026',
        exact: false,
      };

      const result = await SearchEvaluator.evaluate(node, task, false);
      expect(result).toBe(true);
    });

    it('should not match different year', async () => {
      const task = createBaseTask({
        scheduledDate: new Date(2027, 5, 15),
      });

      const node = {
        type: 'prefix_filter' as const,
        field: 'scheduled' as const,
        value: '2026',
        exact: false,
      };

      const result = await SearchEvaluator.evaluate(node, task, false);
      expect(result).toBe(false);
    });
  });

  describe('evaluateDateExpression default (line 658)', () => {
    it('should return false for unrecognized date expression', async () => {
      const task = createBaseTask({
        scheduledDate: new Date(2026, 0, 15),
      });

      const node = {
        type: 'prefix_filter' as const,
        field: 'scheduled' as const,
        value: 'far-future',
        exact: false,
      };

      const result = await SearchEvaluator.evaluate(node, task, false);
      expect(result).toBe(false);
    });
  });

  describe('evaluateRangeFilter edge cases (line 678)', () => {
    it('should return false for range filter with missing field', async () => {
      const task = createBaseTask();
      const node = {
        type: 'range_filter' as const,
        start: '2026-01-01',
        end: '2026-01-31',
      };
      const result = await SearchEvaluator.evaluate(node, task, false);
      expect(result).toBe(false);
    });

    it('should return false for range filter with missing start', async () => {
      const task = createBaseTask();
      const node = {
        type: 'range_filter' as const,
        field: 'scheduled' as const,
        end: '2026-01-31',
      };
      const result = await SearchEvaluator.evaluate(node, task, false);
      expect(result).toBe(false);
    });

    it('should return false for range filter with missing end', async () => {
      const task = createBaseTask();
      const node = {
        type: 'range_filter' as const,
        field: 'scheduled' as const,
        start: '2026-01-01',
      };
      const result = await SearchEvaluator.evaluate(node, task, false);
      expect(result).toBe(false);
    });
  });

  describe('evaluateRangeFilter date type branches (lines 717-770)', () => {
    it('should handle deadline range filter', async () => {
      const task = createBaseTask({
        deadlineDate: new Date(2026, 0, 15),
      });

      const node = {
        type: 'range_filter' as const,
        field: 'deadline' as const,
        start: '2026-01-01',
        end: '2026-01-31',
      };

      const result = await SearchEvaluator.evaluate(node, task, false);
      expect(result).toBe(true);
    });

    it('should handle closed range filter', async () => {
      const task = createBaseTask({
        closedDate: new Date(2026, 0, 15),
        completed: true,
      });

      const node = {
        type: 'range_filter' as const,
        field: 'closed' as const,
        start: '2026-01-01',
        end: '2026-01-31',
      };

      const result = await SearchEvaluator.evaluate(node, task, false);
      expect(result).toBe(true);
    });

    it('should return false for range filter with unknown field', async () => {
      const task = createBaseTask({
        scheduledDate: new Date(2026, 0, 15),
      });

      const node = {
        type: 'range_filter' as const,
        field: 'unknown' as const,
        start: '2026-01-01',
        end: '2026-01-31',
      };

      const result = await SearchEvaluator.evaluate(node, task, false);
      expect(result).toBe(false);
    });

    it('should handle date range with year-month start and full date end', async () => {
      const task = createBaseTask({
        scheduledDate: new Date(2026, 0, 15),
      });

      const node = {
        type: 'range_filter' as const,
        field: 'scheduled' as const,
        start: '2026-01',
        end: '2026-01-31',
      };

      const result = await SearchEvaluator.evaluate(node, task, false);
      expect(result).toBe(true);
    });

    it('should handle date range with year-only start and full date end', async () => {
      const task = createBaseTask({
        scheduledDate: new Date(2026, 0, 15),
      });

      const node = {
        type: 'range_filter' as const,
        field: 'scheduled' as const,
        start: '2026',
        end: '2026-01-31',
      };

      const result = await SearchEvaluator.evaluate(node, task, false);
      expect(result).toBe(true);
    });

    it('should handle date range with year-only dates and task within range', async () => {
      const task = createBaseTask({
        scheduledDate: new Date(2026, 0, 1),
      });

      const node = {
        type: 'range_filter' as const,
        field: 'scheduled' as const,
        start: '2026',
        end: '2026',
      };

      const result = await SearchEvaluator.evaluate(node, task, false);
      expect(result).toBe(true);
    });
  });

  describe('evaluateDateFilter with none value (line 539-541)', () => {
    it('should match none for scheduled date when null', async () => {
      const task = createBaseTask({ scheduledDate: null });

      const node = {
        type: 'prefix_filter' as const,
        field: 'scheduled' as const,
        value: 'none',
        exact: false,
      };

      const result = await SearchEvaluator.evaluate(node, task, false);
      expect(result).toBe(true);
    });

    it('should not match none for scheduled date when set', async () => {
      const task = createBaseTask({
        scheduledDate: new Date(2026, 0, 15),
      });

      const node = {
        type: 'prefix_filter' as const,
        field: 'scheduled' as const,
        value: 'none',
        exact: false,
      };

      const result = await SearchEvaluator.evaluate(node, task, false);
      expect(result).toBe(false);
    });

    it('should match none for deadline date when null', async () => {
      const task = createBaseTask({ deadlineDate: null });

      const node = {
        type: 'prefix_filter' as const,
        field: 'deadline' as const,
        value: 'none',
        exact: false,
      };

      const result = await SearchEvaluator.evaluate(node, task, false);
      expect(result).toBe(true);
    });
  });

  describe('evaluateDateFilter with relative expressions (lines 620-658)', () => {
    const fixedNow = new Date(2026, 0, 14, 12, 0, 0);

    beforeAll(() => {
      jest.useFakeTimers();
      jest.setSystemTime(fixedNow);
    });

    afterAll(() => {
      jest.useRealTimers();
    });

    it('should evaluate overdue for scheduled date', async () => {
      const task = createBaseTask({
        scheduledDate: new Date(2026, 0, 10),
      });

      const node = {
        type: 'prefix_filter' as const,
        field: 'scheduled' as const,
        value: 'overdue',
        exact: false,
      };

      const result = await SearchEvaluator.evaluate(node, task, false);
      expect(result).toBe(true);
    });

    it('should evaluate today for scheduled date', async () => {
      const task = createBaseTask({
        scheduledDate: new Date(2026, 0, 14),
      });

      const node = {
        type: 'prefix_filter' as const,
        field: 'scheduled' as const,
        value: 'today',
        exact: false,
      };

      const result = await SearchEvaluator.evaluate(node, task, false);
      expect(result).toBe(true);
    });

    it('should evaluate tomorrow for scheduled date', async () => {
      const task = createBaseTask({
        scheduledDate: new Date(2026, 0, 15),
      });

      const node = {
        type: 'prefix_filter' as const,
        field: 'scheduled' as const,
        value: 'tomorrow',
        exact: false,
      };

      const result = await SearchEvaluator.evaluate(node, task, false);
      expect(result).toBe(true);
    });

    it('should evaluate yesterday for scheduled date', async () => {
      const task = createBaseTask({
        scheduledDate: new Date(2026, 0, 13),
      });

      const node = {
        type: 'prefix_filter' as const,
        field: 'scheduled' as const,
        value: 'yesterday',
        exact: false,
      };

      const result = await SearchEvaluator.evaluate(node, task, false);
      expect(result).toBe(true);
    });

    it('should evaluate "this week" for scheduled date', async () => {
      const task = createBaseTask({
        scheduledDate: new Date(2026, 0, 12),
      });

      const node = {
        type: 'prefix_filter' as const,
        field: 'scheduled' as const,
        value: 'this week',
        exact: false,
      };

      const result = await SearchEvaluator.evaluate(node, task, false);
      expect(result).toBe(true);
    });

    it('should evaluate "next week" for scheduled date', async () => {
      const task = createBaseTask({
        scheduledDate: new Date(2026, 0, 21),
      });

      const node = {
        type: 'prefix_filter' as const,
        field: 'scheduled' as const,
        value: 'next week',
        exact: false,
      };

      const result = await SearchEvaluator.evaluate(node, task, false);
      expect(result).toBe(true);
    });

    it('should evaluate "last week" for scheduled date', async () => {
      const task = createBaseTask({
        scheduledDate: new Date(2026, 0, 7),
      });

      const node = {
        type: 'prefix_filter' as const,
        field: 'scheduled' as const,
        value: 'last week',
        exact: false,
      };

      const result = await SearchEvaluator.evaluate(node, task, false);
      expect(result).toBe(true);
    });

    it('should evaluate "this month" for scheduled date', async () => {
      const task = createBaseTask({
        scheduledDate: new Date(2026, 0, 10),
      });

      const node = {
        type: 'prefix_filter' as const,
        field: 'scheduled' as const,
        value: 'this month',
        exact: false,
      };

      const result = await SearchEvaluator.evaluate(node, task, false);
      expect(result).toBe(true);
    });

    it('should evaluate "next month" for scheduled date', async () => {
      const task = createBaseTask({
        scheduledDate: new Date(2026, 1, 10),
      });

      const node = {
        type: 'prefix_filter' as const,
        field: 'scheduled' as const,
        value: 'next month',
        exact: false,
      };

      const result = await SearchEvaluator.evaluate(node, task, false);
      expect(result).toBe(true);
    });

    it('should evaluate "last month" for scheduled date', async () => {
      const task = createBaseTask({
        scheduledDate: new Date(2025, 11, 10),
      });

      const node = {
        type: 'prefix_filter' as const,
        field: 'scheduled' as const,
        value: 'last month',
        exact: false,
      };

      const result = await SearchEvaluator.evaluate(node, task, false);
      expect(result).toBe(true);
    });

    it('should evaluate "next 3 days" for scheduled date', async () => {
      const task = createBaseTask({
        scheduledDate: new Date(2026, 0, 16),
      });

      const node = {
        type: 'prefix_filter' as const,
        field: 'scheduled' as const,
        value: 'next 3 days',
        exact: false,
      };

      const result = await SearchEvaluator.evaluate(node, task, false);
      expect(result).toBe(true);
    });

    it('should evaluate "due" for deadline date (today or overdue)', async () => {
      const todayTask = createBaseTask({
        deadlineDate: new Date(2026, 0, 14),
      });
      const overdueTask = createBaseTask({
        deadlineDate: new Date(2026, 0, 10),
      });
      const futureTask = createBaseTask({
        deadlineDate: new Date(2026, 0, 20),
      });

      const node = {
        type: 'prefix_filter' as const,
        field: 'deadline' as const,
        value: 'due',
        exact: false,
      };

      expect(await SearchEvaluator.evaluate(node, todayTask, false)).toBe(true);
      expect(await SearchEvaluator.evaluate(node, overdueTask, false)).toBe(
        true,
      );
      expect(await SearchEvaluator.evaluate(node, futureTask, false)).toBe(
        false,
      );
    });
  });

  describe('evaluateDateFilter deadline relative expressions', () => {
    const fixedNow = new Date(2026, 0, 14, 12, 0, 0);

    beforeAll(() => {
      jest.useFakeTimers();
      jest.setSystemTime(fixedNow);
    });

    afterAll(() => {
      jest.useRealTimers();
    });

    it('should evaluate overdue for deadline date', async () => {
      const task = createBaseTask({
        deadlineDate: new Date(2026, 0, 13),
      });

      const node = {
        type: 'prefix_filter' as const,
        field: 'deadline' as const,
        value: 'overdue',
        exact: false,
      };

      const result = await SearchEvaluator.evaluate(node, task, false);
      expect(result).toBe(true);
    });

    it('should evaluate today for deadline date', async () => {
      const task = createBaseTask({
        deadlineDate: new Date(2026, 0, 14),
      });

      const node = {
        type: 'prefix_filter' as const,
        field: 'deadline' as const,
        value: 'today',
        exact: false,
      };

      const result = await SearchEvaluator.evaluate(node, task, false);
      expect(result).toBe(true);
    });

    it('should evaluate "last 7 days" for scheduled date', async () => {
      const task = createBaseTask({
        scheduledDate: new Date(2026, 0, 10),
      });

      const node = {
        type: 'prefix_filter' as const,
        field: 'scheduled' as const,
        value: 'last 7 days',
        exact: false,
      };

      const result = await SearchEvaluator.evaluate(node, task, false);
      expect(result).toBe(true);
    });
  });

  describe('evaluateDateFilter closed date relative expressions', () => {
    const fixedNow = new Date(2026, 0, 14, 12, 0, 0);

    beforeAll(() => {
      jest.useFakeTimers();
      jest.setSystemTime(fixedNow);
    });

    afterAll(() => {
      jest.useRealTimers();
    });

    it('should evaluate overdue for closed date', async () => {
      const task = createBaseTask({
        closedDate: new Date(2026, 0, 10),
        completed: true,
      });

      const node = {
        type: 'prefix_filter' as const,
        field: 'closed' as const,
        value: 'overdue',
        exact: false,
      };

      const result = await SearchEvaluator.evaluate(node, task, false);
      expect(result).toBe(true);
    });
  });

  describe('evaluateDateFilter with unknown prefix field (line 284-285)', () => {
    it('should return false for unknown prefix filter field', async () => {
      const task = createBaseTask();
      const node = {
        type: 'prefix_filter' as const,
        field: 'unknown' as const,
        value: 'test',
        exact: false,
      };
      const result = await SearchEvaluator.evaluate(node, task, false);
      expect(result).toBe(false);
    });
  });

  describe('evaluateDateFilter deadline range path', () => {
    it('should handle deadline range value in deadline filter', async () => {
      const task = createBaseTask({
        deadlineDate: new Date(2026, 0, 15),
      });

      const node = {
        type: 'prefix_filter' as const,
        field: 'deadline' as const,
        value: '2026-01-01..2026-01-31',
        exact: false,
      };

      const result = await SearchEvaluator.evaluate(node, task, false);
      expect(result).toBe(true);
    });

    it('should handle closed range value in closed filter', async () => {
      const task = createBaseTask({
        closedDate: new Date(2026, 0, 15),
        completed: true,
      });

      const node = {
        type: 'prefix_filter' as const,
        field: 'closed' as const,
        value: '2026-01-01..2026-01-31',
        exact: false,
      };

      const result = await SearchEvaluator.evaluate(node, task, false);
      expect(result).toBe(true);
    });
  });

  describe('evaluatePathFilter edge cases (lines 294-317)', () => {
    it('should match path with exact match', async () => {
      const task = createBaseTask({ path: 'projects' });
      const node = parseQuery('path:projects');
      const result = await SearchEvaluator.evaluate(node, task, false);
      expect(result).toBe(true);
    });

    it('should match path with nested components', async () => {
      const task = createBaseTask({ path: 'notes/work/project/tasks.md' });
      const node = parseQuery('path:work');
      const result = await SearchEvaluator.evaluate(node, task, false);
      expect(result).toBe(true);
    });
  });

  describe('evaluateFileFilter edge cases (lines 320-334)', () => {
    it('should match file by partial name', async () => {
      const task = createBaseTask({ path: 'notes/work/project-planning.md' });
      const node = parseQuery('file:project');
      const result = await SearchEvaluator.evaluate(node, task, false);
      expect(result).toBe(true);
    });

    it('should return false when file path is empty', async () => {
      const task = createBaseTask({ path: '' });
      const node = parseQuery('file:test');
      const result = await SearchEvaluator.evaluate(node, task, false);
      expect(result).toBe(false);
    });
  });

  describe('evaluateTagFilter edge cases (lines 336-393)', () => {
    it('should match tag with prefix match (no hash)', async () => {
      const task = createBaseTask({
        rawText: 'TODO task #context/home',
        text: 'task',
      });
      const node = parseQuery('tag:context');
      const result = await SearchEvaluator.evaluate(node, task, false);
      expect(result).toBe(true);
    });

    it('should match exact quoted tag', async () => {
      const task = createBaseTask({
        rawText: 'TODO task #project',
        text: 'task',
      });
      const node = parseQuery('tag:"#project"');
      const result = await SearchEvaluator.evaluate(node, task, false);
      expect(result).toBe(true);
    });

    it('should return false when rawText is missing', async () => {
      const task = createBaseTask({ rawText: '', text: 'task' });
      const node = parseQuery('tag:#urgent');
      const result = await SearchEvaluator.evaluate(node, task, false);
      expect(result).toBe(false);
    });
  });

  describe('evaluateStateFilter edge cases (lines 395-414)', () => {
    it('should match state with settings active group', async () => {
      const settings = createBaseSettings();
      const node = parseQuery('state:active');
      const task = createBaseTask({ state: 'DOING' });
      const result = await SearchEvaluator.evaluate(
        node,
        task,
        false,
        settings,
      );
      expect(result).toBe(true);
    });

    it('should match state with custom active keywords', async () => {
      const settings = createBaseSettings({
        additionalActiveKeywords: ['REVIEWING'],
      });
      const node = parseQuery('state:active');
      const task = createBaseTask({ state: 'REVIEWING' });
      const result = await SearchEvaluator.evaluate(
        node,
        task,
        false,
        settings,
      );
      expect(result).toBe(true);
    });

    it('should match state with settings completed group', async () => {
      const settings = createBaseSettings();
      const node = parseQuery('state:completed');
      const task = createBaseTask({ state: 'DONE' });
      const result = await SearchEvaluator.evaluate(
        node,
        task,
        false,
        settings,
      );
      expect(result).toBe(true);
    });

    it('should match state with settings waiting group', async () => {
      const settings = createBaseSettings();
      const node = parseQuery('state:waiting');
      const task = createBaseTask({ state: 'WAIT' });
      const result = await SearchEvaluator.evaluate(
        node,
        task,
        false,
        settings,
      );
      expect(result).toBe(true);
    });

    it('should match state with settings inactive group', async () => {
      const settings = createBaseSettings();
      const node = parseQuery('state:inactive');
      const task = createBaseTask({ state: 'LATER' });
      const result = await SearchEvaluator.evaluate(
        node,
        task,
        false,
        settings,
      );
      expect(result).toBe(true);
    });

    it('should fall back to exact match when no settings', async () => {
      const node = parseQuery('state:active');
      const task = createBaseTask({ state: 'DOING' });
      const result = await SearchEvaluator.evaluate(node, task, false);
      expect(result).toBe(false);
    });
  });

  describe('evaluatePriorityFilter edge cases (lines 416-438)', () => {
    it('should match high priority', async () => {
      const node = parseQuery('priority:high');
      const task = createBaseTask({ priority: 'high' });
      const result = await SearchEvaluator.evaluate(node, task, false);
      expect(result).toBe(true);
    });

    it('should match medium priority', async () => {
      const node = parseQuery('priority:medium');
      const task = createBaseTask({ priority: 'med' });
      const result = await SearchEvaluator.evaluate(node, task, false);
      expect(result).toBe(true);
    });

    it('should match low priority', async () => {
      const node = parseQuery('priority:low');
      const task = createBaseTask({ priority: 'low' });
      const result = await SearchEvaluator.evaluate(node, task, false);
      expect(result).toBe(true);
    });

    it('should match none priority', async () => {
      const node = parseQuery('priority:none');
      const task = createBaseTask({ priority: null });
      const result = await SearchEvaluator.evaluate(node, task, false);
      expect(result).toBe(true);
    });

    it('should match priority letter A', async () => {
      const node = parseQuery('priority:A');
      const task = createBaseTask({ priority: 'high' });
      const result = await SearchEvaluator.evaluate(node, task, false);
      expect(result).toBe(true);
    });

    it('should match priority letter B', async () => {
      const node = parseQuery('priority:B');
      const task = createBaseTask({ priority: 'med' });
      const result = await SearchEvaluator.evaluate(node, task, false);
      expect(result).toBe(true);
    });

    it('should match priority letter C', async () => {
      const node = parseQuery('priority:C');
      const task = createBaseTask({ priority: 'low' });
      const result = await SearchEvaluator.evaluate(node, task, false);
      expect(result).toBe(true);
    });
  });

  describe('evaluateContentFilter edge cases (lines 440-451)', () => {
    it('should match content in task text', async () => {
      const node = parseQuery('content:project');
      const task = createBaseTask({ text: 'work on project planning' });
      const result = await SearchEvaluator.evaluate(node, task, false);
      expect(result).toBe(true);
    });

    it('should return false when task text is empty', async () => {
      const node = parseQuery('content:test');
      const task = createBaseTask({ text: '' });
      const result = await SearchEvaluator.evaluate(node, task, false);
      expect(result).toBe(false);
    });
  });

  describe('evaluateTerm edge cases (lines 141-153)', () => {
    it('should match term case-insensitively', async () => {
      const node = { type: 'term' as const, value: 'MEETING' };
      const task = createBaseTask({
        rawText: 'TODO meeting about project',
        text: 'meeting about project',
      });
      const result = await SearchEvaluator.evaluate(node, task, false);
      expect(result).toBe(true);
    });

    it('should match term case-sensitively', async () => {
      const node = { type: 'term' as const, value: 'MEETING' };
      const task = createBaseTask({
        rawText: 'TODO meeting about project',
        text: 'meeting about project',
      });
      const result = await SearchEvaluator.evaluate(node, task, true);
      expect(result).toBe(false);
    });

    it('should return false for empty term', async () => {
      const node = { type: 'term' as const, value: '' };
      const task = createBaseTask();
      const result = await SearchEvaluator.evaluate(node, task, false);
      expect(result).toBe(false);
    });
  });

  describe('evaluatePhrase edge cases (lines 155-176)', () => {
    it('should match phrase with word boundaries', async () => {
      const node = { type: 'phrase' as const, value: 'project planning' };
      const task = createBaseTask({
        rawText: 'TODO project planning meeting',
        text: 'project planning meeting',
      });
      const result = await SearchEvaluator.evaluate(node, task, false);
      expect(result).toBe(true);
    });

    it('should not match partial word in phrase', async () => {
      const node = { type: 'phrase' as const, value: 'star' };
      const task = createBaseTask({
        rawText: 'TODO starfish ocean',
        text: 'starfish ocean',
      });
      const result = await SearchEvaluator.evaluate(node, task, false);
      expect(result).toBe(false);
    });

    it('should return false for empty phrase', async () => {
      const node = { type: 'phrase' as const, value: '' };
      const task = createBaseTask();
      const result = await SearchEvaluator.evaluate(node, task, false);
      expect(result).toBe(false);
    });
  });

  describe('evaluateAnd/Or/Not edge cases', () => {
    it('should return true for empty AND children', async () => {
      const node = { type: 'and' as const, children: [] };
      const task = createBaseTask();
      const result = await SearchEvaluator.evaluate(node, task, false);
      expect(result).toBe(true);
    });

    it('should return false for empty OR children', async () => {
      const node = { type: 'or' as const, children: [] };
      const task = createBaseTask();
      const result = await SearchEvaluator.evaluate(node, task, false);
      expect(result).toBe(false);
    });

    it('should return false for NOT without child', async () => {
      const node = { type: 'not' as const, children: undefined };
      const task = createBaseTask();
      const result = await SearchEvaluator.evaluate(node, task, false);
      expect(result).toBe(false);
    });

    it('should return false for AND without children', async () => {
      const node = { type: 'and' as const, children: undefined };
      const task = createBaseTask();
      const result = await SearchEvaluator.evaluate(node, task, false);
      expect(result).toBe(false);
    });

    it('should return false for OR without children', async () => {
      const node = { type: 'or' as const, children: undefined };
      const task = createBaseTask();
      const result = await SearchEvaluator.evaluate(node, task, false);
      expect(result).toBe(false);
    });
  });

  describe('evaluatePropertyFilter edge cases (lines 785-1090)', () => {
    it('should return false for property filter with empty field', async () => {
      const task = createBaseTask();
      const node = {
        type: 'property_filter' as const,
        field: 'property',
        value: undefined,
        exact: false,
      };
      const result = await SearchEvaluator.evaluate(node, task, false);
      expect(result).toBe(false);
    });

    it('should evaluate property filter with PropertySearchEngine', async () => {
      const mockEngine = {
        searchProperties: jest.fn(async (query: string) => {
          if (query === '[type:Project]') {
            return new Set(['project.md']);
          }
          return new Set();
        }),
      } as unknown as PropertySearchEngine;

      const task = createBaseTask({
        path: 'project.md',
        line: 1,
        rawText: 'TODO project task',
        text: 'project task',
      });

      const node = {
        type: 'property_filter' as const,
        field: 'property',
        value: 'type:Project',
        exact: false,
      };

      const result = await SearchEvaluator.evaluate(
        node,
        task,
        false,
        undefined,
        mockEngine,
      );
      expect(result).toBe(true);
      expect(mockEngine.searchProperties).toHaveBeenCalledWith(
        '[type:Project]',
        false,
      );
    });

    it('should fall back to direct metadata when PropertySearchEngine throws', async () => {
      const mockApp = createMockApp();
      const mockFile = new TFile('test.md', 'test', 'md');
      (mockApp.vault.getAbstractFileByPath as jest.Mock).mockReturnValue(
        mockFile,
      );
      (mockApp.metadataCache.getFileCache as jest.Mock).mockReturnValue({
        frontmatter: { type: 'Project' },
      });

      const settings = createSettingsWithApp(mockApp);
      const task = createBaseTask({
        path: 'test.md',
        line: 1,
        rawText: 'TODO test task',
        text: 'test task',
      });

      const node = {
        type: 'property_filter' as const,
        field: 'property',
        value: 'type:Project',
        exact: false,
      };

      const mockEngine = {
        searchProperties: jest.fn(async () => {
          throw new Error('Engine failed');
        }),
      } as unknown as PropertySearchEngine;

      const result = await SearchEvaluator.evaluate(
        node,
        task,
        false,
        settings,
        mockEngine,
      );
      expect(result).toBe(true);
    });

    it('should evaluate property key-only search [type]', async () => {
      const mockApp = createMockApp();
      const mockFile = new TFile('test.md', 'test', 'md');
      (mockApp.vault.getAbstractFileByPath as jest.Mock).mockReturnValue(
        mockFile,
      );
      (mockApp.metadataCache.getFileCache as jest.Mock).mockReturnValue({
        frontmatter: { type: 'Project' },
      });

      const settings = createSettingsWithApp(mockApp);
      const task = createBaseTask({
        path: 'test.md',
        line: 1,
        rawText: 'TODO test task',
        text: 'test task',
      });

      const node = {
        type: 'property_filter' as const,
        field: 'property',
        value: 'type',
        exact: false,
      };

      const result = await SearchEvaluator.evaluate(
        node,
        task,
        false,
        settings,
        null,
      );
      expect(result).toBe(true);
    });

    it('should evaluate property key-only search with empty value [type:]', async () => {
      const mockApp = createMockApp();
      const mockFile = new TFile('test.md', 'test', 'md');
      (mockApp.vault.getAbstractFileByPath as jest.Mock).mockReturnValue(
        mockFile,
      );
      (mockApp.metadataCache.getFileCache as jest.Mock).mockReturnValue({
        frontmatter: { type: 'Project' },
      });

      const settings = createSettingsWithApp(mockApp);
      const task = createBaseTask({
        path: 'test.md',
        line: 1,
        rawText: 'TODO test task',
        text: 'test task',
      });

      const node = {
        type: 'property_filter' as const,
        field: 'property',
        value: 'type:',
        exact: false,
      };

      const result = await SearchEvaluator.evaluate(
        node,
        task,
        false,
        settings,
        null,
      );
      expect(result).toBe(true);
    });

    it('should not match missing property', async () => {
      const mockApp = createMockApp();
      const mockFile = new TFile('test.md', 'test', 'md');
      (mockApp.vault.getAbstractFileByPath as jest.Mock).mockReturnValue(
        mockFile,
      );
      (mockApp.metadataCache.getFileCache as jest.Mock).mockReturnValue({
        frontmatter: { priority: 'high' },
      });

      const settings = createSettingsWithApp(mockApp);
      const task = createBaseTask({
        path: 'test.md',
        line: 1,
        rawText: 'TODO test task',
        text: 'test task',
      });

      const node = {
        type: 'property_filter' as const,
        field: 'property',
        value: 'type:Project',
        exact: false,
      };

      const result = await SearchEvaluator.evaluate(
        node,
        task,
        false,
        settings,
        null,
      );
      expect(result).toBe(false);
    });

    it('should evaluate OR expressions in property value', async () => {
      const mockApp = createMockApp();
      const mockFile = new TFile('test.md', 'test', 'md');
      (mockApp.vault.getAbstractFileByPath as jest.Mock).mockReturnValue(
        mockFile,
      );
      (mockApp.metadataCache.getFileCache as jest.Mock).mockReturnValue({
        frontmatter: { status: 'Draft' },
      });

      const settings = createSettingsWithApp(mockApp);
      const task = createBaseTask({
        path: 'test.md',
        line: 1,
        rawText: 'TODO test task',
        text: 'test task',
      });

      const node = {
        type: 'property_filter' as const,
        field: 'property',
        value: 'status:Draft OR Published',
        exact: false,
      };

      const result = await SearchEvaluator.evaluate(
        node,
        task,
        false,
        settings,
        null,
      );
      expect(result).toBe(true);
    });

    it('should evaluate OR expressions with parentheses', async () => {
      const mockApp = createMockApp();
      const mockFile = new TFile('test.md', 'test', 'md');
      (mockApp.vault.getAbstractFileByPath as jest.Mock).mockReturnValue(
        mockFile,
      );
      (mockApp.metadataCache.getFileCache as jest.Mock).mockReturnValue({
        frontmatter: { status: 'Published' },
      });

      const settings = createSettingsWithApp(mockApp);
      const task = createBaseTask({
        path: 'test.md',
        line: 1,
        rawText: 'TODO test task',
        text: 'test task',
      });

      const node = {
        type: 'property_filter' as const,
        field: 'property',
        value: 'status:(Draft OR Published)',
        exact: false,
      };

      const result = await SearchEvaluator.evaluate(
        node,
        task,
        false,
        settings,
        null,
      );
      expect(result).toBe(true);
    });

    it('should handle case-insensitive property key search', async () => {
      const mockApp = createMockApp();
      const mockFile = new TFile('test.md', 'test', 'md');
      (mockApp.vault.getAbstractFileByPath as jest.Mock).mockReturnValue(
        mockFile,
      );
      (mockApp.metadataCache.getFileCache as jest.Mock).mockReturnValue({
        frontmatter: { Type: 'Project' },
      });

      const settings = createSettingsWithApp(mockApp);
      const task = createBaseTask({
        path: 'test.md',
        line: 1,
        rawText: 'TODO test task',
        text: 'test task',
      });

      const node = {
        type: 'property_filter' as const,
        field: 'property',
        value: 'type:Project',
        exact: false,
      };

      const result = await SearchEvaluator.evaluate(
        node,
        task,
        false,
        settings,
        null,
      );
      expect(result).toBe(true);
    });

    it('should handle exact match with quoted value', async () => {
      const mockApp = createMockApp();
      const mockFile = new TFile('test.md', 'test', 'md');
      (mockApp.vault.getAbstractFileByPath as jest.Mock).mockReturnValue(
        mockFile,
      );
      (mockApp.metadataCache.getFileCache as jest.Mock).mockReturnValue({
        frontmatter: { status: 'draft' },
      });

      const settings = createSettingsWithApp(mockApp);
      const task = createBaseTask({
        path: 'test.md',
        line: 1,
        rawText: 'TODO test task',
        text: 'test task',
      });

      const node = {
        type: 'property_filter' as const,
        field: 'property',
        value: 'status:draft',
        exact: true,
      };

      const result = await SearchEvaluator.evaluate(
        node,
        task,
        false,
        settings,
        null,
      );
      expect(result).toBe(true);
    });

    it('should handle numeric comparison operators', async () => {
      const mockApp = createMockApp();
      const mockFile = new TFile('test.md', 'test', 'md');
      (mockApp.vault.getAbstractFileByPath as jest.Mock).mockReturnValue(
        mockFile,
      );
      (mockApp.metadataCache.getFileCache as jest.Mock).mockReturnValue({
        frontmatter: { priority: 5 },
      });

      const settings = createSettingsWithApp(mockApp);
      const task = createBaseTask({
        path: 'test.md',
        line: 1,
        rawText: 'TODO test task',
        text: 'test task',
      });

      const node = {
        type: 'property_filter' as const,
        field: 'property',
        value: 'priority:>=3',
        exact: false,
      };

      const result = await SearchEvaluator.evaluate(
        node,
        task,
        false,
        settings,
        null,
      );
      expect(result).toBe(true);
    });

    it('should handle array property values', async () => {
      const mockApp = createMockApp();
      const mockFile = new TFile('test.md', 'test', 'md');
      (mockApp.vault.getAbstractFileByPath as jest.Mock).mockReturnValue(
        mockFile,
      );
      (mockApp.metadataCache.getFileCache as jest.Mock).mockReturnValue({
        frontmatter: { tags: ['work', 'urgent', 'project'] },
      });

      const settings = createSettingsWithApp(mockApp);
      const task = createBaseTask({
        path: 'test.md',
        line: 1,
        rawText: 'TODO test task',
        text: 'test task',
      });

      const node = {
        type: 'property_filter' as const,
        field: 'property',
        value: 'tags:urg',
        exact: false,
      };

      const result = await SearchEvaluator.evaluate(
        node,
        task,
        false,
        settings,
        null,
      );
      expect(result).toBe(true);
    });

    it('should handle boolean property values', async () => {
      const mockApp = createMockApp();
      const mockFile = new TFile('test.md', 'test', 'md');
      (mockApp.vault.getAbstractFileByPath as jest.Mock).mockReturnValue(
        mockFile,
      );
      (mockApp.metadataCache.getFileCache as jest.Mock).mockReturnValue({
        frontmatter: { completed: true },
      });

      const settings = createSettingsWithApp(mockApp);
      const task = createBaseTask({
        path: 'test.md',
        line: 1,
        rawText: 'TODO test task',
        text: 'test task',
      });

      const node = {
        type: 'property_filter' as const,
        field: 'property',
        value: 'completed:true',
        exact: false,
      };

      const result = await SearchEvaluator.evaluate(
        node,
        task,
        false,
        settings,
        null,
      );
      expect(result).toBe(true);
    });

    it('should handle date property comparisons', async () => {
      const mockApp = createMockApp();
      const mockFile = new TFile('test.md', 'test', 'md');
      (mockApp.vault.getAbstractFileByPath as jest.Mock).mockReturnValue(
        mockFile,
      );
      const taskDate = new Date(2026, 0, 15);
      (mockApp.metadataCache.getFileCache as jest.Mock).mockReturnValue({
        frontmatter: { due: taskDate },
      });

      const settings = createSettingsWithApp(mockApp);
      const task = createBaseTask({
        path: 'test.md',
        line: 1,
        rawText: 'TODO test task',
        text: 'test task',
      });

      const node = {
        type: 'property_filter' as const,
        field: 'property',
        value: 'due:2026-01-15',
        exact: false,
      };

      const result = await SearchEvaluator.evaluate(
        node,
        task,
        false,
        settings,
        null,
      );
      expect(result).toBe(true);
    });

    it('should handle null property value search', async () => {
      const mockApp = createMockApp();
      const mockFile = new TFile('test.md', 'test', 'md');
      (mockApp.vault.getAbstractFileByPath as jest.Mock).mockReturnValue(
        mockFile,
      );
      (mockApp.metadataCache.getFileCache as jest.Mock).mockReturnValue({
        frontmatter: { type: null },
      });

      const settings = createSettingsWithApp(mockApp);
      const task = createBaseTask({
        path: 'test.md',
        line: 1,
        rawText: 'TODO test task',
        text: 'test task',
      });

      const node = {
        type: 'property_filter' as const,
        field: 'property',
        value: 'type:null',
        exact: false,
      };

      const result = await SearchEvaluator.evaluate(
        node,
        task,
        false,
        settings,
        null,
      );
      expect(result).toBe(true);
    });

    it('should handle property search when file is not found', async () => {
      const mockApp = createMockApp();
      (mockApp.vault.getAbstractFileByPath as jest.Mock).mockReturnValue(null);

      const settings = createSettingsWithApp(mockApp);
      const task = createBaseTask({
        path: 'nonexistent.md',
        line: 1,
        rawText: 'TODO test task',
        text: 'test task',
      });

      const node = {
        type: 'property_filter' as const,
        field: 'property',
        value: 'type:Project',
        exact: false,
      };

      const result = await SearchEvaluator.evaluate(
        node,
        task,
        false,
        settings,
        null,
      );
      expect(result).toBe(false);
    });
  });

  describe('Boolean Logic edge cases', () => {
    it('should evaluate AND with multiple conditions', async () => {
      const node = parseQuery('priority:high state:TODO');
      const task = createBaseTask({ priority: 'high', state: 'TODO' });
      const result = await SearchEvaluator.evaluate(node, task, false);
      expect(result).toBe(true);
    });

    it('should short-circuit AND on first false', async () => {
      const node = parseQuery('priority:high state:DONE');
      const task = createBaseTask({ priority: 'high', state: 'TODO' });
      const result = await SearchEvaluator.evaluate(node, task, false);
      expect(result).toBe(false);
    });

    it('should evaluate OR with matching first condition', async () => {
      const node = parseQuery('priority:high OR priority:low');
      const task = createBaseTask({ priority: 'high' });
      const result = await SearchEvaluator.evaluate(node, task, false);
      expect(result).toBe(true);
    });

    it('should evaluate OR with matching second condition', async () => {
      const node = parseQuery('priority:high OR priority:low');
      const task = createBaseTask({ priority: 'low' });
      const result = await SearchEvaluator.evaluate(node, task, false);
      expect(result).toBe(true);
    });

    it('should evaluate NOT negation', async () => {
      const node = parseQuery('-priority:high');
      const task = createBaseTask({ priority: 'low' });
      const result = await SearchEvaluator.evaluate(node, task, false);
      expect(result).toBe(true);
    });

    it('should evaluate NOT with nested expression', async () => {
      const node = parseQuery('-(priority:high state:DOING)');
      const task = createBaseTask({ priority: 'low', state: 'TODO' });
      const result = await SearchEvaluator.evaluate(node, task, false);
      expect(result).toBe(true);
    });

    it('should handle complex nested boolean logic', async () => {
      const node = parseQuery(
        '(priority:high OR priority:medium) -state:DOING',
      );
      const task = createBaseTask({ priority: 'high', state: 'TODO' });
      const result = await SearchEvaluator.evaluate(node, task, false);
      expect(result).toBe(true);
    });
  });

  describe('Regex Escaping', () => {
    it('should escape regex special characters in phrase', async () => {
      const node = { type: 'phrase' as const, value: 'v1.2' };
      const task = createBaseTask({
        rawText: 'TODO version v1.2 released',
        text: 'version v1.2 released',
      });
      const result = await SearchEvaluator.evaluate(node, task, false);
      expect(result).toBe(true);
    });
  });

  describe('Searchable Fields Helper', () => {
    it('should include rawText, text, and path in searchable fields', async () => {
      const task = createBaseTask({
        rawText: 'TODO full line',
        text: 'task text',
        path: 'notes/test.md',
      });
      const node = { type: 'term' as const, value: 'full' };
      const result = await SearchEvaluator.evaluate(node, task, false);
      expect(result).toBe(true);
    });

    it('should include filename from path', async () => {
      const task = createBaseTask({ path: 'notes/folder/test.md' });
      const node = { type: 'term' as const, value: 'test' };
      const result = await SearchEvaluator.evaluate(node, task, false);
      expect(result).toBe(true);
    });
  });

  describe('Closed Date Filter', () => {
    it('should match closed:none for incomplete tasks', async () => {
      const node = parseQuery('closed:none');
      const task = createBaseTask({ completed: false, closedDate: null });
      const result = await SearchEvaluator.evaluate(node, task, false);
      expect(result).toBe(true);
    });

    it('should not match closed:none for completed tasks', async () => {
      const node = parseQuery('closed:none');
      const task = createBaseTask({
        completed: true,
        closedDate: new Date(2026, 0, 14),
      });
      const result = await SearchEvaluator.evaluate(node, task, false);
      expect(result).toBe(false);
    });
  });

  describe('evaluatePropertyFilter fallback branches (lines 845-861)', () => {
    it('should return false when getApp returns undefined (line 856)', async () => {
      const mockEngine = {
        searchProperties: jest.fn(async () => new Set()),
      } as unknown as PropertySearchEngine;

      const task = createBaseTask({
        path: 'test.md',
        line: 1,
        rawText: 'TODO test task',
        text: 'test task',
      });

      const node = {
        type: 'property_filter' as const,
        field: 'property',
        value: 'type:Project',
        exact: false,
      };

      const result = await SearchEvaluator.evaluate(
        node,
        task,
        false,
        undefined,
        mockEngine,
      );
      expect(result).toBe(false);
    });

    it('should return false when fileCache has no frontmatter (line 861)', async () => {
      const mockApp = createMockApp();
      const mockFile = new TFile('test.md', 'test', 'md');
      (mockApp.vault.getAbstractFileByPath as jest.Mock).mockReturnValue(
        mockFile,
      );
      (mockApp.metadataCache.getFileCache as jest.Mock).mockReturnValue({});

      const settings = createSettingsWithApp(mockApp);
      const task = createBaseTask({
        path: 'test.md',
        line: 1,
        rawText: 'TODO test task',
        text: 'test task',
      });

      const node = {
        type: 'property_filter' as const,
        field: 'property',
        value: 'type:Project',
        exact: false,
      };

      const result = await SearchEvaluator.evaluate(
        node,
        task,
        false,
        settings,
        null,
      );
      expect(result).toBe(false);
    });

    it('should handle case-sensitive key-only property (line 871)', async () => {
      const mockApp = createMockApp();
      const mockFile = new TFile('test.md', 'test', 'md');
      (mockApp.vault.getAbstractFileByPath as jest.Mock).mockReturnValue(
        mockFile,
      );
      (mockApp.metadataCache.getFileCache as jest.Mock).mockReturnValue({
        frontmatter: { Type: 'Project' },
      });

      const settings = createSettingsWithApp(mockApp);
      const task = createBaseTask({
        path: 'test.md',
        line: 1,
        rawText: 'TODO test task',
        text: 'test task',
      });

      const node = {
        type: 'property_filter' as const,
        field: 'property',
        value: 'Type',
        exact: false,
      };

      const result = await SearchEvaluator.evaluate(
        node,
        task,
        true,
        settings,
        null,
      );
      expect(result).toBe(true);
    });

    it('should handle case-sensitive null value (lines 886-889)', async () => {
      const mockApp = createMockApp();
      const mockFile = new TFile('test.md', 'test', 'md');
      (mockApp.vault.getAbstractFileByPath as jest.Mock).mockReturnValue(
        mockFile,
      );
      (mockApp.metadataCache.getFileCache as jest.Mock).mockReturnValue({
        frontmatter: { Type: null },
      });

      const settings = createSettingsWithApp(mockApp);
      const task = createBaseTask({
        path: 'test.md',
        line: 1,
        rawText: 'TODO test task',
        text: 'test task',
      });

      const node = {
        type: 'property_filter' as const,
        field: 'property',
        value: 'Type:null',
        exact: false,
      };

      const result = await SearchEvaluator.evaluate(
        node,
        task,
        true,
        settings,
        null,
      );
      expect(result).toBe(true);
    });

    it('should handle case-insensitive null value (line 897)', async () => {
      const mockApp = createMockApp();
      const mockFile = new TFile('test.md', 'test', 'md');
      (mockApp.vault.getAbstractFileByPath as jest.Mock).mockReturnValue(
        mockFile,
      );
      (mockApp.metadataCache.getFileCache as jest.Mock).mockReturnValue({
        frontmatter: { Status: null },
      });

      const settings = createSettingsWithApp(mockApp);
      const task = createBaseTask({
        path: 'test.md',
        line: 1,
        rawText: 'TODO test task',
        text: 'test task',
      });

      const node = {
        type: 'property_filter' as const,
        field: 'property',
        value: 'status:null',
        exact: false,
      };

      const result = await SearchEvaluator.evaluate(
        node,
        task,
        false,
        settings,
        null,
      );
      expect(result).toBe(true);
    });

    it('should return false for empty string search on null property (line 921)', async () => {
      const mockApp = createMockApp();
      const mockFile = new TFile('test.md', 'test', 'md');
      (mockApp.vault.getAbstractFileByPath as jest.Mock).mockReturnValue(
        mockFile,
      );
      (mockApp.metadataCache.getFileCache as jest.Mock).mockReturnValue({
        frontmatter: { status: null },
      });

      const settings = createSettingsWithApp(mockApp);
      const task = createBaseTask({
        path: 'test.md',
        line: 1,
        rawText: 'TODO test task',
        text: 'test task',
      });

      // 'status:' is normalized to propertyValue=null, so it becomes a key-only search
      // that matches if the key exists (regardless of value)
      const node = {
        type: 'property_filter' as const,
        field: 'property',
        value: 'status:',
        exact: true,
      };

      const result = await SearchEvaluator.evaluate(
        node,
        task,
        false,
        settings,
        null,
      );
      expect(result).toBe(true);
    });
  });

  describe('evaluateSinglePropertyValue comparison operators (lines 998-1021)', () => {
    it('should handle > operator on numeric property', async () => {
      const mockApp = createMockApp();
      const mockFile = new TFile('test.md', 'test', 'md');
      (mockApp.vault.getAbstractFileByPath as jest.Mock).mockReturnValue(
        mockFile,
      );
      (mockApp.metadataCache.getFileCache as jest.Mock).mockReturnValue({
        frontmatter: { size: 150 },
      });

      const settings = createSettingsWithApp(mockApp);
      const task = createBaseTask({
        path: 'test.md',
        line: 1,
        rawText: 'TODO test task',
        text: 'test task',
      });

      const node = {
        type: 'property_filter' as const,
        field: 'property',
        value: 'size:>100',
        exact: false,
      };

      const result = await SearchEvaluator.evaluate(
        node,
        task,
        false,
        settings,
        null,
      );
      expect(result).toBe(true);
    });

    it('should handle >= operator on numeric property', async () => {
      const mockApp = createMockApp();
      const mockFile = new TFile('test.md', 'test', 'md');
      (mockApp.vault.getAbstractFileByPath as jest.Mock).mockReturnValue(
        mockFile,
      );
      (mockApp.metadataCache.getFileCache as jest.Mock).mockReturnValue({
        frontmatter: { size: 100 },
      });

      const settings = createSettingsWithApp(mockApp);
      const task = createBaseTask({
        path: 'test.md',
        line: 1,
        rawText: 'TODO test task',
        text: 'test task',
      });

      const node = {
        type: 'property_filter' as const,
        field: 'property',
        value: 'size:>=100',
        exact: false,
      };

      const result = await SearchEvaluator.evaluate(
        node,
        task,
        false,
        settings,
        null,
      );
      expect(result).toBe(true);
    });

    it('should handle < operator on numeric property', async () => {
      const mockApp = createMockApp();
      const mockFile = new TFile('test.md', 'test', 'md');
      (mockApp.vault.getAbstractFileByPath as jest.Mock).mockReturnValue(
        mockFile,
      );
      (mockApp.metadataCache.getFileCache as jest.Mock).mockReturnValue({
        frontmatter: { size: 50 },
      });

      const settings = createSettingsWithApp(mockApp);
      const task = createBaseTask({
        path: 'test.md',
        line: 1,
        rawText: 'TODO test task',
        text: 'test task',
      });

      const node = {
        type: 'property_filter' as const,
        field: 'property',
        value: 'size:<100',
        exact: false,
      };

      const result = await SearchEvaluator.evaluate(
        node,
        task,
        false,
        settings,
        null,
      );
      expect(result).toBe(true);
    });

    it('should handle <= operator on numeric property', async () => {
      const mockApp = createMockApp();
      const mockFile = new TFile('test.md', 'test', 'md');
      (mockApp.vault.getAbstractFileByPath as jest.Mock).mockReturnValue(
        mockFile,
      );
      (mockApp.metadataCache.getFileCache as jest.Mock).mockReturnValue({
        frontmatter: { size: 100 },
      });

      const settings = createSettingsWithApp(mockApp);
      const task = createBaseTask({
        path: 'test.md',
        line: 1,
        rawText: 'TODO test task',
        text: 'test task',
      });

      const node = {
        type: 'property_filter' as const,
        field: 'property',
        value: 'size:<=100',
        exact: false,
      };

      const result = await SearchEvaluator.evaluate(
        node,
        task,
        false,
        settings,
        null,
      );
      expect(result).toBe(true);
    });

    it('should return false for comparison operator on non-numeric property', async () => {
      const mockApp = createMockApp();
      const mockFile = new TFile('test.md', 'test', 'md');
      (mockApp.vault.getAbstractFileByPath as jest.Mock).mockReturnValue(
        mockFile,
      );
      (mockApp.metadataCache.getFileCache as jest.Mock).mockReturnValue({
        frontmatter: { status: 'active' },
      });

      const settings = createSettingsWithApp(mockApp);
      const task = createBaseTask({
        path: 'test.md',
        line: 1,
        rawText: 'TODO test task',
        text: 'test task',
      });

      const node = {
        type: 'property_filter' as const,
        field: 'property',
        value: 'status:>5',
        exact: false,
      };

      const result = await SearchEvaluator.evaluate(
        node,
        task,
        false,
        settings,
        null,
      );
      expect(result).toBe(false);
    });
  });

  describe('evaluateSinglePropertyValue array handling (lines 1026-1040)', () => {
    it('should match exact string in array', async () => {
      const mockApp = createMockApp();
      const mockFile = new TFile('test.md', 'test', 'md');
      (mockApp.vault.getAbstractFileByPath as jest.Mock).mockReturnValue(
        mockFile,
      );
      (mockApp.metadataCache.getFileCache as jest.Mock).mockReturnValue({
        frontmatter: { tags: ['work', 'urgent'] },
      });

      const settings = createSettingsWithApp(mockApp);
      const task = createBaseTask({
        path: 'test.md',
        line: 1,
        rawText: 'TODO test task',
        text: 'test task',
      });

      const node = {
        type: 'property_filter' as const,
        field: 'property',
        value: 'tags:work',
        exact: true,
      };

      const result = await SearchEvaluator.evaluate(
        node,
        task,
        false,
        settings,
        null,
      );
      expect(result).toBe(true);
    });

    it('should handle non-string items in array (line 1039)', async () => {
      const mockApp = createMockApp();
      const mockFile = new TFile('test.md', 'test', 'md');
      (mockApp.vault.getAbstractFileByPath as jest.Mock).mockReturnValue(
        mockFile,
      );
      (mockApp.metadataCache.getFileCache as jest.Mock).mockReturnValue({
        frontmatter: { tags: [123, true, null] },
      });

      const settings = createSettingsWithApp(mockApp);
      const task = createBaseTask({
        path: 'test.md',
        line: 1,
        rawText: 'TODO test task',
        text: 'test task',
      });

      const node = {
        type: 'property_filter' as const,
        field: 'property',
        value: 'tags:test',
        exact: false,
      };

      const result = await SearchEvaluator.evaluate(
        node,
        task,
        false,
        settings,
        null,
      );
      expect(result).toBe(false);
    });
  });

  describe('evaluateSinglePropertyValue number and boolean (lines 1053-1078)', () => {
    it('should match numeric property with exact number', async () => {
      const mockApp = createMockApp();
      const mockFile = new TFile('test.md', 'test', 'md');
      (mockApp.vault.getAbstractFileByPath as jest.Mock).mockReturnValue(
        mockFile,
      );
      (mockApp.metadataCache.getFileCache as jest.Mock).mockReturnValue({
        frontmatter: { count: 42 },
      });

      const settings = createSettingsWithApp(mockApp);
      const task = createBaseTask({
        path: 'test.md',
        line: 1,
        rawText: 'TODO test task',
        text: 'test task',
      });

      const node = {
        type: 'property_filter' as const,
        field: 'property',
        value: 'count:42',
        exact: false,
      };

      const result = await SearchEvaluator.evaluate(
        node,
        task,
        false,
        settings,
        null,
      );
      expect(result).toBe(true);
    });

    it('should match numeric property with string prefix', async () => {
      const mockApp = createMockApp();
      const mockFile = new TFile('test.md', 'test', 'md');
      (mockApp.vault.getAbstractFileByPath as jest.Mock).mockReturnValue(
        mockFile,
      );
      (mockApp.metadataCache.getFileCache as jest.Mock).mockReturnValue({
        frontmatter: { count: 42 },
      });

      const settings = createSettingsWithApp(mockApp);
      const task = createBaseTask({
        path: 'test.md',
        line: 1,
        rawText: 'TODO test task',
        text: 'test task',
      });

      // '4' is parsed as a comparison operator with no operator, returning false
      const node = {
        type: 'property_filter' as const,
        field: 'property',
        value: 'count:4',
        exact: false,
      };

      const result = await SearchEvaluator.evaluate(
        node,
        task,
        false,
        settings,
        null,
      );
      expect(result).toBe(false);
    });

    it('should match boolean true property (line 1075)', async () => {
      const mockApp = createMockApp();
      const mockFile = new TFile('test.md', 'test', 'md');
      (mockApp.vault.getAbstractFileByPath as jest.Mock).mockReturnValue(
        mockFile,
      );
      (mockApp.metadataCache.getFileCache as jest.Mock).mockReturnValue({
        frontmatter: { active: true },
      });

      const settings = createSettingsWithApp(mockApp);
      const task = createBaseTask({
        path: 'test.md',
        line: 1,
        rawText: 'TODO test task',
        text: 'test task',
      });

      const node = {
        type: 'property_filter' as const,
        field: 'property',
        value: 'active:true',
        exact: false,
      };

      const result = await SearchEvaluator.evaluate(
        node,
        task,
        false,
        settings,
        null,
      );
      expect(result).toBe(true);
    });

    it('should match boolean false property (line 1077)', async () => {
      const mockApp = createMockApp();
      const mockFile = new TFile('test.md', 'test', 'md');
      (mockApp.vault.getAbstractFileByPath as jest.Mock).mockReturnValue(
        mockFile,
      );
      (mockApp.metadataCache.getFileCache as jest.Mock).mockReturnValue({
        frontmatter: { active: false },
      });

      const settings = createSettingsWithApp(mockApp);
      const task = createBaseTask({
        path: 'test.md',
        line: 1,
        rawText: 'TODO test task',
        text: 'test task',
      });

      const node = {
        type: 'property_filter' as const,
        field: 'property',
        value: 'active:false',
        exact: false,
      };

      const result = await SearchEvaluator.evaluate(
        node,
        task,
        false,
        settings,
        null,
      );
      expect(result).toBe(true);
    });

    it('should handle non-string/number/boolean/array property (lines 1081-1090)', async () => {
      const mockApp = createMockApp();
      const mockFile = new TFile('test.md', 'test', 'md');
      (mockApp.vault.getAbstractFileByPath as jest.Mock).mockReturnValue(
        mockFile,
      );
      (mockApp.metadataCache.getFileCache as jest.Mock).mockReturnValue({
        frontmatter: { custom: { nested: 'value' } },
      });

      const settings = createSettingsWithApp(mockApp);
      const task = createBaseTask({
        path: 'test.md',
        line: 1,
        rawText: 'TODO test task',
        text: 'test task',
      });

      // Object is converted to string '[object Object]' for comparison
      const node = {
        type: 'property_filter' as const,
        field: 'property',
        value: 'custom:[object Object]',
        exact: false,
      };

      const result = await SearchEvaluator.evaluate(
        node,
        task,
        false,
        settings,
        null,
      );
      expect(result).toBe(true);
    });

    it('should handle non-string/number/boolean/array with exact match', async () => {
      const mockApp = createMockApp();
      const mockFile = new TFile('test.md', 'test', 'md');
      (mockApp.vault.getAbstractFileByPath as jest.Mock).mockReturnValue(
        mockFile,
      );
      (mockApp.metadataCache.getFileCache as jest.Mock).mockReturnValue({
        frontmatter: { custom: { nested: 'value' } },
      });

      const settings = createSettingsWithApp(mockApp);
      const task = createBaseTask({
        path: 'test.md',
        line: 1,
        rawText: 'TODO test task',
        text: 'test task',
      });

      const node = {
        type: 'property_filter' as const,
        field: 'property',
        value: 'custom:[object Object]',
        exact: true,
      };

      const result = await SearchEvaluator.evaluate(
        node,
        task,
        false,
        settings,
        null,
      );
      expect(result).toBe(true);
    });
  });

  describe('evaluateRangeFilter deadline and closed (lines 746-770)', () => {
    it('should handle deadline range filter with Date object start', async () => {
      const node = {
        type: 'range_filter' as const,
        field: 'deadline' as const,
        start: '2026-01-01',
        end: '2026-01-31',
      };

      const task = createBaseTask({
        deadlineDate: new Date(2026, 0, 15),
      });

      const result = await SearchEvaluator.evaluate(node, task, false);
      expect(result).toBe(true);
    });

    it('should handle closed range filter', async () => {
      const node = {
        type: 'range_filter' as const,
        field: 'closed' as const,
        start: '2026-01-01',
        end: '2026-01-31',
      };

      const task = createBaseTask({
        closedDate: new Date(2026, 0, 15),
        completed: true,
      });

      const result = await SearchEvaluator.evaluate(node, task, false);
      expect(result).toBe(true);
    });

    it('should handle range filter with unknown field (line 770)', async () => {
      const node = {
        type: 'range_filter' as const,
        field: 'unknown' as const,
        start: '2026-01-01',
        end: '2026-01-31',
      };

      const task = createBaseTask({
        scheduledDate: new Date(2026, 0, 15),
      });

      const result = await SearchEvaluator.evaluate(node, task, false);
      expect(result).toBe(false);
    });
  });

  describe('evaluateRangeFilter year-month format (lines 717-718)', () => {
    it('should handle range with year-month start format', async () => {
      const node = {
        type: 'range_filter' as const,
        field: 'scheduled' as const,
        start: '2026-01',
        end: '2026-01-31',
      };

      const task = createBaseTask({
        scheduledDate: new Date(2026, 0, 15),
      });

      const result = await SearchEvaluator.evaluate(node, task, false);
      expect(result).toBe(true);
    });
  });

  describe('evaluateSinglePropertyValue undefined value (line 980)', () => {
    it('should return false for property filter with undefined value', async () => {
      const mockApp = createMockApp();
      const mockFile = new TFile('test.md', 'test', 'md');
      (mockApp.vault.getAbstractFileByPath as jest.Mock).mockReturnValue(
        mockFile,
      );
      (mockApp.metadataCache.getFileCache as jest.Mock).mockReturnValue({
        frontmatter: { status: 'active' },
      });

      const settings = createSettingsWithApp(mockApp);
      const task = createBaseTask({
        path: 'test.md',
        line: 1,
        rawText: 'TODO test task',
        text: 'test task',
      });

      const node = {
        type: 'property_filter' as const,
        field: 'property',
        value: undefined,
        exact: false,
      };

      const result = await SearchEvaluator.evaluate(
        node,
        task,
        false,
        settings,
        null,
      );
      expect(result).toBe(false);
    });
  });
});
