import { TaskWriter } from '../src/services/task-writer';
import {
  createBaseSettings,
  createCheckboxTask,
  createTestKeywordManager,
  emulateEditorReplaceRange,
} from './helpers/test-helper';
import { Task } from '../src/types/task';
import { TFile } from 'obsidian';

/**
 * Date-line INSERTION through the Editor API must produce a real new line
 * even when the insert position is the END of the document.
 *
 * CodeMirror clamps out-of-range positions to the end of the text
 * (clipPos), so `replaceRange(text + '\n', {line: lineCount, ch: 0}, …)`
 * splices the text onto the END of the last line ("SCHEDULED: …CLOSED: …")
 * instead of starting its own line. The editor mock here is deliberately
 * CM-strict: positions at/after lineCount clamp to the end of the last
 * line, which is what real Obsidian does.
 *
 * Covered insert sites (all editor-path branches in TaskWriter):
 * - updateTaskClosedDate   (CLOSED)
 * - updateTaskStartedDate  (STARTED)
 * - updateDateLineInEditor (SCHEDULED/DEADLINE via updateTaskScheduled/DeadlineDate)
 */
describe('TaskWriter - editor-path date-line insert at end of document', () => {
  let mockApp: any;
  let mockPlugin: any;
  let taskWriter: TaskWriter;
  let mockEditor: any;
  let lines: string[];

  const fixedNow = new Date(2026, 0, 16, 9, 30, 0); // Fri Jan 16 2026 09:30 local

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(fixedNow);

    lines = ['TODO Task text', 'SCHEDULED: <2026-01-20 Tue>'];

    mockEditor = {
      lineCount: jest.fn(() => lines.length),
      getLine: jest.fn((i: number) => lines[i]),
      replaceRange: jest.fn((text: string, from: any, to: any) => {
        // CodeMirror-faithful line emulation (clipPos clamping at EOF).
        emulateEditorReplaceRange(lines, text, from, to);
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

    const settings = createBaseSettings({
      trackClosedDate: true,
      trackStartedDate: true,
    });
    mockPlugin = {
      app: mockApp,
      settings,
    };
    taskWriter = new TaskWriter(mockPlugin, createTestKeywordManager(settings));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const makeTask = (overrides: Partial<Task> = {}): Task =>
    createCheckboxTask({
      path: 'test.md',
      line: 0,
      rawText: 'TODO Task text',
      text: 'Task text',
      state: 'TODO',
      ...overrides,
    });

  test('CLOSED inserted after the last date line starts its own line (file ends at the date block)', async () => {
    await taskWriter.updateTaskClosedDate(
      makeTask(),
      new Date(2026, 0, 16, 10, 0),
    );

    expect(lines).toHaveLength(3);
    expect(lines[2]).toMatch(/^CLOSED: \[2026-01-16 Fri 10:00\]$/);
    expect(lines[1]).toBe('SCHEDULED: <2026-01-20 Tue>');
  });

  test('STARTED inserted into a task with no date lines starts its own line (file ends at the task)', async () => {
    lines = ['TODO Task text'];

    await taskWriter.updateTaskStartedDate(
      makeTask(),
      new Date(2026, 0, 16, 9, 30),
    );

    expect(lines).toHaveLength(2);
    expect(lines[1]).toMatch(/^STARTED: \[2026-01-16 Fri 09:30\]$/);
    expect(lines[0]).toBe('TODO Task text');
  });

  test('SCHEDULED added by updateTaskScheduledDate starts its own line (file ends at the task)', async () => {
    lines = ['TODO Task text'];

    await taskWriter.updateTaskScheduledDate(makeTask(), new Date(2026, 0, 20));

    expect(lines).toHaveLength(2);
    expect(lines[1]).toMatch(/^SCHEDULED: <2026-01-20/);
    expect(lines[0]).toBe('TODO Task text');
  });

  test('DEADLINE added by updateTaskDeadlineDate starts its own line (file ends at the date block)', async () => {
    await taskWriter.updateTaskDeadlineDate(makeTask(), new Date(2026, 0, 21));

    expect(lines).toHaveLength(3);
    expect(lines[2]).toMatch(/^DEADLINE: <2026-01-21/);
    expect(lines[1]).toBe('SCHEDULED: <2026-01-20 Tue>');
  });

  test('sanity: mid-document insert keeps the classic placement (SCHEDULED before an existing DEADLINE)', async () => {
    lines = ['TODO Task text', 'DEADLINE: <2026-01-21 Wed>'];

    await taskWriter.updateTaskScheduledDate(makeTask(), new Date(2026, 0, 20));

    expect(lines).toHaveLength(3);
    expect(lines[1]).toMatch(/^SCHEDULED: <2026-01-20/);
    expect(lines[2]).toBe('DEADLINE: <2026-01-21 Wed>');
  });
});
