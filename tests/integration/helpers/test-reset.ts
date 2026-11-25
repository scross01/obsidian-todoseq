import { Page } from 'playwright';
import { closeAllModals } from './assertions';
import { restoreBaselinePluginSettings } from './harness';
import { baselineVaultMarkdown, TEST_VAULT_DIR } from './vault-setup';

/** Baseline leaf file: the note every reset re-anchors on. */
export const BASELINE_NOTE = 'inbox.md';

/**
 * Reset the complete shared-session state between tests, without restarting
 * Obsidian.
 *
 * Order matters:
 * 1. Close modals, menus, floating windows and every markdown leaf (main
 *    area and sidebar) after creating an empty placeholder. Dirty editor buffers are saved and
 *    detached before their files are replaced, so they cannot autosave old
 *    bytes back over the baseline.
 * 2. Replace the corpus through the Obsidian vault API: delete every
 *    nonbaseline file and empty folder inside the fixed disposable vault, then create/modify
 *    the baseline map. `.obsidian/**` and the plugin install are never touched.
 * 3. Restore baseline plugin settings and reload the runtime parser/settings.
 * 4. Rescan, wait for the exact parser-derived baseline task identities,
 *    reset Task List controls and open inbox source-mode on the main leaf.
 *
 * Every existing suite already calls this entry point; workspace-reset is a
 * thin compatibility delegate.
 */
export async function resetVaultState(page: Page): Promise<void> {
  // Close any lingering modals first — prevents overlay interception.
  await closeAllModals(page);
  // Context menus and notices are not modals and survive closeAllModals.
  await page.evaluate(() => {
    document
      .querySelectorAll('.todoseq-task-context-menu, .notice')
      .forEach((element) => element.remove());
  });

  const today = new Date();
  const baseline = baselineVaultMarkdown(today);

  await clearWorkspaceForContentReset(page);
  await resetVaultContent(page, baseline);
  restoreBaselinePluginSettings();

  // Force the running plugin to re-read the restored settings and registrations.
  await page.evaluate(async () => {
    const app = (window as any).app;
    const plugin = app?.plugins?.plugins?.todoseq;
    if (!plugin) return;
    await plugin.loadSettings?.();
    await plugin.recreateParser?.();
    plugin.smartDateProcessor?.setEnabled?.(
      Boolean(plugin.settings.enableSmartDateRecognition),
    );
  });

  const expectedTaskIdentities = await computeBaselineTaskIdentities(
    page,
    baseline,
  );
  await runRescan(page);
  await waitForBaselineTasks(page, expectedTaskIdentities);
  await resetTaskListUiState(page);
  await anchorBaselineLeaf(page);
}

/**
 * Create an empty main-area placeholder before detaching old markdown views.
 * Saving first flushes any dirty buffer while the old file still exists; the
 * content rewrite below then replaces it. Non-markdown sidebar/plugin leaves
 * (including the Task List) are preserved.
 */
async function clearWorkspaceForContentReset(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const app = (window as any).app;
    const workspace = app?.workspace;
    if (!workspace?.rootSplit) return;

    // Popouts first: a stale one can take the CDP page down with it.
    const float = workspace.floatingSplit;
    if (float) {
      for (const split of [...(float.children ?? [])]) {
        try {
          await split.close?.();
        } catch {
          /* best-effort: stale popout */
        }
      }
    }

    // A fresh empty tab keeps Obsidian from choosing a detached markdown leaf
    // as the active leaf while old views are being disposed.
    const placeholder = workspace.getLeaf('tab');
    await placeholder.setViewState({ type: 'empty', active: true });

    // Detach markdown leaves wherever they live (main area or sidebar): any
    // surviving editor can autosave its old bytes over the reset corpus.
    for (const leaf of [...workspace.getLeavesOfType('markdown')]) {
      const view = leaf.view;
      if (typeof view?.save === 'function') {
        await view.save().catch(() => {});
      }
      leaf.detach();
    }
  });
}

/**
 * Replace the fixed disposable vault's file corpus. The adapter base path must
 * equal the harness path before any deletion; baseline paths are normalized and
 * can never be absolute, parent-traversing or inside `.obsidian`.
 */
