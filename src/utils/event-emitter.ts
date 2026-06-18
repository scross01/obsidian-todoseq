/**
 * Typed Event Emitter helper.
 *
 * Provides the typed pub/sub pattern previously inlined in `VaultScanner` and
 * `EventCoordinator`. Generic `T` shapes the listener signature for each event
 * key, so `T[K]` is the callback type and `Parameters<T[K]>` is the emit-args
 * tuple — same end-to-end typing the original classes had.
 *
 * Visibility rules:
 * - `on` / `off` / `removeAllListeners` are public (call sites subscribe directly).
 * - `emit` is `protected` — subclasses may call from their own methods, but
 *   external callers must subscribe to events, not fire them. VaultScanner
 *   widens `emit` to public via a one-line override because its tests fire
 *   events directly; EventCoordinator keeps it protected.
 *
 * Listener storage is lazy: the inner map gets populated on the first `on`
 * call for a given key, instead of pre-seeding empty arrays in the constructor.
 */
export class EventEmitter<
  T extends Record<keyof T, (...args: unknown[]) => void>,
> {
  private eventListeners = new Map<
    keyof T,
    Array<(...args: unknown[]) => void>
  >();

  constructor(private readonly emitterName: string) {}

  on<K extends keyof T>(event: K, listener: T[K]): void {
    const listeners = this.eventListeners.get(event) ?? [];
    listeners.push(listener);
    this.eventListeners.set(event, listeners);
  }

  off<K extends keyof T>(event: K, listener: T[K]): void {
    const listeners = this.eventListeners.get(event) ?? [];
    const filteredListeners = listeners.filter((l) => l !== listener);
    this.eventListeners.set(event, filteredListeners);
  }

  protected emit<K extends keyof T>(
    event: K,
    ...args: Parameters<T[K]>
  ): void {
    const listeners = this.eventListeners.get(event) ?? [];
    listeners.forEach((listener) => {
      try {
        listener(...args);
      } catch (error) {
        console.error(
          `Error in ${this.emitterName} event listener for ${String(event)}:`,
          error,
        );
      }
    });
  }

  removeAllListeners(): void {
    this.eventListeners.clear();
  }
}
