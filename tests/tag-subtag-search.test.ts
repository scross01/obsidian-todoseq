import { Search } from '../src/search/search';
import { Task } from '../src/task';

describe('Tag Search with Subtags and Exact Matching', () => {
  const testTasksWithSubtags: Task[] = [
    {
      path: 'notes/context.md',
      line: 1,
      rawText: 'TODO task with context tag #context',
      indent: '',
      listMarker: '-',
      text: 'task with context tag',
      state: 'TODO',
      completed: false,
      priority: null,
      scheduledDate: null,
      deadlineDate: null,
      urgency: null,
      isDailyNote: false,
      dailyNoteDate: null,
    },
    {
      path: 'notes/context-home.md',
      line: 2,
      rawText: 'TODO task with context/home tag #context/home',
      indent: '',
      listMarker: '-',
      text: 'task with context/home tag',
      state: 'TODO',
      completed: false,
      priority: null,
      scheduledDate: null,
      deadlineDate: null,
      urgency: null,
      isDailyNote: false,
      dailyNoteDate: null,
    },
    {
      path: 'notes/context-work.md',
      line: 3,
      rawText: 'TODO task with context/work tag #context/work',
      indent: '',
      listMarker: '-',
      text: 'task with context/work tag',
      state: 'TODO',
      completed: false,
      priority: null,
      scheduledDate: null,
      deadlineDate: null,
      urgency: null,
      isDailyNote: false,
      dailyNoteDate: null,
    },
    {
      path: 'notes/other.md',
      line: 4,
      rawText: 'TODO task with unrelated tag #unrelated',
      indent: '',
      listMarker: '-',
      text: 'task with unrelated tag',
      state: 'TODO',
      completed: false,
      priority: null,
      scheduledDate: null,
      deadlineDate: null,
      urgency: null,
      isDailyNote: false,
      dailyNoteDate: null,
    },
  ];

  describe('Issue #28: Subtag searching behavior', () => {
    describe('Unquoted searches (prefix matching)', () => {
      it('should match exact tag when unquoted (tag:#context should match #context)', () => {
        const result = testTasksWithSubtags.filter((task) =>
          Search.evaluate('tag:#context', task, false),
        );
        expect(result.length).toBe(1);
        expect(result[0].path).toBe('notes/context.md');
      });

      it('should match subtags when using prefix without quotes (tag:context should match #context, #context/home, #context/work)', () => {
        const result = testTasksWithSubtags.filter((task) =>
          Search.evaluate('tag:context', task, false),
        );
        expect(result.length).toBe(3);
        expect(result.map((t) => t.path).sort()).toEqual([
          'notes/context-home.md',
          'notes/context-work.md',
          'notes/context.md',
        ]);
      });

      it('should match exact subtag (tag:#context/home should match #context/home)', () => {
        const result = testTasksWithSubtags.filter((task) =>
          Search.evaluate('tag:#context/home', task, false),
        );
        expect(result.length).toBe(1);
        expect(result[0].path).toBe('notes/context-home.md');
      });

      it('should match subtag with additional segments (tag:context/home should match #context/home)', () => {
        const result = testTasksWithSubtags.filter((task) =>
          Search.evaluate('tag:context/home', task, false),
        );
        expect(result.length).toBe(1);
        expect(result[0].path).toBe('notes/context-home.md');
      });

      it('should not match unrelated tags', () => {
        const result = testTasksWithSubtags.filter((task) =>
          Search.evaluate('tag:nonexistent', task, false),
        );
        expect(result.length).toBe(0);
      });
    });

    describe('Quoted searches (exact matching)', () => {
      it('should only match exact tag when quoted (tag:"#context" should match only #context)', () => {
        const result = testTasksWithSubtags.filter((task) =>
          Search.evaluate('tag:"#context"', task, false),
        );
        expect(result.length).toBe(1);
        expect(result[0].path).toBe('notes/context.md');
      });

      it('should not match subtags when quoted (tag:"#context" should NOT match #context/home)', () => {
        const result = testTasksWithSubtags.filter((task) =>
          Search.evaluate('tag:"#context"', task, false),
        );
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

      it('should only match exact subtag when quoted (tag:"#context/home" should match only #context/home)', () => {
        const result = testTasksWithSubtags.filter((task) =>
          Search.evaluate('tag:"#context/home"', task, false),
        );
        expect(result.length).toBe(1);
        expect(result[0].path).toBe('notes/context-home.md');
      });

      it('should handle quotes with optional # prefix (tag:"context" should match only #context)', () => {
        const result = testTasksWithSubtags.filter((task) =>
          Search.evaluate('tag:"context"', task, false),
        );
        expect(result.length).toBe(1);
        expect(result[0].path).toBe('notes/context.md');
      });

      it('should not match anything when quoted tag does not exist exactly', () => {
        const result = testTasksWithSubtags.filter((task) =>
          Search.evaluate('tag:"nonexistent"', task, false),
        );
        expect(result.length).toBe(0);
      });
    });

    describe('Hash prefix behavior', () => {
      it('should make # prefix optional in unquoted searches', () => {
        const withHash = testTasksWithSubtags.filter((task) =>
          Search.evaluate('tag:#context', task, false),
        );
        const withoutHash = testTasksWithSubtags.filter((task) =>
          Search.evaluate('tag:context', task, false),
        );
        expect(withHash.length).toBe(1);
        expect(withoutHash.length).toBe(3);
        // #context matches only exact, context matches prefix + subtags
      });

      it('should make # prefix optional in quoted searches', () => {
        const withHash = testTasksWithSubtags.filter((task) =>
          Search.evaluate('tag:"#context"', task, false),
        );
        const withoutHash = testTasksWithSubtags.filter((task) =>
          Search.evaluate('tag:"context"', task, false),
        );
        expect(withHash.length).toBe(withoutHash.length);
        expect(withHash.map((t) => t.path).sort()).toEqual(
          withoutHash.map((t) => t.path).sort(),
        );
      });
    });

    describe('Complex tag scenarios', () => {
      const complexTasks: Task[] = [
        {
          path: 'notes/deep.md',
          line: 1,
          rawText: 'TODO task with deep subtag #project/feature/bugfix',
          indent: '',
          listMarker: '-',
          text: 'task with deep subtag',
          state: 'TODO',
          completed: false,
          priority: null,
          scheduledDate: null,
          deadlineDate: null,
          urgency: null,
          isDailyNote: false,
          dailyNoteDate: null,
        },
        {
          path: 'notes/mixed.md',
          line: 2,
          rawText: 'TODO task with mixed chars #test-tag/sub_category_v2',
          indent: '',
          listMarker: '-',
          text: 'task with mixed chars',
          state: 'TODO',
          completed: false,
          priority: null,
          scheduledDate: null,
          deadlineDate: null,
          urgency: null,
          isDailyNote: false,
          dailyNoteDate: null,
        },
      ];

      it('should handle multiple levels of subtags', () => {
        // Should match exact subtag
        expect(
          Search.evaluate(
            'tag:"project/feature/bugfix"',
            complexTasks[0],
            false,
          ),
        ).toBe(true);
        expect(
          Search.evaluate(
            'tag:"#project/feature/bugfix"',
            complexTasks[0],
            false,
          ),
        ).toBe(true);

        // Should match prefix
        expect(
          Search.evaluate('tag:project/feature', complexTasks[0], false),
        ).toBe(true);
        expect(Search.evaluate('tag:project', complexTasks[0], false)).toBe(
          true,
        );

        // Should not match unrelated prefixes
        expect(
          Search.evaluate('tag:project/other', complexTasks[0], false),
        ).toBe(false);
      });

      it('should handle tags with mixed characters', () => {
        // Should match exact
        expect(
          Search.evaluate(
            'tag:"test-tag/sub_category_v2"',
            complexTasks[1],
            false,
          ),
        ).toBe(true);

        // Should match prefix
        expect(Search.evaluate('tag:test-tag', complexTasks[1], false)).toBe(
          true,
        );
        // This should NOT match because sub_category_v2 doesn't start with sub/ - it's a different naming pattern
        expect(
          Search.evaluate('tag:test-tag/sub', complexTasks[1], false),
        ).toBe(false);
      });
    });

    describe('Emoji tags', () => {
      it('should recognize emoji tags', () => {
        const emojiTask: Task = {
          path: 'notes/emoji.md',
          line: 1,
          rawText: 'TODO test tag with emoji #🚀',
          indent: '',
          listMarker: '-',
          text: 'test tag with emoji',
          state: 'TODO',
          completed: false,
          priority: null,
          scheduledDate: null,
          deadlineDate: null,
          urgency: null,
          isDailyNote: false,
          dailyNoteDate: null,
        };

        expect(Search.evaluate('tag:#🚀', emojiTask, false)).toBe(true);
        expect(Search.evaluate('tag:🚀', emojiTask, false)).toBe(true);
        expect(Search.evaluate('tag:"#🚀"', emojiTask, false)).toBe(true);
        expect(Search.evaluate('tag:"🚀"', emojiTask, false)).toBe(true);
      });
    });

    describe('URL anchor exclusion', () => {
      it('should not match #ref in URLs as tags', () => {
        const urlTask: Task = {
          path: 'notes/url.md',
          line: 1,
          rawText:
            'TODO test task that has a URL not a tag https://example.com/text#ref',
          indent: '',
          listMarker: '-',
          text: 'test task that has a URL not a tag https://example.com/text#ref',
          state: 'TODO',
          completed: false,
          priority: null,
          scheduledDate: null,
          deadlineDate: null,
          urgency: null,
          isDailyNote: false,
          dailyNoteDate: null,
        };

        expect(Search.evaluate('tag:#ref', urlTask, false)).toBe(false);
        expect(Search.evaluate('tag:ref', urlTask, false)).toBe(false);
      });

      it('should still recognize tags in same task as URL', () => {
        const taskWithUrlAndTag: Task = {
          path: 'notes/url-tag.md',
          line: 1,
          rawText:
            'TODO task with URL and tag https://example.com/page#section #important',
          indent: '',
          listMarker: '-',
          text: 'task with URL and tag https://example.com/page#section',
          state: 'TODO',
          completed: false,
          priority: null,
          scheduledDate: null,
          deadlineDate: null,
          urgency: null,
          isDailyNote: false,
          dailyNoteDate: null,
        };

        expect(
          Search.evaluate('tag:#important', taskWithUrlAndTag, false),
        ).toBe(true);
        expect(Search.evaluate('tag:important', taskWithUrlAndTag, false)).toBe(
          true,
        );
        expect(Search.evaluate('tag:#section', taskWithUrlAndTag, false)).toBe(
          false,
        );
      });
    });
  });
});
