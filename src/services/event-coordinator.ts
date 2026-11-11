import { App, TFile, TAbstractFile, EventRef } from 'obsidian';
import { TaskStateManager } from './task-state-manager';
import { VaultScanner } from './vault-scanner';
import { PropertySearchEngine } from './property-search-engine';
import { EventEmitter } from '../utils/event-emitter';

export type FileChangeType = 'create' | 'modify' | 'delete' | 'rename';

export interface FileChangeEvent {
  type: FileChangeType;
  file: TFile;
  oldPath?: string;
  timestamp: number;
}

export interface EventCoordinatorEvents {
  'file-changed': (event: FileChangeEvent) => void;
  'file-deleted': (event: FileChangeEvent) => void;
  'batch-complete': (events: FileChangeEvent[]) => void;
}

export class EventCoordinator extends EventEmitter<EventCoordinatorEvents> {
  private app: App;
  private taskStateManager: TaskStateManager;
  private vaultScanner: VaultScanner | null;
  private propertySearchEngine: PropertySearchEngine | null;

  private readonly FILE_DEBOUNCE_MS = 150;

  // External callbacks for file change notifications (e.g., embedded task lists)
  private fileChangeCallbacks: ((event: FileChangeEvent) => void)[] = [];

  private pendingEvents = new Map<string, FileChangeEvent>();
  private batchTimeout: number | null = null;
  private fileChangeTimeouts = new Map<string, number>();

  private vaultModifyRef: EventRef | null = null;
  private vaultCreateRef: EventRef | null = null;
  private vaultDeleteRef: EventRef | null = null;
  private vaultRenameRef: EventRef | null = null;
  private metadataChangeRef: EventRef | null = null;

  private isReady = false;
  private isProcessing = false;
  private processingPromise: Promise<void> | null = null;

  constructor(
    app: App,
    taskStateManager: TaskStateManager,
    vaultScanner: VaultScanner | null = null,
    propertySearchEngine: PropertySearchEngine | null = null,
  ) {
    super('EventCoordinator');
    this.app = app;
    this.taskStateManager = taskStateManager;
    this.vaultScanner = vaultScanner;
    this.propertySearchEngine = propertySearchEngine;
  }

  initialize(): void {
    if (this.isReady) return;

    this.registerVaultListeners();
    this.isReady = true;
  }

  /**
   * Register a callback for file change notifications.
   * This is used by components like EmbeddedTaskListEventHandler
   * to receive file change notifications without their own vault listeners.
   */
  onFileChange(callback: (event: FileChangeEvent) => void): void {
    this.fileChangeCallbacks.push(callback);
  }

  private registerVaultListeners(): void {
    this.vaultModifyRef = this.app.vault.on('modify', (file) => {
      this.handleVaultEvent('modify', file);
    });

    this.vaultCreateRef = this.app.vault.on('create', (file) => {
      this.handleVaultEvent('create', file);
    });

    this.vaultDeleteRef = this.app.vault.on('delete', (file) => {
      this.handleVaultEvent('delete', file);
    });

    this.vaultRenameRef = this.app.vault.on('rename', (file, oldPath) => {
      this.handleVaultRename(file, oldPath);
    });

    this.metadataChangeRef = this.app.metadataCache.on('changed', (file) => {
      if (file instanceof TFile) {
        this.handleMetadataChange(file);
      }
    });
  }

  /**
   * Whether a live file event may produce tasks. Uses the scanner's live
   * settings so configured Org/code formats behave like a scan; attachments
   * and unsupported formats stay cheap. Falls back to Markdown without a
   * scanner (tests and early startup).
   */
  private isEligibleFile(file: TFile): boolean {
    if (!this.vaultScanner) return file.extension === 'md';
    const scanner = this.vaultScanner as VaultScanner & {
      isScannableFile?: (file: TFile) => boolean;
    };
    return typeof scanner.isScannableFile === 'function'
      ? scanner.isScannableFile(file)
      : file.extension === 'md';
  }

  /** Whether any collected task currently lives at this path. */
  private hasCollectedTasks(path: string): boolean {
    return this.taskStateManager.getTasks().some((task) => task.path === path);
  }

  /**
   * Drop pending debounce/queued work for a path. Captured as a string: a
   * TFile.path mutates on rename, so a timer that fires later must not look up
   * (or queue) the new path under the old key.
   */
  private cancelPendingFileWork(path: string): void {
    const timeout = this.fileChangeTimeouts.get(path);
    if (timeout !== undefined) {
      window.clearTimeout(timeout);
      this.fileChangeTimeouts.delete(path);
    }
    this.pendingEvents.delete(path);
  }

  private handleVaultEvent(type: FileChangeType, file: TAbstractFile): void {
    if (!(file instanceof TFile)) {
      return;
    }

    const tFile = file;
    const filePath = tFile.path;

    // Don't debounce delete events - file won't receive further changes.
    // Forward when the path is eligible now, or still holds collected tasks
    // (a format disabled since it was scanned).
    if (type === 'delete') {
      this.cancelPendingFileWork(filePath);
      if (this.isEligibleFile(tFile) || this.hasCollectedTasks(filePath)) {
        this.queueFileEvent({
          type,
          file: tFile,
          timestamp: Date.now(),
        });
      }
      return;
    }

    if (!this.isEligibleFile(tFile)) {
      return;
    }

    const existingTimeout = this.fileChangeTimeouts.get(filePath);
    if (existingTimeout) {
      window.clearTimeout(existingTimeout);
    }

    const timeout = window.setTimeout(() => {
      this.fileChangeTimeouts.delete(filePath);
      this.queueFileEvent({
        type,
        file: tFile,
        timestamp: Date.now(),
      });
    }, this.FILE_DEBOUNCE_MS);

    this.fileChangeTimeouts.set(filePath, timeout);
  }

