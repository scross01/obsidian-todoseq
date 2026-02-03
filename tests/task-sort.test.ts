import {
  CompletedTaskSetting,
  FutureTaskSetting,
  sortTasksInBlocks,
  sortTasksWithThreeBlockSystem,
  taskComparator,
} from '../src/utils/task-sort';
import { Task } from '../src/types/task';

describe('Task Sorting System', () => {
  const now = new Date('2024-01-15T12:00:00Z');
  const pastDate = new Date('2024-01-10T12:00:00Z');
  const todayDate = new Date('2024-01-15T08:00:00Z');
  const tomorrowDate = new Date('2024-01-16T12:00:00Z');
  const upcomingDate = new Date('2024-01-18T12:00:00Z'); // 3 days from now
  const sevenDaysDate = new Date('2024-01-22T12:00:00Z'); // 7 days from now
  const futureDate = new Date('2024-01-25T12:00:00Z'); // 10 days from now

  const createTask = (overrides: Partial<Task> = {}): Task => ({
    path: 'test.md',
    line: 1,
    rawText: 'TODO Test task',
    indent: '',
    listMarker: '- ',
    text: 'Test task',
    state: 'TODO',
    completed: false,
    priority: null,
    scheduledDate: null,
    deadlineDate: null,
    tail: '',
    urgency: null,
    isDailyNote: false,
    dailyNoteDate: null,
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
