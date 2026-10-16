/**
 * @jest-environment jsdom
 */

/**
 * STARTED timestamp edge-case audit (fork-analysis §4.4 failure modes).
 *
 * E1 — rapid cycling from a STALE task object (predates the STARTED insert):
 *      one STARTED line in the file, no double-counted lineDelta, and the
 *      returned snapshot carries the ORIGINAL date.
 * E2 — the inserted date reaches the TaskStateManager snapshot, same date
 *      as written.
 * E1b— E1 + E2 through the full coordinator stack: rapid stale cycling must
 *      not lose startedDate from the state manager.
 * E3 — mixed-case custom active keywords follow KeywordManager state
 *      matching (consistent-with-state-matching, see D3).
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
const fixedStartedLine = 'STARTED: [2026-01-16 Fri 09:30]';

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

  // Minimal editor emulation (mirrors tests/task-writer-started.test.ts).
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
    // Default: no active view → vault-process path. sourceMode wires an
    // active source-mode view → Editor API path.
    workspace: {
      getActiveViewOfType: jest
        .fn()
        .mockReturnValue(options.sourceMode ? sourceModeView : null),
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
      rawText: 'TODO Task text',
      text: 'Task text',
      state: 'TODO',
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
    makeTask,
    startedLines,
    getLines: () => lines,
    setLines: (next: string[]) => {
      lines = next;
    },
  };
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(fixedNow);
});

afterEach(() => {
  jest.useRealTimers();
});

describe('E1 — stale-snapshot rapid cycling (TaskWriter level)', () => {
  it('keeps one STARTED line, does not double-count lineDelta, and returns the original date', async () => {
    const h = makeHarness();
    const stale = h.makeTask(); // captured BEFORE the DOING insert

    const first = await h.taskWriter.applyLineUpdate(stale, 'DOING');
    expect(first.startedDate).toEqual(fixedNow);
    expect(h.startedLines()).toEqual([fixedStartedLine]);

    // Time passes; the second transition is issued from the SAME stale object.
    jest.setSystemTime(new Date(2026, 0, 16, 9, 35, 0));
    const second = await h.taskWriter.applyLineUpdate(stale, 'DONE');

    // File safety: exactly one STARTED line, never duplicated.
    expect(h.startedLines()).toEqual([fixedStartedLine]);
    // Line accounting: only the CLOSED line counts — STARTED is not re-added.
    expect((second as Task & { lineDelta?: number }).lineDelta).toBe(1);
    expect(h.getLines()).toContain('CLOSED: [2026-01-16 Fri 09:35]');
    // The snapshot carries the ORIGINAL start (09:30), not null and not now.
    expect(second.startedDate).toEqual(fixedNow);
  });

  it('source-mode (Editor API path): retains the original date too', async () => {
    const h = makeHarness({}, { sourceMode: true });
    const stale = h.makeTask();

    const first = await h.taskWriter.applyLineUpdate(stale, 'DOING');
    expect(first.startedDate).toEqual(fixedNow);
    expect(h.startedLines()).toEqual([fixedStartedLine]);

    jest.setSystemTime(new Date(2026, 0, 16, 9, 35, 0));
    const second = await h.taskWriter.applyLineUpdate(stale, 'DONE');

    expect(h.startedLines()).toEqual([fixedStartedLine]);
    expect((second as Task & { lineDelta?: number }).lineDelta).toBe(1);
    // Editor path must also report the retained original, not a fabricated
    // "now".
    expect(second.startedDate).toEqual(fixedNow);
  });
});

describe('E2 — inserted date reaches the state-manager snapshot', () => {
  it('stored task has startedDate equal to the written STARTED line', async () => {
    const h = makeHarness();
    const task = h.makeTask();
    h.taskStateManager.addTask(task);

    await h.coordinator.updateTaskState(task, 'DOING');

    expect(h.getLines()).toContain(fixedStartedLine);
    const stored = h.taskStateManager.findTaskByPathAndLine('test.md', 0);
    expect(stored?.startedDate).toEqual(fixedNow);
  });
});

describe('E1b — rapid stale cycling through the coordinator stack', () => {
  it('startedDate survives a DOING→DONE race issued from one stale snapshot', async () => {
    const h = makeHarness();
    const stale = h.makeTask();
    h.taskStateManager.addTask(stale);

    await h.coordinator.updateTaskState(stale, 'DOING');
    jest.setSystemTime(new Date(2026, 0, 16, 9, 35, 0));
    await h.coordinator.updateTaskState(stale, 'DONE'); // same stale object

    expect(h.startedLines()).toEqual([fixedStartedLine]);
    const stored = h.taskStateManager.findTaskByPathAndLine('test.md', 0);
    expect(stored?.startedDate).toEqual(fixedNow);
  });
});

describe('E3 — mixed-case custom active keywords follow KeywordManager', () => {
  it('normalised custom keyword triggers insertion; un-normalised casing follows state matching', async () => {
    const h = makeHarness({ additionalActiveKeywords: ['In-Progress'] });
    const task = h.makeTask();

    // KeywordManager normalises configured keywords to uppercase
    // (normalizeKeyword); the parser and every state consumer (panel, sort,
    // isActive) see IN-PROGRESS. STARTED insertion follows that match.
    expect(h.keywordManager.isActive('IN-PROGRESS')).toBe(true);
    const matched = await h.taskWriter.applyLineUpdate(task, 'IN-PROGRESS');
    expect(matched.startedDate).toEqual(fixedNow);
    expect(h.startedLines()).toEqual([fixedStartedLine]);

    // A state carrying the un-normalised casing never matches — consistent
    // with state matching everywhere (the parser would not have produced
    // that state either). STARTED follows the same rule: no insertion.
    expect(h.keywordManager.isActive('In-Progress')).toBe(false);
    h.setLines(['TODO Task text']);
    const mismatched = await h.taskWriter.applyLineUpdate(task, 'In-Progress');
    expect(mismatched.startedDate).toBeNull();
    expect(h.startedLines()).toEqual([]);
  });
});

describe('M4 — last mode: completions and manual pauses keep the stamp', () => {
  const oldStarted = new Date(2026, 0, 10, 8, 0, 0);
  const oldStartedLine = 'STARTED: [2026-01-10 Sat 08:00]';

  it('DOING→DONE retains the STARTED line and snapshot (mode-invariant)', async () => {
    const h = makeHarness({ startedDateMode: 'last' });
    h.setLines(['DOING Task text', oldStartedLine]);
    const task = h.makeTask({
      rawText: 'DOING Task text',
      state: 'DOING',
      startedDate: oldStarted,
    });

    const result = await h.taskWriter.applyLineUpdate(task, 'DONE');

    expect(h.startedLines()).toEqual([oldStartedLine]);
    expect(result.startedDate).toEqual(oldStarted);
  });

  it('manual DOING→TODO pause retains the STARTED line and snapshot', async () => {
    const h = makeHarness({ startedDateMode: 'last' });
    h.setLines(['DOING Task text', oldStartedLine]);
    const task = h.makeTask({
      rawText: 'DOING Task text',
      state: 'DOING',
      startedDate: oldStarted,
    });

    const result = await h.taskWriter.applyLineUpdate(task, 'TODO');

    expect(h.startedLines()).toEqual([oldStartedLine]);
    expect(result.startedDate).toEqual(oldStarted);
  });
});

describe('M8 — last mode: re-stamped date reaches the state manager', () => {
  it('TaskStateManager carries the fresh date after a re-entry', async () => {
    const h = makeHarness({ startedDateMode: 'last' });
    h.setLines(['TODO Task text', 'STARTED: [2026-01-10 Sat 08:00]']);
    const task = h.makeTask({
      startedDate: new Date(2026, 0, 10, 8, 0, 0),
    });
    h.taskStateManager.addTask(task);

    await h.coordinator.updateTaskState(task, 'DOING');

    expect(h.startedLines()).toEqual([fixedStartedLine]);
    const stored = h.taskStateManager.findTaskByPathAndLine('test.md', 0);
    expect(stored?.startedDate).toEqual(fixedNow);
  });
});

describe('M9 — last mode: rapid stale double-entry keeps one line', () => {
  it('two DOING entries from one stale TODO snapshot collapse to one fresh stamp', async () => {
    const h = makeHarness({ startedDateMode: 'last' });
    const stale = h.makeTask(); // captured BEFORE the first DOING insert

    const first = await h.taskWriter.applyLineUpdate(stale, 'DOING');
    expect(first.startedDate).toEqual(fixedNow);
    expect(h.startedLines()).toEqual([fixedStartedLine]);

    jest.setSystemTime(new Date(2026, 0, 16, 9, 35, 0));
    const second = await h.taskWriter.applyLineUpdate(stale, 'DOING');

    // File safety: exactly one STARTED line; last-writer-wins within the
    // staleness window (both entries are "now").
    expect(h.startedLines()).toEqual(['STARTED: [2026-01-16 Fri 09:35]']);
    expect(second.startedDate).toEqual(new Date(2026, 0, 16, 9, 35, 0));
    expect((second as Task & { lineDelta?: number }).lineDelta ?? 0).toBe(0);
  });
});
