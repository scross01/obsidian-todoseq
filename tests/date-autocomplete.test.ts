/**
 * Tests for src/view/editor-extensions/date-autocomplete.ts
 */

import {
  DateAutocompleteExtension,
  dateAutocompleteExtension,
} from '../src/view/editor-extensions/date-autocomplete';
import { createBaseSettings } from './helpers/test-helper';

function createMockView(
  docLines: string[],
  cursorLine: number,
  cursorChar: number,
) {
  const offsets: number[] = [];
  let offset = 0;
  for (let i = 0; i < docLines.length; i++) {
    offsets.push(offset);
    offset += docLines[i].length + 1;
  }

  const cursorPos = offsets[cursorLine] + cursorChar;
  const dispatch = jest.fn();

  return {
    state: {
      selection: { main: { head: cursorPos } },
      doc: {
        lineAt: (pos: number) => {
          for (let i = docLines.length - 1; i >= 0; i--) {
            if (pos >= offsets[i]) {
              return { text: docLines[i], from: offsets[i], number: i + 1 };
            }
          }
          return { text: docLines[0], from: 0, number: 1 };
        },
        line: (n: number) => ({
          text: docLines[n - 1],
          from: offsets[n - 1],
          number: n,
        }),
      },
    },
    dispatch,
  };
}