  private handleVaultRename(file: TAbstractFile, oldPath: string): void {
    if (!(file instanceof TFile)) {
      return;
    }

    // A rename must clean up the OLD path even when the destination is no
    // longer a supported format, and even when the old file had no tasks.
    this.cancelPendingFileWork(oldPath);

    const newPath = file.path;
    if (
      !this.isEligibleFile(file) &&
      !this.hasCollectedTasks(oldPath) &&
      !this.hasCollectedTasks(newPath)
    ) {
      return;
    }

    this.queueFileEvent({
      type: 'rename',
      file: file,
      oldPath,
      timestamp: Date.now(),
    });
  }

  private handleMetadataChange(file: TFile): void {
    if (this.propertySearchEngine?.isReady()) {
      this.propertySearchEngine.onFileChanged(file);
    }
  }

  private queueFileEvent(event: FileChangeEvent): void {
    this.pendingEvents.set(event.file.path, event);

    void this.processBatch().catch((error) => {
      console.error('Error processing file event batch:', error);
    });
  }

  private async processBatch(): Promise<void> {
    if (this.isProcessing) {
      if (this.processingPromise) {
        await this.processingPromise;
      }
      // Re-check rather than returning on faith. The drain loop picks up
      // anything queued before it exits, so today this cannot find work — but
      // that is a property of where the loop's exit check sits, not of this
      // function, and moving the emit or the callbacks outside the loop would
      // strand the event silently.
      if (this.pendingEvents.size === 0) {
        return;
      }
    }

    if (this.pendingEvents.size === 0) {
      return;
    }

    this.isProcessing = true;
    const processingPromise = this.drainPendingEvents();
    this.processingPromise = processingPromise;

    try {
      await processingPromise;
    } finally {
      if (this.processingPromise === processingPromise) {
        this.processingPromise = null;
      }
    }
  }

  private async drainPendingEvents(): Promise<void> {
    try {
      while (this.pendingEvents.size > 0) {
        const events = Array.from(this.pendingEvents.values());
        this.pendingEvents.clear();

        const processedPaths = new Set<string>();

        for (const event of events) {
          if (processedPaths.has(event.file.path)) {
            continue;
          }
          processedPaths.add(event.file.path);

          try {
            await this.processFileEvent(event);
          } catch (error) {
            console.error(
              `Error processing file event for ${event.file.path}:`,
              error,
            );
          }
        }

        this.emit('batch-complete', events);

        // Notify external callbacks (e.g., embedded task lists)
        for (const callback of this.fileChangeCallbacks) {
          try {
            events.forEach(callback);
          } catch (error) {
            console.error(
              'Error in EventCoordinator file change callback:',
              error,
            );
          }
        }
      }
    } finally {
      this.isProcessing = false;
    }
  }

  private async processFileEvent(event: FileChangeEvent): Promise<void> {
    const { type, file, oldPath } = event;

    switch (type) {
      case 'create':
      case 'modify':
        if (this.vaultScanner) {
          await this.vaultScanner.processIncrementalChange(file);
        }
        if (this.propertySearchEngine?.isReady()) {
          this.propertySearchEngine.onFileChanged(file);
        }
        this.emit('file-changed', event);
        break;

      case 'delete':
        if (this.vaultScanner) {
          await this.vaultScanner.processFileDelete(file);
        }
        if (this.propertySearchEngine?.isReady()) {
          this.propertySearchEngine.onFileDeleted(file);
        }
        this.emit('file-deleted', event);
        break;

      case 'rename':
        if (this.vaultScanner && oldPath) {
          await this.vaultScanner.processFileRename(file, oldPath);
        }
        if (this.propertySearchEngine?.isReady() && oldPath) {
          this.propertySearchEngine.onFileRenamed(file, oldPath);
        }
        this.emit('file-changed', event);
        break;
    }
  }

  async flush(): Promise<void> {
    if (this.batchTimeout) {
      window.clearTimeout(this.batchTimeout);
      this.batchTimeout = null;
    }
    if (this.processingPromise) {
      await this.processingPromise;
    } else {
      await this.processBatch();
    }
  }

  async destroy(): Promise<void> {
    // Flush any pending events before clearing timeouts
    await this.flush();

    this.fileChangeTimeouts.forEach((timeout) => window.clearTimeout(timeout));
    this.fileChangeTimeouts.clear();

    if (this.vaultModifyRef) {
      this.app.vault.offref(this.vaultModifyRef);
    }
    if (this.vaultCreateRef) {
      this.app.vault.offref(this.vaultCreateRef);
    }
    if (this.vaultDeleteRef) {
      this.app.vault.offref(this.vaultDeleteRef);
    }
    if (this.vaultRenameRef) {
      this.app.vault.offref(this.vaultRenameRef);
    }
    if (this.metadataChangeRef) {
      this.app.metadataCache.offref(this.metadataChangeRef);
    }

    this.removeAllListeners();
  }

  isCoordinatorReady(): boolean {
    return this.isReady;
  }
}
