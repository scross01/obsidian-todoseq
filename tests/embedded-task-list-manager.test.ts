import { EmbeddedTaskListManager } from '../src/view/embedded-task-list/task-list-manager';
import {
  createBaseSettings,
  createBaseTask,
  createTestKeywordManager,
} from './helpers/test-helper';
import { TodoseqParameters } from '../src/view/embedded-task-list/code-block-parser';

describe('EmbeddedTaskListManager', () => {
  let manager: EmbeddedTaskListManager;
  let settings = createBaseSettings();
  let keywordManager = createTestKeywordManager(settings);

  beforeEach(() => {
    settings = createBaseSettings();
    keywordManager = createTestKeywordManager(settings);
    manager = new EmbeddedTaskListManager(settings, keywordManager);
  });

  describe('generateCacheKey', () => {
    it('generates different keys for different search queries', () => {
      const tasks = [createBaseTask()];
      const params1: TodoseqParameters = { searchQuery: 'todo' };
      const params2: TodoseqParameters = { searchQuery: 'doing' };

      // Use reflection to access private method
      const key1 = (manager as any).generateCacheKey(tasks, params1);
      const key2 = (manager as any).generateCacheKey(tasks, params2);

      expect(key1).not.toBe(key2);
    });

    it('generates same key for identical inputs', () => {
      const tasks = [createBaseTask()];
      const params: TodoseqParameters = {};

      const key1 = (manager as any).generateCacheKey(tasks, params);
      const key2 = (manager as any).generateCacheKey(tasks, params);

      expect(key1).toBe(key2);
    });

    it('includes sort method in cache key', () => {
      const tasks = [createBaseTask()];
      const params1: TodoseqParameters = { sortMethod: 'default' };
      const params2: TodoseqParameters = { sortMethod: 'priority' };

      const key1 = (manager as any).generateCacheKey(tasks, params1);
      const key2 = (manager as any).generateCacheKey(tasks, params2);

      expect(key1).not.toBe(key2);
    });
  });

  describe('hashString', () => {
    it('returns consistent hash for same string', () => {
      const hash1 = (manager as any).hashString('test');
      const hash2 = (manager as any).hashString('test');

      expect(hash1).toBe(hash2);
    });

    it('returns different hashes for different strings', () => {
      const hash1 = (manager as any).hashString('abc');
      const hash2 = (manager as any).hashString('def');

      expect(hash1).not.toBe(hash2);
    });
  });

  describe('getSortMethod', () => {
    it('maps default to default', () => {
      const result = (manager as any).getSortMethod({ sortMethod: 'default' });
      expect(result).toBe('default');
    });

    it('maps priority to sortByPriority', () => {
      const result = (manager as any).getSortMethod({ sortMethod: 'priority' });
      expect(result).toBe('sortByPriority');
    });

    it('maps urgency to sortByUrgency', () => {
      const result = (manager as any).getSortMethod({ sortMethod: 'urgency' });
      expect(result).toBe('sortByUrgency');
    });

    it('maps scheduled to sortByScheduled', () => {
      const result = (manager as any).getSortMethod({
        sortMethod: 'scheduled',
      });
      expect(result).toBe('sortByScheduled');
    });

    it('maps deadline to sortByDeadline', () => {
      const result = (manager as any).getSortMethod({ sortMethod: 'deadline' });
      expect(result).toBe('sortByDeadline');
    });

    it('maps closed to sortByClosedDate', () => {
      const result = (manager as any).getSortMethod({ sortMethod: 'closed' });
      expect(result).toBe('sortByClosedDate');
    });

    it('maps keyword to sortByKeyword', () => {
      const result = (manager as any).getSortMethod({ sortMethod: 'keyword' });
      expect(result).toBe('sortByKeyword');
    });

    it('falls back to default for unknown sort methods', () => {
      const result = (manager as any).getSortMethod({ sortMethod: 'unknown' });
      expect(result).toBe('default');
    });
  });

  describe('filterAndSortTasksWithCount', () => {
    it('returns all tasks when no search query is provided', async () => {
      const tasks = [
        createBaseTask({ path: 'a.md', state: 'TODO' }),
        createBaseTask({ path: 'b.md', state: 'DONE', completed: true }),
      ];
      const params: TodoseqParameters = {};

      const result = await manager.filterAndSortTasksWithCount(tasks, params);

      expect(result.tasks.length).toBe(2);
      expect(result.totalCount).toBe(2);
    });

    it('applies limit correctly', async () => {
      const tasks = Array.from({ length: 10 }, (_, i) =>
        createBaseTask({ path: `task${i}.md`, line: i }),
      );
      const params: TodoseqParameters = { limit: 3 };

      const result = await manager.filterAndSortTasksWithCount(tasks, params);

      expect(result.tasks.length).toBe(3);
      expect(result.totalCount).toBe(10);
    });

    it('handles empty task array', async () => {
      const params: TodoseqParameters = {};

      const result = await manager.filterAndSortTasksWithCount([], params);

      expect(result.tasks.length).toBe(0);
      expect(result.totalCount).toBe(0);
    });
  });

  describe('cache invalidation', () => {
    it('clearCache removes all cached entries', async () => {
      const tasks = [createBaseTask()];
      const params: TodoseqParameters = {};

      await manager.filterAndSortTasksWithCount(tasks, params);
      manager.clearCache();

      // After clearing, the internal cache should be empty
      const cache = (manager as any).taskCache;
      expect(cache.size).toBe(0);
    });

    it('invalidateCache increments version and clears entries', () => {
      const initialVersion = (manager as any).cacheVersion;

      manager.invalidateCache();

      expect((manager as any).cacheVersion).toBe(initialVersion + 1);
      expect((manager as any).taskCache.size).toBe(0);
    });

    it('invalidateCacheForFile increments version', () => {
      const initialVersion = (manager as any).cacheVersion;

      manager.invalidateCacheForFile('test.md');

      expect((manager as any).cacheVersion).toBe(initialVersion + 1);
    });
  });

  describe('updateSettings', () => {
    it('updates settings and clears cache', () => {
      const newSettings = createBaseSettings({ weekStartsOn: 'Sunday' });

      manager.updateSettings(newSettings);

      expect((manager as any).settings.weekStartsOn).toBe('Sunday');
      expect((manager as any).taskCache.size).toBe(0);
      expect((manager as any).cachedKeywordConfig).toBeNull();
    });
  });
});
