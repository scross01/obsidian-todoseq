/**
 * Yield to the event loop so long-running batches do not block the UI.
 *
 * Uses a MessageChannel message task rather than requestAnimationFrame:
 * animation frames are not delivered for a hidden document, so a scan that
 * yields in a background tab would stall until the window is visible again.
 * Falls back to setTimeout(resolve, 0) where MessageChannel is unavailable.
 */
export function yieldToEventLoop(): Promise<void> {
  return new Promise<void>((resolve) => {
    if (typeof MessageChannel !== 'undefined') {
      const channel = new MessageChannel();
      channel.port1.onmessage = () => {
        // Release the ports: an unclosed channel keeps its handles alive
        // (one per scan batch would otherwise accumulate).
        channel.port1.close();
        channel.port2.close();
        resolve();
      };
      channel.port2.postMessage(null);
    } else {
      window.setTimeout(resolve, 0);
    }
  });
}
