import { formatTaskLines } from '../src/utils/task-format';
import { Task, DateRepeatInfo } from '../src/types/task';

function createTask(overrides: Partial<Task> = {}): Task {
  return {
    path: '/test/path.md',
    line: 1,
    rawText: 'TODO test task',
    indent: '',
    listMarker: '',
    text: 'test task',
    state: 'TODO',
    completed: false,
    priority: null,
    scheduledDate: null,
    scheduledDateRepeat: null,
    deadlineDate: null,
    deadlineDateRepeat: null,
    closedDate: null,
    subtaskCount: 0,
    subtaskCompletedCount: 0,
    isDailyNote: false,
    dailyNoteDate: null,
    tags: [],
    ...overrides,
  };
}

describe('formatTaskLines', () => {
  test('should format task with only state (no list marker)', () => {
    const task = createTask({ state: 'TODO', text: 'test task' });
    const lines = formatTaskLines(task);
    expect(lines).toEqual(['TODO test task']);
  });

  test('should format task with list marker', () => {
    const task = createTask({
      rawText: '- TODO test task',
      listMarker: '- ',
      state: 'TODO',
      text: 'test task',
    });
    const lines = formatTaskLines(task);
    expect(lines).toEqual(['- TODO test task']);
  });

  test('should format task with checkbox', () => {
    const task = createTask({
      rawText: '- [ ] TODO test task',
      listMarker: '- ',
      state: 'TODO',
      text: 'test task',
    });
    const lines = formatTaskLines(task);
    expect(lines).toEqual(['- [ ] TODO test task']);
  });

  test('should format task with checked checkbox', () => {
    const task = createTask({
      rawText: '- [x] DONE test task',
      listMarker: '- ',
      state: 'DONE',
      text: 'test task',
      completed: true,
    });
    const lines = formatTaskLines(task);
    expect(lines).toEqual(['- [x] DONE test task']);
  });

  test('should format task with high priority and list marker', () => {
    const task = createTask({
      rawText: '- TODO [#A] test task',
      listMarker: '- ',
      state: 'TODO',
      text: 'test task',
      priority: 'high',
    });
    const lines = formatTaskLines(task);
    expect(lines).toEqual(['- TODO [#A] test task']);
  });

  test('should format task with priority and checkbox', () => {
    const task = createTask({
      rawText: '- [ ] TODO [#A] test task',
      listMarker: '- ',
      state: 'TODO',
      text: 'test task',
      priority: 'high',
    });
    const lines = formatTaskLines(task);
    expect(lines).toEqual(['- [ ] TODO [#A] test task']);
  });

  test('should format task with med priority', () => {
    const task = createTask({
      state: 'TODO',
      text: 'test task',
      priority: 'med',
    });
    const lines = formatTaskLines(task);
    expect(lines).toEqual(['TODO [#B] test task']);
  });

  test('should format task with low priority', () => {
    const task = createTask({
      state: 'TODO',
      text: 'test task',
      priority: 'low',
    });
    const lines = formatTaskLines(task);
    expect(lines).toEqual(['TODO [#C] test task']);
  });

  test('should format task with scheduled date', () => {
    const scheduledDate = new Date(2025, 2, 15, 0, 0, 0);
    const task = createTask({
      state: 'TODO',
      text: 'test task',
      scheduledDate,
    });
    const lines = formatTaskLines(task);
    expect(lines).toEqual(['TODO test task', 'SCHEDULED: <2025-03-15 Sat>']);
  });

  test('should format task with deadline date', () => {
    const deadlineDate = new Date(2025, 3, 20, 0, 0, 0);
    const task = createTask({
      state: 'TODO',
      text: 'test task',
      deadlineDate,
    });
    const lines = formatTaskLines(task);
    expect(lines).toEqual(['TODO test task', 'DEADLINE: <2025-04-20 Sun>']);
  });

  test('should format task with both scheduled and deadline dates', () => {
    const scheduledDate = new Date(2025, 2, 15, 0, 0, 0);
    const deadlineDate = new Date(2025, 3, 20, 0, 0, 0);
    const task = createTask({
      state: 'TODO',
      text: 'test task',
      scheduledDate,
      deadlineDate,
    });
    const lines = formatTaskLines(task);
    expect(lines).toEqual([
      'TODO test task',
      'SCHEDULED: <2025-03-15 Sat>',
      'DEADLINE: <2025-04-20 Sun>',
    ]);
  });

  test('should format task with scheduled date and repeat', () => {
    const scheduledDate = new Date(2025, 2, 15, 0, 0, 0);
    const repeat: DateRepeatInfo = {
      type: '.+',
      unit: 'd',
      value: 1,
      raw: '.+1d',
    };
    const task = createTask({
      state: 'TODO',
      text: 'test task',
      scheduledDate,
      scheduledDateRepeat: repeat,
    });
    const lines = formatTaskLines(task);
    expect(lines).toEqual([
      'TODO test task',
      'SCHEDULED: <2025-03-15 Sat .+1d>',
    ]);
  });

  test('should format task with deadline date and repeat', () => {
    const deadlineDate = new Date(2025, 3, 20, 0, 0, 0);
    const repeat: DateRepeatInfo = {
      type: '++',
      unit: 'w',
      value: 2,
      raw: '++2w',
    };
    const task = createTask({
      state: 'TODO',
      text: 'test task',
      deadlineDate,
      deadlineDateRepeat: repeat,
    });
    const lines = formatTaskLines(task);
    expect(lines).toEqual([
      'TODO test task',
      'DEADLINE: <2025-04-20 Sun ++2w>',
    ]);
  });

  test('should format completed task', () => {
    const task = createTask({
      state: 'DONE',
      text: 'completed task',
      completed: true,
    });
    const lines = formatTaskLines(task);
    expect(lines).toEqual(['DONE completed task']);
  });

  test('should preserve asterisk list marker', () => {
    const task = createTask({
      rawText: '* TODO test task',
      listMarker: '* ',
      state: 'TODO',
      text: 'test task',
    });
    const lines = formatTaskLines(task);
    expect(lines).toEqual(['* TODO test task']);
  });

  test('should preserve plus list marker', () => {
    const task = createTask({
      rawText: '+ TODO test task',
      listMarker: '+ ',
      state: 'TODO',
      text: 'test task',
    });
    const lines = formatTaskLines(task);
    expect(lines).toEqual(['+ TODO test task']);
  });

  test('should preserve checkbox with asterisk marker', () => {
    const task = createTask({
      rawText: '* [ ] TODO test task',
      listMarker: '* ',
      state: 'TODO',
      text: 'test task',
    });
    const lines = formatTaskLines(task);
    expect(lines).toEqual(['* [ ] TODO test task']);
  });

  test('should format bullet task with scheduled date', () => {
    const scheduledDate = new Date(2026, 4, 9, 0, 0, 0);
    const task = createTask({
      rawText: '- TODO task 1',
      listMarker: '- ',
      state: 'TODO',
      text: 'task 1',
      scheduledDate,
    });
    const lines = formatTaskLines(task);
    expect(lines).toEqual([
      '- TODO task 1',
      'SCHEDULED: <2026-05-09 Sat>',
    ]);
  });

  test('should format checkbox task with scheduled date', () => {
    const scheduledDate = new Date(2026, 4, 2, 0, 0, 0);
    const task = createTask({
      rawText: '- [ ] TODO task 3',
      listMarker: '- ',
      state: 'TODO',
      text: 'task 3',
      scheduledDate,
    });
    const lines = formatTaskLines(task);
    expect(lines).toEqual([
      '- [ ] TODO task 3',
      'SCHEDULED: <2026-05-02 Sat>',
    ]);
  });
});
