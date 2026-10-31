/**
 * CDP performance helpers for the (PERF=1) profiling scenarios.
 *
 * Reuses the same newCDPSession channel the coverage helpers use, so no
 * new infrastructure is needed: `Performance.getMetrics` for heap/task
 * timing, `Profiler.start/stop` for sampling CPU profiles written as
 * .cpuprofile artifacts (viewable in Chrome DevTools or speedscope.app).
 *
 * Everything here is report-only: numbers and profiles land in the
 * local-only output/perf/ directory. There are no thresholds.
 */

import type { Page, CDPSession } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

// tests/integration/helpers/ -> repo root. Deliberately local (not imported
// from ./harness): harness.ts uses `import.meta`, which the unit-jest CJS
// runtime cannot load, and these helpers are unit-tested (051).
// Dual-runtime derivation: `__dirname` exists in jest's CJS transform; the
// Playwright loader has no `__dirname`, so fall back to the npm-script cwd
// (playwright test always runs from the repo root via package.json scripts).
const REPO_ROOT = path.resolve(
  typeof __dirname === 'string'
    ? __dirname
    : path.join(process.cwd(), 'tests', 'integration', 'helpers'),
  '..',
  '..',
  '..',
);

let metricsSession: CDPSession | null = null;
let profileSession: CDPSession | null = null;

async function getMetricsSession(page: Page): Promise<CDPSession> {
  if (metricsSession) return metricsSession;
  const session = await page.context().newCDPSession(page);
  await session.send('Performance.enable');
  metricsSession = session;
  return session;
}

/** Current JS heap in bytes (renderer process). */
export async function jsHeapUsed(page: Page): Promise<number> {
  const session = await getMetricsSession(page);
  const { metrics } = (await session.send('Performance.getMetrics')) as {
    metrics: { name: string; value: number }[];
  };
  const heap = metrics.find((m) => m.name === 'JSHeapUsedSize');
  return heap ? heap.value : 0;
}

export interface ScenarioResult {
  label: string;
  iterations: number;
  medianMs: number;
  p95Ms: number;
  minMs: number;
  heapBeforeBytes: number;
  heapAfterBytes: number;
  /** Present only on sections observed via `observeLongTasks` (additive). */
  longTasks?: LongTaskStats;
}

/** One buffered in-page `longtask` entry (Chromium: >50ms by spec). */
export interface LongTaskEntry {
  startTime: number;
  duration: number;
}

/** Aggregated long-task observation for a measured window (report-only). */
export interface LongTaskStats {
  count: number;
  maxMs: number;
  totalMs: number;
}

/**
 * Node-side summary of buffered long-task entries (single implementation,
 * unit-tested; the in-page collector returns raw entries only).
 */
export function summarizeLongTaskEntries(
  entries: LongTaskEntry[],
): LongTaskStats {
  let maxMs = 0;
  let totalMs = 0;
  for (const entry of entries) {
    if (entry.duration > maxMs) maxMs = entry.duration;
    totalMs += entry.duration;
  }
  return { count: entries.length, maxMs, totalMs };
}

/**
 * Install an in-page `PerformanceObserver` for `longtask` entries, buffering
 * `{startTime, duration}` until `stopAndCollectLongTasks` collects them.
 * Report-only: the plugin never learns about any of this.
 */
export async function startLongTaskObserver(page: Page): Promise<void> {
  await page.evaluate(() => {
    type Buffer = {
      entries: { startTime: number; duration: number }[];
      obs: PerformanceObserver | null;
    };
    const w = window as unknown as { __todoseqLT?: Buffer };
    const buffer: Buffer = { entries: [], obs: null };
    w.__todoseqLT = buffer;
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        buffer.entries.push({
          startTime: entry.startTime,
          duration: entry.duration,
        });
      }
    });
    observer.observe({ type: 'longtask', buffered: false });
    buffer.obs = observer;
  });
}

/**
 * Disconnect the observer, take the buffered entries, and clear the page
 * state. Returns `[]` when no observer was installed (idempotent stop).
 */
