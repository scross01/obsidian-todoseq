import { Task, DateRepeatInfo } from '../types/task';
import { isCompletedKeyword } from '../utils/task-utils';
import TodoTracker from '../main';
import { TaskStateManager } from './task-state-manager';
import { TFile } from 'obsidian';
import { calculateNextRepeatDate } from '../utils/date-repeater';
import { KeywordManager } from '../utils/keyword-manager';
import { getPluginSettings } from '../utils/settings-utils';

/**
 * TaskUpdateCoordinator provides a centralized way to handle all task state updates
 * from any view (editor, reader, task list, embedded lists).
 *
 * It ensures consistent optimistic UI updates and embed reference refreshing
 * across all open views.
 */
export class TaskUpdateCoordinator {
  private pendingRecurrenceTimeouts: Map<string, NodeJS.Timeout> = new Map();

  constructor(
    private plugin: TodoTracker,
    private taskStateManager: TaskStateManager,
  ) {}

  /**
   * Update a task's state from any view.
   * This is the single entry point for all task state updates.
   *
   * @param task - The task to update
   * @param newState - The new state to set
   * @param source - The source of the update (for debugging/tracking)
   * @returns Promise resolving to the updated task
   */
  async updateTaskState(
    task: Task,
    newState: string,
    source: 'editor' | 'reader' | 'task-list' | 'embedded' = 'editor',
  ): Promise<Task> {
    // 0. Set flag to indicate user-initiated update
    this.plugin.isUserInitiatedUpdate = true;

    try {
      // 1. Optimistic UI update - update in-memory state immediately
      this.performOptimisticUpdate(task, newState);

      // 2. Get the current task from state manager (after optimistic update, it's a new object)
      let currentTask = this.taskStateManager.findTaskByPathAndLine(
        task.path,
        task.line,
      );
      if (!currentTask) {
        currentTask = task; // Fallback to original if not found
      }

      // 3. Update source file via TaskEditor
      let updatedTask: Task;
      const taskEditor = this.plugin.taskEditor;
      if (!taskEditor) {
        throw new Error('TaskEditor is not initialized');
      }
      try {
        updatedTask = await taskEditor.updateTaskState(currentTask, newState);
      } catch (error) {
        console.error(
          `[TODOseq] File write failed for task at line ${task.line}:`,
          error,
        );
        // Rollback: re-read the file to restore state
        const file = this.plugin.app.vault.getAbstractFileByPath(task.path);
        if (file instanceof TFile) {
          await this.plugin.vaultScanner?.processIncrementalChange(file);
        }
        throw error;
      }

      // 3. Perform direct DOM manipulation for embeds immediately
      // This updates the embed display without triggering a full re-render
      // which would cause flicker. The DOM update is synchronous and only
      // touches the specific elements that need to change.
      // Use updatedTask.state for recurring tasks where the final state differs from newState
      this.performDirectEmbedDOMUpdate(currentTask, updatedTask.state);

      // 4. Update the TaskStateManager with the final task state
      // This is important for recurring tasks where the final state may differ
      // from the initial state (e.g., DONE -> TODO after completing a recurring task)
      this.taskStateManager.updateTask(currentTask, {
        rawText: updatedTask.rawText,
        state: updatedTask.state,
        completed: updatedTask.completed,
        scheduledDate: updatedTask.scheduledDate,
        deadlineDate: updatedTask.deadlineDate,
        scheduledDateRepeat: updatedTask.scheduledDateRepeat,
        deadlineDateRepeat: updatedTask.deadlineDateRepeat,
      });

      // 5. Refresh all embedded task lists (code blocks) to reflect the task change
      // This ensures that any todoseq code blocks displaying this task are updated
      if (this.plugin.embeddedTaskListProcessor) {
        this.plugin.embeddedTaskListProcessor.refreshAllEmbeddedTaskLists();
      }

      // 5. Refresh editor decorations to update keyword styling in open editors
      // This ensures the keyword span is properly updated with the new state
      if (this.plugin.refreshVisibleEditorDecorations) {
        this.plugin.refreshVisibleEditorDecorations();
      }

      // 6. Handle recurrence updates
      // Check if the task was marked as completed and has repeating dates
      const settings = getPluginSettings(this.plugin.app);
      const keywordManager = new KeywordManager(settings ?? {});
      const isNowCompleted = keywordManager.isCompleted(updatedTask.state);
      const wasCompleted = keywordManager.isCompleted(currentTask.state);
      const hasRepeatingDates =
        (updatedTask.scheduledDateRepeat != null &&
          updatedTask.scheduledDate != null) ||
        (updatedTask.deadlineDateRepeat != null &&
          updatedTask.deadlineDate != null);

      // Cancel pending recurrence if task is no longer completed
      if (wasCompleted && !isNowCompleted && hasRepeatingDates) {
        this.cancelRecurrenceUpdate(currentTask);
      }

      // Schedule new recurrence if task is now completed and has repeating dates
      if (isNowCompleted && hasRepeatingDates) {
        this.scheduleRecurrenceUpdate(updatedTask);
      }

      return updatedTask;
    } finally {
      this.plugin.isUserInitiatedUpdate = false;
    }
  }

