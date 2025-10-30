import { DateUtils } from '../src/view/date-utils';

describe('DateUtils', () => {
  describe('formatDateForDisplay', () => {
    // Mock the current date to ensure consistent test results
    beforeEach(() => {
      // Mock Date constructor to return a fixed date for testing
      jest.useFakeTimers().setSystemTime(new Date('2025-10-15T12:00:00'));
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    test('should return empty string for null date', () => {
      const result = DateUtils.formatDateForDisplay(null);
      expect(result).toBe('');
    });

    test('should return "Today" for today\'s date without time', () => {
      const today = new Date('2025-10-15T00:00:00');
      const result = DateUtils.formatDateForDisplay(today);
      expect(result).toBe('Today');
    });

    test('should return "Today with time" for today\'s date with time', () => {
      const todayWithTime = new Date('2025-10-15T14:30:00');
      const result = DateUtils.formatDateForDisplay(todayWithTime, true);
      expect(result).toBe('Today 14:30');
    });

    test('should return "Today" for today\'s date with time when includeTime is false', () => {
      const todayWithTime = new Date('2025-10-15T14:30:00');
      const result = DateUtils.formatDateForDisplay(todayWithTime, false);
      expect(result).toBe('Today');
    });

    test('should return "Tomorrow" for tomorrow\'s date without time', () => {
      const tomorrow = new Date('2025-10-16T00:00:00');
      const result = DateUtils.formatDateForDisplay(tomorrow);
      expect(result).toBe('Tomorrow');
    });

    test('should return "Tomorrow with time" for tomorrow\'s date with time', () => {
      const tomorrowWithTime = new Date('2025-10-16T09:15:00');
      const result = DateUtils.formatDateForDisplay(tomorrowWithTime, true);
      expect(result).toBe('Tomorrow 09:15');
    });

    test('should return "Yesterday" for yesterday\'s date', () => {
      const yesterday = new Date('2025-10-14T00:00:00');
      const result = DateUtils.formatDateForDisplay(yesterday);
      expect(result).toBe('Yesterday');
    });

    test('should return "X days from now" for dates within next week', () => {
      const twoDaysFromNow = new Date('2025-10-17T00:00:00');
      const fiveDaysFromNow = new Date('2025-10-20T00:00:00');
      
      const result1 = DateUtils.formatDateForDisplay(twoDaysFromNow);
      const result2 = DateUtils.formatDateForDisplay(fiveDaysFromNow);
      
      expect(result1).toBe('2 days from now');
      expect(result2).toBe('5 days from now');
    });

    test('should return "X days ago" for dates within past week', () => {
      const twoDaysAgo = new Date('2025-10-13T00:00:00');
      const fiveDaysAgo = new Date('2025-10-10T00:00:00');
      
      const result1 = DateUtils.formatDateForDisplay(twoDaysAgo);
      const result2 = DateUtils.formatDateForDisplay(fiveDaysAgo);
      
      expect(result1).toBe('2 days ago');
      expect(result2).toBe('5 days ago');
    });

    test('should return formatted date with time for dates beyond a week with time', () => {
      const futureDate = new Date('2025-11-20T15:45:00');
      const result = DateUtils.formatDateForDisplay(futureDate, true);
      expect(result).toBe('Nov 20, 2025 15:45');
    });

    test('should return formatted date without time for dates beyond a week without time', () => {
      const futureDate = new Date('2025-11-20T00:00:00');
      const result = DateUtils.formatDateForDisplay(futureDate, false);
      expect(result).toBe('Nov 20, 2025');
    });

    test('should handle dates with different time zones correctly', () => {
      const dateWithTimeZone = new Date('2025-10-18T22:30:00Z');
      const result = DateUtils.formatDateForDisplay(dateWithTimeZone, true);
      expect(result).toBe('3 days from now');
    });

    test('should handle month boundaries correctly', () => {
      const endOfMonth = new Date('2025-10-31T00:00:00');
      const result = DateUtils.formatDateForDisplay(endOfMonth);
      expect(result).toBe('Oct 31, 2025');
    });

    test('should handle year boundaries correctly', () => {
      const endOfYear = new Date('2025-12-31T23:59:59');
      const result = DateUtils.formatDateForDisplay(endOfYear, true);
      expect(result).toBe('Dec 31, 2025 23:59');
    });

    test('should handle midnight time correctly', () => {
      const midnight = new Date('2025-10-16T00:00:00');
      const result = DateUtils.formatDateForDisplay(midnight, true);
      expect(result).toBe('Tomorrow');
    });

    test('should handle non-midnight time correctly', () => {
      const nonMidnight = new Date('2025-10-16T01:30:00');
      const result = DateUtils.formatDateForDisplay(nonMidnight, true);
      expect(result).toBe('Tomorrow 01:30');
    });
  });
});