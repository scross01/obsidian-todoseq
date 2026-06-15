import { defineConfig } from '@playwright/test';

/**
 * Integration test config.
 *
 * Two projects, run serially (workers: 1):
 *
 * 1. `obsidian` — the default project. Uses globalSetup to launch a single
 *    isolated Obsidian instance (via --user-data-dir) shared across all its
 *    test files. Tests reconnect over CDP via helpers/session.ts.
 *
 * 2. `obsidian-restart` — runs after `obsidian` (via dependencies). Manages
 *    its own Obsidian lifecycle so it can close + relaunch to verify settings
 *    persistence across a real process restart. It tears down the shared
 *    instance, which is safe because no later project needs it.
 *
 * globalSetup bootstraps the isolated fixtures and launches the shared instance;
 * globalTeardown closes it and wipes the ephemeral fixture directories. The
 * restart project re-bootstraps fixtures itself before its own launch.
 */
export default defineConfig({
  testDir: '.',
  timeout: 30_000,
  retries: 0,
  workers: 1,
  use: {
    headless: false,
    actionTimeout: 10_000,
    navigationTimeout: 30_000,
  },
  globalSetup: './helpers/global-setup.ts',
  globalTeardown: './helpers/global-teardown.ts',
  projects: [
    {
      name: 'obsidian',
      testMatch: /.*\.test\.ts/,
      testIgnore: /restart\.test\.ts$/,
    },
    {
      name: 'obsidian-restart',
      dependencies: ['obsidian'],
      testMatch: /restart\.test\.ts$/,
    },
  ],
});
