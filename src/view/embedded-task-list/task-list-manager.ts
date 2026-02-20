import { Task } from '../../types/task';
import { Search } from '../../search/search';
import { TodoTrackerSettings } from '../../settings/settings';
import {
  sortTasksWithThreeBlockSystem,
  SortMethod as TaskSortMethod,
  buildKeywordSortConfig,
  KeywordSortConfig,
} from '../../utils/task-sort';
import { TodoseqParameters, TodoseqCodeBlockParser } from './code-block-parser';

/**
 * Manages task filtering and sorting for embedded task lists.
 * Reuses existing Search and task-sort utilities for maximum consistency.
 */
export class EmbeddedTaskListManager {
  private settings: TodoTrackerSettings;
  private taskCache: Map<string, { tasks: Task[]; timestamp: number }> =
    new Map();
  private cacheTTL = 5000; // 5 seconds cache TTL
  private cacheVersion = 0; // Version number to invalidate cache on task changes

  // Keyword sort config caching
  private cachedKeywordConfig: KeywordSortConfig | null = null;
  private cachedKeywords: string | null = null;

  constructor(settings: TodoTrackerSettings) {
    this.settings = settings;
  }

  /**
   * Filter and sort tasks based on code block parameters
   * @param tasks All tasks from the vault
   * @param params Parsed code block parameters
   * @returns Filtered and sorted tasks
   */
  async filterAndSortTasks(
    tasks: Task[],
    params: TodoseqParameters,
  ): Promise<Task[]> {
    // Generate cache key
    const cacheKey = this.generateCacheKey(tasks, params);

    // Check cache
    const cached = this.taskCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return cached.tasks;
    }

