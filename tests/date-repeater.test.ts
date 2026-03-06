import {
  parseRepeater,
  extractRepeaterFromDate,
  calculateNextRepeatDate,
  hasRepeater,
  getEffectiveDate,
} from '../src/utils/date-repeater';

describe('date-repeater', () => {
  describe('parseRepeater', () => {
    it('should parse .+1d (shift from now, daily)', () => {
      const result = parseRepeater('.+1d');
      expect(result).toEqual({
        type: '.+',
        unit: 'd',
        value: 1,
        raw: '.+1d',
      });
    });

    it('should parse ++1w (catch-up weekly)', () => {
      const result = parseRepeater('++1w');
      expect(result).toEqual({
        type: '++',
        unit: 'w',
        value: 1,
        raw: '++1w',
      });
    });

    it('should parse +1m (plain repeat monthly)', () => {
      const result = parseRepeater('+1m');
      expect(result).toEqual({
        type: '+',
        unit: 'm',
        value: 1,
        raw: '+1m',
      });
    });

    it('should parse +1y (plain repeat yearly)', () => {
      const result = parseRepeater('+1y');
      expect(result).toEqual({
        type: '+',
        unit: 'y',
        value: 1,
        raw: '+1y',
      });
    });

    it('should parse .+1h (shift from now, hourly)', () => {
      const result = parseRepeater('.+1h');
      expect(result).toEqual({
        type: '.+',
        unit: 'h',
        value: 1,
        raw: '.+1h',
      });
    });

    it('should parse +3m (plain repeat 3 months)', () => {
      const result = parseRepeater('+3m');
      expect(result).toEqual({
        type: '+',
        unit: 'm',
        value: 3,
        raw: '+3m',
      });
    });

    it('should parse ++2w (catch-up 2 weeks)', () => {
      const result = parseRepeater('++2w');
      expect(result).toEqual({
        type: '++',
        unit: 'w',
        value: 2,
        raw: '++2w',
      });
    });

    it('should parse lowercase units correctly', () => {
      expect(parseRepeater('+1d')).toEqual({
        type: '+',
        unit: 'd',
        value: 1,
        raw: '+1d',
      });
      expect(parseRepeater('+1w')).toEqual({
        type: '+',
        unit: 'w',
        value: 1,
        raw: '+1w',
      });
      expect(parseRepeater('+1m')).toEqual({
        type: '+',
        unit: 'm',
        value: 1,
        raw: '+1m',
      });
      expect(parseRepeater('+1y')).toEqual({
        type: '+',
        unit: 'y',
        value: 1,
        raw: '+1y',
      });
      expect(parseRepeater('+1h')).toEqual({
        type: '+',
        unit: 'h',
        value: 1,
        raw: '+1h',
      });
    });

    it('should return null for invalid repeater strings', () => {
      expect(parseRepeater('')).toBeNull();
      expect(parseRepeater('+')).toBeNull();
      expect(parseRepeater('+d')).toBeNull();
      expect(parseRepeater('+1')).toBeNull();
      expect(parseRepeater('1d')).toBeNull();
      expect(parseRepeater('.+d')).toBeNull();
      expect(parseRepeater('++d')).toBeNull();
      // Note: uppercase H is not supported (regex only matches lowercase)
      expect(parseRepeater('+1H')).toBeNull();
    });

    it('should return null for invalid values (0 or negative)', () => {
      expect(parseRepeater('+0d')).toBeNull();
      expect(parseRepeater('+1d')).not.toBeNull();
      expect(parseRepeater('+10d')).not.toBeNull();
    });
  });

  describe('extractRepeaterFromDate', () => {
    it('should extract repeater from org-mode date format', () => {
      const result = extractRepeaterFromDate('<2026-03-05 Wed 07:00 .+1d>');
      // The fix removes trailing space before closing >
      expect(result.baseDateStr).toBe('<2026-03-05 Wed 07:00>');
      expect(result.repeat).toEqual({
        type: '.+',
        unit: 'd',
        value: 1,
        raw: '.+1d',
      });
    });

    it('should extract repeater from date without time', () => {
      const result = extractRepeaterFromDate('<2026-03-05 +1m>');
      // The fix removes trailing space before closing >
      expect(result.baseDateStr).toBe('<2026-03-05>');
      expect(result.repeat).toEqual({
        type: '+',
        unit: 'm',
        value: 1,
        raw: '+1m',
      });
    });

    it('should handle date without repeater', () => {
      const result = extractRepeaterFromDate('<2026-03-05 Wed>');
      expect(result.baseDateStr).toBe('<2026-03-05 Wed>');
      expect(result.repeat).toBeNull();
    });

    it('should handle plain date string without brackets', () => {
      const result = extractRepeaterFromDate('2026-03-05');
      expect(result.baseDateStr).toBe('2026-03-05');
      expect(result.repeat).toBeNull();
    });

    it('should extract ++1w correctly', () => {
      const result = extractRepeaterFromDate('<2026-03-05 Thu ++1w>');
      expect(result.repeat).toEqual({
        type: '++',
        unit: 'w',
        value: 1,
        raw: '++1w',
      });
    });
  });

  describe('calculateNextRepeatDate', () => {
    describe('plain repeat (+)', () => {
      it('should add days to base date for +1d', () => {
        const baseDate = new Date('2026-03-01T10:00:00');
        const repeat = {
          type: '+' as const,
          unit: 'd' as const,
          value: 1,
          raw: '+1d',
        };
        const fromDate = new Date('2026-03-10T10:00:00'); // Much later

        const result = calculateNextRepeatDate(baseDate, repeat, fromDate);
        // Plain repeat adds to base date, regardless of fromDate
        expect(result.getDate()).toBe(2);
        expect(result.getMonth()).toBe(2); // March
      });

      it('should add months to base date for +1m', () => {
        const baseDate = new Date('2026-01-15T10:00:00');
        const repeat = {
          type: '+' as const,
          unit: 'm' as const,
          value: 1,
          raw: '+1m',
        };
        const fromDate = new Date('2026-03-01T10:00:00');

        const result = calculateNextRepeatDate(baseDate, repeat, fromDate);
        expect(result.getMonth()).toBe(1); // February
        expect(result.getDate()).toBe(15);
      });

      it('should add years to base date for +1y', () => {
        const baseDate = new Date('2024-06-15T10:00:00');
        const repeat = {
          type: '+' as const,
          unit: 'y' as const,
          value: 1,
          raw: '+1y',
        };
        const fromDate = new Date('2026-01-01T10:00:00');

        const result = calculateNextRepeatDate(baseDate, repeat, fromDate);
        expect(result.getFullYear()).toBe(2025);
        expect(result.getMonth()).toBe(5); // June
        expect(result.getDate()).toBe(15);
      });

      it('should add weeks to base date for +1w', () => {
        const baseDate = new Date('2026-03-01T10:00:00');
        const repeat = {
          type: '+' as const,
          unit: 'w' as const,
          value: 1,
          raw: '+1w',
        };
        const fromDate = new Date('2026-03-20T10:00:00');

        const result = calculateNextRepeatDate(baseDate, repeat, fromDate);
        // +1w adds 7 days to base date
        expect(result.getDate()).toBe(8);
      });

      it('should add hours to base date for +1h', () => {
        const baseDate = new Date('2026-03-01T10:00:00');
        const repeat = {
          type: '+' as const,
          unit: 'h' as const,
          value: 1,
          raw: '+1h',
        };
        const fromDate = new Date('2026-03-01T12:00:00');

        const result = calculateNextRepeatDate(baseDate, repeat, fromDate);
        // Plain repeat adds to base date, not fromDate
        expect(result.getHours()).toBe(11);
      });
    });

    describe('shift from now (.+)', () => {
      it('should find next occurrence after fromDate for .+1d', () => {
        // .+ should find the next occurrence AFTER fromDate, preserving time from baseDate
        const baseDate = new Date('2026-01-01T10:00:00'); // Old date with time 10:00
        const repeat = {
          type: '.+' as const,
          unit: 'd' as const,
          value: 1,
          raw: '.+1d',
        };
        const fromDate = new Date('2026-03-10T10:00:00');

        const result = calculateNextRepeatDate(baseDate, repeat, fromDate);
        // Should find next day after fromDate (Mar 11) preserving time 10:00
        expect(result.getDate()).toBe(11);
        expect(result.getMonth()).toBe(2); // March
        expect(result.getHours()).toBe(10);
        expect(result.getMinutes()).toBe(0);
      });

      it('should find next hour after fromDate for .+1h', () => {
        // For .+1h, find the next hour after fromDate
        // baseDate: 2026-01-01T10:00:00 (old)
        // fromDate: 2026-03-10T14:30:00
        // The next hour after 14:30 is 15:00 on the same day or next day
        const baseDate = new Date('2026-01-01T10:00:00'); // 10:00
        const repeat = {
          type: '.+' as const,
          unit: 'h' as const,
          value: 1,
          raw: '.+1h',
        };
        const fromDate = new Date('2026-03-10T14:30:00'); // 14:30

        const result = calculateNextRepeatDate(baseDate, repeat, fromDate);
        // Result should be after fromDate, finding next hour slot
        expect(result.getTime()).toBeGreaterThan(fromDate.getTime());
        // Should be on Mar 10 or Mar 11 at a reasonable hour
        expect(result.getHours()).toBeGreaterThanOrEqual(14);
      });

      // User-specified test cases
      describe('user-specified cases', () => {
        it('initial date before now, time before now: should find next occurrence after now', () => {
          // initial:<2026-01-01 Thu 08:00 .+1d> current:<2026-03-05 Thu 09:30>, expected:<2026-03-06 Fri 08:00 .+1d>
          const baseDate = new Date('2026-01-01T08:00:00'); // Thu 08:00
          const repeat = {
            type: '.+' as const,
            unit: 'd' as const,
            value: 1,
            raw: '.+1d',
          };
          const fromDate = new Date('2026-03-05T09:30:00'); // Thu 09:30

          const result = calculateNextRepeatDate(baseDate, repeat, fromDate);
          // Should be next day at 08:00 (Fri Mar 6)
          expect(result.getFullYear()).toBe(2026);
          expect(result.getMonth()).toBe(2); // March
          expect(result.getDate()).toBe(6); // Friday
          expect(result.getHours()).toBe(8);
          expect(result.getMinutes()).toBe(0);
        });

        it('initial date before now, time after now: should use time from initial', () => {
          // initial:<2026-01-01 Thu 20:00 .+1d> current:<2026-03-05 Thu 09:30>, expected:<2026-03-05 Thu 20:00 .+1d>
          const baseDate = new Date('2026-01-01T20:00:00'); // Thu 20:00
          const repeat = {
            type: '.+' as const,
            unit: 'd' as const,
            value: 1,
            raw: '.+1d',
          };
          const fromDate = new Date('2026-03-05T09:30:00'); // Thu 09:30

          const result = calculateNextRepeatDate(baseDate, repeat, fromDate);
          // Should be same day at 20:00 (Thu Mar 5)
          expect(result.getFullYear()).toBe(2026);
          expect(result.getMonth()).toBe(2); // March
          expect(result.getDate()).toBe(5); // Thursday
          expect(result.getHours()).toBe(20);
          expect(result.getMinutes()).toBe(0);
        });

        it('initial date after now: should add to initial date', () => {
          // initial:<2026-04-01 Wed 20:00 .+1d> current:<2026-03-05 Thu 09:30>, expected:<2026-04-02 Thu 20:00 .+1d>
          const baseDate = new Date('2026-04-01T20:00:00'); // Wed Apr 1 20:00
          const repeat = {
            type: '.+' as const,
            unit: 'd' as const,
            value: 1,
            raw: '.+1d',
          };
          const fromDate = new Date('2026-03-05T09:30:00'); // Thu Mar 5 09:30

          const result = calculateNextRepeatDate(baseDate, repeat, fromDate);
          // Since baseDate > fromDate, should add to base: Apr 1 + 1 day = Apr 2
          expect(result.getFullYear()).toBe(2026);
          expect(result.getMonth()).toBe(3); // April
          expect(result.getDate()).toBe(2); // Thursday
          expect(result.getHours()).toBe(20);
          expect(result.getMinutes()).toBe(0);
        });

        // Additional user-specified cases with time
        it('.+1h with time before now: should add exactly one hour from now', () => {
          // Similar to: TODO Wash my hands <2019-04-05 08:00 Fri .+1h>
          // If current is Fri 09:30, next should be Fri 10:30
          const baseDate = new Date('2026-03-06T08:00:00'); // Fri 08:00
          const repeat = {
            type: '.+' as const,
            unit: 'h' as const,
            value: 1,
            raw: '.+1h',
          };
          const fromDate = new Date('2026-03-06T09:30:00'); // Fri 09:30

          const result = calculateNextRepeatDate(baseDate, repeat, fromDate);
          // Should be one hour from now (10:30)
          expect(result.getDate()).toBe(6); // Friday
          expect(result.getHours()).toBe(10); // 10:00
          expect(result.getMinutes()).toBe(30); // 30 minutes from now
        });

        it('.+1m with time: should shift by one month from now', () => {
          // Similar to: TODO Check batteries <2005-11-01 Tue .+1m>
          // If current is Feb 28 09:30, should be Mar 28 at same time
          const baseDate = new Date('2026-01-01T08:00:00'); // Jan 1 08:00
          const repeat = {
            type: '.+' as const,
            unit: 'm' as const,
            value: 1,
            raw: '.+1m',
          };
          const fromDate = new Date('2026-02-28T09:30:00'); // Feb 28 09:30

          const result = calculateNextRepeatDate(baseDate, repeat, fromDate);
          // Should be one month from now (Mar 28) at 08:00
          expect(result.getMonth()).toBe(2); // March
          expect(result.getDate()).toBe(28);
          expect(result.getHours()).toBe(8);
          expect(result.getMinutes()).toBe(0);
        });
      });
    });

    describe('catch-up with future initial date', () => {
      it('++1d with future initial date should add one day', () => {
        // Initial target is in the future, should just add one day
        const baseDate = new Date('2026-04-01T10:00:00'); // Wed Apr 1 10:00
        const repeat = {
          type: '++' as const,
          unit: 'd' as const,
          value: 1,
          raw: '++1d',
        };
        const fromDate = new Date('2026-03-05T09:30:00'); // Thu Mar 5 09:30

        const result = calculateNextRepeatDate(baseDate, repeat, fromDate);
        // Should be April 2 at same time
        expect(result.getMonth()).toBe(3); // April
        expect(result.getDate()).toBe(2); // Thursday
        expect(result.getHours()).toBe(10);
        expect(result.getMinutes()).toBe(0);
      });

      it('++1w with future initial date should add one week', () => {
        // Initial target is in the future, should just add one week
        const baseDate = new Date('2026-04-01T10:00:00'); // Wed Apr 1 10:00
        const repeat = {
          type: '++' as const,
          unit: 'w' as const,
          value: 1,
          raw: '++1w',
        };
        const fromDate = new Date('2026-03-05T09:30:00'); // Thu Mar 5 09:30

        const result = calculateNextRepeatDate(baseDate, repeat, fromDate);
        // Should be April 8 (Wed + 7 days)
        expect(result.getMonth()).toBe(3); // April
        expect(result.getDate()).toBe(8); // Wednesday
        expect(result.getHours()).toBe(10);
        expect(result.getMinutes()).toBe(0);
      });

      it('++1m with future initial date should add one month', () => {
        // Initial target is in the future, should just add one month
        const baseDate = new Date('2026-04-01T10:00:00'); // Wed Apr 1 10:00
        const repeat = {
          type: '++' as const,
          unit: 'm' as const,
          value: 1,
          raw: '++1m',
        };
        const fromDate = new Date('2026-03-05T09:30:00'); // Thu Mar 5 09:30

        const result = calculateNextRepeatDate(baseDate, repeat, fromDate);
        // Should be May 1 at same time
        expect(result.getMonth()).toBe(4); // May
        expect(result.getDate()).toBe(1); // Wednesday
        expect(result.getHours()).toBe(10);
        expect(result.getMinutes()).toBe(0);
      });

      it('++1y with future initial date should add one year', () => {
        // Initial target is in the future, should just add one year
        const baseDate = new Date('2026-04-01T10:00:00'); // Wed Apr 1 10:00
        const repeat = {
          type: '++' as const,
          unit: 'y' as const,
          value: 1,
          raw: '++1y',
        };
        const fromDate = new Date('2026-03-05T09:30:00'); // Thu Mar 5 09:30

        const result = calculateNextRepeatDate(baseDate, repeat, fromDate);
        // Should be April 1, 2027
        expect(result.getFullYear()).toBe(2027);
        expect(result.getMonth()).toBe(3); // April
        expect(result.getDate()).toBe(1); // Thursday
        expect(result.getHours()).toBe(10);
        expect(result.getMinutes()).toBe(0);
      });
    });
  });

  describe('hasRepeater', () => {
    it('should return true when scheduledDateRepeat exists', () => {
      const task = {
        scheduledDateRepeat: {
          type: '.+' as const,
          unit: 'd' as const,
          value: 1,
          raw: '.+1d',
        },
        deadlineDateRepeat: null,
      };
      expect(hasRepeater(task)).toBe(true);
    });

    it('should return true when deadlineDateRepeat exists', () => {
      const task = {
        scheduledDateRepeat: null,
        deadlineDateRepeat: {
          type: '+' as const,
          unit: 'w' as const,
          value: 1,
          raw: '+1w',
        },
      };
      expect(hasRepeater(task)).toBe(true);
    });

    it('should return true when both exist', () => {
      const task = {
        scheduledDateRepeat: {
          type: '.+' as const,
          unit: 'd' as const,
          value: 1,
          raw: '.+1d',
        },
        deadlineDateRepeat: {
          type: '+' as const,
          unit: 'm' as const,
          value: 1,
          raw: '+1m',
        },
      };
      expect(hasRepeater(task)).toBe(true);
    });

    it('should return false when neither exists', () => {
      const task = {
        scheduledDateRepeat: null,
        deadlineDateRepeat: null,
      };
      expect(hasRepeater(task)).toBe(false);
    });
  });

  describe('getEffectiveDate', () => {
    it('should return null when date is null', () => {
      expect(getEffectiveDate(null, null)).toBeNull();
      expect(
        getEffectiveDate(null, {
          type: '.+' as const,
          unit: 'd' as const,
          value: 1,
          raw: '.+1d',
        }),
      ).toBeNull();
    });

    it('should return original date when no repeater', () => {
      const date = new Date('2026-03-05T10:00:00');
      const result = getEffectiveDate(date, null);
      expect(result?.getTime()).toBe(date.getTime());
    });

    it('should calculate next occurrence when repeater exists', () => {
      const baseDate = new Date('2026-01-01T10:00:00');
      const repeat = {
        type: '.+' as const,
        unit: 'd' as const,
        value: 1,
        raw: '.+1d',
      };

      const result = getEffectiveDate(baseDate, repeat);
      // .+ uses current date as reference, so result should be in the future relative to baseDate
      expect(result?.getTime()).toBeGreaterThan(baseDate.getTime());
    });
  });
});
