import { Task } from '../types/task';
import { TaskWriter } from './task-writer';
import { KeywordManager } from '../utils/keyword-manager';
import { CHECKBOX_DETECTION_REGEX } from '../utils/patterns';

/**
 * TaskStateManager provides centralized state management for tasks.
 * It eliminates duplication by maintaining a single source of truth
 * and notifying subscribers when tasks change.
 */
export class TaskStateManager {
  private _tasks: Task[] = [];
  private subscribers = new Set<(tasks: Task[]) => void>();
  private isNotifying = false;
  private pendingNotification = false;
  private keywordManager: KeywordManager;

  constructor(keywordManager: KeywordManager) {
    this.keywordManager = keywordManager;
  }

  getKeywordManager(): KeywordManager {
    return this.keywordManager;
  }

  setKeywordManager(keywordManager: KeywordManager): void {
    this.keywordManager = keywordManager;
  }

  /**
   * Subscribe to task changes. The callback is called immediately with current tasks.
   * @param callback Function to call when tasks change
   * @returns Unsubscribe function
   */
  subscribe(callback: (tasks: Task[]) => void): () => void {
    this.subscribers.add(callback);
    callback(this._tasks);
    return () => this.subscribers.delete(callback);
  }

  /**
   * Set the tasks array and notify all subscribers.
   * @param tasks New tasks array
   */
  setTasks(tasks: Task[]): void {
    this._tasks = tasks;
    this.notifySubscribers();
  }

  /**
   * Get the current tasks array (shallow copy).
   * The returned array is a copy to prevent external mutations.
   * Task objects within the array are still mutable by design for performance.
   * Use setTasks(), updateTasks(), or other methods to modify state.
   *
   * @returns Shallow copy of current tasks array
   */
  getTasks(): Task[] {
    return [...this._tasks];
  }

  /**
   * Update tasks with a transformation function.
   * @param updater Function that receives current tasks and returns new tasks
   */
  updateTasks(updater: (tasks: Task[]) => Task[]): void {
    this._tasks = updater(this._tasks);
    this.notifySubscribers();
  }

  /**
   * Add a single task to the collection.
   * @param task Task to add
   */
  addTask(task: Task): void {
    this._tasks.push(task);
    this.notifySubscribers();
  }

  /**
   * Remove tasks matching a predicate.
   * @param predicate Function that returns true for tasks to remove
   */
  removeTasks(predicate: (task: Task) => boolean): void {
    this._tasks = this._tasks.filter((task) => !predicate(task));
    this.notifySubscribers();
  }

  /**
   * Adjust line indices for all tasks in a file starting from a given line.
   * Used when date lines (SCHEDULED/DEADLINE/CLOSED) are added/removed.
   * This ensures subsequent task updates use correct line indices.
   * @param path - File path
   * @param fromLine - Starting line index (inclusive)
   * @param delta - Number of lines to add (positive) or remove (negative)
   */
  adjustLineIndices(path: string, fromLine: number, delta: number): void {
    if (delta === 0) return;

    let adjusted = false;
    for (const task of this._tasks) {
      if (task.path === path && task.line >= fromLine) {
        task.line += delta;
        adjusted = true;
      }
    }

    if (adjusted) {
      this.notifySubscribers();
    }
  }

  /**
   * Find a task by file path and line number.
   * @param path File path
   * @param line Line number (0-indexed)
   * @returns Task or null if not found
   */
  findTaskByPathAndLine(path: string, line: number): Task | null {
    const foundTask =
      this._tasks.find((t) => t.path === path && t.line === line) || null;
    return foundTask;
  }

