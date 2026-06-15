import { Page } from 'playwright';

export async function waitForTaskListVisible(page: Page): Promise<void> {
  await page.waitForSelector('.todoseq-task-list', { timeout: 15_000 });
}

export async function getTaskCount(page: Page): Promise<number> {
  return page.locator('.todoseq-task-item').count();
}

/**
 * Run an Obsidian command by ID via the app API.
 */
export async function runCommandById(
  page: Page,
  commandId: string,
): Promise<void> {
  const result = await page.evaluate(async (id) => {
    const app = (window as any).app;
    if (!app?.commands?.executeCommandById)
      return { ok: false, error: 'app.commands not available' };
    try {
      app.commands.executeCommandById(id);
      return { ok: true };
    } catch (e: any) {
      return { ok: false, error: e?.message ?? String(e) };
    }
  }, commandId);
  if (!result.ok) {
    throw new Error(
      `Failed to execute command "${commandId}": ${result.error}`,
    );
  }
}

/**
 * Open the TODOseq task list panel via the plugin command.
 * Obsidian auto-prefixes command IDs with the manifest ID ("todoseq:"),
 * so the full ID registered by addCommand({ id: 'show-task-list' }) is "todoseq:show-task-list".
 */
export async function openTodoseqPanel(page: Page): Promise<void> {
  await runCommandById(page, 'todoseq:show-task-list');
  await waitForTaskListVisible(page);
}

/**
 * Open Obsidian settings via the command API.
 * This is more reliable than app.setting.open().
 */
export async function openSettings(page: Page): Promise<void> {
  await runCommandById(page, 'app:open-settings');
  // Wait for any modal to appear.
  await page.waitForSelector('.modal', { timeout: 10_000 });
  await page.waitForTimeout(300);
}

/**
 * Navigate to a community plugin's settings tab in the Obsidian settings modal.
 * Community plugin tabs appear in the sidebar after core plugin tabs.
 * Uses the actual Obsidian DOM class: .vertical-tab-nav-item with .vertical-tab-nav-item-title child.
 */
export async function navigateToPluginTab(
  page: Page,
  pluginName: string,
): Promise<void> {
  const clicked = await page.evaluate((name) => {
    const items = document.querySelectorAll('.vertical-tab-nav-item');
    for (const item of items) {
      const title = item.querySelector('.vertical-tab-nav-item-title');
      if (title?.textContent?.trim() === name) {
        (item as HTMLElement).click();
        return true;
      }
    }
    return false;
  }, pluginName);

  if (!clicked) {
    throw new Error(`Could not find settings tab "${pluginName}" in sidebar`);
  }
  await page.waitForTimeout(500);
}

/**
 * Close all open Obsidian modals by clicking their close buttons via DOM.
 */
export async function closeAllModals(page: Page): Promise<void> {
  await page.evaluate(() => {
    document.querySelectorAll('.modal-close-button').forEach((btn) => {
      (btn as HTMLElement).click();
    });
  });
  await page.waitForTimeout(200);
}

/**
 * Close the settings modal.
 */
export async function closeSettings(page: Page): Promise<void> {
  await closeAllModals(page);
}
