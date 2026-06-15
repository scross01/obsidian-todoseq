import { closeObsidian } from './obsidian-launcher';
import { TEST_VAULT_DIR, USER_DATA_DIR, rmrf } from './harness';

/**
 * Playwright globalTeardown: runs once after all test files.
 *
 * Closes the shared Obsidian instance (kills only the PID we spawned) and
 * wipes the ephemeral fixture directories so no state leaks between runs.
 */
export default async function globalTeardown(): Promise<void> {
  await closeObsidian();
  rmrf(TEST_VAULT_DIR);
  rmrf(USER_DATA_DIR);
}
