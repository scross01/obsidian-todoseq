import { App, TFile } from 'obsidian';
import { DateUtils } from '../utils/date-utils';

// Interface for the plugin instance accessed via window
interface TodoSeqPlugin {
  taskStateManager?: {
    getTasks: () => Array<{
      path: string;
      text: string;
      completed: boolean;
      state: string;
    }>;
  };
  vaultScanner?: {
    isScanning: () => boolean;
    isObsidianInitializing: () => boolean;
  };
  refreshAllTaskListViews?: () => void;
}

// Interface for window with plugin reference
interface WindowWithPlugin extends Window {
  todoSeqPlugin?: TodoSeqPlugin;
}

export class PropertySearchEngine {
  private static instance: PropertySearchEngine;
  private propertyCache = new Map<string, Map<unknown, Set<string>>>();
  private propertyKeys = new Set<string>();
  private isInitialized = false;
  private startupScanEnabled = true;
  private pendingUpdates = new Set<string>();
  private isUpdating = false;
  private initializationPromise: Promise<void> | null = null; // Track if initialization is already queued
  private eventListenersRegistered = false; // Track if event listeners have been registered

  // Store event references for proper cleanup
  private vaultRenameEventRef: ReturnType<App['vault']['on']> | null = null;
  private vaultDeleteEventRef: ReturnType<App['vault']['on']> | null = null;
  private metadataCacheChangedEventRef: ReturnType<
    App['metadataCache']['on']
  > | null = null;

  private constructor(private app: App) {}

  public static getInstance(app: App): PropertySearchEngine {
    // Check if the app reference has changed (plugin reload scenario)
    if (
      PropertySearchEngine.instance &&
      PropertySearchEngine.instance.app !== app
    ) {
      // Reset the instance if the app reference has changed
      PropertySearchEngine.resetInstance();
    }

    if (!PropertySearchEngine.instance) {
      PropertySearchEngine.instance = new PropertySearchEngine(app);
    }
    return PropertySearchEngine.instance;
  }

  /**
   * Reset the singleton instance. This should be called during plugin cleanup
   * to prevent stale references when the plugin is reloaded.
   */
  public static resetInstance(): void {
    if (PropertySearchEngine.instance) {
      PropertySearchEngine.instance.destroy();
      PropertySearchEngine.instance = null as unknown as PropertySearchEngine;
    }
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

    this.isUpdating = true;
    const startTime = performance.now();

    try {
      // Register event listeners early to capture any events during initialization
      this.registerEventListeners();

      // Get all property keys by scanning all markdown files
      await this.scanAllPropertyKeys();

      // Build cache for each property key with batch processing
      await this.buildCacheInBatches();

      this.isInitialized = true;

      const duration = performance.now() - startTime;
      console.log(
        `TODOseq: PropertySearchEngine initialize completed in ${duration.toFixed(2)}ms`,
      );

      // Refresh all visible task list views after initialization completes
      // Delay to prevent recursion
      setTimeout(() => {
        this.refreshVisibleTaskListViews();
      }, 0);
    } catch (error) {
      console.error(
        'TODOseq: PropertySearchEngine initialization failed:',
        error,
      );
    } finally {
      this.isUpdating = false;
      this.initializationPromise = null;
    }
  }

