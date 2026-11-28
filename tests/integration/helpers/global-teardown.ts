import { rmrf, TEST_VAULT_DIR, USER_DATA_DIR } from './harness';
import { clearActiveOwner, getActiveOwner } from './process-owner';
import { collectAndSaveCoverage } from './session';

/**
 * Playwright globalTeardown: runs once after all test files.
 *
 * The runner's owner is the only normal cleanup authority. Coverage is taken
 * first, then the owned application is stopped and confirmed. Only after that
 * is the control endpoint/descriptor disposed, fixtures deleted, and the
 * exclusive lease released. A failed shutdown leaves the lease and fixtures in
 * place rather than deleting state under a process that may still be alive.
 */
export default async function globalTeardown(): Promise<void> {
  const owner = getActiveOwner();
  if (!owner) return;

  await collectAndSaveCoverage();
  await owner.stop();
  await owner.closeControl();
  rmrf(TEST_VAULT_DIR);
  rmrf(USER_DATA_DIR);
  owner.releaseLease();
  clearActiveOwner(owner);
}
