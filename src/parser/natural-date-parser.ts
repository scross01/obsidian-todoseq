/**
 * Natural language date parser backed by sherlockjs.
 *
 * Uses sherlockjs (`Sherlock.parse()`) to detect one-shot NLP date expressions
 * such as "today", "tomorrow", "next Monday", "at 9am", or "2026-08-11" at
 * the end of a task line.  A small TODOseq-specific recurrence overlay runs
 * before the sherlock call to catch bare recurrence keywords (daily, every
 * Friday …) that sherlock does not resolve as date expressions when standing
 * alone, returning `eventTitle` without a `startDate` for those cases.
 *
 * The output format (<YYYY-MM-DD Weekday>) is produced by
 * `formatOrgDate()` in task-format.ts — that function is unchanged.
 */

import { DateRepeatInfo } from '../types/task';
import Sherlock from 'sherlockjs';

// ---------------------------------------------------------------------------
// Recurrence overlay (TODOseq-specific, runs before Sherlock)
// ---------------------------------------------------------------------------

interface RecurMatch {
  unit: 'd' | 'w' | 'm' | 'y';
  value: number;
  raw: string;
  /**
   * Captured weekday name if this pattern is a "every <weekday>" variant.
   * When set the date is anchored to the *referenceDate* passed to `parse()`.
   */
  weekday?: string;
}

interface RecurPattern {
  rx: RegExp;
  /** Pre-compiled greedy variant (no end-of-string anchor) for use in
   *  `eventTitleIsRecurrence`, which must scan every position because a
   *  recurrence keyword may appear multiple times inside eventTitle. */
  greedyRx?: RegExp;
  info: RecurMatch;
}

const WEEKDAY_NAMES = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
] as const;

/** Return the date of the next occurrence of `weekdayName` after `ref`. */
function computeNextWeekday(ref: Date, weekdayName: string): Date {
  const idx = WEEKDAY_NAMES.indexOf(
    weekdayName.toLowerCase() as (typeof WEEKDAY_NAMES)[number],
  );
  if (idx < 0) return new Date(ref);
  const cur = ref.getDay();
  let delta = (idx - cur + 7) % 7;
  if (delta === 0) delta = 7; // next occurrence, not today
  const d = new Date(ref);
  d.setDate(d.getDate() + delta);
  return d;
}

/** Advance `base` by `match.value` units of `match.unit`. */
function recurrenceAdd(base: Date, match: RecurMatch): Date {
  const d = new Date(base);
  switch (match.unit) {
    case 'd':
      d.setDate(d.getDate() + match.value);
      break;
    case 'w':
      d.setDate(d.getDate() + match.value * 7);
      break;
    case 'm':
      d.setMonth(d.getMonth() + match.value);
      break;
    case 'y':
      d.setFullYear(d.getFullYear() + match.value);
      break;
  }
  return d;
}

/** Compute the date for a matching RecurPattern relative to `now`. */
function recurrenceDate(now: Date, match: RecurMatch): Date {
  return match.weekday !== undefined
    ? computeNextWeekday(now, match.weekday)
    : recurrenceAdd(now, match);
}

/** Build a ParsedDateInfo for a matching RecurPattern hit. */
function makeRecurResult(
  matched: string,
  match: RecurMatch,
  now: Date,
): ParsedDateInfo {
  return {
    date: recurrenceDate(now, match),
    repeat: { type: '+', unit: match.unit, value: match.value, raw: match.raw },
    isRecurring: true,
    rawExpression: matched,
    matchedText: matched,
    hasTime: false,
  };
}

/**
 * Try to match a recurrence keyword at the end of `text`.
 * Uses `now` (the current reference date) so weekday-based results are
 * anchored to the correct day.
 *
 * Two passes:
 *  1. Whole text (catches "every Friday" before Sherlock sees it).
 *  2. Trailing word only (catches "every Friday" when Sherlock splits it as
 *     eventTitle="every", suffix="Friday").
 */
function tryRecurrence(text: string, now: Date): ParsedDateInfo | null {
  const fullTextPass = (t: string): ParsedDateInfo | null => {
    for (const p of RECURRENCE_PATTERNS) {
      const m = p.rx.exec(t);
      if (m && m.index + m[0].length === t.length) {
        return makeRecurResult(m[0], p.info, now);
      }
    }
    return null;
  };

  // Pass 1: attempt on the full text
  const direct = fullTextPass(text);
  if (direct) return direct;

  // Pass 2: attempt on the last word only
  // This handles the "eventTitle=every" → suffix="Friday" split in Sherlock.
  const lastWord = text.split(/\s+/).pop();
  if (lastWord) return fullTextPass(lastWord);

  return null;
}

