/**
 * @jest-environment jsdom
 */

/**
 * CLOSED/STARTED transition matrix through the full coordinator stack,
 * with STARTED configured as an ACTIVE keyword (the documented keyword-
 * groups example) — the configuration that exposed the date-line scan
 * collision behind real-world reports:
 *   1. un-completing a task kept its CLOSED line (expected: removed)
 *   2. re-completing added a SECOND CLOSED line (expected: replace/add one)
 *   3. recurrence rollovers STACKED SCHEDULED lines (expected: one, updated)
 *
 * Deliberate invariants pinned here (39a829d): trackClosedDate gates
 * INSERTION only — un-completing always removes CLOSED. trackStartedDate
 * gates STARTED insertion/reset only; manual transitions never remove it.
 */

import { TaskUpdateCoordinator } from '../src/services/task-update-coordinator';
import { TaskStateManager } from '../src/services/task-state-manager';
import { TaskWriter } from '../src/services/task-writer';
import { Task } from '../src/types/task';
import {
  createBaseTask,
  createTestKeywordManager,
  createBaseSettings,
} from './helpers/test-helper';
import { TFile } from 'obsidian';

(window as unknown as { activeDocument: Document }).activeDocument = document;

const now = new Date(2026, 9, 16, 12, 0, 0); // Fri Oct 16 2026 12:00 local

function makeHarness(settingsOverrides: Record<string, unknown> = {}) {
  const settings = createBaseSettings({
    trackStartedDate: true,
    startedDateMode: 'last',
    trackClosedDate: true,
    // The documented keyword-groups example — a STARTED *date* line must
    // never be treated as a task boundary by the date-line scanner.
    additionalActiveKeywords: ['STARTED'],
    ...settingsOverrides,
  });

  let lines = ['TODO test me'];

  const mockTFile = new TFile();
  mockTFile.path = 'test.md';
  mockTFile.name = 'test.md';

  const mockParser = {
    getDateLineType: jest.fn(
      (
        line: string,
      ): 'scheduled' | 'deadline' | 'closed' | 'started' | null => {
        if (line.includes('SCHEDULED:')) return 'scheduled';
        if (line.includes('DEADLINE:')) return 'deadline';
        if (line.includes('STARTED:')) return 'started';
        if (line.includes('CLOSED:')) return 'closed';
        return null;
      },
    ),
  };

  const mockApp = {
    vault: {
      getAbstractFileByPath: jest.fn().mockReturnValue(mockTFile),
      process: jest.fn((_file: unknown, callback: (data: string) => string) => {
        const result = callback(lines.join('\n'));
        lines = result.split('\n');
        return Promise.resolve(result);
      }),
      read: jest.fn(async () => lines.join('\n')),
    },
    plugins: {
      getPlugin: jest.fn().mockReturnValue({
        vaultScanner: { getParser: () => mockParser },
      }),
    },
    // No active view → vault-process path for every write.
    workspace: {
      getActiveViewOfType: jest.fn().mockReturnValue(null),
      getLeavesOfType: jest.fn().mockReturnValue([]),
    },
  };

  const keywordManager = createTestKeywordManager(settings);
  const taskStateManager = new TaskStateManager(keywordManager);

  const mockPlugin = {
    app: mockApp,
    settings,
    isUserInitiatedUpdate: false,
    taskEditor: null as unknown as TaskWriter,
    taskStateManager,
    embeddedTaskListProcessor: { refreshAllEmbeddedTaskLists: jest.fn() },
    refreshVisibleEditorDecorations: jest.fn(),
    vaultScanner: {
      processIncrementalChange: jest.fn(),
      addSkipIncrementalChange: jest.fn(),
    },
  };

  const taskWriter = new TaskWriter(mockPlugin as never, keywordManager);
  mockPlugin.taskEditor = taskWriter;

  const coordinator = new TaskUpdateCoordinator(
    mockPlugin as never,
    taskStateManager,
    keywordManager,
  );

  const makeTask = (overrides: Partial<Task> = {}): Task =>
    createBaseTask({
      path: 'test.md',
      line: 0,
      rawText: 'TODO test me',
      text: 'test me',
      state: 'TODO',
      completed: false,
      ...overrides,
    });

  const storedTask = () =>
    taskStateManager.findTaskByPathAndLine('test.md', 0) as Task;
  const countLines = (prefix: string) =>
    lines.filter((l) => l.trim().startsWith(prefix)).length;

  return {
    settings,
    keywordManager,
    taskStateManager,
    taskWriter,
    coordinator,
    makeTask,
    storedTask,
    countLines,
    getLines: () => lines,
    setLines: (next: string[]) => {
      lines = next;
    },
  };
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(now);
});

