import { test, expect } from '@playwright/test';
import path from 'path';
import { getPage, releaseSession, saveCoverage } from './helpers/session';
import { REPO_ROOT } from './helpers/harness';
import { requestOwnerOperation } from './helpers/process-owner';
import { openSettings, navigateToPluginTab } from './helpers/assertions';
import { Page } from 'playwright';

const OWNER_DESCRIPTOR_PATH = path.join(
  REPO_ROOT,
  'test-results',
  'obsidian-owner.json',
);

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
  // Save coverage from the relaunched instance before disconnecting.
  await saveCoverage();
  await releaseSession();
});

test('settings persist across Obsidian restart', async () => {
  // 1. Edit and save a settings value on the shared instance.
  const settingsPage = await openSettings(page);
  await navigateToPluginTab(settingsPage, 'TODOseq');

  const waitingKeywordInput = settingsPage
    .locator('.setting-item', { hasText: 'Waiting keywords' })
    .locator('input');
  await waitingKeywordInput.fill('');
  await waitingKeywordInput.fill('BLOCKED');
  await settingsPage.waitForTimeout(700);

  // 2. Save coverage from the first Obsidian instance before closing it.
  await saveCoverage();

  // 3. Disconnect Playwright, then ask the runner that actually spawned the
  //    instance to stop it. A CDP port is not ownership.
  await releaseSession();
  const stopped = await requestOwnerOperation(OWNER_DESCRIPTOR_PATH, 'stop', {
    timeoutMs: 15_000,
  });
  expect(stopped.running).toBe(false);

  // 4. Ask the same owner to relaunch — same --user-data-dir, so the persisted
  //    data.json is read back in.
  const started = await requestOwnerOperation(OWNER_DESCRIPTOR_PATH, 'start', {
    timeoutMs: 90_000,
  });
  expect(started.running).toBe(true);
  expect(started.runId).toBe(stopped.runId);
  page = await getPage();

  // 5. Verify the value survived.
  const settingsPage2 = await openSettings(page);
  await navigateToPluginTab(settingsPage2, 'TODOseq');

  const waitingInput = settingsPage2
    .locator('.setting-item', { hasText: 'Waiting keywords' })
    .locator('input');
  const value = await waitingInput.inputValue();
  expect(value).toBe('BLOCKED');
});
