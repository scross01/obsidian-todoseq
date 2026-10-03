import path from 'node:path';

/**
 * Scan docs sources for references to docs/assets files.
 *
 * A file reader is injected so this stays unit-testable without touching the
 * real filesystem (the capture pipeline is verified by running it, not by
 * mocking Obsidian; these helpers stay pure).
 */

/** The injected file reader: returns file content or null when unreadable. */
export type FileReader = (path: string) => string | null;

/** Result of a usage scan. */
export interface UsageScanResult {
  /** Asset basenames found referenced in at least one scanned file. */
  referenced: Set<string>;
  /** Asset basenames with no reference, sorted. */
  unreferenced: string[];
}

/**
 * Scan the given source files for references to the given assets.
 *
 * Matches the common embed shapes: `./assets/<name>`, `assets/<name>`
 * (including right after `(` in markdown links), and `/assets/<name>`
 * (docs-site config). The character following the name must not be a filename
 * character, so `foo.png.bak.png`-style names never match.
 */
export function scanAssetUsage(
  assets: readonly string[],
  filesToScan: readonly string[],
  readFile: FileReader,
): UsageScanResult {
  const referenced = new Set<string>();
  for (const file of filesToScan) {
    const content = readFile(file);
    if (content === null) continue;
    for (const asset of assets) {
      if (referenced.has(asset)) continue;
      const base = path.basename(asset);
      const escaped = base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pattern = new RegExp(
        `(?:(?<=\\()|\\./|/|(?<=\\s)|(?<=^))assets/${escaped}(?![\\w.-])`,
      );
      if (pattern.test(content)) referenced.add(asset);
    }
  }
  const unreferenced = assets.filter((a) => !referenced.has(a)).sort();
  return { referenced, unreferenced };
}
