import { SearchParser } from '../src/search/search-parser';
import { SearchEvaluator } from '../src/search/search-evaluator';
import { Task } from '../src/task';

describe('Due Filter Behavior', () => {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  // Test tasks with various dates
  const testTasks: Task[] = [
    {
      path: 'test1.md',
      line: 1,
      rawText: '- [ ] Task with scheduled date today',
      indent: '',
      listMarker: '- ',
      text: 'Task with scheduled date today',
      state: 'TODO',
      completed: false,
      priority: null,
      scheduledDate: today,
      deadlineDate: null,
    },
    {
      path: 'test2.md',
      line: 2,
      rawText: '- [ ] Task with deadline date today',
      indent: '',
      listMarker: '- ',
      text: 'Task with deadline date today',
      state: 'TODO',
      completed: false,
      priority: null,
      scheduledDate: null,
      deadlineDate: today,
    },
    {
      path: 'test3.md',
      line: 3,
      rawText: '- [ ] Task with overdue scheduled date',
      indent: '',
      listMarker: '- ',
      text: 'Task with overdue scheduled date',
      state: 'TODO',
      completed: false,
      priority: null,
      scheduledDate: yesterday,
      deadlineDate: null,
    },
    {
      path: 'test4.md',
      line: 4,
      rawText: '- [ ] Task with overdue deadline',
      indent: '',
      listMarker: '- ',
      text: 'Task with overdue deadline',
      state: 'TODO',
      completed: false,
      priority: null,
      scheduledDate: null,
      deadlineDate: yesterday,
    },
    {
      path: 'test5.md',
      line: 5,
      rawText: '- [ ] Task with future scheduled date',
      indent: '',
      listMarker: '- ',
      text: 'Task with future scheduled date',
      state: 'TODO',
      completed: false,
      priority: null,
      scheduledDate: tomorrow,
      deadlineDate: null,
    },
    {
      path: 'test6.md',
      line: 6,
      rawText: '- [ ] Task with future deadline',
      indent: '',
      listMarker: '- ',
      text: 'Task with future deadline',
      state: 'TODO',
      completed: false,
      priority: null,
      scheduledDate: null,
      deadlineDate: tomorrow,
    },
  ];

  test('scheduled:due should include both today and overdue scheduled tasks', () => {
    const query = 'scheduled:due';
    const node = SearchParser.parse(query);

    const results = testTasks.filter((task) =>
      SearchEvaluator.evaluate(node, task, false)
    );

    expect(results.length).toBe(2);
    expect(results.map((r) => r.text)).toContain(
      'Task with scheduled date today'
    );
    expect(results.map((r) => r.text)).toContain(
      'Task with overdue scheduled date'
    );
    expect(results.map((r) => r.text)).not.toContain(
      'Task with future scheduled date'
    );
  });

  test('deadline:due should include both today and overdue deadline tasks', () => {
    const query = 'deadline:due';
    const node = SearchParser.parse(query);

    const results = testTasks.filter((task) =>
      SearchEvaluator.evaluate(node, task, false)
    );

    expect(results.length).toBe(2);
    expect(results.map((r) => r.text)).toContain(
      'Task with deadline date today'
    );
    expect(results.map((r) => r.text)).toContain('Task with overdue deadline');
    expect(results.map((r) => r.text)).not.toContain(
      'Task with future deadline'
    );
  });

  test('scheduled:today should only include scheduled tasks for today', () => {
    const query = 'scheduled:today';
    const node = SearchParser.parse(query);

    const results = testTasks.filter((task) =>
      SearchEvaluator.evaluate(node, task, false)
    );

    expect(results.length).toBe(1);
    expect(results.map((r) => r.text)).toContain(
      'Task with scheduled date today'
    );
    expect(results.map((r) => r.text)).not.toContain(
      'Task with overdue scheduled date'
    );
    expect(results.map((r) => r.text)).not.toContain(
      'Task with future scheduled date'
    );
  });

  test('deadline:today should only include deadline tasks for today', () => {
    const query = 'deadline:today';
    const node = SearchParser.parse(query);

    const results = testTasks.filter((task) =>
      SearchEvaluator.evaluate(node, task, false)
    );

    expect(results.length).toBe(1);
    expect(results.map((r) => r.text)).toContain(
      'Task with deadline date today'
    );
    expect(results.map((r) => r.text)).not.toContain(
      'Task with overdue deadline'
    );
    expect(results.map((r) => r.text)).not.toContain(
      'Task with future deadline'
    );
  });

  test('scheduled:overdue should only include overdue scheduled tasks', () => {
    const query = 'scheduled:overdue';
    const node = SearchParser.parse(query);

    const results = testTasks.filter((task) =>
      SearchEvaluator.evaluate(node, task, false)
    );

    expect(results.length).toBe(1);
    expect(results.map((r) => r.text)).toContain(
      'Task with overdue scheduled date'
    );
    expect(results.map((r) => r.text)).not.toContain(
      'Task with scheduled date today'
    );
    expect(results.map((r) => r.text)).not.toContain(
      'Task with future scheduled date'
    );
  });

  test('deadline:overdue should only include overdue deadline tasks', () => {
    const query = 'deadline:overdue';
    const node = SearchParser.parse(query);

    const results = testTasks.filter((task) =>
      SearchEvaluator.evaluate(node, task, false)
    );

    expect(results.length).toBe(1);
    expect(results.map((r) => r.text)).toContain('Task with overdue deadline');
    expect(results.map((r) => r.text)).not.toContain(
      'Task with deadline date today'
    );
    expect(results.map((r) => r.text)).not.toContain(
      'Task with future deadline'
    );
  });
});
