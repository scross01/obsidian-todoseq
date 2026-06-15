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
    // Reload plugin settings from the restored data.json.
    if (app?.plugins?.plugins?.todoseq) {
      await app.plugins.plugins.todoseq.loadSettings?.();
    }
  });

  // Rescan vault so task state reflects the reset markdown content.
  await runRescan(page);

  // Give the UI a moment to settle after the rescan.
  await page.waitForTimeout(500);
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
