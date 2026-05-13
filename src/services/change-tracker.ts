/**
 * ChangeTracker provides a mechanism to track expected file changes
 * and distinguish between plugin-initiated changes and external changes.
 *
 * This replaces the brittle global boolean flag approach with a per-file,
 * per-update tracking mechanism using content hashing.
 */

/**
 * Information about a pending expected change.
 */
export interface PendingChange {
  /** File path being tracked */
  path: string;
  /** Expected content hash after the change */
  expectedHash: string;
  /** Timestamp when the change was registered */
  timestamp: number;
  /** Timeout in milliseconds after which this change expires */
  timeout: number;
  /** Optional metadata for debugging */
  metadata?: Record<string, unknown>;

  /**
   * Check if this pending change has expired.
   * @returns Whether the change has expired
   */
  isExpired(): boolean;
}

/**
 * Create a PendingChange object with the isExpired method.
 */
export function createPendingChange(
  path: string,
  expectedHash: string,
  timestamp: number,
  timeout: number,
  metadata?: Record<string, unknown>,
): PendingChange {
  return {
    path,
    expectedHash,
    timestamp,
    timeout,
    metadata,
    isExpired(this: PendingChange) {
      return Date.now() - this.timestamp > this.timeout;
    },
  };
}

/**
 * Result of checking if a change is expected.
 */
export interface ChangeCheckResult {
  /** Whether the change is expected */
  isExpected: boolean;
  /** Whether the content matches the expected hash */
  contentMatches: boolean;
  /** The pending change if found, null otherwise */
  pendingChange: PendingChange | null;
}

/**
 * Configuration options for ChangeTracker.
 */
export interface ChangeTrackerOptions {
  /** Default timeout for expected changes in milliseconds (default: 5000) */
  defaultTimeoutMs?: number;
}

/**
 * ChangeTracker tracks expected file changes using content hashing.
 *
 * This class is thread-safe and can be used to coordinate between
 * different components that modify files, ensuring that file system
 * watchers can distinguish between expected and unexpected changes.
 *
 * Usage:
 * ```typescript
 * const tracker = new ChangeTracker();
 *
 * // Before writing a file, register the expected change
 * const content = "new content";
 * const hash = tracker.hashContent(content);
 * tracker.registerExpectedChange("path/to/file.md", hash, 5000);
 *
 * // Write the file
 * await vault.modify(file, content);
 *
 * // When the file system watcher sees the change:
 * const currentContent = await vault.read(file);
 * const result = tracker.isExpectedChange("path/to/file.md", currentContent);
 * if (result.isExpected) {
 *   // This change was made by the plugin, skip processing
 *   return;
 * }
 * // Process external change
 * ```
 */
export class ChangeTracker {
  private pendingChanges: Map<string, PendingChange> = new Map();
  private readonly defaultTimeoutMs: number;
  private cleanupInterval: number | null = null;

  constructor(options: ChangeTrackerOptions = {}) {
    this.defaultTimeoutMs = options.defaultTimeoutMs ?? 5000;

    // Periodically clean up expired changes
    this.startCleanup();
  }

  /**
   * Register an expected file change.
   *
   * @param path - File path being tracked
   * @param expectedContent - Expected content after the change
   * @param timeoutMs - Timeout in milliseconds (default: 5000)
   * @param metadata - Optional metadata for debugging
   * @returns The hash of the expected content
   */
  registerExpectedChange(
    path: string,
    expectedContent: string,
    timeoutMs: number = this.defaultTimeoutMs,
    metadata?: Record<string, unknown>,
  ): string {
    const hash = this.hashContent(expectedContent);
    const pendingChange = createPendingChange(
      path,
      hash,
      Date.now(),
      timeoutMs,
      metadata,
    );

    this.pendingChanges.set(path, pendingChange);

    return hash;
  }

  /**
   * Check if a file change is expected.
   *
   * @param path - File path to check
   * @param actualContent - Actual content of the file
   * @returns ChangeCheckResult with details about the change
   */
  isExpectedChange(path: string, actualContent: string): ChangeCheckResult {
    const pendingChange = this.pendingChanges.get(path);

    // No pending change for this path
    if (!pendingChange) {
      return {
        isExpected: false,
        contentMatches: false,
        pendingChange: null,
      };
    }

    // Check if the change has expired
    if (pendingChange.isExpired()) {
      this.pendingChanges.delete(path);
      return {
        isExpected: false,
        contentMatches: false,
        pendingChange: null,
      };
    }

    // Check if the content matches the expected hash
    const actualHash = this.hashContent(actualContent);
    const contentMatches = actualHash === pendingChange.expectedHash;

    // Clean up the pending change after checking
    // This ensures we only match once
    this.pendingChanges.delete(path);

    return {
      isExpected: contentMatches,
      contentMatches,
      pendingChange,
    };
  }

  /**
   * Manually clean up a pending change for a specific path.
   *
   * @param path - File path to clean up
   */
  cleanup(path: string): void {
    if (this.pendingChanges.has(path)) {
      this.pendingChanges.delete(path);
    }
  }

  /**
   * Clean up all expired pending changes.
   */
  private cleanupExpired(): void {
    const expiredPaths: string[] = [];

    for (const [path, change] of this.pendingChanges.entries()) {
      if (change.isExpired()) {
        expiredPaths.push(path);
      }
    }

    for (const path of expiredPaths) {
      this.pendingChanges.delete(path);
    }
  }

  /**
   * Start the periodic cleanup interval.
   */
  private startCleanup(): void {
    // Clean up every second
    this.cleanupInterval = window.setInterval(() => {
      this.cleanupExpired();
    }, 1000);
  }

  /**
   * Stop the periodic cleanup interval.
   */
  destroy(): void {
    if (this.cleanupInterval) {
      window.clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.pendingChanges.clear();
  }

  /**
   * Hash content using consistent hash function for all platforms.
   *
   * @param content - Content to hash
   * @returns Hex string of the hash
   */
  private hashContent(content: string): string {
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(16);
  }

  /**
   * Get the number of pending changes.
   *
   * @returns Number of pending changes
   */
  getPendingCount(): number {
    return this.pendingChanges.size;
  }

  /**
   * Check if there is a pending change for a specific path.
   *
   * @param path - File path to check
   * @returns Whether there is a pending change
   */
  hasPendingChange(path: string): boolean {
    const pendingChange = this.pendingChanges.get(path);
    if (!pendingChange) {
      return false;
    }
    // Check if expired
    if (pendingChange.isExpired()) {
      this.pendingChanges.delete(path);
      return false;
    }
    return true;
  }

  /**
   * Get all pending changes (for debugging/testing).
   *
   * @returns Array of pending changes
   */
  getPendingChanges(): PendingChange[] {
    return Array.from(this.pendingChanges.values());
  }
}
