import { Editor, MarkdownView, Notice } from 'obsidian';
import { EditorView } from '@codemirror/view';
import { Task } from '../types/task';
import TodoTracker from '../main';
import { detectListMarker } from '../utils/patterns';
import { KeywordManager } from '../utils/keyword-manager';
import { TaskStateTransitionManager } from './task-state-transition-manager';
import {
  formatTaskForDailyNote,
  getTodayDailyNote,
  isDailyNotesPluginEnabledSync,
  isTaskOnTodayDailyNote,
} from '../utils/daily-note-utils';
import { findDateLine, getTaskIndent } from '../utils/task-line-utils';
import { TaskContextMenu } from '../view/components/task-context-menu';
import {
  DatePicker,
  DatePickerMode,
} from '../view/components/date-picker-menu';
import { DateRepeatInfo } from '../types/task';

/**
 * EditorController handles operations related to modifying tasks in the editor
 * acting as an Editor Command Controller it parses the line under the cursor,
 * determines intent (toggle, cycle, priority), and delegates to the services.
 * It bridges the gap between the Editor UI and the Service Layer
 */
export class EditorController {
  constructor(
    private plugin: TodoTracker,
    private keywordManager: KeywordManager,
  ) {}

  /**
   * Find a task in the in-memory task list by file path and line number
   * @param filePath - The path to the file
   * @param lineNumber - The line number (0-indexed)
   * @returns The Task object or null if not found
   */
  private findTaskByPathAndLine(
    filePath: string,
    lineNumber: number,
  ): Task | null {
    return this.plugin.taskStateManager.findTaskByPathAndLine(
      filePath,
      lineNumber,
    );
  }

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
    // First try to get the task from state manager (has full date info)
    // This ensures we have access to scheduled/deadline dates for recurring tasks
    if (this.plugin.taskStateManager) {
      const existingTask = this.plugin.taskStateManager.findTaskByPathAndLine(
        filePath,
        lineNumber,
      );
      if (existingTask) {
        return existingTask;
      }
    }

    // Fall back to parsing from line (won't have dates for following lines)
    if (!this.plugin.getVaultScanner()) {
      return null;
    }

    const parser = this.plugin.getVaultScanner()?.getParser();
    if (!parser) {
      return null;
    }

