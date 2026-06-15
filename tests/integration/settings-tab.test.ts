import { test, expect } from '@playwright/test';
import { launchObsidian, closeObsidian } from './helpers/obsidian-launcher';
import { setupTestVault, cleanupTestVault } from './helpers/vault-setup';
import { runCommand } from './helpers/assertions';
import { ElectronApplication, Page } from 'playwright';

let app: ElectronApplication;
let page: Page;

async function openSettings(page: Page): Promise<void> {
  await page.keyboard.press('Meta+,');
  await page.waitForSelector('.modal', { timeout: 10_000 });
  await page.waitForTimeout(500);
}

async function navigateToPluginSettings(page: Page): Promise<void> {
  const pluginItem = page.locator('.vertical-tab-list-item', { hasText: 'TODOseq' });
  await pluginItem.click();
  await page.waitForTimeout(500);
}

test.beforeAll(async () => {
  setupTestVault();
  const launched = await launchObsidian();
  app = launched.app;
  page = launched.page;
});

test.afterAll(async () => {
  await closeObsidian(app);
  cleanupTestVault();
});

test('settings tab opens and displays all sections', async () => {
  await openSettings(page);
  await navigateToPluginSettings(page);

  const container = page.locator('.vertical-tab-content');
  await expect(container).toBeVisible();

  const headings = container.locator('.setting-group-heading');
  const headingTexts = await headings.allTextContents();

  expect(headingTexts.some((t) => t.includes('Task keywords'))).toBeTruthy();
  expect(headingTexts.some((t) => t.includes('Task state transitions'))).toBeTruthy();
  expect(headingTexts.some((t) => t.includes('Smart date recognition'))).toBeTruthy();
  expect(headingTexts.some((t) => t.includes('Task detection'))).toBeTruthy();
  expect(headingTexts.some((t) => t.includes('Warning period'))).toBeTruthy();
});

test('keyword settings can be modified via input fields', async () => {
  await openSettings(page);
  await navigateToPluginSettings(page);

  const activeKeywordInput = page.locator('.setting-item', { hasText: 'Active keywords' }).locator('input');
  await activeKeywordInput.fill('');
  await activeKeywordInput.fill('IN-PROGRESS');
  await page.waitForTimeout(700);

  const currentValue = await activeKeywordInput.inputValue();
  expect(currentValue).toBe('IN-PROGRESS');
});

test('settings persist across Obsidian restart', async () => {
  await openSettings(page);
  await navigateToPluginSettings(page);

  const waitingKeywordInput = page.locator('.setting-item', { hasText: 'Waiting keywords' }).locator('input');
  await waitingKeywordInput.fill('');
  await waitingKeywordInput.fill('BLOCKED');
  await page.waitForTimeout(700);

  await closeObsidian(app);

  const launched = await launchObsidian();
  app = launched.app;
  page = launched.page;

  await openSettings(page);
  await navigateToPluginSettings(page);

  const waitingInput = page.locator('.setting-item', { hasText: 'Waiting keywords' }).locator('input');
  const value = await waitingInput.inputValue();
  expect(value).toBe('BLOCKED');
});
