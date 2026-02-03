import { EditorView, keymap } from '@codemirror/view';
import { Extension } from '@codemirror/state';
import { TodoTrackerSettings } from '../../settings/settings';

/**
 * Editor extension for automatic date insertion after SCHEDULED: and DEADLINE: keywords
 */
export class DateAutocompleteExtension {
  constructor(private settings: TodoTrackerSettings) {}

  /**
   * Create the editor extension for date autocomplete
   */
  public createExtension(): Extension {
    return keymap.of([
      {
        key: ':',
        run: (view) => {
          return this.handleColonTyping(view);
        },
        shift: (view) => {
          return this.handleColonTyping(view);
        },
      },
    ]);
  }

  /**
   * Handle colon typing to detect SCHEDULED: and DEADLINE: keywords
   */
  private handleColonTyping(view: EditorView): boolean {
    if (!this.settings.formatTaskKeywords) {
      return false; // Don't interfere if task formatting is disabled
    }

    const { state } = view;
    const cursorPos = state.selection.main.head;
    const line = state.doc.lineAt(cursorPos);
    const lineText = line.text;
    const cursorOffset = cursorPos - line.from;

    // Check if we just typed a colon after SCHEDULED or DEADLINE
    const textBeforeCursor = lineText.substring(0, cursorOffset);
    const scheduledMatch = textBeforeCursor.match(/SCHEDULED$/);
    const deadlineMatch = textBeforeCursor.match(/DEADLINE$/);

    if (scheduledMatch || deadlineMatch) {
      // Check if the keyword is at the start of the line (allowing for indentation)
      const isValidPosition = this.checkKeywordPosition(lineText, cursorOffset);

      if (!isValidPosition) {
        return false;
      }

      // Check if this line is in a valid context (after a task or after another date line)
      const isValidContext = this.checkLineContext(view, line.number);

      if (!isValidContext) {
        return false;
      }

      // Insert current date with proper formatting (include the colon that was typed)
      const currentDate = this.getCurrentDateString();
      const dateText = `: <${currentDate}>`;

      // Insert the date text AFTER the existing text (don't replace anything)
      view.dispatch({
        changes: {
          from: cursorPos, // Start from current cursor position (after the colon)
          to: cursorPos, // Don't replace anything
          insert: dateText,
        },
        selection: {
          anchor: cursorPos + 3, // Select the date part (skip colon, space, and <)
          head: cursorPos + dateText.length - 1, // Select up to the end of the date (before >)
        },
      });

      return true; // Event handled
    }

    return false; // Let other handlers process this
  }

  /**
   * Check if the current line is in a valid context for date autocomplete
   * Valid contexts: line directly after a task, or after another date line that follows a task
   */
  private checkLineContext(
    view: EditorView,
    currentLineNumber: number,
  ): boolean {
    const { state } = view;
    // Check if this is the first line
    if (currentLineNumber === 1) {
      return false;
    }

    // Look back through previous lines to find a task
    for (let i = currentLineNumber - 1; i >= 1; i--) {
      const prevLine = state.doc.line(i);
      const prevLineText = prevLine.text.trim();

      // Skip empty lines
      if (prevLineText === '') {
        continue;
      }

      // Check if previous line is a task line (contains task keywords)
      const taskKeywords = ['TODO', 'DOING', 'DONE', 'CANCELLED', 'CANCELED'];
      const isTaskLine = taskKeywords.some(
        (keyword) =>
          prevLineText.startsWith(keyword) ||
          prevLineText.includes(` ${keyword} `) ||
          prevLineText.includes(`\t${keyword} `),
      );

      if (isTaskLine) {
        return true;
      }

      // Check if previous line is a date line (SCHEDULED or DEADLINE)
      const isDateLine =
        prevLineText.startsWith('SCHEDULED:') ||
        prevLineText.startsWith('DEADLINE:');

      if (isDateLine) {
        continue; // Keep looking for the task before this date line
      }

      // If we hit a non-empty, non-task, non-date line, it's not a valid context
      return false;
    }

    return false;
  }

  /**
   * Check if the keyword is at a valid position (start of line with optional indentation)
   */
  private checkKeywordPosition(
    lineText: string,
    cursorOffset: number,
  ): boolean {
    const textBeforeCursor = lineText.substring(0, cursorOffset);
    const keywordMatch = textBeforeCursor.match(/(SCHEDULED|DEADLINE)$/);

    if (!keywordMatch) {
      return false;
    }

    const keyword = keywordMatch[0];
    const keywordStart = cursorOffset - keyword.length;

    // Check if the keyword is at the start of the line (allowing for whitespace)
    const textBeforeKeyword = lineText.substring(0, keywordStart);

    // Valid if:
    // 1. Keyword is at start of line (textBeforeKeyword is empty or only whitespace)
    // 2. Or keyword is after list markers (-, *, +, etc.)
    const isStartOfLine = textBeforeKeyword.trim() === '';
    const isAfterListMarker = /^\s*[-*+]\s*$/.test(textBeforeKeyword.trim());

    const isValidPosition = isStartOfLine || isAfterListMarker;

    return isValidPosition;
  }

  /**
   * Get current date as YYYY-MM-DD string
   */
  private getCurrentDateString(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}

/**
 * Create date autocomplete extension
 */
export function dateAutocompleteExtension(
  settings: TodoTrackerSettings,
): Extension {
  const extension = new DateAutocompleteExtension(settings);
  return extension.createExtension();
}
