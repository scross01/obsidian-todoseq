import { App, TFile } from 'obsidian';
import { DateUtils } from '../utils/date-utils';
import { PropertyEvaluator } from '../utils/property-evaluator';
import { TaskStateManager } from './task-state-manager';
import type { PropertyQueryDescriptor } from '../search/search-types';

// Minimal interface for the vault scanner status this engine polls during init
export interface IVaultScannerStatusProvider {
  isScanning: () => boolean;
  isObsidianInitializing: () => boolean;
}

// Interface for dependencies needed by PropertySearchEngine
export interface PropertySearchEngineDependencies {
  taskStateManager: TaskStateManager;
  refreshAllTaskListViews: () => void;
  vaultScanner?: IVaultScannerStatusProvider;
}

export class PropertySearchEngine {
  private propertyCache = new Map<string, Map<unknown, Set<string>>>();
  /** Key presence, kept separately so null, empty arrays and empty strings exist. */
  private propertyExistence = new Map<string, Set<string>>();
  private propertyKeys = new Set<string>();
  private isInitialized = false;
  private startupScanEnabled = true;
  private pendingUpdates = new Set<string>();
  /**
   * A full pass (initialisation or rebuild) owns the property cache.
   *
   * This replaces one `isUpdating` boolean that three entry points set and five
   * places cleared. Carrying "a pass is running", "an incremental batch is
   * pending" and "a rebuild may be dropped" in a single flag meant whichever
   * path finished first decided for the others: the debounced incremental pass
   * cleared the claim of a rebuild still filling the cache, and rebuildAll saw
   * the same flag set and returned on the promise that pending updates would
   * cover it — which they never do, because they only touch changed files.
   *
   * Incremental passes defer to a full pass instead of racing it; a rebuild that
   * arrives mid-pass is kept in `rebuildPending` and run by that pass's tail.
   */
  private fullPassActive = false;
  /** A rebuild was asked for during a pass; run it when that pass ends. */
  private rebuildPending = false;
  private initializationPromise: Promise<void> | null = null; // Track if initialization is already queued

  // Track pending update timeout for cleanup
  private pendingUpdateTimeout: number | null = null;
  /** Set by destroy(); a disposed engine publishes no view notifications. */
  private isDestroyed = false;
  private readonly PENDING_UPDATE_DEBOUNCE_MS = 100;

  // Dependencies
  private taskStateManager: TaskStateManager;
  private refreshAllTaskListViews: () => void;
  private vaultScanner?: IVaultScannerStatusProvider;

  constructor(
    private app: App,
    dependencies: PropertySearchEngineDependencies,
  ) {
    this.taskStateManager = dependencies.taskStateManager;
    this.refreshAllTaskListViews = dependencies.refreshAllTaskListViews;
    this.vaultScanner = dependencies.vaultScanner;
  }

  // Initialize on first use
  async initialize(): Promise<void> {
    // Guard to prevent multiple concurrent initialization calls
    if (this.isInitialized) {
      return;
    }

    if (this.initializationPromise) {
      // If initialization is already in progress/queued, wait for it to complete
      await this.initializationPromise;
      return;
    }

    // Queue initialization
    this.initializationPromise = this.doInitialize();
    await this.initializationPromise;
  }

  // Internal initialization method
  private async doInitialize(): Promise<void> {
    // Wait for vault scan to complete if it's in progress
    await this.waitForVaultScan();

    this.fullPassActive = true;

    try {
      // Event listeners are now handled by EventCoordinator
      // PropertySearchEngine receives file change events via EventCoordinator calls

      // Initialize property cache in a single pass (O(N) instead of O(N*M))
      await this.initializePropertyCacheSinglePass();

      this.isInitialized = true;

      // Refresh all visible task list views after initialization completes
      // Delay to prevent recursion
      window.setTimeout(() => {
        this.refreshVisibleTaskListViews();
      }, 0);
    } catch (error) {
      console.error(
        'TODOseq: PropertySearchEngine initialization failed:',
        error,
      );
    } finally {
      this.fullPassActive = false;
      this.initializationPromise = null;
      await this.settleAfterPass();
    }
  }

