import { App, TFile, MarkdownView, EditorPosition } from 'obsidian';
import { Task, DateRepeatInfo } from '../types/task';
import { CHECKBOX_DETECTION_REGEX } from '../utils/patterns';
import { KeywordManager } from '../utils/keyword-manager';
import { DateUtils } from '../utils/date-utils';
import { findDateLine, getTaskIndent } from '../utils/task-line-utils';
import TodoTracker from '../main';
import { getStateTransitionManager } from './task-update-coordinator';
import {
  updateOrInsert as updateOrInsertDateLine,
  remove as removeDateLine,
  calcInsertIndex,
  getEffectiveIndent,
} from './date-line-operator';

export interface DateLineUpdateResult {
  task: Task;
  lineDelta: number;
}

/**
 * Handles writing task state changes to files.
 */
export class TaskWriter {
  /**
   * Prefer Editor API for the active file to preserve cursor/selection/folds and UX.
   * Prefer Vault.process for background edits to perform atomic writes.
   */
  constructor(
    private readonly plugin: TodoTracker,
    private keywordManager: KeywordManager,
  ) {}

  /**
   * Update the KeywordManager instance when settings change.
   */
  public updateKeywordManager(keywordManager: KeywordManager): void {
    this.keywordManager = keywordManager;
  }

  private get app(): App {
    return this.plugin.app;
  }

  private get settings() {
    return this.plugin.settings;
  }

  // Pure formatter of a task line given a new state and optional priority retention
  static generateTaskLine(
    task: Task,
    newState: string,
    keepPriority = true,
    keywordManager: KeywordManager,
  ): { newLine: string; completed: boolean } {
    const keywordManagerInstance = keywordManager;
    const priToken =
      keepPriority && task.priority
        ? task.priority === 'high'
          ? '[#A]'
          : task.priority === 'med'
            ? '[#B]'
            : '[#C]'
        : null;

    const priorityPart = priToken ? ` ${priToken}` : '';

    // Check if the original task was a markdown checkbox using shared regex
    // For quoted lines, we need to check without the quote prefix
    const rawText = task.rawText;
    const quoteMatch = rawText.match(/^(\s*>\s*)/);
    const quotePrefix = quoteMatch ? quoteMatch[1] : '';
    const textWithoutQuote = quotePrefix
      ? rawText.substring(quotePrefix.length)
      : rawText;
    const checkboxMatch = textWithoutQuote.match(CHECKBOX_DETECTION_REGEX);
    const isCheckbox = checkboxMatch !== null;
    // Extract current list marker character (- or * or +) and checkbox state (x for checked, space for unchecked)
    // This preserves the checkbox state when changing to archived states
    const currentListMarkerChar = checkboxMatch ? checkboxMatch[1] : '-';
    const currentCheckboxState = checkboxMatch ? checkboxMatch[2] : ' ';
    let newLine: string;

    // Get the indent without the quote prefix (task.indent already includes the quote prefix for quoted tasks)
    const indentWithoutQuote = quotePrefix
      ? task.indent.replace(/\s*>\s*$/, '')
      : task.indent;

    if (newState === '') {
      // Handle empty state - remove task keyword entirely
      if (isCheckbox) {
        // For checkboxes, keep the checkbox format but remove the task keyword
        // Use single space between checkbox and text
        const textPart = task.text ? ` ${task.text}` : '';
        newLine = `${indentWithoutQuote}${quotePrefix}${currentListMarkerChar} [ ]${textPart}`;
      } else {
        // For regular tasks, remove the task keyword entirely
        // Handle spacing properly based on whether there's a list marker
        // Note: task.listMarker already includes trailing space if present
        const textPart = task.text ? task.text : '';
        newLine = `${task.indent}${task.listMarker || ''}${textPart}`;
      }

      // Add trailing comment end characters if they were present in the original task
      if (task.tail) {
        newLine += task.tail;
      }
    } else if (isCheckbox) {
      // Generate markdown checkbox format with proper spacing
      // For archived states, preserve the existing checkbox state
      const isArchived = keywordManagerInstance.isArchived(newState);

      let checkboxStatus: string;
      if (isArchived) {
        // Preserve existing checkbox state for archived tasks
        checkboxStatus = currentCheckboxState;
      } else {
        // Get the checkbox state character for the new state
        checkboxStatus = keywordManagerInstance.getCheckboxState(
          newState,
          keywordManagerInstance.getSettings(),
        );
      }

      const textPart = task.text ? ` ${task.text}` : '';
      newLine = `${indentWithoutQuote}${quotePrefix}${currentListMarkerChar} [${checkboxStatus}] ${newState}${priorityPart}${textPart}`;
    } else {
      // Generate original format, preserving comment prefix if present
      const textPart = task.text ? ` ${task.text}` : ' ';
      // Check if this is a footnote task and include the footnote marker
      const footnoteMarker = task.footnoteMarker || '';
      newLine = `${task.indent}${footnoteMarker}${task.listMarker || ''}${newState}${priorityPart}${textPart}`;

      // Add trailing comment end characters if they were present in the original task
      if (task.tail) {
        newLine += task.tail;
      }
    }

    // Add embed reference if it exists
    if (task.embedReference) {
      // Extract the original spacing from the raw text
      // Find where the task text (plus any footnote reference) ends and the embed reference begins
      const textToSearch = task.text + (task.footnoteReference || '');
      const textEndIndex =
        task.rawText.indexOf(textToSearch) + textToSearch.length;
      const originalSpacing = task.rawText.substring(
        textEndIndex,
        task.rawText.indexOf(task.embedReference, textEndIndex),
      );
      newLine += originalSpacing + task.embedReference;
    }

    // Add footnote reference if it exists
    if (task.footnoteReference) {
      // Extract the original spacing from the raw text
      // Find where the task text ends and the footnote reference begins
      const taskTextEndIndex =
        task.rawText.indexOf(task.text) + task.text.length;
      const originalSpacing = task.rawText.substring(
        taskTextEndIndex,
        task.rawText.indexOf(task.footnoteReference, taskTextEndIndex),
      );
      newLine += originalSpacing + task.footnoteReference;
    }

    const completed = keywordManagerInstance.isCompleted(newState);
    return { newLine, completed };
  }