  /**
   * Find task by content match, searching near expected line.
   * Used to correct line index when file has changed (e.g., date lines added).
   * @param path - File path
   * @param task - Task to find (uses rawText for matching)
   * @param searchRange - Lines to search above/below expected line (default: 2)
   * @returns Task with corrected line index, or null if not found
   */
  findTaskByContent(path: string, task: Task, searchRange = 2): Task | null {
    const tasksInFile = this._tasks.filter((t) => t.path === path);

    for (let offset = -searchRange; offset <= searchRange; offset++) {
      const lineToCheck = task.line + offset;
      if (lineToCheck < 0) continue;

      const match = tasksInFile.find(
        (t) => t.line === lineToCheck && t.rawText === task.rawText,
      );
      if (match) {
        return match;
      }
    }

    return null;
  }

  /**
   * Update a task by file path and line number.
   * @param path File path
   * @param line Line number (0-indexed)
   * @param updates Partial task properties to update
   * @returns true if task was found and updated, false otherwise
   *
   * Note: This is an internal utility method. It does NOT notify subscribers.
   * Callers must call notifySubscribers() explicitly to control when notifications happen.
   * This prevents double notifications when this method is called from updateTaskState().
   */
  updateTaskByPathAndLine(
    path: string,
    line: number,
    updates: Partial<Task>,
  ): boolean {
    const existingTask = this.findTaskByPathAndLine(path, line);
    if (!existingTask) {
      return false;
    }

    const index = this._tasks.indexOf(existingTask);
    if (index === -1) {
      return false;
    }

    // Track completion status before update
    const wasCompleted = existingTask.completed;
    const isCompleted =
      updates.completed !== undefined ? updates.completed : wasCompleted;

    this._tasks[index] = {
      ...existingTask,
      ...updates,
      _lastUpdateTime: Date.now(),
    };

    // Update parent subtask counts if completion status changed
    if (wasCompleted !== isCompleted) {
      this.updateParentSubtaskCountsForTask(
        existingTask,
        wasCompleted,
        isCompleted,
      );
    }

    return true;
  }

  /**
   * Perform an optimistic update on a task.
   * @param task The task to update
   * @param newState The new state to set
   * @returns The updated task line content
   */
  optimisticUpdate(task: Task, newState: string): string {
    const isCompleted = this.keywordManager.isCompleted(newState);

    // Generate the new rawText first
    const { newLine } = TaskWriter.generateTaskLine(
      task,
      newState,
      true,
      this.keywordManager,
    );

    // Update using path+line lookup for safety
    // Note: updateTaskByPathAndLine already handles parent subtask count updates
    this.updateTaskByPathAndLine(task.path, task.line, {
      state: newState as Task['state'],
      completed: isCompleted,
      rawText: newLine,
    });

    // Notify subscribers of the change
    this.notifySubscribers();

    return newLine;
  }

  /**
   * Get the count of tasks.
   * @returns Number of tasks
   */
  getTaskCount(): number {
    return this._tasks.length;
  }

  /**
   * Get the count of incomplete tasks.
   * @returns Number of incomplete tasks
   */
  getIncompleteTaskCount(): number {
    return this._tasks.filter((t) => !t.completed).length;
  }

  /**
   * Clear all tasks.
   */
  clearTasks(): void {
    this._tasks = [];
    this.notifySubscribers();
  }

  /**
   * Calculate the total indentation length (treating tabs as equivalent to spaces).
   * Matches the logic in TaskParser.getIndentLength().
   * @param indent The indent string
   * @returns The effective indent length
   */
  private getIndentLength(indent: string): number {
    let length = 0;
    for (const char of indent) {
      if (char === '\t') {
        length += 2;
      } else {
        length += 1;
      }
    }
    return length;
  }

