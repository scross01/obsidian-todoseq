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

  // Clear any search filter left in a live Task List leaf. Dashboard
  // drill-through (and saved-search application) bakes a query into the
  // shared leaf's search input; a later test expecting an unfiltered list
  // would otherwise see only the stale filtered result set (order-dependent
  // failures: fine in isolation, wrong after the drill-through test ran).
  await clearTaskListFilters(page);

  // Give the UI a moment to settle after the rescan.
  await page.waitForTimeout(500);
}

/** Reset the search query of every open Task List leaf to '' (all tasks). */
async function clearTaskListFilters(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const app = (window as any).app;
    const leaves = app?.workspace?.getLeavesOfType?.('todoseq-view') ?? [];
    for (const leaf of leaves) {
      const view = leaf.view;
      if (typeof view?.applyQueryAndRefresh === 'function') {
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
