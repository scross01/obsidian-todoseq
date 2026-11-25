import path from 'path';
import {
  bootstrapFixtures,
  CDP_PORT,
  REPO_ROOT,
  rmrf,
  TEST_VAULT_DIR,
  USER_DATA_DIR,
} from './harness';
import { closeObsidian, launchObsidian } from './obsidian-launcher';
import {
  assertPortAvailable,
  createProcessOwner,
  setActiveOwner,
} from './process-owner';

const owner = createProcessOwner({
  paths: {
    vaultDir: TEST_VAULT_DIR,
    userDataDir: USER_DATA_DIR,
    lockPath: path.join(REPO_ROOT, 'test-results', 'obsidian-owner.lock'),
    descriptorPath: path.join(REPO_ROOT, 'test-results', 'obsidian-owner.json'),
  },
  cdpPort: CDP_PORT,
  start: async () => {
    await launchObsidian();
  },
  stop: async () => {
    await closeObsidian();
  },
});

/**
 * Playwright globalSetup: runs once before any test file.
 *
 * 1. Acquires the exclusive fixture-root lease before touching fixtures.
 * 2. Refuses an occupied CDP port instead of treating it as a takeover.
 * 3. Regenerates fixtures and starts the authenticated owner control endpoint.
 * 4. Launches one isolated Obsidian instance and leaves it running.
 *
 * Deliberately returns void. The explicit globalTeardown remains the single
 * normal cleanup owner; returning a cleanup function here would let Playwright
 * dispose the service before coverage collection and teardown run.
 */
export default async function globalSetup(): Promise<void> {
  owner.acquireLease();
  let fixturesTouched = false;
  try {
    await assertPortAvailable(CDP_PORT);
    // Mark before bootstrap so a partial bootstrap is torn down, but a port
    // conflict before this point must not delete fixtures an unknown listener
    // may still be using.
    fixturesTouched = true;
    bootstrapFixtures();
    await owner.startControlServer();
    owner.writeDescriptor();
    await owner.start();
    setActiveOwner(owner);
  } catch (error) {
    try {
      await owner.abort();
    } catch {
      // Shutdown could not be confirmed; keep the lease and descriptor so an
      // operator can find the survived process. Do not delete shared roots.
    }
    if (!owner.holdsLease && fixturesTouched) {
      rmrf(TEST_VAULT_DIR);
      rmrf(USER_DATA_DIR);
    }
    throw error;
  }
}