afterEach(() => {
  jest.useRealTimers();
});

describe('un-completion and re-completion (plain task, STARTED present)', () => {
  const completedContent = [
    'DOING test me',
    'STARTED: [2026-10-14 Wed 09:00]',
    'CLOSED: [2026-10-14 Wed 10:00]',
    'SCHEDULED: <2026-10-14 Wed>',
  ];
  const completedTask = {
    rawText: 'DOING test me',
    state: 'DONE',
    completed: true,
    startedDate: new Date(2026, 9, 14, 9, 0, 0),
    closedDate: new Date(2026, 9, 14, 10, 0, 0),
    scheduledDate: new Date(2026, 9, 14),
  };

  it('CLOSED tracking on: uncheck removes CLOSED and keeps STARTED; recheck adds exactly one fresh CLOSED', async () => {
    const h = makeHarness();
    h.setLines([...completedContent]);
    h.taskStateManager.addTask(h.makeTask(completedTask));

    await h.coordinator.updateTaskState(h.storedTask(), 'TODO');

    expect(h.countLines('CLOSED:')).toBe(0);
    expect(h.countLines('STARTED:')).toBe(1);
    expect(h.storedTask().closedDate).toBeNull();
    expect(h.storedTask().startedDate).toEqual(new Date(2026, 9, 14, 9, 0, 0));

    await h.coordinator.updateTaskState(h.storedTask(), 'DONE');

    expect(h.countLines('CLOSED:')).toBe(1);
    expect(h.getLines()).toContain('CLOSED: [2026-10-16 Fri 12:00]');
    expect(h.countLines('STARTED:')).toBe(1);
    expect(h.storedTask().closedDate).toEqual(now);
  });

  it('CLOSED tracking off: uncheck still removes CLOSED (39a829d — removal is never gated); recheck adds none', async () => {
    const h = makeHarness({ trackClosedDate: false });
    h.setLines([...completedContent]);
    h.taskStateManager.addTask(h.makeTask(completedTask));

    await h.coordinator.updateTaskState(h.storedTask(), 'TODO');
    expect(h.countLines('CLOSED:')).toBe(0);
    expect(h.countLines('STARTED:')).toBe(1);

    await h.coordinator.updateTaskState(h.storedTask(), 'DONE');
    expect(h.countLines('CLOSED:')).toBe(0);
    expect(h.storedTask().closedDate ?? null).toBeNull();
  });

  it('STARTED tracking off: completion cycle manages CLOSED only, no STARTED lines ever', async () => {
    const h = makeHarness({ trackStartedDate: false });
    h.setLines(['DOING test me', 'CLOSED: [2026-10-14 Wed 10:00]']);
    h.taskStateManager.addTask(
      h.makeTask({
        rawText: 'DOING test me',
        state: 'DONE',
        completed: true,
        closedDate: new Date(2026, 9, 14, 10, 0, 0),
        startedDate: null,
        scheduledDate: null,
      }),
    );

    await h.coordinator.updateTaskState(h.storedTask(), 'TODO');
    expect(h.countLines('CLOSED:')).toBe(0);
    expect(h.countLines('STARTED:')).toBe(0);

    await h.coordinator.updateTaskState(h.storedTask(), 'DONE');
    expect(h.countLines('CLOSED:')).toBe(1);
    expect(h.countLines('STARTED:')).toBe(0);
  });

  it('task with no dates at all: uncheck/recheck still swap CLOSED correctly with STARTED present', async () => {
    const h = makeHarness();
    h.setLines([
      'DOING test me',
      'STARTED: [2026-10-14 Wed 09:00]',
      'CLOSED: [2026-10-14 Wed 10:00]',
    ]);
    h.taskStateManager.addTask(
      h.makeTask({
        rawText: 'DOING test me',
        state: 'DONE',
        completed: true,
        startedDate: new Date(2026, 9, 14, 9, 0, 0),
        closedDate: new Date(2026, 9, 14, 10, 0, 0),
        scheduledDate: null,
      }),
    );

    await h.coordinator.updateTaskState(h.storedTask(), 'TODO');
    expect(h.countLines('CLOSED:')).toBe(0);
    expect(h.countLines('STARTED:')).toBe(1);

    await h.coordinator.updateTaskState(h.storedTask(), 'DONE');
    expect(h.countLines('CLOSED:')).toBe(1);
    expect(h.countLines('STARTED:')).toBe(1);
  });
});

