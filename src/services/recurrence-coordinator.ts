/**
 * RecurrenceCoordinator provides centralized coordination for recurrence updates.
 *
 * This class schedules delayed recurrence updates for completed recurring tasks,
 * preventing duplicate updates via timeout cancellation. It also owns the
 * recurrence date math (calculating next scheduled/deadline dates + warning
 * period carry-over on repeats).
 */

import { Task, WarningPeriodInfo } from '../types/task';
import { TaskStateManager } from './task-state-manager';
import { TaskUpdateCoordinator } from './task-update-coordinator';
import { App, MarkdownView, TFile } from 'obsidian';
import TodoTracker from '../main';
import { KeywordManager } from '../utils/keyword-manager';
import { calculateNextRepeatDate } from '../utils/date-repeater';
import {
  findDateLineWithParser,
  getTaskIndent,
} from '../utils/task-line-utils';

/**
 * Result of a recurrence date calculation (pure math, no I/O).
 * Returned by `calculateNextDates`.
 */
export interface RecurrenceDateCalculationResult {
  /** Whether any changes were made */
  updated: boolean;
  /** The new scheduled date (if updated) */
  newScheduledDate?: Date;
  /** The new deadline date (if updated) */
  newDeadlineDate?: Date;
  /** The effective warning period for the new scheduled date */
  newScheduledWarningPeriod?: WarningPeriodInfo | null;
  /** The effective warning period for the new deadline date */
  newDeadlineWarningPeriod?: WarningPeriodInfo | null;
}

/**
 * Minimal parser shape needed for date line detection inside recurrence updates.
 * Structural type — any object satisfying this shape (e.g. the vault scanner's
 * main task parser) is accepted without an explicit import of a heavy interface.
 */
export interface RecurrenceDateLineParser {
  getDateLineType: (
    line: string,
    indent: string,
  ) => 'scheduled' | 'deadline' | 'closed' | null;
}

