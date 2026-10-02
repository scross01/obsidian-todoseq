/**
 * Which plugin sources each docs screenshot actually depends on.
 *
 * The staleness check originally hashed the whole build output (`main.js` +
 * `styles.css`). `main.js` is a single minified bundle, so *any* source change
 * — a parser fix, a vault-scanner optimisation, a comment — changed the hash
 * and marked all 52 assets stale. A check that reports "everything is broken"
 * after every commit is a check nobody reads, which defeats its only purpose:
 * catching a screenshot that was not recaptured after the UI it shows changed.
 *
 * The bundle cannot be sliced, because esbuild emits one file and scenario
 * scripts reach the plugin through Obsidian commands and DOM selectors rather
 * than imports, so there is no static edge from a scenario to a module. So the
 * dependency is declared here instead, and narrowed along the only line that
 * is actually defensible:
 *
 *   - `styles.css` and the task formatting/sort/urgency core are hashed for
 *     every scenario: they decide what the text of a rendered task says, in
 *     every surface at once.
 *   - `src/view/**` is the rendering layer, so each scenario claims the
 *     components it actually shows.
 *   - Everything else — parsers, vault scanning, state management, the plugin
 *     lifecycle — is excluded. It can change behaviour without changing a
 *     pixel. A scenario that does depend on one (the task-entry GIF shows the
 *     smart-date processor rewriting "tomorrow") names it explicitly; a
 *     scenario surface is not restricted to `src/view`.
 *
 * The cost of narrowing is that an unclaimed change can hide behind a false
 * FRESH, so `tests/screenshot-plugin-surfaces.test.ts` fails when any module
 * under `src/view` is claimed by no scenario. Adding a view file is therefore
 * never silent: it asks which screenshots it can change.
 */

/**
 * Sources hashed for every scenario, because they can change what any rendered
 * task looks like. Deliberately excludes the *rules* modules (patterns,
 * date-utils, org-patterns) beyond what formatting needs — no, includes them:
 * they are what parse a date into the string a task line shows.
 */
export const SHARED_PLUGIN_SOURCES: readonly string[] = [
  // One stylesheet themes every surface: a single selector here can restyle
  // the task list, the dashboard and the editor at once.
  'styles.css',
  // How a task becomes the line of text a user reads, wherever it appears.
  'src/types/task.ts',
  'src/utils/task-format.ts',
  'src/utils/task-line-utils.ts',
  'src/utils/task-utils.ts',
  'src/utils/task-sub-bullets.ts',
  'src/utils/task-sort.ts',
  'src/utils/task-urgency.ts',
  'src/utils/constants.ts',
  'src/utils/patterns.ts',
  'src/utils/date-utils.ts',
  'src/utils/org-patterns.ts',
  'src/utils/keyword-manager.ts',
];

/**
 * Per-scenario sources, beyond the shared core.
 *
 * Patterns are repo-relative; a trailing `/**` matches a directory
 * recursively. Keyed by registry id — a test asserts the two agree.
 */
export const SCENARIO_PLUGIN_SOURCES: Record<string, readonly string[]> = {
  // Live-preview task rendering: checkboxes, keyword menu, date autocomplete,
  // task styling, plus the embedded list and the context menus it opens.
  'docs-editor': [
    'src/view/editor-extensions/**',
    'src/view/markdown-renderers/**',
    'src/view/embedded-task-list/**',
    'src/view/components/base-dropdown.ts',
    'src/view/components/date-picker-menu.ts',
    'src/view/components/state-menu-builder.ts',
    'src/view/components/task-context-menu.ts',
    'src/services/editor-controller.ts',
  ],
  // The task list panel: its own view plus the menus the panel opens.
  'docs-task-list': ['src/view/task-list/**', 'src/view/components/**'],
  // Reading mode: the reader formatter and the embedded task list.
  'docs-embedded-reader': [
    'src/view/markdown-renderers/**',
    'src/view/embedded-task-list/**',
    'src/view/components/task-context-menu.ts',
  ],
  // The search view and the suggestion dropdown it drives.
  'docs-search': [
    'src/search/**',
    'src/view/components/base-dropdown.ts',
    'src/view/components/search-options-dropdown.ts',
    'src/view/components/search-suggestion-dropdown.ts',
    'src/services/property-search-engine.ts',
  ],
  // The settings tab, which is plain Obsidian UI driven by these modules.
  'docs-settings': [
    'src/settings/**',
    'src/utils/settings-utils.ts',
    'src/utils/settings-migration.ts',
  ],
  // The dashboard code block and everything that draws a card.
  'docs-dashboards': ['src/view/embedded-dashboard/**'],
  // The archive dialog, and the service whose results it lists.
  'docs-auto-archive': [
    'src/view/components/archive-dialog.ts',
    'src/view/components/base-dialog.ts',
    'src/services/archive-service.ts',
  ],
  // The collapse toggle: the embedded list renderer that draws the header,
  // the chevron and the collapsed footer.
  'docs-embedded-collapse': ['src/view/embedded-task-list/**'],
  // The warning arrows: the task list rows and the date badges they hang off.
  'docs-warning-periods': ['src/view/task-list/**'],
  // The hero GIF: typing in the editor, so the editor extensions again, plus
  // the natural-language date rewriting that the demo visibly depends on.
  'docs-task-entry': [
    'src/view/editor-extensions/**',
    'src/parser/natural-date-parser.ts',
    'src/services/smart-date-processor.ts',
  ],
};

/**
 * Resolve source patterns to the actual repo files they name.
 *
 * An exact pattern matches only itself; a pattern ending in `/**` matches
 * everything beneath that directory, recursively. Returned sorted and
 * de-duplicated so hash input is canonical regardless of pattern order, and a
 * pattern that matches nothing is dropped rather than throwing — the test
 * suite asserts the map has no dangling entries.
 */
/**
 * The plugin's own class names, harvested from source.
 *
 * These are the markers the stylesheet is attributed by, so they are derived
 * rather than listed: a component that starts creating `todoseq-new-thing`
 * claims its CSS with no edit to this file. Only the plugin's `todoseq-` /
 * `todo-` namespaced classes count — Obsidian's own (`.cm-editor`,
 * `.markdown-preview-view`) belong to Obsidian, so no scenario can claim them
 * and their rules fall through to the shared baseline every scenario hashes.
 *
 * Over-harvesting is safe and under-harvesting is not, so the pattern is
 * deliberately loose: a false marker costs a spurious stale row, while a
 * missed one would let a real restyle pass unchallenged.
 */
const PLUGIN_CLASS = /\b((?:todoseq|todo)-[a-z0-9]+(?:-[a-z0-9]+)*)\b/g;

/** Every plugin-namespaced class name mentioned by the given source files. */
export function pluginClassNames(sources: Record<string, string>): Set<string> {
  const found = new Set<string>();
  for (const content of Object.values(sources)) {
    for (const match of content.matchAll(PLUGIN_CLASS)) found.add(match[1]);
  }
  return found;
}

export function expandPluginSources(
  patterns: readonly string[],
  allFiles: readonly string[],
): string[] {
  const matched = new Set<string>();
  for (const pattern of patterns) {
    if (pattern.endsWith('/**')) {
      // -3, not -2: the marker is three characters, and leaving the slash on
      // would build a 'dir//' prefix that matches nothing at all.
      const prefix = pattern.slice(0, -3);
      for (const file of allFiles) {
        if (file.startsWith(`${prefix}/`)) matched.add(file);
      }
    } else if (allFiles.includes(pattern)) {
      matched.add(pattern);
    }
  }
  return [...matched].sort();
}
