/**
 * Date utility functions for parsing various date formats
 */

// Date format types
export type DateFormat = 'DATE_ONLY' | 'DATE_WITH_DOW' | 'DATE_WITH_DOW_ONLY' | 'DATE_WITH_TIME';

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
    regex: /^<(\d{4}-\d{2}-\d{2})\s+(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+(\d{2}:\d{2})>/,
    hasTime: true,
    hasDayOfWeek: true
  },
  {
    type: 'DATE_WITH_DOW_ONLY',
    regex: /^<(\d{4}-\d{2}-\d{2})\s+(Mon|Tue|Wed|Thu|Fri|Sat|Sun)>/,
    hasTime: false,
    hasDayOfWeek: true
  },
  {
    type: 'DATE_WITH_TIME',
    regex: /^<(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})>/,
    hasTime: true,
    hasDayOfWeek: false
  },
  {
    type: 'DATE_ONLY',
    regex: /^<(\d{4}-\d{2}-\d{2})>/,
    hasTime: false,
    hasDayOfWeek: false
  }
];

/**
 * Date parsing utility class
 */
export class DateUtils {
  /**
   * Parse a date string with optional time
   * @param dateStr Date string in YYYY-MM-DD format
   * @param timeStr Optional time string in HH:mm format
   * @returns Date object in local time (timezone independent)
   */
  static parseDateTimeString(dateStr: string, timeStr: string): Date {
    const [year, month, day] = dateStr.split('-').map(Number);
    const [hours, minutes] = timeStr.split(':').map(Number);
    
    // Create date in local time to preserve the intended time
    return new Date(year, month - 1, day, hours, minutes);
  }

  /**
   * Parse a date string (date only)
   * @param dateStr Date string in YYYY-MM-DD format
   * @returns Date object at midnight local time (timezone independent)
   */
  static parseDateString(dateStr: string): Date {
    const [year, month, day] = dateStr.split('-').map(Number);
    
    // Create date at midnight local time
    return new Date(year, month - 1, day, 0, 0, 0, 0);
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
            const timeStr = pattern.type === 'DATE_WITH_DOW' ? match[3] : match[2];
            return this.parseDateTimeString(dateStr, timeStr);
          } else {
            return this.parseDateString(dateStr);
          }
        }
      }
      
      return null;
    }
  
    /**
     * Format a date for display with relative time indicators
     * @param date The date to format
     * @param includeTime Whether to include time if available
     * @returns Formatted date string
     */
    static formatDateForDisplay(date: Date | null, includeTime: boolean = false): string {
      if (!date) return '';
      
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const taskDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
      
      const diffTime = taskDate.getTime() - today.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      const formatTime = (d: Date) => {
        const hours = String(d.getHours()).padStart(2, '0');
        const minutes = String(d.getMinutes()).padStart(2, '0');
        return `${hours}:${minutes}`;
      };
  
      const formatFullDate = (d: Date) => {
          const month = d.toLocaleString('default', { month: 'short' });
          const day = d.getDate();
          const year = d.getFullYear();
          return `${month} ${day}, ${year}`;
      }
      
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
  }
  