  /**
   * Perform optimistic UI updates immediately.
   * This updates in-memory state and refreshes task list views.
   *
   * Note: Editor and reader views handle their own optimistic updates
   * via CodeMirror decorations and DOM manipulation.
   */
  private performOptimisticUpdate(task: Task, newState: string): void {
    // Update in-memory state - subscriber callback will handle the refresh
    this.taskStateManager.optimisticUpdate(task, newState);
  }

  /**
   * Perform direct DOM manipulation on embeds to update the task state display.
   * This updates the embed display without triggering a full re-render
   * which would cause flicker. The DOM update is synchronous and only
   * touches the specific elements that need to change.
   */
  private performDirectEmbedDOMUpdate(task: Task, newState: string): void {
    // Get the filename from the task path
    const fileName = task.path.split('/').pop()?.replace('.md', '');
    if (!fileName) return;

    // Find all embeds that reference this file
    const embeds = document.querySelectorAll('.internal-embed');

    embeds.forEach((embed) => {
      const src = embed.getAttribute('src');
      if (!src || !src.includes(fileName)) return;

      // If there's a specific embed reference, check if it matches
      if (task.embedReference) {
        const blockRef = task.embedReference.replace('^', '');
        if (!src.includes(blockRef)) return;
      }

      // Find the keyword element within this embed
      // It might have the old state (task.state) or be stale
      const keywordEl = embed.querySelector('[data-task-keyword]');
      if (!keywordEl) return;

      // Get the old state from the element
      const oldState = keywordEl.getAttribute('data-task-keyword');
      if (!oldState || oldState === newState) return;

      // Update the keyword element
      keywordEl.textContent = newState;
      keywordEl.setAttribute('data-task-keyword', newState);
      keywordEl.setAttribute('aria-label', `Task keyword: ${newState}`);

      // Handle completed task styling
      const wasCompleted = isCompletedKeyword(oldState, this.plugin.settings);
      const isNowCompleted = isCompletedKeyword(newState, this.plugin.settings);

      if (wasCompleted && !isNowCompleted) {
        // Transitioning from completed to non-completed: remove strikethrough
        const completedContainer = keywordEl.closest(
          '.todoseq-completed-task-text',
        );
        if (completedContainer && completedContainer.parentNode) {
          // Unwrap the content: move all children out of the completed container
          const parent = completedContainer.parentNode;
          // Move the keyword element first
          parent.insertBefore(keywordEl, completedContainer);
          // Move any other children
          while (completedContainer.firstChild) {
            parent.insertBefore(
              completedContainer.firstChild,
              completedContainer,
            );
          }
          // Remove the empty completed container
          parent.removeChild(completedContainer);
        }
      } else if (!wasCompleted && isNowCompleted) {
        // Transitioning from non-completed to completed: add strikethrough
        // Find the task container
        const taskContainer = keywordEl.closest('.todoseq-task');
        if (taskContainer) {
          // Create completed container
          const completedContainer = document.createElement('span');
          completedContainer.className = 'todoseq-completed-task-text';
          completedContainer.setAttribute('data-completed-task', 'true');

          // Move keyword and all siblings after it into the completed container
          let currentNode = keywordEl.nextSibling;
          const nodesToMove: Node[] = [];
          while (currentNode) {
            nodesToMove.push(currentNode);
            currentNode = currentNode.nextSibling;
          }

          // Add nodes to completed container
          nodesToMove.forEach((node) => {
            completedContainer.appendChild(node);
          });

          // Insert completed container after keyword
          keywordEl.parentNode?.insertBefore(
            completedContainer,
            keywordEl.nextSibling,
          );

          // Move keyword into completed container at the beginning
          completedContainer.insertBefore(
            keywordEl,
            completedContainer.firstChild,
          );
        }
      }
    });
  }

