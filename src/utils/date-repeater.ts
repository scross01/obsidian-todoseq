/**
 * Date repeater utility functions for org-mode compatible repeating dates.
 * Supports: + (plain), .+ (shift from now), ++ (catch-up) with y/m/w/d/h units.
 */

import { DateRepeatInfo } from '../types/task';
import { DateUtils } from './date-utils';

// Regex to match repeater cookie: .+1d, ++1w, +1m, .+1h, +1y, etc.
const REPEATER_REGEX = /(\.\+|\+\+|\+)([1-9]\d*)([yYmMwWdDh])/;

/**
 * Parse a repeater string into DateRepeatInfo.
 *
 * @param repeaterStr - The repeater string (e.g., ".+1d", "++1w", "+1m")
 * @returns DateRepeatInfo or null if invalid
 *
 * @example
 * parseRepeater(".+1d") // { type: '.+', unit: 'd', value: 1, raw: ".+1d" }
 * parseRepeater("++1w") // { type: '++', unit: 'w', value: 1, raw: "++1w" }
 * parseRepeater("+1m")  // { type: '+', unit: 'm', value: 1, raw: "+1m" }
 */
export function parseRepeater(repeaterStr: string): DateRepeatInfo | null {
  const match = REPEATER_REGEX.exec(repeaterStr);
  if (!match) {
    return null;
  }

  const type = match[1] as '+' | '.+' | '++';
  const value = parseInt(match[2], 10);
  const unitChar = match[3].toLowerCase() as 'y' | 'm' | 'w' | 'd' | 'h';

  return {
    type,
    unit: unitChar,
    value,
    raw: match[0],
  };
}

/**
 * Extract the repeater from a full date content string.
 *
 * @param dateContent - Full date content (e.g., "<2026-03-05 Wed 07:00 .+1d>")
 * @returns Object with base date string and optional repeater info
 *
 * @example
 * extractRepeaterFromDate("<2026-03-05 Wed 07:00 .+1d>")
 * // { baseDateStr: "<2026-03-05 Wed 07:00>", repeat: { type: '.+', unit: 'd', value: 1, raw: ".+1d" } }
 */
export function extractRepeaterFromDate(dateContent: string): {
  baseDateStr: string;
  repeat: DateRepeatInfo | null;
} {
  const match = REPEATER_REGEX.exec(dateContent);
  if (!match) {
    return { baseDateStr: dateContent, repeat: null };
  }

  const repeat = parseRepeater(match[0]);
  let baseDateStr =
    dateContent.slice(0, match.index) +
    dateContent.slice(match.index + match[0].length);

  // Remove trailing space before the closing > (e.g., "<2026-01-01 +1m>" -> "<2026-01-01 >" -> "<2026-01-01>")
  baseDateStr = baseDateStr.replace(/\s+>$/, '>');

  return { baseDateStr: baseDateStr.trim(), repeat };
}

/**
 * Calculate the next occurrence date based on repeater type.
 *
 * @param baseDate - The base/original date from the task
 * @param repeat - The repeater info
 * @param fromDate - Reference date for calculation (typically current date/time)
 * @returns The next occurrence date
 *
 * Behavior:
 * - '+': Add value * unit to base date (plain repeat)
 * - '.+': If baseDate < fromDate, find next occurrence after fromDate.
 *         If baseDate > fromDate, add to baseDate.
 * - '++': Add multiples of unit until date is in the future, preserving day-of-week for w/d
 */
export function calculateNextRepeatDate(
  baseDate: Date,
  repeat: DateRepeatInfo,
  fromDate: Date = new Date(),
): Date {
  const { type, unit, value } = repeat;

  switch (type) {
    case '+':
      // Plain repeat: add to base date
      return addToDate(baseDate, unit, value);

    case '.+':
      // Delay repeat:
      // - If baseDate < fromDate: find next occurrence after fromDate
      // - If baseDate > fromDate: add to baseDate (use initial as base)
      if (baseDate < fromDate) {
        return calculateNextOccurrenceAfter(baseDate, unit, value, fromDate);
      } else {
        return addToDate(baseDate, unit, value);
      }

    case '++':
      // Catch-up: add until date is in future
      return calculateCatchUpDate(baseDate, unit, value, fromDate);

    default:
      // Fallback to plain repeat
      return addToDate(baseDate, unit, value);
  }
}

