import { DateUtils } from './date-utils';
import type { PropertyQueryDescriptor } from '../search/search-types';

/**
 * Utility class for evaluating property values in search queries.
 * Centralizes date parsing, comparison, and evaluation logic that was
 * previously duplicated between PropertySearchEngine and SearchEvaluator.
 */
export class PropertyEvaluator {
  /** Frontmatter keys selected by a filter key, honouring quoted-key exactness. */
  static matchingKeys(
    frontmatter: Record<string, unknown>,
    descriptor: PropertyQueryDescriptor,
    caseSensitive: boolean,
  ): string[] {
    if (descriptor.keyExact || caseSensitive) {
      return Object.prototype.hasOwnProperty.call(frontmatter, descriptor.key)
        ? [descriptor.key]
        : [];
    }
    const lowerKey = descriptor.key.toLowerCase();
    return Object.keys(frontmatter).filter(
      (key) => key.toLowerCase() === lowerKey,
    );
  }

  /** True when a scalar or array element satisfies the filter value. */
  static matchesPropertyValue(
    value: unknown,
    descriptor: PropertyQueryDescriptor,
    caseSensitive: boolean,
  ): boolean {
    if (descriptor.kind === 'existence') return true;
    if (descriptor.kind === 'null') return value === null;

    const search = descriptor.value;
    if (descriptor.exact) {
      if (typeof value === 'string') return value === search;
      if (typeof value === 'number' || typeof value === 'boolean') {
        return String(value) === search;
      }
      return false;
    }

    if (typeof value === 'string') {
      return caseSensitive
        ? value.includes(search)
        : value.toLowerCase().includes(search.toLowerCase());
    }
    if (typeof value === 'number') {
      const numeric = Number(search);
      return !isNaN(numeric) && value === numeric;
    }
    if (typeof value === 'boolean') {
      return String(value) === search.toLowerCase();
    }
    return false;
  }

  /**
   * Evaluate a structured property filter against one frontmatter object.
   * Shared by the indexed engine and the metadata-cache fallback so both
   * paths keep presence, null, empty string and quoted exactness distinct.
   */
  static matchesPropertyFilter(
    frontmatter: Record<string, unknown>,
    descriptor: PropertyQueryDescriptor,
    caseSensitive: boolean,
  ): boolean {
    const keys = this.matchingKeys(frontmatter, descriptor, caseSensitive);
    if (keys.length === 0) return false;
    if (descriptor.kind === 'existence') return true;

    return keys.some((key) => {
      const value = frontmatter[key];
      const values = Array.isArray(value) ? value : [value];
      return values.some((item) =>
        this.matchesPropertyValue(item, descriptor, caseSensitive),
      );
    });
  }

  /**
   * Parse a property value as a date
   * Handles Date instances, strings, and objects with date property
   * @param propValue - The property value to parse
   * @returns A Date object or null if parsing fails
   */
  static parsePropertyValueAsDate(propValue: unknown): Date | null {
    if (propValue instanceof Date) {
      return propValue;
    }

    if (typeof propValue === 'string') {
      // Try comparison format first (YYYY-MM-DD, YYYY-MM, YYYY)
      const parsed = this.parseDateForComparison(propValue);
      if (parsed) {
        return parsed;
      }

      // Try DateUtils.parseDateValue for more complex formats
      const parsedDate = DateUtils.parseDateValue(propValue);
      if (
        parsedDate &&
        parsedDate !== 'none' &&
        !(typeof parsedDate === 'string')
      ) {
        if (typeof parsedDate === 'object' && 'date' in parsedDate) {
          return parsedDate.date;
        }
        if (parsedDate instanceof Date) {
          return parsedDate;
        }
      }
    }

    return null;
  }

  /**
   * Parse a date string for comparison operations
   * Supports formats: YYYY-MM-DD, YYYY-MM, YYYY
   * @param value - The date string to parse
   * @returns A Date object or null if parsing fails
   */
  static parseDateForComparison(value: string): Date | null {
    const trimmed = value.trim();

    // Full date: YYYY-MM-DD
    const fullDateMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (fullDateMatch) {
      const [, year, month, day] = fullDateMatch.map(Number);
      return DateUtils.createDate(year, month - 1, day);
    }

    // Year-Month: YYYY-MM
    const yearMonthMatch = trimmed.match(/^(\d{4})-(\d{2})$/);
    if (yearMonthMatch) {
      const [, year, month] = yearMonthMatch.map(Number);
      return DateUtils.createDate(year, month - 1, 1);
    }

    // Year only: YYYY
    const yearMatch = trimmed.match(/^(\d{4})$/);
    if (yearMatch) {
      const year = parseInt(trimmed, 10);
      return DateUtils.createDate(year, 0, 1);
    }

    return null;
  }

  /**
   * Compare a date against a parsed search value
   * Handles relative dates, date ranges, and exact dates
   * @param taskDate - The date from the task property
   * @param parsedDate - The parsed search value from DateUtils.parseDateValue
   * @returns True if the task date matches the search criteria
   */
  static compareDate(
    taskDate: Date,
    parsedDate: ReturnType<typeof DateUtils.parseDateValue>,
  ): boolean {
    if (!taskDate) return false;

    if (typeof parsedDate === 'string') {
      // Relative date expressions
      const now = new Date();
      switch (parsedDate) {
        case 'today':
          return DateUtils.isDateDueToday(taskDate, now);
        case 'tomorrow':
          return DateUtils.isDateDueTomorrow(taskDate, now);
        case 'overdue':
          return DateUtils.isDateOverdue(taskDate, now);
        default:
          return false;
      }
    } else if (typeof parsedDate === 'object' && parsedDate !== null) {
      if ('start' in parsedDate && 'end' in parsedDate) {
        // Date range
        return DateUtils.isDateInRange(
          taskDate,
          parsedDate.start,
          parsedDate.end,
        );
      } else if ('date' in parsedDate && 'format' in parsedDate) {
        // Exact date with format information
        const searchDate = parsedDate.date;
        const format = parsedDate.format;

        switch (format) {
          case 'year':
            return searchDate.getFullYear() === taskDate.getFullYear();
          case 'year-month':
            return (
              searchDate.getFullYear() === taskDate.getFullYear() &&
              searchDate.getMonth() === taskDate.getMonth()
            );
          case 'full':
            return DateUtils.compareDates(taskDate, searchDate);
          default:
            return false;
        }
      } else if (parsedDate instanceof Date) {
        // Date object (from natural language parsing)
        return DateUtils.compareDates(taskDate, parsedDate);
      }
    }

    return false;
  }

  /**
   * Evaluate a comparison operator (>, >=, <, <=) against a date value
   * @param taskDate - The date from the task property
   * @param operator - The comparison operator
   * @param compareDate - The date to compare against
   * @returns True if the comparison evaluates to true
   */
  static evaluateDateComparison(
    taskDate: Date,
    operator: string,
    compareDate: Date,
  ): boolean {
    switch (operator) {
      case '>':
        return taskDate > compareDate;
      case '>=':
        return taskDate >= compareDate;
      case '<':
        return taskDate < compareDate;
      case '<=':
        return taskDate <= compareDate;
      default:
        return false;
    }
  }
}
