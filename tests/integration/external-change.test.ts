import { test, expect } from '@playwright/test';
import { getPage } from './helpers/session';
import { resetVaultState } from './helpers/test-reset';
import {
  openTodoseqPanel,
  waitForTaskListVisible,
} from './helpers/assertions';
import { TEST_VAULT_DIR } from './helpers/vault-setup';
import fs from 'fs';
import path from 'path';
import { Page } from 'playwright';

let page: Page;

test.beforeAll(async () => {
  page = await getPage();
});

test.describe('External file change', () => {
  test.beforeEach(async () => {
    await resetVaultState(page);
  });

  test('external file modification triggers vault rescan and UI update', async () => {
    // Open task list and note the tasks that are visible.
    await openTodoseqPanel(page);
    await waitForTaskListVisible(page);

    // Close any stale dropdowns.
    await page.evaluate(() => {
      document.querySelectorAll('.todoseq-dropdown.show').forEach((el) => {
        el.classList.remove('show');
      });
    });
    await page.waitForTimeout(200);

    // Verify the external-change file has no tasks initially.
    const initialText = await page
      .locator('.todoseq-task-list')
      .textContent();
    expect(initialText).not.toContain('Externally added task');

    // Write a new task to the external-change.md file outside of Obsidian.
    const filePath = path.join(TEST_VAULT_DIR, 'external-change.md');
    fs.writeFileSync(
      filePath,
      `# External Change Test\n\n- [ ] TODO Externally added task\n- [ ] DOING Another external task\n`,
    );

    // Wait for Obsidian's file watcher to detect the change + debounce + rescan.
    await page.waitForTimeout(3000);

    // Re-open the task list to see updated tasks.
    await openTodoseqPanel(page);
    await waitForTaskListVisible(page);
    await page.waitForTimeout(500);

    // Verify the new tasks appear in the task list.
    const updatedText = await page
      .locator('.todoseq-task-list')
      .textContent();
    expect(updatedText).toContain('Externally added task');
    expect(updatedText).toContain('Another external task');
  });

  test('external file deletion removes tasks from list', async () => {
    // Open task list and verify inbox tasks are visible.
    await openTodoseqPanel(page);
    await waitForTaskListVisible(page);

    await page.evaluate(() => {
      document.querySelectorAll('.todoseq-dropdown.show').forEach((el) => {
        el.classList.remove('show');
      });
    });
    await page.waitForTimeout(200);

    const initialText = await page
      .locator('.todoseq-task-list')
      .textContent();
    expect(initialText).toContain('Buy groceries');

    // Delete the inbox.md file externally.
    const filePath = path.join(TEST_VAULT_DIR, 'inbox.md');
    fs.unlinkSync(filePath);

    // Wait for Obsidian to detect the deletion + rescan.
    await page.waitForTimeout(3000);

    // Re-open task list.
    await openTodoseqPanel(page);
    await waitForTaskListVisible(page);
    await page.waitForTimeout(500);

    const updatedText = await page
      .locator('.todoseq-task-list')
      .textContent();
    // Inbox tasks should be gone.
    expect(updatedText).not.toContain('Buy groceries');
    expect(updatedText).not.toContain('Review PR #123');
    expect(updatedText).not.toContain('Write documentation');
  });
});
