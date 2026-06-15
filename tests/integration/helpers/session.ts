import { chromium, Browser, Page } from 'playwright';
import { CDP_PORT } from './harness';

/**
 * Shared Obsidian session across the whole test suite.
 *
 * The Obsidian process is launched once in globalSetup and left running with
 * CDP open on CDP_PORT. Each worker reconnects over CDP (globalSetup and the
 * test workers run in separate Node processes, so we cannot pass a live Page
 * between them — CDP is the bridge).
 *
 * Within a single worker (we use workers: 1), `getPage()` returns the same
 * connected Page for every test file, so the expensive Obsidian launch happens
 * exactly once per suite run.
 */

let browser: Browser | null = null;
let page: Page | null = null;

/**
 * Connect to an Obsidian instance over CDP and return the browser + first page.
 * Shared by launchObsidian() (initial launch) and getPage() (worker reconnect).
 */
export async function connectOverCDP(
  port: number = CDP_PORT,
): Promise<{ browser: Browser; page: Page }> {
  const b = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  const contexts = b.contexts();
  const p = contexts[0]?.pages()[0] ?? (await contexts[0].newPage());
  return { browser: b, page: p };
}

export async function getPage(): Promise<Page> {
  if (page && !page.isClosed()) {
    return page;
  }

  const connected = await connectOverCDP();
  browser = connected.browser;
  page = connected.page;
  return page;
}

/** Disconnect Playwright from CDP without killing Obsidian (globalTeardown owns that). */
export async function releaseSession(): Promise<void> {
  if (browser) {
    await browser.close().catch(() => {});
    browser = null;
    page = null;
  }
}
