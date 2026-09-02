import { TaskParser } from '../src/parser/task-parser';
import { createTestKeywordManager } from './helpers/test-helper';

/**
 * Tests for STARTED line parsing (plans/003-started-timestamps.md, Step 12).
 * Pattern: tests/task-parser-description.test.ts (parseFile-based).
 */
describe('TaskParser - STARTED date parsing', () => {
  const keywordManager = createTestKeywordManager();
  const parser = TaskParser.create(keywordManager, null);

  describe('parseFile', () => {
    it('parses startedDate from a STARTED: line after the task', () => {
      const content = `- [ ] TODO Buy groceries\nSTARTED: [2026-01-15 Thu 09:00]`;
      const tasks = parser.parseFile(content, 'test.md');
      expect(tasks).toHaveLength(1);
      expect(tasks[0].startedDate).toBeTruthy();
      expect(tasks[0].startedDate!.getFullYear()).toBe(2026);
      expect(tasks[0].startedDate!.getMonth()).toBe(0);
      expect(tasks[0].startedDate!.getDate()).toBe(15);
      expect(tasks[0].startedDate!.getHours()).toBe(9);
      expect(tasks[0].startedDate!.getMinutes()).toBe(0);
    });

    it('parses both STARTED and SCHEDULED when both present', () => {
      const content = `- [ ] TODO Buy groceries\nSTARTED: [2026-01-15 Thu 09:00]\nSCHEDULED: <2026-01-20 Tue>`;
      const tasks = parser.parseFile(content, 'test.md');
      expect(tasks[0].startedDate).toBeTruthy();
      expect(tasks[0].startedDate!.getDate()).toBe(15);
      expect(tasks[0].scheduledDate).toBeTruthy();
      expect(tasks[0].scheduledDate!.getDate()).toBe(20);
    });

    it('parses STARTED alongside SCHEDULED and CLOSED', () => {
      const content = `- [ ] TODO Full lifecycle\nSTARTED: [2026-01-15 Thu 09:00]\nSCHEDULED: <2026-01-10 Sat>\nCLOSED: [2026-01-18 Sun 17:30]`;
      const tasks = parser.parseFile(content, 'test.md');
      expect(tasks[0].startedDate!.getDate()).toBe(15);
      expect(tasks[0].scheduledDate!.getDate()).toBe(10);
      expect(tasks[0].closedDate!.getDate()).toBe(18);
    });

    it('has startedDate null when no STARTED line exists', () => {
      const content = `- [ ] TODO No started date\nSCHEDULED: <2026-01-20 Tue>`;
      const tasks = parser.parseFile(content, 'test.md');
      expect(tasks[0].startedDate).toBeNull();
      expect(tasks[0].scheduledDate).toBeTruthy();
    });

    it('ignores STARTED line with incorrect (shallower) indent', () => {
      // STARTED at indent 0 under a task indented at 4 is not the task's date line
      const content = `    - [ ] TODO Nested task\nSTARTED: [2026-01-15 Thu 09:00]`;
      const tasks = parser.parseFile(content, 'test.md');
      expect(tasks[0].startedDate).toBeNull();
    });

    it('parses STARTED line with time component', () => {
      const content = `- [ ] TODO Timed start\nSTARTED: [2026-01-15 Thu 14:45]`;
      const tasks = parser.parseFile(content, 'test.md');
      expect(tasks[0].startedDate).toBeTruthy();
      expect(tasks[0].startedDate!.getHours()).toBe(14);
      expect(tasks[0].startedDate!.getMinutes()).toBe(45);
    });

    it('first STARTED line wins when multiple present', () => {
      const content = `- [ ] TODO Multiple starts\nSTARTED: [2026-01-10 Sat 08:00]\nSTARTED: [2026-01-15 Thu 12:00]`;
      const tasks = parser.parseFile(content, 'test.md');
      expect(tasks[0].startedDate!.getDate()).toBe(10);
      expect(tasks[0].startedDate!.getHours()).toBe(8);
    });

    it('parses quoted (callout) STARTED line', () => {
      const content = `> - [ ] TODO Quoted task\n> STARTED: [2026-01-15 Thu 09:00]`;
      const tasks = parser.parseFile(content, 'test.md');
      expect(tasks[0].startedDate).toBeTruthy();
      expect(tasks[0].startedDate!.getDate()).toBe(15);
    });

    it('keeps scanning for later date lines after STARTED', () => {
      const content = `- [ ] TODO Order check\nSTARTED: [2026-01-15 Thu 09:00]\nDEADLINE: <2026-01-25 Sun>`;
      const tasks = parser.parseFile(content, 'test.md');
      expect(tasks[0].startedDate).toBeTruthy();
      expect(tasks[0].deadlineDate).toBeTruthy();
    });

    it('stops collecting date lines once all four types found', () => {
      const description = 'A trailing note that is not a date';
      const content = [
        '- [ ] TODO All dates',
        'STARTED: [2026-01-15 Thu 09:00]',
        'SCHEDULED: <2026-01-10 Sat>',
        'DEADLINE: <2026-01-25 Sun>',
        'CLOSED: [2026-01-18 Sun 17:30]',
        description,
      ].join('\n');
      const tasks = parser.parseFile(content, 'test.md');
      expect(tasks).toHaveLength(1);
      expect(tasks[0].startedDate!.getDate()).toBe(15);
      expect(tasks[0].scheduledDate!.getDate()).toBe(10);
      expect(tasks[0].deadlineDate!.getDate()).toBe(25);
      expect(tasks[0].closedDate!.getDate()).toBe(18);
    });
  });
});
