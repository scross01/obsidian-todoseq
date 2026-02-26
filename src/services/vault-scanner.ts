import { App, TFile, TAbstractFile } from 'obsidian';
import { Task } from '../types/task';
import { TaskParser } from '../parser/task-parser';
import { ParserRegistry } from '../parser/parser-registry';
import { ITaskParser, ParserConfig } from '../parser/types';
import { TodoTrackerSettings } from '../settings/settings-types';
import { taskComparator } from '../utils/task-sort';
import {
  parseUrgencyCoefficients,
  UrgencyCoefficients,
} from '../utils/task-urgency';
import { TaskStateManager } from './task-state-manager';
import { RegexCache } from '../utils/regex-cache';
import { PropertySearchEngine } from './property-search-engine';
import { KeywordManager } from '../utils/keyword-manager';

// Define the event types that VaultScanner will emit
export interface VaultScannerEvents {
  'tasks-changed': (tasks: Task[]) => void;
  'scan-started': () => void;
  'scan-completed': () => void;
  'scan-error': (error: Error) => void;
  'file-changed': (file: TAbstractFile) => void;
  'file-deleted': (file: TAbstractFile) => void;
}

export class VaultScanner {
  private _isScanning = false;
  private _isInitializing = true; // Track Obsidian initialization state
  private eventListeners: Map<
    keyof VaultScannerEvents,
    ((...args: unknown[]) => void)[]
  > = new Map();
  private urgencyCoefficients!: UrgencyCoefficients;
  private regexCache = new RegexCache();
  private parserRegistry: ParserRegistry;
  private keywordManager: KeywordManager;
  private propertySearchEngine?: PropertySearchEngine;

  constructor(
    private app: App,
    private settings: TodoTrackerSettings,
    private taskStateManager: TaskStateManager,
    urgencyCoefficients?: UrgencyCoefficients,
  ) {
    // Create KeywordManager - single source for this VaultScanner
    this.keywordManager = new KeywordManager(settings);

    // Initialize parser registry
    this.parserRegistry = new ParserRegistry();

    // Create TaskParser with this KeywordManager
    const taskParser = TaskParser.create(
      this.keywordManager,
      app,
      urgencyCoefficients,
    );
    this.parserRegistry.register(taskParser);

    // Initialize event listeners map
    const eventKeys: Array<keyof VaultScannerEvents> = [
      'tasks-changed',
      'scan-started',
      'scan-completed',
      'scan-error',
      'file-changed',
      'file-deleted',
    ];
    eventKeys.forEach((event) => {
      this.eventListeners.set(event, []);
    });

    // Use provided urgency coefficients or load them if not provided
    if (urgencyCoefficients) {
      this.urgencyCoefficients = urgencyCoefficients;
    } else {
      // Fallback: load urgency coefficients on startup if not provided
      this.loadUrgencyCoefficients();
    }

    // NOTE: PropertySearchEngine now registers its own event listeners
    // during initialization to support lazy initialization
  }

  /**
   * Register an additional parser with the registry.
   * @param parser The parser to register
   */
  registerParser(parser: ITaskParser): void {
    this.parserRegistry.register(parser);
  }

  /**
   * Get the parser registry.
   * @returns The ParserRegistry instance
   */
  getParserRegistry(): ParserRegistry {
    return this.parserRegistry;
  }

  /**
   * Get the shared KeywordManager instance.
   * Used by parsers to get the same KeywordManager reference.
   */
  getKeywordManager(): KeywordManager {
    return this.keywordManager;
  }

  /**
   * Replace the markdown parser with a new one.
   * Used when creating parsers with shared KeywordManager after VaultScanner creation.
   */
  replaceParser(newParser: TaskParser): void {
    this.parserRegistry.register(newParser);
  }

  /**
   * Load urgency coefficients from urgency.ini file
   */
  private async loadUrgencyCoefficients(): Promise<void> {
    try {
      this.urgencyCoefficients = await parseUrgencyCoefficients(this.app);
    } catch (error) {
      // Failed to load urgency coefficients
      // Fallback to defaults handled in parseUrgencyCoefficients
    }
  }

  // Set property search engine (called by EventCoordinator)
  setPropertySearchEngine(propertySearchEngine: PropertySearchEngine): void {
    this.propertySearchEngine = propertySearchEngine;
  }

  // Event management methods
  on<T extends keyof VaultScannerEvents>(
    event: T,
    listener: VaultScannerEvents[T],
  ): void {
    const listeners = this.eventListeners.get(event) || [];
    listeners.push(listener);
    this.eventListeners.set(event, listeners);
  }

