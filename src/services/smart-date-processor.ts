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

export interface InlineDateInfo {
  type: InlineDateType;
  dateStr: string;
}

export class SmartDateProcessor {
  private enabled: boolean = false;
  private parseDelay: number = 1500;
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

  setParseDelay(delay: number): void {
    this.parseDelay = delay;
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
   */
  handleCursorLeave(view: EditorView, previousLineNumber: number): void {
    if (!this.enabled) return;

    const mdView = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
    if (!mdView) return;

    const file = mdView.file;
    if (!file) return;

    if (previousLineNumber < 1 || previousLineNumber > view.state.doc.lines)
      return;

    const line = view.state.doc.line(previousLineNumber);

    void this.processLine(file.path, previousLineNumber, line.text, view, true);
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
    }, this.parseDelay);

    this.debounceTimers.set(key, timer);
  }

  private async processLine(
    filePath: string,
    lineNumber: number,
    lineText: string,
    view: EditorView,
    skipCursorCheck: boolean = false,
  ): Promise<void> {
    if (this.isProcessing.get(`${filePath}:${lineNumber}`)) {
      return;
    }

    try {
      this.isProcessing.set(`${filePath}:${lineNumber}`, true);

      const parser = this.plugin.getVaultScanner()?.getParser();
      if (!parser) return;

      if (!parser.isTaskLine(lineText)) return;

      if (this.isDateLine(lineText)) return;

      if (!skipCursorCheck) {
        const cursorPos = view.state.selection.main.head;
        const currentLine = view.state.doc.lineAt(cursorPos);
        if (currentLine.number === lineNumber) {
          return;
        }
      }

      const lastProcessed = this.lastProcessedLines.get(
        `${filePath}:${lineNumber}`,
      );
      const now = Date.now();
      if (
        lastProcessed &&
        lastProcessed.text === lineText &&
        now - lastProcessed.timestamp < 1000
      ) {
        return;
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

      if (!parsedDate && !hasInlineDates) return;

      const task = parser.parseLineAsTask(lineText, lineNumber - 1, filePath);
      if (!task) return;

      if (hasInlineDates) {
        const converted = await this.convertInlineStructuredDates(
          filePath,
          lineNumber,
          lineText,
          task,
          view,
        );
        if (converted) {
          this.lastProcessedLines.set(`${filePath}:${lineNumber}`, {
            line: lineNumber,
            timestamp: now,
            text: lineText,
          });
        }
      } else if (parsedDate !== null) {
        const converted = await this.convertNaturalLanguageDate(
          lineNumber,
          lineText,
          parsedDate,
          task,
          view,
          existingDateLines,
        );
        if (converted) {
          this.lastProcessedLines.set(`${filePath}:${lineNumber}`, {
            line: lineNumber,
            timestamp: now,
            text: lineText,
          });
        }
      }
    } finally {
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
    return /\S.*(SCHEDULED|DEADLINE):\s*</.test(lineText);
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
   * Convert inline structured dates (e.g., "TODO test SCHEDULED: <2026-08-11>")
   * to separate lines below the task.
   */
  private async convertInlineStructuredDates(
    filePath: string,
    lineNumber: number,
    lineText: string,
    task: Task,
    view: EditorView,
  ): Promise<boolean> {
    try {
      const dates = this.extractInlineDates(lineText);
      if (dates.length === 0) return false;

      const updatedTaskLine = this.removeInlineDatesFromText(lineText, dates);

      return this.applyInlineConversion(
        lineNumber,
        updatedTaskLine,
        dates,
        task,
        view,
      );
    } catch (error) {
      console.debug(
        '[TODOseq] Error converting inline structured dates:',
        error,
      );
      return false;
    }
  }

  /**
   * Convert natural language date to structured org-mode date.
   * When existingDateLines are supplied, the matching date line below the task
   * is REPLACED in-place rather than a new date line being appended.
   */
  private async convertNaturalLanguageDate(
    lineNumber: number,
    lineText: string,
    parsedDate: ParsedDateInfo,
    task: Task,
    view: EditorView,
    existingDateLines: { lineNumber: number; type: InlineDateType }[] = [],
  ): Promise<boolean> {
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

      return await this.applyConversion(
        lineNumber,
        updatedTaskLine,
        dateType,
        dateStr,
        task,
        view,
        replaceLineNumber,
      );
    } catch (error) {
      console.debug('[TODOseq] Error converting to structured date:', error);
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
   * Apply the date conversion for natural language dates.
   * Dispatches a single CM6 editor change to replace the task line and
   * insert (or replace) the date line below it — no file background write.
   *
   * @param replaceLineNumber - When non-null, replaces this date line instead
   *   of inserting a new one. Used when the editor content is updated from a
   *   dated task where a SCHEDULED/DEADLINE line already exists below the task.
   */
  private async applyConversion(
    lineNumber: number,
    updatedTaskLine: string,
    dateType: InlineDateType,
    dateStr: string,
    task: Task,
    editorView: EditorView,
    replaceLineNumber: number | null = null,
  ): Promise<boolean> {
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
      // Replace the task line and the existing date line in one CM6 change.
      // re-read lines to tolerate any intermediate edits between the check
      // in processLine and this dispatch
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
   * Apply the inline date conversion.
   * Dispatches a single CM6 editor change to replace the task line and
   * insert the new date line(s) below it — no file background write.
   */
  private applyInlineConversion(
    lineNumber: number,
    updatedTaskLine: string,
    dates: InlineDateInfo[],
    task: Task,
    view: EditorView,
  ): boolean {
    const mdView = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
    const editorView = (mdView?.editor as { cm?: EditorView })?.cm;
    if (!editorView || editorView !== view) return false;

    const { state } = editorView;
    if (lineNumber < 1 || lineNumber > state.doc.lines) return false;
    const line = state.doc.line(lineNumber);

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