describe('recurring rollovers never stack date lines', () => {
  const repeatTask = {
    scheduledDate: new Date(2026, 9, 15),
    scheduledDateRepeat: {
      type: '+' as const,
      unit: 'd' as const,
      value: 1,
      raw: '+1d',
    },
  };

  it('SCHEDULED repeat: three cycles leave one SCHEDULED line; STARTED resets per occurrence', async () => {
    const h = makeHarness();
    h.setLines([
      'TODO test me with repeat',
      'STARTED: [2026-10-14 Wed 09:00]',
      'SCHEDULED: <2026-10-15 Thu .+1d>',
    ]);
    h.taskStateManager.addTask(
      h.makeTask({
        ...repeatTask,
        startedDate: new Date(2026, 9, 14, 9, 0, 0),
      }),
    );

    for (let i = 0; i < 3; i++) {
      // The occurrence is worked (fresh STARTED under 'last' mode)…
      await h.coordinator.updateTaskState(h.storedTask(), 'DOING');
      expect(h.countLines('STARTED:')).toBe(1);
      // …then completed: immediate roll + 50 ms date rollover.
      await h.coordinator.updateTaskState(h.storedTask(), 'DONE');
      await jest.advanceTimersByTimeAsync(50);
      // The rollover cleared the finished occurrence's stamp.
      expect(h.countLines('STARTED:')).toBe(0);
    }

    expect(h.countLines('SCHEDULED:')).toBe(1);
    expect(h.storedTask().state).toBe('TODO');
    expect(h.storedTask().startedDate).toBeNull();
  });

  it('DEADLINE-only repeat: three cycles leave one DEADLINE line', async () => {
    const h = makeHarness();
    h.setLines([
      'TODO test me with deadline repeat',
      'STARTED: [2026-10-14 Wed 09:00]',
      'DEADLINE: <2026-10-15 Thu .+1d>',
    ]);
    h.taskStateManager.addTask(
      h.makeTask({
        scheduledDate: null,
        scheduledDateRepeat: null,
        deadlineDate: new Date(2026, 9, 15),
        deadlineDateRepeat: {
          type: '+' as const,
          unit: 'd' as const,
          value: 1,
          raw: '+1d',
        },
        startedDate: new Date(2026, 9, 14, 9, 0, 0),
      }),
    );

    for (let i = 0; i < 3; i++) {
      await h.coordinator.updateTaskState(h.storedTask(), 'DOING');
      await h.coordinator.updateTaskState(h.storedTask(), 'DONE');
      await jest.advanceTimersByTimeAsync(50);
    }

    expect(h.countLines('DEADLINE:')).toBe(1);
    expect(h.countLines('SCHEDULED:')).toBe(0);
  });

  it('repeat with STARTED tracking off: dates still roll without stacking', async () => {
    const h = makeHarness({ trackStartedDate: false });
    h.setLines([
      'TODO test me with repeat',
      'SCHEDULED: <2026-10-15 Thu .+1d>',
    ]);
    h.taskStateManager.addTask(h.makeTask(repeatTask));

    for (let i = 0; i < 3; i++) {
      await h.coordinator.updateTaskState(h.storedTask(), 'DONE');
      await jest.advanceTimersByTimeAsync(50);
    }

    expect(h.countLines('SCHEDULED:')).toBe(1);
    expect(h.countLines('STARTED:')).toBe(0);
  });
});