  off<T extends keyof VaultScannerEvents>(
    event: T,
    listener: VaultScannerEvents[T],
  ): void {
    const listeners = this.eventListeners.get(event) || [];
    const filteredListeners = listeners.filter((l) => l !== listener);
    this.eventListeners.set(event, filteredListeners);
  }

  emit<T extends keyof VaultScannerEvents>(
    event: T,
    ...args: Parameters<VaultScannerEvents[T]>
  ): void {
    const listeners = this.eventListeners.get(event) || [];
    listeners.forEach((listener) => {
      try {
        listener(...args);
      } catch (error) {
        console.error(
          `Error in VaultScanner event listener for ${String(event)}`,
          error,
        );
      }
    });
  }

  // Core scanning methods
  async scanVault(): Promise<void> {
    if (this._isScanning) return;
    this._isScanning = true;

    const startTime = performance.now();

    try {
      this.emit('scan-started');
      const newTasks: Task[] = [];
      const files = this.app.vault.getFiles();

      // Yield configuration: how often to yield a frame while scanning
      const YIELD_EVERY_FILES = 50;
      let hasEmittedInitialBatch = false;

      // Filter files that should be scanned first
      const filesToScan = files.filter((f) => this.shouldScanFile(f));

      // Process in batches to maximize async read throughput without locking the event loop
      for (let i = 0; i < filesToScan.length; i += YIELD_EVERY_FILES) {
        const batch = filesToScan.slice(i, i + YIELD_EVERY_FILES);

        // Execute scan asynchronously in parallel for the current batch
        const batchResults = await Promise.all(
          batch.map((file) => this.scanFile(file)),
        );

        // Flatten the task arrays from the batch
        for (const fileTasks of batchResults) {
          // Filter out archived tasks - they are styled but NOT collected
          // Note: Archived tasks are identified using KeywordManager instead
          // of being tracked by individual parsers for consistency across all formats
          const nonArchivedTasks = fileTasks.filter(
            (task) => !this.keywordManager.isArchived(task.state),
          );
          newTasks.push(...nonArchivedTasks);
        }

        // Emit an initial chunk of tasks to the UI to unblock Largest Contentful Paint (LCP)
        if (newTasks.length > 0 && !hasEmittedInitialBatch) {
          const initialTasks = [...newTasks];
          initialTasks.sort(taskComparator);
          this.taskStateManager.setTasks(initialTasks);
          // UI elements will now mount instantly while the rest of the vault continues
          // to scan invisibly in the background.
          hasEmittedInitialBatch = true;
        }

        // Yield to the event loop between batches to keep Obsidian UI responsive
        await this.yieldToEventLoop();
      }

      // Default sort
      newTasks.sort(taskComparator);

      // Update the centralized state manager
      this.taskStateManager.setTasks(newTasks);

      // Emit events for backward compatibility
      this.emit('tasks-changed', newTasks);
      this.emit('scan-completed');

      const endTime = performance.now();
      const scanDuration = endTime - startTime;
      console.log(
        `TODOseq: scan vault completed in ${scanDuration.toFixed(2)}ms (${newTasks.length} tasks found)`,
      );
    } catch (error) {
      console.error('VaultScanner scanVault error', error);
      this.emit(
        'scan-error',
        error instanceof Error ? error : new Error(String(error)),
      );
    } finally {
      this._isScanning = false;
    }
  }

