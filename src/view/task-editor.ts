import { App, TFile, MarkdownView, EditorPosition } from 'obsidian';
import { Task, DEFAULT_COMPLETED_STATES, NEXT_STATE } from '../task';
import { CHECKBOX_REGEX } from '../utils/task-utils';
import { getPluginSettings } from '../utils/settings-utils';

export class TaskEditor {
  /**
   * Prefer Editor API for the active file to preserve cursor/selection/folds and UX.
   * Prefer Vault.process for background edits to perform atomic writes.
   */
  constructor(private readonly app: App) {}

  // Pure formatter of a task line given a new state and optional priority retention
  static generateTaskLine(
    task: Task,
    newState: string,
    keepPriority = true,
  ): { newLine: string; completed: boolean } {
    const priToken =
      keepPriority && task.priority
        ? task.priority === 'high'
          ? '[#A]'
          : task.priority === 'med'
            ? '[#B]'
            : '[#C]'
        : null;

    const priorityPart = priToken ? ` ${priToken}` : '';
    const textPart = task.text ? ` ${task.text}` : '';

    // Check if the original task was a markdown checkbox using shared regex
    const isCheckbox = task.rawText.trim().match(CHECKBOX_REGEX);
    let newLine: string;

    if (isCheckbox) {
      // Generate markdown checkbox format with proper spacing
      const checkboxStatus = DEFAULT_COMPLETED_STATES.has(newState) ? 'x' : ' ';
      newLine = `${task.indent}- [${checkboxStatus}] ${newState}${priorityPart}${textPart}`;
    } else {
      // Generate original format, preserving comment prefix if present
      newLine = `${task.indent}${task.listMarker || ''}${newState}${priorityPart}${textPart}`;

      // Add trailing comment end characters if they were present in the original task
      if (task.tail) {
        newLine += task.tail;
      }
    }

    const completed = DEFAULT_COMPLETED_STATES.has(newState);
    return { newLine, completed };
  }

  /**
   * Applies the change and returns an updated, immutable snapshot of the Task.
   *
   * File Operation Strategy:
   * - For active files: Uses Editor API (editor.replaceRange) to preserve cursor position, selection, and folds
   * - For inactive files: Uses Vault.process() for atomic background operations that prevent plugin conflicts
   */
  async applyLineUpdate(
    task: Task,
    newState: string,
    keepPriority = true,
  ): Promise<Task> {
    const { newLine, completed } = TaskEditor.generateTaskLine(
      task,
      newState,
      keepPriority,
    );

    const file = this.app.vault.getAbstractFileByPath(task.path);
    if (file instanceof TFile) {
      // Check if target is the active file in a MarkdownView
      // Using getActiveViewOfType() is safer than accessing workspace.activeLeaf directly
      const md = this.app.workspace.getActiveViewOfType(MarkdownView);
      const isActive = md?.file?.path === task.path;
      const editor = md?.editor;

      if (isActive && editor) {
        // Replace only the specific line using Editor API to preserve editor state
        // This maintains cursor position, selection, and code folds for better UX
        const currentLine = editor.getLine(task.line);
        if (typeof currentLine === 'string') {
          const from: EditorPosition = { line: task.line, ch: 0 };
          const to: EditorPosition = {
            line: task.line,
            ch: currentLine.length,
          };
          editor.replaceRange(newLine, from, to);
        }
      } else {
        // Not active: use atomic background edit
        await this.app.vault.process(file, (data) => {
          const lines = data.split('\n');
          if (task.line < lines.length) {
            lines[task.line] = newLine;
          }
          return lines.join('\n');
        });
      }
    }

    // Return an updated Task snapshot (do not mutate original)
    return {
      ...task,
      rawText: newLine,
      state: newState as Task['state'],
      completed,
    };
  }

  // Cycles a task to its next state according to NEXT_STATE and persists change
  async updateTaskState(
    task: Task,
    nextState: string | null = null,
  ): Promise<Task> {
    let state: string;
    if (nextState == null) {
      // Check if current state is a custom keyword
      const settings = getPluginSettings(this.app);
      const customKeywords = settings?.additionalTaskKeywords || [];

      if (customKeywords.includes(task.state)) {
        // If it's a custom keyword, cycle to DONE
        state = 'DONE';
      } else {
        // Otherwise use the standard NEXT_STATE mapping
        state = NEXT_STATE.get(task.state) || 'TODO';
      }
    } else {
      state = nextState;
    }
    return await this.applyLineUpdate(task, state);
  }
}
