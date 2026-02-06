import { App, TFile } from 'obsidian';
import { DateUtils } from '../utils/date-utils';

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

  private constructor(private app: App) {}

  public static getInstance(app: App): PropertySearchEngine {
    if (!PropertySearchEngine.instance) {
      PropertySearchEngine.instance = new PropertySearchEngine(app);
    }
    return PropertySearchEngine.instance;
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
      const plugin = (window as unknown as { todoSeqPlugin?: any })
        .todoSeqPlugin;
      if (plugin && plugin.vaultScanner) {
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
      const plugin = (window as unknown as { todoSeqPlugin?: any })
        .todoSeqPlugin;
      if (plugin) {
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
      const plugin = (window as unknown as { todoSeqPlugin?: any })
        .todoSeqPlugin;
      if (plugin?.taskStateManager) {
        const tasks = plugin.taskStateManager.getTasks();
        const taskFiles = new Set<string>();

        // Collect all unique file paths from tasks
        tasks.forEach((task: any) => {
          taskFiles.add(task.path);
        });

        // Only scan files that contain tasks if we found any tasks
        if (taskFiles.size > 0) {
          taskFiles.forEach((filePath) => {
            const file = this.app.vault.getAbstractFileByPath(filePath);
            // Check if it's a markdown file - type narrow from TAbstractFile to TFile
            // TFile has extension, TFolder has children
            const isMarkdownFile =
              file && !('children' in file) && (file as any).extension === 'md';

            if (isMarkdownFile) {
              const cache = this.app.metadataCache.getFileCache(file as TFile);
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
      const plugin = (window as unknown as { todoSeqPlugin?: any })
        .todoSeqPlugin;
      if (plugin?.taskStateManager) {
        const tasks = plugin.taskStateManager.getTasks();
        const taskFiles = new Set<string>();

        tasks.forEach((task: any) => {
          taskFiles.add(task.path);
        });

        filesToScan = Array.from(taskFiles)
          .map((filePath) => {
            const file = this.app.vault.getAbstractFileByPath(filePath);
            // Check if it's a markdown file - type narrow from TAbstractFile to TFile
            // TFile has extension, TFolder has children
            const isMarkdownFile =
              file && !('children' in file) && (file as any).extension === 'md';
            return isMarkdownFile ? (file as TFile) : null;
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
          const value = fileCache.frontmatter[key];

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
  async searchProperties(query: string): Promise<Set<string>> {
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

    const cache = this.propertyCache.get(key);
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
        const results = await this.searchSingleValue(key, orValue, cache);
        results.forEach((filePath) => {
          matchingFiles.add(filePath);
        });
      }

      return matchingFiles;
    }

    // Single value search
    return this.searchSingleValue(key, processedValue, cache);
  }

  // Search for a single property value (no OR processing)
  private async searchSingleValue(
    key: string,
    value: string,
    cache: Map<unknown, Set<string>>,
  ): Promise<Set<string>> {
    // Check if it's a comparison operator query
    const comparisonMatch = value.match(/^([><]=?)(\d+(\.\d+)?)$/);
    if (comparisonMatch) {
      const operator = comparisonMatch[1];
      const compareValue = Number(comparisonMatch[2]);

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
    let result = cache.get(value);
    if (!result) {
      // Try to parse as number
      const numValue = Number(value);
      if (!isNaN(numValue)) {
        result = cache.get(numValue);
      }
    }
    return result || new Set();
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
      const plugin = (window as unknown as { todoSeqPlugin?: any })
        .todoSeqPlugin;
      if (plugin?.taskStateManager) {
        const tasks = plugin.taskStateManager.getTasks();
        return tasks.some((task: any) => task.path === file.path);
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

    // Register handlers for vault events
    this.app.vault.on('rename', (file, oldPath) => {
      if (file instanceof TFile) {
        this.onFileRenamed(file, oldPath);
      }
    });

    this.app.vault.on('delete', (file) => {
      if (file instanceof TFile) {
        this.onFileDeleted(file);
      }
    });

    // Only register metadata cache change handler - this is sufficient for all file content changes
    this.app.metadataCache.on('changed', (file) => {
      if (file instanceof TFile) {
        this.onFileChanged(file);
      }
    });

    this.eventListenersRegistered = true;
  }

  // Unregister event listeners
  private unregisterEventListeners(): void {
    if (!this.eventListenersRegistered) {
      return; // Not registered
    }

    // This is a simplified implementation - in a real scenario, we'd need to track the specific listeners to remove them
    // For now, we just set the flag to false since Obsidian will clean up listeners when the plugin unloads
    this.eventListenersRegistered = false;
  }

  // Check if a file path contains any tasks
  private filePathContainsTasks(filePath: string): boolean {
    try {
      const plugin = (window as unknown as { todoSeqPlugin?: any })
        .todoSeqPlugin;
      if (plugin?.taskStateManager) {
        const tasks = plugin.taskStateManager.getTasks();
        return tasks.some((task: any) => task.path === filePath);
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
