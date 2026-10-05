import { buildEmptyStateCopy } from '../src/view/task-list/empty-state-copy';

describe('buildEmptyStateCopy', () => {
  describe('no tasks in the vault at all', () => {
    it('points the user at creating a task', () => {
      const copy = buildEmptyStateCopy({
        hasAnyTasks: false,
        hasSearchQuery: false,
        hidden: { future: 0, completed: 0 },
      });
      expect(copy.title).toBe('No tasks found');
      expect(copy.subtitle).toBe(
        'Create tasks in your notes using "TODO your task". They will appear here automatically.',
      );
    });

    it('ignores an active search and hidden counts', () => {
      const copy = buildEmptyStateCopy({
        hasAnyTasks: false,
        hasSearchQuery: true,
        hidden: { future: 4, completed: 7 },
      });
      expect(copy.title).toBe('No tasks found');
      expect(copy.subtitle).toBe(
        'Create tasks in your notes using "TODO your task". They will appear here automatically.',
      );
    });
  });

  describe('search narrowed the list to nothing', () => {
    it('suggests clearing the search when no filter hides anything', () => {
      const copy = buildEmptyStateCopy({
        hasAnyTasks: true,
        hasSearchQuery: true,
        hidden: { future: 0, completed: 0 },
      });
      expect(copy.title).toBe('No matching tasks');
      expect(copy.subtitle).toBe(
        'Try clearing the search or switching view modes.',
      );
    });

    it('names the hidden counts when both kinds are hidden', () => {
      const copy = buildEmptyStateCopy({
        hasAnyTasks: true,
        hasSearchQuery: true,
        hidden: { future: 3, completed: 2 },
      });
      expect(copy.title).toBe('No matching tasks');
      expect(copy.subtitle).toBe(
        'Try clearing the search. 3 future-dated and 2 completed tasks are hidden by the current filters.',
      );
    });

    it('names only the future-dated count when it is the only hidden kind', () => {
      const copy = buildEmptyStateCopy({
        hasAnyTasks: true,
        hasSearchQuery: true,
        hidden: { future: 3, completed: 0 },
      });
      expect(copy.subtitle).toBe(
        'Try clearing the search. 3 future-dated tasks are hidden by the current filters.',
      );
    });

    it('names only the completed count when it is the only hidden kind', () => {
      const copy = buildEmptyStateCopy({
        hasAnyTasks: true,
        hasSearchQuery: true,
        hidden: { future: 0, completed: 2 },
      });
      expect(copy.subtitle).toBe(
        'Try clearing the search. 2 completed tasks are hidden by the current filters.',
      );
    });

    it('uses "is" for a single hidden task', () => {
      const copy = buildEmptyStateCopy({
        hasAnyTasks: true,
        hasSearchQuery: true,
        hidden: { future: 1, completed: 0 },
      });
      expect(copy.subtitle).toBe(
        'Try clearing the search. 1 future-dated task is hidden by the current filters.',
      );
    });

    it('uses "are" for a hidden total of two', () => {
      const copy = buildEmptyStateCopy({
        hasAnyTasks: true,
        hasSearchQuery: true,
        hidden: { future: 1, completed: 1 },
      });
      expect(copy.subtitle).toBe(
        'Try clearing the search. 1 future-dated and 1 completed tasks are hidden by the current filters.',
      );
    });

    it('never mentions a category with a zero count', () => {
      const copy = buildEmptyStateCopy({
        hasAnyTasks: true,
        hasSearchQuery: true,
        hidden: { future: 0, completed: 3 },
      });
      expect(copy.subtitle).not.toContain('future');
    });
  });

  describe('no search query', () => {
    it('blames both filters when both hide tasks', () => {
      const copy = buildEmptyStateCopy({
        hasAnyTasks: true,
        hasSearchQuery: false,
        hidden: { future: 2, completed: 1 },
      });
      expect(copy.title).toBe('All tasks are hidden by filters');
      expect(copy.subtitle).toBe(
        '2 future-dated and 1 completed tasks. Set "Future dated tasks" and "Completed tasks" to Show to see them.',
      );
    });

    it('blames the future-dating filter when only it hides tasks', () => {
      const copy = buildEmptyStateCopy({
        hasAnyTasks: true,
        hasSearchQuery: false,
        hidden: { future: 3, completed: 0 },
      });
      expect(copy.title).toBe('All tasks are future-dated');
      expect(copy.subtitle).toBe(
        '3 future-dated tasks. Set "Future dated tasks" to Show to see them.',
      );
    });

    it('blames the completed filter when only it hides tasks', () => {
      const copy = buildEmptyStateCopy({
        hasAnyTasks: true,
        hasSearchQuery: false,
        hidden: { future: 0, completed: 2 },
      });
      expect(copy.title).toBe('All tasks are completed');
      expect(copy.subtitle).toBe(
        '2 completed tasks. Set "Completed tasks" to Show to see them.',
      );
    });

    it('falls back to generic advice when nothing is hidden', () => {
      const copy = buildEmptyStateCopy({
        hasAnyTasks: true,
        hasSearchQuery: false,
        hidden: { future: 0, completed: 0 },
      });
      expect(copy.title).toBe('No matching tasks');
      expect(copy.subtitle).toBe(
        'Try clearing the search or switching view modes.',
      );
    });
  });
});
