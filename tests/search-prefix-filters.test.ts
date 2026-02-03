import { Search } from '../src/search/search';
import { Task } from '../src/types/task';

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
      deadlineDate: null,
      urgency: null,
      isDailyNote: false,
      dailyNoteDate: null,
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
      deadlineDate: null,
      urgency: null,
      isDailyNote: false,
      dailyNoteDate: null,
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
      deadlineDate: null,
      urgency: null,
      isDailyNote: false,
      dailyNoteDate: null,
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
      deadlineDate: null,
      urgency: null,
      isDailyNote: false,
      dailyNoteDate: null,
    },
  ];

  describe('Path Filter', () => {
    it('should filter tasks by path', () => {
      const result = testTasks.filter((task) =>
        Search.evaluate('path:journal', task, false),
      );
      expect(result.length).toBe(1);
      expect(result[0].path).toBe('notes/journal/meeting.md');
    });

    it('should handle case insensitive path filtering', () => {
      const result = testTasks.filter((task) =>
        Search.evaluate('path:JOURNAL', task, false),
      );
      expect(result.length).toBe(1);
      expect(result[0].path).toBe('notes/journal/meeting.md');
    });

    it('should handle case sensitive path filtering', () => {
      const result = testTasks.filter((task) =>
        Search.evaluate('path:JOURNAL', task, true),
      );
      expect(result.length).toBe(0);
    });

    it('should match immediate parent directory and subfolders', () => {
      // Test case: path:examples should match:
      // - "examples/File.md" (immediate parent)
      // - "examples/folder 1/notes.md" (subfolder)
      // - "examples/folder 2/meeting.md" (subfolder)
      // But should NOT match "notes/examples.md" (where "examples" is not parent or ancestor)
      const testTasksForParent: Task[] = [
        {
          path: 'examples/File.md',
          line: 1,
          rawText: 'TODO example task',
          indent: '',
          listMarker: '-',
          text: 'example task',
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
          path: 'examples/folder 1/notes.md',
          line: 2,
          rawText: 'TODO notes in subfolder',
          indent: '',
          listMarker: '-',
          text: 'notes in subfolder',
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
          path: 'examples/folder 2/meeting.md',
          line: 3,
          rawText: 'TODO meeting in subfolder',
          indent: '',
          listMarker: '-',
          text: 'meeting in subfolder',
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
          path: 'notes/examples.md',
          line: 4,
          rawText: 'TODO notes example',
          indent: '',
          listMarker: '-',
          text: 'notes example',
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

      // Should match all examples/... files (3 matches)
      const result = testTasksForParent.filter((task) =>
        Search.evaluate('path:examples', task, false),
      );
      expect(result.length).toBe(3);
      expect(result[0].path).toBe('examples/File.md');
      expect(result[1].path).toBe('examples/folder 1/notes.md');
      expect(result[2].path).toBe('examples/folder 2/meeting.md');

      // Should NOT include "notes/examples.md"
      expect(result.some((task) => task.path === 'notes/examples.md')).toBe(
        false,
      );
    });
  });

  describe('File Filter', () => {
    it('should filter tasks by filename', () => {
      const result = testTasks.filter((task) =>
        Search.evaluate('file:meeting', task, false),
      );
      expect(result.length).toBe(1);
      expect(result[0].path).toBe('notes/journal/meeting.md');
    });

    it('should filter tasks by partial filename', () => {
      const result = testTasks.filter((task) =>
        Search.evaluate('file:tasks', task, false),
      );
      expect(result.length).toBe(1);
      expect(result[0].path).toBe('notes/work/tasks.md');
    });

    it('should filter tasks by filename with hyphens', () => {
      const result = testTasks.filter((task) =>
        Search.evaluate('file:star-wars', task, false),
      );
      expect(result.length).toBe(1);
      expect(result[0].path).toBe('notes/star-wars.md');
    });

    it('should filter tasks by partial filename with hyphens', () => {
      const result = testTasks.filter((task) =>
        Search.evaluate('file:star', task, false),
      );
      expect(result.length).toBe(1);
      expect(result[0].path).toBe('notes/star-wars.md');
    });

    it('should filter tasks by exact filename with multiple hyphens', () => {
      // Create a test task with a date-like filename
      const testTask: Task = {
        path: 'notes/2025-03-28.md',
        line: 1,
        rawText: 'TODO meeting on 2025-03-28',
        indent: '',
        listMarker: '-',
        text: 'meeting on 2025-03-28',
        state: 'TODO',
        completed: false,
        priority: null,
        scheduledDate: null,
        deadlineDate: null,
      };

      const result = Search.evaluate('file:2025-03-28.md', testTask, false);
      expect(result).toBe(true);
    });

    it('should filter tasks by path with hyphens', () => {
      // Create a test task with a path containing hyphens
      const testTask: Task = {
        path: 'notes/2025-meetings/project-planning.md',
        line: 1,
        rawText: 'TODO project planning meeting',
        indent: '',
        listMarker: '-',
        text: 'project planning meeting',
        state: 'TODO',
        completed: false,
        priority: null,
        scheduledDate: null,
        deadlineDate: null,
      };

      const result = Search.evaluate('path:2025-meetings', testTask, false);
      expect(result).toBe(true);
    });

    it('should handle hyphens in state values', () => {
      // Create a test task with a custom state containing hyphens
      const testTask: Task = {
        path: 'notes/test.md',
        line: 1,
        rawText: 'IN-PROGRESS task with hyphenated state',
        indent: '',
        listMarker: '-',
        text: 'task with hyphenated state',
        state: 'IN-PROGRESS',
        completed: false,
        priority: null,
        scheduledDate: null,
        deadlineDate: null,
      };

      const result = Search.evaluate('state:IN-PROGRESS', testTask, false);
      expect(result).toBe(true);
    });

    it('should handle hyphens in content values', () => {
      // Create a test task with content containing hyphens
      const testTask: Task = {
        path: 'notes/test.md',
        line: 1,
        rawText: 'TODO task about state-of-the-art technology',
        indent: '',
        listMarker: '-',
        text: 'task about state-of-the-art technology',
        state: 'TODO',
        completed: false,
        priority: null,
        scheduledDate: null,
        deadlineDate: null,
      };

      const result = Search.evaluate(
        'content:state-of-the-art',
        testTask,
        false,
      );
      expect(result).toBe(true);
    });
  });

  describe('Tag Filter', () => {
    it('should filter tasks by tag', () => {
      const result = testTasks.filter((task) =>
        Search.evaluate('tag:#urgent', task, false),
      );
      expect(result.length).toBe(1);
      expect(result[0].path).toBe('notes/journal/meeting.md');
    });

    it('should filter tasks by tag without hash', () => {
      const result = testTasks.filter((task) =>
        Search.evaluate('tag:urgent', task, false),
      );
      expect(result.length).toBe(1);
      expect(result[0].path).toBe('notes/journal/meeting.md');
    });

    it('should filter tasks by tag with dash', () => {
      // Create a test task with a tag containing a dash
      const testTaskWithDash: Task = {
        path: 'notes/test/task-with-dash.md',
        line: 1,
        rawText: 'TODO test task with dash #test-tag',
        indent: '',
        listMarker: '-',
        text: 'test task with dash',
        state: 'TODO',
        completed: false,
        priority: null,
        scheduledDate: null,
        deadlineDate: null,
      };

      const result = [testTaskWithDash].filter((task) =>
        Search.evaluate('tag:test-tag', task, false),
      );
      expect(result.length).toBe(1);
      expect(result[0].path).toBe('notes/test/task-with-dash.md');
    });
  });

  describe('State Filter', () => {
    it('should filter tasks by state', () => {
      const result = testTasks.filter((task) =>
        Search.evaluate('state:DOING', task, false),
      );
      expect(result.length).toBe(1);
      expect(result[0].path).toBe('notes/work/tasks.md');
    });

    it('should handle case insensitive state filtering', () => {
      const result = testTasks.filter((task) =>
        Search.evaluate('state:doing', task, false),
      );
      expect(result.length).toBe(1);
      expect(result[0].path).toBe('notes/work/tasks.md');
    });
  });

  describe('Priority Filter', () => {
    it('should filter tasks by priority (high)', () => {
      const result = testTasks.filter((task) =>
        Search.evaluate('priority:high', task, false),
      );
      expect(result.length).toBe(2);
    });

    it('should filter tasks by priority (A)', () => {
      const result = testTasks.filter((task) =>
        Search.evaluate('priority:A', task, false),
      );
      expect(result.length).toBe(2);
    });

    it('should filter tasks by priority (low)', () => {
      const result = testTasks.filter((task) =>
        Search.evaluate('priority:low', task, false),
      );
      expect(result.length).toBe(1);
      expect(result[0].path).toBe('notes/star-wars.md');
    });

    it('should filter tasks by priority (none)', () => {
      const result = testTasks.filter((task) =>
        Search.evaluate('priority:none', task, false),
      );
      expect(result.length).toBe(1);
      expect(result[0].path).toBe('notes/personal/hobbies.md');
    });
  });

  describe('Content Filter', () => {
    it('should filter tasks by content', () => {
      const result = testTasks.filter((task) =>
        Search.evaluate('content:project', task, false),
      );
      expect(result.length).toBe(1);
      expect(result[0].path).toBe('notes/journal/meeting.md');
    });

    it('should filter tasks by multi-word content', () => {
      const result = testTasks.filter((task) =>
        Search.evaluate('content:"star wars"', task, false),
      );
      expect(result.length).toBe(1);
      expect(result[0].path).toBe('notes/star-wars.md');
    });
  });

  describe('Combined Filters', () => {
    it('should combine path and tag filters (implicit AND)', () => {
      const result = testTasks.filter((task) =>
        Search.evaluate('path:journal tag:#urgent', task, false),
      );
      expect(result.length).toBe(1);
      expect(result[0].path).toBe('notes/journal/meeting.md');
    });

    it('should combine filters with OR operator', () => {
      const result = testTasks.filter((task) =>
        Search.evaluate('state:TODO OR state:DOING', task, false),
      );
      // Should return 4 tasks: 3 with TODO state + 1 with DOING state
      expect(result.length).toBe(4);
    });

    it('should handle complex combined filters', () => {
      const result = testTasks.filter((task) =>
        Search.evaluate('priority:high -state:DOING', task, false),
      );
      expect(result.length).toBe(1);
      expect(result[0].path).toBe('notes/journal/meeting.md');
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid prefix gracefully', () => {
      const result = testTasks.filter((task) =>
        Search.evaluate('invalid:test', task, false),
      );
      // Should return false for all tasks when prefix is invalid
      expect(result.length).toBe(0);
    });

    it('should handle missing prefix value gracefully', () => {
      const result = testTasks.filter((task) =>
        Search.evaluate('path:', task, false),
      );
      // Should return false for all tasks when value is missing
      expect(result.length).toBe(0);
    });
  });

  describe('Backward Compatibility', () => {
    it('should still support basic term search', () => {
      const result = testTasks.filter((task) =>
        Search.evaluate('meeting', task, false),
      );
      expect(result.length).toBe(1);
      expect(result[0].path).toBe('notes/journal/meeting.md');
    });

    it('should still support phrase search', () => {
      const result = testTasks.filter((task) =>
        Search.evaluate('"star wars"', task, false),
      );
      expect(result.length).toBe(1);
      expect(result[0].path).toBe('notes/star-wars.md');
    });

    it('should still support boolean operators', () => {
      const result = testTasks.filter((task) =>
        Search.evaluate('meeting OR personal', task, false),
      );
      expect(result.length).toBe(2);
    });
  });
});