const RECURRENCE_PATTERNS: RecurPattern[] = [
  // bare recurrence keywords (anchored to referenceDate, not a synthetic noon)
  { rx: /\bevery\s+day\b/i, info: { unit: 'd', value: 1, raw: '+1d' } },
  { rx: /\bdaily\b/i, info: { unit: 'd', value: 1, raw: '+1d' } },
  { rx: /\bevery\s+week\b/i, info: { unit: 'w', value: 1, raw: '+1w' } },
  { rx: /\bweekly\b/i, info: { unit: 'w', value: 1, raw: '+1w' } },
  { rx: /\bevery\s+month\b/i, info: { unit: 'm', value: 1, raw: '+1m' } },
  { rx: /\bmonthly\b/i, info: { unit: 'm', value: 1, raw: '+1m' } },
  { rx: /\bevery\s+year\b/i, info: { unit: 'y', value: 1, raw: '+1y' } },
  { rx: /\byearly\b/i, info: { unit: 'y', value: 1, raw: '+1y' } },
  { rx: /\bevery\s+morning\b/i, info: { unit: 'd', value: 1, raw: '+1d' } },
  { rx: /\bevery\s+afternoon\b/i, info: { unit: 'd', value: 1, raw: '+1d' } },
  { rx: /\bevery\s+evening\b/i, info: { unit: 'd', value: 1, raw: '+1d' } },
  { rx: /\bevery\s+night\b/i, info: { unit: 'd', value: 1, raw: '+1d' } },
  { rx: /\bevery\s+weekend\b/i, info: { unit: 'w', value: 1, raw: '+1w' } },
  // weekdays anchored to referenceDate
  {
    rx: /\bevery\s+monday\b/i,
    info: { unit: 'w', value: 1, raw: '+1w', weekday: 'monday' },
  },
  {
    rx: /\bevery\s+tuesday\b/i,
    info: { unit: 'w', value: 1, raw: '+1w', weekday: 'tuesday' },
  },
  {
    rx: /\bevery\s+wednesday\b/i,
    info: { unit: 'w', value: 1, raw: '+1w', weekday: 'wednesday' },
  },
  {
    rx: /\bevery\s+thursday\b/i,
    info: { unit: 'w', value: 1, raw: '+1w', weekday: 'thursday' },
  },
  {
    rx: /\bevery\s+friday\b/i,
    info: { unit: 'w', value: 1, raw: '+1w', weekday: 'friday' },
  },
  {
    rx: /\bevery\s+saturday\b/i,
    info: { unit: 'w', value: 1, raw: '+1w', weekday: 'saturday' },
  },
  {
    rx: /\bevery\s+sunday\b/i,
    info: { unit: 'w', value: 1, raw: '+1w', weekday: 'sunday' },
  },
];

// ---------------------------------------------------------------------------
// DTO returned by parse() and consumed by SmartDateProcessor
// ---------------------------------------------------------------------------

export interface ParsedDateInfo {
  date: Date | null;
  repeat: DateRepeatInfo | null;
  isRecurring: boolean;
  rawExpression: string;
  matchedText: string;
  hasTime: boolean;
}

/**
 * Return a greedy variant of `rx` (end-of-string anchor stripped, /g flag
 * added) so that exec() can visit every position in the string rather than
 * stopping at the final-end match.  Used in {@link eventTitleIsRecurrence}.
 *
 * Handles three end-anchor forms used in TODOseq recurrence patterns:
 *   `\b$`  → keep the word-boundary, drop the $ (common case)
 *   `$`    → drop the $ alone
 *   (none) → no stripping needed
 */
function buildGreedyRx(rx: RegExp): RegExp {
  let source = rx.source;
  const trailingWordBound = source.match(/\\b\s*$/m);
  const trailingEos = /[^\\]\s*$$/m.exec(source);
  if (trailingWordBound?.[0]) {
    // Keep \b as left-side word-boundary guard; strip the \b and everything after it.
    source = source.substring(0, source.lastIndexOf('\\b'));
  } else if (trailingEos) {
    // Plain $ at end — drop just the final `$`.
    source = source.substring(0, source.length - 1);
  }
  // Always force the 'g' flag; preserve all existing flags.
  const greedyFlags = rx.flags.replace('g', '') + 'g';
  return new RegExp(source, greedyFlags);
}

const RECURRENCE_PATTERNS_GREEDY = RECURRENCE_PATTERNS.map((p) => ({
  ...p,
  greedyRx: buildGreedyRx(p.rx),
}));

