// Test setup file for Jest
import { LanguageRegistry } from '../src/parser/language-registry';

// Create a global registry instance for all tests
const registry = new LanguageRegistry();

// Export test utilities
export { registry };

// Mock console methods to reduce noise during tests
// Use jest.Mock to allow tests to spy on console calls when needed
const createSilentMock = () => jest.fn();

global.console = {
  ...console,
  log: createSilentMock(),
  debug: createSilentMock(),
  info: createSilentMock(),
  warn: createSilentMock(),
  error: console.error, // Keep error to surface real issues
};

// Polyfill DragEvent for jsdom environments
if (
  typeof globalThis.window !== 'undefined' &&
  typeof (globalThis.window as any).DragEvent === 'undefined'
) {
  class DragEventPolyfill extends MouseEvent {
    dataTransfer: DataTransfer | null = null;
    constructor(type: string, init: any = {}) {
      super(type, init);
      this.dataTransfer = init.dataTransfer ?? null;
    }
  }
  (globalThis as any).DragEvent = DragEventPolyfill;
}

// Mock window and activeWindow for popout window compatibility (timers)
// Only set up if window is not already defined (i.e. not in jsdom environment)
if (typeof globalThis.window === 'undefined') {
  const mockWindow = {
    setTimeout: global.setTimeout.bind(global),
    clearTimeout: global.clearTimeout.bind(global),
    setInterval: global.setInterval.bind(global),
    clearInterval: global.clearInterval.bind(global),
    requestAnimationFrame:
      global.requestAnimationFrame?.bind(global) ??
      ((cb: () => void) => setTimeout(cb)),
    cancelAnimationFrame:
      global.cancelAnimationFrame?.bind(global) ??
      ((id: number) => clearTimeout(id)),
  };

  (globalThis as Record<string, unknown>).window = mockWindow;
  (globalThis as Record<string, unknown>).activeWindow = mockWindow;
} else {
  // In jsdom, set activeWindow to the existing window
  (globalThis as Record<string, unknown>).activeWindow = globalThis.window;
}
