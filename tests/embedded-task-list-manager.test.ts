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

    it('generates different keys for different warning period overrides', () => {
      const tasks = [createBaseTask()];
      const params1: TodoseqParameters = {
        deadlineWarningPeriod: 3,
      };
      const params2: TodoseqParameters = {
        deadlineWarningPeriod: 7,
      };

      const key1 = (manager as any).generateCacheKey(tasks, params1);
      const key2 = (manager as any).generateCacheKey(tasks, params2);

      expect(key1).not.toBe(key2);
    });

    it('generates different keys when one has warning override and other uses global', () => {
      const tasks = [createBaseTask()];
      const paramsGlobal: TodoseqParameters = {};
      const paramsOverride: TodoseqParameters = {
        scheduledWarningPeriod: 5,
        upcomingPeriod: 14,
      };

      const key1 = (manager as any).generateCacheKey(tasks, paramsGlobal);
      const key2 = (manager as any).generateCacheKey(tasks, paramsOverride);

      expect(key1).not.toBe(key2);
    });

    it('generates different keys for different skip flags', () => {
      const tasks = [createBaseTask()];
      const params1: TodoseqParameters = {
        skipScheduledWarningIfDeadline: true,
      };
      const params2: TodoseqParameters = {
        skipScheduledWarningIfDeadline: false,
      };

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

    describe('invalidateCacheForFile', () => {
      // Seed the cache with two distinct entries — one whose filtered tasks
      // reference 'note-a.md' and one whose filtered tasks reference 'note-b.md'.
      // filterAndSortTasks (not WithCount) is what populates taskCache.
      async function seedCacheWithEntriesFromTwoFiles() {
        const taskA = createBaseTask({ path: 'note-a.md' });
        const taskB = createBaseTask({ path: 'note-b.md' });

        await manager.filterAndSortTasks([taskA], { searchQuery: 'a' });
        await manager.filterAndSortTasks([taskB], { searchQuery: 'b' });

        // Sanity: two distinct keys have been populated
        const cache = (manager as any).taskCache as Map<string, unknown>;
        expect(cache.size).toBe(2);
      }

      it('does not bump cacheVersion', () => {
        const initialVersion = (manager as any).cacheVersion;

        manager.invalidateCacheForFile('note-a.md');

        expect((manager as any).cacheVersion).toBe(initialVersion);
      });

      it('removes only entries whose cached tasks reference the changed file', async () => {
        await seedCacheWithEntriesFromTwoFiles();

        manager.invalidateCacheForFile('note-a.md');

        const cache = (manager as any).taskCache as Map<
          string,
          { tasks: { path: string }[] }
        >;
        expect(cache.size).toBe(1);
        const remaining = Array.from(cache.values()).flatMap((e) => e.tasks);
        expect(remaining.every((t) => t.path !== 'note-a.md')).toBe(true);
      });

      it('leaves cache untouched when no entries reference the file', async () => {
        await seedCacheWithEntriesFromTwoFiles();

        manager.invalidateCacheForFile('note-does-not-exist.md');

        const cache = (manager as any).taskCache as Map<string, unknown>;
        expect(cache.size).toBe(2);
      });
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

  describe('warning period code block overrides', () => {
    it('uses code block upcoming-period over global setting', async () => {
      // Create a task scheduled 5 days from now — upcoming with period=7, future with period=3
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 5);
      const futureDateStr = `${futureDate.getFullYear()}-${String(futureDate.getMonth() + 1).padStart(2, '0')}-${String(futureDate.getDate()).padStart(2, '0')}`;

      const task = createBaseTask({
        scheduledDate: futureDateStr,
        completed: false,
      });

      // With global upcomingPeriod=7 and future=show-upcoming, task should be included
      const paramsGlobal: TodoseqParameters = {
        future: 'show-upcoming',
      };
      const resultGlobal = await manager.filterAndSortTasksWithCount(
        [task],
        paramsGlobal,
      );
      expect(resultGlobal.tasks.length).toBe(1);

      // With code block upcomingPeriod=3 and future=show-upcoming, task should be excluded
      const paramsOverride: TodoseqParameters = {
        future: 'show-upcoming',
        upcomingPeriod: 3,
      };
      const resultOverride = await manager.filterAndSortTasksWithCount(
        [task],
        paramsOverride,
      );
      expect(resultOverride.tasks.length).toBe(0);
    });

    it('falls back to global settings when code block params not specified', async () => {
      const task = createBaseTask({
        scheduledDate: '2025-01-01',
        completed: false,
      });

      // No code block overrides — should use global settings
      const params: TodoseqParameters = {};
      const result = await manager.filterAndSortTasksWithCount([task], params);
      expect(result.tasks.length).toBe(1);
    });

    it('correctly overrides global deadlineWarningPeriod with 0', async () => {
      // Set global default to non-zero
      settings = createBaseSettings({
        defaultDeadlineWarningPeriod: 5,
      });
      keywordManager = createTestKeywordManager(settings);
      manager = new EmbeddedTaskListManager(settings, keywordManager);

      // Create a task whose deadline is 5 days away (use Date object to avoid timezone issues)
      // With advance notice=5, effective date = today → current
      // With advance notice=0, effective date = 5 days from now → future
      const deadlineDate = new Date();
      deadlineDate.setHours(0, 0, 0, 0);
      deadlineDate.setDate(deadlineDate.getDate() + 5);

      const task = createBaseTask({
        deadlineDate,
        completed: false,
      });

      // Same upcomingPeriod for both cases — only deadlineWarningPeriod differs
      const upcomingPeriod = 3;

      // With global default=5, effective date is today (current) → visible
      const paramsGlobal: TodoseqParameters = {
        future: 'show-upcoming',
        upcomingPeriod,
      };
      const resultGlobal = await manager.filterAndSortTasksWithCount(
        [task],
        paramsGlobal,
      );
      expect(resultGlobal.tasks.length).toBe(1);

      // With explicit override=0, effective date is 5 days from now (future, beyond 3-day window) → hidden
      const paramsOverride: TodoseqParameters = {
        future: 'show-upcoming',
        upcomingPeriod,
        deadlineWarningPeriod: 0,
      };
      const resultOverride = await manager.filterAndSortTasksWithCount(
        [task],
        paramsOverride,
      );
      expect(resultOverride.tasks.length).toBe(0);
    });

    it('correctly overrides global scheduledWarningPeriod with 0', async () => {
      // Set global default to non-zero
      // With delay=10 and scheduled 5 days ago: effective date = 5 days from now (future)
      // With delay=0: effective date = 5 days ago (current)
      settings = createBaseSettings({
        defaultScheduledWarningPeriod: 10,
      });
      keywordManager = createTestKeywordManager(settings);
      manager = new EmbeddedTaskListManager(settings, keywordManager);

      const scheduledDate = new Date();
      scheduledDate.setHours(0, 0, 0, 0);
      scheduledDate.setDate(scheduledDate.getDate() - 5);

      const task = createBaseTask({
        scheduledDate,
        completed: false,
      });

      // Use show-upcoming with small window to isolate the scheduled delay behavior
      const upcomingPeriod = 3;

      // With global default=10, effective date = 5 days from now (beyond 3-day window) → hidden
      const paramsGlobal: TodoseqParameters = {
        future: 'show-upcoming',
        upcomingPeriod,
      };
      const resultGlobal = await manager.filterAndSortTasksWithCount(
        [task],
        paramsGlobal,
      );
      expect(resultGlobal.tasks.length).toBe(0);

      // With explicit override=0, effective date = 5 days ago (current) → visible
      const paramsOverride: TodoseqParameters = {
        future: 'show-upcoming',
        upcomingPeriod,
        scheduledWarningPeriod: 0,
      };
      const resultOverride = await manager.filterAndSortTasksWithCount(
        [task],
        paramsOverride,
      );
      expect(resultOverride.tasks.length).toBe(1);
    });

    it('correctly overrides global skip flag with false', async () => {
      // Set global skip to true, with scheduled delay
      settings = createBaseSettings({
        skipScheduledWarningPeriodIfDeadline: true,
        defaultScheduledWarningPeriod: 10,
      });
      keywordManager = createTestKeywordManager(settings);
      manager = new EmbeddedTaskListManager(settings, keywordManager);

      // Create a task with both scheduled (5 days ago) and deadline (far future)
      // With delay=10: effective date = 5 days from now (future)
      // With skip=true: delay ignored → effective date = 5 days ago (current)
      const scheduledDate = new Date();
      scheduledDate.setHours(0, 0, 0, 0);
      scheduledDate.setDate(scheduledDate.getDate() - 5);

      const task = createBaseTask({
        scheduledDate,
        deadlineDate: new Date(2099, 11, 31),
        completed: false,
      });

      // Use show-upcoming with small window to isolate the skip behavior
      const upcomingPeriod = 3;

      // With global skip=true, scheduled delay ignored → effective date 5 days ago (current) → visible
      const paramsGlobal: TodoseqParameters = {
        future: 'show-upcoming',
        upcomingPeriod,
      };
      const resultGlobal = await manager.filterAndSortTasksWithCount(
        [task],
        paramsGlobal,
      );
      expect(resultGlobal.tasks.length).toBe(1);

      // With explicit override skip=false, delay=10 applies → effective date 5 days from now (beyond 3-day window) → hidden
      const paramsOverride: TodoseqParameters = {
        future: 'show-upcoming',
        upcomingPeriod,
        skipScheduledWarningIfDeadline: false,
      };
      const resultOverride = await manager.filterAndSortTasksWithCount(
        [task],
        paramsOverride,
      );
      expect(resultOverride.tasks.length).toBe(0);
    });
  });
});