  /**
   * Applies the change and returns an updated, immutable snapshot of the Task.
   *
   * File Operation Strategy:
   * - For active files: Uses Editor API (editor.replaceRange) to preserve cursor position, selection, and folds
   * - For inactive files: Uses Vault.process() for atomic background operations that prevent plugin conflicts
   * - If forceVaultApi is true, uses Vault.process() even for active files to prevent focus jump
   */
  async applyLineUpdate(
    task: Task,
    newState: string,
    keepPriority = true,
    forceVaultApi = false,
  ): Promise<Task> {
    const settings = this.settings;
    const { newLine, completed } = TaskWriter.generateTaskLine(
      task,
      newState,
      keepPriority,
      this.keywordManager,
    );

    // Check if target is the active file in a MarkdownView
    // Using getActiveViewOfType() is safer than accessing workspace.activeLeaf directly
    const md = this.app.workspace.getActiveViewOfType(MarkdownView);
    const isActive = md?.file?.path === task.path;
    const editor = md?.editor;

    // Check if we're in source/edit mode (has editor) vs preview/reader mode
    // In preview mode, getViewType() returns 'markdown' but editor is undefined or null
    const isSourceMode =
      isActive &&
      editor &&
      md?.getViewType() === 'markdown' &&
      md?.getMode &&
      md.getMode() === 'source';

    const file = this.app.vault.getAbstractFileByPath(task.path);
    if (file && file instanceof TFile) {
      if (isSourceMode && !forceVaultApi) {
        // Replace only the specific line using Editor API to preserve editor state
        // This maintains cursor position, selection, and code folds for better UX
        const currentLine = editor.getLine(task.line);
        if (typeof currentLine === 'string') {
          // Save current cursor position before the update
          const cursorPosition = editor.getCursor();

          const from: EditorPosition = { line: task.line, ch: 0 };
          const to: EditorPosition = {
            line: task.line,
            ch: currentLine.length,
          };
          editor.replaceRange(newLine, from, to);

          // Special cursor positioning for tasks with empty text
          if (task.text === '') {
            // Position cursor after the space that follows the keyword
            const keywordPosition = newLine.indexOf(newState);
            if (keywordPosition !== -1) {
              const newCursorPosition = keywordPosition + newState.length + 1;
              editor.setCursor({ line: task.line, ch: newCursorPosition });
            }
          } else if (cursorPosition.line === task.line) {
            // If cursor was on the same line, position it after the new keyword
            // Find where the new keyword starts in the new line
            const keywordPosition = newLine.indexOf(newState);
            if (keywordPosition !== -1) {
              const newCursorPosition = keywordPosition + newState.length;
              editor.setCursor({ line: task.line, ch: newCursorPosition });
            }
          }
        }
      } else {
        // Not in source mode (preview/reader mode) or not active or forceVaultApi: use atomic background edit
        // Include CLOSED date handling atomically in the same operation for consistency
        const dateStr =
          completed && settings?.trackClosedDate
            ? DateUtils.formatClosedDate(new Date())
            : null;
        const shouldRemoveClosed = !completed && task.closedDate;

        await this.app.vault.process(file, (data) => {
          const lines = data.split('\n');
          if (task.line < lines.length) {
            lines[task.line] = newLine;
          }

          // Handle CLOSED date atomically using helper
          if (dateStr !== null) {
            updateOrInsertDateLine(
              lines,
              task.line,
              'CLOSED',
              dateStr,
              task,
              this.keywordManager,
            );
          } else if (shouldRemoveClosed) {
            removeDateLine(
              lines,
              task.line,
              'CLOSED',
              task,
              this.keywordManager,
            );
          }

          return lines.join('\n');
        });
      }
    }

    // For source mode, handle CLOSED date separately via individual Editor API calls
    // The main editor.replaceRange above only replaces a single line, so CLOSED date
    // insertion/removal requires its own editor operations
    // Calculate line delta: +1 if new line inserted, -1 if removed, 0 if updated or no change
    let lineDelta = 0;
    let updatedClosedDate = task.closedDate;
    if (isSourceMode && !forceVaultApi) {
      if (completed && settings?.trackClosedDate) {
        const closedResult = await this.updateTaskClosedDate(
          task,
          new Date(),
          false,
        );
        lineDelta += closedResult.lineDelta;
        updatedClosedDate = closedResult.task.closedDate;
      } else if (!completed && task.closedDate) {
        const closedResult = await this.removeTaskClosedDate(task, false);
        lineDelta += closedResult.lineDelta;
        updatedClosedDate = closedResult.task.closedDate;
      }
    } else if (!isSourceMode || forceVaultApi) {
      // For non-source mode, CLOSED date was handled atomically above
      if (completed && settings?.trackClosedDate) {
        lineDelta = task.closedDate ? 0 : 1;
        updatedClosedDate = new Date();
      } else if (!completed && task.closedDate) {
        lineDelta = -1;
        updatedClosedDate = null;
      }
    }

    // Return an updated Task snapshot (do not mutate original)
    // Include lineDelta for the coordinator to adjust subsequent task indices
    const result: Task & { lineDelta?: number } = {
      ...task,
      rawText: newLine,
      state: newState,
      completed,
      closedDate: updatedClosedDate,
    };
    if (lineDelta !== 0) {
      result.lineDelta = lineDelta;
    }
    return result;
  }

