/**
 * The scenario registry: which capture script produces which docs asset.
 *
 * Split out of capture.ts so tests can assert against the registry without
 * importing the driver's module-level `main()` call, which would run a capture.
 */

/** How a scenario's output becomes a docs asset. */
export type ScenarioKind = 'stills' | 'gif';

/**
 * Which Obsidian base theme(s) to capture.
 *
 * Both, by default: a dark app screenshot on the docs' light background reads
 * as a hole in the page, so every asset is captured once per theme and the
 * docs appearance toggle picks between them (see the `ts-img-dark` /
 * `ts-img-light` rules in the VitePress theme CSS).
 */
export type ThemeMode = 'dark' | 'light';

/**
 * One pure module of seed notes under scenarios/seeds/.
 *
 * Seed maps are split per scenario dependency set so editing the dashboard
 * notes does not invalidate the settings capture. A scenario declares the
 * modules it stages, and `scenario-inputs.ts` hashes exactly those.
 */
export type SeedModuleId =
  | 'demo'
  | 'search-filter'
  | 'editor'
  | 'embed'
  | 'task-entry'
  | 'dashboard'
  | 'archive'
  | 'warning-period'
  | 'collapse';

/** One entry in the scenario registry. */
export interface ScenarioDef {
  /** ODR script file, basename within scenarios/. */
  script: string;
  kind: ScenarioKind;
  /**
   * Output filename for gif scenarios, which produce a video rather than
   * per-screenshot ids. Stills scenarios derive their name from each
   * screenshot action's id instead.
   */
  asset?: string;
  /**
   * Seconds to cut from the start of a gif scenario's video before converting.
   *
   * The screencast begins the moment Obsidian is ready, which is a few frames
   * before the demo's first action has opened the note — so the recording
   * otherwise opens on Obsidian's generic "New tab" screen, which says nothing
   * about the plugin. Cut conservatively: the note then sits static for about
   * a second before any typing starts, so overshooting loses nothing and
   * undershooting only fails to remove the empty frames.
   */
  trimStartSeconds?: number;
  /**
   * Seed modules this scenario stages, in staging order.
   *
   * Every module is hashed with the scenario, so declaring one here widens the
   * scenarios a seed edit invalidates — and omitting one would let a real seed
   * change report FRESH. tests/screenshot-seed-registry.test.ts checks the
   * declaration against the script's actual imports and staging.
   */
  seeds: SeedModuleId[];
}

/** Registry: scenario id → what to run and what it produces. */
export const SCENARIOS: Record<string, ScenarioDef> = {
  'docs-editor': {
    script: 'editor.ts',
    kind: 'stills',
    seeds: ['demo', 'editor'],
  },
  'docs-task-list': {
    script: 'task-list.ts',
    kind: 'stills',
    seeds: ['demo'],
  },
  'docs-embedded-reader': {
    script: 'embedded-reader.ts',
    kind: 'stills',
    seeds: ['demo', 'embed'],
  },
  'docs-search': {
    script: 'search.ts',
    kind: 'stills',
    seeds: ['search-filter'],
  },
  'docs-settings': {
    script: 'settings.ts',
    kind: 'stills',
    seeds: ['demo'],
  },
  'docs-dashboards': {
    script: 'dashboards.ts',
    kind: 'stills',
    seeds: ['dashboard'],
  },
  'docs-auto-archive': {
    script: 'auto-archive.ts',
    kind: 'stills',
    seeds: ['archive'],
  },
  'docs-warning-periods': {
    script: 'warning-periods.ts',
    kind: 'stills',
    seeds: ['warning-period'],
  },
  'docs-embedded-collapse': {
    script: 'embedded-collapse.ts',
    kind: 'stills',
    seeds: ['collapse'],
  },
  'docs-task-entry': {
    script: 'task-entry.ts',
    kind: 'gif',
    asset: 'todoseq-task-entry.gif',
    trimStartSeconds: 0.6,
    seeds: ['task-entry'],
  },
};

/** Shared scenario module; its edits change every scenario's output. */
export const HELPERS_FILE = 'helpers.ts';
