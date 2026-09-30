import { Page } from 'playwright';
import { resetMutableState } from './harness';
import { closeAllModals } from './assertions';

/**
 * Reset the vault to a known state between tests, without restarting Obsidian.
 *
 * - Closes any lingering modals (settings, command palette, etc.)
 * - Rewrites the markdown fixture files to baseline content.
 * - Restores the plugin's data.json to the committed baseline settings.
 * - Triggers a vault rescan so the running plugin re-reads the reset files.
 *
 * Use in beforeEach for tests that read task content or settings, to guarantee
 * they are independent of mutations left by earlier tests in the shared session.
 */
export async function resetVaultState(page: Page): Promise<void> {
  // Close any lingering modals first — prevents overlay interception.
  await closeAllModals(page);

  resetMutableState();

  // Force the running plugin to re-read the reset markdown + settings.
  await page.evaluate(async () => {
    const app = (window as any).app;
    const plugin = app?.plugins?.plugins?.todoseq;
    // Reload plugin settings from the restored data.json.
    if (plugin) {
      await plugin.loadSettings?.();
      // loadSettings does not re-apply runtime side effects, so re-sync the
      // smart date processor enabled state with the restored settings.
      plugin.smartDateProcessor?.setEnabled?.(
        Boolean(plugin.settings.enableSmartDateRecognition),
      );
    }
  });

  // Rescan vault so task state reflects the reset markdown content.
  await runRescan(page);

  // Clear any UI state left in live Task List leaves. Dashboard
  // drill-through (and saved-search application) bakes a query, view mode,
  // sort, and match-case into the shared leaf; a later test expecting the
  // default view would otherwise inherit the stale state (order-dependent
  // failures: fine in isolation, wrong after the drill-through test ran).
  await resetTaskListUiState(page);

  // Give the UI a moment to settle after the rescan.
  await page.waitForTimeout(500);
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

async function runRescan(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const app = (window as any).app;
    const plugin = app?.plugins?.plugins?.todoseq;
    if (plugin?.vaultScanner?.scanVault) {
      await plugin.vaultScanner.scanVault();
    }
  });
}
