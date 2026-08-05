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
 *
 * On Obsidian 1.13+ this opens a separate Electron settings window (a second
 * CDP page, no `window.app` there). Returns that settings page so callers can
 * navigate it. Falls back to polling the other pages for the settings DOM.
 */
export async function openSettings(page: Page): Promise<Page> {
  await runCommandById(page, 'app:open-settings');
  const browser = page.context().browser();
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const pages = browser ? browser.contexts().flatMap((c) => c.pages()) : [];
    for (const candidate of pages) {
      if (candidate === page) continue;
      const isSettings = await candidate
        .evaluate(
          () =>
            !(window as any).app &&
            !!document.querySelector('.vertical-tab-nav-item'),
        )
        .catch(() => false);
      if (isSettings) return candidate;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('Settings window did not open within 10s');
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
 * Best-effort: also closes the 1.13+ settings window via the app API first so
 * a lingering settings window can't block modal-driven suites.
 */
export async function closeAllModals(page: Page): Promise<void> {
  await page
    .evaluate(() => {
      const app = (window as any).app;
      if (app?.setting?.close) app.setting.close();
    })
    .catch(() => {});
  await page.evaluate(() => {
    document.querySelectorAll('.modal-close-button').forEach((btn) => {
      (btn as HTMLElement).click();
    });
  });
  await page.waitForTimeout(200);
}

/**
 * Close the settings window. Always called with the MAIN page (which has
 * `window.app`); closes via the app API, falling back to window.close().
 */
export async function closeSettings(page: Page): Promise<void> {
  await page
    .evaluate(() => {
      const app = (window as any).app;
      if (app?.setting?.close) {
        app.setting.close();
        return;
      }
      window.close();
    })
    .catch(() => {});
  await page.waitForTimeout(200);
}