describe('table cells — the same matrix via inline <br> dates', () => {
  // Cells store dates INLINE (<br>SCHEDULED: <…> inside the row); there
  // are no date lines below the task. CLOSED shares the list matrix via
  // resolveClosedDateAction (plan 009); STARTED has no cell writer
  // (documented limitation — segments must pass through untouched); the
  // recurring rollover must advance the inline segment in place.

  const occurrences = (haystack: string, needle: string) =>
    haystack.split(needle).length - 1;

  const cellRow = (cell: string) => `| ${cell} |`;

  const scheduledDateIn = (row: string): string | null =>
    row.match(/SCHEDULED: <(\d{4}-\d{2}-\d{2})/)?.[1] ?? null;

  it('CLOSED tracking on: un-complete strips inline CLOSED (STARTED/SCHEDULED preserved); re-complete stamps exactly one fresh CLOSED', async () => {
    const h = makeHarness();
    h.setLines([
      cellRow(
        'DONE cell task<br>STARTED: [2026-10-14 Wed 09:00]<br>CLOSED: [2026-10-14 Wed 10:00]<br>SCHEDULED: <2026-10-14 Wed>',
      ),
    ]);
    h.taskStateManager.addTask(
      h.makeTask({
        isTableTask: true,
        tableCell: { cellIndex: 0 },
        rawText: 'DONE cell task',
        text: 'cell task',
        state: 'DONE',
        completed: true,
        startedDate: new Date(2026, 9, 14, 9, 0, 0),
        closedDate: new Date(2026, 9, 14, 10, 0, 0),
        scheduledDate: new Date(2026, 9, 14),
      }),
    );

    await h.coordinator.updateTaskState(h.storedTask(), 'TODO');

    let row = h.getLines()[0];
    expect(row).not.toContain('CLOSED');
    expect(row).toContain('TODO cell task');
    expect(row).toContain('STARTED: [2026-10-14 Wed 09:00]');
    expect(row).toContain('SCHEDULED: <2026-10-14 Wed>');
    expect(h.storedTask().closedDate).toBeNull();

    await h.coordinator.updateTaskState(h.storedTask(), 'DONE');

    row = h.getLines()[0];
    expect(occurrences(row, 'CLOSED:')).toBe(1);
    expect(row).toContain('CLOSED: [2026-10-16 Fri 12:00]');
    expect(occurrences(row, 'STARTED:')).toBe(1);
    expect(h.storedTask().closedDate).toEqual(now);
  });

  it('CLOSED tracking off: un-complete still strips inline CLOSED (39a829d — removal is never gated); re-complete adds none', async () => {
    const h = makeHarness({ trackClosedDate: false });
    h.setLines([
      cellRow(
        'DONE cell task<br>CLOSED: [2026-10-14 Wed 10:00]<br>SCHEDULED: <2026-10-14 Wed>',
      ),
    ]);
    h.taskStateManager.addTask(
      h.makeTask({
        isTableTask: true,
        tableCell: { cellIndex: 0 },
        rawText: 'DONE cell task',
        text: 'cell task',
        state: 'DONE',
        completed: true,
        closedDate: new Date(2026, 9, 14, 10, 0, 0),
        scheduledDate: new Date(2026, 9, 14),
      }),
    );

    await h.coordinator.updateTaskState(h.storedTask(), 'TODO');
    expect(h.getLines()[0]).not.toContain('CLOSED');

    await h.coordinator.updateTaskState(h.storedTask(), 'DONE');
    expect(occurrences(h.getLines()[0], 'CLOSED:')).toBe(0);
    expect(h.storedTask().closedDate ?? null).toBeNull();
  });

  it('STARTED tracking off: completion cycle never writes STARTED into the cell', async () => {
    const h = makeHarness({ trackStartedDate: false });
    h.setLines([cellRow('TODO cell task<br>SCHEDULED: <2026-10-20 Tue>')]);
    h.taskStateManager.addTask(
      h.makeTask({
        isTableTask: true,
        tableCell: { cellIndex: 0 },
        text: 'cell task',
        scheduledDate: new Date(2026, 9, 20),
      }),
    );

    await h.coordinator.updateTaskState(h.storedTask(), 'DONE');
    expect(h.getLines()[0]).not.toContain('STARTED');

    await h.coordinator.updateTaskState(h.storedTask(), 'TODO');
    expect(h.getLines()[0]).not.toContain('STARTED');
  });

  it('hand-written inline STARTED segment survives un-complete/re-complete untouched (cells never write STARTED)', async () => {
    const h = makeHarness();
    h.setLines([
      cellRow(
        'DONE cell task<br>STARTED: [2026-10-14 Wed 09:00]<br>CLOSED: [2026-10-14 Wed 10:00]',
      ),
    ]);
    h.taskStateManager.addTask(
      h.makeTask({
        isTableTask: true,
        tableCell: { cellIndex: 0 },
        rawText: 'DONE cell task',
        text: 'cell task',
        state: 'DONE',
        completed: true,
        startedDate: new Date(2026, 9, 14, 9, 0, 0),
        closedDate: new Date(2026, 9, 14, 10, 0, 0),
      }),
    );

    await h.coordinator.updateTaskState(h.storedTask(), 'TODO');
    await h.coordinator.updateTaskState(h.storedTask(), 'DONE');

    const row = h.getLines()[0];
    expect(occurrences(row, 'STARTED:')).toBe(1);
    expect(row).toContain('STARTED: [2026-10-14 Wed 09:00]');
  });

  it('repeating cell: rollover advances the inline SCHEDULED segment in place; never stacks, never rewrites the row', async () => {
    const h = makeHarness();
    h.setLines([cellRow('TODO cell task<br>SCHEDULED: <2026-10-15 Thu .+1d>')]);
    h.taskStateManager.addTask(
      h.makeTask({
        isTableTask: true,
        tableCell: { cellIndex: 0 },
        text: 'cell task',
        scheduledDate: new Date(2026, 9, 15),
        scheduledDateRepeat: {
          type: '+' as const,
          unit: 'd' as const,
          value: 1,
          raw: '+1d',
        },
      }),
    );

    // Plain +1d from 2026-10-15: each roll adds one day.
    const expectedDates = ['2026-10-16', '2026-10-17', '2026-10-18'];
    for (let i = 0; i < 3; i++) {
      await h.coordinator.updateTaskState(h.storedTask(), 'DONE');
      await jest.advanceTimersByTimeAsync(50);

      const row = h.getLines()[0];
      expect(occurrences(row, 'SCHEDULED:')).toBe(1);
      expect(scheduledDateIn(row)).toBe(expectedDates[i]);
      // The rollover must never rewrite the table row as a plain task line.
      expect(row.startsWith('| ')).toBe(true);
      expect(row.endsWith(' |')).toBe(true);
      expect(row).toContain('TODO cell task');
      expect(h.storedTask().state).toBe('TODO');
      // Recurring completions write the rolled state directly
      // (buildProcessingContext maps DONE → successor for repeating
      // tasks), so no CLOSED is ever stamped — list-task semantics.
      expect(row).not.toContain('CLOSED');
    }
  });
});
