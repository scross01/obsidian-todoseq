/**
 * Natural language date parser backed by chrono-node.
 *
 * Uses chrono-node (`chrono.casual.parse()`) to detect natural date
 * expressions such as "today", "tomorrow", "next Monday", "at 9am",
 * "2026-08-11", or "on Friday at 2:00pm" in task text.
 *
 * A recurrence overlay runs before the chrono call to catch TODOseq-specific
 * recurrence keywords (daily, every Friday …) that chrono does not resolve
 * as date expressions.
 *
 * The output format (<YYYY-MM-DD Weekday>) is produced by
 * `formatOrgDate()` in task-format.ts — that function is unchanged.
 */

import { DateRepeatInfo } from '../types/task';
import * as chrono from 'chrono-node';

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

const RECURRENCE_PATTERNS: RecurPattern[] = [
  // bare recurrence keywords (anchored to referenceDate, not a synthetic noon)
  { rx: /\bevery\s+day\b/i, info: { unit: 'd', value: 1, raw: '+1d' } },
  { rx: /\bdaily\b/i, info: { unit: 'd', value: 1, raw: '+1d' } },
  { rx: /\bevery\s+week\b/i, info: { unit: 'w', value: 1, raw: '++1w' } },
  { rx: /\bweekly\b/i, info: { unit: 'w', value: 1, raw: '++1w' } },
  { rx: /\bevery\s+month\b/i, info: { unit: 'm', value: 1, raw: '++1m' } },
  { rx: /\bmonthly\b/i, info: { unit: 'm', value: 1, raw: '++1m' } },
  { rx: /\bevery\s+year\b/i, info: { unit: 'y', value: 1, raw: '++1y' } },
  { rx: /\byearly\b/i, info: { unit: 'y', value: 1, raw: '++1y' } },
  { rx: /\bevery\s+morning\b/i, info: { unit: 'd', value: 1, raw: '+1d' } },
  { rx: /\bevery\s+afternoon\b/i, info: { unit: 'd', value: 1, raw: '+1d' } },
  { rx: /\bevery\s+evening\b/i, info: { unit: 'd', value: 1, raw: '+1d' } },
  { rx: /\bevery\s+night\b/i, info: { unit: 'd', value: 1, raw: '+1d' } },
  { rx: /\bevery\s+weekend\b/i, info: { unit: 'w', value: 1, raw: '++1w' } },
  // weekdays anchored to referenceDate
  {
    rx: /\bevery\s+monday\b/i,
    info: { unit: 'w', value: 1, raw: '++1w', weekday: 'monday' },
  },
  {
    rx: /\bevery\s+tuesday\b/i,
    info: { unit: 'w', value: 1, raw: '++1w', weekday: 'tuesday' },
  },
  {
    rx: /\bevery\s+wednesday\b/i,
    info: { unit: 'w', value: 1, raw: '++1w', weekday: 'wednesday' },
  },
  {
    rx: /\bevery\s+thursday\b/i,
    info: { unit: 'w', value: 1, raw: '++1w', weekday: 'thursday' },
  },
  {
    rx: /\bevery\s+friday\b/i,
    info: { unit: 'w', value: 1, raw: '++1w', weekday: 'friday' },
  },
  {
    rx: /\bevery\s+saturday\b/i,
    info: { unit: 'w', value: 1, raw: '++1w', weekday: 'saturday' },
  },
  {
    rx: /\bevery\s+sunday\b/i,
    info: { unit: 'w', value: 1, raw: '++1w', weekday: 'sunday' },
  },
];

// ---------------------------------------------------------------------------
// Recurrence helpers (shared by the overlay and post-chrono recovery)
// ---------------------------------------------------------------------------

interface RecurMatchResult {
  info: RecurMatch;
  matchText: string;
  matchIndex: number;
}

interface EndAnchoredPattern {
  rx: RegExp;
  info: RecurMatch;
}

const RECURRENCE_END_PATTERNS: EndAnchoredPattern[] = RECURRENCE_PATTERNS.map(
  (p) => ({
    rx: new RegExp(p.rx.source + '$', p.rx.flags),
    info: p.info,
  }),
);

