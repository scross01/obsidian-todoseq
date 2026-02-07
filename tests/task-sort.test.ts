import {
  CompletedTaskSetting,
  FutureTaskSetting,
  sortTasksInBlocks,
  sortTasksWithThreeBlockSystem,
  taskComparator,
  // Keyword sort types and functions
  getKeywordGroup,
  keywordSortComparator,
  buildKeywordSortConfig,
  KeywordSortConfig,
} from '../src/utils/task-sort';
import { Task } from '../src/types/task';
import { createBaseTask } from './helpers/test-helper';

describe('Task Sorting System', () => {
  const now = new Date('2024-01-15T12:00:00Z');
  const pastDate = new Date('2024-01-10T12:00:00Z');
  const todayDate = new Date('2024-01-15T08:00:00Z');
  const tomorrowDate = new Date('2024-01-16T12:00:00Z');
  const upcomingDate = new Date('2024-01-18T12:00:00Z'); // 3 days from now
  const sevenDaysDate = new Date('2024-01-22T12:00:00Z'); // 7 days from now
  const futureDate = new Date('2024-01-25T12:00:00Z'); // 10 days from now

  const createTask = (overrides: Partial<Task> = {}): Task =>
    createBaseTask({
      line: 1,
      rawText: 'TODO Test task',
      listMarker: '- ',
      text: 'Test task',
      tail: '',
      ...overrides,
    });

  describe('Task Classification', () => {
    it('should classify completed tasks as completed regardless of dates', () => {
      const completedTask = createTask({
        completed: true,
        scheduledDate: futureDate,
        deadlineDate: futureDate,
      });

      const blocks = sortTasksInBlocks(
        [completedTask],
        now,
        'showAll',
        'showAll',
      );
      expect(blocks).toHaveLength(1);
      expect(blocks[0].type).toBe('main');
      expect(blocks[0].tasks[0].completed).toBe(true);
    });

    it('should classify tasks with no dates as current', () => {
      const undatedTask = createTask();

      const blocks = sortTasksInBlocks(
        [undatedTask],
        now,
        'showAll',
        'showAll',
      );
      expect(blocks).toHaveLength(1);
      expect(blocks[0].type).toBe('main');
      expect(blocks[0].tasks[0]).toBe(undatedTask);
    });

    it('should classify tasks with past dates as current', () => {
      const pastTask = createTask({ scheduledDate: pastDate });

      const blocks = sortTasksInBlocks([pastTask], now, 'showAll', 'showAll');
      expect(blocks).toHaveLength(1);
      expect(blocks[0].type).toBe('main');
    });

    it("should classify tasks with today's date as current", () => {
      const todayTask = createTask({ scheduledDate: todayDate });

      const blocks = sortTasksInBlocks([todayTask], now, 'showAll', 'showAll');
      expect(blocks).toHaveLength(1);
      expect(blocks[0].type).toBe('main');
    });

    it('should classify tasks within 7 days as upcoming', () => {
      const upcomingTask = createTask({ scheduledDate: upcomingDate });

      const blocks = sortTasksInBlocks(
        [upcomingTask],
        now,
        'showAll',
        'showAll',
      );
      expect(blocks).toHaveLength(1);
      expect(blocks[0].type).toBe('main');
    });

    it('should classify tasks exactly 7 days away as upcoming', () => {
      const sevenDayTask = createTask({ scheduledDate: sevenDaysDate });

      const blocks = sortTasksInBlocks(
        [sevenDayTask],
        now,
        'showAll',
        'showAll',
      );
      expect(blocks).toHaveLength(1);
      expect(blocks[0].type).toBe('main');
    });

    it('should classify tasks beyond 7 days as future', () => {
      const futureTask = createTask({ scheduledDate: futureDate });

      const blocks = sortTasksInBlocks([futureTask], now, 'showAll', 'showAll');
      expect(blocks).toHaveLength(1);
      expect(blocks[0].type).toBe('main');
    });

    it('should use earliest date when task has both scheduled and deadline', () => {
      const taskWithBoth = createTask({
        scheduledDate: futureDate, // 10 days away
        deadlineDate: tomorrowDate, // 1 day away
      });

      // Should be classified as upcoming (1 day away)
      const blocks = sortTasksInBlocks(
        [taskWithBoth],
        now,
        'showAll',
        'showAll',
      );
      expect(blocks).toHaveLength(1);
      expect(blocks[0].type).toBe('main');
    });

    it('should classify task as current if one date is past and one is future', () => {
      const mixedTask = createTask({
        scheduledDate: pastDate,
        deadlineDate: futureDate,
      });

      const blocks = sortTasksInBlocks([mixedTask], now, 'showAll', 'showAll');
      expect(blocks).toHaveLength(1);
      expect(blocks[0].type).toBe('main');
    });
  });

  describe('Three-Block System', () => {
    const currentTask = createTask({
      scheduledDate: pastDate,
      text: 'Current',
    });
    const upcomingTask = createTask({
      scheduledDate: upcomingDate,
      text: 'Upcoming',
    });
    const futureTask = createTask({
      scheduledDate: futureDate,
      text: 'Future',
    });
    const completedTask = createTask({ completed: true, text: 'Completed' });

    describe('Main Block Contents', () => {
      it('showAll future setting: includes all tasks in main block', () => {
        const tasks = [currentTask, upcomingTask, futureTask, completedTask];
        const blocks = sortTasksInBlocks(tasks, now, 'showAll', 'showAll');

        expect(blocks).toHaveLength(1);
        expect(blocks[0].type).toBe('main');
        expect(blocks[0].tasks).toHaveLength(4);
      });

      it('showUpcoming future setting: includes current + upcoming only', () => {
        const tasks = [currentTask, upcomingTask, futureTask, completedTask];
        const blocks = sortTasksInBlocks(tasks, now, 'showUpcoming', 'showAll');

        expect(blocks).toHaveLength(1);
        expect(blocks[0].type).toBe('main');
        expect(blocks[0].tasks).toHaveLength(3); // current + upcoming + completed
        expect(blocks[0].tasks.map((t) => t.text)).toContain('Current');
        expect(blocks[0].tasks.map((t) => t.text)).toContain('Upcoming');
        expect(blocks[0].tasks.map((t) => t.text)).toContain('Completed');
        expect(blocks[0].tasks.map((t) => t.text)).not.toContain('Future');
      });

      it('sortToEnd future setting: includes current only', () => {
        const tasks = [currentTask, upcomingTask, futureTask, completedTask];
        const blocks = sortTasksInBlocks(tasks, now, 'sortToEnd', 'showAll');

        expect(blocks).toHaveLength(2); // main + future blocks
        expect(blocks[0].type).toBe('main');
        expect(blocks[0].tasks).toHaveLength(2); // current + completed
        expect(blocks[0].tasks.map((t) => t.text)).toContain('Current');
        expect(blocks[0].tasks.map((t) => t.text)).toContain('Completed');
        expect(blocks[0].tasks.map((t) => t.text)).not.toContain('Upcoming');
        expect(blocks[0].tasks.map((t) => t.text)).not.toContain('Future');

        expect(blocks[1].type).toBe('future');
        expect(blocks[1].tasks).toHaveLength(2); // upcoming + future
        expect(blocks[1].tasks.map((t) => t.text)).toContain('Upcoming');
        expect(blocks[1].tasks.map((t) => t.text)).toContain('Future');
      });

      it('hideFuture future setting: includes current only', () => {
        const tasks = [currentTask, upcomingTask, futureTask, completedTask];
        const blocks = sortTasksInBlocks(tasks, now, 'hideFuture', 'showAll');

        expect(blocks).toHaveLength(1);
        expect(blocks[0].type).toBe('main');
        expect(blocks[0].tasks).toHaveLength(2); // current + completed
        expect(blocks[0].tasks.map((t) => t.text)).toContain('Current');
        expect(blocks[0].tasks.map((t) => t.text)).toContain('Completed');
        expect(blocks[0].tasks.map((t) => t.text)).not.toContain('Upcoming');
        expect(blocks[0].tasks.map((t) => t.text)).not.toContain('Future');
      });
    });

    describe('Future Block', () => {
      it('appears only when sortToEnd is selected', () => {
        const tasks = [currentTask, upcomingTask, futureTask];

        const blocksShowAll = sortTasksInBlocks(
          tasks,
          now,
          'showAll',
          'showAll',
        );
        expect(blocksShowAll.filter((b) => b.type === 'future')).toHaveLength(
          0,
        );

        const blocksSortToEnd = sortTasksInBlocks(
          tasks,
          now,
          'sortToEnd',
          'showAll',
        );
        expect(blocksSortToEnd.filter((b) => b.type === 'future')).toHaveLength(
          1,
        );
      });

      it('contains all future tasks including upcoming when sortToEnd is selected', () => {
        const tasks = [currentTask, upcomingTask, futureTask];
        const blocks = sortTasksInBlocks(tasks, now, 'sortToEnd', 'showAll');

        const futureBlock = blocks.find((b) => b.type === 'future');
        expect(futureBlock).toBeDefined();
        if (!futureBlock) throw new Error('Future block should be defined');
        expect(futureBlock.tasks).toHaveLength(2);
        expect(futureBlock.tasks.map((t) => t.text)).toContain('Upcoming');
        expect(futureBlock.tasks.map((t) => t.text)).toContain('Future');
      });
    });

    describe('Completed Block', () => {
      it('appears only when sortToEnd is selected', () => {
        const tasks = [currentTask, completedTask];

        const blocksShowAll = sortTasksInBlocks(
          tasks,
          now,
          'showAll',
          'showAll',
        );
        expect(
          blocksShowAll.filter((b) => b.type === 'completed'),
        ).toHaveLength(0);

        const blocksSortToEnd = sortTasksInBlocks(
          tasks,
          now,
          'showAll',
          'sortToEnd',
        );
        expect(
          blocksSortToEnd.filter((b) => b.type === 'completed'),
        ).toHaveLength(1);
      });

      it('contains all completed tasks when sortToEnd is selected', () => {
        const completed1 = createTask({ completed: true, text: 'Completed 1' });
        const completed2 = createTask({ completed: true, text: 'Completed 2' });
        const tasks = [currentTask, completed1, completed2];

        const blocks = sortTasksInBlocks(tasks, now, 'showAll', 'sortToEnd');

        const completedBlock = blocks.find((b) => b.type === 'completed');
        expect(completedBlock).toBeDefined();
        if (!completedBlock)
          throw new Error('Completed block should be defined');
        expect(completedBlock.tasks).toHaveLength(2);
        expect(completedBlock.tasks.map((t) => t.text)).toContain(
          'Completed 1',
        );
        expect(completedBlock.tasks.map((t) => t.text)).toContain(
          'Completed 2',
        );
      });

      it('hides completed tasks when hide is selected', () => {
        const tasks = [currentTask, completedTask];
        const blocks = sortTasksInBlocks(tasks, now, 'showAll', 'hide');

        expect(blocks).toHaveLength(1);
        expect(blocks[0].type).toBe('main');
        expect(blocks[0].tasks).toHaveLength(1);
        expect(blocks[0].tasks[0].completed).toBe(false);
      });
    });

    describe('Block Order', () => {
      it('returns blocks in correct order: main, future, completed', () => {
        const tasks = [currentTask, upcomingTask, futureTask, completedTask];
        const blocks = sortTasksInBlocks(tasks, now, 'sortToEnd', 'sortToEnd');

        expect(blocks).toHaveLength(3);
        expect(blocks[0].type).toBe('main');
        expect(blocks[1].type).toBe('future');
        expect(blocks[2].type).toBe('completed');
      });
    });
  });

  describe('Sorting Within Blocks', () => {
    it('sorts by default method (file path, then line) within each block', () => {
      const task1 = createTask({
        path: 'b.md',
        line: 2,
        scheduledDate: pastDate,
      });
      const task2 = createTask({
        path: 'a.md',
        line: 1,
        scheduledDate: pastDate,
      });
      const task3 = createTask({
        path: 'a.md',
        line: 3,
        scheduledDate: futureDate,
      });

      const blocks = sortTasksInBlocks(
        [task1, task2, task3],
        now,
        'sortToEnd',
        'showAll',
        'default',
      );

      // Main block should be sorted by path then line
      const mainBlock = blocks.find((b) => b.type === 'main');
      expect(mainBlock).toBeDefined();
      if (!mainBlock) throw new Error('Main block should be defined');
      expect(mainBlock.tasks[0]).toBe(task2); // a.md:1
      expect(mainBlock.tasks[1]).toBe(task1); // b.md:2

      // Future block should also be sorted
      const futureBlock = blocks.find((b) => b.type === 'future');
      expect(futureBlock).toBeDefined();
      if (!futureBlock) throw new Error('Future block should be defined');
      expect(futureBlock.tasks[0]).toBe(task3); // a.md:3
    });

    it('sorts by scheduled date when selected', () => {
      const task1 = createTask({ scheduledDate: futureDate, text: 'Later' });
      const task2 = createTask({ scheduledDate: pastDate, text: 'Earlier' });
      const task3 = createTask({ scheduledDate: tomorrowDate, text: 'Middle' });

      const blocks = sortTasksInBlocks(
        [task1, task2, task3],
        now,
        'showAll',
        'showAll',
        'sortByScheduled',
      );

      const mainBlock = blocks.find((b) => b.type === 'main');
      expect(mainBlock).toBeDefined();
      if (!mainBlock) throw new Error('Main block should be defined');
      const texts = mainBlock.tasks.map((t) => t.text);
      expect(texts).toEqual(['Earlier', 'Middle', 'Later']);
    });

    it('sorts by deadline date when selected', () => {
      const task1 = createTask({ deadlineDate: futureDate, text: 'Later' });
      const task2 = createTask({ deadlineDate: pastDate, text: 'Earlier' });
      const task3 = createTask({ deadlineDate: tomorrowDate, text: 'Middle' });

      const blocks = sortTasksInBlocks(
        [task1, task2, task3],
        now,
        'showAll',
        'showAll',
        'sortByDeadline',
      );

      const mainBlock = blocks.find((b) => b.type === 'main');
      expect(mainBlock).toBeDefined();
      if (!mainBlock) throw new Error('Main block should be defined');
      const texts = mainBlock.tasks.map((t) => t.text);
      expect(texts).toEqual(['Earlier', 'Middle', 'Later']);
    });

    it('sorts by priority when selected', () => {
      const task1 = createTask({ priority: 'low', text: 'Low' });
      const task2 = createTask({ priority: 'high', text: 'High' });
      const task3 = createTask({ priority: 'med', text: 'Med' });
      const task4 = createTask({ priority: null, text: 'None' });

      const blocks = sortTasksInBlocks(
        [task1, task2, task3, task4],
        now,
        'showAll',
        'showAll',
        'sortByPriority',
      );

      const mainBlock = blocks.find((b) => b.type === 'main');
      expect(mainBlock).toBeDefined();
      if (!mainBlock) throw new Error('Main block should be defined');
      const texts = mainBlock.tasks.map((t) => t.text);
      expect(texts).toEqual(['High', 'Med', 'Low', 'None']);
    });

    it('falls back to default sorting when priorities are equal', () => {
      const task1 = createTask({ priority: 'high', path: 'b.md', line: 1 });
      const task2 = createTask({ priority: 'high', path: 'a.md', line: 1 });

      const blocks = sortTasksInBlocks(
        [task1, task2],
        now,
        'showAll',
        'showAll',
        'sortByPriority',
      );

      const mainBlock = blocks.find((b) => b.type === 'main');
      expect(mainBlock).toBeDefined();
      if (!mainBlock) throw new Error('Main block should be defined');
      expect(mainBlock.tasks[0].path).toBe('a.md');
      expect(mainBlock.tasks[1].path).toBe('b.md');
    });

    it('sorts by urgency when selected', () => {
      const task1 = createTask({ urgency: 5.0, text: 'Medium urgency' });
      const task2 = createTask({ urgency: 15.0, text: 'High urgency' });
      const task3 = createTask({ urgency: 2.0, text: 'Low urgency' });

      const blocks = sortTasksInBlocks(
        [task1, task2, task3],
        now,
        'showAll',
        'showAll',
        'sortByUrgency',
      );

      const mainBlock = blocks.find((b) => b.type === 'main');
      expect(mainBlock).toBeDefined();
      if (!mainBlock) throw new Error('Main block should be defined');
      const texts = mainBlock.tasks.map((t) => t.text);
      expect(texts).toEqual(['High urgency', 'Medium urgency', 'Low urgency']);
    });

    it('sorts null urgency values to the end', () => {
      const task1 = createTask({ urgency: 5.0, text: 'Has urgency' });
      const task2 = createTask({ urgency: null, text: 'No urgency' });
      const task3 = createTask({ urgency: 10.0, text: 'High urgency' });

      const blocks = sortTasksInBlocks(
        [task1, task2, task3],
        now,
        'showAll',
        'showAll',
        'sortByUrgency',
      );

      const mainBlock = blocks.find((b) => b.type === 'main');
      expect(mainBlock).toBeDefined();
      if (!mainBlock) throw new Error('Main block should be defined');
      const texts = mainBlock.tasks.map((t) => t.text);
      expect(texts).toEqual(['High urgency', 'Has urgency', 'No urgency']);
    });

    it('falls back to default sorting when urgencies are equal', () => {
      const task1 = createTask({ urgency: 10.0, path: 'b.md', line: 1 });
      const task2 = createTask({ urgency: 10.0, path: 'a.md', line: 1 });

      const blocks = sortTasksInBlocks(
        [task1, task2],
        now,
        'showAll',
        'showAll',
        'sortByUrgency',
      );

      const mainBlock = blocks.find((b) => b.type === 'main');
      expect(mainBlock).toBeDefined();
      if (!mainBlock) throw new Error('Main block should be defined');
      expect(mainBlock.tasks[0].path).toBe('a.md');
      expect(mainBlock.tasks[1].path).toBe('b.md');
    });

    it('handles all null urgency values with default sorting', () => {
      const task1 = createTask({ urgency: null, path: 'b.md', line: 1 });
      const task2 = createTask({ urgency: null, path: 'a.md', line: 1 });

      const blocks = sortTasksInBlocks(
        [task1, task2],
        now,
        'showAll',
        'showAll',
        'sortByUrgency',
      );

      const mainBlock = blocks.find((b) => b.type === 'main');
      expect(mainBlock).toBeDefined();
      if (!mainBlock) throw new Error('Main block should be defined');
      expect(mainBlock.tasks[0].path).toBe('a.md');
      expect(mainBlock.tasks[1].path).toBe('b.md');
    });

    it('sorts each block independently', () => {
      const current1 = createTask({
        scheduledDate: pastDate,
        path: 'b.md',
        text: 'Current1',
      });
      const current2 = createTask({
        scheduledDate: pastDate,
        path: 'a.md',
        text: 'Current2',
      });
      const future1 = createTask({
        scheduledDate: futureDate,
        path: 'b.md',
        text: 'Future1',
      });
      const future2 = createTask({
        scheduledDate: futureDate,
        path: 'a.md',
        text: 'Future2',
      });

      const blocks = sortTasksInBlocks(
        [current1, current2, future1, future2],
        now,
        'sortToEnd',
        'showAll',
        'default',
      );

      const mainBlock = blocks.find((b) => b.type === 'main');
      const futureBlock = blocks.find((b) => b.type === 'future');

      expect(mainBlock).toBeDefined();
      expect(futureBlock).toBeDefined();
      if (!mainBlock) throw new Error('Main block should be defined');
      if (!futureBlock) throw new Error('Future block should be defined');

      // Both blocks should be sorted independently by path
      expect(mainBlock.tasks[0].text).toBe('Current2'); // a.md
      expect(mainBlock.tasks[1].text).toBe('Current1'); // b.md
      expect(futureBlock.tasks[0].text).toBe('Future2'); // a.md
      expect(futureBlock.tasks[1].text).toBe('Future1'); // b.md
    });
  });

  describe('Flatten Blocks Function', () => {
    it('combines all blocks into a single array in order', () => {
      const currentTask = createTask({
        scheduledDate: pastDate,
        text: 'Current',
      });
      const futureTask = createTask({
        scheduledDate: futureDate,
        text: 'Future',
      });
      const completedTask = createTask({ completed: true, text: 'Completed' });

      const blocks = sortTasksInBlocks(
        [currentTask, futureTask, completedTask],
        now,
        'sortToEnd',
        'sortToEnd',
      );

      const flattened = blocks.flatMap((b) => b.tasks);
      expect(flattened).toHaveLength(3);
      expect(flattened[0].text).toBe('Current');
      expect(flattened[1].text).toBe('Future');
      expect(flattened[2].text).toBe('Completed');
    });
  });

  describe('Combined Function', () => {
    it('sortTasksWithThreeBlockSystem returns flattened array directly', () => {
      const currentTask = createTask({
        scheduledDate: pastDate,
        text: 'Current',
      });
      const futureTask = createTask({
        scheduledDate: futureDate,
        text: 'Future',
      });
      const completedTask = createTask({ completed: true, text: 'Completed' });

      const result = sortTasksWithThreeBlockSystem(
        [currentTask, futureTask, completedTask],
        now,
        'sortToEnd',
        'sortToEnd',
      );

      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(3);
      expect(result[0].text).toBe('Current');
      expect(result[1].text).toBe('Future');
      expect(result[2].text).toBe('Completed');
    });
  });

  describe('Edge Cases', () => {
    it('handles empty task array', () => {
      const blocks = sortTasksInBlocks([], now, 'showAll', 'showAll');
      expect(blocks).toHaveLength(0);
    });

    it('handles tasks with only deadline dates', () => {
      const deadlineOnly = createTask({ deadlineDate: futureDate });
      const blocks = sortTasksInBlocks(
        [deadlineOnly],
        now,
        'showAll',
        'showAll',
      );
      expect(blocks).toHaveLength(1);
      expect(blocks[0].type).toBe('main');
    });

    it('handles tasks with only scheduled dates', () => {
      const scheduledOnly = createTask({ scheduledDate: futureDate });
      const blocks = sortTasksInBlocks(
        [scheduledOnly],
        now,
        'showAll',
        'showAll',
      );
      expect(blocks).toHaveLength(1);
      expect(blocks[0].type).toBe('main');
    });

    it('handles mixed completed and future tasks correctly', () => {
      const completedFuture = createTask({
        completed: true,
        scheduledDate: futureDate,
        text: 'Completed Future',
      });
      const incompleteFuture = createTask({
        completed: false,
        scheduledDate: futureDate,
        text: 'Incomplete Future',
      });

      const blocks = sortTasksInBlocks(
        [completedFuture, incompleteFuture],
        now,
        'sortToEnd',
        'sortToEnd',
      );

      // Completed task should be in completed block (sortToEnd completed setting)
      // Incomplete future should be in future block
      const completedBlock = blocks.find((b) => b.type === 'completed');
      const futureBlock = blocks.find((b) => b.type === 'future');

      expect(completedBlock).toBeDefined();
      if (!completedBlock) throw new Error('Completed block should be defined');
      expect(completedBlock.tasks).toHaveLength(1);
      expect(completedBlock.tasks[0].text).toBe('Completed Future');
      expect(futureBlock).toBeDefined();
      if (!futureBlock) throw new Error('Future block should be defined');
      expect(futureBlock.tasks).toHaveLength(1);
      expect(futureBlock.tasks[0].text).toBe('Incomplete Future');
    });

    it('respects all combinations of future and completed settings', () => {
      const tasks = [
        createTask({ scheduledDate: pastDate, text: 'Current' }),
        createTask({ scheduledDate: upcomingDate, text: 'Upcoming' }),
        createTask({ scheduledDate: futureDate, text: 'Future' }),
        createTask({ completed: true, text: 'Completed' }),
      ];

      // Test all combinations
      const futureSettings: FutureTaskSetting[] = [
        'showAll',
        'showUpcoming',
        'sortToEnd',
        'hideFuture',
      ];
      const completedSettings: CompletedTaskSetting[] = [
        'showAll',
        'sortToEnd',
        'hide',
      ];

      for (const futureSetting of futureSettings) {
        for (const completedSetting of completedSettings) {
          const blocks = sortTasksInBlocks(
            tasks,
            now,
            futureSetting,
            completedSetting,
          );

          // Verify no undefined blocks
          expect(
            blocks.every(
              (b) =>
                b.type === 'main' ||
                b.type === 'future' ||
                b.type === 'completed',
            ),
          ).toBe(true);

          // Verify no duplicate tasks by checking all task references
          const allTasks = blocks.flatMap((b) => b.tasks);
          const taskSet = new Set(allTasks);
          expect(allTasks.length).toBe(taskSet.size);
        }
      }
    });
  });

  describe('Task Comparator', () => {
    it('sorts by path first, then by line', () => {
      const task1 = createTask({ path: 'a.md', line: 2 });
      const task2 = createTask({ path: 'a.md', line: 1 });
      const task3 = createTask({ path: 'b.md', line: 1 });

      const sorted = [task1, task2, task3].sort(taskComparator);

      expect(sorted[0]).toBe(task2); // a.md:1
      expect(sorted[1]).toBe(task1); // a.md:2
      expect(sorted[2]).toBe(task3); // b.md:1
    });

    it('handles tasks from different files correctly', () => {
      const task1 = createTask({ path: 'z.md', line: 1 });
      const task2 = createTask({ path: 'a.md', line: 1 });

      const sorted = [task1, task2].sort(taskComparator);

      expect(sorted[0]).toBe(task2); // a.md comes before z.md
      expect(sorted[1]).toBe(task1);
    });

    it('should sort tasks by path first', () => {
      const taskA = createTask({ path: 'a/file.md', line: 1 });
      const taskB = createTask({ path: 'b/file.md', line: 1 });

      expect(taskComparator(taskA, taskB)).toBeLessThan(0);
      expect(taskComparator(taskB, taskA)).toBeGreaterThan(0);
    });

    it('should sort tasks by line number when paths are equal', () => {
      const task1 = createTask({ path: 'same/file.md', line: 5 });
      const task2 = createTask({ path: 'same/file.md', line: 10 });

      expect(taskComparator(task1, task2)).toBeLessThan(0);
      expect(taskComparator(task2, task1)).toBeGreaterThan(0);
    });

    it('should return 0 for identical tasks', () => {
      const task1 = createTask({ path: 'same/file.md', line: 5 });
      const task2 = createTask({ path: 'same/file.md', line: 5 });

      expect(taskComparator(task1, task2)).toBe(0);
    });

    it('should handle different path lengths', () => {
      const taskShort = createTask({ path: 'file.md', line: 1 });
      const taskLong = createTask({
        path: 'very/long/path/to/file.md',
        line: 1,
      });

      expect(taskComparator(taskShort, taskLong)).toBeLessThan(0);
      expect(taskComparator(taskLong, taskShort)).toBeGreaterThan(0);
    });
  });
});

