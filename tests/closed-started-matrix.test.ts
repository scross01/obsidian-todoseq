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
