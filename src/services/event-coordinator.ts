import { App, TFile, TAbstractFile, EventRef } from 'obsidian';
import { TaskStateManager } from './task-state-manager';
import { VaultScanner } from './vault-scanner';
import { PropertySearchEngine } from './property-search-engine';

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

export class EventCoordinator {
  private app: App;
  private taskStateManager: TaskStateManager;
  private vaultScanner: VaultScanner | null = null;
  private propertySearchEngine: PropertySearchEngine | null = null;

  private readonly FILE_DEBOUNCE_MS = 150;
  private readonly BATCH_DELAY_MS = 0;

  // External callbacks for file change notifications (e.g., embedded task lists)
  private fileChangeCallbacks: ((event: FileChangeEvent) => void)[] = [];

  private pendingEvents = new Map<string, FileChangeEvent>();
  private batchTimeout: ReturnType<typeof setTimeout> | null = null;
  private fileChangeTimeouts = new Map<string, ReturnType<typeof setTimeout>>();

  private vaultModifyRef: EventRef | null = null;
  private vaultCreateRef: EventRef | null = null;
  private vaultDeleteRef: EventRef | null = null;
  private vaultRenameRef: EventRef | null = null;
  private metadataChangeRef: EventRef | null = null;

  private isReady = false;
  private isProcessing = false;

  private eventListeners: Map<
    keyof EventCoordinatorEvents,
    ((...args: unknown[]) => void)[]
  > = new Map();

  constructor(app: App, taskStateManager: TaskStateManager) {
    this.app = app;
    this.taskStateManager = taskStateManager;

    const eventKeys: Array<keyof EventCoordinatorEvents> = [
      'file-changed',
      'file-deleted',
      'batch-complete',
    ];
    eventKeys.forEach((event) => {
      this.eventListeners.set(event, []);
    });
  }

  initialize(): void {
    if (this.isReady) return;

    this.registerVaultListeners();
    this.isReady = true;
  }

  setVaultScanner(vaultScanner: VaultScanner): void {
    this.vaultScanner = vaultScanner;
  }

  setPropertySearchEngine(engine: PropertySearchEngine): void {
    this.propertySearchEngine = engine;
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

  private handleVaultEvent(type: FileChangeType, file: TAbstractFile): void {
    if (!(file instanceof TFile) || file.extension !== 'md') {
      return;
    }

    const tFile = file as TFile;

    const existingTimeout = this.fileChangeTimeouts.get(tFile.path);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }

    const timeout = setTimeout(() => {
      this.fileChangeTimeouts.delete(tFile.path);
      this.queueFileEvent({
        type,
        file: tFile,
        timestamp: Date.now(),
      });
    }, this.FILE_DEBOUNCE_MS);

    this.fileChangeTimeouts.set(tFile.path, timeout);
  }

  private handleVaultRename(file: TAbstractFile, oldPath: string): void {
    if (!(file instanceof TFile) || file.extension !== 'md') {
      return;
    }

    this.queueFileEvent({
      type: 'rename',
      file: file as TFile,
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

    if (this.BATCH_DELAY_MS === 0) {
      // Process immediately without debounce
      this.processBatch();
      return;
    }

    if (this.batchTimeout) {
      clearTimeout(this.batchTimeout);
    }

    this.batchTimeout = setTimeout(() => {
      this.processBatch();
    }, this.BATCH_DELAY_MS);
  }

  private async processBatch(): Promise<void> {
    if (this.isProcessing || this.pendingEvents.size === 0) {
      return;
    }

    this.isProcessing = true;

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
        console.error('Error in EventCoordinator file change callback:', error);
      }
    }

    this.isProcessing = false;
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

  flush(): void {
    if (this.batchTimeout) {
      clearTimeout(this.batchTimeout);
      this.batchTimeout = null;
    }
    this.processBatch();
  }

  on<T extends keyof EventCoordinatorEvents>(
    event: T,
    listener: EventCoordinatorEvents[T],
  ): void {
    const listeners = this.eventListeners.get(event) || [];
    listeners.push(listener);
    this.eventListeners.set(event, listeners);
  }

  off<T extends keyof EventCoordinatorEvents>(
    event: T,
    listener: EventCoordinatorEvents[T],
  ): void {
    const listeners = this.eventListeners.get(event) || [];
    const filtered = listeners.filter((l) => l !== listener);
    this.eventListeners.set(event, filtered);
  }

  private emit<T extends keyof EventCoordinatorEvents>(
    event: T,
    ...args: Parameters<EventCoordinatorEvents[T]>
  ): void {
    const listeners = this.eventListeners.get(event) || [];
    listeners.forEach((listener) => {
      try {
        listener(...args);
      } catch (error) {
        console.error(
          `Error in EventCoordinator listener for ${String(event)}:`,
          error,
        );
      }
    });
  }

  destroy(): void {
    if (this.batchTimeout) {
      clearTimeout(this.batchTimeout);
    }
    this.fileChangeTimeouts.forEach((timeout) => clearTimeout(timeout));
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

    this.eventListeners.clear();
  }

  isCoordinatorReady(): boolean {
    return this.isReady;
  }
}
