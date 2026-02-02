/**
 * RegexCache - A utility class for caching compiled regular expressions.
 *
 * This class provides a simple caching mechanism for RegExp objects to avoid
 * repeatedly compiling the same patterns. This is particularly useful for:
 *
 * - Patterns that are compiled repeatedly in loops (e.g., during vault scanning)
 * - Patterns that are generated from user input (e.g., search queries)
 * - Patterns that come from configuration (e.g., userIgnoreFilters)
 *
 * The cache uses a Map with composite keys (pattern + flags) to ensure
 * uniqueness and fast lookups.
 *
 * @example
 * ```typescript
 * const cache = new RegexCache();
 *
 * // First call compiles and caches the regex
 * const regex1 = cache.get('\\bword\\b', 'gi');
 *
 * // Subsequent calls return the cached regex
 * const regex2 = cache.get('\\bword\\b', 'gi');
 * console.log(regex1 === regex2); // true
 *
 * // Clear the cache when patterns become invalid (e.g., settings change)
 * cache.clear();
 * ```
 */
export class RegexCache {
  private cache = new Map<string, RegExp>();

  /**
   * Get a compiled RegExp from the cache, or compile and cache it if not present.
   *
   * @param pattern The regex pattern string
   * @param flags Optional regex flags (e.g., 'g', 'i', 'gi')
   * @returns The compiled RegExp object
   */
  get(pattern: string, flags?: string): RegExp {
    const key = `${pattern}|${flags || ''}`;
    if (!this.cache.has(key)) {
      this.cache.set(key, new RegExp(pattern, flags));
    }
    const cached = this.cache.get(key);
    // We know the value exists because we just set it if it didn't
    return cached as RegExp;
  }

  /**
   * Check if a pattern is already cached.
   *
   * @param pattern The regex pattern string
   * @param flags Optional regex flags
   * @returns true if the pattern is cached, false otherwise
   */
  has(pattern: string, flags?: string): boolean {
    const key = `${pattern}|${flags || ''}`;
    return this.cache.has(key);
  }

  /**
   * Clear all cached regex patterns.
   *
   * This should be called when cached patterns become invalid,
   * such as when user settings change that affect the patterns.
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get the number of cached patterns.
   *
   * @returns The size of the cache
   */
  size(): number {
    return this.cache.size;
  }
}