async function resetVaultContent(
  page: Page,
  baseline: Record<string, string>,
): Promise<void> {
  await page.evaluate(
    async ({ expectedVaultPath, files }) => {
      const app = (window as any).app;
      const adapter = app?.vault?.adapter;
      const actualBase = String(adapter?.getBasePath?.() ?? '').replace(
        /[\\/]+$/,
        '',
      );
      const expectedBase = expectedVaultPath.replace(/[\\/]+$/, '');
      if (actualBase !== expectedBase) {
        throw new Error(
          `Refusing to reset an unexpected vault: expected ${expectedBase}, got ${actualBase}`,
        );
      }

      const isProtectedPath = (path: string): boolean =>
        path === '.obsidian' || path.startsWith('.obsidian/');
      const assertSafeVaultPath = (path: string, label: string): void => {
        const normalized = path.replace(/\\/g, '/');
        if (
          normalized.startsWith('/') ||
          normalized === '..' ||
          normalized.startsWith('../') ||
          normalized.includes('/../') ||
          normalized.endsWith('/..') ||
          isProtectedPath(normalized)
        ) {
          throw new Error(`Unsafe ${label} path: ${path}`);
        }
      };

      const baselinePaths = Object.keys(files);
      for (const path of baselinePaths) {
        assertSafeVaultPath(path, 'baseline');
      }

      const baselineSet = new Set(baselinePaths);
      for (const file of [...app.vault.getFiles()]) {
        const path = file.path as string;
        if (isProtectedPath(path) || baselineSet.has(path)) continue;
        assertSafeVaultPath(path, 'vault file');
        await app.vault.delete(file, true);
      }

      // Remove now-empty nonbaseline folders (for example a test-created
      // nested/ directory). Never remove a folder that owns baseline content.
      const folders = (app.vault.getAllLoadedFiles?.() ?? [])
        .filter((entry: any) => Array.isArray(entry.children))
        .sort((a: any, b: any) => b.path.length - a.path.length);
      for (const folder of folders) {
        const path = folder.path as string;
        if (
          path === '/' ||
          isProtectedPath(path) ||
          folder.children.length > 0 ||
          baselinePaths.some((candidate) => candidate.startsWith(`${path}/`))
        ) {
          continue;
        }
        assertSafeVaultPath(path, 'vault folder');
        await app.vault.delete(folder, true);
      }

      for (const [path, content] of Object.entries(files)) {
        const segments = path.split('/').slice(0, -1);
        for (let i = 1; i <= segments.length; i++) {
          const dir = segments.slice(0, i).join('/');
          if (!app.vault.getAbstractFileByPath(dir)) {
            await app.vault.createFolder(dir);
          }
        }
        const existing = app.vault.getAbstractFileByPath(path);
        if (existing) {
          await app.vault.modify(existing, content);
        } else {
          await app.vault.create(path, content);
        }
      }
    },
    { expectedVaultPath: TEST_VAULT_DIR, files: baseline },
  );
}

/**
 * Reset every open Task List leaf to the plugin's default UI state: empty
 * query, default view mode / sort / match case, synced toolbar. Delegates to
 * TaskListView.resetUiStateToDefaults() so the view owns its own DOM.
 */
async function resetTaskListUiState(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const app = (window as any).app;
    const leaves = app?.workspace?.getLeavesOfType?.('todoseq-view') ?? [];
    for (const leaf of leaves) {
      const view = leaf.view;
      if (typeof view?.resetUiStateToDefaults === 'function') {
        await view.resetUiStateToDefaults();
      } else if (typeof view?.applyQueryAndRefresh === 'function') {
        // Older builds without the full reset: still clear the query.
        await view.applyQueryAndRefresh('');
      }
    }
  });
}

/**
 * Ask the scanner for a fresh pass. A scan already in progress queues another
 * pass; wait for it to finish rather than assuming the first call completed.
 */
async function runRescan(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const app = (window as any).app;
    const plugin = app?.plugins?.plugins?.todoseq;
    if (plugin?.vaultScanner?.scanVault) {
      await plugin.vaultScanner.scanVault();
    }
  });

  await page.waitForFunction(
    () => {
      const app = (window as any).app;
      const scanner = app?.plugins?.plugins?.todoseq?.vaultScanner;
      return !scanner?.isScanning?.();
    },
    undefined,
    { timeout: 15_000 },
  );
}

/**
 * Parse the baseline map with the running plugin's real markdown parser after
 * settings/parser recreation. This gives reset the exact path/line identities
 * it must wait for, without duplicating parser behavior in the harness.
 */
async function computeBaselineTaskIdentities(
  page: Page,
  baseline: Record<string, string>,
): Promise<string[]> {
  return page.evaluate((files) => {
    const app = (window as any).app;
    const parser = app?.plugins?.plugins?.todoseq?.vaultScanner?.getParser?.();
    if (!parser) throw new Error('Markdown task parser is not registered');
    return Object.entries(files)
      .flatMap(([path, content]) =>
        parser
          .parseFile(content, path)
          .map(
            (task: { path: string; line: number }) =>
              `${task.path}:${task.line}`,
          ),
      )
      .sort();
  }, baseline);
}

/**
 * Bounded convergence on the exact baseline task identities. This replaces
 * the old unconditional sleep: it fails with observed and expected paths if an
 * extra task survives or the scan never publishes the full reset corpus.
 */
async function waitForBaselineTasks(
  page: Page,
  expected: string[],
): Promise<void> {
  try {
    await page.waitForFunction(
      (identities) => {
        const app = (window as any).app;
        const plugin = app?.plugins?.plugins?.todoseq;
        if (
          !plugin?.taskStateManager?.getTasks ||
          plugin.vaultScanner?.isScanning?.()
        ) {
          return false;
        }
        const observed = (
          plugin.taskStateManager.getTasks() as Array<{
            path: string;
            line: number;
          }>
        )
          .map((task) => `${task.path}:${task.line}`)
          .sort();
        return (
          observed.length === identities.length &&
          observed.every((identity, index) => identity === identities[index])
        );
      },
      expected,
      { timeout: 15_000 },
    );
  } catch (error) {
    const observed = await page.evaluate(() => {
      const app = (window as any).app;
      const plugin = app?.plugins?.plugins?.todoseq;
      const tasks = (plugin?.taskStateManager?.getTasks?.() ?? []) as Array<{
        path: string;
        line: number;
      }>;
      return {
        filePaths: app.vault
          .getFiles()
          .map((file: { path: string }) => file.path)
          .sort(),
        taskIdentities: tasks.map((task) => `${task.path}:${task.line}`).sort(),
        scanning: Boolean(plugin?.vaultScanner?.isScanning?.()),
      };
    });
    throw new Error(
      `Reset did not converge on ${expected.length} baseline task identities; expected ${JSON.stringify(expected)}, observed ${JSON.stringify(observed)} (${String(error)})`,
    );
  }
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
