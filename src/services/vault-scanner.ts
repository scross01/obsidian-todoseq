import { App, TFile, TAbstractFile } from 'obsidian';
import { Task } from '../task';
import { TaskParser } from '../parser/task-parser';
import { TodoTrackerSettings } from '../settings/settings';
import { taskComparator } from '../utils/task-utils';

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
  private refreshIntervalId: number | null = null;
  private eventListeners: Map<
    keyof VaultScannerEvents,
    ((...args: unknown[]) => void)[]
  > = new Map();

  constructor(
    private app: App,
    private settings: TodoTrackerSettings,
    private parser: TaskParser
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
  }

  // Event management methods
  on<T extends keyof VaultScannerEvents>(
    event: T,
    listener: VaultScannerEvents[T]
  ): void {
    const listeners = this.eventListeners.get(event) || [];
    listeners.push(listener);
    this.eventListeners.set(event, listeners);
  }

  off<T extends keyof VaultScannerEvents>(
    event: T,
    listener: VaultScannerEvents[T]
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
          error
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
        error instanceof Error ? error : new Error(String(error))
      );
    } finally {
      this._isScanning = false;
    }
  }

  /**
   * Scans a single file for tasks using Vault.read() API for safe, serialized file reading
   *
   * @param file The TFile to scan for tasks
   */
  async scanFile(file: TFile): Promise<void> {
    const content = await this.app.vault.read(file);

    if (!this.parser) {
      // Lazily create if not already set (should be set by constructor)
      this.parser = TaskParser.create(this.settings);
    }

    const parsed = this.parser.parseFile(content, file.path);
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
        err instanceof Error ? err : new Error(String(err))
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
        err instanceof Error ? err : new Error(String(err))
      );
    }
  }

  // Run a regular refresh of the vault based on the refresh interval
  setupPeriodicRefresh(intervalSeconds: number): void {
    // Clear any previous interval
    if (this.refreshIntervalId) {
      window.clearInterval(this.refreshIntervalId);
    }

    // Use a serialized async tick to avoid overlap and unhandled rejections
    this.refreshIntervalId = window.setInterval(async () => {
      if (this._isScanning) return;
      this._isScanning = true;
      try {
        await this.scanVault();
      } catch (err) {
        console.error('VaultScanner periodic scan error', err);
        this.emit(
          'scan-error',
          err instanceof Error ? err : new Error(String(err))
        );
      } finally {
        this._isScanning = false;
      }
    }, intervalSeconds * 1000);
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
  updateSettings(newSettings: TodoTrackerSettings): void {
    this.settings = newSettings;
    // Recreate parser with new settings
    this.updateParser(TaskParser.create(newSettings));
  }

  // Update parser instance
  updateParser(newParser: TaskParser): void {
    this.parser = newParser;
  }

  // Utility method to yield to event loop
  private async yieldToEventLoop(): Promise<void> {
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => resolve())
    );
  }

  // Clean up resources
  destroy(): void {
    if (this.refreshIntervalId) {
      window.clearInterval(this.refreshIntervalId);
      this.refreshIntervalId = null;
    }
    // Clear all event listeners
    this.eventListeners.clear();
  }
}