    try {
      // Filter tasks based on search query
      let filteredTasks = tasks;

      if (params.searchQuery) {
        filteredTasks = await this.filterTasks(tasks, params.searchQuery);
      }

      // Sort tasks based on sort method
      let sortedTasks = this.sortTasks(filteredTasks, params);

      // Apply limit if specified
      if (params.limit && params.limit > 0) {
        sortedTasks = sortedTasks.slice(0, params.limit);
      }

      // Cache the result
      this.taskCache.set(cacheKey, {
        tasks: sortedTasks,
        timestamp: Date.now(),
      });

      return sortedTasks;
    } catch (error) {
      console.error('Error filtering/sorting tasks:', error);
      // Return unfiltered tasks as fallback
      return tasks;
    }
  }

  /**
   * Get the total number of tasks that match the search query (before applying limit)
   * @param tasks All tasks from the vault
   * @param params Parsed code block parameters
   * @returns Total number of matching tasks
   */
  async getTotalTasksCount(
    tasks: Task[],
    params: TodoseqParameters,
  ): Promise<number> {
    try {
      // Filter tasks based on search query
      let filteredTasks = tasks;

      if (params.searchQuery) {
        filteredTasks = await this.filterTasks(tasks, params.searchQuery);
      }

      // Sort tasks based on sort method (needed for consistent filtering)
      const sortedTasks = this.sortTasks(filteredTasks, params);

      return sortedTasks.length;
    } catch (error) {
      console.error('Error counting tasks:', error);
      return tasks.length;
    }
  }

  /**
   * Filter and sort tasks with total count in a single operation.
   * More efficient than calling filterAndSortTasks and getTotalTasksCount separately.
   * @param tasks All tasks from the vault
   * @param params Parsed code block parameters
   * @returns Object containing filtered/sorted tasks and total count before limit
   */
  async filterAndSortTasksWithCount(
    tasks: Task[],
    params: TodoseqParameters,
  ): Promise<{ tasks: Task[]; totalCount: number }> {
    try {
      // Filter tasks based on search query
      let filteredTasks = tasks;

      if (params.searchQuery) {
        filteredTasks = await this.filterTasks(tasks, params.searchQuery);
      }

      const totalCount = filteredTasks.length;

      // Sort tasks
      let sortedTasks = this.sortTasks(filteredTasks, params);

      // Apply limit if specified
      if (params.limit && params.limit > 0) {
        sortedTasks = sortedTasks.slice(0, params.limit);
      }

      return { tasks: sortedTasks, totalCount };
    } catch (error) {
      console.error('Error filtering/sorting tasks:', error);
      return { tasks, totalCount: tasks.length };
    }
  }

  /**
   * Filter tasks using the existing Search class
   * @param tasks Tasks to filter
   * @param searchQuery Search query string
   * @returns Filtered tasks
   */
  private async filterTasks(
    tasks: Task[],
    searchQuery: string,
  ): Promise<Task[]> {
    try {
      // Use the existing Search class for consistent filtering
      const results = await Promise.all(
        tasks.map(async (task) => {
          const matches = await Search.evaluate(
            searchQuery,
            task,
            false,
            this.settings,
          );
          return { task, matches };
        }),
      );

      // Filter based on results
      return results
        .filter((result) => result.matches)
        .map((result) => result.task);
    } catch (error) {
      console.error('Error evaluating search query:', error);
      // Return all tasks if search fails
      return tasks;
    }
  }

  /**
   * Sort tasks using the existing task-sort utilities
   * @param tasks Tasks to sort
   * @param params Parsed parameters
   * @returns Sorted tasks
   */
  private sortTasks(tasks: Task[], params: TodoseqParameters): Task[] {
    try {
      const now = new Date();
      const sortMethod = this.getSortMethod(params);

      // Use code block specific settings if provided, otherwise fall back to global settings
      const futureSetting =
        params.future !== undefined
          ? TodoseqCodeBlockParser.getFutureSetting(params.future)
          : this.settings?.futureTaskSorting || 'showAll';

      const completedSetting =
        params.completed !== undefined
          ? TodoseqCodeBlockParser.getCompletedSetting(params.completed)
          : 'showAll'; // Default embedded lists to show all unless overridden

      // Build keyword config if sorting by keyword
      let keywordConfig: KeywordSortConfig | undefined;
      if (sortMethod === 'sortByKeyword') {
        keywordConfig = this.getKeywordSortConfig();
      }

      // Use the existing three-block sorting system
      const sorted = sortTasksWithThreeBlockSystem(
        tasks,
        now,
        futureSetting,
        completedSetting,
        sortMethod,
        keywordConfig,
      );

      return sorted;
    } catch (error) {
      console.error('Error sorting tasks:', error);
      // Return unsorted tasks as fallback
      return tasks;
    }
  }

  /**
   * Get cached keyword sort config, rebuilding only when keywords change
   */
  private getKeywordSortConfig(): KeywordSortConfig {
    const keywordGroups = {
      activeKeywords: this.settings?.additionalActiveKeywords ?? [],
      inactiveKeywords: this.settings?.additionalTaskKeywords ?? [],
      waitingKeywords: this.settings?.additionalWaitingKeywords ?? [],
      completedKeywords: this.settings?.additionalCompletedKeywords ?? [],
    };

    const keywords = Object.values(keywordGroups).flat().join(',');
    if (!this.cachedKeywordConfig || this.cachedKeywords !== keywords) {
      this.cachedKeywords = keywords;
      this.cachedKeywordConfig = buildKeywordSortConfig(keywordGroups);
    }

    return this.cachedKeywordConfig;
  }

  /**
   * Get the sort method for task-sort utilities
   * @param params Parsed parameters
   * @returns Sort method compatible with task-sort utilities
   */
  private getSortMethod(params: TodoseqParameters): TaskSortMethod {
    const sortMap: Record<string, TaskSortMethod> = {
      default: 'default',
      filepath: 'default',
      scheduled: 'sortByScheduled',
      deadline: 'sortByDeadline',
      priority: 'sortByPriority',
      urgency: 'sortByUrgency',
      keyword: 'sortByKeyword',
    };

    const result = sortMap[params.sortMethod] || 'default';

    return result;
  }

  /**
   * Generate a cache key for the current task set and parameters
   * @param tasks Tasks to cache
   * @param params Parameters used for filtering/sorting
   * @returns Cache key string
   */
  private generateCacheKey(tasks: Task[], params: TodoseqParameters): string {
    // Use cache version and task count for cache key
    // This ensures cache is invalidated when tasks change
    const taskCount = tasks.length;
    const searchHash = params.searchQuery
      ? this.hashString(params.searchQuery)
      : 'none';
    const sortHash = params.sortMethod;
    const completedHash = params.completed || 'default';
    const futureHash = params.future || 'default';
    const limitHash = params.limit || 'none';

    return `${this.cacheVersion}-${taskCount}-${searchHash}-${sortHash}-${completedHash}-${futureHash}-${limitHash}`;
  }

  /**
   * Simple string hash for cache keys
   * @param str String to hash
   * @returns Hash string
   */
  private hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString(36);
  }

  /**
   * Clear the task cache
   */
  clearCache(): void {
    this.taskCache.clear();
  }

  /**
   * Invalidate the cache by incrementing the version number
   * This should be called when tasks are updated or removed
   */
  invalidateCache(): void {
    this.cacheVersion++;
    this.taskCache.clear();
  }

  /**
   * Invalidate cache for specific file path
   * @param filePath Path of the file that changed
   */
  invalidateCacheForFile(filePath: string): void {
    // Increment version and clear cache when any file changes
    this.invalidateCache();
  }

  /**
   * Update settings
   * @param settings New settings
   */
  updateSettings(settings: TodoTrackerSettings): void {
    this.settings = settings;
    this.clearCache();
    this.cachedKeywordConfig = null; // Invalidate keyword config cache
    this.cachedKeywords = null;
  }
}
