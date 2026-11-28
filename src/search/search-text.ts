/**
 * Shared text matching for task search and autocomplete.
 *
 * The default (case-insensitive) mode folds both the query and the candidate:
 * lowercase, canonical decomposition, removal of diacritics attached to Latin
 * bases, a small table of letters with no canonical decomposition, then NFC.
 * Only marks whose preceding base is Latin are removed, so Japanese, Indic,
 * Arabic and emoji sequences keep their meaning. This is deliberately not
 * transliteration and not a compatibility (NFKD/NFKC) normalization.
 */

/** Letters that do not decompose into a Latin base plus a mark. */
const LATIN_CHAR_MAP: Readonly<Record<string, string>> = {
  ø: 'o',
  ł: 'l',
  đ: 'd',
  ð: 'd',
  ħ: 'h',
  ı: 'i',
  ß: 'ss',
  æ: 'ae',
  œ: 'oe',
  þ: 'th',
};

const NON_ASCII = /[^\p{ASCII}]/u;
const MARK = /\p{M}/u;
const DIACRITIC = /\p{Diacritic}/u;
const LATIN = /\p{Script=Latin}/u;
const WORD_CONTINUATION = /[\p{L}\p{N}\p{M}\p{Pc}]/u;

/** Fold one value for default case-insensitive matching. */
export function foldSearchText(value: string): string {
  const lower = value.toLowerCase();
  // ASCII is the overwhelming majority of search input and candidates; it has
  // no marks or table entries, so lowercasing is the whole transformation.
  if (!NON_ASCII.test(lower)) return lower;

  const decomposed = lower.normalize('NFD');
  let folded = '';
  let afterLatinBase = false;

  for (const char of decomposed) {
    if (MARK.test(char)) {
      if (afterLatinBase && DIACRITIC.test(char)) continue;
      folded += char;
      continue;
    }

    const mapped = LATIN_CHAR_MAP[char];
    folded += mapped ?? char;
    // Track the base across its run of marks. Separators and non-Latin
    // scripts reset it, so their marks are preserved.
    afterLatinBase = LATIN.test(char);
  }

  return folded.normalize('NFC');
}

/** Escape literal text for use inside a regular expression. */
export function escapeSearchRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** True when a code point continues a word for phrase-boundary purposes. */
export function isWordContinuation(char: string): boolean {
  return WORD_CONTINUATION.test(char);
}

/**
 * Pass-local folded-value and phrase-regex cache.
 *
 * Only non-ASCII input is stored: ASCII candidates are cheaper to lowercase
 * again than to retain, and caching them would grow to roughly one entry per
 * field per task on every keystroke. The cache lives for one search,
 * suggestion or property pass, so edits and settings changes are visible on
 * the next pass without invalidation.
 */
export class SearchTextCache {
  private readonly folded = new Map<string, string>();
  private readonly phrases = new Map<string, RegExp>();

  fold(value: string): string {
    if (!NON_ASCII.test(value)) return value.toLowerCase();
    const cached = this.folded.get(value);
    if (cached !== undefined) return cached;
    const result = foldSearchText(value);
    this.folded.set(value, result);
    return result;
  }

  /**
   * Complete-word phrase pattern with Unicode outer boundaries. Matching is
   * case-insensitive only by folding, never by the `i` flag.
   */
  phrase(phrase: string, caseSensitive: boolean): RegExp {
    const key = `${caseSensitive ? 'S' : 'I'}|${phrase}`;
    const cached = this.phrases.get(key);
    if (cached) return cached;

    const text = caseSensitive ? phrase : this.fold(phrase);
    const pattern = new RegExp(
      `(?<![\\p{L}\\p{N}\\p{M}\\p{Pc}])${escapeSearchRegex(text)}(?![\\p{L}\\p{N}\\p{M}\\p{Pc}])`,
      'u',
    );
    this.phrases.set(key, pattern);
    return pattern;
  }
}
