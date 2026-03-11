/**
 * Unit tests for EventCoordinator
 */

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

    offref(ref: { ref: number }): void {
      // In a real implementation, we'd remove the listener by ref
      // For simplicity in tests, we just acknowledge the call
    }

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

    offref(ref: { ref: number }): void {
      // In a real implementation, we'd remove the listener by ref
      // For simplicity in tests, we just acknowledge the call
    }

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
    // Create mock app with vault and metadata cache
    mockVault = new (Vault as any)();
    mockMetadataCache = new (MetadataCache as any)();
    mockApp = {
      vault: mockVault,
      metadataCache: mockMetadataCache,
    } as unknown as App;

    // Create task state manager
    const settings = createBaseSettings();
    const keywordManager = createTestKeywordManager(settings);
    taskStateManager = new TaskStateManager(keywordManager);

    // Create coordinator
    coordinator = new EventCoordinator(mockApp, taskStateManager);
  });

  afterEach(async () => {
    await coordinator.destroy();
  });

  describe('delete event handling', () => {
    it('should process delete events immediately without debouncing', async () => {
      const file = new TFile('test.md', 'test.md', 'md');
      let receivedEvent: any = null;

      coordinator.on('file-deleted', (event) => {
        receivedEvent = event;
      });

      coordinator.initialize();

      // Trigger delete event
      (mockVault as any).triggerEvent('delete', file);

      // Event should be processed immediately (no debounce delay)
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

      // Trigger delete event
      (mockVault as any).triggerEvent('delete', file);

      // Immediately flush - if there was a timeout, this would wait
      await coordinator.flush();

      // Event should be received
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

      // Trigger multiple modify events rapidly
      (mockVault as any).triggerEvent('modify', file);
      (mockVault as any).triggerEvent('modify', file);
      (mockVault as any).triggerEvent('modify', file);

      // Wait for debounce to complete
      await new Promise((resolve) => setTimeout(resolve, 200));

      await coordinator.flush();

      // Should only receive one event (debounced)
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

      // Trigger multiple create events rapidly
      (mockVault as any).triggerEvent('create', file);
      (mockVault as any).triggerEvent('create', file);
      (mockVault as any).triggerEvent('create', file);

      // Wait for debounce to complete
      await new Promise((resolve) => setTimeout(resolve, 200));

      await coordinator.flush();

      // Should only receive one event (debounced)
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

      // Trigger modify, then delete rapidly
      (mockVault as any).triggerEvent('modify', file);
      (mockVault as any).triggerEvent('delete', file);

      // Wait for debounce to complete
      await new Promise((resolve) => setTimeout(resolve, 200));

      await coordinator.flush();

      // Should receive both events
      expect(receivedEvents.length).toBe(2);
      expect(receivedEvents.some((e) => e.type === 'modify')).toBe(true);
      expect(receivedEvents.some((e) => e.type === 'delete')).toBe(true);
    });
  });
});