  /**
   * The tail every full pass shares.
   *
   * Incremental passes that arrived mid-pass are waiting on us, and a rebuild
   * asked for during the pass has not been run — the incremental path can only
   * touch changed files, so honouring it here is the only way it gets done.
   */
  private async settleAfterPass(): Promise<void> {
    if (this.pendingUpdates.size > 0) {
      this.processPendingUpdates();
    }
    if (this.rebuildPending) {
      this.rebuildPending = false;
      await this.rebuildAll();
    }
  }

  // Wait for vault scan to complete if it's in progress
  private async waitForVaultScan(): Promise<void> {
    // Check if we have access to the vault scanner
    try {
      if (this.vaultScanner) {
        // Wait for vault scan to complete if it's in progress
        while (
          this.vaultScanner.isScanning() ||
          this.vaultScanner.isObsidianInitializing()
        ) {
          await new Promise((resolve) => window.setTimeout(resolve, 50));
        }
      }
    } catch (error) {
      // If we can't check vault scan status, continue with initialization
      console.error('TODOseq: Failed to check vault scan status:', error);
    }
  }

  // Refresh all visible task list views
  private refreshVisibleTaskListViews(): void {
    try {
      this.refreshAllTaskListViews();
    } catch (error) {
      console.error('TODOseq: Failed to refresh task list views:', error);
    }
  }

  // Initialize property cache in a single pass through all task files
  // This replaces the two-pass approach (scanAllPropertyKeys + buildCacheInBatches)
  // with a more efficient O(N) single pass
  private async initializePropertyCacheSinglePass(): Promise<void> {
    // Get files with tasks from TaskStateManager
    try {
      const tasks = this.taskStateManager.getTasks();
      const taskFiles = new Set<string>();

      // Collect all unique file paths from tasks
      tasks.forEach((task) => {
        taskFiles.add(task.path);
      });

      // Only scan files that contain tasks if we found any tasks
      if (taskFiles.size > 0) {
        const taskFilesArray = Array.from(taskFiles);
        const batchSize = 100; // Process 100 files per batch

        for (let i = 0; i < taskFilesArray.length; i += batchSize) {
          const batch = taskFilesArray.slice(i, i + batchSize);

          for (const filePath of batch) {
            const file = this.app.vault.getAbstractFileByPath(filePath);
            // Check if it's a markdown file - type narrow from TAbstractFile to TFile
            const tfile = file instanceof TFile ? file : undefined;
            const isMarkdownFile = tfile && tfile.extension === 'md';

            if (isMarkdownFile && tfile) {
              const cache = this.app.metadataCache.getFileCache(tfile);
              if (cache?.frontmatter) {
                this.registerFileProperties(filePath, cache.frontmatter);
              }
            }
          }

          // Yield to event loop to keep UI responsive
          await new Promise((resolve) => window.setTimeout(resolve, 0));
        }

        return;
      } else {
        return; // Skip initialization if no tasks found
      }
    } catch (error) {
      console.error('TODOseq: Failed to initialize property cache:', error);
    }
  }

  /**
   * Match a structured property filter. Shared by the indexed and fallback
   * paths so partial values, case-insensitive keys, presence, null and an
   * exact empty string cannot diverge.
   */
  async searchProperty(
    filter: PropertyQueryDescriptor,
    caseSensitive = false,
  ): Promise<Set<string>> {
    await this.initialize();
    if (!filter.key) return new Set();

    // A quoted key is exact regardless of the global match-case setting.
    const keyCaseSensitive =
      filter.keyExact || filter.exact ? true : caseSensitive;
    const { maps, existence } = this.getEntriesForKey(
      filter.key,
      keyCaseSensitive,
    );

    if (filter.kind === 'existence') {
      return new Set(existence);
    }

    if (filter.kind === 'null') {
      const files = new Set<string>();
      for (const map of maps) {
        map.get(null)?.forEach((filePath) => files.add(filePath));
      }
      return files;
    }

    let text = filter.value.trim();
    if (text.startsWith('(') && text.endsWith(')')) {
      text = text.slice(1, -1).trim();
    }

    if (text.includes(' OR ')) {
      const files = new Set<string>();
      for (const part of text.split(' OR ')) {
        const trimmed = part.trim();
        if (!trimmed) continue;
        const result = await this.searchProperty(
          { ...filter, value: trimmed },
          caseSensitive,
        );
        result.forEach((filePath) => files.add(filePath));
      }
      return files;
    }

    const special = this.searchSingleValue(
      maps,
      text,
      caseSensitive,
      filter.exact,
    );
    if (special.size > 0 || filter.exact) {
      return special;
    }
    return this.findValueInCache(maps, text, caseSensitive, false);
  }

