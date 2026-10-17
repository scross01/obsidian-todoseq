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

import { Page, CDPSession } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import { REPO_ROOT } from './harness';

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
 */
export async function measureScenario(
  page: Page,
  label: string,
  iterations: number,
  action: () => Promise<void>,
  afterEach?: () => Promise<void>,
): Promise<ScenarioResult> {
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
  };
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
export async function waitForListMutation(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        const list = document.querySelector('.todoseq-task-list');
        if (!list) {
          resolve();
          return;
        }
        const observer = new MutationObserver(() => {
          observer.disconnect();
          resolve();
        });
        observer.observe(list, {
          childList: true,
          subtree: true,
          attributes: true,
          characterData: true,
        });
        setTimeout(() => {
          observer.disconnect();
          resolve();
        }, 2000);
      }),
  );
}
