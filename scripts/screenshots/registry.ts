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
}

/** Registry: scenario id → what to run and what it produces. */
export const SCENARIOS: Record<string, ScenarioDef> = {
  'docs-editor': { script: 'editor.ts', kind: 'stills' },
  'docs-task-list': { script: 'task-list.ts', kind: 'stills' },
  'docs-embedded-reader': { script: 'embedded-reader.ts', kind: 'stills' },
  'docs-search': { script: 'search.ts', kind: 'stills' },
  'docs-settings': { script: 'settings.ts', kind: 'stills' },
  'docs-dashboards': { script: 'dashboards.ts', kind: 'stills' },
  'docs-auto-archive': { script: 'auto-archive.ts', kind: 'stills' },
  'docs-warning-periods': { script: 'warning-periods.ts', kind: 'stills' },
  'docs-task-entry': {
    script: 'task-entry.ts',
    kind: 'gif',
    asset: 'todoseq-task-entry.gif',
    trimStartSeconds: 0.6,
  },
};

/** Shared scenario module; its edits change every scenario's output. */
export const HELPERS_FILE = 'helpers.ts';
