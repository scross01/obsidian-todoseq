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
import { TFile, Platform } from 'obsidian';
import { KeywordManager } from '../utils/keyword-manager';
import { ChangeTracker } from './change-tracker';
import { RecurrenceCoordinator } from './recurrence-coordinator';
import { TaskStateTransitionManager } from './task-state-transition-manager';
import { RecurrenceManager } from './recurrence-manager';

export class TaskUpdateCoordinator {
  private changeTracker: ChangeTracker;
  private recurrenceCoordinator: RecurrenceCoordinator;
  private recurrenceManager: RecurrenceManager;
  private fileUpdateQueues = new Map<string, Promise<unknown>>();
  private pendingTaskUpdates = new Map<string, Promise<Task>>();

  private getTaskKey(path: string, line: number): string {
    return `${path}:${line}`;
  }

  constructor(
    private plugin: TodoTracker,
    private taskStateManager: TaskStateManager,
    private keywordManager: KeywordManager,
  ) {
    // Initialize ChangeTracker with default options
    this.changeTracker = new ChangeTracker({
      defaultTimeoutMs: 5000,
    });

    // Initialize RecurrenceManager with keywordManager for proper keyword handling
    this.recurrenceManager = new RecurrenceManager(this.keywordManager);

    // Initialize RecurrenceCoordinator
    this.recurrenceCoordinator = new RecurrenceCoordinator(
      this.plugin,
      this.taskStateManager,
    );
  }

