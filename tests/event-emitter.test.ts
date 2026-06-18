import { EventEmitter } from '../src/utils/event-emitter';

/**
 * Test fixture: a typed event map defined inline so the generic constraint is
 * exercised end-to-end. Mirrors the shape of `VaultScannerEvents`.
 */
interface TestEvents {
  started: (timestamp: number) => void;
  failed: (error: Error) => void;
  completed: (result: string) => void;
}

/**
 * Test subclass that widens the base `emit` from `protected` to `public`,
 * matching `VaultScanner`'s production pattern so the test suite can fire
 * events directly without dipping into `as any` casts.
 */
class TestEmitter extends EventEmitter<TestEvents> {
  public override emit<K extends keyof TestEvents>(
    event: K,
    ...args: Parameters<TestEvents[K]>
  ): void {
    super.emit(event, ...args);
  }
}

describe('EventEmitter', () => {
  let emitter: TestEmitter;

  beforeEach(() => {
    emitter = new TestEmitter('TestEmitter');
  });

  describe('on', () => {
    it('registers a listener for an event', () => {
      const spy = jest.fn();
      emitter.on('completed', spy);

      emitter.emit('completed', 'ok');

      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy).toHaveBeenCalledWith('ok');
    });

    it('allows multiple listeners for the same event', () => {
      const a = jest.fn();
      const b = jest.fn();
      emitter.on('completed', a);
      emitter.on('completed', b);

      emitter.emit('completed', 'ok');

      expect(a).toHaveBeenCalledWith('ok');
      expect(b).toHaveBeenCalledWith('ok');
    });

    it('does not fire listeners registered for other events', () => {
      const failed = jest.fn();
      const completed = jest.fn();
      emitter.on('failed', failed);
      emitter.on('completed', completed);

      emitter.emit('completed', 'ok');

      expect(failed).not.toHaveBeenCalled();
      expect(completed).toHaveBeenCalledTimes(1);
    });

    it('fires the same listener once per distinct event key it is registered on', () => {
      // Single function registered on two keys must fire on each — proves the
      // helper's listener arrays are keyed by event, not shared across keys.
      const spy = jest.fn();
      emitter.on('started', spy);
      emitter.on('completed', spy);

      emitter.emit('started', 42);
      emitter.emit('completed', 'ok');

      expect(spy).toHaveBeenCalledTimes(2);
      expect(spy).toHaveBeenNthCalledWith(1, 42);
      expect(spy).toHaveBeenNthCalledWith(2, 'ok');
    });
  });

  describe('off', () => {
    it('removes a previously registered listener', () => {
      const spy = jest.fn();
      emitter.on('completed', spy);
      emitter.off('completed', spy);

      emitter.emit('completed', 'ok');

      expect(spy).not.toHaveBeenCalled();
    });

    it('removes all instances of a duplicate-registered listener', () => {
      // Note: the helper's `off` uses Array.filter, which matches the
      // pre-refactor inline behavior — all matching listeners are removed in
      // one call. This is intentionally different from Node's standard
      // removeListener behavior; if that becomes desirable, switch to
      // splice-based removal.
      const spy = jest.fn();
      emitter.on('completed', spy);
      emitter.on('completed', spy);
      emitter.off('completed', spy);

      emitter.emit('completed', 'ok');

      expect(spy).not.toHaveBeenCalled();
    });

    it('is a no-op when no matching listener exists', () => {
      expect(() => emitter.off('completed', jest.fn())).not.toThrow();
      expect(() =>
        emitter.emit('completed', 'ok'),
      ).not.toThrow();
    });
  });

  describe('emit', () => {
    it('threads all arguments through to the listener', () => {
      const spy = jest.fn();
      emitter.on('started', spy);

      emitter.emit('started', 42);

      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy).toHaveBeenCalledWith(42);
    });

    it('is a no-op (and does not throw) when no listeners are registered', () => {
      expect(() => emitter.emit('started', 1)).not.toThrow();
      expect(() =>
        emitter.emit('failed', new Error('x')),
      ).not.toThrow();
      expect(() => emitter.emit('completed', 'ok')).not.toThrow();
    });
  });

  describe('try/catch error isolation', () => {
    let consoleErrorSpy: jest.SpyInstance;

    beforeEach(() => {
      consoleErrorSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => {
          /* silence during test */
        });
    });

    afterEach(() => {
      consoleErrorSpy.mockRestore();
    });

    it('logs listener errors and continues firing the rest', () => {
      const ok1 = jest.fn();
      const broken = jest.fn(() => {
        throw new Error('listener exploded');
      });
      const ok2 = jest.fn();

      emitter.on('completed', ok1);
      emitter.on('completed', broken);
      emitter.on('completed', ok2);

      emitter.emit('completed', 'ok');

      expect(ok1).toHaveBeenCalledTimes(1);
      expect(broken).toHaveBeenCalledTimes(1);
      expect(ok2).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    });

    it('uses the exact log format with emitterName and event-key', () => {
      const err = new Error('boom');
      emitter.on('failed', () => {
        throw err;
      });

      emitter.emit('failed', err);

      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      const [firstArg, secondArg] = consoleErrorSpy.mock.calls[0];
      expect(firstArg).toBe('Error in TestEmitter event listener for failed:');
      expect(secondArg).toBe(err);
    });

    it('propagates a custom emitterName passed via super(name)', () => {
      const custom = new TestEmitter('MyCustomEmitter');
      custom.on('failed', () => {
        throw new Error('x');
      });
      custom.emit('failed', new Error('y'));

      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy.mock.calls[0][0]).toBe(
        'Error in MyCustomEmitter event listener for failed:',
      );
    });

    it('handles non-Error throws from listeners without crashing', () => {
      // Thrown values that aren't Error instances still get caught
      const nonError: unknown = 'string-throw';
      emitter.on('completed', () => {
        throw nonError;
      });

      expect(() => emitter.emit('completed', 'ok')).not.toThrow();
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy.mock.calls[0][1]).toBe(nonError);
    });

    it('logs every listener error independently when multiple listeners throw', () => {
      const err1 = new Error('first');
      const err2 = new Error('second');
      emitter.on('completed', () => {
        throw err1;
      });
      emitter.on('completed', () => {
        throw err2;
      });

      emitter.emit('completed', 'ok');

      expect(consoleErrorSpy).toHaveBeenCalledTimes(2);
      expect(consoleErrorSpy.mock.calls[0][1]).toBe(err1);
      expect(consoleErrorSpy.mock.calls[1][1]).toBe(err2);
    });
  });

  describe('removeAllListeners', () => {
    it('clears every listener across every event key', () => {
      const started = jest.fn();
      const failed = jest.fn();
      const completed = jest.fn();
      emitter.on('started', started);
      emitter.on('failed', failed);
      emitter.on('completed', completed);

      emitter.removeAllListeners();

      emitter.emit('started', 1);
      emitter.emit('failed', new Error('x'));
      emitter.emit('completed', 'ok');

      expect(started).not.toHaveBeenCalled();
      expect(failed).not.toHaveBeenCalled();
      expect(completed).not.toHaveBeenCalled();
    });

    it('allows new listeners to be registered after clear', () => {
      const spy = jest.fn();
      emitter.on('completed', spy);
      emitter.removeAllListeners();
      emitter.on('completed', spy);

      emitter.emit('completed', 'ok');

      expect(spy).toHaveBeenCalledTimes(1);
    });

    it('is idempotent (calling twice does not throw)', () => {
      expect(() => {
        emitter.removeAllListeners();
        emitter.removeAllListeners();
      }).not.toThrow();
    });
  });
});
