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
  /**
   * Persisted task truth for dependency evaluation. UI updates may move ahead
   * of this snapshot; it advances only when a write, scan or recovery commits.
   */
  private _committedTasks: Task[] = [];
  private subscribers = new Set<(tasks: Task[]) => void | Promise<void>>();
  private isNotifying = false;
  private pendingNotification = false;
  private keywordManager: KeywordManager;
  private _revision = 0;
  private _committedRevision = 0;

  constructor(keywordManager: KeywordManager) {
    this.keywordManager = keywordManager;
  }

  getKeywordManager(): KeywordManager {
    return this.keywordManager;
  }

  setKeywordManager(keywordManager: KeywordManager): void {
    this.keywordManager = keywordManager;
    this._revision++;
    this._committedRevision++;
  }

  /** Monotonic revision for derived consumers. */
  getRevision(): number {
    return this._revision;
  }

  /** Monotonic revision of the persisted task snapshot. */
  getCommittedRevision(): number {
    return this._committedRevision;
  }

  /**
   * Subscribe to task changes. The callback is called immediately with current tasks.
   * @param callback Function to call when tasks change
   * @returns Unsubscribe function
   */
  subscribe(callback: (tasks: Task[]) => void | Promise<void>): () => void {
    this.subscribers.add(callback);
    this.invokeSubscriberSafely(callback);
    return () => {
      this.subscribers.delete(callback);
    };
  }

  /**
   * Set the tasks array and notify all subscribers.
   * @param tasks New tasks array
   */
  setTasks(tasks: Task[]): void {
    this._tasks = tasks;
    this._committedTasks = [...tasks];
    this._revision++;
    this._committedRevision++;
    this.notifySubscribers();
  }

  /**
   * Publish scanner rows for specific paths without copying optimistic rows
   * from unrelated paths into committed truth.
   */
  setTasksForPaths(tasks: Task[], paths: Iterable<string>): void {
    const replacedPaths = new Set(paths);
    this._tasks = tasks;
    this._committedTasks = [
      ...this._committedTasks.filter((task) => !replacedPaths.has(task.path)),
      ...tasks.filter((task) => replacedPaths.has(task.path)),
    ];
    this._revision++;
    this._committedRevision++;
    this.notifySubscribers();
  }

  /**
   * Advance committed truth for specific paths without replacing a newer
   * visible projection. Used when a failed-write recovery finishes after a
   * successor request has taken over the file.
   */
  setCommittedTasksForPaths(tasks: Task[], paths: Iterable<string>): void {
    const replacedPaths = new Set(paths);
    this._committedTasks = [
      ...this._committedTasks.filter((task) => !replacedPaths.has(task.path)),
      ...tasks.filter((task) => replacedPaths.has(task.path)),
    ];
    this._committedRevision++;
    this.notifySubscribers();
  }

  /**
   * Publish a scanner result while retaining committed rows for paths whose
   * writes were in flight during the scan.
   */
  setTasksFromScan(tasks: Task[], preservedPaths: Iterable<string>): void {
    const preserved = new Set(preservedPaths);
    this._tasks = tasks;
    this._committedTasks = [
      ...this._committedTasks.filter((task) => preserved.has(task.path)),
      ...tasks.filter((task) => !preserved.has(task.path)),
    ];
    this._revision++;
    this._committedRevision++;
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
   * Get the persisted tasks used for dependency authorization.
   * Unlike getTasks(), this deliberately excludes optimistic projections.
   */
  getCommittedTasks(): Task[] {
    return [...this._committedTasks];
  }

  /**
   * Update tasks with a transformation function.
   * @param updater Function that receives current tasks and returns new tasks
   */
  updateTasks(updater: (tasks: Task[]) => Task[]): void {
    this._tasks = updater(this._tasks);
    this._committedTasks = [...this._tasks];
    this._revision++;
    this._committedRevision++;
    this.notifySubscribers();
  }

  /**
   * Add a single task to the collection.
   * @param task Task to add
   */
  addTask(task: Task): void {
    this._tasks.push(task);
    this._committedTasks.push(task);
    this._revision++;
    this._committedRevision++;
    this.notifySubscribers();
  }

  /**
   * Remove tasks matching a predicate.
   * @param predicate Function that returns true for tasks to remove
   */
  removeTasks(predicate: (task: Task) => boolean, commit = true): void {
    this._tasks = this._tasks.filter((task) => !predicate(task));
    if (commit) {
      this._committedTasks = this._committedTasks.filter(
        (task) => !predicate(task),
      );
      this._committedRevision++;
    }
    this._revision++;
    this.notifySubscribers();
  }

  /** Advance only the committed snapshot after a persisted removal. */
  removeCommittedTasks(predicate: (task: Task) => boolean): void {
    this._committedTasks = this._committedTasks.filter(
      (task) => !predicate(task),
    );
    this._committedRevision++;
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

    const adjustedObjects = new Set<Task>();
    const adjust = (task: Task): boolean => {
      if (adjustedObjects.has(task)) return false;
      adjustedObjects.add(task);
      if (task.path !== path) return false;

      let adjusted = false;
      if (task.line >= fromLine) {
        task.line += delta;
        adjusted = true;
      }

      if (task.subtaskSpan) {
        if (fromLine <= task.subtaskSpan.start) {
          task.subtaskSpan.start += delta;
          task.subtaskSpan.end += delta;
          adjusted = true;
        } else if (fromLine <= task.subtaskSpan.end) {
          task.subtaskSpan.end += delta;
          adjusted = true;
        }

        if (task.subtaskSpan.end < task.subtaskSpan.start) {
          task.subtaskSpan = undefined;
        }
      }
      return adjusted;
    };

    let adjusted = false;
    for (const task of this._tasks) {
      adjusted = adjust(task) || adjusted;
    }
    for (const task of this._committedTasks) {
      adjusted = adjust(task) || adjusted;
    }

    if (adjusted) {
      this._revision++;
      this._committedRevision++;
      this.notifySubscribers();
    }
  }

  /**
   * Find a task by file path and line number.
   * @param path File path
   * @param line Line number (0-indexed)
   * @returns Task or null if not found
   */
  findTaskByPathAndLine(
    path: string,
    line: number,
    cellIndex?: number,
  ): Task | null {
    return this.findTaskIn(this._tasks, path, line, cellIndex);
  }

  private findTaskIn(
    tasks: readonly Task[],
    path: string,
    line: number,
    cellIndex?: number,
  ): Task | null {
    return (
      tasks.find(
        (t) =>
          t.path === path &&
          t.line === line &&
          (cellIndex === undefined
            ? true
            : t.tableCell?.cellIndex === cellIndex),
      ) || null
    );
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
    cellIndex?: number,
  ): boolean {
    const existingTask = this.findTaskIn(this._tasks, path, line, cellIndex);
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

    const updatedTask: Task = {
      ...existingTask,
      ...updates,
      ...('text' in updates ? { textDisplay: undefined } : {}),
      _lastUpdateTime: Date.now(),
    };
    this._tasks[index] = updatedTask;
    this._revision++;

    if (wasCompleted !== isCompleted) {
      this.updateParentSubtaskCountsForTask(
        existingTask,
        wasCompleted,
        isCompleted,
        this._tasks,
      );
    }

    // The committed snapshot advances with persisted updates. If the task was
    // optimistically re-added after an archive, it may not be present yet.
    const committedTask = this.findTaskIn(
      this._committedTasks,
      path,
      line,
      cellIndex,
    );
    if (committedTask) {
      const committedIndex = this._committedTasks.indexOf(committedTask);
      const committedWasCompleted = committedTask.completed;
      const committedIsCompleted =
        updates.completed !== undefined
          ? updates.completed
          : committedWasCompleted;
      this._committedTasks[committedIndex] = {
        ...committedTask,
        ...updates,
        ...('text' in updates ? { textDisplay: undefined } : {}),
        _lastUpdateTime: Date.now(),
      };
      if (committedWasCompleted !== committedIsCompleted) {
        this.updateParentSubtaskCountsForTask(
          committedTask,
          committedWasCompleted,
          committedIsCompleted,
          this._committedTasks,
        );
      }
    } else {
      this._committedTasks.push(updatedTask);
    }
    this._committedRevision++;

    return true;
  }

  /**
   * Advance only the committed dependency snapshot from a persisted write.
   * Used when a newer request already owns the visible projection for the file.
   */
  commitTaskByPathAndLine(
    path: string,
    line: number,
    updates: Partial<Task>,
    cellIndex?: number,
    fallbackTask?: Task,
  ): boolean {
    const existing = this.findTaskIn(
      this._committedTasks,
      path,
      line,
      cellIndex,
    );
    const task = existing ?? fallbackTask;
    if (!task) return false;

    const index = this._committedTasks.indexOf(task);
    const wasCompleted = task.completed;
    const isCompleted =
      updates.completed !== undefined ? updates.completed : wasCompleted;
    const updatedTask: Task = {
      ...task,
      ...updates,
      ...('text' in updates ? { textDisplay: undefined } : {}),
      _lastUpdateTime: Date.now(),
    };

    if (index === -1) {
      this._committedTasks.push(updatedTask);
    } else {
      this._committedTasks[index] = updatedTask;
    }
    if (wasCompleted !== isCompleted) {
      this.updateParentSubtaskCountsForTask(
        task,
        wasCompleted,
        isCompleted,
        this._committedTasks,
      );
    }
    this._committedRevision++;
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

    const updates = {
      state: newState,
      completed: isCompleted,
      rawText: newLine,
    };

    // Update using path+line lookup for safety. When the task is not in the
    // manager (e.g. it was removed on archive because archived tasks are not
    // collected, and this call is the undo/re-add), re-add it so views and
    // the archive dialog see it again. The committed snapshot is deliberately
    // untouched until the matching write succeeds.
    const existing = this.findTaskByPathAndLine(
      task.path,
      task.line,
      task.tableCell?.cellIndex,
    );
    if (existing) {
      const index = this._tasks.indexOf(existing);
      const wasCompleted = existing.completed;
      const updatedTask: Task = {
        ...existing,
        ...updates,
        _lastUpdateTime: Date.now(),
      };
      this._tasks[index] = updatedTask;
      if (wasCompleted !== isCompleted) {
        this.updateParentSubtaskCountsForTask(
          existing,
          wasCompleted,
          isCompleted,
          this._tasks,
        );
      }
    } else {
      this._tasks.push({
        ...task,
        ...updates,
        _lastUpdateTime: Date.now(),
      });
    }

    // Notify subscribers of the UI change without advancing the committed
    // dependency snapshot.
    this._revision++;
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
    this._committedTasks = [];
    this._revision++;
    this._committedRevision++;
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
  /** Count quote nesting markers at the start of an indent string. */
  private getQuoteLevel(indent: string): number {
    return (indent.match(/>/g) ?? []).length;
  }

  private isSubtaskOf(task: Task, parentTask: Task): boolean {
    // Source bounds are the authority. Without a parsed span there is no
    // trustworthy evidence that this task is a child of the candidate.
    if (!parentTask.subtaskSpan) return false;
    if (!CHECKBOX_DETECTION_REGEX.test(task.rawText.trimStart())) return false;
    if (
      task.line < parentTask.subtaskSpan.start ||
      task.line > parentTask.subtaskSpan.end
    ) {
      return false;
    }

    const parentIndent = parentTask.indent;
    const taskIndent = task.indent;

    // Compare nesting depth, not the exact prefix: a checkbox-only line and
    // its quoted parent can carry different trailing spaces after '>'.
    if (this.getQuoteLevel(parentIndent) !== this.getQuoteLevel(taskIndent)) {
      return false;
    }

    const parentQuotePrefix = parentIndent.match(/^(>\s*)+/)?.[0] ?? '';
    const taskQuotePrefix = taskIndent.match(/^(>\s*)+/)?.[0] ?? '';

    const parentWhitespaceIndent = parentIndent.substring(
      parentQuotePrefix.length,
    );
    const taskWhitespaceIndent = taskIndent.substring(taskQuotePrefix.length);

    const parentIndentLength = this.getIndentLength(parentWhitespaceIndent);
    const taskIndentLength = this.getIndentLength(taskWhitespaceIndent);
    const parentHasCheckbox = CHECKBOX_DETECTION_REGEX.test(
      parentTask.rawText.trimStart(),
    );

    if (parentHasCheckbox) {
      return taskIndentLength > parentIndentLength;
    }
    return taskIndentLength >= parentIndentLength;
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
    return this.findParentTasksIn(this._tasks, task);
  }

  private findParentTasksIn(tasks: readonly Task[], task: Task): Task[] {
    if (!CHECKBOX_DETECTION_REGEX.test(task.rawText.trimStart())) return [];

    return tasks
      .filter(
        (candidate) =>
          candidate.path === task.path &&
          candidate.line < task.line &&
          this.isSubtaskOf(task, candidate),
      )
      .sort((a, b) => b.line - a.line);
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
    tasks: Task[] = this._tasks,
  ): void {
    const index = tasks.indexOf(parentTask);
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

    tasks[index] = updatedTask;
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
    tasks: Task[] = this._tasks,
  ): void {
    const parentTasks = this.findParentTasksIn(tasks, task);
    for (const parent of parentTasks) {
      this.updateParentSubtaskCounts(parent, wasCompleted, isCompleted, tasks);
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
    const taskQuoteLevel = this.getQuoteLevel(indent);
    const taskQuotePrefix = indent.match(/^(>\s*)+/)?.[0] ?? '';
    const taskWhitespaceIndent = indent.substring(taskQuotePrefix.length);
    const taskIndentLength = this.getIndentLength(taskWhitespaceIndent);

    return this._tasks
      .filter((candidate) => {
        if (candidate.path !== filePath || candidate.line >= line) return false;
        if (!candidate.subtaskSpan) return false;
        if (
          line < candidate.subtaskSpan.start ||
          line > candidate.subtaskSpan.end
        ) {
          return false;
        }

        const parentQuotePrefix = candidate.indent.match(/^(>\s*)+/)?.[0] ?? '';
        if (this.getQuoteLevel(candidate.indent) !== taskQuoteLevel) {
          return false;
        }

        const parentIndentLength = this.getIndentLength(
          candidate.indent.substring(parentQuotePrefix.length),
        );
        const parentHasCheckbox = CHECKBOX_DETECTION_REGEX.test(
          candidate.rawText,
        );

        return parentHasCheckbox
          ? taskIndentLength > parentIndentLength
          : taskIndentLength >= parentIndentLength;
      })
      .sort((a, b) => b.line - a.line);
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
      this._revision++;
      this.notifySubscribers();
    }
  }

  /**
   * Invoke a subscriber synchronously while observing rejected async results.
   * The notification contract remains synchronous; rejected promises are logged
   * without creating an unhandled rejection.
   */
  private invokeSubscriberSafely(
    callback: (tasks: Task[]) => void | Promise<void>,
  ): void {
    try {
      const result = callback(this._tasks);
      if (result !== undefined) {
        void Promise.resolve(result).catch((error) => {
          console.error('Error in TaskStateManager subscriber:', error);
        });
      }
    } catch (error) {
      console.error('Error in TaskStateManager subscriber:', error);
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
          this.invokeSubscriberSafely(callback);
        });
      } while (this.pendingNotification);
    } finally {
      this.isNotifying = false;
    }
  }
}
