/**
 * Integration tests for resetWorkspaceState (workspace-level reset helper).
 *
 * Each test deliberately pollutes the shared session's workspace — stray
 * background leaves, a floating window, a baked-in Task List filter, a
 * reading-mode active leaf — then runs the reset and asserts the known
 * baseline workspace is restored. These states are exactly the residue that
 * produced past order-dependent integration failures.
 */
import { test, expect } from '@playwright/test';
import { getPage } from './helpers/session';
import { Page } from 'playwright';
import { resetWorkspaceState } from './helpers/workspace-reset';
import { openTodoseqPanel, waitForTaskListVisible } from './helpers/assertions';

let page: Page;

test.beforeAll(async () => {
  page = await getPage();
});

/** Workspace shape probe, evaluated inside the Obsidian window. */
function probeWorkspace(): Promise<{
  mainMarkdownPaths: string[];
  activePath: string | null;
  activeMode: string | null;
  floatingChildren: number;
  taskListQuery: string | null;
  taskListViewMode: string | null;
  taskListSort: string | null;
  taskListMatchCase: boolean | null;
}> {
  return page.evaluate(() => {
    const app = (window as any).app;
    const workspace = app.workspace;
    const rootSplit = workspace.rootSplit;
    const mainMarkdownPaths = workspace
      .getLeavesOfType('markdown')
      .filter((l: any) => l.getRoot?.() === rootSplit)
      .map((l: any) => l.view?.file?.path ?? null);

    const active = workspace.activeLeaf;
    const activeView = active?.view;

    // Task List leaf (may not exist; panel is lazily created).
    const tlLeaf = workspace.getLeavesOfType('todoseq-view')[0];
    const tlView = tlLeaf?.view;

    return {
      mainMarkdownPaths,
      activePath: activeView?.file?.path ?? null,
      activeMode: activeView?.getMode?.() ?? null,
      floatingChildren: workspace.floatingSplit?.children?.length ?? 0,
      taskListQuery: tlView?.getSearchQuery?.() ?? tlView?.searchQuery ?? null,
      taskListViewMode: tlView?.['getViewMode']?.() ?? null,
      taskListSort: tlView?.['getSortMethod']?.() ?? null,
      taskListMatchCase: tlView?.['isCaseSensitive'] ?? null,
    };
  });
}

test.describe('Workspace reset helper', () => {
  test('restores a known workspace after stray leaves, popouts, filters, and reading mode', async () => {
    // ---- Pollute the shared session -------------------------------------
    await openTodoseqPanel(page);
    await waitForTaskListVisible(page);

    await page.evaluate(async () => {
      const app = (window as any).app;
      const workspace = app.workspace;

      // 1. Stray background main-area leaf (hidden DOM, strict-mode hazard).
      const demo = app.vault.getAbstractFileByPath('embedded-demo.md');
      const strayLeaf = workspace.getLeaf('tab');
      await strayLeaf.setViewState({
        type: 'markdown',
        state: { file: demo.path, mode: 'source' },
      });

      // 2. Bake a Task List filter in (simulates dashboard drill-through).
      const tlLeaf = workspace.getLeavesOfType('todoseq-view')[0];
      if (tlLeaf?.view?.applyQueryAndRefresh) {
        await tlLeaf.view.applyQueryAndRefresh('priority:high');
      }

      // 3. Floating window with a markdown leaf. getLeaf(true) after
      // openPopout targets the new popout's leaf in Obsidian 1.12+.
      if (workspace.openPopout) {
        await workspace.openPopout({ type: 'empty' });
        const popoutLeaf = workspace.getLeaf(true);
        const file = app.vault.getAbstractFileByPath('states.md');
        await popoutLeaf.setViewState({
          type: 'markdown',
          state: { file: file.path, mode: 'source' },
        });
      }

      // 4. Put the active main leaf into reading mode.
      const activeLeaf = workspace.getLeaf(false);
      const file = app.vault.getAbstractFileByPath('projects/alpha.md');
      await activeLeaf.setViewState({
        type: 'markdown',
        state: { file: file.path, mode: 'preview' },
        active: true,
      });
    });

    const polluted = await probeWorkspace();
    // Pollution preconditions: something is actually wrong before the reset.
    expect(polluted.mainMarkdownPaths.length).toBeGreaterThan(1);
    expect(polluted.taskListQuery).toBe('priority:high');

    // ---- Reset -----------------------------------------------------------
    await resetWorkspaceState(page);

    // ---- Assert the known workspace --------------------------------------
    const clean = await probeWorkspace();
    expect(clean.mainMarkdownPaths).toEqual(['inbox.md']);
    expect(clean.activePath).toBe('inbox.md');
    expect(clean.activeMode).toBe('source');
    expect(clean.floatingChildren).toBe(0);
    expect(clean.taskListQuery).toBe('');
    expect(clean.taskListViewMode).toBe('showAll');
    expect(clean.taskListSort).toBe('default');
    expect(clean.taskListMatchCase).toBe(false);
  });

  test('is idempotent: a second run on a clean workspace leaves it clean', async () => {
    await resetWorkspaceState(page);
    const first = await probeWorkspace();
    await resetWorkspaceState(page);
    const second = await probeWorkspace();

    expect(second.mainMarkdownPaths).toEqual(['inbox.md']);
    expect(second.activePath).toBe('inbox.md');
    expect(second.activeMode).toBe('source');
    // Idempotency signal: probe results identical across consecutive resets.
    expect(second).toEqual(first);
  });
});