  /**
   * Check if a task is a subtask of a potential parent based on indent levels.
   * Matches the logic in TaskParser.isSubtaskLine().
   * @param task The task to check
   * @param parentTask The potential parent task
   * @returns true if task is a subtask of parentTask
   */
  private isSubtaskOf(task: Task, parentTask: Task): boolean {
    const parentIndent = parentTask.indent;
    const taskIndent = task.indent;

    // Handle quoted lines - extract quote prefix separately
    const parentQuotePrefix = parentIndent.match(/^(>\s*)+/)?.[0] ?? '';
    const taskQuotePrefix = taskIndent.match(/^(>\s*)+/)?.[0] ?? '';

    // Check if both are in the same quote nesting level
    if (parentQuotePrefix !== taskQuotePrefix) {
      return false;
    }

    // Get the actual whitespace indent (without quote prefix)
    const parentWhitespaceIndent = parentIndent.substring(
      parentQuotePrefix.length,
    );
    const taskWhitespaceIndent = taskIndent.substring(taskQuotePrefix.length);

    const parentIndentLength = this.getIndentLength(parentWhitespaceIndent);
    const taskIndentLength = this.getIndentLength(taskWhitespaceIndent);

    // Check if parent has a checkbox
    const parentHasCheckbox = CHECKBOX_DETECTION_REGEX.test(parentTask.rawText);

    // If parent has a checkbox, subtask must be more indented
    // If parent doesn't have a checkbox, subtask can be at same or greater indentation
    if (parentHasCheckbox) {
      return taskIndentLength > parentIndentLength;
    } else {
      return taskIndentLength >= parentIndentLength;
    }
  }

  /**
   * Find all parent tasks of a given task based on indent levels.
   * A task is a parent if:
   * - It's in the same file
   * - It appears before the task
   * - Its indent level is less than the task's indent level
   * - There's no other task with indent between them that breaks the chain
   *
   * @param task - The task to find parents for
   * @returns Array of parent tasks (ordered from immediate to root)
   */
  private findParentTasks(task: Task): Task[] {
    // Get all tasks in the same file, sorted by line number
    const tasksInFile = this._tasks
      .filter((t) => t.path === task.path && t.line < task.line)
      .sort((a, b) => a.line - b.line);

    const parents: Task[] = [];
    let currentTask = task;

    // Walk backwards through tasks to find the parent chain
    for (let i = tasksInFile.length - 1; i >= 0; i--) {
      const potentialParent = tasksInFile[i];

      // Check if this task is a parent of the current task
      if (this.isSubtaskOf(currentTask, potentialParent)) {
        parents.push(potentialParent);
        currentTask = potentialParent;

        // If we've found a task with no indent (root level), stop searching
        if (this.getIndentLength(currentTask.indent) === 0) {
          break;
        }
      }
    }

    // Return parents ordered from immediate to root (reverse of insertion order)
    return parents;
  }

  /**
   * Update a parent task's subtask counts based on a child task's completion change.
   *
   * @param parentTask - The parent task to update
   * @param wasCompleted - Whether the child task was completed before
   * @param isCompleted - Whether the child task is completed now
   */
  private updateParentSubtaskCounts(
    parentTask: Task,
    wasCompleted: boolean,
    isCompleted: boolean,
  ): void {
    const index = this._tasks.indexOf(parentTask);
    if (index === -1) return;

    const updatedTask = { ...parentTask };

    // Update completed count based on transition
    if (wasCompleted && !isCompleted) {
      // Child went from completed to not completed
      updatedTask.subtaskCompletedCount = Math.max(
        0,
        updatedTask.subtaskCompletedCount - 1,
      );
    } else if (!wasCompleted && isCompleted) {
      // Child went from not completed to completed
      updatedTask.subtaskCompletedCount += 1;
    }

    this._tasks[index] = updatedTask;
  }

  /**
   * Update all parent tasks' subtask counts for a given task.
   *
   * @param task - The task whose completion status changed
   * @param wasCompleted - Whether the task was completed before
   * @param isCompleted - Whether the task is completed now
   */
  private updateParentSubtaskCountsForTask(
    task: Task,
    wasCompleted: boolean,
    isCompleted: boolean,
  ): void {
    const parentTasks = this.findParentTasks(task);
    for (const parent of parentTasks) {
      this.updateParentSubtaskCounts(parent, wasCompleted, isCompleted);
    }
  }

