/**
 * RecurrenceCoordinator provides centralized coordination for recurrence updates.
 *
 * This class coordinates between scheduled recurrence updates and recovery
 * operations, preventing race conditions where both mechanisms might try to
 * update the same task.
 */

import { Task } from '../types/task';
import { TaskStateManager } from './task-state-manager';
import { RecurrenceManager, DateLineParser } from './recurrence-manager';
import { ChangeTracker } from './change-tracker';
import { TFile, MarkdownView } from 'obsidian';
import { App } from 'obsidian';
import TodoTracker from '../main';

/**
 * Result of a recurrence update operation.
 */
export interface RecurrenceUpdateResult {
  /** Whether the update was successful */
  success: boolean;
  /** The updated task state */
  task?: Task;
  /** Error message if the update failed */
  error?: string;
}

/**
 * Configuration options for RecurrenceCoordinator.
 */
export interface RecurrenceCoordinatorOptions {
  /** Default delay for recurrence updates in milliseconds (default: 0) */
  defaultDelayMs?: number;
  /** Whether to enable debug logging (default: false) */
  debug?: boolean;
}

/**
 * RecurrenceCoordinator manages all recurrence-related operations.
 *
 * This class:
 * - Tracks pending recurrence updates per task
 * - Coordinates between scheduled updates and recovery
 * - Provides a single entry point for recurrence operations
 * - Prevents duplicate recurrence updates
 *
 * Usage:
 * ```typescript
 * const coordinator = new RecurrenceCoordinator(app, taskStateManager);
 *
 * // Schedule a recurrence update for a completed task
 * coordinator.scheduleRecurrence(task, 3000);
 *
 * // Check if recovery should process a task
 * if (coordinator.shouldProcessRecovery(task)) {
 *   // Process recovery
 * }
 *
 * // Cancel a pending recurrence update
 * coordinator.cancelRecurrence(task);
 * ```
 */
export class RecurrenceCoordinator {
  private pendingRecurrenceTasks: Set<string> = new Set();
  private recurrenceTimeouts: Map<string, NodeJS.Timeout> = new Map();
  private readonly defaultDelayMs: number;
  private recurrenceManager: RecurrenceManager;
  private changeTracker: ChangeTracker;

  constructor(
    private plugin: TodoTracker,
    private taskStateManager: TaskStateManager,
    options: RecurrenceCoordinatorOptions = {},
  ) {
    this.defaultDelayMs = options.defaultDelayMs ?? 0;
    this.changeTracker = new ChangeTracker({
      defaultTimeoutMs: 5000,
    });
    // Initialize RecurrenceManager with keywordManager for proper keyword handling
    this.recurrenceManager = new RecurrenceManager(this.keywordManager);
  }

  private get app(): App {
    return this.plugin.app;
  }

  private get settings() {
    return this.plugin.settings;
  }

  private get keywordManager() {
    return this.plugin.keywordManager;
  }

  private async getFileContent(path: string): Promise<string> {
    const md = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (md?.file?.path === path && md.editor) {
      return md.editor.getValue();
    }
    const file = this.app.vault.getAbstractFileByPath(path);
    if (file instanceof TFile) {
      return this.app.vault.read(file);
    }
    throw new Error(`File not found: ${path}`);
  }

  /**
   * Deep clone a task to prevent stale references when stored for delayed execution.
   * This ensures the task state captured at scheduling time is preserved.
   */
  private cloneTask(task: Task): Task {
    return {
      ...task,
      // All primitive properties are copied by value
      // Arrays and objects are reference types but Task properties are primitives
    };
  }

