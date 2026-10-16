/**
 * Tests for the background-safe event-loop yield helper.
 *
 * The regression these guard: the previous implementation awaited a
 * `requestAnimationFrame` callback, which is never delivered for a hidden
 * document — a scan yielding in a background tab stalled until the window
 * became visible again. The rAF spy installed below never invokes its
 * callback, modelling a hidden document directly (Jest's own mock window
 * falls back to timers, which is why the bug was invisible in tests).
 */

import { yieldToEventLoop } from '../src/utils/event-loop';

const HANG_GUARD_MS = 1000;

const globalScope = globalThis as unknown as Record<string, unknown>;

/**
 * Await a promise but report false if it has not settled within the guard.
 * The guard uses a real timer: a yield that never resolves (the old rAF
 * behaviour with a never-firing frame) must fail rather than hang the suite.
 */
async function resolvesWithinGuard(promise: Promise<void>): Promise<boolean> {
  let timerId: ReturnType<typeof setTimeout> | undefined;
  const guard = new Promise<'timeout'>((resolve) => {
    timerId = setTimeout(() => resolve('timeout'), HANG_GUARD_MS);
  });
  try {
    const outcome = await Promise.race([
      promise.then(() => 'resolved' as const),
      guard,
    ]);
    return outcome === 'resolved';
  } finally {
    if (timerId !== undefined) {
      clearTimeout(timerId);
    }
  }
}

describe('yieldToEventLoop', () => {
  const originalMessageChannel = globalScope.MessageChannel;
  const hadGlobalRaf = 'requestAnimationFrame' in globalThis;
  const originalGlobalRaf = globalScope.requestAnimationFrame;
  const mockWindow = globalScope.window as
    { requestAnimationFrame?: unknown } | undefined;
  const originalWindowRaf = mockWindow?.requestAnimationFrame;

  let rafSpy: jest.Mock;

  beforeEach(() => {
    // A rAF that never fires its callback — exactly what a hidden document does.
    rafSpy = jest.fn(() => 0);
    globalScope.requestAnimationFrame = rafSpy;
    if (mockWindow) {
      mockWindow.requestAnimationFrame = rafSpy;
    }
  });

  afterEach(() => {
    if (originalMessageChannel === undefined) {
      delete globalScope.MessageChannel;
    } else {
      globalScope.MessageChannel = originalMessageChannel;
    }
    if (hadGlobalRaf) {
      globalScope.requestAnimationFrame = originalGlobalRaf;
    } else {
      delete globalScope.requestAnimationFrame;
    }
    if (mockWindow) {
      mockWindow.requestAnimationFrame = originalWindowRaf;
    }
  });

  it('resolves without ever calling requestAnimationFrame', async () => {
    const resolved = await resolvesWithinGuard(yieldToEventLoop());

    expect(resolved).toBe(true);
    // Regression assertion: the old implementation went through rAF and would
    // both call this spy and hang (the spy never fires its callback).
    expect(rafSpy).not.toHaveBeenCalled();
  });

  it('resolves via the setTimeout fallback when MessageChannel is unavailable', async () => {
    globalScope.MessageChannel = undefined;

    const resolved = await resolvesWithinGuard(yieldToEventLoop());

    expect(resolved).toBe(true);
  });

  it('resolves 50 sequential yields', async () => {
    for (let i = 0; i < 50; i++) {
      const resolved = await resolvesWithinGuard(yieldToEventLoop());
      expect(resolved).toBe(true);
    }
  });
});
