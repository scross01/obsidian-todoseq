/**
 * Per-image feature tags for focused staleness review.
 *
 * A scenario's plugin hash is per scenario, not per pixel: editing any editor
 * source flags all eight editor assets, and the report says only "plugin build
 * changed". These tags let a contributor who knows which feature they touched
 * put the relevant stills first, while every other row stays visible as drift.
 *
 * Tags never affect hashing or exit status. They are metadata read by the
 * report, stored outside the scenario scripts and plugin surface declarations
 * so changing a tag alone cannot make an asset stale.
 *
 * Historical assets that are no longer captured have no entry and fall back to
 * the broad report.
 */
import { summarizeRows, type CheckRow } from './manifest.ts';

/**
 * The vocabulary a tag must come from. Kept as data so the report can validate
 * a selection and tests can assert catalogue coverage.
 */
export const FEATURE_TAGS = [
  'task-entry',
  'org-mode',
  'code-comment-scanning',
  'task-keywords',
  'task-state-transitions',
  'checkbox-interaction',
  'task-priority',
  'task-descriptions',
  'subtask-progress',
  'task-dates',
  'date-autocomplete',
  'date-picker',
  'smart-dates',
  'recurring-tasks',
  'date-tracking',
  'warning-periods',
  'task-context-menu',
  'task-navigation',
  'task-movement',
  'task-dependencies',
  'task-issues',
  'auto-archive',
  'editor-task-styling',
  'reader-task-styling',
  'property-drawers',
  'command-palette',
  'status-bar',
  'settings',
  'task-list',
  'task-list-filters',
  'task-sorting',
  'urgency',
  'vault-scanning',
  'search',
  'search-suggestions',
  'search-options',
  'saved-searches',
  'property-search',
  'embedded-task-list',
  'embedded-list-collapse',
  'dashboards',
  'dashboard-donut',
  'dashboard-tiles',
  'dashboard-heatmap',
  'dashboard-strip',
] as const;

export type FeatureTag = (typeof FEATURE_TAGS)[number];

const FEATURE_SET: ReadonlySet<string> = new Set(FEATURE_TAGS);

/** What a captured asset shows, and whether narrowing it is safe. */
export interface AssetFeature {
  /** Registry id that produces this asset. */
  scenarioId: string;
  tags: FeatureTag[];
  /**
   * Overview images whose content spans many features. A matching tag must not
   * hide them from the general list, because the crop cannot prove which part
   * of the frame a change affects.
   */
  broadReview: boolean;
}

/**
 * Catalogue of captured assets, keyed by base asset id.
 *
 * One entry covers both theme variants: the light capture is a generated twin
 * with a `-light` suffix, so `baseAssetId()` strips it. Scenario ids are here
 * so tests can check the catalogue against the registry.
 */
