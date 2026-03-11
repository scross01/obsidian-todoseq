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
import { TFile } from 'obsidian';
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
  /** Default delay for recurrence updates in milliseconds (default: 3000) */
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
  private recurrenceManager = new RecurrenceManager();

  constructor(
    private plugin: TodoTracker,
    private taskStateManager: TaskStateManager,
    options: RecurrenceCoordinatorOptions = {},
  ) {
    this.defaultDelayMs = options.defaultDelayMs ?? 3000;
  }

  private get app(): App {
    return this.plugin.app;
  }

  private get settings() {
    return this.plugin.settings;
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

    // Add to pending set
    this.pendingRecurrenceTasks.add(key);

    // Schedule the update
    const timeout = setTimeout(async () => {
      this.pendingRecurrenceTasks.delete(key);
      this.recurrenceTimeouts.delete(key);

      await this.performRecurrenceUpdate(task);
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
      const file = this.app.vault.getAbstractFileByPath(task.path);
      if (!file || !(file instanceof TFile)) {
        return {
          success: false,
          error: 'File not found for recurrence update',
        };
      }

      const content = await this.app.vault.read(file);
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

      // Write the updated file
      await this.app.vault.modify(file, updatedLines.join('\n'));

      // Update the task state manager using path+line lookup for safety
      const currentTask = this.taskStateManager.findTaskByPathAndLine(
        task.path,
        task.line,
      );
      if (currentTask) {
        const updated = this.taskStateManager.updateTaskByPathAndLine(
          task.path,
          task.line,
          {
            rawText: updatedLines[task.line],
            state: defaultInactive,
            completed: false,
            scheduledDate:
              dateResult.newScheduledDate ?? currentTask.scheduledDate,
            deadlineDate:
              dateResult.newDeadlineDate ?? currentTask.deadlineDate,
          },
        );

        if (updated) {
          return {
            success: true,
            task: currentTask,
          };
        }
      }

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