/**
 * Calculate the next occurrence after a given date.
 * For .+ (delay):
 * - d: If base time > from time, use today at base time. Otherwise, add 1 day.
 * - h: Always add 1 hour to from time (not base time).
 * - w: Same as d (weeks).
 * - m: Add 1 month to from date, preserving the time from baseDate.
 * - y: Add 1 year to from date, preserving the time from baseDate.
 */
function calculateNextOccurrenceAfter(
  baseDate: Date,
  unit: 'y' | 'm' | 'w' | 'd' | 'h',
  value: number,
  fromDate: Date,
): Date {
  // Extract base time for comparison and preservation
  const baseHours = baseDate.getHours();
  const baseMinutes = baseDate.getMinutes();
  const baseTimeInMinutes = baseHours * 60 + baseMinutes;

  // Create result starting from today
  let result = new Date(fromDate);
  const fromHours = fromDate.getHours();
  const fromMinutes = fromDate.getMinutes();
  const fromTimeInMinutes = fromHours * 60 + fromMinutes;

  // For d/w units:
  // - If base time > from time: use today at base time
  // - Otherwise: add one day/week
  if (unit === 'd' || unit === 'w') {
    if (baseTimeInMinutes > fromTimeInMinutes) {
      // Use today at base time
      result.setHours(baseHours, baseMinutes, 0, 0);
    } else {
      // Add one day/week
      if (unit === 'w') {
        result.setDate(result.getDate() + value * 7);
      } else {
        result.setDate(result.getDate() + value);
      }
      // Preserve base time after adding
      result.setHours(baseHours, baseMinutes, 0, 0);

      // For weekly, ensure correct day of week
      if (unit === 'w') {
        const baseDayOfWeek = baseDate.getDay();
        while (result.getDay() !== baseDayOfWeek) {
          result.setDate(result.getDate() + 1);
        }
        result.setHours(baseHours, baseMinutes, 0, 0);
      }
    }
  } else if (unit === 'h') {
    // For hourly: add 1 hour to from time, preserving from minutes
    result.setHours(fromHours + value, fromMinutes, 0, 0);
  } else {
    // For m/y units: add to from date, preserving base time
    result = new Date(fromDate);
    result.setHours(baseHours, baseMinutes, 0, 0);

    switch (unit) {
      case 'y':
        result.setFullYear(result.getFullYear() + value);
        break;
      case 'm':
        result.setMonth(result.getMonth() + value);
        break;
    }
  }

  return result;
}

/**
 * Add a time value to a date.
 */
function addToDate(
  date: Date,
  unit: 'y' | 'm' | 'w' | 'd' | 'h',
  value: number,
): Date {
  const result = new Date(date);

  switch (unit) {
    case 'y':
      result.setFullYear(result.getFullYear() + value);
      break;
    case 'm':
      result.setMonth(result.getMonth() + value);
      break;
    case 'w':
      result.setDate(result.getDate() + value * 7);
      break;
    case 'd':
      result.setDate(result.getDate() + value);
      break;
    case 'h':
      result.setHours(result.getHours() + value);
      break;
  }

  return result;
}

/**
 * Calculate catch-up date: add one interval to base date, then move to future if needed.
 * For weekly, preserves day-of-week.
 */
