import { DateParser } from '../src/parser/date-parser';
import { DateUtils } from '../src/utils/date-utils';

describe('DateParser', () => {
  describe('parseDateString', () => {
    it('should parse a valid date-only string to a Date object', () => {
      const result = DateParser.parseDateString('2026-03-05');
      expect(result).toBeInstanceOf(Date);
      expect(result!.getFullYear()).toBe(2026);
      expect(result!.getMonth()).toBe(2); // Month is 0-indexed
      expect(result!.getDate()).toBe(5);
      expect(result!.getHours()).toBe(0);
      expect(result!.getMinutes()).toBe(0);
    });

    it('should handle month boundary dates', () => {
      // January 1
      const result = DateParser.parseDateString('2026-01-01');
      expect(result!.getMonth()).toBe(0);
      expect(result!.getDate()).toBe(1);

      // December 31
      const result2 = DateParser.parseDateString('2026-12-31');
      expect(result2!.getMonth()).toBe(11);
      expect(result2!.getDate()).toBe(31);
    });

    it('should handle leap years', () => {
      const result = DateParser.parseDateString('2024-02-29');
      expect(result!.getFullYear()).toBe(2024);
      expect(result!.getMonth()).toBe(1);
      expect(result!.getDate()).toBe(29);
    });

    it('normalizes invalid month/day overflow (2026-13-40 becomes 2027-02-09)', () => {
      const result = DateParser.parseDateString('2026-13-40');
      expect(result).toBeInstanceOf(Date);
      // JavaScript Date normalizes overflow: month 12 = Jan 2027, day 40 = Feb 9
      expect(result!.getFullYear()).toBe(2027);
      expect(result!.getMonth()).toBe(1);
      expect(result!.getDate()).toBe(9);
    });
  });

  describe('parseDateTimeString', () => {
    it('should parse a date and time string to a Date object', () => {
      const result = DateParser.parseDateTimeString('2026-03-05', '14:30');
      expect(result).toBeInstanceOf(Date);
      expect(result.getFullYear()).toBe(2026);
      expect(result.getMonth()).toBe(2);
      expect(result.getDate()).toBe(5);
      expect(result.getHours()).toBe(14);
      expect(result.getMinutes()).toBe(30);
    });

    it('should parse midnight time correctly', () => {
      const result = DateParser.parseDateTimeString('2026-03-05', '00:00');
      expect(result.getHours()).toBe(0);
      expect(result.getMinutes()).toBe(0);
    });

    it('should parse end of day time correctly', () => {
      const result = DateParser.parseDateTimeString('2026-03-05', '23:59');
      expect(result.getHours()).toBe(23);
      expect(result.getMinutes()).toBe(59);
    });

    it('should normalize time overflow to next day', () => {
      // 24:00 rolls over to 00:00 of next day
      const result = DateParser.parseDateTimeString('2026-03-05', '24:00');
      expect(result.getHours()).toBe(0);
      expect(result.getMinutes()).toBe(0);
      // Should be March 6
      expect(result.getDate()).toBe(6);
    });
  });

  describe('parseDate', () => {
    it('should parse DATE_WITH_DOW format: <YYYY-MM-DD DOW HH:mm>', () => {
      const result = DateParser.parseDate('<2026-03-05 Wed 14:30>');
      expect(result).not.toBeNull();
      expect(result!.getFullYear()).toBe(2026);
      expect(result!.getMonth()).toBe(2);
      expect(result!.getDate()).toBe(5);
      expect(result!.getHours()).toBe(14);
      expect(result!.getMinutes()).toBe(30);
    });

    it('should parse DATE_WITH_DOW_AFTER_TIME format: <YYYY-MM-DD HH:mm DOW>', () => {
      const result = DateParser.parseDate('<2026-03-05 14:30 Wed>');
      expect(result).not.toBeNull();
      expect(result!.getFullYear()).toBe(2026);
      expect(result!.getMonth()).toBe(2);
      expect(result!.getDate()).toBe(5);
      expect(result!.getHours()).toBe(14);
      expect(result!.getMinutes()).toBe(30);
    });

    it('should parse DATE_WITH_DOW_ONLY format: <YYYY-MM-DD DOW>', () => {
      const result = DateParser.parseDate('<2026-03-05 Wed>');
      expect(result).not.toBeNull();
      expect(result!.getFullYear()).toBe(2026);
      expect(result!.getMonth()).toBe(2);
      expect(result!.getDate()).toBe(5);
      expect(result!.getHours()).toBe(0);
      expect(result!.getMinutes()).toBe(0);
    });

    it('should parse DATE_WITH_TIME format: <YYYY-MM-DD HH:mm>', () => {
      const result = DateParser.parseDate('<2026-03-05 14:30>');
      expect(result).not.toBeNull();
      expect(result!.getFullYear()).toBe(2026);
      expect(result!.getMonth()).toBe(2);
      expect(result!.getDate()).toBe(5);
      expect(result!.getHours()).toBe(14);
      expect(result!.getMinutes()).toBe(30);
    });

    it('should parse DATE_ONLY format: <YYYY-MM-DD>', () => {
      const result = DateParser.parseDate('<2026-03-05>');
      expect(result).not.toBeNull();
      expect(result!.getFullYear()).toBe(2026);
      expect(result!.getMonth()).toBe(2);
      expect(result!.getDate()).toBe(5);
      expect(result!.getHours()).toBe(0);
      expect(result!.getMinutes()).toBe(0);
    });

    it('should return null for invalid input without angle brackets', () => {
      const result = DateParser.parseDate('2026-03-05');
      expect(result).toBeNull();
    });

    it('should return null for completely malformed input', () => {
      expect(DateParser.parseDate('<invalid>')).toBeNull();
    });

    it('should return null for empty string', () => {
      expect(DateParser.parseDate('')).toBeNull();
    });

    it('should return null for null/undefined input', () => {
      // @ts-ignore - testing edge case
      expect(DateParser.parseDate(null)).toBeNull();
      // @ts-ignore - testing edge case
      expect(DateParser.parseDate(undefined)).toBeNull();
    });

    it('should handle different day-of-week abbreviations', () => {
      const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
      days.forEach((day) => {
        const result = DateParser.parseDate(`<2026-03-05 ${day}>`);
        expect(result).not.toBeNull();
        expect(result!.getFullYear()).toBe(2026);
      });
    });

    it('should handle dates at month boundaries with day-of-week', () => {
      const result = DateParser.parseDate('<2026-01-01 Wed>');
      expect(result).not.toBeNull();
      expect(result!.getMonth()).toBe(0);
      expect(result!.getDate()).toBe(1);
    });

    it('should handle DATE_WITH_DOW_AFTER_TIME with various days', () => {
      const result = DateParser.parseDate('<2026-03-05 09:15 Mon>');
      expect(result).not.toBeNull();
      expect(result!.getHours()).toBe(9);
      expect(result!.getMinutes()).toBe(15);
    });
  });

  describe('parseDateWithRepeater', () => {
    it('should parse date and return null repeat for simple date', () => {
      const result = DateParser.parseDateWithRepeater('<2026-03-05>');
      expect(result.date).not.toBeNull();
      expect(result.repeat).toBeNull();
    });

    it('should parse date with repeater .+1d (catch-up type)', () => {
      const result = DateParser.parseDateWithRepeater('<2026-03-05 .+1d>');
      expect(result.date).not.toBeNull();
      expect(result.repeat).not.toBeNull();
      expect(result.repeat!.type).toBe('.+');
      expect(result.repeat!.value).toBe(1);
      expect(result.repeat!.unit).toBe('d');
    });

    it('should parse date with repeater ++1w (catch-up type)', () => {
      const result = DateParser.parseDateWithRepeater('<2026-03-05 ++1w>');
      expect(result.date).not.toBeNull();
      expect(result.repeat).not.toBeNull();
      expect(result.repeat!.type).toBe('++');
      expect(result.repeat!.value).toBe(1);
      expect(result.repeat!.unit).toBe('w');
    });

    it('should parse date with repeater +2y (plain type)', () => {
      const result = DateParser.parseDateWithRepeater('<2026-03-05 +2y>');
      expect(result.date).not.toBeNull();
      expect(result.repeat).not.toBeNull();
      expect(result.repeat!.type).toBe('+');
      expect(result.repeat!.value).toBe(2);
      expect(result.repeat!.unit).toBe('y');
    });

    it('should parse date with repeater .+1m (catch-up type)', () => {
      const result = DateParser.parseDateWithRepeater('<2026-03-05 .+1m>');
      expect(result.date).not.toBeNull();
      expect(result.repeat).not.toBeNull();
      expect(result.repeat!.type).toBe('.+');
      expect(result.repeat!.value).toBe(1);
      expect(result.repeat!.unit).toBe('m');
    });

    it('should parse date with time and repeater', () => {
      const result = DateParser.parseDateWithRepeater(
        '<2026-03-05 14:30 .+1d>',
      );
      expect(result.date).not.toBeNull();
      expect(result.date!.getHours()).toBe(14);
      expect(result.date!.getMinutes()).toBe(30);
      expect(result.repeat).not.toBeNull();
      expect(result.repeat!.type).toBe('.+');
    });

    it('should parse date with day-of-week and repeater', () => {
      const result = DateParser.parseDateWithRepeater('<2026-03-05 Wed .+1w>');
      expect(result.date).not.toBeNull();
      expect(result.repeat).not.toBeNull();
      expect(result.repeat!.unit).toBe('w');
      expect(result.repeat!.type).toBe('.+');
    });

    it('should parse date with time and day-of-week (DATE_WITH_DOW) and repeater', () => {
      const result = DateParser.parseDateWithRepeater(
        '<2026-03-05 Wed 14:30 .+1d>',
      );
      expect(result.date).not.toBeNull();
      expect(result.date!.getHours()).toBe(14);
      expect(result.date!.getMinutes()).toBe(30);
      expect(result.repeat).not.toBeNull();
      expect(result.repeat!.type).toBe('.+');
    });

    it('should parse date with time before day-of-week (DATE_WITH_DOW_AFTER_TIME) and repeater', () => {
      const result = DateParser.parseDateWithRepeater(
        '<2026-03-05 14:30 Wed .+1d>',
      );
      expect(result.date).not.toBeNull();
      expect(result.date!.getHours()).toBe(14);
      expect(result.date!.getMinutes()).toBe(30);
      expect(result.repeat).not.toBeNull();
      expect(result.repeat!.type).toBe('.+');
    });

    it('should handle catch-up repeaters (starting with .)', () => {
      const result = DateParser.parseDateWithRepeater('<2026-03-05 .+2d>');
      expect(result.repeat).not.toBeNull();
      expect(result.repeat!.type).toBe('.+');
      expect(result.repeat!.value).toBe(2);
    });

    it('should handle invalid repeater syntax gracefully', () => {
      // Repeater suffix +x doesn't match the repeater regex (needs numeric value + unit)
      // The +x remains in the string, preventing date pattern match
      const result = DateParser.parseDateWithRepeater('<2026-03-05 +x>');
      expect(result.date).toBeNull();
      expect(result.repeat).toBeNull();
    });

    it('should handle valid date but with no explicit repeater', () => {
      const result = DateParser.parseDateWithRepeater('<2026-03-05 Wed 14:30>');
      expect(result.date).not.toBeNull();
      expect(result.date!.getHours()).toBe(14);
      expect(result.repeat).toBeNull();
    });

    it('should require a space between the date and repeater', () => {
      // Without a space, the repeater attaches directly and isn't extracted
      const result = DateParser.parseDateWithRepeater('<2026-03-05.++1w>');
      expect(result.date).toBeNull();
      expect(result.repeat).toBeNull();
    });
  });

  describe('integration with DateUtils', () => {
    it('should create timezone-independent dates', () => {
      // All dates should be independent of system timezone
      const result = DateParser.parseDateString('2026-03-05');
      const expected = DateUtils.createDate(2026, 2, 5);
      expect(result!.getTime()).toBe(expected.getTime());
    });

    it('should parse time with timezone independence', () => {
      const result = DateParser.parseDateTimeString('2026-03-05', '14:30');
      const expected = DateUtils.createDate(2026, 2, 5, 14, 30);
      expect(result!.getTime()).toBe(expected.getTime());
    });
  });

  describe('edge cases and error handling', () => {
    it('should handle extra whitespace in repeater section', () => {
      const result = DateParser.parseDateWithRepeater('<2026-03-05 .+1d >');
      expect(result.date).not.toBeNull();
      expect(result.repeat).not.toBeNull();
    });

    it('should match patterns in correct order (DATE_WITH_DOW before DATE_WITH_DOW_ONLY)', () => {
      // DATE_WITH_DOW pattern requires time, so this should match DATE_WITH_DOW_ONLY instead
      const result = DateParser.parseDate('<2026-03-05 Wed>');
      expect(result).not.toBeNull();
      expect(result!.getHours()).toBe(0);
    });

    it('should handle single digit months and days correctly', () => {
      // The regex requires YYYY-MM--DD format with leading zeros
      const result = DateParser.parseDate('<2026-01-01>');
      expect(result).not.toBeNull();
      expect(result!.getMonth()).toBe(0);
      expect(result!.getDate()).toBe(1);
    });

    it('should handle dates at year boundaries', () => {
      const result = DateParser.parseDate('<2026-12-31>');
      expect(result).not.toBeNull();
      expect(result!.getMonth()).toBe(11);
      expect(result!.getDate()).toBe(31);
    });

    it('should properly differentiate DATE_WITH_DOW and DATE_WITH_DOW_AFTER_TIME', () => {
      const dowResult = DateParser.parseDate('<2026-03-05 Wed 14:30>');
      expect(dowResult).not.toBeNull();
      expect(dowResult!.getHours()).toBe(14);

      const afterTimeResult = DateParser.parseDate('<2026-03-05 14:30 Wed>');
      expect(afterTimeResult).not.toBeNull();
      expect(afterTimeResult!.getHours()).toBe(14);
    });

    it('should handle DATE_WITH_DOW_AFTER_TIME pattern correctly', () => {
      const result = DateParser.parseDate('<2026-03-05 09:00 Fri>');
      expect(result).not.toBeNull();
      expect(result!.getHours()).toBe(9);
      expect(result!.getMinutes()).toBe(0);
    });
  });
});
