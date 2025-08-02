import { App, TFile, Vault } from 'obsidian';
import { Task, COMPLETED_STATES, NEXT_STATE } from './types';

export class TaskEditor {
  constructor(private readonly vault: Vault) {}

  // Pure formatter of a task line given a new state and optional priority retention
  static generateTaskLine(task: Task, newState: string, keepPriority = true): { newLine: string; completed: boolean } {
    const priToken =
      keepPriority && task.priority
        ? (task.priority === 'high' ? '[#A]' : task.priority === 'med' ? '[#B]' : '[#C]')
        : null;

    const priorityPart = priToken ? ` ${priToken}` : '';
    const textPart = task.text ? ` ${task.text}` : '';
    const newLine = `${task.indent}${task.listMarker || ''}${newState}${priorityPart}${textPart}`;
    const completed = COMPLETED_STATES.has(newState);
    return { newLine, completed };
  }

  // Applies the change to disk and returns an updated, immutable snapshot of the Task
  async applyLineUpdate(task: Task, newState: string, keepPriority = true): Promise<Task> {
    const { newLine, completed } = TaskEditor.generateTaskLine(task, newState, keepPriority);

    const file = this.vault.getAbstractFileByPath(task.path);
    if (file instanceof TFile) {
      const content = await this.vault.read(file);
      const lines = content.split('\n');
      if (task.line < lines.length) {
        lines[task.line] = newLine;
        await this.vault.modify(file, lines.join('\n'));
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