import { test, expect } from '@playwright/test';
import { getPage } from './helpers/session';
import { resetVaultState } from './helpers/test-reset';
import { openTodoseqPanel, waitForTaskListVisible } from './helpers/assertions';
import { Page } from 'playwright';

let page: Page;

test.beforeAll(async () => {
  page = await getPage();
});

test.describe('State-group search', () => {
  test.beforeEach(async () => {
    await resetVaultState(page);
    await openTodoseqPanel(page);
    await waitForTaskListVisible(page);
  });

  test('group aliases filter the task list by state group', async () => {
    const searchInput = page.locator('input[aria-label="Search tasks"]');

    await searchInput.fill('state:active');
    await page.waitForTimeout(800);
    let body = await page.locator('.todoseq-task-list').textContent();
    expect(body).toContain('In-progress task');
    expect(body).not.toContain('State cycling task');
    expect(body).not.toContain('Blocked task');

    await searchInput.fill('state:waiting');
    await page.waitForTimeout(800);
    body = await page.locator('.todoseq-task-list').textContent();
    expect(body).toContain('Blocked task');
    expect(body).not.toContain('In-progress task');

    await searchInput.fill('state:active OR state:completed');
    await page.waitForTimeout(800);
    body = await page.locator('.todoseq-task-list').textContent();
    expect(body).toContain('In-progress task');
    expect(body).toContain('Completed task');
    expect(body).not.toContain('State cycling task');

    await searchInput.fill('state:active or state:completed');
    await page.waitForTimeout(800);
    body = await page.locator('.todoseq-task-list').textContent();
    expect(body).toContain('In-progress task');
    expect(body).toContain('Completed task');
    expect(body).not.toContain('State cycling task');

    await searchInput.fill('');
    await page.waitForTimeout(500);
  });
});
