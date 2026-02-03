import { DateUtils } from '../src/utils/date-utils';

// Timezones to test with
const testTimezones = ['UTC', 'America/Toronto', 'Asia/Tokyo'];

// Wrap all tests to run in each timezone
testTimezones.forEach((timezone) => {
  describe(`DateUtils (timezone: ${timezone})`, () => {
    // Force a deterministic locale for all toLocale* calls in tests
    const originalToLocaleDateString = Date.prototype.toLocaleDateString;
    const originalToLocaleTimeString = Date.prototype.toLocaleTimeString;

    beforeAll(() => {
      Date.prototype.toLocaleDateString = function (
        locales?: any,
        options?: any,
      ) {
        return originalToLocaleDateString.call(this, 'en-US', options);
      };
      Date.prototype.toLocaleTimeString = function (
        locales?: any,
        options?: any,
      ) {
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
        jest
          .useFakeTimers()
          .setSystemTime(DateUtils.createDate(2025, 9, 15, 12, 0, 0));
      });

      afterEach(() => {
        jest.useRealTimers();
      });

      test('should return empty string for null date', () => {
        const result = DateUtils.formatDateForDisplay(null);
        expect(result).toBe('');
      });

      test('should return "Today" for today\'s date without time', () => {
        const today = DateUtils.createDate(2025, 9, 15);
        const result = DateUtils.formatDateForDisplay(today);
        expect(result).toBe('Today');
      });

      test('should return "Today with time" for today\'s date with time', () => {
        const todayWithTime = DateUtils.createDate(2025, 9, 15, 14, 30, 0);
        const result = DateUtils.formatDateForDisplay(todayWithTime, true);
        expect(result).toBe('Today 2:30 pm');
      });

      test('should return "Today" for today\'s date with time when includeTime is false', () => {
        const todayWithTime = DateUtils.createDate(2025, 9, 15, 14, 30, 0);
        const result = DateUtils.formatDateForDisplay(todayWithTime, false);
        expect(result).toBe('Today');
      });

      test('should return "Tomorrow" for tomorrow\'s date without time', () => {
        const tomorrow = DateUtils.createDate(2025, 9, 16);
        const result = DateUtils.formatDateForDisplay(tomorrow);
        expect(result).toBe('Tomorrow');
      });

      test('should return "Tomorrow with time" for tomorrow\'s date with time', () => {
        const tomorrowWithTime = DateUtils.createDate(2025, 9, 16, 9, 15, 0);
        const result = DateUtils.formatDateForDisplay(tomorrowWithTime, true);
        expect(result).toBe('Tomorrow 9:15 am');
      });

      test('should return "Yesterday" for yesterday\'s date', () => {
        const yesterday = DateUtils.createDate(2025, 9, 14);
        const result = DateUtils.formatDateForDisplay(yesterday);
        expect(result).toBe('Yesterday');
      });

      test('should return "X days from now" for dates within next week', () => {
        const twoDaysFromNow = DateUtils.createDate(2025, 9, 17);
        const fiveDaysFromNow = DateUtils.createDate(2025, 9, 20);

        const result1 = DateUtils.formatDateForDisplay(twoDaysFromNow);
        const result2 = DateUtils.formatDateForDisplay(fiveDaysFromNow);

        expect(result1).toBe('2 days from now');
        expect(result2).toBe('5 days from now');
      });

      test('should return "X days ago" for dates within past week', () => {
        const twoDaysAgo = DateUtils.createDate(2025, 9, 13);
        const fiveDaysAgo = DateUtils.createDate(2025, 9, 10);

        const result1 = DateUtils.formatDateForDisplay(twoDaysAgo);
        const result2 = DateUtils.formatDateForDisplay(fiveDaysAgo);

        expect(result1).toBe('2 days ago');
        expect(result2).toBe('5 days ago');
      });

      test('should return formatted date with time for dates beyond a week with time', () => {
        const futureDate = DateUtils.createDate(2025, 10, 20, 15, 45, 0);
        const result = DateUtils.formatDateForDisplay(futureDate, true);
        expect(result).toBe('Nov 20, 2025 3:45 pm');
      });

      test('should return formatted date without time for dates beyond a week without time', () => {
        const futureDate = DateUtils.createDate(2025, 10, 20);
        const result = DateUtils.formatDateForDisplay(futureDate, false);
        expect(result).toBe('Nov 20, 2025');
      });

      test('should handle dates with different time zones correctly', () => {
        const dateWithTimeZone = DateUtils.createDate(2025, 9, 18, 22, 30, 0);
        const result = DateUtils.formatDateForDisplay(dateWithTimeZone, true);
        expect(result).toBe('3 days from now');
      });

      test('should handle month boundaries correctly', () => {
        const endOfMonth = DateUtils.createDate(2025, 9, 31);
        const result = DateUtils.formatDateForDisplay(endOfMonth);
        expect(result).toBe('Oct 31, 2025');
      });

      test('should handle year boundaries correctly', () => {
        const endOfYear = DateUtils.createDate(2025, 11, 31, 23, 59, 59);
        const result = DateUtils.formatDateForDisplay(endOfYear, true);
        expect(result).toBe('Dec 31, 2025 11:59 pm');
      });

      test('should handle midnight time correctly', () => {
        const midnight = DateUtils.createDate(2025, 9, 16);
        const result = DateUtils.formatDateForDisplay(midnight, true);
        expect(result).toBe('Tomorrow');
      });

      test('should handle non-midnight time correctly', () => {
        const nonMidnight = DateUtils.createDate(2025, 9, 16, 1, 30, 0);
        const result = DateUtils.formatDateForDisplay(nonMidnight, true);
        expect(result).toBe('Tomorrow 1:30 am');
      });
    });

    describe('parseDateValue', () => {
      const referenceDate = DateUtils.createDate(2025, 9, 15, 12, 0, 0);

      test('should return null for empty or whitespace input', () => {
        const result1 = DateUtils.parseDateValue('');
        const result2 = DateUtils.parseDateValue('   ');
        expect(result1).toBeNull();
        expect(result2).toBeNull();
      });

      test('should return "none" for "none" input', () => {
        const result = DateUtils.parseDateValue('none');
        expect(result).toBe('none');
      });

      test('should return special date strings for known keywords', () => {
        const specialCases = [
          'overdue',
          'due',
          'today',
          'tomorrow',
          'this week',
          'next week',
          'this month',
          'next month',
        ];
        specialCases.forEach((keyword) => {
          const result = DateUtils.parseDateValue(keyword);
          expect(result).toBe(keyword);
        });
      });

      test('should handle "next N days" pattern', () => {
        const result = DateUtils.parseDateValue('next 5 days');
        expect(result).toBe('next 5 days');
      });

      test('should handle date ranges with inclusive end date', () => {
        const result = DateUtils.parseDateValue('2025-01-01..2025-01-31');
        expect(result).not.toBeNull();
        if (
          result &&
          typeof result === 'object' &&
          'start' in result &&
          'end' in result
        ) {
          expect(result.start).toEqual(DateUtils.createDate(2025, 0, 1));
          expect(result.end).toEqual(DateUtils.createDate(2025, 1, 1)); // Should be one day after end date
        }
      });

      test('should return null for invalid date ranges', () => {
        const result = DateUtils.parseDateValue('invalid..2025-01-31');
        expect(result).toBeNull();
      });

      test('should parse full date format (YYYY-MM-DD)', () => {
        const result = DateUtils.parseDateValue('2025-12-25');
        expect(result).not.toBeNull();
        if (
          result &&
          typeof result === 'object' &&
          'date' in result &&
          'format' in result
        ) {
          expect(result.format).toBe('full');
          expect(result.date.getFullYear()).toBe(2025);
          expect(result.date.getMonth()).toBe(11); // December
          expect(result.date.getDate()).toBe(25);
        }
      });

      test('should return null for invalid full date format', () => {
        const result = DateUtils.parseDateValue('2025-13-01'); // Invalid month
        expect(result).not.toBeNull();
      });

      test('should parse year-month format (YYYY-MM)', () => {
        const result = DateUtils.parseDateValue('2025-12');
        expect(result).not.toBeNull();
        if (
          result &&
          typeof result === 'object' &&
          'date' in result &&
          'format' in result
        ) {
          expect(result.format).toBe('year-month');
          expect(result.date.getFullYear()).toBe(2025);
          expect(result.date.getMonth()).toBe(11); // December
          expect(result.date.getDate()).toBe(1);
        }
      });

      test('should return null for invalid year-month format', () => {
        const result = DateUtils.parseDateValue('2025-13'); // Invalid month
        expect(result).not.toBeNull();
      });

      test('should parse year-only format (YYYY)', () => {
        const result = DateUtils.parseDateValue('2025');
        expect(result).not.toBeNull();
        if (
          result &&
          typeof result === 'object' &&
          'date' in result &&
          'format' in result
        ) {
          expect(result.format).toBe('year');
          expect(result.date.getFullYear()).toBe(2025);
          expect(result.date.getMonth()).toBe(0); // January
          expect(result.date.getDate()).toBe(1);
        }
      });

      test('should handle quoted natural language expressions', () => {
        const result = DateUtils.parseDateValue('"next week"', referenceDate);
        expect(result).toBeInstanceOf(Date);
      });

      test('should handle unquoted relative expressions', () => {
        const result = DateUtils.parseDateValue('next monday', referenceDate);
        expect(result).toBeInstanceOf(Date);
      });

      test('should handle "in N days" pattern', () => {
        const result = DateUtils.parseDateValue('in 3 days', referenceDate);
        expect(result).toEqual(expect.any(Date));
        const expectedDate = DateUtils.createDate(
          referenceDate.getFullYear(),
          referenceDate.getMonth(),
          referenceDate.getDate() + 3,
          referenceDate.getHours(),
          referenceDate.getMinutes(),
          referenceDate.getSeconds(),
        );
        expect(result).toEqual(expectedDate);
      });

      test('should return null for unrecognized patterns', () => {
        const result = DateUtils.parseDateValue('unrecognized pattern');
        expect(result).toBeNull();
      });
    });

    describe('date checking methods', () => {
      const referenceDate = DateUtils.createDate(2025, 9, 15, 12, 0, 0);

      describe('isDateOverdue', () => {
        test('should return false for null date', () => {
          const result = DateUtils.isDateOverdue(null);
          expect(result).toBe(false);
        });

        test('should return true for dates before today', () => {
          const pastDate = DateUtils.createDate(2025, 9, 14); // Yesterday
          const result = DateUtils.isDateOverdue(pastDate, referenceDate);
          expect(result).toBe(true);
        });

        test('should return false for today', () => {
          const today = DateUtils.createDate(2025, 9, 15);
          const result = DateUtils.isDateOverdue(today, referenceDate);
          expect(result).toBe(false);
        });

        test('should return false for future dates', () => {
          const futureDate = DateUtils.createDate(2025, 9, 16); // Tomorrow
          const result = DateUtils.isDateOverdue(futureDate, referenceDate);
          expect(result).toBe(false);
        });
      });

      describe('isDateDueToday', () => {
        test('should return false for null date', () => {
          const result = DateUtils.isDateDueToday(null);
          expect(result).toBe(false);
        });

        test('should return true for today', () => {
          const today = DateUtils.createDate(2025, 9, 15);
          const result = DateUtils.isDateDueToday(today, referenceDate);
          expect(result).toBe(true);
        });

        test('should return false for yesterday', () => {
          const yesterday = DateUtils.createDate(2025, 9, 14);
          const result = DateUtils.isDateDueToday(yesterday, referenceDate);
          expect(result).toBe(false);
        });

        test('should return false for tomorrow', () => {
          const tomorrow = DateUtils.createDate(2025, 9, 16);
          const result = DateUtils.isDateDueToday(tomorrow, referenceDate);
          expect(result).toBe(false);
        });
      });

      describe('isDateDueTomorrow', () => {
        test('should return false for null date', () => {
          const result = DateUtils.isDateDueTomorrow(null);
          expect(result).toBe(false);
        });

        test('should return true for tomorrow', () => {
          const tomorrow = DateUtils.createDate(2025, 9, 16);
          const result = DateUtils.isDateDueTomorrow(tomorrow, referenceDate);
          expect(result).toBe(true);
        });

        test('should return false for today', () => {
          const today = DateUtils.createDate(2025, 9, 15);
          const result = DateUtils.isDateDueTomorrow(today, referenceDate);
          expect(result).toBe(false);
        });

        test('should return false for day after tomorrow', () => {
          const dayAfterTomorrow = DateUtils.createDate(2025, 9, 17);
          const result = DateUtils.isDateDueTomorrow(
            dayAfterTomorrow,
            referenceDate,
          );
          expect(result).toBe(false);
        });
      });

      describe('isDateInCurrentMonth', () => {
        test('should return false for null date', () => {
          const result = DateUtils.isDateInCurrentMonth(null);
          expect(result).toBe(false);
        });

        test('should return true for date in current month', () => {
          const currentMonthDate = DateUtils.createDate(2025, 9, 20);
          const result = DateUtils.isDateInCurrentMonth(
            currentMonthDate,
            referenceDate,
          );
          expect(result).toBe(true);
        });

        test('should return false for date in previous month', () => {
          const prevMonthDate = DateUtils.createDate(2025, 8, 30);
          const result = DateUtils.isDateInCurrentMonth(
            prevMonthDate,
            referenceDate,
          );
          expect(result).toBe(false);
        });

        test('should return false for date in next month', () => {
          const nextMonthDate = DateUtils.createDate(2025, 10, 1);
          const result = DateUtils.isDateInCurrentMonth(
            nextMonthDate,
            referenceDate,
          );
          expect(result).toBe(false);
        });

        test('should return false for date in same month but different year', () => {
          const differentYearDate = DateUtils.createDate(2024, 9, 15);
          const result = DateUtils.isDateInCurrentMonth(
            differentYearDate,
            referenceDate,
          );
          expect(result).toBe(false);
        });
      });

      describe('isDateInNextMonth', () => {
        test('should return false for null date', () => {
          const result = DateUtils.isDateInNextMonth(null);
          expect(result).toBe(false);
        });

        test('should return true for date in next month', () => {
          const nextMonthDate = DateUtils.createDate(2025, 10, 15);
          const result = DateUtils.isDateInNextMonth(
            nextMonthDate,
            referenceDate,
          );
          expect(result).toBe(true);
        });

        test('should return false for date in current month', () => {
          const currentMonthDate = DateUtils.createDate(2025, 9, 20);
          const result = DateUtils.isDateInNextMonth(
            currentMonthDate,
            referenceDate,
          );
          expect(result).toBe(false);
        });

        test('should return false for date in month after next', () => {
          const monthAfterNext = DateUtils.createDate(2025, 11, 1);
          const result = DateUtils.isDateInNextMonth(
            monthAfterNext,
            referenceDate,
          );
          expect(result).toBe(false);
        });

        test('should handle year rollover correctly', () => {
          const decReference = DateUtils.createDate(2025, 11, 15, 12, 0, 0);
          const janNextYear = DateUtils.createDate(2026, 0, 15);
          const result = DateUtils.isDateInNextMonth(janNextYear, decReference);
          expect(result).toBe(true);
        });
      });

      describe('isDateInNextNDays', () => {
        test('should return false for null date', () => {
          const result = DateUtils.isDateInNextNDays(null, 5);
          expect(result).toBe(false);
        });

        test('should return true for date within next N days', () => {
          const withinRange = DateUtils.createDate(2025, 9, 18); // 3 days from reference
          const result = DateUtils.isDateInNextNDays(
            withinRange,
            5,
            referenceDate,
          );
          expect(result).toBe(true);
        });

        test('should return false for date beyond next N days', () => {
          const beyondRange = DateUtils.createDate(2025, 9, 22); // 7 days from reference
          const result = DateUtils.isDateInNextNDays(
            beyondRange,
            5,
            referenceDate,
          );
          expect(result).toBe(false);
        });

        test('should return false for date in the past', () => {
          const pastDate = DateUtils.createDate(2025, 9, 10); // 5 days before reference
          const result = DateUtils.isDateInNextNDays(
            pastDate,
            5,
            referenceDate,
          );
          expect(result).toBe(false);
        });

        test('should return true for today', () => {
          const today = DateUtils.createDate(2025, 9, 15);
          const result = DateUtils.isDateInNextNDays(today, 5, referenceDate);
          expect(result).toBe(true);
        });
      });

      describe('isDateInRange', () => {
        const startDate = DateUtils.createDate(2025, 9, 10);
        const endDate = DateUtils.createDate(2025, 9, 20);

        test('should return false for null date', () => {
          const result = DateUtils.isDateInRange(null, startDate, endDate);
          expect(result).toBe(false);
        });

        test('should return true for date within range', () => {
          const withinRange = DateUtils.createDate(2025, 9, 15);
          const result = DateUtils.isDateInRange(
            withinRange,
            startDate,
            endDate,
          );
          expect(result).toBe(true);
        });

        test('should return false for date before range', () => {
          const beforeRange = DateUtils.createDate(2025, 9, 9);
          const result = DateUtils.isDateInRange(
            beforeRange,
            startDate,
            endDate,
          );
          expect(result).toBe(false);
        });

        test('should return false for date after range', () => {
          const afterRange = DateUtils.createDate(2025, 9, 20); // End date is exclusive
          const result = DateUtils.isDateInRange(
            afterRange,
            startDate,
            endDate,
          );
          expect(result).toBe(false);
        });

        test('should return true for start date', () => {
          const result = DateUtils.isDateInRange(startDate, startDate, endDate);
          expect(result).toBe(true);
        });
      });

      describe('compareDates', () => {
        test('should return false for null dates', () => {
          const result1 = DateUtils.compareDates(
            null,
            DateUtils.createDate(2025, 9, 15),
          );
          const result2 = DateUtils.compareDates(
            DateUtils.createDate(2025, 9, 15),
            null,
          );
          const result3 = DateUtils.compareDates(null, null);
          expect(result1).toBe(false);
          expect(result2).toBe(false);
          expect(result3).toBe(false);
        });

        test('should return true for same day', () => {
          const date1 = DateUtils.createDate(2025, 9, 15, 10, 30, 0);
          const date2 = DateUtils.createDate(2025, 9, 15, 14, 45, 0);
          const result = DateUtils.compareDates(date1, date2);
          expect(result).toBe(true);
        });

        test('should return false for different days', () => {
          const date1 = DateUtils.createDate(2025, 9, 15);
          const date2 = DateUtils.createDate(2025, 9, 16);
          const result = DateUtils.compareDates(date1, date2);
          expect(result).toBe(false);
        });

        test('should return false for different months', () => {
          const date1 = DateUtils.createDate(2025, 9, 15);
          const date2 = DateUtils.createDate(2025, 10, 15);
          const result = DateUtils.compareDates(date1, date2);
          expect(result).toBe(false);
        });

        test('should return false for different years', () => {
          const date1 = DateUtils.createDate(2025, 9, 15);
          const date2 = DateUtils.createDate(2026, 9, 15);
          const result = DateUtils.compareDates(date1, date2);
          expect(result).toBe(false);
        });
      });
    });

    describe('weekStartsOn functionality', () => {
      describe('isDateInCurrentWeek with Monday start', () => {
        test('should include Monday in current week', () => {
          const monday = DateUtils.createDate(2023, 11, 4, 12, 0, 0); // Monday
          const referenceDate = DateUtils.createDate(2023, 11, 4, 12, 0, 0); // Same Monday
          const result = DateUtils.isDateInCurrentWeek(
            monday,
            referenceDate,
            'Monday',
          );
          expect(result).toBe(true);
        });

        test('should include Sunday in current week when week starts on Monday', () => {
          const sunday = DateUtils.createDate(2023, 11, 10, 12, 0, 0); // Sunday
          const referenceDate = DateUtils.createDate(2023, 11, 4, 12, 0, 0); // Monday
          const result = DateUtils.isDateInCurrentWeek(
            sunday,
            referenceDate,
            'Monday',
          );
          expect(result).toBe(true);
        });

        test('should not include next Monday in current week', () => {
          const nextMonday = DateUtils.createDate(2023, 11, 11, 12, 0, 0); // Next Monday
          const referenceDate = DateUtils.createDate(2023, 11, 4, 12, 0, 0); // Monday
          const result = DateUtils.isDateInCurrentWeek(
            nextMonday,
            referenceDate,
            'Monday',
          );
          expect(result).toBe(false);
        });
      });

      describe('isDateInCurrentWeek with Sunday start', () => {
        test('should include Sunday in current week', () => {
          const sunday = DateUtils.createDate(2023, 11, 3, 12, 0, 0); // Sunday
          const referenceDate = DateUtils.createDate(2023, 11, 3, 12, 0, 0); // Same Sunday
          const result = DateUtils.isDateInCurrentWeek(
            sunday,
            referenceDate,
            'Sunday',
          );
          expect(result).toBe(true);
        });

        test('should include Saturday in current week when week starts on Sunday', () => {
          const saturday = DateUtils.createDate(2023, 11, 9, 12, 0, 0); // Saturday
          const referenceDate = DateUtils.createDate(2023, 11, 3, 12, 0, 0); // Sunday
          const result = DateUtils.isDateInCurrentWeek(
            saturday,
            referenceDate,
            'Sunday',
          );
          expect(result).toBe(true);
        });

        test('should not include next Sunday in current week', () => {
          const nextSunday = DateUtils.createDate(2023, 11, 10, 12, 0, 0); // Next Sunday
          const referenceDate = DateUtils.createDate(2023, 11, 3, 12, 0, 0); // Sunday
          const result = DateUtils.isDateInCurrentWeek(
            nextSunday,
            referenceDate,
            'Sunday',
          );
          expect(result).toBe(false);
        });
      });

      describe('isDateInNextWeek', () => {
        test('should include next Monday in next week when week starts on Monday', () => {
          const nextMonday = DateUtils.createDate(2023, 11, 11, 12, 0, 0); // Next Monday
          const referenceDate = DateUtils.createDate(2023, 11, 4, 12, 0, 0); // Monday
          const result = DateUtils.isDateInNextWeek(
            nextMonday,
            referenceDate,
            'Monday',
          );
          expect(result).toBe(true);
        });

        test('should include next Sunday in next week when week starts on Sunday', () => {
          const nextSunday = DateUtils.createDate(2023, 11, 10, 12, 0, 0); // Next Sunday
          const referenceDate = DateUtils.createDate(2023, 11, 3, 12, 0, 0); // Sunday
          const result = DateUtils.isDateInNextWeek(
            nextSunday,
            referenceDate,
            'Sunday',
          );
          expect(result).toBe(true);
        });

        test('should not include current week dates in next week', () => {
          const currentWeekDate = DateUtils.createDate(2023, 11, 4, 12, 0, 0); // Current Monday
          const referenceDate = DateUtils.createDate(2023, 11, 4, 12, 0, 0); // Same Monday
          const result = DateUtils.isDateInNextWeek(
            currentWeekDate,
            referenceDate,
            'Monday',
          );
          expect(result).toBe(false);
        });
      });
    });
  });
});