  /**
   * Check if a file should be scanned based on extension and exclusion rules
   * @param file The file to check
   * @returns true if the file should be scanned
   */
  private shouldScanFile(file: TFile): boolean {
    // Check if file is excluded by Obsidian's user ignore filters
    if (this.isExcluded(file.path)) {
      return false;
    }

    // Check if file is a markdown file
    if (file.extension === 'md') {
      return true;
    }

    // Check if file extension matches any additional extensions from settings
    const additionalExtensions = this.settings.additionalFileExtensions ?? [];
    if (additionalExtensions.length > 0) {
      const fileExtension = '.' + file.extension.toLowerCase();
      // Check for exact match (e.g., .org matches file.extension 'org')
      if (additionalExtensions.includes(fileExtension)) {
        return true;
      }
      // Check for multi-level extension match (e.g., .txt.bak matches file.bak)
      // The file.extension in Obsidian is the last part after the last dot
      // For multi-level extensions, we need to check the full filename
      const fileName = file.name.toLowerCase();
      for (const ext of additionalExtensions) {
        if (fileName.endsWith(ext.toLowerCase())) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Check if a file path should be excluded based on Obsidian's userIgnoreFilters
   *
   * @param filePath The file path to check
   * @returns true if the file should be excluded, false otherwise
   */
  private isExcluded(filePath: string): boolean {
    try {
      // Use type assertion since getConfig is not part of the public Obsidian API
      // but is available in practice (undocumented)
      const rawPatterns = (
        this.app.vault as unknown as { getConfig: (key: string) => unknown }
      ).getConfig('userIgnoreFilters');
      const excludedPatterns = Array.isArray(rawPatterns)
        ? rawPatterns.map(String)
        : [];

      return excludedPatterns.some((pattern: string) => {
        try {
          // Handle regex patterns (wrapped in /)
          if (pattern.startsWith('/') && pattern.endsWith('/')) {
            const regexPattern = pattern.slice(1, -1); // Remove / delimiters
            const regex = this.regexCache.get(regexPattern);
            return regex.test(filePath);
          }
          // Handle path patterns (ending with /)
          else if (pattern.endsWith('/')) {
            // Convert path to regex: match path prefix
            // Escape special regex characters in the path
            const escapedPath = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const pathRegex = this.regexCache.get(`^${escapedPath}`);
            return pathRegex.test(filePath);
          }
          // Handle simple string matching
          else {
            return filePath.includes(pattern);
          }
        } catch (e) {
          // Invalid pattern - skip it and log warning
          console.warn(
            `TODOseq: Invalid ignore filter pattern "${pattern}"`,
            e,
          );
          return false;
        }
      });
    } catch (error) {
      // If we can't get the config, don't exclude anything
      return false;
    }
  }

  /**
   * Scans a single file for tasks using Vault.cachedRead() API for better performance
   *
   * @param file The TFile to scan for tasks
   * @returns Array of tasks found in the file
   */
  async scanFile(file: TFile): Promise<Task[]> {
    try {
      const content = await this.app.vault.cachedRead(file);

      // Get the appropriate parser for this file extension
      const parser = this.parserRegistry.getParserForExtension(file.extension);

      if (!parser) {
        // No parser registered for this extension, return empty
        return [];
      }

      // Fast-path rejection: if the file text doesn't contain any task keywords natively,
      // skip expensive line-by-line regex parsing completely.
      if (!parser.hasAnyKeyword(content)) {
        return [];
      }

      // Parse tasks using the matched parser
      const fileTasks = parser.parseFile(content, file.path, file);
      return fileTasks;
    } catch (err) {
      console.error(`VaultScanner scanFile error for file ${file.path}`, err);
      this.emit(
        'scan-error',
        err instanceof Error ? err : new Error(String(err)),
      );
      return [];
    }
  }

  // Get the current scanning state
  isScanning(): boolean {
    return this._isScanning;
  }

  /**
   * Check if Obsidian's vault is still initializing
   * Set to false after initial scan completes
   */
  isObsidianInitializing(): boolean {
    return this._isInitializing;
  }

  /**
   * Mark Obsidian initialization as complete
   * Called after the initial vault scan completes
   */
  setInitializationComplete(): void {
    this._isInitializing = false;
  }

  /**
   * Check if we should show the scanning message
   * Returns true if either the plugin is scanning or Obsidian is still initializing,
   * UNLESS we have already begun emitting progressive task arrays to the UI.
   */
  shouldShowScanningMessage(): boolean {
    if (this.taskStateManager.getTasks().length > 0) {
      return false; // Yield to TaskListView for LCP paint if progressive chunks exist
    }
    return this._isScanning || this._isInitializing;
  }

  // Get the current tasks from the state manager
  getTasks(): Task[] {
    return this.taskStateManager.getTasks();
  }

  // Get the TaskStateManager instance
  getTaskStateManager(): TaskStateManager {
    return this.taskStateManager;
  }

  // Get the current parser instance (backward compatibility)
  getParser(): TaskParser | null {
    // Return the markdown parser for backward compatibility
    return this.parserRegistry.getParser('markdown') as TaskParser | null;
  }

  // Update settings and recreate parser if needed
  async updateSettings(
    newSettings: TodoTrackerSettings,
    urgencyCoefficients?: UrgencyCoefficients,
  ): Promise<void> {
    this.settings = newSettings;
    // Clear regex cache when settings change (userIgnoreFilters may have changed)
    this.regexCache.clear();
    // Use provided urgency coefficients or reload them if not provided
    if (urgencyCoefficients) {
      this.urgencyCoefficients = urgencyCoefficients;
    } else {
      await this.loadUrgencyCoefficients();
    }

    // Create a new KeywordManager with the updated settings
    // KeywordManager reads directly from settings, so we just need to create a new one
    this.keywordManager = new KeywordManager(newSettings);

    // Update parsers with new settings - they will read fresh keywords from KeywordManager
    const config: ParserConfig = {
      keywords: this.keywordManager.getAllKeywords(),
      completedKeywords:
        this.keywordManager.getKeywordsForGroup('completedKeywords'),
      keywordManager: this.keywordManager,
      activeKeywords: this.keywordManager.getKeywordsForGroup('activeKeywords'),
      waitingKeywords:
        this.keywordManager.getKeywordsForGroup('waitingKeywords'),
      archivedKeywords:
        this.keywordManager.getKeywordsForGroup('archivedKeywords'),
      urgencyCoefficients: this.urgencyCoefficients,
      includeCalloutBlocks: newSettings.includeCalloutBlocks,
      includeCodeBlocks: newSettings.includeCodeBlocks,
      includeCommentBlocks: newSettings.includeCommentBlocks,
      languageCommentSupport: newSettings.languageCommentSupport,
    };

    // Update all registered parsers with new config
    for (const parser of this.parserRegistry.getAllParsers()) {
      parser.updateConfig(config);
    }
  }

  // Update parser instance (backward compatibility - updates markdown parser)
  updateParser(newParser: TaskParser): void {
    this.parserRegistry.register(newParser);
  }

  // Process incremental file change (called by EventCoordinator)
  async processIncrementalChange(file: TFile): Promise<void> {
    if (this.isExcluded(file.path)) {
      return;
    }

    try {
      const currentTasks = this.taskStateManager.getTasks();
      const fileTasksBefore = currentTasks.filter(
        (task) => task.path === file.path,
      );

      const fileTasks = await this.scanFile(file);

      // Filter out archived tasks - they are styled but NOT collected
      // Note: Archived tasks are identified using KeywordManager instead
      // of being tracked by individual parsers for consistency across all formats
      const nonArchivedTasks = fileTasks.filter(
        (task) => !this.keywordManager.isArchived(task.state),
      );

      // Skip update if tasks haven't actually changed (identity comparison by path, line, rawText)
      if (this.tasksIdentical(fileTasksBefore, nonArchivedTasks)) {
        return;
      }

      const updatedTasks = currentTasks.filter(
        (task) => task.path !== file.path,
      );
      updatedTasks.push(...nonArchivedTasks);

      updatedTasks.sort(taskComparator);

      this.taskStateManager.setTasks(updatedTasks);

      this.emit('tasks-changed', updatedTasks);
    } catch (err) {
      console.error('VaultScanner processIncrementalChange error', err);
      this.emit(
        'scan-error',
        err instanceof Error ? err : new Error(String(err)),
      );
    }
  }

  // Compare two task arrays for equality (path, line, rawText)
  private tasksIdentical(before: Task[], after: Task[]): boolean {
    if (before.length !== after.length) {
      return false;
    }
    for (let i = 0; i < before.length; i++) {
      const b = before[i];
      const a = after[i];
      if (b.path !== a.path || b.line !== a.line || b.rawText !== a.rawText) {
        return false;
      }
    }
    return true;
  }

  // Process file deletion (called by EventCoordinator)
  async processFileDelete(file: TFile): Promise<void> {
    try {
      const currentTasks = this.taskStateManager.getTasks();
      const updatedTasks = currentTasks.filter(
        (task) => task.path !== file.path,
      );

      updatedTasks.sort(taskComparator);
      this.taskStateManager.setTasks(updatedTasks);
      this.emit('tasks-changed', updatedTasks);
    } catch (err) {
      console.error('VaultScanner processFileDelete error', err);
      this.emit(
        'scan-error',
        err instanceof Error ? err : new Error(String(err)),
      );
    }
  }

  // Process file rename (called by EventCoordinator)
  async processFileRename(file: TFile, oldPath: string): Promise<void> {
    try {
      const currentTasks = this.taskStateManager.getTasks();

      const updatedTasks = currentTasks.filter((t) => t.path !== oldPath);

      if (!this.isExcluded(file.path)) {
        const fileTasks = await this.scanFile(file);
        updatedTasks.push(...fileTasks);
      }

      updatedTasks.sort(taskComparator);
      this.taskStateManager.setTasks(updatedTasks);
      this.emit('tasks-changed', updatedTasks);
    } catch (err) {
      console.error('VaultScanner processFileRename error', err);
      this.emit(
        'scan-error',
        err instanceof Error ? err : new Error(String(err)),
      );
    }
  }

  // Utility method to yield to event loop
  private async yieldToEventLoop(): Promise<void> {
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => resolve()),
    );
  }

  // Clean up resources
  destroy(): void {
    // Clear all event listeners
    this.eventListeners.clear();
  }
}
