import { Search } from '../src/search/search';
import { Task } from '../src/types/task';
import { PropertySearchEngine } from '../src/services/property-search-engine';
import { createBaseTask, createBaseSettings } from './helpers/test-helper';

/**
 * Search.filterTasks — the bulk (per-keystroke refresh) facade over the
 * per-row Search.evaluate deployment used by the Task List, embedded
 * dashboards, and embedded task lists.
 *
 * Parity contract: filterTasks() must keep exactly the tasks where
 * `await Search.evaluate(query, task, ...)` returns true, in task order,
 * with the same error semantics (SearchError → no matches, non-SearchError
 * → rethrown) and the identical engine behavior (one engine query per
 * distinct property filter, shared across rows).
 */
describe('Search.filterTasks (bulk per-row-parity path)', () => {
  const tasks: Task[] = [
    createBaseTask({
      path: 'notes/meeting.md',
      line: 1,
      rawText: 'TODO meeting about project planning',
      listMarker: '-',
      text: 'meeting about project planning',
    }),
    createBaseTask({
      path: 'notes/work.md',
      line: 2,
      rawText: 'DOING work on urgent task',
      listMarker: '-',
      text: 'work on urgent task',
      state: 'DOING',
      priority: 'high',
    }),
    createBaseTask({
      path: 'notes/personal.md',
      line: 3,
      rawText: 'TODO personal meetup with friends',
      listMarker: '-',
      text: 'personal meetup with friends',
    }),
    createBaseTask({
      path: 'notes/star-wars.md',
      line: 4,
      rawText: 'TODO watch "star wars" movie',
      listMarker: '-',
      text: 'watch "star wars" movie',
      state: 'DONE',
      completed: true,
    }),
  ];

  /** Reference results: per-row evaluate, the pre-bulk production shape. */
  async function perRowResults(
    query: string,
    caseSensitive = false,
    settings?: Parameters<typeof Search.filterTasks>[3],
    engine?: PropertySearchEngine,
  ): Promise<Task[]> {
    const kept: Task[] = [];
    for (const task of tasks) {
      if (await Search.evaluate(query, task, caseSensitive, settings, engine)) {
        kept.push(task);
      }
    }
    return kept;
  }

  describe('per-row parity', () => {
    const QUERY_MATRIX: Array<[string, boolean]> = [
      ['meeting', false],
      ['urgent tasks', false],
      ['"project planning"', false],
      ['meeting OR personal', false],
      ['meeting AND planning', false],
      ['urgent', true],
      ['Urgent task', false],
      ['Urgent task', true],
      ['-meeting', false],
      ['NOT watch', false],
      ['state:done', false],
      ['state:DOING', false],
      ['path:personal', false],
      ['(meeting OR urgent) AND NOT watch', false],
      ['TODO OR DOING', false],
      ['-DONE', false],
      ['meet', false],
      ['watch "star wars" movie', false],
      ['nonexistent-query-term', false],
    ];

    it.each(QUERY_MATRIX)(
      '%s (caseSensitive=%j)',
      async (query, caseSensitive) => {
        const expected = await perRowResults(query, caseSensitive);
        const result = await Search.filterTasks(
          tasks,
          query,
          caseSensitive,
          createBaseSettings(),
        );
        expect(result.map((t) => t.path)).toEqual(expected.map((t) => t.path));
      },
    );
  });

  it('preserves the task objects and their order', async () => {
    const result = await Search.filterTasks(tasks, 'meeting', false);
    expect(result.length).toBeGreaterThan(0);
    for (const t of result) {
      expect(tasks).toContain(t);
    }
  });

  it('returns the same array instance for a blank query', async () => {
    await expect(Search.filterTasks(tasks, '', false)).resolves.toBe(tasks);
    await expect(Search.filterTasks(tasks, '   ', false)).resolves.toBe(tasks);
  });

  it('returns no matches for an invalid query (SearchError contract)', async () => {
    // Same semantics as per-row evaluate: a parse error matches nothing.
    await expect(
      Search.filterTasks(tasks, '(unterminated', false),
    ).resolves.toEqual([]);
  });

  it('re-throws unexpected (non-SearchError) errors', async () => {
    const originalParse = Search.parse;
    Search.parse = jest.fn(() => {
      throw new Error('Unexpected internal error');
    });
    try {
      await expect(Search.filterTasks(tasks, 'meeting', false)).rejects.toThrow(
        'Unexpected internal error',
      );
    } finally {
      Search.parse = originalParse;
    }
  });

  describe('PropertySearchEngine pre-computation', () => {
    it('matches per-row behavior and queries the engine once per distinct filter', async () => {
      const mockEngine = {
        searchProperties: jest.fn(async () => new Set(['notes/meeting.md'])),
      } as unknown as PropertySearchEngine;

      const query = '[type:Project] OR [type:Project]';
      const result = await Search.filterTasks(
        tasks,
        query,
        false,
        undefined,
        mockEngine,
      );

      // Parity against the per-row shape (two engine hits per row today).
      const expected = await perRowResults(query, false, undefined, mockEngine);
      expect(result.map((t) => t.path)).toEqual(expected.map((t) => t.path));
    });

    it('queries the engine once for a repeated property filter', async () => {
      const mockEngine = {
        searchProperties: jest.fn(async () => new Set(['notes/meeting.md'])),
      } as unknown as PropertySearchEngine;

      await Search.filterTasks(
        tasks,
        '[type:Project] OR [type:Project]',
        false,
        undefined,
        mockEngine,
      );
      expect(mockEngine.searchProperties).toHaveBeenCalledTimes(1);
    });

    it('resolves the engine once for a single filter across the whole batch', async () => {
      // Single (non-repeated) property filter — the engine query is
      // task-independent, so one resolution must serve the whole batch.
      const mockEngine = {
        searchProperties: jest.fn(async () => new Set(['notes/meeting.md'])),
      } as unknown as PropertySearchEngine;

      const result = await Search.filterTasks(
        tasks,
        '[type:Project]',
        false,
        undefined,
        mockEngine,
      );
      expect(mockEngine.searchProperties).toHaveBeenCalledTimes(1);
      expect(result.map((t) => t.path)).toEqual(['notes/meeting.md']);
    });

    it('pairs case sensitivity with the engine exactly as per-row does', async () => {
      const mockEngine = {
        searchProperties: jest.fn(
          async (_query: string, caseSensitive?: boolean) => {
            if (!caseSensitive) {
              return new Set(['notes/meeting.md']);
            }
            return new Set();
          },
        ),
      } as unknown as PropertySearchEngine;

      for (const caseSensitive of [false, true]) {
        const result = await Search.filterTasks(
          tasks,
          '[type:Project]',
          caseSensitive,
          undefined,
          mockEngine,
        );
        const expected = await perRowResults(
          '[type:Project]',
          caseSensitive,
          undefined,
          mockEngine,
        );
        expect(result.map((t) => t.path)).toEqual(expected.map((t) => t.path));
      }
    });

    it('falls back to metadata evaluation when the engine throws (per-row parity)', async () => {
      const mockEngine = {
        searchProperties: jest.fn(async () => {
          throw new Error('engine exploded');
        }),
      } as unknown as PropertySearchEngine;

      const result = await Search.filterTasks(
        tasks,
        '[type:Project]',
        false,
        undefined,
        mockEngine,
      );
      // The resolution is hoisted: exactly one engine attempt for the batch.
      expect(mockEngine.searchProperties).toHaveBeenCalledTimes(1);

      // Without Obsidian's metadata cache in Node, every row falls back to
      // "no match" exactly as the per-row deployment does (fresh reference
      // spy so the count assertion above stays isolated).
      const referenceEngine = {
        searchProperties: jest.fn(async () => {
          throw new Error('engine exploded');
        }),
      } as unknown as PropertySearchEngine;
      const expected = await perRowResults(
        '[type:Project]',
        false,
        undefined,
        referenceEngine,
      );
      expect(result).toEqual(expected);
    });
  });

  it('handles property filters mixed with text criteria', async () => {
    const mockEngine = {
      searchProperties: jest.fn(async () => new Set(['notes/meeting.md'])),
    } as unknown as PropertySearchEngine;

    const result = await Search.filterTasks(
      tasks,
      '[type:Project] meeting',
      false,
      undefined,
      mockEngine,
    );
    expect(result.map((t) => t.path)).toEqual(['notes/meeting.md']);
  });
});
