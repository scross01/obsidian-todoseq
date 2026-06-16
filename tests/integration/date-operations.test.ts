import { test, expect } from '@playwright/test';
import { getPage } from './helpers/session';
import { resetVaultState } from './helpers/test-reset';
import {
  openTodoseqPanel,
  waitForTaskListVisible,
  runCommandById,
} from './helpers/assertions';
import {
  openFileInEditor,
  readEditorContent,
  readVaultFile,
} from './helpers/editor-utils';
import { Page } from 'playwright';

let page: Page;

test.beforeAll(async () => {
  page = await getPage();
});

test.describe('Date operations', () => {
  test.beforeEach(async () => {
    await resetVaultState(page);
  });

  test('set scheduled date to Today via context menu', async () => {
    // Open task list, find task, open context menu, click Today scheduled
    await openTodoseqPanel(page);
    await waitForTaskListVisible(page);

    const taskItem = page.locator('.todoseq-task-item', {
      hasText: 'Buy groceries',
    });
    await expect(taskItem).toBeVisible({ timeout: 10_000 });
    await taskItem.click({ button: 'right' });

    const contextMenu = page.locator('.todoseq-task-context-menu');
    await expect(contextMenu).toBeVisible({ timeout: 5_000 });

    // Click "Today" scheduled date button
    const todayBtn = contextMenu.locator(
      '.todoseq-context-menu-icon-btn[aria-label="Today"]',
    );
    await expect(todayBtn).toBeVisible();
    await todayBtn.click();

    // Wait for the file write to complete.
    await page.waitForTimeout(1000);

    // Verify file content now has a SCHEDULED line for today.
    const content = await readVaultFile(page, 'inbox');
    expect(content).toContain('Buy groceries');
    expect(content).toMatch(/SCHEDULED: <\d{4}-\d{2}-\d{2}/);
  });

  test('remove scheduled date via context menu No date', async () => {
    // First set a scheduled date on a task via the editor command.
    await openFileInEditor(page, 'inbox');

    let content = await readEditorContent(page);
    expect(content).toContain('Review PR #123');

    // Place cursor on "Review PR #123" and add scheduled date via command
    const taskText = page
      .locator('.workspace-leaf.mod-active .cm-editor')
      .getByText('Review PR #123');
    await taskText.click();
    await runCommandById(page, 'todoseq:add-scheduled-date');
    await page.waitForTimeout(1000);

    content = await readEditorContent(page);
    expect(content).toMatch(/SCHEDULED: <\d{4}-\d{2}-\d{2}/);

    // Now open the task list and remove the date via context menu.
    await openTodoseqPanel(page);
    await waitForTaskListVisible(page);

    const taskItem = page.locator('.todoseq-task-item', {
      hasText: 'Review PR #123',
    });
    await expect(taskItem).toBeVisible({ timeout: 10_000 });
    await taskItem.click({ button: 'right' });

    const contextMenu = page.locator('.todoseq-task-context-menu');
    await expect(contextMenu).toBeVisible({ timeout: 5_000 });

    const noDateBtn = contextMenu.locator(
      '.todoseq-context-menu-icon-btn[aria-label="No date"]',
    );
    await expect(noDateBtn).toBeVisible();
    await noDateBtn.click();
    await page.waitForTimeout(1000);

    // Re-open the file and verify SCHEDULED line is gone
    await openFileInEditor(page, 'inbox');
    content = await readEditorContent(page);
    expect(content).not.toMatch(/SCHEDULED: <\d{4}-\d{2}-\d{2}/);
  });
});
