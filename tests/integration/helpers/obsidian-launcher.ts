import { Browser, Page } from 'playwright';
import { spawn, ChildProcess } from 'child_process';
import http from 'http';
import { assertPortAvailable } from './process-owner';
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

function httpGet(url: string, timeoutMs = 2_000): Promise<number> {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      resolve(res.statusCode ?? 0);
      res.resume();
    });
    // A listener can accept TCP and never answer. Without a per-probe timeout,
    // the waitForCDP deadline never gets a chance to run.
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error(`CDP probe timed out after ${timeoutMs}ms`));
    });
    req.on('error', reject);
    req.end();
  });
}

/**
 * Wait for Obsidian's CDP endpoint, or throw with everything known about how
 * the launch went.
 *
 * The exit status is the part that earns its keep: a launch that fails outright
 * reports why in the error rather than as a bare 60-second timeout. Note the
 * captured stdio is *not* a renderer-crash stack — killing the renderer
 * produces no stderr at all (verified), so do not expect one here.
 */
function hasExited(proc: ChildProcess): boolean {
  // A failed spawn has no pid and emits no usable exit event. Treat it as
  // gone so the lease can be released instead of waiting out SIGKILL.
  return (
    proc.pid === undefined || proc.exitCode !== null || proc.signalCode !== null
  );
}

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
    // If the wrapper command exited, a listener that remains on the port is a
    // detached descendant. We do not own a handle for it and must not adopt
    // it by port discovery.
    if (obsidianProcess && hasExited(obsidianProcess)) {
      throw launchFailure(
        `Obsidian process ${obsidianProcess.pid ?? 'unknown'} exited while waiting for CDP (${processLog.describeExit()}). Refusing to connect to a listener that may belong to an unowned descendant.`,
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
 * lives, and its tail. Mainly valuable when the process wrote something useful
 * before failing (a bad flag, a rejected config); a renderer crash itself is
 * silent on both streams.
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

interface SpawnedShutdown {
  hadHandle: boolean;
  stopped: boolean;
}

/**
 * Stop the process this launcher spawned (SIGTERM, then SIGKILL fallback).
 * A process killed by signal reports `exitCode === null`; both fields decide
 * whether a handle is gone.
 */
async function killSpawned(): Promise<SpawnedShutdown> {
  const proc = obsidianProcess;
  if (!proc) return { hadHandle: false, stopped: true };
  if (hasExited(proc)) {
    if (obsidianProcess === proc) obsidianProcess = null;
    return { hadHandle: true, stopped: true };
  }

  // Distinguish a harness-initiated shutdown in the log from a process that
  // died on its own: the exit record reads "exited on signal SIGTERM" either
  // way, and that ambiguity is exactly what makes a crash hard to spot.
  processLog.note('stopping owned Obsidian (SIGTERM)');

  const stopped = await new Promise<boolean>((resolve) => {
    let settled = false;
    let force: NodeJS.Timeout | null = null;
    const finish = (value: boolean) => {
      if (settled) return;
      settled = true;
      if (force) clearTimeout(force);
      resolve(value);
    };

    proc.once('exit', () => finish(true));
    proc.once('error', () => finish(false));
    proc.kill('SIGTERM');

    force = setTimeout(() => {
      proc.kill('SIGKILL');
      setTimeout(() => {
        finish(hasExited(proc));
      }, 500);
    }, 5_000);
  });

  // Keep the only handle to a process that did not exit: a later stop (or the
  // setup failure path) must be able to retry instead of leaking it.
  if (stopped) {
    if (obsidianProcess === proc) obsidianProcess = null;
  } else if (obsidianProcess === null) {
    obsidianProcess = proc;
  }

  return { hadHandle: true, stopped };
}

/** Refuse to treat an occupied owned port as a successful shutdown. */
async function confirmOwnedPortReleased(): Promise<void> {
  const deadline = Date.now() + 2_000;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      await assertPortAvailable(CDP_PORT);
      return;
    } catch (error) {
      lastError = error;
      await sleep(100);
    }
  }
  const detail =
    lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(
    `Owned Obsidian exited but its CDP listener is still present. ${detail}`,
  );
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
  // Stop only a process this module actually spawned. An occupied port that
  // remains after that is not ours to identify or terminate.
  const previous = await killSpawned();
  if (!previous.stopped) {
    throw new Error(
      'The previously spawned Obsidian process did not exit; refusing to launch another instance.',
    );
  }
  if (previous.hadHandle) {
    await confirmOwnedPortReleased();
  }
  await assertPortAvailable(CDP_PORT);

  // Truncate only once the outgoing instance has exited, so its shutdown note
  // and exit record are written before the file is emptied rather than landing
  // above the new launch header. That is the whole benefit: it keeps the
  // outgoing instance's records out of the new launch's log. They are still
  // truncated away — the log describes the launch in flight.
  //
  // `exit` fires before the stdio pipes finish draining, so the dying instance
  // can still emit data after this point. reset() detaches its listeners, so
  // that straggler is discarded rather than written here — it would carry no
  // pid (only [stdout]/[stderr]) and could land below the new header, where it
  // would read as the current launch's own output.
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
  if (obsidianProcess && hasExited(obsidianProcess)) {
    await browser.close().catch(() => {});
    throw launchFailure(
      `Obsidian process ${obsidianProcess.pid ?? 'unknown'} exited while CDP became available (${processLog.describeExit()}). Refusing to use a listener that may belong to an unowned descendant.`,
    );
  }

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
 * Stops only a handle retained by this module. Callers that need to stop an
 * instance launched by another process must use the authenticated owner
 * control endpoint instead; a CDP port alone is never permission to signal.
 */
export async function closeObsidian(browser?: Browser): Promise<void> {
  if (browser) {
    await browser.close().catch(() => {});
  }
  const shutdown = await killSpawned();
  if (!shutdown.stopped) {
    throw new Error(
      'The owned Obsidian process did not exit; refusing to treat the CDP port as free or delete its fixtures.',
    );
  }
  if (shutdown.hadHandle) {
    await confirmOwnedPortReleased();
  }
}