  // Cycles a task to its next state using TaskStateTransitionManager and persists change
  async updateTaskState(
    task: Task,
    nextState: string | null = null,
    forceVaultApi = false,
  ): Promise<Task> {
    let state: string;
    if (nextState == null) {
      const stateManager = getStateTransitionManager(
        this.plugin.taskUpdateCoordinator,
        this.keywordManager,
        this.settings?.stateTransitions,
      );
      state = stateManager.getNextState(task.state);
    } else {
      state = nextState;
    }
    return await this.applyLineUpdate(task, state, true, forceVaultApi);
  }

  // Cycles a task to its next state using TaskStateTransitionManager.getCycleState() and persists change
  async updateTaskCycleState(
    task: Task,
    nextState: string | null = null,
    forceVaultApi = false,
  ): Promise<Task> {
    let state: string;
    if (nextState == null) {
      const stateManager = getStateTransitionManager(
        this.plugin.taskUpdateCoordinator,
        this.keywordManager,
        this.settings?.stateTransitions,
      );
      state = stateManager.getCycleState(task.state);
    } else {
      state = nextState;
    }
    return await this.applyLineUpdate(task, state, true, forceVaultApi);
  }

  // Updates task priority and persists change
  async updateTaskPriority(
    task: Task,
    newPriority: 'high' | 'med' | 'low',
  ): Promise<Task> {
    // Generate priority token
    const priorityToken =
      newPriority === 'high' ? '[#A]' : newPriority === 'med' ? '[#B]' : '[#C]';

    // Reconstruct task line from task attributes
    // This preserves indent by using task.indent directly
    const indent = task.indent;
    const listMarker = task.listMarker || '';
    const state = task.state;
    const text = task.text ? ` ${task.text}` : '';

    // For checkbox tasks, add a space after the list marker
    // The listMarker for checkboxes is "- [ ]" but format requires "- [ ] "
    // Check for '[' instead of '-[' to avoid footnote issues
    const isCheckboxTask = listMarker.includes('[');
    const listMarkerWithSpace = isCheckboxTask ? `${listMarker} ` : listMarker;

    // Preserve embed and footnote references if they exist
    // Embed reference comes before the text, footnote reference comes after the text
    const footnoteMarker = task.footnoteMarker || '';
    const embedReference = task.embedReference || '';
    const footnoteReference = task.footnoteReference || '';
    const newTaskLine = `${indent}${footnoteMarker}${listMarkerWithSpace}${state} ${priorityToken}${embedReference}${text}${footnoteReference}`;

    const file = this.app.vault.getAbstractFileByPath(task.path);
    if (file && file instanceof TFile) {
      // Always use vault.process() for atomic background edits
      // This ensures the file is updated correctly in all modes (editor, reader, etc.)
      await this.app.vault.process(file, (data) => {
        const lines = data.split('\n');
        if (task.line < lines.length) {
          lines[task.line] = newTaskLine;
        }
        return lines.join('\n');
      });
    }

    // Return an updated Task snapshot (do not mutate original)
    return {
      ...task,
      rawText: newTaskLine,
      priority: newPriority,
    };
  }