export const ASSET_FEATURES: Record<string, AssetFeature> = {
  'todoseq-editor-view': {
    scenarioId: 'docs-editor',
    tags: ['editor-task-styling', 'task-list', 'status-bar'],
    broadReview: true,
  },
  'todoseq-editor-task-styling': {
    scenarioId: 'docs-editor',
    tags: [
      'editor-task-styling',
      'task-keywords',
      'task-priority',
      'task-dates',
    ],
    broadReview: false,
  },
  'todoseq-editor-checkbox-interaction': {
    scenarioId: 'docs-editor',
    tags: ['checkbox-interaction', 'editor-task-styling'],
    broadReview: false,
  },
  'todoseq-editor-date-autocomplete': {
    scenarioId: 'docs-editor',
    tags: ['date-autocomplete'],
    broadReview: false,
  },
  'todoseq-editor-sidepanel-with-context-menu': {
    scenarioId: 'docs-task-list',
    tags: ['editor-task-styling', 'task-list', 'task-context-menu'],
    broadReview: true,
  },
  'todoseq-task-context-menu': {
    scenarioId: 'docs-task-list',
    tags: [
      'task-context-menu',
      'task-state-transitions',
      'task-priority',
      'task-dates',
      'task-movement',
    ],
    broadReview: false,
  },
  'todoseq-command-palette': {
    scenarioId: 'docs-task-list',
    tags: ['command-palette', 'task-list'],
    broadReview: false,
  },
  'todoseq-search-and-settings-toolbar': {
    scenarioId: 'docs-task-list',
    tags: ['task-list', 'search', 'search-options'],
    broadReview: false,
  },
  'todoseq-task-list-example': {
    scenarioId: 'docs-task-list',
    tags: [
      'task-list',
      'task-keywords',
      'task-dates',
      'task-priority',
      'checkbox-interaction',
    ],
    broadReview: false,
  },
  'todoseq-context-menu': {
    scenarioId: 'docs-task-list',
    tags: ['task-state-transitions', 'task-keywords'],
    broadReview: false,
  },
  'todoseq-date-picker': {
    scenarioId: 'docs-task-list',
    tags: ['date-picker', 'task-dates'],
    broadReview: false,
  },
  'todoseq-editor-embedded-tasklist': {
    scenarioId: 'docs-embedded-reader',
    tags: ['embedded-task-list', 'editor-task-styling'],
    broadReview: false,
  },
  'todoseq-embedded-list-example': {
    scenarioId: 'docs-embedded-reader',
    tags: ['embedded-task-list', 'task-dates', 'task-priority'],
    broadReview: false,
  },
  'todoseq-embedded-list-empty': {
    scenarioId: 'docs-embedded-reader',
    tags: ['embedded-task-list'],
    broadReview: false,
  },
  'todoseq-embedded-list-error': {
    scenarioId: 'docs-embedded-reader',
    tags: ['embedded-task-list'],
    broadReview: false,
  },
  'todoseq-reader-view': {
    scenarioId: 'docs-embedded-reader',
    tags: ['reader-task-styling', 'task-keywords', 'task-dates'],
    broadReview: false,
  },
  'todoseq-screenshot-dark': {
    // The intro hero (`intro-dark`) is live preview, not Reading view.
    scenarioId: 'docs-embedded-reader',
    tags: ['editor-task-styling', 'task-list'],
    broadReview: true,
  },
  'todoseq-search-options-menu': {
    scenarioId: 'docs-search',
    tags: [
      'search',
      'search-options',
      'saved-searches',
      'task-list-filters',
      'task-sorting',
    ],
    broadReview: false,
  },
  'todoseq-settings': {
    scenarioId: 'docs-settings',
    tags: ['settings'],
    broadReview: true,
  },
  'todoseq-dashboard-basic-usage': {
    scenarioId: 'docs-dashboards',
    tags: ['dashboards'],
    broadReview: false,
  },
  'todoseq-dashboard-example-donut': {
    scenarioId: 'docs-dashboards',
    tags: ['dashboards', 'dashboard-donut'],
    broadReview: false,
  },
  'todoseq-dashboard-example-tiles': {
    scenarioId: 'docs-dashboards',
    tags: ['dashboards', 'dashboard-tiles'],
    broadReview: false,
  },
  'todoseq-dashboard-example-heatmap': {
    scenarioId: 'docs-dashboards',
    tags: ['dashboards', 'dashboard-heatmap'],
    broadReview: false,
  },
  'todoseq-dashboard-example-strip': {
    scenarioId: 'docs-dashboards',
    tags: ['dashboards', 'dashboard-strip'],
    broadReview: false,
  },
  'todoseq-archive-dialog': {
    scenarioId: 'docs-auto-archive',
    tags: ['auto-archive'],
    broadReview: false,
  },
  'todoseq-warning-period-arrows': {
    scenarioId: 'docs-warning-periods',
    tags: ['warning-periods', 'task-dates', 'task-list'],
    broadReview: false,
  },
  'todoseq-task-dependency-blocked': {
    scenarioId: 'docs-task-dependencies',
    tags: ['task-dependencies', 'task-list'],
    broadReview: false,
  },
  'todoseq-task-dependency-issues': {
    scenarioId: 'docs-task-dependencies',
    tags: ['task-dependencies', 'task-issues', 'task-list'],
    broadReview: false,
  },
  'todoseq-org-properties-generated': {
    scenarioId: 'docs-org-properties',
    tags: ['property-drawers', 'task-dependencies', 'editor-task-styling'],
    broadReview: false,
  },
  'todoseq-embedded-collapse-collapsed': {
    scenarioId: 'docs-embedded-collapse',
    tags: ['embedded-task-list', 'embedded-list-collapse'],
    broadReview: false,
  },
  'todoseq-embedded-collapse-expanded': {
    scenarioId: 'docs-embedded-collapse',
    tags: ['embedded-task-list', 'embedded-list-collapse'],
    broadReview: false,
  },
  'todoseq-task-entry': {
    scenarioId: 'docs-task-entry',
    tags: [
      'task-entry',
      'editor-task-styling',
      'command-palette',
      'task-priority',
      'task-dates',
      'task-list',
      'task-state-transitions',
      'task-context-menu',
      'status-bar',
    ],
    broadReview: false,
  },
};

/** Asset filename or id → its catalogue key, without `-light` or extension. */
export function baseAssetId(filename: string): string {
  return filename
    .replace(/\.(png|jpe?g|webp|gif)$/i, '')
    .replace(/-light$/, '');
}

/** Catalogue entry for an asset, or undefined for historical/unknown output. */
export function featuresForAsset(filename: string): AssetFeature | undefined {
  return ASSET_FEATURES[baseAssetId(filename)];
}

/**
 * Parse `--features=<tag>[,<tag>...]`, rejecting anything that could silently
 * narrow or widen the review. Returns null when the flag is absent.
 *
 * Pure and called before the recorder is resolved, so a bad selection cannot
 * start a capture.
 */
