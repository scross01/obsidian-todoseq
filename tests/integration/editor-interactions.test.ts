import { test, expect } from '@playwright/test';
import { launchObsidian, closeObsidian } from './helpers/obsidian-launcher';
import {
  setupTestVault,
  cleanupTestVault,
  getTestVaultPath,
} from './helpers/vault-setup';
import { openTodoseqPanel, runCommand } from './helpers/assertions';
import { ElectronApplication, Page } from 'playwright';
import fs from 'fs';
import path from 'path';

let app: ElectronApplication;
let page: Page;

const INBOX_PATH = path.join(getTestVaultPath(), 'inbox.md');

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

async function openFileInEditor(filename: string): Promise<void> {
  const leaves = page.locator('.workspace-leaf');
  await leaves.first().waitFor({ state: 'visible', timeout: 15_000 });
  await page.keyboard.press('Meta+O');
  await page.waitForSelector('.quick-switcher-modal', { timeout: 5_000 });
  await page.keyboard.type(filename);
  await page.waitForTimeout(500);
  await page.keyboard.press('Enter');
  await page.waitForSelector('.markdown-source-view', { timeout: 10_000 });
}

test.describe('Editor interactions', () => {
  test('task keywords are highlighted in editor', async () => {
    await openFileInEditor('inbox');

    const editor = page.locator('.markdown-source-view');
    await editor.waitFor({ state: 'visible', timeout: 10_000 });

    const keywords = page.locator(
      '.cm-editor .todoseq-keyword-formatted[data-task-keyword]',
    );
    await expect(keywords.first()).toBeVisible({ timeout: 10_000 });

    const count = await keywords.count();
    expect(count).toBeGreaterThanOrEqual(1);

    const firstKeyword = keywords.first();
    const taskKeyword = await firstKeyword.getAttribute('data-task-keyword');
    expect(['TODO', 'DONE', 'WAITING']).toContain(taskKeyword);
  });

  test('checkbox click in editor toggles task state', async () => {
    await openFileInEditor('inbox');

    const editor = page.locator('.markdown-source-view');
    await editor.waitFor({ state: 'visible', timeout: 10_000 });

    const lineWithTask = page.locator('.task-list-item', {
      hasText: 'Buy groceries',
    });
    await lineWithTask.waitFor({ state: 'visible', timeout: 10_000 });

    const checkbox = lineWithTask.locator('.task-list-item-checkbox');
    await checkbox.click();
    await page.waitForTimeout(1000);

    const fileContent = fs.readFileSync(INBOX_PATH, 'utf-8');
    const lines = fileContent.split('\n');
    const taskLine = lines.find((l) => l.includes('Buy groceries'));
    expect(taskLine).toBeDefined();
    expect(taskLine).toMatch(/\[x\]/);
  });

  test('context menu appears on right-click task', async () => {
    await openFileInEditor('inbox');

    const editor = page.locator('.markdown-source-view');
    await editor.waitFor({ state: 'visible', timeout: 10_000 });

    const lineWithTask = page.locator('.task-list-item', {
      hasText: 'Review PR #123',
    });
    await lineWithTask.waitFor({ state: 'visible', timeout: 10_000 });

    await lineWithTask.click({ button: 'right' });

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
    await openFileInEditor('inbox');

    const editor = page.locator('.markdown-source-view');
    await editor.waitFor({ state: 'visible', timeout: 10_000 });

    const lineWithTask = page.locator('.task-list-item', {
      hasText: 'Buy groceries',
    });
    await lineWithTask.waitFor({ state: 'visible', timeout: 10_000 });

    await lineWithTask.click();

    await runCommand(page, 'TODOseq: Cycle task state');

    await page.waitForTimeout(1000);

    const fileContent = fs.readFileSync(INBOX_PATH, 'utf-8');
    const lines = fileContent.split('\n');
    const taskLine = lines.find((l) => l.includes('Buy groceries'));
    expect(taskLine).toBeDefined();
    expect(taskLine).not.toMatch(/TODO/);
  });
});
