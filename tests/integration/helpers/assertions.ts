import { Page } from 'playwright';

export async function waitForTaskListVisible(page: Page): Promise<void> {
  await page.waitForSelector('.todoseq-task-list', { timeout: 10_000 });
}

export async function getTaskCount(page: Page): Promise<number> {
  return page.locator('.task-list-item').count();
}

export async function clickTaskCheckbox(page: Page, taskText: string): Promise<void> {
  const taskItem = page.locator('.task-list-item', { hasText: taskText });
  await taskItem.locator('.task-list-item-checkbox').click();
}

export async function getTaskState(page: Page, taskText: string): Promise<string | null> {
  const taskItem = page.locator('.task-list-item', { hasText: taskText });
  return taskItem.locator('.task-keyword').textContent();
}

export async function openCommandPalette(page: Page): Promise<void> {
  await page.keyboard.press('Meta+P');
  await page.waitForSelector('.suggestion-container', { timeout: 5_000 });
}

export async function runCommand(page: Page, command: string): Promise<void> {
  await openCommandPalette(page);
  await page.keyboard.type(command);
  await page.waitForTimeout(500);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(500);
}

export async function openTodoseqPanel(page: Page): Promise<void> {
  await runCommand(page, 'TODOseq: Open task list');
  await waitForTaskListVisible(page);
}
