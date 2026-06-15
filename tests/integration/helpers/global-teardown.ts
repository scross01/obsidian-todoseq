import { closeObsidian } from './obsidian-launcher';
import { TEST_VAULT_DIR, USER_DATA_DIR, rmrf } from './harness';
import { collectAndSaveCoverage } from './session';

/**
 * Playwright globalTeardown: runs once after all test files.
 *
 * Collects V8 coverage from the Electron process, closes the shared Obsidian
 * instance, and wipes the ephemeral fixture directories so no state leaks
 * between runs.
 */
export default async function globalTeardown(): Promise<void> {
  await collectAndSaveCoverage();
  await closeObsidian();
  rmrf(TEST_VAULT_DIR);
  rmrf(USER_DATA_DIR);
}
