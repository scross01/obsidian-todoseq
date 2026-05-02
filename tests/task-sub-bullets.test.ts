import {
  getSubtaskLinesFromLines,
  getTaskRemovalRange,
  taskHasCheckbox,
  readTaskBlockFromLines,
} from '../src/utils/task-sub-bullets';
import { Task } from '../src/types/task';

function createTask(overrides: Partial<Task> = {}): Task {
  return {
    path: '/test/path.md',
    line: 0,
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

describe('taskHasCheckbox', () => {
  it('returns true for checkbox task', () => {
    const task = createTask({ rawText: '- [ ] TODO task' });
    expect(taskHasCheckbox(task)).toBe(true);
  });

  it('returns true for checked checkbox task', () => {
    const task = createTask({ rawText: '- [x] DONE task' });
    expect(taskHasCheckbox(task)).toBe(true);
  });

  it('returns false for bullet task without checkbox', () => {
    const task = createTask({ rawText: '- TODO task' });
    expect(taskHasCheckbox(task)).toBe(false);
  });

  it('returns false for plain task', () => {
    const task = createTask({ rawText: 'TODO task' });
    expect(taskHasCheckbox(task)).toBe(false);
  });
});

describe('getSubtaskLinesFromLines', () => {
  it('returns empty array when no subtasks', () => {
    const lines = ['TODO task', 'NEXT_LINE'];
    const task = createTask({ line: 0 });
    expect(getSubtaskLinesFromLines(lines, task)).toEqual([]);
  });

  it('extracts subtask lines after date lines', () => {
    const lines = [
      'TODO task',
      'SCHEDULED: <2026-05-09 Sat>',
      '- [ ] sub task',
      '- sub bullet',
    ];
    const task = createTask({ line: 0 });
    expect(getSubtaskLinesFromLines(lines, task)).toEqual([
      '- [ ] sub task',
      '- sub bullet',
    ]);
  });

  it('extracts indented subtask lines for bullet task', () => {
    const lines = [
      '- TODO task 2',
      '  SCHEDULED: <2026-05-09 Sat>',
      '  - [ ] sub task',
      '  - sub bullet',
    ];
    const task = createTask({
      rawText: '- TODO task 2',
      listMarker: '- ',
      line: 0,
    });
    expect(getSubtaskLinesFromLines(lines, task)).toEqual([
      '  - [ ] sub task',
      '  - sub bullet',
    ]);
  });

  it('extracts indented subtask lines for checkbox task', () => {
    const lines = [
      '- [ ] TODO task 3',
      '  SCHEDULED: <2026-05-02 Sat>',
      '  - [ ] sub task',
      '  - sub bullet',
    ];
    const task = createTask({
      rawText: '- [ ] TODO task 3',
      listMarker: '- ',
      line: 0,
    });
    expect(getSubtaskLinesFromLines(lines, task)).toEqual([
      '  - [ ] sub task',
      '  - sub bullet',
    ]);
  });

  it('stops at empty line', () => {
    const lines = [
      'TODO task',
      'SCHEDULED: <2026-05-09 Sat>',
      '- [ ] sub task',
      '',
      '- sub bullet',
    ];
    const task = createTask({ line: 0 });
    expect(getSubtaskLinesFromLines(lines, task)).toEqual([
      '- [ ] sub task',
    ]);
  });

  it('stops at non-indented line for bullet task', () => {
    const lines = [
      '- TODO task',
      '  SCHEDULED: <2026-05-09 Sat>',
      '  - [ ] sub task',
      'NEXT task',
    ];
    const task = createTask({
      rawText: '- TODO task',
      listMarker: '- ',
      line: 0,
    });
    expect(getSubtaskLinesFromLines(lines, task)).toEqual([
      '  - [ ] sub task',
    ]);
  });

  it('handles deeply indented parent task', () => {
    const lines = [
      '    TODO task',
      '    SCHEDULED: <2026-05-09 Sat>',
      '      - [ ] sub task',
      '      - sub bullet',
      'NEXT',
    ];
    const task = createTask({
      rawText: '    TODO task',
      indent: '    ',
      line: 0,
    });
    expect(getSubtaskLinesFromLines(lines, task)).toEqual([
      '  - [ ] sub task',
      '  - sub bullet',
    ]);
  });
});

describe('getTaskRemovalRange', () => {
  it('returns single line range for task with no dates or subtasks', () => {
    const lines = ['TODO task', 'NEXT_LINE'];
    const task = createTask({ line: 0 });
    expect(getTaskRemovalRange(lines, task)).toEqual({ start: 0, end: 0 });
  });

  it('includes date lines but no subtasks when no subtasks present', () => {
    const lines = [
      'TODO task',
      'SCHEDULED: <2026-05-09 Sat>',
      'NEXT_LINE',
    ];
    const task = createTask({ line: 0 });
    expect(getTaskRemovalRange(lines, task)).toEqual({ start: 0, end: 1 });
  });

  it('includes date lines and subtask lines', () => {
    const lines = [
      'TODO task',
      'SCHEDULED: <2026-05-09 Sat>',
      '- [ ] sub task',
      '- sub bullet',
      'NEXT_LINE',
    ];
    const task = createTask({ line: 0 });
    expect(getTaskRemovalRange(lines, task)).toEqual({ start: 0, end: 3 });
  });

  it('includes indented date and subtask lines for bullet task', () => {
    const lines = [
      '- TODO task',
      '  SCHEDULED: <2026-05-09 Sat>',
      '  - [ ] sub task',
      '  - sub bullet',
      'NEXT_LINE',
    ];
    const task = createTask({
      rawText: '- TODO task',
      listMarker: '- ',
      line: 0,
    });
    expect(getTaskRemovalRange(lines, task)).toEqual({ start: 0, end: 3 });
  });

  it('includes indented date and subtask lines for checkbox task', () => {
    const lines = [
      '- [ ] TODO task',
      '  SCHEDULED: <2026-05-09 Sat>',
      '  - [ ] sub task',
      '  - sub bullet',
      'NEXT_LINE',
    ];
    const task = createTask({
      rawText: '- [ ] TODO task',
      listMarker: '- ',
      line: 0,
    });
    expect(getTaskRemovalRange(lines, task)).toEqual({ start: 0, end: 3 });
  });

  it('handles task with both SCHEDULED and DEADLINE plus subtasks', () => {
    const lines = [
      'TODO task',
      'SCHEDULED: <2026-05-09 Sat>',
      'DEADLINE: <2026-05-10 Sun>',
      '- [ ] sub task',
      '- sub bullet',
      'NEXT_LINE',
    ];
    const task = createTask({ line: 0 });
    expect(getTaskRemovalRange(lines, task)).toEqual({ start: 0, end: 4 });
  });
});

describe('readTaskBlockFromLines', () => {
  it('reads plain task with no dates or subtasks', () => {
    const lines = ['TODO task', 'NEXT_LINE'];
    const task = createTask({ rawText: 'TODO task', line: 0 });
    expect(readTaskBlockFromLines(lines, task)).toEqual(['TODO task']);
  });

  it('reads plain task with scheduled date and sub-bullets', () => {
    const lines = [
      'TODO task 1',
      'SCHEDULED: <2026-05-09 Sat>',
      '- [ ] sub task',
      '- sub bullet',
    ];
    const task = createTask({ rawText: 'TODO task 1', line: 0 });
    expect(readTaskBlockFromLines(lines, task)).toEqual([
      'TODO task 1',
      'SCHEDULED: <2026-05-09 Sat>',
      '- [ ] sub task',
      '- sub bullet',
    ]);
  });

  it('preserves date indent for bullet task', () => {
    const lines = [
      '- TODO task 2',
      '  SCHEDULED: <2026-05-09 Sat>',
      '  - [ ] sub task',
      '  - sub bullet',
    ];
    const task = createTask({
      rawText: '- TODO task 2',
      listMarker: '- ',
      line: 0,
    });
    expect(readTaskBlockFromLines(lines, task)).toEqual([
      '- TODO task 2',
      '  SCHEDULED: <2026-05-09 Sat>',
      '  - [ ] sub task',
      '  - sub bullet',
    ]);
  });

  it('preserves date indent for checkbox task', () => {
    const lines = [
      '- [ ] TODO task 3',
      '  SCHEDULED: <2026-05-02>',
      '  - [ ] sub task',
      '  - sub bullet',
    ];
    const task = createTask({
      rawText: '- [ ] TODO task 3',
      listMarker: '- ',
      line: 0,
    });
    expect(readTaskBlockFromLines(lines, task)).toEqual([
      '- [ ] TODO task 3',
      '  SCHEDULED: <2026-05-02>',
      '  - [ ] sub task',
      '  - sub bullet',
    ]);
  });

  it('strips parent indent from deeply indented task', () => {
    const lines = [
      '    - TODO task',
      '      SCHEDULED: <2026-05-09 Sat>',
      '      - [ ] sub task',
      'NEXT',
    ];
    const task = createTask({
      rawText: '    - TODO task',
      indent: '    ',
      listMarker: '- ',
      line: 0,
    });
    expect(readTaskBlockFromLines(lines, task)).toEqual([
      '- TODO task',
      '  SCHEDULED: <2026-05-09 Sat>',
      '  - [ ] sub task',
    ]);
  });

  it('reads task with both SCHEDULED and DEADLINE', () => {
    const lines = [
      '- TODO task',
      '  SCHEDULED: <2026-05-09 Sat>',
      '  DEADLINE: <2026-05-10 Sun>',
      '  - [ ] sub task',
      'NEXT',
    ];
    const task = createTask({
      rawText: '- TODO task',
      listMarker: '- ',
      line: 0,
    });
    expect(readTaskBlockFromLines(lines, task)).toEqual([
      '- TODO task',
      '  SCHEDULED: <2026-05-09 Sat>',
      '  DEADLINE: <2026-05-10 Sun>',
      '  - [ ] sub task',
    ]);
  });
});
