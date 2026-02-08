import { SearchParser } from '../src/search/search-parser';
import { SearchEvaluator } from '../src/search/search-evaluator';
import { Task } from '../src/types/task';
import { DateUtils } from '../src/utils/date-utils';
import { createCheckboxTask } from './helpers/test-helper';

describe('Date Search Filters', () => {
  // Use a fixed reference date (Wednesday) to ensure consistent test results
  // regardless of which day of the week the tests are run.
  // Using Wednesday ensures that yesterday, today, and tomorrow all fall within the same week.
  const fixedNow = new Date(2026, 0, 14, 12, 0, 0); // Wednesday, January 14, 2026 at noon
  const today = new Date(2026, 0, 14); // Wednesday, January 14, 2026
  const yesterday = new Date(2026, 0, 13); // Tuesday, January 13, 2026
  const tomorrow = new Date(2026, 0, 15); // Thursday, January 15, 2026

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

  // Helper function to format date as YYYY-MM-DD in local timezone
  const formatLocalDate = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // Mock system time for all tests in this describe block
  beforeAll(() => {
    jest.useFakeTimers();
    jest.setSystemTime(fixedNow);
  });

  afterAll(() => {
    jest.useRealTimers();
  });

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
      rawText: '- [ ] TODO Task with both dates',
      text: 'Task with both dates',
      scheduledDate: todayMidnight,
      deadlineDate: tomorrowMidnight,
    }),
    createCheckboxTask({
      path: 'test5.md',
      line: 5,
      rawText: '- [ ] TODO Task with no dates',
      text: 'Task with no dates',
    }),
    createCheckboxTask({
      path: 'test6.md',
      line: 6,
      rawText: '- [ ] TODO Task with past scheduled date',
      text: 'Task with past scheduled date',
      scheduledDate: yesterday,
    }),
  ];

  describe('DateUtils parsing', () => {
    it('should parse exact dates', () => {
      const result = DateUtils.parseDateValue('2024-01-15');
      expect(result).toEqual({ date: new Date(2024, 0, 15), format: 'full' });
    });

    it('should parse year-month format', () => {
      const result = DateUtils.parseDateValue('2024-01');
      expect(result).toEqual({
        date: new Date(2024, 0, 1),
        format: 'year-month',
      });
    });

    it('should parse year only', () => {
      const result = DateUtils.parseDateValue('2024');
      expect(result).toEqual({ date: new Date(2024, 0, 1), format: 'year' });
    });

    it('should parse date ranges', () => {
      const result = DateUtils.parseDateValue('2024-01-01..2024-01-31');
      expect(result).toEqual({
        start: new Date(2024, 0, 1),
        end: new Date(2024, 1, 1), // End date is exclusive
      });
    });

    it('should parse relative date expressions', () => {
      const result = DateUtils.parseDateValue('today');
      expect(result).toBe('today');
    });

    it('should parse "next N days" pattern', () => {
      const result = DateUtils.parseDateValue('next 3 days');
      expect(result).toBe('next 3 days');
    });

    it('should parse quoted natural language', () => {
      const result = DateUtils.parseDateValue('"next week"');
      expect(typeof result).toBe('object'); // It gets parsed as an actual date
    });

    it('should handle "none" case', () => {
      const result = DateUtils.parseDateValue('none');
      expect(result).toBe('none');
    });
  });

  describe('Scheduled date filtering', () => {
    it('should debug test tasks dates', async () => {
      testTasks.forEach((task) => {
        if (task.scheduledDate) {
        }
      });
      testTasks.forEach((task) => {
        if (task.deadlineDate) {
        }
      });
    });

    it('should filter tasks with scheduled:none', async () => {
      const query = 'scheduled:none';
      const node = SearchParser.parse(query);

      const results = await Promise.all(
        testTasks.map(async (task) => {
          return await SearchEvaluator.evaluate(node, task, false);
        }),
      );
      const filteredTasks = testTasks.filter((_, index) => results[index]);
      expect(filteredTasks.length).toBe(3); // Tasks with no scheduled date
      expect(filteredTasks.map((r) => r.text)).toContain('Task with no dates');
      expect(filteredTasks.map((r) => r.text)).toContain(
        'Task with deadline date',
      );
    });

    it('should filter tasks with scheduled:today', async () => {
      const query = 'scheduled:today';
      const node = SearchParser.parse(query);

      const results = await Promise.all(
        testTasks.map(async (task) => {
          return await SearchEvaluator.evaluate(node, task, false);
        }),
      );
      const filteredTasks = testTasks.filter((_, index) => results[index]);
      expect(filteredTasks.length).toBe(2);
      expect(
        filteredTasks.some((t) => t.text === 'Task with scheduled date'),
      ).toBe(true);
      expect(filteredTasks.some((t) => t.text === 'Task with both dates')).toBe(
        true,
      );
    });

    it('should filter tasks with scheduled:tomorrow', async () => {
      const query = 'scheduled:tomorrow';
      const node = SearchParser.parse(query);

      const results = await Promise.all(
        testTasks.map(async (task) => {
          return await SearchEvaluator.evaluate(node, task, false);
        }),
      );
      const filteredTasks = testTasks.filter((_, index) => results[index]);
      expect(filteredTasks.length).toBe(0); // No tasks scheduled for tomorrow
    });

    it('should filter tasks with scheduled:overdue', async () => {
      const query = 'scheduled:overdue';
      const node = SearchParser.parse(query);

      const results = await Promise.all(
        testTasks.map(async (task) => {
          return await SearchEvaluator.evaluate(node, task, false);
        }),
      );
      const filteredTasks = testTasks.filter((_, index) => results[index]);
      expect(filteredTasks.length).toBe(1); // One task with overdue scheduled date
      expect(filteredTasks[0].text).toBe('Task with past scheduled date');
    });

    it('should filter tasks with exact scheduled date', async () => {
      const query = `scheduled:${formatLocalDate(todayMidnight)}`;
      const node = SearchParser.parse(query);

      const results = await Promise.all(
        testTasks.map(async (task) => {
          return await SearchEvaluator.evaluate(node, task, false);
        }),
      );
      const filteredTasks = testTasks.filter((_, index) => results[index]);
      expect(filteredTasks.length).toBe(2); // Two tasks with today's scheduled date
    });

    it('should filter tasks by year only', async () => {
      const query = `scheduled:${today.getFullYear()}`;
      const node = SearchParser.parse(query);

      const results = await Promise.all(
        testTasks.map(async (task) => {
          return await SearchEvaluator.evaluate(node, task, false);
        }),
      );
      const filteredTasks = testTasks.filter((_, index) => results[index]);
      expect(filteredTasks.length).toBe(3); // Tasks with scheduled dates in current year
    });

    it('should filter tasks by year-month', async () => {
      const query = `scheduled:${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
      const node = SearchParser.parse(query);

      const results = await Promise.all(
        testTasks.map(async (task) => {
          return await SearchEvaluator.evaluate(node, task, false);
        }),
      );
      const filteredTasks = testTasks.filter((_, index) => results[index]);
      expect(filteredTasks.length).toBe(3); // Tasks with scheduled dates in current month
    });

    it('should filter tasks by specific day', async () => {
      const query = `scheduled:${formatLocalDate(todayMidnight)}`;
      const node = SearchParser.parse(query);

      const results = await Promise.all(
        testTasks.map(async (task) => {
          return await SearchEvaluator.evaluate(node, task, false);
        }),
      );
      const filteredTasks = testTasks.filter((_, index) => results[index]);
      expect(filteredTasks.length).toBe(2); // Two tasks with today's scheduled date
    });

    it('should filter tasks with date ranges', async () => {
      const startDate = new Date(today);
      startDate.setDate(startDate.getDate() - 1);
      const endDate = new Date(today);
      endDate.setDate(endDate.getDate() + 1);
      const query = `scheduled:${formatLocalDate(startDate)}..${formatLocalDate(endDate)}`;
      const node = SearchParser.parse(query);

      const results = await Promise.all(
        testTasks.map(async (task) => {
          return await SearchEvaluator.evaluate(node, task, false);
        }),
      );
      const filteredTasks = testTasks.filter((_, index) => results[index]);
      expect(filteredTasks.length).toBe(3); // Tasks with scheduled dates in range
    });
  });

  describe('Deadline date filtering', () => {
    it('should filter tasks with deadline:none', async () => {
      const query = 'deadline:none';
      const node = SearchParser.parse(query);

      const results = await Promise.all(
        testTasks.map(async (task) => {
          return await SearchEvaluator.evaluate(node, task, false);
        }),
      );
      const filteredTasks = testTasks.filter((_, index) => results[index]);
      expect(filteredTasks.length).toBe(3); // Tasks with no deadline date
    });

    it('should filter tasks with deadline:tomorrow', async () => {
      const query = 'deadline:tomorrow';
      const node = SearchParser.parse(query);

      const results = await Promise.all(
        testTasks.map(async (task) => {
          return await SearchEvaluator.evaluate(node, task, false);
        }),
      );
      const filteredTasks = testTasks.filter((_, index) => results[index]);
      expect(filteredTasks.length).toBe(2); // Two tasks with deadline tomorrow
    });

    it('should filter tasks with deadline:overdue', async () => {
      const query = 'deadline:overdue';
      const node = SearchParser.parse(query);

      const results = await Promise.all(
        testTasks.map(async (task) => {
          return await SearchEvaluator.evaluate(node, task, false);
        }),
      );
      const filteredTasks = testTasks.filter((_, index) => results[index]);
      expect(filteredTasks.length).toBe(1); // One task with overdue deadline
    });

    it('should filter tasks with deadline:today', async () => {
      const query = 'deadline:today';
      const node = SearchParser.parse(query);

      const results = await Promise.all(
        testTasks.map(async (task) => {
          return await SearchEvaluator.evaluate(node, task, false);
        }),
      );
      const filteredTasks = testTasks.filter((_, index) => results[index]);
      expect(filteredTasks.length).toBe(0); // No tasks with deadline today
    });

    it('should filter tasks with exact deadline date', async () => {
      const query = `deadline:${formatLocalDate(tomorrowMidnight)}`;
      const node = SearchParser.parse(query);

      const results = await Promise.all(
        testTasks.map(async (task) => {
          return await SearchEvaluator.evaluate(node, task, false);
        }),
      );
      const filteredTasks = testTasks.filter((_, index) => results[index]);
      expect(filteredTasks.length).toBe(2); // Two tasks with tomorrow's deadline
    });
  });

  describe('Date range filtering', () => {
    it('should filter tasks with scheduled date range', async () => {
      const startDate = new Date(today);
      startDate.setDate(startDate.getDate() - 1);
      const endDate = new Date(today);
      endDate.setDate(endDate.getDate() + 1);
      const query = `scheduled:${formatLocalDate(startDate)}..${formatLocalDate(endDate)}`;
      const node = SearchParser.parse(query);

      const results = await Promise.all(
        testTasks.map(async (task) => {
          return await SearchEvaluator.evaluate(node, task, false);
        }),
      );
      const filteredTasks = testTasks.filter((_, index) => results[index]);
      expect(filteredTasks.length).toBe(3); // Tasks with scheduled dates in range
    });

    it('should filter tasks with deadline date range', async () => {
      const startDate = new Date(today);
      startDate.setDate(startDate.getDate() - 1);
      const endDate = new Date(today);
      endDate.setDate(endDate.getDate() + 1);
      const query = `deadline:${formatLocalDate(startDate)}..${formatLocalDate(endDate)}`;
      const node = SearchParser.parse(query);

      const results = await Promise.all(
        testTasks.map(async (task) => {
          const result = await SearchEvaluator.evaluate(node, task, false);
          if (result && task.deadlineDate) {
          } else if (task.deadlineDate) {
          }
          return result;
        }),
      );
      const filteredTasks = testTasks.filter((_, index) => results[index]);
      expect(filteredTasks.length).toBe(3); // Three tasks with deadline in range (yesterday, tomorrow, tomorrow)
    });

    it('should handle tasks without the specified date field', async () => {
      const query = 'deadline:2024-01-01';
      const node = SearchParser.parse(query);

      const results = await Promise.all(
        testTasks.map(async (task) => {
          return await SearchEvaluator.evaluate(node, task, false);
        }),
      );
      const filteredTasks = testTasks.filter((_, index) => results[index]);
      expect(filteredTasks.length).toBe(0); // No tasks with that deadline date
    });

    it('should handle invalid range dates', async () => {
      const query = 'scheduled:2024-01-01..invalid';
      const node = SearchParser.parse(query);

      const results = await Promise.all(
        testTasks.map(async (task) => {
          return await SearchEvaluator.evaluate(node, task, false);
        }),
      );
      const filteredTasks = testTasks.filter((_, index) => results[index]);
      expect(filteredTasks.length).toBe(0); // No matches for invalid ranges
    });

    it('should handle tasks with dates before range starts', async () => {
      const startDate = new Date(today);
      startDate.setDate(startDate.getDate() + 1);
      const endDate = new Date(today);
      endDate.setDate(endDate.getDate() + 2);
      const query = `scheduled:${formatLocalDate(startDate)}..${formatLocalDate(endDate)}`;
      const node = SearchParser.parse(query);

      const results = await Promise.all(
        testTasks.map(async (task) => {
          return await SearchEvaluator.evaluate(node, task, false);
        }),
      );
      const filteredTasks = testTasks.filter((_, index) => results[index]);
      expect(filteredTasks.length).toBe(0); // No tasks with dates in future range
    });

    it('should handle tasks with dates after range ends', async () => {
      const startDate = new Date(today);
      startDate.setDate(startDate.getDate() - 2);
      const endDate = new Date(today);
      endDate.setDate(endDate.getDate() - 1);
      const query = `scheduled:${formatLocalDate(startDate)}..${formatLocalDate(endDate)}`;
      const node = SearchParser.parse(query);

      const results = await Promise.all(
        testTasks.map(async (task) => {
          return await SearchEvaluator.evaluate(node, task, false);
        }),
      );
      const filteredTasks = testTasks.filter((_, index) => results[index]);
      expect(filteredTasks.length).toBe(1); // One task with scheduled date in range (yesterday)
    });
  });

  describe('Relative date expressions', () => {
    it('should filter tasks with scheduled:"next week"', async () => {
      const query = 'scheduled:"next week"';
      const node = SearchParser.parse(query);

      const results = await Promise.all(
        testTasks.map(async (task) => {
          return await SearchEvaluator.evaluate(node, task, false);
        }),
      );
      const filteredTasks = testTasks.filter((_, index) => results[index]);
      expect(filteredTasks.length).toBe(0); // No tasks scheduled for next week
    });

    it('should filter tasks with deadline:"this week"', async () => {
      const query = 'deadline:"this week"';
      const node = SearchParser.parse(query);

      const results = await Promise.all(
        testTasks.map(async (task) => {
          return await SearchEvaluator.evaluate(node, task, false);
        }),
      );
      const filteredTasks = testTasks.filter((_, index) => results[index]);
      expect(filteredTasks.length).toBe(3); // Tasks with deadlines this week
    });
  });

  describe('Combined filters', () => {
    it('should combine scheduled and state filters', async () => {
      const query = 'scheduled:today state:TODO';
      const node = SearchParser.parse(query);

      const results = await Promise.all(
        testTasks.map(async (task) => {
          return await SearchEvaluator.evaluate(node, task, false);
        }),
      );
      const filteredTasks = testTasks.filter((_, index) => results[index]);
      expect(filteredTasks.length).toBe(2); // Two TODO tasks with scheduled today
    });

    it('should combine deadline and priority filters', async () => {
      const query = 'deadline:tomorrow priority:high';
      const node = SearchParser.parse(query);

      const results = await Promise.all(
        testTasks.map(async (task) => {
          return await SearchEvaluator.evaluate(node, task, false);
        }),
      );
      const filteredTasks = testTasks.filter((_, index) => results[index]);
      expect(filteredTasks.length).toBe(0); // No high priority tasks with deadline tomorrow
    });

    it('should handle OR logic with date filters', async () => {
      const query = 'scheduled:today OR deadline:tomorrow';
      const node = SearchParser.parse(query);

      const results = await Promise.all(
        testTasks.map(async (task) => {
          return await SearchEvaluator.evaluate(node, task, false);
        }),
      );
      const filteredTasks = testTasks.filter((_, index) => results[index]);
      expect(filteredTasks.length).toBe(3); // Tasks with scheduled today OR deadline tomorrow
    });

    it('should handle NOT logic with date filters', async () => {
      const query = 'scheduled:today -deadline:tomorrow';
      const node = SearchParser.parse(query);

      const results = await Promise.all(
        testTasks.map(async (task) => {
          return await SearchEvaluator.evaluate(node, task, false);
        }),
      );
      const filteredTasks = testTasks.filter((_, index) => results[index]);
      expect(filteredTasks.length).toBe(1); // Tasks with scheduled today but not deadline tomorrow
    });
  });

  describe('Edge cases', () => {
    it('should handle invalid date formats gracefully', async () => {
      const query = 'scheduled:invalid-date';
      const node = SearchParser.parse(query);

      const results = await Promise.all(
        testTasks.map(async (task) => {
          return await SearchEvaluator.evaluate(node, task, false);
        }),
      );
      const filteredTasks = testTasks.filter((_, index) => results[index]);
      expect(filteredTasks.length).toBe(0); // No matches for invalid dates
    });

    it('should handle malformed date ranges', async () => {
      const query = 'scheduled:2024-01-01..invalid';
      const node = SearchParser.parse(query);

      const results = await Promise.all(
        testTasks.map(async (task) => {
          return await SearchEvaluator.evaluate(node, task, false);
        }),
      );
      const filteredTasks = testTasks.filter((_, index) => results[index]);
      expect(filteredTasks.length).toBe(0); // No matches for malformed ranges
    });

    it('should handle tasks with null dates', async () => {
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

      const result = await SearchEvaluator.evaluate(
        node,
        taskWithNullDate,
        false,
      );
      expect(result).toBe(false);
    });
  });
});
