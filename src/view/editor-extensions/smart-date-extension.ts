/**
 * CodeMirror extension for smart date recognition
 * Monitors editor changes and cursor movements to trigger date conversion
 */

import {
  ViewPlugin,
  ViewUpdate,
  EditorView,
  Decoration,
  DecorationSet,
} from '@codemirror/view';
import { RangeSetBuilder } from '@codemirror/state';
import {
  SmartDateProcessor,
  hasInlineStructuredDates,
} from '../../services/smart-date-processor';
import { TodoTrackerSettings } from '../../settings/settings-types';
import { NaturalDateParser } from '../../parser/natural-date-parser';
import { TaskParser } from '../../parser/task-parser';

/**
 * Build the smart-date highlight decorations for the current cursor line.
 * Exported as a pure function so it can be unit-tested without a full
 * CodeMirror ViewPlugin lifecycle.
 */
/**
 * Find the rightmost isolated occurrence of `search` in `text`.
 * "Isolated" means the match is bounded by non-word characters or
 * line boundaries on both sides, preventing accidental substring matches
 * inside unrelated words.
 *
 * Matching is case-insensitive so that naturally-capitalized date expressions
 * in task titles (e.g. "Every Friday" in "TODO Review Every Friday") are found
 * even though the NLP parser lowercases its output (e.g. "every Friday").
 * The returned index points to the actual match in the original `text`.
 */
function findRightmostIsolatedMatch(text: string, search: string): number {
  const textLower = text.toLowerCase();
  const searchLower = search.toLowerCase();
  let idx = textLower.lastIndexOf(searchLower);
  while (idx >= 0) {
    const before = idx === 0 || /\W/.test(text[idx - 1]);
    const after =
      idx + search.length === text.length ||
      /\W/.test(text[idx + search.length]);
    if (before && after) return idx;
    idx = textLower.lastIndexOf(searchLower, idx - 1);
  }
  return -1;
}

export function buildSmartDateDecorations(
  view: EditorView,
  settings: TodoTrackerSettings,
  getParser: () => TaskParser | null,
): DecorationSet {
  if (!settings.enableSmartDateRecognition) {
    return Decoration.none;
  }

  const cursorPos = view.state.selection.main.head;
  const cursorLine = view.state.doc.lineAt(cursorPos);
  const parser = getParser();

  if (!parser || !parser.isTaskLine(cursorLine.text)) {
    return Decoration.none;
  }

  // Don't highlight natural dates when inline structured dates are
  // already present on the line — consistent with SmartDateProcessor.
  if (hasInlineStructuredDates(cursorLine.text)) {
    return Decoration.none;
  }

  const parsedDate = NaturalDateParser.parse(cursorLine.text);
  if (!parsedDate || !parsedDate.matchedText) {
    return Decoration.none;
  }

  const lineText = cursorLine.text;
  const trimmedLine = lineText.trim();

  // Skip when the parser couldn't cleanly isolate the date expression.
  // If matchedText covers most of the line, the NLP parser failed to
  // separate eventTitle from the date suffix — highlighting would span
  // the entire line and be useless visual noise.
  if (parsedDate.matchedText.length >= trimmedLine.length * 0.8) {
    return Decoration.none;
  }

  // Use rawExpression for the highlight range so the full detected date
  // expression is styled (including times like "at 4:00pm"), not the
  // stripped matchedText which removes connector words and time portions.
  const highlightText = parsedDate.rawExpression;

  // Find the rightmost isolated occurrence so we don't accidentally highlight
  // a substring inside an unrelated word.
  const matchIndex = findRightmostIsolatedMatch(lineText, highlightText);
  if (matchIndex < 0) {
    return Decoration.none;
  }

  const builder = new RangeSetBuilder<Decoration>();
  const from = cursorLine.from + matchIndex;
  const to = from + highlightText.length;

  builder.add(
    from,
    to,
    Decoration.mark({
      class: 'todoseq-smart-date-highlight',
      attributes: {
        'data-smart-date-match': 'true',
        'aria-label': `Natural date: ${highlightText}`,
      },
    }),
  );

  return builder.finish();
}