  /**
   * Unified method to update a task's state.
   * This is the SINGLE entry point for all task state updates from any view.
   *
   * This method handles:
   * - Fresh task lookup (by path+line)
   * - Optimistic UI update
   * - File write
   * - Line index adjustment
   * - Recurrence scheduling
   * - UI refresh
   *
   * @param taskPath - The file path of the task
   * @param taskLine - The line number of the task
   * @param newState - The new state to set
   * @param source - The source of the update (for debugging/tracking)
   * @returns Promise resolving to the updated task
   */
  async updateTask(
    taskPath: string,
    taskLine: number,
    newState: string,
    source: string,
  ): Promise<Task | null> {
    // 1. Fresh task lookup by path+line
    const task = this.taskStateManager.findTaskByPathAndLine(
      taskPath,
      taskLine,
    );

    if (!task) {
      console.error(
        `[TaskUpdateCoordinator] Task not found at path=${taskPath}, line=${taskLine}`,
      );
      return null;
    }

    // 2. Call the existing updateTaskState with the fresh task
    // This handles optimistic update, file write, recurrence, etc.
    type SourceType = 'editor' | 'reader' | 'task-list' | 'embedded';
    return this.updateTaskState(task, newState, source as SourceType);
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
    // CRITICAL: Do optimistic update FIRST, synchronously
    // This ensures UI updates even if mobile command palette closes before async completes
    // The async work (ChangeTracker, file write, recurrence) comes after
    const isNewStateCompleted = this.keywordManager.isCompleted(newState);
    const hasRepeatingDates =
      (task.scheduledDateRepeat != null && task.scheduledDate != null) ||
      (task.deadlineDateRepeat != null && task.deadlineDate != null);
    const shouldDoInlineRecurrence = isNewStateCompleted && hasRepeatingDates;

    let finalState = newState;
    if (shouldDoInlineRecurrence) {
      const stateManager = new TaskStateTransitionManager(
        this.keywordManager,
        this.plugin.settings?.stateTransitions,
      );
      finalState = stateManager.getNextState(newState);
    }

    this.taskStateManager.optimisticUpdate(task, finalState);

    // Per-task lock to prevent race conditions when same task is updated rapidly
    // (e.g., TODO->DOING->DONE clicks in quick succession)
    const taskKey = this.getTaskKey(task.path, task.line);
    const existingTaskUpdate = this.pendingTaskUpdates.get(taskKey);

    // The actual update logic - handles file write, ChangeTracker, recurrence, etc.
    const doUpdateCoreCore = async (): Promise<Task> => {
      // Register expected change with ChangeTracker
      const expectedContent = await this.getExpectedFileContent(
        task,
        finalState,
      );
      this.changeTracker.registerExpectedChange(
        task.path,
        expectedContent,
        5000,
        { source },
      );

      // Fetch currentTask for file write
      let currentTask = this.taskStateManager.findTaskByPathAndLine(
        task.path,
        task.line,
      );

      // If not found at expected line, search nearby lines for content match
      if (!currentTask || currentTask.rawText !== task.rawText) {
        const validatedTask = this.taskStateManager.findTaskByContent(
          task.path,
          task,
        );
        if (validatedTask) {
          currentTask = validatedTask;
        }
      }

      if (!currentTask) {
        currentTask = task; // Fallback to original if not found
      }

      // Update source file via TaskEditor
      let updatedTask: Task;
      const taskEditor = this.plugin.taskEditor;
      if (!taskEditor) {
        throw new Error('TaskEditor is not initialized');
      }

      try {
        this.plugin.vaultScanner?.addSkipIncrementalChange(task.path);

        updatedTask = await taskEditor.updateTaskState(currentTask, finalState);
      } catch (error) {
        console.error(
          `[TODOseq] File write failed for task at line ${task.line}:`,
          error,
        );
        // Re-process file to restore correct state
        const file = this.plugin.app.vault.getAbstractFileByPath(task.path);
        if (file instanceof TFile) {
          await this.plugin.vaultScanner?.processIncrementalChange(file);
        }
        throw error;
      }

      // Adjust line indices for subsequent tasks if date lines were added/removed
      const lineDelta = (updatedTask as Task & { lineDelta?: number })
        .lineDelta;
      if (lineDelta !== undefined && lineDelta !== 0) {
        this.taskStateManager.adjustLineIndices(
          currentTask.path,
          currentTask.line + 1,
          lineDelta,
        );
      }

      // Perform direct DOM manipulation for embeds
      this.performDirectEmbedDOMUpdate(currentTask, updatedTask.state);

      // Update the TaskStateManager with the final task state
      this.taskStateManager.updateTaskByPathAndLine(
        updatedTask.path,
        updatedTask.line,
        {
          rawText: updatedTask.rawText,
          state: updatedTask.state,
          completed: updatedTask.completed,
          scheduledDate: updatedTask.scheduledDate,
          deadlineDate: updatedTask.deadlineDate,
          scheduledDateRepeat: updatedTask.scheduledDateRepeat,
          deadlineDateRepeat: updatedTask.deadlineDateRepeat,
          closedDate: updatedTask.closedDate,
        },
      );

      // Refresh editor decorations
      if (this.plugin.refreshVisibleEditorDecorations) {
        this.plugin.refreshVisibleEditorDecorations();
      }

      // Handle recurrence updates
      const wasCompleted = this.keywordManager.isCompleted(currentTask.state);
      const taskHasRepeatingDates =
        (updatedTask.scheduledDateRepeat != null &&
          updatedTask.scheduledDate != null) ||
        (updatedTask.deadlineDateRepeat != null &&
          updatedTask.deadlineDate != null);

      if (wasCompleted && !isNewStateCompleted && taskHasRepeatingDates) {
        this.recurrenceCoordinator.cancelRecurrence(updatedTask);
      }

      if (isNewStateCompleted && taskHasRepeatingDates) {
        if (Platform.isMobile) {
          this.recurrenceCoordinator.performRecurrenceUpdate(updatedTask);
        } else {
          this.recurrenceCoordinator.scheduleRecurrence(updatedTask, 50);
        }
      }

      return updatedTask;
    };

    // Wrapper that manages file queue
    const runUpdate = (): Promise<Task> => {
      const existingQueue = this.fileUpdateQueues.get(task.path);
      const queuePromise = existingQueue
        ? existingQueue.then(() => doUpdateCoreCore())
        : doUpdateCoreCore();

      this.fileUpdateQueues.set(task.path, queuePromise);

      return queuePromise.finally(() => {
        // Clean up queue entry when this update completes
        if (this.fileUpdateQueues.get(task.path) === queuePromise) {
          this.fileUpdateQueues.delete(task.path);
        }
      });
    };

    // Chain this update after any existing update for the same task
    if (existingTaskUpdate) {
      // Re-fetch fresh task state after the previous update completes
      // This ensures we calculate transitions from the correct current state
      const chainedUpdate = existingTaskUpdate.then(async () => {
        const freshTask = this.taskStateManager.findTaskByPathAndLine(
          task.path,
          task.line,
        );
        if (freshTask && freshTask.state !== task.state) {
          // Calculate the next state from the fresh task's current state
          const transitionManager = new TaskStateTransitionManager(
            this.keywordManager,
            this.plugin.settings?.stateTransitions,
          );
          newState = transitionManager.getNextState(freshTask.state);
          task.state = freshTask.state;
        }
        return runUpdate();
      });
      this.pendingTaskUpdates.set(taskKey, chainedUpdate);
      return chainedUpdate;
    } else {
      const updatePromise = runUpdate();
      this.pendingTaskUpdates.set(taskKey, updatePromise);
      try {
        return await updatePromise;
      } finally {
        this.pendingTaskUpdates.delete(taskKey);
      }
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
   * Perform a date-related task update with coordinated state management.
   * Handles task validation, file write, state manager update, and subscriber notification.
   *
   * @param task - The task to update
   * @param performWrite - Async function that writes to file and returns updated task
   * @param getUpdateProperties - Function to extract properties to update from the result
   * @param errorContext - Context string for error messages
   */
  private async performDateUpdate(
    task: Task,
    performWrite: () => Promise<Task>,
    getUpdateProperties: (updatedTask: Task) => {
      rawText: string;
      scheduledDate?: Date | null;
      scheduledDateRepeat?: DateRepeatInfo | null;
      deadlineDate?: Date | null;
      deadlineDateRepeat?: DateRepeatInfo | null;
    },
    errorContext: string,
  ): Promise<void> {
    // Queue this update for consistency with state updates
    const existingQueue = this.fileUpdateQueues.get(task.path);

    const doUpdateCore = async (): Promise<void> => {
      const taskEditor = this.plugin.taskEditor;
      if (!taskEditor) {
        throw new Error('TaskEditor is not initialized');
      }

      // Validate task location before update
      let currentTask = this.taskStateManager.findTaskByPathAndLine(
        task.path,
        task.line,
      );

      if (!currentTask || currentTask.rawText !== task.rawText) {
        const validatedTask = this.taskStateManager.findTaskByContent(
          task.path,
          task,
        );
        if (validatedTask) {
          currentTask = validatedTask;
        }
      }

      currentTask = currentTask || task;

      try {
        const updatedTask = await performWrite();

        // Update state manager with the new task data after successful file write
        this.taskStateManager.updateTaskByPathAndLine(
          updatedTask.path,
          updatedTask.line,
          getUpdateProperties(updatedTask),
        );
        // Notify subscribers so views (like TaskListView) refresh
        this.taskStateManager.notifySubscribers();
      } catch (error) {
        console.error(`[TODOseq] ${errorContext} at line ${task.line}:`, error);
        // Rollback: re-read file to restore state
        const file = this.plugin.app.vault.getAbstractFileByPath(task.path);
        if (file instanceof TFile) {
          await this.plugin.vaultScanner?.processIncrementalChange(file);
        }
        throw error;
      }
    };

    const queuePromise = existingQueue
      ? existingQueue.then(() => doUpdateCore())
      : doUpdateCore();

    this.fileUpdateQueues.set(task.path, queuePromise);

    try {
      await queuePromise;
    } finally {
      if (this.fileUpdateQueues.get(task.path) === queuePromise) {
        this.fileUpdateQueues.delete(task.path);
      }
    }
  }

  /**
   * Update a task's scheduled date from any view.
   * This provides coordinated UI updates similar to updateTaskState.
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

    await this.performDateUpdate(
      task,
      async () => {
        if (date === null) {
          return taskEditor.removeTaskScheduledDate(task);
        } else {
          return taskEditor.updateTaskScheduledDate(task, date, repeat);
        }
      },
      (updatedTask) => ({
        rawText: updatedTask.rawText,
        scheduledDate: updatedTask.scheduledDate,
        scheduledDateRepeat: updatedTask.scheduledDateRepeat,
      }),
      'Failed to update scheduled date',
    );
  }

  /**
   * Update a task's deadline date from any view.
   * This provides coordinated UI updates similar to updateTaskState.
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

    await this.performDateUpdate(
      task,
      async () => {
        if (date === null) {
          return taskEditor.removeTaskDeadlineDate(task);
        } else {
          return taskEditor.updateTaskDeadlineDate(task, date, repeat);
        }
      },
      (updatedTask) => ({
        rawText: updatedTask.rawText,
        deadlineDate: updatedTask.deadlineDate,
        deadlineDateRepeat: updatedTask.deadlineDateRepeat,
      }),
      'Failed to update deadline date',
    );
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
    // Delegate to RecurrenceCoordinator with small delay
    this.recurrenceCoordinator.scheduleRecurrence(task, 50);
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

  /**
   * Clean up resources.
   * Call this when the coordinator is no longer needed to prevent open handles in tests.
   */
  destroy(): void {
    // Clean up ChangeTracker to prevent open handles in tests
    this.changeTracker.destroy();
  }
}