export async function stopAndCollectLongTasks(
  page: Page,
): Promise<LongTaskEntry[]> {
  return page.evaluate(() => {
    const w = window as unknown as {
      __todoseqLT?: {
        entries: { startTime: number; duration: number }[];
        obs: PerformanceObserver | null;
      };
    };
    const buffer = w.__todoseqLT;
    if (!buffer) return [];
    buffer.obs?.disconnect();
    w.__todoseqLT = undefined;
    return buffer.entries;
  });
}

/**
 * Time `action` from the Node side (real input events included): one
 * untimed warmup, then `iterations` timed runs; median/p95/min plus a
 * heap snapshot bracket.
 *
 * `afterEach`, when given, runs after every action — warmup and timed
 * alike — OUTSIDE the timer. Timer contract (plan 046 D1): a fixed sleep
 * must never sit inside `action`; cool-downs and cleanup belong here so
 * they are never billed as plugin work.
 *
 * `observeLongTasks` (051) wraps the whole window (warmup + timed loop)
 * in an in-page long-task observer and reports `longTasks` on the result.
 */
export async function measureScenario(
  page: Page,
  label: string,
  iterations: number,
  action: () => Promise<void>,
  afterEach?: () => Promise<void>,
  observeLongTasks = false,
): Promise<ScenarioResult> {
  if (observeLongTasks) await startLongTaskObserver(page);
  const heapBeforeBytes = await jsHeapUsed(page);

  await action();
  if (afterEach) await afterEach();

  const samples: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    await action();
    samples.push(performance.now() - start);
    if (afterEach) await afterEach();
  }

  const heapAfterBytes = await jsHeapUsed(page);
  const longTasks = observeLongTasks
    ? summarizeLongTaskEntries(await stopAndCollectLongTasks(page))
    : undefined;
  const sorted = [...samples].sort((a, b) => a - b);
  const p95 =
    sorted[Math.min(sorted.length - 1, Math.ceil(0.95 * sorted.length) - 1)];
  return {
    label,
    iterations,
    medianMs: sorted[Math.floor(sorted.length / 2)],
    p95Ms: p95,
    minMs: sorted[0],
    heapBeforeBytes,
    heapAfterBytes,
    ...(longTasks ? { longTasks } : {}),
  };
}

// ---------------------------------------------------------------------------
// Vault settle: wait on the plugin's real state instead of a fixed sleep.
// At size `l` (10k tasks) a fixed 2000ms settle races the seed scan +
// chunked render, so sections measure a partially-settled app (the scanner's
// in-progress guard makes rescan no-op; chunk mutations resolve the search
// wait early). The in-page primitives below are self-contained so
// Playwright can serialize them into the page; jsdom unit-tests the real
// logic (tests/perf-harness-settle.test.ts).

export interface ScanIdleOptions {
  /** Poll interval while waiting. */
  pollMs: number;
  /** Bound for "initial scan has completed at least once". */
  startTimeoutMs: number;
  /** Bound for "no scan currently running / initializing". */
  idleTimeoutMs: number;
}

export interface ScanIdleResult {
  /** Whether `isScanning()` was observed true at least once while polling. */
  sawBusy: boolean;
  scanIdleMs: number;
}

/**
 * In-page: wait until the vault scanner has completed its initial scan and
 * no scan is currently running (or Obsidian initializing). The
 * `hasCompletedInitialScan` flag closes the "polled before the scan
 * started" race without a start-poll. Throws on timeout or scanner-API
 * drift — a silent resolve would re-introduce exactly the invalid numbers
 * this exists to kill (fail loud).
 */
