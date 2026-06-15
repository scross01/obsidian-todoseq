import { test, expect } from '@playwright/test';
import { launchObsidian, closeObsidian } from './helpers/obsidian-launcher';
import { setupTestVault, cleanupTestVault } from './helpers/vault-setup';
import { openTodoseqPanel, getTaskCount, waitForTaskListVisible } from './helpers/assertions';
import { ElectronApplication, Page } from 'playwright';

let app: ElectronApplication;
let page: Page;

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

test('plugin loads and shows task list panel', async () => {
  await openTodoseqPanel(page);
  await waitForTaskListVisible(page);
  const taskCount = await getTaskCount(page);
  expect(taskCount).toBeGreaterThan(0);
});