/**
 * Helper functions for keyword sort tests
 */
function createMockTaskWithKeyword(
  keyword: string,
  completed = false,
  overrides: Partial<Task> = {},
): Task {
  return createBaseTask({
    state: keyword,
    completed,
    text: `${keyword} task`,
    ...overrides,
  });
}

function createMockKeywordConfig(
  customKeywords: string[] = [],
): KeywordSortConfig {
  const activeStatesOrder = ['NOW', 'DOING', 'IN-PROGRESS'];
  const pendingStatesOrder = ['TODO', 'LATER'];
  const waitingStatesOrder = ['WAIT', 'WAITING'];
  const completedStatesOrder = ['DONE', 'CANCELED', 'CANCELLED'];

  return {
    customKeywords: customKeywords.map((k) => k.toUpperCase()),
    activeStates: new Set(activeStatesOrder),
    activeStatesOrder,
    pendingStates: new Set(pendingStatesOrder),
    pendingStatesOrder,
    waitingStates: new Set(waitingStatesOrder),
    waitingStatesOrder,
    completedStates: new Set(completedStatesOrder),
    completedStatesOrder,
  };
}

/**
 * Keyword Sort Feature Tests (TDD - tests written before implementation)
 *
 * These tests define the expected behavior for the keyword sort feature.
 * The keyword sort is a SECONDARY sort within meta groups (current/future/completed),
 * NOT a replacement for the three-block sorting system.
 */