  /**
   * Removes the priority token from a task and persists the change.
   * If the task has no priority, returns the task unchanged without writing.
   */
  async removeTaskPriority(task: Task): Promise<Task> {
    if (!task.priority) {
      // No priority to remove — return unchanged
      return { ...task };
    }

    // Reconstruct task line from task attributes (without priority)
    // This preserves indent by using task.indent directly
    const indent = task.indent;
    const listMarker = task.listMarker || '';
    const state = task.state;
    const text = task.text ? ` ${task.text}` : '';

    // For checkbox tasks, add a space after the list marker
    // The listMarker for checkboxes is "- [ ]" but format requires "- [ ] "
    // Check for '[' instead of '-[' to avoid footnote issues
    const isCheckboxTask = listMarker.includes('[');
    const listMarkerWithSpace = isCheckboxTask ? `${listMarker} ` : listMarker;

    // Preserve embed and footnote references if they exist
    // Embed reference comes before the text, footnote reference comes after the text
    const footnoteMarker = task.footnoteMarker || '';
    const embedReference = task.embedReference || '';
    const footnoteReference = task.footnoteReference || '';
    const newTaskLine = `${indent}${footnoteMarker}${listMarkerWithSpace}${state}${embedReference}${text}${footnoteReference}`;

    await this.writeLineToFile(task, newTaskLine);

    return {
      ...task,
      rawText: newTaskLine,
      priority: null,
    };
  }

