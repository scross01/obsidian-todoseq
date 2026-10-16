/**
 * @jest-environment jsdom
 */

/**
 * Per-occurrence STARTED: the recurrence rollover is the only operation that
 * ends an occurrence (it advances SCHEDULED/DEADLINE), so it is the only
 * operation that resets the STARTED record.
 *
 * R1 — vault path: rollover of a started recurring task removes STARTED,
 *      advances dates, and reports `startedDate: null`.
 * R2 — rolled state active (custom transition map): fresh stamp, old gone.
 * R3 — never started: rollover is a no-op for STARTED.
 * R4 — trackStartedDate off: STARTED untouched, snapshot unchanged.
 * R5 — editor path: mirrors R1 without a vault.process call.
 * R6 — manual DONE→TODO / DOING→TODO never remove the stamp (both paths).
 * R7 — full coordinator e2e: complete a started recurring task, the 50 ms
 *      rollover clears file + state-manager stamp; the next start writes a
 *      fresh one (finalize 'recurrence' must patch startedDate for this).
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

const fixedNow = new Date(2026, 0, 16, 9, 30, 0); // Fri Jan 16 2026 09:30 local
const oldStarted = new Date(2026, 0, 10, 8, 0, 0); // Sat Jan 10 2026 08:00 local
const oldStartedLine = 'STARTED: [2026-01-10 Sat 08:00]';
const freshStartedLine = 'STARTED: [2026-01-16 Fri 09:30]';

function makeHarness(
  settingsOverrides: Record<string, unknown> = {},
  options: { sourceMode?: boolean } = {},
) {
  const settings = createBaseSettings({
    trackStartedDate: true,
    trackClosedDate: true,
    ...settingsOverrides,
  });

  let lines = ['TODO Task text'];

  const mockTFile = new TFile();
  mockTFile.path = 'test.md';
  mockTFile.name = 'test.md';

  // Date-line detection for the recurrence date math: the minimal
  // RecurrenceDateLineParser shape (see RecurrenceCoordinator).
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

  // Minimal editor emulation (mirrors tests/started-edge-cases.test.ts).
  const mockEditor = {
    lineCount: jest.fn(() => lines.length),
    getLine: jest.fn((i: number) => lines[i]),
    replaceRange: jest.fn((text: string, from: any, to: any) => {
      const startLine = from.line;
      const endLine = to.line;
      const inserted = text.split('\n');
      if (startLine === endLine) {
        if (text.endsWith('\n')) {
          inserted.pop();
          lines.splice(startLine, 0, ...inserted);
        } else {
          lines[startLine] = text;
        }
      } else {
        lines.splice(startLine, endLine - startLine, ...inserted);
      }
    }),
    getCursor: jest.fn(() => ({ line: 0, ch: 0 })),
    setCursor: jest.fn(),
  };

  const sourceModeView = {
    file: { path: 'test.md' },
    editor: mockEditor,
    getViewType: jest.fn().mockReturnValue('markdown'),
    getMode: jest.fn().mockReturnValue('source'),
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
    // RecurrenceCoordinator resolves the date-line parser through the plugin
    // registry (global app.plugins.getPlugin('todoseq') shape).
    plugins: {
      getPlugin: jest.fn().mockReturnValue({
        vaultScanner: {
          getParser: () => mockParser,
        },
      }),
    },
    // Default: no active view → vault-process path. sourceMode wires an
    // active source-mode view → Editor API path.
    workspace: {
      getActiveViewOfType: jest
        .fn()
        .mockReturnValue(options.sourceMode ? sourceModeView : null),
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
    embeddedTaskListProcessor: {
      refreshAllEmbeddedTaskLists: jest.fn(),
    },
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
      rawText: 'DOING Task text',
      text: 'Task text',
      state: 'DOING',
      completed: false,
      // Recurring: +1d repeat anchored on the current occurrence.
      scheduledDate: new Date(2026, 0, 16),
      scheduledDateRepeat: { type: '+', unit: 'd', value: 1, raw: '+1d' },
      deadlineDate: null,
      deadlineDateRepeat: null,
      startedDate: oldStarted,
      ...overrides,
    });

  const startedLines = () =>
    lines.filter((l) => l.trim().startsWith('STARTED:'));

  return {
    settings,
    keywordManager,
    taskStateManager,
    taskWriter,
    coordinator,
    mockApp,
    mockParser,
    makeTask,
    startedLines,
    getLines: () => lines,
    setLines: (next: string[]) => {
      lines = next;
    },
  };
}

const recurringStartedContent = [
  'DOING Task text',
  `${oldStartedLine}`,
  'SCHEDULED: <2026-01-16 Fri +1d>',
];

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(fixedNow);
});

afterEach(() => {
  jest.useRealTimers();
});

describe('R1 — vault rollover removes STARTED (rolled state inactive)', () => {
  it('removes the line, advances dates, and reports startedDate null in one vault.process', async () => {
    const h = makeHarness();
    h.setLines([...recurringStartedContent]);
    const task = h.makeTask();

    const result = await h.taskWriter.applyRecurrenceUpdate(task, {
      newScheduledDate: new Date(2026, 0, 17),
      newState: 'TODO',
    });

    // Removal happened.
    expect(h.startedLines()).toEqual([]);
    // Line accounting: only the STARTED line disappears (SCHEDULED updates
    // in place, the state line is replaced).
    expect(h.getLines()).toHaveLength(recurringStartedContent.length - 1);
    expect((result as Task & { lineDelta?: number }).lineDelta).toBe(-1);
    // Snapshot follows the file: next start's insert guard re-arms.
    expect(result.startedDate).toBeNull();
    // Dates advanced and state rolled.
    expect(result.scheduledDate).toEqual(new Date(2026, 0, 17));
    expect(
      h
        .getLines()
        .some((l) => l.startsWith('SCHEDULED:') && l.includes('2026-01-17')),
    ).toBe(true);
    expect(result.state).toBe('TODO');
    // Single atomic write — one undo entry.
    expect(h.mockApp.vault.process).toHaveBeenCalledTimes(1);
  });
});

describe('R2 — rolled-active rollover stamps a fresh STARTED', () => {
  it('replaces the old stamp with now when the rolled state is active', async () => {
    const h = makeHarness();
    h.setLines([...recurringStartedContent]);
    const task = h.makeTask();

    const result = await h.taskWriter.applyRecurrenceUpdate(task, {
      newScheduledDate: new Date(2026, 0, 17),
      newState: 'DOING',
    });

    // Exactly one STARTED, the fresh one — old occurrence's stamp is gone.
    expect(h.startedLines()).toEqual([freshStartedLine]);
    expect(result.startedDate).toEqual(fixedNow);
    // Remove + insert cancel out.
    expect((result as Task & { lineDelta?: number }).lineDelta ?? 0).toBe(0);
    expect(h.mockApp.vault.process).toHaveBeenCalledTimes(1);
  });
});

describe('R3 — never-started rollover is a STARTED no-op', () => {
  it('inserts nothing and keeps startedDate null', async () => {
    const h = makeHarness();
    const content = ['DOING Task text', 'SCHEDULED: <2026-01-16 Fri +1d>'];
    h.setLines([...content]);
    const task = h.makeTask({ startedDate: null });

    const result = await h.taskWriter.applyRecurrenceUpdate(task, {
      newScheduledDate: new Date(2026, 0, 17),
      newState: 'TODO',
    });

    expect(h.startedLines()).toEqual([]);
    expect(result.startedDate).toBeNull();
    // STARTED contributes nothing: line count unchanged apart from nothing.
    expect(h.getLines()).toHaveLength(content.length);
    expect((result as Task & { lineDelta?: number }).lineDelta ?? 0).toBe(0);
  });
});

describe('R4 — trackStartedDate off leaves STARTED alone', () => {
  it('does not remove or rewrite the stamp when the setting is disabled', async () => {
    const h = makeHarness({ trackStartedDate: false });
    h.setLines([...recurringStartedContent]);
    const task = h.makeTask();

    const result = await h.taskWriter.applyRecurrenceUpdate(task, {
      newScheduledDate: new Date(2026, 0, 17),
      newState: 'TODO',
    });

    expect(h.startedLines()).toEqual([oldStartedLine]);
    expect(result.startedDate).toEqual(oldStarted);
    expect(h.getLines()).toHaveLength(recurringStartedContent.length);
  });
});

describe('R5 — editor-path rollover removes STARTED (source mode)', () => {
  it('mirrors R1 via Editor API with no vault.process call', async () => {
    const h = makeHarness({}, { sourceMode: true });
    h.setLines([...recurringStartedContent]);
    const task = h.makeTask();

    const result = await h.taskWriter.applyRecurrenceUpdate(task, {
      newScheduledDate: new Date(2026, 0, 17),
      newState: 'TODO',
    });

    expect(h.startedLines()).toEqual([]);
    expect(result.startedDate).toBeNull();
    expect((result as Task & { lineDelta?: number }).lineDelta).toBe(-1);
    expect(
      h
        .getLines()
        .some((l) => l.startsWith('SCHEDULED:') && l.includes('2026-01-17')),
    ).toBe(true);
    expect(result.state).toBe('TODO');
    expect(h.mockApp.vault.process).not.toHaveBeenCalled();
  });
});

describe.each([
  ['vault path', false],
  ['editor path', true],
] as const)(
  'R6 — manual transitions never remove STARTED (%s)',
  (_name, sourceMode) => {
    it('manual DONE→TODO keeps the stamp and snapshot', async () => {
      const h = makeHarness({}, { sourceMode });
      h.setLines([
        'DONE Task text',
        oldStartedLine,
        'CLOSED: [2026-01-15 Thu 12:00]',
        'SCHEDULED: <2026-01-16 Fri +1d>',
      ]);
      const task = h.makeTask({ state: 'DONE', completed: true });

      const result = await h.taskWriter.applyLineUpdate(task, 'TODO');

      expect(h.startedLines()).toEqual([oldStartedLine]);
      expect(result.startedDate).toEqual(oldStarted);
    });

    it('manual DOING→TODO pause keeps the stamp and snapshot', async () => {
      const h = makeHarness({}, { sourceMode });
      h.setLines([...recurringStartedContent]);
      const task = h.makeTask({ state: 'DOING', completed: false });

      const result = await h.taskWriter.applyLineUpdate(task, 'TODO');

      expect(h.startedLines()).toEqual([oldStartedLine]);
      expect(result.startedDate).toEqual(oldStarted);
    });
  },
);

describe('R7 — coordinator e2e: completion rolls the stamp away, next start re-stamps', () => {
  it('clears file and state-manager stamp at rollover, then stamps fresh on TODO→DOING', async () => {
    const h = makeHarness();
    h.setLines([...recurringStartedContent]);
    const task = h.makeTask();
    h.taskStateManager.addTask(task);

    // User completes the started recurring task.
    await h.coordinator.updateTaskState(task, 'DONE');
    // Wait out the 50 ms recurrence window (async work resolves after).
    await jest.advanceTimersByTimeAsync(50);

    // Phase A — the rollover ended the occurrence:
    expect(h.startedLines()).toEqual([]);
    const storedAfterRoll = h.taskStateManager.findTaskByPathAndLine(
      'test.md',
      0,
    );
    expect(storedAfterRoll?.state).toBe('TODO');
    expect(storedAfterRoll?.startedDate).toBeNull();

    // Phase B — the new occurrence starts fresh.
    jest.setSystemTime(new Date(2026, 0, 16, 10, 0, 0));
    await h.coordinator.updateTaskState(storedAfterRoll as Task, 'DOING');

    expect(h.startedLines()).toEqual(['STARTED: [2026-01-16 Fri 10:00]']);
    const storedAfterStart = h.taskStateManager.findTaskByPathAndLine(
      'test.md',
      0,
    );
    expect(storedAfterStart?.startedDate).toEqual(
      new Date(2026, 0, 16, 10, 0, 0),
    );
  });
});