    return parser.parseLineAsTask(line, lineNumber, filePath);
  }

  /**
   * Clean the task text to remove any slash command before the cursor position
   * This handles the case where user types a slash command like /copy, /move, /high, /med, /low
   * @param taskText - The task text to clean
   * @param editor - The editor instance to get cursor position
   * @param lineNumber - The line number of the task
   * @returns The cleaned task text
   */
  private cleanTaskTextFromSlashCommand(
    taskText: string,
    editor: Editor,
    lineNumber: number,
  ): string {
    const cursor = editor.getCursor();
    const currentLine = editor.getLine(lineNumber);

    // Find the slash command before the cursor position
    // Look for / followed by letters before the cursor
    const textBeforeCursor = currentLine.substring(0, cursor.ch);

    // Find the last slash command before the cursor position
    // This handles cases where user types /copy, /move, /high, /med, /low, etc.
    // The slash command can be at the end or anywhere in the text before the cursor
    const slashCommandMatch = textBeforeCursor.match(/\s+\/([a-zA-Z]+)\s*$/);

    if (slashCommandMatch) {
      // Remove the slash command from the task text
      // The slash command is in the middle of the text, so we need to remove it
      const cleanedText = taskText
        .replace(new RegExp(`\\s+/${slashCommandMatch[1]}\\s*$`), '')
        .trim();
      return cleanedText;
    }

    // Fallback: remove any slash command followed by letters anywhere in the text
    // This handles cases where the slash command is not at the end of the text before cursor
    const anySlashCommandMatch = taskText.match(/\s+\/([a-zA-Z]+)/);
    if (anySlashCommandMatch) {
      return taskText
        .replace(new RegExp(`\\s+/${anySlashCommandMatch[1]}\\s*`), ' ')
        .trim();
    }

    return taskText;
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
    const vaultScanner = this.plugin.getVaultScanner();

    if (!vaultScanner) {
      return false;
    }

    // Get the line from the editor
    const line = editor.getLine(lineNumber);

    // Check if this line contains a valid task using VaultScanner's parser
    const parser = vaultScanner.getParser();

    if (!parser?.testRegex.test(line)) {
      // Try footnote regex specifically
      const footnoteRegex =
        /\[\^\d+\]:\s+(TODO|DOING|LATER|DONE|CANCELED|CANCELLED|WAIT|WAITING|NOW|IN-PROGRESS)\s+/;
      const footnoteResult = footnoteRegex.test(line);
      if (!footnoteResult) {
        return false;
      }
    }

    if (checking) {
      return true;
    }

    const filePath = view.file?.path || '';

    // Parse the task from the line for the file operation
    const task = this.parseTaskFromLine(line, lineNumber, filePath);

    if (task) {
      // Determine the target state
      let targetState: string = newState ?? '';
      if (!newState) {
        // Cycle to next state
        const settings = this.plugin.settings;
        const stateManager = new TaskStateTransitionManager(
          this.keywordManager,
          settings?.stateTransitions,
        );
        targetState = stateManager.getNextState(task.state);
      }

      // Use unified updateTaskByPath method - handles fresh lookup, optimistic update,
      // file write, recurrence, line adjustment, and UI refresh
      const taskUpdateCoordinator = this.plugin.taskUpdateCoordinator;
      if (taskUpdateCoordinator) {
        taskUpdateCoordinator.updateTaskByPath(
          filePath,
          lineNumber,
          targetState,
          'editor',
        );
      } else {
        // Fallback: do optimistic update then use TaskEditor
        if (this.plugin.taskStateManager) {
          this.plugin.taskStateManager.optimisticUpdate(task, targetState);
        }
        const taskEditor = this.plugin.taskEditor;
        if (taskEditor) {
          taskEditor.updateTaskState(task, targetState).catch((error) => {
            console.error(
              `[TODOseq] Failed to update task at line ${lineNumber}:`,
              error,
            );
          });
        }
      }
    }

    return true;
  }

  /**
   * Handle the cycle task state command to update the task state at the current cursor position
   * @param checking - Whether this is just a check to see if the command is available
   * @param editor - The editor instance
   * @param view - The markdown view
   * @returns boolean indicating if the command is available
   */
  handleCycleTaskStateAtCursor(
    checking: boolean,
    editor: Editor,
    view: MarkdownView,
  ): boolean {
    // Get the current line from the editor
    const cursor = editor.getCursor();

    // Use the extracted method to handle the line-based logic
    this.handleUpdateTaskCycleStateAtLine(checking, cursor.line, editor, view);
    return true;
  }

  /**
   * Handle updating task state at a specific line for cycle task state
   * @param checking - Whether this is just a check to see if the command is available
   * @param lineNumber - The line number to update
   * @param editor - The editor instance
   * @param view - The markdown view
   * @param newState - Optional specific state to set
   * @returns boolean indicating if the command is available
   */
  handleUpdateTaskCycleStateAtLine(
    checking: boolean,
    lineNumber: number,
    editor: Editor,
    view: MarkdownView,
    newState?: string,
  ): boolean {
    const vaultScanner = this.plugin.getVaultScanner();

    if (!vaultScanner) {
      return false;
    }

    // Get the line from the editor
    const line = editor.getLine(lineNumber);

    if (checking) {
      // For cycle task state, the command should be available on any line
      return true;
    }

    // Parse the task from the line (this will return null for lines without task keywords)
    const task = this.parseTaskFromLine(
      line,
      lineNumber,
      view.file?.path || '',
    );

    // Determine the target state using cycle task state logic
    let targetState: string = newState ?? '';
    if (!newState) {
      if (task) {
        const settings = this.plugin.settings;
        const stateManager = new TaskStateTransitionManager(
          this.keywordManager,
          settings?.stateTransitions,
        );
        targetState = stateManager.getCycleState(task.state);
      } else {
        // For lines without existing task keywords, use the default inactive from settings
        const settings = this.plugin.settings;
        const stateManager = new TaskStateTransitionManager(
          this.keywordManager,
          settings?.stateTransitions,
        );
        targetState = stateManager.getCycleState('');
      }
    }

    // Use TaskUpdateCoordinator for unified update handling
    // Optimistic update happens synchronously, async file write follows
    // This works on both desktop and mobile
    const taskUpdateCoordinator = this.plugin.taskUpdateCoordinator;
    if (taskUpdateCoordinator) {
      if (task) {
        taskUpdateCoordinator
          .updateTaskState(task, targetState, 'editor')
          .catch((error) => {
            console.error(
              `[TODOseq] Failed to update task cycle state at line ${lineNumber}:`,
              error,
            );
          });
      } else {
        // For lines without existing task keywords, create a basic task and update it
        const markerInfo = detectListMarker(line);
        const basicTask: Task = {
          path: view.file?.path || '',
          line: lineNumber,
          rawText: line,
          indent: markerInfo.indent,
          listMarker: markerInfo.marker,
          text: markerInfo.text,
          state: '',
          completed: false,
          priority: null,
          scheduledDate: null,
          deadlineDate: null,
          closedDate: null,
          urgency: null,
          isDailyNote: false,
          dailyNoteDate: null,
          subtaskCount: 0,
          subtaskCompletedCount: 0,
        };

        taskUpdateCoordinator
          .updateTaskState(basicTask, targetState, 'editor')
          .catch((error) => {
            console.error(
              `[TODOseq] Failed to update task cycle state at line ${lineNumber}:`,
              error,
            );
          });
      }
    }

    // Refresh editor decorations to show the updated task state
    if (this.plugin.refreshVisibleEditorDecorations) {
      this.plugin.refreshVisibleEditorDecorations();
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
    this.handleUpdateTaskStateAtLine(checking, cursor.line, editor, view);
    return true;
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
   * Handle setting priority on the task at the current cursor position
   * @param checking - Whether this is just a check to see if the command is available
   * @param editor - The editor instance
   * @param view - The markdown view
   * @param priority - The priority to set ('high', 'med', or 'low')
   * @returns boolean indicating if the command is available
   */
  async handleSetPriorityAtCursor(
    checking: boolean,
    editor: Editor,
    view: MarkdownView,
    priority: 'high' | 'med' | 'low',
  ): Promise<boolean> {
    const cursor = editor.getCursor();

    return this.handleSetPriorityAtLine(
      checking,
      cursor.line,
      editor,
      view,
      priority,
    );
  }

  /**
   * Handle setting high priority on the task at the current cursor position
   * @param checking - Whether this is just a check to see if the command is available
   * @param editor - The editor instance
   * @param view - The markdown view
   * @returns boolean indicating if the command is available
   */
  async handleSetPriorityHighAtCursor(
    checking: boolean,
    editor: Editor,
    view: MarkdownView,
  ): Promise<boolean> {
    return this.handleSetPriorityAtCursor(checking, editor, view, 'high');
  }

  /**
   * Handle setting medium priority on the task at the current cursor position
   * @param checking - Whether this is just a check to see if the command is available
   * @param editor - The editor instance
   * @param view - The markdown view
   * @returns boolean indicating if the command is available
   */
  async handleSetPriorityMediumAtCursor(
    checking: boolean,
    editor: Editor,
    view: MarkdownView,
  ): Promise<boolean> {
    return this.handleSetPriorityAtCursor(checking, editor, view, 'med');
  }

  /**
   * Handle setting low priority on the task at the current cursor position
   * @param checking - Whether this is just a check to see if the command is available
   * @param editor - The editor instance
   * @param view - The markdown view
   * @returns boolean indicating if the command is available
   */
  async handleSetPriorityLowAtCursor(
    checking: boolean,
    editor: Editor,
    view: MarkdownView,
  ): Promise<boolean> {
    return this.handleSetPriorityAtCursor(checking, editor, view, 'low');
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
  async handleSetPriorityAtLine(
    checking: boolean,
    lineNumber: number,
    editor: Editor,
    view: MarkdownView,
    priority: 'high' | 'med' | 'low',
  ): Promise<boolean> {
    const taskEditor = this.plugin.taskEditor;
    const vaultScanner = this.plugin.getVaultScanner();
    const taskUpdateCoordinator = this.plugin.taskUpdateCoordinator;

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
      // Clean the task text to remove any slash command
      // This handles the case where user types a slash command like /high /med /low
      // The slash command can be at the end or in the middle of the task text
      const cleanedTask = { ...task };

      // Get the cursor position to find where the slash command is
      const cursor = editor.getCursor();
      const currentLine = editor.getLine(lineNumber);

      // Find the slash command before the cursor position
      // Look for / followed by letters before the cursor
      const textBeforeCursor = currentLine.substring(0, cursor.ch);

      // Find the last slash command before the cursor position
      // This handles cases where user types /high, /med, /low, /pri, etc.
      // The slash command can be at the end or anywhere in the text before cursor
      const slashCommandMatch = textBeforeCursor.match(/\s+\/([a-zA-Z]+)\s*$/);

      if (slashCommandMatch) {
        // Remove the slash command from the task text
        // The slash command is in the middle of the text, so we need to remove it
        cleanedTask.text = cleanedTask.text
          .replace(new RegExp(`\\s+/${slashCommandMatch[1]}\\s*`), ' ')
          .trim();
      } else {
        // Fallback: remove any slash command followed by letters anywhere in the text
        // This handles cases where the slash command is not at the end of the text before cursor
        const anySlashCommandMatch = cleanedTask.text.match(/\s+\/([a-zA-Z]+)/);
        if (anySlashCommandMatch) {
          cleanedTask.text = cleanedTask.text
            .replace(new RegExp(`\\s+/${anySlashCommandMatch[1]}\\s*`), ' ')
            .trim();
        }
      }

      // Use TaskUpdateCoordinator for consistent UI updates
      if (taskUpdateCoordinator) {
        await taskUpdateCoordinator.updateTaskPriority(cleanedTask, priority);
      } else {
        // Fallback to TaskEditor if coordinator not available
        taskEditor.updateTaskPriority(cleanedTask, priority);
      }
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
    const taskLine = editor.getLine(taskLineNumber);
    const taskIndent = getTaskIndent(taskLine);

    // Build lines array from editor.getLine()
    const lines: string[] = [];
    for (let i = 0; i < totalLines; i++) {
      lines.push(editor.getLine(i));
    }

    const dateLineIndex = findDateLine(
      lines,
      taskLineNumber + 1,
      dateType,
      taskIndent,
      this.keywordManager,
    );

    return dateLineIndex >= 0 ? dateLineIndex : null;
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
    const taskLine = editor.getLine(taskLineNumber);
    const taskIndent = getTaskIndent(taskLine);

    // Build lines array from editor.getLine()
    const lines: string[] = [];
    for (let i = 0; i < totalLines; i++) {
      lines.push(editor.getLine(i));
    }

    // Check if there are existing date lines to determine insertion order
    const scheduledLineIndex = findDateLine(
      lines,
      taskLineNumber + 1,
      'SCHEDULED',
      taskIndent,
      this.keywordManager,
    );

    // Determine the correct insertion position
    if (dateType === 'SCHEDULED') {
      // Insert scheduled date immediately after task line (before any existing dates)
      insertLine = taskLineNumber + 1;
    } else if (dateType === 'DEADLINE') {
      if (scheduledLineIndex >= 0) {
        // Insert deadline after scheduled date
        insertLine = scheduledLineIndex + 1;
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
      // Insert with newline before (no newline after - existing content follows naturally)
      editor.replaceRange(
        '\n' + dateLine,
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

  /**
   * Handle copying task at cursor to today's daily note
   * @param checking - Whether this is just a check to see if the command is available
   * @param editor - The editor instance
   * @param view - The markdown view
   * @returns boolean indicating if the command is available
   */
  handleCopyTaskToTodayAtCursor(
    checking: boolean,
    editor: Editor,
    view: MarkdownView,
  ): boolean {
    // Check if daily notes plugin is enabled
    if (!isDailyNotesPluginEnabledSync(this.plugin.app)) {
      return false;
    }

    const vaultScanner = this.plugin.getVaultScanner();
    if (!vaultScanner) {
      return false;
    }

    // Get the cursor position
    const cursor = editor.getCursor();
    const lineNumber = cursor.line;

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

    if (!task) {
      return false;
    }

    // Perform the async operation without waiting
    void (async () => {
      try {
        // Get today's daily note
        const todayNote = await getTodayDailyNote(this.plugin.app);
        if (!todayNote) {
          new Notice('Failed to get or create today daily note');
          return;
        }

        // Check if task is already on today's daily note
        if (isTaskOnTodayDailyNote(task, todayNote)) {
          new Notice('Task is already on today daily note');
          return;
        }

        // Clean the task text to remove any slash command
        // This handles the case where user types a slash command like /copy, /move, /high, /med, /low
        const cleanedTask = { ...task };
        cleanedTask.text = this.cleanTaskTextFromSlashCommand(
          task.text,
          editor,
          lineNumber,
        );

        // Format the task for daily note
        const taskLines = formatTaskForDailyNote(cleanedTask);

        // Read the current content of today's daily note
        const currentContent = await this.plugin.app.vault.read(todayNote);

        // Append the task to the end of the file
        // Add two newlines before the task to separate from existing content
        const newContent =
          currentContent.trimEnd() + '\n\n' + taskLines.join('\n') + '\n';

        // Write the updated content back to the file
        await this.plugin.app.vault.modify(todayNote, newContent);

        // Show notification
        new Notice('Task copied to today daily note');
      } catch (error) {
        console.error('[TODOseq] Failed to copy task to today:', error);
        new Notice('Failed to copy task to today');
      }
    })();

    return true;
  }

  /**
   * Handle moving task at cursor to today's daily note
   * @param checking - Whether this is just a check to see if the command is available
   * @param editor - The editor instance
   * @param view - The markdown view
   * @returns boolean indicating if the command is available
   */
  handleMoveTaskToTodayAtCursor(
    checking: boolean,
    editor: Editor,
    view: MarkdownView,
  ): boolean {
    // Check if daily notes plugin is enabled
    if (!isDailyNotesPluginEnabledSync(this.plugin.app)) {
      return false;
    }

    const vaultScanner = this.plugin.getVaultScanner();
    if (!vaultScanner) {
      return false;
    }

    // Get the cursor position
    const cursor = editor.getCursor();
    const lineNumber = cursor.line;

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

    if (!task) {
      return false;
    }

    // Perform the async operation without waiting
    void (async () => {
      try {
        // Get today's daily note
        const todayNote = await getTodayDailyNote(this.plugin.app);
        if (!todayNote) {
          new Notice('Failed to get or create today daily note');
          return;
        }

        // Check if task is already on today's daily note
        if (isTaskOnTodayDailyNote(task, todayNote)) {
          new Notice('Task is already on today daily note');
          return;
        }

        // Clean the task text to remove any slash command
        // This handles the case where user types a slash command like /copy, /move, /high, /med, /low
        const cleanedTask = { ...task };
        cleanedTask.text = this.cleanTaskTextFromSlashCommand(
          task.text,
          editor,
          lineNumber,
        );

        // Format the task for daily note
        const taskLines = formatTaskForDailyNote(cleanedTask);

        // Read the current content of today's daily note
        const todayContent = await this.plugin.app.vault.read(todayNote);

        // Append the task to the end of today's daily note
        // Add two newlines before the task to separate from existing content
        const newTodayContent =
          todayContent.trimEnd() + '\n\n' + taskLines.join('\n') + '\n';

        // Write the updated content to today's daily note
        await this.plugin.app.vault.modify(todayNote, newTodayContent);

        // Remove the task from the source file using the editor API
        // Get the full line range of the task (including any date lines)
        const startLine = lineNumber;
        let endLine = lineNumber;

        // Check if there are scheduled/deadline dates on the following lines
        const fileContent = editor.getValue();
        const lines = fileContent.split('\n');

        // Look for SCHEDULED and DEADLINE lines immediately after the task
        for (let i = lineNumber + 1; i < lines.length; i++) {
          const nextLine = lines[i].trim();
          if (
            nextLine.startsWith('SCHEDULED:') ||
            nextLine.startsWith('DEADLINE:')
          ) {
            endLine = i;
          } else {
            // Stop at the first non-date line
            break;
          }
        }

        // Remove the task and its date lines
        // We need to delete from endLine to startLine (reverse order to maintain line numbers)
        for (let i = endLine; i >= startLine; i--) {
          editor.replaceRange('', { line: i, ch: 0 }, { line: i + 1, ch: 0 });
        }

        // Show notification
        new Notice('Task moved to today daily note');
      } catch (error) {
        console.error('[TODOseq] Failed to move task to today:', error);
        new Notice('Failed to move task to today');
      }
    })();

    return true;
  }

  /**
   * Handle migrating a task to today's daily note.
   * Copies the task to today's daily note and updates the source task
   * to the migrated state keyword.
   *
   * @param checking - If true, only check if the command is available
   * @param editor - The editor instance
   * @param view - The markdown view
   * @returns boolean indicating if the command is available
   */
  handleMigrateTaskToTodayAtCursor(
    checking: boolean,
    editor: Editor,
    view: MarkdownView,
  ): boolean {
    // Check if daily notes plugin is enabled
    if (!isDailyNotesPluginEnabledSync(this.plugin.app)) {
      return false;
    }

    // Check if migrate state keyword is configured
    if (!this.plugin.settings.migrateToTodayState) {
      return false;
    }

    const vaultScanner = this.plugin.getVaultScanner();
    if (!vaultScanner) {
      return false;
    }

    // Get the cursor position
    const cursor = editor.getCursor();
    const lineNumber = cursor.line;

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

    if (!task) {
      return false;
    }

    // Get the migrated state keyword from settings
    const migrateState = this.plugin.settings.migrateToTodayState;

    // Perform the async operation without waiting
    void (async () => {
      try {
        // Get today's daily note
        const todayNote = await getTodayDailyNote(this.plugin.app);
        if (!todayNote) {
          new Notice('Failed to get or create today daily note');
          return;
        }

        // Check if task is already on today's daily note
        if (isTaskOnTodayDailyNote(task, todayNote)) {
          new Notice('Task is already on today daily note');
          return;
        }

        // Clean the task text to remove any slash command
        const cleanedTask = { ...task };
        cleanedTask.text = this.cleanTaskTextFromSlashCommand(
          task.text,
          editor,
          lineNumber,
        );

        // Format the task for daily note
        const taskLines = formatTaskForDailyNote(cleanedTask);

        // Read the current content of today's daily note
        const todayContent = await this.plugin.app.vault.read(todayNote);

        // Append the task to the end of today's daily note
        const newTodayContent =
          todayContent.trimEnd() + '\n\n' + taskLines.join('\n') + '\n';

        // Write the updated content to today's daily note
        await this.plugin.app.vault.modify(todayNote, newTodayContent);

        // Update the source task to the migrated state
        // Replace the existing keyword with the migrated state
        const taskKeyword = task.state || 'TODO';
        const lineContent = editor.getLine(lineNumber);

        // Escape special regex characters in the keyword
        const escapeRegex = (str: string) =>
          str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

        let updatedLineContent: string;
        if (migrateState === '') {
          // If empty, remove the keyword entirely
          updatedLineContent = lineContent.replace(
            new RegExp(`^(\\s*)\\b${escapeRegex(taskKeyword)}\\b\\s*`, 'i'),
            '$1',
          );
        } else {
          // Replace the existing keyword with the migrated state
          updatedLineContent = lineContent.replace(
            new RegExp(`\\b${escapeRegex(taskKeyword)}\\b`, 'i'),
            migrateState,
          );
        }

        // Apply the change to the editor
        editor.replaceRange(
          updatedLineContent,
          { line: lineNumber, ch: 0 },
          { line: lineNumber, ch: lineContent.length },
        );

        // Show notification
        new Notice('Task migrated to today daily note');
      } catch (error) {
        console.error('[TODOseq] Failed to migrate task to today:', error);
        new Notice('Failed to migrate task to today');
      }
    })();

    return true;
  }

  /**
   * Open the task context menu at the cursor position
   * @param checking - Whether this is just a check to see if the command is available
   * @param editor - The editor instance
   * @param view - The markdown view
   * @returns boolean indicating if the operation was successful
   */
  handleOpenContextMenuAtCursor(
    checking: boolean,
    editor: Editor,
    view: MarkdownView,
  ): boolean {
    const vaultScanner = this.plugin.getVaultScanner();

    if (!vaultScanner) {
      return false;
    }

    const cursor = editor.getCursor();
    const line = editor.getLine(cursor.line);

    // Check if this line contains a valid task using VaultScanner's parser
    const parser = vaultScanner.getParser();

    if (!parser?.testRegex.test(line)) {
      // Try footnote regex specifically
      const footnoteRegex =
        /\[\^\d+\]:\s+(TODO|DOING|LATER|DONE|CANCELED|CANCELLED|WAIT|WAITING|NOW|IN-PROGRESS)\s+/;
      const footnoteResult = footnoteRegex.test(line);
      if (!footnoteResult) {
        return false;
      }
    }

    if (checking) {
      return true;
    }

    const filePath = view.file?.path || '';

    // Parse the task from the line
    const task = this.parseTaskFromLine(line, cursor.line, filePath);

    if (!task) {
      return false;
    }

    // Get cursor position in screen coordinates using CodeMirror editor
    const cmEditor = (view.editor as { cm?: EditorView })?.cm;
    if (!cmEditor) {
      return false;
    }

    const pos = editor.posToOffset({ line: cursor.line, ch: 0 });
    const coords = cmEditor.coordsAtPos(pos);

    if (!coords) {
      return false;
    }

    // Create context menu with callbacks
    const contextMenu = new TaskContextMenu(
      {
        onGoToTask: (task: Task) => {
          // Navigate to the task location (already there since we're in editor)
          // This callback is mainly for task list view
        },
        onCopyTask: (task: Task) => {
          this.handleCopyTaskToTodayAtCursor(false, editor, view);
        },
        onCopyTaskToToday: async (task: Task) => {
          await this.handleCopyTaskToTodayAtCursor(false, editor, view);
        },
        onMoveTaskToToday: async (task: Task) => {
          await this.handleMoveTaskToTodayAtCursor(false, editor, view);
        },
        onMigrateTaskToToday: async (task: Task) => {
          await this.handleMigrateTaskToTodayAtCursor(false, editor, view);
        },
        onPriorityChange: (
          task: Task,
          priority: 'high' | 'med' | 'low' | null,
        ) => {
          const taskUpdateCoordinator = this.plugin.taskUpdateCoordinator;
          if (taskUpdateCoordinator) {
            taskUpdateCoordinator.updateTask({
              task,
              type: 'priority',
              source: 'editor',
              newPriority: priority,
            });
          }
        },
        onScheduledDateChange: async (
          task: Task,
          date: Date | null,
          repeat?: DateRepeatInfo | null,
        ) => {
          const taskUpdateCoordinator = this.plugin.taskUpdateCoordinator;
          if (taskUpdateCoordinator) {
            taskUpdateCoordinator.updateTask({
              task,
              type: 'scheduled-date',
              source: 'editor',
              newDate: date,
              newRepeat: repeat,
            });
          }
        },
        onDeadlineDateChange: async (
          task: Task,
          date: Date | null,
          repeat?: DateRepeatInfo | null,
        ) => {
          const taskUpdateCoordinator = this.plugin.taskUpdateCoordinator;
          if (taskUpdateCoordinator) {
            taskUpdateCoordinator.updateTask({
              task,
              type: 'deadline-date',
              source: 'editor',
              newDate: date,
              newRepeat: repeat,
            });
          }
        },
      },
      {
        weekStartsOn: this.plugin.settings.weekStartsOn,
        migrateToTodayState: this.plugin.settings.migrateToTodayState,
      },
      this.plugin.app,
      this.plugin.taskStateManager,
    );

    // Show context menu at cursor position
    contextMenu.show(task, { x: coords.left, y: coords.top + 20 });

    return true;
  }

  /**
   * Open the date picker for scheduled date at the cursor position
   * @param checking - Whether this is just a check to see if the command is available
   * @param editor - The editor instance
   * @param view - The markdown view
   * @returns boolean indicating if the operation was successful
   */
  handleOpenScheduledDatePickerAtCursor(
    checking: boolean,
    editor: Editor,
    view: MarkdownView,
  ): boolean {
    return this.handleOpenDatePickerAtCursor(
      checking,
      editor,
      view,
      'scheduled',
    );
  }

  /**
   * Open the date picker for deadline date at the cursor position
   * @param checking - Whether this is just a check to see if the command is available
   * @param editor - The editor instance
   * @param view - The markdown view
   * @returns boolean indicating if the operation was successful
   */
  handleOpenDeadlineDatePickerAtCursor(
    checking: boolean,
    editor: Editor,
    view: MarkdownView,
  ): boolean {
    return this.handleOpenDatePickerAtCursor(
      checking,
      editor,
      view,
      'deadline',
    );
  }

  /**
   * Open the date picker at the cursor position for the specified mode
   * @param checking - Whether this is just a check to see if the command is available
   * @param editor - The editor instance
   * @param view - The markdown view
   * @param mode - The date picker mode ('scheduled' or 'deadline')
   * @returns boolean indicating if the operation was successful
   */
  private handleOpenDatePickerAtCursor(
    checking: boolean,
    editor: Editor,
    view: MarkdownView,
    mode: DatePickerMode,
  ): boolean {
    const vaultScanner = this.plugin.getVaultScanner();

    if (!vaultScanner) {
      return false;
    }

    const cursor = editor.getCursor();
    const line = editor.getLine(cursor.line);

    // Check if this line contains a valid task using VaultScanner's parser
    const parser = vaultScanner.getParser();

    if (!parser?.testRegex.test(line)) {
      // Try footnote regex specifically
      const footnoteRegex =
        /\[\^\d+\]:\s+(TODO|DOING|LATER|DONE|CANCELED|CANCELLED|WAIT|WAITING|NOW|IN-PROGRESS)\s+/;
      const footnoteResult = footnoteRegex.test(line);
      if (!footnoteResult) {
        return false;
      }
    }

    if (checking) {
      return true;
    }

    const filePath = view.file?.path || '';

    // Parse the task from the line
    const task = this.parseTaskFromLine(line, cursor.line, filePath);

    if (!task) {
      return false;
    }

    // Get cursor position in screen coordinates using CodeMirror editor
    const cmEditor = (view.editor as { cm?: EditorView })?.cm;
    if (!cmEditor) {
      return false;
    }

    const pos = editor.posToOffset({ line: cursor.line, ch: 0 });
    const coords = cmEditor.coordsAtPos(pos);

    if (!coords) {
      return false;
    }

    // Get initial date based on mode
    const initialDate =
      mode === 'scheduled' ? task.scheduledDate : task.deadlineDate;
    const initialRepeat =
      mode === 'scheduled' ? task.scheduledDateRepeat : task.deadlineDateRepeat;

    // Create date picker with callbacks
    const datePicker = new DatePicker(
      {
        onDateSelected: (
          date: Date | null,
          repeat: DateRepeatInfo | null,
          selectedMode: DatePickerMode,
        ) => {
          const taskUpdateCoordinator = this.plugin.taskUpdateCoordinator;
          if (taskUpdateCoordinator) {
            const updateType =
              selectedMode === 'scheduled' ? 'scheduled-date' : 'deadline-date';
            taskUpdateCoordinator.updateTask({
              task,
              type: updateType,
              source: 'editor',
              newDate: date,
              newRepeat: repeat,
            });
          }
        },
      },
      {
        weekStartsOn: this.plugin.settings.weekStartsOn,
      },
    );

    // Show date picker at cursor position
    datePicker.show(
      { x: coords.left, y: coords.top + 20 },
      mode,
      initialDate,
      initialRepeat,
    );

    return true;
  }
}
