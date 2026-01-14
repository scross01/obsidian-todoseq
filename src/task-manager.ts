import { Editor, MarkdownView } from 'obsidian';
import { Task } from './task';
import TodoTracker from './main';
import { extractPriority, CHECKBOX_REGEX } from './utils/task-utils';

/**
 * TaskManager handles operations related to modifying tasks in the editor
 */
export class TaskManager {
  constructor(private plugin: TodoTracker) {}

  /**
   * Parse a task from a line of text
   * @param line - The line of text containing the task
   * @param lineNumber - The line number in the file
   * @param filePath - The path to the file
   * @returns Parsed Task object or null if not a valid task
   */
  parseTaskFromLine(
    line: string,
    lineNumber: number,
    filePath: string,
  ): Task | null {
    if (!this.plugin.getVaultScanner()) {
      return null;
    }

    const parser = this.plugin.getVaultScanner()?.getParser();
    if (!parser) {
      return null;
    }

    const match = parser.captureRegex.exec(line);
    if (!match) {
      return null;
    }

    // Extract task details using the same logic as TaskParser
    const indent = match[1] || '';
    const listMarker = (match[2] || '') + (match[3] || '');
    const state = match[4];
    const taskText = match[5];
    const tail = match[6];

    // Extract priority using shared utility
    const { priority, cleanedText } = extractPriority(taskText);

    // Extract checkbox state using shared regex
    let completed = false;
    const checkboxMatch = CHECKBOX_REGEX.exec(line);
    if (checkboxMatch) {
      const [, , , checkboxStatus] = checkboxMatch;
      completed = checkboxStatus === 'x';
    } else {
      completed = new Set(['DONE', 'CANCELED', 'CANCELLED']).has(state);
    }

    return {
      path: filePath,
      line: lineNumber,
      rawText: line,
      indent,
      listMarker,
      text: cleanedText,
      state: state as Task['state'],
      completed,
      priority,
      scheduledDate: null,
      deadlineDate: null,
      tail,
      urgency: null,
      file: undefined,
    };
  }

  /**
   * Handle the toggle or update of task state at a specific line
   * @param checking - Whether this is just a check to see if the command is available
   * @param line - The line number to toggle
   * @param editor - The editor instance
   * @param view - The markdown view
   * @param newState - Optional new state to set (if not provided, will cycle to next state)
   * @returns boolean indicating if the operation was successful
   */
  handleUpdateTaskStateAtLine(
    checking: boolean,
    lineNumber: number,
    editor: Editor,
    view: MarkdownView,
    newState?: string,
  ): boolean {
    const taskEditor = this.plugin.taskEditor;
    const vaultScanner = this.plugin.getVaultScanner();

    if (!taskEditor || !vaultScanner) {
      return false;
    }

    // Get the line from the editor
    const line = editor.getLine(lineNumber);

    // Check if this line contains a valid task using VaultScanner's parser
    const parser = vaultScanner.getParser();
    if (!parser?.testRegex.test(line)) {
      return false;
    }

    if (checking) {
      return true;
    }

    // Parse the task from the line
    const task = this.parseTaskFromLine(
      line,
      lineNumber,
      view.file?.path || '',
    );

    if (task) {
      // Update the task state
      if (newState) {
        taskEditor.updateTaskState(task, newState);
      } else {
        taskEditor.updateTaskState(task);
      }
    }

    return true;
  }

  /**
   * Handle the toggle task state command to update the task state at the current cursor position
   * @param checking - Whether this is just a check to see if the command is available
   * @param editor - The editor instance
   * @param view - The markdown view
   * @returns boolean indicating if the command is available
   */
  handleToggleTaskStateAtCursor(
    checking: boolean,
    editor: Editor,
    view: MarkdownView,
  ): boolean {
    // Get the current line from the editor
    const cursor = editor.getCursor();

    // Use the extracted method to handle the line-based logic
    return this.handleUpdateTaskStateAtLine(
      checking,
      cursor.line,
      editor,
      view,
    );
  }

