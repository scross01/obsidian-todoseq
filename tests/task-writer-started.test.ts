import { TaskWriter } from '../src/services/task-writer';
import {
  createBaseTask,
  createCheckboxTask,
  createTestKeywordManager,
  createBaseSettings,
} from './helpers/test-helper';
import { Task } from '../src/types/task';
import { TFile } from 'obsidian';

/**
 * Tests for STARTED timestamp tracking (plans/003-started-timestamps.md).
 *
 * Semantics under test:
 * - STARTED line inserted on first entry into an active state when
 *   trackStartedDate is enabled (opt-in, default false).
 * - Insertion is IDEMPOTENT: an existing STARTED line is never duplicated
 *   or overwritten.
 * - STARTED is NEVER removed by state transitions (first-ever-start).
 * - STARTED sorts FIRST among date lines (before SCHEDULED/DEADLINE/CLOSED).
 */
describe('TaskWriter - STARTED date handling', () => {
  let mockApp: any;
  let mockPlugin: any;
  let taskWriter: TaskWriter;
  let mockEditor: any;
  let lines: string[];

  const fixedNow = new Date(2026, 0, 16, 9, 30, 0); // Fri Jan 16 2026 09:30 local

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(fixedNow);

    lines = ['- [ ] TODO Task text'];

    mockEditor = {
      lineCount: jest.fn(() => lines.length),
      getLine: jest.fn((i: number) => lines[i]),
      replaceRange: jest.fn((text: string, from: any, to: any) => {
        // Minimal line-array emulation for replaceRange on full lines.
        const startLine = from.line;
        const endLine = to.line;
        const inserted = text.split('\n');
        // Full-line replacement or pure insertion at line boundary
        if (startLine === endLine) {
          if (text.endsWith('\n')) {
            // Insert new line(s) at startLine
            inserted.pop(); // drop trailing empty from trailing \n
            lines.splice(startLine, 0, ...inserted);
          } else {
            // Replace whole line content
            lines[startLine] = text;
          }
        } else {
          // Removing lines (from.line..to.line)
          lines.splice(startLine, endLine - startLine, ...inserted);
        }
      }),
      getCursor: jest.fn(() => ({ line: 0, ch: 0 })),
      setCursor: jest.fn(),
    };

    const mockMarkdownView = {
      file: { path: 'test.md' },
      editor: mockEditor,
      getViewType: jest.fn().mockReturnValue('markdown'),
      getMode: jest.fn().mockReturnValue('source'),
    };

    const mockTFile = new TFile();
    Object.assign(mockTFile, {
      path: 'test.md',
      name: 'test.md',
      basename: 'test',
      extension: 'md',
    });

    mockApp = {
      vault: {
        getAbstractFileByPath: jest.fn().mockReturnValue(mockTFile),
        process: jest.fn(
          (_path: string, callback: (data: string) => string) => {
            const result = callback(lines.join('\n'));
            lines = result.split('\n');
            return Promise.resolve(result);
          },
        ),
      },
      workspace: {
        getActiveViewOfType: jest.fn().mockReturnValue(mockMarkdownView),
      },
    };

    mockPlugin = {
      app: mockApp,
      settings: createBaseSettings({ trackStartedDate: true }),
    };

    const keywordManager = createTestKeywordManager(
      createBaseSettings({ trackStartedDate: true }),
    );
    taskWriter = new TaskWriter(mockPlugin, keywordManager);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const makeTask = (overrides: Partial<Task> = {}): Task =>
    createCheckboxTask({
      path: 'test.md',
      line: 0,
      rawText: '- [ ] TODO Task text',
      text: 'Task text',
      state: 'TODO',
      ...overrides,
    });

  describe('applyLineUpdate - STARTED insertion trigger', () => {
    it('inserts STARTED line on TODO -> DOING when trackStartedDate enabled', async () => {
      const task = makeTask();
      const result = await taskWriter.applyLineUpdate(task, 'DOING');

      expect(lines).toContainEqual('  STARTED: [2026-01-16 Fri 09:30]');
      expect(result.startedDate).toBeTruthy();
      expect(result.lineDelta).toBe(1);
    });

    it('does NOT insert STARTED when trackStartedDate disabled', async () => {
      const keywordManager = createTestKeywordManager(
        createBaseSettings({ trackStartedDate: false }),
      );
      mockPlugin.settings = createBaseSettings({ trackStartedDate: false });
      taskWriter.updateKeywordManager(keywordManager);

      const task = makeTask();
      const result = await taskWriter.applyLineUpdate(task, 'DOING');

      const startedLines = lines.filter((l) => l.includes('STARTED:'));
      expect(startedLines).toHaveLength(0);
      expect(result.startedDate).toBeNull();
    });

    it('does NOT insert STARTED when transitioning to non-active state', async () => {
      const task = makeTask();
      await taskWriter.applyLineUpdate(task, 'DONE');

      const startedLines = lines.filter((l) => l.includes('STARTED:'));
      expect(startedLines).toHaveLength(0);
    });

    it('preserves existing STARTED line (idempotent - no duplicate)', async () => {
      lines = ['- [ ] TODO Task text', '  STARTED: [2026-01-10 Sat 08:00]'];

      const task = makeTask();
      const result = await taskWriter.applyLineUpdate(task, 'DOING');

      const startedLines = lines.filter((l) => l.includes('STARTED:'));
      expect(startedLines).toHaveLength(1);
      // Original timestamp retained, NOT overwritten with today's
      expect(startedLines[0]).toContain('2026-01-10 Sat 08:00');
      expect(startedLines[0]).not.toContain('2026-01-16');
      // No new line inserted (lineDelta only set when non-zero)
      expect(result.lineDelta ?? 0).toBe(0);
    });

    it('retains STARTED line on DOING -> DONE', async () => {
      lines = ['- [ ] DOING Task text', '  STARTED: [2026-01-10 Sat 08:00]'];
      const task = makeTask({
        rawText: '- [ ] DOING Task text',
        state: 'DOING',
      });
      await taskWriter.applyLineUpdate(task, 'DONE');

      const startedLines = lines.filter((l) => l.includes('STARTED:'));
      expect(startedLines).toHaveLength(1);
      expect(startedLines[0]).toContain('2026-01-10 Sat 08:00');
    });

    it('retains STARTED line on DONE -> TODO (never removed on reactivation)', async () => {
      lines = ['- [x] DONE Task text', '  STARTED: [2026-01-10 Sat 08:00]'];
      const task = makeTask({
        rawText: '- [x] DONE Task text',
        state: 'DONE',
        completed: true,
      });
      await taskWriter.applyLineUpdate(task, 'TODO');

      const startedLines = lines.filter((l) => l.includes('STARTED:'));
      expect(startedLines).toHaveLength(1);
      expect(startedLines[0]).toContain('2026-01-10 Sat 08:00');
    });

    it('retains original STARTED through DOING -> WAIT -> DOING cycle', async () => {
      // First activation: STARTED gets inserted
      const task1 = makeTask();
      await taskWriter.applyLineUpdate(task1, 'DOING');
      expect(lines.filter((l) => l.includes('STARTED:'))).toHaveLength(1);
      const original = lines.find((l) => l.includes('STARTED:'))!;

      // DOING -> WAIT (inactive transition: no change to STARTED)
      const task2 = makeTask({
        rawText: '- [ ] DOING Task text',
        state: 'DOING',
        startedDate: new Date(2026, 0, 16, 9, 30, 0),
      });
      const afterWait = await taskWriter.applyLineUpdate(task2, 'WAIT');
      expect(lines.filter((l) => l.includes('STARTED:'))).toHaveLength(1);
      expect(lines.find((l) => l.includes('STARTED:'))).toBe(original);

      // WAIT -> DOING: task now has startedDate set, so no re-insertion.
      // Even if startedDate were lost from state, file-level idempotency holds.
      const task3 = makeTask({
        rawText: '- [ ] WAIT Task text',
        state: 'WAIT',
        startedDate: afterWait.startedDate,
      });
      const reactivated = await taskWriter.applyLineUpdate(task3, 'DOING');
      expect(lines.filter((l) => l.includes('STARTED:'))).toHaveLength(1);
      expect(lines.find((l) => l.includes('STARTED:'))).toBe(original);
      expect(reactivated.startedDate).toBeTruthy();
    });
  });

  describe('updateTaskStartedDate - direct calls', () => {
    it('inserts STARTED line when none exists', async () => {
      const task = makeTask();
      const result = await taskWriter.updateTaskStartedDate(
        task,
        new Date(2026, 0, 16, 9, 30, 0),
      );

      expect(lines).toContainEqual('  STARTED: [2026-01-16 Fri 09:30]');
      expect(result.lineDelta).toBe(1);
    });

    it('is a no-op when a STARTED line already exists', async () => {
      lines = ['- [ ] TODO Task text', '  STARTED: [2026-01-10 Sat 08:00]'];
      const task = makeTask();
      const result = await taskWriter.updateTaskStartedDate(
        task,
        new Date(2026, 0, 16, 9, 30, 0),
      );

      expect(lines.filter((l) => l.includes('STARTED:'))).toHaveLength(1);
      expect(lines.find((l) => l.includes('STARTED:'))).toContain(
        '2026-01-10 Sat 08:00',
      );
      expect(result.lineDelta).toBe(0);
    });

    it('inserts STARTED before an existing SCHEDULED line', async () => {
      lines = ['- [ ] TODO Task text', '  SCHEDULED: <2026-01-20 Tue>'];
      const task = makeTask();
      await taskWriter.updateTaskStartedDate(
        task,
        new Date(2026, 0, 16, 9, 30, 0),
      );

      const startedIdx = lines.findIndex((l) => l.includes('STARTED:'));
      const scheduledIdx = lines.findIndex((l) => l.includes('SCHEDULED:'));
      expect(startedIdx).toBeGreaterThan(-1);
      expect(scheduledIdx).toBeGreaterThan(-1);
      expect(startedIdx).toBeLessThan(scheduledIdx);
    });

    it('inserts STARTED before existing DEADLINE line when no SCHEDULED', async () => {
      lines = ['- [ ] TODO Task text', '  DEADLINE: <2026-01-22 Thu>'];
      const task = makeTask();
      await taskWriter.updateTaskStartedDate(
        task,
        new Date(2026, 0, 16, 9, 30, 0),
      );

      const startedIdx = lines.findIndex((l) => l.includes('STARTED:'));
      const deadlineIdx = lines.findIndex((l) => l.includes('DEADLINE:'));
      expect(startedIdx).toBeLessThan(deadlineIdx);
    });

    it('inserts SCHEDULED after an existing STARTED line (STARTED-first invariant)', async () => {
      // Regression: SCHEDULED used to fall through to afterDesc and land
      // ABOVE the existing STARTED line, violating the STARTED-first order.
      lines = ['- [ ] TODO Task text', '  STARTED: [2026-01-10 Sat 08:00]'];
      const task = makeTask();
      await taskWriter.updateTaskScheduledDate(
        task,
        new Date(2026, 0, 20, 0, 0, 0),
      );

      const startedIdx = lines.findIndex((l) => l.includes('STARTED:'));
      const scheduledIdx = lines.findIndex((l) => l.includes('SCHEDULED:'));
      expect(scheduledIdx).toBeGreaterThan(-1);
      expect(startedIdx).toBeLessThan(scheduledIdx);
    });

    it('inserts DEADLINE after an existing STARTED line (STARTED-first invariant)', async () => {
      lines = ['- [ ] TODO Task text', '  STARTED: [2026-01-10 Sat 08:00]'];
      const task = makeTask();
      await taskWriter.updateTaskDeadlineDate(
        task,
        new Date(2026, 0, 22, 0, 0, 0),
      );

      const startedIdx = lines.findIndex((l) => l.includes('STARTED:'));
      const deadlineIdx = lines.findIndex((l) => l.includes('DEADLINE:'));
      expect(deadlineIdx).toBeGreaterThan(-1);
      expect(startedIdx).toBeLessThan(deadlineIdx);
    });

    it('places CLOSED after an existing STARTED line', async () => {
      lines = ['- [ ] TODO Task text', '  STARTED: [2026-01-10 Sat 08:00]'];
      const task = makeTask();
      await taskWriter.updateTaskClosedDate(task, new Date(2026, 0, 16, 10, 0));

      const startedIdx = lines.findIndex((l) => l.includes('STARTED:'));
      const closedIdx = lines.findIndex((l) => l.includes('CLOSED:'));
      expect(closedIdx).toBeGreaterThan(-1);
      expect(startedIdx).toBeLessThan(closedIdx);
    });

    it('preserves task indentation for indented tasks', async () => {
      lines = ['    - [ ] TODO Task text'];
      const task = makeTask({
        rawText: '    - [ ] TODO Task text',
        indent: '    ',
      });
      await taskWriter.updateTaskStartedDate(
        task,
        new Date(2026, 0, 16, 9, 30, 0),
      );

      const startedLine = lines.find((l) => l.includes('STARTED:'));
      expect(startedLine).toBe('      STARTED: [2026-01-16 Fri 09:30]');
    });

    it('works via Vault API when forceVaultApi is true', async () => {
      const task = makeTask();
      const result = await taskWriter.updateTaskStartedDate(
        task,
        new Date(2026, 0, 16, 9, 30, 0),
        true,
      );

      expect(mockApp.vault.process).toHaveBeenCalled();
      expect(lines).toContainEqual('  STARTED: [2026-01-16 Fri 09:30]');
      expect(result.lineDelta).toBe(1);
    });

    it('never removes STARTED: no removal path exists on TaskWriter', () => {
      const proto = Object.getOwnPropertyNames(
        Object.getPrototypeOf(taskWriter),
      );
      expect(proto).not.toContain('removeTaskStartedDate');
    });

    it('table cell tasks: STARTED not written inline (documented limitation)', async () => {
      // Table cell tasks use inline format; STARTED insertion is not
      // supported there (per plan: "verify documented behavior"). The
      // applyTableCellUpdate path has no STARTED branch, so cell content
      // must remain untouched apart from state.
      const cellTask = createCheckboxTask({
        isTableTask: true,
        tableCell: { cellIndex: 0 },
        rawText: 'TODO Task text',
        text: 'Task text',
      });
      // Table path goes through applyTableCellUpdate via applyLineUpdate
      const result = await taskWriter.applyLineUpdate(cellTask, 'DOING');
      expect(result.state).toBe('DOING');
      // No STARTED was injected into the cell content
      expect(result.rawText).not.toContain('STARTED');
    });
  });

  describe('applyLineUpdate - Vault API path (file not active in source mode)', () => {
    // Regression tests for a temporal-dead-zone bug: the vault.process
    // callback assigned `startedInserted` before its `let` declaration,
    // throwing ReferenceError and aborting the whole write. This path is
    // taken when the task's file is NOT the active source-mode editor
    // (e.g. reading mode, another file focused) — exactly the main task
    // list scenario.
    let vaultLines: string[];

    beforeEach(() => {
      vaultLines = ['- [ ] TODO Task text'];

      // Active view exists but is NOT source mode (reading/preview mode)
      // → applyLineUpdate must take the vault.process path.
      const mockMarkdownView = {
        file: { path: 'test.md' },
        editor: undefined,
        getViewType: jest.fn().mockReturnValue('markdown'),
        getMode: jest.fn().mockReturnValue('preview'),
      };
      mockApp.workspace.getActiveViewOfType = jest
        .fn()
        .mockReturnValue(mockMarkdownView);

      mockApp.vault.process.mockImplementation(
        (_path: string, callback: (data: string) => string) => {
          const result = callback(vaultLines.join('\n'));
          vaultLines = result.split('\n');
          return Promise.resolve(result);
        },
      );
    });

    it('TODO -> DOING writes state AND STARTED line without throwing', async () => {
      const task = makeTask();
      const result = await taskWriter.applyLineUpdate(task, 'DOING');

      // Task line itself was rewritten (state changed)
      expect(vaultLines[0]).toBe('- [ ] DOING Task text');
      // STARTED line was inserted below
      expect(vaultLines).toContainEqual('  STARTED: [2026-01-16 Fri 09:30]');
      expect(result.startedDate).toBeTruthy();
      expect(result.lineDelta).toBe(1);
    });

    it('TODO -> NOW (non-DOING active keyword) also inserts STARTED', async () => {
      // Issue 3: transitions to ANY active state must insert STARTED,
      // not only DOING.
      const task = makeTask();
      const result = await taskWriter.applyLineUpdate(task, 'NOW');

      expect(vaultLines[0]).toBe('- [ ] NOW Task text');
      expect(vaultLines).toContainEqual('  STARTED: [2026-01-16 Fri 09:30]');
      expect(result.startedDate).toBeTruthy();
    });

    it('TODO -> DOING with trackStartedDate disabled writes state only', async () => {
      mockPlugin.settings = createBaseSettings({ trackStartedDate: false });
      taskWriter.updateKeywordManager(
        createTestKeywordManager(
          createBaseSettings({ trackStartedDate: false }),
        ),
      );

      const task = makeTask();
      const result = await taskWriter.applyLineUpdate(task, 'DOING');

      expect(vaultLines[0]).toBe('- [ ] DOING Task text');
      expect(vaultLines.filter((l) => l.includes('STARTED:'))).toHaveLength(0);
      expect(result.startedDate ?? null).toBeNull();
    });

    it('DOING -> DONE on Vault path still writes state (no STARTED block)', async () => {
      const task = makeTask({
        rawText: '- [ ] DOING Task text',
        state: 'DOING',
      });
      const result = await taskWriter.applyLineUpdate(task, 'DONE');

      expect(vaultLines[0]).toBe('- [x] DONE Task text');
      expect(vaultLines.filter((l) => l.includes('STARTED:'))).toHaveLength(0);
      expect(result.startedDate ?? null).toBeNull();
    });
  });
});
