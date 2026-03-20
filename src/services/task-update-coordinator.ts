/**
 * TaskUpdateCoordinator provides a centralized, unified way to handle all task updates
 * from any view (editor, reader, task list, embedded lists).
 *
 * ARCHITECTURE:
 * - Unified entry point: updateTask(context) handles all update types
 * - Convenience methods: updateTaskState, updateTaskScheduledDate, updateTaskDeadlineDate,
 *   updateTaskPriority, updateTaskRecurrence, updateTaskByPath (all delegate to updateTask)
 * - Sync phase (always completes): optimistic update, DOM manipulation, UI refresh
 * - Async phase (background): file write, conditional recurrence scheduling (for state updates with repeating dates), state finalization
 * - Per-task locking prevents race conditions from rapid updates
 * - Per-file queueing ensures serialized writes to same file
 *
 * This design ensures consistent behavior on both desktop and mobile.
 */
import { Task, DateRepeatInfo } from '../types/task';
import { KeywordManager } from '../utils/keyword-manager';
import TodoTracker from '../main';
import { TaskStateManager } from './task-state-manager';
import { TaskWriter } from './task-writer';
import { TFile, MarkdownView } from 'obsidian';
import { EditorView } from '@codemirror/view';
import { ChangeTracker } from './change-tracker';
import { RecurrenceCoordinator } from './recurrence-coordinator';
import { TaskStateTransitionManager } from './task-state-transition-manager';
import { RecurrenceManager } from './recurrence-manager';
import {
  calculateTaskUrgency,
  getDefaultCoefficients,
  UrgencyContext,
  UrgencyCoefficients,
} from '../utils/task-urgency';

/**
 * Types of task updates supported by the coordinator
 */
export type UpdateType =
  | 'state'
  | 'scheduled-date'
  | 'deadline-date'
  | 'priority'
  | 'closed-date'
  | 'recurrence';

/**
 * Source of the update (for debugging/tracking)
 */
export type UpdateSource = 'editor' | 'reader' | 'task-list' | 'embedded';

/**
 * Context object for a task update operation.
 * Contains all information needed to perform the update.
 */
export interface UpdateContext {
  /** The task to update */
  task: Task;
  /** Type of update being performed */
  type: UpdateType;
  /** Source of the update */
  source: UpdateSource;
  /** New state (for 'state' type updates) */
  newState?: string;
  /** New date (for date type updates) */
  newDate?: Date | null;
  /** New repeat info (for date type updates) */
  newRepeat?: DateRepeatInfo | null;
  /** New priority (for 'priority' type updates) */
  newPriority?: 'high' | 'med' | 'low' | null;
  /** New scheduled date (for 'recurrence' type updates) */
  newScheduledDate?: Date | null;
  /** New deadline date (for 'recurrence' type updates) */
  newDeadlineDate?: Date | null;
  /** New scheduled repeat (for 'recurrence' type updates) */
  newScheduledRepeat?: DateRepeatInfo | null;
  /** New deadline repeat (for 'recurrence' type updates) */
  newDeadlineRepeat?: DateRepeatInfo | null;
  /** New state for recurrence (for 'recurrence' type updates) */
  newStateForRecurrence?: string;
}

/**
 * Internal context used during update processing
 */
interface ProcessingContext {
  task: Task;
  type: UpdateType;
  source: UpdateSource;
  /** The state to write to the file (may differ from requested for recurring tasks) */
  newState: string;
  /** The original requested state - used for recurrence checking */
  originalNewState: string;
  newDate?: Date | null;
  newRepeat?: DateRepeatInfo | null;
  newPriority?: 'high' | 'med' | 'low' | null;
  /** New scheduled date (for 'recurrence' type updates) */
  newScheduledDate?: Date | null;
  /** New deadline date (for 'recurrence' type updates) */
  newDeadlineDate?: Date | null;
  /** New scheduled repeat (for 'recurrence' type updates) */
  newScheduledRepeat?: DateRepeatInfo | null;
  /** New deadline repeat (for 'recurrence' type updates) */
  newDeadlineRepeat?: DateRepeatInfo | null;
  /** New state for recurrence (for 'recurrence' type updates) */
  newStateForRecurrence?: string;
  filePath: string;
  fileLine: number;
}