export function parseFeatureSelection(
  args: readonly string[],
  checkMode: boolean,
): FeatureTag[] | null {
  const flags = args.filter(
    (arg) => arg === '--features' || arg.startsWith('--features='),
  );
  if (flags.length === 0) return null;
  if (flags.length > 1) {
    throw new Error('Pass --features only once.');
  }

  const flag = flags[0];
  if (!flag.startsWith('--features=')) {
    throw new Error('Use --features=<tag>[,<tag>...].');
  }
  if (!checkMode) {
    throw new Error(
      '--features requires --check; it narrows the staleness report only.',
    );
  }

  const raw = flag.slice('--features='.length);
  if (raw.trim() === '') {
    throw new Error('--features selection is empty.');
  }

  const tags: FeatureTag[] = [];
  for (const piece of raw.split(',')) {
    const tag = piece.trim();
    if (!tag) throw new Error('--features selection contains an empty tag.');
    if (!FEATURE_SET.has(tag)) {
      throw new Error(
        `Unknown feature "${tag}". Known features: ${FEATURE_TAGS.join(', ')}.`,
      );
    }
    const known = tag as FeatureTag;
    if (!tags.includes(known)) tags.push(known);
  }
  return tags;
}

/** Rows split for a focused review; every non-fresh row lands in one bucket. */
export interface FocusedFeatureReport {
  /** Plugin drift on assets tagged with a selected feature. */
  focused: CheckRow[];
  /** Plugin drift that is broad-review, untagged, unknown, or another feature. */
  outside: CheckRow[];
  /** Scenario, output, missing and reference diagnostics. */
  diagnostics: CheckRow[];
}

const PLUGIN_DRIFT = 'STALE (plugin build changed)';

/**
 * Which section each non-fresh row belongs to.
 *
 * Focus is advisory: it reorders and groups the same rows, and never hides one.
 * Broad-review and unknown-output rows stay in `outside` even when a tag
 * matches, because their crop cannot prove the change is visible-only there.
 */
export function groupCheckRows(
  rows: readonly CheckRow[],
  selected: readonly FeatureTag[],
): FocusedFeatureReport {
  const focused: CheckRow[] = [];
  const outside: CheckRow[] = [];
  const diagnostics: CheckRow[] = [];

  for (const row of rows) {
    if (row.status === 'FRESH') continue;
    if (row.status !== PLUGIN_DRIFT) {
      diagnostics.push(row);
      continue;
    }
    const entry = featuresForAsset(row.asset);
    const matches =
      entry !== undefined &&
      !entry.broadReview &&
      entry.tags.some((tag) => selected.includes(tag));
    if (matches) focused.push(row);
    else outside.push(row);
  }

  return { focused, outside, diagnostics };
}

/** Features with no catalogue entry at all, so an empty match cannot mislead. */
function featuresWithoutCaptures(
  selected: readonly FeatureTag[],
): FeatureTag[] {
  return selected.filter(
    (tag) =>
      !Object.values(ASSET_FEATURES).some((entry) => entry.tags.includes(tag)),
  );
}

function formatRows(rows: readonly CheckRow[]): string[] {
  if (rows.length === 0) return ['  none'];
  const width = Math.max(...rows.map((row) => row.asset.length));
  return rows.map((row) => `  ${row.asset.padEnd(width)}  ${row.status}`);
}

function totalsLine(rows: readonly CheckRow[]): string {
  const { fresh, bad } = summarizeRows([...rows]);
  return bad === 0
    ? `all ${fresh} fresh`
    : `${bad} stale/missing/unreferenced, ${fresh} fresh`;
}

/**
 * Focused view of the same report: matching plugin drift first, unrelated
 * plugin drift next, then every other diagnostic. Totals and exit semantics
 * stay identical to the plain report.
 */
export function formatFocusedReport(
  rows: readonly CheckRow[],
  selected: readonly FeatureTag[],
): string {
  const { focused, outside, diagnostics } = groupCheckRows(rows, selected);
  const lines: string[] = [`Focused review for: ${selected.join(', ')}`, ''];

  const uncaptured = featuresWithoutCaptures(selected);
  if (uncaptured.length > 0) {
    lines.push(
      `${uncaptured.join(', ')} has no dedicated capture — an empty match proves nothing about freshness.`,
      '',
    );
  }

  lines.push(`${focused.length} matching plugin-drift asset(s):`);
  lines.push(...formatRows(focused));
  lines.push('');

  lines.push(
    `${outside.length} plugin-drift asset(s) outside the selected features (still stale — broad review, untagged, or another feature):`,
  );
  lines.push(...formatRows(outside));
  lines.push('');

  lines.push(
    `${diagnostics.length} other row(s) — scenario drift, missing or unreferenced:`,
  );
  lines.push(...formatRows(diagnostics));
  lines.push('');

  lines.push(`Totals: ${totalsLine(rows)}`);
  return lines.join('\n');
}
