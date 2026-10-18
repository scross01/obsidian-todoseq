/**
 * @jest-environment jsdom
 *
 * Unit tests for the perf-harness settle primitives.
 *
 * These run inside the page under Playwright (self-contained functions,
 * serialized by the harness), but they only need a DOM + window globals —
 * so jsdom exercises the real polling/quiescence logic without any
 * mocking: the scanner state is a plain object on window.app, and
 * mutations are real DOM operations observed by jsdom's MutationObserver.
 */
import {
  scanIdlePage,
  listQuiescentPage,
  stateStablePage,
  listMutationPage,
} from './integration/helpers/profile';

type ScannerApi = {
  isScanning: () => boolean;
  isObsidianInitializing: () => boolean;
  hasCompletedInitialScan: () => boolean;
  getTasks: () => unknown[];
};

function installScanner(scanner: Partial<ScannerApi>): void {
  (window as unknown as { app: unknown }).app = {
    plugins: {
      plugins: {
        todoseq: { vaultScanner: scanner },
      },
    },
  };
}

const FULL_SCANNER: ScannerApi = {
  isScanning: () => false,
  isObsidianInitializing: () => false,
  hasCompletedInitialScan: () => true,
  getTasks: () => [],
};

function makeList(): HTMLElement {
  const list = document.createElement('div');
  list.className = 'todoseq-task-list';
  document.body.appendChild(list);
  return list;
}

beforeEach(() => {
  document.body.innerHTML = '';
  delete (window as unknown as { app?: unknown }).app;
});

describe('scanIdlePage', () => {
  it('waits until an in-flight scan finishes before resolving', async () => {
    let scanning = true;
    let initialDone = false;
    installScanner({
      isScanning: () => scanning,
      isObsidianInitializing: () => false,
      hasCompletedInitialScan: () => initialDone,
    });
    setTimeout(() => {
      scanning = false;
      initialDone = true;
    }, 80);

    const start = performance.now();
    const res = await scanIdlePage({
      pollMs: 10,
      startTimeoutMs: 2_000,
      idleTimeoutMs: 5_000,
    });
    const elapsed = performance.now() - start;

    expect(res.sawBusy).toBe(true);
    expect(res.scanIdleMs).toBeGreaterThanOrEqual(60);
    expect(elapsed).toBeGreaterThanOrEqual(70);
  });

  it('rejects with an informative message when the scanner never goes idle', async () => {
    installScanner({
      ...FULL_SCANNER,
      isScanning: () => true,
    });

    await expect(
      scanIdlePage({ pollMs: 10, startTimeoutMs: 200, idleTimeoutMs: 150 }),
    ).rejects.toThrow(/still scanning|did not go idle/);
  });

  it('rejects when the initial scan has never completed (start race)', async () => {
    installScanner({
      ...FULL_SCANNER,
      hasCompletedInitialScan: () => false,
    });

    await expect(
      scanIdlePage({ pollMs: 10, startTimeoutMs: 150, idleTimeoutMs: 150 }),
    ).rejects.toThrow(/initial scan/);
  });

  it('rejects when the scanner API is missing (fail loud on drift)', async () => {
    installScanner({});

    await expect(
      scanIdlePage({ pollMs: 10, startTimeoutMs: 50, idleTimeoutMs: 50 }),
    ).rejects.toThrow(/vaultScanner/);
  });
});

