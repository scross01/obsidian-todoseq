/**
 * Minimal, type-safe i18n engine for TODOseq.
 *
 * - Dot-notation keys are type-checked against the English locale (`TPath`).
 * - Missing keys fall back to English, then to the raw key.
 * - `{name}` placeholders are interpolated from the `vars` argument.
 *
 * The plugin follows Obsidian's UI language: the language is detected ONCE
 * at startup via `localStorage.getItem('language')` (see `detectLanguage`)
 * and never re-detected at runtime — Obsidian requires a relaunch after the
 * user changes the UI language, so a startup read is always correct.
 *
 * Do NOT switch detection to moment's locale API: it is a mutable global
 * that other plugins override, breaking dependent plugins.
 */

import { en, type WidenStrings } from './locales/en';
import { zh } from './locales/zh';

export type Lang = 'en' | 'zh';
/**
 * The English locale tree with literal types preserved. Used to derive the
 * compile-time `TPath` key union; use `LocaleShape` for runtime-facing types.
 */
export type Locale = typeof en;
/** The locale shape with string values widened from literals. */
export type LocaleShape = WidenStrings<typeof en>;

/** All locales keyed by Lang. Every locale must structurally match `en`. */
const locales: Record<Lang, LocaleShape> = { en, zh };

/** Module-level current language. Tests reset it via `setLang('en')`. */
let currentLang: Lang = 'en';

/**
 * Recursive dot-path type derived from the English locale: the union of
 * every valid translation key, e.g. 'settings.general.formatTaskKeywords.name'.
 */
export type TPath<Tree = Locale> = {
  [K in keyof Tree & string]:
    K | (Tree[K] extends string ? never : `${K}.${TPath<Tree[K]>}`);
}[keyof Tree & string];

/** Interpolation placeholder pattern: `{name}`, `{count}`, ... */
const INTERPOLATION_PATTERN = /\{(\w+)\}/g;

/**
 * Walk a dot path through a locale tree.
 * Returns undefined for missing keys and for non-leaf (object) nodes.
 */
function resolve(tree: LocaleShape, path: string): string | undefined {
  let node: unknown = tree;
  for (const part of path.split('.')) {
    if (
      node !== null &&
      typeof node === 'object' &&
      part in (node as Record<string, unknown>)
    ) {
      node = (node as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return typeof node === 'string' ? node : undefined;
}

/** Replace `{name}` placeholders; absent vars are left as literal text. */
function interpolate(
  text: string,
  vars: Record<string, string | number>,
): string {
  return text.replace(INTERPOLATION_PATTERN, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(vars, name)
      ? String(vars[name])
      : match,
  );
}

/**
 * Translate a key in the current language.
 * Falls back to English when the key is missing in the current locale,
 * then to the raw key when it is missing everywhere.
 */
export function t(key: TPath, vars?: Record<string, string | number>): string {
  const resolved =
    resolve(locales[currentLang], key) ?? resolve(en, key) ?? key;
  return vars ? interpolate(resolved, vars) : resolved;
}

/** Set the active language (called once at startup, and by tests). */
export function setLang(lang: Lang): void {
  currentLang = lang;
}

/** The active language. */
export function getLang(): Lang {
  return currentLang;
}

/**
 * Read Obsidian's UI language from localStorage ('language' key).
 *
 * - 'zh' and 'zh-TW' both map to the 'zh' locale (simplified Chinese;
 *   a dedicated zh-TW locale is future work).
 * - Everything else — null, 'en', or any unsupported code — maps to 'en'.
 *
 * Guards the read so it never throws when localStorage is unavailable
 * (node test environments, defensive against exotic webviews).
 */
export function detectLanguage(): Lang {
  let raw: string | null = null;
  if (typeof window !== 'undefined') {
    const storage = (window as Window & { localStorage?: Storage })
      .localStorage;
    raw = storage?.getItem('language') ?? null;
  }
  return raw === 'zh' || raw === 'zh-TW' ? 'zh' : 'en';
}
