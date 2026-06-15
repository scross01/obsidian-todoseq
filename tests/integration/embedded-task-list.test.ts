import { test, expect } from '@playwright/test';
import { getPage } from './helpers/session';
import { resetVaultState } from './helpers/test-reset';
import { closeAllModals } from './helpers/assertions';
import { Page } from 'playwright';

let page: Page;

test.beforeAll(async () => {
  page = await getPage();
});

async function openEmbeddedDemoFile(page: Page): Promise<void> {
  // Close any lingering modals first.
  await closeAllModals(page);

  await page.evaluate(async () => {
    const app = (window as any).app;
    const file = app.vault.getFiles().find((f: any) => f.basename === 'embedded-demo');
    if (!file) throw new Error('embedded-demo.md not found');
    const leaf = app.workspace.getLeaf(false);
    await leaf.openFile(file);
  });

  // Toggle to reading mode if currently in editing mode.
  const editButton = page.locator(
    '.workspace-leaf.mod-active button[aria-label*="read"]',
  );
  if (await editButton.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await editButton.click();
  }

  // Wait for the embedded task list to be rendered in the view.
  // The plugin processes code blocks asynchronously after the view renders.
  // Note: offsetParent may be null in Obsidian's source-view DOM, so we
  // only check for element existence and that it has child content.
  await page.waitForFunction(
    () => {
      const list = document.querySelector('.todoseq-embedded-task-list');
      return list && list.children.length > 0;
    },
    { timeout: 15_000 },
  );
}

test.describe('Embedded task list', () => {
  test.beforeEach(async () => {
    await resetVaultState(page);
  });

  test('renders tasks from path in reading mode', async () => {
    await openEmbeddedDemoFile(page);

    const embeddedList = page.locator('.todoseq-embedded-task-list').first();
    const taskItems = embeddedList.locator('.todoseq-embedded-task-item');
    const count = await taskItems.count();
    // All tasks from projects/ should appear (2 TODO + 1 DONE from alpha.md).
    expect(count).toBe(3);

    const bodyText = await embeddedList.textContent();
    expect(bodyText).toContain('Implement feature A');
    expect(bodyText).toContain('Fix bug in module B');
    // Tasks outside projects/ must be absent.
    expect(bodyText).not.toContain('Buy groceries');
    expect(bodyText).not.toContain('Daily task 1');
  });

  test('embedded checkbox toggles task state', async () => {
    await openEmbeddedDemoFile(page);

    const embeddedList = page.locator('.todoseq-embedded-task-list').first();
    const taskItem = embeddedList.locator('.todoseq-embedded-task-item', {
      hasText: 'Implement feature A',
    });
    await expect(taskItem).toBeVisible();

    const checkbox = taskItem.locator('.todoseq-embedded-task-checkbox');
    const initialState = await checkbox.getAttribute('data-task');
    expect(initialState).toBe(' ');

    await checkbox.click();
    await page.waitForTimeout(1_000);

    const newState = await checkbox.getAttribute('data-task');
    expect(newState).toBe('x');

    const completedClass = await taskItem.evaluate((el) =>
      el.classList.contains('todoseq-embedded-task-completed'),
    );
    expect(completedClass).toBe(true);
  });
});
