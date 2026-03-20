import { App, TFile, MarkdownView, EditorPosition } from 'obsidian';
import { Task, DateRepeatInfo } from '../types/task';
import {
  PRIORITY_TOKEN_REGEX,
  CHECKBOX_REGEX,
  CHECKBOX_DETECTION_REGEX,
} from '../utils/patterns';
import { KeywordManager } from '../utils/keyword-manager';
import { TaskStateTransitionManager } from './task-state-transition-manager';
import { DateUtils } from '../utils/date-utils';
import { findDateLine, getTaskIndent } from '../utils/task-line-utils';
import TodoTracker from '../main';

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
    private readonly keywordManager: KeywordManager,
  ) {}

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
      // For other states, use the default logic (check if it's a completed state)
      const isArchived = keywordManagerInstance.isArchived(newState);
      const isCompleted = keywordManagerInstance.isCompleted(newState);
      const checkboxStatus = isArchived
        ? currentCheckboxState
        : isCompleted
          ? 'x'
          : ' ';
      const textPart = task.text ? ` ${task.text}` : '';
      newLine = `${indentWithoutQuote}${quotePrefix}${currentListMarkerChar} [${checkboxStatus}] ${newState}${priorityPart}${textPart}`;
    } else {
      // Generate original format, preserving comment prefix if present
      const textPart = task.text ? ` ${task.text}` : '';
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

          // Special cursor positioning for blank lines when adding task keywords
          if (currentLine.trim() === '' && newState === 'TODO') {
            // Position cursor after the TODO keyword on blank lines
            const keywordPosition = newLine.indexOf('TODO');
            if (keywordPosition !== -1) {
              const newCursorPosition = keywordPosition + 'TODO'.length;
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

          // Handle CLOSED date atomically with task line update
          if (dateStr !== null) {
            // Adding CLOSED date
            const currentLine = lines[task.line];
            const taskIndent = getTaskIndent(currentLine);

            // Search for existing CLOSED line
            const closedLineIndex = findDateLine(
              lines,
              task.line + 1,
              'CLOSED',
              taskIndent,
              this.keywordManager,
            );

            // Find insert position (after DEADLINE/SCHEDULED if present, otherwise after task)
            let insertIndex = task.line + 1;
            const deadlineLineIndex = findDateLine(
              lines,
              task.line + 1,
              'DEADLINE',
              taskIndent,
              this.keywordManager,
            );
            if (deadlineLineIndex !== -1) {
              insertIndex = deadlineLineIndex + 1;
            } else {
              const scheduledLineIndex = findDateLine(
                lines,
                task.line + 1,
                'SCHEDULED',
                taskIndent,
                this.keywordManager,
              );
              if (scheduledLineIndex !== -1) {
                insertIndex = scheduledLineIndex + 1;
              }
            }

            // Preserve existing indentation of CLOSED line if found
            let closedIndent = taskIndent;
            if (closedLineIndex >= 0) {
              const line = lines[closedLineIndex];
              const lineIndent = line.match(/^(\s*)/)?.[1] ?? '';
              const lineQuotePrefix = line.match(/^(\s*(>\s*)+)/)?.[1] ?? '';
              closedIndent = lineQuotePrefix || lineIndent;
            }

            if (closedLineIndex >= 0) {
              lines[closedLineIndex] = `${closedIndent}CLOSED: ${dateStr}`;
            } else {
              lines.splice(insertIndex, 0, `${closedIndent}CLOSED: ${dateStr}`);
            }
          } else if (shouldRemoveClosed) {
            // Removing CLOSED date
            const currentLine = lines[task.line];
            const taskIndent = getTaskIndent(currentLine);

            const closedLineIndex = findDateLine(
              lines,
              task.line + 1,
              'CLOSED',
              taskIndent,
              this.keywordManager,
            );
            if (closedLineIndex >= 0) {
              lines.splice(closedLineIndex, 1);
            }
          }

          return lines.join('\n');
        });
      }
    }

    // For source mode, handle CLOSED date separately (Editor API doesn't support atomic multi-line operations)
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
      state: newState as Task['state'],
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
      const settings = this.settings;
      const stateManager = new TaskStateTransitionManager(
        this.keywordManager,
        settings?.stateTransitions,
      );
      state = stateManager.getNextState(task.state);
    } else {
      state = nextState;
    }
    return await this.applyLineUpdate(task, state, true, forceVaultApi);
  }

  // Cycles a task to its next state according to CYCLE_BULLET_STATE and persists change
  async updateTaskCycleState(
    task: Task,
    nextState: string | null = null,
    forceVaultApi = false,
  ): Promise<Task> {
    let state: string;
    if (nextState == null) {
      const settings = this.settings;
      const stateManager = new TaskStateTransitionManager(
        this.keywordManager,
        settings?.stateTransitions,
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
    const { newLine } = TaskWriter.generateTaskLine(
      task,
      task.state,
      true, // Keep existing priority
      this.keywordManager,
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
      const textPart = text ? ` ${text}` : '';
      newTaskLine = `${indent}${listMarker} ${state} ${priorityToken}${textPart}`;
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
        // Check for quote block tasks: > TODO task text or > > TODO task text
        // For nested quotes like "> >", we need to handle spaces between > characters
        const quoteMatch = /^(\s*)(>\s*)+(.+)$/.exec(cleanedLine);
        if (quoteMatch) {
          // For quote block tasks: > TODO task text or > > TODO task text
          // Insert priority after the state with proper spacing
          const indent = quoteMatch[1];
          // quoteMatch[2] will be the last > in the chain (e.g., ">" or "> ")
          // We need to reconstruct the full quote prefix
          const fullMatch = quoteMatch[0].substring(indent.length);
          const quotePrefixMatch = /^(\s*)(>\s*)+/.exec(fullMatch);
          const quotePrefix = quotePrefixMatch
            ? quotePrefixMatch[0].trimEnd()
            : '>';
          const rest = quoteMatch[3]; // Already starts after the quote prefix

          // Split the rest (after quote prefix) into state and description
          const restParts = rest.trim().split(' ');
          if (restParts.length >= 2) {
            const state = restParts[0];
            const description = restParts.slice(1).join(' ');
            newTaskLine = `${indent}${quotePrefix} ${state} ${priorityToken} ${description}`;
          } else {
            // Fallback for malformed quote tasks
            newTaskLine = `${indent}${quotePrefix} ${rest} ${priorityToken}`;
          }
        } else {
          // For non-checkbox, non-bulleted, non-quote tasks: TODO task text
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
    }

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

    // Strip the priority token from the raw text
    // Replace with a single space to preserve spacing between task keyword and text
    const newTaskLine = task.rawText
      .replace(PRIORITY_TOKEN_REGEX, ' ')
      .replace(/  +/g, ' ') // collapse double spaces left by removal
      .trim(); // trim any leading/trailing whitespace

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
        const currentLine = lines[task.line];

        // Get the proper indent including quote prefix, bullet, or checkbox marker
        const taskIndent = getTaskIndent(currentLine);

        // Look for existing SCHEDULED line after the task
        const scheduledLineIndex = findDateLine(
          lines,
          task.line + 1,
          'SCHEDULED',
          taskIndent,
          this.keywordManager,
        );

        // Preserve the existing indentation of the SCHEDULED line if found
        let existingScheduledIndent = '';
        if (scheduledLineIndex >= 0) {
          const line = lines[scheduledLineIndex];
          const lineIndent = line.match(/^(\s*)/)?.[1] ?? '';
          const lineQuotePrefix = line.match(/^(\s*(>\s*)+)/)?.[1] ?? '';
          existingScheduledIndent = lineQuotePrefix || lineIndent;
        }

        // Use existing indent if updating, otherwise use task indent (aligned to keyword start)
        const scheduledIndent = existingScheduledIndent || taskIndent;

        if (scheduledLineIndex >= 0) {
          // Update existing SCHEDULED line, preserving its indentation
          lines[scheduledLineIndex] = `${scheduledIndent}SCHEDULED: ${dateStr}`;
          lineDelta = 0; // Updated in place, no line count change
        } else {
          // Insert new SCHEDULED line
          // If task has deadline date, insert before the deadline line
          // Otherwise insert after the task line
          let insertIndex: number;

          if (task.deadlineDate) {
            // Find the deadline line index
            const deadlineLineIndex = findDateLine(
              lines,
              task.line + 1,
              'DEADLINE',
              taskIndent,
              this.keywordManager,
            );
            // Insert before deadline line if found, otherwise after task line
            insertIndex =
              deadlineLineIndex >= 0 ? deadlineLineIndex : task.line + 1;
          } else {
            insertIndex = task.line + 1;
          }

          lines.splice(
            insertIndex,
            0,
            `${scheduledIndent}SCHEDULED: ${dateStr}`,
          );
          lineDelta = 1; // New line inserted
        }

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
   * Returns the updated task with lineDelta for the coordinator to adjust subsequent task indices.
   */
  async removeTaskScheduledDate(
    task: Task,
  ): Promise<Task & { lineDelta?: number }> {
    let lineDelta = 0;

    const file = this.app.vault.getAbstractFileByPath(task.path);
    if (file && file instanceof TFile) {
      await this.app.vault.process(file, (data) => {
        const lines = data.split('\n');
        const currentLine = lines[task.line];

        // Get the proper indent including quote prefix, bullet, or checkbox marker
        const taskIndent = getTaskIndent(currentLine);

        // Look for existing SCHEDULED line after the task
        const scheduledLineIndex = findDateLine(
          lines,
          task.line + 1,
          'SCHEDULED',
          taskIndent,
          this.keywordManager,
        );

        if (scheduledLineIndex >= 0) {
          lines.splice(scheduledLineIndex, 1); // Remove the SCHEDULED line
          lineDelta = -1; // Line was removed
        }

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
   * If no DEADLINE line exists, a new one is inserted after the task line.
   * Returns the updated task with lineDelta for the coordinator to adjust subsequent task indices.
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
        const currentLine = lines[task.line];

        // Get the proper indent including quote prefix, bullet, or checkbox marker
        const taskIndent = getTaskIndent(currentLine);

        // Look for existing DEADLINE line after the task
        const deadlineLineIndex = findDateLine(
          lines,
          task.line + 1,
          'DEADLINE',
          taskIndent,
          this.keywordManager,
        );

        // Preserve the existing indentation of the DEADLINE line if found
        let existingDeadlineIndent = '';
        if (deadlineLineIndex >= 0) {
          const line = lines[deadlineLineIndex];
          const lineIndent = line.match(/^(\s*)/)?.[1] ?? '';
          const lineQuotePrefix = line.match(/^(\s*(>\s*)+)/)?.[1] ?? '';
          existingDeadlineIndent = lineQuotePrefix || lineIndent;
        }

        // Use existing indent if updating, otherwise use task indent (aligned to keyword start)
        const deadlineIndent = existingDeadlineIndent || taskIndent;

        if (deadlineLineIndex >= 0) {
          // Update existing DEADLINE line, preserving its indentation
          lines[deadlineLineIndex] = `${deadlineIndent}DEADLINE: ${dateStr}`;
          lineDelta = 0; // Updated in place, no line count change
        } else {
          // Insert new DEADLINE line
          // If task has scheduled date, insert after the scheduled line
          // Otherwise insert after the task line
          let insertIndex: number;

          if (task.scheduledDate) {
            // Find the scheduled line index
            const scheduledLineIndex = findDateLine(
              lines,
              task.line + 1,
              'SCHEDULED',
              taskIndent,
              this.keywordManager,
            );
            // Insert after scheduled line if found, otherwise after task line
            insertIndex =
              scheduledLineIndex >= 0 ? scheduledLineIndex + 1 : task.line + 1;
          } else {
            insertIndex = task.line + 1;
          }

          lines.splice(insertIndex, 0, `${deadlineIndent}DEADLINE: ${dateStr}`);
          lineDelta = 1; // New line inserted
        }

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
   * Returns the updated task with lineDelta for the coordinator to adjust subsequent task indices.
   */
  async removeTaskDeadlineDate(
    task: Task,
  ): Promise<Task & { lineDelta?: number }> {
    let lineDelta = 0;

    const file = this.app.vault.getAbstractFileByPath(task.path);
    if (file && file instanceof TFile) {
      await this.app.vault.process(file, (data) => {
        const lines = data.split('\n');
        const currentLine = lines[task.line];

        // Get the proper indent including quote prefix, bullet, or checkbox marker
        const taskIndent = getTaskIndent(currentLine);

        // Look for existing DEADLINE line after the task
        const deadlineLineIndex = findDateLine(
          lines,
          task.line + 1,
          'DEADLINE',
          taskIndent,
          this.keywordManager,
        );

        if (deadlineLineIndex >= 0) {
          lines.splice(deadlineLineIndex, 1); // Remove the DEADLINE line
          lineDelta = -1; // Line was removed
        }

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
        const currentLine = lines[task.line];

        // Get the proper indent including quote prefix, bullet, or checkbox marker
        const taskIndent = getTaskIndent(currentLine);

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

        // Find insert position (after DEADLINE/SCHEDULED if present, otherwise after task)
        // findDateLine now properly stops at task lines, so we can use the result directly
        const deadlineLineIndex = findDateLine(
          lines,
          task.line + 1,
          'DEADLINE',
          taskIndent,
          this.keywordManager,
        );

        // Calculate insert index - default to right after task
        let insertIndex = task.line + 1;

        // If DEADLINE found, insert after it
        if (deadlineLineIndex !== -1) {
          insertIndex = deadlineLineIndex + 1;
        } else {
          // Search for SCHEDULED
          const scheduledLineIndex = findDateLine(
            lines,
            task.line + 1,
            'SCHEDULED',
            taskIndent,
            this.keywordManager,
          );
          if (scheduledLineIndex !== -1) {
            insertIndex = scheduledLineIndex + 1;
          }
        }

        // Preserve the existing indentation of the CLOSED line if found
        let existingClosedIndent = '';
        if (closedLineIndex >= 0) {
          const line = lines[closedLineIndex];
          const lineIndent = line.match(/^(\s*)/)?.[1] ?? '';
          const lineQuotePrefix = line.match(/^(\s*(>\s*)+)/)?.[1] ?? '';
          existingClosedIndent = lineQuotePrefix || lineIndent;
        }

        // Use existing indent if updating, otherwise use task indent (aligned to keyword start)
        const closedIndent = existingClosedIndent || taskIndent;

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
        // Use Vault API for background edits
        await this.app.vault.process(file, (data) => {
          const lines = data.split('\n');
          const currentLine = lines[task.line];

          // Get the proper indent including quote prefix, bullet, or checkbox marker
          const taskIndent = getTaskIndent(currentLine);

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

          // Find insert position (after DEADLINE/SCHEDULED if present, otherwise after task)
          // findDateLine now properly stops at task lines
          const deadlineLineIndex = findDateLine(
            lines,
            task.line + 1,
            'DEADLINE',
            taskIndent,
            this.keywordManager,
          );

          // Calculate insert index - default to right after task
          let insertIndex = task.line + 1;

          // If DEADLINE found, insert after it
          if (deadlineLineIndex !== -1) {
            insertIndex = deadlineLineIndex + 1;
          } else {
            // Search for SCHEDULED
            const scheduledLineIndex = findDateLine(
              lines,
              task.line + 1,
              'SCHEDULED',
              taskIndent,
              this.keywordManager,
            );
            if (scheduledLineIndex !== -1) {
              insertIndex = scheduledLineIndex + 1;
            }
          }

          // Preserve the existing indentation of the CLOSED line if found
          let existingClosedIndent = '';
          if (closedLineIndex >= 0) {
            const line = lines[closedLineIndex];
            const lineIndent = line.match(/^(\s*)/)?.[1] ?? '';
            const lineQuotePrefix = line.match(/^(\s*(>\s*)+)/)?.[1] ?? '';
            existingClosedIndent = lineQuotePrefix || lineIndent;
          }

          // Use existing indent if updating, otherwise use task indent (aligned to keyword start)
          const closedIndent = existingClosedIndent || taskIndent;

          if (closedLineIndex >= 0) {
            // Update existing CLOSED line, preserving its indentation
            lines[closedLineIndex] = `${closedIndent}CLOSED: ${dateStr}`;
          } else {
            // Insert new CLOSED line at calculated position
            lines.splice(insertIndex, 0, `${closedIndent}CLOSED: ${dateStr}`);
          }

          return lines.join('\n');
        });
        // Calculate lineDelta - search the file after the update to determine which happened
        const fileContent = await this.app.vault.read(file);
        const afterLines = fileContent.split('\n');
        const afterTaskIndent = getTaskIndent(afterLines[task.line]);
        const afterClosedLineIndex = findDateLine(
          afterLines,
          task.line + 1,
          'CLOSED',
          afterTaskIndent,
          this.keywordManager,
        );
        lineDelta = afterClosedLineIndex === -1 ? 1 : 0;
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
        const currentLine = editor.getLine(task.line);
        const taskIndent = getTaskIndent(currentLine);

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
          const currentLine = lines[task.line];

          // Get the proper indent including quote prefix, bullet, or checkbox marker
          const taskIndent = getTaskIndent(currentLine);

          // Look for existing CLOSED line after the task
          const closedLineIndex = findDateLine(
            lines,
            task.line + 1,
            'CLOSED',
            taskIndent,
            this.keywordManager,
          );

          if (closedLineIndex >= 0) {
            lines.splice(closedLineIndex, 1); // Remove the CLOSED line
            lineDelta = -1; // Line was removed
          }

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

  async writeLines(path: string, lines: string[]): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!file || !(file instanceof TFile)) {
      throw new Error(`File not found: ${path}`);
    }

    const md = this.app.workspace.getActiveViewOfType(MarkdownView);
    const isActive = md?.file?.path === path;
    const editor = md?.editor;
    const isSourceMode =
      isActive &&
      editor &&
      md?.getViewType() === 'markdown' &&
      md?.getMode?.() === 'source';

    if (isSourceMode) {
      // Get current content to determine line lengths
      const currentContent = editor.getValue();
      const currentLines = currentContent.split('\n');

      // Apply changes to current content
      const newContent = [...currentLines];
      for (let i = 0; i < lines.length && i < newContent.length; i++) {
        if (lines[i] !== newContent[i]) {
          newContent[i] = lines[i];
        }
      }

      // Replace entire editor content
      editor.setValue(newContent.join('\n'));
    } else {
      // Not in source mode: use vault.modify
      await this.app.vault.modify(file, lines.join('\n'));
    }
  }
}
