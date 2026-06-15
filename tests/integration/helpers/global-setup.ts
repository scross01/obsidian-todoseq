import { bootstrapFixtures, CDP_PORT } from './harness';
import { launchObsidian } from './obsidian-launcher';

/**
 * Playwright globalSetup: runs once before any test file.
 *
 * 1. Regenerates all fixtures from committed source (isolated user-data-dir,
 *    vault content + config, built plugin install, vault registry).
 * 2. Launches a single isolated Obsidian instance (via --user-data-dir) and
 *    leaves it running with CDP open. Tests reconnect over CDP via session.ts.
 *
 * Returns the CDP port so workers/tests know where to connect (Playwright
 * surfaces the returned object as config.metadata in newer versions; we also
 * rely on the CDP_PORT constant from harness.ts for worker connections).
 */
export default async function globalSetup(): Promise<{ cdpPort: number }> {
  bootstrapFixtures();
  await launchObsidian();
  return { cdpPort: CDP_PORT };
}
