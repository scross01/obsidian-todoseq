import { Browser, Page } from 'playwright';
import { spawn, execSync, ChildProcess } from 'child_process';
import http from 'http';
import {
  USER_DATA_DIR,
  TEST_VAULT_DIR,
  CDP_PORT,
  OBSIDIAN_PATH,
  REPO_ROOT,
} from './harness';
import { connectOverCDP, startCoverageOnPage } from './session';
import { closeAllModals } from './assertions';
import { createProcessLog, ProcessLog } from '../../helpers/process-log';
import path from 'path';

let obsidianProcess: ChildProcess | null = null;

/**
 * Where Obsidian's stdio is captured: alongside Playwright's own artifacts.
 *
 * Not in the ephemeral fixture dirs, because the interesting case is a run that
 * has already failed — globalTeardown wipes the fixtures on the way out, taking
 * the evidence with it.
 */
const PROCESS_LOG_PATH = path.join(
  REPO_ROOT,
  'test-results',
  'obsidian-process.log',
);

const processLog: ProcessLog = createProcessLog(PROCESS_LOG_PATH);

/**
 * Truncate the log and clear any recorded exit state, so the capture describes
 * the launch that follows and nothing older.
 */
function beginCapture(): void {
  processLog.reset();
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function httpGet(url: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      resolve(res.statusCode ?? 0);
      res.resume();
    });
    req.on('error', reject);
    req.end();
  });
}

/**
 * Wait for Obsidian's CDP endpoint, or throw with everything known about how
 * the launch went.
 *
 * The exit status and the tail of the captured stdio are what turn "Obsidian
 * never came up" from a 60-second wait into a diagnosable failure — a renderer
 * crash prints a stack to stderr that is otherwise discarded entirely.
 */
async function waitForCDP(timeoutMs = 60_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    // A bad OBSIDIAN_PATH (or a missing wrapper command) means there is no
    // process coming — fail now rather than sit out the whole timeout on a port
    // nothing will ever listen on.
    if (processLog.hasFailedToSpawn()) {
      throw launchFailure(
        `Obsidian failed to launch (${processLog.describeExit()})`,
      );
    }
    try {
      const status = await httpGet(`http://127.0.0.1:${CDP_PORT}/json/version`);
      if (status === 200) return;
    } catch {
      // not ready yet
    }
    await sleep(500);
  }
  throw launchFailure(
    `Obsidian CDP not available after ${timeoutMs}ms (${processLog.describeExit()})`,
  );
}

/**
 * Build a launch failure that carries the evidence: where the captured output
 * lives, and its tail. Electron prints renderer crash stacks to stderr, so this
 * is the difference between a diagnosable crash and a bare timeout.
 */
function launchFailure(message: string): Error {
  const tail = processLog.tail();
  return new Error(
    [
      message,
      `Captured output: ${processLog.filePath}`,
      tail ? `\n--- last ${tail.length} chars ---\n${tail}` : '',
    ].join('\n'),
  );
}

async function isCDPUp(): Promise<boolean> {
  try {
    const status = await httpGet(`http://127.0.0.1:${CDP_PORT}/json/version`);
    return status === 200;
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

  // Distinguish a harness-initiated shutdown in the log from a process that
  // died on its own: the exit record reads "exited on signal SIGTERM" either
  // way, and that ambiguity is exactly what makes a crash hard to spot.
  processLog.note('stopping Obsidian (SIGTERM)');

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

  // Truncate only once the outgoing instance is gone, so its shutdown note and
  // exit record stay with the launch they describe. Truncating first would put
  // them above the new launch header — a reader chasing a crash would read the
  // previous instance's stderr and conclude this launch died.
  beginCapture();

  // Build the launch command. OBSIDIAN_COMMAND (a full command string like
  // `flatpak run md.obsidian.Obsidian` or `snap run obsidian`) is split into
  // program + prefix args; otherwise fall back to OBSIDIAN_PATH (the default is
  // the macOS .app binary).
  const commandParts = (process.env.OBSIDIAN_COMMAND?.trim() ?? '').split(
    /\s+/,
  );
  const launchArgs =
    commandParts.length > 0 && commandParts[0] ? commandParts : [OBSIDIAN_PATH];
  const [program, ...prefixArgs] = launchArgs;

  obsidianProcess = spawn(
    program,
    [
      ...prefixArgs,
      `--user-data-dir=${USER_DATA_DIR}`,
      `--remote-debugging-port=${CDP_PORT}`,
      TEST_VAULT_DIR,
    ],
    // Piped, not ignored: the pipes are drained into the log by the attached
    // ProcessLog, so a chatty Electron process still cannot block on a full
    // buffer — we just no longer throw its output away.
    { detached: false, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  processLog.attach(obsidianProcess);

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

  // Start V8 coverage collection so globalTeardown can take the snapshot.
  await startCoverageOnPage(page);

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
