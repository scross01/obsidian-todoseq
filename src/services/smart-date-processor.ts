/**
 * Smart date processor handles automatic conversion of natural language dates
 * to structured org-mode dates when users finish typing task lines.
 *
 * All date line insertions use editorView.dispatch (single CM6 change),
 * including both inline structured dates and natural language dates — no
 * file background write.
 */

import { EditorView, ViewUpdate } from '@codemirror/view';
import { MarkdownView } from 'obsidian';
import TodoTracker from '../main';
import {
  NaturalDateParser,
  ParsedDateInfo,
} from '../parser/natural-date-parser';
import { Task } from '../types/task';
import { formatOrgDate } from '../utils/task-format';
import { getDateLineIndent } from '../utils/task-line-utils';

export type InlineDateType = 'SCHEDULED' | 'DEADLINE';

/**
 * Check if a task line already contains inline structured dates
 * (SCHEDULED: or DEADLINE: with angle-bracket syntax).
 * Exported so the highlight plugin can stay consistent with SmartDateProcessor.
 */
export function hasInlineStructuredDates(lineText: string): boolean {
  return /\S.*(SCHEDULED|DEADLINE):\s*</.test(lineText);
}

export interface InlineDateInfo {
  type: InlineDateType;
  dateStr: string;
}

export class SmartDateProcessor {
  private enabled: boolean = false;
  private readonly DEBOUNCE_DELAY_MS = 1500;
  private debounceTimers: Map<string, number> = new Map();
  private lastProcessedLines: Map<
    string,
    { line: number; timestamp: number; text: string }
  > = new Map();
  private isProcessing: Map<string, boolean> = new Map();

