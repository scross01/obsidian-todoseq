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

/**
 * Mapping row names currently rendered in the Auto-archive group. Mapping
 * rows are the setting items carrying the mobile layout hook class.
 */
async function mappingRowNames(settingsPage: Page): Promise<string[]> {
  return settingsPage.evaluate(() =>
    Array.from(
      document.querySelectorAll('.setting-item.todoseq-archive-mapping-item'),
    ).map((el) => {
      const name = el.querySelector('.setting-item-name');
      return name?.textContent?.trim() ?? '';
    }),
  );
}

test.describe('Archive settings dynamic mapping rows (plan 014)', () => {
  test.beforeAll(async () => {
    page = await getPage();
  });

  test.beforeEach(async () => {
    await resetVaultState(page);
    // Baseline: no additional keywords, so mapping rows mirror the built-ins.
    await page.evaluate(() => {
      const app = (window as any).app;
      const plugin = app.plugins.plugins.todoseq;
      plugin.settings.additionalCompletedKeywords = [];
      plugin.settings.additionalArchivedKeywords = [];
      plugin.settings.taskArchive.autoArchiveEnabled = false;
      void plugin.saveSettings();
      void plugin.recreateParser();
    });
    await page.waitForTimeout(300);
  });

  test.afterEach(async () => {
    await closeSettings(page);
  });

  test('typing a completed keyword adds a mapping row without closing settings', async () => {
    const settingsPage = await openSettings(page);
    await navigateToPluginTab(settingsPage, 'TODOseq');

    const before = await mappingRowNames(settingsPage);
    expect(before).toContain('DONE \u2192');
    expect(before).not.toContain('SHIPPED \u2192');

    // Real UI path: type into the Completed keywords input; the debounced
    // commit writes settings, recreates the parser, and (plan 014) triggers
    // the guarded tab refresh that re-derives the mapping rows.
    const completedInput = settingsPage
      .locator('.setting-item', { hasText: 'Completed keywords' })
      .locator('input')
      .first();
    await completedInput.fill('SHIPPED');
    // Past the 500ms keyword debounce + rescan + refresh.
    await settingsPage.waitForTimeout(2500);

    const after = await mappingRowNames(settingsPage);
    expect(after).toContain('DONE \u2192');
    expect(after).toContain('SHIPPED \u2192');
  });

  test('configured mapping survives the re-render', async () => {
    // Configure the DONE mapping BEFORE opening settings.
    await page.evaluate(() => {
      const app = (window as any).app;
      const plugin = app.plugins.plugins.todoseq;
      plugin.settings.taskArchive.stateMappings = [
        { source: 'DONE', enabled: true, target: 'ARCHIVED' },
      ];
      void plugin.saveSettings();
    });

    const settingsPage = await openSettings(page);
    await navigateToPluginTab(settingsPage, 'TODOseq');

    // Force a re-render through the real input path (archived keywords so
    // the completed set — and thus the DONE row — stays the same).
    const archivedInput = settingsPage
      .locator('.setting-item', { hasText: 'Archived keywords' })
      .locator('input')
      .first();
    await archivedInput.fill('ABANDONED');
    await settingsPage.waitForTimeout(2500);

    const names = await mappingRowNames(settingsPage);
    expect(names).toContain('DONE \u2192');

    // The DONE toggle stayed enabled through the re-render.
    const doneRow = settingsPage.locator('.setting-item', {
      hasText: 'DONE \u2192',
    });
    await expect(doneRow.locator('.checkbox-container').first()).toHaveClass(
      /is-enabled/,
    );
  });

  test('archive keyword addition appears in the mapping dropdown options', async () => {
    // Seed the setting before opening so the built rows read the fresh set.
    await page.evaluate(() => {
      const app = (window as any).app;
      const plugin = app.plugins.plugins.todoseq;
      plugin.settings.additionalArchivedKeywords = ['ABANDONED'];
      void plugin.saveSettings();
      void plugin.recreateParser();
    });
    await page.waitForTimeout(400);

    const settingsPage = await openSettings(page);
    await navigateToPluginTab(settingsPage, 'TODOseq');

    const doneRow = settingsPage.locator('.setting-item', {
      hasText: 'DONE \u2192',
    });
    const options = await doneRow.locator('select option').allTextContents();
    expect(options).toContain('ARCHIVED');
    expect(options).toContain('ABANDONED');
  });

  test('focused keyword input regains focus after the re-render', async () => {
    const settingsPage = await openSettings(page);
    await navigateToPluginTab(settingsPage, 'TODOseq');

    const completedInput = settingsPage
      .locator('.setting-item', { hasText: 'Completed keywords' })
      .locator('input')
      .first();
    await completedInput.click();
    await completedInput.fill('SHIPPED');

    // The guarded refresh must restore focus to the (rebuilt) input.
    await settingsPage.waitForTimeout(2500);

    // Identity-based check, NOT instanceof: the settings window is a
    // separate JS realm, so its elements fail a main-realm instanceof.
    const focusState = await settingsPage.evaluate(() => {
      const active = document.activeElement as HTMLInputElement | null;
      const ownerItem = active?.closest('.setting-item');
      const ownerName = ownerItem?.querySelector('.setting-item-name');
      return {
        value: active?.value ?? null,
        ownerSetting: ownerName?.textContent?.trim() ?? null,
      };
    });
    expect(focusState.value).toContain('SHIPPED');
    expect(focusState.ownerSetting).toBe('Completed keywords');
  });
});
