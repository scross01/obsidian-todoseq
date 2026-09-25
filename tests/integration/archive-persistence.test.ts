import { test, expect } from '@playwright/test';
import { getPage } from './helpers/session';
import { resetVaultState } from './helpers/test-reset';
import {
  openSettings,
  navigateToPluginTab,
  closeSettings,
} from './helpers/assertions';
import { Page } from 'playwright';

let page: Page;
let settingsPage: Page;

/**
 * Read the PERSISTED stateMappings from disk (not memory) — the complaint is
 * about persistence, so the assertion target is data.json.
 */
async function readPersistedMappings(): Promise<
  { source: string; enabled: boolean; target: string }[]
> {
  return page.evaluate(async () => {
    const app = (window as any).app;
    const data = await app.vault.adapter.read(
      '.obsidian/plugins/todoseq/data.json',
    );
    return JSON.parse(data).taskArchive?.stateMappings ?? [];
  });
}

/**
 * Open the archive dialog and return the page whose document holds it —
 * `activeDocument` follows Obsidian's focused window, so with the settings
 * window open the dialog renders there, not in the main window. The plugin
 * object is shared, so persistence semantics are identical either way.
 */
async function openDialogAndLocate(): Promise<Page> {
  await page.evaluate(async () => {
    const app = (window as any).app;
    await app.commands.executeCommandById('todoseq:archive-completed-tasks');
  });
  for (const candidate of [page, settingsPage]) {
    const found = await candidate.$('.todoseq-archive-modal').catch(() => null);
    if (found) {
      await candidate.waitForTimeout(200);
      return candidate;
    }
  }
  throw new Error('Archive dialog did not open in any window');
}

async function closeDialog(dialogPage: Page): Promise<void> {
  await dialogPage.evaluate(() => {
    document
      .querySelector('.todoseq-archive-modal')
      ?.querySelector('.todoseq-archive-close')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await dialogPage.waitForTimeout(200);
}

test.describe('Archive mapping persistence (lost-update fix)', () => {
  test.beforeAll(async () => {
    page = await getPage();
  });

  test.beforeEach(async () => {
    await resetVaultState(page);
    await page.evaluate(() => {
      const app = (window as any).app;
      const plugin = app.plugins.plugins.todoseq;
      plugin.settings.taskArchive.autoArchiveEnabled = false;
      plugin.settings.taskArchive.stateMappings = [];
      plugin.settings.additionalCompletedKeywords = [];
      void plugin.saveSettings();
      void plugin.recreateParser();
    });
    await page.waitForTimeout(400);
  });

  test.afterEach(async () => {
    await closeSettings(page);
  });

  test('settings toggle survives a dialog mapping change made afterwards', async () => {
    settingsPage = await openSettings(page);
    await navigateToPluginTab(settingsPage, 'TODOseq');

    // 1. Enable DONE from the settings tab.
    const doneRow = settingsPage.locator('.setting-item', {
      hasText: 'DONE \u2192',
    });
    await doneRow.locator('.checkbox-container').click();
    await settingsPage.waitForTimeout(300);
    expect(
      (await readPersistedMappings()).find((m) => m.source === 'DONE')?.enabled,
    ).toBe(true);

    // 2. Open the archive dialog (its rows predate the settings change) and
    //    change a DIFFERENT row (CANCELLED) there.
    const dialogPage = await openDialogAndLocate();
    const cancelledRow = dialogPage
      .locator('.todoseq-archive-mapping', { hasText: 'CANCELLED' })
      .first();
    await cancelledRow.locator('input[type="checkbox"]').click();
    await dialogPage.waitForTimeout(400);

    // 3. Both writes must survive on disk: DONE (settings) AND CANCELLED
    //    (dialog). The old whole-array replacement dropped DONE.
    const persisted = await readPersistedMappings();
    expect(persisted.find((m) => m.source === 'DONE')?.enabled).toBe(true);
    expect(persisted.find((m) => m.source === 'CANCELLED')?.enabled).toBe(true);

    await closeDialog(dialogPage);
  });

  test('dialog change does not resurrect or drop unrendered stored entries', async () => {
    // Seed three stored entries; NEVER has no settings row (removed keyword).
    await page.evaluate(() => {
      const app = (window as any).app;
      const plugin = app.plugins.plugins.todoseq;
      plugin.settings.taskArchive.stateMappings = [
        { source: 'DONE', enabled: true, target: 'ARCHIVED' },
        { source: 'CANCELED', enabled: false, target: 'ARCHIVED' },
        { source: 'NEVER', enabled: false, target: 'ARCHIVED' },
      ];
      void plugin.saveSettings();
    });

    settingsPage = await openSettings(page);
    await navigateToPluginTab(settingsPage, 'TODOseq');

    const dialogPage = await openDialogAndLocate();
    const cancelledRow = dialogPage
      .locator('.todoseq-archive-mapping', { hasText: 'CANCELED' })
      .first();
    await cancelledRow.locator('input[type="checkbox"]').click();
    await dialogPage.waitForTimeout(400);

    const persisted = await readPersistedMappings();
    // Dialog's change applied…
    expect(persisted.find((m) => m.source === 'CANCELED')?.enabled).toBe(true);
    // …and settings-owned entries for sources the dialog didn't change
    // survive untouched.
    expect(persisted.find((m) => m.source === 'NEVER')).toEqual({
      source: 'NEVER',
      enabled: false,
      target: 'ARCHIVED',
    });
    expect(persisted.find((m) => m.source === 'DONE')?.enabled).toBe(true);

    await closeDialog(dialogPage);
  });
});
