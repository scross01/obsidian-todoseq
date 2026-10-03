/**
 * Docs screenshot capture pipeline.
 *
 * Each scenario in scripts/screenshots/scenarios/ is an obsidian-demo-recorder
 * script that stages a docs-page state and captures one or more stills with
 * stable ids matching docs/assets/<id>.png. The driver:
 *
 *   1. Resolves the recorder binary (SCREENSHOT_RECORDER env or PATH).
 *   2. Stages the built plugin at a dir named `todoseq` (ODR derives the
 *      plugin id from the directory basename).
 *   3. Runs each scenario with `record --stills --no-cache` (dates in seeds
 *      change daily, so the stills cache would serve stale content).
 *   4. Copies the captured stills into docs/assets/.
 *   5. Writes scripts/screenshots/manifest.json (merge on --only).
 *
 * `--check` (advisory only — not wired into docs:build or CI): re-hashes and
 * prints FRESH / STALE / MISSING per asset plus the usage scan.
 *
 * Usage:
 *   npm run docs:screenshots               # capture everything
 *   npm run docs:screenshots -- --only=editor
 *   npm run docs:screenshots -- --check
 *   npm run docs:screenshots -- --explain  # what each scenario hashes
 */
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  classifyAsset,
  computePluginBuildHash,
  computeScenarioHash,
  formatCheckReport,
  summarizeRows,
  type CheckRow,
  type Manifest,
} from './manifest.ts';
import { scanAssetUsage } from './usage-scan.ts';
import {
  SCENARIO_PLUGIN_SOURCES,
  SHARED_PLUGIN_SOURCES,
  expandPluginSources,
  pluginClassNames,
} from './plugin-surfaces.ts';
import {
  attributeCssRules,
  splitCssRules,
  type CssRule,
} from './css-slices.ts';
import {
  HELPERS_FILE,
  SCENARIOS,
  type ScenarioDef,
  type ThemeMode,
} from './registry.ts';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '../..');
const DOCS_ASSETS = path.join(REPO_ROOT, 'docs', 'assets');
const SCENARIOS_DIR = path.join(HERE, 'scenarios');
const STAGING_DIR = path.join(REPO_ROOT, '.tmp-screenshots');
const MANIFEST_PATH = path.join(HERE, 'manifest.json');

const PLUGIN_DIR = 'todoseq'; // ODR derives the plugin id from the dir basename

/** Read a scenario file, failing loudly when it is missing. */
function readScenarioFile(file: string): string {
  const abs = path.join(SCENARIOS_DIR, file);
  if (!fs.existsSync(abs)) fail(`Scenario source missing: ${abs}`);
  return fs.readFileSync(abs, 'utf8');
}

/**
 * Scenario hash inputs: the scenario script *and* the shared helpers module.
 * Both define what the capture looks like, so both must invalidate.
 */
function scenarioHashInputs(scenarioId: string, scriptFile: string) {
  return {
    id: scenarioId,
    sources: {
      [scriptFile]: readScenarioFile(scriptFile),
      [HELPERS_FILE]: readScenarioFile(HELPERS_FILE),
    },
    seed: {},
  };
}

/**
 * Every *git-tracked* markdown file that can reference a docs asset.
 *
 * Tracked rather than on-disk: local-only scratch (plans/, Test*.md) names
 * every candidate asset in its inventories, which would mask genuinely dead
 * files. Uses `git ls-files` so the scan matches what the docs site ships.
 */
