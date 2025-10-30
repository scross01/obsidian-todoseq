
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
      
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const taskDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
      
      const diffTime = taskDate.getTime() - today.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      const formatTime = (d: Date) => {
        // Format time showing hours and minutes (no leading zero for hour).
        // Keep locale behavior (12/24h) but normalize AM/PM to lowercase when present.
        const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
        return time.replace(/AM|PM/i, (m) => m.toLowerCase());
      };
  
      const formatFullDate = (d: Date) => {
        // Use locale-aware formatting so month/day/year order and separators follow the user's locale
        return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
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
  