/**
 * ViewPlugin that highlights natural-language date expressions on the
 * active (cursor) task line using a subtle outline and background.
 * Decorations are rebuilt on every document change and selection move so
 * that typing which un-matches a date expression clears the style immediately.
 */
export const smartDateHighlightPlugin = (
  settings: TodoTrackerSettings,
  getParser: () => TaskParser | null,
) => {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet = Decoration.none;

      constructor(view: EditorView) {
        this.decorations = buildSmartDateDecorations(view, settings, getParser);
      }

      update(update: ViewUpdate) {
        if (update.selectionSet) {
          this.decorations = buildSmartDateDecorations(
            update.view,
            settings,
            getParser,
          );
        } else if (update.docChanged) {
          // This branch only fires when docChanged is true but selectionSet
          // is false (e.g. programmatic / remote edits).  When the user
          // types manually both flags are usually true, so the first branch
          // above handles it.  We still guard against unnecessary rebuilds
          // by checking whether the cursor line text actually changed.
          const oldPos = update.startState.selection.main.head;
          const newPos = update.state.selection.main.head;
          const oldLine = update.startState.doc.lineAt(oldPos);
          const newLine = update.state.doc.lineAt(newPos);

          if (
            oldLine.number !== newLine.number ||
            oldLine.text !== newLine.text
          ) {
            this.decorations = buildSmartDateDecorations(
              update.view,
              settings,
              getParser,
            );
          }
        }
      }
    },
    {
      decorations: (value) => value.decorations,
    },
  );
};

export const smartDatePlugin = (
  smartDateProcessor: SmartDateProcessor,
  settings: TodoTrackerSettings,
) => {
  return ViewPlugin.fromClass(
    class {
      private lastCursorLine: number = -1;

      constructor(view: EditorView) {
        this.lastCursorLine = this.getCursorLine(view);
      }

      private getCursorLine(view: EditorView): number {
        const cursorPos = view.state.selection.main.head;
        return view.state.doc.lineAt(cursorPos).number;
      }

      update(update: ViewUpdate) {
        if (!settings.enableSmartDateRecognition) return;

        const currentCursorLine = this.getCursorLine(update.view);

        if (update.docChanged) {
          // Save the line number BEFORE updating lastCursorLine, so that
          // handleCursorLeave processes the correct line (the one that had
          // content change / was vacated). Without this, pressing Enter would
          // update lastCursorLine to the new (empty) line first, causing
          // handleCursorLeave to be called with the wrong line number.
          const previousCursorLine = this.lastCursorLine;
          this.lastCursorLine = currentCursorLine;

          // Only call handleCursorLeave when the cursor actually LEAVES the
          // line (Enter key, arrow keys, mouse click to different line).
          // Do NOT call it on every keystroke — handleEditorUpdate handles
          // debounced typing with proper cursor-on-same-line guard.
          if (
            previousCursorLine >= 1 &&
            previousCursorLine !== currentCursorLine
          ) {
            smartDateProcessor.handleCursorLeave(
              update.view,
              previousCursorLine,
            );
          }
          smartDateProcessor.handleEditorUpdate(update.view, update);
        } else if (
          currentCursorLine !== this.lastCursorLine &&
          this.lastCursorLine >= 1
        ) {
          // Content is unchanged — pure cursor movement (arrow keys, mouse).
          // Cursor left the previous line.
          const previousCursorLine = this.lastCursorLine;
          this.lastCursorLine = currentCursorLine;
          smartDateProcessor.handleCursorLeave(update.view, previousCursorLine);
        }
      }

      destroy() {
        // This extension owns no timers itself; the underlying SmartDateProcessor
        // owns an isProcessing guard + debounceTimers that are scoped by file.
        // Do NOT call smartDateProcessor.destroy() here — that would clear timers
        // for every open editor tab, not just the one being torn down.
        // Global lifecycle cleanup is handled by PluginLifecycleManager.onunload().
      }
    },
  );
};
