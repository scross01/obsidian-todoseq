import { App, TFile, MarkdownView, EditorPosition } from 'obsidian';
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
    
    // Check if the original task was a markdown checkbox
    const isCheckbox = task.rawText.trim().match(/^(\s*[-*+]\s+)\[(\s|x)\]\s+(\w+)\s+/);
    let newLine: string;
    
    if (isCheckbox) {
      // Generate markdown checkbox format with proper spacing
      const checkboxStatus = DEFAULT_COMPLETED_STATES.has(newState) ? 'x' : ' ';
      newLine = `${task.indent}- [${checkboxStatus}] ${newState}${priorityPart}${textPart}`;
    } else {
      // Generate original format, preserving comment prefix if present
      // Extract the exact spacing between comment marker and state keyword from raw text
      let commentWithSpacing = '';
      if (task.commentPrefix) {
        // Find the comment marker in the raw text and extract the exact spacing
        const commentMarker = task.commentPrefix.trim();
        const commentMarkerIndex = task.rawText.indexOf(commentMarker);
        if (commentMarkerIndex !== -1) {
          // Extract everything from the comment marker to the state keyword
          const afterCommentMarker = task.rawText.substring(commentMarkerIndex + commentMarker.length);
          const stateKeywordIndex = afterCommentMarker.search(/\b(TODO|FIXME|HACK|LATER|DOING|DONE|WAIT|WAITING|NOW|IN-PROGRESS|CANCELED|CANCELLED)\b/);
          if (stateKeywordIndex !== -1) {
            commentWithSpacing = commentMarker + afterCommentMarker.substring(0, stateKeywordIndex);
          } else {
            commentWithSpacing = task.commentPrefix;
          }
        } else {
          commentWithSpacing = task.commentPrefix;
        }
      }
      
      newLine = `${task.indent}${commentWithSpacing}${task.listMarker || ''}${newState}${priorityPart}${textPart}`;
      
      // Add trailing comment end characters if they were present in the original task
      if (task.trailingCommentEnd) {
        newLine += task.trailingCommentEnd;
      }
    }
    
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