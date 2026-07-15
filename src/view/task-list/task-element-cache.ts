import { Task } from '../../types/task';
import { getTaskKey } from '../../utils/task-utils';

interface CachedTaskElement {
  element: HTMLLIElement;
  task: Task;
}

export class TaskElementCache {
  private cache = new Map<string, CachedTaskElement>();

  get(task: Task): HTMLLIElement | null {
    const cached = this.cache.get(getTaskKey(task));
    return cached?.element ?? null;
  }

  set(task: Task, element: HTMLLIElement): void {
    this.cache.set(getTaskKey(task), { element, task });
  }

  invalidate(task: Task): void {
    this.cache.delete(getTaskKey(task));
  }

  invalidateByKey(key: string): void {
    this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  has(task: Task): boolean {
    return this.cache.has(getTaskKey(task));
  }
}