  /**
   * Schedule a recurrence update for a task.
   *
   * @param task - The task to schedule recurrence for
   * @param delayMs - Delay in milliseconds (default: 3000)
   */
  scheduleRecurrence(task: Task, delayMs: number = this.defaultDelayMs): void {
    const key = this.getTaskKey(task);

    // Cancel any existing timeout for this task
    this.cancelRecurrence(task);

    // Deep clone the task to prevent stale references when timeout fires
    // This is critical because the task may be mutated or line indices may change
    const clonedTask = this.cloneTask(task);

    // Add to pending set
    this.pendingRecurrenceTasks.add(key);

    // Schedule the update with cloned task
    const timeout = setTimeout(async () => {
      this.pendingRecurrenceTasks.delete(key);
      this.recurrenceTimeouts.delete(key);

      await this.performRecurrenceUpdate(clonedTask);
    }, delayMs);

    this.recurrenceTimeouts.set(key, timeout);
  }

  /**
   * Cancel a pending recurrence update for a task.
   *
   * @param task - The task to cancel recurrence for
   */
  cancelRecurrence(task: Task): void {
    const key = this.getTaskKey(task);
    const timeout = this.recurrenceTimeouts.get(key);

    if (timeout) {
      clearTimeout(timeout);
      this.recurrenceTimeouts.delete(key);
      this.pendingRecurrenceTasks.delete(key);
    }
  }

  /**
   * Check if recovery should process a task.
   *
   * Recovery should be skipped if there's a pending recurrence update
   * for the task, as the scheduled update will handle it.
   *
   * @param task - The task to check
   * @returns Whether recovery should process the task
   */
  shouldProcessRecovery(task: Task): boolean {
    const key = this.getTaskKey(task);
    const shouldProcess = !this.pendingRecurrenceTasks.has(key);

    return shouldProcess;
  }

