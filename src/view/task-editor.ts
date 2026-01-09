import { App, TFile, MarkdownView, EditorPosition } from 'obsidian';
import { Task, DEFAULT_COMPLETED_STATES, NEXT_STATE } from '../task';
import { CHECKBOX_REGEX, PRIORITY_TOKEN_REGEX } from '../utils/task-utils';
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

  // Updates task priority and persists change
  async updateTaskPriority(
    task: Task,
    newPriority: 'high' | 'med' | 'low',
  ): Promise<Task> {
    const { newLine } = TaskEditor.generateTaskLine(
      task,
      task.state,
      false, // Don't keep existing priority
    );

    // Add the new priority to the task line
    const priorityToken =
      newPriority === 'high' ? '[#A]' : newPriority === 'med' ? '[#B]' : '[#C]';

    // First, remove any existing priority tokens from the task description
    // to handle the case where priority exists but not at the beginning
    // Preserve trailing spaces by using trimStart() instead of trim()
    const cleanedLine = newLine
      .replace(PRIORITY_TOKEN_REGEX, ' ')
      .replace(/\s+/g, ' ')
      .trimStart();

    // Parse the cleaned line to find where to insert the priority
    const match = CHECKBOX_REGEX.exec(cleanedLine);
    let newTaskLine: string;

    if (match) {
      // For checkbox tasks: - [ ] TODO task text
      // Insert priority after the state with proper spacing
      const indent = match[1];
      const listMarker = match[2];
      const state = match[4];
      const text = match[5];
      newTaskLine = `${indent}${listMarker} ${state} ${priorityToken} ${text}`;
    } else {
      // Check for bulleted tasks without checkboxes: - TODO task text
      const bulletMatch = /^(\s*)([-*+])\s+(.+)$/.exec(cleanedLine);
      if (bulletMatch) {
        // For bulleted tasks: - TODO task text
        // Insert priority after the state with proper spacing
        const indent = bulletMatch[1];
        const bullet = bulletMatch[2];
        const rest = bulletMatch[3];

        // Split the rest into state and description
        const restParts = rest.split(' ');
        if (restParts.length >= 2) {
          const state = restParts[0];
          const description = restParts.slice(1).join(' ');
          newTaskLine = `${indent}${bullet} ${state} ${priorityToken} ${description}`;
        } else {
          // Fallback for malformed bulleted tasks
          newTaskLine = `${indent}${bullet} ${rest} ${priorityToken}`;
        }
      } else {
        // For non-checkbox, non-bulleted tasks: TODO task text
        // Insert priority after the state with proper spacing
        const taskParts = cleanedLine.split(' ');
        if (taskParts.length >= 2) {
          const state = taskParts[0];
          const rest = taskParts.slice(1).join(' ');
          newTaskLine = `${state} ${priorityToken} ${rest}`;
        } else {
          // Fallback for malformed tasks
          newTaskLine = `${cleanedLine} ${priorityToken}`;
        }
      }
    }

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
          const to: EditorPosition = {
            line: task.line,
            ch: currentLine.length,
          };
          editor.replaceRange(newTaskLine, from, to);
        }
      } else {
        // Not active: use atomic background edit
        await this.app.vault.process(file, (data) => {
          const lines = data.split('\n');
          if (task.line < lines.length) {
            lines[task.line] = newTaskLine;
          }
          return lines.join('\n');
        });
      }
    }

    // Return an updated Task snapshot (do not mutate original)
    return {
      ...task,
      rawText: newTaskLine,
      priority: newPriority,
    };
  }
}