export class TaskUpdateCoordinator {
  private changeTracker: ChangeTracker;
  private recurrenceCoordinator: RecurrenceCoordinator;
  private recurrenceManager: RecurrenceManager;
  private urgencyCoefficients: UrgencyCoefficients = getDefaultCoefficients();

  /** Per-task locking: prevents race conditions from rapid updates to same task */
  private pendingTaskUpdates = new Map<string, Promise<void>>();

  /** Per-file queueing: ensures serialized writes to same file */
  private fileUpdateQueues = new Map<string, Promise<unknown>>();

  private getTaskKey(path: string, line: number): string {
    return `${path}:${line}`;
  }

  constructor(
    private plugin: TodoTracker,
    private taskStateManager: TaskStateManager,
    private keywordManager: KeywordManager,
  ) {
    this.changeTracker = new ChangeTracker({
      defaultTimeoutMs: 5000,
    });

    this.recurrenceManager = new RecurrenceManager(this.keywordManager);

    this.recurrenceCoordinator = new RecurrenceCoordinator(
      this.plugin,
      this.taskStateManager,
    );

    // Set the TaskUpdateCoordinator reference to avoid circular dependency
    this.recurrenceCoordinator.setTaskUpdateCoordinator(this);
  }

  /**
   * Update the urgency coefficients (called when settings change).
   */
  setUrgencyCoefficients(coefficients: UrgencyCoefficients): void {
    this.urgencyCoefficients = coefficients;
  }

  /**
   * UNIFIED ENTRY POINT: Update a task with any combination of changes.
   *
   * This is the SINGLE entry point for all task updates from any view.
   *
   * @param context - Update context containing task and change details
   * @returns Promise resolving when async phase is complete (for testing)
   */
  async updateTask(context: UpdateContext): Promise<void> {
    const procContext = this.buildProcessingContext(context);
    this.performSyncPhase(procContext);
    return this.queueAsyncPhase(procContext);
  }

  /**
   * Convenience method for updating task state.
   */
  async updateTaskState(
    task: Task,
    newState: string,
    source: UpdateSource = 'editor',
  ): Promise<void> {
    return this.updateTask({
      task,
      type: 'state',
      source,
      newState,
    });
  }

  /**
   * Convenience method for updating scheduled date.
   */
  async updateTaskScheduledDate(
    task: Task,
    date: Date | null,
    repeat?: DateRepeatInfo | null,
  ): Promise<void> {
    return this.updateTask({
      task,
      type: 'scheduled-date',
      source: 'task-list',
      newDate: date,
      newRepeat: repeat,
    });
  }

  /**
   * Convenience method for updating deadline date.
   */
  async updateTaskDeadlineDate(
    task: Task,
    date: Date | null,
    repeat?: DateRepeatInfo | null,
  ): Promise<void> {
    return this.updateTask({
      task,
      type: 'deadline-date',
      source: 'task-list',
      newDate: date,
      newRepeat: repeat,
    });
  }

  /**
   * Convenience method for updating task priority.
   */
  async updateTaskPriority(
    task: Task,
    newPriority: 'high' | 'med' | 'low' | null,
  ): Promise<void> {
    return this.updateTask({
      task,
      type: 'priority',
      source: 'task-list',
      newPriority,
    });
  }

  /**
   * Convenience method for updating task recurrence.
   * Updates scheduled date, deadline date, and state for recurring tasks.
   */
  async updateTaskRecurrence(
    task: Task,
    options: {
      newScheduledDate?: Date | null;
      newDeadlineDate?: Date | null;
      newScheduledRepeat?: DateRepeatInfo | null;
      newDeadlineRepeat?: DateRepeatInfo | null;
      newStateForRecurrence?: string;
    },
  ): Promise<void> {
    return this.updateTask({
      task,
      type: 'recurrence',
      source: 'task-list',
      ...options,
    });
  }