function calculateCatchUpDate(
  baseDate: Date,
  unit: 'y' | 'm' | 'w' | 'd' | 'h',
  value: number,
  fromDate: Date,
): Date {
  let result = new Date(baseDate);

  // Always add one interval first (even if baseDate is in future)
  result = addToDate(result, unit, value);

  // Handle weekly and daily with day-of-week preservation
  if (unit === 'w') {
    const baseDayOfWeek = baseDate.getDay();

    // Ensure we land on the same day of week
    while (result.getDay() !== baseDayOfWeek) {
      result.setDate(result.getDate() + 1);
    }
  }

  // Ensure result is in the future
  while (result <= fromDate) {
    if (unit === 'w') {
      result.setDate(result.getDate() + value * 7);
    } else {
      result = addToDate(result, unit, value);
    }
  }

  // If the base date has a time, preserve the time portion
  if (baseDate.getHours() !== 0 || baseDate.getMinutes() !== 0) {
    // For .+/++ with time, also ensure the time is in the future
    const baseTime = baseDate.getHours() * 60 + baseDate.getMinutes();
    const fromTime = fromDate.getHours() * 60 + fromDate.getMinutes();

    // If the result date is today, check if time is still in the past
    const resultDateOnly = DateUtils.getStartOfDay(result);
    const fromDateOnly = DateUtils.getStartOfDay(fromDate);

    if (
      resultDateOnly.getTime() === fromDateOnly.getTime() &&
      baseTime <= fromTime
    ) {
      // Add one more interval
      result = addToDate(result, unit, value);
    }
  }

  return result;
}

/**
 * Check if a task has any repeater (scheduled or deadline).
 */
export function hasRepeater(task: {
  scheduledDateRepeat: DateRepeatInfo | null;
  deadlineDateRepeat: DateRepeatInfo | null;
}): boolean {
  return task.scheduledDateRepeat !== null || task.deadlineDateRepeat !== null;
}

/**
 * Get the effective display date for a scheduled or deadline date.
 * If there's a repeater, calculate the next occurrence from now.
 *
 * @param date - The base date from the task
 * @param repeat - The repeater info (if any)
 * @returns The effective date to display
 */
export function getEffectiveDate(
  date: Date | null,
  repeat: DateRepeatInfo | null,
): Date | null {
  if (!date) {
    return null;
  }

  if (!repeat) {
    return date;
  }

  return calculateNextRepeatDate(date, repeat, new Date());
}

/**
 * Format a date line with a new date, preserving the original line's prefix and repeater.
 *
 * @param line - The original line containing the date in angle brackets
 * @param newDate - The new date to format
 * @param repeat - Optional repeater info to preserve
 * @returns The formatted line with the new date
 *
 * @example
 * formatDateLine("SCHEDULED: <2026-03-05 Wed 07:00 .+1d>", new Date(2026, 2, 6), { type: '.+', unit: 'd', value: 1, raw: '.+1d' })
 * // Returns: "SCHEDULED: <2026-03-06 Thu 07:00 .+1d>"
 */
export function formatDateLine(
  line: string,
  newDate: Date,
  repeat: DateRepeatInfo | null | undefined,
): string {
  const year = newDate.getFullYear();
  const month = String(newDate.getMonth() + 1).padStart(2, '0');
  const day = String(newDate.getDate()).padStart(2, '0');
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const dayName = days[newDate.getDay()];

  // Extract the date content from the angle brackets
  const dateContentMatch = line.match(/<(.[^>]*)>/);
  if (!dateContentMatch) {
    return line;
  }

  const oldDateContent = dateContentMatch[1];

  // Check for time in old date - time can appear in various positions:
  // - <2008-02-08 20:00 Fri ++1d> (time before DOW)
  // - <2008-02-08 Fri 20:00 ++1d> (time after DOW)
  // - <2008-02-08 20:00 ++1d> (time before repeater)
  // - <2008-02-08 20:00> (just time)
  const timeMatch = oldDateContent.match(/(\d{2}:\d{2})/);
  const timeStr = timeMatch ? ` ${timeMatch[1]}` : '';

  // Build new date content: always DOW before time
  let newDateContent = `${year}-${month}-${day} ${dayName}${timeStr}`;

  // Add repeater if present
  if (repeat) {
    newDateContent += ` ${repeat.raw}`;
  }

  return line.replace(/<.[^>]*>/, `<${newDateContent}>`);
}
