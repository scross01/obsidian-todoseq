import { Search } from '../src/search/search';
import { Task } from '../src/types/task';
import { createBaseTask, createBaseSettings } from './helpers/test-helper';

describe('Search Prefix Filters', () => {
  const testTasks: Task[] = [
    createBaseTask({
      path: 'notes/journal/meeting.md',
      line: 1,
      rawText: 'TODO meeting about project planning #urgent',
      listMarker: '-',
      text: 'meeting about project planning',
      state: 'TODO',
      priority: 'high',
    }),
    createBaseTask({
      path: 'notes/work/tasks.md',
      line: 2,
      rawText: 'DOING work on urgent task #priority',
      listMarker: '-',
      text: 'work on urgent task',
      state: 'DOING',
      priority: 'high',
    }),
    createBaseTask({
      path: 'notes/personal/hobbies.md',
      line: 3,
      rawText: 'TODO personal meetup with friends',
      listMarker: '-',
      text: 'personal meetup with friends',
    }),
    createBaseTask({
      path: 'notes/star-wars.md',
      line: 4,
      rawText: 'TODO watch "star wars" movie #entertainment',
      listMarker: '-',
      text: 'watch "star wars" movie',
      priority: 'low',
    }),
  ];

  describe('Path Filter', () => {
    it('should filter tasks by path', async () => {
      const results = await Promise.all(
        testTasks.map(async (task) => {
          return await Search.evaluate('path:journal', task, false);
        }),
      );
      const result = testTasks.filter((_, index) => results[index]);
      expect(result.length).toBe(1);
      expect(result[0].path).toBe('notes/journal/meeting.md');
    });

    it('should handle case insensitive path filtering', async () => {
      const results = await Promise.all(
        testTasks.map(async (task) => {
          return await Search.evaluate('path:JOURNAL', task, false);
        }),
      );
      const result = testTasks.filter((_, index) => results[index]);
      expect(result.length).toBe(1);
      expect(result[0].path).toBe('notes/journal/meeting.md');
    });

    it('should handle case sensitive path filtering', async () => {
      const results = await Promise.all(
        testTasks.map(async (task) => {
          return await Search.evaluate('path:JOURNAL', task, true);
        }),
      );
      const result = testTasks.filter((_, index) => results[index]);
      expect(result.length).toBe(0);
    });

    it('should match immediate parent directory and subfolders', async () => {
      // Test case: path:examples should match:
      // - "examples/File.md" (immediate parent)
      // - "examples/folder 1/notes.md" (subfolder)
      // - "examples/folder 2/meeting.md" (subfolder)
      // But should NOT match "notes/examples.md" (where "examples" is not parent or ancestor)
      const testTasksForParent: Task[] = [
        createBaseTask({
          path: 'examples/File.md',
          line: 1,
          rawText: 'TODO example task',
          listMarker: '-',
          text: 'example task',
        }),
        createBaseTask({
          path: 'examples/folder 1/notes.md',
          line: 2,
          rawText: 'TODO notes in subfolder',
          listMarker: '-',
          text: 'notes in subfolder',
        }),
        createBaseTask({
          path: 'examples/folder 2/meeting.md',
          line: 3,
          rawText: 'TODO meeting in subfolder',
          listMarker: '-',
          text: 'meeting in subfolder',
        }),
        createBaseTask({
          path: 'notes/examples.md',
          line: 4,
          rawText: 'TODO notes example',
          listMarker: '-',
          text: 'notes example',
        }),
      ];

      // Should match all examples/... files (3 matches)
      const results = await Promise.all(
        testTasksForParent.map(async (task) => {
          return await Search.evaluate('path:examples', task, false);
        }),
      );
      const result = testTasksForParent.filter((_, index) => results[index]);
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
    it('should filter tasks by filename', async () => {
      const results = await Promise.all(
        testTasks.map(async (task) => {
          return await Search.evaluate('file:meeting', task, false);
        }),
      );
      const result = testTasks.filter((_, index) => results[index]);
      expect(result.length).toBe(1);
      expect(result[0].path).toBe('notes/journal/meeting.md');
    });

    it('should filter tasks by partial filename', async () => {
      const results = await Promise.all(
        testTasks.map(async (task) => {
          return await Search.evaluate('file:tasks', task, false);
        }),
      );
      const result = testTasks.filter((_, index) => results[index]);
      expect(result.length).toBe(1);
      expect(result[0].path).toBe('notes/work/tasks.md');
    });

    it('should filter tasks by filename with hyphens', async () => {
      const results = await Promise.all(
        testTasks.map(async (task) => {
          return await Search.evaluate('file:star-wars', task, false);
        }),
      );
      const result = testTasks.filter((_, index) => results[index]);
      expect(result.length).toBe(1);
      expect(result[0].path).toBe('notes/star-wars.md');
    });

    it('should filter tasks by partial filename with hyphens', async () => {
      const results = await Promise.all(
        testTasks.map(async (task) => {
          return await Search.evaluate('file:star', task, false);
        }),
      );
      const result = testTasks.filter((_, index) => results[index]);
      expect(result.length).toBe(1);
      expect(result[0].path).toBe('notes/star-wars.md');
    });

    it('should filter tasks by exact filename with multiple hyphens', async () => {
      // Create a test task with a date-like filename
      const testTask: Task = createBaseTask({
        path: 'notes/2025-03-28.md',
        line: 1,
        rawText: 'TODO meeting on 2025-03-28',
        listMarker: '-',
        text: 'meeting on 2025-03-28',
      });

      const result = await Search.evaluate(
        'file:2025-03-28.md',
        testTask,
        false,
      );
      expect(result).toBe(true);
    });

    it('should filter tasks by path with hyphens', async () => {
      // Create a test task with a path containing hyphens
      const testTask: Task = createBaseTask({
        path: 'notes/2025-meetings/project-planning.md',
        line: 1,
        rawText: 'TODO project planning meeting',
        listMarker: '-',
        text: 'project planning meeting',
      });

      const result = await Search.evaluate(
        'path:2025-meetings',
        testTask,
        false,
      );
      expect(result).toBe(true);
    });

    it('should handle hyphens in state values', async () => {
      // Create a test task with a custom state containing hyphens
      const testTask: Task = createBaseTask({
        path: 'notes/test.md',
        line: 1,
        rawText: 'IN-PROGRESS task with hyphenated state',
        listMarker: '-',
        text: 'task with hyphenated state',
        state: 'IN-PROGRESS',
      });

      const result = await Search.evaluate(
        'state:IN-PROGRESS',
        testTask,
        false,
      );
      expect(result).toBe(true);
    });

    it('should handle hyphens in content values', async () => {
      // Create a test task with content containing hyphens
      const testTask: Task = createBaseTask({
        path: 'notes/test.md',
        line: 1,
        rawText: 'TODO task about state-of-the-art technology',
        listMarker: '-',
        text: 'task about state-of-the-art technology',
      });

      const result = await Search.evaluate(
        'content:state-of-the-art',
        testTask,
        false,
      );
      expect(result).toBe(true);
    });
  });

  describe('Tag Filter', () => {
    it('should filter tasks by tag', async () => {
      const results = await Promise.all(
        testTasks.map(async (task) => {
          return await Search.evaluate('tag:#urgent', task, false);
        }),
      );
      const result = testTasks.filter((_, index) => results[index]);
      expect(result.length).toBe(1);
      expect(result[0].path).toBe('notes/journal/meeting.md');
    });

    it('should filter tasks by tag without hash', async () => {
      const results = await Promise.all(
        testTasks.map(async (task) => {
          return await Search.evaluate('tag:urgent', task, false);
        }),
      );
      const result = testTasks.filter((_, index) => results[index]);
      expect(result.length).toBe(1);
      expect(result[0].path).toBe('notes/journal/meeting.md');
    });

    it('should filter tasks by tag with dash', async () => {
      // Create a test task with a tag containing a dash
      const testTaskWithDash: Task = createBaseTask({
        path: 'notes/test/task-with-dash.md',
        line: 1,
        rawText: 'TODO test task with dash #test-tag',
        listMarker: '-',
        text: 'test task with dash',
      });

      const results = await Promise.all(
        [testTaskWithDash].map(async (task) => {
          return await Search.evaluate('tag:test-tag', task, false);
        }),
      );
      const result = [testTaskWithDash].filter((_, index) => results[index]);
      expect(result.length).toBe(1);
      expect(result[0].path).toBe('notes/test/task-with-dash.md');
    });
  });

  describe('State Filter', () => {
    it('should filter tasks by state', async () => {
      const results = await Promise.all(
        testTasks.map(async (task) => {
          return await Search.evaluate('state:DOING', task, false);
        }),
      );
      const result = testTasks.filter((_, index) => results[index]);
      expect(result.length).toBe(1);
      expect(result[0].path).toBe('notes/work/tasks.md');
    });

    it('should handle case insensitive state filtering', async () => {
      const results = await Promise.all(
        testTasks.map(async (task) => {
          return await Search.evaluate('state:doing', task, false);
        }),
      );
      const result = testTasks.filter((_, index) => results[index]);
      expect(result.length).toBe(1);
      expect(result[0].path).toBe('notes/work/tasks.md');
    });
  });

  describe('Priority Filter', () => {
    it('should filter tasks by priority (high)', async () => {
      const results = await Promise.all(
        testTasks.map(async (task) => {
          return await Search.evaluate('priority:high', task, false);
        }),
      );
      const result = testTasks.filter((_, index) => results[index]);
      expect(result.length).toBe(2);
    });

    it('should filter tasks by priority (A)', async () => {
      const results = await Promise.all(
        testTasks.map(async (task) => {
          return await Search.evaluate('priority:A', task, false);
        }),
      );
      const result = testTasks.filter((_, index) => results[index]);
      expect(result.length).toBe(2);
    });

    it('should filter tasks by priority (low)', async () => {
      const results = await Promise.all(
        testTasks.map(async (task) => {
          return await Search.evaluate('priority:low', task, false);
        }),
      );
      const result = testTasks.filter((_, index) => results[index]);
      expect(result.length).toBe(1);
      expect(result[0].path).toBe('notes/star-wars.md');
    });

    it('should filter tasks by priority (none)', async () => {
      const results = await Promise.all(
        testTasks.map(async (task) => {
          return await Search.evaluate('priority:none', task, false);
        }),
      );
      const result = testTasks.filter((_, index) => results[index]);
      expect(result.length).toBe(1);
      expect(result[0].path).toBe('notes/personal/hobbies.md');
    });
  });

  describe('Content Filter', () => {
    it('should filter tasks by content', async () => {
      const results = await Promise.all(
        testTasks.map(async (task) => {
          return await Search.evaluate('content:project', task, false);
        }),
      );
      const result = testTasks.filter((_, index) => results[index]);
      expect(result.length).toBe(1);
      expect(result[0].path).toBe('notes/journal/meeting.md');
    });

    it('should filter tasks by multi-word content', async () => {
      const results = await Promise.all(
        testTasks.map(async (task) => {
          return await Search.evaluate('content:"star wars"', task, false);
        }),
      );
      const result = testTasks.filter((_, index) => results[index]);
      expect(result.length).toBe(1);
      expect(result[0].path).toBe('notes/star-wars.md');
    });
  });

  describe('Combined Filters', () => {
    it('should combine path and tag filters (implicit AND)', async () => {
      const results = await Promise.all(
        testTasks.map(async (task) => {
          return await Search.evaluate('path:journal tag:#urgent', task, false);
        }),
      );
      const result = testTasks.filter((_, index) => results[index]);
      expect(result.length).toBe(1);
      expect(result[0].path).toBe('notes/journal/meeting.md');
    });

    it('should combine filters with OR operator', async () => {
      const results = await Promise.all(
        testTasks.map(async (task) => {
          return await Search.evaluate(
            'state:TODO OR state:DOING',
            task,
            false,
          );
        }),
      );
      const result = testTasks.filter((_, index) => results[index]);
      // Should return 4 tasks: 3 with TODO state + 1 with DOING state
      expect(result.length).toBe(4);
    });

    it('should handle complex combined filters', async () => {
      const results = await Promise.all(
        testTasks.map(async (task) => {
          return await Search.evaluate(
            'priority:high -state:DOING',
            task,
            false,
          );
        }),
      );
      const result = testTasks.filter((_, index) => results[index]);
      expect(result.length).toBe(1);
      expect(result[0].path).toBe('notes/journal/meeting.md');
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid prefix gracefully', async () => {
      const results = await Promise.all(
        testTasks.map(async (task) => {
          return await Search.evaluate('invalid:test', task, false);
        }),
      );
      const result = testTasks.filter((_, index) => results[index]);
      // Should return false for all tasks when prefix is invalid
      expect(result.length).toBe(0);
    });

    it('should handle missing prefix value gracefully', async () => {
      const results = await Promise.all(
        testTasks.map(async (task) => {
          return await Search.evaluate('path:', task, false);
        }),
      );
      const result = testTasks.filter((_, index) => results[index]);
      // Should return false for all tasks when value is missing
      expect(result.length).toBe(0);
    });
  });

  describe('Backward Compatibility', () => {
    it('should still support basic term search', async () => {
      const results = await Promise.all(
        testTasks.map(async (task) => {
          return await Search.evaluate('meeting', task, false);
        }),
      );
      const result = testTasks.filter((_, index) => results[index]);
      expect(result.length).toBe(1);
      expect(result[0].path).toBe('notes/journal/meeting.md');
    });

    it('should still support phrase search', async () => {
      const results = await Promise.all(
        testTasks.map(async (task) => {
          return await Search.evaluate('"star wars"', task, false);
        }),
      );
      const result = testTasks.filter((_, index) => results[index]);
      expect(result.length).toBe(1);
      expect(result[0].path).toBe('notes/star-wars.md');
    });

    it('should still support boolean operators', async () => {
      const results = await Promise.all(
        testTasks.map(async (task) => {
          return await Search.evaluate('meeting OR personal', task, false);
        }),
      );
      const result = testTasks.filter((_, index) => results[index]);
      expect(result.length).toBe(2);
    });
  });

  describe('State Group Keywords', () => {
    const groupTestTasks: Task[] = [
      createBaseTask({
        path: 'notes/todo.md',
        line: 1,
        rawText: 'TODO task',
        listMarker: '-',
        text: 'task',
        state: 'TODO',
      }),
      createBaseTask({
        path: 'notes/later.md',
        line: 2,
        rawText: 'LATER task',
        listMarker: '-',
        text: 'task',
        state: 'LATER',
      }),
      createBaseTask({
        path: 'notes/doing.md',
        line: 3,
        rawText: 'DOING task',
        listMarker: '-',
        text: 'task',
        state: 'DOING',
      }),
      createBaseTask({
        path: 'notes/now.md',
        line: 4,
        rawText: 'NOW task',
        listMarker: '-',
        text: 'task',
        state: 'NOW',
      }),
      createBaseTask({
        path: 'notes/inprogress.md',
        line: 5,
        rawText: 'IN-PROGRESS task',
        listMarker: '-',
        text: 'task',
        state: 'IN-PROGRESS',
      }),
      createBaseTask({
        path: 'notes/wait.md',
        line: 6,
        rawText: 'WAIT task',
        listMarker: '-',
        text: 'task',
        state: 'WAIT',
      }),
      createBaseTask({
        path: 'notes/waiting.md',
        line: 7,
        rawText: 'WAITING task',
        listMarker: '-',
        text: 'task',
        state: 'WAITING',
      }),
      createBaseTask({
        path: 'notes/done.md',
        line: 8,
        rawText: 'DONE task',
        listMarker: '-',
        text: 'task',
        state: 'DONE',
      }),
      createBaseTask({
        path: 'notes/canceled.md',
        line: 9,
        rawText: 'CANCELED task',
        listMarker: '-',
        text: 'task',
        state: 'CANCELED',
      }),
    ];

    it('should match all active states with state:active', async () => {
      const settings = createBaseSettings();
      const results = await Promise.all(
        groupTestTasks.map(async (task) => {
          return await Search.evaluate('state:active', task, false, settings);
        }),
      );
      const matched = groupTestTasks.filter((_, i) => results[i]);
      expect(matched.map((t) => t.state).sort()).toEqual([
        'DOING',
        'IN-PROGRESS',
        'NOW',
      ]);
    });

    it('should match all inactive states with state:inactive', async () => {
      const settings = createBaseSettings();
      const results = await Promise.all(
        groupTestTasks.map(async (task) => {
          return await Search.evaluate(
            'state:inactive',
            task,
            false,
            settings,
          );
        }),
      );
      const matched = groupTestTasks.filter((_, i) => results[i]);
      expect(matched.map((t) => t.state).sort()).toEqual(['LATER', 'TODO']);
    });

    it('should match all waiting states with state:waiting', async () => {
      const settings = createBaseSettings();
      const results = await Promise.all(
        groupTestTasks.map(async (task) => {
          return await Search.evaluate(
            'state:waiting',
            task,
            false,
            settings,
          );
        }),
      );
      const matched = groupTestTasks.filter((_, i) => results[i]);
      expect(matched.map((t) => t.state).sort()).toEqual(['WAIT', 'WAITING']);
    });

    it('should match all completed states with state:completed', async () => {
      const settings = createBaseSettings();
      const results = await Promise.all(
        groupTestTasks.map(async (task) => {
          return await Search.evaluate(
            'state:completed',
            task,
            false,
            settings,
          );
        }),
      );
      const matched = groupTestTasks.filter((_, i) => results[i]);
      expect(matched.map((t) => t.state).sort()).toEqual([
        'CANCELED',
        'DONE',
      ]);
    });

    it('should not match group when uppercase ACTIVE (falls through to exact match)', async () => {
      const settings = createBaseSettings();
      const task = createBaseTask({
        path: 'notes/test.md',
        line: 10,
        rawText: 'DOING task',
        listMarker: '-',
        text: 'task',
        state: 'DOING',
      });
      const result = await Search.evaluate(
        'state:ACTIVE',
        task,
        false,
        settings,
      );
      expect(result).toBe(false);
    });

    it('should not match group when uppercase INACTIVE', async () => {
      const settings = createBaseSettings();
      const task = createBaseTask({
        path: 'notes/test.md',
        line: 10,
        rawText: 'TODO task',
        listMarker: '-',
        text: 'task',
        state: 'TODO',
      });
      const result = await Search.evaluate(
        'state:INACTIVE',
        task,
        false,
        settings,
      );
      expect(result).toBe(false);
    });

    it('should match exact keyword WAITING via uppercase even though waiting is a group', async () => {
      const settings = createBaseSettings();
      const waitingTask = createBaseTask({
        path: 'notes/test.md',
        line: 10,
        rawText: 'WAITING task',
        listMarker: '-',
        text: 'task',
        state: 'WAITING',
      });
      const waitTask = createBaseTask({
        path: 'notes/test2.md',
        line: 11,
        rawText: 'WAIT task',
        listMarker: '-',
        text: 'task',
        state: 'WAIT',
      });
      const waitingResult = await Search.evaluate(
        'state:WAITING',
        waitingTask,
        false,
        settings,
      );
      expect(waitingResult).toBe(true);

      const waitResult = await Search.evaluate(
        'state:WAITING',
        waitTask,
        false,
        settings,
      );
      expect(waitResult).toBe(false);
    });

    it('should match exact keyword COMPLETED when configured, not the group', async () => {
      const settings = createBaseSettings({
        additionalCompletedKeywords: ['COMPLETED'],
      });
      const completedTask = createBaseTask({
        path: 'notes/test.md',
        line: 10,
        rawText: 'COMPLETED task',
        listMarker: '-',
        text: 'task',
        state: 'COMPLETED',
      });
      const doneTask = createBaseTask({
        path: 'notes/test2.md',
        line: 11,
        rawText: 'DONE task',
        listMarker: '-',
        text: 'task',
        state: 'DONE',
      });

      const completedResult = await Search.evaluate(
        'state:COMPLETED',
        completedTask,
        false,
        settings,
      );
      expect(completedResult).toBe(true);

      const doneResult = await Search.evaluate(
        'state:COMPLETED',
        doneTask,
        false,
        settings,
      );
      expect(doneResult).toBe(false);
    });

    it('should still match exact state when not a group keyword', async () => {
      const settings = createBaseSettings();
      const results = await Promise.all(
        groupTestTasks.map(async (task) => {
          return await Search.evaluate('state:TODO', task, false, settings);
        }),
      );
      const matched = groupTestTasks.filter((_, i) => results[i]);
      expect(matched.length).toBe(1);
      expect(matched[0].state).toBe('TODO');
    });

    it('should include custom keywords in group matches', async () => {
      const settings = createBaseSettings({
        additionalActiveKeywords: ['REVIEWING'],
      });
      const customTask = createBaseTask({
        path: 'notes/review.md',
        line: 10,
        rawText: 'REVIEWING task',
        listMarker: '-',
        text: 'task',
        state: 'REVIEWING',
      });
      const result = await Search.evaluate(
        'state:active',
        customTask,
        false,
        settings,
      );
      expect(result).toBe(true);
    });

    it('should not match custom active keyword with state:inactive', async () => {
      const settings = createBaseSettings({
        additionalActiveKeywords: ['REVIEWING'],
      });
      const customTask = createBaseTask({
        path: 'notes/review.md',
        line: 10,
        rawText: 'REVIEWING task',
        listMarker: '-',
        text: 'task',
        state: 'REVIEWING',
      });
      const result = await Search.evaluate(
        'state:inactive',
        customTask,
        false,
        settings,
      );
      expect(result).toBe(false);
    });

    it('should still match group with lowercase active even when ACTIVE is a custom keyword', async () => {
      const settings = createBaseSettings({
        additionalActiveKeywords: ['ACTIVE'],
      });
      const activeKeywordTask = createBaseTask({
        path: 'notes/active.md',
        line: 10,
        rawText: 'ACTIVE task',
        listMarker: '-',
        text: 'task',
        state: 'ACTIVE',
      });
      const doingTask = createBaseTask({
        path: 'notes/doing.md',
        line: 11,
        rawText: 'DOING task',
        listMarker: '-',
        text: 'task',
        state: 'DOING',
      });

      const activeResult = await Search.evaluate(
        'state:active',
        activeKeywordTask,
        false,
        settings,
      );
      expect(activeResult).toBe(true);

      const doingResult = await Search.evaluate(
        'state:active',
        doingTask,
        false,
        settings,
      );
      expect(doingResult).toBe(true);
    });

    it('should fall back to exact match without settings', async () => {
      const results = await Promise.all(
        groupTestTasks.map(async (task) => {
          return await Search.evaluate('state:active', task, false);
        }),
      );
      const matched = groupTestTasks.filter((_, i) => results[i]);
      expect(matched.length).toBe(0);
    });

    it('should work with NOT operator for group keywords', async () => {
      const settings = createBaseSettings();
      const results = await Promise.all(
        groupTestTasks.map(async (task) => {
          return await Search.evaluate(
            '-state:completed',
            task,
            false,
            settings,
          );
        }),
      );
      const matched = groupTestTasks.filter((_, i) => results[i]);
      expect(matched.map((t) => t.state)).not.toContain('DONE');
      expect(matched.map((t) => t.state)).not.toContain('CANCELED');
      expect(matched.length).toBe(7);
    });

    it('should work with OR operator for group keywords', async () => {
      const settings = createBaseSettings();
      const results = await Promise.all(
        groupTestTasks.map(async (task) => {
          return await Search.evaluate(
            'state:active OR state:waiting',
            task,
            false,
            settings,
          );
        }),
      );
      const matched = groupTestTasks.filter((_, i) => results[i]);
      expect(matched.map((t) => t.state).sort()).toEqual([
        'DOING',
        'IN-PROGRESS',
        'NOW',
        'WAIT',
        'WAITING',
      ]);
    });
  });
});
