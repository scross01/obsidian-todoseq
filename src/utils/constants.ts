/**
 * Centralized constants for the TODOseq plugin.
 * This module provides a single source of truth for constant values
 * used across the plugin.
 */

// ============================================================================
// Viewport Breakpoints
// ============================================================================

/**
 * Breakpoint for distinguishing phones from tablets.
 * Viewport widths <= this value are considered phones.
 * Matches the existing CSS media query breakpoint at 768px.
 *
 * Device reference (viewport width in portrait):
 * - iPhone SE: 375px
 * - iPhone 12/13/14: 390px
 * - iPhone 12/13/14 Pro Max: 428px
 * - iPhone 15 Pro Max: 430px
 * - Android phones: 320-480px
 * - iPad Mini: 768px (smallest tablet)
 * - Android tablets: 600px+
 */
export const TABLET_BREAKPOINT = 768;

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
 * Order: NOW, DOING, IN-PROGRESS (for sort order).
 */
export const BUILTIN_ACTIVE_KEYWORDS = ['NOW', 'DOING', 'IN-PROGRESS'] as const;

/**
 * Built-in keywords for inactive/pending tasks.
 * These keywords indicate a task that has not been started yet.
 * Order: TODO, LATER (for sort order).
 */
export const BUILTIN_INACTIVE_KEYWORDS = ['TODO', 'LATER'] as const;

/**
 * Built-in keywords for waiting tasks.
 * These keywords indicate a task that is blocked or paused.
 * Order: WAIT, WAITING (for sort order).
 */
export const BUILTIN_WAITING_KEYWORDS = ['WAIT', 'WAITING'] as const;

/**
 * Built-in keywords for completed tasks.
 * These keywords indicate a task that is finished or abandoned.
 * Order: DONE, CANCELED, CANCELLED (for sort order).
 */
export const BUILTIN_COMPLETED_KEYWORDS = [
  'DONE',
  'CANCELED',
  'CANCELLED',
] as const;

/**
 * Built-in keywords for archived tasks.
 * These keywords indicate a task that has been archived.
 * Archived tasks are styled but NOT collected during vault scans.
 */
export const BUILTIN_ARCHIVED_KEYWORDS = ['ARCHIVED'] as const;

/**
 * Type for built-in keyword arrays.
 * Used for type-safe access to built-in keyword constants.
 */
export type BuiltinKeywordArray =
  | typeof BUILTIN_ACTIVE_KEYWORDS
  | typeof BUILTIN_INACTIVE_KEYWORDS
  | typeof BUILTIN_WAITING_KEYWORDS
  | typeof BUILTIN_COMPLETED_KEYWORDS
  | typeof BUILTIN_ARCHIVED_KEYWORDS;
