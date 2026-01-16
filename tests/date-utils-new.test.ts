import { DateUtils } from '../src/utils/date-utils';

describe('DateUtils - New Utility Methods', () => {
  const testDate = new Date('2024-01-15T12:34:56'); // Monday, January 15, 2024

  describe('getDateOnly', () => {
    it('should create a date object normalized to midnight', () => {
      const result = DateUtils.getDateOnly(testDate);
      expect(result.getHours()).toBe(0);
      expect(result.getMinutes()).toBe(0);
      expect(result.getSeconds()).toBe(0);
      expect(result.getMilliseconds()).toBe(0);
      expect(result.getFullYear()).toBe(2024);
      expect(result.getMonth()).toBe(0); // January
      expect(result.getDate()).toBe(15);
    });

    it('should preserve the same day', () => {
      const result = DateUtils.getDateOnly(testDate);
      expect(result.getTime()).toBeLessThan(testDate.getTime());
      expect(result.getDate()).toBe(testDate.getDate());
    });
  });

  describe('getDaysSinceMonday', () => {
    it('should return 0 for Monday', () => {
      // Create date using local timezone
      const monday = new Date(2024, 0, 15); // January 15, 2024 (Monday in local timezone)
      expect(DateUtils.getDaysSinceMonday(monday)).toBe(0);
    });

    it('should return 1 for Tuesday', () => {
      // Create date using local timezone
      const tuesday = new Date(2024, 0, 16); // January 16, 2024 (Tuesday in local timezone)
      expect(DateUtils.getDaysSinceMonday(tuesday)).toBe(1);
    });

    it('should return 6 for Sunday', () => {
      // Create date using local timezone
      const sunday = new Date(2024, 0, 14); // January 14, 2024 (Sunday in local timezone)
      expect(DateUtils.getDaysSinceMonday(sunday)).toBe(6);
    });
  });

  describe('getDaysSinceSunday', () => {
    it('should return 0 for Sunday', () => {
      // Create date using local timezone
      const sunday = new Date(2024, 0, 14); // January 14, 2024 (Sunday in local timezone)
      expect(DateUtils.getDaysSinceSunday(sunday)).toBe(0);
    });

    it('should return 1 for Monday', () => {
      // Create date using local timezone
      const monday = new Date(2024, 0, 15); // January 15, 2024 (Monday in local timezone)
      expect(DateUtils.getDaysSinceSunday(monday)).toBe(1);
    });

    it('should return 6 for Saturday', () => {
      // Create date using local timezone
      const saturday = new Date(2024, 0, 13); // January 13, 2024 (Saturday in local timezone)
      expect(DateUtils.getDaysSinceSunday(saturday)).toBe(6);
    });
  });

  describe('addDays', () => {
    it('should add positive days correctly', () => {
      const result = DateUtils.addDays(testDate, 5);
      expect(result.getDate()).toBe(20); // 15 + 5 = 20
      expect(result.getMonth()).toBe(0); // Still January
    });

    it('should add negative days correctly', () => {
      const result = DateUtils.addDays(testDate, -3);
      expect(result.getDate()).toBe(12); // 15 - 3 = 12
      expect(result.getMonth()).toBe(0); // Still January
    });

    it('should handle month boundaries', () => {
      // Create date using local timezone
      const jan31 = new Date(2024, 0, 31); // January 31, 2024
      const result = DateUtils.addDays(jan31, 1);
      expect(result.getDate()).toBe(1);
      expect(result.getMonth()).toBe(1); // February
    });

    it('should not modify the original date', () => {
      const originalDate = new Date(testDate);
      DateUtils.addDays(testDate, 10);
      expect(testDate.getTime()).toBe(originalDate.getTime());
    });
  });

  describe('isSameDay', () => {
    it('should return true for same day different times', () => {
      const date1 = new Date('2024-01-15T08:00:00');
      const date2 = new Date('2024-01-15T20:30:45');
      expect(DateUtils.isSameDay(date1, date2)).toBe(true);
    });

    it('should return false for different days', () => {
      const date1 = new Date('2024-01-15T23:59:59');
      const date2 = new Date('2024-01-16T00:00:01');
      expect(DateUtils.isSameDay(date1, date2)).toBe(false);
    });

    it('should return true for same day same time', () => {
      const date1 = new Date('2024-01-15T12:34:56');
      const date2 = new Date('2024-01-15T12:34:56');
      expect(DateUtils.isSameDay(date1, date2)).toBe(true);
    });
  });

  describe('isSameMonth', () => {
    it('should return true for same month different years', () => {
      const date1 = new Date('2024-01-15');
      const date2 = new Date('2024-01-31');
      expect(DateUtils.isSameMonth(date1, date2)).toBe(true);
    });

    it('should return false for different months', () => {
      // Create dates using local timezone
      const date1 = new Date(2024, 0, 31); // January 31, 2024
      const date2 = new Date(2024, 1, 1); // February 1, 2024
      expect(DateUtils.isSameMonth(date1, date2)).toBe(false);
    });

    it('should return false for same month different years', () => {
      const date1 = new Date('2024-01-15');
      const date2 = new Date('2025-01-15');
      expect(DateUtils.isSameMonth(date1, date2)).toBe(false);
    });
  });

  describe('isSameYear', () => {
    it('should return true for same year', () => {
      // Create dates using local timezone
      const date1 = new Date(2024, 0, 1); // January 1, 2024
      const date2 = new Date(2024, 11, 31); // December 31, 2024
      expect(DateUtils.isSameYear(date1, date2)).toBe(true);
    });

    it('should return false for different years', () => {
      // Create dates using local timezone
      const date1 = new Date(2024, 11, 31); // December 31, 2024
      const date2 = new Date(2025, 0, 1); // January 1, 2025
      expect(DateUtils.isSameYear(date1, date2)).toBe(false);
    });
  });

  describe('getEndOfMonth', () => {
    it('should return last day of January', () => {
      const janDate = new Date('2024-01-15');
      const result = DateUtils.getEndOfMonth(janDate);
      expect(result.getDate()).toBe(31);
      expect(result.getMonth()).toBe(0); // January
    });

    it('should return last day of February (non-leap year)', () => {
      const febDate = new Date('2023-02-15'); // 2023 is not a leap year
      const result = DateUtils.getEndOfMonth(febDate);
      expect(result.getDate()).toBe(28);
      expect(result.getMonth()).toBe(1); // February
    });

    it('should return last day of February (leap year)', () => {
      const febDate = new Date('2024-02-15'); // 2024 is a leap year
      const result = DateUtils.getEndOfMonth(febDate);
      expect(result.getDate()).toBe(29);
      expect(result.getMonth()).toBe(1); // February
    });

    it('should not modify the original date', () => {
      const originalDate = new Date(testDate);
      DateUtils.getEndOfMonth(testDate);
      expect(testDate.getTime()).toBe(originalDate.getTime());
    });
  });

  describe('getWeekRange', () => {
    it('should return correct week range starting Monday', () => {
      // Create date using local timezone
      const wednesday = new Date(2024, 0, 17); // Wednesday
      const result = DateUtils.getWeekRange(wednesday, 'Monday');

      expect(result.start.getDate()).toBe(15); // Monday
      expect(result.end.getDate()).toBe(21); // Sunday
      expect(result.start.getDay()).toBe(1); // Monday
      expect(result.end.getDay()).toBe(0); // Sunday
    });

    it('should return correct week range starting Sunday', () => {
      // Create date using local timezone
      const wednesday = new Date(2024, 0, 17); // Wednesday
      const result = DateUtils.getWeekRange(wednesday, 'Sunday');

      expect(result.start.getDate()).toBe(14); // Sunday
      expect(result.end.getDate()).toBe(20); // Saturday
      expect(result.start.getDay()).toBe(0); // Sunday
      expect(result.end.getDay()).toBe(6); // Saturday
    });

    it('should handle week boundaries correctly', () => {
      // Create date using local timezone
      const monday = new Date(2024, 0, 15); // Monday
      const result = DateUtils.getWeekRange(monday, 'Monday');

      expect(result.start.getDate()).toBe(15); // Same Monday
      expect(result.end.getDate()).toBe(21); // Sunday
    });
  });

  describe('getMonthRange', () => {
    it('should return correct month range for January', () => {
      const janDate = new Date('2024-01-15');
      const result = DateUtils.getMonthRange(janDate);

      expect(result.start.getDate()).toBe(1);
      expect(result.start.getMonth()).toBe(0); // January
      expect(result.end.getDate()).toBe(31);
      expect(result.end.getMonth()).toBe(0); // January
    });

    it('should return correct month range for February (leap year)', () => {
      const febDate = new Date('2024-02-15');
      const result = DateUtils.getMonthRange(febDate);

      expect(result.start.getDate()).toBe(1);
      expect(result.start.getMonth()).toBe(1); // February
      expect(result.end.getDate()).toBe(29);
      expect(result.end.getMonth()).toBe(1); // February
    });

    it('should handle December correctly', () => {
      const decDate = new Date('2024-12-15');
      const result = DateUtils.getMonthRange(decDate);

      expect(result.start.getDate()).toBe(1);
      expect(result.start.getMonth()).toBe(11); // December
      expect(result.end.getDate()).toBe(31);
      expect(result.end.getMonth()).toBe(11); // December
    });
  });
});
