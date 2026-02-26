/**
 * Unit tests for OrgModeTaskParser.
 * Tests org-mode task parsing functionality.
 */

import { OrgModeTaskParser } from '../src/parser/org-mode-task-parser';
import { getDefaultCoefficients } from '../src/utils/task-urgency';
import {
  createBaseSettings,
  createTestKeywordManager,
} from './helpers/test-helper';

// Default settings for testing
const defaultSettings = createBaseSettings();
const defaultKeywordManager = createTestKeywordManager(defaultSettings);

describe('OrgModeTaskParser', () => {
  let parser: OrgModeTaskParser;

  beforeEach(() => {
    parser = OrgModeTaskParser.create(
      defaultKeywordManager,
      null,
      getDefaultCoefficients(),
    );
  });

  describe('parserId and supportedExtensions', () => {
    it('should have correct parser ID', () => {
      expect(parser.parserId).toBe('org-mode');
    });

    it('should support .org extension', () => {
      expect(parser.supportedExtensions).toContain('.org');
    });
  });

  describe('isTaskLine', () => {
    it('should match TODO headline', () => {
      expect(parser.isTaskLine('* TODO Task text')).toBe(true);
    });

    it('should match DONE headline', () => {
      expect(parser.isTaskLine('** DONE Completed task')).toBe(true);
    });

    it('should match WAIT keyword (default)', () => {
      expect(parser.isTaskLine('* WAIT Waiting task')).toBe(true);
    });

    it('should not match non-task headlines', () => {
      expect(parser.isTaskLine('* Not a task')).toBe(false);
    });

    it('should not match regular text', () => {
      expect(parser.isTaskLine('Just some text')).toBe(false);
    });

    it('should not match markdown tasks', () => {
      expect(parser.isTaskLine('- [ ] TODO Task')).toBe(false);
    });
  });

  describe('parseLine', () => {
    it('should parse basic TODO task', () => {
      const task = parser.parseLine('* TODO Task text', 0, 'test.org');
      expect(task).not.toBeNull();
      expect(task?.state).toBe('TODO');
      expect(task?.text).toBe('Task text');
      expect(task?.completed).toBe(false);
      expect(task?.line).toBe(0);
      expect(task?.path).toBe('test.org');
    });

    it('should parse DONE task as completed', () => {
      const task = parser.parseLine('** DONE Completed', 5, 'test.org');
      expect(task).not.toBeNull();
      expect(task?.state).toBe('DONE');
      expect(task?.completed).toBe(true);
    });

    it('should parse CANCELED task as completed', () => {
      const task = parser.parseLine('* CANCELED Cancelled task', 0, 'test.org');
      expect(task).not.toBeNull();
      expect(task?.state).toBe('CANCELED');
      expect(task?.completed).toBe(true);
    });

    it('should return null for non-task line', () => {
      const task = parser.parseLine('* Not a task', 0, 'test.org');
      expect(task).toBeNull();
    });

    it('should parse priority [#A]', () => {
      const task = parser.parseLine(
        '* TODO [#A] High priority task',
        0,
        'test.org',
      );
      expect(task).not.toBeNull();
      expect(task?.priority).toBe('high');
      expect(task?.text).toBe('High priority task');
    });

    it('should parse priority [#B]', () => {
      const task = parser.parseLine(
        '* TODO [#B] Medium priority task',
        0,
        'test.org',
      );
      expect(task).not.toBeNull();
      expect(task?.priority).toBe('med');
    });

    it('should parse priority [#C]', () => {
      const task = parser.parseLine(
        '* TODO [#C] Low priority task',
        0,
        'test.org',
      );
      expect(task).not.toBeNull();
      expect(task?.priority).toBe('low');
    });

    it('should handle task without priority', () => {
      const task = parser.parseLine('* TODO No priority', 0, 'test.org');
      expect(task).not.toBeNull();
      expect(task?.priority).toBeNull();
    });

    it('should calculate nesting level', () => {
      const task1 = parser.parseLine('* TODO Level 1', 0, 'test.org');
      const task2 = parser.parseLine('** TODO Level 2', 0, 'test.org');
      const task3 = parser.parseLine('*** TODO Level 3', 0, 'test.org');

      expect(task1?.quoteNestingLevel).toBe(1);
      expect(task2?.quoteNestingLevel).toBe(2);
      expect(task3?.quoteNestingLevel).toBe(3);
    });
  });

  describe('parseFile', () => {
    it('should parse multiple tasks from file content', () => {
      const content = `* TODO First task
** DONE Second task
* TODO Third task
Some regular text
** WAIT Fourth task`;
      const tasks = parser.parseFile(content, 'test.org');

      expect(tasks).toHaveLength(4);
      expect(tasks[0].state).toBe('TODO');
      expect(tasks[0].text).toBe('First task');
      expect(tasks[1].state).toBe('DONE');
      expect(tasks[1].completed).toBe(true);
      expect(tasks[2].state).toBe('TODO');
      expect(tasks[3].state).toBe('WAIT');
    });

    it('should parse scheduled date with leading whitespace', () => {
      const content = `* TODO Task with scheduled
   SCHEDULED: <2026-02-15 Sun>`;
      const tasks = parser.parseFile(content, 'test.org');

      expect(tasks).toHaveLength(1);
      expect(tasks[0].scheduledDate).not.toBeNull();
      expect(tasks[0].scheduledDate?.getFullYear()).toBe(2026);
      expect(tasks[0].scheduledDate?.getMonth()).toBe(1); // February = 1
      expect(tasks[0].scheduledDate?.getDate()).toBe(15);
    });

    it('should parse deadline date with leading whitespace', () => {
      const content = `* TODO Task with deadline
   DEADLINE: <2026-02-20 Fri>`;
      const tasks = parser.parseFile(content, 'test.org');

      expect(tasks).toHaveLength(1);
      expect(tasks[0].deadlineDate).not.toBeNull();
      expect(tasks[0].deadlineDate?.getFullYear()).toBe(2026);
      expect(tasks[0].deadlineDate?.getDate()).toBe(20);
    });

    it('should parse both scheduled and deadline dates', () => {
      const content = `* TODO Task with both dates
   SCHEDULED: <2026-02-15 Sun>
   DEADLINE: <2026-02-20 Fri>`;
      const tasks = parser.parseFile(content, 'test.org');

      expect(tasks).toHaveLength(1);
      expect(tasks[0].scheduledDate).not.toBeNull();
      expect(tasks[0].deadlineDate).not.toBeNull();
    });

    it('should handle inactive dates [...]', () => {
      const content = `* TODO Task with inactive date
   SCHEDULED: [2026-02-15 Sun]`;
      const tasks = parser.parseFile(content, 'test.org');

      expect(tasks).toHaveLength(1);
      expect(tasks[0].scheduledDate).not.toBeNull();
      expect(tasks[0].scheduledDate?.getDate()).toBe(15);
    });

    it('should handle empty file', () => {
      const tasks = parser.parseFile('', 'test.org');
      expect(tasks).toHaveLength(0);
    });

    it('should handle file with no tasks', () => {
      const content = `* Headline 1
Some text
** Headline 2
More text`;
      const tasks = parser.parseFile(content, 'test.org');
      expect(tasks).toHaveLength(0);
    });

    it('should calculate urgency for incomplete tasks', () => {
      const content = `* TODO Task with deadline
   DEADLINE: <2026-02-20 Fri>`;
      const tasks = parser.parseFile(content, 'test.org');

      expect(tasks[0].urgency).not.toBeNull();
    });

    it('should not calculate urgency for completed tasks', () => {
      const content = `* DONE Completed task`;
      const tasks = parser.parseFile(content, 'test.org');

      expect(tasks[0].urgency).toBeNull();
    });

    it('should parse real org-mode file format', () => {
      const content = `#+TITLE: Test File

* TODO org mode first level task

* Project Alpha: Workflow Transitions
** TODO Initial Task
   SCHEDULED: <2026-02-12 Thu>
   This is a basic task to check the "TODO" starting state.
** DONE Completed Task
   CLOSED: [2026-02-12 Thu 08:00]
   A task that has reached the terminal state.
** WAIT Waiting on External
   Used to test transitions that aren't "active" or "done."`;

      const tasks = parser.parseFile(content, 'test.org');

      expect(tasks.length).toBeGreaterThan(0);
      expect(tasks.some((t) => t.state === 'TODO')).toBe(true);
      expect(tasks.some((t) => t.state === 'DONE')).toBe(true);
      expect(tasks.some((t) => t.state === 'WAIT')).toBe(true);
    });
  });

  describe('updateConfig', () => {
    it('should update keywords', () => {
      const customParser = OrgModeTaskParser.create(
        defaultKeywordManager,
        null,
        getDefaultCoefficients(),
      );

      // Initially should not match CUSTOM keyword
      expect(customParser.isTaskLine('* CUSTOM Task')).toBe(false);

      // Update config with new keywords
      customParser.updateConfig({
        keywords: ['TODO', 'DONE', 'CUSTOM'],
        completedKeywords: ['DONE'],
        urgencyCoefficients: getDefaultCoefficients(),
      });

      // Now should match CUSTOM
      expect(customParser.isTaskLine('* CUSTOM Task')).toBe(true);
    });

    it('should update inactive/custom keywords set', () => {
      const customParser = OrgModeTaskParser.create(
        defaultKeywordManager,
        null,
        getDefaultCoefficients(),
      );

      // Initially should not match TEMP or MAYBE keywords
      expect(customParser.isTaskLine('* TEMP Custom task')).toBe(false);
      expect(customParser.isTaskLine('* MAYBE Custom task')).toBe(false);

      // Update config with custom inactive keywords
      // The keywords array contains both built-in and custom keywords
      // Parser should derive custom inactive keywords from keywords not in any built-in group
      customParser.updateConfig({
        keywords: ['TODO', 'DONE', 'TEMP', 'MAYBE'],
        completedKeywords: ['DONE'],
        urgencyCoefficients: getDefaultCoefficients(),
      });

      // New keywords should now be recognized as tasks
      expect(customParser.isTaskLine('* TEMP Custom task')).toBe(true);
      expect(customParser.isTaskLine('* MAYBE Custom task')).toBe(true);
    });
  });
});