export async function scanIdlePage(
  opts: ScanIdleOptions,
): Promise<ScanIdleResult> {
  const started = performance.now();
  const w = window as unknown as {
    app?: {
      plugins?: {
        plugins?: {
          todoseq?: {
            vaultScanner?: {
              isScanning?: () => boolean;
              isObsidianInitializing?: () => boolean;
              hasCompletedInitialScan?: () => boolean;
            };
          };
        };
      };
    };
  };
  const scanner = w.app?.plugins?.plugins?.todoseq?.vaultScanner;
  if (
    !scanner ||
    typeof scanner.isScanning !== 'function' ||
    typeof scanner.isObsidianInitializing !== 'function' ||
    typeof scanner.hasCompletedInitialScan !== 'function'
  ) {
    throw new Error(
      'todoseq vaultScanner settle API missing ' +
        '(isScanning/isObsidianInitializing/hasCompletedInitialScan) — ' +
        'reconcile the perf harness with the live scanner API',
    );
  }

  let sawBusy = false;
  const startDeadline = performance.now() + opts.startTimeoutMs;
  while (!scanner.hasCompletedInitialScan()) {
    if (scanner.isScanning()) sawBusy = true;
    if (performance.now() > startDeadline) {
      throw new Error(
        `initial scan never completed within ${opts.startTimeoutMs}ms — ` +
          'the rescan dispatch did not produce a completed scan; ' +
          'refusing to measure a partially-settled app',
      );
    }
    await new Promise((resolve) => setTimeout(resolve, opts.pollMs));
  }

  const idleDeadline = performance.now() + opts.idleTimeoutMs;
  while (scanner.isScanning() || scanner.isObsidianInitializing()) {
    if (scanner.isScanning()) sawBusy = true;
    if (performance.now() > idleDeadline) {
      throw new Error(
        `vault scanner did not go idle within ${opts.idleTimeoutMs}ms ` +
          `(scanning=${scanner.isScanning()} ` +
          `initializing=${scanner.isObsidianInitializing()}) — ` +
          'settle would hang the perf run',
      );
    }
    await new Promise((resolve) => setTimeout(resolve, opts.pollMs));
  }

  return { sawBusy, scanIdleMs: performance.now() - started };
}

export interface ListQuiescentOptions {
  /** Required quiet window with no mutations on the list subtree. */
  quietMs: number;
  /** Bound for the list container to exist (panel render). */
  appearTimeoutMs: number;
  /** Overall bound; on expiry the settle is refused, never silently passed. */
  timeoutMs: number;
}

export interface ListQuiescentResult {
  settledMs: number;
  mutationsObserved: boolean;
}

/**
 * In-page: wait for `.todoseq-task-list` to exist, then for its subtree to
 * record no mutations for `quietMs` (chunked render / recurrence-delay
 * updates settle in this window). Throws when the list never appears or
 * never quiets — a background pipeline still mutating means measurements
 * would be invalid, and a hanging harness beats a wrong number.
 */
