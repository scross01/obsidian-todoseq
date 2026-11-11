/**
 * @jest-environment jsdom
 */
import { Search } from '../src/search/search';
import { createCheckboxTask } from './helpers/test-helper';

const tasks = [
  createCheckboxTask({ text: 'alpha-only', rawText: '- [ ] alpha-only' }),
  createCheckboxTask({ text: 'beta-only', rawText: '- [ ] beta-only' }),
  createCheckboxTask({ text: 'beta+gamma', rawText: '- [ ] beta gamma' }),
  createCheckboxTask({ text: 'alpha+gamma', rawText: '- [ ] alpha gamma' }),
];

async function matches(query: string, candidates = tasks): Promise<string[]> {
  const result = await Search.filterTasks(candidates, query, false);
  return result.map((task) => task.text ?? '').sort();
}

describe('search query contract', () => {
  it('binds implicit and explicit AND above OR', async () => {
    expect(await matches('alpha OR beta gamma')).toEqual([
      'alpha+gamma',
      'alpha-only',
      'beta+gamma',
    ]);
    expect(await matches('alpha AND beta OR gamma')).toEqual([
      'alpha+gamma',
      'beta+gamma',
    ]);
  });

  it('keeps parentheses authoritative', async () => {
    expect(await matches('(alpha OR beta) gamma')).toEqual([
      'alpha+gamma',
      'beta+gamma',
    ]);

    const tree = Search.parse('alpha OR beta gamma');
    expect(tree.type).toBe('or');
    expect(tree.children?.[1].type).toBe('and');

    const grouped = Search.parse('(alpha OR beta) gamma');
    expect(grouped.type).toBe('and');
    expect(grouped.children?.[0].type).toBe('or');
  });

  it('does not let a later date range swallow an earlier filter value', async () => {
    const localDate = (y: number, m: number, d: number) =>
      new Date(y, m - 1, d);
    const scheduled = createCheckboxTask({
      text: 'scheduled todo',
      rawText: '- [ ] TODO scheduled todo',
      state: 'TODO',
      scheduledDate: localDate(2026, 1, 15),
    });
    const wrongState = createCheckboxTask({
      text: 'scheduled done',
      rawText: '- [x] DONE scheduled done',
      state: 'DONE',
      completed: true,
      scheduledDate: localDate(2026, 1, 15),
    });
    const outsideRange = createCheckboxTask({
      text: 'scheduled later',
      rawText: '- [ ] TODO scheduled later',
      state: 'TODO',
      scheduledDate: localDate(2027, 1, 15),
    });

    expect(
      await matches('state:TODO scheduled:2026-01-01..2026-12-31', [
        scheduled,
        wrongState,
        outsideRange,
      ]),
    ).toEqual(['scheduled todo']);
  });

  it('rejects unbalanced delimiters, dangling operators and unmatched quotes', async () => {
    expect(Search.getError('alpha) deadline:today')).toBe(
      'Unexpected closing parenthesis',
    );
    expect(Search.getError('alpha AND')).not.toBeNull();
    expect(Search.getError('"unterminated')).toBe('Unterminated quoted string');
    expect(Search.getError('(alpha OR beta')).not.toBeNull();
    expect(Search.getError('alpha OR beta gamma')).toBeNull();
  });

  it('keeps no-match words as a valid empty result, not an error', async () => {
    expect(Search.getError('nonexistentword')).toBeNull();
    expect(await matches('nonexistentword')).toEqual([]);
  });
});