function docsMarkdownSources(): string[] {
  const res = spawnSync('git', ['ls-files', '*.md'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  if (res.status !== 0) return ['README.md'];
  return res.stdout.split('\n').filter(Boolean);
}

function fail(msg: string): never {
  process.stderr.write(`${msg}\n`);
  process.exit(1);
}

function resolveRecorder(): string {
  const fromEnv = process.env.SCREENSHOT_RECORDER;
  if (fromEnv) return fromEnv;
  const probe = spawnSync('obsidian-demo-recorder', ['--version'], {
    encoding: 'utf8',
  });
  if (probe.error || probe.status !== 0) {
    fail(
      'obsidian-demo-recorder not found on PATH.\n' +
        'Install/link it, or set SCREENSHOT_RECORDER to the binary path.',
    );
  }
  return 'obsidian-demo-recorder';
}

function stagePlugin(): string {
  const mainJsPath = path.join(REPO_ROOT, 'main.js');
  const stylesPath = path.join(REPO_ROOT, 'styles.css');
  const manifestJsonPath = path.join(REPO_ROOT, 'manifest.json');
  for (const p of [mainJsPath, stylesPath, manifestJsonPath]) {
    if (!fs.existsSync(p))
      fail(`Missing plugin build output: ${p} — run npm run build first.`);
  }
  const pluginDir = path.join(STAGING_DIR, PLUGIN_DIR);
  fs.mkdirSync(pluginDir, { recursive: true });
  fs.copyFileSync(mainJsPath, path.join(pluginDir, 'main.js'));
  fs.copyFileSync(stylesPath, path.join(pluginDir, 'styles.css'));
  fs.copyFileSync(manifestJsonPath, path.join(pluginDir, 'manifest.json'));
  return pluginDir;
}

/** The one stylesheet, named here because it is sliced rather than hashed whole. */
const STYLES = 'styles.css';

/** Every file a surface pattern could name, repo-relative and posix. */
let allPluginSourceFiles: string[] | null = null;
function pluginSourceUniverse(): string[] {
  if (allPluginSourceFiles) return allPluginSourceFiles;
  const found: string[] = [];
  const walk = (absDir: string): void => {
    for (const entry of fs.readdirSync(absDir, { withFileTypes: true })) {
      const abs = path.join(absDir, entry.name);
      if (entry.isDirectory()) walk(abs);
      else if (entry.name.endsWith('.ts')) {
        found.push(path.relative(REPO_ROOT, abs).split(path.sep).join('/'));
      }
    }
  };
  walk(path.join(REPO_ROOT, 'src'));
  if (fs.existsSync(path.join(REPO_ROOT, STYLES))) found.push(STYLES);
  allPluginSourceFiles = found;
  return found;
}

/** Read-once cache: the scenarios share most of their source files. */
const sourceText = new Map<string, string>();
function readSource(rel: string): string {
  let text = sourceText.get(rel);
  if (text === undefined) {
    const abs = path.join(REPO_ROOT, rel);
    if (!fs.existsSync(abs)) fail(`Plugin source does not exist: ${rel}`);
    text = fs.readFileSync(abs, 'utf8');
    sourceText.set(rel, text);
  }
  return text;
}

/** The source files one scenario hashes, excluding the sliced stylesheet. */
function scenarioSourceFiles(scenarioId: string): string[] {
  return expandPluginSources(
    [...SHARED_PLUGIN_SOURCES, ...(SCENARIO_PLUGIN_SOURCES[scenarioId] ?? [])],
    pluginSourceUniverse(),
  ).filter((f) => f !== STYLES);
}

/**
 * `styles.css` split per scenario, built once.
 *
 * A rule is attributed to the scenarios whose class names appear in its
 * selector, where those names come from the scenario's own source — so a
 * component claims its CSS by existing, not by being registered somewhere
 * else. Rules matching no scenario are handed to all of them, which is what
 * keeps a missed marker from quietly stopping a real restyle being caught.
 */
let cssSlices: Record<string, CssRule[]> | null = null;
function cssSlicesByScenario(): Record<string, CssRule[]> {
  if (cssSlices) return cssSlices;
  const markers: Record<string, Set<string>> = {};
  for (const scenarioId of Object.keys(SCENARIOS)) {
    const sources: Record<string, string> = {};
    for (const rel of scenarioSourceFiles(scenarioId)) {
      sources[rel] = readSource(rel);
    }
    markers[scenarioId] = pluginClassNames(sources);
  }
  cssSlices = attributeCssRules(splitCssRules(readSource(STYLES)), markers);
  return cssSlices;
}

/**
 * Sha256 over the plugin sources one scenario's screenshots depend on.
 *
 * Not the build output: `main.js` is a single minified bundle, so hashing it
 * marks every asset stale after any source change at all — including parser
 * fixes and vault-scanner work that change no pixel. Hashing only what a
 * scenario can actually render keeps the signal. The trade-off is that the
 * dependency is declared rather than derived, so
 * tests/screenshot-plugin-surfaces.test.ts guards the rendering layer against
 * being left unclaimed.
 */
function pluginBuildHashFor(scenarioId: string): string {
  const files = scenarioSourceFiles(scenarioId);
  if (files.length === 0)
    fail(`No plugin sources resolved for scenario "${scenarioId}".`);
  const sources: Record<string, string> = {};
  for (const rel of files) sources[rel] = readSource(rel);

  // The stylesheet contributes only this scenario's slice, under the same key,
  // so the hashed value stays a single map of path → text.
  const slice = cssSlicesByScenario()[scenarioId] ?? [];
  if (slice.length === 0)
    fail(
      `No CSS rules resolved for scenario "${scenarioId}" — a scenario with no ` +
        `stylesheet slice would never notice a restyle.`,
    );
  sources[STYLES] = slice.map((r) => r.text).join('\n');
  return computePluginBuildHash(sources);
}

function shortCommit(): string {
  const r = spawnSync('git', ['rev-parse', '--short', 'HEAD'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  return r.status === 0 ? r.stdout.trim() || 'unknown' : 'unknown';
}

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function runScenario(
  recorder: string,
  scenarioId: string,
  def: ScenarioDef,
  pluginDir: string,
  scriptPath: string,
  gifAsset: string | undefined,
): string[] {
  if (!fs.existsSync(scriptPath))
    fail(`Scenario script missing: ${scriptPath}`);
  const outDir = path.join(STAGING_DIR, scenarioId);
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });

  const recordArgs = [
    'record',
    scriptPath,
    '--no-cache',
    '--cdp-port',
    '9335',
    '--plugin-path',
    pluginDir,
    '--output-dir',
    outDir,
  ];
  if (def.kind === 'stills') {
    recordArgs.push('--stills');
  } else {
    // Land the cut on the last action's result: a trailing scene delay would
    // let a popup opened by the final action close before the loop restarts.
    recordArgs.push('--scene-delay', '0', '--action-delay', '150');
  }

  const res = spawnSync(recorder, recordArgs, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (res.status !== 0) {
    process.stderr.write((res.stdout || '') + (res.stderr || ''));
    fail(`ODR failed for scenario "${scenarioId}" (exit ${res.status}).`);
  }
  if (def.kind === 'gif') {
    if (!gifAsset) fail(`gif scenario "${scenarioId}" has no asset filename`);
    // ODR names the mp4 after the script file; the gif converter writes the
    // GIF beside it, and the driver renames on copy into docs/assets.
    const scriptBase = path.basename(scriptPath, '.ts');
    const mp4 = path.join(outDir, `${scriptBase}.mp4`);
    if (!fs.existsSync(mp4))
      fail(`Scenario "${scenarioId}" produced no ${mp4}`);

    // Drop the leading empty-workspace frames before converting. Done here
    // rather than inside the recorder because its gif subcommand has no seek.
    let source = mp4;
    if (def.trimStartSeconds && def.trimStartSeconds > 0) {
      const trimmed = path.join(outDir, `${scriptBase}.trimmed.mp4`);
      const cut = spawnSync(
        'ffmpeg',
        [
          '-y',
          '-ss',
          String(def.trimStartSeconds),
          '-i',
          mp4,
          '-c:v',
          'libx264',
          '-crf',
          '20',
          trimmed,
        ],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
      );
      if (cut.status !== 0) {
        process.stderr.write((cut.stdout || '') + (cut.stderr || ''));
        fail(
          `Trimming the start of "${scenarioId}" failed (exit ${cut.status}).`,
        );
      }
      source = trimmed;
    }

    const gif = spawnSync(
      recorder,
      ['gif', source, '--fps', '10', '--width', '720'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    );
    if (gif.status !== 0) {
      process.stderr.write((gif.stdout || '') + (gif.stderr || ''));
      fail(`GIF conversion failed for "${scenarioId}" (exit ${gif.status}).`);
    }
    const produced = path.join(outDir, `${path.basename(source, '.mp4')}.gif`);
    if (!fs.existsSync(produced))
      fail(`GIF conversion produced no ${produced}`);
    return [gifAsset];
  }

  // ODR writes <id>.<ext> for each screenshot action with a stable id.
  const stills = fs
    .readdirSync(outDir)
    .filter(
      (f) => f.endsWith('.png') || f.endsWith('.jpg') || f.endsWith('.webp'),
    );
  if (stills.length === 0)
    fail(`Scenario "${scenarioId}" produced no stills in ${outDir}`);
  return stills;
}

/** Where the generated light-mode wrappers are written. Gitignored scratch. */
const THEME_VARIANT_DIR = path.join(STAGING_DIR, 'theme-variants');

/**
 * Write (and return the path of) a light-mode variant of a scenario.
 *
 * The theme is the one thing a scenario cannot express per-run: ODR exposes
 * `setup.settings.themeMode`, which maps to appearance.json's `theme`, but it
 * is set in the script file, not on the command line. Rather than hand-maintain
 * a second copy of every scenario — which would guarantee the two drift the
 * first time one is edited — generate a thin wrapper that imports the real one
 * and overrides just the two things that differ: the base theme, and a
 * `-light` suffix on every screenshot id so the two runs cannot overwrite each
 * other in docs/assets.
 *
 * Generated because `defineScript` is an identity function, so the exported
 * object can be spread and rewritten. Everything here is cast to `any` to keep
 * the generated file out of the repo's typecheck (it lives in scratch space and
 * is not part of the build).
 */
function lightVariantScriptPath(def: ScenarioDef): string {
  fs.mkdirSync(THEME_VARIANT_DIR, { recursive: true });
  const base = path.basename(def.script, '.ts');
  const file = `${base}-light.ts`;
  // Match the hand-written scenarios, which import helpers without a suffix.
  const importPath = path
    .relative(THEME_VARIANT_DIR, path.join(SCENARIOS_DIR, def.script))
    .replace(/\.ts$/, '');
  const source = `// GENERATED by scripts/screenshots/capture.ts — do not edit.
// Light-mode twin of ${def.script}; see lightVariantScriptPath() for why this
// wrapper exists rather than a hand-written second scenario.
import { defineScript } from 'obsidian-demo-recorder';
import base from '${importPath}';

const script = base as any;

export default defineScript({
  ...script,
  setup: {
    ...(script.setup ?? {}),
    settings: {
      ...(script.setup?.settings ?? {}),
      themeMode: 'light',
    },
  },
  scenes: (script.scenes ?? []).map((scene: any) => ({
    ...scene,
    actions: (scene.actions ?? []).map((action: any) =>
      action && action.type === 'screenshot' && action.id
        ? { ...action, id: action.id + '-light' }
        : action,
    ),
  })),
});
`;
  const abs = path.join(THEME_VARIANT_DIR, file);
  fs.writeFileSync(abs, source);
  return abs;
}

/**
 * Print what each scenario hashes, so the narrowed dependency set is
 * inspectable rather than magic. Without this, "STALE (plugin build changed)"
 * gives no clue which file to blame, and a wrong surface entry is invisible
 * until a screenshot is wrong.
 */
function explainMode(): void {
  const universe = pluginSourceUniverse();
  const shared = expandPluginSources(SHARED_PLUGIN_SOURCES, universe).filter(
    (f) => f !== STYLES,
  );
  const slices = cssSlicesByScenario();
  const totalRules = splitCssRules(readSource(STYLES)).length;
  for (const scenarioId of Object.keys(SCENARIOS)) {
    const specific = scenarioSourceFiles(scenarioId).filter(
      (f) => !shared.includes(f),
    );
    const slice = slices[scenarioId] ?? [];
    console.log(
      `${scenarioId}: ${scenarioSourceFiles(scenarioId).length} source file(s) ` +
        `— ${shared.length} shared, ${specific.length} scenario-specific; ` +
        `CSS slice ${slice.length}/${totalRules} rules`,
    );
    for (const f of specific) console.log(`    ${f}`);
  }
}

function captureMode(only: string[] | null, themes: ThemeMode[]): void {
  const recorder = resolveRecorder();
  const pluginDir = stagePlugin();
  const commit = shortCommit();
  const capturedAt = today();

  const manifest: Manifest = fs.existsSync(MANIFEST_PATH)
    ? (JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8')) as Manifest)
    : { assets: {} };

  const scenarioIds = only
    ? Object.keys(SCENARIOS).filter((id) => only.includes(id))
    : Object.keys(SCENARIOS);
  if (scenarioIds.length === 0)
    fail(`No scenario matches --only=${only?.join(',')}`);

  for (const scenarioId of scenarioIds) {
    const def = SCENARIOS[scenarioId];
    const scenarioHash = computeScenarioHash(
      scenarioHashInputs(scenarioId, def.script),
    );
    const pluginBuildHash = pluginBuildHashFor(scenarioId);
    for (const theme of themes) {
      // The light run is a generated wrapper that also renames every
      // screenshot id, so `outputs` are already `-light` filenames and the
      // copy/manifest path below needs no theme awareness of its own.
      const scriptPath =
        theme === 'light'
          ? lightVariantScriptPath(def)
          : path.join(SCENARIOS_DIR, def.script);
      const gifAsset =
        theme === 'light' && def.asset
          ? def.asset.replace(/(\.[^.]+)$/, '-light$1')
          : def.asset;
      const outputs = runScenario(
        recorder,
        scenarioId,
        def,
        pluginDir,
        scriptPath,
        gifAsset,
      );
      for (const filename of outputs) {
        const assetId = path.basename(filename, path.extname(filename));
        const src = path.join(
          STAGING_DIR,
          scenarioId,
          producedName(def, filename, scriptPath),
        );
        const dest = path.join(DOCS_ASSETS, filename);
        fs.copyFileSync(src, dest);
        manifest.assets[assetId] = {
          id: assetId,
          scenarioId,
          scenarioHash,
          pluginBuildHash,
          // sha256 of the DESTINATION bytes (what is committed).
          outputSha256: createHash('sha256')
            .update(fs.readFileSync(dest))
            .digest('hex'),
          capturedAt,
          capturedAtCommit: commit,
        };
      }
      console.log(
        `captured ${outputs.length} asset(s) from "${scenarioId}" (${theme})`,
      );
    }
  }

  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n');
  console.log(`manifest → ${path.relative(REPO_ROOT, MANIFEST_PATH)}`);
  console.log(
    'Reminder: eyeball each new asset against its docs section before committing.',
  );
}

/**
 * Filename a produced asset has in the staging dir, which is not always the
 * name it takes in docs/assets: a gif scenario is converted from an mp4 named
 * after the script and only renamed on copy.
 */
function producedName(
  def: ScenarioDef,
  filename: string,
  scriptPath: string,
): string {
  if (def.kind !== 'gif') return filename;
  const scriptBase = path.basename(scriptPath, '.ts');
  return def.trimStartSeconds && def.trimStartSeconds > 0
    ? `${scriptBase}.trimmed.gif`
    : `${scriptBase}.gif`;
}

function checkMode(): void {
  if (!fs.existsSync(MANIFEST_PATH))
    fail('No manifest yet — run docs:screenshots first.');
  const manifest = JSON.parse(
    fs.readFileSync(MANIFEST_PATH, 'utf8'),
  ) as Manifest;

  // Recompute each scenario's current hashes so drift is detected from the
  // scenario definition and its plugin sources, not copied out of the
  // manifest it is checking.
  const currentScenarioHash = new Map<string, string>();
  for (const [scenarioId, def] of Object.entries(SCENARIOS)) {
    currentScenarioHash.set(
      scenarioId,
      computeScenarioHash(scenarioHashInputs(scenarioId, def.script)),
    );
  }
  // Per scenario, not global: only the sources that scenario renders can
  // invalidate it. Built lazily so --check stays cheap on a clean tree.
  const currentPluginHash = new Map<string, string>();
  const pluginHashFor = (scenarioId: string): string => {
    let hash = currentPluginHash.get(scenarioId);
    if (hash === undefined) {
      hash = pluginBuildHashFor(scenarioId);
      currentPluginHash.set(scenarioId, hash);
    }
    return hash;
  };

  const rows: CheckRow[] = [];
  const files = fs
    .readdirSync(DOCS_ASSETS)
    .filter(
      (f) =>
        f.endsWith('.png') ||
        f.endsWith('.jpg') ||
        f.endsWith('.webp') ||
        f.endsWith('.gif'),
    );
  for (const file of files) {
    const assetId = path.basename(file, path.extname(file));
    const entry = manifest.assets[assetId];
    let status: string;
    if (!entry) {
      status = file.endsWith('.gif')
        ? 'MANUAL (gif)'
        : 'MISSING (no manifest entry)';
    } else {
      const scenarioHash = currentScenarioHash.get(entry.scenarioId);
      status =
        scenarioHash === undefined
          ? 'ORPHAN (scenario no longer in the registry)'
          : classifyAsset(manifest, assetId, {
              scenarioHash,
              pluginBuildHash: pluginHashFor(entry.scenarioId),
              outputSha256: createHash('sha256')
                .update(fs.readFileSync(path.join(DOCS_ASSETS, file)))
                .digest('hex'),
            });
    }
    rows.push({ asset: file, status });
  }
  // UNREFERENCED rows from the usage scan across every docs page.
  const readMd = (p: string): string | null => {
    const abs = path.join(REPO_ROOT, p);
    return fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8') : null;
  };
  const { unreferenced } = scanAssetUsage(files, docsMarkdownSources(), readMd);
  for (const u of unreferenced) rows.push({ asset: u, status: 'UNREFERENCED' });
  rows.sort((a, b) => a.asset.localeCompare(b.asset));
  console.log(formatCheckReport(rows));
  // Non-zero on drift, so the command is a real check. Whether that fails a
  // build is the caller's decision: the CI job runs it with
  // continue-on-error, because a parser fix cannot be expected to recapture
  // 52 screenshots, and a hard failure on every such PR would teach everyone
  // to ignore the one job that is trying to catch a lying screenshot.
  if (summarizeRows(rows).bad > 0) process.exitCode = 1;
}

function main(): void {
  const args = process.argv.slice(2);
  if (args.includes('--check')) {
    checkMode();
    return;
  }
  if (args.includes('--explain')) {
    explainMode();
    return;
  }
  const onlyArg = args.find((a) => a.startsWith('--only='));
  const only = onlyArg
    ? onlyArg.slice('--only='.length).split(',').filter(Boolean)
    : null;
  // `--dark-only` halves a capture run. It leaves the light twins stale, which
  // `--check` reports like any other drift.
  const themes: ThemeMode[] = args.includes('--dark-only')
    ? ['dark']
    : ['dark', 'light'];
  captureMode(only, themes);
}

main();
