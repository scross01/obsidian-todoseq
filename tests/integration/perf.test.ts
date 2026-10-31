/**
 * In-Obsidian profiling scenarios — report-only.
 *
 * Gated on PERF=1 so the regular integration suite never pays for them.
 *
 *   npm run perf:obsidian                    # scenario medians + metrics JSON
 *   PERF_PROFILE=1 npm run perf:obsidian     # + .cpuprofile for view-modes (default target)
 *   PERF_PROFILE=obsidian-archive-dialog-open npm run perf:obsidian  # that scenario instead
 *   PERF_SIZE=l PERF_ITERATIONS=10 npm run perf:obsidian
 *
 * The fixture vault is seeded from the SAME generator the node benches use
 * (fixed seed + fixed date), so both tiers profile identical content.
 * Artifacts land in the local-only output/perf/ directory. There are no
 * thresholds — numbers are signals for humans, never a gate.
 */

import { test } from '@playwright/test';
import { Page } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import { getPage } from './helpers/session';
import { TEST_VAULT_DIR, REPO_ROOT } from './helpers/harness';
import { openTodoseqPanel, waitForTaskListVisible } from './helpers/assertions';
import { openFileInEditor } from './helpers/editor-utils';
import {
  measureScenario,
  startCpuProfile,
  stopCpuProfile,
  writeMetrics,
  profileTargetFromEnv,
  waitForListMutation,
  waitForScanIdle,
  waitForListSettled,
  waitForStateStable,
  ScenarioResult,
} from './helpers/profile';
import {
  generateVault,
  PerfSize,
  PERF_SIZES,
  DEFAULT_SEED,
  FIXED_TODAY,
} from '../../scripts/perf/generate-fixture';

const PERF = process.env.PERF === '1';
const SIZE = (
  PERF_SIZES.includes(process.env.PERF_SIZE as PerfSize)
    ? process.env.PERF_SIZE
    : 'm'
) as PerfSize;
const ITER = Number(process.env.PERF_ITERATIONS ?? 5);
// Mirrors SEARCH_REFRESH_DEBOUNCE_MS in src/view/task-list/task-list-view.ts
// — the search wait resolves on the DEBOUNCED refresh reaching the DOM,
// never on pre-debounce DOM churn (focus-driven `draggable` flips on task
// items land ~9ms after each fill and would otherwise win the wait).
const SEARCH_DEBOUNCE_MS = 250;
const PROFILE_TARGET = profileTargetFromEnv();

const FIXTURE_DIR = path.join(TEST_VAULT_DIR, 'perf-fixture');

let page: Page;
const results: ScenarioResult[] = [];

/**
 * CPU-profile exactly one scenario per run, when its label is the
 * selected target (plan 046 D3). No-ops otherwise; sections are wrapped
 * uniformly so the target can be any label.
 */
async function maybeStartProfile(label: string): Promise<void> {
  if (PROFILE_TARGET === label) await startCpuProfile(page);
}

async function maybeStopProfile(label: string): Promise<void> {
  if (PROFILE_TARGET !== label) return;
  const file = await stopCpuProfile(page, label);
  process.stdout.write(`[perf] cpu profile: ${file}\n`);
}

function report(label: string, result: ScenarioResult): void {
  results.push(result);
  const longTasks = result.longTasks
    ? ` longTasks {count:${result.longTasks.count} max:${result.longTasks.maxMs.toFixed(1)}ms total:${result.longTasks.totalMs.toFixed(1)}ms}`
    : '';
  process.stdout.write(
    `\n[perf] ${label}: median ${result.medianMs.toFixed(1)}ms ` +
      `p95 ${result.p95Ms.toFixed(1)}ms min ${result.minMs.toFixed(1)}ms ` +
      `(${result.iterations} iters) heap ${(
        result.heapBeforeBytes /
        1024 /
        1024
      ).toFixed(
        1,
      )}MB -> ${(result.heapAfterBytes / 1024 / 1024).toFixed(1)}MB` +
      `${longTasks}\n`,
  );
}

