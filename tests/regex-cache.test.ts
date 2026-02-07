import { RegexCache } from '../src/utils/regex-cache';

describe('RegexCache', () => {
  let cache: RegexCache;

  beforeEach(() => {
    cache = new RegexCache();
  });

  describe('basic functionality', () => {
    it('should create a new instance', () => {
      expect(cache).toBeInstanceOf(RegexCache);
    });

    it('should initialize with empty cache', () => {
      expect(cache.size()).toBe(0);
    });
  });

  describe('get method', () => {
    it('should return a RegExp instance', () => {
      const regex = cache.get('test');
      expect(regex).toBeInstanceOf(RegExp);
    });

    it('should compile and cache a regex', () => {
      cache.get('test');
      expect(cache.size()).toBe(1);
    });

    it('should return the same regex instance for identical patterns', () => {
      const regex1 = cache.get('test');
      const regex2 = cache.get('test');
      expect(regex1).toBe(regex2);
    });

    it('should handle different patterns', () => {
      const regex1 = cache.get('test1');
      const regex2 = cache.get('test2');
      expect(regex1).not.toBe(regex2);
      expect(cache.size()).toBe(2);
    });

    it('should handle patterns with flags', () => {
      const regex = cache.get('test', 'gi');
      expect(regex.flags).toEqual('gi');
    });

    it('should distinguish between different flag combinations', () => {
      const regex1 = cache.get('test', 'g');
      const regex2 = cache.get('test', 'i');
      const regex3 = cache.get('test', 'gi');

      expect(regex1).not.toBe(regex2);
      expect(regex1).not.toBe(regex3);
      expect(regex2).not.toBe(regex3);

      expect(cache.size()).toBe(3);
    });

    it('should handle patterns without flags', () => {
      const regex = cache.get('test');
      expect(regex.flags).toEqual('');
    });

    it('should handle empty flags parameter', () => {
      const regex = cache.get('test', '');
      expect(regex.flags).toEqual('');
    });

    it('should handle special characters in patterns', () => {
      const regex = cache.get('\\bword\\b\\s+\\d+', 'g');
      expect(regex).toBeInstanceOf(RegExp);
    });
  });

  describe('has method', () => {
    it('should return false for non-existent patterns', () => {
      expect(cache.has('nonexistent')).toBe(false);
    });

    it('should return true for existing patterns', () => {
      cache.get('test');
      expect(cache.has('test')).toBe(true);
    });

    it('should respect flag differences', () => {
      cache.get('test', 'g');
      expect(cache.has('test')).toBe(false); // Different flags
      expect(cache.has('test', 'g')).toBe(true);
    });

    it('should handle patterns with flags', () => {
      cache.get('test', 'gi');
      expect(cache.has('test', 'gi')).toBe(true);
    });
  });

  describe('clear method', () => {
    it('should clear the cache', () => {
      cache.get('test1');
      cache.get('test2', 'gi');
      expect(cache.size()).toBe(2);

      cache.clear();
      expect(cache.size()).toBe(0);
    });

    it('should handle clearing an already empty cache', () => {
      cache.clear();
      expect(cache.size()).toBe(0);
    });
  });

  describe('size method', () => {
    it('should return correct size after adding patterns', () => {
      expect(cache.size()).toBe(0);

      cache.get('test1');
      expect(cache.size()).toBe(1);

      cache.get('test2');
      expect(cache.size()).toBe(2);

      cache.get('test2', 'g');
      expect(cache.size()).toBe(3);
    });

    it('should return 0 for empty cache', () => {
      expect(cache.size()).toBe(0);
    });
  });

  describe('edge cases', () => {
    it('should handle empty pattern', () => {
      const regex = cache.get('');
      expect(regex).toBeInstanceOf(RegExp);
    });

    it('should handle very long patterns', () => {
      const longPattern = 'x'.repeat(1000);
      const regex = cache.get(longPattern);
      expect(regex).toBeInstanceOf(RegExp);
    });

    it('should handle patterns with all possible flags', () => {
      const regex = cache.get('test', 'gimsuy');
      expect(regex.flags).toEqual('gimsuy');
    });

    it('should throw error for duplicate flags', () => {
      expect(() => cache.get('test', 'gggiii')).toThrow(SyntaxError);
    });
  });

  describe('performance optimization', () => {
    it('should be fast for repeated calls to the same pattern', () => {
      const pattern = 'performance';
      const iterations = 1000;

      // Warm cache
      cache.get(pattern);

      const start = Date.now();
      for (let i = 0; i < iterations; i++) {
        cache.get(pattern);
      }
      const duration = Date.now() - start;

      // Should take less than 50ms for 1000 iterations
      expect(duration).toBeLessThan(50);
    });
  });
});
