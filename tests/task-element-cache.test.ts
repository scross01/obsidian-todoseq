import { TaskElementCache } from '../src/view/task-list/task-element-cache';
import { createBaseTask } from './helpers/test-helper';

describe('TaskElementCache', () => {
  it('should store and retrieve elements by task key', () => {
    const cache = new TaskElementCache();
    const task = createBaseTask({ path: 'test.md', line: 5 });
    const element = { textContent: 'test' } as unknown as HTMLLIElement;

    cache.set(task, element);
    expect(cache.get(task)).toBe(element);
  });

  it('should return null for missing keys', () => {
    const cache = new TaskElementCache();
    expect(
      cache.get(createBaseTask({ path: 'missing.md', line: 0 })),
    ).toBeNull();
  });

  it('should detect existing tasks with has()', () => {
    const cache = new TaskElementCache();
    const task = createBaseTask({ path: 'test.md', line: 5 });
    expect(cache.has(task)).toBe(false);
    cache.set(task, { textContent: 'test' } as unknown as HTMLLIElement);
    expect(cache.has(task)).toBe(true);
  });

  it('should invalidate by task', () => {
    const cache = new TaskElementCache();
    const task = createBaseTask({ path: 'test.md', line: 5 });
    cache.set(task, { textContent: 'test' } as unknown as HTMLLIElement);
    cache.invalidate(task);
    expect(cache.get(task)).toBeNull();
  });

  it('should invalidate by key', () => {
    const cache = new TaskElementCache();
    const task = createBaseTask({ path: 'test.md', line: 5 });
    cache.set(task, { textContent: 'test' } as unknown as HTMLLIElement);
    cache.invalidateByKey('test.md:5');
    expect(cache.get(task)).toBeNull();
  });

  it('should clear all entries', () => {
    const cache = new TaskElementCache();
    cache.set(createBaseTask({ path: 'a.md', line: 1 }), {
      textContent: 'a',
    } as unknown as HTMLLIElement);
    cache.set(createBaseTask({ path: 'b.md', line: 2 }), {
      textContent: 'b',
    } as unknown as HTMLLIElement);
    cache.clear();
    expect(cache.has(createBaseTask({ path: 'a.md', line: 1 }))).toBe(false);
  });

  it('should use unique keys per path:line', () => {
    const cache = new TaskElementCache();
    const task1 = createBaseTask({ path: 'test.md', line: 1 });
    const task2 = createBaseTask({ path: 'test.md', line: 2 });
    const element1 = { id: 'task1' } as unknown as HTMLLIElement;
    const element2 = { id: 'task2' } as unknown as HTMLLIElement;

    cache.set(task1, element1);
    cache.set(task2, element2);

    expect(cache.get(task1)?.id).toBe('task1');
    expect(cache.get(task2)?.id).toBe('task2');
  });
});
