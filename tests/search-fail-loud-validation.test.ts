/**
 * Fail-loud validation audit (follow-up to the open-range work): the parser
 * must reject values the evaluator can never match, so silent no-match
 * queries surface as errors in the embedded task list / dashboard / Task List
 * error paths instead of an unexplained "0 tasks".
 *
 * Two ground rules:
 * - Open-domain values (path, file, tag, content, state keywords, property
 *   keys/values, quoted phrase, term) legitimately match nothing and must
 *   stay accepted.
 * - Closed-domain values are validated at parse time: priority (high |
 *   medium | low | none + a/b/c aliases — quoted or not), and the exact-date
 *   forms whose createDate silently rolled over calendar-invalid dates
 *   (2026-02-30 used to MATCH tasks on March 2).
 *
 * Also pins the embedded task list's error path: TodoseqCodeBlockParser must
 * surface search validation failures (Search.validate returns false; it does
 * not throw, so the previous try/catch was dead code and invalid queries
 * rendered as an unexplained "0 tasks").
 */
import { Search } from '../src/search/search';
import { SearchParser } from '../src/search/search-parser';
import { DateUtils } from '../src/utils/date-utils';
import { Task } from '../src/types/task';
import { TodoseqCodeBlockParser } from '../src/view/embedded-task-list/code-block-parser';
import { createBaseTask } from './helpers/test-helper';

function localDate(y: number, m: number, d: number): Date {
  return new Date(y, m - 1, d);
}

