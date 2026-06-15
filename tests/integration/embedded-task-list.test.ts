import { test, expect } from '@playwright/test';
import { launchObsidian, closeObsidian } from './helpers/obsidian-launcher';
import { setupTestVault, cleanupTestVault } from './helpers/vault-setup';
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

async function openEmbeddedDemoFile(page: Page): Promise<void> {
  await page.keyboard.press('Meta+O');
  await page.waitForSelector('.quick-switcher-input', { timeout: 5_000 });
  await page.keyboard.type('embedded-demo');
  await page.waitForTimeout(500);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(1_000);
}

test.describe('Embedded task list', () => {
  test('renders tasks from path in reading mode', async () => {
    await openEmbeddedDemoFile(page);

    const codeBlock = page.locator('.markdown-preview-section [data-type="codeblock"]');
    await expect(codeBlock).toBeVisible({ timeout: 10_000 });

    const embeddedList = codeBlock.locator('.todoseq-embedded-task-list');
    await expect(embeddedList).toBeVisible({ timeout: 10_000 });

    const taskItems = embeddedList.locator('.todoseq-embedded-task-item');
    const count = await taskItems.count();
    expect(count).toBeGreaterThanOrEqual(2);

    const bodyText = await embeddedList.textContent();
    expect(bodyText).toContain('Implement feature A');
    expect(bodyText).toContain('Fix bug in module B');
  });

  test('embedded checkbox toggles task state', async () => {
    await openEmbeddedDemoFile(page);

    const codeBlock = page.locator('.markdown-preview-section [data-type="codeblock"]');
    await expect(codeBlock).toBeVisible({ timeout: 10_000 });

    const embeddedList = codeBlock.locator('.todoseq-embedded-task-list');
    await expect(embeddedList).toBeVisible({ timeout: 10_000 });

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
