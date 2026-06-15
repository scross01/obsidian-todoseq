import { test, expect } from '@playwright/test';
import { getPage, releaseSession } from './helpers/session';
import { launchObsidian, closeObsidian } from './helpers/obsidian-launcher';
import { openSettings, navigateToPluginTab } from './helpers/assertions';
import { Page } from 'playwright';

/**
 * Verifies plugin settings survive a real Obsidian process restart.
 *
 * Runs in the `obsidian-restart` project, which executes after the `obsidian`
 * project (see playwright.config.ts dependencies). It takes over the shared
 * Obsidian instance: edits settings, closes the process, relaunches a fresh
 * isolated instance (same --user-data-dir, so the persisted data.json is read
 * back), and asserts the value survived.
 *
 * This deliberately does NOT re-bootstrap fixtures between close and relaunch,
 * because doing so would overwrite the data.json that persistence relies on.
 */
let page: Page;

test.beforeAll(async () => {
  // Connect to the shared instance launched by globalSetup.
  page = await getPage();
});

test.afterAll(async () => {
  await releaseSession();
});

test('settings persist across Obsidian restart', async () => {
  // 1. Edit and save a settings value on the shared instance.
  await openSettings(page);
  await navigateToPluginTab(page, 'TODOseq');

  const waitingKeywordInput = page
    .locator('.setting-item', { hasText: 'Waiting keywords' })
    .locator('input');
  await waitingKeywordInput.fill('');
  await waitingKeywordInput.fill('BLOCKED');
  await page.waitForTimeout(700);

  // 2. Disconnect Playwright, then close Obsidian (kills the isolated process
  //    only, via the CDP-port-scoped kill).
  await releaseSession();
  await closeObsidian();

  // 3. Relaunch a fresh isolated instance — same --user-data-dir, so the
  //    persisted data.json is read back in.
  const relaunched = await launchObsidian();
  page = relaunched.page;

  // 4. Verify the value survived.
  await openSettings(page);
  await navigateToPluginTab(page, 'TODOseq');

  const waitingInput = page
    .locator('.setting-item', { hasText: 'Waiting keywords' })
    .locator('input');
  const value = await waitingInput.inputValue();
  expect(value).toBe('BLOCKED');
});