  /**
   * Handle adding a scheduled date to the task at the current cursor position
   * @param checking - Whether this is just a check to see if the command is available
   * @param editor - The editor instance
   * @param view - The markdown view
   * @returns boolean indicating if the command is available
   */
  handleAddScheduledDateAtCursor(
    checking: boolean,
    editor: Editor,
    view: MarkdownView,
  ): boolean {
    // Get the current line from the editor
    const cursor = editor.getCursor();

    // Use the extracted method to handle the line-based logic
    return this.handleAddDateAtLine(
      checking,
      cursor.line,
      editor,
      view,
      'SCHEDULED',
    );
  }

  /**
   * Handle adding a deadline date to the task at the current cursor position
   * @param checking - Whether this is just a check to see if the command is available
   * @param editor - The editor instance
   * @param view - The markdown view
   * @returns boolean indicating if the command is available
   */
  handleAddDeadlineDateAtCursor(
    checking: boolean,
    editor: Editor,
    view: MarkdownView,
  ): boolean {
    // Get the current line from the editor
    const cursor = editor.getCursor();

    // Use the extracted method to handle the line-based logic
    return this.handleAddDateAtLine(
      checking,
      cursor.line,
      editor,
      view,
      'DEADLINE',
    );
  }

  /**
   * Handle setting high priority on the task at the current cursor position
   * @param checking - Whether this is just a check to see if the command is available
   * @param editor - The editor instance
   * @param view - The markdown view
   * @returns boolean indicating if the command is available
   */
  handleSetPriorityHighAtCursor(
    checking: boolean,
    editor: Editor,
    view: MarkdownView,
  ): boolean {
    // Get the current line from the editor
    const cursor = editor.getCursor();

    // Use the extracted method to handle the line-based logic
    return this.handleSetPriorityAtLine(
      checking,
      cursor.line,
      editor,
      view,
      'high',
    );
  }

  /**
   * Handle setting medium priority on the task at the current cursor position
   * @param checking - Whether this is just a check to see if the command is available
   * @param editor - The editor instance
   * @param view - The markdown view
   * @returns boolean indicating if the command is available
   */
  handleSetPriorityMediumAtCursor(
    checking: boolean,
    editor: Editor,
    view: MarkdownView,
  ): boolean {
    // Get the current line from the editor
    const cursor = editor.getCursor();

    // Use the extracted method to handle the line-based logic
    return this.handleSetPriorityAtLine(
      checking,
      cursor.line,
      editor,
      view,
      'med',
    );
  }

  /**
   * Handle setting low priority on the task at the current cursor position
   * @param checking - Whether this is just a check to see if the command is available
   * @param editor - The editor instance
   * @param view - The markdown view
   * @returns boolean indicating if the command is available
   */
  handleSetPriorityLowAtCursor(
    checking: boolean,
    editor: Editor,
    view: MarkdownView,
  ): boolean {
    // Get the current line from the editor
    const cursor = editor.getCursor();

    // Use the extracted method to handle the line-based logic
    return this.handleSetPriorityAtLine(
      checking,
      cursor.line,
      editor,
      view,
      'low',
    );
  }

  /**
   * Handle setting priority on the task at the specified line
   * @param checking - Whether this is just a check to see if the command is available
   * @param lineNumber - The line number to check
   * @param editor - The editor instance
   * @param view - The markdown view
   * @param priority - The priority to set ('high', 'med', or 'low')
   * @returns boolean indicating if the operation was successful
   */
  handleSetPriorityAtLine(
    checking: boolean,
    lineNumber: number,
    editor: Editor,
    view: MarkdownView,
    priority: 'high' | 'med' | 'low',
  ): boolean {
    const taskEditor = this.plugin.taskEditor;
    const vaultScanner = this.plugin.getVaultScanner();

    if (!taskEditor || !vaultScanner) {
      return false;
    }

    // Get the line from the editor
    const line = editor.getLine(lineNumber);

    // Check if this line contains a valid task using VaultScanner's parser
    const parser = vaultScanner.getParser();
    if (!parser?.testRegex.test(line)) {
      return false;
    }

    if (checking) {
      return true;
    }

    // Parse the task from the line
    const task = this.parseTaskFromLine(
      line,
      lineNumber,
      view.file?.path || '',
    );

    if (task) {
      // Update the task priority
      taskEditor.updateTaskPriority(task, priority);
    }

    return true;
  }