function todayDateString(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

describe('DateAutocompleteExtension', () => {
  let settings = createBaseSettings();

  beforeEach(() => {
    settings = createBaseSettings();
  });

  describe('createExtension', () => {
    it('returns an extension object', () => {
      const ext = new DateAutocompleteExtension(settings);
      const result = ext.createExtension();
      expect(result).toBeDefined();
    });
  });

  describe('getCurrentDateString', () => {
    it('returns date in YYYY-MM-DD format', () => {
      const ext = new DateAutocompleteExtension(settings) as any;
      const dateStr = ext.getCurrentDateString();

      expect(dateStr).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('returns today date', () => {
      const ext = new DateAutocompleteExtension(settings) as any;
      const dateStr = ext.getCurrentDateString();
      const now = new Date();

      const expected = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      expect(dateStr).toBe(expected);
    });
  });

  describe('checkKeywordPosition', () => {
    it('returns true for SCHEDULED at start of line', () => {
      const ext = new DateAutocompleteExtension(settings) as any;
      const result = ext.checkKeywordPosition('SCHEDULED', 9);
      expect(result).toBe(true);
    });

    it('returns true for DEADLINE at start of line', () => {
      const ext = new DateAutocompleteExtension(settings) as any;
      const result = ext.checkKeywordPosition('DEADLINE', 8);
      expect(result).toBe(true);
    });

    it('returns true after list marker', () => {
      const ext = new DateAutocompleteExtension(settings) as any;
      const result = ext.checkKeywordPosition('- SCHEDULED', 11);
      expect(result).toBe(true);
    });

    it('returns true after asterisk list marker', () => {
      const ext = new DateAutocompleteExtension(settings) as any;
      const result = ext.checkKeywordPosition('* SCHEDULED', 11);
      expect(result).toBe(true);
    });

    it('returns true after plus list marker', () => {
      const ext = new DateAutocompleteExtension(settings) as any;
      const result = ext.checkKeywordPosition('+ DEADLINE', 10);
      expect(result).toBe(true);
    });

    it('returns true with leading whitespace', () => {
      const ext = new DateAutocompleteExtension(settings) as any;
      const result = ext.checkKeywordPosition('  SCHEDULED', 11);
      expect(result).toBe(true);
    });

    it('returns false when keyword is not at line start', () => {
      const ext = new DateAutocompleteExtension(settings) as any;
      const result = ext.checkKeywordPosition('Some text SCHEDULED', 19);
      expect(result).toBe(false);
    });

    it('returns false when no keyword match', () => {
      const ext = new DateAutocompleteExtension(settings) as any;
      const result = ext.checkKeywordPosition('Some random text', 10);
      expect(result).toBe(false);
    });

    it('returns false for incomplete keyword', () => {
      const ext = new DateAutocompleteExtension(settings) as any;
      const result = ext.checkKeywordPosition('SCHED', 5);
      expect(result).toBe(false);
    });
  });

  describe('checkLineContext', () => {
    it('returns false for first line', () => {
      const ext = new DateAutocompleteExtension(settings) as any;
      const mockView = createMockView(['SCHEDULED'], 0, 9);
      const result = ext.checkLineContext(mockView as any, 1);
      expect(result).toBe(false);
    });

    it('returns true when previous line is a TODO task', () => {
      const ext = new DateAutocompleteExtension(settings) as any;
      const mockView = createMockView(['TODO my task', 'SCHEDULED'], 1, 9);
      const result = ext.checkLineContext(mockView as any, 2);
      expect(result).toBe(true);
    });

    it('returns true when previous line is a DOING task', () => {
      const ext = new DateAutocompleteExtension(settings) as any;
      const mockView = createMockView(['DOING my task', 'SCHEDULED'], 1, 9);
      const result = ext.checkLineContext(mockView as any, 2);
      expect(result).toBe(true);
    });

    it('returns true when previous line is a DONE task', () => {
      const ext = new DateAutocompleteExtension(settings) as any;
      const mockView = createMockView(['DONE my task', 'SCHEDULED'], 1, 9);
      const result = ext.checkLineContext(mockView as any, 2);
      expect(result).toBe(true);
    });

    it('returns true when previous line is a CANCELLED task', () => {
      const ext = new DateAutocompleteExtension(settings) as any;
      const mockView = createMockView(['CANCELLED my task', 'DEADLINE'], 1, 8);
      const result = ext.checkLineContext(mockView as any, 2);
      expect(result).toBe(true);
    });

    it('returns true when previous line is a CANCELED task', () => {
      const ext = new DateAutocompleteExtension(settings) as any;
      const mockView = createMockView(['CANCELED my task', 'DEADLINE'], 1, 8);
      const result = ext.checkLineContext(mockView as any, 2);
      expect(result).toBe(true);
    });

    it('returns true when previous line contains tab-indented task keyword', () => {
      const ext = new DateAutocompleteExtension(settings) as any;
      const mockView = createMockView(['-\tTODO my task', 'SCHEDULED'], 1, 9);
      const result = ext.checkLineContext(mockView as any, 2);
      expect(result).toBe(true);
    });

    it('returns true when previous line contains space-separated task keyword', () => {
      const ext = new DateAutocompleteExtension(settings) as any;
      const mockView = createMockView(['- TODO my task', 'SCHEDULED'], 1, 9);
      const result = ext.checkLineContext(mockView as any, 2);
      expect(result).toBe(true);
    });

    it('returns false when previous line is not a task or date line', () => {
      const ext = new DateAutocompleteExtension(settings) as any;
      const mockView = createMockView(['Regular note text', 'SCHEDULED'], 1, 9);
      const result = ext.checkLineContext(mockView as any, 2);
      expect(result).toBe(false);
    });

    it('returns true when previous line is SCHEDULED date line and line before is task', () => {
      const ext = new DateAutocompleteExtension(settings) as any;
      const mockView = createMockView(
        ['TODO my task', 'SCHEDULED: <2026-01-01>', 'DEADLINE'],
        2,
        8,
      );
      const result = ext.checkLineContext(mockView as any, 3);
      expect(result).toBe(true);
    });

    it('returns true when previous line is DEADLINE date line and line before is task', () => {
      const ext = new DateAutocompleteExtension(settings) as any;
      const mockView = createMockView(
        ['TODO my task', 'DEADLINE: <2026-01-01>', 'SCHEDULED'],
        2,
        9,
      );
      const result = ext.checkLineContext(mockView as any, 3);
      expect(result).toBe(true);
    });

    it('returns false when all previous lines are empty', () => {
      const ext = new DateAutocompleteExtension(settings) as any;
      const mockView = createMockView(['', 'SCHEDULED'], 1, 9);
      const result = ext.checkLineContext(mockView as any, 2);
      expect(result).toBe(false);
    });

    it('returns false when date line is followed by non-task line before task', () => {
      const ext = new DateAutocompleteExtension(settings) as any;
      const mockView = createMockView(
        ['Regular text', 'SCHEDULED: <2026-01-01>', 'DEADLINE'],
        2,
        8,
      );
      const result = ext.checkLineContext(mockView as any, 3);
      expect(result).toBe(false);
    });
  });

  describe('handleColonTyping', () => {
    it('returns false when formatTaskKeywords is disabled', () => {
      settings.formatTaskKeywords = false;
      const ext = new DateAutocompleteExtension(settings) as any;
      const mockView = createMockView(['TODO task', 'SCHEDULED'], 1, 9);
      const result = ext.handleColonTyping(mockView as any);
      expect(result).toBe(false);
      expect(mockView.dispatch).not.toHaveBeenCalled();
    });

    it('returns false when cursor is not after SCHEDULED or DEADLINE', () => {
      const ext = new DateAutocompleteExtension(settings) as any;
      const mockView = createMockView(['TODO task', 'some text'], 1, 9);
      const result = ext.handleColonTyping(mockView as any);
      expect(result).toBe(false);
      expect(mockView.dispatch).not.toHaveBeenCalled();
    });

    it('returns false when keyword is at invalid position', () => {
      const ext = new DateAutocompleteExtension(settings) as any;
      const mockView = createMockView(['TODO task', 'prefix SCHEDULED'], 1, 16);
      const result = ext.handleColonTyping(mockView as any);
      expect(result).toBe(false);
      expect(mockView.dispatch).not.toHaveBeenCalled();
    });

    it('returns false when line context is invalid', () => {
      const ext = new DateAutocompleteExtension(settings) as any;
      const mockView = createMockView(['Regular note', 'SCHEDULED'], 1, 9);
      const result = ext.handleColonTyping(mockView as any);
      expect(result).toBe(false);
      expect(mockView.dispatch).not.toHaveBeenCalled();
    });

    it('inserts date after SCHEDULED on line following task', () => {
      const ext = new DateAutocompleteExtension(settings) as any;
      const mockView = createMockView(['TODO task', 'SCHEDULED'], 1, 9);
      const cursorPos = mockView.state.selection.main.head;
      const result = ext.handleColonTyping(mockView as any);

      expect(result).toBe(true);
      expect(mockView.dispatch).toHaveBeenCalledTimes(1);

      const dispatchArg = mockView.dispatch.mock.calls[0][0];
      const expectedDate = todayDateString();
      expect(dispatchArg.changes.from).toBe(cursorPos);
      expect(dispatchArg.changes.to).toBe(cursorPos);
      expect(dispatchArg.changes.insert).toBe(`: <${expectedDate}>`);
    });

    it('selects the date portion in the dispatch', () => {
      const ext = new DateAutocompleteExtension(settings) as any;
      const mockView = createMockView(['TODO task', 'SCHEDULED'], 1, 9);
      const cursorPos = mockView.state.selection.main.head;
      ext.handleColonTyping(mockView as any);

      const dispatchArg = mockView.dispatch.mock.calls[0][0];
      const dateText = `: <${todayDateString()}>`;
      expect(dispatchArg.selection.anchor).toBe(cursorPos + 3);
      expect(dispatchArg.selection.head).toBe(cursorPos + dateText.length - 1);
    });

    it('inserts date after DEADLINE on line following task', () => {
      const ext = new DateAutocompleteExtension(settings) as any;
      const mockView = createMockView(['TODO task', 'DEADLINE'], 1, 8);
      const cursorPos = mockView.state.selection.main.head;
      const result = ext.handleColonTyping(mockView as any);

      expect(result).toBe(true);
      const dispatchArg = mockView.dispatch.mock.calls[0][0];
      expect(dispatchArg.changes.insert).toBe(`: <${todayDateString()}>`);
    });

    it('inserts date for indented keyword after list marker', () => {
      const ext = new DateAutocompleteExtension(settings) as any;
      const mockView = createMockView(['TODO task', '- SCHEDULED'], 1, 11);
      const result = ext.handleColonTyping(mockView as any);

      expect(result).toBe(true);
      expect(mockView.dispatch).toHaveBeenCalledTimes(1);
    });

    it('inserts date when following SCHEDULED date line after task', () => {
      const ext = new DateAutocompleteExtension(settings) as any;
      const mockView = createMockView(
        ['TODO task', 'SCHEDULED: <2026-01-01>', 'DEADLINE'],
        2,
        8,
      );
      const result = ext.handleColonTyping(mockView as any);

      expect(result).toBe(true);
      expect(mockView.dispatch).toHaveBeenCalledTimes(1);
    });
  });

  describe('dateAutocompleteExtension factory', () => {
    it('returns a defined extension', () => {
      const result = dateAutocompleteExtension(settings);
      expect(result).toBeDefined();
    });
  });
});
