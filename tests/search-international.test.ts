import { Search } from '../src/search/search';
import { Task } from '../src/types/task';
import { createBaseSettings, createBaseTask } from './helpers/test-helper';

/**
 * Default search folds accents and language-specific Latin letters on both
 * sides. Strict mode (the A/a toggle) keeps original spelling and case.
 * These are explicit expectations, not parity between two implementations.
 */

function taskWithText(text: string, overrides: Partial<Task> = {}): Task {
  return createBaseTask({
    path: 'notes/note.md',
    line: 0,
    rawText: `TODO ${text}`,
    text,
    ...overrides,
  });
}

async function evaluate(
  query: string,
  task: Task,
  caseSensitive = false,
): Promise<boolean> {
  return Search.evaluate(query, task, caseSensitive);
}

async function bulk(
  query: string,
  task: Task,
  caseSensitive = false,
): Promise<boolean> {
  const result = await Search.filterTasks([task], query, caseSensitive);
  return result.length === 1;
}

describe('international task search', () => {
  describe('accent and letter folding in task text', () => {
    const cases: Array<[string, string, boolean, boolean]> = [
      ['Visit café', 'cafe', true, false],
      ['Visit cafe', 'café', true, false],
      ['Visit café', 'café', true, true],
      ['Visit Café', 'café', true, false],
      ['Send to Straße', 'strasse', true, false],
      ['Łódź office', 'lodz', true, false],
      ['Résumé review', 'resume', true, false],
    ];

    it.each(cases)(
      'task %s, query %s (strict=%j)',
      async (text, query, defaultMatch, strictMatch) => {
        const task = taskWithText(text);
        expect(await evaluate(query, task, false)).toBe(defaultMatch);
        expect(await bulk(query, task, false)).toBe(defaultMatch);
        expect(await evaluate(query, task, true)).toBe(strictMatch);
        expect(await bulk(query, task, true)).toBe(strictMatch);
      },
    );

    it('matches a query typed with accents against plain text', () => {
      const task = taskWithText('Visit cafe');
      expect(task.text).toBe('Visit cafe');
      expect(Search.evaluate('café', task, false)).resolves.toBe(true);
    });
  });

  describe('Unicode phrase boundaries', () => {
    const cases: Array<[string, string, boolean, boolean]> = [
      ['été', '"ete"', true, false],
      ['été', '"été"', true, true],
      ['étéplus', '"été"', false, false],
      ['東京', '"東京"', true, true],
      ['東京都', '"東京"', false, false],
      ['C++', '"C++"', true, true],
      ['C--', '"C++"', false, false],
    ];

    it.each(cases)(
      'text %s, phrase %s (strict=%j)',
      async (text, query, defaultMatch, strictMatch) => {
        const task = taskWithText(text);
        expect(await evaluate(query, task, false)).toBe(defaultMatch);
        expect(await bulk(query, task, false)).toBe(defaultMatch);
        expect(await evaluate(query, task, true)).toBe(strictMatch);
        expect(await bulk(query, task, true)).toBe(strictMatch);
      },
    );

    it('keeps prefix values as substrings in both modes', () => {
      const task = taskWithText('東京都 office');
      expect(Search.evaluate('content:"東京"', task, false)).resolves.toBe(
        true,
      );
      expect(Search.evaluate('content:"東京"', task, true)).resolves.toBe(true);
    });
  });

  describe('field coverage', () => {
    it('folds content, description and heading independently', async () => {
      const task = createBaseTask({
        path: 'notes/note.md',
        rawText: 'TODO plain line',
        text: 'plain line',
        description: 'Résumé details',
        parentHeading: 'Łódź planning',
      });

      expect(await evaluate('content:cafe', taskWithText('café'))).toBe(true);
      expect(await evaluate('description:resume', task)).toBe(true);
      expect(await evaluate('heading:lodz', task)).toBe(true);
      expect(await evaluate('description:resume', task, true)).toBe(false);
      expect(await evaluate('heading:lodz', task, true)).toBe(false);
      expect(await evaluate('heading:plain', task)).toBe(false);
    });

    it('folds file and path segments without weakening segment rules', async () => {
      const inFolder = createBaseTask({
        path: 'Łódź/Note.md',
        text: 'plain',
        rawText: 'TODO plain',
      });
      const sibling = createBaseTask({
        path: 'ŁódźExtra/Note.md',
        text: 'plain',
        rawText: 'TODO plain',
      });
      const file = createBaseTask({
        path: 'notes/Résumé.md',
        text: 'plain',
        rawText: 'TODO plain',
      });

      expect(await evaluate('path:lodz', inFolder)).toBe(true);
      expect(await evaluate('path:lodz', sibling)).toBe(false);
      expect(await evaluate('path:lodz', inFolder, true)).toBe(false);
      expect(await evaluate('file:resume', file)).toBe(true);
      expect(await evaluate('file:resume', file, true)).toBe(false);
    });

    it('keeps default search out of the parent heading', async () => {
      const task = createBaseTask({
        path: 'notes/note.md',
        text: 'plain',
        rawText: 'TODO plain',
        parentHeading: 'Café notes',
      });
      expect(await evaluate('cafe', task)).toBe(false);
      expect(await evaluate('heading:cafe', task)).toBe(true);
    });

    it('matches displayed text of a parsed task without rewriting it', async () => {
      const task = createBaseTask({
        path: 'notes/note.md',
        rawText: 'TODO Réview[^1] café',
        text: 'Réview café',
        tags: [],
      });
      expect(await evaluate('"review cafe"', task)).toBe(true);
      expect(await evaluate('review', task)).toBe(true);
      expect(task.rawText).toBe('TODO Réview[^1] café');
      expect(task.text).toBe('Réview café');
    });
  });

  describe('tags, states and configured aliases', () => {
    const tagged = createBaseTask({
      path: 'notes/note.md',
      rawText: 'TODO review #café/clients',
      text: 'review',
      tags: ['café/clients'],
    });

    it('preserves exact and subtag tag rules while folding', async () => {
      expect(await evaluate('tag:cafe', tagged)).toBe(true);
      expect(await evaluate('tag:#cafe', tagged)).toBe(false);
      expect(await evaluate('tag:"cafe"', tagged)).toBe(false);
      expect(await evaluate('tag:"#café"', tagged)).toBe(false);
      expect(await evaluate('tag:"#café/clients"', tagged)).toBe(true);
      expect(await evaluate('tag:cafeteria', tagged)).toBe(false);
      expect(await evaluate('tag:cafe', tagged, true)).toBe(false);

      const bare = createBaseTask({
        path: 'notes/note.md',
        rawText: 'TODO review #café',
        text: 'review',
        tags: ['café'],
      });
      expect(await evaluate('tag:#café', bare, true)).toBe(true);
      expect(await evaluate('tag:#cafe', bare, true)).toBe(false);
    });

    it('folds literal states but resolves group aliases from the original text', async () => {
      const settings = createBaseSettings({
        additionalActiveKeywords: ['TERMINÉ'],
      });
      const termine = createBaseTask({
        path: 'notes/note.md',
        state: 'TERMINÉ',
        text: 'finished',
        rawText: 'TERMINÉ finished',
      });
      expect(await evaluate('state:termine', termine)).toBe(true);
      expect(await evaluate('state:termine', termine, true)).toBe(false);
      expect(
        await Search.evaluate('state:active', termine, false, settings),
      ).toBe(true);

      const accentedAlias = createBaseTask({
        path: 'notes/note.md',
        state: 'ACTÍVE',
        text: 'literal',
        rawText: 'ACTÍVE literal',
      });
      // It is a literal state, not the `active` group alias, and it is not
      // added to that group's configured membership.
      expect(
        await Search.evaluate('state:ACTÍVE', accentedAlias, false, settings),
      ).toBe(true);
      expect(
        await Search.evaluate('state:active', accentedAlias, false, settings),
      ).toBe(false);
    });

    it('returns a task once when two spellings fold together', async () => {
      const both = createBaseTask({
        path: 'notes/note.md',
        rawText: 'TODO tagged #café #cafe',
        text: 'tagged',
        tags: ['café', 'cafe'],
      });
      const result = await Search.filterTasks(
        [both],
        'tag:cafe',
        false,
        createBaseSettings(),
      );
      expect(result).toEqual([both]);
    });
  });

  describe('boolean composition and cache lifetime', () => {
    it('composes folded terms with AND, OR, negation and grouping', async () => {
      const cafe = taskWithText('Visit café');
      const strasse = taskWithText('Send to Straße');
      expect(await evaluate('cafe -strasse', cafe)).toBe(true);
      expect(await evaluate('cafe -strasse', strasse)).toBe(false);
      expect(await evaluate('(cafe OR strasse) -Café', cafe)).toBe(false);
      expect(await evaluate('(cafe OR strasse)', strasse)).toBe(true);
    });

    it('sees edits, renames and keyword changes on the next pass', async () => {
      const task = taskWithText('Visit café');
      expect(await evaluate('cafe', task)).toBe(true);

      task.text = 'Visit cafe';
      task.rawText = 'TODO Visit cafe';
      expect(await evaluate('café', task)).toBe(true);

      task.path = 'notes/Résumé.md';
      expect(await evaluate('file:resume', task)).toBe(true);

      const settings = createBaseSettings({
        additionalActiveKeywords: ['TERMINÉ'],
      });
      task.state = 'TERMINÉ';
      expect(await evaluate('state:termine', task)).toBe(true);
      expect(await Search.evaluate('state:active', task, false, settings)).toBe(
        true,
      );
    });

    it('leaves a blank query and the input array untouched', async () => {
      const task = taskWithText('café');
      await expect(Search.filterTasks([task], '', false)).resolves.toEqual([
        task,
      ]);
      await expect(Search.filterTasks([task], '   ', false)).resolves.toEqual([
        task,
      ]);
    });
  });
});
