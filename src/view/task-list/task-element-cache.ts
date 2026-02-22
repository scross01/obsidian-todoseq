import { Task } from '../../types/task';

interface CachedTaskElement {
  element: HTMLLIElement;
  task: Task;
}

export class TaskElementCache {
  private cache = new Map<string, CachedTaskElement>();

  private getKey(task: Task): string {
    return `${task.path}:${task.line}`;
  }

  get(task: Task): HTMLLIElement | null {
    const cached = this.cache.get(this.getKey(task));
    return cached?.element ?? null;
  }

  set(task: Task, element: HTMLLIElement): void {
    this.cache.set(this.getKey(task), { element, task });
  }

  invalidate(task: Task): void {
    this.cache.delete(this.getKey(task));
  }

  invalidateByKey(key: string): void {
    this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  has(task: Task): boolean {
    return this.cache.has(this.getKey(task));
  }
}
