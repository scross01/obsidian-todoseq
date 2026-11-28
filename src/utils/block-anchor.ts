/**
 * Shared grammar for an Obsidian block anchor suffix.
 *
 * The suffix is identity, not task content: every parser and writer strips it
 * with `splitTrailingBlockAnchor` and writes it with `appendBlockAnchor`.
 * This module is a leaf (no project imports) so parser utilities and the
 * bounded block walk can share it without an import cycle.
 */

export interface TrailingBlockAnchor {
  /** Line with the suffix and its separating whitespace removed. */
  text: string;
  /** Anchor identifier without the caret, or null. */
  anchor: string | null;
}

/**
 * A valid trailing block anchor is `^[A-Za-z0-9][\w-]*`, preceded by the
 * start of the line or whitespace, and followed only by whitespace.
 * Footnote references (`[^1]`), bare carets, `foo^bar` and `^anchor]` do not
 * match.
 */
const TRAILING_BLOCK_ANCHOR = /(?:^|\s)\^([A-Za-z0-9][\w-]*)\s*$/;

export function splitTrailingBlockAnchor(line: string): TrailingBlockAnchor {
  const match = TRAILING_BLOCK_ANCHOR.exec(line);
  if (!match) return { text: line, anchor: null };
  return {
    text: line.slice(0, match.index).trimEnd(),
    anchor: match[1],
  };
}

/** Append exactly one separating space plus `^anchor` to a line. */
export function appendBlockAnchor(line: string, anchor: string): string {
  const text = line.trimEnd();
  const id = anchor.replace(/^\^/, '');
  return text === '' ? `^${id}` : `${text} ^${id}`;
}

/**
 * True when `body` closes a properties drawer. Org keeps the exact `:END:`
 * check; Markdown also accepts a trailing block anchor, the only suffix that
 * may follow `:END:`.
 */
export function isDrawerEndLine(
  body: string,
  format: 'markdown' | 'org',
): boolean {
  const trimmed = body.trim();
  if (trimmed === ':END:') return true;
  if (format === 'org') return false;
  return splitTrailingBlockAnchor(trimmed).text.trim() === ':END:';
}