/** Return the first end-anchored pattern whose regex matches `text`. */
function matchRecurrenceAtEnd(text: string): RecurMatchResult | null {
  for (const p of RECURRENCE_END_PATTERNS) {
    const m = p.rx.exec(text);
    if (m) {
      return { info: p.info, matchText: m[0], matchIndex: m.index };
    }
  }
  return null;
}

/** Build a ParsedDateInfo for a matching RecurPattern hit. */
function makeRecurResult(
  matched: string,
  match: RecurMatch,
  now: Date,
  matchIndex: number,
): ParsedDateInfo {
  return {
    date: recurrenceDate(now, match),
    repeat: {
      type: match.raw.startsWith('++')
        ? '++'
        : match.raw.startsWith('.+')
          ? '.+'
          : '+',
      unit: match.unit,
      value: match.value,
      raw: match.raw,
    },
    isRecurring: true,
    rawExpression: matched,
    matchedText: matched,
    hasTime: false,
    matchIndex,
  };
}

/**
 * Try to match a recurrence keyword at the end of `text`.
 * Two passes: full text, then last word only.
 */
function tryRecurrence(text: string, now: Date): ParsedDateInfo | null {
  {
    const m = matchRecurrenceAtEnd(text);
    if (m) return makeRecurResult(m.matchText, m.info, now, m.matchIndex);
  }
  const lastWord = text.split(/\s+/).pop();
  if (lastWord) {
    const lastWordIdx = text.lastIndexOf(lastWord);
    if (lastWordIdx >= 0) {
      const m = matchRecurrenceAtEnd(lastWord);
      if (m) {
        return makeRecurResult(
          m.matchText,
          m.info,
          now,
          lastWordIdx + m.matchIndex,
        );
      }
    }
  }
  return null;
}

/**
 * Check if the given text ends with a TODOseq recurrence keyword.
 * Used after chrono parsing to detect cases like "daily 20:00" where
 * a recurrence keyword precedes the chrono-matched time expression.
 */
function findRecurrenceAtEnd(text: string): RecurMatch | null {
  const m = matchRecurrenceAtEnd(text.trimEnd());
  return m ? m.info : null;
}

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
  /** 0-based index of the matched date text in the original trimmed line. */
  matchIndex: number;
}

// Connector words that precede date expressions but are NOT included in
// chrono's match text.  These are preserved in rawExpression for highlighting
// and stripped by removeDateFromText.
const PRECEDING_CONNECTORS = /\b(due|deadline|scheduled)\s+$/i;

// ---------------------------------------------------------------------------
// Public parse()
// ---------------------------------------------------------------------------

