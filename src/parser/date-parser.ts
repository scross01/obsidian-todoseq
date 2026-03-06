/**
 * Date utility functions for parsing various date formats
 */

import { DateUtils } from '../utils/date-utils';
import { DateRepeatInfo } from '../types/task';
import { extractRepeaterFromDate } from '../utils/date-repeater';

// Date format types
export type DateFormat =
  | 'DATE_ONLY'
  | 'DATE_WITH_DOW'
  | 'DATE_WITH_DOW_ONLY'
  | 'DATE_WITH_DOW_AFTER_TIME'
  | 'DATE_WITH_TIME';

// Date pattern interface
interface DatePattern {
  type: DateFormat;
  regex: RegExp;
  hasTime: boolean;
  hasDayOfWeek: boolean;
}

// Date pattern registry
const DATE_PATTERNS: DatePattern[] = [
  {
    type: 'DATE_WITH_DOW',
    regex:
      /^<(\d{4}-\d{2}-\d{2})\s+(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+(\d{2}:\d{2})>/,
    hasTime: true,
    hasDayOfWeek: true,
  },
  {
    type: 'DATE_WITH_DOW_AFTER_TIME',
    regex:
      /^<(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})\s+(Mon|Tue|Wed|Thu|Fri|Sat|Sun)>/,
    hasTime: true,
    hasDayOfWeek: true,
  },
  {
    type: 'DATE_WITH_DOW_ONLY',
    regex: /^<(\d{4}-\d{2}-\d{2})\s+(Mon|Tue|Wed|Thu|Fri|Sat|Sun)>/,
    hasTime: false,
    hasDayOfWeek: true,
  },
  {
    type: 'DATE_WITH_TIME',
    regex: /^<(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})>/,
    hasTime: true,
    hasDayOfWeek: false,
  },
  {
    type: 'DATE_ONLY',
    regex: /^<(\d{4}-\d{2}-\d{2})>/,
    hasTime: false,
    hasDayOfWeek: false,
  },
];

/**
 * Date parsing utility class
 */
export class DateParser {
  /**
   * Parse a date string with optional time
   * @param dateStr Date string in YYYY-MM-DD format
   * @param timeStr Optional time string in HH:mm format
   * @returns Date object in local time (timezone independent)
   */
  static parseDateTimeString(dateStr: string, timeStr: string): Date {
    const [year, month, day] = dateStr.split('-').map(Number);
    const [hours, minutes] = timeStr.split(':').map(Number);

    // Use DateUtils.createDate for timezone-independent date creation
    return DateUtils.createDate(year, month - 1, day, hours, minutes);
  }

  /**
   * Parse a date string (date only)
   * @param dateStr Date string in YYYY-MM-DD format
   * @returns Date object at midnight local time (timezone independent)
   */
  static parseDateString(dateStr: string): Date {
    const [year, month, day] = dateStr.split('-').map(Number);

    // Use DateUtils.createDate for timezone-independent date creation
    return DateUtils.createDate(year, month - 1, day);
  }

  /**
   * Parse a date from a string using registered patterns
   * @param content The string content to parse
   * @returns Parsed Date object or null if parsing fails
   */
  static parseDate(content: string): Date | null {
    // First extract any repeater to get the base date string
    const { baseDateStr } = extractRepeaterFromDate(content);

    // Try each pattern in order
    for (const pattern of DATE_PATTERNS) {
      const match = pattern.regex.exec(baseDateStr);
      if (match) {
        const dateStr = match[1];

        if (pattern.hasTime) {
          const timeStr =
            pattern.type === 'DATE_WITH_DOW' ? match[3] : match[2];
          return this.parseDateTimeString(dateStr, timeStr);
        } else {
          return this.parseDateString(dateStr);
        }
      }
    }

    return null;
  }

  /**
   * Parse a date and extract repeater info from a string
   * @param content The string content to parse (e.g., "<2026-03-05 Wed 07:00 .+1d>")
   * @returns Object with parsed date and optional repeater info
   */
  static parseDateWithRepeater(content: string): {
    date: Date | null;
    repeat: DateRepeatInfo | null;
  } {
    // Extract repeater from full content
    const { baseDateStr, repeat } = extractRepeaterFromDate(content);

    // Try each pattern in order on base date string
    for (const pattern of DATE_PATTERNS) {
      const match = pattern.regex.exec(baseDateStr);
      if (match) {
        const dateStr = match[1];
        let date: Date;

        if (pattern.hasTime) {
          let timeStr: string;
          if (pattern.type === 'DATE_WITH_DOW') {
            timeStr = match[3];
          } else if (pattern.type === 'DATE_WITH_DOW_AFTER_TIME') {
            timeStr = match[2];
          } else {
            timeStr = match[2];
          }
          date = this.parseDateTimeString(dateStr, timeStr);
        } else {
          date = this.parseDateString(dateStr);
        }

        return { date, repeat };
      }
    }

    return { date: null, repeat: null };
  }
}
