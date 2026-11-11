/**
 * @jest-environment jsdom
 *
 * A frontmatter-only edit changes property query answers but not task
 * equality, so the property index must tell collection views once a batch has
 * been committed.
 */

import { TFile } from 'obsidian';
import { PropertySearchEngine } from '../src/services/property-search-engine';
import { createTestPropertySearchEngine } from './helpers/test-helper';

interface Harness {
  engine: PropertySearchEngine;
  refresh: jest.Mock;
  setFrontmatter: (path: string, values: Record<string, unknown>) => void;
  process: () => void;
}

function harness(): Harness {
  const files: Record<string, TFile> = {
    'a.md': new TFile('a.md', 'a.md', 'md'),
    'b.md': new TFile('b.md', 'b.md', 'md'),
  };
  const frontmatter = new Map<string, Record<string, unknown>>([
    ['a.md', { status: 'Draft' }],
    ['b.md', { status: 'Draft' }],
  ]);
  const app = {
    vault: {
      getAbstractFileByPath: (path: string) => files[path] ?? null,
      getMarkdownFiles: () => Object.values(files),
      on: jest.fn(),
      offref: jest.fn(),
    },
    metadataCache: {
      getFileCache: (file: TFile) => {
        const values = frontmatter.get(file.path);
        return values ? { frontmatter: values } : null;
      },
      on: jest.fn(),
      offref: jest.fn(),
    },
  };
  const refresh = jest.fn();
  const engine = createTestPropertySearchEngine(app as never, {
    taskStateManager: {
      getTasks: () => [{ path: 'a.md' }, { path: 'b.md' }],
    } as never,
    refreshAllTaskListViews: refresh,
  });
  return {
    engine,
    refresh,
    setFrontmatter: (path, values) => frontmatter.set(path, values),
    process: () =>
      (
        engine as never as { processPendingUpdates: () => void }
      ).processPendingUpdates(),
  };
}

async function initialize(h: Harness): Promise<void> {
  await h.engine.initialize();
  // The engine publishes an initial notification on a zero-delay timer; drain
  // it so each case counts only the batches it drives.
  await new Promise((resolve) => setTimeout(resolve, 50));
  h.refresh.mockClear();
}

describe('property index invalidation', () => {
  it('refreshes views once and answers the new query after a frontmatter edit', async () => {
    const h = harness();
    await initialize(h);
    h.refresh.mockClear();
    expect(await h.engine.searchProperties('[status:Done]')).toEqual(new Set());

    h.setFrontmatter('a.md', { status: 'Done' });
    h.engine.onFileChanged(new TFile('a.md', 'a.md', 'md'));
    h.process();

    expect(h.refresh).toHaveBeenCalledTimes(1);
    expect(await h.engine.searchProperties('[status:Done]')).toEqual(
      new Set(['a.md']),
    );
    expect(await h.engine.searchProperties('[status:Draft]')).toEqual(
      new Set(['b.md']),
    );
  });

  it('coalesces several changed files into one notification', async () => {
    const h = harness();
    await initialize(h);
    h.refresh.mockClear();

    h.setFrontmatter('a.md', { status: 'Done' });
    h.setFrontmatter('b.md', { status: 'Done' });
    h.engine.onFileChanged(new TFile('a.md', 'a.md', 'md'));
    h.engine.onFileChanged(new TFile('b.md', 'b.md', 'md'));
    h.process();

    expect(h.refresh).toHaveBeenCalledTimes(1);
    expect(await h.engine.searchProperties('[status:Done]')).toEqual(
      new Set(['a.md', 'b.md']),
    );
  });

  it('notifies nobody for an empty batch', async () => {
    const h = harness();
    await initialize(h);

    h.process();

    expect(h.refresh).not.toHaveBeenCalled();
  });

  it('lets a recipient query the committed result inside the notification', async () => {
    const h = harness();
    let pendingQuery: Promise<Set<string>> | null = null;
    h.refresh.mockImplementation(() => {
      pendingQuery = h.engine.searchProperties('[status:Done]');
    });
    await initialize(h);

    h.setFrontmatter('a.md', { status: 'Done' });
    h.engine.onFileChanged(new TFile('a.md', 'a.md', 'md'));
    h.process();

    expect(pendingQuery).not.toBeNull();
    expect(await pendingQuery!).toEqual(new Set(['a.md']));
  });

  it('keeps completing batches when a recipient throws', async () => {
    const h = harness();
    h.refresh.mockImplementation(() => {
      throw new Error('view gone');
    });
    await initialize(h);

    h.setFrontmatter('a.md', { status: 'Done' });
    h.engine.onFileChanged(new TFile('a.md', 'a.md', 'md'));
    expect(() => h.process()).not.toThrow();
    expect(await h.engine.searchProperties('[status:Done]')).toEqual(
      new Set(['a.md']),
    );

    h.setFrontmatter('b.md', { status: 'Done' });
    h.engine.onFileChanged(new TFile('b.md', 'b.md', 'md'));
    expect(() => h.process()).not.toThrow();
    expect(h.refresh).toHaveBeenCalledTimes(2);
    expect(await h.engine.searchProperties('[status:Done]')).toEqual(
      new Set(['a.md', 'b.md']),
    );
  });

  it('publishes nothing after the engine is destroyed', async () => {
    const h = harness();
    await initialize(h);
    h.refresh.mockClear();

    h.engine.destroy();
    h.setFrontmatter('a.md', { status: 'Done' });
    h.engine.onFileChanged(new TFile('a.md', 'a.md', 'md'));
    h.process();

    expect(h.refresh).not.toHaveBeenCalled();
  });
});
