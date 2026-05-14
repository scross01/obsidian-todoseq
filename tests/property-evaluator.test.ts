import { PropertyEvaluator } from '../src/utils/property-evaluator';

describe('PropertyEvaluator', () => {
  describe('parseDateForComparison', () => {
    test('parses YYYY-MM-DD format', () => {
      const result = PropertyEvaluator.parseDateForComparison('2026-05-13');
      expect(result).not.toBeNull();
      expect(result!.getFullYear()).toBe(2026);
      expect(result!.getMonth()).toBe(4);
      expect(result!.getDate()).toBe(13);
    });

    test('parses YYYY-MM format with day defaulted to 1', () => {
      const result = PropertyEvaluator.parseDateForComparison('2026-03');
      expect(result).not.toBeNull();
      expect(result!.getFullYear()).toBe(2026);
      expect(result!.getMonth()).toBe(2);
      expect(result!.getDate()).toBe(1);
    });

    test('parses YYYY format with month and day defaulted', () => {
      const result = PropertyEvaluator.parseDateForComparison('2025');
      expect(result).not.toBeNull();
      expect(result!.getFullYear()).toBe(2025);
      expect(result!.getMonth()).toBe(0);
      expect(result!.getDate()).toBe(1);
    });

    test('returns null for invalid formats', () => {
      expect(PropertyEvaluator.parseDateForComparison('not-a-date')).toBeNull();
      expect(PropertyEvaluator.parseDateForComparison('')).toBeNull();
      expect(PropertyEvaluator.parseDateForComparison('abc-01-01')).toBeNull();
      expect(PropertyEvaluator.parseDateForComparison('today')).toBeNull();
    });

    test('trims whitespace before parsing', () => {
      const result = PropertyEvaluator.parseDateForComparison('  2026-01-15  ');
      expect(result).not.toBeNull();
      expect(result!.getFullYear()).toBe(2026);
      expect(result!.getMonth()).toBe(0);
      expect(result!.getDate()).toBe(15);
    });
  });

  describe('parsePropertyValueAsDate', () => {
    test('returns Date instance directly when input is a Date', () => {
      const date = new Date(2026, 4, 13);
      const result = PropertyEvaluator.parsePropertyValueAsDate(date);
      expect(result).toBe(date);
    });

    test('parses YYYY-MM-DD string via parseDateForComparison', () => {
      const result = PropertyEvaluator.parsePropertyValueAsDate('2026-05-13');
      expect(result).not.toBeNull();
      expect(result!.getFullYear()).toBe(2026);
      expect(result!.getMonth()).toBe(4);
      expect(result!.getDate()).toBe(13);
    });

    test('parses string returning {date, format} from DateUtils.parseDateValue', () => {
      const result =
        PropertyEvaluator.parsePropertyValueAsDate('"next monday"');
      expect(result).not.toBeNull();
      expect(result).toBeInstanceOf(Date);
    });

    test('parses string returning Date instance from DateUtils.parseDateValue', () => {
      const result = PropertyEvaluator.parsePropertyValueAsDate('in 3 days');
      expect(result).not.toBeNull();
      expect(result).toBeInstanceOf(Date);
    });

    test('returns null for "none" string', () => {
      expect(PropertyEvaluator.parsePropertyValueAsDate('none')).toBeNull();
    });

    test('returns null for relative keyword strings like "today"', () => {
      expect(PropertyEvaluator.parsePropertyValueAsDate('today')).toBeNull();
      expect(PropertyEvaluator.parsePropertyValueAsDate('overdue')).toBeNull();
    });

    test('returns null for number input', () => {
      expect(PropertyEvaluator.parsePropertyValueAsDate(42)).toBeNull();
    });

    test('returns null for null input', () => {
      expect(PropertyEvaluator.parsePropertyValueAsDate(null)).toBeNull();
    });

    test('returns null for undefined input', () => {
      expect(PropertyEvaluator.parsePropertyValueAsDate(undefined)).toBeNull();
    });

    test('returns null for plain object input', () => {
      expect(PropertyEvaluator.parsePropertyValueAsDate({})).toBeNull();
    });

    test('returns null for boolean input', () => {
      expect(PropertyEvaluator.parsePropertyValueAsDate(true)).toBeNull();
    });
  });

  describe('compareDate', () => {
    test('returns false for falsy taskDate', () => {
      expect(PropertyEvaluator.compareDate(null as never, 'today')).toBe(false);
    });

    describe('relative date strings', () => {
      test('returns true when task date is today and parsedDate is "today"', () => {
        const today = new Date();
        expect(PropertyEvaluator.compareDate(today, 'today')).toBe(true);
      });

      test('returns false when task date is not today and parsedDate is "today"', () => {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        expect(PropertyEvaluator.compareDate(yesterday, 'today')).toBe(false);
      });

      test('returns true when task date is tomorrow and parsedDate is "tomorrow"', () => {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        expect(PropertyEvaluator.compareDate(tomorrow, 'tomorrow')).toBe(true);
      });

      test('returns false when task date is not tomorrow and parsedDate is "tomorrow"', () => {
        const today = new Date();
        expect(PropertyEvaluator.compareDate(today, 'tomorrow')).toBe(false);
      });

      test('returns true when task date is overdue and parsedDate is "overdue"', () => {
        const pastDate = new Date();
        pastDate.setDate(pastDate.getDate() - 5);
        expect(PropertyEvaluator.compareDate(pastDate, 'overdue')).toBe(true);
      });

      test('returns false when task date is not overdue and parsedDate is "overdue"', () => {
        const futureDate = new Date();
        futureDate.setDate(futureDate.getDate() + 5);
        expect(PropertyEvaluator.compareDate(futureDate, 'overdue')).toBe(
          false,
        );
      });

      test('returns false for unknown string values', () => {
        const date = new Date();
        expect(PropertyEvaluator.compareDate(date, 'yesterday')).toBe(false);
        expect(PropertyEvaluator.compareDate(date, 'next week')).toBe(false);
      });
    });

    describe('date range objects', () => {
      test('returns true when task date is within range', () => {
        const taskDate = new Date(2026, 5, 15);
        const range = {
          start: new Date(2026, 5, 1),
          end: new Date(2026, 5, 30),
        };
        expect(PropertyEvaluator.compareDate(taskDate, range)).toBe(true);
      });

      test('returns false when task date is before range start', () => {
        const taskDate = new Date(2026, 4, 15);
        const range = {
          start: new Date(2026, 5, 1),
          end: new Date(2026, 5, 30),
        };
        expect(PropertyEvaluator.compareDate(taskDate, range)).toBe(false);
      });

      test('returns false when task date is at or after range end', () => {
        const range = {
          start: new Date(2026, 5, 1),
          end: new Date(2026, 5, 30),
        };
        expect(
          PropertyEvaluator.compareDate(new Date(2026, 5, 30), range),
        ).toBe(false);
      });
    });

    describe('date with format objects', () => {
      test('matches year format', () => {
        const taskDate = new Date(2026, 6, 15);
        const searchDate = {
          date: new Date(2026, 0, 1),
          format: 'year' as const,
        };
        expect(PropertyEvaluator.compareDate(taskDate, searchDate)).toBe(true);
      });

      test('rejects year format mismatch', () => {
        const taskDate = new Date(2025, 6, 15);
        const searchDate = {
          date: new Date(2026, 0, 1),
          format: 'year' as const,
        };
        expect(PropertyEvaluator.compareDate(taskDate, searchDate)).toBe(false);
      });

      test('matches year-month format', () => {
        const taskDate = new Date(2026, 3, 20);
        const searchDate = {
          date: new Date(2026, 3, 1),
          format: 'year-month' as const,
        };
        expect(PropertyEvaluator.compareDate(taskDate, searchDate)).toBe(true);
      });

      test('rejects year-month format with different month', () => {
        const taskDate = new Date(2026, 4, 20);
        const searchDate = {
          date: new Date(2026, 3, 1),
          format: 'year-month' as const,
        };
        expect(PropertyEvaluator.compareDate(taskDate, searchDate)).toBe(false);
      });

      test('matches full format (same day)', () => {
        const taskDate = new Date(2026, 3, 15);
        const searchDate = {
          date: new Date(2026, 3, 15),
          format: 'full' as const,
        };
        expect(PropertyEvaluator.compareDate(taskDate, searchDate)).toBe(true);
      });

      test('rejects full format (different day)', () => {
        const taskDate = new Date(2026, 3, 15);
        const searchDate = {
          date: new Date(2026, 3, 16),
          format: 'full' as const,
        };
        expect(PropertyEvaluator.compareDate(taskDate, searchDate)).toBe(false);
      });

      test('returns false for unknown format', () => {
        const taskDate = new Date(2026, 3, 15);
        const searchDate = {
          date: new Date(2026, 3, 15),
          format: 'unknown' as never,
        };
        expect(PropertyEvaluator.compareDate(taskDate, searchDate)).toBe(false);
      });
    });

    describe('Date instance parsed values', () => {
      test('returns true when dates match', () => {
        const taskDate = new Date(2026, 3, 15);
        const parsedDate = new Date(2026, 3, 15);
        expect(PropertyEvaluator.compareDate(taskDate, parsedDate)).toBe(true);
      });

      test('returns false when dates do not match', () => {
        const taskDate = new Date(2026, 3, 15);
        const parsedDate = new Date(2026, 3, 16);
        expect(PropertyEvaluator.compareDate(taskDate, parsedDate)).toBe(false);
      });
    });

    test('returns false for null parsedDate', () => {
      expect(PropertyEvaluator.compareDate(new Date(), null as never)).toBe(
        false,
      );
    });
  });

  describe('evaluateDateComparison', () => {
    const earlier = new Date(2026, 0, 1);
    const later = new Date(2026, 0, 10);

    test('">": true when taskDate is after compareDate', () => {
      expect(
        PropertyEvaluator.evaluateDateComparison(later, '>', earlier),
      ).toBe(true);
    });

    test('">": false when taskDate is before compareDate', () => {
      expect(
        PropertyEvaluator.evaluateDateComparison(earlier, '>', later),
      ).toBe(false);
    });

    test('">=": true when taskDate equals compareDate', () => {
      const date = new Date(2026, 0, 5);
      expect(
        PropertyEvaluator.evaluateDateComparison(
          date,
          '>=',
          new Date(2026, 0, 5),
        ),
      ).toBe(true);
    });

    test('">=": true when taskDate is after compareDate', () => {
      expect(
        PropertyEvaluator.evaluateDateComparison(later, '>=', earlier),
      ).toBe(true);
    });

    test('">=": false when taskDate is before compareDate', () => {
      expect(
        PropertyEvaluator.evaluateDateComparison(earlier, '>=', later),
      ).toBe(false);
    });

    test('"<": true when taskDate is before compareDate', () => {
      expect(
        PropertyEvaluator.evaluateDateComparison(earlier, '<', later),
      ).toBe(true);
    });

    test('"<": false when taskDate is after compareDate', () => {
      expect(
        PropertyEvaluator.evaluateDateComparison(later, '<', earlier),
      ).toBe(false);
    });

    test('"<=": true when taskDate equals compareDate', () => {
      const date = new Date(2026, 0, 5);
      expect(
        PropertyEvaluator.evaluateDateComparison(
          date,
          '<=',
          new Date(2026, 0, 5),
        ),
      ).toBe(true);
    });

    test('"<=": true when taskDate is before compareDate', () => {
      expect(
        PropertyEvaluator.evaluateDateComparison(earlier, '<=', later),
      ).toBe(true);
    });

    test('"<=": false when taskDate is after compareDate', () => {
      expect(
        PropertyEvaluator.evaluateDateComparison(later, '<=', earlier),
      ).toBe(false);
    });

    test('returns false for unknown operator', () => {
      expect(
        PropertyEvaluator.evaluateDateComparison(later, '==', earlier),
      ).toBe(false);
      expect(
        PropertyEvaluator.evaluateDateComparison(later, '!=', earlier),
      ).toBe(false);
    });
  });
});
