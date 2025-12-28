import { Search } from '../src/search/search';
import { SearchTokenizer } from '../src/search/search-tokenizer';
import { SearchParser } from '../src/search/search-parser';
import { Task } from '../src/task';

describe('Search Prefix Filters', () => {

  const testTasks: Task[] = [
    {
      path: 'notes/journal/meeting.md',
      line: 1,
      rawText: 'TODO meeting about project planning #urgent',
      indent: '',
      listMarker: '-',
      text: 'meeting about project planning',
      state: 'TODO',
      completed: false,
      priority: 'high',
      scheduledDate: null,
      deadlineDate: null
    },
    {
      path: 'notes/work/tasks.md',
      line: 2,
      rawText: 'DOING work on urgent task #priority',
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
      path: 'notes/personal/hobbies.md',
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
      rawText: 'TODO watch "star wars" movie #entertainment',
      indent: '',
      listMarker: '-',
      text: 'watch "star wars" movie',
      state: 'TODO',
      completed: false,
      priority: 'low',
      scheduledDate: null,
      deadlineDate: null
    }
  ];

  describe('Path Filter', () => {
    it('should filter tasks by path', () => {
      const result = testTasks.filter(task => Search.evaluate('path:journal', task, false));
      expect(result.length).toBe(1);
      expect(result[0].path).toBe('notes/journal/meeting.md');
    });

    it('should handle case insensitive path filtering', () => {
      const result = testTasks.filter(task => Search.evaluate('path:JOURNAL', task, false));
      expect(result.length).toBe(1);
      expect(result[0].path).toBe('notes/journal/meeting.md');
    });

    it('should handle case sensitive path filtering', () => {
      const result = testTasks.filter(task => Search.evaluate('path:JOURNAL', task, true));
      expect(result.length).toBe(0);
    });
  });

  describe('File Filter', () => {
    it('should filter tasks by filename', () => {
      const result = testTasks.filter(task => Search.evaluate('file:meeting', task, false));
      expect(result.length).toBe(1);
      expect(result[0].path).toBe('notes/journal/meeting.md');
    });

    it('should filter tasks by partial filename', () => {
      const result = testTasks.filter(task => Search.evaluate('file:tasks', task, false));
      expect(result.length).toBe(1);
      expect(result[0].path).toBe('notes/work/tasks.md');
    });
  });

  describe('Tag Filter', () => {
    it('should filter tasks by tag', () => {
      const result = testTasks.filter(task => Search.evaluate('tag:#urgent', task, false));
      expect(result.length).toBe(1);
      expect(result[0].path).toBe('notes/journal/meeting.md');
    });

    it('should filter tasks by tag without hash', () => {
      const result = testTasks.filter(task => Search.evaluate('tag:urgent', task, false));
      expect(result.length).toBe(1);
      expect(result[0].path).toBe('notes/journal/meeting.md');
    });
  });

  describe('State Filter', () => {
    it('should filter tasks by state', () => {
      const result = testTasks.filter(task => Search.evaluate('state:DOING', task, false));
      expect(result.length).toBe(1);
      expect(result[0].path).toBe('notes/work/tasks.md');
    });

    it('should handle case insensitive state filtering', () => {
      const result = testTasks.filter(task => Search.evaluate('state:doing', task, false));
      expect(result.length).toBe(1);
      expect(result[0].path).toBe('notes/work/tasks.md');
    });
  });

  describe('Priority Filter', () => {
    it('should filter tasks by priority (high)', () => {
      const result = testTasks.filter(task => Search.evaluate('priority:high', task, false));
      expect(result.length).toBe(2);
    });

    it('should filter tasks by priority (A)', () => {
      const result = testTasks.filter(task => Search.evaluate('priority:A', task, false));
      expect(result.length).toBe(2);
    });

    it('should filter tasks by priority (low)', () => {
      const result = testTasks.filter(task => Search.evaluate('priority:low', task, false));
      expect(result.length).toBe(1);
      expect(result[0].path).toBe('notes/star-wars.md');
    });

    it('should filter tasks by priority (none)', () => {
      const result = testTasks.filter(task => Search.evaluate('priority:none', task, false));
      expect(result.length).toBe(1);
      expect(result[0].path).toBe('notes/personal/hobbies.md');
    });
  });

  describe('Content Filter', () => {
    it('should filter tasks by content', () => {
      const result = testTasks.filter(task => Search.evaluate('content:project', task, false));
      expect(result.length).toBe(1);
      expect(result[0].path).toBe('notes/journal/meeting.md');
    });

    it('should filter tasks by multi-word content', () => {
      const result = testTasks.filter(task => Search.evaluate('content:"star wars"', task, false));
      expect(result.length).toBe(1);
      expect(result[0].path).toBe('notes/star-wars.md');
    });
  });

  describe('Combined Filters', () => {
    it('should combine path and tag filters (implicit AND)', () => {
      const result = testTasks.filter(task => Search.evaluate('path:journal tag:#urgent', task, false));
      expect(result.length).toBe(1);
      expect(result[0].path).toBe('notes/journal/meeting.md');
    });

    it('should combine filters with OR operator', () => {
      const result = testTasks.filter(task => Search.evaluate('state:TODO OR state:DOING', task, false));
      // Should return 4 tasks: 3 with TODO state + 1 with DOING state
      expect(result.length).toBe(4);
    });

    it('should handle complex combined filters', () => {
      const result = testTasks.filter(task => Search.evaluate('priority:high -state:DOING', task, false));
      expect(result.length).toBe(1);
      expect(result[0].path).toBe('notes/journal/meeting.md');
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid prefix gracefully', () => {
      const result = testTasks.filter(task => Search.evaluate('invalid:test', task, false));
      // Should return false for all tasks when prefix is invalid
      expect(result.length).toBe(0);
    });

    it('should handle missing prefix value gracefully', () => {
      const result = testTasks.filter(task => Search.evaluate('path:', task, false));
      // Should return false for all tasks when value is missing
      expect(result.length).toBe(0);
    });
  });

  describe('Backward Compatibility', () => {
    it('should still support basic term search', () => {
      const result = testTasks.filter(task => Search.evaluate('meeting', task, false));
      expect(result.length).toBe(1);
      expect(result[0].path).toBe('notes/journal/meeting.md');
    });

    it('should still support phrase search', () => {
      const result = testTasks.filter(task => Search.evaluate('"star wars"', task, false));
      expect(result.length).toBe(1);
      expect(result[0].path).toBe('notes/star-wars.md');
    });

    it('should still support boolean operators', () => {
      const result = testTasks.filter(task => Search.evaluate('meeting OR personal', task, false));
      expect(result.length).toBe(2);
    });
  });
});