  /**
   * Find parent tasks for a checkbox-only subtask (no keyword).
   * Used for optimistic updates when checkbox-only subtasks are toggled.
   *
   * @param filePath - File path of the subtask
   * @param line - Line number of the subtask (0-indexed)
   * @param indent - Indent of the subtask line
   * @returns Array of parent tasks (ordered from immediate to root)
   */
  findParentTasksForCheckbox(
    filePath: string,
    line: number,
    indent: string,
  ): Task[] {
    const tasksInFile = this._tasks
      .filter((t) => t.path === filePath && t.line < line)
      .sort((a, b) => a.line - b.line);

    const parents: Task[] = [];
    let currentIndent = indent;
    let currentIndentLength = this.getIndentLength(indent);

    for (let i = tasksInFile.length - 1; i >= 0; i--) {
      const potentialParent = tasksInFile[i];

      const parentIndent = potentialParent.indent;
      const parentQuotePrefix = parentIndent.match(/^(>\s*)+/)?.[0] ?? '';
      const taskQuotePrefix = currentIndent.match(/^(>\s*)+/)?.[0] ?? '';

      if (parentQuotePrefix !== taskQuotePrefix) {
        continue;
      }

      const parentWhitespaceIndent = parentIndent.substring(
        parentQuotePrefix.length,
      );
      const parentIndentLength = this.getIndentLength(parentWhitespaceIndent);

      const parentHasCheckbox = CHECKBOX_DETECTION_REGEX.test(
        potentialParent.rawText,
      );

      let isParent = false;
      if (parentHasCheckbox) {
        isParent = currentIndentLength > parentIndentLength;
      } else {
        isParent = currentIndentLength >= parentIndentLength;
      }

      if (isParent) {
        parents.push(potentialParent);

        if (this.getIndentLength(parentWhitespaceIndent) === 0) {
          break;
        }

        currentIndent = parentIndent;
        currentIndentLength = parentIndentLength;
      }
    }

    return parents;
  }

  /**
   * Optimistically update parent subtask counts for a checkbox-only subtask (no keyword).
   * This enables immediate UI updates when checkbox-only subtasks are toggled.
   *
   * @param filePath - File path of the subtask
   * @param line - Line number of the subtask (0-indexed)
   * @param indent - Indent of the subtask line
   * @param wasCompleted - Whether the subtask was completed before
   * @param isCompleted - Whether the subtask is completed now
   * @param shouldNotify - Whether to notify subscribers (default: true)
   */
  updateParentSubtaskCountsForCheckbox(
    filePath: string,
    line: number,
    indent: string,
    wasCompleted: boolean,
    isCompleted: boolean,
    shouldNotify = true,
  ): void {
    if (wasCompleted === isCompleted) {
      return;
    }

    const parentTasks = this.findParentTasksForCheckbox(filePath, line, indent);
    for (const parent of parentTasks) {
      const index = this._tasks.indexOf(parent);
      if (index === -1) continue;

      const updatedTask = { ...parent };

      if (wasCompleted && !isCompleted) {
        updatedTask.subtaskCompletedCount = Math.max(
          0,
          updatedTask.subtaskCompletedCount - 1,
        );
      } else if (!wasCompleted && isCompleted) {
        updatedTask.subtaskCompletedCount += 1;
      }

      this._tasks[index] = updatedTask;
    }

    if (shouldNotify && parentTasks.length > 0) {
      this.notifySubscribers();
    }
  }

  /**
   * Notify all subscribers of task changes.
   * Guards against re-entrant notifications and queues pending notifications.
   */
  notifySubscribers(): void {
    if (this.isNotifying) {
      this.pendingNotification = true;
      return;
    }
    this.isNotifying = true;
    try {
      do {
        this.pendingNotification = false;
        this.subscribers.forEach((callback) => {
          try {
            callback(this._tasks);
          } catch (error) {
            console.error('Error in TaskStateManager subscriber:', error);
          }
        });
      } while (this.pendingNotification);
    } finally {
      this.isNotifying = false;
    }
  }
}
