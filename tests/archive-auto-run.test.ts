import {
  shouldAutoArchive,
  type AutoArchiveDecision,
} from '../src/services/archive-service';

describe('shouldAutoArchive', () => {
  const ready = {
    autoArchiveEnabled: true,
    hasService: true,
    isManualRunInProgress: false,
  };

  function expectDecision(
    input: Parameters<typeof shouldAutoArchive>[0],
    run: boolean,
    reason: AutoArchiveDecision['reason'],
  ): void {
    const decision = shouldAutoArchive(input);
    expect(decision.run).toBe(run);
    expect(decision.reason).toBe(reason);
  }

  it('runs when enabled, service present, and no manual run in flight', () => {
    expectDecision(ready, true, 'enabled-and-ready');
  });

  it('does not run when the setting is off (default)', () => {
    expectDecision(
      { ...ready, autoArchiveEnabled: false },
      false,
      'setting-off',
    );
  });

  it('does not run when the archive service is missing', () => {
    expectDecision({ ...ready, hasService: false }, false, 'no-service');
  });

  it('does not run while a manual run is in progress', () => {
    expectDecision(
      { ...ready, isManualRunInProgress: true },
      false,
      'manual-run-in-progress',
    );
  });
});
