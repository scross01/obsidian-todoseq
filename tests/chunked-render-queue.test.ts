/**
 * @jest-environment jsdom
 */

import { ChunkedRenderQueue } from '../src/view/task-list/chunked-render-queue';
import { createBaseTask } from './helpers/test-helper';
import { installObsidianDomMocks } from './helpers/obsidian-dom-mock';

describe('ChunkedRenderQueue', () => {
  let queue: ChunkedRenderQueue;

  beforeAll(() => {
    installObsidianDomMocks();
  });

  beforeEach(() => {
    queue = new ChunkedRenderQueue();
  });

  describe('enqueue', () => {
    it('renders tasks into container', async () => {
      const container = document.createElement('div');
      const tasks = [
        createBaseTask({ path: 'a.md', line: 0, state: 'TODO' }),
        createBaseTask({ path: 'b.md', line: 1, state: 'DOING' }),
      ];

      const renderFn = (task: (typeof tasks)[0]) => {
        const li = document.createElement('li');
        li.textContent = task.state;
        return li;
      };

      await queue.enqueue(tasks, renderFn, container);

      expect(container.children.length).toBe(2);
      expect(container.children[0].textContent).toBe('TODO');
      expect(container.children[1].textContent).toBe('DOING');
    });

    it('cancels previous enqueue when new one starts', async () => {
      const container = document.createElement('div');
      const tasks1 = Array.from({ length: 20 }, (_, i) =>
        createBaseTask({ path: `a${i}.md`, line: i }),
      );
      const tasks2 = [createBaseTask({ path: 'b.md', line: 0 })];

      const renderFn = (task: (typeof tasks1)[0]) => {
        const li = document.createElement('li');
        li.textContent = task.path;
        return li;
      };

      // Start first enqueue with many tasks (needs yielding) but don't await
      const p1 = queue.enqueue(tasks1, renderFn, container);
      // Immediately start second enqueue, which increments generation
      const p2 = queue.enqueue(tasks2, renderFn, container);

      await Promise.all([p1, p2]);

      // Only tasks2 should be fully rendered since tasks1 was cancelled
      expect(container.children.length).toBeGreaterThanOrEqual(1);
      // The last child should be from tasks2
      expect(
        container.children[container.children.length - 1].textContent,
      ).toBe('b.md');
    });

    it('renders larger batches with yielding', async () => {
      const container = document.createElement('div');
      const tasks = Array.from({ length: 25 }, (_, i) =>
        createBaseTask({ path: `task${i}.md`, line: i }),
      );

      const renderFn = (task: (typeof tasks)[0]) => {
        const li = document.createElement('li');
        li.textContent = task.path;
        return li;
      };

      await queue.enqueue(tasks, renderFn, container);

      expect(container.children.length).toBe(25);
    });
  });

  describe('clear', () => {
    it('clears pending tasks', async () => {
      const container = document.createElement('div');
      const tasks = [createBaseTask({ path: 'a.md', line: 0 })];

      queue.enqueue(
        tasks,
        (task) => {
          const li = document.createElement('li');
          li.textContent = task.path;
          return li;
        },
        container,
      );
      queue.clear();

      expect(queue.isEmpty).toBe(true);
    });
  });

  describe('isEmpty', () => {
    it('returns true for fresh queue', () => {
      expect(queue.isEmpty).toBe(true);
    });

    it('returns false while processing and true after completion', async () => {
      const container = document.createElement('div');
      const tasks = Array.from({ length: 50 }, (_, i) =>
        createBaseTask({ path: `task${i}.md`, line: i }),
      );

      const renderFn = (task: (typeof tasks)[0]) => {
        const li = document.createElement('li');
        li.textContent = task.path;
        return li;
      };

      // Before starting, queue should be empty
      expect(queue.isEmpty).toBe(true);

      const promise = queue.enqueue(tasks, renderFn, container);
      // During processing, queue should not be empty
      expect(queue.isEmpty).toBe(false);
      await promise;
      expect(queue.isEmpty).toBe(true);
      expect(container.children.length).toBe(50);
    });
  });

  describe('renderToFragment', () => {
    it('renders tasks to a document fragment', async () => {
      const tasks = [
        createBaseTask({ path: 'a.md', line: 0, state: 'TODO' }),
        createBaseTask({ path: 'b.md', line: 1, state: 'DONE' }),
      ];

      const renderFn = (task: (typeof tasks)[0]) => {
        const li = document.createElement('li');
        li.textContent = task.state;
        return li;
      };

      const fragment = await queue.renderToFragment(tasks, renderFn, false);

      expect(fragment.children.length).toBe(2);
      expect(fragment.children[0].textContent).toBe('TODO');
      expect(fragment.children[1].textContent).toBe('DONE');
    });

    it('yields during render when yieldDuringRender is true', async () => {
      const tasks = Array.from({ length: 15 }, (_, i) =>
        createBaseTask({ path: `task${i}.md`, line: i }),
      );

      const renderFn = (task: (typeof tasks)[0]) => {
        const li = document.createElement('li');
        li.textContent = task.path;
        return li;
      };

      const fragment = await queue.renderToFragment(tasks, renderFn, true);

      expect(fragment.children.length).toBe(15);
    });
  });
});
