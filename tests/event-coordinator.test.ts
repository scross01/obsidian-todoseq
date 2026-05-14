import { EventCoordinator } from '../src/services/event-coordinator';
import { TaskStateManager } from '../src/services/task-state-manager';
import { App, TFile, Vault, MetadataCache } from 'obsidian';
import {
  createTestKeywordManager,
  createBaseSettings,
} from './helpers/test-helper';

// Mock Obsidian's App and Vault
jest.mock('obsidian', () => {
  const originalModule = jest.requireActual('obsidian');

  // Create a mock Vault class that can trigger events
  class MockVault {
    private listeners: Map<string, ((...args: unknown[]) => void)[]> =
      new Map();

    on(event: string, callback: (...args: unknown[]) => void): { ref: number } {
      if (!this.listeners.has(event)) {
        this.listeners.set(event, []);
      }
      this.listeners.get(event)?.push(callback);
      return { ref: Math.random() };
    }

    offref(ref: { ref: number }): void {}

    // Helper method to trigger events in tests
    triggerEvent(event: string, ...args: unknown[]): void {
      const callbacks = this.listeners.get(event) || [];
      callbacks.forEach((callback) => callback(...args));
    }

    getAbstractFileByPath(path: string): TFile | null {
      return null;
    }
  }

  class MockMetadataCache {
    private listeners: Map<string, ((...args: unknown[]) => void)[]> =
      new Map();

    on(event: string, callback: (...args: unknown[]) => void): { ref: number } {
      if (!this.listeners.has(event)) {
        this.listeners.set(event, []);
      }
      this.listeners.get(event)?.push(callback);
      return { ref: Math.random() };
    }

    offref(ref: { ref: number }): void {}

    // Helper method to trigger events in tests
    triggerEvent(event: string, ...args: unknown[]): void {
      const callbacks = this.listeners.get(event) || [];
      callbacks.forEach((callback) => callback(...args));
    }
  }

  return {
    ...originalModule,
    Vault: MockVault as any,
    MetadataCache: MockMetadataCache as any,
  };
});

