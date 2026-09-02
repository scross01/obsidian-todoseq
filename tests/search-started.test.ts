import { SearchParser } from '../src/search/search-parser';
import { SearchEvaluator } from '../src/search/search-evaluator';
import { SearchSuggestions } from '../src/search/search-suggestions';
import { SearchTokenizer } from '../src/search/search-tokenizer';
import { Task } from '../src/types/task';
import { sortTasksWithThreeBlockSystem } from '../src/utils/task-sort';
import { createBaseTask, createCheckboxTask } from './helpers/test-helper';

/**
 * Tests for the started: search property and sortByStarted sort method
 * (plans/003-started-timestamps.md, Step 13).
 *
 * 'overdue' semantics: intentionally NOT supported for started dates —
 * under first-ever-start semantics it has no meaningful definition. The
 * evaluator rejects 'overdue'/'due' outright (never matches) and the
 * suggestion list must not include them.
 */
describe('started: search property', () => {
  // Fixed reference date: Wednesday, January 14, 2026 at noon (local)
  const fixedNow = new Date(2026, 0, 14, 12, 0, 0);
  const today = new Date(2026, 0, 14);
  const yesterday = new Date(2026, 0, 13);
  const lastWeek = new Date(2026, 0, 6);

  beforeAll(() => {
    jest.useFakeTimers();
    jest.setSystemTime(fixedNow);
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  const evalAll = async (query: string, tasks: Task[]): Promise<Task[]> => {
    const node = SearchParser.parse(query);
    const results = await Promise.all(
      tasks.map(
        async (task) => await SearchEvaluator.evaluate(node, task, false),
      ),
    );
    return tasks.filter((_, index) => results[index]);
  };

  const startedTasks: Task[] = [
    createCheckboxTask({
      path: 'started-today.md',
      line: 1,
      text: 'Started today',
      startedDate: today,
    }),
    createCheckboxTask({
      path: 'started-yesterday.md',
      line: 2,
      text: 'Started yesterday',
      startedDate: yesterday,
    }),
    createCheckboxTask({
      path: 'started-lastweek.md',
      line: 3,
      text: 'Started last week',
      startedDate: lastWeek,
    }),
    createCheckboxTask({
      path: 'not-started.md',
      line: 4,
      text: 'Not started',
      startedDate: null,
    }),
  ];

  it('started:today matches tasks started today', async () => {
    const results = await evalAll('started:today', startedTasks);
    expect(results.map((t) => t.text)).toEqual(['Started today']);
  });

  it('started:yesterday matches tasks started yesterday', async () => {
    const results = await evalAll('started:yesterday', startedTasks);
    expect(results.map((t) => t.text)).toEqual(['Started yesterday']);
  });

  it('started:"this week" matches tasks started this week', async () => {
    const results = await evalAll('started:"this week"', startedTasks);
    expect(results.map((t) => t.text)).toEqual(
      expect.arrayContaining(['Started today', 'Started yesterday']),
    );
    expect(results.map((t) => t.text)).not.toContain('Started last week');
    expect(results.map((t) => t.text)).not.toContain('Not started');
  });

  it('started:none matches tasks without a started date', async () => {
    const results = await evalAll('started:none', startedTasks);
    expect(results.map((t) => t.text)).toEqual(['Not started']);
  });

  it('started:2026-01-14 matches exact-date starts', async () => {
    const results = await evalAll('started:2026-01-14', startedTasks);
    expect(results.map((t) => t.text)).toEqual(['Started today']);
  });

  it('started:2026-01-10..2026-01-31 matches a date range', async () => {
    const results = await evalAll(
      'started:2026-01-10..2026-01-31',
      startedTasks,
    );
    expect(results.map((t) => t.text)).toEqual(
      expect.arrayContaining(['Started today', 'Started yesterday']),
    );
    expect(results.map((t) => t.text)).not.toContain('Started last week');
  });

  it('tokenizer recognizes started: as a prefix', () => {
    const tokens = SearchTokenizer.tokenize('started:today');
    expect(tokens[0].type).toBe('prefix');
    expect(tokens[0].value).toBe('started');
    expect(tokens[1].type).toBe('prefix_value');
    expect(tokens[1].value).toBe('today');
  });

  it('parser accepts started: range filters', () => {
    // Must not throw "Range operator can only be used with..."
    const node = SearchParser.parse('started:2026-01-10..2026-01-31');
    expect(node.type).toBe('range_filter');
    expect(node.field).toBe('started');
  });

  it('started:overdue matches nothing (unsupported value)', async () => {
    // 'overdue' is a defined relative expression for planning dates, but it
    // has no meaning under first-ever-start semantics. The evaluator rejects
    // it before generic date evaluation, so it NEVER matches — even for
    // tasks with past STARTED dates. It is not suggested (tested below) and
    // is documented as unsupported.
    const results = await evalAll('started:overdue', startedTasks);
    expect(results).toHaveLength(0);
  });

  it('started:due matches nothing (unsupported value)', async () => {
    const results = await evalAll('started:due', startedTasks);
    expect(results).toHaveLength(0);
  });

  it('unsupported started: values match nothing (like invalid dates)', async () => {
    // Mirrors the 'scheduled:invalid-date' convention: unknown values return
    // zero matches rather than erroring.
    const results = await evalAll('started:invalid-value', startedTasks);
    expect(results).toHaveLength(0);
  });

  it('started:overdue is NOT suggested', () => {
    const suggestions = SearchSuggestions.getStartedDateSuggestions();
    expect(suggestions).not.toContain('overdue');
    expect(suggestions).not.toContain('due');
    expect(suggestions).toContain('today');
    expect(suggestions).toContain('yesterday');
    expect(suggestions).toContain('this week');
    expect(suggestions).toContain('none');
  });

  it('extracts started date literals from tasks for suggestions', () => {
    const literals =
      SearchSuggestions.getStartedDateSuggestionsFromTasks(startedTasks);
    expect(literals).toContain('2026-01-14');
    expect(literals).toContain('2026-01-13');
  });
});

describe('sortByStarted', () => {
  const earlier = new Date(2026, 0, 10, 8, 0, 0);
  const later = new Date(2026, 0, 12, 8, 0, 0);

  const make = (text: string, startedDate: Date | null): Task =>
    createBaseTask({ path: 'a.md', text, startedDate });

  it('sorts by startedDate ascending', () => {
    const sorted = sortTasksWithThreeBlockSystem(
      [make('later', later), make('earlier', earlier)],
      new Date(2026, 0, 14),
      'showAll',
      'showAll',
      'sortByStarted',
    );
    expect(sorted.map((t) => t.text)).toEqual(['earlier', 'later']);
  });

  it('sorts tasks without startedDate last', () => {
    const sorted = sortTasksWithThreeBlockSystem(
      [make('none', null), make('later', later), make('earlier', earlier)],
      new Date(2026, 0, 14),
      'showAll',
      'showAll',
      'sortByStarted',
    );
    expect(sorted.map((t) => t.text)).toEqual(['earlier', 'later', 'none']);
  });

  it('falls back to taskComparator (path, line) when dates are equal', () => {
    const a = createBaseTask({
      path: 'a.md',
      line: 1,
      text: 'a',
      startedDate: earlier,
    });
    const b = createBaseTask({
      path: 'a.md',
      line: 2,
      text: 'b',
      startedDate: earlier,
    });
    const sorted = sortTasksWithThreeBlockSystem(
      [b, a],
      new Date(2026, 0, 14),
      'showAll',
      'showAll',
      'sortByStarted',
    );
    expect(sorted.map((t) => t.text)).toEqual(['a', 'b']);
  });
});
