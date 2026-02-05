import { Search } from '../src/search/search';
import { Task } from '../src/types/task';
import { createBaseTask } from './helpers/test-helper';

describe('Tag Search with Subtags and Exact Matching', () => {
  const testTasksWithSubtags: Task[] = [
    createBaseTask({
      path: 'notes/context.md',
      line: 1,
      rawText: 'TODO task with context tag #context',
      listMarker: '-',
      text: 'task with context tag',
    }),
    createBaseTask({
      path: 'notes/context-home.md',
      line: 2,
      rawText: 'TODO task with context/home tag #context/home',
      listMarker: '-',
      text: 'task with context/home tag',
    }),
    createBaseTask({
      path: 'notes/context-work.md',
      line: 3,
      rawText: 'TODO task with context/work tag #context/work',
      listMarker: '-',
      text: 'task with context/work tag',
    }),
    createBaseTask({
      path: 'notes/other.md',
      line: 4,
      rawText: 'TODO task with unrelated tag #unrelated',
      listMarker: '-',
      text: 'task with unrelated tag',
    }),
  ];

  describe('Issue #28: Subtag searching behavior', () => {
    describe('Unquoted searches (prefix matching)', () => {
      it('should match exact tag when unquoted (tag:#context should match #context)', async () => {
        const results = await Promise.all(
          testTasksWithSubtags.map(async (task) => {
            return await Search.evaluate('tag:#context', task, false);
          }),
        );
        const result = testTasksWithSubtags.filter((_, index) => results[index]);
        expect(result.length).toBe(1);
        expect(result[0].path).toBe('notes/context.md');
      });

      it('should match subtags when using prefix without quotes (tag:context should match #context, #context/home, #context/work)', async () => {
        const results = await Promise.all(
          testTasksWithSubtags.map(async (task) => {
            return await Search.evaluate('tag:context', task, false);
          }),
        );
        const result = testTasksWithSubtags.filter((_, index) => results[index]);
        expect(result.length).toBe(3);
        expect(result.map((t) => t.path).sort()).toEqual([
          'notes/context-home.md',
          'notes/context-work.md',
          'notes/context.md',
        ]);
      });

      it('should match exact subtag (tag:#context/home should match #context/home)', async () => {
        const results = await Promise.all(
          testTasksWithSubtags.map(async (task) => {
            return await Search.evaluate('tag:#context/home', task, false);
          }),
        );
        const result = testTasksWithSubtags.filter((_, index) => results[index]);
        expect(result.length).toBe(1);
        expect(result[0].path).toBe('notes/context-home.md');
      });

      it('should match subtag with additional segments (tag:context/home should match #context/home)', async () => {
        const results = await Promise.all(
          testTasksWithSubtags.map(async (task) => {
            return await Search.evaluate('tag:context/home', task, false);
          }),
        );
        const result = testTasksWithSubtags.filter((_, index) => results[index]);
        expect(result.length).toBe(1);
        expect(result[0].path).toBe('notes/context-home.md');
      });

      it('should not match unrelated tags', async () => {
        const results = await Promise.all(
          testTasksWithSubtags.map(async (task) => {
            return await Search.evaluate('tag:nonexistent', task, false);
          }),
        );
        const result = testTasksWithSubtags.filter((_, index) => results[index]);
        expect(result.length).toBe(0);
      });
    });

    describe('Quoted searches (exact matching)', () => {
      it('should only match exact tag when quoted (tag:"#context" should match only #context)', async () => {
        const results = await Promise.all(
          testTasksWithSubtags.map(async (task) => {
            return await Search.evaluate('tag:"#context"', task, false);
          }),
        );
        const result = testTasksWithSubtags.filter((_, index) => results[index]);
        expect(result.length).toBe(1);
        expect(result[0].path).toBe('notes/context.md');
      });

      it('should not match subtags when quoted (tag:"#context" should NOT match #context/home)', async () => {
        const results = await Promise.all(
          testTasksWithSubtags.map(async (task) => {
            return await Search.evaluate('tag:"#context"', task, false);
          }),
        );
        const result = testTasksWithSubtags.filter((_, index) => results[index]);
        expect(result.length).toBe(1);
        expect(result[0].path).toBe('notes/context.md');
        // Should not include context/home or context/work
        expect(
          result.every(
            (t) =>
              !t.path.includes('context-home') &&
              !t.path.includes('context-work'),
          ),
        ).toBe(true);
      });

      it('should only match exact subtag when quoted (tag:"#context/home" should match only #context/home)', async () => {
        const results = await Promise.all(
          testTasksWithSubtags.map(async (task) => {
            return await Search.evaluate('tag:"#context/home"', task, false);
          }),
        );
        const result = testTasksWithSubtags.filter((_, index) => results[index]);
        expect(result.length).toBe(1);
        expect(result[0].path).toBe('notes/context-home.md');
      });

      it('should handle quotes with optional # prefix (tag:"context" should match only #context)', async () => {
        const results = await Promise.all(
          testTasksWithSubtags.map(async (task) => {
            return await Search.evaluate('tag:"context"', task, false);
          }),
        );
        const result = testTasksWithSubtags.filter((_, index) => results[index]);
        expect(result.length).toBe(1);
        expect(result[0].path).toBe('notes/context.md');
      });

      it('should not match anything when quoted tag does not exist exactly', async () => {
        const results = await Promise.all(
          testTasksWithSubtags.map(async (task) => {
            return await Search.evaluate('tag:"nonexistent"', task, false);
          }),
        );
        const result = testTasksWithSubtags.filter((_, index) => results[index]);
        expect(result.length).toBe(0);
      });
    });

    describe('Hash prefix behavior', () => {
      it('should make # prefix optional in unquoted searches', async () => {
        const withHashResults = await Promise.all(
          testTasksWithSubtags.map(async (task) => {
            return await Search.evaluate('tag:#context', task, false);
          }),
        );
        const withoutHashResults = await Promise.all(
          testTasksWithSubtags.map(async (task) => {
            return await Search.evaluate('tag:context', task, false);
          }),
        );
        const withHash = testTasksWithSubtags.filter((_, index) => withHashResults[index]);
        const withoutHash = testTasksWithSubtags.filter((_, index) => withoutHashResults[index]);
        expect(withHash.length).toBe(1);
        expect(withoutHash.length).toBe(3);
        // #context matches only exact, context matches prefix + subtags
      });

      it('should make # prefix optional in quoted searches', async () => {
        const withHashResults = await Promise.all(
          testTasksWithSubtags.map(async (task) => {
            return await Search.evaluate('tag:"#context"', task, false);
          }),
        );
        const withoutHashResults = await Promise.all(
          testTasksWithSubtags.map(async (task) => {
            return await Search.evaluate('tag:"context"', task, false);
          }),
        );
        const withHash = testTasksWithSubtags.filter((_, index) => withHashResults[index]);
        const withoutHash = testTasksWithSubtags.filter((_, index) => withoutHashResults[index]);
        expect(withHash.length).toBe(withoutHash.length);
        expect(withHash.map((t) => t.path).sort()).toEqual(
          withoutHash.map((t) => t.path).sort(),
        );
      });
    });

    describe('Complex tag scenarios', () => {
      const complexTasks: Task[] = [
        createBaseTask({
          path: 'notes/deep.md',
          line: 1,
          rawText: 'TODO task with deep subtag #project/feature/bugfix',
          listMarker: '-',
          text: 'task with deep subtag',
        }),
        createBaseTask({
          path: 'notes/mixed.md',
          line: 2,
          rawText: 'TODO task with mixed chars #test-tag/sub_category_v2',
          listMarker: '-',
          text: 'task with mixed chars',
        }),
      ];

      it('should handle multiple levels of subtags', async () => {
        // Should match exact subtag
        expect(
          await Search.evaluate(
            'tag:"project/feature/bugfix"',
            complexTasks[0],
            false,
          ),
        ).toBe(true);
        expect(
          await Search.evaluate(
            'tag:"#project/feature/bugfix"',
            complexTasks[0],
            false,
          ),
        ).toBe(true);

        // Should match prefix
        expect(
          await Search.evaluate('tag:project/feature', complexTasks[0], false),
        ).toBe(true);
        expect(await Search.evaluate('tag:project', complexTasks[0], false)).toBe(
          true,
        );

        // Should not match unrelated prefixes
        expect(
          await Search.evaluate('tag:project/other', complexTasks[0], false),
        ).toBe(false);
      });

      it('should handle tags with mixed characters', async () => {
        // Should match exact
        expect(
          await Search.evaluate(
            'tag:"test-tag/sub_category_v2"',
            complexTasks[1],
            false,
          ),
        ).toBe(true);

        // Should match prefix
        expect(await Search.evaluate('tag:test-tag', complexTasks[1], false)).toBe(
          true,
        );
        // This should NOT match because sub_category_v2 doesn't start with sub/ - it's a different naming pattern
        expect(
          await Search.evaluate('tag:test-tag/sub', complexTasks[1], false),
        ).toBe(false);
      });
    });

    describe('Emoji tags', () => {
      it('should recognize emoji tags', async () => {
        const emojiTask: Task = createBaseTask({
          path: 'notes/emoji.md',
          line: 1,
          rawText: 'TODO test tag with emoji #🚀',
          listMarker: '-',
          text: 'test tag with emoji',
        });

        expect(await Search.evaluate('tag:#🚀', emojiTask, false)).toBe(true);
        expect(await Search.evaluate('tag:🚀', emojiTask, false)).toBe(true);
        expect(await Search.evaluate('tag:"#🚀"', emojiTask, false)).toBe(true);
        expect(await Search.evaluate('tag:"🚀"', emojiTask, false)).toBe(true);
      });
    });

    describe('URL anchor exclusion', () => {
      it('should not match #ref in URLs as tags', async () => {
        const urlTask: Task = createBaseTask({
          path: 'notes/url.md',
          line: 1,
          rawText:
            'TODO test task that has a URL not a tag https://example.com/text#ref',
          listMarker: '-',
          text: 'test task that has a URL not a tag https://example.com/text#ref',
        });

        expect(await Search.evaluate('tag:#ref', urlTask, false)).toBe(false);
        expect(await Search.evaluate('tag:ref', urlTask, false)).toBe(false);
      });

      it('should still recognize tags in same task as URL', async () => {
        const taskWithUrlAndTag: Task = createBaseTask({
          path: 'notes/url-tag.md',
          line: 1,
          rawText:
            'TODO task with URL and tag https://example.com/page#section #important',
          listMarker: '-',
          text: 'task with URL and tag https://example.com/page#section',
        });

        expect(
          await Search.evaluate('tag:#important', taskWithUrlAndTag, false),
        ).toBe(true);
        expect(await Search.evaluate('tag:important', taskWithUrlAndTag, false)).toBe(
          true,
        );
        expect(await Search.evaluate('tag:#section', taskWithUrlAndTag, false)).toBe(
          false,
        );
      });
    });
  });
});