  // Wait for vault scan to complete if it's in progress
  private async waitForVaultScan(): Promise<void> {
    // Check if we have access to the plugin and vault scanner
    try {
      const plugin = (window as WindowWithPlugin).todoSeqPlugin;
      if (plugin?.vaultScanner) {
        // Wait for vault scan to complete if it's in progress
        while (
          plugin.vaultScanner.isScanning() ||
          plugin.vaultScanner.isObsidianInitializing()
        ) {
          await new Promise((resolve) => setTimeout(resolve, 50));
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
      const plugin = (window as WindowWithPlugin).todoSeqPlugin;
      if (plugin?.refreshAllTaskListViews) {
        // Refresh all open task list views
        plugin.refreshAllTaskListViews();
      }
    } catch (error) {
      console.error('TODOseq: Failed to refresh task list views:', error);
    }
  }

  // Build cache in batches with yield to prevent UI lockup
  private async buildCacheInBatches(): Promise<void> {
    const propertyKeysArray = Array.from(this.propertyKeys);
    const batchSize = 10; // Process 10 properties per batch

    for (let i = 0; i < propertyKeysArray.length; i += batchSize) {
      const batch = propertyKeysArray.slice(i, i + batchSize);

      for (const key of batch) {
        await this.buildPropertyCache(key);
      }

      // Yield to event loop to keep UI responsive
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  // Scan all markdown files that contain tasks to get property keys
  private async scanAllPropertyKeys(): Promise<void> {
    // Get files with tasks from vault scanner
    // First, try to get tasks from TaskStateManager (faster if available)
    try {
      // This is a hack to get tasks from the plugin instance
      const plugin = (window as WindowWithPlugin).todoSeqPlugin;
      if (plugin?.taskStateManager) {
        const tasks = plugin.taskStateManager.getTasks();
        const taskFiles = new Set<string>();

        // Collect all unique file paths from tasks
        tasks.forEach((task) => {
          taskFiles.add(task.path);
        });

        // Only scan files that contain tasks if we found any tasks
        if (taskFiles.size > 0) {
          taskFiles.forEach((filePath) => {
            const file = this.app.vault.getAbstractFileByPath(filePath);
            // Check if it's a markdown file - type narrow from TAbstractFile to TFile
            // TFile has extension, TFolder has children
            const tfile = file as TFile | undefined;
            const isMarkdownFile = tfile && tfile.extension === 'md';

            if (isMarkdownFile && tfile) {
              const cache = this.app.metadataCache.getFileCache(tfile);
              if (cache?.frontmatter) {
                Object.keys(cache.frontmatter).forEach((key) => {
                  this.propertyKeys.add(key);
                });
              }
            }
          });

          console.log(
            `TODOseq: PropertySearchEngine scanning ${taskFiles.size} task-containing files`,
          );
          return;
        } else {
          return; // Skip initialization if no tasks found
        }
      }
    } catch (error) {
      console.error(
        'TODOseq: Failed to get task files from TaskStateManager:',
        error,
      );
    }
  }

  // Build cache for a specific property key
  private async buildPropertyCache(key: string): Promise<void> {
    const cache = new Map<unknown, Set<string>>();

    // Get files with tasks from vault scanner
    let filesToScan: TFile[] = [];
    try {
      const plugin = (window as WindowWithPlugin).todoSeqPlugin;
      if (plugin?.taskStateManager) {
        const tasks = plugin.taskStateManager.getTasks();
        const taskFiles = new Set<string>();

        tasks.forEach((task) => {
          taskFiles.add(task.path);
        });

        filesToScan = Array.from(taskFiles)
          .map((filePath) => {
            const file = this.app.vault.getAbstractFileByPath(filePath);
            // Check if it's a markdown file - type narrow from TAbstractFile to TFile
            // TFile has extension, TFolder has children
            const tfile = file as TFile | undefined;
            const isMarkdownFile = tfile && tfile.extension === 'md';
            return isMarkdownFile ? tfile : null;
          })
          .filter(Boolean) as TFile[];
      }
    } catch (error) {
      console.error(
        'TODOseq: Failed to get task files for property cache:',
        error,
      );
    }

    // Skip building cache if no task files found
    if (filesToScan.length === 0) {
      this.propertyCache.set(key, cache);
      return;
    }

    // Process files in batches to prevent UI lockup
    const batchSize = 50;
    for (let i = 0; i < filesToScan.length; i += batchSize) {
      const batch = filesToScan.slice(i, i + batchSize);

      for (const file of batch) {
        const fileCache = this.app.metadataCache.getFileCache(file);
        if (fileCache?.frontmatter && key in fileCache.frontmatter) {
          const value: unknown = fileCache.frontmatter[key];

          if (Array.isArray(value)) {
            // For arrays, add each element as a separate key in the cache
            value.forEach((item) => {
              if (!cache.has(item)) {
                cache.set(item, new Set());
              }
              const filePathSet = cache.get(item);
              if (filePathSet) {
                filePathSet.add(file.path);
              }
            });
          } else {
            // For non-array values, add directly to cache
            if (!cache.has(value)) {
              cache.set(value, new Set());
            }
            const filePathSet = cache.get(value);
            if (filePathSet) {
              filePathSet.add(file.path);
            }
          }
        }
      }

      // Yield to event loop to keep UI responsive
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    this.propertyCache.set(key, cache);
  }

  // Search for files matching property query
  async searchProperties(
    query: string,
    caseSensitive = false,
  ): Promise<Set<string>> {
    await this.initialize();

    // Parse query: [key:value] or [key]
    let key: string;
    let value: string | null;

    if (query.startsWith('[') && query.endsWith(']')) {
      const content = query.slice(1, -1);
      const colonIndex = content.indexOf(':');

      if (colonIndex !== -1) {
        key = content.slice(0, colonIndex);
        value = content.slice(colonIndex + 1);
      } else {
        key = content;
        value = null;
      }
    } else {
      return new Set();
    }

    // Find the cache with case-insensitive key matching if needed
    const cache = this.getPropertyCacheForKey(key, caseSensitive);
    if (!cache) return new Set();

    if (value === null) {
      // Key-only search: return all files with this property
      const files = new Set<string>();
      Array.from(cache.values()).forEach((fileSet) => {
        Array.from(fileSet).forEach((filePath) => {
          files.add(filePath);
        });
      });
      return files;
    }

    // Handle OR expressions in the value (e.g., [status:Draft OR Active])
    // Also handle parentheses (e.g., [status:(Draft OR Active)])
    let processedValue = value;
    if (value.startsWith('(') && value.endsWith(')')) {
      processedValue = value.slice(1, -1);
    }

    if (processedValue.includes(' OR ')) {
      const orValues = processedValue.split(' OR ').map((v) => v.trim());
      const matchingFiles = new Set<string>();

      // Search for each OR value and union the results
      for (const orValue of orValues) {
        const results = await this.searchSingleValue(
          key,
          orValue,
          cache,
          caseSensitive,
        );
        results.forEach((filePath) => {
          matchingFiles.add(filePath);
        });
      }

      return matchingFiles;
    }

    // Single value search
    return this.searchSingleValue(key, processedValue, cache, caseSensitive);
  }

  // Get property cache for a key, with case-insensitive lookup if needed
  private getPropertyCacheForKey(
    key: string,
    caseSensitive: boolean,
  ): Map<unknown, Set<string>> | null {
    if (caseSensitive) {
      // Case sensitive: exact key match
      return this.propertyCache.get(key) || null;
    }

    // Case insensitive: find key matching lowercase
    const lowerKey = key.toLowerCase();
    const cacheKeys = Array.from(this.propertyCache.keys());
    for (const cacheKey of cacheKeys) {
      if (typeof cacheKey === 'string' && cacheKey.toLowerCase() === lowerKey) {
        return this.propertyCache.get(cacheKey) || null;
      }
    }
    return null;
  }

  // Search for a single property value (no OR processing)
  private async searchSingleValue(
    key: string,
    value: string,
    cache: Map<unknown, Set<string>>,
    caseSensitive = false,
  ): Promise<Set<string>> {
    // Check if it's a comparison operator query (numeric or date)
    const comparisonMatch = value.match(/^([><]=?)(.+)$/);
    if (comparisonMatch) {
      const operator = comparisonMatch[1];
      const compareValueStr = comparisonMatch[2];

      // First, try to parse as date comparison
      const compareDate = this.parseDateForComparison(compareValueStr);
      if (compareDate) {
        const matchingFiles = new Set<string>();

        // Iterate through all property values in cache
        cache.forEach((fileSet, propValue) => {
          const taskDate = this.parsePropertyValueAsDate(propValue);
          if (taskDate) {
            let matches = false;

            switch (operator) {
              case '>':
                matches = taskDate > compareDate;
                break;
              case '>=':
                matches = taskDate >= compareDate;
                break;
              case '<':
                matches = taskDate < compareDate;
                break;
              case '<=':
                matches = taskDate <= compareDate;
                break;
            }

            if (matches) {
              fileSet.forEach((filePath) => {
                matchingFiles.add(filePath);
              });
            }
          }
        });

        return matchingFiles;
      }

      // Fall back to numeric comparison
      const compareValue = Number(compareValueStr);
      if (!isNaN(compareValue)) {
        const matchingFiles = new Set<string>();

        // Iterate through all property values in cache
        cache.forEach((fileSet, propValue) => {
          // Only perform comparison if property value is numeric
          if (typeof propValue === 'number') {
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
              fileSet.forEach((filePath) => {
                matchingFiles.add(filePath);
              });
            }
          }
        });

        return matchingFiles;
      }
    }

    // Try to parse as date and handle date comparisons
    const parsedDate = DateUtils.parseDateValue(value);

    if (parsedDate) {
      const matchingFiles = new Set<string>();

      // Iterate through all property values in cache
      cache.forEach((fileSet, propValue) => {
        // Try to parse property value as date
        let taskDate: Date | null = null;

        if (propValue instanceof Date) {
          taskDate = propValue;
        } else if (typeof propValue === 'string') {
          const parsedPropDate = DateUtils.parseDateValue(propValue);
          if (
            parsedPropDate &&
            parsedPropDate !== 'none' &&
            !(typeof parsedPropDate === 'string')
          ) {
            if (
              typeof parsedPropDate === 'object' &&
              'date' in parsedPropDate
            ) {
              taskDate = parsedPropDate.date;
            } else if (parsedPropDate instanceof Date) {
              taskDate = parsedPropDate;
            }
          }
        }

        if (taskDate) {
          // Handle date comparisons similar to SearchEvaluator
          if (typeof parsedDate === 'string') {
            // Relative date expressions like 'today', 'tomorrow'
            // We need to implement simple version since we don't have access to settings
            const now = new Date();
            switch (parsedDate) {
              case 'today':
                if (DateUtils.isDateDueToday(taskDate, now)) {
                  fileSet.forEach((filePath) => matchingFiles.add(filePath));
                }
                break;
              case 'tomorrow':
                if (DateUtils.isDateDueTomorrow(taskDate, now)) {
                  fileSet.forEach((filePath) => matchingFiles.add(filePath));
                }
                break;
              case 'overdue':
                if (DateUtils.isDateOverdue(taskDate, now)) {
                  fileSet.forEach((filePath) => matchingFiles.add(filePath));
                }
                break;
            }
          } else if (typeof parsedDate === 'object' && parsedDate !== null) {
            if ('start' in parsedDate && 'end' in parsedDate) {
              // Date range
              if (
                DateUtils.isDateInRange(
                  taskDate,
                  parsedDate.start,
                  parsedDate.end,
                )
              ) {
                fileSet.forEach((filePath) => matchingFiles.add(filePath));
              }
            } else if ('date' in parsedDate && 'format' in parsedDate) {
              // Exact date with format information
              const searchDate = parsedDate.date;
              const format = parsedDate.format;

              switch (format) {
                case 'year':
                  if (searchDate.getFullYear() === taskDate.getFullYear()) {
                    fileSet.forEach((filePath) => matchingFiles.add(filePath));
                  }
                  break;
                case 'year-month':
                  if (
                    searchDate.getFullYear() === taskDate.getFullYear() &&
                    searchDate.getMonth() === taskDate.getMonth()
                  ) {
                    fileSet.forEach((filePath) => matchingFiles.add(filePath));
                  }
                  break;
                case 'full':
                  if (DateUtils.compareDates(taskDate, searchDate)) {
                    fileSet.forEach((filePath) => matchingFiles.add(filePath));
                  }
                  break;
              }
            } else if (parsedDate instanceof Date) {
              // Date object (from natural language parsing)
              if (DateUtils.compareDates(taskDate, parsedDate)) {
                fileSet.forEach((filePath) => matchingFiles.add(filePath));
              }
            }
          }
        }
      });

      if (matchingFiles.size > 0) {
        return matchingFiles;
      }
    }

    // Handle boolean value search
    const lowerValue = value.toLowerCase();
    if (lowerValue === 'true' || lowerValue === 'false') {
      const boolValue = lowerValue === 'true';
      const boolResult = cache.get(boolValue);
      if (boolResult) {
        return boolResult;
      }
    }

    // Value search: return files with this value
    // Try to match with the same type, or convert to number if possible
    let result = this.findValueInCache(cache, value, caseSensitive);
    if (!result) {
      // Try to parse as number
      const numValue = Number(value);
      if (!isNaN(numValue)) {
        result = cache.get(numValue);
      }
    }
    return result || new Set();
  }

  // Find a value in the cache with optional case-insensitive matching
  private findValueInCache(
    cache: Map<unknown, Set<string>>,
    searchValue: string,
    caseSensitive: boolean,
  ): Set<string> | undefined {
    // First try exact match
    const exactResult = cache.get(searchValue);
    if (exactResult) {
      return exactResult;
    }

    // If case-insensitive, search for matching string keys
    if (!caseSensitive) {
      const lowerSearch = searchValue.toLowerCase();
      const cacheEntries = Array.from(cache.entries());
      for (const [cacheKey, fileSet] of cacheEntries) {
        if (
          typeof cacheKey === 'string' &&
          cacheKey.toLowerCase() === lowerSearch
        ) {
          return fileSet;
        }
      }
    }

    return undefined;
  }

  // Parse a date string for comparison operations
  private parseDateForComparison(value: string): Date | null {
    const trimmed = value.trim();

    // Full date: YYYY-MM-DD
    const fullDateMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (fullDateMatch) {
      const [, year, month, day] = fullDateMatch.map(Number);
      return DateUtils.createDate(year, month - 1, day);
    }

    // Year-Month: YYYY-MM
    const yearMonthMatch = trimmed.match(/^(\d{4})-(\d{2})$/);
    if (yearMonthMatch) {
      const [, year, month] = yearMonthMatch.map(Number);
      return DateUtils.createDate(year, month - 1, 1);
    }

    // Year only: YYYY
    const yearMatch = trimmed.match(/^(\d{4})$/);
    if (yearMatch) {
      const year = parseInt(trimmed, 10);
      return DateUtils.createDate(year, 0, 1);
    }

    return null;
  }

  // Parse a property value as a date
  private parsePropertyValueAsDate(propValue: unknown): Date | null {
    if (propValue instanceof Date) {
      return propValue;
    }

    if (typeof propValue === 'string') {
      const parsed = this.parseDateForComparison(propValue);
      if (parsed) {
        return parsed;
      }

      // Try DateUtils.parseDateValue for more complex formats
      const parsedDate = DateUtils.parseDateValue(propValue);
      if (
        parsedDate &&
        parsedDate !== 'none' &&
        !(typeof parsedDate === 'string')
      ) {
        if (typeof parsedDate === 'object' && 'date' in parsedDate) {
          return parsedDate.date;
        }
        if (parsedDate instanceof Date) {
          return parsedDate;
        }
      }
    }

    return null;
  }

  // Get all files with a specific property key (any value)
  getFilesWithPropertyKey(key: string): Set<string> {
    const valueMap = this.propertyCache.get(key);
    const files = new Set<string>();
    if (valueMap) {
      Array.from(valueMap.values()).forEach((fileSet) => {
        Array.from(fileSet).forEach((filePath) => {
          files.add(filePath);
        });
      });
    }
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

    // Debounce updates
    if (!this.isUpdating) {
      this.isUpdating = true;
      setTimeout(() => this.processPendingUpdates(), 100);
    }
  }

  // Check if a file contains any tasks
  private fileContainsTasks(file: TFile): boolean {
    try {
      const plugin = (window as WindowWithPlugin).todoSeqPlugin;
      if (plugin?.taskStateManager) {
        const tasks = plugin.taskStateManager.getTasks();
        return tasks.some((task) => task.path === file.path);
      }
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
    if (added && !this.isUpdating) {
      this.isUpdating = true;
      setTimeout(() => this.processPendingUpdates(), 1000); // TODO make the debouce a constant
    }
  }

  // Register event listeners for file changes
  private registerEventListeners(): void {
    if (this.eventListenersRegistered) {
      return; // Already registered
    }

    // Register handlers for vault events and store references for cleanup
    this.vaultRenameEventRef = this.app.vault.on('rename', (file, oldPath) => {
      if (file instanceof TFile) {
        this.onFileRenamed(file, oldPath);
      }
    });

    this.vaultDeleteEventRef = this.app.vault.on('delete', (file) => {
      if (file instanceof TFile) {
        this.onFileDeleted(file);
      }
    });

    // Only register metadata cache change handler - this is sufficient for all file content changes
    this.metadataCacheChangedEventRef = this.app.metadataCache.on(
      'changed',
      (file) => {
        if (file instanceof TFile) {
          this.onFileChanged(file);
        }
      },
    );

    this.eventListenersRegistered = true;
  }

  // Unregister event listeners
  private unregisterEventListeners(): void {
    if (!this.eventListenersRegistered) {
      return; // Not registered
    }

    // Remove each event listener using the stored references
    if (this.vaultRenameEventRef) {
      this.app.vault.offref(this.vaultRenameEventRef);
      this.vaultRenameEventRef = null;
    }

    if (this.vaultDeleteEventRef) {
      this.app.vault.offref(this.vaultDeleteEventRef);
      this.vaultDeleteEventRef = null;
    }

    if (this.metadataCacheChangedEventRef) {
      this.app.metadataCache.offref(this.metadataCacheChangedEventRef);
      this.metadataCacheChangedEventRef = null;
    }

    this.eventListenersRegistered = false;
  }

  // Check if a file path contains any tasks
  private filePathContainsTasks(filePath: string): boolean {
    try {
      const plugin = (window as WindowWithPlugin).todoSeqPlugin;
      if (plugin?.taskStateManager) {
        const tasks = plugin.taskStateManager.getTasks();
        return tasks.some((task) => task.path === filePath);
      }
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
    if (this.pendingUpdates.size === 0) {
      this.isUpdating = false;
      return;
    }

    // Process each pending file update incrementally
    const pendingUpdatesArray = Array.from(this.pendingUpdates);
    for (let i = 0; i < pendingUpdatesArray.length; i++) {
      const filePath = pendingUpdatesArray[i];
      // Remove old references to this file from cache
      this.removeFileFromCache(filePath);

      // If file still exists, update with new properties
      let file: TFile | null = null;
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
          // Add new properties to cache
          Object.entries(cache.frontmatter).forEach(([key, value]) => {
            this.propertyKeys.add(key);

            // Get or create cache for this property
            let valueMap = this.propertyCache.get(key);
            if (!valueMap) {
              valueMap = new Map<unknown, Set<string>>();
              this.propertyCache.set(key, valueMap);
            }

            // Add value to cache
            if (Array.isArray(value)) {
              value.forEach((item) => {
                let filePathSet = valueMap.get(item);
                if (!filePathSet) {
                  filePathSet = new Set<string>();
                  valueMap.set(item, filePathSet);
                }
                filePathSet.add(filePath);
              });
            } else {
              let filePathSet = valueMap.get(value);
              if (!filePathSet) {
                filePathSet = new Set<string>();
                valueMap.set(value, filePathSet);
              }
              filePathSet.add(filePath);
            }
          });
        }
      }
    }

    this.pendingUpdates.clear();
    this.isUpdating = false;
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

      // If property has no more values, remove the property from cache and property keys
      if (valueMap.size === 0) {
        this.propertyCache.delete(key);
        this.propertyKeys.delete(key);
      }
    });
  }

  // Force rebuild of all caches
  async rebuildAll(): Promise<void> {
    // If already updating, do nothing - pending updates will be processed after current update
    if (this.isUpdating) {
      return;
    }

    this.isUpdating = true;

    // If already initialized, clear caches but don't reset isInitialized flag
    // This prevents repeated initialization calls
    this.propertyCache.clear();
    this.propertyKeys.clear();

    // Re-build cache directly instead of calling initialize() which resets isInitialized
    if (this.startupScanEnabled) {
      try {
        await this.scanAllPropertyKeys();
        await this.buildCacheInBatches();
        this.isInitialized = true;
      } catch (error) {
        console.error('TODOseq: PropertySearchEngine rebuild failed:', error);
      } finally {
        // After rebuild completes, check if there are pending updates
        if (this.pendingUpdates.size > 0) {
          console.log(
            'TODOseq: PropertySearchEngine has pending updates, processing...',
          );
          this.pendingUpdates.clear();
          await this.rebuildAll(); // Recursively call to process pending updates
        } else {
          this.isUpdating = false;
        }
      }
    } else {
      this.isUpdating = false;
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
    this.isUpdating = false;
  }

  /**
   * Destroy the property search engine and clean up resources
   */
  destroy(): void {
    this.unregisterEventListeners();
    this.reset();
    // Clear any pending timeouts
    // Note: In a real implementation, you'd want to track and clear any pending timeouts
  }
}
