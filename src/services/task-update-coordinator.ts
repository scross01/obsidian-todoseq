/**
 * TaskUpdateCoordinator provides a centralized way to handle all task state updates
 * from any view (editor, reader, task list, embedded lists).
 *
 * It ensures consistent optimistic UI updates and embed reference refreshing
 * across all open views.
 */
import { Task, DateRepeatInfo } from '../types/task';
import { isCompletedKeyword } from '../utils/task-utils';
import TodoTracker from '../main';
import { TaskStateManager } from './task-state-manager';
import { TFile } from 'obsidian';
import { KeywordManager } from '../utils/keyword-manager';
import { getPluginSettings } from '../utils/settings-utils';
import { ChangeTracker } from './change-tracker';
import { RecurrenceCoordinator } from './recurrence-coordinator';

export class TaskUpdateCoordinator {
  private changeTracker: ChangeTracker;
  private recurrenceCoordinator: RecurrenceCoordinator;

  constructor(
    private plugin: TodoTracker,
    private taskStateManager: TaskStateManager,
    private keywordManager: KeywordManager,
  ) {
    // Initialize ChangeTracker with default options
    this.changeTracker = new ChangeTracker({
      defaultTimeoutMs: 5000,
      debug: false,
    });

    // Initialize RecurrenceCoordinator
    this.recurrenceCoordinator = new RecurrenceCoordinator(
      this.plugin.app,
      this.taskStateManager,
      { debug: false },
    );
  }

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
    // 0. Register expected change with ChangeTracker
    // We'll register the change before writing to track it
    const expectedContent = await this.getExpectedFileContent(task, newState);
    this.changeTracker.registerExpectedChange(
      task.path,
      expectedContent,
      5000,
      { source },
    );

    try {
      // 1. Optimistic UI update - update in-memory state immediately
      this.performOptimisticUpdate(task, newState);

      // 2. Get current task from the state manager (after optimistic update, it's a new object)
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
        // Rollback: re-read file to restore state
        const file = this.plugin.app.vault.getAbstractFileByPath(task.path);
        if (file instanceof TFile) {
          await this.plugin.vaultScanner?.processIncrementalChange(file);
        }
        throw error;
      }

