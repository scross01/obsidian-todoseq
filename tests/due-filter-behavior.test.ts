import { SearchParser } from '../src/search/search-parser';
import { SearchEvaluator } from '../src/search/search-evaluator';
import { Task } from '../src/types/task';
import { createCheckboxTask } from './helpers/test-helper';

describe('Due Filter Behavior', () => {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  // Test tasks with various dates
  const testTasks: Task[] = [
    createCheckboxTask({
      path: 'test1.md',
      line: 1,
      rawText: '- [ ] TODO Task with scheduled date today',
      text: 'Task with scheduled date today',
      scheduledDate: today,
    }),
    createCheckboxTask({
      path: 'test2.md',
      line: 2,
      rawText: '- [ ] TODO Task with deadline date today',
      text: 'Task with deadline date today',
      deadlineDate: today,
    }),
    createCheckboxTask({
      path: 'test3.md',
      line: 3,
      rawText: '- [ ] TODO Task with overdue scheduled date',
      text: 'Task with overdue scheduled date',
      scheduledDate: yesterday,
    }),
    createCheckboxTask({
      path: 'test4.md',
      line: 4,
      rawText: '- [ ] TODO Task with overdue deadline',
      text: 'Task with overdue deadline',
      deadlineDate: yesterday,
    }),
    createCheckboxTask({
      path: 'test5.md',
      line: 5,
      rawText: '- [ ] TODO Task with future scheduled date',
      text: 'Task with future scheduled date',
      scheduledDate: tomorrow,
    }),
    createCheckboxTask({
      path: 'test6.md',
      line: 6,
      rawText: '- [ ] TODO Task with future deadline',
      text: 'Task with future deadline',
      deadlineDate: tomorrow,
    }),
  ];

  test('scheduled:due should include both today and overdue scheduled tasks', async () => {
    const query = 'scheduled:due';
    const node = SearchParser.parse(query);

    const results = await Promise.all(
      testTasks.map(async (task) => {
        return await SearchEvaluator.evaluate(node, task, false);
      }),
    );
    const filteredResults = testTasks.filter((_, index) => results[index]);

    expect(filteredResults.length).toBe(2);
    expect(filteredResults.map((r) => r.text)).toContain(
      'Task with scheduled date today',
    );
    expect(filteredResults.map((r) => r.text)).toContain(
      'Task with overdue scheduled date',
    );
    expect(filteredResults.map((r) => r.text)).not.toContain(
      'Task with future scheduled date',
    );
  });

  test('deadline:due should include both today and overdue deadline tasks', async () => {
    const query = 'deadline:due';
    const node = SearchParser.parse(query);

    const results = await Promise.all(
      testTasks.map(async (task) => {
        return await SearchEvaluator.evaluate(node, task, false);
      }),
    );
    const filteredResults = testTasks.filter((_, index) => results[index]);

    expect(filteredResults.length).toBe(2);
    expect(filteredResults.map((r) => r.text)).toContain(
      'Task with deadline date today',
    );
    expect(filteredResults.map((r) => r.text)).toContain(
      'Task with overdue deadline',
    );
    expect(filteredResults.map((r) => r.text)).not.toContain(
      'Task with future deadline',
    );
  });

  test('scheduled:today should only include scheduled tasks for today', async () => {
    const query = 'scheduled:today';
    const node = SearchParser.parse(query);

    const results = await Promise.all(
      testTasks.map(async (task) => {
        return await SearchEvaluator.evaluate(node, task, false);
      }),
    );
    const filteredResults = testTasks.filter((_, index) => results[index]);

    expect(filteredResults.length).toBe(1);
    expect(filteredResults.map((r) => r.text)).toContain(
      'Task with scheduled date today',
    );
    expect(filteredResults.map((r) => r.text)).not.toContain(
      'Task with overdue scheduled date',
    );
    expect(filteredResults.map((r) => r.text)).not.toContain(
      'Task with future scheduled date',
    );
  });

  test('deadline:today should only include deadline tasks for today', async () => {
    const query = 'deadline:today';
    const node = SearchParser.parse(query);

    const results = await Promise.all(
      testTasks.map(async (task) => {
        return await SearchEvaluator.evaluate(node, task, false);
      }),
    );
    const filteredResults = testTasks.filter((_, index) => results[index]);

    expect(filteredResults.length).toBe(1);
    expect(filteredResults.map((r) => r.text)).toContain(
      'Task with deadline date today',
    );
    expect(filteredResults.map((r) => r.text)).not.toContain(
      'Task with overdue deadline',
    );
    expect(filteredResults.map((r) => r.text)).not.toContain(
      'Task with future deadline',
    );
  });

  test('scheduled:overdue should only include overdue scheduled tasks', async () => {
    const query = 'scheduled:overdue';
    const node = SearchParser.parse(query);

    const results = await Promise.all(
      testTasks.map(async (task) => {
        return await SearchEvaluator.evaluate(node, task, false);
      }),
    );
    const filteredResults = testTasks.filter((_, index) => results[index]);

    expect(filteredResults.length).toBe(1);
    expect(filteredResults.map((r) => r.text)).toContain(
      'Task with overdue scheduled date',
    );
    expect(filteredResults.map((r) => r.text)).not.toContain(
      'Task with scheduled date today',
    );
    expect(filteredResults.map((r) => r.text)).not.toContain(
      'Task with future scheduled date',
    );
  });

  test('deadline:overdue should only include overdue deadline tasks', async () => {
    const query = 'deadline:overdue';
    const node = SearchParser.parse(query);

    const results = await Promise.all(
      testTasks.map(async (task) => {
        return await SearchEvaluator.evaluate(node, task, false);
      }),
    );
    const filteredResults = testTasks.filter((_, index) => results[index]);

    expect(filteredResults.length).toBe(1);
    expect(filteredResults.map((r) => r.text)).toContain(
      'Task with overdue deadline',
    );
    expect(filteredResults.map((r) => r.text)).not.toContain(
      'Task with deadline date today',
    );
    expect(filteredResults.map((r) => r.text)).not.toContain(
      'Task with future deadline',
    );
  });
});