  /**
   * Updates or adds a SCHEDULED date line below the task.
   * If a SCHEDULED line already exists, it is updated in place.
   * If no SCHEDULED line exists, a new one is inserted after the task line.
   * Returns the updated task with lineDelta for the coordinator to adjust subsequent task indices.
   */
  async updateTaskScheduledDate(
    task: Task,
    newDate: Date,
    repeat?: DateRepeatInfo | null,
  ): Promise<Task & { lineDelta?: number }> {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const year = newDate.getFullYear();
    const month = String(newDate.getMonth() + 1).padStart(2, '0');
    const day = String(newDate.getDate()).toString().padStart(2, '0');
    const dayName = days[newDate.getDay()];
    const hours = String(newDate.getHours()).padStart(2, '0');
    const minutes = String(newDate.getMinutes()).padStart(2, '0');
    const timeStr =
      newDate.getHours() === 0 && newDate.getMinutes() === 0
        ? ''
        : ` ${hours}:${minutes}`;
    const repeatStr = repeat ? ` ${repeat.raw}` : '';
    const dateStr = `<${year}-${month}-${day} ${dayName}${timeStr}${repeatStr}>`;
    let lineDelta = 0;

    const file = this.app.vault.getAbstractFileByPath(task.path);
    if (file && file instanceof TFile) {
      await this.app.vault.process(file, (data) => {
        const lines = data.split('\n');
        const result = updateOrInsertDateLine(
          lines,
          task.line,
          'SCHEDULED',
          dateStr,
          task,
          this.keywordManager,
        );
        lineDelta = result.lineDelta;
        return lines.join('\n');
      });
    }

    const result: Task & { lineDelta?: number } = {
      ...task,
      scheduledDate: newDate,
      scheduledDateRepeat: repeat ?? null,
    };
    if (lineDelta !== 0) {
      result.lineDelta = lineDelta;
    }
    return result;
  }

  /**
   * Removes the SCHEDULED date line below the task.
   * If no SCHEDULED line exists in the file, returns the task unchanged.
   * Note: This method attempts to remove the SCHEDULED line regardless of whether
   * the task.scheduledDate property is set, as there may be a discrepancy between
   * the parsed property and what exists in the file.
   * Returns the updated task with lineDelta (only included when non-zero) for the coordinator
   * to adjust subsequent task indices.
   */
  async removeTaskScheduledDate(
    task: Task,
  ): Promise<Task & { lineDelta?: number }> {
    let lineDelta = 0;

    const file = this.app.vault.getAbstractFileByPath(task.path);
    if (file && file instanceof TFile) {
      await this.app.vault.process(file, (data) => {
        const lines = data.split('\n');
        const result = removeDateLine(
          lines,
          task.line,
          'SCHEDULED',
          task,
          this.keywordManager,
        );
        lineDelta = result.lineDelta;
        return lines.join('\n');
      });
    }

    const result: Task & { lineDelta?: number } = {
      ...task,
      scheduledDate: null,
    };
    if (lineDelta !== 0) {
      result.lineDelta = lineDelta;
    }
    return result;
  }

  /**
   * Updates or adds a DEADLINE date line below the task.
   * If a DEADLINE line already exists, it is updated in place.
   * If no DEADLINE line exists, a new one is inserted after the task line (or after the
   * SCHEDULED line if one exists).
   * Returns the updated task with lineDelta (only included when non-zero) for the coordinator
   * to adjust subsequent task indices.
   */
  async updateTaskDeadlineDate(
    task: Task,
    newDate: Date,
    repeat?: DateRepeatInfo | null,
  ): Promise<Task & { lineDelta?: number }> {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const year = newDate.getFullYear();
    const month = String(newDate.getMonth() + 1).padStart(2, '0');
    const day = String(newDate.getDate()).toString().padStart(2, '0');
    const dayName = days[newDate.getDay()];
    const hours = String(newDate.getHours()).padStart(2, '0');
    const minutes = String(newDate.getMinutes()).padStart(2, '0');
    const timeStr =
      newDate.getHours() === 0 && newDate.getMinutes() === 0
        ? ''
        : ` ${hours}:${minutes}`;
    const repeatStr = repeat ? ` ${repeat.raw}` : '';
    const dateStr = `<${year}-${month}-${day} ${dayName}${timeStr}${repeatStr}>`;
    let lineDelta = 0;

    const file = this.app.vault.getAbstractFileByPath(task.path);
    if (file && file instanceof TFile) {
      await this.app.vault.process(file, (data) => {
        const lines = data.split('\n');
        const result = updateOrInsertDateLine(
          lines,
          task.line,
          'DEADLINE',
          dateStr,
          task,
          this.keywordManager,
        );
        lineDelta = result.lineDelta;
        return lines.join('\n');
      });
    }

    const result: Task & { lineDelta?: number } = {
      ...task,
      deadlineDate: newDate,
      deadlineDateRepeat: repeat ?? null,
    };
    if (lineDelta !== 0) {
      result.lineDelta = lineDelta;
    }
    return result;
  }

