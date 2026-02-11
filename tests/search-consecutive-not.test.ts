import { Search } from '../src/search/search';
import { Task } from '../src/types/task';
import { createBaseTask } from './helpers/test-helper';

describe('Search consecutive NOT operators', () => {
  const testTasks: Task[] = [
    createBaseTask({
      path: 'examples/task1.md',
      line: 1,
      rawText: 'TODO task in examples',
      listMarker: '-',
      text: 'task in examples',
      state: 'TODO',
    }),
    createBaseTask({
      path: 'examples/Test Search.md',
      line: 1,
      rawText: 'TODO test search task',
      listMarker: '-',
      text: 'test search task',
      state: 'TODO',
    }),
    createBaseTask({
      path: 'examples/other.md',
      line: 1,
      rawText: 'DOING other task',
      listMarker: '-',
      text: 'other task',
      state: 'DOING',
    }),
    createBaseTask({
      path: 'other/task.md',
      line: 1,
      rawText: 'TODO task in other folder',
      listMarker: '-',
      text: 'task in other folder',
      state: 'TODO',
    }),
  ];

  describe('Consecutive negated prefix filters without AND', () => {
    it('should exclude tasks with state TODO when using -state:TODO after -file', async () => {
      // This is the problematic query: path:examples -file:"Test Search" -state:TODO
      // Expected: Should only return the DOING task in examples (not Test Search.md, not TODO tasks)
      const results = await Promise.all(
        testTasks.map(async (task) => {
          return await Search.evaluate(
            'path:examples -file:"Test Search" -state:TODO',
            task,
            false,
          );
        }),
      );
      const matchedTasks = testTasks.filter((_, index) => results[index]);

      // Should only match the DOING task in examples/other.md
      // - examples/task1.md has state TODO (should be excluded)
      // - examples/Test Search.md matches -file:"Test Search" (should be excluded)
      // - examples/other.md has state DOING (should be included)
      // - other/task.md is not in path:examples (should be excluded)
      expect(matchedTasks.length).toBe(1);
      expect(matchedTasks[0].path).toBe('examples/other.md');
    });

    it('should work correctly with explicit AND between negations', async () => {
      // This works: path:examples -file:"Test Search" AND -state:TODO
      const results = await Promise.all(
        testTasks.map(async (task) => {
          return await Search.evaluate(
            'path:examples -file:"Test Search" AND -state:TODO',
            task,
            false,
          );
        }),
      );
      const matchedTasks = testTasks.filter((_, index) => results[index]);

      expect(matchedTasks.length).toBe(1);
      expect(matchedTasks[0].path).toBe('examples/other.md');
    });

    it('should handle multiple consecutive negations', async () => {
      // Test: -file:"Test Search" -state:TODO (without path filter)
      const results = await Promise.all(
        testTasks.map(async (task) => {
          return await Search.evaluate(
            '-file:"Test Search" -state:TODO',
            task,
            false,
          );
        }),
      );
      const matchedTasks = testTasks.filter((_, index) => results[index]);

      // Should return tasks that are NOT "Test Search" AND NOT state:TODO
      // - examples/task1.md has state TODO (excluded)
      // - examples/Test Search.md is "Test Search" (excluded)
      // - examples/other.md has state DOING and is not "Test Search" (included)
      // - other/task.md has state TODO (excluded)
      expect(matchedTasks.length).toBe(1);
      expect(matchedTasks[0].path).toBe('examples/other.md');
    });
  });
});