  /**
   * Update a task's priority from any view.
   * This provides optimistic UI updates similar to updateTaskState.
   *
   * @param task - The task to update
   * @param newPriority - The new priority to set (null to remove)
   * @returns Promise resolving to the updated task
   */
  async updateTaskPriority(
    task: Task,
    newPriority: 'high' | 'med' | 'low' | null,
  ): Promise<Task> {
    // 0. Set flag to indicate user-initiated update
    this.plugin.isUserInitiatedUpdate = true;

    try {
      // 1. Get the current task from state manager BEFORE optimistic update
      // This is critical because removeTaskPriority checks if priority exists
      // and we need the task with its original priority value
      let currentTask = this.taskStateManager.findTaskByPathAndLine(
        task.path,
        task.line,
      );
      if (!currentTask) {
        currentTask = task; // Fallback to original if not found
      }

      // 2. Optimistic UI update - update in-memory state immediately
      this.performOptimisticPriorityUpdate(task, newPriority);

      // 3. Update source file via TaskEditor
      let updatedTask: Task;
      const taskEditor = this.plugin.taskEditor;
      if (!taskEditor) {
        throw new Error('TaskEditor is not initialized');
      }

      try {
        if (newPriority === null) {
          updatedTask = await taskEditor.removeTaskPriority(currentTask);
        } else {
          updatedTask = await taskEditor.updateTaskPriority(
            currentTask,
            newPriority,
          );
        }
      } catch (error) {
        console.error(
          `[TODOseq] File write failed for priority change at line ${task.line}:`,
          error,
        );
        // Rollback: re-read the file to restore state
        const file = this.plugin.app.vault.getAbstractFileByPath(task.path);
        if (file instanceof TFile) {
          await this.plugin.vaultScanner?.processIncrementalChange(file);
        }
        throw error;
      }

      // 4. Perform direct DOM manipulation for embeds immediately
      // This updates the embed display without triggering a full re-render
      this.performDirectEmbedPriorityDOMUpdate(currentTask, newPriority);

      // 5. Update the TaskStateManager with the final task state
      this.taskStateManager.updateTask(currentTask, {
        rawText: updatedTask.rawText,
        priority: updatedTask.priority,
      });

      // 6. Refresh all embedded task lists (code blocks) to reflect the task change
      if (this.plugin.embeddedTaskListProcessor) {
        this.plugin.embeddedTaskListProcessor.refreshAllEmbeddedTaskLists();
      }

      // 7. Refresh editor decorations to update priority styling in open editors
      if (this.plugin.refreshVisibleEditorDecorations) {
        this.plugin.refreshVisibleEditorDecorations();
      }

      return updatedTask;
    } finally {
      this.plugin.isUserInitiatedUpdate = false;
    }
  }

