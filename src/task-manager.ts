import { Editor, MarkdownView } from 'obsidian';
import { Task } from './task';
import TodoTracker from './main';

export class TaskManager {
  constructor(private plugin: TodoTracker) {}
  
  /**
   * Parse a task from a line of text
   * @param line - The line of text containing the task
   * @param lineNumber - The line number in the file
   * @param filePath - The path to the file
   * @returns Parsed Task object or null if not a valid task
   */
  parseTaskFromLine(line: string, lineNumber: number, filePath: string): Task | null {
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
    const indent = match[1] || "";
    const listMarker = (match[2] || "") + (match[3] || "");
    const state = match[4];
    const taskText = match[5];
    const tail = match[6];

    // Extract priority
    let priority: 'high' | 'med' | 'low' | null = null;
    const cleanedText = taskText.replace(/(\s*)\[#([ABC])\](\s*)/, (match: string, before: string, letter: string, after: string) => {
      if (letter === 'A') priority = 'high';
      else if (letter === 'B') priority = 'med';
      else if (letter === 'C') priority = 'low';
      return ' ';
    }).replace(/[ \t]+/g, ' ').trimStart();

    // Extract checkbox state
    let completed = false;
    const checkboxMatch = line.match(/^(\s*)([-*+]\s*\[(\s|x)\]\s*)\s+([^\s]+)\s+(.+)$/);
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
      tail
    };
  }

  /**
   * Handle the toggle task state command
   * @param checking - Whether this is just a check to see if the command is available
   * @param editor - The editor instance
   * @param view - The markdown view
   * @returns boolean indicating if the command is available
   */
  handleToggleTaskState(checking: boolean, editor: Editor, view: MarkdownView): boolean {
    const taskEditor = this.plugin.taskEditor;
    const vaultScanner = this.plugin.getVaultScanner();
    
    if (!taskEditor || !vaultScanner) {
      return false;
    }

    // Get the current line from the editor
    const cursor = editor.getCursor();
    const line = editor.getLine(cursor.line);
    
    // Check if this line contains a valid task using VaultScanner's parser
    const parser = vaultScanner.getParser();
    if (!parser?.testRegex.test(line)) {
      return false;
    }

    if (checking) {
      return true;
    }

    // Parse the task from the current line
    const task = this.parseTaskFromLine(line, cursor.line, view.file?.path || '');
    
    if (task) {
      // Update the task state
      taskEditor.updateTaskState(task);
    }

    return true;
  }

}