  /** Union value maps and presence sets for every matching key spelling. */
  private getEntriesForKey(
    key: string,
    caseSensitive: boolean,
  ): {
    maps: Map<unknown, Set<string>>[];
    existence: Set<string>;
  } {
    const maps: Map<unknown, Set<string>>[] = [];
    const existence = new Set<string>();
    const lowerKey = key.toLowerCase();

    this.propertyCache.forEach((valueMap, cacheKey) => {
      if (
        caseSensitive ? cacheKey === key : cacheKey.toLowerCase() === lowerKey
      ) {
        maps.push(valueMap);
        this.propertyExistence
          .get(cacheKey)
          ?.forEach((filePath) => existence.add(filePath));
      }
    });

    return { maps, existence };
  }

  // Search for files matching a legacy string property query
  async searchProperties(
    query: string,
    caseSensitive = false,
  ): Promise<Set<string>> {
    await this.initialize();
    if (!query.startsWith('[') || !query.endsWith(']')) {
      return new Set();
    }

    const content = query.slice(1, -1);
    const colonIndex = content.indexOf(':');
    if (colonIndex === -1) {
      return this.searchProperty(
        {
          key: content.trim(),
          kind: 'existence',
          value: '',
          exact: false,
          keyExact: false,
        },
        caseSensitive,
      );
    }

    const key = content.slice(0, colonIndex).trim();
    let value = content.slice(colonIndex + 1).trim();
    if (value === 'null') {
      return this.searchProperty(
        { key, kind: 'null', value: 'null', exact: false, keyExact: false },
        caseSensitive,
      );
    }

    let exact = false;
    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1);
      exact = true;
    }

    return this.searchProperty(
      { key, kind: 'string', value, exact, keyExact: false },
      caseSensitive,
    );
  }

  // Search for a single property value (comparison/date/boolean aware)
  private searchSingleValue(
    maps: Map<unknown, Set<string>>[],
    value: string,
    caseSensitive: boolean,
    exact: boolean,
  ): Set<string> {
    if (!exact) {
      const comparisonMatch = value.match(/^([><]=?)(.+)$/);
      if (comparisonMatch) {
        const operator = comparisonMatch[1];
        const compareValueStr = comparisonMatch[2];
        const compareDate =
          PropertyEvaluator.parseDateForComparison(compareValueStr);

        if (compareDate) {
          const matchingFiles = new Set<string>();
          for (const cache of maps) {
            cache.forEach((fileSet, propValue) => {
              const taskDate =
                PropertyEvaluator.parsePropertyValueAsDate(propValue);
              if (
                taskDate &&
                PropertyEvaluator.evaluateDateComparison(
                  taskDate,
                  operator,
                  compareDate,
                )
              ) {
                fileSet.forEach((filePath) => matchingFiles.add(filePath));
              }
            });
          }
          return matchingFiles;
        }

        const compareValue = Number(compareValueStr);
        if (!isNaN(compareValue)) {
          const matchingFiles = new Set<string>();
          for (const cache of maps) {
            cache.forEach((fileSet, propValue) => {
              if (typeof propValue !== 'number') return;
              let matches = false;
              switch (operator) {
                case '>':
                  matches = propValue > compareValue;
                  break;
                case '>=':
                  matches = propValue >= compareValue;
                  break;
                case '<':
                  matches = propValue < compareValue;
                  break;
                case '<=':
                  matches = propValue <= compareValue;
                  break;
              }
              if (matches) {
                fileSet.forEach((filePath) => matchingFiles.add(filePath));
              }
            });
          }
          return matchingFiles;
        }
      }

      const parsedDate = DateUtils.parseDateValue(value);
      if (parsedDate) {
        const matchingFiles = new Set<string>();
        for (const cache of maps) {
          cache.forEach((fileSet, propValue) => {
            const taskDate =
              PropertyEvaluator.parsePropertyValueAsDate(propValue);
            if (
              taskDate &&
              PropertyEvaluator.compareDate(taskDate, parsedDate)
            ) {
              fileSet.forEach((filePath) => matchingFiles.add(filePath));
            }
          });
        }
        if (matchingFiles.size > 0) return matchingFiles;
      }
    }

    return this.findValueInCache(maps, value, caseSensitive, exact);
  }

  /**
   * Match a distinct cached value as a partial string, or exactly when the
   * query was quoted. Non-string scalars stay typed (1 does not match 12).
   */
  private findValueInCache(
    maps: Map<unknown, Set<string>>[],
    searchValue: string,
    caseSensitive: boolean,
    exact: boolean,
  ): Set<string> {
    const results = new Set<string>();
    const search = caseSensitive ? searchValue : searchValue.toLowerCase();
    const numeric = Number(searchValue);
    const lowerSearch = searchValue.toLowerCase();

    for (const cache of maps) {
      cache.forEach((fileSet, cacheKey) => {
        let matches = false;

        if (typeof cacheKey === 'string') {
          if (exact) {
            matches = cacheKey === searchValue;
          } else {
            const candidate = caseSensitive ? cacheKey : cacheKey.toLowerCase();
            matches = candidate.includes(search);
          }
        } else if (typeof cacheKey === 'number') {
          matches = !isNaN(numeric) && cacheKey === numeric;
        } else if (typeof cacheKey === 'boolean') {
          matches = String(cacheKey) === lowerSearch;
        } else if (cacheKey instanceof Date) {
          matches = exact && cacheKey.toISOString() === searchValue;
        }

        if (matches) {
          fileSet.forEach((filePath) => results.add(filePath));
        }
      });
    }

    return results;
  }

  /** Register one file's frontmatter values and key presence. */
  private registerFileProperties(
    filePath: string,
    frontmatter: Record<string, unknown>,
  ): void {
    Object.entries(frontmatter).forEach(([key, value]) => {
      this.propertyKeys.add(key);

      let valueMap = this.propertyCache.get(key);
      if (!valueMap) {
        valueMap = new Map<unknown, Set<string>>();
        this.propertyCache.set(key, valueMap);
      }

      let existence = this.propertyExistence.get(key);
      if (!existence) {
        existence = new Set<string>();
        this.propertyExistence.set(key, existence);
      }
      existence.add(filePath);

      const values = Array.isArray(value) ? value : [value];
      for (const item of values) {
        if (item === undefined) continue;
        const existingSet = valueMap.get(item);
        const filePathSet = existingSet ?? new Set<string>();
        if (!existingSet) {
          valueMap.set(item, filePathSet);
        }
        filePathSet.add(filePath);
      }
    });
  }

  // Get all files with a specific property key (any value)
  getFilesWithPropertyKey(key: string): Set<string> {
    const files = new Set<string>();
    this.propertyExistence.get(key)?.forEach((filePath) => files.add(filePath));
    this.propertyCache.get(key)?.forEach((fileSet) => {
      fileSet.forEach((filePath) => files.add(filePath));
    });
    return files;
  }

  // Get all files with a specific property key and value
  getFilesWithProperty(key: string, value: unknown): Set<string> {
    const valueMap = this.propertyCache.get(key);
    return valueMap?.get(value) || new Set();
  }

  // Get all property keys that have been indexed
  getPropertyKeys(): Set<string> {
    return this.propertyKeys;
  }

  // Check if a property key exists in the index
  hasPropertyKey(key: string): boolean {
    return this.propertyKeys.has(key);
  }

  // Check if the engine is initialized
  isReady(): boolean {
    return this.isInitialized;
  }

  // Invalidate cache for a file
  invalidateFile(file: TFile): void {
    // If not initialized (startup scan disabled), ignore cache updates
    if (!this.isInitialized && !this.startupScanEnabled) {
      return;
    }

    // Check if file contains any tasks before updating cache
    if (!this.fileContainsTasks(file)) {
      return;
    }

    // Prevent duplicate pending updates for the same file
    if (this.pendingUpdates.has(file.path)) {
      return;
    }

    this.pendingUpdates.add(file.path);

    // Debounce updates: one armed timer covers every change that lands while it
    // is pending, which is what the timer handle now records on its own.
    if (this.pendingUpdateTimeout === null) {
      this.pendingUpdateTimeout = window.setTimeout(() => {
        this.pendingUpdateTimeout = null;
        this.processPendingUpdates();
      }, this.PENDING_UPDATE_DEBOUNCE_MS);
    }
  }

  // Check if a file contains any tasks
  private fileContainsTasks(file: TFile): boolean {
    try {
      const tasks = this.taskStateManager.getTasks();
      return tasks.some((task) => task.path === file.path);
    } catch (error) {
      console.error('TODOseq: Failed to check if file contains tasks:', error);
    }

    // Fallback to true if we can't check task state manager
    return true;
  }

  // Handle file change event
  onFileChanged(file: TFile): void {
    this.invalidateFile(file);
  }

  // Handle file deleted event
  onFileDeleted(file: TFile): void {
    this.invalidateFile(file);
  }

  // Handle file renamed event
  onFileRenamed(file: TFile, oldPath: string): void {
    // If not initialized (startup scan disabled), ignore cache updates
    if (!this.isInitialized && !this.startupScanEnabled) {
      return;
    }

    // Check if either the old or new file contains tasks before updating cache
    const oldFileContainsTasks = this.filePathContainsTasks(oldPath);
    const newFileContainsTasks = this.fileContainsTasks(file);

    if (!oldFileContainsTasks && !newFileContainsTasks) {
      return;
    }

    // Prevent duplicate pending updates
    let added = false;
    if (!this.pendingUpdates.has(oldPath)) {
      this.pendingUpdates.add(oldPath);
      added = true;
    }
    if (!this.pendingUpdates.has(file.path)) {
      this.pendingUpdates.add(file.path);
      added = true;
    }

    // Debounce updates only if we actually added a new pending update
    if (added && this.pendingUpdateTimeout === null) {
      this.pendingUpdateTimeout = window.setTimeout(() => {
        this.pendingUpdateTimeout = null;
        this.processPendingUpdates();
      }, 1000);
    }
  }

  // Check if a file path contains any tasks
  private filePathContainsTasks(filePath: string): boolean {
    try {
      const tasks = this.taskStateManager.getTasks();
      return tasks.some((task) => task.path === filePath);
    } catch (error) {
      console.error(
        'TODOseq: Failed to check if file path contains tasks:',
        error,
      );
    }

    // Fallback to true if we can't check task state manager
    return true;
  }

  private processPendingUpdates(): void {
    if (this.isDestroyed) {
      return;
    }

    // A full pass owns the cache until it finishes; it drains this queue in its
    // own tail. Running here would mutate entries the rebuild is still writing.
    if (this.fullPassActive) {
      return;
    }

    if (this.pendingUpdates.size === 0) {
      return;
    }

    // Process each pending file update incrementally
    const pendingUpdatesArray = Array.from(this.pendingUpdates);
    for (let i = 0; i < pendingUpdatesArray.length; i++) {
      const filePath = pendingUpdatesArray[i];
      // Remove old references to this file from cache
      this.removeFileFromCache(filePath);

      // If file still exists, update with new properties
      let file;
      if (
        this.app.vault &&
        typeof this.app.vault.getAbstractFileByPath === 'function'
      ) {
        const abstractFile = this.app.vault.getAbstractFileByPath(filePath);
        if (
          abstractFile &&
          abstractFile instanceof TFile &&
          abstractFile.extension === 'md'
        ) {
          file = abstractFile;
        }
      }
      if (file && file instanceof TFile && file.extension === 'md') {
        const cache = this.app.metadataCache.getFileCache(file);
        if (cache?.frontmatter) {
          this.registerFileProperties(filePath, cache.frontmatter);
        }
      }
    }

    this.pendingUpdates.clear();

    // A completed, nonempty batch is the first point where every affected
    // file's properties are consistent again. Property-filtered views cannot
    // be refreshed from task equality, so publish exactly one notification.
    this.notifyIndexCommitted();
  }

  /**
   * Tell collection views that the property index has caught up.
   *
   * Called once per drained batch. A throwing recipient must not stop the
   * batch from completing or prevent the next notification.
   */
  private notifyIndexCommitted(): void {
    if (this.isDestroyed) return;
    try {
      this.refreshAllTaskListViews();
    } catch (error) {
      console.error(
        'TODOseq: Failed to refresh property-filtered views:',
        error,
      );
    }
  }

  // Remove all references to a file from property cache
  private removeFileFromCache(filePath: string): void {
    // Iterate through all properties
    this.propertyCache.forEach((valueMap, key) => {
      // Iterate through all values for this property
      valueMap.forEach((fileSet, value) => {
        // Remove file from set
        fileSet.delete(filePath);

        // If file set is now empty, remove the value from the cache
        if (fileSet.size === 0) {
          valueMap.delete(value);
        }
      });

      const existence = this.propertyExistence.get(key);
      existence?.delete(filePath);
      if (existence && existence.size === 0) {
        this.propertyExistence.delete(key);
      }

      // Remove the key only when neither values nor presence remain.
      if (valueMap.size === 0) {
        this.propertyCache.delete(key);
        if (!this.propertyExistence.has(key)) {
          this.propertyKeys.delete(key);
        }
      }
    });
  }

  // Force rebuild of all caches
  async rebuildAll(): Promise<void> {
    // Deferred, never dropped. The caller is the settings-change path, which
    // goes on as soon as this resolves; returning here without arranging the
    // work would leave property filters reading a cache that was never rebuilt.
    if (this.fullPassActive) {
      this.rebuildPending = true;
      return;
    }

    this.fullPassActive = true;

    // If already initialized, clear caches but don't reset isInitialized flag
    // This prevents repeated initialization calls
    this.propertyCache.clear();
    this.propertyKeys.clear();

    // Re-build cache directly using single-pass initialization
    try {
      if (this.startupScanEnabled) {
        try {
          await this.initializePropertyCacheSinglePass();
          this.isInitialized = true;
        } catch (error) {
          console.error('TODOseq: PropertySearchEngine rebuild failed:', error);
        }
      }
    } finally {
      this.fullPassActive = false;
      await this.settleAfterPass();
    }
  }

  // Enable or disable startup scan
  setStartupScanEnabled(enabled: boolean): void {
    this.startupScanEnabled = enabled;

    if (enabled && !this.isInitialized) {
      this.initialize().catch(console.error);
    }
  }

  // Get startup scan status
  isStartupScanEnabled(): boolean {
    return this.startupScanEnabled;
  }

  // Get the number of property keys indexed
  getPropertyCount(): number {
    return this.propertyKeys.size;
  }

  // Get the number of files with a specific property
  getFileCountForProperty(key: string): number {
    const valueMap = this.propertyCache.get(key);
    if (!valueMap) return 0;

    let count = 0;
    Array.from(valueMap.values()).forEach((fileSet) => {
      count += fileSet.size;
    });
    return count;
  }

  // Clear all caches and reset
  reset(): void {
    this.propertyCache.clear();
    this.propertyKeys.clear();
    this.isInitialized = false;
    this.pendingUpdates.clear();
    // Cancel the armed timer too. Clearing the queue while leaving the timer
    // running means the pass still fires, against a cache and a queue that have
    // both just been wiped.
    if (this.pendingUpdateTimeout !== null) {
      window.clearTimeout(this.pendingUpdateTimeout);
      this.pendingUpdateTimeout = null;
    }
    // `fullPassActive` is deliberately left alone: it belongs to a pass that is
    // still running and will clear it, and clearing it here would let the next
    // pass start alongside that one.
  }

  /**
   * Destroy the property search engine and clean up resources
   */
  destroy(): void {
    this.isDestroyed = true;
    this.reset();
    // Clear any pending update timeout
    if (this.pendingUpdateTimeout) {
      window.clearTimeout(this.pendingUpdateTimeout);
      this.pendingUpdateTimeout = null;
    }
  }
}