  /**
   * Handle adding a date to the task at the specified line
   * @param checking - Whether this is just a check to see if the command is available
   * @param lineNumber - The line number to check
   * @param editor - The editor instance
   * @param view - The markdown view
   * @param dateType - The type of date to add ('SCHEDULED' or 'DEADLINE')
   * @returns boolean indicating if the operation was successful
   */
  handleAddDateAtLine(
    checking: boolean,
    lineNumber: number,
    editor: Editor,
    view: MarkdownView,
    dateType: 'SCHEDULED' | 'DEADLINE',
  ): boolean {
    const vaultScanner = this.plugin.getVaultScanner();

    if (!vaultScanner) {
      return false;
    }

    // Get the line from the editor
    const line = editor.getLine(lineNumber);

    // Check if this line contains a valid task using VaultScanner's parser
    const parser = vaultScanner.getParser();
    if (!parser?.testRegex.test(line)) {
      return false;
    }

    if (checking) {
      return true;
    }

    // Check if the date already exists in the following lines
    const existingDateLine = this.findExistingDateLine(
      editor,
      lineNumber,
      dateType,
    );

    if (existingDateLine !== null) {
      // Date already exists, move cursor to it and select the date content
      this.moveCursorToDateLine(editor, existingDateLine);
      return true;
    }

    // Insert the new date line
    this.insertDateLine(editor, lineNumber, dateType);
    return true;
  }

  /**
   * Find an existing date line of the specified type after the task line
   * @param editor - The editor instance
   * @param taskLineNumber - The task line number
   * @param dateType - The type of date to find ('SCHEDULED' or 'DEADLINE')
   * @returns The line number of the existing date line, or null if not found
   */
  private findExistingDateLine(
    editor: Editor,
    taskLineNumber: number,
    dateType: 'SCHEDULED' | 'DEADLINE',
  ): number | null {
    const totalLines = editor.lineCount();
    const keyword = `${dateType}:`;

    // Look through the lines after the task line
    for (let i = taskLineNumber + 1; i <= totalLines; i++) {
      const line = editor.getLine(i);

      // Skip empty lines
      if (line.trim() === '') {
        continue;
      }

      // Check if this line starts with the date keyword
      if (line.trim().startsWith(keyword)) {
        return i;
      }

      // If we hit a line that doesn't start with a date keyword and isn't empty,
      // we've gone past the date lines for this task
      if (
        !line.trim().startsWith('SCHEDULED:') &&
        !line.trim().startsWith('DEADLINE:')
      ) {
        break;
      }
    }

    return null;
  }