  constructor(private plugin: TodoTracker) {}

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.clearAllTimers();
      this.lastProcessedLines.clear();
      this.isProcessing.clear();
    }
  }

  handleEditorUpdate(view: EditorView, update: ViewUpdate): void {
    if (!this.enabled) return;

    if (!update.docChanged) return;

    const mdView = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
    if (!mdView) return;

    const file = mdView.file;
    if (!file) return;

    const cursorPos = view.state.selection.main.head;
    const line = view.state.doc.lineAt(cursorPos);

    this.processLineWithDebounce(file.path, line.number, view);
  }

  /**
   * Handle cursor leaving a line (user finished typing).
   * Processes the line the cursor LEFT, not the current line.
   * When the line contains a natural language date (detected via NaturalDateParser),
   * forces reprocessing regardless of prior vault-scan processing to ensure the
   * date is always extracted when the user explicitly leaves the line (via Enter,
   * arrow keys, mouse click, etc.).
   */
  handleCursorLeave(view: EditorView, previousLineNumber: number): void {
    if (!this.enabled) return;

    const mdView = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
    if (!mdView) return;

    const file = mdView.file;
    if (!file) {
      return;
    }

    if (previousLineNumber < 1 || previousLineNumber > view.state.doc.lines) {
      return;
    }

    const line = view.state.doc.line(previousLineNumber);

    // Detect if this line has a natural language date. If so, force reprocess
    // to ensure the date is extracted even if vault scan already processed it.
    const hasNaturalDate = this.hasNaturalLanguageDate(line.text);

    void this.processLine(
      file.path,
      previousLineNumber,
      line.text,
      view,
      true,
      hasNaturalDate, // forceReprocess when line has natural date
    );
  }

  /**
   * Check if a line contains a natural language date that should be extracted.
   * Used to detect when cursor leaves a line with styling (highlight) on the date.
   */
  private hasNaturalLanguageDate(lineText: string): boolean {
    if (this.hasInlineStructuredDates(lineText)) return false;
    if (this.isDateLine(lineText)) return false;
    const parsed = NaturalDateParser.parse(lineText);
    return parsed !== null && parsed.matchedText !== null;
  }

  private processLineWithDebounce(
    filePath: string,
    lineNumber: number,
    view: EditorView,
  ): void {
    const key = `${filePath}:${lineNumber}`;

    const existingTimer = this.debounceTimers.get(key);
    if (existingTimer) {
      window.clearTimeout(existingTimer);
    }

    const timer = window.setTimeout(() => {
      if (lineNumber < 1 || lineNumber > view.state.doc.lines) {
        this.debounceTimers.delete(key);
        return;
      }
      const cursorPos = view.state.selection.main.head;
      const currentLine = view.state.doc.lineAt(cursorPos);
      if (currentLine.number === lineNumber) {
        this.debounceTimers.delete(key);
        return;
      }
      const taskLineText = view.state.doc.line(lineNumber).text;
      void this.processLine(filePath, lineNumber, taskLineText, view);
      this.debounceTimers.delete(key);
    }, this.DEBOUNCE_DELAY_MS);

    this.debounceTimers.set(key, timer);
  }

  private async processLine(
    filePath: string,
    lineNumber: number,
    lineText: string,
    view: EditorView,
    skipCursorCheck: boolean = false,
    forceReprocess: boolean = false,
  ): Promise<void> {
    if (this.isProcessing.get(`${filePath}:${lineNumber}`)) {
      return;
    }

    const parser = this.plugin.getVaultScanner()?.getParser();
    if (!parser) {
      return;
    }

    if (!parser.isTaskLine(lineText)) {
      return;
    }

    if (this.isDateLine(lineText)) {
      return;
    }

    if (!skipCursorCheck) {
      const cursorPos = view.state.selection.main.head;
      const currentLine = view.state.doc.lineAt(cursorPos);
      if (currentLine.number === lineNumber) {
        return;
      }
    }

    const now = Date.now();

    // Bypass the 1-second guard when forceReprocess is true, since
    // handleCursorLeave / Enter key means the user explicitly left the line
    // and wants the date extracted regardless of prior vault-scan processing.
    if (!forceReprocess) {
      const lastProcessed = this.lastProcessedLines.get(
        `${filePath}:${lineNumber}`,
      );
      if (
        lastProcessed &&
        lastProcessed.text === lineText &&
        now - lastProcessed.timestamp < 1000
      ) {
        return;
      }
    }

    // If the task already has date lines below (SCHEDULED/DEADLINE), note their
    // positions so convertNaturalLanguageDate can REPLACE them instead of
    // appending duplicate date lines.  Removing this early-return is what fixes
    // the "edit a dated task and add a new date expression – nothing happens"
    // regression: the task text is re-parsed and the existing date is updated.
    const existingDateLines: { lineNumber: number; type: InlineDateType }[] =
      this.findExistingDateLines(filePath, lineNumber, view);

    const hasInlineDates = this.hasInlineStructuredDates(lineText);
    const parsedDate = hasInlineDates
      ? null
      : NaturalDateParser.parse(lineText);

    if (!parsedDate && !hasInlineDates) {
      return;
    }

    const task = parser.parseLineAsTask(lineText, lineNumber - 1, filePath);
    if (!task) {
      return;
    }

    // Defer ALL dispatch operations until after the current update cycle
    // completes. EditorView.dispatch() is not allowed during an active update
    // (e.g., while smartDatePlugin.update() is on the call stack). Using
    // requestAnimationFrame ensures we dispatch after the current transaction
    // chain completes — both inline structured dates and natural language dates.
    //
    // isProcessing is set RIGHT BEFORE scheduling the RAF, not earlier in a
    // finally block, so that early-return paths above don't need to manage it.
    // The RAF callback always clears it at the end (or on early exit).
    this.isProcessing.set(`${filePath}:${lineNumber}`, true);
    try {
      window.requestAnimationFrame(() => {
        // Re-check that the line still exists and hasn't been modified since
        // processLine was called (view state may have changed)
        if (lineNumber < 1 || lineNumber > view.state.doc.lines) {
          this.isProcessing.set(`${filePath}:${lineNumber}`, false);
          return;
        }
        const currentLine = view.state.doc.line(lineNumber);
        if (currentLine.text !== lineText) {
          // Line text changed - don't dispatch stale conversion
          this.isProcessing.set(`${filePath}:${lineNumber}`, false);
          return;
        }

        let converted = false;
        try {
          if (hasInlineDates) {
            converted = this.applyInlineConversionSync(
              lineNumber,
              lineText,
              task,
              view,
            );
          } else if (parsedDate !== null) {
            converted = this.convertNaturalLanguageDateSync(
              lineNumber,
              lineText,
              parsedDate,
              task,
              view,
              existingDateLines,
            );
          }
        } catch {
          // Conversion failed - treat as not converted
          converted = false;
        }

        if (converted) {
          this.lastProcessedLines.set(`${filePath}:${lineNumber}`, {
            line: lineNumber,
            timestamp: Date.now(),
            text: lineText,
          });
        }
        this.isProcessing.set(`${filePath}:${lineNumber}`, false);
      });
    } catch {
      // Unexpected exception before RAF registered — clear the guard so the
      // line can be processed on the next trigger.
      this.isProcessing.set(`${filePath}:${lineNumber}`, false);
    }
  }

  /**
   * Check if the line is a standalone date line (SCHEDULED:, DEADLINE:, CLOSED:)
   * Uses the parser's getDateLineType for consistency.
   */
  private isDateLine(lineText: string): boolean {
    const parser = this.plugin.getVaultScanner()?.getParser();
    if (parser) {
      const indent = lineText.match(/^(\s*)/)?.[1] ?? '';
      return parser.getDateLineType(lineText, indent) !== null;
    }
    return (
      /^\s*(SCHEDULED|DEADLINE):\s*[<[]/.test(lineText) ||
      /^\s*CLOSED:\s*\[/.test(lineText)
    );
  }

  /**
   * Check if a line has inline structured dates (SCHEDULED: or DEADLINE: on the task line)
   */
  private hasInlineStructuredDates(lineText: string): boolean {
    return hasInlineStructuredDates(lineText);
  }

  /**
   * Find existing date lines (SCHEDULED/DEADLINE) below the given task line.
   * Returns the matching lines so callers can replace them instead of
   * inserting duplicate date lines when the task text is edited.
   */
  private findExistingDateLines(
    filePath: string,
    lineNumber: number,
    view: EditorView,
  ): { lineNumber: number; type: InlineDateType }[] {
    const mdView = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
    if (mdView?.file?.path !== filePath) {
      return [];
    }

    const result: { lineNumber: number; type: InlineDateType }[] = [];

    for (let i = 1; ; i++) {
      const nextLineNum = lineNumber + i;
      if (nextLineNum > view.state.doc.lines) break;

      const nextLine = view.state.doc.line(nextLineNum);
      const nextLineTrimmed = nextLine.text.trim();

      if (nextLineTrimmed === '') continue;

      if (nextLineTrimmed.startsWith('SCHEDULED:')) {
        result.push({ lineNumber: nextLineNum, type: 'SCHEDULED' });
        continue;
      }

      if (nextLineTrimmed.startsWith('DEADLINE:')) {
        result.push({ lineNumber: nextLineNum, type: 'DEADLINE' });
        continue;
      }

      break;
    }

    return result;
  }

  /**
   * Synchronous version of convertNaturalLanguageDate for use inside
   * requestAnimationFrame callbacks where we cannot await.
   * Note: This method is NOT async since applyConversionSync is synchronous.
   * It returns boolean directly to avoid Promise unhandled-rejection issues
   * when called without await inside RAF callbacks.
   */
  private convertNaturalLanguageDateSync(
    lineNumber: number,
    lineText: string,
    parsedDate: ParsedDateInfo,
    task: Task,
    view: EditorView,
    existingDateLines: { lineNumber: number; type: InlineDateType }[] = [],
  ): boolean {
    try {
      if (!parsedDate.date) return false;

      const dateType = this.detectDateType(lineText);

      const dateStr = this.formatDateWithOptionalTime(parsedDate);

      const updatedTaskLine = this.plugin.settings.smartDateRemoveKeywords
        ? NaturalDateParser.removeDateFromText(lineText)
        : lineText;

      // If there is an existing date line with the SAME type (e.g. SCHEDULED),
      // replace it in-place rather than inserting a duplicate.
      const sameTypeDate = existingDateLines.find((d) => d.type === dateType);
      const replaceLineNumber =
        (sameTypeDate != null ? sameTypeDate.lineNumber : null) ??
        existingDateLines[0]?.lineNumber;

      return this.applyConversionSync(
        lineNumber,
        updatedTaskLine,
        dateType,
        dateStr,
        task,
        view,
        replaceLineNumber,
      );
    } catch {
      return false;
    }
  }

  private formatDateWithOptionalTime(parsedDate: ParsedDateInfo): string {
    if (!parsedDate.date) return '';

    const time = parsedDate.hasTime
      ? `${String(parsedDate.date.getHours()).padStart(2, '0')}:${String(parsedDate.date.getMinutes()).padStart(2, '0')}`
      : null;

    return formatOrgDate(parsedDate.date, parsedDate.repeat, time);
  }

  /**
   * Detect whether the date should be SCHEDULED or DEADLINE based on context
   */
  private detectDateType(lineText: string): InlineDateType {
    const lowerText = lineText.toLowerCase();
    if (/\b(?:due|deadline)\b/.test(lowerText)) {
      return 'DEADLINE';
    }
    return 'SCHEDULED';
  }

  /**
   * Extract inline structured dates from a task line.
   * Only supports SCHEDULED and DEADLINE (not CLOSED).
   */
  extractInlineDates(lineText: string): InlineDateInfo[] {
    const dates: InlineDateInfo[] = [];

    const scheduledMatch = lineText.match(/SCHEDULED:\s*(<[^>]+>)/);
    if (scheduledMatch) {
      dates.push({ type: 'SCHEDULED', dateStr: scheduledMatch[1] });
    }

    const deadlineMatch = lineText.match(/DEADLINE:\s*(<[^>]+>)/);
    if (deadlineMatch) {
      dates.push({ type: 'DEADLINE', dateStr: deadlineMatch[1] });
    }

    return dates;
  }

  /**
   * Remove inline date expressions from task line text.
   * Handles extra whitespace left behind.
   */
  removeInlineDatesFromText(lineText: string, dates: InlineDateInfo[]): string {
    let result = lineText;

    for (const date of dates) {
      const escaped = date.dateStr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pattern = `\\s*${date.type}:\\s*${escaped}`;
      result = result.replace(new RegExp(pattern), '');
    }

    return result.replace(/\s{2,}/g, ' ').trim();
  }

  /**
   * Synchronous version of applyConversion for use in requestAnimationFrame.
   */
  private applyConversionSync(
    lineNumber: number,
    updatedTaskLine: string,
    dateType: InlineDateType,
    dateStr: string,
    task: Task,
    editorView: EditorView,
    replaceLineNumber: number | null = null,
  ): boolean {
    const { state: docState } = editorView;

    if (lineNumber < 1 || lineNumber > docState.doc.lines) return false;
    const taskLine = docState.doc.line(lineNumber);

    const mdView = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
    const effectiveIndent =
      (mdView?.editor as { cm?: EditorView })?.cm === editorView
        ? getDateLineIndent(task)
        : '';

    const dateLine = `${effectiveIndent}${dateType}: ${dateStr}`;
    const newContent = [updatedTaskLine, dateLine].join('\n');

    if (replaceLineNumber !== null) {
      if (replaceLineNumber < 1 || replaceLineNumber > docState.doc.lines)
        return false;
      const existingDateLine = docState.doc.line(replaceLineNumber);
      editorView.dispatch({
        changes: {
          from: taskLine.from,
          to: existingDateLine.to,
          insert: newContent,
        },
      });
    } else {
      editorView.dispatch({
        changes: {
          from: taskLine.from,
          to: taskLine.to,
          insert: newContent,
        },
      });
    }

    return true;
  }

  /**
   * Synchronous version of applyInlineConversion for use in requestAnimationFrame.
   * Extracts dates from lineText and dispatches inline structured dates conversion.
   */
  private applyInlineConversionSync(
    lineNumber: number,
    lineText: string,
    task: Task,
    view: EditorView,
  ): boolean {
    const mdView = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
    const editorView = (mdView?.editor as { cm?: EditorView })?.cm;
    if (!editorView || editorView !== view) return false;

    const { state } = editorView;
    if (lineNumber < 1 || lineNumber > state.doc.lines) return false;
    const line = state.doc.line(lineNumber);

    const dates = this.extractInlineDates(lineText);
    if (dates.length === 0) return false;

    const updatedTaskLine = this.removeInlineDatesFromText(lineText, dates);

    const insertLines = [updatedTaskLine];
    for (const dateInfo of dates) {
      const indent = getDateLineIndent(task);
      insertLines.push(`${indent}${dateInfo.type}: ${dateInfo.dateStr}`);
    }

    editorView.dispatch({
      changes: {
        from: line.from,
        to: line.to,
        insert: insertLines.join('\n'),
      },
    });

    return true;
  }

  private clearAllTimers(): void {
    for (const timer of this.debounceTimers.values()) {
      window.clearTimeout(timer);
    }
    this.debounceTimers.clear();
  }

  destroy(): void {
    this.clearAllTimers();
    this.lastProcessedLines.clear();
    this.isProcessing.clear();
  }
}
