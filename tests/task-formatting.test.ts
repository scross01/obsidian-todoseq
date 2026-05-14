/**
 * @jest-environment jsdom
 */

import {
  PriorityWidget,
  TaskKeywordDecorator,
} from '../src/view/editor-extensions/task-formatting';
import { createBaseSettings } from './helpers/test-helper';
import { installObsidianDomMocks } from './helpers/obsidian-dom-mock';

describe('PriorityWidget', () => {
  beforeAll(() => {
    installObsidianDomMocks();
  });

  it('creates widget with correct letter and priority', () => {
    const widget = new (PriorityWidget as any)('A', 'high');
    expect(widget.letter).toBe('A');
    expect(widget.priority).toBe('high');
  });

  it('eq returns true for identical widgets', () => {
    const widget1 = new (PriorityWidget as any)('A', 'high');
    const widget2 = new (PriorityWidget as any)('A', 'high');
    expect(widget1.eq(widget2)).toBe(true);
  });

  it('eq returns false for different letters', () => {
    const widget1 = new (PriorityWidget as any)('A', 'high');
    const widget2 = new (PriorityWidget as any)('B', 'high');
    expect(widget1.eq(widget2)).toBe(false);
  });

  it('eq returns false for different priorities', () => {
    const widget1 = new (PriorityWidget as any)('A', 'high');
    const widget2 = new (PriorityWidget as any)('A', 'med');
    expect(widget1.eq(widget2)).toBe(false);
  });

  it('toDOM creates a span element with correct classes', () => {
    const widget = new (PriorityWidget as any)('A', 'high');
    const el = widget.toDOM();

    expect(el.tagName.toLowerCase()).toBe('span');
    expect(el.classList.contains('todoseq-edit-priority-pill')).toBe(true);
    expect(el.classList.contains('todoseq-priority-badge')).toBe(true);
    expect(el.classList.contains('priority-high')).toBe(true);
    expect(el.textContent).toBe('A');
  });

  it('toDOM includes data attributes', () => {
    const widget = new (PriorityWidget as any)('B', 'med');
    const el = widget.toDOM();

    expect(el.getAttribute('data-priority')).toBe('B');
    expect(el.getAttribute('aria-label')).toBe('Priority B');
    expect(el.getAttribute('role')).toBe('badge');
  });

  it('ignoreEvent returns false', () => {
    const widget = new (PriorityWidget as any)('C', 'low');
    expect(widget.ignoreEvent()).toBe(false);
  });
});

