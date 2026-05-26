import { NaturalDateParser } from '../src/parser/natural-date-parser';

describe('NaturalDateParser', () => {
  const referenceDate = new Date(2026, 4, 18, 12, 0, 0);

  describe('One-time date parsing', () => {
    it('should parse "today"', () => {
      const result = NaturalDateParser.parse('TODO task today', referenceDate);
      expect(result).not.toBeNull();
      expect(result?.date?.getFullYear()).toBe(2026);
      expect(result?.date?.getMonth()).toBe(4);
      expect(result?.date?.getDate()).toBe(18);
      expect(result?.isRecurring).toBe(false);
      expect(result?.hasTime).toBe(false);
    });

    it('should parse "tomorrow"', () => {
      const result = NaturalDateParser.parse(
        'TODO task tomorrow',
        referenceDate,
      );
      expect(result).not.toBeNull();
      expect(result?.date?.getFullYear()).toBe(2026);
      expect(result?.date?.getMonth()).toBe(4);
      expect(result?.date?.getDate()).toBe(19);
      expect(result?.isRecurring).toBe(false);
      expect(result?.hasTime).toBe(false);
    });

    it('should parse "yesterday"', () => {
      const result = NaturalDateParser.parse(
        'TODO task yesterday',
        referenceDate,
      );
      expect(result).not.toBeNull();
      expect(result?.date?.getFullYear()).toBe(2026);
      expect(result?.date?.getMonth()).toBe(4);
      expect(result?.date?.getDate()).toBe(17);
      expect(result?.isRecurring).toBe(false);
    });

    it('should parse "in 5 days"', () => {
      const result = NaturalDateParser.parse(
        'TODO task in 5 days',
        referenceDate,
      );
      expect(result).not.toBeNull();
      expect(result?.date?.getDate()).toBe(23);
      expect(result?.isRecurring).toBe(false);
      expect(result?.hasTime).toBe(false);
    });

    it('should parse "in 2 weeks"', () => {
      const result = NaturalDateParser.parse(
        'TODO task in 2 weeks',
        referenceDate,
      );
      expect(result).not.toBeNull();
      expect(result?.date?.getDate()).toBe(1);
      expect(result?.date?.getMonth()).toBe(5);
      expect(result?.isRecurring).toBe(false);
    });

    it('should parse "in 3 months"', () => {
      const result = NaturalDateParser.parse(
        'TODO task in 3 months',
        referenceDate,
      );
      expect(result).not.toBeNull();
      expect(result?.date?.getMonth()).toBe(7);
      expect(result?.isRecurring).toBe(false);
    });

    it('should parse "in 2 hours"', () => {
      const result = NaturalDateParser.parse(
        'TODO task in 2 hours',
        referenceDate,
      );
      expect(result).not.toBeNull();
      expect(result?.date?.getHours()).toBe(14);
      expect(result?.isRecurring).toBe(false);
    });

    it('should parse "day before yesterday"', () => {
      const result = NaturalDateParser.parse(
        'TODO task day before yesterday',
        referenceDate,
      );
      expect(result).not.toBeNull();
      expect(result?.date?.getDate()).toBe(16);
      expect(result?.isRecurring).toBe(false);
    });

    it('should parse "next week"', () => {
      const result = NaturalDateParser.parse(
        'TODO task next week',
        referenceDate,
      );
      expect(result).not.toBeNull();
      expect(result?.date?.getDate()).toBe(25);
      expect(result?.isRecurring).toBe(false);
    });

    it('should parse "last week"', () => {
      const result = NaturalDateParser.parse(
        'TODO task last week',
        referenceDate,
      );
      expect(result).not.toBeNull();
      expect(result?.date?.getFullYear()).toBe(2026);
      expect(result?.date?.getMonth()).toBe(4);
      expect(result?.date?.getDate()).toBe(11);
      expect(result?.isRecurring).toBe(false);
    });

    it('should parse "next month"', () => {
      const result = NaturalDateParser.parse(
        'TODO task next month',
        referenceDate,
      );
      expect(result).not.toBeNull();
      expect(result?.date?.getMonth()).toBe(5);
      expect(result?.isRecurring).toBe(false);
    });

    it('should parse "last month"', () => {
      const result = NaturalDateParser.parse(
        'TODO task last month',
        referenceDate,
      );
      expect(result).not.toBeNull();
      expect(result?.date?.getFullYear()).toBe(2026);
      expect(result?.date?.getMonth()).toBe(3);
      expect(result?.isRecurring).toBe(false);
    });

    it('should parse "next year"', () => {
      const result = NaturalDateParser.parse(
        'TODO task next year',
        referenceDate,
      );
      expect(result).not.toBeNull();
      expect(result?.date?.getFullYear()).toBe(2027);
      expect(result?.isRecurring).toBe(false);
    });

    it('should parse "last year"', () => {
      const result = NaturalDateParser.parse(
        'TODO task last year',
        referenceDate,
      );
      expect(result).not.toBeNull();
      expect(result?.date?.getFullYear()).toBe(2025);
      expect(result?.isRecurring).toBe(false);
    });

    it('should parse "Monday" (next Monday — Mon is day 0 in JS, expect Mon May 25 2026)', () => {
      const sunday = new Date(2026, 4, 17, 12, 0, 0);
      const result = NaturalDateParser.parse('TODO task Monday', sunday);
      expect(result).not.toBeNull();
      expect(result?.date?.getDay()).toBe(1);
      expect(result?.date?.getDate()).toBe(18);
      expect(result?.isRecurring).toBe(false);
    });

    it('should parse "Friday" (next Friday)', () => {
      const result = NaturalDateParser.parse('TODO task Friday', referenceDate);
      expect(result).not.toBeNull();
      expect(result?.date?.getDay()).toBe(5);
      expect(result?.isRecurring).toBe(false);
    });

    it('should parse "Friday next week" as next Friday (oxt style)', () => {
      const result = NaturalDateParser.parse(
        'TODO task Friday next week',
        referenceDate,
      );
      expect(result).not.toBeNull();
      expect(result?.date?.getDay()).toBe(5);
      expect(result?.isRecurring).toBe(false);
    });

    it('should parse "on Monday"', () => {
      const result = NaturalDateParser.parse(
        'TODO Call John on Monday',
        referenceDate,
      );
      expect(result).not.toBeNull();
      expect(result?.date?.getDay()).toBe(1);
      expect(result?.isRecurring).toBe(false);
      expect(result?.matchedText).toBe('Monday');
    });

    it('should parse "on Friday"', () => {
      const result = NaturalDateParser.parse(
        'TODO Review PR on Friday',
        referenceDate,
      );
      expect(result).not.toBeNull();
      expect(result?.date?.getDay()).toBe(5);
      expect(result?.isRecurring).toBe(false);
      expect(result?.matchedText).toBe('Friday');
    });

    it('should parse "this Friday" (sherlockjs handles "this")', () => {
      const result = NaturalDateParser.parse(
        'TODO Review this Friday',
        referenceDate,
      );
      expect(result).not.toBeNull();
      expect(result?.date?.getDay()).toBe(5);
      expect(result?.isRecurring).toBe(false);
      expect(result?.matchedText).toBe('Friday');
    });

    it('should parse "next Monday" (sherlockjs handles "next")', () => {
      const result = NaturalDateParser.parse(
        'TODO Meeting next Monday',
        referenceDate,
      );
      expect(result).not.toBeNull();
      expect(result?.date?.getDay()).toBe(1);
      expect(result?.isRecurring).toBe(false);
      expect(result?.matchedText).toBe('Monday');
    });

    it('should parse "at 8:00am" as standalone time', () => {
      const result = NaturalDateParser.parse(
        'TODO Standup at 8:00am',
        referenceDate,
      );
      expect(result).not.toBeNull();
      expect(result?.hasTime).toBe(true);
      expect(result?.date?.getHours()).toBe(8);
      expect(result?.date?.getMinutes()).toBe(0);
      expect(result?.matchedText).toBe('8:00am');
    });

    it('should parse "at 5:30pm" as standalone time', () => {
      const result = NaturalDateParser.parse(
        'TODO Review at 5:30pm',
        referenceDate,
      );
      expect(result).not.toBeNull();
      expect(result?.hasTime).toBe(true);
      expect(result?.date?.getHours()).toBe(17);
      expect(result?.date?.getMinutes()).toBe(30);
      expect(result?.matchedText).toBe('5:30pm');
    });

    it('should parse "at 16:00" as standalone 24h time', () => {
      const result = NaturalDateParser.parse(
        'TODO task at 16:00',
        referenceDate,
      );
      expect(result).not.toBeNull();
      expect(result?.hasTime).toBe(true);
      expect(result?.date?.getHours()).toBe(16);
      expect(result?.matchedText).toBe('16:00');
    });

    it('should parse "9am" as standalone am/pm time', () => {
      const result = NaturalDateParser.parse('TODO task 9am', referenceDate);
      expect(result).not.toBeNull();
      expect(result?.hasTime).toBe(true);
      expect(result?.date?.getHours()).toBe(9);
    });

    it('should parse "5pm" as standalone am/pm time', () => {
      const result = NaturalDateParser.parse('TODO task 5pm', referenceDate);
      expect(result).not.toBeNull();
      expect(result?.hasTime).toBe(true);
      expect(result?.date?.getHours()).toBe(17);
    });

    it('should parse standalone 24h time "20:00"', () => {
      const result = NaturalDateParser.parse('TODO task 20:00', referenceDate);
      expect(result).not.toBeNull();
      expect(result?.isRecurring).toBe(false);
      expect(result?.hasTime).toBe(true);
      expect(result?.date?.getHours()).toBe(20);
      expect(result?.date?.getMinutes()).toBe(0);
    });

    it('should parse tomorrow at 16:00 — date + time', () => {
      const result = NaturalDateParser.parse(
        'TODO Conference call tomorrow at 16:00',
        referenceDate,
      );
      expect(result).not.toBeNull();
      expect(result?.hasTime).toBe(true);
      expect(result?.date?.getDate()).toBe(19);
    });

    it('should parse "on Friday at 2:00pm" — weekday + time', () => {
      const result = NaturalDateParser.parse(
        'TODO Team meeting on Friday at 2:00pm',
        referenceDate,
      );
      expect(result).not.toBeNull();
      expect(result?.hasTime).toBe(true);
      expect(result?.date?.getDay()).toBe(5);
      expect(result?.date?.getHours()).toBe(14);
      expect(result?.matchedText).toBe('on Friday');
    });

    it('should parse "on Thursday at 8:30am" — weekday + am/pm time', () => {
      const result = NaturalDateParser.parse(
        'TODO Standup on Thursday at 8:30am',
        referenceDate,
      );
      expect(result).not.toBeNull();
      expect(result?.hasTime).toBe(true);
      expect(result?.date?.getDay()).toBe(4);
      expect(result?.date?.getHours()).toBe(8);
      expect(result?.date?.getMinutes()).toBe(30);
      expect(result?.matchedText).toBe('on Thursday');
    });

    it('should parse YYYY-MM-DD format', () => {
      const result = NaturalDateParser.parse(
        'TODO task 2026-08-11',
        referenceDate,
      );
      expect(result).not.toBeNull();
      expect(result?.date?.getFullYear()).toBe(2026);
      expect(result?.date?.getMonth()).toBe(7);
      expect(result?.date?.getDate()).toBe(11);
    });

    it('should parse "January 27" (named month)', () => {
      const result = NaturalDateParser.parse(
        'TODO task January 27',
        referenceDate,
      );
      expect(result).not.toBeNull();
      expect(result?.date?.getFullYear()).toBe(2027);
      expect(result?.date?.getMonth()).toBe(0);
      expect(result?.date?.getDate()).toBe(27);
    });

    it('should parse "27 January" (day-month named)', () => {
      const result = NaturalDateParser.parse(
        'TODO task 27 January',
        referenceDate,
      );
      expect(result).not.toBeNull();
      expect(result?.date?.getFullYear()).toBe(2027);
      expect(result?.date?.getMonth()).toBe(0);
      expect(result?.date?.getDate()).toBe(27);
    });
  });

  describe('Recurring date parsing — recurrence overlay', () => {
    it('should parse "every day"', () => {
      const result = NaturalDateParser.parse(
        'TODO task every day',
        referenceDate,
      );
      expect(result).not.toBeNull();
      expect(result?.isRecurring).toBe(true);
      expect(result?.repeat?.unit).toBe('d');
      expect(result?.repeat?.value).toBe(1);
    });

    it('should parse "daily"', () => {
      const result = NaturalDateParser.parse('TODO task daily', referenceDate);
      expect(result).not.toBeNull();
      expect(result?.isRecurring).toBe(true);
      expect(result?.repeat?.unit).toBe('d');
      expect(result?.repeat?.value).toBe(1);
    });

    it('should parse "every week"', () => {
      const result = NaturalDateParser.parse(
        'TODO task every week',
        referenceDate,
      );
      expect(result).not.toBeNull();
      expect(result?.isRecurring).toBe(true);
      expect(result?.repeat?.unit).toBe('w');
      expect(result?.repeat?.value).toBe(1);
    });

    it('should parse "weekly"', () => {
      const result = NaturalDateParser.parse('TODO task weekly', referenceDate);
      expect(result).not.toBeNull();
      expect(result?.isRecurring).toBe(true);
      expect(result?.repeat?.unit).toBe('w');
    });

    it('should parse "every month"', () => {
      const result = NaturalDateParser.parse(
        'TODO task every month',
        referenceDate,
      );
      expect(result).not.toBeNull();
      expect(result?.isRecurring).toBe(true);
      expect(result?.repeat?.unit).toBe('m');
    });

    it('should parse "monthly"', () => {
      const result = NaturalDateParser.parse(
        'TODO task monthly',
        referenceDate,
      );
      expect(result).not.toBeNull();
      expect(result?.isRecurring).toBe(true);
      expect(result?.repeat?.unit).toBe('m');
    });

    it('should parse "every year"', () => {
      const result = NaturalDateParser.parse(
        'TODO task every year',
        referenceDate,
      );
      expect(result).not.toBeNull();
      expect(result?.isRecurring).toBe(true);
      expect(result?.repeat?.unit).toBe('y');
    });

    it('should parse "yearly"', () => {
      const result = NaturalDateParser.parse('TODO task yearly', referenceDate);
      expect(result).not.toBeNull();
      expect(result?.isRecurring).toBe(true);
      expect(result?.repeat?.unit).toBe('y');
    });

    it('should parse "every Friday" and compute correct weekday', () => {
      const result = NaturalDateParser.parse(
        'TODO task every Friday',
        referenceDate,
      );
      expect(result).not.toBeNull();
      expect(result?.isRecurring).toBe(true);
      expect(result?.repeat?.unit).toBe('w');
      expect(result?.date?.getDay()).toBe(5);
    });

    it('should parse "every Saturday" and compute correct weekday', () => {
      const result = NaturalDateParser.parse(
        'TODO task every Saturday',
        referenceDate,
      );
      expect(result).not.toBeNull();
      expect(result?.isRecurring).toBe(true);
      expect(result?.repeat?.unit).toBe('w');
      expect(result?.date?.getDay()).toBe(6);
    });

    it('should parse "daily 20:00" with a time from Sherlock', () => {
      const result = NaturalDateParser.parse(
        'TODO task daily 20:00',
        referenceDate,
      );
      expect(result).not.toBeNull();
      expect(result?.isRecurring).toBe(true);
      expect(result?.hasTime).toBe(true);
      expect(result?.date?.getHours()).toBe(20);
    });

    it('should parse "daily 20:00" even when a similar word appears earlier in the line', () => {
      // "TODO Daily meeting daily 20:00" → tryRecurrence (Pass 1) scans the
      // full text and matches the trailing recurrence word ("daily" at end of
      // line) before Sherlock is ever called.  The earlier "Daily" token does
      // not interfere because the suffix-check is at end-of-string.
      const result = NaturalDateParser.parse(
        'TODO Daily meeting daily 20:00',
        referenceDate,
      );
      expect(result).not.toBeNull();
      expect(result?.isRecurring).toBe(true);
      expect(result?.hasTime).toBe(true);
      expect(result?.date?.getHours()).toBe(20);
      expect(result?.repeat?.raw).toBe('+1d');
    });

    it('should parse "daily" as recurrence inside eventTitle via Sherlock path (while-loop advance)', () => {
      // Full text "TODO monthly report daily": tryRecurrence fails because
      // "monthly" is mid-string, not at end.  Sherlock returns
      // eventTitle="monthly report daily" → eventTitleIsRecurrence must
      // advance past the first false match ("monthly" at [5,12)) to find the
      // final true match ("daily" at [17,22)).
      const result = NaturalDateParser.parse(
        'TODO monthly report daily',
        referenceDate,
      );
      expect(result).not.toBeNull();
      expect(result?.isRecurring).toBe(true);
      expect(result?.repeat?.raw).toBe('+1d');
    });

    it('should parse "daily" hasTime=false', () => {
      const result = NaturalDateParser.parse('TODO task daily', referenceDate);
      expect(result).not.toBeNull();
      expect(result?.isRecurring).toBe(true);
      expect(result?.hasTime).toBe(false);
    });

    it('should generate correct repeat raw string for daily', () => {
      const result = NaturalDateParser.parse('TODO task daily', referenceDate);
      expect(result).not.toBeNull();
      expect(result?.repeat?.raw).toBe('+1d');
    });

    it('should generate correct repeat type for every week', () => {
      const result = NaturalDateParser.parse(
        'TODO task every week',
        referenceDate,
      );
      expect(result).not.toBeNull();
      expect(result?.repeat?.type).toBe('+');
      expect(result?.repeat?.raw).toBe('+1w');
    });
  });

  describe('Text removal', () => {
    it('should remove "today" from text', () => {
      const result = NaturalDateParser.removeDateFromText('TODO task today');
      expect(result).toBe('TODO task');
    });

    it('should remove "every Friday" from text', () => {
      const result = NaturalDateParser.removeDateFromText(
        'TODO task every Friday',
      );
      expect(result).toBe('TODO task');
    });

    it('should remove "tomorrow" from text', () => {
      const result = NaturalDateParser.removeDateFromText(
        'TODO Call John tomorrow',
      );
      expect(result).toBe('TODO Call John');
    });

    it('should remove "on Monday" from text, preserving "TODOtask" boundary', () => {
      const result = NaturalDateParser.removeDateFromText('TODOtask on Monday');
      expect(result).toBe('TODOtask');
    });

    it('should remove "on Monday" from text', () => {
      const result = NaturalDateParser.removeDateFromText(
        'TODO Call John on Monday',
      );
      expect(result).toBe('TODO Call John');
    });

    it('should remove "at 8:00am" from text', () => {
      const result = NaturalDateParser.removeDateFromText(
        'TODO Standup at 8:00am',
      );
      expect(result).toBe('TODO Standup');
    });

    it('should remove "on Friday at 2:00pm" from text', () => {
      const result = NaturalDateParser.removeDateFromText(
        'TODO Team meeting on Friday at 2:00pm',
      );
      expect(result).toBe('TODO Team meeting');
    });

    it('should not modify text without dates', () => {
      const result = NaturalDateParser.removeDateFromText('TODO task');
      expect(result).toBe('TODO task');
    });

    it('should strip "due" connector before the date text', () => {
      const result = NaturalDateParser.removeDateFromText(
        'TODO project due tomorrow',
      );
      expect(result).toBe('TODO project');
    });

    it('should strip "deadline" connector before the date text', () => {
      const result = NaturalDateParser.removeDateFromText(
        'TODO project deadline Friday',
      );
      expect(result).toBe('TODO project');
    });

    it('should strip "this" connector before the date text', () => {
      const result = NaturalDateParser.removeDateFromText(
        'TODO project this Friday',
      );
      expect(result).toBe('TODO project');
    });

    it('should strip "next" connector before the date text', () => {
      const result = NaturalDateParser.removeDateFromText(
        'TODO project next Monday',
      );
      expect(result).toBe('TODO project');
    });
  });

  describe('Detection', () => {
    it('should detect date at end of text', () => {
      expect(NaturalDateParser.hasDateAtEnd('TODO task today')).toBe(true);
    });

    it('should not detect date in middle of text', () => {
      expect(NaturalDateParser.hasDateAtEnd('TODO monthly report')).toBe(false);
    });

    it('should detect recurring date at end', () => {
      expect(NaturalDateParser.hasDateAtEnd('TODO task every day')).toBe(true);
    });

    it('should detect "on Monday" at end of text', () => {
      expect(NaturalDateParser.hasDateAtEnd('TODO task on Monday')).toBe(true);
    });

    it('should detect "on Friday" at end of text', () => {
      expect(NaturalDateParser.hasDateAtEnd('TODO Review on Friday')).toBe(
        true,
      );
    });

    it('should detect "at 8:00am" at end of text', () => {
      expect(NaturalDateParser.hasDateAtEnd('TODO Standup at 8:00am')).toBe(
        true,
      );
    });

    it('should detect "at 5:30pm" at end of text', () => {
      expect(NaturalDateParser.hasDateAtEnd('TODO Review at 5:30pm')).toBe(
        true,
      );
    });

    it('should detect "on Friday at 2:00pm" compound at end of text', () => {
      expect(
        NaturalDateParser.hasDateAtEnd('TODO Meeting on Friday at 2:00pm'),
      ).toBe(true);
    });
  });

  describe('Edge cases', () => {
    it('should return null for empty string', () => {
      const result = NaturalDateParser.parse('', referenceDate);
      expect(result).toBeNull();
    });

    it('should return null for whitespace only', () => {
      const result = NaturalDateParser.parse('   ', referenceDate);
      expect(result).toBeNull();
    });

    it('should handle mixed case', () => {
      const result1 = NaturalDateParser.parse('TODO task TODAY', referenceDate);
      const result2 = NaturalDateParser.parse('TODO task Today', referenceDate);
      expect(result1).not.toBeNull();
      expect(result2).not.toBeNull();
    });

    it('should parse "weekly meeting today" (parses "today" at end)', () => {
      const result = NaturalDateParser.parse(
        'TODO weekly meeting today',
        referenceDate,
      );
      expect(result).not.toBeNull();
      expect(result?.matchedText).toBe('today');
    });

    it('should not parse "monthly" as recurring in "monthly report"', () => {
      const result = NaturalDateParser.parse(
        'TODO monthly report',
        referenceDate,
      );
      expect(result).toBeNull();
    });

    it('should not parse "monthly" as recurring in "monthly report task"', () => {
      const result = NaturalDateParser.parse(
        'TODO monthly report task',
        referenceDate,
      );
      expect(result).toBeNull();
    });

    it('should reject a date followed by trailing non-date content', () => {
      const result = NaturalDateParser.parse(
        'TODO test 1 on Wednesday invalid',
        referenceDate,
      );
      expect(result).toBeNull();
    });

    it('should reject "tomorrow" followed by trailing content', () => {
      const result = NaturalDateParser.parse(
        'TODO Call John tomorrow invalid',
        referenceDate,
      );
      expect(result).toBeNull();
    });

    it('should reject "today" followed by trailing content', () => {
      const result = NaturalDateParser.parse(
        'TODO task today invalid',
        referenceDate,
      );
      expect(result).toBeNull();
    });

    it('should parse "due tomorrow" with connector prefix', () => {
      const result = NaturalDateParser.parse(
        'TODO test 8 due tomorrow',
        referenceDate,
      );
      expect(result).not.toBeNull();
      expect(result?.date?.getDate()).toBe(19);
      expect(result?.matchedText).toBe('tomorrow');
    });

    it('should reject weekday+time followed by trailing content', () => {
      const result = NaturalDateParser.parse(
        'TODO test 1 on Wednesday at 4:00pm invalid',
        referenceDate,
      );
      expect(result).toBeNull();
    });

    it('should still parse a date at the very end of the line', () => {
      const result = NaturalDateParser.parse(
        'TODO test 1 on Wednesday',
        referenceDate,
      );
      expect(result).not.toBeNull();
      expect(result?.date?.getDay()).toBe(3);
    });

    it('should parse "due tomorrow" as one-time (connector stripped by caller)', () => {
      const result = NaturalDateParser.parse(
        'TODO project due tomorrow',
        referenceDate,
      );
      expect(result).not.toBeNull();
      expect(result?.matchedText).toBe('tomorrow');
      // rawExpression should include "due" since it immediately precedes the date
      expect(result?.rawExpression).toBe('due tomorrow');
    });

    it('should include "scheduled" connector in rawExpression for "scheduled Friday"', () => {
      const result = NaturalDateParser.parse(
        'TODO test scheduled Friday',
        referenceDate,
      );
      expect(result).not.toBeNull();
      expect(result?.matchedText).toBe('Friday');
      // rawExpression includes the "scheduled" connector so the highlight
      // plugin finds "scheduled Friday" rather than just "Friday"
      expect(result?.rawExpression).toBe('scheduled Friday');
    });

    it('should include "deadline" connector in rawExpression for "deadline Friday"', () => {
      const result = NaturalDateParser.parse(
        'TODO project deadline Friday',
        referenceDate,
      );
      expect(result).not.toBeNull();
      expect(result?.matchedText).toBe('Friday');
      expect(result?.rawExpression).toBe('deadline Friday');
    });

    it('should not double-include connector when rawExpression already has it', () => {
      // For "on Friday", Block 1 handles the connector "on" by prepending it to
      // rawExpression (not matchedText — matchedText stays as "Friday" so that
      // removeDateFromText strips only the date word, leaving the connector in
      // the event title for the trailing-connector strip to handle).
      const result = NaturalDateParser.parse(
        'TODO Call John on Friday',
        referenceDate,
      );
      expect(result).not.toBeNull();
      expect(result?.rawExpression).toBe('on Friday');
      expect(result?.matchedText).toBe('Friday');
    });

    it('should not detect "this weekend" as a date (not in sherlockjs supported patterns)', () => {
      const result = NaturalDateParser.hasDateAtEnd('TODO task this weekend');
      // Sherlockjs does not parse "this weekend" as a date; it is not a
      // recognized pattern in the sherlockjs relative date set.
      expect(result).toBe(false);
    });
  });
});
