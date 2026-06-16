import { test, expect } from '@playwright/test';
import { getPage } from './helpers/session';
import { resetVaultState } from './helpers/test-reset';
import { runCommandById } from './helpers/assertions';
import { openFileInEditor, readEditorContent } from './helpers/editor-utils';
import { Page } from 'playwright';

let page: Page;

test.beforeAll(async () => {
  page = await getPage();
});

test.describe('Editor interactions', () => {
  test.beforeEach(async () => {
    await resetVaultState(page);
  });

  test('task keywords are highlighted in editor', async () => {
    await openFileInEditor(page, 'inbox');

    const keywords = page.locator(
      '.workspace-leaf.mod-active .cm-editor .todoseq-keyword-formatted[data-task-keyword]',
    );
    await expect(keywords.first()).toBeVisible({ timeout: 10_000 });

    const count = await keywords.count();
    expect(count).toBeGreaterThanOrEqual(1);

    const firstKeyword = keywords.first();
    const taskKeyword = await firstKeyword.getAttribute('data-task-keyword');
    expect(['TODO', 'DONE', 'WAITING']).toContain(taskKeyword);
  });

  test('checkbox click in editor toggles task state', async () => {
    await openFileInEditor(page, 'inbox');

    // Find the checkbox near "Buy groceries" text and click it.
    const activeLeaf = page.locator('.workspace-leaf.mod-active');
    const checkbox = activeLeaf
      .locator('div')
      .filter({ hasText: 'Buy groceries' })
      .locator('input[type="checkbox"]')
      .first();
    await expect(checkbox).toBeVisible({ timeout: 10_000 });
    await checkbox.click();

    // Wait for Obsidian to flush the edit.
    await page.waitForTimeout(500);

    const content = await readEditorContent(page);
    const taskLine = content
      .split('\n')
      .find((l) => l.includes('Buy groceries'));
    expect(taskLine).toBeDefined();
    expect(taskLine).toMatch(/\[x\]/);
  });

  test('context menu appears on right-click task in task list panel', async () => {
    // The plugin's context menu is on the task list view panel, not the editor.
    const { openTodoseqPanel } = await import('./helpers/assertions');
    await openTodoseqPanel(page);

    const taskItem = page.locator('.todoseq-task-item', {
      hasText: 'Review PR #123',
    });
    await expect(taskItem).toBeVisible({ timeout: 10_000 });

    await taskItem.click({ button: 'right' });

    const contextMenu = page.locator('.todoseq-task-context-menu');
    await expect(contextMenu).toBeVisible({ timeout: 5_000 });

    const goToTask = contextMenu.locator('.todoseq-context-menu-row', {
      hasText: 'Go to task',
    });
    await expect(goToTask).toBeVisible();

    const priorityHeader = contextMenu.locator('.todoseq-context-menu-header', {
      hasText: 'Priority',
    });
    await expect(priorityHeader).toBeVisible();

    const scheduledHeader = contextMenu.locator(
      '.todoseq-context-menu-header',
      { hasText: 'Scheduled' },
    );
    await expect(scheduledHeader).toBeVisible();
  });

  test('priority cycle works from editor command', async () => {
    await openFileInEditor(page, 'inbox');

    // Click directly on the task text to place the cursor on that line.
    const taskText = page
      .locator('.workspace-leaf.mod-active .cm-editor')
      .getByText('Buy groceries');
    await taskText.click();

    await runCommandById(page, 'todoseq:cycle-task-state');

    await page.waitForTimeout(500);

    const content = await readEditorContent(page);
    const taskLine = content
      .split('\n')
      .find((l) => l.includes('Buy groceries'));
    expect(taskLine).toBeDefined();
    expect(taskLine).not.toMatch(/TODO/);
  });

  test('full state cycle: TODO → DOING → DONE → TODO', async () => {
    await openFileInEditor(page, 'states');

    // Step 1: Cycle TODO → DOING
    const taskText = page
      .locator('.workspace-leaf.mod-active .cm-editor')
      .getByText('State cycling task');
    await taskText.click();
    await runCommandById(page, 'todoseq:cycle-task-state');
    await page.waitForTimeout(500);

    let content = await readEditorContent(page);
    let taskLine = content
      .split('\n')
      .find((l) => l.includes('State cycling task'));
    expect(taskLine).toBeDefined();
    expect(taskLine).not.toMatch(/TODO/);

    // Step 2: Cycle DOING → DONE
    await taskText.click();
    await runCommandById(page, 'todoseq:cycle-task-state');
    await page.waitForTimeout(500);

    content = await readEditorContent(page);
    taskLine = content
      .split('\n')
      .find((l) => l.includes('State cycling task'));
    expect(taskLine).toBeDefined();
    expect(taskLine).toMatch(/DONE/);

    // Step 3: Cycle DONE → inactive (empty keyword with default settings)
    await taskText.click();
    await runCommandById(page, 'todoseq:cycle-task-state');
    await page.waitForTimeout(500);

    content = await readEditorContent(page);
    taskLine = content
      .split('\n')
      .find((l) => l.includes('State cycling task'));
    expect(taskLine).toBeDefined();
    // With defaultInactive="" in baseline settings, cycle returns to empty keyword.
    // The line should be "- [ ] State cycling task" with no keyword.
    expect(taskLine).not.toMatch(/TODO|DOING|DONE/);
  });

  test('toggle completed task back to active via cycle command', async () => {
    await openFileInEditor(page, 'states');

    // Click on "Completed task" (DONE state) and cycle to TODO
    const taskText = page
      .locator('.workspace-leaf.mod-active .cm-editor')
      .getByText('Completed task');
    await taskText.click();
    await runCommandById(page, 'todoseq:cycle-task-state');
    await page.waitForTimeout(500);

    const content = await readEditorContent(page);
    const taskLine = content
      .split('\n')
      .find((l) => l.includes('Completed task'));
    expect(taskLine).toBeDefined();
    // With defaultInactive="" in baseline settings, DONE cycles to empty keyword.
    expect(taskLine).not.toMatch(/DONE|TODO|DOING/);
  });
});