describe('listQuiescentPage', () => {
  it('waits out a mutation burst, then resolves after the quiet window', async () => {
    const list = makeList();
    let burst = 0;
    const interval = setInterval(() => {
      const row = document.createElement('div');
      row.textContent = `row ${burst++}`;
      list.appendChild(row);
      if (burst >= 5) clearInterval(interval);
    }, 20);

    const res = await listQuiescentPage({
      quietMs: 60,
      appearTimeoutMs: 1_000,
      timeoutMs: 5_000,
    });
    clearInterval(interval);

    expect(res.mutationsObserved).toBe(true);
    // Burst ends ~100ms in; resolution must come at least quietMs after
    // the LAST mutation, never before the burst finished.
    expect(res.settledMs).toBeGreaterThanOrEqual(100);
  });

  it('rejects when the list never goes quiet (timeout cap)', async () => {
    const list = makeList();
    const interval = setInterval(() => {
      list.appendChild(document.createElement('div'));
    }, 15);

    await expect(
      listQuiescentPage({
        quietMs: 80,
        appearTimeoutMs: 500,
        timeoutMs: 250,
      }),
    ).rejects.toThrow(/did not go quiet/);
    clearInterval(interval);
  });

  it('rejects when the task list never appears', async () => {
    await expect(
      listQuiescentPage({
        quietMs: 50,
        appearTimeoutMs: 120,
        timeoutMs: 500,
      }),
    ).rejects.toThrow(/todoseq-task-list/);
  });

  it('resolves quickly with mutationsObserved=false when already settled', async () => {
    makeList();

    const start = performance.now();
    const res = await listQuiescentPage({
      quietMs: 50,
      appearTimeoutMs: 1_000,
      timeoutMs: 5_000,
    });

    expect(res.mutationsObserved).toBe(false);
    expect(res.settledMs).toBeGreaterThanOrEqual(45);
    expect(performance.now() - start).toBeLessThan(1_000);
  });
});

describe('stateStablePage', () => {
  it('resolves only after the task count holds still for the quiet window', async () => {
    let count = 400;
    installScanner({
      ...FULL_SCANNER,
      getTasks: () => Array.from({ length: count }),
    });
    const interval = setInterval(() => {
      count += 50;
      if (count >= 900) clearInterval(interval);
    }, 40);

    const res = await stateStablePage({
      pollMs: 10,
      stableForMs: 120,
      timeoutMs: 5_000,
    });
    clearInterval(interval);

    expect(res.finalCount).toBe(900);
    expect(res.changes).toBeGreaterThan(0);
    expect(res.stableMs).toBeGreaterThanOrEqual(100);
  });

  it('resolves immediately (after the quiet window) on a stable count', async () => {
    installScanner({ ...FULL_SCANNER, getTasks: () => [{}, {}, {}] });

    const res = await stateStablePage({
      pollMs: 10,
      stableForMs: 80,
      timeoutMs: 2_000,
    });

    expect(res.finalCount).toBe(3);
    expect(res.changes).toBe(0);
  });

  it('rejects when the count never stabilizes within the timeout', async () => {
    let count = 0;
    installScanner({
      ...FULL_SCANNER,
      getTasks: () => {
        count += 10;
        return Array.from({ length: count });
      },
    });

    await expect(
      stateStablePage({ pollMs: 15, stableForMs: 200, timeoutMs: 300 }),
    ).rejects.toThrow(/never stabilised/);
  });

  it('rejects when the scanner API is missing (fail loud on drift)', async () => {
    installScanner({});

    await expect(
      stateStablePage({ pollMs: 10, stableForMs: 50, timeoutMs: 200 }),
    ).rejects.toThrow(/getTasks/);
  });
});

describe('listMutationPage', () => {
  it('ignores pre-floor churn and resolves on the first post-floor mutation', async () => {
    const list = makeList();
    setTimeout(() => list.appendChild(document.createElement('div')), 30);
    setTimeout(() => list.appendChild(document.createElement('div')), 90);

    const res = await listMutationPage({ minAgeMs: 60, timeoutMs: 3_000 });

    expect(res.timedOut).toBe(false);
    expect(res.atMs).toBeGreaterThanOrEqual(55);
  });

  it('resolves with timedOut=true when no mutation arrives before the cap', async () => {
    makeList();

    const res = await listMutationPage({ minAgeMs: 0, timeoutMs: 120 });

    expect(res.timedOut).toBe(true);
  });

  it('resolves on the first mutation when minAgeMs is 0 (legacy shape)', async () => {
    const list = makeList();
    setTimeout(() => list.appendChild(document.createElement('div')), 20);

    const res = await listMutationPage({ minAgeMs: 0, timeoutMs: 2_000 });

    expect(res.timedOut).toBe(false);
    expect(res.atMs).toBeGreaterThanOrEqual(15);
  });

  it('resolves timedOut immediately when the list is absent', async () => {
    const res = await listMutationPage({ minAgeMs: 0, timeoutMs: 2_000 });

    expect(res.timedOut).toBe(true);
    expect(res.atMs).toBe(-1);
  });
});
