import { chromium, Browser, Page, CDPSession } from 'playwright';
import fs from 'fs';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { CDP_PORT, REPO_ROOT } from './harness';

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
let coverageSession: CDPSession | null = null;

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

/**
 * Start V8 precise coverage collection via CDP Profiler domain.
 * Only runs when COLLECT_COVERAGE env var is set.
 */
export async function startCoverageOnPage(targetPage: Page): Promise<void> {
  if (!process.env.COLLECT_COVERAGE) return;
  if (coverageSession) return;
  try {
    const session = await targetPage.context().newCDPSession(targetPage);
    await session.send('Profiler.enable');
    await session.send('Profiler.startPreciseCoverage', {
      callCount: true,
      detailed: true,
    });
    coverageSession = session;
    console.debug('[coverage] V8 precise coverage started');
  } catch (err) {
    console.debug('[coverage] Failed to start V8 coverage:', err);
  }
}

export async function getPage(): Promise<Page> {
  if (page && !page.isClosed()) {
    return page;
  }

  const connected = await connectOverCDP();
  browser = connected.browser;
  page = connected.page;

  // Start V8 coverage in the worker process so saveCoverage() works here.
  await startCoverageOnPage(page);

  return page;
}

/**
 * Take V8 coverage snapshot and write to coverage/integration-v8.json.
 * Uses the stored CDP session for accurate block-level coverage.
 * Throws on failure so test authors notice coverage gaps.
 * No-op when COLLECT_COVERAGE env var is not set.
 */
export async function saveCoverage(): Promise<void> {
  if (!process.env.COLLECT_COVERAGE || !coverageSession) {
    return;
  }
  console.debug('[coverage] Taking V8 coverage snapshot...');
  const { result } = await coverageSession.send('Profiler.takePreciseCoverage');
  const coverageDir = path.join(REPO_ROOT, 'coverage');
  await mkdir(coverageDir, { recursive: true });
  const coveragePath = path.join(coverageDir, 'integration-v8.json');
  await writeFile(coveragePath, JSON.stringify(result));
  console.debug(
    `[coverage] V8 coverage saved: ${coveragePath} (${result.length} scripts)`,
  );
}

/**
 * Collect V8 coverage and write to coverage/integration-v8.json.
 * Called by globalTeardown in the same process as globalSetup.
 * No-op when COLLECT_COVERAGE env var is not set.
 */
export async function collectAndSaveCoverage(): Promise<void> {
  if (!process.env.COLLECT_COVERAGE) return;
  try {
    await saveCoverage();
  } catch (err) {
    console.debug(
      '[coverage] Teardown coverage collection failed (non-fatal):',
      err,
    );
  }
}

/** Disconnect Playwright from CDP without killing Obsidian (globalTeardown owns that). */
export async function releaseSession(): Promise<void> {
  if (browser) {
    await browser.close().catch(() => {});
    browser = null;
    page = null;
    coverageSession = null;
  }
}
