/**
 * Date utility class
 */
export class DateUtils {
  /**
   * Format a date for display with relative time indicators
   * @param date The date to format
   * @param includeTime Whether to include time if available
   * @returns Formatted date string
   */
  static formatDateForDisplay(date: Date | null, includeTime = false): string {
    if (!date) return '';

    // Ensure date is timezone independent - zero out time if no time component
    const normalizedDate = this.normalizeDateForTimezone(date);

    const now = new Date();
    const today = this.getDateOnly(now);
    const taskDate = this.getDateOnly(normalizedDate);

    const diffTime = taskDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / DateUtils.MILLISECONDS_PER_DAY);

    const formatTime = (d: Date) => {
      // Format time showing hours and minutes (no leading zero for hour).
      // Keep locale behavior (12/24h) but normalize AM/PM to lowercase when present.
      const time = d.toLocaleTimeString(undefined, {
        hour: 'numeric',
        minute: '2-digit',
      });
      return time.replace(/AM|PM/i, (m) => m.toLowerCase());
    };

    const formatFullDate = (d: Date) => {
      // Use locale-aware formatting so month/day/year order and separators follow the user's locale
      return d.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    };

    if (diffDays === 0) {
      return includeTime && (date.getHours() !== 0 || date.getMinutes() !== 0)
        ? `Today ${formatTime(date)}`
        : 'Today';
    } else if (diffDays === 1) {
      return includeTime && (date.getHours() !== 0 || date.getMinutes() !== 0)
        ? `Tomorrow ${formatTime(date)}`
        : 'Tomorrow';
    } else if (diffDays === -1) {
      return 'Yesterday';
    } else if (diffDays > 0 && diffDays <= 7) {
      return `${diffDays} days from now`;
    } else if (diffDays < 0) {
      return `${Math.abs(diffDays)} days ago`;
    } else {
      // For dates beyond a week, use absolute formatting
      if (includeTime && (date.getHours() !== 0 || date.getMinutes() !== 0)) {
        return `${formatFullDate(date)} ${formatTime(date)}`;
      } else {
        return formatFullDate(date);
      }
    }
  }

  /**
   * Parse various date formats from search queries
   * @param value Date value from search query
   * @param referenceDate Reference date for relative calculations (default: now)
   * @returns Parsed date with format info, date range, or null if invalid
   */
  static parseDateValue(
    value: string,
    referenceDate: Date = new Date(),
  ):
    | { date: Date; format: 'year' | 'year-month' | 'full' }
    | { start: Date; end: Date }
    | null
    | string
    | Date {
    if (!value || value.trim() === '') {
      return null;
    }

    const trimmedValue = value.trim().toLowerCase();

    // Handle special cases
    switch (trimmedValue) {
      case 'none':
        return 'none';
      case 'overdue':
      case 'due':
      case 'today':
      case 'tomorrow':
      case 'this week':
      case 'next week':
      case 'this month':
      case 'next month':
        return trimmedValue;
    }

    // Handle "next N days" pattern
    const nextNDaysMatch = trimmedValue.match(/^next\s+(\d+)\s+days$/);
    if (nextNDaysMatch) {
      return `next ${nextNDaysMatch[1]} days`;
    }

    // Handle date ranges (e.g., 2024-01-01..2024-01-31)
    const rangeMatch = trimmedValue.match(
      /^(\d{4}-\d{2}-\d{2})\.\.(\d{4}-\d{2}-\d{2})$/,
    );
    if (rangeMatch) {
      // Parse dates using DateUtils.createDate to ensure timezone consistency
      const [startYear, startMonth, startDay] = rangeMatch[1]
        .split('-')
        .map(Number);
      const [endYear, endMonth, endDay] = rangeMatch[2].split('-').map(Number);

      const startDate = this.createDate(startYear, startMonth - 1, startDay);
      const endDate = this.createDate(endYear, endMonth - 1, endDay);

      // Add one day to end date to make it inclusive
      endDate.setDate(endDate.getDate() + 1);

      if (!isNaN(startDate.getTime()) && !isNaN(endDate.getTime())) {
        // Normalize dates to ensure timezone consistency with tasks
        const normalizedStart = this.normalizeDateForTimezone(startDate);
        const normalizedEnd = this.normalizeDateForTimezone(endDate);
        return { start: normalizedStart, end: normalizedEnd };
      }
      return null;
    }

    // Handle exact dates with various formats
    // Full date: YYYY-MM-DD
    if (trimmedValue.match(/^\d{4}-\d{2}-\d{2}$/)) {
      // Parse as local date to match task date creation
      // Split the date and create a new Date object to ensure local timezone
      const parts = trimmedValue.split('-').map(Number);
      const date = this.createDate(parts[0], parts[1] - 1, parts[2]); // month is 0-indexed
      if (!isNaN(date.getTime())) {
        return { date, format: 'full' as const };
      }
      return null;
    }

    // Year-Month: YYYY-MM
    if (trimmedValue.match(/^\d{4}-\d{2}$/)) {
      const parts = trimmedValue.split('-').map(Number);
      const date = this.createDate(parts[0], parts[1] - 1, 1); // month is 0-indexed
      if (!isNaN(date.getTime())) {
        return { date, format: 'year-month' as const };
      }
      return null;
    }

    // Year only: YYYY
    if (trimmedValue.match(/^\d{4}$/)) {
      const year = parseInt(trimmedValue, 10);
      const date = this.createDate(year, 0, 1); // January 1st
      if (!isNaN(date.getTime())) {
        return { date, format: 'year' as const };
      }
      return null;
    }

    // Handle quoted natural language expressions
    if (trimmedValue.startsWith('"') && trimmedValue.endsWith('"')) {
      const expression = trimmedValue.slice(1, -1);
      const result = this.parseNaturalLanguageDate(expression, referenceDate);
      return result ? result.date : null;
    }

    // Handle unquoted relative expressions
    if (trimmedValue.match(/^(next|this|last)\s+\w+$/)) {
      const result = this.parseNaturalLanguageDate(trimmedValue, referenceDate);
      return result ? result.date : null;
    }

    // Handle "in N days" pattern
    const inNDaysMatch = trimmedValue.match(/^in\s+(\d+)\s+days$/);
    if (inNDaysMatch) {
      const days = parseInt(inNDaysMatch[1], 10);
      const resultDate = new Date(referenceDate);
      resultDate.setDate(resultDate.getDate() + days);
      return resultDate;
    }

    return null;
  }

  /**
   * Parse natural language date expressions
   * @param expression Natural language expression
   * @param referenceDate Reference date for calculations
   * @returns Parsed date with format info or null if unsupported
   */
  static parseNaturalLanguageDate(
    expression: string,
    referenceDate: Date = new Date(),
  ): { date: Date; format: 'full' } | null {
    const normalized = expression.toLowerCase();

    // Handle "next week"
    if (normalized === 'next week') {
      const result = this.addDays(
        referenceDate,
        (1 + 7 - referenceDate.getDay()) % 7,
      );
      return { date: result, format: 'full' };
    }

    // Handle "this week"
    if (normalized === 'this week') {
      const result = this.addDays(
        referenceDate,
        -(referenceDate.getDay() + 6) % 7,
      );
      return { date: result, format: 'full' };
    }

    // Handle specific weekdays (e.g., "next Monday", "next Friday")
    const weekdayMatch = normalized.match(
      /^next\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)$/,
    );
    if (weekdayMatch) {
      const targetWeekday = weekdayMatch[1];
      const weekdays = [
        'sunday',
        'monday',
        'tuesday',
        'wednesday',
        'thursday',
        'friday',
        'saturday',
      ];
      const targetDay = weekdays.indexOf(targetWeekday);

      const currentDay = referenceDate.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
      let daysToAdd = (targetDay - currentDay + 7) % 7;
      if (daysToAdd === 0) {
        daysToAdd = 7; // Next week if same day
      }

      const result = this.addDays(referenceDate, daysToAdd);
      return { date: result, format: 'full' };
    }

    // Handle "end of month"
    if (normalized === 'end of month' || normalized === 'end of the month') {
      const result = this.getEndOfMonth(referenceDate);
      return { date: result, format: 'full' };
    }

    // Handle "in 3 days" (without quotes)
    const inDaysMatch = normalized.match(/^in\s+(\d+)\s+days$/);
    if (inDaysMatch) {
      const days = parseInt(inDaysMatch[1], 10);
      const result = this.addDays(referenceDate, days);
      return { date: result, format: 'full' };
    }

    return null;
  }

  /**
   * Check if a date is overdue (before today)
   * @param date Date to check
   * @param referenceDate Reference date (default: now)
   * @returns True if date is overdue
   */
  static isDateOverdue(
    date: Date | null,
    referenceDate: Date = new Date(),
  ): boolean {
    if (!date) return false;

    const today = this.getStartOfDay(referenceDate);
    const target = this.getStartOfDay(date);

    return target < today;
  }

  /**
   * Check if a date is due today
   * @param date Date to check
   * @param referenceDate Reference date (default: now)
   * @returns True if date is today
   */
  static isDateDueToday(
    date: Date | null,
    referenceDate: Date = new Date(),
  ): boolean {
    if (!date) return false;

    return this.isSameDay(date, referenceDate);
  }

  /**
   * Check if a date is due tomorrow
   * @param date Date to check
   * @param referenceDate Reference date (default: now)
   * @returns True if date is tomorrow
   */
  static isDateDueTomorrow(
    date: Date | null,
    referenceDate: Date = new Date(),
  ): boolean {
    if (!date) return false;

    const tomorrow = this.addDays(referenceDate, 1);
    return this.isSameDay(date, tomorrow);
  }

  /**
   * Check if a date is in the current week
   * @param date Date to check
   * @param referenceDate Reference date (default: now)
   * @returns True if date is in current week
   */
  static isDateInCurrentWeek(
    date: Date | null,
    referenceDate: Date = new Date(),
    weekStartsOn: 'Monday' | 'Sunday' = 'Monday',
  ): boolean {
    if (!date) return false;

    const target = this.getStartOfDay(date);
    const weekRange = this.getWeekRange(referenceDate, weekStartsOn);

    return target >= weekRange.start && target <= weekRange.end;
  }

  /**
   * Check if a date is in the next week
   * @param date Date to check
   * @param referenceDate Reference date (default: now)
   * @returns True if date is in next week
   */
  static isDateInNextWeek(
    date: Date | null,
    referenceDate: Date = new Date(),
    weekStartsOn: 'Monday' | 'Sunday' = 'Monday',
  ): boolean {
    if (!date) return false;

    const target = this.getStartOfDay(date);

    // Get the next week range
    const nextWeekRange = this.getWeekRange(
      this.addDays(referenceDate, 7),
      weekStartsOn,
    );

    // Check if target is in next week but not in current week
    const currentWeekRange = this.getWeekRange(referenceDate, weekStartsOn);
    const isInNextWeek =
      target >= nextWeekRange.start && target <= nextWeekRange.end;
    const isInCurrentWeek =
      target >= currentWeekRange.start && target <= currentWeekRange.end;

    return isInNextWeek && !isInCurrentWeek;
  }

  /**
   * Check if a date is in the current month
   * @param date Date to check
   * @param referenceDate Reference date (default: now)
   * @returns True if date is in current month
   */
  static isDateInCurrentMonth(
    date: Date | null,
    referenceDate: Date = new Date(),
  ): boolean {
    if (!date) return false;

    return this.isSameMonth(date, referenceDate);
  }

  /**
   * Check if a date is in the next month
   * @param date Date to check
   * @param referenceDate Reference date (default: now)
   * @returns True if date is in next month
   */
  static isDateInNextMonth(
    date: Date | null,
    referenceDate: Date = new Date(),
  ): boolean {
    if (!date) return false;

    // Calculate next month
    const nextMonthDate = new Date(referenceDate);
    nextMonthDate.setMonth(nextMonthDate.getMonth() + 1);

    return this.isSameMonth(date, nextMonthDate);
  }

  /**
   * Check if a date is within the next N days
   * @param date Date to check
   * @param days Number of days to check
   * @param referenceDate Reference date (default: now)
   * @returns True if date is within the next N days
   */
  static isDateInNextNDays(
    date: Date | null,
    days: number,
    referenceDate: Date = new Date(),
  ): boolean {
    if (!date) return false;

    const target = this.getStartOfDay(date);
    const ref = this.getStartOfDay(referenceDate);
    const endDate = this.getStartOfDay(this.addDays(referenceDate, days));

    return target >= ref && target <= endDate;
  }

  /**
   * Check if a date falls within a date range
   * @param date Date to check
   * @param start Start of range
   * @param end End of range
   * @returns True if date is within range
   */
  static isDateInRange(date: Date | null, start: Date, end: Date): boolean {
    if (!date) return false;

    const target = this.getStartOfDay(date);
    
    // Normalize all dates to ensure timezone consistency
    const normalizedTarget = this.normalizeDateForTimezone(target);
    const normalizedStart = this.normalizeDateForTimezone(start);
    const normalizedEnd = this.normalizeDateForTimezone(end);

    return normalizedTarget >= normalizedStart && normalizedTarget < normalizedEnd;
  }

  /**
   * Compare two dates for equality (day precision)
   * @param date1 First date
   * @param date2 Second date
   * @returns True if dates represent the same day
   */
  static compareDates(date1: Date | null, date2: Date | null): boolean {
    if (!date1 || !date2) return false;

    // Use local time methods for consistent comparison
    // Both dates should be in the same timezone (local)
    const year1 = date1.getFullYear();
    const month1 = date1.getMonth();
    const day1 = date1.getDate();

    const year2 = date2.getFullYear();
    const month2 = date2.getMonth();
    const day2 = date2.getDate();

    return year1 === year2 && month1 === month2 && day1 === day2;
  }

  /**
   * Get the start of the day for a given date
   * @param date The date to get the start of the day for
   * @returns A new Date object set to the start of the day (00:00:00.000)
   */
  static getStartOfDay(date: Date): Date {
    return this.createDate(date.getFullYear(), date.getMonth(), date.getDate());
  }

  /**
   * Create a date object normalized to midnight (start of day)
   * @param date The date to normalize
   * @returns A new Date object at midnight of the same day
   */
  static getDateOnly(date: Date): Date {
    return this.createDate(date.getFullYear(), date.getMonth(), date.getDate());
  }

  /**
   * Get days since Monday for a given date
   * @param date The date to calculate from
   * @returns Number of days since Monday (0-6)
   */
  static getDaysSinceMonday(date: Date): number {
    const day = date.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
    return (day + 6) % 7; // Convert to 0=Mon, 1=Tue, ..., 6=Sun
  }

  /**
   * Get days since Sunday for a given date
   * @param date The date to calculate from
   * @returns Number of days since Sunday (0-6)
   */
  static getDaysSinceSunday(date: Date): number {
    return date.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  }

  /**
   * Add days to a date
   * @param date The base date
   * @param days Number of days to add (can be negative)
   * @returns New Date object with days added
   */
  static addDays(date: Date, days: number): Date {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    // Normalize to ensure timezone independence
    return this.normalizeDateForTimezone(result);
  }

  /**
   * Check if two dates represent the same day
   * @param date1 First date
   * @param date2 Second date
   * @returns True if dates represent the same day (ignoring time)
   */
  static isSameDay(date1: Date, date2: Date): boolean {
    const d1 = this.getDateOnly(date1);
    const d2 = this.getDateOnly(date2);
    return d1.getTime() === d2.getTime();
  }

  /**
   * Check if two dates are in the same month and year
   * @param date1 First date
   * @param date2 Second date
   * @returns True if dates are in the same month and year
   */
  static isSameMonth(date1: Date, date2: Date): boolean {
    return (
      date1.getFullYear() === date2.getFullYear() &&
      date1.getMonth() === date2.getMonth()
    );
  }

  /**
   * Check if two dates are in the same year
   * @param date1 First date
   * @param date2 Second date
   * @returns True if dates are in the same year
   */
  static isSameYear(date1: Date, date2: Date): boolean {
    return date1.getFullYear() === date2.getFullYear();
  }

  /**
   * Get the end of month for a given date
   * @param date The date to calculate from
   * @returns Last day of the month
   */
  static getEndOfMonth(date: Date): Date {
    return this.createDate(date.getFullYear(), date.getMonth() + 1, 0); // Last day of current month
  }

  /**
   * Get a date range for the week containing the given date
   * @param date The date within the week
   * @param weekStartsOn Day the week starts ('Monday' or 'Sunday')
   * @returns Object with start and end dates of the week
   */
  static getWeekRange(
    date: Date,
    weekStartsOn: 'Monday' | 'Sunday' = 'Monday',
  ): { start: Date; end: Date } {
    const ref = new Date(date);
    let firstDayOfWeek: Date;

    if (weekStartsOn === 'Monday') {
      const daysSinceMonday = this.getDaysSinceMonday(ref);
      firstDayOfWeek = this.getStartOfDay(this.addDays(ref, -daysSinceMonday));
    } else {
      const daysSinceSunday = this.getDaysSinceSunday(ref);
      firstDayOfWeek = this.getStartOfDay(this.addDays(ref, -daysSinceSunday));
    }

    const lastDayOfWeek = this.getStartOfDay(this.addDays(firstDayOfWeek, 6));
    // Ensure end of day is properly normalized
    const endDate = this.createDate(
      lastDayOfWeek.getFullYear(),
      lastDayOfWeek.getMonth(),
      lastDayOfWeek.getDate(),
      23,
      59,
      59,
      999,
    );

    return {
      start: firstDayOfWeek,
      end: endDate,
    };
  }

  /**
   * Get a date range for the month containing the given date
   * @param date The date within the month
   * @returns Object with start and end dates of the month
   */
  static getMonthRange(date: Date): { start: Date; end: Date } {
    const year = date.getFullYear();
    const month = date.getMonth();

    return {
      start: this.createDate(year, month, 1),
      end: this.getEndOfMonth(date),
    };
  }

  /**
   * Number of milliseconds in one day
   * @constant {number}
   */
  static readonly MILLISECONDS_PER_DAY = 1000 * 60 * 60 * 24;

  /**
   * Normalize a date to ensure timezone independence
   * - If time is zero (00:00:00), treat as date-only and zero timezone
   * - If time is non-zero, ensure no timezone association and use local time
   * @param date The date to normalize
   * @returns A new Date object with proper timezone handling
   */
  static normalizeDateForTimezone(date: Date): Date {
    const result = new Date(date);

    // Check if time is zero (indicating date-only)
    const hasTime =
      result.getHours() !== 0 ||
      result.getMinutes() !== 0 ||
      result.getSeconds() !== 0;

    if (!hasTime) {
      // Date-only - ensure it's at midnight with no timezone issues
      result.setHours(0, 0, 0, 0);
    } else {
      // Has time - preserve the exact local time but ensure no timezone complications
      // Get the local time components
      const year = result.getFullYear();
      const month = result.getMonth();
      const day = result.getDate();
      const hours = result.getHours();
      const minutes = result.getMinutes();
      const seconds = result.getSeconds();
      const milliseconds = result.getMilliseconds();

      // Create a new date with the same local components
      result.setTime(0); // Clear the date first
      result.setFullYear(year, month, day);
      result.setHours(hours, minutes, seconds, milliseconds);
    }

    return result;
  }

  /**
   * Create a date from date parts ensuring timezone independence
   * @param year Year
   * @param month Month (0-11)
   * @param day Day of month
   * @param hours Hours (optional, default 0)
   * @param minutes Minutes (optional, default 0)
   * @param seconds Seconds (optional, default 0)
   * @param milliseconds Milliseconds (optional, default 0)
   * @returns A new Date object with proper timezone handling
   */
  static createDate(
    year: number,
    month: number,
    day: number,
    hours = 0,
    minutes = 0,
    seconds = 0,
    milliseconds = 0,
  ): Date {
    // Create date using local time to avoid timezone complications
    const date = new Date(
      year,
      month,
      day,
      hours,
      minutes,
      seconds,
      milliseconds,
    );

    // If time is zero, ensure it's purely a date
    if (hours === 0 && minutes === 0 && seconds === 0 && milliseconds === 0) {
      date.setHours(0, 0, 0, 0);
    }

    return date;
  }
}
