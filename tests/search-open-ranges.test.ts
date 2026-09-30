/**
 * Unit tests for open-ended date ranges and value-side date comparison
 * operators (scheduled:2026-10-07.., ..2026-12-31, <D, <=D, >D, >=D,
 * including partial dates like 2026-10).
 *
 * Contract (the plan's equivalence tables):
 * - Ranges are inclusive of the written day; `..D` includes D.
 * - Operators keep arithmetic meaning: < and > exclude the boundary,
 *   <= and >= include it.
 * - A partial date expands to its interval; each form selects one edge.
 * - Every equivalence is structural: operators desugar to the same
 *   {start, end} the equivalent range form produces.
 * - Invalid dates fail closed (match nothing), never match everything.
 */
import { Search } from '../src/search/search';
import { SearchTokenizer } from '../src/search/search-tokenizer';
import { DateUtils } from '../src/utils/date-utils';
import { Task } from '../src/types/task';
import { createCheckboxTask } from './helpers/test-helper';

/** Local-midnight Date from YYYY-MM-DD parts (timezone-independent). */
function localDate(y: number, m: number, d: number): Date {
  return new Date(y, m - 1, d);
}

function taskScheduledOn(y: number, m: number, d: number): Task {
  return createCheckboxTask({
    path: 't.md',
    line: 1,
    rawText: '- [ ] TODO dated task',
    text: 'dated task',
    scheduledDate: localDate(y, m, d),
  });
}

function taskWithoutDate(): Task {
  return createCheckboxTask({
    path: 't.md',
    line: 1,
    rawText: '- [ ] TODO undated task',
    text: 'undated task',
  });
}