describe('Keyword Sort Feature', () => {
  describe('getKeywordGroup()', () => {
    let defaultConfig: KeywordSortConfig;

    beforeEach(() => {
      defaultConfig = createMockKeywordConfig();
    });

    describe('Group 1 - Active States', () => {
      it('returns group 1 for NOW keyword', () => {
        const task = createMockTaskWithKeyword('NOW');
        expect(getKeywordGroup(task, defaultConfig)).toBe(1);
      });

      it('returns group 1 for DOING keyword', () => {
        const task = createMockTaskWithKeyword('DOING');
        expect(getKeywordGroup(task, defaultConfig)).toBe(1);
      });

      it('returns group 1 for IN-PROGRESS keyword', () => {
        const task = createMockTaskWithKeyword('IN-PROGRESS');
        expect(getKeywordGroup(task, defaultConfig)).toBe(1);
      });

      it('handles case-insensitive matching for active states', () => {
        const taskLower = createMockTaskWithKeyword('now');
        const taskMixed = createMockTaskWithKeyword('DoInG');
        const taskUpper = createMockTaskWithKeyword('IN-PROGRESS');

        expect(getKeywordGroup(taskLower, defaultConfig)).toBe(1);
        expect(getKeywordGroup(taskMixed, defaultConfig)).toBe(1);
        expect(getKeywordGroup(taskUpper, defaultConfig)).toBe(1);
      });
    });

    describe('Group 2 - Inactive/Pending States', () => {
      it('returns group 2 for TODO keyword', () => {
        const task = createMockTaskWithKeyword('TODO');
        expect(getKeywordGroup(task, defaultConfig)).toBe(2);
      });

      it('returns group 2 for LATER keyword', () => {
        const task = createMockTaskWithKeyword('LATER');
        expect(getKeywordGroup(task, defaultConfig)).toBe(2);
      });

      it('handles case-insensitive matching for pending states', () => {
        const taskLower = createMockTaskWithKeyword('todo');
        const taskMixed = createMockTaskWithKeyword('LaTeR');

        expect(getKeywordGroup(taskLower, defaultConfig)).toBe(2);
        expect(getKeywordGroup(taskMixed, defaultConfig)).toBe(2);
      });
    });

    describe('Group 3 - Custom Keywords', () => {
      it('returns group 3 for custom keywords defined in config', () => {
        const config = createMockKeywordConfig(['REVIEW', 'BLOCKED']);
        const task = createMockTaskWithKeyword('REVIEW');
        expect(getKeywordGroup(task, config)).toBe(3);
      });

      it('returns group 3 for unknown keywords (default treatment)', () => {
        const task = createMockTaskWithKeyword('UNKNOWN_KEYWORD');
        expect(getKeywordGroup(task, defaultConfig)).toBe(3);
      });

      it('returns group 3 for tasks without keywords (empty state)', () => {
        const task = createMockTaskWithKeyword('');
        expect(getKeywordGroup(task, defaultConfig)).toBe(3);
      });

      it('handles case-insensitive matching for custom keywords', () => {
        const config = createMockKeywordConfig(['REVIEW']);
        const taskLower = createMockTaskWithKeyword('review');
        const taskMixed = createMockTaskWithKeyword('ReViEw');

        expect(getKeywordGroup(taskLower, config)).toBe(3);
        expect(getKeywordGroup(taskMixed, config)).toBe(3);
      });
    });

    describe('Group 4 - Waiting States', () => {
      it('returns group 4 for WAIT keyword', () => {
        const task = createMockTaskWithKeyword('WAIT');
        expect(getKeywordGroup(task, defaultConfig)).toBe(4);
      });

      it('returns group 4 for WAITING keyword', () => {
        const task = createMockTaskWithKeyword('WAITING');
        expect(getKeywordGroup(task, defaultConfig)).toBe(4);
      });

      it('handles case-insensitive matching for waiting states', () => {
        const taskLower = createMockTaskWithKeyword('wait');
        const taskMixed = createMockTaskWithKeyword('WaItInG');

        expect(getKeywordGroup(taskLower, defaultConfig)).toBe(4);
        expect(getKeywordGroup(taskMixed, defaultConfig)).toBe(4);
      });
    });

    describe('Group 5 - Completed States', () => {
      it('returns group 5 for DONE keyword', () => {
        const task = createMockTaskWithKeyword('DONE');
        expect(getKeywordGroup(task, defaultConfig)).toBe(5);
      });

      it('returns group 5 for CANCELED keyword', () => {
        const task = createMockTaskWithKeyword('CANCELED');
        expect(getKeywordGroup(task, defaultConfig)).toBe(5);
      });

      it('returns group 5 for CANCELLED keyword (alternative spelling)', () => {
        const task = createMockTaskWithKeyword('CANCELLED');
        expect(getKeywordGroup(task, defaultConfig)).toBe(5);
      });

      it('handles case-insensitive matching for completed states', () => {
        const taskLower = createMockTaskWithKeyword('done');
        const taskMixed = createMockTaskWithKeyword('CaNcElEd');

        expect(getKeywordGroup(taskLower, defaultConfig)).toBe(5);
        expect(getKeywordGroup(taskMixed, defaultConfig)).toBe(5);
      });

      it('completed tasks with active keywords still return group 5 (completed flag takes precedence)', () => {
        // A task with completed: true and NOW keyword should be group 5
        const task = createMockTaskWithKeyword('NOW', true);
        expect(getKeywordGroup(task, defaultConfig)).toBe(5);
      });

      it('completed tasks with any keyword return group 5', () => {
        const completedDoing = createMockTaskWithKeyword('DOING', true);
        const completedTodo = createMockTaskWithKeyword('TODO', true);
        const completedWait = createMockTaskWithKeyword('WAIT', true);

        expect(getKeywordGroup(completedDoing, defaultConfig)).toBe(5);
        expect(getKeywordGroup(completedTodo, defaultConfig)).toBe(5);
        expect(getKeywordGroup(completedWait, defaultConfig)).toBe(5);
      });
    });
  });

  describe('keywordSortComparator()', () => {
    let config: KeywordSortConfig;

    beforeEach(() => {
      config = createMockKeywordConfig(['REVIEW']);
    });

    describe('Group Priority Ordering', () => {
      it('sorts Group 1 (Active) before Group 2 (Inactive)', () => {
        const activeTask = createMockTaskWithKeyword('NOW');
        const inactiveTask = createMockTaskWithKeyword('TODO');

        const result = keywordSortComparator(activeTask, inactiveTask, config);
        expect(result).toBeLessThan(0);
      });

      it('sorts Group 2 (Inactive) before Group 3 (Custom)', () => {
        const inactiveTask = createMockTaskWithKeyword('TODO');
        const customTask = createMockTaskWithKeyword('REVIEW');

        const result = keywordSortComparator(inactiveTask, customTask, config);
        expect(result).toBeLessThan(0);
      });

      it('sorts Group 3 (Custom) before Group 4 (Waiting)', () => {
        const customTask = createMockTaskWithKeyword('REVIEW');
        const waitingTask = createMockTaskWithKeyword('WAIT');

        const result = keywordSortComparator(customTask, waitingTask, config);
        expect(result).toBeLessThan(0);
      });

      it('sorts Group 4 (Waiting) before Group 5 (Completed)', () => {
        const waitingTask = createMockTaskWithKeyword('WAIT');
        const completedTask = createMockTaskWithKeyword('DONE');

        const result = keywordSortComparator(
          waitingTask,
          completedTask,
          config,
        );
        expect(result).toBeLessThan(0);
      });

      it('sorts all groups in correct priority order (1 > 2 > 3 > 4 > 5)', () => {
        const group1 = createMockTaskWithKeyword('NOW');
        const group2 = createMockTaskWithKeyword('TODO');
        const group3 = createMockTaskWithKeyword('REVIEW');
        const group4 = createMockTaskWithKeyword('WAIT');
        const group5 = createMockTaskWithKeyword('DONE');

        const tasks = [group5, group3, group1, group4, group2];
        const sorted = tasks.sort((a, b) =>
          keywordSortComparator(a, b, config),
        );

        expect(sorted[0]).toBe(group1);
        expect(sorted[1]).toBe(group2);
        expect(sorted[2]).toBe(group3);
        expect(sorted[3]).toBe(group4);
        expect(sorted[4]).toBe(group5);
      });
    });

    describe('Stable Sort Within Same Group', () => {
      it('maintains stable sort for tasks in same group (falls back to path/line)', () => {
        const task1 = createMockTaskWithKeyword('TODO', false, {
          path: 'a.md',
          line: 1,
        });
        const task2 = createMockTaskWithKeyword('TODO', false, {
          path: 'a.md',
          line: 2,
        });
        const task3 = createMockTaskWithKeyword('TODO', false, {
          path: 'b.md',
          line: 1,
        });

        const tasks = [task3, task1, task2];
        const sorted = tasks.sort((a, b) =>
          keywordSortComparator(a, b, config),
        );

        // Should be sorted by path then line within same group
        expect(sorted[0]).toBe(task1); // a.md:1
        expect(sorted[1]).toBe(task2); // a.md:2
        expect(sorted[2]).toBe(task3); // b.md:1
      });

      it('sorts multiple active tasks by intra-group keyword order, then path/line', () => {
        const now1 = createMockTaskWithKeyword('NOW', false, {
          path: 'z.md',
          line: 1,
        });
        const now2 = createMockTaskWithKeyword('NOW', false, {
          path: 'a.md',
          line: 5,
        });
        const doing = createMockTaskWithKeyword('DOING', false, {
          path: 'a.md',
          line: 1,
        });

        const tasks = [now1, now2, doing];
        const sorted = tasks.sort((a, b) =>
          keywordSortComparator(a, b, config),
        );

        // NOW comes before DOING in intra-group order (NOW=0, DOING=1)
        // So NOW tasks should come first, sorted by path/line within same keyword
        expect(sorted[0]).toBe(now2); // a.md:5 - NOW (first keyword in order)
        expect(sorted[1]).toBe(now1); // z.md:1 - NOW (same keyword, sorted by path)
        expect(sorted[2]).toBe(doing); // a.md:1 - DOING (second keyword in order)
      });
    });

    describe('Intra-Group Keyword Ordering', () => {
      it('sorts NOW before DOING within Group 1 (Active)', () => {
        const doing = createMockTaskWithKeyword('DOING', false, {
          path: 'a.md',
          line: 1,
        });
        const now = createMockTaskWithKeyword('NOW', false, {
          path: 'a.md',
          line: 2,
        });

        const tasks = [doing, now];
        const sorted = tasks.sort((a, b) =>
          keywordSortComparator(a, b, config),
        );

        expect(sorted[0]).toBe(now); // NOW comes first
        expect(sorted[1]).toBe(doing); // DOING comes second
      });

      it('sorts DOING before IN-PROGRESS within Group 1 (Active)', () => {
        const inProgress = createMockTaskWithKeyword('IN-PROGRESS', false, {
          path: 'a.md',
          line: 1,
        });
        const doing = createMockTaskWithKeyword('DOING', false, {
          path: 'a.md',
          line: 2,
        });

        const tasks = [inProgress, doing];
        const sorted = tasks.sort((a, b) =>
          keywordSortComparator(a, b, config),
        );

        expect(sorted[0]).toBe(doing); // DOING comes second in order
        expect(sorted[1]).toBe(inProgress); // IN-PROGRESS comes third
      });

      it('sorts all active keywords in correct order: NOW > DOING > IN-PROGRESS', () => {
        const inProgress = createMockTaskWithKeyword('IN-PROGRESS', false, {
          path: 'a.md',
          line: 1,
        });
        const now = createMockTaskWithKeyword('NOW', false, {
          path: 'a.md',
          line: 2,
        });
        const doing = createMockTaskWithKeyword('DOING', false, {
          path: 'a.md',
          line: 3,
        });

        const tasks = [inProgress, now, doing];
        const sorted = tasks.sort((a, b) =>
          keywordSortComparator(a, b, config),
        );

        expect(sorted[0]).toBe(now); // NOW first
        expect(sorted[1]).toBe(doing); // DOING second
        expect(sorted[2]).toBe(inProgress); // IN-PROGRESS third
      });

      it('sorts TODO before LATER within Group 2 (Inactive)', () => {
        const later = createMockTaskWithKeyword('LATER', false, {
          path: 'a.md',
          line: 1,
        });
        const todo = createMockTaskWithKeyword('TODO', false, {
          path: 'a.md',
          line: 2,
        });

        const tasks = [later, todo];
        const sorted = tasks.sort((a, b) =>
          keywordSortComparator(a, b, config),
        );

        expect(sorted[0]).toBe(todo); // TODO comes first
        expect(sorted[1]).toBe(later); // LATER comes second
      });

      it('sorts WAIT before WAITING within Group 4 (Waiting)', () => {
        const waiting = createMockTaskWithKeyword('WAITING', false, {
          path: 'a.md',
          line: 1,
        });
        const wait = createMockTaskWithKeyword('WAIT', false, {
          path: 'a.md',
          line: 2,
        });

        const tasks = [waiting, wait];
        const sorted = tasks.sort((a, b) =>
          keywordSortComparator(a, b, config),
        );

        expect(sorted[0]).toBe(wait); // WAIT comes first
        expect(sorted[1]).toBe(waiting); // WAITING comes second
      });

      it('sorts DONE before CANCELED within Group 5 (Completed)', () => {
        const canceled = createMockTaskWithKeyword('CANCELED', false, {
          path: 'a.md',
          line: 1,
        });
        const done = createMockTaskWithKeyword('DONE', false, {
          path: 'a.md',
          line: 2,
        });

        const tasks = [canceled, done];
        const sorted = tasks.sort((a, b) =>
          keywordSortComparator(a, b, config),
        );

        expect(sorted[0]).toBe(done); // DONE comes first
        expect(sorted[1]).toBe(canceled); // CANCELED comes second
      });

      it('sorts CANCELED before CANCELLED within Group 5 (Completed)', () => {
        const cancelled = createMockTaskWithKeyword('CANCELLED', false, {
          path: 'a.md',
          line: 1,
        });
        const canceled = createMockTaskWithKeyword('CANCELED', false, {
          path: 'a.md',
          line: 2,
        });

        const tasks = [cancelled, canceled];
        const sorted = tasks.sort((a, b) =>
          keywordSortComparator(a, b, config),
        );

        expect(sorted[0]).toBe(canceled); // CANCELED comes second in order
        expect(sorted[1]).toBe(cancelled); // CANCELLED comes third
      });

      it('sorts custom keywords in settings array order', () => {
        const customConfig = createMockKeywordConfig([
          'REVIEW',
          'BLOCKED',
          'EPIC',
        ]);
        const epic = createMockTaskWithKeyword('EPIC', false, {
          path: 'a.md',
          line: 1,
        });
        const review = createMockTaskWithKeyword('REVIEW', false, {
          path: 'a.md',
          line: 2,
        });
        const blocked = createMockTaskWithKeyword('BLOCKED', false, {
          path: 'a.md',
          line: 3,
        });

        const tasks = [epic, review, blocked];
        const sorted = tasks.sort((a, b) =>
          keywordSortComparator(a, b, customConfig),
        );

        expect(sorted[0]).toBe(review); // REVIEW first (index 0 in custom keywords)
        expect(sorted[1]).toBe(blocked); // BLOCKED second (index 1)
        expect(sorted[2]).toBe(epic); // EPIC third (index 2)
      });

      it('falls back to path/line when keywords have same position in order', () => {
        // Two NOW tasks should be sorted by path/line
        const now1 = createMockTaskWithKeyword('NOW', false, {
          path: 'b.md',
          line: 1,
        });
        const now2 = createMockTaskWithKeyword('NOW', false, {
          path: 'a.md',
          line: 2,
        });
        const now3 = createMockTaskWithKeyword('NOW', false, {
          path: 'a.md',
          line: 1,
        });

        const tasks = [now1, now2, now3];
        const sorted = tasks.sort((a, b) =>
          keywordSortComparator(a, b, config),
        );

        expect(sorted[0]).toBe(now3); // a.md:1
        expect(sorted[1]).toBe(now2); // a.md:2
        expect(sorted[2]).toBe(now1); // b.md:1
      });
    });

    describe('Tasks Without Keywords', () => {
      it('works with tasks that have no keyword (empty state)', () => {
        const noKeyword = createMockTaskWithKeyword('');
        const todoTask = createMockTaskWithKeyword('TODO');

        // Empty state defaults to group 3, TODO is group 2
        const result = keywordSortComparator(todoTask, noKeyword, config);
        expect(result).toBeLessThan(0);
      });

      it('sorts unknown keywords as group 3', () => {
        const unknown1 = createMockTaskWithKeyword('UNKNOWN');
        const waitTask = createMockTaskWithKeyword('WAIT');

        // Unknown keywords should be group 3, WAIT is group 4
        // So unknown should come before wait
        const result = keywordSortComparator(unknown1, waitTask, config);
        expect(result).toBeLessThan(0);
      });
    });
  });

  describe('buildKeywordSortConfig()', () => {
    it('builds config from settings with custom keywords', () => {
      const customKeywords = ['REVIEW', 'BLOCKED', 'EPIC'];
      const config = buildKeywordSortConfig(customKeywords);

      expect(config.customKeywords).toEqual(['REVIEW', 'BLOCKED', 'EPIC']);
      expect(config.activeStates).toBeInstanceOf(Set);
      expect(config.activeStates.has('NOW')).toBe(true);
      expect(config.activeStates.has('DOING')).toBe(true);
      expect(config.activeStates.has('IN-PROGRESS')).toBe(true);
    });

    it('handles empty custom keywords list', () => {
      const config = buildKeywordSortConfig([]);

      expect(config.customKeywords).toEqual([]);
      expect(config.activeStates).toBeInstanceOf(Set);
      expect(config.pendingStates).toBeInstanceOf(Set);
    });

    it('handles missing settings gracefully (undefined)', () => {
      const config = buildKeywordSortConfig(undefined as unknown as string[]);

      expect(config.customKeywords).toEqual([]);
    });

    it('normalizes keywords to uppercase', () => {
      const customKeywords = ['review', 'Blocked', 'EPIC'];
      const config = buildKeywordSortConfig(customKeywords);

      expect(config.customKeywords).toEqual(['REVIEW', 'BLOCKED', 'EPIC']);
    });

    it('includes all default state sets', () => {
      const config = buildKeywordSortConfig([]);

      // Active states
      expect(config.activeStates.has('NOW')).toBe(true);
      expect(config.activeStates.has('DOING')).toBe(true);
      expect(config.activeStates.has('IN-PROGRESS')).toBe(true);

      // Pending states
      expect(config.pendingStates.has('TODO')).toBe(true);
      expect(config.pendingStates.has('LATER')).toBe(true);

      // Waiting states
      expect(config.waitingStates.has('WAIT')).toBe(true);
      expect(config.waitingStates.has('WAITING')).toBe(true);

      // Completed states
      expect(config.completedStates.has('DONE')).toBe(true);
      expect(config.completedStates.has('CANCELED')).toBe(true);
      expect(config.completedStates.has('CANCELLED')).toBe(true);
    });
  });

  describe('Two-Level Hierarchy Integration', () => {
    const now = new Date('2024-01-15T12:00:00Z');
    const pastDate = new Date('2024-01-10T12:00:00Z');
    const futureDate = new Date('2024-01-25T12:00:00Z');
    let config: KeywordSortConfig;

    beforeEach(() => {
      config = createMockKeywordConfig(['REVIEW']);
    });

    /**
     * Helper to create a complete task with all properties for integration tests
     */
    const createIntegrationTask = (
      keyword: string,
      options: {
        completed?: boolean;
        scheduledDate?: Date | null;
        path?: string;
        line?: number;
      } = {},
    ): Task => {
      return createBaseTask({
        state: keyword,
        completed: options.completed ?? false,
        scheduledDate: options.scheduledDate ?? null,
        text: `${keyword} task`,
        path: options.path ?? 'test.md',
        line: options.line ?? 1,
        ...options,
      });
    };

    describe('Keyword Sort Within Current Meta Group', () => {
      it('applies keyword sort within current meta group', () => {
        const nowTask = createIntegrationTask('NOW', {
          scheduledDate: pastDate,
        });
        const todoTask = createIntegrationTask('TODO', {
          scheduledDate: pastDate,
        });
        const waitTask = createIntegrationTask('WAIT', {
          scheduledDate: pastDate,
        });

        const blocks = sortTasksInBlocks(
          [waitTask, nowTask, todoTask],
          now,
          'showAll',
          'showAll',
          'sortByKeyword',
          config,
        );

        expect(blocks).toHaveLength(1);
        expect(blocks[0].type).toBe('main');

        // Should be sorted by keyword group: NOW (1) > TODO (2) > WAIT (4)
        const texts = blocks[0].tasks.map((t) => t.text);
        expect(texts).toEqual(['NOW task', 'TODO task', 'WAIT task']);
      });

      it('maintains keyword sort order with mixed dates in current group', () => {
        const nowTask = createIntegrationTask('NOW', {
          scheduledDate: pastDate,
          line: 2,
        });
        const todoTask = createIntegrationTask('TODO', {
          scheduledDate: pastDate,
          line: 1,
        });

        const blocks = sortTasksInBlocks(
          [todoTask, nowTask],
          now,
          'showAll',
          'showAll',
          'sortByKeyword',
          config,
        );

        // NOW (group 1) should come before TODO (group 2) regardless of line
        expect(blocks[0].tasks[0].state).toBe('NOW');
        expect(blocks[0].tasks[1].state).toBe('TODO');
      });
    });

    describe('Keyword Sort Within Future Meta Group', () => {
      it('applies keyword sort within future meta group', () => {
        const nowTask = createIntegrationTask('NOW', {
          scheduledDate: futureDate,
        });
        const todoTask = createIntegrationTask('TODO', {
          scheduledDate: futureDate,
        });
        const waitTask = createIntegrationTask('WAIT', {
          scheduledDate: futureDate,
        });

        const blocks = sortTasksInBlocks(
          [waitTask, nowTask, todoTask],
          now,
          'sortToEnd',
          'showAll',
          'sortByKeyword',
          config,
        );

        const futureBlock = blocks.find((b) => b.type === 'future');
        expect(futureBlock).toBeDefined();
        if (!futureBlock) throw new Error('Future block should exist');

        // Should be sorted by keyword group within future block
        const texts = futureBlock.tasks.map((t) => t.text);
        expect(texts).toEqual(['NOW task', 'TODO task', 'WAIT task']);
      });
    });

    describe('Keyword Sort Within Completed Meta Group', () => {
      it('applies keyword sort within completed meta group', () => {
        const doneTask1 = createIntegrationTask('DONE', {
          completed: true,
          line: 2,
        });
        const doneTask2 = createIntegrationTask('DONE', {
          completed: true,
          line: 1,
        });
        const canceledTask = createIntegrationTask('CANCELED', {
          completed: true,
        });

        const blocks = sortTasksInBlocks(
          [doneTask1, canceledTask, doneTask2],
          now,
          'showAll',
          'sortToEnd',
          'sortByKeyword',
          config,
        );

        const completedBlock = blocks.find((b) => b.type === 'completed');
        expect(completedBlock).toBeDefined();
        if (!completedBlock) throw new Error('Completed block should exist');

        // All completed tasks are group 5, should be sorted by path/line
        expect(completedBlock.tasks).toHaveLength(3);
      });
    });

    describe('Group 5 Tasks and Completed Block Interaction', () => {
      it('Group 5 tasks appear in current block when sort completed to end is disabled', () => {
        // A task with DONE keyword but completed: false (edge case)
        const doneKeywordTask = createIntegrationTask('DONE', {
          completed: false,
          scheduledDate: pastDate,
        });
        const nowTask = createIntegrationTask('NOW', {
          scheduledDate: pastDate,
        });

        const blocks = sortTasksInBlocks(
          [doneKeywordTask, nowTask],
          now,
          'showAll',
          'showAll', // NOT sortToEnd
          'sortByKeyword',
          config,
        );

        // Both should be in main block
        expect(blocks).toHaveLength(1);
        expect(blocks[0].type).toBe('main');
        expect(blocks[0].tasks).toHaveLength(2);

        // NOW (group 1) should come before DONE keyword (group 5)
        expect(blocks[0].tasks[0].state).toBe('NOW');
        expect(blocks[0].tasks[1].state).toBe('DONE');
      });

      it('Group 5 tasks only appear in completed block when sort completed to end is enabled', () => {
        const completedTask = createIntegrationTask('DONE', {
          completed: true,
          scheduledDate: pastDate,
        });
        const nowTask = createIntegrationTask('NOW', {
          scheduledDate: pastDate,
        });

        const blocks = sortTasksInBlocks(
          [completedTask, nowTask],
          now,
          'showAll',
          'sortToEnd', // Sort completed to end
          'sortByKeyword',
          config,
        );

        // Should have main and completed blocks
        expect(blocks).toHaveLength(2);
        expect(blocks[0].type).toBe('main');
        expect(blocks[1].type).toBe('completed');

        // NOW should be in main, DONE in completed
        expect(blocks[0].tasks).toHaveLength(1);
        expect(blocks[0].tasks[0].state).toBe('NOW');
        expect(blocks[1].tasks).toHaveLength(1);
        expect(blocks[1].tasks[0].state).toBe('DONE');
      });

      it('completed: true flag determines meta-group regardless of keyword', () => {
        // A completed task with NOW keyword should still go to completed block
        const completedNow = createIntegrationTask('NOW', {
          completed: true,
          scheduledDate: pastDate,
        });
        const activeNow = createIntegrationTask('NOW', {
          scheduledDate: pastDate,
        });

        const blocks = sortTasksInBlocks(
          [completedNow, activeNow],
          now,
          'showAll',
          'sortToEnd',
          'sortByKeyword',
          config,
        );

        expect(blocks[0].type).toBe('main');
        expect(blocks[0].tasks).toHaveLength(1);
        expect(blocks[0].tasks[0].completed).toBe(false);

        expect(blocks[1].type).toBe('completed');
        expect(blocks[1].tasks).toHaveLength(1);
        expect(blocks[1].tasks[0].completed).toBe(true);
      });
    });

    describe('Full Integration Scenarios', () => {
      it('correctly sorts a complex mix of tasks across all blocks', () => {
        const tasks = [
          // Current tasks with different keywords
          createIntegrationTask('WAIT', { scheduledDate: pastDate, line: 1 }),
          createIntegrationTask('NOW', { scheduledDate: pastDate, line: 2 }),
          createIntegrationTask('TODO', { scheduledDate: pastDate, line: 3 }),
          // Future tasks with different keywords
          createIntegrationTask('DOING', {
            scheduledDate: futureDate,
            line: 4,
          }),
          createIntegrationTask('LATER', {
            scheduledDate: futureDate,
            line: 5,
          }),
          // Completed tasks
          createIntegrationTask('DONE', { completed: true, line: 6 }),
          createIntegrationTask('CANCELED', { completed: true, line: 7 }),
        ];

        const blocks = sortTasksInBlocks(
          tasks,
          now,
          'sortToEnd',
          'sortToEnd',
          'sortByKeyword',
          config,
        );

        // Should have 3 blocks
        expect(blocks).toHaveLength(3);

        // Main block: NOW (1) > TODO (2) > WAIT (4)
        const mainBlock = blocks.find((b) => b.type === 'main');
        expect(mainBlock).toBeDefined();
        if (!mainBlock) throw new Error('Main block should exist');
        expect(mainBlock.tasks.map((t) => t.state)).toEqual([
          'NOW',
          'TODO',
          'WAIT',
        ]);

        // Future block: DOING (1) > LATER (2)
        const futureBlock = blocks.find((b) => b.type === 'future');
        expect(futureBlock).toBeDefined();
        if (!futureBlock) throw new Error('Future block should exist');
        expect(futureBlock.tasks.map((t) => t.state)).toEqual([
          'DOING',
          'LATER',
        ]);

        // Completed block: DONE, CANCELED (both group 5, sorted by line)
        const completedBlock = blocks.find((b) => b.type === 'completed');
        expect(completedBlock).toBeDefined();
        if (!completedBlock) throw new Error('Completed block should exist');
        expect(completedBlock.tasks.map((t) => t.state)).toEqual([
          'DONE',
          'CANCELED',
        ]);
      });

      it('handles custom keywords in keyword sort', () => {
        const configWithCustom = createMockKeywordConfig(['REVIEW', 'BLOCKED']);

        const tasks = [
          createIntegrationTask('TODO', { scheduledDate: pastDate, line: 1 }),
          createIntegrationTask('REVIEW', { scheduledDate: pastDate, line: 2 }),
          createIntegrationTask('BLOCKED', {
            scheduledDate: pastDate,
            line: 3,
          }),
          createIntegrationTask('NOW', { scheduledDate: pastDate, line: 4 }),
        ];

        const blocks = sortTasksInBlocks(
          tasks,
          now,
          'showAll',
          'showAll',
          'sortByKeyword',
          configWithCustom,
        );

        // Expected order: NOW (1) > TODO (2) > REVIEW (3) > BLOCKED (3)
        // Within group 3, custom keywords maintain their defined order
        expect(blocks[0].tasks.map((t) => t.state)).toEqual([
          'NOW',
          'TODO',
          'REVIEW',
          'BLOCKED',
        ]);
      });
    });
  });
});
