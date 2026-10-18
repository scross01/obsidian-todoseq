/**
 * Long-task observer helpers for the perf harness (in-page
 * PerformanceObserver for `longtask` entries, summarized on the Node side).
 *
 * Report-only guard: no thresholds, no assertions on observed counts —
 * these tests pin the OBSERVER mechanics (buffer install/collect round
 * trip, summary arithmetic, and the optional flag on measureScenario),
 * not what the plugin does.
 */

import {
  ScenarioResult,
  measureScenario,
  summarizeLongTaskEntries,
} from '../tests/integration/helpers/profile';

interface FakePerformanceObserver {
  cb: (list: {
    getEntries: () => { startTime: number; duration: number }[];
  }) => void;
  observe: (opts: unknown) => void;
  disconnect: () => void;
  observed: boolean;
  disconnected: boolean;
}

let observerInstances: FakePerformanceObserver[] = [];
let originalPerformanceObserver: unknown;
let originalWindow: unknown;

/** Push long-task entries through the pending observer callbacks. */
function fire(entries: { startTime: number; duration: number }[]): void {
  for (const instance of observerInstances) {
    if (instance.observed && !instance.disconnected) {
      instance.cb({ getEntries: () => entries });
    }
  }
}

/** Minimal page double: CDP heap metrics + evaluate that runs in-process. */
function createFakePage(): {
  context: () => { newCDPSession: () => Promise<unknown> };
  evaluate: (fn: () => unknown) => Promise<unknown>;
} {
  const session = {
    send: jest.fn(async (msg: string) =>
      msg === 'Performance.getMetrics'
        ? { metrics: [{ name: 'JSHeapUsedSize', value: 1024 }] }
        : {},
    ),
    detach: () => undefined,
  };
  return {
    context: () => ({ newCDPSession: async () => session }),
    evaluate: async (fn: () => unknown) => fn(),
  };
}

beforeEach(() => {
  observerInstances = [];
  originalPerformanceObserver = (globalThis as Record<string, unknown>)
    .PerformanceObserver;
  originalWindow = (globalThis as Record<string, unknown>).window;
  (globalThis as Record<string, unknown>).window = globalThis;
  (globalThis as Record<string, unknown>).PerformanceObserver = class {
    cb: FakePerformanceObserver['cb'];
    constructor(cb: FakePerformanceObserver['cb']) {
      this.cb = cb;
      observerInstances.push({
        cb,
        observe: () => undefined,
        disconnect: () => undefined,
        observed: false,
        disconnected: false,
      });
    }
    observe(opts: unknown): void {
      const last = observerInstances[observerInstances.length - 1];
      last.observed = true;
      expect(opts).toEqual({ type: 'longtask', buffered: false });
    }
    disconnect(): void {
      const last = observerInstances[observerInstances.length - 1];
      last.disconnected = true;
    }
  };
});

afterEach(() => {
  (globalThis as Record<string, unknown>).PerformanceObserver =
    originalPerformanceObserver;
  (globalThis as Record<string, unknown>).window = originalWindow;
});

describe('summarizeLongTaskEntries', () => {
  it('returns zeroed stats for no entries', () => {
    expect(summarizeLongTaskEntries([])).toEqual({
      count: 0,
      maxMs: 0,
      totalMs: 0,
    });
  });

  it('sums durations and tracks the max', () => {
    expect(
      summarizeLongTaskEntries([
        { startTime: 0, duration: 55 },
        { startTime: 60, duration: 120.5 },
        { startTime: 190, duration: 61 },
      ]),
    ).toEqual({ count: 3, maxMs: 120.5, totalMs: 236.5 });
  });
});

describe('measureScenario long-task observation', () => {
  it('reports longTasks on the result only when the flag is set', async () => {
    const page = createFakePage() as never;
    const fireOnce = async () => {
      fire([
        { startTime: 0, duration: 55 },
        { startTime: 60, duration: 70 },
      ]);
    };

    const observed = await measureScenario(
      page,
      'observed-scenario',
      3,
      fireOnce,
      undefined,
      true,
    );
    // warmup (1) + timed iterations (3) each fire two entries
    expect(observed.longTasks).toEqual({
      count: 8,
      maxMs: 70,
      totalMs: 8 * 62.5,
    });

    observerInstances = [];
    const unobserved = await measureScenario(
      page,
      'unobserved-scenario',
      3,
      async () => undefined,
    );
    expect(unobserved.longTasks).toBeUndefined();
    expect(observerInstances).toHaveLength(0);
  });

  it('collector disconnects the observer and empties the page buffer', async () => {
    const page = createFakePage() as never;
    const result: ScenarioResult = await measureScenario(
      page,
      'collector-scenario',
      1,
      async () => fire([{ startTime: 0, duration: 80 }]),
      undefined,
      true,
    );
    expect(result.longTasks).toEqual({
      count: 2, // warmup + one timed iteration
      maxMs: 80,
      totalMs: 160,
    });
    expect(observerInstances[0].disconnected).toBe(true);
    // A second collect finds no buffer (collector empties the page state).
    const second = await (async () => {
      const mod = await import('../tests/integration/helpers/profile');
      return mod.stopAndCollectLongTasks(page);
    })();
    expect(second).toEqual([]);
  });
});
