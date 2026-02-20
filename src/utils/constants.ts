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
// Binary File Extensions
// ============================================================================

/**
 * Common binary file extensions that should not be scanned for tasks.
 * These are stored WITHOUT leading dots for use with TFile.extension checks.
 * Used by vault-scanner.ts to skip binary files during scanning.
 */
export const BINARY_EXTENSIONS = new Set([
  // Images
  'png',
  'jpg',
  'jpeg',
  'gif',
  'bmp',
  'ico',
  'svg',
  'webp',
  'tiff',
  'tif',
  // Audio
  'mp3',
  'wav',
  'ogg',
  'flac',
  'aac',
  'm4a',
  'wma',
  // Video
  'mp4',
  'avi',
  'mkv',
  'mov',
  'wmv',
  'flv',
  'webm',
  // Documents
  'pdf',
  'doc',
  'docx',
  'xls',
  'xlsx',
  'ppt',
  'pptx',
  'odt',
  'ods',
  'odp',
  // Archives
  'zip',
  'rar',
  '7z',
  'tar',
  'gz',
  'bz2',
  // Executables
  'exe',
  'dll',
  'so',
  'dylib',
  'app',
  'dmg',
  // Database
  'db',
  'sqlite',
  'sqlite3',
  // Font
  'ttf',
  'otf',
  'woff',
  'woff2',
  'eot',
  // Other binary
  'bin',
  'iso',
  'img',
  'class',
  'jar',
  'war',
]);

/**
 * Binary file extensions WITH leading dots for user input validation.
 * Derived from BINARY_EXTENSIONS for use in settings validation.
 */
export const BINARY_EXTENSIONS_WITH_DOT = new Set(
  Array.from(BINARY_EXTENSIONS).map((ext) => `.${ext}`),
);