describe('Fail-loud validation for closed-domain values', () => {
  describe('priority: values', () => {
    const high = createBaseTask({ priority: 'high' });
    const untagged = createBaseTask({ priority: null });

    const evalAll = async (query: string, tasks: Task[]): Promise<Task[]> => {
      const node = Search.parse(query);
      const results = await Promise.all(
        tasks.map(async (t) => await Search.evaluate(query, t, false)),
      );
      return tasks.filter((_, i) => results[i]);
    };

    it.each(['urgent', 'p1', '2', 'crit', 'hh', 'hi', 'mid'])(
      'rejects priority:%s at parse time (evaluator can never match it)',
      (value) => {
        expect(() => Search.parse(`priority:${value}`)).toThrow(
          /Unknown priority value/i,
        );
      },
    );

    it.each([
      'high',
      'medium',
      'med',
      'low',
      'none',
      'a',
      'b',
      'c',
      'HIGH',
      'Medium',
    ])('accepts priority:%s', (value) => {
      expect(() => Search.parse(`priority:${value}`)).not.toThrow();
    });

    it('empty value is a syntax error (no silent no-match either way)', () => {
      expect(() => Search.parse('priority:')).toThrow(/Expected value/);
    });

    it('negated invalid priority also fails loudly (previously matched everything)', async () => {
      await expect(
        (async () => {
          const node = Search.parse('-priority:urgent');
          return node;
        })(),
      ).rejects.toThrow(/Unknown priority value/i);
      // Sanity: the evaluator would have matched every task with the old
      // accept-anything behavior, inverting the intended exclusion.
      expect(await evalAll('-(priority:high)', [untagged])).toEqual([untagged]);
      expect(await evalAll('priority:high', [high, untagged])).toEqual([high]);
    });
  });

  describe('date-shaped but invalid values fail loud', () => {
    it.each([
      'scheduled:2026-02-30',
      'scheduled:2026-13-01',
      'deadline:2026-00-10',
      'closed:2026-13',
      'started:2026-04-31',
      'scheduled:<2026-02-30',
      'deadline:>=2026-13',
    ])('%s is rejected at parse time', (query) => {
      expect(() => Search.parse(query)).toThrow(/Invalid date value/i);
    });

    it.each([
      'scheduled:2026-02-28',
      'scheduled:2024-02-29',
      'scheduled:2026-12',
      'closed:2026',
      'scheduled:<2026-02-28',
      'scheduled:>=2026-12',
    ])('%s is accepted (valid date or partial)', (query) => {
      expect(() => Search.parse(query)).not.toThrow();
    });

    it('open-domain date words stay accepted (legitimately match nothing)', () => {
      expect(() => Search.parse('scheduled:someday')).not.toThrow();
      expect(() => Search.parse('scheduled:2026')).not.toThrow();
    });

    it('invalid range bounds are rejected', () => {
      expect(() => Search.parse('scheduled:2026-02-28..2026-02-30')).toThrow(
        /Invalid date value/i,
      );
      expect(() => Search.parse('scheduled:2026-13-01..2026-12-31')).toThrow(
        /Invalid date value/i,
      );
      expect(() =>
        Search.parse('scheduled:2026-01-01..2026-12-31'),
      ).not.toThrow();
    });

    it('left-open range bounds are validated', () => {
      expect(() => Search.parse('scheduled:..2026-02-30')).toThrow(
        /Invalid date value/i,
      );
      expect(() => Search.parse('scheduled:..2026-12-31')).not.toThrow();
    });

    it('right-open range start bounds are validated', () => {
      expect(() => Search.parse('scheduled:2026-02-30..')).toThrow(
        /Invalid date value/i,
      );
      expect(() => Search.parse('scheduled:2026-02-28..')).not.toThrow();
    });

    it('negated invalid date also fails loudly (previously matched everything)', () => {
      expect(() => Search.parse('-scheduled:2026-02-30')).toThrow(
        /Invalid date value/i,
      );
    });

    it('valid dates evaluate as before', async () => {
      const feb28 = createBaseTask({ scheduledDate: localDate(2026, 2, 28) });
      await expect(
        Search.evaluate('scheduled:2026-02-28', feb28, false),
      ).resolves.toBe(true);
    });

    it('validate() and getError() surface invalid date values', () => {
      expect(Search.validate('scheduled:2026-02-30')).toBe(false);
      const error = Search.getError('scheduled:2026-02-30');
      expect(error).toContain('Invalid date value');
      expect(error).toContain('2026-02-30');
    });
  });

  describe('exact date values (rollover regression)', () => {
    // The createDate path silently rolled calendar-invalid dates over:
    // 2026-02-30 became March 2, so scheduled:2026-02-30 MATCHED March 2
    // tasks. Range bounds were fixed earlier; the exact forms were not.
    it('parseDateValue returns null for calendar-invalid exact dates', () => {
      expect(DateUtils.parseDateValue('2026-02-30')).toBeNull();
      expect(DateUtils.parseDateValue('2026-13-01')).toBeNull();
      expect(DateUtils.parseDateValue('2026-00-10')).toBeNull();
      expect(DateUtils.parseDateValue('2026-04-31')).toBeNull();
      // Valid dates and partials still parse.
      expect(DateUtils.parseDateValue('2024-02-29')).toMatchObject({
        format: 'full',
      });
      expect(DateUtils.parseDateValue('2026-02')).toMatchObject({
        format: 'year-month',
      });
    });

    it('calendar-invalid exact dates no longer match rolled-over days', async () => {
      const mar2 = createBaseTask({
        scheduledDate: localDate(2026, 3, 2),
      });
      await expect(
        Search.evaluate('scheduled:2026-02-30', mar2, false),
      ).resolves.toBe(false);
    });

    it('valid exact dates still match', async () => {
      const mar2 = createBaseTask({
        scheduledDate: localDate(2026, 3, 2),
      });
      await expect(
        Search.evaluate('scheduled:2026-03-02', mar2, false),
      ).resolves.toBe(true);
    });
  });

  describe('open-domain values stay accepted (legitimately match nothing)', () => {
    it.each([
      'path:no-such-folder',
      'file:no-such-file.md',
      'tag:no-such-tag',
      'content:no-such-content',
      'state:no-such-keyword',
      'scheduled:no-such-date',
      'scheduled:"no such phrase"',
      'scheduled:2999999',
    ])('%s parses fine (empty result is not an error)', (query) => {
      expect(() => Search.parse(query)).not.toThrow();
    });

    it('quoting does not bypass priority validation', () => {
      expect(() => Search.parse('priority:"urgent"')).toThrow(
        /Unknown priority value/i,
      );
      expect(() => Search.parse('priority:"high"')).not.toThrow();
    });
  });

  describe('Search.validate / Search.getError surface', () => {
    it('validate() rejects unknown priority values', () => {
      expect(Search.validate('priority:urgent')).toBe(false);
      expect(Search.validate('priority:high')).toBe(true);
      expect(Search.validate('-(priority:urgent)')).toBe(false);
    });

    it('getError() returns a helpful message for unknown priority values', () => {
      const error = Search.getError('priority:urgent');
      expect(error).toContain('Unknown priority value');
      expect(error).toContain('high');
      expect(error).toContain('low');
    });

    it('getError() returns null for valid queries', () => {
      expect(Search.getError('priority:high OR -priority:low')).toBeNull();
    });
  });

  describe('embedded task list error path', () => {
    it('surfaces invalid search queries instead of silent 0 tasks', () => {
      const params = TodoseqCodeBlockParser.parse(
        'search: priority:urgent\ntitle: Broken',
      );
      expect(params.error).toBeDefined();
      expect(params.error).toContain('Invalid search query');
      expect(params.error).toContain('Unknown priority value');
    });

    it('valid search queries produce no error', () => {
      const params = TodoseqCodeBlockParser.parse(
        'search: priority:high\ntitle: Fine',
      );
      expect(params.error).toBeUndefined();
      expect(params.searchQuery).toBe('priority:high');
    });

    it('no search parameter is not an error', () => {
      const params = TodoseqCodeBlockParser.parse('title: All tasks');
      expect(params.error).toBeUndefined();
      expect(params.searchQuery).toBe('');
    });
  });

  describe('parser AST cache consistency', () => {
    it('does not cache-thrash between queries', () => {
      expect(() => Search.parse('priority:urgent')).toThrow();
      expect(() => Search.parse('priority:high')).not.toThrow();
      expect(() => Search.parse('priority:urgent')).toThrow();
      expect(() => Search.parse('priority:high')).not.toThrow();
    });
  });

  describe('regression: evaluator leaves the no-match fallback only for open domains', () => {
    it('scheduled:invalid..dates still evaluates false without throwing', async () => {
      // Range bounds with non-date words stay evaluator-side fail-closed:
      // they are open-domain words, not closed-domain values.
      const task = createBaseTask({ scheduledDate: localDate(2026, 0, 15) });
      await expect(
        Search.evaluate('scheduled:invalid..dates', task, false),
      ).resolves.toBe(false);
    });

    it('SearchParser.validate matches Search.parse outcomes', () => {
      expect(SearchParser.validate('priority:urgent')).toBe(false);
      expect(SearchParser.validate('priority:high')).toBe(true);
    });
  });
});