  /**
   * Convenience method: Update task state by path and line.
   * If the task is not found (e.g., was archived), re-parse it from the file
   * if the new state is non-archived.
   */
  async updateTaskByPath(
    taskPath: string,
    taskLine: number,
    newState: string,
    source: UpdateSource = 'editor',
  ): Promise<void> {
    let task = this.taskStateManager.findTaskByPathAndLine(taskPath, taskLine);

    if (!task && !this.keywordManager.isArchived(newState)) {
      task = await this.reAddTaskFromFile(taskPath, taskLine);
    }

    if (!task) {
      console.debug(
        `[TaskUpdateCoordinator] Task not found at path=${taskPath}, line=${taskLine}`,
      );
      return;
    }

    return this.updateTask({
      task,
      type: 'state',
      source,
      newState,
    });
  }

  /**
   * Re-parse a task from a file and add it to the state manager.
   * Used when a task transitions from archived back to a non-archived state.
   */
  private async reAddTaskFromFile(
    taskPath: string,
    taskLine: number,
  ): Promise<Task | null> {
    const parser = this.plugin.vaultScanner?.getParser();
    if (!parser) {
      return null;
    }

    try {
      const file = this.plugin.app.vault.getAbstractFileByPath(taskPath);
      if (!(file instanceof TFile)) {
        return null;
      }

      const content = await this.plugin.app.vault.read(file);
      const lines = content.split('\n');

      if (taskLine < 0 || taskLine >= lines.length) {
        return null;
      }

      const line = lines[taskLine];
      const parsedTask = parser.parseLine(line, taskLine, taskPath);

      if (parsedTask) {
        const existingTask = this.taskStateManager.findTaskByPathAndLine(
          taskPath,
          taskLine,
        );
        if (!existingTask) {
          this.taskStateManager.addTask(parsedTask);
        }
        return parsedTask;
      }
    } catch (error) {
      console.debug(`[TaskUpdateCoordinator] Failed to re-parse task:`, error);
    }

    return null;
  }

  /**
   * Build processing context with all required fields populated
   */
  private buildProcessingContext(context: UpdateContext): ProcessingContext {
    let newState = context.newState ?? '';
    // Preserve the original requested state for recurrence checking
    const originalNewState = context.newState ?? '';

    if (context.type === 'state' && context.newState) {
      const isOriginalStateCompleted = this.keywordManager.isCompleted(
        context.newState,
      );
      const hasRepeatingDates =
        (context.task.scheduledDateRepeat != null &&
          context.task.scheduledDate != null) ||
        (context.task.deadlineDateRepeat != null &&
          context.task.deadlineDate != null);

      // For recurring tasks being marked complete, calculate the next inactive state
      // but preserve originalNewState to track that user completed the task
      if (isOriginalStateCompleted && hasRepeatingDates) {
        const stateManager = new TaskStateTransitionManager(
          this.keywordManager,
          this.plugin.settings?.stateTransitions,
        );
        newState = stateManager.getNextState(context.newState);
      }
    }

    return {
      task: context.task,
      type: context.type,
      source: context.source,
      newState,
      originalNewState,
      newDate: context.newDate,
      newRepeat: context.newRepeat,
      newPriority: context.newPriority,
      newScheduledDate: context.newScheduledDate,
      newDeadlineDate: context.newDeadlineDate,
      newScheduledRepeat: context.newScheduledRepeat,
      newDeadlineRepeat: context.newDeadlineRepeat,
      newStateForRecurrence: context.newStateForRecurrence,
      filePath: context.task.path,
      fileLine: context.task.line,
    };
  }

  /**
   * SYNC PHASE: Execute immediately, always completes.
   */
  private performSyncPhase(context: ProcessingContext): void {
    const newState =
      context.type === 'state'
        ? context.newState
        : (context.newStateForRecurrence ?? '');

    if (
      context.type === 'state' ||
      (context.type === 'recurrence' && context.newStateForRecurrence)
    ) {
      this.taskStateManager.optimisticUpdate(context.task, newState);

      if (this.keywordManager.isArchived(newState)) {
        this.removeTaskFromStateManager(context.task);
      }
    }

    if (context.type === 'state') {
      this.performDirectEmbedDOMUpdate(context.task, context.newState);
    }

    this.refreshVisibleEditorDecorations();
  }

