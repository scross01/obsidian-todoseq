/**
 * Unit tests for ChangeTracker
 */

import { ChangeTracker } from '../src/services/change-tracker';

// Mock console methods to reduce noise
const originalDebug = console.debug;
const originalError = console.error;

beforeAll(() => {
  console.debug = jest.fn();
  console.error = jest.fn();
});

afterAll(() => {
  console.debug = originalDebug;
  console.error = originalError;
});

describe('ChangeTracker', () => {
  let tracker: ChangeTracker;

  beforeEach(() => {
    tracker = new ChangeTracker();
  });

  afterEach(() => {
    tracker.destroy();
  });

  describe('registerExpectedChange', () => {
    it('should register an expected change and return a hash', () => {
      const path = 'test.md';
      const content = 'test content';
      const hash = tracker.registerExpectedChange(path, content);

      expect(hash).toBeDefined();
      expect(typeof hash).toBe('string');
      expect(hash.length).toBeGreaterThan(0);
    });

    it('should store the pending change with correct metadata', () => {
      const path = 'test.md';
      const content = 'test content';
      const timeout = 10000;
      const metadata = { source: 'test' };

      tracker.registerExpectedChange(path, content, timeout, metadata);

      expect(tracker.hasPendingChange(path)).toBe(true);
      expect(tracker.getPendingCount()).toBe(1);
    });

    it('should use default timeout if not provided', () => {
      const path = 'test.md';
      const content = 'test content';

      tracker.registerExpectedChange(path, content);

      const pendingChanges = tracker.getPendingChanges();
      expect(pendingChanges[0].timeout).toBe(5000); // Default timeout
    });

    it('should replace existing pending change for the same path', () => {
      const path = 'test.md';
      const content1 = 'content 1';
      const content2 = 'content 2';

      tracker.registerExpectedChange(path, content1);
      expect(tracker.getPendingCount()).toBe(1);

      tracker.registerExpectedChange(path, content2);
      expect(tracker.getPendingCount()).toBe(1);
    });
  });

  describe('isExpectedChange', () => {
    it('should return false for path with no pending change', () => {
      const path = 'test.md';
      const content = 'test content';

      const result = tracker.isExpectedChange(path, content);

      expect(result.isExpected).toBe(false);
      expect(result.contentMatches).toBe(false);
      expect(result.pendingChange).toBeNull();
    });

    it('should return true for matching content', () => {
      const path = 'test.md';
      const content = 'test content';

      tracker.registerExpectedChange(path, content);
      const result = tracker.isExpectedChange(path, content);

      expect(result.isExpected).toBe(true);
      expect(result.contentMatches).toBe(true);
      expect(result.pendingChange).not.toBeNull();
    });

    it('should return false for non-matching content', () => {
      const path = 'test.md';
      const expectedContent = 'expected content';
      const actualContent = 'actual content';

      tracker.registerExpectedChange(path, expectedContent);
      const result = tracker.isExpectedChange(path, actualContent);

      expect(result.isExpected).toBe(false);
      expect(result.contentMatches).toBe(false);
      expect(result.pendingChange).not.toBeNull();
    });

    it('should return false for expired change', async () => {
      const path = 'test.md';
      const content = 'test content';
      const timeout = 100; // 100ms timeout

      tracker.registerExpectedChange(path, content, timeout);

      // Wait for timeout to expire
      await new Promise((resolve) => setTimeout(resolve, 150));

      const result = tracker.isExpectedChange(path, content);

      expect(result.isExpected).toBe(false);
      expect(result.contentMatches).toBe(false);
      expect(result.pendingChange).toBeNull();
    });

    it('should clean up pending change after checking', () => {
      const path = 'test.md';
      const content = 'test content';

      tracker.registerExpectedChange(path, content);
      expect(tracker.hasPendingChange(path)).toBe(true);

      tracker.isExpectedChange(path, content);

      expect(tracker.hasPendingChange(path)).toBe(false);
    });
  });

  describe('cleanup', () => {
    it('should remove pending change for specific path', () => {
      const path1 = 'test1.md';
      const path2 = 'test2.md';

      tracker.registerExpectedChange(path1, 'content 1');
      tracker.registerExpectedChange(path2, 'content 2');

      expect(tracker.getPendingCount()).toBe(2);

      tracker.cleanup(path1);

      expect(tracker.getPendingCount()).toBe(1);
      expect(tracker.hasPendingChange(path1)).toBe(false);
      expect(tracker.hasPendingChange(path2)).toBe(true);
    });

    it('should do nothing if no pending change exists', () => {
      const path = 'test.md';

      expect(() => tracker.cleanup(path)).not.toThrow();
      expect(tracker.getPendingCount()).toBe(0);
    });
  });

  describe('hasPendingChange', () => {
    it('should return true for pending change', () => {
      const path = 'test.md';
      const content = 'test content';

      tracker.registerExpectedChange(path, content);

      expect(tracker.hasPendingChange(path)).toBe(true);
    });

    it('should return false for non-existent change', () => {
      const path = 'test.md';

      expect(tracker.hasPendingChange(path)).toBe(false);
    });

    it('should return false for expired change', async () => {
      const path = 'test.md';
      const content = 'test content';
      const timeout = 100; // 100ms timeout

      tracker.registerExpectedChange(path, content, timeout);

      // Wait for timeout to expire
      await new Promise((resolve) => setTimeout(resolve, 150));

      expect(tracker.hasPendingChange(path)).toBe(false);
    });
  });

  describe('getPendingChanges', () => {
    it('should return all pending changes', () => {
      const path1 = 'test1.md';
      const path2 = 'test2.md';

      tracker.registerExpectedChange(path1, 'content 1');
      tracker.registerExpectedChange(path2, 'content 2');

      const pendingChanges = tracker.getPendingChanges();

      expect(pendingChanges).toHaveLength(2);
      expect(pendingChanges.some((c) => c.path === path1)).toBe(true);
      expect(pendingChanges.some((c) => c.path === path2)).toBe(true);
    });

    it('should return empty array when no pending changes', () => {
      const pendingChanges = tracker.getPendingChanges();

      expect(pendingChanges).toHaveLength(0);
    });
  });

  describe('getPendingCount', () => {
    it('should return correct count of pending changes', () => {
      expect(tracker.getPendingCount()).toBe(0);

      tracker.registerExpectedChange('test1.md', 'content 1');
      expect(tracker.getPendingCount()).toBe(1);

      tracker.registerExpectedChange('test2.md', 'content 2');
      expect(tracker.getPendingCount()).toBe(2);
    });
  });

  describe('destroy', () => {
    it('should clean up all pending changes', () => {
      tracker.registerExpectedChange('test1.md', 'content 1');
      tracker.registerExpectedChange('test2.md', 'content 2');

      expect(tracker.getPendingCount()).toBe(2);

      tracker.destroy();

      expect(tracker.getPendingCount()).toBe(0);
    });

    it('should stop cleanup interval', () => {
      const spy = jest.spyOn(window, 'clearInterval');

      tracker.destroy();

      expect(spy).toHaveBeenCalled();
      spy.mockRestore();
    });
  });

  describe('PendingChange.isExpired', () => {
    it('should return false for non-expired change', () => {
      const path = 'test.md';
      const content = 'test content';
      const timeout = 5000;

      tracker.registerExpectedChange(path, content, timeout);

      const pendingChanges = tracker.getPendingChanges();
      const change = pendingChanges[0];

      expect(change.isExpired()).toBe(false);
    });

    it('should return true for expired change', async () => {
      const path = 'test.md';
      const content = 'test content';
      const timeout = 100; // 100ms timeout

      tracker.registerExpectedChange(path, content, timeout);

      // Wait for timeout to expire
      await new Promise((resolve) => setTimeout(resolve, 150));

      const pendingChanges = tracker.getPendingChanges();
      const change = pendingChanges[0];

      expect(change.isExpired()).toBe(true);
    });
  });

  describe('concurrent operations', () => {
    it('should handle multiple concurrent registrations', () => {
      const paths = ['test1.md', 'test2.md', 'test3.md'];

      paths.forEach((path) => {
        tracker.registerExpectedChange(path, `content for ${path}`);
      });

      expect(tracker.getPendingCount()).toBe(3);

      paths.forEach((path) => {
        expect(tracker.hasPendingChange(path)).toBe(true);
      });
    });

    it('should handle concurrent checks', () => {
      const path = 'test.md';
      const content = 'test content';

      tracker.registerExpectedChange(path, content);

      // Simulate multiple concurrent checks
      const results = Array.from({ length: 5 }, () =>
        tracker.isExpectedChange(path, content),
      );

      // Only the first check should return true
      const trueResults = results.filter((r) => r.isExpected);
      expect(trueResults).toHaveLength(1);
    });
  });

  describe('hash consistency', () => {
    it('should produce consistent hashes for the same content', () => {
      const content = 'test content';
      const hash1 = tracker.registerExpectedChange('test1.md', content);
      const hash2 = tracker.registerExpectedChange('test2.md', content);

      expect(hash1).toBe(hash2);
    });

    it('should produce different hashes for different content', () => {
      const hash1 = tracker.registerExpectedChange('test1.md', 'content 1');
      const hash2 = tracker.registerExpectedChange('test2.md', 'content 2');

      expect(hash1).not.toBe(hash2);
    });
  });

  describe('automatic cleanup', () => {
    it('should automatically clean up expired changes', async () => {
      const path1 = 'test1.md';
      const path2 = 'test2.md';

      tracker.registerExpectedChange(path1, 'content 1', 100); // 100ms timeout
      tracker.registerExpectedChange(path2, 'content 2', 5000); // 5s timeout

      expect(tracker.getPendingCount()).toBe(2);

      // Wait for first change to expire and cleanup interval to run
      await new Promise((resolve) => setTimeout(resolve, 1100));

      expect(tracker.getPendingCount()).toBe(1);
      expect(tracker.hasPendingChange(path1)).toBe(false);
      expect(tracker.hasPendingChange(path2)).toBe(true);
    });
  });
});