  /**
   * Perform recurrence update: advance dates and reset to inactive state.
   *
   * @param task - The task to update
   * @returns Promise resolving to the update result
   */
  async performRecurrenceUpdate(task: Task): Promise<RecurrenceUpdateResult> {
    const settings = this.settings;
    const defaultInactive =
      settings?.stateTransitions?.defaultInactive || 'TODO';

    // Check if task has repeating dates that need updating
    const hasScheduledRepeat = task.scheduledDateRepeat != null;
    const hasDeadlineRepeat = task.deadlineDateRepeat != null;

    if (!hasScheduledRepeat && !hasDeadlineRepeat) {
      return {
        success: false,
        error: 'Task has no repeat dates',
      };
    }

    try {
      // Check if task has repeating dates that need updating
      const hasScheduledRepeat = task.scheduledDateRepeat != null;
      const hasDeadlineRepeat = task.deadlineDateRepeat != null;

      if (!hasScheduledRepeat && !hasDeadlineRepeat) {
        return {
          success: false,
          error: 'Task has no repeat dates',
        };
      }

      // Validate task state from state manager
      // For recurring tasks, we intentionally skip writing DONE state, so the task
      // may not be in completed state. Check if task has repeating dates as a proxy
      // for whether this is a recurring task that was completed.
      // Note: We don't check the current state here because for recurring tasks,
      // we intentionally skip writing DONE state, so the task may not be in completed state.

      // For recurring tasks (those with repeat dates), we advance dates regardless of state
      // because we intentionally skip writing DONE state
      // For non-recurring tasks, only update if in completed state

      // Read the file for recurrence date calculation
      // Use getFileContent to read from editor buffer when available
      // This ensures we get the latest content even if editor hasn't synced to disk yet
      const content = await this.getFileContent(task.path);
      const lines = content.split('\n');

      if (task.line >= lines.length) {
        return {
          success: false,
          error: 'Task line out of bounds',
        };
      }

      // Get parser from vault scanner
      const vaultScanner = (
        this.app as unknown as {
          plugins: {
            getPlugin: (id: string) => {
              vaultScanner?: { getParser: () => DateLineParser | null } | null;
            } | null;
          };
        }
      ).plugins.getPlugin('todoseq');
      const parser = vaultScanner?.vaultScanner?.getParser();

      if (!parser) {
        return {
          success: false,
          error: 'Parser not available for recurrence update',
        };
      }

      // Calculate next recurrence dates using RecurrenceManager
      const dateResult = this.recurrenceManager.calculateNextDates(
        task,
        lines,
        parser,
        defaultInactive,
      );

      if (!dateResult.updated) {
        return {
          success: false,
          error: 'No dates needed updating',
        };
      }

      // Update the task keyword to inactive state
      const updatedLines = this.recurrenceManager.updateTaskKeyword(
        dateResult.lines,
        task.line,
        defaultInactive,
      );

      // Skip incremental change tracking for this file write to prevent vault scanner
      // from re-processing this file as an external change
      this.plugin.vaultScanner?.addSkipIncrementalChange(task.path);

      // Register expected change with ChangeTracker to prevent vault scanner
      // from treating this as an unexpected external change
      this.changeTracker.registerExpectedChange(
        task.path,
        updatedLines.join('\n'),
        5000,
      );

      // Write the updated file using TaskWriter for proper editor/vault handling
      const taskWriter = this.plugin.taskEditor;
      if (taskWriter) {
        // Use TaskWriter's editor-aware approach
        await taskWriter.writeLines(task.path, updatedLines);
      } else {
        // Fallback to vault.modify if TaskWriter is not available
        const file = this.app.vault.getAbstractFileByPath(task.path);
        if (file instanceof TFile) {
          await this.app.vault.modify(file, updatedLines.join('\n'));
        }
      }

      // After the file update, the task state may be stale in the state manager.
      // Use content-based lookup to find the correct task (in case line indices shifted)
      // This is critical because the stored task.line may not match the current file
      const contentMatchTask = this.taskStateManager.findTaskByContent(
        task.path,
        task,
      );

      let taskToUpdate = contentMatchTask;

      // If content match failed, try path+line as fallback
      if (!taskToUpdate) {
        taskToUpdate = this.taskStateManager.findTaskByPathAndLine(
          task.path,
          task.line,
        );
      }

      if (taskToUpdate) {
        // Use the found task's current line number to handle any line shifts
        const updatePath = taskToUpdate.path;
        const updateLine = taskToUpdate.line;

        const updated = this.taskStateManager.updateTaskByPathAndLine(
          updatePath,
          updateLine,
          {
            rawText: updatedLines[updateLine] || updatedLines[task.line],
            state: defaultInactive,
            completed: false,
            scheduledDate:
              dateResult.newScheduledDate ?? taskToUpdate.scheduledDate,
            deadlineDate:
              dateResult.newDeadlineDate ?? taskToUpdate.deadlineDate,
          },
        );

        if (updated) {
          // Notify subscribers to refresh views with the updated task state
          this.taskStateManager.notifySubscribers();

          // Don't remove the skip set here - more file change events may come in
          // The skip will be cleared by the next user-initiated change or timeout

          return {
            success: true,
            task: taskToUpdate,
          };
        }
      }

      // Don't remove the skip set here either

      return {
        success: true,
      };
    } catch (error) {
      console.error(
        '[RecurrenceCoordinator] Failed to perform recurrence update:',
        error,
      );
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Get a unique key for a task.
   *
   * @param task - The task to get a key for
   * @returns Unique key for the task
   */
  private getTaskKey(task: Task): string {
    return `${task.path}:${task.line}`;
  }

  /**
   * Get the number of pending recurrence updates.
   *
   * @returns Number of pending updates
   */
  getPendingCount(): number {
    return this.pendingRecurrenceTasks.size;
  }

  /**
   * Check if there is a pending recurrence update for a task.
   *
   * @param task - The task to check
   * @returns Whether there is a pending update
   */
  hasPendingRecurrence(task: Task): boolean {
    const key = this.getTaskKey(task);
    return this.pendingRecurrenceTasks.has(key);
  }

  /**
   * Get all pending recurrence task keys (for debugging/testing).
   *
   * @returns Array of pending task keys
   */
  getPendingRecurrenceKeys(): string[] {
    return Array.from(this.pendingRecurrenceTasks);
  }

  /**
   * Clean up all pending recurrence updates.
   */
  destroy(): void {
    for (const timeout of this.recurrenceTimeouts.values()) {
      clearTimeout(timeout);
    }
    this.recurrenceTimeouts.clear();
    this.pendingRecurrenceTasks.clear();
  }
}
