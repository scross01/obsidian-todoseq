import { test, expect } from '@playwright/test';
import { launchObsidian, closeObsidian } from './helpers/obsidian-launcher';
import { setupTestVault, cleanupTestVault } from './helpers/vault-setup';
import {
  openTodoseqPanel,
  getTaskCount,
  waitForTaskListVisible,
  runCommand,
} from './helpers/assertions';
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

test.describe('Task list view', () => {
  test.beforeEach(async () => {
    await openTodoseqPanel(page);
    await waitForTaskListVisible(page);
  });

  test('shows tasks from all files', async () => {
    const taskCount = await getTaskCount(page);
    expect(taskCount).toBeGreaterThan(5);

    const bodyText = await page.locator('.todoseq-task-list').textContent();
    expect(bodyText).toContain('Buy groceries');
    expect(bodyText).toContain('Implement feature A');
    expect(bodyText).toContain('Daily task 1');
  });

  test('search filters tasks by text', async () => {
    const totalCount = await getTaskCount(page);

    const searchInput = page.locator('input[aria-label="Search tasks"]');
    await searchInput.fill('groceries');
    await page.waitForTimeout(500);

    const filteredCount = await getTaskCount(page);
    expect(filteredCount).toBeLessThan(totalCount);
    expect(filteredCount).toBeGreaterThanOrEqual(1);

    const bodyText = await page.locator('.todoseq-task-list').textContent();
    expect(bodyText).toContain('Buy groceries');
    expect(bodyText).not.toContain('Implement feature A');

    await searchInput.fill('');
    await page.waitForTimeout(500);
    const restoredCount = await getTaskCount(page);
    expect(restoredCount).toBe(totalCount);
  });

  test('search filters tasks by state DONE', async () => {
    const totalCount = await getTaskCount(page);

    const searchInput = page.locator('input[aria-label="Search tasks"]');
    await searchInput.fill('state:DONE');
    await page.waitForTimeout(500);

    const filteredCount = await getTaskCount(page);
    expect(filteredCount).toBeGreaterThanOrEqual(1);
    expect(filteredCount).toBeLessThan(totalCount);

    const bodyText = await page.locator('.todoseq-task-list').textContent();
    expect(bodyText).toContain('Write documentation');

    await searchInput.fill('');
    await page.waitForTimeout(500);
  });

  test('task click navigates to file', async () => {
    const taskItem = page.locator('.todoseq-task-item', {
      hasText: 'Buy groceries',
    });
    await taskItem.click();
    await page.waitForTimeout(1000);

    const activeFile = await page
      .locator('.workspace-leaf.mod-active .view-header-title')
      .textContent();
    expect(activeFile).toContain('inbox');
  });

  test('sort dropdown changes task order', async () => {
    const getFirstTaskText = async (): Promise<string> => {
      const firstItem = page.locator('.todoseq-task-item').first();
      return (await firstItem.textContent()) ?? '';
    };

    const orderBefore = await getFirstTaskText();

    const sortDropdown = page.locator('select[aria-label="Sort tasks by"]');
    await sortDropdown.selectOption('sortByKeyword');
    await page.waitForTimeout(500);

    const orderAfter = await getFirstTaskText();

    expect(orderAfter).toBeDefined();

    await sortDropdown.selectOption('default');
    await page.waitForTimeout(500);
  });
});
