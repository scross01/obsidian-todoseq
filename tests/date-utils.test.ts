import { DateUtils } from '../src/view/date-utils';

describe('DateUtils', () => {
  // Force a deterministic locale for all toLocale* calls in tests
  const originalToLocaleDateString = Date.prototype.toLocaleDateString;
  const originalToLocaleTimeString = Date.prototype.toLocaleTimeString;

  beforeAll(() => {
    Date.prototype.toLocaleDateString = function (locales?: any, options?: any) {
      return originalToLocaleDateString.call(this, 'en-US', options);
    };
    Date.prototype.toLocaleTimeString = function (locales?: any, options?: any) {
      return originalToLocaleTimeString.call(this, 'en-US', options);
    };
  });

  afterAll(() => {
    Date.prototype.toLocaleDateString = originalToLocaleDateString;
    Date.prototype.toLocaleTimeString = originalToLocaleTimeString;
  });

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
      expect(result).toBe('Today 2:30 pm');
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
      expect(result).toBe('Tomorrow 9:15 am');
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
      expect(result).toBe('Nov 20, 2025 3:45 pm');
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
      expect(result).toBe('Dec 31, 2025 11:59 pm');
    });

    test('should handle midnight time correctly', () => {
      const midnight = new Date('2025-10-16T00:00:00');
      const result = DateUtils.formatDateForDisplay(midnight, true);
      expect(result).toBe('Tomorrow');
    });

    test('should handle non-midnight time correctly', () => {
      const nonMidnight = new Date('2025-10-16T01:30:00');
      const result = DateUtils.formatDateForDisplay(nonMidnight, true);
      expect(result).toBe('Tomorrow 1:30 am');
    });
  });

  describe('weekStartsOn functionality', () => {
    // Test week starting on Monday (ISO standard)
    describe('isDateInCurrentWeek with Monday start', () => {
      test('should include Monday in current week', () => {
        const monday = new Date('2023-12-04T12:00:00'); // Monday
        const referenceDate = new Date('2023-12-04T12:00:00'); // Same Monday
        const result = DateUtils.isDateInCurrentWeek(monday, referenceDate, 'Monday');
        expect(result).toBe(true);
      });

      test('should include Sunday in current week when week starts on Monday', () => {
        const sunday = new Date('2023-12-10T12:00:00'); // Sunday
        const referenceDate = new Date('2023-12-04T12:00:00'); // Monday
        const result = DateUtils.isDateInCurrentWeek(sunday, referenceDate, 'Monday');
        expect(result).toBe(true);
      });

      test('should not include next Monday in current week', () => {
        const nextMonday = new Date('2023-12-11T12:00:00'); // Next Monday
        const referenceDate = new Date('2023-12-04T12:00:00'); // Monday
        const result = DateUtils.isDateInCurrentWeek(nextMonday, referenceDate, 'Monday');
        expect(result).toBe(false);
      });
    });

    // Test week starting on Sunday
    describe('isDateInCurrentWeek with Sunday start', () => {
      test('should include Sunday in current week', () => {
        const sunday = new Date('2023-12-03T12:00:00'); // Sunday
        const referenceDate = new Date('2023-12-03T12:00:00'); // Same Sunday
        const result = DateUtils.isDateInCurrentWeek(sunday, referenceDate, 'Sunday');
        expect(result).toBe(true);
      });

      test('should include Saturday in current week when week starts on Sunday', () => {
        const saturday = new Date('2023-12-09T12:00:00'); // Saturday
        const referenceDate = new Date('2023-12-03T12:00:00'); // Sunday
        const result = DateUtils.isDateInCurrentWeek(saturday, referenceDate, 'Sunday');
        expect(result).toBe(true);
      });

      test('should not include next Sunday in current week', () => {
        const nextSunday = new Date('2023-12-10T12:00:00'); // Next Sunday
        const referenceDate = new Date('2023-12-03T12:00:00'); // Sunday
        const result = DateUtils.isDateInCurrentWeek(nextSunday, referenceDate, 'Sunday');
        expect(result).toBe(false);
      });
    });

    // Test next week functionality
    describe('isDateInNextWeek', () => {
      test('should include next Monday in next week when week starts on Monday', () => {
        const nextMonday = new Date('2023-12-11T12:00:00'); // Next Monday
        const referenceDate = new Date('2023-12-04T12:00:00'); // Monday
        const result = DateUtils.isDateInNextWeek(nextMonday, referenceDate, 'Monday');
        expect(result).toBe(true);
      });

      test('should include next Sunday in next week when week starts on Sunday', () => {
        const nextSunday = new Date('2023-12-10T12:00:00'); // Next Sunday
        const referenceDate = new Date('2023-12-03T12:00:00'); // Sunday
        const result = DateUtils.isDateInNextWeek(nextSunday, referenceDate, 'Sunday');
        expect(result).toBe(true);
      });

      test('should not include current week dates in next week', () => {
        const currentWeekDate = new Date('2023-12-04T12:00:00'); // Current Monday
        const referenceDate = new Date('2023-12-04T12:00:00'); // Same Monday
        const result = DateUtils.isDateInNextWeek(currentWeekDate, referenceDate, 'Monday');
        expect(result).toBe(false);
      });
    });
  });
});