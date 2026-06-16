import { test, expect } from '@playwright/test';
import { getPage } from './helpers/session';
import { resetVaultState } from './helpers/test-reset';
import {
  openTodoseqPanel,
  waitForTaskListVisible,
  getTaskCount,
} from './helpers/assertions';
import { Page } from 'playwright';

let page: Page;

test.beforeAll(async () => {
  page = await getPage();
});

test.describe('Property search', () => {
  test.beforeEach(async () => {
    await resetVaultState(page);
    await openTodoseqPanel(page);
    await waitForTaskListVisible(page);
  });

  test('search by frontmatter property filters tasks', async () => {
    // Verify both files' tasks are visible initially.
    const allText = await page.locator('.todoseq-task-list').textContent();
    expect(allText).toContain('Buy groceries');
    expect(allText).toContain('Property task one');

    // Search for tasks from files with project:alpha in frontmatter.
    const searchInput = page.locator('input[aria-label="Search tasks"]');
    await searchInput.fill('[project:alpha]');
    await page.waitForTimeout(1000);

    // Only tasks from with-properties.md should remain.
    const filteredCount = await getTaskCount(page);
    expect(filteredCount).toBeGreaterThanOrEqual(1);

    const bodyText = await page.locator('.todoseq-task-list').textContent();
    expect(bodyText).toContain('Property task one');
    expect(bodyText).toContain('Property task two');
    expect(bodyText).not.toContain('Buy groceries');
    expect(bodyText).not.toContain('Implement feature A');

    // Clear search.
    await searchInput.fill('');
    await page.waitForTimeout(500);
  });

  test('search by status frontmatter property', async () => {
    const searchInput = page.locator('input[aria-label="Search tasks"]');
    await searchInput.fill('[status:active]');
    await page.waitForTimeout(1000);

    const filteredCount = await getTaskCount(page);
    expect(filteredCount).toBeGreaterThanOrEqual(1);

    const bodyText = await page.locator('.todoseq-task-list').textContent();
    expect(bodyText).toContain('Property task one');
    // Tasks from files without matching frontmatter should not appear.
    expect(bodyText).not.toContain('Buy groceries');

    await searchInput.fill('');
    await page.waitForTimeout(500);
  });

  test('property search with regular search text combined', async () => {
    // Combine property filter with text search.
    const searchInput = page.locator('input[aria-label="Search tasks"]');
    await searchInput.fill('[project:alpha] task one');
    await page.waitForTimeout(1000);

    const filteredCount = await getTaskCount(page);
    expect(filteredCount).toBeGreaterThanOrEqual(1);

    const bodyText = await page.locator('.todoseq-task-list').textContent();
    expect(bodyText).toContain('Property task one');
    // task two should NOT appear because "task one" text doesn't match it.
    expect(bodyText).not.toContain('Property task two');

    await searchInput.fill('');
    await page.waitForTimeout(500);
  });
});