export class NaturalDateParser {
  /**
   * Parse a text string looking for a natural-language date expression.
   *
   * Two-pass approach:
   *
   *  Pass 1 — Recurrence overlay
   *      Intercepts TODOseq recurrence keywords (daily, every week, every
   *      Friday …) before chrono sees the text.  Detects and returns a full
   *      ParsedDateInfo with a repeat directive so the smart date processor
   *      can emit `<DATE +1d>` / `<DATE +1w>` syntax directly.
   *
   *  Pass 2 — chrono-node
   *      Uses chrono's casual parser to detect one-shot NLP date expressions:
   *      today, tomorrow, yesterday, in 5 days/weeks/months/years/hours,
   *      next/last week/month/year, named weekdays (Monday … Sunday),
   *      explicit times (9am, 16:00), named months (January 27), ISO dates
   *      (2026-08-11), and compound expressions (next Monday at 9am,
   *      tomorrow at 16:00, on Friday at 2:00pm).
   *
   * Returns `null` when no date expression is found.
   */
  static parse(
    text: string,
    referenceDate: Date = new Date(),
  ): ParsedDateInfo | null {
    const trimmed = text.trim();
    if (!trimmed.length) return null;

    // Pass 1 — recurrence overlay
    {
      const overlay = tryRecurrence(trimmed, referenceDate);
      if (overlay) return overlay;
    }

    // Pass 2 — chrono-node
    const results = chrono.casual.parse(trimmed, referenceDate);
    if (!results || results.length === 0) return null;

    const r = results[results.length - 1];
    const parsedDate = r.start.date();
    if (!parsedDate) return null;

    const matchedText = r.text;
    const matchIndex = r.index;

    // Detect time-of-day keywords that chrono treats as implied (not certain)
    const timeKeywordMatch = !r.start.isCertain('hour')
      ? matchedText.match(/\b(morning|afternoon|evening)\b/i)
      : null;
    const hasTime =
      r.start.isCertain('hour') ||
      timeKeywordMatch !== null ||
      /\b(night|tonight)\b/i.test(matchedText);

    // Override chrono's implied hour for time-of-day keywords so the
    // output matches the documented values.
    if (timeKeywordMatch) {
      const TIME_OF_DAY_HOURS: Record<string, number> = {
        morning: 8,
        afternoon: 14,
        evening: 19,
      };
      parsedDate.setHours(
        TIME_OF_DAY_HOURS[timeKeywordMatch[1].toLowerCase()],
        0,
        0,
        0,
      );
    }

    // Reject matches with non-whitespace content after the date expression.
    // This restores the prior "date at end of line" behaviour so that
    // auto-conversion does not rewrite lines whose trailing text the user
    // did not intend as a date (e.g. "TODO task today invalid").
    const afterChrono = trimmed.substring(matchIndex + matchedText.length);
    if (afterChrono.trimStart().length > 0) return null;

    // When chrono resolves a bare month-day (e.g. "January 27") to the
    // reference year but that date has already passed, advance to the
    // next year so the result stays in the future.
    if (
      !r.start.isCertain('year') &&
      !r.start.isCertain('weekday') &&
      parsedDate < referenceDate
    ) {
      const bumped = new Date(parsedDate);
      bumped.setFullYear(bumped.getFullYear() + 1);
      parsedDate.setTime(bumped.getTime());
    }

    // Check if the text immediately before the chrono match ends with a
    // recurrence keyword.  This handles "TODO task daily 20:00" where
    // chrono only matches "20:00" but the task is recurring daily.
    const beforeChrono = trimmed.substring(0, matchIndex);
    const recurMatch = findRecurrenceAtEnd(beforeChrono);

    // Compute rawExpression for highlighting.  Chrono includes common
    // connector words ("on", "at", "this", "next", "in") in its match
    // text, but NOT "due", "deadline", or "scheduled".  Check the text
    // immediately before the match and prepend the connector if present.
    let rawExpression = matchedText;
    const connectorMatch = beforeChrono.match(PRECEDING_CONNECTORS);
    if (connectorMatch) {
      rawExpression = connectorMatch[0].trim() + ' ' + matchedText;
    }

    return {
      date: parsedDate,
      repeat: recurMatch
        ? {
            type: recurMatch.raw.startsWith('++')
              ? ('++' as const)
              : recurMatch.raw.startsWith('.+')
                ? ('.+' as const)
                : ('+' as const),
            unit: recurMatch.unit,
            value: recurMatch.value,
            raw: recurMatch.raw,
          }
        : null,
      isRecurring: recurMatch !== null,
      rawExpression,
      matchedText,
      hasTime,
      matchIndex,
    };
  }

  /**
   * Quick boolean test — does this text contain a date expression?
   * Delegates to {@link parse} internally for consistency.
   */
  static hasDate(text: string): boolean {
    return NaturalDateParser.parse(text) !== null;
  }

  /**
   * Remove the matched date expression from the line, returning only the
   * task action text.
   *
   * Uses chrono's exact match position for precise removal, then strips
   * preceding connector words ("due", "deadline", "scheduled") that chrono
   * does not include in the match text.
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

    const trimmed = text.trim();
    const beforeRaw = trimmed.substring(0, result.matchIndex);
    const afterRaw = trimmed.substring(
      result.matchIndex + result.matchedText.length,
    );

    // Strip preceding connector words that chrono didn't include in the match.
    const before = beforeRaw.replace(PRECEDING_CONNECTORS, '').trimEnd();

    return (before + ' ' + afterRaw).trim();
  }
}