  /**
   * Perform optimistic UI updates immediately for priority changes.
   * This updates in-memory state and refreshes task list views.
   */
  private performOptimisticPriorityUpdate(
    task: Task,
    newPriority: 'high' | 'med' | 'low' | null,
  ): void {
    // Update in-memory state - subscriber callback will handle the refresh
    this.taskStateManager.updateTask(task, {
      priority: newPriority,
    });
  }

  /**
   * Perform direct DOM manipulation on embeds to update the task priority display.
   * This updates the embed display without triggering a full re-render.
   */
  private performDirectEmbedPriorityDOMUpdate(
    task: Task,
    newPriority: 'high' | 'med' | 'low' | null,
  ): void {
    // Get the filename from the task path
    const fileName = task.path.split('/').pop()?.replace('.md', '');
    if (!fileName) return;

    // Find all embeds that reference this file
    const embeds = document.querySelectorAll('.internal-embed');

    embeds.forEach((embed) => {
      const src = embed.getAttribute('src');
      if (!src || !src.includes(fileName)) return;

      // If there's a specific embed reference, check if it matches
      if (task.embedReference) {
        const blockRef = task.embedReference.replace('^', '');
        if (!src.includes(blockRef)) return;
      }

      // Find all task items in this embed
      const taskItems = embed.querySelectorAll('.embedded-task-item');

      taskItems.forEach((item) => {
        const itemPath = item.getAttribute('data-path');
        const itemLine = item.getAttribute('data-line');

        // Check if this is the task we're updating
        if (itemPath !== task.path || itemLine !== String(task.line)) return;

        // Find the priority badge in this task item
        const priorityBadge = item.querySelector('.priority-badge');
        const textContainer = item.querySelector(
          '.embedded-task-text-container',
        );

        if (!textContainer) return;

        if (newPriority === null) {
          // Remove priority badge
          if (priorityBadge) {
            priorityBadge.remove();
          }
        } else {
          // Update or add priority badge
          const priorityLabel =
            newPriority === 'high' ? 'A' : newPriority === 'med' ? 'B' : 'C';

          if (priorityBadge) {
            // Update existing badge
            priorityBadge.textContent = priorityLabel;
            priorityBadge.className = [
              'priority-badge',
              `priority-${newPriority}`,
            ].join(' ');
            priorityBadge.setAttribute('aria-label', `Priority ${newPriority}`);
            priorityBadge.setAttribute('title', `Priority ${newPriority}`);
          } else {
            // Create new badge
            const newBadge = document.createElement('span');
            newBadge.className = [
              'priority-badge',
              `priority-${newPriority}`,
            ].join(' ');
            newBadge.textContent = priorityLabel;
            newBadge.setAttribute('aria-label', `Priority ${newPriority}`);
            newBadge.setAttribute('title', `Priority ${newPriority}`);

            // Insert after state span
            const stateSpan = textContainer.querySelector(
              '.embedded-task-state',
            );
            if (stateSpan && stateSpan.nextSibling) {
              textContainer.insertBefore(newBadge, stateSpan.nextSibling);
            } else {
              textContainer.appendChild(newBadge);
            }
          }
        }
      });
    });
  }