describe('TaskKeywordDecorator block state tracking', () => {
  let mockEditorView: any;

  beforeAll(() => {
    installObsidianDomMocks();
  });

  beforeEach(() => {
    mockEditorView = {
      state: {
        doc: {
          lines: 1,
          line: jest
            .fn()
            .mockReturnValue({ text: '', from: 0, to: 0, number: 1 }),
          lineAt: jest.fn().mockReturnValue({ number: 1 }),
        },
        selection: { main: { head: 0, from: 0, to: 0 } },
      },
      dom: {
        parentElement: {
          classList: { contains: jest.fn().mockReturnValue(true) },
        },
      },
    };
  });

  describe('getPriorityLevel', () => {
    it('maps A to high', () => {
      const decorator = new (TaskKeywordDecorator as any)(
        mockEditorView,
        createBaseSettings(),
        { testRegex: /TODO/ },
      );
      expect(decorator['getPriorityLevel']('A')).toBe('high');
    });

    it('maps B to med', () => {
      const decorator = new (TaskKeywordDecorator as any)(
        mockEditorView,
        createBaseSettings(),
        { testRegex: /TODO/ },
      );
      expect(decorator['getPriorityLevel']('B')).toBe('med');
    });

    it('maps anything else to low', () => {
      const decorator = new (TaskKeywordDecorator as any)(
        mockEditorView,
        createBaseSettings(),
        { testRegex: /TODO/ },
      );
      expect(decorator['getPriorityLevel']('C')).toBe('low');
      expect(decorator['getPriorityLevel']('Z')).toBe('low');
    });
  });

  describe('isCursorNearPriority', () => {
    it('returns false when cursor is on a different line', () => {
      mockEditorView.state.doc.lineAt = jest
        .fn()
        .mockReturnValueOnce({ number: 1 }) // token line
        .mockReturnValueOnce({ number: 2 }); // cursor line

      const decorator = new (TaskKeywordDecorator as any)(
        mockEditorView,
        createBaseSettings(),
        { testRegex: /TODO/ },
      );
      expect(decorator['isCursorNearPriority'](10, 13)).toBe(false);
    });

    it('returns true when cursor is within token range', () => {
      mockEditorView.state.doc.lineAt = jest
        .fn()
        .mockReturnValueOnce({ number: 1 })
        .mockReturnValueOnce({ number: 1 });
      mockEditorView.state.selection.main = { head: 11, from: 11, to: 11 };

      const decorator = new (TaskKeywordDecorator as any)(
        mockEditorView,
        createBaseSettings(),
        { testRegex: /TODO/ },
      );
      expect(decorator['isCursorNearPriority'](10, 13)).toBe(true);
    });

    it('returns true when selection overlaps token', () => {
      mockEditorView.state.doc.lineAt = jest
        .fn()
        .mockReturnValueOnce({ number: 1 })
        .mockReturnValueOnce({ number: 1 });
      mockEditorView.state.selection.main = { head: 15, from: 8, to: 20 };

      const decorator = new (TaskKeywordDecorator as any)(
        mockEditorView,
        createBaseSettings(),
        { testRegex: /TODO/ },
      );
      expect(decorator['isCursorNearPriority'](10, 13)).toBe(true);
    });
  });

  describe('isLivePreviewMode', () => {
    it('returns true when parent has is-live-preview class', () => {
      const decorator = new (TaskKeywordDecorator as any)(
        mockEditorView,
        createBaseSettings(),
        { testRegex: /TODO/ },
      );
      expect(decorator['isLivePreviewMode']()).toBe(true);
    });

    it('returns false when parent does not have is-live-preview class', () => {
      mockEditorView.dom.parentElement.classList.contains = jest
        .fn()
        .mockReturnValue(false);
      const decorator = new (TaskKeywordDecorator as any)(
        mockEditorView,
        createBaseSettings(),
        { testRegex: /TODO/ },
      );
      expect(decorator['isLivePreviewMode']()).toBe(false);
    });

    it('returns false when parentElement is null', () => {
      mockEditorView.dom.parentElement = null;
      const decorator = new (TaskKeywordDecorator as any)(
        mockEditorView,
        createBaseSettings(),
        { testRegex: /TODO/ },
      );
      expect(decorator['isLivePreviewMode']()).toBe(false);
    });
  });

  describe('isTaskLine', () => {
    it('returns true for lines matching parser regex', () => {
      const decorator = new (TaskKeywordDecorator as any)(
        mockEditorView,
        createBaseSettings(),
        { testRegex: /- \[ \] TODO/ },
      );
      expect(decorator['isTaskLine']('- [ ] TODO test')).toBe(true);
    });

    it('returns false for non-task lines', () => {
      const decorator = new (TaskKeywordDecorator as any)(
        mockEditorView,
        createBaseSettings(),
        { testRegex: /- \[ \] TODO/ },
      );
      expect(decorator['isTaskLine']('regular text')).toBe(false);
    });
  });

  describe('updateCodeBlockState', () => {
    it('enters code block on triple backtick', () => {
      const decorator = new (TaskKeywordDecorator as any)(
        mockEditorView,
        createBaseSettings(),
        { testRegex: /TODO/ },
      );
      decorator['updateCodeBlockState']('```typescript');
      expect(decorator['inCodeBlock']).toBe(true);
      expect(decorator['codeBlockLanguage']).toBe('typescript');
    });

    it('exits code block on matching closing delimiter', () => {
      const decorator = new (TaskKeywordDecorator as any)(
        mockEditorView,
        createBaseSettings(),
        { testRegex: /TODO/ },
      );
      decorator['updateCodeBlockState']('```typescript');
      decorator['updateCodeBlockState']('```');
      expect(decorator['inCodeBlock']).toBe(false);
      expect(decorator['codeBlockLanguage']).toBe('');
    });

    it('stays in code block with different delimiter length', () => {
      const decorator = new (TaskKeywordDecorator as any)(
        mockEditorView,
        createBaseSettings(),
        { testRegex: /TODO/ },
      );
      decorator['updateCodeBlockState']('```typescript');
      decorator['updateCodeBlockState']('``');
      expect(decorator['inCodeBlock']).toBe(true);
    });

    it('stays in code block with different delimiter character', () => {
      const decorator = new (TaskKeywordDecorator as any)(
        mockEditorView,
        createBaseSettings(),
        { testRegex: /TODO/ },
      );
      decorator['updateCodeBlockState']('```typescript');
      decorator['updateCodeBlockState']('~~~');
      expect(decorator['inCodeBlock']).toBe(true);
    });
  });

  describe('updateBlockStates', () => {
    it('tracks quote blocks', () => {
      const decorator = new (TaskKeywordDecorator as any)(
        mockEditorView,
        createBaseSettings(),
        { testRegex: /TODO/ },
      );
      decorator['updateBlockStates']('> quote line');
      expect(decorator['inQuoteBlock']).toBe(true);
      expect(decorator['inCalloutBlock']).toBe(false);
    });

    it('tracks callout blocks', () => {
      const decorator = new (TaskKeywordDecorator as any)(
        mockEditorView,
        createBaseSettings(),
        { testRegex: /TODO/ },
      );
      decorator['updateBlockStates']('>[!info] callout');
      expect(decorator['inCalloutBlock']).toBe(true);
      expect(decorator['inQuoteBlock']).toBe(false);
    });

    it('calculates quote nesting level', () => {
      const decorator = new (TaskKeywordDecorator as any)(
        mockEditorView,
        createBaseSettings(),
        { testRegex: /TODO/ },
      );
      decorator['updateBlockStates']('> > nested quote');
      expect(decorator['quoteNestingLevel']).toBe(1);
    });

    it('tracks footnote lines', () => {
      const decorator = new (TaskKeywordDecorator as any)(
        mockEditorView,
        createBaseSettings(),
        { testRegex: /TODO/ },
      );
      decorator['updateBlockStates']('[^1]: footnote content');
      expect(decorator['inFootnote']).toBe(true);
    });

    it('resets quote state on non-quote lines', () => {
      const decorator = new (TaskKeywordDecorator as any)(
        mockEditorView,
        createBaseSettings(),
        { testRegex: /TODO/ },
      );
      decorator['updateBlockStates']('> quote');
      expect(decorator['inQuoteBlock']).toBe(true);
      decorator['updateBlockStates']('normal line');
      expect(decorator['inQuoteBlock']).toBe(false);
      expect(decorator['quoteNestingLevel']).toBe(0);
    });

    it('toggles comment block state', () => {
      const decorator = new (TaskKeywordDecorator as any)(
        mockEditorView,
        createBaseSettings(),
        { testRegex: /TODO/ },
      );
      expect(decorator['inCommentBlock']).toBe(false);
      decorator['updateBlockStates']('%%');
      expect(decorator['inCommentBlock']).toBe(true);
      decorator['updateBlockStates']('%%');
      expect(decorator['inCommentBlock']).toBe(false);
    });
  });

  describe('createDecorations', () => {
    it('creates keyword decoration with correct from/to positions', () => {
      const taskRegex = /^(>\s*)?([-*+]\s+)?(\[[ x]\]\s+)?(TODO)\s+/;

      mockEditorView.state.doc = {
        lines: 2,
        line: jest
          .fn()
          .mockReturnValueOnce({
            text: '- [ ] TODO Task one',
            from: 0,
            to: 19,
            number: 1,
          })
          .mockReturnValueOnce({
            text: 'Normal text',
            from: 20,
            to: 31,
            number: 2,
          }),
        lineAt: jest.fn().mockReturnValue({ number: 999 }),
      };
      mockEditorView.state.selection.main = {
        head: 100,
        from: 100,
        to: 100,
      };
      mockEditorView.dom.parentElement.classList.contains.mockReturnValue(
        false,
      );

      const decorator = new (TaskKeywordDecorator as any)(
        mockEditorView,
        createBaseSettings(),
        { testRegex: taskRegex },
      );

      const decorations = decorator.getDecorations();
      const ranges: Array<{ from: number; to: number; value: any }> = [];
      decorations.between(0, 100, (from: number, to: number, value: any) => {
        ranges.push({ from, to, value });
      });

      expect(ranges.length).toBeGreaterThan(0);
      const keywordRange = ranges.find((r) =>
        r.value?.spec?.class?.includes('todoseq-keyword-formatted'),
      );
      expect(keywordRange).toBeDefined();
      expect(keywordRange!.from).toBe(6);
      expect(keywordRange!.to).toBe(10);
    });

    it('does not create decoration for non-task lines', () => {
      mockEditorView.state.doc = {
        lines: 1,
        line: jest.fn().mockReturnValue({
          text: 'Just some normal text',
          from: 0,
          to: 21,
          number: 1,
        }),
        lineAt: jest.fn().mockReturnValue({ number: 1 }),
      };
      mockEditorView.state.selection.main = {
        head: 100,
        from: 100,
        to: 100,
      };

      const decorator = new (TaskKeywordDecorator as any)(
        mockEditorView,
        createBaseSettings(),
        { testRegex: /^(>\s*)?([-*+]\s+)?(\[[ x]\]\s+)?(TODO)\s+/ },
      );

      const decorations = decorator.getDecorations();
      const ranges: Array<{ from: number; to: number }> = [];
      decorations.between(0, 100, (from: number, to: number) => {
        ranges.push({ from, to });
      });

      expect(ranges.length).toBe(0);
    });

    it('calculates positions correctly for task on second line', () => {
      const taskRegex = /^(>\s*)?([-*+]\s+)?(\[[ x]\]\s+)?(TODO)\s+/;

      mockEditorView.state.doc = {
        lines: 2,
        line: jest
          .fn()
          .mockReturnValueOnce({
            text: '# Heading',
            from: 0,
            to: 9,
            number: 1,
          })
          .mockReturnValueOnce({
            text: '- [ ] TODO Second task',
            from: 10,
            to: 32,
            number: 2,
          }),
        lineAt: jest.fn().mockReturnValue({ number: 999 }),
      };
      mockEditorView.state.selection.main = {
        head: 100,
        from: 100,
        to: 100,
      };
      mockEditorView.dom.parentElement.classList.contains.mockReturnValue(
        false,
      );

      const decorator = new (TaskKeywordDecorator as any)(
        mockEditorView,
        createBaseSettings(),
        { testRegex: taskRegex },
      );

      const decorations = decorator.getDecorations();
      const ranges: Array<{ from: number; to: number; value: any }> = [];
      decorations.between(0, 100, (from: number, to: number, value: any) => {
        ranges.push({ from, to, value });
      });

      const keywordRange = ranges.find((r) =>
        r.value?.spec?.class?.includes('todoseq-keyword-formatted'),
      );
      expect(keywordRange).toBeDefined();
      expect(keywordRange!.from).toBe(10 + 6);
      expect(keywordRange!.to).toBe(10 + 10);
    });
  });
});
