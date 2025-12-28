import { Search } from '../src/search/search';
import { Task } from '../src/task';

describe('Search functionality', () => {
  
  const testTasks: Task[] = [
    {
      path: 'notes/meeting.md',
      line: 1,
      rawText: 'TODO meeting about project planning',
      indent: '',
      listMarker: '-',
      text: 'meeting about project planning',
      state: 'TODO',
      completed: false,
      priority: null,
      scheduledDate: null,
      deadlineDate: null
    },
    {
      path: 'notes/work.md',
      line: 2,
      rawText: 'DOING work on urgent task',
      indent: '',
      listMarker: '-',
      text: 'work on urgent task',
      state: 'DOING',
      completed: false,
      priority: 'high',
      scheduledDate: null,
      deadlineDate: null
    },
    {
      path: 'notes/personal.md',
      line: 3,
      rawText: 'TODO personal meetup with friends',
      indent: '',
      listMarker: '-',
      text: 'personal meetup with friends',
      state: 'TODO',
      completed: false,
      priority: null,
      scheduledDate: null,
      deadlineDate: null
    },
    {
      path: 'notes/star-wars.md',
      line: 4,
      rawText: 'TODO watch "star wars" movie',
      indent: '',
      listMarker: '-',
      text: 'watch "star wars" movie',
      state: 'TODO',
      completed: false,
      priority: null,
      scheduledDate: null,
      deadlineDate: null
    }
  ];

  describe('Basic term search', () => {
    it('should find tasks containing single term', () => {
      const result = testTasks.filter(task => Search.evaluate('meeting', task, false));
      expect(result.length).toBe(1);
      expect(result[0].path).toBe('notes/meeting.md');
    });

    it('should find tasks containing multiple terms (AND)', () => {
      const result = testTasks.filter(task => Search.evaluate('work urgent', task, false));
      expect(result.length).toBe(1);
      expect(result[0].path).toBe('notes/work.md');
    });
  });

  describe('OR logic', () => {
    it('should find tasks matching either term', () => {
      const result = testTasks.filter(task => Search.evaluate('meeting OR personal', task, false));
      expect(result.length).toBe(2);
      expect(result.map(t => t.path)).toContain('notes/meeting.md');
      expect(result.map(t => t.path)).toContain('notes/personal.md');
    });
  });

  describe('Exact phrase search', () => {
    it('should find exact phrase matches', () => {
      const result = testTasks.filter(task => Search.evaluate('"star wars"', task, false));
      expect(result.length).toBe(1);
      expect(result[0].path).toBe('notes/star-wars.md');
    });

    it('should match exact word in phrase', () => {
      const result = testTasks.filter(task => Search.evaluate('"star"', task, false));
      expect(result.length).toBe(1); // "star" appears as a word in "star wars"
      expect(result[0].path).toBe('notes/star-wars.md');
    });

    it('should not match partial word in phrase', () => {
      // Create a task with "starfish" to test partial word matching
      const starfishTask: Task = {
        path: 'notes/test.md',
        line: 1,
        rawText: 'TODO find starfish in ocean',
        indent: '',
        listMarker: '-',
        text: 'find starfish in ocean',
        state: 'TODO',
        completed: false,
        priority: null,
        scheduledDate: null,
        deadlineDate: null
      };
      
      const result = Search.evaluate('"star"', starfishTask, false);
      expect(result).toBe(false); // "star" should not match "starfish"
    });
  });

  describe('NOT logic', () => {
    it('should exclude tasks containing term', () => {
      const result = testTasks.filter(task => Search.evaluate('work -urgent', task, false));
      expect(result.length).toBe(0); // The work task contains "urgent"
    });

    it('should find tasks without excluded term', () => {
      const result = testTasks.filter(task => Search.evaluate('meeting -urgent', task, false));
      expect(result.length).toBe(1);
      expect(result[0].path).toBe('notes/meeting.md');
    });
  });

  describe('Complex combinations', () => {
    it('should handle parentheses grouping', () => {
      const result = testTasks.filter(task => Search.evaluate('(meeting OR personal) -urgent', task, false));
      expect(result.length).toBe(2);
      expect(result.map(t => t.path)).toContain('notes/meeting.md');
      expect(result.map(t => t.path)).toContain('notes/personal.md');
    });
  });

  describe('Case sensitivity', () => {
    it('should be case insensitive by default', () => {
      const result = testTasks.filter(task => Search.evaluate('MEETING', task, false));
      expect(result.length).toBe(1);
      expect(result[0].path).toBe('notes/meeting.md');
    });

    it('should be case sensitive when enabled', () => {
      const result = testTasks.filter(task => Search.evaluate('MEETING', task, true));
      expect(result.length).toBe(0); // No task has "MEETING" in uppercase
    });
  });

  describe('Error handling', () => {
    it('should handle invalid queries gracefully', () => {
      const result = testTasks.filter(task => Search.evaluate('meeting OR', task, false));
      // Should return false for all tasks when query is invalid
      expect(result.length).toBe(0);
    });

    it('should return error message for invalid queries', () => {
      const error = Search.getError('meeting OR');
      expect(error).not.toBeNull();
      expect(error).toContain('Unexpected end');
    });
  });
});