describe('EventCoordinator', () => {
  let coordinator: EventCoordinator;
  let mockApp: App;
  let mockVault: Vault;
  let mockMetadataCache: MetadataCache;
  let taskStateManager: TaskStateManager;

  beforeEach(() => {
    mockVault = new (Vault as any)();
    mockMetadataCache = new (MetadataCache as any)();
    mockApp = {
      vault: mockVault,
      metadataCache: mockMetadataCache,
    } as unknown as App;

    const settings = createBaseSettings();
    const keywordManager = createTestKeywordManager(settings);
    taskStateManager = new TaskStateManager(keywordManager);

    coordinator = new EventCoordinator(mockApp, taskStateManager);
  });

  afterEach(async () => {
    await coordinator.destroy();
  });

  describe('initialization', () => {
    it('should become ready after initialize', () => {
      expect(coordinator.isCoordinatorReady()).toBe(false);
      coordinator.initialize();
      expect(coordinator.isCoordinatorReady()).toBe(true);
    });

    it('should not register vault listeners on duplicate initialize', () => {
      coordinator.initialize();
      const vaultOnSpy = jest.spyOn(mockVault, 'on');
      coordinator.initialize();
      expect(vaultOnSpy).not.toHaveBeenCalled();
      vaultOnSpy.mockRestore();
    });
  });

  describe('delete event handling', () => {
    it('should process delete events immediately without debouncing', async () => {
      const file = new TFile('test.md', 'test.md', 'md');
      let receivedEvent: any = null;

      coordinator.on('file-deleted', (event) => {
        receivedEvent = event;
      });

      coordinator.initialize();

      (mockVault as any).triggerEvent('delete', file);

      await coordinator.flush();

      expect(receivedEvent).not.toBeNull();
      expect(receivedEvent.type).toBe('delete');
      expect(receivedEvent.file.path).toBe('test.md');
    });

    it('should not create timeout entries for delete events', async () => {
      const file = new TFile('test.md', 'test.md', 'md');
      let receivedEvent: any = null;

      coordinator.on('file-deleted', (event) => {
        receivedEvent = event;
      });

      coordinator.initialize();

      (mockVault as any).triggerEvent('delete', file);

      await coordinator.flush();

      expect(receivedEvent).not.toBeNull();
      expect(receivedEvent.type).toBe('delete');
    });

    it('should still debounce modify events', async () => {
      const file = new TFile('test.md', 'test.md', 'md');
      const receivedEvents: any[] = [];

      coordinator.on('file-changed', (event) => {
        receivedEvents.push(event);
      });

      coordinator.initialize();

      (mockVault as any).triggerEvent('modify', file);
      (mockVault as any).triggerEvent('modify', file);
      (mockVault as any).triggerEvent('modify', file);

      await new Promise((resolve) => setTimeout(resolve, 200));

      await coordinator.flush();

      expect(receivedEvents.length).toBe(1);
      expect(receivedEvents[0].type).toBe('modify');
    });

    it('should still debounce create events', async () => {
      const file = new TFile('test.md', 'test.md', 'md');
      const receivedEvents: any[] = [];

      coordinator.on('file-changed', (event) => {
        receivedEvents.push(event);
      });

      coordinator.initialize();

      (mockVault as any).triggerEvent('create', file);
      (mockVault as any).triggerEvent('create', file);
      (mockVault as any).triggerEvent('create', file);

      await new Promise((resolve) => setTimeout(resolve, 200));

      await coordinator.flush();

      expect(receivedEvents.length).toBe(1);
      expect(receivedEvents[0].type).toBe('create');
    });

    it('should handle mixed delete and modify events correctly', async () => {
      const file = new TFile('test.md', 'test.md', 'md');
      const receivedEvents: any[] = [];

      coordinator.on('file-changed', (event) => {
        receivedEvents.push(event);
      });

      coordinator.on('file-deleted', (event) => {
        receivedEvents.push(event);
      });

      coordinator.initialize();

      (mockVault as any).triggerEvent('modify', file);
      (mockVault as any).triggerEvent('delete', file);

      await new Promise((resolve) => setTimeout(resolve, 200));

      await coordinator.flush();

      expect(receivedEvents.length).toBe(2);
      expect(receivedEvents.some((e) => e.type === 'modify')).toBe(true);
      expect(receivedEvents.some((e) => e.type === 'delete')).toBe(true);
    });
  });

  describe('rename event handling', () => {
    it('should process rename events with oldPath', async () => {
      const listener = jest.fn();
      coordinator.on('file-changed', listener);
      coordinator.initialize();

      const file = new TFile('new.md', 'new.md', 'md');
      (mockVault as any).triggerEvent('rename', file, 'old.md');
      await coordinator.flush();

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'rename',
          oldPath: 'old.md',
        }),
      );
    });

    it('should ignore rename events for non-markdown files', async () => {
      const listener = jest.fn();
      coordinator.on('file-changed', listener);
      coordinator.initialize();

      const nonMdFile = new TFile('test.txt', 'test.txt', 'txt');
      (mockVault as any).triggerEvent('rename', nonMdFile, 'old.txt');
      await coordinator.flush();

      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('metadata change handling', () => {
    it('should call propertySearchEngine on metadata change when ready', () => {
      const mockEngine = {
        isReady: jest.fn().mockReturnValue(true),
        onFileChanged: jest.fn(),
      };
      coordinator.setPropertySearchEngine(mockEngine as any);
      coordinator.initialize();

      const file = new TFile('test.md', 'test.md', 'md');
      (mockMetadataCache as any).triggerEvent('changed', file);

      expect(mockEngine.isReady).toHaveBeenCalled();
      expect(mockEngine.onFileChanged).toHaveBeenCalledWith(file);
    });

    it('should not call onFileChanged when propertySearchEngine is not ready', () => {
      const mockEngine = {
        isReady: jest.fn().mockReturnValue(false),
        onFileChanged: jest.fn(),
      };
      coordinator.setPropertySearchEngine(mockEngine as any);
      coordinator.initialize();

      const file = new TFile('test.md', 'test.md', 'md');
      (mockMetadataCache as any).triggerEvent('changed', file);

      expect(mockEngine.isReady).toHaveBeenCalled();
      expect(mockEngine.onFileChanged).not.toHaveBeenCalled();
    });

    it('should not fail when propertySearchEngine is not set', () => {
      coordinator.initialize();

      const file = new TFile('test.md', 'test.md', 'md');
      expect(() => {
        (mockMetadataCache as any).triggerEvent('changed', file);
      }).not.toThrow();
    });
  });

  describe('non-md file filtering', () => {
    it('should ignore modify events for non-markdown files', async () => {
      const listener = jest.fn();
      coordinator.on('file-changed', listener);
      coordinator.initialize();

      const nonMdFile = new TFile('test.txt', 'test.txt', 'txt');
      (mockVault as any).triggerEvent('modify', nonMdFile);
      await new Promise((resolve) => setTimeout(resolve, 200));
      await coordinator.flush();

      expect(listener).not.toHaveBeenCalled();
    });

    it('should ignore delete events for non-markdown files', async () => {
      const listener = jest.fn();
      coordinator.on('file-deleted', listener);
      coordinator.initialize();

      const nonMdFile = new TFile('test.txt', 'test.txt', 'txt');
      (mockVault as any).triggerEvent('delete', nonMdFile);
      await coordinator.flush();

      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('vaultScanner integration', () => {
    it('should call processIncrementalChange on modify', async () => {
      const mockScanner = {
        processIncrementalChange: jest.fn().mockResolvedValue(undefined),
      };
      coordinator.setVaultScanner(mockScanner as any);
      coordinator.initialize();

      const file = new TFile('test.md', 'test.md', 'md');
      (mockVault as any).triggerEvent('modify', file);
      await new Promise((resolve) => setTimeout(resolve, 200));
      await coordinator.flush();

      expect(mockScanner.processIncrementalChange).toHaveBeenCalledWith(file);
    });

    it('should call processFileDelete on delete', async () => {
      const mockScanner = {
        processFileDelete: jest.fn().mockResolvedValue(undefined),
      };
      coordinator.setVaultScanner(mockScanner as any);
      coordinator.initialize();

      const file = new TFile('test.md', 'test.md', 'md');
      (mockVault as any).triggerEvent('delete', file);
      await coordinator.flush();

      expect(mockScanner.processFileDelete).toHaveBeenCalledWith(file);
    });

    it('should call processFileRename on rename with oldPath', async () => {
      const mockScanner = {
        processFileRename: jest.fn().mockResolvedValue(undefined),
      };
      coordinator.setVaultScanner(mockScanner as any);
      coordinator.initialize();

      const file = new TFile('new.md', 'new.md', 'md');
      (mockVault as any).triggerEvent('rename', file, 'old.md');
      await coordinator.flush();

      expect(mockScanner.processFileRename).toHaveBeenCalledWith(
        file,
        'old.md',
      );
    });

    it('should continue processing after vaultScanner errors', async () => {
      const mockScanner = {
        processIncrementalChange: jest
          .fn()
          .mockRejectedValueOnce(new Error('scan failed'))
          .mockResolvedValueOnce(undefined),
      };
      coordinator.setVaultScanner(mockScanner as any);

      const listener = jest.fn();
      coordinator.on('file-changed', listener);
      coordinator.initialize();

      const file1 = new TFile('test1.md', 'test1.md', 'md');
      (mockVault as any).triggerEvent('modify', file1);
      await new Promise((resolve) => setTimeout(resolve, 200));
      await coordinator.flush();

      expect(listener).not.toHaveBeenCalled();

      const file2 = new TFile('test2.md', 'test2.md', 'md');
      (mockVault as any).triggerEvent('modify', file2);
      await new Promise((resolve) => setTimeout(resolve, 200));
      await coordinator.flush();

      expect(listener).toHaveBeenCalledTimes(1);
    });
  });

  describe('propertySearchEngine integration', () => {
    it('should call onFileChanged on modify', async () => {
      const mockEngine = {
        isReady: jest.fn().mockReturnValue(true),
        onFileChanged: jest.fn(),
      };
      coordinator.setPropertySearchEngine(mockEngine as any);
      coordinator.initialize();

      const file = new TFile('test.md', 'test.md', 'md');
      (mockVault as any).triggerEvent('modify', file);
      await new Promise((resolve) => setTimeout(resolve, 200));
      await coordinator.flush();

      expect(mockEngine.isReady).toHaveBeenCalled();
      expect(mockEngine.onFileChanged).toHaveBeenCalledWith(file);
    });

    it('should call onFileDeleted on delete', async () => {
      const mockEngine = {
        isReady: jest.fn().mockReturnValue(true),
        onFileDeleted: jest.fn(),
      };
      coordinator.setPropertySearchEngine(mockEngine as any);
      coordinator.initialize();

      const file = new TFile('test.md', 'test.md', 'md');
      (mockVault as any).triggerEvent('delete', file);
      await coordinator.flush();

      expect(mockEngine.isReady).toHaveBeenCalled();
      expect(mockEngine.onFileDeleted).toHaveBeenCalledWith(file);
    });

    it('should call onFileRenamed on rename', async () => {
      const mockEngine = {
        isReady: jest.fn().mockReturnValue(true),
        onFileRenamed: jest.fn(),
      };
      coordinator.setPropertySearchEngine(mockEngine as any);
      coordinator.initialize();

      const file = new TFile('new.md', 'new.md', 'md');
      (mockVault as any).triggerEvent('rename', file, 'old.md');
      await coordinator.flush();

      expect(mockEngine.isReady).toHaveBeenCalled();
      expect(mockEngine.onFileRenamed).toHaveBeenCalledWith(file, 'old.md');
    });
  });

  describe('external file change callbacks', () => {
    it('should call registered callbacks after batch processing', async () => {
      const callback = jest.fn();
      coordinator.onFileChange(callback);
      coordinator.initialize();

      const file = new TFile('test.md', 'test.md', 'md');
      (mockVault as any).triggerEvent('delete', file);
      await coordinator.flush();

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'delete',
          file,
        }),
        expect.any(Number),
        expect.any(Array),
      );
    });

    it('should handle errors in file change callbacks', async () => {
      const throwingCallback = jest.fn().mockImplementation(() => {
        throw new Error('callback error');
      });
      const normalCallback = jest.fn();

      coordinator.onFileChange(throwingCallback);
      coordinator.onFileChange(normalCallback);
      coordinator.initialize();

      const file = new TFile('test.md', 'test.md', 'md');
      (mockVault as any).triggerEvent('delete', file);
      await coordinator.flush();

      expect(throwingCallback).toHaveBeenCalled();
      expect(normalCallback).toHaveBeenCalled();
    });
  });

  describe('event listener management', () => {
    it('should remove listeners via off()', async () => {
      const listener = jest.fn();
      coordinator.on('file-changed', listener);
      coordinator.initialize();

      const file1 = new TFile('test1.md', 'test1.md', 'md');
      (mockVault as any).triggerEvent('rename', file1, 'old1.md');
      await coordinator.flush();
      expect(listener).toHaveBeenCalledTimes(1);

      coordinator.off('file-changed', listener);

      const file2 = new TFile('test2.md', 'test2.md', 'md');
      (mockVault as any).triggerEvent('rename', file2, 'old2.md');
      await coordinator.flush();
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('should handle errors in event listeners without affecting others', async () => {
      const throwingListener = jest.fn().mockImplementation(() => {
        throw new Error('listener error');
      });
      const normalListener = jest.fn();

      coordinator.on('file-deleted', throwingListener);
      coordinator.on('file-deleted', normalListener);
      coordinator.initialize();

      const file = new TFile('test.md', 'test.md', 'md');
      (mockVault as any).triggerEvent('delete', file);
      await coordinator.flush();

      expect(throwingListener).toHaveBeenCalledTimes(1);
      expect(normalListener).toHaveBeenCalledTimes(1);
    });
  });

  describe('cleanup', () => {
    it('should stop processing events after destroy', async () => {
      const listener = jest.fn();
      coordinator.on('file-changed', listener);
      coordinator.initialize();

      const file1 = new TFile('test1.md', 'test1.md', 'md');
      (mockVault as any).triggerEvent('modify', file1);
      await new Promise((resolve) => setTimeout(resolve, 200));
      await coordinator.flush();
      expect(listener).toHaveBeenCalledTimes(1);

      await coordinator.destroy();

      const file2 = new TFile('test2.md', 'test2.md', 'md');
      (mockVault as any).triggerEvent('modify', file2);
      await new Promise((resolve) => setTimeout(resolve, 200));
      await coordinator.flush();

      expect(listener).toHaveBeenCalledTimes(1);
    });
  });
});