  /**
   * Insert a new date line at the appropriate position
   * @param editor - The editor instance
   * @param taskLineNumber - The task line number
   * @param dateType - The type of date to insert ('SCHEDULED' or 'DEADLINE')
   */
  private insertDateLine(
    editor: Editor,
    taskLineNumber: number,
    dateType: 'SCHEDULED' | 'DEADLINE',
  ): void {
    const currentDate = this.getCurrentDateString();
    const dateLine = `${dateType}: <${currentDate}>`;

    // Start by inserting immediately after the task line
    let insertLine = taskLineNumber + 1;
    const totalLines = editor.lineCount();

    // Check if there are existing date lines to determine insertion order
    let hasScheduled = false;
    let firstDateLine = -1;

    // Scan for existing date lines
    for (let i = taskLineNumber + 1; i <= totalLines; i++) {
      const line = editor.getLine(i);

      // Skip empty lines
      if (line.trim() === '') {
        continue;
      }

      // Check for date lines
      if (line.trim().startsWith('SCHEDULED:')) {
        hasScheduled = true;
        if (firstDateLine === -1) firstDateLine = i;
      } else if (line.trim().startsWith('DEADLINE:')) {
        if (firstDateLine === -1) firstDateLine = i;
      } else {
        // We've hit a non-date line, stop scanning
        break;
      }
    }

    // Determine the correct insertion position
    if (dateType === 'SCHEDULED') {
      // Insert scheduled date immediately after task line (before any existing dates)
      insertLine = taskLineNumber + 1;
    } else if (dateType === 'DEADLINE') {
      if (hasScheduled) {
        // Insert deadline after scheduled date
        insertLine = firstDateLine + 1;
      } else {
        // Insert deadline immediately after task line
        insertLine = taskLineNumber + 1;
      }
    }

    // Determine if we're inserting between existing date lines
    const lineBeforeInsert = editor.getLine(insertLine - 1);
    const isInsertingBetweenDateLines =
      lineBeforeInsert.trim().startsWith('SCHEDULED:') ||
      lineBeforeInsert.trim().startsWith('DEADLINE:');

    // Check if there's a date line after the insertion point
    const lineAfterInsert = editor.getLine(insertLine);
    const isInsertingBeforeDateLine =
      lineAfterInsert.trim().startsWith('SCHEDULED:') ||
      lineAfterInsert.trim().startsWith('DEADLINE:');

    // Check if the line before insert already ends with a newline
    const lineBeforeInsertEndsWithNewline = editor
      .getLine(insertLine - 1)
      .endsWith('\n');

    // Insert the date line with appropriate newlines
    if (isInsertingBetweenDateLines) {
      // Insert newline + date line (no extra newline after when between dates)
      // Only add newline before if the previous line doesn't already end with one
      const newlineBefore = lineBeforeInsertEndsWithNewline ? '' : '\n';
      editor.replaceRange(
        newlineBefore + dateLine,
        { line: insertLine - 1, ch: editor.getLine(insertLine - 1).length },
        { line: insertLine - 1, ch: editor.getLine(insertLine - 1).length },
      );
      this.moveCursorToDateLine(editor, insertLine);
    } else if (isInsertingBeforeDateLine) {
      // Inserting before an existing date line (e.g., adding scheduled before deadline)
      // Add newline before but no newline after (since there's already a date line after)
      const newlineBefore = lineBeforeInsertEndsWithNewline ? '' : '\n';
      editor.replaceRange(
        newlineBefore + dateLine,
        { line: insertLine - 1, ch: editor.getLine(insertLine - 1).length },
        { line: insertLine - 1, ch: editor.getLine(insertLine - 1).length },
      );
      this.moveCursorToDateLine(editor, insertLine);
    } else {
      // Insert with newline before and after (new date section)
      editor.replaceRange(
        '\n' + dateLine + '\n',
        { line: insertLine - 1, ch: editor.getLine(insertLine - 1).length },
        { line: insertLine - 1, ch: editor.getLine(insertLine - 1).length },
      );
      this.moveCursorToDateLine(editor, insertLine);
    }
  }

  /**
   * Move cursor to the date line and select the date content
   * @param editor - The editor instance
   * @param dateLineNumber - The date line number
   */
  private moveCursorToDateLine(editor: Editor, dateLineNumber: number): void {
    const dateLine = editor.getLine(dateLineNumber);

    // Find the date content within the line (between < and >)
    const dateMatch = dateLine.match(/<([^>]+)>/);

    if (dateMatch && dateMatch.index !== undefined) {
      const dateStart = dateMatch.index + 1; // Position after <
      const dateEnd = dateStart + dateMatch[1].length; // Position before >

      // Set cursor position and selection
      editor.setCursor({ line: dateLineNumber, ch: dateStart });
      editor.setSelection(
        { line: dateLineNumber, ch: dateStart },
        { line: dateLineNumber, ch: dateEnd },
      );
    }
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