test.describe('performance profiling (report-only)', () => {
  test.skip(!PERF, 'set PERF=1 to run profiling scenarios (never in CI)');

  test('profiles the critical paths', async () => {
    page = await getPage();

    // ---- Seed the fixture vault from the shared generator ----------------
    const vault = generateVault(SIZE, DEFAULT_SEED, FIXED_TODAY);
    fs.rmSync(FIXTURE_DIR, { recursive: true, force: true });
    for (const file of vault.files) {
      const dest = path.join(FIXTURE_DIR, file.path);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, file.content);
    }
    await page.evaluate(async () => {
      const app = (window as unknown as { app: any }).app;
      await app.commands.executeCommandById('todoseq:rescan-vault');
    });
    // Settle on the plugin's real state, never a fixed sleep: at size `l`
    // a 2000ms sleep races the seed scan + chunked render, so sections
    // measured a partially-settled app (the scanner's in-progress guard
    // makes rescan no-op; chunk mutations resolve the search wait early).
    const scanSettle = await waitForScanIdle(page);
    process.stdout.write(
      `[perf] settle: scan idle after ${scanSettle.scanIdleMs.toFixed(0)}ms ` +
        `(saw busy: ${scanSettle.sawBusy})\n`,
    );
    // Scanner-idle is not enough: Obsidian keeps registering freshly-seeded
    // files after it, so the task-state count climbs across later rescans
    // (sections would otherwise measure a half-populated vault).
    const stateSettle = await waitForStateStable(page);
    process.stdout.write(
      `[perf] settle: state stable at ${stateSettle.finalCount} tasks ` +
        `after ${stateSettle.stableMs.toFixed(0)}ms ` +
        `(${stateSettle.changes} changes)\n`,
    );

    await openTodoseqPanel(page);
    await waitForTaskListVisible(page);

    const listSettle = await waitForListSettled(page);
    process.stdout.write(
      `[perf] settle: list quiet after ${listSettle.settledMs.toFixed(0)}ms ` +
        `(mutations: ${listSettle.mutationsObserved})\n`,
    );

    // ---- 1. Full vault rescan -------------------------------------------
    await maybeStartProfile('obsidian-rescan');
    const rescan = await measureScenario(
      page,
      'obsidian-rescan',
      ITER,
      async () => {
        await page.evaluate(async () => {
          const app = (window as unknown as { app: any }).app;
          // Await the scan itself: the rescan command only dispatches it,
          // so timing the command would measure dispatch, not the scan.
          await app.plugins.plugins.todoseq.vaultScanner.scanVault();
        });
      },
      undefined,
      true, // long-task observation (yield/chunk design check)
    );
    report('full rescan', rescan);
    await maybeStopProfile('obsidian-rescan');

    // ---- 2. View-mode switches (the real dropdown path: set + refresh) --
    await maybeStartProfile('obsidian-view-mode-switches');
    const modes = [
      'showAll',
      'sortCompletedLast',
      'hideCompleted',
      'showAll',
      'sortCompletedLast',
      'hideCompleted',
      'showAll',
      'sortCompletedLast',
      'hideCompleted',
      'showAll',
      'sortCompletedLast',
      'hideCompleted',
    ];
    const viewModes = await measureScenario(
      page,
      'obsidian-view-mode-switches',
      ITER,
      async () => {
        await page.evaluate(async (cycle) => {
          const app = (window as unknown as { app: any }).app;
          const leaf = app.workspace.getLeavesOfType('todoseq-view')[0];
          const view = leaf.view as {
            setViewMode(mode: string): void;
            refreshVisibleList(preserveScroll: boolean): Promise<void>;
          };
          for (const mode of cycle) {
            view.setViewMode(mode);
            await view.refreshVisibleList(false);
          }
        }, modes);
      },
      undefined,
      true, // long-task observation (full-list refresh design check)
    );
    await maybeStopProfile('obsidian-view-mode-switches');
    report('12 view-mode switches (per iteration)', viewModes);

    // ---- 3. Search input latency ----------------------------------------
    // Timer contract (plan 046 D1/D2): fill dispatch → the visible task
    // list first mutates (debounced refresh reaching the DOM). Debounce
    // dwell is included on purpose — users wait through it too. No fixed
    // sleeps inside the timer.
    await maybeStartProfile('obsidian-search-input-latency');
    const search = await measureScenario(
      page,
      'obsidian-search-input-latency',
      ITER,
      async () => {
        const input = page.locator('input[aria-label="Search tasks"]');
        for (const query of ['refactor', 'archive', 'the scanner', 'TODO']) {
          await input.fill(query);
          await waitForListMutation(page, SEARCH_DEBOUNCE_MS);
        }
        await input.fill('');
        await waitForListMutation(page, SEARCH_DEBOUNCE_MS);
      },
      undefined,
      true, // long-task observation (per-keystroke refresh stall check)
    );
    await maybeStopProfile('obsidian-search-input-latency');
    report('search input latency (4 queries, per iteration)', search);

    // ---- 4. Dashboard render --------------------------------------------
    await page.evaluate(async () => {
      const app = (window as unknown as { app: any }).app;
      const content =
        '# Perf dashboard\n\n' +
        '```todoseq-dashboard\ngroup-by: state\ntitle: Perf\n```\n';
      const existing = app.vault.getAbstractFileByPath('perf-dashboard.md');
      if (existing) {
        await app.vault.modify(existing, content);
      } else {
        await app.vault.create('perf-dashboard.md', content);
      }
    });
    await maybeStartProfile('obsidian-dashboard-render');
    const dashboard = await measureScenario(
      page,
      'obsidian-dashboard-render',
      ITER,
      async () => {
        await page.evaluate(async () => {
          const app = (window as unknown as { app: any }).app;
          const dash = app.vault.getAbstractFileByPath('perf-dashboard.md');
          // Leave the dashboard note first, otherwise a re-open is a no-op
          // and the wait below resolves against the STALE container.
          //
          // Navigate to a MARKDOWN fixture note — NEVER a raw source
          // fixture (.ts/.org). The plugin only scans source files, so
          // opening one here is not the feature under test, and the OS
          // would hand it to whatever app claims its extension (`.ts` →
          // a media player), popping unrelated apps mid-run.
          const other = app.vault.getAbstractFileByPath(
            'perf-fixture/notes/note-0000.md',
          );
          // Reuse the current leaf (getLeaf(false)): a background tab
          // renders its container hidden, which would time out any
          // visibility wait.
          const leaf = app.workspace.getLeaf(false);
          if (other) await leaf.openFile(other);
          await leaf.openFile(dash);
        });
        // Wait on OUR dashboard card (title disambiguates from any other
        // open dashboard); the active-leaf class is unreliable on new tabs.
        await page
          .locator('.todoseq-dashboard-container', { hasText: 'Perf' })
          .first()
          .waitFor({ state: 'visible' });
      },
    );
    report('dashboard open + render', dashboard);
    await maybeStopProfile('obsidian-dashboard-render');

    // ---- 5. Editor edit cycle (smart-date + decorations) -----------------
    await page.evaluate(async () => {
      const app = (window as unknown as { app: any }).app;
      const existing = app.vault.getAbstractFileByPath('perf-note.md');
      if (existing) {
        await app.vault.modify(existing, 'Notes\n\n');
      } else {
        await app.vault.create('perf-note.md', 'Notes\n\n');
      }
    });
    await openFileInEditor(page, 'perf-note');
    await maybeStartProfile('obsidian-editor-edit-cycle');
    const editor = await measureScenario(
      page,
      'obsidian-editor-edit-cycle',
      ITER,
      async () => {
        await page.evaluate(() => {
          const app = (window as unknown as { app: any }).app;
          const ed = app.workspace.activeLeaf.view.editor as {
            lastLine(): number;
            getLine(n: number): string;
            replaceRange(
              text: string,
              from: { line: number; ch: number },
              to?: { line: number; ch: number },
            ): void;
          };
          const line = ed.lastLine();
          const ch = ed.getLine(line).length;
          const text = '- TODO review tomorrow at 9am\n';
          ed.replaceRange(text, { line, ch });
          ed.replaceRange(
            '',
            { line: line + 1, ch: 0 },
            { line: line + 2, ch: 0 },
          );
        });
      },
    );
    report('editor insert + delete cycle', editor);
    await maybeStopProfile('obsidian-editor-edit-cycle');

    // ---- 6. Archive dialog open -----------------------------------------
    // Timer contract (plan 046 D1): dispatch → modal visible (condition).
    // The close + 150ms cooldown runs untimed via afterEach — it was
    // previously billed as plugin work (the old headline's artifact).
    await maybeStartProfile('obsidian-archive-dialog-open');
    const dialog = await measureScenario(
      page,
      'obsidian-archive-dialog-open',
      ITER,
      async () => {
        await page.evaluate(async () => {
          const app = (window as unknown as { app: any }).app;
          await app.commands.executeCommandById(
            'todoseq:archive-completed-tasks',
          );
        });
        await page.waitForSelector('.todoseq-archive-modal', {
          state: 'visible',
        });
      },
      async () => {
        // Untimed: close via the modal's own close control — no keyboard (AGENTS).
        await page.evaluate(() => {
          document
            .querySelector('.todoseq-archive-modal')
            ?.querySelector('.todoseq-archive-close')
            ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });
        // B2 finding: a fixed 150ms alone let the next timed open race the
        // previous modal's fade-out (waitForSelector resolving against the
        // dying modal produced bogus ~7ms samples). Wait for full detach
        // *then* cool down — both untimed, so neither is billed.
        await page.waitForSelector('.todoseq-archive-modal', {
          state: 'detached',
        });
        await page.waitForTimeout(150);
      },
    );
    await maybeStopProfile('obsidian-archive-dialog-open');
    report('archive dialog open', dialog);

    // ---- Artifact --------------------------------------------------------
    const artifact = writeMetrics(results);
    process.stdout.write(
      `\n[perf] size=${SIZE} metrics: ${path.relative(REPO_ROOT, artifact)}\n` +
        '[perf] report-only: no thresholds, no CI gate.\n',
    );
  });
});
