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
    filePath: string
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
    newState?: string
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
      view.file?.path || ''
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
    view: MarkdownView
  ): boolean {
    // Get the current line from the editor
    const cursor = editor.getCursor();

    // Use the extracted method to handle the line-based logic
    return this.handleUpdateTaskStateAtLine(
      checking,
      cursor.line,
      editor,
      view
    );
  }
}
