import { Page } from 'playwright';
import { BASELINE_NOTE, resetVaultState } from './test-reset';

export { BASELINE_NOTE };

/**
 * Compatibility delegate for callers that used the workspace-level name.
 * `resetVaultState` now owns the complete corpus and workspace reset, so this
 * must not run a second disposal pass.
 */
export async function resetWorkspaceState(page: Page): Promise<void> {
  await resetVaultState(page);
}