/**
 * Result of a recurrence update operation (orchestration result).
 * Returned by `performRecurrenceUpdate`.
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
}

/**
 * RecurrenceCoordinator manages all recurrence-related operations.
 *
 * This class:
 * - Schedules delayed recurrence updates for completed recurring tasks
 * - Prevents duplicate recurrence updates via timeout cancellation
 * - Calculates next scheduled/deadline dates and carries warning periods
 *   forward across repeats (preserving `-Nd`, stripping first-only `--Nd`)
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
  private taskUpdateCoordinator: TaskUpdateCoordinator;

  constructor(
    private plugin: TodoTracker,
    private taskStateManager: TaskStateManager,
    private keywordManager: KeywordManager,
    options: RecurrenceCoordinatorOptions = {},
  ) {
    this.defaultDelayMs = options.defaultDelayMs ?? 50;
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
  }

  private get app(): App {
    return this.plugin.app;
  }

  private async getFileContent(path: string): Promise<string> {
    // Prefer the live editor buffer when the file is open in a source-mode
    // MarkdownView. Without this, getFileContent reads the on-disk version via
    // vault.read() and the subsequent write-back through TaskWriter would
    // silently destroy any unsaved edits the user made (including edits to the
    // recurring task itself) when the 50ms-delayed recurrence fires.
    //
    // We only consult the editor in "source" mode; in preview/reading mode the
    // editor buffer is not actively maintained, so reading from disk is no
    // worse than reading from the editor.
    const buffer = this.getLiveEditorBuffer(path);
    if (buffer !== null) {
      return buffer;
    }

    // Fall back to disk when the file is not open in any source-mode editor.
    const file = this.app.vault.getAbstractFileByPath(path);
    if (file instanceof TFile) {
      return this.app.vault.read(file);
    }
    throw new Error(`File not found: ${path}`);
  }

  /**
   * Return the live editor buffer for `path` if it is open in any source-mode
   * MarkdownView, otherwise null. Picks the first matching markdown leaf when
   * the file is open in multiple panes — recurrence handling does not care
   * which copy is consulted because the on-disk write backs both panes
   * through Obsidian's file-changed events.
   */
  private getLiveEditorBuffer(path: string): string | null {
    const workspace = this.app?.workspace;
    if (!workspace || typeof workspace.getLeavesOfType !== 'function') {
      return null;
    }

    const leaves = workspace.getLeavesOfType('markdown');
    for (const leaf of leaves) {
      const view = leaf?.view;
      if (!(view instanceof MarkdownView)) continue;
      if (view.file?.path !== path) continue;
      // Editor is only authoritative in source mode; preview/reading mode
      // does not actively reflect the source buffer. MarkdownView always
      // exposes getMode(), so no defensive check is needed here.
      if (view.getMode() !== 'source') {
        continue;
      }
      const editor = view.editor;
      if (!editor || typeof editor.getValue !== 'function') continue;
      const value = editor.getValue();
      if (typeof value === 'string') {
        return value;
      }
    }

    return null;
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
    const timeout = window.setTimeout(() => {
      this.recurrenceTimeouts.delete(key);
      void this.performRecurrenceUpdate(task);
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
      window.clearTimeout(timeout);
      this.recurrenceTimeouts.delete(key);
    }
  }

  /**
   * Calculate the next recurrence dates for a task (pure math, no I/O).
   *
   * @param task - The task to calculate recurrence for
   * @param fileContent - The full file content as lines
   * @param parser - The task parser for date line detection
   * @returns RecurrenceDateCalculationResult with updated flag and new dates
   */
  calculateNextDates(
    task: Task,
    fileContent: string[],
    parser: RecurrenceDateLineParser,
  ): RecurrenceDateCalculationResult {
    const lines = [...fileContent]; // Create a copy to avoid mutating input
    const taskIndent = getTaskIndent(task);

    const now = new Date();
    let newScheduledDate: Date | null = null;
    let newDeadlineDate: Date | null = null;

    // Find SCHEDULED and DEADLINE line indices using the shared utility
    const scheduledLineIndex =
      task.scheduledDateRepeat != null
        ? findDateLineWithParser(
            lines,
            task.line + 1,
            'SCHEDULED',
            taskIndent,
            parser,
            this.keywordManager,
          )
        : -1;
    const deadlineLineIndex =
      task.deadlineDateRepeat != null
        ? findDateLineWithParser(
            lines,
            task.line + 1,
            'DEADLINE',
            taskIndent,
            parser,
            this.keywordManager,
          )
        : -1;

    // Parse and calculate next dates for SCHEDULED line
    if (scheduledLineIndex >= 0 && task.scheduledDateRepeat != null) {
      const line = lines[scheduledLineIndex];
      const date = this.parseDateFromLine(line);
      if (date) {
        newScheduledDate = calculateNextRepeatDate(
          date,
          task.scheduledDateRepeat,
          now,
        );
      }
    }

    // Parse and calculate next dates for DEADLINE line
    if (deadlineLineIndex >= 0 && task.deadlineDateRepeat != null) {
      const line = lines[deadlineLineIndex];
      const date = this.parseDateFromLine(line);
      if (date) {
        newDeadlineDate = calculateNextRepeatDate(
          date,
          task.deadlineDateRepeat,
          now,
        );
      }
    }

    // If no dates need updating, return early
    if (!newScheduledDate && !newDeadlineDate) {
      return { updated: false };
    }

    // Determine warning periods for next occurrence:
    // -Nd (non-firstOnly) is preserved across repeats
    // --Nd (isFirstOnly) is stripped after first occurrence → null triggers stripping in coordinator
    return {
      updated: true,
      newScheduledDate: newScheduledDate ?? undefined,
      newDeadlineDate: newDeadlineDate ?? undefined,
      newScheduledWarningPeriod: newScheduledDate
        ? task.scheduledWarningPeriod?.isFirstOnly
          ? null
          : task.scheduledWarningPeriod
        : undefined,
      newDeadlineWarningPeriod: newDeadlineDate
        ? task.deadlineWarningPeriod?.isFirstOnly
          ? null
          : task.deadlineWarningPeriod
        : undefined,
    };
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
              vaultScanner?: {
                getParser: () => RecurrenceDateLineParser | null;
              } | null;
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

      // Calculate next recurrence dates (pure math)
      const dateResult = this.calculateNextDates(task, lines, parser);

      if (!dateResult.updated) {
        return {
          success: false,
          error: 'No dates needed updating',
        };
      }

      // Use TaskUpdateCoordinator to update the task
      // This ensures all updates go through the unified flow
      // Warning periods are determined here (preserves -Nd, strips --Nd)
      await this.taskUpdateCoordinator.updateTaskRecurrence(task, {
        newScheduledDate: dateResult.newScheduledDate ?? null,
        newDeadlineDate: dateResult.newDeadlineDate ?? null,
        newScheduledRepeat: task.scheduledDateRepeat,
        newDeadlineRepeat: task.deadlineDateRepeat,
        newScheduledWarningPeriod: dateResult.newScheduledWarningPeriod ?? null,
        newDeadlineWarningPeriod: dateResult.newDeadlineWarningPeriod ?? null,
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
   * Parse a date from a date line.
   * Extracts the date from angle brackets in the line.
   *
   * @param line - The date line (e.g., "SCHEDULED: <2026-03-10>")
   * @returns The parsed date or null if not found
   */
  private parseDateFromLine(line: string): Date | null {
    // Match dates like <2026-03-10>, <2026-03-10 Tue>, <2026-03-10 11:30>, <2026-03-10 Tue 11:30>
    const dateMatch = line.match(
      /<(\d{4}-\d{2}-\d{2})(?: [A-Za-z]{3})?(?: (\d{1,2}:\d{2}))?/,
    );
    if (!dateMatch) {
      return null;
    }

    const [, dateStr, timeStr] = dateMatch;
    const [year, month, day] = dateStr.split('-').map(Number);

    if (timeStr) {
      const [hours, minutes] = timeStr.split(':').map(Number);
      return new Date(year, month - 1, day, hours, minutes);
    }

    return new Date(year, month - 1, day);
  }

  /**
   * Clean up all pending recurrence updates.
   */
  destroy(): void {
    for (const timeout of this.recurrenceTimeouts.values()) {
      window.clearTimeout(timeout);
    }
    this.recurrenceTimeouts.clear();
  }
}
