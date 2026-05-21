import {
  SmartDateProcessor,
  InlineDateInfo,
} from '../src/services/smart-date-processor';
import TodoTracker from '../src/main';
import {
  createBaseSettings,
  createTestKeywordManager,
  createBaseTask,
} from './helpers/test-helper';

type MockApp = {
  workspace: {
    getActiveViewOfType: jest.Mock;
  };
  vault: {
    process: jest.Mock;
  };
};

function createMockPlugin(): jest.Mocked<TodoTracker> {
  const settings = createBaseSettings({
    enableSmartDateRecognition: true,
    smartDateParseDelay: 1500,
    smartDateRemoveKeywords: true,
  });

  const keywordManager = createTestKeywordManager(settings);

  const app = {
    workspace: {
      getActiveViewOfType: jest.fn(),
    },
    vault: {
      process: jest.fn(),
    },
  } as unknown as MockApp;

  return {
    app,
    settings,
    keywordManager,
    getVaultScanner: jest.fn().mockReturnValue(null),
  } as unknown as jest.Mocked<TodoTracker>;
}

// Reusable mock view that supports debounce round-trip checks.  The doc
// structure is built from a plain string array so every call to
// `view.state.doc.line(n)` returns a fresh line object whose number, text,
// and offsets reflect the array at the time of the call (no stale snapshots).
function makeDebounceMockView(
  lines: string[],
  initialCursorLine: number = 1,
): Record<string, unknown> {
  // Each entry is a jest.fn so the same function address is reused on every
  // `dispatch()` call, allowing jest.mock tracking across re-reads.
  const lineFns = lines.map((text) =>
    jest.fn(() => ({
      text,
      number: lines.indexOf(text) + 1,
      from: 0,
      to: text.length,
    })),
  );

  // Cumulative char offsets per line so lineAt(pos) can map a doc position
  // back to the right line, even for empty string lines.
  const lineOffsets = lines.map((_, i) =>
    lines.slice(0, i).reduce((s, l) => s + l.length + 1, 0),
  );

  return {
    state: {
      selection: { main: { head: initialCursorLine } },
      doc: {
        lines: lines.length,
        lineAt: jest.fn().mockImplementation((pos: number) => {
          // Scan from highest offset first so multi-byte/empty lines work.
          for (let i = lineOffsets.length - 1; i >= 0; i--) {
            if (lineOffsets[i] <= pos) return lineFns[i]();
          }
          return lineFns[0]();
        }),
        line: jest.fn((n: number) => {
          const i = n - 1;
          return lineFns[i] ? lineFns[i]() : lineFns[0]();
        }),
      },
    },
    dispatch: jest.fn(),
  };
}

