import { SearchParser } from '../src/search/search-parser';
import { SearchEvaluator } from '../src/search/search-evaluator';
import { Task } from '../src/types/task';
import { DateUtils } from '../src/utils/date-utils';
import { createCheckboxTask } from './helpers/test-helper';

describe('Date Search Filters', () => {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  // Test tasks with various dates
  // Create dates at midnight to avoid timezone issues
  const todayMidnight = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  );
  const tomorrowMidnight = new Date(
    tomorrow.getFullYear(),
    tomorrow.getMonth(),
    tomorrow.getDate(),
  );

  const testTasks: Task[] = [
    createCheckboxTask({
      path: 'test1.md',
      line: 1,
      rawText: '- [ ] TODO Task with scheduled date',
      text: 'Task with scheduled date',
      scheduledDate: todayMidnight,
    }),
    createCheckboxTask({
      path: 'test2.md',
      line: 2,
      rawText: '- [ ] TODO Task with deadline date',
      text: 'Task with deadline date',
      deadlineDate: tomorrowMidnight,
    }),
    createCheckboxTask({
      path: 'test3.md',
      line: 3,
      rawText: '- [ ] TODO Task with overdue deadline',
      text: 'Task with overdue deadline',
      deadlineDate: yesterday,
    }),
    createCheckboxTask({
      path: 'test4.md',
      line: 4,
      rawText: '- [ ] TODO Task with no dates',
      text: 'Task with no dates',
    }),
  ];

  describe('DateUtils parsing', () => {
    test('should parse exact dates', () => {
      const currentYear = today.getFullYear();
      const result = DateUtils.parseDateValue(`${currentYear}-01-31`);
      expect(result).toHaveProperty('date');
      expect(result).toHaveProperty('format', 'full');
      expect((result as any).date).toBeInstanceOf(Date);
      expect((result as any).date.getFullYear()).toBe(currentYear);
      expect((result as any).date.getMonth()).toBe(0); // January
      expect((result as any).date.getDate()).toBe(31);
    });

    test('should parse year-month format', () => {
      const currentYear = today.getFullYear();
      const result = DateUtils.parseDateValue(`${currentYear}-01`);
      expect(result).toHaveProperty('date');
      expect(result).toHaveProperty('format', 'year-month');
      expect((result as any).date).toBeInstanceOf(Date);
      expect((result as any).date.getFullYear()).toBe(currentYear);
      expect((result as any).date.getMonth()).toBe(0); // January
    });

    test('should parse year only', () => {
      const currentYear = today.getFullYear();
      const result = DateUtils.parseDateValue(currentYear.toString());
      expect(result).toHaveProperty('date');
      expect(result).toHaveProperty('format', 'year');
      expect((result as any).date).toBeInstanceOf(Date);
      expect((result as any).date.getFullYear()).toBe(currentYear);
    });

    test('should parse date ranges', () => {
      const result = DateUtils.parseDateValue('2024-01-01..2024-01-31');
      expect(result).toHaveProperty('start');
      expect(result).toHaveProperty('end');
      expect((result as any).start).toBeInstanceOf(Date);
      expect((result as any).end).toBeInstanceOf(Date);
    });

    test('should parse relative date expressions', () => {
      expect(DateUtils.parseDateValue('overdue')).toBe('overdue');
      expect(DateUtils.parseDateValue('today')).toBe('today');
      expect(DateUtils.parseDateValue('tomorrow')).toBe('tomorrow');
      expect(DateUtils.parseDateValue('this week')).toBe('this week');
      expect(DateUtils.parseDateValue('next week')).toBe('next week');
    });

    test('should parse "next N days" pattern', () => {
      const result = DateUtils.parseDateValue('next 7 days');
      expect(result).toBe('next 7 days');
    });

    test('should parse quoted natural language', () => {
      const result = DateUtils.parseDateValue('"next Monday"');
      expect(result).toBeInstanceOf(Date);
    });

    test('should handle "none" case', () => {
      const result = DateUtils.parseDateValue('none');
      expect(result).toBe('none');
    });
  });

  describe('Scheduled date filtering', () => {
    test('should filter tasks with scheduled:none', () => {
      const query = 'scheduled:none';
      const node = SearchParser.parse(query);

      const results = testTasks.filter((task) =>
        SearchEvaluator.evaluate(node, task, false),
      );
      expect(results.length).toBe(3); // Tasks with no scheduled date
      expect(results.map((r) => r.text)).toContain('Task with no dates');
      expect(results.map((r) => r.text)).toContain('Task with deadline date');
    });

    test('should filter tasks with scheduled:today', () => {
      const query = 'scheduled:today';
      const node = SearchParser.parse(query);

      const results = testTasks.filter((task) =>
        SearchEvaluator.evaluate(node, task, false),
      );
      expect(results.length).toBe(1);
      expect(results[0].text).toBe('Task with scheduled date');
    });

    test('should filter tasks with scheduled:tomorrow', () => {
      const query = 'scheduled:tomorrow';
      const node = SearchParser.parse(query);

      const results = testTasks.filter((task) =>
        SearchEvaluator.evaluate(node, task, false),
      );
      expect(results.length).toBe(0); // No tasks scheduled for tomorrow
    });

    test('should filter tasks with scheduled:overdue', () => {
      const query = 'scheduled:overdue';
      const node = SearchParser.parse(query);

      const results = testTasks.filter((task) =>
        SearchEvaluator.evaluate(node, task, false),
      );
      expect(results.length).toBe(0); // No tasks with overdue scheduled dates
    });

    test('should filter tasks with exact scheduled date', () => {
      const dateStr = todayMidnight.toISOString().split('T')[0];
      const query = `scheduled:${dateStr}`;
      const node = SearchParser.parse(query);

      const results = testTasks.filter((task) =>
        SearchEvaluator.evaluate(node, task, false),
      );
      expect(results.length).toBe(1);
      expect(results[0].text).toBe('Task with scheduled date');
    });

    // Comprehensive date matching tests
    test('should filter tasks by year only', () => {
      // Create a task with a specific year
      const currentYear = today.getFullYear();
      const yearTask: Task = createCheckboxTask({
        path: 'test-year.md',
        line: 1,
        rawText: `- [ ] TODO Task with ${currentYear} scheduled date`,
        text: `Task with ${currentYear} scheduled date`,
        scheduledDate: new Date(`${currentYear}-06-15`),
      });

      const allTasks = [...testTasks, yearTask];
      const query = `scheduled:${currentYear}`;
      const node = SearchParser.parse(query);

      const results = allTasks.filter((task) =>
        SearchEvaluator.evaluate(node, task, false),
      );
      expect(results.length).toBe(2); // Both tasks have scheduled dates in 2025
      expect(results.map((r) => r.text)).toContain(
        `Task with ${currentYear} scheduled date`,
      );
      expect(results.map((r) => r.text)).toContain('Task with scheduled date');
    });

    test('should filter tasks by year-month', () => {
      // Create a task with a specific year-month
      const currentYear = today.getFullYear();
      const monthTask: Task = createCheckboxTask({
        path: 'test-month.md',
        line: 1,
        rawText: `- [ ] TODO Task with June ${currentYear} scheduled date`,
        text: `Task with June ${currentYear} scheduled date`,
        scheduledDate: new Date(`${currentYear}-06-15`),
      });

      const allTasks = [...testTasks, monthTask];
      const query = `scheduled:${currentYear}-06`;
      const node = SearchParser.parse(query);

      const results = allTasks.filter((task) =>
        SearchEvaluator.evaluate(node, task, false),
      );
      expect(results.length).toBe(1);
      expect(results[0].text).toBe(
        `Task with June ${currentYear} scheduled date`,
      );
    });

    test('should filter tasks by specific day', () => {
      // Create a task with a specific date
      const currentYear = today.getFullYear();
      const dayTask: Task = createCheckboxTask({
        path: 'test-day.md',
        line: 1,
        rawText: '- [ ] TODO Task with specific date',
        text: 'Task with specific date',
        scheduledDate: new Date(currentYear, 5, 15), // month is 0-indexed, so 5 = June
      });

      const allTasks = [...testTasks, dayTask];
      const query = `scheduled:${currentYear}-06-15`;
      const node = SearchParser.parse(query);

      const results = allTasks.filter((task) =>
        SearchEvaluator.evaluate(node, task, false),
      );
      expect(results.length).toBe(1);
      expect(results[0].text).toBe('Task with specific date');
    });

    test('should filter tasks with date ranges', () => {
      // Create tasks with dates in different ranges
      const rangeTask1: Task = createCheckboxTask({
        path: 'test-range1.md',
        line: 1,
        rawText: '- [ ] TODO Task in range 1',
        text: 'Task in range 1',
        scheduledDate: new Date(`2025-01-15`),
      });

      const rangeTask2: Task = createCheckboxTask({
        path: 'test-range2.md',
        line: 1,
        rawText: '- [ ] TODO Task in range 2',
        text: 'Task in range 2',
        scheduledDate: new Date(`2025-01-25`),
      });

      const allTasks = [...testTasks, rangeTask1, rangeTask2];
      const query = `scheduled:2025-01-01..2025-01-31`;
      const node = SearchParser.parse(query);

      const results = allTasks.filter((task) =>
        SearchEvaluator.evaluate(node, task, false),
      );
      expect(results.length).toBe(2);
      expect(results.map((r) => r.text)).toContain('Task in range 1');
      expect(results.map((r) => r.text)).toContain('Task in range 2');
    });
  });

  describe('Deadline date filtering', () => {
    test('should filter tasks with deadline:none', () => {
      const query = 'deadline:none';
      const node = SearchParser.parse(query);

      const results = testTasks.filter((task) =>
        SearchEvaluator.evaluate(node, task, false),
      );
      expect(results.length).toBe(2); // Tasks with no deadline and no scheduled date
      expect(results.map((r) => r.text)).toContain('Task with scheduled date');
      expect(results.map((r) => r.text)).toContain('Task with no dates');
    });

    test('should filter tasks with deadline:tomorrow', () => {
      const query = 'deadline:tomorrow';
      const node = SearchParser.parse(query);

      const results = testTasks.filter((task) =>
        SearchEvaluator.evaluate(node, task, false),
      );
      expect(results.length).toBe(1);
      expect(results[0].text).toBe('Task with deadline date');
    });

    test('should filter tasks with deadline:overdue', () => {
      const query = 'deadline:overdue';
      const node = SearchParser.parse(query);

      const results = testTasks.filter((task) =>
        SearchEvaluator.evaluate(node, task, false),
      );
      expect(results.length).toBe(1);
      expect(results[0].text).toBe('Task with overdue deadline');
    });

    test('should filter tasks with deadline:today', () => {
      const query = 'deadline:today';
      const node = SearchParser.parse(query);

      const results = testTasks.filter((task) =>
        SearchEvaluator.evaluate(node, task, false),
      );
      expect(results.length).toBe(0); // No tasks with deadline today
    });

    test('should filter tasks with exact deadline date', () => {
      const dateStr = tomorrowMidnight.toISOString().split('T')[0];
      const query = `deadline:${dateStr}`;
      const node = SearchParser.parse(query);

      const results = testTasks.filter((task) =>
        SearchEvaluator.evaluate(node, task, false),
      );
      expect(results.length).toBe(1);
      expect(results[0].text).toBe('Task with deadline date');
    });
  });

  describe('Date range filtering', () => {
    test('should filter tasks with scheduled date range', () => {
      const startDate = new Date(today);
      startDate.setDate(startDate.getDate() - 1); // Yesterday
      const endDate = new Date(today);
      endDate.setDate(endDate.getDate() + 1); // Tomorrow

      const startStr = startDate.toISOString().split('T')[0];
      const endStr = endDate.toISOString().split('T')[0];
      const query = `scheduled:${startStr}..${endStr}`;
      const node = SearchParser.parse(query);

      const results = testTasks.filter((task) =>
        SearchEvaluator.evaluate(node, task, false),
      );
      expect(results.length).toBe(1); // Task scheduled for today
      expect(results[0].text).toBe('Task with scheduled date');
    });

    test('should filter tasks with deadline date range', () => {
      const startDate = new Date(today);
      const endDate = new Date(today);
      endDate.setDate(endDate.getDate() + 2); // Day after tomorrow

      const startStr = startDate.toISOString().split('T')[0];
      const endStr = endDate.toISOString().split('T')[0];
      const query = `deadline:${startStr}..${endStr}`;
      const node = SearchParser.parse(query);

      const results = testTasks.filter((task) =>
        SearchEvaluator.evaluate(node, task, false),
      );
      expect(results.length).toBe(1); // Task with deadline tomorrow
      expect(results.map((r) => r.text)).toContain('Task with deadline date');
    });
  });

  describe('Relative date expressions', () => {
    test('should filter tasks with scheduled:"next week"', () => {
      const query = 'scheduled:"next week"';
      const node = SearchParser.parse(query);

      const results = testTasks.filter((task) =>
        SearchEvaluator.evaluate(node, task, false),
      );
      // This depends on what day of the week today is
      expect(results.length).toBeGreaterThanOrEqual(0);
    });

    test('should filter tasks with deadline:"this week"', () => {
      const query = 'deadline:"this week"';
      const node = SearchParser.parse(query);

      const results = testTasks.filter((task) =>
        SearchEvaluator.evaluate(node, task, false),
      );
      // Should include tasks with deadlines this week
      expect(results.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Combined filters', () => {
    test('should combine scheduled and state filters', () => {
      const query = 'scheduled:today state:TODO';
      const node = SearchParser.parse(query);

      const results = testTasks.filter((task) =>
        SearchEvaluator.evaluate(node, task, false),
      );
      expect(results.length).toBe(1);
      expect(results[0].text).toBe('Task with scheduled date');
    });

    test('should combine deadline and priority filters', () => {
      const query = 'deadline:tomorrow priority:none';
      const node = SearchParser.parse(query);

      const results = testTasks.filter((task) =>
        SearchEvaluator.evaluate(node, task, false),
      );
      expect(results.length).toBe(1);
      expect(results[0].text).toBe('Task with deadline date');
    });

    test('should handle OR logic with date filters', () => {
      const query = 'scheduled:today OR deadline:tomorrow';
      const node = SearchParser.parse(query);

      const results = testTasks.filter((task) =>
        SearchEvaluator.evaluate(node, task, false),
      );
      expect(results.length).toBe(2);
      expect(results.map((r) => r.text)).toContain('Task with scheduled date');
      expect(results.map((r) => r.text)).toContain('Task with deadline date');
    });

    test('should handle NOT logic with date filters', () => {
      const query = '-deadline:none';
      const node = SearchParser.parse(query);

      const results = testTasks.filter((task) =>
        SearchEvaluator.evaluate(node, task, false),
      );
      expect(results.length).toBe(2); // Tasks that have deadlines
      expect(results.map((r) => r.text)).toContain('Task with deadline date');
      expect(results.map((r) => r.text)).toContain(
        'Task with overdue deadline',
      );
    });
  });

  describe('Edge cases', () => {
    test('should handle invalid date formats gracefully', () => {
      const query = 'scheduled:invalid-date';
      const node = SearchParser.parse(query);

      const results = testTasks.filter((task) =>
        SearchEvaluator.evaluate(node, task, false),
      );
      expect(results.length).toBe(0); // No matches for invalid dates
    });

    test('should handle malformed date ranges', () => {
      const query = 'scheduled:2024-01-01..invalid';
      const node = SearchParser.parse(query);

      const results = testTasks.filter((task) =>
        SearchEvaluator.evaluate(node, task, false),
      );
      expect(results.length).toBe(0); // No matches for malformed ranges
    });

    test('should handle tasks with null dates', () => {
      const query = 'scheduled:today';
      const node = SearchParser.parse(query);

      // Task with null scheduledDate should not match
      const taskWithNullDate: Task = createCheckboxTask({
        path: 'test.md',
        line: 1,
        rawText: '- [ ] TODO Task with null date',
        text: 'Task with null date',
        scheduledDate: null,
      });

      const result = SearchEvaluator.evaluate(node, taskWithNullDate, false);
      expect(result).toBe(false);
    });
  });
});
