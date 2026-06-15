import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { TEST_VAULT_DIR, writeVaultMarkdown } from './vault-setup';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// tests/integration/helpers/ -> repo root
export const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
// helpers/ -> fixtures/
export const FIXTURES_DIR = path.resolve(__dirname, '..', 'fixtures');

// Re-export so launcher/teardown can import all paths from one place.
export { TEST_VAULT_DIR };

/** Isolated Electron user-data-dir: holds the vault registry + all Obsidian app state. */
export const USER_DATA_DIR = path.join(FIXTURES_DIR, 'obsidian-user-data');

/** Where built plugin artifacts live (produced by `npm run build`). */
const PLUGIN_BUILD_DIR = REPO_ROOT;

const PLUGIN_ID = 'todoseq';

/** Baseline plugin settings committed to the repo for deterministic test starts. */
const BASELINE_SETTINGS_PATH = path.join(FIXTURES_DIR, 'baseline-plugin-data.json');

export function rmrf(target: string): void {
  fs.rmSync(target, { recursive: true, force: true });
}

function copyFile(src: string, dest: string): void {
  fs.copyFileSync(src, dest);
}

function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

/**
 * Stable, content-derived vault id for the test vault in the isolated registry.
 * Obsidian derives these from the path; we use a fixed value so the registry is
 * deterministic across runs.
 */
const TEST_VAULT_ID = 'testvault0';

/**
 * Write the isolated Obsidian user-data-dir vault registry pointing ONLY at the
 * test vault. This is what `--user-data-dir` reads instead of the real registry
 * at ~/Library/Application Support/obsidian/obsidian.json, giving us full isolation
 * from the system Obsidian install and its vaults.
 */
function writeVaultRegistry(): void {
  ensureDir(USER_DATA_DIR);
  const registry = {
    vaults: {
      [TEST_VAULT_ID]: {
        path: TEST_VAULT_DIR,
        ts: Date.now(),
        open: true,
      },
    },
    vaultTrust: {
      [TEST_VAULT_ID]: true,
    },
    cli: true,
    frame: 'hidden',
  };
  fs.writeFileSync(
    path.join(USER_DATA_DIR, 'obsidian.json'),
    JSON.stringify(registry),
  );
}

/**
 * Install the built plugin (main.js + manifest.json + styles.css from the repo
 * root) into the test vault's `.obsidian/plugins/<id>/`, pre-enabled in
 * community-plugins.json so the plugin loads on Obsidian start (no runtime
 * setEnable race).
 */
function installPlugin(): void {
  const pluginDir = path.join(
    TEST_VAULT_DIR,
    '.obsidian',
    'plugins',
    PLUGIN_ID,
  );
  rmrf(pluginDir);
  ensureDir(pluginDir);

  for (const file of ['main.js', 'manifest.json', 'styles.css']) {
    const src = path.join(PLUGIN_BUILD_DIR, file);
    if (!fs.existsSync(src)) {
      throw new Error(
        `Built plugin artifact not found: ${src}. Run \`npm run build\` before integration tests.`,
      );
    }
    copyFile(src, path.join(pluginDir, file));
  }

  // Seed deterministic baseline settings.
  if (!fs.existsSync(BASELINE_SETTINGS_PATH)) {
    throw new Error(`Baseline settings fixture missing: ${BASELINE_SETTINGS_PATH}`);
  }
  copyFile(BASELINE_SETTINGS_PATH, path.join(pluginDir, 'data.json'));
}

function writeObsidianConfig(): void {
  const obsidianDir = path.join(TEST_VAULT_DIR, '.obsidian');
  ensureDir(obsidianDir);

  // Plugin pre-enabled — loads on start, no setEnable race.
  fs.writeFileSync(
    path.join(obsidianDir, 'community-plugins.json'),
    JSON.stringify([PLUGIN_ID]),
  );

  // Minimal core config: disable noisy core plugins, keep the app quiet.
  fs.writeFileSync(
    path.join(obsidianDir, 'core-plugins.json'),
    JSON.stringify({}),
  );

  // Stable app settings: readable line length on, ignore noise dirs, fixed theme.
  fs.writeFileSync(
    path.join(obsidianDir, 'app.json'),
    JSON.stringify({
      alwaysUpdateLinks: true,
      readableLineLength: true,
      promptDelete: false,
    }),
  );

  // Lock theme to dark mode to prevent light/dark toggling during tests.
  // Obsidian reads this from appearance.json, not app.json.
  fs.writeFileSync(
    path.join(obsidianDir, 'appearance.json'),
    JSON.stringify({
      theme: 'obsidian',
      accentColor: '',
    }),
  );

  // Clear any stale workspace so Obsidian starts from a clean layout.
  rmrf(path.join(obsidianDir, 'workspace.json'));
  rmrf(path.join(obsidianDir, 'workspace-mobile.json'));
}

/**
 * Regenerate all integration-test fixtures from committed source. Idempotent.
 * Called by globalSetup (and by the restart project before its own launch).
 *
 * Order matters: directories wiped first, then vault content + config, then
 * the isolated registry, then the plugin install.
 */
export function bootstrapFixtures(): void {
  rmrf(TEST_VAULT_DIR);
  rmrf(USER_DATA_DIR);
  ensureDir(TEST_VAULT_DIR);

  writeVaultMarkdown();
  writeObsidianConfig();
  installPlugin();
  writeVaultRegistry();
}

/**
 * Reset mutable per-test state without tearing down `.obsidian/` or the plugin
 * install: rewrite the markdown fixtures and restore baseline plugin settings.
 * The caller triggers Obsidian to pick up the file changes (e.g. a rescan).
 */
export function resetMutableState(): void {
  writeVaultMarkdown();

  const dataDest = path.join(
    TEST_VAULT_DIR,
    '.obsidian',
    'plugins',
    PLUGIN_ID,
    'data.json',
  );
  copyFile(BASELINE_SETTINGS_PATH, dataDest);
}

/** CDP port the launcher exposes for Playwright `connectOverCDP`. Overridable via env. */
export const CDP_PORT = parseInt(process.env.OBSIDIAN_CDP_PORT || '9333', 10);

/** Path to the Obsidian executable. Overridable via env (defaults to macOS app). */
export const OBSIDIAN_PATH =
  process.env.OBSIDIAN_PATH ||
  '/Applications/Obsidian.app/Contents/MacOS/Obsidian';