  /**
   * ASYNC PHASE: Queue for background execution.
   */
  private async queueAsyncPhase(context: ProcessingContext): Promise<void> {
    const taskKey = this.getTaskKey(context.filePath, context.fileLine);
    const existingUpdate = this.pendingTaskUpdates.get(taskKey);

    const asyncWork = async (): Promise<void> => {
      if (existingUpdate) {
        await existingUpdate;
      }
      await this.performAsyncPhase(context);
    };

    const promise = asyncWork();
    this.pendingTaskUpdates.set(taskKey, promise);

    try {
      await promise;
    } finally {
      this.pendingTaskUpdates.delete(taskKey);
    }
  }

  /**
   * ASYNC PHASE: Perform file write, recurrence, and state finalization.
   */
  private async performAsyncPhase(context: ProcessingContext): Promise<void> {
    const existingQueue = this.fileUpdateQueues.get(context.filePath);

    const doAsyncWork = async (): Promise<void> => {
      const taskEditor = this.plugin.taskEditor;
      if (!taskEditor) {
        throw new Error('TaskEditor is not initialized');
      }

      let currentTask = this.taskStateManager.findTaskByPathAndLine(
        context.filePath,
        context.fileLine,
      );

      if (!currentTask || currentTask.rawText !== context.task.rawText) {
        const validatedTask = this.taskStateManager.findTaskByContent(
          context.filePath,
          context.task,
        );
        if (validatedTask) {
          currentTask = validatedTask;
        }
      }

      currentTask = currentTask || context.task;

      let updatedTask: Task;
      try {
        this.plugin.vaultScanner?.addSkipIncrementalChange(context.filePath);
        updatedTask = await this.performFileWrite(
          taskEditor,
          currentTask,
          context,
        );
      } catch (error) {
        console.error(
          `[TODOseq] File write failed for ${context.type} at line ${context.fileLine}:`,
          error,
        );
        const file = this.plugin.app.vault.getAbstractFileByPath(
          context.filePath,
        );
        if (file instanceof TFile) {
          await this.plugin.vaultScanner?.processIncrementalChange(file);
        }
        return;
      }

      const lineDelta = (updatedTask as Task & { lineDelta?: number })
        .lineDelta;
      if (lineDelta !== undefined && lineDelta !== 0) {
        this.taskStateManager.adjustLineIndices(
          currentTask.path,
          currentTask.line + 1,
          lineDelta,
        );
      }

      this.finalizeTaskState(updatedTask, context);

      if (context.type === 'state') {
        this.handleRecurrence(updatedTask, context);

        // Update editor checkbox visual state after markdown has been updated
        this.performDirectEditorCheckboxUpdate(updatedTask, context.newState);
      }
    };

    const queuePromise = existingQueue
      ? existingQueue.then(() => doAsyncWork())
      : doAsyncWork();

    this.fileUpdateQueues.set(context.filePath, queuePromise);

    try {
      await queuePromise;
    } finally {
      if (this.fileUpdateQueues.get(context.filePath) === queuePromise) {
        this.fileUpdateQueues.delete(context.filePath);
      }
    }
  }

