import { Task } from '../task';

/**
 * TaskStateManager provides centralized state management for tasks.
 * It eliminates duplication by maintaining a single source of truth
 * and notifying subscribers when tasks change.
 */
export class TaskStateManager {
  private _tasks: Task[] = [];
  private subscribers = new Set<(tasks: Task[]) => void>();
  private isNotifying = false;

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
   * Get the current tasks array (reference, not copy).
   * @returns Current tasks array
   */
  getTasks(): Task[] {
    return this._tasks;
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
   * Update a specific task by reference.
   * @param task Task to update
   * @param updates Partial task properties to update
   */
  updateTask(task: Task, updates: Partial<Task>): void {
    const index = this._tasks.indexOf(task);
    if (index !== -1) {
      this._tasks[index] = { ...task, ...updates };
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
    return this._tasks.find((t) => t.path === path && t.line === line) || null;
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
   * Notify all subscribers of task changes.
   * Guards against re-entrant notifications.
   */
  private notifySubscribers(): void {
    if (this.isNotifying) {
      return;
    }
    this.isNotifying = true;
    try {
      this.subscribers.forEach((callback) => {
        try {
          callback(this._tasks);
        } catch (error) {
          console.error('Error in TaskStateManager subscriber:', error);
        }
      });
    } finally {
      this.isNotifying = false;
    }
  }
}