      // 3.2. Perform direct DOM manipulation for embeds immediately
      // This updates the embed display without triggering a full re-render
      // which would cause flicker. The DOM update is synchronous and only
      // touches specific elements that need to change.
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
        closedDate: updatedTask.closedDate,
      });

      // 5. Refresh all embedded task lists (code blocks) to reflect the task change
      // This ensures that any todoseq code blocks displaying this task are updated
      if (this.plugin.embeddedTaskListProcessor) {
        this.plugin.embeddedTaskListProcessor.refreshAllEmbeddedTaskLists();
      }

      // 6. Refresh editor decorations to show the updated task state
      if (this.plugin.refreshVisibleEditorDecorations) {
        this.plugin.refreshVisibleEditorDecorations();
      }

      // 7. Handle recurrence updates
      // Check if the task was marked as completed and has repeating dates
      const settings = getPluginSettings(this.plugin.app);
      const isNowCompleted = this.keywordManager.isCompleted(updatedTask.state);
      const wasCompleted = this.keywordManager.isCompleted(currentTask.state);
      const hasRepeatingDates =
        (updatedTask.scheduledDateRepeat != null &&
          updatedTask.scheduledDate != null) ||
        (updatedTask.deadlineDateRepeat != null &&
          updatedTask.deadlineDate != null);

      // Cancel pending recurrence if task is no longer completed
      if (wasCompleted && !isNowCompleted && hasRepeatingDates) {
        this.recurrenceCoordinator.cancelRecurrence(currentTask);
      }

      // Schedule new recurrence if task is now completed and has repeating dates
      if (isNowCompleted && hasRepeatingDates) {
        this.recurrenceCoordinator.scheduleRecurrence(currentTask, 3000);
      }

      // 8. Handle CLOSED date tracking
      if (settings && settings.trackClosedDate) {
        const oldIsCompleted = this.keywordManager.isCompleted(task.state);
        const newIsCompleted = this.keywordManager.isCompleted(
          updatedTask.state,
        );
        const newIsArchived = this.keywordManager.isArchived(updatedTask.state);

        // Only manage CLOSED date if not transitioning to archived state
        if (!newIsArchived) {
          // Not-done -> Done: add/update CLOSED date
          if (!oldIsCompleted && newIsCompleted) {
            const closedDate = new Date();
            try {
              updatedTask = await taskEditor.updateTaskClosedDate(
                updatedTask,
                closedDate,
              );
            } catch (error) {
              console.error(
                `[TODOseq] Failed to add CLOSED date for task at line ${task.line}:`,
                error,
              );
            }
          }
          // Done → Not-done: remove CLOSED date
          else if (oldIsCompleted && !newIsCompleted) {
            // Special case: recurring task reset (DONE → TODO via recurrence)
            // Don't remove CLOSED date for recurring tasks
            const isRecurringReset =
              (updatedTask.scheduledDateRepeat != null &&
                updatedTask.scheduledDate != null) ||
              (updatedTask.deadlineDateRepeat != null &&
                updatedTask.deadlineDate != null);
            if (!isRecurringReset) {
              try {
                updatedTask =
                  await taskEditor.removeTaskClosedDate(updatedTask);
              } catch (error) {
                console.error(
                  `[TODOseq] Failed to remove CLOSED date for task at line ${task.line}:`,
                  error,
                );
              }
            }
          }
        }
      }

      return updatedTask;
    } finally {
      // Cleanup: Expected change is automatically cleaned up when detected
      // No manual cleanup needed here
    }
  }

  /**
   * Get the expected file content after a task state update.
   * This is used to register expected change with ChangeTracker.
   *
   * @param task - The task being updated
   * @param newState - The new state
   * @returns Promise resolving to the expected file content
   */
  private async getExpectedFileContent(
    task: Task,
    newState: string,
  ): Promise<string> {
    try {
      const file = this.plugin.app.vault.getAbstractFileByPath(task.path);
      if (!file || !(file instanceof TFile)) {
        // If we can't read the file, return a simple hash
        // This is a fallback case
        return `task-state-update:${task.path}:${task.line}:${newState}`;
      }

      const content = await this.plugin.app.vault.read(file);
      const lines = content.split('\n');

      if (task.line >= lines.length) {
        return `task-state-update:${task.path}:${task.line}:${newState}`;
      }

      // Update the task line with the new state
      const taskLine = lines[task.line];
      const updatedLine = taskLine.replace(task.state, newState);
      lines[task.line] = updatedLine;

      return lines.join('\n');
    } catch (error) {
      console.error('[TODOseq] Failed to get expected file content:', error);
      return `task-state-update:${task.path}:${task.line}:${newState}`;
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
    // Update in-memory state - subscriber callback will handle refresh
    this.taskStateManager.optimisticUpdate(task, newState);
  }

  /**
   * Perform direct DOM manipulation on embeds to update the task state display.
   * This updates the embed display without triggering a full re-render
   * which would cause flicker. The DOM update is synchronous and only
   * touches specific elements that need to change.
   */
  private performDirectEmbedDOMUpdate(task: Task, newState: string): void {
    // Get filename from task path
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
          // Unwrap content: move all children out of completed container
          const parent = completedContainer.parentNode;
          // Move keyword element first
          parent.insertBefore(keywordEl, completedContainer.firstChild);
          // Move remaining children after the keyword element
          while (completedContainer.firstChild) {
            parent.insertBefore(completedContainer.firstChild, keywordEl);
          }
          // Remove the completed container
          completedContainer.remove();
        }
      }
    });
  }

  /**
   * Update a task's scheduled date from any view.
   * This provides optimistic UI updates similar to updateTaskState.
   *
   * @param task - The task to update
   * @param date - The new scheduled date
   * @param repeat - The new repeat info
   */
  public async updateTaskScheduledDate(
    task: Task,
    date: Date | null,
    repeat?: DateRepeatInfo | null,
  ): Promise<void> {
    const taskEditor = this.plugin.taskEditor;
    if (!taskEditor) {
      throw new Error('TaskEditor is not initialized');
    }

    try {
      if (date === null) {
        await taskEditor.removeTaskScheduledDate(task);
      } else {
        await taskEditor.updateTaskScheduledDate(task, date, repeat);
      }
    } catch (error) {
      console.error(
        `[TODOseq] Failed to update scheduled date for task at line ${task.line}:`,
        error,
      );
      // Rollback: re-read file to restore state
      const file = this.plugin.app.vault.getAbstractFileByPath(task.path);
      if (file instanceof TFile) {
        await this.plugin.vaultScanner?.processIncrementalChange(file);
      }
      throw error;
    }
  }

  /**
   * Update a task's deadline date from any view.
   * This provides optimistic UI updates similar to updateTaskState.
   *
   * @param task - The task to update
   * @param date - The new deadline date
   * @param repeat - The new repeat info
   */
  public async updateTaskDeadlineDate(
    task: Task,
    date: Date | null,
    repeat?: DateRepeatInfo | null,
  ): Promise<void> {
    const taskEditor = this.plugin.taskEditor;
    if (!taskEditor) {
      throw new Error('TaskEditor is not initialized');
    }

    try {
      if (date === null) {
        await taskEditor.removeTaskDeadlineDate(task);
      } else {
        await taskEditor.updateTaskDeadlineDate(task, date, repeat);
      }
    } catch (error) {
      console.error(
        `[TODOseq] Failed to update deadline date for task at line ${task.line}:`,
        error,
      );
      // Rollback: re-read file to restore state
      const file = this.plugin.app.vault.getAbstractFileByPath(task.path);
      if (file instanceof TFile) {
        await this.plugin.vaultScanner?.processIncrementalChange(file);
      }
      throw error;
    }
  }

  /**
   * Update a task's priority from any view.
   * This provides optimistic UI updates similar to updateTaskState.
   *
   * @param task - The task to update
   * @param newPriority - The new priority ('high', 'med', 'low', or null to remove)
   */
  public async updateTaskPriority(
    task: Task,
    newPriority: 'high' | 'med' | 'low' | null,
  ): Promise<void> {
    const taskEditor = this.plugin.taskEditor;
    if (!taskEditor) {
      throw new Error('TaskEditor is not initialized');
    }

    try {
      if (newPriority === null) {
        await taskEditor.removeTaskPriority(task);
      } else {
        await taskEditor.updateTaskPriority(task, newPriority);
      }
    } catch (error) {
      console.error(
        `[TODOseq] Failed to update priority for task at line ${task.line}:`,
        error,
      );
      // Rollback: re-read file to restore state
      const file = this.plugin.app.vault.getAbstractFileByPath(task.path);
      if (file instanceof TFile) {
        await this.plugin.vaultScanner?.processIncrementalChange(file);
      }
      throw error;
    }
  }

  /**
   * Schedule a delayed recurrence update for a completed recurring task.
   * Cancels any existing pending update for this task.
   */
  private scheduleRecurrenceUpdate(task: Task): void {
    // Delegate to RecurrenceCoordinator
    this.recurrenceCoordinator.scheduleRecurrence(task, 3000);
  }

  /**
   * Cancel a pending recurrence update for a task.
   */
  private cancelRecurrenceUpdate(task: Task): void {
    // Delegate to RecurrenceCoordinator
    this.recurrenceCoordinator.cancelRecurrence(task);
  }

  /**
   * Perform recurrence update: advance dates and reset to inactive state.
   * This method is kept for backward compatibility but delegates to RecurrenceCoordinator.
   */
  private async performRecurrenceUpdate(task: Task): Promise<void> {
    // Delegate to RecurrenceCoordinator
    const result =
      await this.recurrenceCoordinator.performRecurrenceUpdate(task);

    if (!result.success) {
      console.error(
        '[TODOseq] Failed to perform recurrence update:',
        result.error,
      );
    }
  }
}