export async function listQuiescentPage(
  opts: ListQuiescentOptions,
): Promise<ListQuiescentResult> {
  const started = performance.now();
  const appearDeadline = performance.now() + opts.appearTimeoutMs;
  let target: Element | null = null;
  while (!(target = document.querySelector('.todoseq-task-list'))) {
    if (performance.now() > appearDeadline) {
      throw new Error(
        `.todoseq-task-list did not appear within ${opts.appearTimeoutMs}ms — ` +
          'panel not open or render not started',
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }

  return new Promise<ListQuiescentResult>((resolve, reject) => {
    let mutationsObserved = false;
    let quietTimer: ReturnType<typeof setTimeout> | null = null;

    function finish(): void {
      observer.disconnect();
      clearTimeout(overallTimer);
      if (quietTimer) clearTimeout(quietTimer);
      resolve({ settledMs: performance.now() - started, mutationsObserved });
    }

    const overallTimer = setTimeout(() => {
      observer.disconnect();
      if (quietTimer) clearTimeout(quietTimer);
      reject(
        new Error(
          `task list did not go quiet for ${opts.quietMs}ms within ` +
            `${opts.timeoutMs}ms — a background pipeline (scan/chunked ` +
            'render) is still mutating; refusing to measure a ' +
            'partially-settled app',
        ),
      );
    }, opts.timeoutMs);

    const observer = new MutationObserver(() => {
      mutationsObserved = true;
      if (quietTimer) clearTimeout(quietTimer);
      quietTimer = setTimeout(finish, opts.quietMs);
    });
    observer.observe(target, {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: true,
    });
    quietTimer = setTimeout(finish, opts.quietMs);
  });
}

/**
 * Node-side: settle the page on the scanner's real state (see
 * `scanIdlePage`). Defaults sized for the largest fixture tier.
 */
export async function waitForScanIdle(page: Page): Promise<ScanIdleResult> {
  return page.evaluate(scanIdlePage, {
    pollMs: 50,
    startTimeoutMs: 30_000,
    idleTimeoutMs: 120_000,
  });
}

/** Node-side: wait for the visible task list to stop mutating. */
export async function waitForListSettled(
  page: Page,
): Promise<ListQuiescentResult> {
  return page.evaluate(listQuiescentPage, {
    quietMs: 300,
    appearTimeoutMs: 30_000,
    timeoutMs: 60_000,
  });
}

export interface StateStableOptions {
  pollMs: number;
  /** The count must hold still this long before the settle counts as done. */
  stableForMs: number;
  timeoutMs: number;
}

export interface StateStableResult {
  finalCount: number;
  stableMs: number;
  /** Distinct count changes observed while waiting. */
  changes: number;
}

/**
 * In-page: wait until the task-state count stops changing. The scanner can
 * report idle while Obsidian is still registering freshly-seeded files
 * (the plugin's state then climbs across later rescans), so scanner-idle
 * alone settles nothing — sections would measure a half-populated vault.
 * Throws on timeout or API drift (fail loud, same contract as
 * `scanIdlePage`).
 */
export async function stateStablePage(
  opts: StateStableOptions,
): Promise<StateStableResult> {
  const started = performance.now();
  const w = window as unknown as {
    app?: {
      plugins?: {
        plugins?: {
          todoseq?: {
            vaultScanner?: {
              getTasks?: () => unknown[];
            };
          };
        };
      };
    };
  };
  const scanner = w.app?.plugins?.plugins?.todoseq?.vaultScanner;
  if (!scanner || typeof scanner.getTasks !== 'function') {
    throw new Error(
      'todoseq vaultScanner.getTasks missing — reconcile the perf ' +
        'harness with the live scanner API',
    );
  }

  let lastCount = -1;
  let lastChangeAt = performance.now();
  let changes = 0;
  for (;;) {
    const count = scanner.getTasks().length;
    if (count !== lastCount) {
      if (lastCount !== -1) changes += 1;
      lastCount = count;
      lastChangeAt = performance.now();
    }
    const now = performance.now();
    if (now - lastChangeAt >= opts.stableForMs) {
      return { finalCount: lastCount, stableMs: now - started, changes };
    }
    if (now - started > opts.timeoutMs) {
      throw new Error(
        `task state never stabilised for ${opts.stableForMs}ms within ` +
          `${opts.timeoutMs}ms (last count ${lastCount}) — the fixture ` +
          'is still being registered; refusing to measure a ' +
          'partially-settled app',
      );
    }
    await new Promise((resolve) => setTimeout(resolve, opts.pollMs));
  }
}

export interface ListMutationOptions {
  /**
   * Ignore mutations younger than this (the search debounce floor): a
   * first-mutation wait without a floor resolves on pre-debounce DOM
   * churn (focus-driven `draggable` flips on task items, ~9ms after each
   * fill) instead of the debounced refresh the metric is defined as.
   */
  minAgeMs: number;
  /** Safety cap; on expiry resolve with timedOut=true (never hang a run). */
  timeoutMs: number;
}

export interface ListMutationResult {
  /** Mutation age in ms, or -1 for the absent-list/timeout paths. */
  atMs: number;
  timedOut: boolean;
}

/**
 * In-page: resolve on the first mutation of `.todoseq-task-list` at least
 * `minAgeMs` old (or on the safety cap). Absent list resolves timedOut
 * immediately — same legacy shape the Node wrapper always had.
 */
export async function listMutationPage(
  opts: ListMutationOptions,
): Promise<ListMutationResult> {
  const started = performance.now();
  return new Promise<ListMutationResult>((resolve) => {
    const list = document.querySelector('.todoseq-task-list');
    if (!list) {
      resolve({ atMs: -1, timedOut: true });
      return;
    }
    let done = false;
    const finish = (result: ListMutationResult): void => {
      if (done) return;
      done = true;
      observer.disconnect();
      clearTimeout(cap);
      resolve(result);
    };
    const cap = setTimeout(
      () => finish({ atMs: -1, timedOut: true }),
      opts.timeoutMs,
    );
    const observer = new MutationObserver(() => {
      const age = performance.now() - started;
      if (age < opts.minAgeMs) return; // pre-floor churn — not the refresh
      finish({ atMs: age, timedOut: false });
    });
    observer.observe(list, {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: true,
    });
  });
}

/**
 * Node-side: wait for the task-state count to stop changing (Obsidian's
 * file registration + progressive state emission both continue after the
 * scanner reports idle).
 */
export async function waitForStateStable(
  page: Page,
): Promise<StateStableResult> {
  return page.evaluate(stateStablePage, {
    pollMs: 100,
    stableForMs: 750,
    timeoutMs: 60_000,
  });
}

/** Start a V8 sampling CPU profile; pair with stopCpuProfile(). */
export async function startCpuProfile(page: Page): Promise<void> {
  profileSession = await page.context().newCDPSession(page);
  await profileSession.send('Profiler.enable');
  await profileSession.send('Profiler.setSamplingInterval', {
    interval: 100, // 100µs — fine-grained enough for hot-function triage
  });
  await profileSession.send('Profiler.start');
}

/** Stop the profile and write output/perf/<label>.cpuprofile. Returns the path. */
export async function stopCpuProfile(
  page: Page,
  label: string,
): Promise<string> {
  if (!profileSession) {
    throw new Error('startCpuProfile() must run before stopCpuProfile()');
  }
  const { profile } = (await profileSession.send('Profiler.stop')) as {
    profile: unknown;
  };
  profileSession.detach();
  profileSession = null;

  const dir = path.join(REPO_ROOT, 'output', 'perf');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${label}.cpuprofile`);
  fs.writeFileSync(file, JSON.stringify(profile));
  return file;
}

/** Write the per-run metrics JSON next to the CPU profiles. */
export function writeMetrics(results: ScenarioResult[]): string {
  const dir = path.join(REPO_ROOT, 'output', 'perf');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'obsidian-metrics.json');
  fs.writeFileSync(
    file,
    JSON.stringify(
      {
        kind: 'obsidian-scenarios',
        recordedAt: new Date().toISOString(),
        results,
      },
      null,
      2,
    ) + '\n',
  );
  return file;
}

/**
 * Which scenario to CPU-profile this run (plan 046 D3):
 *   unset        → none
 *   =1           → `obsidian-view-mode-switches` (pre-existing default)
 *   =<label>     → that scenario's label (as passed to measureScenario)
 */
export function profileTargetFromEnv(): string | null {
  const raw = process.env.PERF_PROFILE;
  if (!raw) return null;
  return raw === '1' ? 'obsidian-view-mode-switches' : raw;
}

/**
 * Timer contract for `obsidian-search-input-latency` (plan 046 D1/D2):
 * resolves when the visible task list first mutates after an input change
 * — the debounced refresh reaching the DOM (the INP-analog "response
 * started", debounce dwell included because users wait through it too).
 * A 2s safety cap makes a hung refresh show up as a bad number rather
 * than hanging the suite.
 */
export async function waitForListMutation(
  page: Page,
  minAgeMs = 0,
): Promise<void> {
  await page.evaluate(listMutationPage, { minAgeMs, timeoutMs: 2000 });
}
