/**
 * Centralized constants for the TODOseq plugin.
 * This module provides a single source of truth for constant values
 * used across the plugin.
 */

// ============================================================================
// Documentation URLs
// ============================================================================

/**
 * Base URL for the TODOseq documentation site
 */
export const DOCS_BASE_URL = 'https://scross01.github.io/obsidian-todoseq';

/**
 * Search documentation page URL
 */
export const DOCS_SEARCH_URL = `${DOCS_BASE_URL}/search.html`;

/**
 * Main documentation index page URL
 */
export const DOCS_INDEX_URL = `${DOCS_BASE_URL}/index.html`;

// ============================================================================
// Built-in Task Keywords
// ============================================================================

/**
 * Built-in keywords for active tasks.
 * These keywords indicate a task is currently being worked on.
 */
export const BUILTIN_ACTIVE_KEYWORDS = ['DOING', 'NOW', 'IN-PROGRESS'] as const;

/**
 * Built-in keywords for inactive/pending tasks.
 * These keywords indicate a task that has not been started yet.
 */
export const BUILTIN_INACTIVE_KEYWORDS = ['TODO', 'LATER'] as const;

/**
 * Built-in keywords for waiting tasks.
 * These keywords indicate a task that is blocked or paused.
 */
export const BUILTIN_WAITING_KEYWORDS = ['WAIT', 'WAITING'] as const;

/**
 * Built-in keywords for completed tasks.
 * These keywords indicate a task that is finished or abandoned.
 */
export const BUILTIN_COMPLETED_KEYWORDS = [
  'DONE',
  'CANCELLED',
  'CANCELED',
] as const;

/**
 * Type for built-in keyword arrays.
 * Used for type-safe access to built-in keyword constants.
 */
export type BuiltinKeywordArray =
  | typeof BUILTIN_ACTIVE_KEYWORDS
  | typeof BUILTIN_INACTIVE_KEYWORDS
  | typeof BUILTIN_WAITING_KEYWORDS
  | typeof BUILTIN_COMPLETED_KEYWORDS;
