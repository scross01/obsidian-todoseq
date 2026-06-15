import { test, expect } from '@playwright/test';
import { getPage } from './helpers/session';
import { resetVaultState } from './helpers/test-reset';
import {
  openTodoseqPanel,
  getTaskCount,
  waitForTaskListVisible,
} from './helpers/assertions';
import { Page } from 'playwright';

let page: Page;

test.beforeAll(async () => {
  page = await getPage();
});

test.describe('Task list view', () => {
  test.beforeEach(async () => {
    await resetVaultState(page);
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
    // Close any dropdowns that may be intercepting clicks.
    await page.evaluate(() => {
      document.querySelectorAll('.todoseq-dropdown.show').forEach((el) => {
        el.classList.remove('show');
      });
    });
    await page.waitForTimeout(200);

    const taskItem = page.locator('.todoseq-task-item', {
      hasText: 'Buy groceries',
    });
    await taskItem.click({ force: true });
    await page.waitForTimeout(1000);

    const activeFile = await page
      .locator('.workspace-leaf.mod-active .view-header-title')
      .textContent();
    expect(activeFile).toContain('inbox');
  });

  test('sort dropdown changes task order', async () => {
    const getAllTaskTexts = async (): Promise<string[]> => {
      const items = page.locator('.todoseq-task-item');
      return items.allTextContents();
    };

    const orderBefore = await getAllTaskTexts();

    const sortDropdown = page.locator('select[aria-label="Sort tasks by"]');
    await sortDropdown.selectOption('sortByKeyword');
    await page.waitForTimeout(500);

    const orderAfter = await getAllTaskTexts();

    // Keyword sort groups by state (active > inactive > waiting > completed),
    // so the overall order should differ from the default filepath sort.
    // Compare full task lists rather than just the first item.
    expect(orderAfter).not.toEqual(orderBefore);

    await sortDropdown.selectOption('default');
    await page.waitForTimeout(500);
  });
});
