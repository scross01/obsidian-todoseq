import { Search } from '../src/search/search';
import { Task } from '../src/types/task';
import { TodoTrackerSettings } from '../src/settings/settings-types';
import { createBaseTask, createBaseSettings } from './helpers/test-helper';

describe('Search functionality', () => {
  const testTasks: Task[] = [
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
    }),
  ];

  describe('Basic term search', () => {
    it('should find tasks containing single term', async () => {
      const results = await Promise.all(
        testTasks.map(async (task) => {
          return await Search.evaluate('meeting', task, false);
        }),
      );
      const result = testTasks.filter((_, index) => results[index]);
      expect(result.length).toBe(1);
      expect(result[0].path).toBe('notes/meeting.md');
    });

    it('should find tasks containing multiple terms (AND)', async () => {
      const results = await Promise.all(
        testTasks.map(async (task) => {
          return await Search.evaluate('work urgent', task, false);
        }),
      );
      const result = testTasks.filter((_, index) => results[index]);
      expect(result.length).toBe(1);
      expect(result[0].path).toBe('notes/work.md');
    });
  });

  describe('OR logic', () => {
    it('should find tasks matching either term', async () => {
      const results = await Promise.all(
        testTasks.map(async (task) => {
          return await Search.evaluate('meeting OR personal', task, false);
        }),
      );
      const result = testTasks.filter((_, index) => results[index]);
      expect(result.length).toBe(2);
      expect(result.map((t) => t.path)).toContain('notes/meeting.md');
      expect(result.map((t) => t.path)).toContain('notes/personal.md');
    });
  });

  describe('Exact phrase search', () => {
    it('should find exact phrase matches', async () => {
      const results = await Promise.all(
        testTasks.map(async (task) => {
          return await Search.evaluate('"star wars"', task, false);
        }),
      );
      const result = testTasks.filter((_, index) => results[index]);
      expect(result.length).toBe(1);
      expect(result[0].path).toBe('notes/star-wars.md');
    });

    it('should match exact word in phrase', async () => {
      const results = await Promise.all(
        testTasks.map(async (task) => {
          return await Search.evaluate('"star"', task, false);
        }),
      );
      const result = testTasks.filter((_, index) => results[index]);
      expect(result.length).toBe(1); // "star" appears as a word in "star wars"
      expect(result[0].path).toBe('notes/star-wars.md');
    });

    it('should not match partial word in phrase', async () => {
      // Create a task with "starfish" to test partial word matching
      const starfishTask: Task = createBaseTask({
        path: 'notes/test.md',
        line: 1,
        rawText: 'TODO find starfish in ocean',
        listMarker: '-',
        text: 'find starfish in ocean',
      });

      const result = await Search.evaluate('"star"', starfishTask, false);
      expect(result).toBe(false); // "star" should not match "starfish"
    });
  });

  describe('NOT logic', () => {
    it('should exclude tasks containing term', async () => {
      const results = await Promise.all(
        testTasks.map(async (task) => {
          return await Search.evaluate('work -urgent', task, false);
        }),
      );
      const result = testTasks.filter((_, index) => results[index]);
      expect(result.length).toBe(0); // The work task contains "urgent"
    });

    it('should find tasks without excluded term', async () => {
      const results = await Promise.all(
        testTasks.map(async (task) => {
          return await Search.evaluate('meeting -urgent', task, false);
        }),
      );
      const result = testTasks.filter((_, index) => results[index]);
      expect(result.length).toBe(1);
      expect(result[0].path).toBe('notes/meeting.md');
    });
  });

  describe('Complex combinations', () => {
    it('should handle parentheses grouping', async () => {
      const results = await Promise.all(
        testTasks.map(async (task) => {
          return await Search.evaluate(
            '(meeting OR personal) -urgent',
            task,
            false,
          );
        }),
      );
      const result = testTasks.filter((_, index) => results[index]);
      expect(result.length).toBe(2);
      expect(result.map((t) => t.path)).toContain('notes/meeting.md');
      expect(result.map((t) => t.path)).toContain('notes/personal.md');
    });
  });

  describe('Case sensitivity', () => {
    it('should be case insensitive by default', async () => {
      const results = await Promise.all(
        testTasks.map(async (task) => {
          return await Search.evaluate('MEETING', task, false);
        }),
      );
      const result = testTasks.filter((_, index) => results[index]);
      expect(result.length).toBe(1);
      expect(result[0].path).toBe('notes/meeting.md');
    });

    it('should be case sensitive when enabled', async () => {
      const results = await Promise.all(
        testTasks.map(async (task) => {
          return await Search.evaluate('MEETING', task, true);
        }),
      );
      const result = testTasks.filter((_, index) => results[index]);
      expect(result.length).toBe(0); // No task has "MEETING" in uppercase
    });
  });

  describe('Error handling', () => {
    it('should handle invalid queries gracefully', async () => {
      const results = await Promise.all(
        testTasks.map(async (task) => {
          return await Search.evaluate('meeting OR', task, false);
        }),
      );
      const result = testTasks.filter((_, index) => results[index]);
      // Should return false for all tasks when query is invalid
      expect(result.length).toBe(0);
    });

    it('should return error message for invalid queries', () => {
      const error = Search.getError('meeting OR');
      expect(error).not.toBeNull();
      expect(error).toContain('Unexpected end');
    });
  });

  describe('parse() method', () => {
    it('should parse valid query into AST', () => {
      const result = Search.parse('meeting OR personal');
      expect(result).toBeDefined();
      expect(result.type).toBe('or');
      expect(result.children).toHaveLength(2);
    });

    it('should parse complex query with parentheses', () => {
      const result = Search.parse('(meeting OR personal) -urgent');
      expect(result).toBeDefined();
      expect(result.type).toBe('and');
      expect(result.children).toHaveLength(2);
    });

    it('should throw SearchError for invalid query', () => {
      expect(() => Search.parse('meeting OR')).toThrow();
    });
  });

  describe('validate() method', () => {
    it('should return true for valid queries', () => {
      expect(Search.validate('meeting')).toBe(true);
      expect(Search.validate('meeting OR personal')).toBe(true);
      expect(Search.validate('(meeting OR personal) -urgent')).toBe(true);
    });

    it('should return false for invalid queries', () => {
      expect(Search.validate('meeting OR')).toBe(false);
      expect(Search.validate('AND meeting')).toBe(false);
      expect(Search.validate('meeting AND')).toBe(false);
    });
  });

  describe('getError() method', () => {
    it('should return null for valid queries', () => {
      const error = Search.getError('meeting OR personal');
      expect(error).toBeNull();
    });

    it('should return error message for parse errors', () => {
      const error = Search.getError('meeting OR');
      expect(error).not.toBeNull();
      expect(error).toContain('Unexpected end');
    });

    it('should return generic error for non-SearchError exceptions', () => {
      // This tests the fallback case where an unexpected error occurs
      const originalParse = Search.parse;
      Search.parse = jest.fn(() => {
        throw new Error('Unexpected error');
      });

      const error = Search.getError('test');
      expect(error).toBe('Invalid search query');

      // Restore original method
      Search.parse = originalParse;
    });
  });

  describe('evaluate() method with settings', () => {
    const testTask: Task = createBaseTask({
      path: 'notes/test.md',
      line: 1,
      rawText: 'TODO test task with content',
      listMarker: '-',
      text: 'test task with content',
    });

    const mockSettings: TodoTrackerSettings = createBaseSettings();

    it('should evaluate with settings parameter', async () => {
      const result = await Search.evaluate(
        'content',
        testTask,
        false,
        mockSettings,
      );
      expect(result).toBe(true);
    });

    it('should handle invalid query with settings gracefully', async () => {
      const result = await Search.evaluate(
        'content OR',
        testTask,
        false,
        mockSettings,
      );
      expect(result).toBe(false);
    });

    it('should handle case sensitivity with settings', async () => {
      const result = await Search.evaluate(
        'CONTENT',
        testTask,
        true,
        mockSettings,
      );
      expect(result).toBe(false); // Case sensitive should not match
    });
  });
});
