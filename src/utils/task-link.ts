/**
 * Small wikilink tokenizer shared by reference repair. It understands the
 * forms a note can contain: `[[note]]`, `[[note#heading]]`, `[[note#^block]]`,
 * aliases, and the `!` embed prefix. Block references are the only ones with
 * task identity, so callers check `anchor` starts with `^`.
 */
export interface WikiLinkToken {
  /** Index of the leading `[` (or `!`) in the line. */
  start: number;
  /** Index just past the trailing `]]`. */
  end: number;
  raw: string;
  embed: boolean;
  target: string;
  anchor: string | null;
  alias: string | null;
}

const WIKI_LINK_PATTERN =
  /(!?)\[\[([^[\]|#]+?)(?:#([^[\]|]*?))?(?:\|([^[\]]*?))?\]\]/g;

export function findWikiLinks(line: string): WikiLinkToken[] {
  const tokens: WikiLinkToken[] = [];
  if (!line.includes('[[')) return tokens;
  WIKI_LINK_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = WIKI_LINK_PATTERN.exec(line)) !== null) {
    tokens.push({
      start: match.index,
      end: match.index + match[0].length,
      raw: match[0],
      embed: match[1] === '!',
      target: match[2],
      anchor: match[3] ?? null,
      alias: match[4] ?? null,
    });
  }
  return tokens;
}

/** Rebuild a link, preserving its embed marker and alias. */
export function buildWikiLink(
  embed: boolean,
  target: string,
  anchor: string | null,
  alias: string | null,
): string {
  const anchorPart = anchor === null ? '' : `#${anchor}`;
  const aliasPart = alias === null ? '' : `|${alias}`;
  return `${embed ? '!' : ''}[[${target}${anchorPart}${aliasPart}]]`;
}
