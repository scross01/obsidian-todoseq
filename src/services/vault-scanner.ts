import { App, TFile, TAbstractFile } from 'obsidian';
import { Task } from '../task';
import { TaskParser } from '../parser/task-parser';
import { TodoTrackerSettings } from '../settings/settings';
import { taskComparator } from '../utils/task-sort';
import {
  parseUrgencyCoefficients,
  UrgencyCoefficients,
} from '../utils/task-urgency';
import { TaskStateManager } from './task-state-manager';
import { RegexCache } from '../utils/regex-cache';

// Define the event types that VaultScanner will emit
export interface VaultScannerEvents {
  'tasks-changed': (tasks: Task[]) => void;
  'scan-started': () => void;
  'scan-completed': () => void;
  'scan-error': (error: Error) => void;
}

export class VaultScanner {
  private _isScanning = false;
  private eventListeners: Map<
    keyof VaultScannerEvents,
    ((...args: unknown[]) => void)[]
  > = new Map();
  private urgencyCoefficients!: UrgencyCoefficients;
  private regexCache = new RegexCache();

  constructor(
    private app: App,
    private settings: TodoTrackerSettings,
    private parser: TaskParser,
    private taskStateManager: TaskStateManager,
    urgencyCoefficients?: UrgencyCoefficients,
  ) {
    // Initialize event listeners map
    const eventKeys: Array<keyof VaultScannerEvents> = [
      'tasks-changed',
      'scan-started',
      'scan-completed',
      'scan-error',
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
      const YIELD_EVERY_FILES = 20;
      let processedMd = 0;

      for (const file of files) {
        if (file.extension === 'md' && !this.isExcluded(file.path)) {
          const fileTasks = await this.scanFile(file);
          newTasks.push(...fileTasks);
          processedMd++;

          if (processedMd % YIELD_EVERY_FILES === 0) {
            // Yield to the event loop to keep UI responsive during large scans
            await this.yieldToEventLoop();
          }
        }
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
        `VaultScanner: scanVault completed in ${scanDuration.toFixed(2)}ms (${newTasks.length} tasks found)`,
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
          // Invalid pattern - skip it
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
    const content = await this.app.vault.cachedRead(file);

    if (!this.parser) {
      // Lazily create if not already set (should be set by constructor)
      this.parser = TaskParser.create(
        this.settings,
        this.app,
        this.urgencyCoefficients,
      );
    }

    const parsed = this.parser.parseFile(content, file.path, file);
    return parsed;
  }

  /**
   * Handles file change events (create, modify, delete) with incremental updates.
   *
   * File Operation Strategy:
   * - Uses getAbstractFileByPath() for direct file lookup (better performance than iteration)
   * - Filters by file extension to only process .md files (avoids unnecessary processing)
   * - Checks file existence before operations to handle delete events safely
   *
   * @param file The file that changed
   */
  async handleFileChange(file: TAbstractFile): Promise<void> {
    try {
      // Only process Markdown files that are not excluded
      if (
        !(file instanceof TFile) ||
        file.extension !== 'md' ||
        this.isExcluded(file.path)
      )
        return;

      // Get current tasks and remove existing tasks for this file
      const currentTasks = this.taskStateManager.getTasks();
      const updatedTasks = currentTasks.filter(
        (task) => task.path !== file.path,
      );

      // Check if the file still exists before attempting to read it (delete events)
      // Using getAbstractFileByPath() is more efficient than iterating all files
      const stillExists =
        this.app.vault.getAbstractFileByPath(file.path) instanceof TFile;
      if (stillExists) {
        // Re-scan the file
        const fileTasks = await this.scanFile(file);
        updatedTasks.push(...fileTasks);
      }

      // Maintain default sort after incremental updates
      updatedTasks.sort(taskComparator);

      // Update the centralized state manager
      this.taskStateManager.setTasks(updatedTasks);

      // Emit events for backward compatibility
      this.emit('tasks-changed', updatedTasks);
    } catch (err) {
      console.error('VaultScanner handleFileChange error', err);
      this.emit(
        'scan-error',
        err instanceof Error ? err : new Error(String(err)),
      );
    }
  }

  // Handle rename: remove tasks for the old path, then scan the new file location
  async handleFileRename(file: TAbstractFile, oldPath: string): Promise<void> {
    try {
      // Get current tasks and remove existing tasks for the old path
      const currentTasks = this.taskStateManager.getTasks();
      const updatedTasks = currentTasks.filter((t) => t.path !== oldPath);

      // If the file still exists (it should after rename), scan it at its new location
      if (file instanceof TFile && !this.isExcluded(file.path)) {
        const fileTasks = await this.scanFile(file);
        updatedTasks.push(...fileTasks);
      }

      // If the file still exists (it should after rename), scan it at its new location
      if (file instanceof TFile) {
        const fileTasks = await this.scanFile(file);
        updatedTasks.push(...fileTasks);
      }

      // Keep sorted state
      updatedTasks.sort(taskComparator);

      // Update the centralized state manager
      this.taskStateManager.setTasks(updatedTasks);

      // Emit events for backward compatibility
      this.emit('tasks-changed', updatedTasks);
    } catch (err) {
      console.error('VaultScanner handleFileRename error', err);
      this.emit(
        'scan-error',
        err instanceof Error ? err : new Error(String(err)),
      );
    }
  }

  // Get the current tasks from the state manager
  getTasks(): Task[] {
    return this.taskStateManager.getTasks();
  }

  // Get the TaskStateManager instance
  getTaskStateManager(): TaskStateManager {
    return this.taskStateManager;
  }

  // Get the current parser instance
  getParser(): TaskParser | null {
    return this.parser;
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
    this.updateParser(
      TaskParser.create(newSettings, this.app, this.urgencyCoefficients),
    );
  }

  // Update parser instance
  updateParser(newParser: TaskParser): void {
    this.parser = newParser;
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
