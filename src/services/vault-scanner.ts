import { App, TFile, TAbstractFile } from 'obsidian';
import { Task } from '../task';
import { TaskParser } from '../parser/task-parser';
import { TodoTrackerSettings } from '../settings/settings';
import { taskComparator } from '../utils/task-utils';
import {
  parseUrgencyCoefficients,
  UrgencyCoefficients,
} from '../utils/task-urgency';

// Define the event types that VaultScanner will emit
export interface VaultScannerEvents {
  'tasks-changed': (tasks: Task[]) => void;
  'scan-started': () => void;
  'scan-completed': () => void;
  'scan-error': (error: Error) => void;
}

export class VaultScanner {
  private tasks: Task[] = [];
  private _isScanning = false;
  private eventListeners: Map<
    keyof VaultScannerEvents,
    ((...args: unknown[]) => void)[]
  > = new Map();
  private urgencyCoefficients: UrgencyCoefficients;

  constructor(
    private app: App,
    private settings: TodoTrackerSettings,
    private parser: TaskParser,
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

    try {
      this.emit('scan-started');
      this.tasks = [];
      const files = this.app.vault.getFiles();

      // Yield configuration: how often to yield a frame while scanning
      const YIELD_EVERY_FILES = 20;
      let processedMd = 0;

      for (const file of files) {
        if (file.extension === 'md') {
          await this.scanFile(file);
          processedMd++;

          if (processedMd % YIELD_EVERY_FILES === 0) {
            // Yield to the event loop to keep UI responsive during large scans
            await this.yieldToEventLoop();
          }
        }
      }

      // Default sort
      this.tasks.sort(taskComparator);

      // Emit tasks-changed event with new task list
      this.emit('tasks-changed', [...this.tasks]);
      this.emit('scan-completed');
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
   * Scans a single file for tasks using Vault.cachedRead() API for better performance
   *
   * @param file The TFile to scan for tasks
   */
  async scanFile(file: TFile): Promise<void> {
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
    this.tasks.push(...parsed);
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
      // Only process Markdown files
      if (!(file instanceof TFile) || file.extension !== 'md') return;

      // Remove existing tasks for this file (path-safe even if file was deleted/renamed)
      this.tasks = this.tasks.filter((task) => task.path !== file.path);

      // Check if the file still exists before attempting to read it (delete events)
      // Using getAbstractFileByPath() is more efficient than iterating all files
      const stillExists =
        this.app.vault.getAbstractFileByPath(file.path) instanceof TFile;
      if (stillExists) {
        // Re-scan the file
        await this.scanFile(file);
      }

      // Maintain default sort after incremental updates
      this.tasks.sort(taskComparator);

      // Emit tasks-changed event with updated task list
      this.emit('tasks-changed', [...this.tasks]);
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
      // Remove existing tasks for the old path
      this.tasks = this.tasks.filter((t) => t.path !== oldPath);

      // If the file still exists (it should after rename), scan it at its new location
      if (file instanceof TFile) {
        await this.scanFile(file);
      }

      // Keep sorted state
      this.tasks.sort(taskComparator);

      // Emit tasks-changed event with updated task list
      this.emit('tasks-changed', [...this.tasks]);
    } catch (err) {
      console.error('VaultScanner handleFileRename error', err);
      this.emit(
        'scan-error',
        err instanceof Error ? err : new Error(String(err)),
      );
    }
  }

  // Get a copy of the current tasks
  getTasks(): Task[] {
    return [...this.tasks];
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
