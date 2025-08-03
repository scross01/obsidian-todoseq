import { App, TFile, Vault, MarkdownView, EditorPosition } from 'obsidian';
import { Task, DEFAULT_COMPLETED_STATES, NEXT_STATE } from './task';

export class TaskEditor {
  /**
   * Prefer Editor API for the active file to preserve cursor/selection/folds and UX.
   * Prefer Vault.process for background edits to perform atomic writes.
   */
  constructor(private readonly app: App) {}

  // Pure formatter of a task line given a new state and optional priority retention
  static generateTaskLine(task: Task, newState: string, keepPriority = true): { newLine: string; completed: boolean } {
    const priToken =
      keepPriority && task.priority
        ? (task.priority === 'high' ? '[#A]' : task.priority === 'med' ? '[#B]' : '[#C]')
        : null;

    const priorityPart = priToken ? ` ${priToken}` : '';
    const textPart = task.text ? ` ${task.text}` : '';
    const newLine = `${task.indent}${task.listMarker || ''}${newState}${priorityPart}${textPart}`;
    const completed = DEFAULT_COMPLETED_STATES.has(newState);
    return { newLine, completed };
  }

  // Applies the change and returns an updated, immutable snapshot of the Task
  async applyLineUpdate(task: Task, newState: string, keepPriority = true): Promise<Task> {
    const { newLine, completed } = TaskEditor.generateTaskLine(task, newState, keepPriority);

    const file = this.app.vault.getAbstractFileByPath(task.path);
    if (file instanceof TFile) {
      // Check if target is the active file in a MarkdownView
      const md = this.app.workspace.getActiveViewOfType(MarkdownView);
      const isActive = md?.file?.path === task.path;
      const editor = md?.editor;

      if (isActive && editor) {
        // Replace only the specific line using Editor API to preserve editor state
        const currentLine = editor.getLine(task.line);
        if (typeof currentLine === 'string') {
          const from: EditorPosition = { line: task.line, ch: 0 };
          const to: EditorPosition = { line: task.line, ch: currentLine.length };
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
  async updateTaskState(task: Task, nextState: string | null = null): Promise<Task> {
    const state = nextState == null ? NEXT_STATE.get(task.state) || 'TODO' : nextState;
    return await this.applyLineUpdate(task, state);
  }
}