  /**
   * Update a task's scheduled date from any view.
   * This provides optimistic UI updates similar to updateTaskState.
   *
   * @param task - The task to update
   * @param date - The new scheduled date (null to remove)
   * @returns Promise resolving to the updated task
   */
  async updateTaskScheduledDate(task: Task, date: Date | null): Promise<Task> {
    // 0. Set flag to indicate user-initiated update
    this.plugin.isUserInitiatedUpdate = true;

    try {
      // 1. Optimistic UI update - update in-memory state immediately
      this.performOptimisticScheduledDateUpdate(task, date);

      // 2. Get the current task from state manager (after optimistic update, it's a new object)
      let currentTask = this.taskStateManager.findTaskByPathAndLine(
        task.path,
        task.line,
      );
      if (!currentTask) {
        currentTask = task; // Fallback to original if not found
      }

      // 3. Update source file via TaskEditor
      let updatedTask: Task;
      const taskEditor = this.plugin.taskEditor;
      if (!taskEditor) {
        throw new Error('TaskEditor is not initialized');
      }

      try {
        if (date === null) {
          updatedTask = await taskEditor.removeTaskScheduledDate(currentTask);
        } else {
          updatedTask = await taskEditor.updateTaskScheduledDate(
            currentTask,
            date,
          );
        }
      } catch (error) {
        console.error(
          `[TODOseq] File write failed for scheduled date change at line ${task.line}:`,
          error,
        );
        // Rollback: re-read the file to restore state
        const file = this.plugin.app.vault.getAbstractFileByPath(task.path);
        if (file instanceof TFile) {
          await this.plugin.vaultScanner?.processIncrementalChange(file);
        }
        throw error;
      }

      // 4. Update the TaskStateManager with the final task state
      this.taskStateManager.updateTask(currentTask, {
        rawText: updatedTask.rawText,
        scheduledDate: updatedTask.scheduledDate,
      });

      // 5. Refresh all embedded task lists (code blocks) to reflect the task change
      if (this.plugin.embeddedTaskListProcessor) {
        this.plugin.embeddedTaskListProcessor.refreshAllEmbeddedTaskLists();
      }

      // 6. Refresh editor decorations to update date styling in open editors
      if (this.plugin.refreshVisibleEditorDecorations) {
        this.plugin.refreshVisibleEditorDecorations();
      }

      return updatedTask;
    } finally {
      this.plugin.isUserInitiatedUpdate = false;
    }
  }

  /**
   * Perform optimistic UI updates immediately for scheduled date changes.
   * This updates in-memory state and refreshes task list views.
   */
  private performOptimisticScheduledDateUpdate(
    task: Task,
    date: Date | null,
  ): void {
    // Update in-memory state - subscriber callback will handle the refresh
    this.taskStateManager.updateTask(task, {
      scheduledDate: date,
    });
  }

  /**
   * Schedule a delayed recurrence update for a completed recurring task.
   * Cancels any existing pending update for this task.
   */
  private scheduleRecurrenceUpdate(task: Task): void {
    const key = `${task.path}:${task.line}`;

    // Cancel any existing pending update for this task
    const existingTimeout = this.pendingRecurrenceTimeouts.get(key);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }

    // Schedule new update after 3 seconds
    const timeout = setTimeout(async () => {
      this.pendingRecurrenceTimeouts.delete(key);
      await this.performRecurrenceUpdate(task);
    }, 3000);