  /**
   * Perform the appropriate file write based on update type
   */
  private async performFileWrite(
    taskEditor: TaskWriter,
    task: Task,
    context: ProcessingContext,
  ): Promise<Task> {
    switch (context.type) {
      case 'state':
        return taskEditor.updateTaskState(task, context.newState);

      case 'scheduled-date':
        if (!context.newDate) {
          return taskEditor.removeTaskScheduledDate(task);
        }
        return taskEditor.updateTaskScheduledDate(
          task,
          context.newDate,
          context.newRepeat,
        );

      case 'deadline-date':
        if (!context.newDate) {
          return taskEditor.removeTaskDeadlineDate(task);
        }
        return taskEditor.updateTaskDeadlineDate(
          task,
          context.newDate,
          context.newRepeat,
        );

      case 'priority':
        if (context.newPriority === null || context.newPriority === undefined) {
          return taskEditor.removeTaskPriority(task);
        }
        return taskEditor.updateTaskPriority(task, context.newPriority);

      case 'closed-date':
        return task;

      case 'recurrence': {
        let updatedTask = task;
        let totalLineDelta = 0;
        // Update scheduled date if needed
        if (context.newScheduledDate !== undefined) {
          if (context.newScheduledDate === null) {
            const result =
              await taskEditor.removeTaskScheduledDate(updatedTask);
            updatedTask = result;
            totalLineDelta += result.lineDelta ?? 0;
          } else {
            const result = await taskEditor.updateTaskScheduledDate(
              updatedTask,
              context.newScheduledDate,
              context.newScheduledRepeat ?? updatedTask.scheduledDateRepeat,
            );
            updatedTask = result;
            totalLineDelta += result.lineDelta ?? 0;
          }
        }
        // Update deadline date if needed
        if (context.newDeadlineDate !== undefined) {
          if (context.newDeadlineDate === null) {
            const result = await taskEditor.removeTaskDeadlineDate(updatedTask);
            updatedTask = result;
            totalLineDelta += result.lineDelta ?? 0;
          } else {
            const result = await taskEditor.updateTaskDeadlineDate(
              updatedTask,
              context.newDeadlineDate,
              context.newDeadlineRepeat ?? updatedTask.deadlineDateRepeat,
            );
            updatedTask = result;
            totalLineDelta += result.lineDelta ?? 0;
          }
        }
        // Update state if needed
        if (context.newStateForRecurrence) {
          updatedTask = await taskEditor.updateTaskState(
            updatedTask,
            context.newStateForRecurrence,
          );
        }
        // Store accumulated lineDelta for the async phase to handle
        if (totalLineDelta !== 0) {
          (updatedTask as Task & { lineDelta?: number }).lineDelta =
            totalLineDelta;
        }
        return updatedTask;
      }

      default:
        throw new Error(`Unknown update type: ${context.type}`);
    }
  }

  /**
   * Finalize task state in the state manager
   */
  private finalizeTaskState(
    updatedTask: Task,
    context: ProcessingContext,
  ): void {
    const isStateUpdate =
      context.type === 'state' || context.type === 'recurrence';
    const newState =
      context.type === 'state' ? context.newState : updatedTask.state;

    if (isStateUpdate && this.keywordManager.isArchived(newState)) {
      this.removeTaskFromStateManager(updatedTask);
      return;
    }

    const urgency = this.calculateUrgencyForTask(updatedTask);

    switch (context.type) {
      case 'state':
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
            urgency,
          },
        );
        break;

      case 'scheduled-date':
        this.taskStateManager.updateTaskByPathAndLine(
          updatedTask.path,
          updatedTask.line,
          {
            rawText: updatedTask.rawText,
            scheduledDate: updatedTask.scheduledDate,
            scheduledDateRepeat: updatedTask.scheduledDateRepeat,
            urgency,
          },
        );
        break;

      case 'deadline-date':
        this.taskStateManager.updateTaskByPathAndLine(
          updatedTask.path,
          updatedTask.line,
          {
            rawText: updatedTask.rawText,
            deadlineDate: updatedTask.deadlineDate,
            deadlineDateRepeat: updatedTask.deadlineDateRepeat,
            urgency,
          },
        );
        break;

      case 'priority':
        this.taskStateManager.updateTaskByPathAndLine(
          updatedTask.path,
          updatedTask.line,
          {
            rawText: updatedTask.rawText,
            priority: updatedTask.priority,
            urgency,
          },
        );
        break;

