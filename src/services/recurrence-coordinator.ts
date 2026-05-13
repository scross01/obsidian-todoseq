/**
 * RecurrenceCoordinator provides centralized coordination for recurrence updates.
 *
 * This class schedules delayed recurrence updates for completed recurring tasks,
 * preventing duplicate updates via timeout cancellation.
 */

import { Task } from '../types/task';
import { TaskStateManager } from './task-state-manager';
import { RecurrenceManager, DateLineParser } from './recurrence-manager';
import { TaskUpdateCoordinator } from './task-update-coordinator';
import { App, TFile } from 'obsidian';
import TodoTracker from '../main';
import { KeywordManager } from '../utils/keyword-manager';

/**
 * Result of a recurrence update operation.
 */
export interface RecurrenceUpdateResult {
  /** Whether the update was successful */
  success: boolean;
  /** Error message if the update failed */
  error?: string;
}

/**
 * Configuration options for RecurrenceCoordinator.
 */
export interface RecurrenceCoordinatorOptions {
  /** Default delay for recurrence updates in milliseconds (default: 50) */
  defaultDelayMs?: number;
  /** Whether to enable debug logging (default: false) */
  debug?: boolean;
}

/**
 * RecurrenceCoordinator manages all recurrence-related operations.
 *
 * This class:
 * - Schedules delayed recurrence updates for completed recurring tasks
 * - Prevents duplicate recurrence updates via timeout cancellation
 * - Provides a single entry point for recurrence operations
 *
 * Usage:
 * ```typescript
 * const coordinator = new RecurrenceCoordinator(plugin, taskStateManager);
 *
 * // Schedule a recurrence update for a completed task
 * coordinator.scheduleRecurrence(task, 50);
 * ```
 */
export class RecurrenceCoordinator {
  private recurrenceTimeouts: Map<string, number> = new Map();
  private readonly defaultDelayMs: number;
  private recurrenceManager: RecurrenceManager;
  private taskUpdateCoordinator: TaskUpdateCoordinator;

  constructor(
    private plugin: TodoTracker,
    private taskStateManager: TaskStateManager,
    private keywordManager: KeywordManager,
    options: RecurrenceCoordinatorOptions = {},
  ) {
    this.defaultDelayMs = options.defaultDelayMs ?? 50;
    // Initialize RecurrenceManager with injected keywordManager
    this.recurrenceManager = new RecurrenceManager(this.keywordManager);
  }

  /**
   * Set the TaskUpdateCoordinator reference.
   * This is called after construction to avoid circular dependency.
   */
  setTaskUpdateCoordinator(coordinator: TaskUpdateCoordinator): void {
    this.taskUpdateCoordinator = coordinator;
  }

  /**
   * Update the keyword manager (called when settings change).
   */
  setKeywordManager(keywordManager: KeywordManager): void {
    this.keywordManager = keywordManager;
    this.recurrenceManager.setKeywordManager(keywordManager);
  }

  private get app(): App {
    return this.plugin.app;
  }

  private get settings() {
    return this.plugin.settings;
  }

  private async getFileContent(path: string): Promise<string> {
    // Always read from vault for recurrence updates to get the latest content.
    // The editor buffer may be stale in reader view after file updates.
    const file = this.app.vault.getAbstractFileByPath(path);
    if (file instanceof TFile) {
      return this.app.vault.read(file);
    }
    throw new Error(`File not found: ${path}`);
  }

  /**
   * Schedule a recurrence update for a task.
   *
   * @param task - The task to schedule recurrence for
   * @param delayMs - Delay in milliseconds
   */
  scheduleRecurrence(task: Task, delayMs: number = this.defaultDelayMs): void {
    const key = this.getTaskKey(task);

    // Cancel any existing timeout for this task
    this.cancelRecurrence(task);

    // Schedule the update
    const timeout = activeWindow.setTimeout(async () => {
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
      activeWindow.clearTimeout(timeout);
      this.recurrenceTimeouts.delete(key);
    }
  }

  /**
   * Perform recurrence update: advance dates and reset to inactive state.
   *
   * @param task - The task to update
   * @returns Promise resolving to the update result
   */
  async performRecurrenceUpdate(task: Task): Promise<RecurrenceUpdateResult> {
    const defaultInactive = this.keywordManager.getDefaultInactive();

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
      // Read the file for recurrence date calculation
      // Use getFileContent to read from vault for latest content
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
      );

      if (!dateResult.updated) {
        return {
          success: false,
          error: 'No dates needed updating',
        };
      }

      // Use TaskUpdateCoordinator to update the task
      // This ensures all updates go through the unified flow
      await this.taskUpdateCoordinator.updateTaskRecurrence(task, {
        newScheduledDate: dateResult.newScheduledDate ?? null,
        newDeadlineDate: dateResult.newDeadlineDate ?? null,
        newScheduledRepeat: task.scheduledDateRepeat,
        newDeadlineRepeat: task.deadlineDateRepeat,
        newStateForRecurrence: defaultInactive,
      });

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
   * Clean up all pending recurrence updates.
   */
  destroy(): void {
    for (const timeout of this.recurrenceTimeouts.values()) {
      activeWindow.clearTimeout(timeout);
    }
    this.recurrenceTimeouts.clear();
  }
}