    this.pendingRecurrenceTimeouts.set(key, timeout);
  }

  /**
   * Cancel a pending recurrence update for a task.
   */
  private cancelRecurrenceUpdate(task: Task): void {
    const key = `${task.path}:${task.line}`;
    const existingTimeout = this.pendingRecurrenceTimeouts.get(key);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
      this.pendingRecurrenceTimeouts.delete(key);
    }
  }

  /**
   * Perform the recurrence update: advance dates and reset to inactive state.
   */
  private async performRecurrenceUpdate(task: Task): Promise<void> {
    const settings = getPluginSettings(this.plugin.app);
    const keywordManager = new KeywordManager(settings ?? {});
    const defaultInactive =
      settings?.stateTransitions?.defaultInactive || 'TODO';

    // Check if task has repeating dates that need updating
    const hasScheduledRepeat = task.scheduledDateRepeat != null;
    const hasDeadlineRepeat = task.deadlineDateRepeat != null;

    if (!hasScheduledRepeat && !hasDeadlineRepeat) {
      return;
    }

    try {
      const file = this.plugin.app.vault.getAbstractFileByPath(task.path);
      if (!file || !(file instanceof TFile)) {
        console.error('[TODOseq] File not found for recurrence update');
        return;
      }

      const content = await this.plugin.app.vault.read(file);
      const lines = content.split('\n');

      if (task.line >= lines.length) {
        console.error('[TODOseq] Task line out of bounds');
        return;
      }

      const parser = this.plugin.vaultScanner?.getParser();
      if (!parser) {
        console.error('[TODOseq] Parser not available for recurrence update');
        return;
      }

      // Get task indent level to properly identify date lines for this task
      // This must include quote prefix, bullet marker, or checkbox marker for proper date line detection
      const currentLine = lines[task.line];
      let taskIndent = '';

      if (currentLine) {
        // Check for quote block tasks: > TODO task or > > TODO task
        const quotePrefixMatch = currentLine.match(/^(\s*)(>\s*)+/);
        if (quotePrefixMatch) {
          taskIndent = quotePrefixMatch[0];
        } else {
          // Check for checkbox tasks: - [ ] TODO task
          // For checkbox tasks, use 2-space indent (aligning with task text)
          const checkboxMatch = currentLine.match(/^(\s*)- \[([ x])\] /);
          if (checkboxMatch) {
            // Use leading whitespace + 2 spaces (aligning with task text)
            taskIndent = checkboxMatch[1] + '  ';
          } else {
            // Check for bulleted tasks: - TODO task or + TODO task or * TODO task
            const bulletMatch = currentLine.match(/^([-*+])\s+(.*)/);
            if (bulletMatch) {
              const leadingWhitespace = currentLine.match(/^(\s*)/)?.[1] ?? '';
              taskIndent = leadingWhitespace + '  ';
            } else {
              taskIndent = currentLine.match(/^(\s*)/)?.[1] ?? '';
            }
          }
        }
      }

      const now = new Date();
      let scheduledUpdated = false;
      let deadlineUpdated = false;
      let newScheduledDate: Date | null = null;
      let newDeadlineDate: Date | null = null;

      // Scan lines after the task line (max 8 levels of nesting)
      const scheduledRepeat = task.scheduledDateRepeat;
      const deadlineRepeat = task.deadlineDateRepeat;
      for (
        let i = task.line + 1;
        i < Math.min(task.line + 9, lines.length);
        i++
      ) {
        const line = lines[i];

        // Use parser's getDateLineType to properly detect date lines
        const dateType = parser.getDateLineType(line, taskIndent);

        // Stop if this is not a date line (indicates we've moved past the task's date lines)
        if (dateType === null) {
          break;
        }

        // Only process the first SCHEDULED and first DEADLINE
        if (
          dateType === 'scheduled' &&
          !scheduledUpdated &&
          hasScheduledRepeat &&
          scheduledRepeat
        ) {
          const date = parser.parseDateFromLine(line);
          if (date) {
            newScheduledDate = calculateNextRepeatDate(
              date,
              scheduledRepeat,
              now,
            );
            scheduledUpdated = true;
          }
        } else if (
          dateType === 'deadline' &&
          !deadlineUpdated &&
          hasDeadlineRepeat &&
          deadlineRepeat
        ) {
          const date = parser.parseDateFromLine(line);
          if (date) {
            newDeadlineDate = calculateNextRepeatDate(
              date,
              deadlineRepeat,
              now,
            );
            deadlineUpdated = true;
          }
        }

        // Stop if we've found both dates
        if (scheduledUpdated && deadlineUpdated) {
          break;
        }
      }

      // If no dates need updating, return
      if (!newScheduledDate && !newDeadlineDate) {
        return;
      }

      // Now update the date lines in the file
      scheduledUpdated = false;
      deadlineUpdated = false;
      let lineUpdated = false;

      for (
        let i = task.line + 1;
        i < Math.min(task.line + 9, lines.length);
        i++
      ) {
        const line = lines[i];
        const dateType = parser.getDateLineType(line, taskIndent);

        if (dateType === null) {
          break;
        }

        // Update scheduled date line
        if (dateType === 'scheduled' && !scheduledUpdated && newScheduledDate) {
          lines[i] = this.formatDateLine(
            line,
            newScheduledDate,
            task.scheduledDateRepeat,
          );
          scheduledUpdated = true;
          lineUpdated = true;
        }
        // Update deadline date line
        else if (
          dateType === 'deadline' &&
          !deadlineUpdated &&
          newDeadlineDate
        ) {
          lines[i] = this.formatDateLine(
            line,
            newDeadlineDate,
            task.deadlineDateRepeat,
          );
          deadlineUpdated = true;
          lineUpdated = true;
        }

        if (scheduledUpdated && deadlineUpdated) {
          break;
        }
      }

      // Update the task line state keyword to inactive
      const taskLine = lines[task.line];
      const allKeywords = keywordManager.getAllKeywords();

      for (const keyword of allKeywords) {
        if (taskLine.includes(keyword)) {
          lines[task.line] = taskLine.replace(keyword, defaultInactive);
          lineUpdated = true;
          break;
        }
      }

      if (lineUpdated) {
        this.plugin.isRecurrenceUpdate = true;

        await this.plugin.app.vault.modify(file, lines.join('\n'));
        console.debug(
          `[TODOseq] Recurrence update: ${task.path}:${task.line} -> ${defaultInactive}`,
        );

        const currentTask = this.taskStateManager.findTaskByPathAndLine(
          task.path,
          task.line,
        );
        if (currentTask) {
          this.taskStateManager.updateTask(currentTask, {
            rawText: lines[task.line],
            state: defaultInactive,
            completed: false,
            scheduledDate: newScheduledDate ?? currentTask.scheduledDate,
            deadlineDate: newDeadlineDate ?? currentTask.deadlineDate,
          });
        }

        setTimeout(() => {
          this.plugin.isRecurrenceUpdate = false;
        }, 100);
      }

      if (this.plugin.embeddedTaskListProcessor) {
        this.plugin.embeddedTaskListProcessor.refreshAllEmbeddedTaskLists();
      }

      if (this.plugin.refreshVisibleEditorDecorations) {
        this.plugin.refreshVisibleEditorDecorations();
      }
    } catch (error) {
      console.error('[TODOseq] Failed to perform recurrence update:', error);
    }
  }

  /**
   * Format a date line with a new date, preserving the original line's prefix and repeater
   */
  private formatDateLine(
    line: string,
    newDate: Date,
    repeat: DateRepeatInfo | null | undefined,
  ): string {
    const year = newDate.getFullYear();
    const month = String(newDate.getMonth() + 1).padStart(2, '0');
    const day = String(newDate.getDate()).padStart(2, '0');
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const dayName = days[newDate.getDay()];

    // Extract the date content from the angle brackets
    const dateContentMatch = line.match(/<(.[^>]*)>/);
    if (!dateContentMatch) {
      return line;
    }

    const oldDateContent = dateContentMatch[1];

    // Check for time in old date - time can appear in various positions:
    // - <2008-02-08 20:00 Fri ++1d> (time before DOW)
    // - <2008-02-08 Fri 20:00 ++1d> (time after DOW)
    // - <2008-02-08 20:00 ++1d> (time before repeater)
    // - <2008-02-08 20:00> (just time)
    const timeMatch = oldDateContent.match(/(\d{2}:\d{2})/);
    const timeStr = timeMatch ? ` ${timeMatch[1]}` : '';

    // Build new date content: always DOW before time
    let newDateContent = `${year}-${month}-${day} ${dayName}${timeStr}`;

    // Add repeater if present
    if (repeat) {
      newDateContent += ` ${repeat.raw}`;
    }

    return line.replace(/<.[^>]*>/, `<${newDateContent}>`);
  }
}
