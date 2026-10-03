import { Page } from 'playwright';
import { resetVaultState } from './test-reset';

/**
 * Baseline leaf file: the note every workspace reset re-anchors on. Plain
 * markdown, no todoseq blocks, from writeVaultMarkdown()'s fixture set.
 */
export const BASELINE_NOTE = 'inbox.md';

/**
 * Reset the ENTIRE shared-obsidian-session state, not just vault content:
 *
 * 1. resetVaultState — fixtures, settings, rescan, Task List UI defaults
 *    (query/view-mode/sort/match-case), and settled modals.
 * 2. Close floating (popout) windows first: a stale popout can take the CDP
 *    page down with it, and every later step evaluates against that page.
 * 3. Detach stray main-area markdown leaves. Tests open demo notes
 *    (dashboard-demo.md, collapse checks, heatmap notes) and leave them
 *    behind; background leaves hold hidden source-view DOM that breaks
 *    strict-mode selectors and re-entrantly render embeds. Sidebar leaves
 *    are left alone: a workspace without its sidebars is not the baseline.
 * 4. Re-anchor the one surviving main leaf on the baseline note via
 *    setViewState. openFile would inherit a reading-mode mode left by
 *    dashboard tests — the exact mechanism behind a past order-dependent
 *    failure wave.
 *
 * Tests that need a different file open call openFileInEditor /
 * setViewState themselves afterwards; the guarantee this provides is
 * "known workspace, not just known vault".
 */
export async function resetWorkspaceState(page: Page): Promise<void> {
  await resetVaultState(page);

  // Popouts first: a stale one can take the CDP page down with it.
  await closeFloatingWindows(page);
  await detachStrayMainLeaves(page);
  await anchorBaselineLeaf(page);

  // Allow workspace events (active-leaf-change, layout-change) to settle.
  await page.waitForTimeout(300);
}

/**
 * Detach all main-area markdown leaves except the active one (detaching the
 * last leaf could leave a New-tab leaf active, a documented Obsidian hazard).
 * The active leaf is re-anchored to the baseline note by the caller.
 */
async function detachStrayMainLeaves(page: Page): Promise<void> {
  await page.evaluate(() => {
    const app = (window as any).app;
    const workspace = app?.workspace;
    if (!workspace?.rootSplit) return;

    for (const leaf of [...workspace.getLeavesOfType('markdown')]) {
      if (leaf === workspace.activeLeaf) continue;
      // getRoot() distinguishes the main area from sidebar/popout roots.
      if (leaf.getRoot?.() !== workspace.rootSplit) continue;
      leaf.detach();
    }
  });
}

/** Close every floating (popout) window — never part of the baseline. */
async function closeFloatingWindows(page: Page): Promise<void> {
  await page.evaluate(() => {
    const app = (window as any).app;
    const float = app?.workspace?.floatingSplit;
    if (!float) return;
    for (const split of [...(float.children ?? [])]) {
      try {
        split.close?.();
      } catch {
        /* best-effort: a stale popout must not fail the reset */
      }
    }
  });
}

/** Open the baseline note source-mode on the active main leaf. */
async function anchorBaselineLeaf(page: Page): Promise<void> {
  await page.evaluate(async (notePath) => {
    const app = (window as any).app;
    const file = app.vault.getAbstractFileByPath(notePath);
    if (!file) throw new Error(`${notePath} not in vault`);
    const leaf = app.workspace.getLeaf(false);
    await leaf.setViewState({
      type: 'markdown',
      state: { file: file.path, mode: 'source' },
      active: true,
    });
  }, BASELINE_NOTE);
  await page.waitForSelector(
    '.workspace-leaf.mod-active .markdown-source-view',
    { timeout: 10_000 },
  );
}