  /**
   * Removes the DEADLINE date line below the task.
   * If no DEADLINE line exists in the file, returns the task unchanged.
   * Note: This method attempts to remove the DEADLINE line regardless of whether
   * the task.deadlineDate property is set, as there may be a discrepancy between
   * the parsed property and what exists in the file.
   * Returns the updated task with lineDelta (only included when non-zero) for the coordinator
   * to adjust subsequent task indices.
   */
  async removeTaskDeadlineDate(
    task: Task,
  ): Promise<Task & { lineDelta?: number }> {
    let lineDelta = 0;

    const file = this.app.vault.getAbstractFileByPath(task.path);
    if (file && file instanceof TFile) {
      await this.app.vault.process(file, (data) => {
        const lines = data.split('\n');
        const result = removeDateLine(
          lines,
          task.line,
          'DEADLINE',
          task,
          this.keywordManager,
        );
        lineDelta = result.lineDelta;
        return lines.join('\n');
      });
    }

    const result: Task & { lineDelta?: number } = {
      ...task,
      deadlineDate: null,
    };
    if (lineDelta !== 0) {
      result.lineDelta = lineDelta;
    }
    return result;
  }

  /**
   * Helper: write a single line replacement to the file, using Editor API
   * for active files or Vault.process for background files.
   */
  private async writeLineToFile(task: Task, newLine: string): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(task.path);
    if (file && file instanceof TFile) {
      const md = this.app.workspace.getActiveViewOfType(MarkdownView);
      const isActive = md?.file?.path === task.path;
      const editor = md?.editor;

      if (isActive && editor) {
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
        await this.app.vault.process(file, (data) => {
          const lines = data.split('\n');
          if (task.line < lines.length) {
            lines[task.line] = newLine;
          }
          return lines.join('\n');
        });
      }
    }
  }

  /**
   * Updates or adds a CLOSED date line below the task.
   * If a CLOSED line already exists, it is updated in place.
   * If no CLOSED line exists, a new one is inserted after DEADLINE (or after task if no DEADLINE).
   * Returns both the updated task and the line delta (+1 if new line inserted, 0 if updated in place).
   */
  async updateTaskClosedDate(
    task: Task,
    closedDate: Date,
    forceVaultApi = false,
  ): Promise<DateLineUpdateResult> {
    const dateStr = DateUtils.formatClosedDate(closedDate);
    let lineDelta = 0;

    const file = this.app.vault.getAbstractFileByPath(task.path);
    if (file && file instanceof TFile) {
      const md = this.app.workspace.getActiveViewOfType(MarkdownView);
      // Use Editor API only if NOT forcing Vault API AND file is active in editor (source mode)
      const isActive = !forceVaultApi && md?.file?.path === task.path;
      const editor = md?.editor;

      if (isActive && editor) {
        // Use Editor API when file is open in editor to avoid triggering file watcher
        const lines = Array.from({ length: editor.lineCount() }, (_, i) =>
          editor.getLine(i),
        );

        // Get the proper indent including quote prefix, bullet, or checkbox marker
        const taskIndent = getTaskIndent(task);

        // Search for existing CLOSED line
        // Always search regardless of task.closedDate because:
        // 1. On first completion: no CLOSED line exists, insert new
        // 2. On re-completion: CLOSED line exists from previous close, update existing
        const closedLineIndex = findDateLine(
          lines,
          task.line + 1,
          'CLOSED',
          taskIndent,
          this.keywordManager,
        );

        // Find insert position using helper (after DEADLINE/SCHEDULED if present, otherwise after task)
        const insertIndex = calcInsertIndex(
          lines,
          task.line,
          'CLOSED',
          taskIndent,
          this.keywordManager,
        );

        const closedIndent = getEffectiveIndent(lines, closedLineIndex, task);

        if (closedLineIndex >= 0) {
          // Update existing CLOSED line, preserving its indentation
          const from: EditorPosition = { line: closedLineIndex, ch: 0 };
          const to: EditorPosition = {
            line: closedLineIndex,
            ch: lines[closedLineIndex].length,
          };
          editor.replaceRange(`${closedIndent}CLOSED: ${dateStr}`, from, to);
          lineDelta = 0; // Updated in place, no line count change
        } else {
          // Insert new CLOSED line at calculated position
          const from: EditorPosition = { line: insertIndex, ch: 0 };
          const to: EditorPosition = { line: insertIndex, ch: 0 };
          editor.replaceRange(`${closedIndent}CLOSED: ${dateStr}\n`, from, to);
          lineDelta = 1; // New line inserted
        }
      } else {
        // Vault API path
        // Determine if CLOSED line already exists before mutation
        const existingContent = await this.app.vault.read(file);
        const existingLines = existingContent.split('\n');
        const taskIndent = getTaskIndent(task);
        const closedExists =
          findDateLine(
            existingLines,
            task.line + 1,
            'CLOSED',
            taskIndent,
            this.keywordManager,
          ) >= 0;

        await this.app.vault.process(file, (data) => {
          const lines = data.split('\n');
          updateOrInsertDateLine(
            lines,
            task.line,
            'CLOSED',
            dateStr,
            task,
            this.keywordManager,
          );
          return lines.join('\n');
        });

        lineDelta = closedExists ? 0 : 1;
      }
    }

    return {
      task: {
        ...task,
        closedDate: closedDate,
      },
      lineDelta,
    };
  }

  /**
   * Removes the CLOSED date line below the task.
   * If no CLOSED line exists in the file, returns the task unchanged.
   * Note: This method attempts to remove the CLOSED line regardless of whether
   * the task.closedDate property is set, as there may be a discrepancy between
   * the parsed property and what exists in the file.
   * Returns both the updated task and the line delta (-1 if line removed, 0 if no line found).
   * Note: Unlike removeTaskScheduledDate and removeTaskDeadlineDate, this method always
   * includes lineDelta in the return value (even when 0) due to its DateLineUpdateResult return type.
   */
  async removeTaskClosedDate(
    task: Task,
    forceVaultApi = false,
  ): Promise<DateLineUpdateResult> {
    let lineDelta = 0;

    const file = this.app.vault.getAbstractFileByPath(task.path);
    if (file && file instanceof TFile) {
      const md = this.app.workspace.getActiveViewOfType(MarkdownView);
      // Use Editor API only if NOT forcing Vault API AND file is active in editor (source mode)
      const isActive = !forceVaultApi && md?.file?.path === task.path;
      const editor = md?.editor;

      if (isActive && editor) {
        // Use Editor API when file is open in editor to avoid triggering file watcher
        const taskIndent = getTaskIndent(task);

        // Look for existing CLOSED line after the task
        const closedLineIndex = findDateLine(
          Array.from({ length: editor.lineCount() }, (_, i) =>
            editor.getLine(i),
          ),
          task.line + 1,
          'CLOSED',
          taskIndent,
          this.keywordManager,
        );

        if (closedLineIndex >= 0) {
          // Remove the CLOSED line using Editor API
          const from: EditorPosition = { line: closedLineIndex, ch: 0 };
          const to: EditorPosition = {
            line: closedLineIndex,
            ch: editor.getLine(closedLineIndex).length,
          };
          // Replace with empty string to remove the line
          editor.replaceRange('', from, to);
          // Remove the newline as well by extending to the next line
          const nextLineFrom: EditorPosition = { line: closedLineIndex, ch: 0 };
          const nextLineTo: EditorPosition = {
            line: closedLineIndex + 1,
            ch: 0,
          };
          editor.replaceRange('', nextLineFrom, nextLineTo);
          lineDelta = -1; // Line was removed
        }
      } else {
        // Use Vault API for background edits
        await this.app.vault.process(file, (data) => {
          const lines = data.split('\n');
          const result = removeDateLine(
            lines,
            task.line,
            'CLOSED',
            task,
            this.keywordManager,
          );
          lineDelta = result.lineDelta;
          return lines.join('\n');
        });
      }
    }

    return {
      task: {
        ...task,
        closedDate: null,
      },
      lineDelta,
    };
  }
}
