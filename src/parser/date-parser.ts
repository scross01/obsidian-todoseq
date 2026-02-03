/**
 * Date utility functions for parsing various date formats
 */

import { DateUtils } from '../utils/date-utils';

// Date format types
export type DateFormat =
  | 'DATE_ONLY'
  | 'DATE_WITH_DOW'
  | 'DATE_WITH_DOW_ONLY'
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
    // Try each pattern in order
    for (const pattern of DATE_PATTERNS) {
      const match = pattern.regex.exec(content);
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
}
