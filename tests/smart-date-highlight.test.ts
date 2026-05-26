/**
 * @jest-environment jsdom
 */

import { buildSmartDateDecorations } from '../src/view/editor-extensions/smart-date-extension';
import { createBaseSettings } from './helpers/test-helper';

describe('buildSmartDateDecorations', () => {
  const referenceDate = new Date(2026, 4, 18, 12, 0, 0);

  function buildMockView(opts: {
    lines: string[];
    cursorLine: number;
    cursorCol?: number;
  }): any {
    const { lines, cursorLine, cursorCol = 0 } = opts;
    let offset = 0;
    const lineObjs = lines.map((text, i) => {
      const from = offset;
      const to = offset + text.length;
      offset = to + 1; // +1 for newline
      return { text, number: i + 1, from, to };
    });

    const totalLen = offset === 0 ? 0 : offset - 1;
    const cursorPos =
      cursorLine > 0 && cursorLine <= lineObjs.length
        ? lineObjs[cursorLine - 1].from + cursorCol
        : totalLen;

    return {
      state: {
        selection: {
          main: { head: cursorPos, from: cursorPos, to: cursorPos },
        },
        doc: {
          lineAt: jest.fn((pos: number) => {
            for (let i = lineObjs.length - 1; i >= 0; i--) {
              if (lineObjs[i].from <= pos) return lineObjs[i];
            }
            return lineObjs[0];
          }),
        },
      },
    };
  }

  function collectDecorations(
    decorations: any,
  ): Array<{ from: number; to: number; class?: string }> {
    const ranges: Array<{ from: number; to: number; class?: string }> = [];
    decorations.between(0, 10000, (from: number, to: number, value: any) => {
      ranges.push({
        from,
        to,
        class: value?.spec?.class ?? value?.value?.spec?.class,
      });
    });
    return ranges;
  }

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(referenceDate);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns no decorations when smart date recognition is disabled', () => {
    const view = buildMockView({ lines: ['TODO task today'], cursorLine: 1 });
    const settings = createBaseSettings({ enableSmartDateRecognition: false });
    const decorations = buildSmartDateDecorations(
      view,
      settings,
      () => ({ isTaskLine: () => true }) as any,
    );
    const ranges = collectDecorations(decorations);
    expect(ranges).toHaveLength(0);
  });

  it('returns no decorations when parser is null', () => {
    const view = buildMockView({ lines: ['TODO task today'], cursorLine: 1 });
    const settings = createBaseSettings({ enableSmartDateRecognition: true });
    const decorations = buildSmartDateDecorations(view, settings, () => null);
    const ranges = collectDecorations(decorations);
    expect(ranges).toHaveLength(0);
  });

  it('returns no decorations on a non-task line', () => {
    const view = buildMockView({
      lines: ['Regular text today'],
      cursorLine: 1,
    });
    const settings = createBaseSettings({ enableSmartDateRecognition: true });
    const decorations = buildSmartDateDecorations(
      view,
      settings,
      () => ({ isTaskLine: () => false }) as any,
    );
    const ranges = collectDecorations(decorations);
    expect(ranges).toHaveLength(0);
  });

  it('returns no decoration when inline structured dates are already present', () => {
    const view = buildMockView({
      lines: ['TODO task today SCHEDULED: <2026-05-25>'],
      cursorLine: 1,
    });
    const settings = createBaseSettings({ enableSmartDateRecognition: true });
    const decorations = buildSmartDateDecorations(
      view,
      settings,
      () => ({ isTaskLine: () => true }) as any,
    );
    const ranges = collectDecorations(decorations);
    expect(ranges).toHaveLength(0);
  });

  it('creates a decoration for "today" on a task line', () => {
    const view = buildMockView({ lines: ['TODO task today'], cursorLine: 1 });
    const settings = createBaseSettings({ enableSmartDateRecognition: true });
    const decorations = buildSmartDateDecorations(
      view,
      settings,
      () => ({ isTaskLine: () => true }) as any,
    );
    const ranges = collectDecorations(decorations);
    expect(ranges).toHaveLength(1);
    expect(ranges[0].from).toBe(10); // "today" starts at index 10 in "TODO task today"
    expect(ranges[0].to).toBe(15);
    expect(ranges[0].class).toContain('todoseq-smart-date-highlight');
  });

  it('creates a decoration for "tomorrow" on a task line', () => {
    const view = buildMockView({
      lines: ['TODO Call John tomorrow'],
      cursorLine: 1,
    });
    const settings = createBaseSettings({ enableSmartDateRecognition: true });
    const decorations = buildSmartDateDecorations(
      view,
      settings,
      () => ({ isTaskLine: () => true }) as any,
    );
    const ranges = collectDecorations(decorations);
    expect(ranges).toHaveLength(1);
    expect(ranges[0].from).toBe(15); // "tomorrow" starts at index 15
    expect(ranges[0].to).toBe(23);
  });

  it('creates a decoration for "every Friday" on a task line', () => {
    const view = buildMockView({
      lines: ['TODO review every Friday'],
      cursorLine: 1,
    });
    const settings = createBaseSettings({ enableSmartDateRecognition: true });
    const decorations = buildSmartDateDecorations(
      view,
      settings,
      () => ({ isTaskLine: () => true }) as any,
    );
    const ranges = collectDecorations(decorations);
    expect(ranges).toHaveLength(1);
    expect(ranges[0].from).toBe(12); // "every Friday" starts at index 12
    expect(ranges[0].to).toBe(24);
  });

  it('highlights the full date expression including time ("at 4:00pm")', () => {
    const view = buildMockView({
      lines: ['TODO test 3 on Wednesday at 4:00pm'],
      cursorLine: 1,
    });
    const settings = createBaseSettings({ enableSmartDateRecognition: true });
    const decorations = buildSmartDateDecorations(
      view,
      settings,
      () => ({ isTaskLine: () => true }) as any,
    );
    const ranges = collectDecorations(decorations);
    expect(ranges).toHaveLength(1);
    // "on Wednesday at 4:00pm" starts at index 12, length 22
    expect(ranges[0].from).toBe(12);
    expect(ranges[0].to).toBe(34);
    expect(ranges[0].class).toContain('todoseq-smart-date-highlight');
  });

  it('returns no decoration when no date is present', () => {
    const view = buildMockView({
      lines: ['TODO task without dates'],
      cursorLine: 1,
    });
    const settings = createBaseSettings({ enableSmartDateRecognition: true });
    const decorations = buildSmartDateDecorations(
      view,
      settings,
      () => ({ isTaskLine: () => true }) as any,
    );
    const ranges = collectDecorations(decorations);
    expect(ranges).toHaveLength(0);
  });

  it('returns no decoration when typing breaks the match', () => {
    const view = buildMockView({
      lines: ['TODO task todayXXX'],
      cursorLine: 1,
    });
    const settings = createBaseSettings({ enableSmartDateRecognition: true });
    const decorations = buildSmartDateDecorations(
      view,
      settings,
      () => ({ isTaskLine: () => true }) as any,
    );
    const ranges = collectDecorations(decorations);
    expect(ranges).toHaveLength(0);
  });

  it('highlights only on the cursor line, not other task lines', () => {
    const view = buildMockView({
      lines: ['TODO first task tomorrow', 'TODO second task today'],
      cursorLine: 1, // cursor on first line
    });
    const settings = createBaseSettings({ enableSmartDateRecognition: true });
    const decorations = buildSmartDateDecorations(
      view,
      settings,
      () => ({ isTaskLine: () => true }) as any,
    );
    const ranges = collectDecorations(decorations);
    expect(ranges).toHaveLength(1);
    expect(ranges[0].from).toBe(16); // "tomorrow" on line 1
  });

  it('switches highlight when cursor moves to another line with a date', () => {
    const view = buildMockView({
      lines: ['TODO first task tomorrow', 'TODO second task today'],
      cursorLine: 2,
    });
    const settings = createBaseSettings({ enableSmartDateRecognition: true });
    const decorations = buildSmartDateDecorations(
      view,
      settings,
      () => ({ isTaskLine: () => true }) as any,
    );
    const ranges = collectDecorations(decorations);
    expect(ranges).toHaveLength(1);
    // line 1 length = 24, +1 newline = 25 offset; "today" starts at index 17 on line 2
    expect(ranges[0].from).toBe(25 + 17); // 42
    expect(ranges[0].to).toBe(42 + 5); // 47
  });

  it('skips highlighting when the parser cannot isolate the date expression', () => {
    // When the NLP parser returns matchedText that covers most of the line,
    // it failed to separate eventTitle from the date — highlighting the
    // entire line is useless noise, so we skip.
    const view = buildMockView({
      lines: ['TODO today task about today'],
      cursorLine: 1,
    });
    const settings = createBaseSettings({ enableSmartDateRecognition: true });
    const decorations = buildSmartDateDecorations(
      view,
      settings,
      () => ({ isTaskLine: () => true }) as any,
    );
    const ranges = collectDecorations(decorations);
    expect(ranges).toHaveLength(0);
  });

  it('includes correct aria-label and data attribute', () => {
    const view = buildMockView({ lines: ['TODO task today'], cursorLine: 1 });
    const settings = createBaseSettings({ enableSmartDateRecognition: true });
    const decorations = buildSmartDateDecorations(
      view,
      settings,
      () => ({ isTaskLine: () => true }) as any,
    );
    const ranges: Array<{ from: number; to: number; value: any }> = [];
    decorations.between(0, 10000, (from: number, to: number, value: any) => {
      ranges.push({ from, to, value });
    });
    expect(ranges[0].value.spec.attributes['data-smart-date-match']).toBe(
      'true',
    );
    expect(ranges[0].value.spec.attributes['aria-label']).toBe(
      'Natural date: today',
    );
  });
});