describe('SmartDateProcessor', () => {
  let mockPlugin: jest.Mocked<TodoTracker>;
  let processor: SmartDateProcessor;

  beforeEach(() => {
    mockPlugin = createMockPlugin();
    processor = new SmartDateProcessor(mockPlugin);
  });

  describe('Configuration', () => {
    it('should enable/disable processing', () => {
      processor.setEnabled(false);
      expect(processor['enabled']).toBe(false);

      processor.setEnabled(true);
      expect(processor['enabled']).toBe(true);
    });

    it('should clear timers when disabled', () => {
      processor.setEnabled(true);
      processor.setEnabled(false);
      expect(processor['debounceTimers'].size).toBe(0);
    });

    it('should set parse delay', () => {
      processor.setParseDelay(2000);
      expect(processor['parseDelay']).toBe(2000);
    });
  });

  describe('Inline date extraction', () => {
    it('should extract SCHEDULED date from inline text', () => {
      const dates = processor.extractInlineDates(
        'TODO test SCHEDULED: <2026-08-11 Tue>',
      );
      expect(dates).toHaveLength(1);
      expect(dates[0].type).toBe('SCHEDULED');
      expect(dates[0].dateStr).toBe('<2026-08-11 Tue>');
    });

    it('should extract DEADLINE date from inline text', () => {
      const dates = processor.extractInlineDates(
        'TODO test DEADLINE: <2026-08-11 Tue>',
      );
      expect(dates).toHaveLength(1);
      expect(dates[0].type).toBe('DEADLINE');
      expect(dates[0].dateStr).toBe('<2026-08-11 Tue>');
    });

    it('should extract both SCHEDULED and DEADLINE from inline text', () => {
      const dates = processor.extractInlineDates(
        'TODO test SCHEDULED: <2026-08-11 Tue> DEADLINE: <2026-08-15 Sat>',
      );
      expect(dates).toHaveLength(2);
      expect(dates[0].type).toBe('SCHEDULED');
      expect(dates[0].dateStr).toBe('<2026-08-11 Tue>');
      expect(dates[1].type).toBe('DEADLINE');
      expect(dates[1].dateStr).toBe('<2026-08-15 Sat>');
    });

    it('should NOT extract CLOSED date (not supported on task line)', () => {
      const dates = processor.extractInlineDates(
        'TODO test CLOSED: <2026-08-11 Tue>',
      );
      expect(dates).toHaveLength(0);
    });

    it('should return empty array for text without inline dates', () => {
      const dates = processor.extractInlineDates('TODO test task');
      expect(dates).toHaveLength(0);
    });
  });

  describe('Inline date removal from text', () => {
    it('should remove SCHEDULED from inline text', () => {
      const dates: InlineDateInfo[] = [
        { type: 'SCHEDULED', dateStr: '<2026-08-11 Tue>' },
      ];
      const result = processor.removeInlineDatesFromText(
        'TODO test SCHEDULED: <2026-08-11 Tue>',
        dates,
      );
      expect(result).toBe('TODO test');
    });

    it('should remove DEADLINE from inline text', () => {
      const dates: InlineDateInfo[] = [
        { type: 'DEADLINE', dateStr: '<2026-08-15 Sat>' },
      ];
      const result = processor.removeInlineDatesFromText(
        'TODO test DEADLINE: <2026-08-15 Sat>',
        dates,
      );
      expect(result).toBe('TODO test');
    });

    it('should remove both SCHEDULED and DEADLINE from inline text', () => {
      const dates: InlineDateInfo[] = [
        { type: 'SCHEDULED', dateStr: '<2026-08-11 Tue>' },
        { type: 'DEADLINE', dateStr: '<2026-08-15 Sat>' },
      ];
      const result = processor.removeInlineDatesFromText(
        'TODO test SCHEDULED: <2026-08-11 Tue> DEADLINE: <2026-08-15 Sat>',
        dates,
      );
      expect(result).toBe('TODO test');
    });

    it('should clean up double spaces left after removal', () => {
      const dates: InlineDateInfo[] = [
        { type: 'SCHEDULED', dateStr: '<2026-08-11 Tue>' },
      ];
      const result = processor.removeInlineDatesFromText(
        'TODO test  SCHEDULED: <2026-08-11 Tue>',
        dates,
      );
      expect(result).toBe('TODO test');
    });

    it('should trim trailing whitespace after removal', () => {
      const dates: InlineDateInfo[] = [
        { type: 'SCHEDULED', dateStr: '<2026-08-11 Tue>' },
      ];
      const result = processor.removeInlineDatesFromText(
        'TODO test SCHEDULED: <2026-08-11 Tue> ',
        dates,
      );
      expect(result).toBe('TODO test');
    });
  });

  describe('Inline date detection', () => {
    it('should detect SCHEDULED inline on task line', () => {
      const result = processor['hasInlineStructuredDates'](
        'TODO test SCHEDULED: <2026-08-11>',
      );
      expect(result).toBe(true);
    });

    it('should detect DEADLINE inline on task line', () => {
      const result = processor['hasInlineStructuredDates'](
        'TODO test DEADLINE: <2026-08-11>',
      );
      expect(result).toBe(true);
    });

    it('should NOT detect standalone date lines (SCHEDULED at start)', () => {
      const result = processor['hasInlineStructuredDates'](
        '  SCHEDULED: <2026-08-11>',
      );
      expect(result).toBe(false);
    });

    it('should NOT detect standalone date lines (DEADLINE at start)', () => {
      const result = processor['hasInlineStructuredDates'](
        'DEADLINE: <2026-08-11>',
      );
      expect(result).toBe(false);
    });

    it('should not detect dates in regular task text', () => {
      const result =
        processor['hasInlineStructuredDates']('TODO task tomorrow');
      expect(result).toBe(false);
    });
  });

  describe('Date line detection', () => {
    it('should identify standalone SCHEDULED line as a date line', () => {
      expect(processor['isDateLine']('  SCHEDULED: <2026-05-18 Mon>')).toBe(
        true,
      );
    });

    it('should identify standalone DEADLINE line as a date line', () => {
      expect(processor['isDateLine']('  DEADLINE: <2026-05-18 Mon>')).toBe(
        true,
      );
    });

    it('should identify standalone CLOSED line as a date line', () => {
      expect(processor['isDateLine']('  CLOSED: [2026-05-18 Mon]')).toBe(true);
    });

    it('should not identify task line as a date line', () => {
      expect(processor['isDateLine']('TODO task tomorrow')).toBe(false);
    });

    it('should not identify inline date on task line as a date line', () => {
      expect(processor['isDateLine']('TODO task SCHEDULED: <2026-05-18>')).toBe(
        false,
      );
    });
  });

  describe('Date type detection', () => {
    it('should detect DEADLINE from "due" keyword', () => {
      const dateType = processor['detectDateType']('TODO project due tomorrow');
      expect(dateType).toBe('DEADLINE');
    });

    it('should detect DEADLINE from "deadline" keyword', () => {
      const dateType = processor['detectDateType'](
        'TODO project deadline Friday',
      );
      expect(dateType).toBe('DEADLINE');
    });

    it('should default to SCHEDULED for unknown keywords', () => {
      const dateType = processor['detectDateType']('TODO Call John tomorrow');
      expect(dateType).toBe('SCHEDULED');
    });

    it('should default to SCHEDULED for meeting', () => {
      const dateType = processor['detectDateType']('TODO Meeting on Monday');
      expect(dateType).toBe('SCHEDULED');
    });
  });

  describe('Cleanup', () => {
    it('should clear all timers on destroy', () => {
      processor.destroy();
      expect(processor['debounceTimers'].size).toBe(0);
      expect(processor['lastProcessedLines'].size).toBe(0);
      expect(processor['isProcessing'].size).toBe(0);
    });
  });

  describe('Process line - cursor check', () => {
    it('should skip processing when cursor is still on the same line', async () => {
      const mockView = {
        state: {
          selection: { main: { head: 20 } },
          doc: {
            lineAt: jest.fn().mockReturnValue({
              number: 1,
              text: 'TODO task today',
              from: 0,
            }),
            lines: 5,
          },
        },
      } as any;

      (mockPlugin.getVaultScanner as jest.Mock).mockReturnValue({
        getParser: jest.fn().mockReturnValue({
          isTaskLine: jest.fn().mockReturnValue(true),
          parseLineAsTask: jest.fn().mockReturnValue(null),
          getDateLineType: jest.fn().mockReturnValue(null),
        }),
      });

      await processor.processLine('test.md', 1, 'TODO task today', mockView);
      expect(mockPlugin.app.vault.process).not.toHaveBeenCalled();
    });

    it('should skip cursor check when skipCursorCheck is true', async () => {
      const parseLineAsTask = jest.fn().mockReturnValue(null);
      (mockPlugin.getVaultScanner as jest.Mock).mockReturnValue({
        getParser: jest.fn().mockReturnValue({
          isTaskLine: jest.fn().mockReturnValue(true),
          parseLineAsTask,
          getDateLineType: jest.fn().mockReturnValue(null),
        }),
      });

      const mockView = {
        state: {
          selection: { main: { head: 20 } },
          doc: {
            lineAt: jest.fn().mockReturnValue({
              number: 1,
              text: 'TODO task today',
              from: 0,
            }),
            lines: 5,
          },
        },
      } as any;

      await processor.processLine(
        'test.md',
        1,
        'TODO task today',
        mockView,
        true,
      );
      expect(parseLineAsTask).toHaveBeenCalled();
    });
  });

  describe('Process line - full natural language date conversion', () => {
    it('should convert Monday to SCHEDULED date line when cursor leaves the task line (handleCursorLeave path)', async () => {
      // Bug regression test:
      // 1. User types "TODO test Monday" on line 1
      // 2. Vault scan populates task list (isProcessing is false when user moves cursor)
      // 3. User moves cursor away -> handleCursorLeave -> processLine(skipCursorCheck=true)
      // Expected: Monday is resolved to the next Monday, inserted as SCHEDULED: <YYYY-MM-DD Mon>
      const filePath = 'test.md';
      const lineNumber = 1;
      const lineText = 'TODO test Monday';

      (mockPlugin.getVaultScanner as jest.Mock).mockReturnValue({
        getParser: jest.fn().mockReturnValue({
          isTaskLine: jest.fn().mockReturnValue(true),
          getDateLineType: jest.fn().mockReturnValue(null),
          parseLineAsTask: jest.fn().mockReturnValue(
            createBaseTask({
              path: filePath,
              line: 0,
              rawText: lineText,
              text: 'test Monday',
              state: 'TODO',
            }),
          ),
        }),
      });

      const dispatchFn = jest.fn();
      const mockView = {
        state: {
          selection: { main: { head: 13 } },
          doc: {
            lines: 3,
            lineAt: jest.fn().mockReturnValue({
              number: 1,
              text: lineText,
              from: 0,
            }),
            line: jest.fn().mockReturnValue({
              from: 0,
              to: lineText.length,
              text: lineText,
            }),
          },
        },
        dispatch: dispatchFn,
      } as any;

      mockPlugin.app.workspace.getActiveViewOfType.mockReturnValue({
        file: { path: filePath },
        editor: { cm: mockView },
      } as any);

      const result = await processor.processLine(
        filePath,
        lineNumber,
        lineText,
        mockView,
        true,
      );

      // dispatch must be called with a single editor change replacing
      // the original line with "TODO test\nSCHEDULED: <YYYY-MM-DD Mon>"
      expect(dispatchFn).toHaveBeenCalledTimes(1);

      const arg = dispatchFn.mock.calls[0][0];
      expect(arg.changes.from).toBe(0);
      expect(arg.changes.to).toBe(lineText.length);
      const lines = arg.changes.insert.split('\n');
      expect(lines).toHaveLength(2);
      expect(lines[0]).toBe('TODO test');
      expect(lines[1]).toMatch(/^SCHEDULED: <\d{4}-\d{2}-\d{2} Mon>$/);
    });

    it('should not call debounced parser when cursor stays on the same line', async () => {
      // Bug 1: same-line guard fires → debounce callback re-reads cursor
      // at timer-invoke time and skips processing when cursor never moved.
      const filePath = 'test.md';
      const parseLineAsTask = jest.fn().mockReturnValue(null);
      mockPlugin.getVaultScanner.mockReturnValue({
        getParser: jest.fn().mockReturnValue({
          isTaskLine: jest.fn().mockReturnValue(true),
          parseLineAsTask,
          getDateLineType: jest.fn().mockReturnValue(null),
        }),
      });

      const mockView = makeDebounceMockView(['TODO task today', '']);
      mockPlugin.app.workspace.getActiveViewOfType.mockReturnValue({
        file: { path: filePath },
        editor: { cm: mockView },
      } as any);

      (processor as any).processLineWithDebounce(filePath, 1, mockView);
      // Timer fires. Cursor head=1 → mock lineAt returns line 1 → guard blocks.
      jest.advanceTimersByTime(1500);
      await Promise.resolve();

      expect(parseLineAsTask).not.toHaveBeenCalled();
    });

    it('should call processLine when cursor has moved off the task line before timer fired', async () => {
      // Bug 1: cursor moved off → debounce guard passes → processLine called.
      const filePath = 'test.md';
      const lineText = 'TODO task today';
      const parseLineAsTask = jest.fn().mockReturnValue(null);
      mockPlugin.getVaultScanner.mockReturnValue({
        getParser: jest.fn().mockReturnValue({
          isTaskLine: jest.fn().mockReturnValue(true),
          parseLineAsTask,
          getDateLineType: jest.fn().mockReturnValue(null),
        }),
      });

      const mockView = makeDebounceMockView(
        ['TODO task today', '', '', '', ''],
        5,
      );
      mockPlugin.app.workspace.getActiveViewOfType.mockReturnValue({
        file: { path: filePath },
        editor: { cm: mockView },
      } as any);

      (processor as any).processLine(filePath, 1, lineText, mockView, true);
      await Promise.resolve();

      expect(parseLineAsTask).toHaveBeenCalledTimes(1);
    });

    it('processes the debounced call when cursor moved off the line before timer fired', async () => {
      // Bug 1: cursor moved from the target line during the debounce window so
      // the timer's live cursor check passes and processing proceeds.
      const filePath = 'test.md';
      const lineText = 'TODO task today';
      const parseLineAsTask = jest.fn().mockReturnValue(null);
      mockPlugin.getVaultScanner.mockReturnValue({
        getParser: jest.fn().mockReturnValue({
          isTaskLine: jest.fn().mockReturnValue(true),
          parseLineAsTask,
          getDateLineType: jest.fn().mockReturnValue(null),
        }),
      });

      // cursor on line 5 when debounce fires (moved off line 1)
      const mockView = makeDebounceMockView(
        ['TODO task today', '', '', '', ''],
        20, // head past end of line 1 → lineAt(length>=20) fails all except final fallthrough
      );
      mockPlugin.app.workspace.getActiveViewOfType.mockReturnValue({
        file: { path: filePath },
        editor: { cm: mockView },
      } as any);

      // Call processLine directly with skipCursorCheck=true (simulates
      // handleCursorLeave / vault-scanner path). The cursor-check guard
      // is bypassed so the parser IS-call.
      await (processor as any).processLine(
        filePath,
        1,
        lineText,
        mockView,
        true,
      );
      await Promise.resolve();

      // cursor on line 5 at invoke-time for line 1 → processing fires
      expect(parseLineAsTask).toHaveBeenCalledTimes(1);
    });
  });

  describe('SmartDateProcessor – Bug 2: replace existing date lines below task', () => {
    let mockPlugin: jest.Mocked<TodoTracker>;
    let processor: SmartDateProcessor;
    let dispatchChanges: Array<Record<string, unknown>> = [];

    beforeEach(() => {
      mockPlugin = createMockPlugin();
      processor = new SmartDateProcessor(mockPlugin);
      dispatchChanges = [];
    });

    /** Build a document whose lines are driven by a plain string array. */
    function buildView(
      lines: string[],
      cursorLine: number = 3,
      dispatchFn: jest.Mock = jest.fn((...args: unknown[]) => {
        dispatchChanges.push(...(args as Array<Record<string, unknown>>));
      }),
    ): Record<string, unknown> {
      const fns = lines.map((t) =>
        jest.fn(() => ({ text: t, number: 0, from: 0, to: t.length })),
      );
      return {
        state: {
          selection: { main: { head: cursorLine } },
          doc: {
            lines: lines.length,
            lineAt: jest.fn().mockImplementation((pos: number) => {
              for (const fn of fns) {
                const r = fn();
                if (r.text.length >= pos)
                  return { ...r, number: lines.indexOf(r.text) + 1 };
              }
              return { ...fns[0](), number: 1 };
            }),
            line: jest.fn((n: number) => {
              const i = n - 1;
              return i < fns.length
                ? { ...fns[i](), number: i + 1 }
                : { ...fns[0](), number: 1 };
            }),
          },
        },
        dispatch: dispatchFn,
      } as Record<string, unknown>;
    }

    it('replaces an existing SCHEDULED line instead of appending a duplicate', async () => {
      // Bug 2: editing a task that already has a SCHEDULED date line now causes
      // the date parser to re-extract the date and replace the existing line
      // in-place.

      const filePath = 'test.md';
      const taskLineText = 'TODO test 2';
      const existingScheduled = '  SCHEDULED: <2026-05-19 Tue>';
      const updatedTaskText = 'TODO test 2 Saturday';

      mockPlugin.getVaultScanner.mockReturnValue({
        getParser: jest.fn().mockReturnValue({
          isTaskLine: jest.fn().mockReturnValue(true),
          getDateLineType: jest.fn().mockReturnValue(null),
          parseLineAsTask: jest.fn().mockReturnValue(
            createBaseTask({
              path: filePath,
              line: 0,
              rawText: updatedTaskText,
              text: 'test 2 Saturday',
              state: 'TODO',
            }),
          ),
        }),
      });

      const mockView = buildView([
        taskLineText,
        existingScheduled,
        '',
        '',
        '',
        '',
      ]);
      mockPlugin.app.workspace.getActiveViewOfType.mockReturnValue({
        file: { path: filePath },
        editor: { cm: mockView as any },
      } as any);

      // processLine called with skipCursorCheck=true (cursor-leave path)
      await processor.processLine(
        filePath,
        1,
        updatedTaskText,
        mockView as any,
        true,
      );
      await Promise.resolve();

      // CM6 dispatch was called exactly once
      expect(dispatchChanges).toHaveLength(1);

      // The dispatched change replaces the task+existing-scheduled span with new content
      const changeChanges = dispatchChanges[0].changes as {
        from: number;
        to: number;
        insert: string;
      };
      const lines = changeChanges.insert.split('\n');
      expect(lines).toHaveLength(2);
      // getDateLineIndent returns '' for keyword-only tasks (no list marker),
      // so the SCHEDULED/DEADLINE line has no leading indent.
      expect(lines[0]).toContain('TODO test 2');
      expect(lines[1]).toMatch(/^SCHEDULED: <\d{4}-\d{2}-\d{2} \w{3}>$/);
      expect(changeChanges.insert).not.toContain('Saturday'); // natural language removed
    });

    it('findExistingDateLines correctly skips empty lines and stops at non-date lines', () => {
      const filePath = 'test.md';
      const lines = [
        'TODO task',
        '  SCHEDULED: <2026-05-19 Tue>',
        '  DEADLINE: <2026-05-20 Wed>',
        '  CLOSED: [2026-05-18 Mon]',
        'regular text that is not a date line',
      ];
      const mockView = buildView(lines);

      mockPlugin.app.workspace.getActiveViewOfType.mockReturnValue({
        file: { path: filePath },
        editor: { cm: mockView as any },
      } as any);

      const result = (processor as any).findExistingDateLines(
        filePath,
        1,
        mockView as any,
      );
      // SCHEDULED + DEADLINE found; CLOSED not included; regular text stops scan
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ lineNumber: 2, type: 'SCHEDULED' });
      expect(result[1]).toEqual({ lineNumber: 3, type: 'DEADLINE' });
    });

    it('findExistingDateLines returns empty when view file does not match', () => {
      mockPlugin.app.workspace.getActiveViewOfType.mockReturnValue(null);
      const mockView = buildView(['TODO task', '  SCHEDULED: <...>']);
      const result = (processor as any).findExistingDateLines(
        'other.md',
        1,
        mockView as any,
      );
      expect(result).toHaveLength(0);
    });
  });
});