/**
 * Returns true when `eventTitle` (the non-date prefix peeled off by Sherlock)
 * ends with a standalone recurrence keyword.
 *
 * Example: "daily 20:00" → eventTitle="daily", suffix="20:00",
 *          result: true.
 *
 * Uses the pre-compiled greedy regex so every inline occurrence of each
 * pattern is tested; the one that actually hits the end-of-string boundary
 * wins.  A bare `exec()` call would only return the first hit and miss
 * patterns like "TODO Daily meeting daily" where the genuine recurrence word
 * is both the first and last occurrence.
 */
function eventTitleIsRecurrence(eventTitle: string): boolean {
  for (const p of RECURRENCE_PATTERNS_GREEDY) {
    let hit: RegExpExecArray | null;
    while ((hit = p.greedyRx.exec(eventTitle)) !== null) {
      if (hit.index + hit[0].length === eventTitle.length) {
        return true;
      }
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Shared validation constants (defined at module scope so both the
// validation block and the rawExpression-building blocks can reference them)
// ---------------------------------------------------------------------------

const CONNECTOR_WORDS = [
  'due',
  'scheduled',
  'deadline',
  'on',
  'at',
  'this',
  'next',
  'in',
] as const;

/**
 * Readonly array of known date-related words (used for both Array.includes
 * and CONNECTOR_WORDS reference).  Kept as an array so that
 * Array.prototype.includes() can be used, which accepts `unknown` as the
 * search element — avoiding the TS2537 "no matching index signature for
 * type number" error that Set.has() produces with a literal-union cast.
 */
const DATE_RELATED_WORDS_LIST = [
  'today',
  'tomorrow',
  'yesterday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
  'week',
  'day',
  'month',
  'year',
  'hour',
  'minute',
  'morning',
  'afternoon',
  'evening',
  'night',
  'weekend',
  'daily',
  'weekly',
  'monthly',
  'yearly',
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
  'every',
] as const;

type DateRelatedWord = (typeof DATE_RELATED_WORDS_LIST)[number];

// ---------------------------------------------------------------------------
// Public parse()
// ---------------------------------------------------------------------------

export class NaturalDateParser {
  /**
   * Parse a text string looking for a natural-language date expression at
   * the very end of the line.
   *
   * Two-pass approach, both running from the parser's own call:
   *
   *  Pass 1 — Recurrence overlay
   *      Intercepts TODOseq recurrence keywords (daily, every week, every
   *      Friday …) before sherlockjs sees the text.  Detects and returns a
   *      full ParsedDateInfo with a repeat directive so the smart date
   *      processor can emit `<DATE +1d>` / `<DATE +1w>` syntax directly.
   *
   *  Pass 2 — sherlockjs
   *      Handles every one-shot NLP expression sherlockjs supports:
   *      today, tomorrow, yesterday, day before yesterday, in 5 days/weeks/
   *      months/years/hours, next/last week/month/year, named weekdays
   *      (Monday … Sunday), explicit times (9am, 16:00), named months
   *      (January 27), ISO dates (2026-08-11), and compound expressions
   *      (next Monday at 9am, tomorrow at 16:00).
   *
   * The date text boundary is recovered by removing the eventTitle prefix
   * from the original trimmed input — this is the shaded suffix portion
   * appearing after the non-date prefix.  For a recurrence-plus-time
   * expression like "daily 20:00" sherlockjs returns eventTitle="daily" +
   * startDate=<today+20:00>; the isRecurring flag is set from eventTitle
   * while the date comes from the sherlock result.
   *
   * Returns `null` when no date expression is found at the end.
   */
  static parse(
    text: string,
    referenceDate: Date = new Date(),
  ): ParsedDateInfo | null {
    const trimmed = text.trim();
    if (!trimmed.length) return null;

    // Pass 1 — recurrence overlay (pass reference date through for weekday anchoring)
    {
      const overlay = tryRecurrence(trimmed, referenceDate);
      if (overlay) return overlay;
    }

    // Pass 2 — Sherlock (one-shot date expressions)
    Sherlock._setNow(referenceDate);
    const raw = Sherlock.parse(trimmed);
    if (!raw.startDate) return null;

    let title = (raw.eventTitle ?? '').trim();
    // Use case-insensitive search so Sherlock's lowercased eventTitle still
    // matches the original text (e.g. "TODO" vs "todo").
    const titleLower = title.toLowerCase();
    const trimmedLower = trimmed.toLowerCase();
    let titleIdx = title ? trimmedLower.indexOf(titleLower) : -1;

    // When the eventTitle doesn't appear as a contiguous substring in the
    // original text, Sherlock has split words around the date. Re-parse the
    // full text to see if we can recover a cleaner title that appears
    // contiguously (e.g. "Friday next week" sometimes yields a cleaner title
    // on re-parse). If the re-parse gives an empty title, the whole line is a
    // date expression.
    if (titleIdx < 0 && title.length > 0) {
      Sherlock._setNow(referenceDate);
      const fullValidation = Sherlock.parse(trimmed);
      if (!fullValidation.startDate) return null;
      const validationTitle = (fullValidation.eventTitle ?? '').trim();
      if (validationTitle.length > 0) {
        const validationTitleIdx = trimmedLower.indexOf(
          validationTitle.toLowerCase(),
        );
        if (validationTitleIdx >= 0) {
          title = validationTitle;
          titleIdx = validationTitleIdx;
        }
      }
    }

    let finalText: string;
    if (titleIdx >= 0) {
      finalText = trimmed.substring(titleIdx + title.length).trim();
    } else {
      // Compute finalText from the first word not present in the title.
      // This handles compound dates like "Friday next week" where the title
      // doesn't appear contiguously in the original text.
      const titleWordSet = new Set(
        titleLower.split(/\s+/).filter((w) => w.length > 0),
      );
      const trimmedWords = trimmedLower
        .split(/\s+/)
        .filter((w) => w.length > 0);
      const firstNonTitleIdx = trimmedWords.findIndex(
        (w) => !titleWordSet.has(w),
      );
      if (firstNonTitleIdx < 0) return null;
      let charPos = 0;
      for (let i = 0; i < firstNonTitleIdx; i++) {
        charPos = trimmedLower.indexOf(trimmedWords[i], charPos);
        if (charPos < 0) return null;
        charPos += trimmedWords[i].length;
        while (charPos < trimmed.length && /\s/.test(trimmed[charPos])) {
          charPos++;
        }
      }
      finalText = trimmed.substring(charPos).trim();
    }

    // Detect recurrence by checking whether the EVENT TITLE (not the suffix)
    // is a pure recurrence keyword.  This handles cases like "daily 20:00"
    // where eventTitle="daily" and suffix="20:00".
    const isRecurringFromTitle = title ? eventTitleIsRecurrence(title) : false;

    // Validate that finalText is a pure date expression with no trailing
    // non-date content.  Re-parse finalText standalone; if the standalone
    // parse produces a non-empty eventTitle containing words that are NOT
    // recognised date connectors and are NOT known date-related words,
    // those words are trailing content after the date and the match must
    // be rejected.
    Sherlock._setNow(referenceDate);
    const validation = Sherlock.parse(finalText);
    const validationTitle = (validation.eventTitle ?? '').trim();
    if (validationTitle.length > 0) {
      const validationTitleWords = validationTitle
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length > 0);
      const nonConnectorWords = validationTitleWords.filter(
        (w): boolean => !CONNECTOR_WORDS.includes(w as (typeof CONNECTOR_WORDS)[number]),
      );
      const invalidWords: string[] = nonConnectorWords.filter(
        (w) =>
          !DATE_RELATED_WORDS_LIST.includes(
            w as DateRelatedWord,
          ),
      );
      if (invalidWords.length > 0) {
        return null;
      }
    }

    // Extract `matchedText` to be a precise anchor for
    // `removeDateFromText()`.  Three shapes are possible:
    //
    //   All-day expression  ("on Monday", "at 8:00am"):
    //       The trailing single word is the date reference itself.
    //
    //   Weekday + time      ("on Friday at 2:00pm"):
    //       The date phrase before " at " is what the user typed as the
    //       date expression; the time portion is appended by Sherlock.
    //       `removeDateFromText()` strips "on" and "at" from the remaining
    //       text, so we keep the full weekday phrase.
    //
    //   Time only           ("at 16:00" — weekday is omitted):
    //       No " at " separator; the full finalText is the expression.
    //
    // Using the whole finalText (e.g. "is a problem today") over-includes
    // when there is preceding task text, causing partial removal of the
    // task body (e.g. "TODO there" instead of "TODO there is a problem").
    const atIdx = finalText.lastIndexOf(' at ');
    let matchedText =
      atIdx > 0
        ? finalText.substring(0, atIdx)
        : atIdx === 0
          ? finalText.substring(4)
          : finalText;

    // When there's no " at " separator, strip leading connector words from matchedText.
    // These connectors precede the date expression (e.g., "due tomorrow" → "tomorrow").
    let rawExpression = finalText;
    if (atIdx < 0) {
      const leadingConnectors = [
        /^\bdue\b\s*/i,
        /^\bscheduled\b\s*/i,
        /^\bdeadline\b\s*/i,
        /^\bon\b\s*/i,
        /^\bat\b\s*/i,
        /^\bthis\b\s*/i,
        /^\bnext\b\s*/i,
      ];
      const strippedMatchedText = matchedText;
      for (const rx of leadingConnectors) {
        matchedText = matchedText.replace(rx, '');
      }
      matchedText = matchedText.trim();

      // If a leading connector was stripped from matchedText (e.g. "on Friday"
      // → matchedText="Friday"), include that connector in rawExpression so the
      // highlight plugin highlights the full user-typed expression.
      const strippedLen = strippedMatchedText.length - matchedText.length;
      if (strippedLen > 0) {
        const matchedLower = matchedText.toLowerCase();
        const trimmedLower = trimmed.toLowerCase();
        const matchedIdx = matchedLower
          ? trimmedLower.lastIndexOf(matchedLower)
          : -1;
        if (matchedIdx > 0) {
          const connectorCandidate = trimmed.substring(0, matchedIdx).trim();
          const connectorWord = connectorCandidate.split(/\s+/).pop() ?? '';
          if (
            connectorWord.length > 0 &&
            strippedMatchedText.toLowerCase().startsWith(
              connectorWord.toLowerCase(),
            )
          ) {
            rawExpression = connectorWord + ' ' + matchedText;
          }
        }
      }

      // If no connector was stripped (e.g. "scheduled Friday" → matchedText still
      // "Friday"), the connector word lives in the EVENT TITLE ("TODO test
      // scheduled") and never appears in finalText.  Check whether the title's
      // last word is a known connector and, if so, prepend it to rawExpression
      // so the full "scheduled Friday" is highlighted.
      if (
        strippedLen === 0 &&
        title.length > 0 &&
        rawExpression === finalText
      ) {
        const titleWords = title.trim().split(/\s+/);
        const lastTitleWord = titleWords[titleWords.length - 1].toLowerCase();
        if (
          CONNECTOR_WORDS.includes(
            lastTitleWord as typeof CONNECTOR_WORDS[number],
          )
        ) {
          rawExpression = lastTitleWord + ' ' + matchedText;
        }
      }
    }

    return {
      date: raw.startDate,
      repeat: isRecurringFromTitle
        ? { type: '+', unit: 'd', value: 1, raw: '+1d' }
        : null,
      isRecurring: isRecurringFromTitle,
      rawExpression,
      matchedText,
      hasTime: !raw.isAllDay,
    };
  }

  /**
   * Quick boolean test — does this text end with a date expression?
   * Delegates to {@link parse} internally for consistency.
   */
  static hasDateAtEnd(text: string): boolean {
    return NaturalDateParser.parse(text) !== null;
  }

  /**
   * Remove the matched date expression from the line, returning only the
   * task action text.
   *
   * Two phases:
   *  1. The matched date text (from `result.matchedText`) is cut out by index.
   *  2. A trailing date-connector word — "due", "deadline", "scheduled",
   *     "on", "at" — is stripped if it sits immediately before the date.
   *
   * Examples:
   *   "TODO project due tomorrow"    → "TODO project"
   *   "TODO Call John on Monday"     → "TODO Call John"
   *   "TODO Standup at 8:00am"       → "TODO Standup"
   *   "no date here"                 → "no date here"   (unchanged)
   */
  static removeDateFromText(text: string): string {
    const result = NaturalDateParser.parse(text);
    if (!result) return text;

    const loose = text.trim();
    const mw = result.matchedText;

    // Find the matched text in the original string
    let before = loose;
    if (mw) {
      const idx = loose.lastIndexOf(mw);
      if (idx >= 0) {
        before = loose.substring(0, idx).trim();
      }
    }

    // Strip connector words that immediately precede the matched text.
    // These connectors are in the eventTitle but not part of the date expression.
    // Use word boundary at end to match "due", "on", etc. at end of string.
    const connectors = [
      /\bdue\s*$/i,
      /\bscheduled\s*$/i,
      /\bdeadline\s*$/i,
      /\bon\s*$/i,
      /\bat\s*$/i,
      /\bthis\s*$/i,
      /\bnext\s*$/i,
    ];
    for (const rx of connectors) {
      before = before.replace(rx, '').trim();
    }

    return before;
  }
}
