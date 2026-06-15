import { Browser, Page } from 'playwright';
import { spawn, execSync, ChildProcess } from 'child_process';
import {
  USER_DATA_DIR,
  TEST_VAULT_DIR,
  CDP_PORT,
  OBSIDIAN_PATH,
} from './harness';
import { connectOverCDP } from './session';
import { closeAllModals } from './assertions';

let obsidianProcess: ChildProcess | null = null;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitForCDP(timeoutMs = 60_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`);
      if (res.ok) return;
    } catch {
      // not ready yet
    }
    await sleep(500);
  }
  throw new Error(`Obsidian CDP not available after ${timeoutMs}ms`);
}

async function isCDPUp(): Promise<boolean> {
  try {
    const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`);
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Kill the process we spawned (SIGTERM, then SIGKILL fallback).
 */
async function killSpawned(): Promise<void> {
  const proc = obsidianProcess;
  obsidianProcess = null;
  if (!proc || proc.exitCode !== null) return;

  await new Promise<void>((resolve) => {
    const onGone = () => resolve();
    proc.once('exit', onGone);
    proc.kill('SIGTERM');
    const force = setTimeout(() => {
      proc.kill('SIGKILL');
      resolve();
    }, 5_000);
    proc.once('exit', () => clearTimeout(force));
  });
}

/**
 * Kill any Obsidian process listening on our isolated CDP port.
 *
 * Scoped to the port so it can never touch the user's real Obsidian instance
 * (which is not on this port). Used when this module must take over an instance
 * it didn't spawn — e.g. the restart test, where globalSetup launched Obsidian
 * in a different Node process.
 */
async function killObsidianOnCDP(): Promise<void> {
  if (!(await isCDPUp())) return;

  try {
    // lsof finds the PID listening on the CDP port; scoped, never global.
    const pid = execSync(`lsof -ti tcp:${CDP_PORT} -sTCP:LISTEN`, {
      encoding: 'utf8',
    }).trim();
    if (pid) {
      try {
        process.kill(Number(pid), 'SIGTERM');
      } catch {
        // already gone
      }
      // Wait for the port to free up.
      const deadline = Date.now() + 10_000;
      while (Date.now() < deadline && (await isCDPUp())) {
        await sleep(200);
      }
    }
  } catch {
    // lsof found nothing — already gone.
  }
}

/**
 * Launch an isolated Obsidian instance.
 *
 * Isolation is achieved via `--user-data-dir=<USER_DATA_DIR>`: Obsidian reads
 * its vault registry (`obsidian.json`) from that directory instead of the system
 * default (`~/Library/Application Support/obsidian`). The harness writes that
 * registry so it points ONLY at the test vault, which is why the test vault
 * opens instead of the user's real vaults. The vault path is passed as the final
 * positional argument (it is the registered `"open": true` vault, so no
 * `--vault=` flag is needed).
 *
 * The plugin is pre-enabled via community-plugins.json, so we wait for it to
 * load by polling `app.plugins.plugins['todoseq']` rather than calling
 * `setEnable(true)` (which races against the load lifecycle).
 */
export async function launchObsidian(): Promise<{
  browser: Browser;
  page: Page;
}> {
  // Kill our tracked process, and any instance on our CDP port that we didn't
  // spawn (e.g. one launched by globalSetup in another Node process). Scoped to
  // the port — never kills the user's real Obsidian.
  await killSpawned();
  await killObsidianOnCDP();

  obsidianProcess = spawn(
    OBSIDIAN_PATH,
    [
      `--user-data-dir=${USER_DATA_DIR}`,
      `--remote-debugging-port=${CDP_PORT}`,
      TEST_VAULT_DIR,
    ],
    { detached: false, stdio: 'ignore' },
  );

  await waitForCDP();

  const { browser, page } = await connectOverCDP(CDP_PORT);

  // Resize the actual Electron window via electron.remote.
  // Fallback to window.resizeTo if remote is unavailable (e.g. after update).
  await page.evaluate(() => {
    try {
      const remote = (window as any).require('electron')?.remote;
      if (remote?.getCurrentWindow) {
        remote.getCurrentWindow().setSize(1400, 900);
      } else {
        window.resizeTo(1400, 900);
      }
    } catch {
      window.resizeTo(1400, 900);
    }
  });

  // A fresh user-data-dir has no vault-trust state, so Obsidian shows the
  // "Do you trust the author of this vault?" modal and blocks community plugins
  // in Restricted Mode until it is accepted. Accept trust first so the
  // pre-enabled plugin can load.
  await acceptVaultTrust(page);

  await page.waitForSelector('.workspace-leaf', { timeout: 30_000 });

  // Dismiss any first-run / release-notes / sync-setup modal.
  await dismissInitialModal(page);

  // Wait for the plugin to finish loading (pre-enabled in community-plugins.json,
  // loaded after trust is accepted).
  await waitForPlugin(page, 'todoseq');

  return { browser, page };
}

/**
 * Accept the vault-trust modal ("Trust author and enable plugins"). On a fresh
 * user-data-dir this is the first modal shown and it gates community-plugin
 * loading, so it must be handled before waitForPlugin. No-op if already trusted.
 */
async function acceptVaultTrust(page: Page): Promise<void> {
  const trustBtn = page.locator(
    '.modal-button-container button, .modal button',
    {
      hasText: 'Trust author and enable plugins',
    },
  );
  // Wait briefly for the trust modal to appear (it gates plugin loading).
  // isVisible() resolves immediately, so we need waitForSelector to handle
  // the case where Obsidian is still rendering the modal.
  const visible = await trustBtn
    .first()
    .waitFor({ state: 'visible', timeout: 5_000 })
    .then(() => true)
    .catch(() => false);
  if (visible) {
    await trustBtn
      .first()
      .click()
      .catch(() => {});
    // Give Obsidian a moment to exit Restricted Mode and begin loading plugins.
    await sleep(500);
  }
}

async function dismissInitialModal(page: Page): Promise<void> {
  // Close any stacked first-run / release-notes / sync-setup modals.
  await closeAllModals(page);
}

async function waitForPlugin(
  page: Page,
  id: string,
  timeoutMs = 30_000,
): Promise<void> {
  await page.waitForFunction(
    (pluginId) => !!(window as any).app?.plugins?.plugins?.[pluginId],
    id,
    { timeout: timeoutMs },
  );
}

/**
 * Close the Obsidian instance and disconnect Playwright.
 *
 * Kills our tracked process if we spawned one; otherwise falls back to killing
 * whatever is on our CDP port (scoped — never the user's real instance). The
 * fallback lets the restart test close an instance launched by globalSetup.
 */
export async function closeObsidian(browser?: Browser): Promise<void> {
  if (browser) {
    await browser.close().catch(() => {});
  }
  await killSpawned();
  await killObsidianOnCDP();
}