      case 'recurrence':
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
            urgency,
          },
        );
        break;
    }

    this.taskStateManager.notifySubscribers();
  }

  /**
   * Calculate urgency for a task using current urgency coefficients.
   */
  private calculateUrgencyForTask(task: Task): number | null {
    if (task.completed) {
      return null;
    }

    const urgencyContext: UrgencyContext = {
      activeKeywordsSet: this.keywordManager.getActiveSet(),
      waitingKeywordsSet: this.keywordManager.getWaitingSet(),
    };

    return calculateTaskUrgency(task, this.urgencyCoefficients, urgencyContext);
  }

  /**
   * Handle recurrence scheduling for completed recurring tasks.
   * Receives the post-file-write task (inactive state written, not completed state).
   * Uses originalNewState to detect user's completion intent.
   */
  private handleRecurrence(
    updatedTask: Task,
    context: ProcessingContext,
  ): void {
    // Use originalNewState to check if user requested completion
    // This is the state they clicked (e.g., DONE), not what was written (e.g., TODO)
    const isOriginalCompleted = this.keywordManager.isCompleted(
      context.originalNewState,
    );

    const taskHasRepeatingDates =
      (updatedTask.scheduledDateRepeat != null &&
        updatedTask.scheduledDate != null) ||
      (updatedTask.deadlineDateRepeat != null &&
        updatedTask.deadlineDate != null);

    if (isOriginalCompleted && taskHasRepeatingDates) {
      this.recurrenceCoordinator.scheduleRecurrence(updatedTask, 50);
    }
  }

  /**
   * Perform direct DOM manipulation on embeds.
   */
  private performDirectEmbedDOMUpdate(task: Task, newState: string): void {
    const fileName = task.path.split('/').pop()?.replace('.md', '');
    if (!fileName) return;

    const embeds = document.querySelectorAll('.internal-embed');

    embeds.forEach((embed) => {
      const src = embed.getAttribute('src');
      if (!src || !src.includes(fileName)) return;

      if (task.embedReference) {
        const blockRef = task.embedReference.replace('^', '');
        if (!src.includes(blockRef)) return;
      }

      const keywordEl = embed.querySelector('[data-task-keyword]');
      if (!keywordEl) return;

      const oldState = keywordEl.getAttribute('data-task-keyword');
      if (!oldState || oldState === newState) return;

      keywordEl.textContent = newState;
      keywordEl.setAttribute('data-task-keyword', newState);
      keywordEl.setAttribute('aria-label', `Task keyword: ${newState}`);

      const wasCompleted = KeywordManager.isCompletedKeyword(
        oldState,
        this.plugin.settings,
      );
      const isNowCompleted = KeywordManager.isCompletedKeyword(
        newState,
        this.plugin.settings,
      );

      if (wasCompleted && !isNowCompleted) {
        const completedContainer = keywordEl.closest(
          '.todoseq-completed-task-text',
        );
        if (completedContainer && completedContainer.parentNode) {
          const parent = completedContainer.parentNode;
          parent.insertBefore(keywordEl, completedContainer.firstChild);
          while (completedContainer.firstChild) {
            parent.insertBefore(completedContainer.firstChild, keywordEl);
          }
          completedContainer.remove();
        }
      }
    });
  }

  /**
   * Perform direct DOM manipulation on editor checkboxes.
   * Updates the checkbox visual state after markdown has been updated.
   */
  private performDirectEditorCheckboxUpdate(
    task: Task,
    newState: string,
  ): void {
    const isCompleted = KeywordManager.isCompletedKeyword(
      newState,
      this.plugin.settings,
    );
    const view = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);

    if (!view || !view.file || view.file.path !== task.path) {
      return;
    }

    const editorView = (view.editor as { cm?: EditorView })?.cm;
    if (!editorView) {
      return;
    }

    // Use requestAnimationFrame to ensure CodeMirror has finished re-rendering
    requestAnimationFrame(() => {
      try {
        // Find the line element by line number
        const linePos = editorView.state.doc.line(task.line + 1); // Convert to 1-indexed
        const domAtPos = editorView.domAtPos(linePos.from);

        if (!domAtPos) {
          return;
        }

        // Find the closest line element
        let lineElement: HTMLElement | null = domAtPos.node as HTMLElement;
        while (lineElement && !lineElement.classList.contains('cm-line')) {
          lineElement = lineElement.parentElement;
        }

        if (!lineElement) {
          return;
        }

        // Find the checkbox in this line
        const checkbox = lineElement.querySelector(
          '.task-list-item-checkbox',
        ) as HTMLInputElement;

        if (checkbox) {
          checkbox.checked = isCompleted;
        }
      } catch (error) {
        // Silently fail if we can't find or update the checkbox
        // This is a visual enhancement, not critical functionality
      }
    });
  }

  /**
   * Refresh visible editor decorations.
   */
  private refreshVisibleEditorDecorations(): void {
    if (this.plugin.refreshVisibleEditorDecorations) {
      this.plugin.refreshVisibleEditorDecorations();
    }
  }

  /**
   * Remove a task from the state manager and notify subscribers.
   * Used when a task transitions to an archived state.
   */
  private removeTaskFromStateManager(task: Task): void {
    this.taskStateManager.removeTasks(
      (t) => t.path === task.path && t.line === task.line,
    );
  }

  /**
   * Clean up resources.
   */
  destroy(): void {
    this.changeTracker.destroy();
  }
}