describe('Open-ended date ranges and comparison operators', () => {
  describe('DateUtils.parseDateValue: one-sided and partial ranges', () => {
    it('parses right-open full-date ranges with a far-future end', () => {
      const result = DateUtils.parseDateValue('2026-10-07..');
      expect(result).toEqual({
        start: localDate(2026, 10, 7),
        end: expect.any(Date),
      });
      const range = result as { start: Date; end: Date };
      // The sentinel end must accept any realistic task date.
      expect(range.end.getTime()).toBeGreaterThan(
        localDate(2100, 1, 1).getTime(),
      );
    });

    it('parses left-open full-date ranges with an inclusive end', () => {
      // ..2026-12-31 includes Dec 31 -> exclusive bound is Jan 1 2027
      // (the existing +1-day end rule).
      const result = DateUtils.parseDateValue('..2026-12-31');
      expect(result).toEqual({
        start: expect.any(Date),
        end: localDate(2027, 1, 1),
      });
      const range = result as { start: Date; end: Date };
      expect(range.start.getTime()).toBeLessThan(
        localDate(1900, 1, 1).getTime(),
      );
    });

    it('expands partial-date bounds to their interval edges', () => {
      // 2026-10 as a start bound: first day of the month.
      expect(DateUtils.parseDateValue('2026-10..')).toEqual({
        start: localDate(2026, 10, 1),
        end: expect.any(Date),
      });
      // 2026-10 as an end bound: through Oct 31 inclusive -> Nov 1 exclusive.
      expect(DateUtils.parseDateValue('..2026-10')).toEqual({
        start: expect.any(Date),
        end: localDate(2026, 11, 1),
      });
      // Year bounds: 2026 = Jan 1..Dec 31.
      expect(DateUtils.parseDateValue('2026..')).toEqual({
        start: localDate(2026, 1, 1),
        end: expect.any(Date),
      });
      expect(DateUtils.parseDateValue('..2026')).toEqual({
        start: expect.any(Date),
        end: localDate(2027, 1, 1),
      });
    });

    it('supports partial bounds in two-sided ranges (previously a silent no-match)', () => {
      expect(DateUtils.parseDateValue('2026-10..2026-11')).toEqual({
        start: localDate(2026, 10, 1),
        end: localDate(2026, 12, 1),
      });
      // Leap-year February: ..2024-02 includes Feb 29, 2024.
      expect(DateUtils.parseDateValue('..2024-02')).toEqual({
        start: expect.any(Date),
        end: localDate(2024, 3, 1),
      });
    });

    it('keeps the existing two-sided full-date range shape', () => {
      expect(DateUtils.parseDateValue('2024-01-01..2024-01-31')).toEqual({
        start: localDate(2024, 1, 1),
        end: localDate(2024, 2, 1),
      });
    });

    it('fails closed on invalid range bounds', () => {
      expect(DateUtils.parseDateValue('2026-13-01..')).toBeNull();
      expect(DateUtils.parseDateValue('..2026-02-30')).toBeNull();
      expect(DateUtils.parseDateValue('2026-13..')).toBeNull();
      expect(DateUtils.parseDateValue('..')).toBeNull();
    });
  });

  describe('DateUtils.parseDateValue: value-side comparison operators', () => {
    it('desugars full-date operators to the same shape as the equivalent range', () => {
      // <D == ..(D-1): exclusive end at D.
      expect(DateUtils.parseDateValue('<2026-10-01')).toEqual(
        DateUtils.parseDateValue('..2026-09-30'),
      );
      // <=D == ..D: exclusive end at D+1.
      expect(DateUtils.parseDateValue('<=2026-10-01')).toEqual(
        DateUtils.parseDateValue('..2026-10-01'),
      );
      // >D == (D+1)..: inclusive start at D+1.
      expect(DateUtils.parseDateValue('>2026-10-01')).toEqual(
        DateUtils.parseDateValue('2026-10-02..'),
      );
      // >=D == D..: inclusive start at D.
      expect(DateUtils.parseDateValue('>=2026-10-01')).toEqual(
        DateUtils.parseDateValue('2026-10-01..'),
      );
    });

    it('desugars partial-date operators via the interval edges', () => {
      // <2026-10 == ..2026-09-30 (before the month).
      expect(DateUtils.parseDateValue('<2026-10')).toEqual({
        start: expect.any(Date),
        end: localDate(2026, 10, 1),
      });
      // <=2026-10 == ..2026-10-31 (through the month).
      expect(DateUtils.parseDateValue('<=2026-10')).toEqual({
        start: expect.any(Date),
        end: localDate(2026, 11, 1),
      });
      // >2026-10 == 2026-11-01.. (after the month).
      expect(DateUtils.parseDateValue('>2026-10')).toEqual({
        start: localDate(2026, 11, 1),
        end: expect.any(Date),
      });
      // >=2026-10 == 2026-10-01.. (from the month start).
      expect(DateUtils.parseDateValue('>=2026-10')).toEqual({
        start: localDate(2026, 10, 1),
        end: expect.any(Date),
      });
      // Year operators: <2026 == ..2025-12-31, >=2026 == 2026-01-01..
      expect(DateUtils.parseDateValue('<2026')).toEqual({
        start: expect.any(Date),
        end: localDate(2026, 1, 1),
      });
      expect(DateUtils.parseDateValue('>=2026')).toEqual({
        start: localDate(2026, 1, 1),
        end: expect.any(Date),
      });
    });

    it('fails closed on invalid operator dates', () => {
      expect(DateUtils.parseDateValue('<2026-13-99')).toBeNull();
      expect(DateUtils.parseDateValue('>=2026-02-30')).toBeNull();
      expect(DateUtils.parseDateValue('<=2026-99')).toBeNull();
    });
  });

  describe('Tokenizer token sequences', () => {
    it('emits prefix, value, range for right-open ranges', () => {
      const tokens = SearchTokenizer.tokenize('scheduled:2026-10-07..');
      expect(tokens.map((t) => t.type)).toEqual([
        'prefix',
        'prefix_value',
        'range',
      ]);
      expect(tokens[1].value).toBe('2026-10-07');
    });

    it('emits prefix, range, value for left-open ranges', () => {
      const tokens = SearchTokenizer.tokenize('scheduled:..2026-12-31');
      expect(tokens.map((t) => t.type)).toEqual(['prefix', 'range', 'word']);
      expect(tokens[2].value).toBe('2026-12-31');
    });

    it('emits prefix, range, word for left-open partial bounds', () => {
      const tokens = SearchTokenizer.tokenize('scheduled:..2026-10');
      expect(tokens.map((t) => t.type)).toEqual(['prefix', 'range', 'word']);
    });

    it('keeps the dash-merge rule intact (tag:a-b)', () => {
      const tokens = SearchTokenizer.tokenize('tag:a-b');
      expect(tokens).toHaveLength(2);
      expect(tokens[0].type).toBe('prefix');
      expect(tokens[1].type).toBe('prefix_value');
      expect(tokens[1].value).toBe('a-b');
    });

    it('treats a bare word containing .. as a plain term (no prefix)', () => {
      const tokens = SearchTokenizer.tokenize('2024-01-01..2024-01-31');
      expect(tokens).toHaveLength(1);
      expect(tokens[0].type).toBe('word');
    });
  });

  describe('Parser AST construction', () => {
    it('builds a one-sided range_filter for right-open ranges', () => {
      const node = Search.parse('scheduled:2026-10-07..');
      expect(node).toMatchObject({
        type: 'range_filter',
        field: 'scheduled',
        start: '2026-10-07',
      });
      expect(node.end).toBeUndefined();
    });

    it('builds a one-sided range_filter for left-open ranges', () => {
      const node = Search.parse('scheduled:..2026-12-31');
      expect(node).toMatchObject({
        type: 'range_filter',
        field: 'scheduled',
        end: '2026-12-31',
      });
      expect(node.start).toBeUndefined();
    });

    it('keeps two-sided ranges unchanged', () => {
      const node = Search.parse('scheduled:2026-01-01..2026-01-31');
      expect(node).toMatchObject({
        type: 'range_filter',
        field: 'scheduled',
        start: '2026-01-01',
        end: '2026-01-31',
      });
    });

    it('keeps the date-prefix restriction for non-date fields', () => {
      expect(() => Search.parse('tag:2026-01-01..2026-02-01')).toThrow(
        'Range operator can only be used with scheduled:, deadline:, closed:, or started: prefixes',
      );
    });

    it('composes a right-open range with a following term by implicit AND', () => {
      const node = Search.parse('scheduled:2026-10-07.. priority:high');
      expect(node.type).toBe('and');
      expect(node.children).toHaveLength(2);
      expect(node.children![0]).toMatchObject({
        type: 'range_filter',
        start: '2026-10-07',
      });
      expect(node.children![1]).toMatchObject({
        type: 'prefix_filter',
        field: 'priority',
      });
    });

    it('accepts an open range at both sides only with a bound present', () => {
      // scheduled:..2026-12-31 extra -> range AND term
      const node = Search.parse('scheduled:..2026-12-31 priority:high');
      expect(node.type).toBe('and');
      expect(node.children![0]).toMatchObject({ type: 'range_filter' });
    });
  });

  describe('Evaluation semantics through Search.evaluate', () => {
    const jun1 = taskScheduledOn(2026, 6, 1);
    const dec1prev = taskScheduledOn(2025, 12, 1);
    const sep30 = taskScheduledOn(2026, 9, 30);
    const oct1 = taskScheduledOn(2026, 10, 1);
    const oct31 = taskScheduledOn(2026, 10, 31);
    const nov1 = taskScheduledOn(2026, 11, 1);

    it('matches right-open ranges from the start day onward', async () => {
      expect(await Search.evaluate('scheduled:2026-01-01..', jun1)).toBe(true);
      expect(await Search.evaluate('scheduled:..2026-01-31', jun1)).toBe(false);
    });

    it('matches left-open ranges through the end day inclusively', async () => {
      expect(await Search.evaluate('scheduled:..2026-01-31', dec1prev)).toBe(
        true,
      );
      expect(await Search.evaluate('scheduled:2026-01-01..', dec1prev)).toBe(
        false,
      );
    });

    it('never matches tasks without the field date', async () => {
      const undated = taskWithoutDate();
      expect(await Search.evaluate('scheduled:2026-01-01..', undated)).toBe(
        false,
      );
      expect(await Search.evaluate('scheduled:..2026-12-31', undated)).toBe(
        false,
      );
      expect(await Search.evaluate('scheduled:<2026-10-01', undated)).toBe(
        false,
      );
    });

    it('fails closed on invalid range bounds', async () => {
      expect(await Search.evaluate('scheduled:2026-13-01..', jun1)).toBe(false);
      expect(await Search.evaluate('scheduled:..2026-02-30', jun1)).toBe(false);
    });

    it('evaluates < and <= around the boundary day', async () => {
      expect(await Search.evaluate('scheduled:<2026-10-01', sep30)).toBe(true);
      expect(await Search.evaluate('scheduled:<2026-10-01', oct1)).toBe(false);
      expect(await Search.evaluate('scheduled:<=2026-10-01', oct1)).toBe(true);
      expect(await Search.evaluate('scheduled:<=2026-10-01', sep30)).toBe(true);
      expect(await Search.evaluate('scheduled:<=2026-10-01', nov1)).toBe(false);
    });

    it('evaluates > and >= around the boundary day', async () => {
      expect(await Search.evaluate('scheduled:>2026-10-01', oct1)).toBe(false);
      expect(await Search.evaluate('scheduled:>2026-10-01', nov1)).toBe(true);
      expect(await Search.evaluate('scheduled:>=2026-10-01', oct1)).toBe(true);
      expect(await Search.evaluate('scheduled:>=2026-10-01', sep30)).toBe(
        false,
      );
    });

    it('fails closed on invalid operator dates', async () => {
      expect(await Search.evaluate('scheduled:<2026-13-99', jun1)).toBe(false);
      expect(await Search.evaluate('scheduled:>=2026-02-30', jun1)).toBe(false);
    });

    it('treats partial bounds as month/year intervals', async () => {
      // 2026-10.. : from Oct 1, not Sep 30.
      expect(await Search.evaluate('scheduled:2026-10..', sep30)).toBe(false);
      expect(await Search.evaluate('scheduled:2026-10..', oct1)).toBe(true);
      expect(await Search.evaluate('scheduled:2026-10..', oct31)).toBe(true);
      // ..2026-10 : through Oct 31 inclusive.
      expect(await Search.evaluate('scheduled:..2026-10', oct31)).toBe(true);
      expect(await Search.evaluate('scheduled:..2026-10', nov1)).toBe(false);
      // Two-sided partial: Oct 1 - Nov 30 inclusive.
      expect(await Search.evaluate('scheduled:2026-10..2026-11', oct1)).toBe(
        true,
      );
      expect(
        await Search.evaluate('scheduled:2026-10..2026-11', nov30Task()),
      ).toBe(true);
      expect(await Search.evaluate('scheduled:2026-10..2026-11', sep30)).toBe(
        false,
      );
      // Year interval: 2026.. = from Jan 1 2026 onward (2027 matches too).
      expect(await Search.evaluate('scheduled:2026..', oct1)).toBe(true);
      expect(
        await Search.evaluate('scheduled:2026..', taskScheduledOn(2027, 2, 1)),
      ).toBe(true);
      expect(
        await Search.evaluate('scheduled:2026..', taskScheduledOn(2025, 6, 1)),
      ).toBe(false);
      // ..2026 = through Dec 31 2026 inclusive; 2027 does not match.
      expect(
        await Search.evaluate('scheduled:..2026', taskScheduledOn(2027, 2, 1)),
      ).toBe(false);
      expect(await Search.evaluate('scheduled:..2026', oct1)).toBe(true);
    });

    it('evaluates partial-date operators by interval edge', async () => {
      // <2026-10 : before October.
      expect(await Search.evaluate('scheduled:<2026-10', sep30)).toBe(true);
      expect(await Search.evaluate('scheduled:<2026-10', oct1)).toBe(false);
      // <=2026-10 : through October.
      expect(await Search.evaluate('scheduled:<=2026-10', oct31)).toBe(true);
      expect(await Search.evaluate('scheduled:<=2026-10', nov1)).toBe(false);
      // >2026-10 : after October.
      expect(await Search.evaluate('scheduled:>2026-10', oct31)).toBe(false);
      expect(await Search.evaluate('scheduled:>2026-10', nov1)).toBe(true);
      // >=2026-10 : from October.
      expect(await Search.evaluate('scheduled:>=2026-10', oct1)).toBe(true);
      expect(await Search.evaluate('scheduled:>=2026-10', sep30)).toBe(false);
    });

    it('pins operator/range equivalence for the same task sets', async () => {
      const samples = [sep30, oct1, oct31, nov1, dec1prev, jun1];
      for (const task of samples) {
        expect(await Search.evaluate('scheduled:<2026-10-01', task)).toBe(
          await Search.evaluate('scheduled:..2026-09-30', task),
        );
        expect(await Search.evaluate('scheduled:<=2026-10-01', task)).toBe(
          await Search.evaluate('scheduled:..2026-10-01', task),
        );
        expect(await Search.evaluate('scheduled:>2026-10-01', task)).toBe(
          await Search.evaluate('scheduled:2026-10-02..', task),
        );
        expect(await Search.evaluate('scheduled:>=2026-10-01', task)).toBe(
          await Search.evaluate('scheduled:2026-10-01..', task),
        );
      }
    });

    it('pins partial-date operator/range equivalence', async () => {
      const samples = [sep30, oct1, oct31, nov1];
      for (const task of samples) {
        expect(await Search.evaluate('scheduled:<2026-10', task)).toBe(
          await Search.evaluate('scheduled:..2026-09-30', task),
        );
        expect(await Search.evaluate('scheduled:<=2026-10', task)).toBe(
          await Search.evaluate('scheduled:..2026-10-31', task),
        );
        expect(await Search.evaluate('scheduled:>2026-10', task)).toBe(
          await Search.evaluate('scheduled:2026-11-01..', task),
        );
        expect(await Search.evaluate('scheduled:>=2026-10', task)).toBe(
          await Search.evaluate('scheduled:2026-10-01..', task),
        );
      }
    });

    it('composes negation over operator values', async () => {
      expect(await Search.evaluate('-scheduled:<2026-10-01', oct1)).toBe(true);
      expect(await Search.evaluate('-scheduled:<2026-10-01', sep30)).toBe(
        false,
      );
      // Undated tasks: the negated filter does not match them (the inner
      // filter is false, NOT true), so -filter is true... verify the
      // actual contract: -filter matches when filter is false.
      expect(await Search.evaluate('-scheduled:<2026-10-01', oct31)).toBe(true);
    });

    it('works for the other date prefixes too', async () => {
      const closedTask = createCheckboxTask({
        path: 't.md',
        line: 1,
        rawText: '- [x] DONE closed task',
        text: 'closed task',
        closedDate: localDate(2026, 10, 15),
      });
      expect(await Search.evaluate('closed:>2026-10-01', closedTask)).toBe(
        true,
      );
      expect(await Search.evaluate('closed:<2026-10-01', closedTask)).toBe(
        false,
      );
      expect(await Search.evaluate('closed:2026-10..', closedTask)).toBe(true);
    });
  });

  describe('Suggestions', () => {
    it('offers the trailing .. completion for task-derived dates', () => {
      const { SearchSuggestions } = jest.requireActual<
        typeof import('../src/search/search-suggestions')
      >('../src/search/search-suggestions');
      const dates = SearchSuggestions.getScheduledDateSuggestions([
        taskScheduledOn(2026, 10, 7),
      ]);
      expect(dates).toContain('2026-10-07');
      expect(dates).toContain('2026-10-07..');
    });
  });
});

/** Local helper: Nov 30 2026 task (used for the two-sided partial test). */
function nov30Task(): Task {
  return taskScheduledOn(2026, 11, 30);
}
