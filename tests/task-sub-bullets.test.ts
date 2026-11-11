import {
  classifyTaskMetadataLine,
  getSubtaskLinesFromLines,
  getTaskRemovalRange,
  taskHasCheckbox,
  readTaskBlockFromLines,
  modifyLinesForMigration,
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
    expect(getSubtaskLinesFromLines(lines, task)).toEqual(['- [ ] sub task']);
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
    expect(getSubtaskLinesFromLines(lines, task)).toEqual(['  - [ ] sub task']);
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
    const lines = ['TODO task', 'SCHEDULED: <2026-05-09 Sat>', 'NEXT_LINE'];
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

describe('task metadata block boundaries', () => {
  it('classifies every supported metadata line', () => {
    expect(classifyTaskMetadataLine('SCHEDULED: <2026-05-09 Sat>', '')).toBe(
      'scheduled',
    );
    expect(classifyTaskMetadataLine('DEADLINE: <2026-05-10 Sun>', '')).toBe(
      'deadline',
    );
    expect(classifyTaskMetadataLine('CLOSED: [2026-05-09 Sat]', '')).toBe(
      'closed',
    );
    expect(
      classifyTaskMetadataLine('STARTED: <2026-05-09 Sat 10:00>', ''),
    ).toBe('started');
    expect(classifyTaskMetadataLine('DESCRIPTION: some text', '')).toBe(
      'description',
    );
    expect(classifyTaskMetadataLine('just prose', '')).toBeNull();
  });

  it('honours indent and quote context like the parser', () => {
    expect(classifyTaskMetadataLine('  STARTED: <2026-05-09 Sat>', '')).toBe(
      'started',
    );
    expect(
      classifyTaskMetadataLine('STARTED: <2026-05-09 Sat>', '  '),
    ).toBeNull();
    expect(classifyTaskMetadataLine('> CLOSED: [2026-05-09 Sat]', '  ')).toBe(
      'closed',
    );
  });

  it('keeps every metadata type in a copied block, in order', () => {
    const lines = [
      'TODO task',
      'STARTED: <2026-05-01 Fri 09:00>',
      'SCHEDULED: <2026-05-09 Sat>',
      'CLOSED: [2026-05-09 Sat]',
      'DEADLINE: <2026-05-10 Sun>',
      'DESCRIPTION: keep this',
      '- [ ] child task',
      'NEXT',
    ];
    const task = createTask({ line: 0 });
    expect(readTaskBlockFromLines(lines, task)).toEqual([
      'TODO task',
      'STARTED: <2026-05-01 Fri 09:00>',
      'SCHEDULED: <2026-05-09 Sat>',
      'CLOSED: [2026-05-09 Sat]',
      'DEADLINE: <2026-05-10 Sun>',
      'DESCRIPTION: keep this',
      '- [ ] child task',
    ]);
    expect(getTaskRemovalRange(lines, task)).toEqual({ start: 0, end: 6 });
  });

  it('preserves indented metadata under a bullet task', () => {
    const lines = [
      '- TODO task',
      '  STARTED: <2026-05-01 Fri 09:00>',
      '  DESCRIPTION: detail',
      '  SCHEDULED: <2026-05-09 Sat>',
      '  - [ ] child task',
      'NEXT',
    ];
    const task = createTask({
      rawText: '- TODO task',
      listMarker: '- ',
      line: 0,
    });
    expect(readTaskBlockFromLines(lines, task)).toEqual([
      '- TODO task',
      '  STARTED: <2026-05-01 Fri 09:00>',
      '  DESCRIPTION: detail',
      '  SCHEDULED: <2026-05-09 Sat>',
      '  - [ ] child task',
    ]);
  });

  it('stops at a sibling task, prose or blank line', () => {
    const task = createTask({ line: 0 });
    expect(
      readTaskBlockFromLines(
        ['TODO a', 'STARTED: <2026-05-01 Fri 09:00>', 'TODO b'],
        task,
      ),
    ).toEqual(['TODO a', 'STARTED: <2026-05-01 Fri 09:00>']);
    expect(
      readTaskBlockFromLines(
        ['TODO a', 'DESCRIPTION: d', 'Unrelated prose'],
        task,
      ),
    ).toEqual(['TODO a', 'DESCRIPTION: d']);
    expect(
      readTaskBlockFromLines(['TODO a', 'CLOSED: [2026-05-09 Sat]', ''], task),
    ).toEqual(['TODO a', 'CLOSED: [2026-05-09 Sat]']);
  });

  it('keeps quoted metadata with the task', () => {
    const lines = [
      '> TODO quoted',
      '> SCHEDULED: <2026-05-09 Sat>',
      '> STARTED: <2026-05-09 Sat 09:00>',
      'NEXT',
    ];
    const task = createTask({ rawText: '> TODO quoted', line: 0 });
    expect(readTaskBlockFromLines(lines, task)).toEqual([
      '> TODO quoted',
      '> SCHEDULED: <2026-05-09 Sat>',
      '> STARTED: <2026-05-09 Sat 09:00>',
    ]);
  });

  it('migration removes only SCHEDULED/DEADLINE and keeps other metadata', () => {
    const lines = [
      'TODO task',
      'STARTED: <2026-05-01 Fri 09:00>',
      'SCHEDULED: <2026-05-09 Sat>',
      'DESCRIPTION: keep this',
      'DEADLINE: <2026-05-10 Sun>',
      'CLOSED: [2026-05-09 Sat]',
      'NEXT',
    ];

    expect(modifyLinesForMigration(lines, 0, 'TODO', 'MIGRATED')).toEqual([
      'MIGRATED task',
      'STARTED: <2026-05-01 Fri 09:00>',
      'DESCRIPTION: keep this',
      'CLOSED: [2026-05-09 Sat]',
      'NEXT',
    ]);
  });

  it('migration keeps an empty DESCRIPTION line and sibling lines', () => {
    const lines = [
      'TODO task',
      'DESCRIPTION:',
      'SCHEDULED: <2026-05-09 Sat>',
      'TODO sibling',
    ];
    expect(modifyLinesForMigration(lines, 0, 'TODO', '')).toEqual([
      'task',
      'DESCRIPTION:',
      'TODO sibling',
    ]);
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
