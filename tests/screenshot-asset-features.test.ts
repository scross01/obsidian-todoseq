import fs from 'node:fs';
import path from 'node:path';
import {
  ASSET_FEATURES,
  FEATURE_TAGS,
  baseAssetId,
  featuresForAsset,
  formatFocusedReport,
  groupCheckRows,
  parseFeatureSelection,
} from '../scripts/screenshots/asset-features';
import {
  formatCheckReport,
  summarizeRows,
  type CheckRow,
} from '../scripts/screenshots/manifest';
import { SCENARIOS } from '../scripts/screenshots/registry';

const SCENARIOS_DIR = path.resolve(
  __dirname,
  '..',
  'scripts',
  'screenshots',
  'scenarios',
);

/** Every screenshot id a scenario script captures. */
function screenshotIds(script: string): string[] {
  const abs = path.join(SCENARIOS_DIR, script);
  const source = fs.readFileSync(abs, 'utf8');
  return [...source.matchAll(/id:\s*'(todoseq-[a-z0-9-]+)'/g)].map((m) => m[1]);
}

const PLUGIN_DRIFT = 'STALE (plugin build changed)';

describe('asset feature catalogue', () => {
  it('declares a unique, complete vocabulary', () => {
    expect(FEATURE_TAGS.length).toBe(45);
    expect(new Set(FEATURE_TAGS).size).toBe(FEATURE_TAGS.length);
  });

  it('assigns only vocabulary tags to real scenarios', () => {
    const vocabulary = new Set(FEATURE_TAGS);
    for (const [asset, entry] of Object.entries(ASSET_FEATURES)) {
      expect({
        asset,
        unknown: entry.tags.filter((tag) => !vocabulary.has(tag)),
        scenario: entry.scenarioId in SCENARIOS,
      }).toEqual({ asset, unknown: [], scenario: true });
      expect(typeof entry.broadReview).toBe('boolean');
    }
  });

  it('covers every still and GIF the registry currently captures', () => {
    for (const [scenarioId, def] of Object.entries(SCENARIOS)) {
      const ids = def.asset
        ? [path.basename(def.asset, path.extname(def.asset))]
        : screenshotIds(def.script);
      for (const id of ids) {
        expect({ id, entry: ASSET_FEATURES[id]?.scenarioId }).toEqual({
          id,
          entry: scenarioId,
        });
      }
    }
  });

  it('shares one entry between a capture and its generated light twin', () => {
    const entry = featuresForAsset(
      'todoseq-editor-date-autocomplete-light.png',
    );
    expect(entry).toEqual(
      featuresForAsset('todoseq-editor-date-autocomplete.png'),
    );
    expect(baseAssetId('todoseq-settings-light.png')).toBe('todoseq-settings');
  });

  it('returns no entry for a historical asset that is no longer captured', () => {
    const entry = featuresForAsset('todoseq-dashboard-display-forms.png');
    expect(entry).toBeUndefined();
  });

  it('marks overview images for broad review', () => {
    expect(ASSET_FEATURES['todoseq-editor-view'].broadReview).toBe(true);
    expect(ASSET_FEATURES['todoseq-settings'].broadReview).toBe(true);
    expect(ASSET_FEATURES['todoseq-editor-date-autocomplete'].broadReview).toBe(
      false,
    );
  });

  it('tags the intro hero as editor styling, not Reading view', () => {
    expect(ASSET_FEATURES['todoseq-screenshot-dark'].tags).toContain(
      'editor-task-styling',
    );
    expect(ASSET_FEATURES['todoseq-screenshot-dark'].tags).not.toContain(
      'reader-task-styling',
    );
  });
});

describe('parseFeatureSelection', () => {
  it('returns null when no selector was given', () => {
    expect(parseFeatureSelection(['--check'], true)).toBeNull();
  });

  it('accepts one or more known features in the documented form', () => {
    expect(
      parseFeatureSelection(['--check', '--features=search'], true),
    ).toEqual(['search']);
    expect(
      parseFeatureSelection(['--check', '--features=search,task-list'], true),
    ).toEqual(['search', 'task-list']);
  });

  it('de-duplicates repeated tags', () => {
    expect(
      parseFeatureSelection(['--check', '--features=search,search'], true),
    ).toEqual(['search']);
  });

  it('rejects an unknown feature', () => {
    expect(() =>
      parseFeatureSelection(['--check', '--features=nope'], true),
    ).toThrow(/nope/);
  });

  it('rejects an empty selection', () => {
    expect(() =>
      parseFeatureSelection(['--check', '--features='], true),
    ).toThrow(/empty/i);
    expect(() =>
      parseFeatureSelection(['--check', '--features=search,'], true),
    ).toThrow(/empty/i);
  });

  it('rejects the flag without a value', () => {
    expect(() =>
      parseFeatureSelection(['--check', '--features'], true),
    ).toThrow(/--features=/);
  });

  it('rejects duplicate flag occurrences', () => {
    expect(() =>
      parseFeatureSelection(
        ['--check', '--features=search', '--features=task-list'],
        true,
      ),
    ).toThrow(/once/i);
  });

  it('rejects --features unless --check is present', () => {
    expect(() => parseFeatureSelection(['--features=search'], false)).toThrow(
      /--check/,
    );
  });
});

describe('focused report grouping', () => {
  const rows: CheckRow[] = [
    { asset: 'todoseq-editor-date-autocomplete.png', status: PLUGIN_DRIFT },
    {
      asset: 'todoseq-editor-date-autocomplete-light.png',
      status: PLUGIN_DRIFT,
    },
    { asset: 'todoseq-editor-checkbox-interaction.png', status: PLUGIN_DRIFT },
    { asset: 'todoseq-editor-view.png', status: PLUGIN_DRIFT },
    { asset: 'todoseq-unknown-historical.png', status: PLUGIN_DRIFT },
    {
      asset: 'todoseq-dashboard-example-donut.png',
      status: 'STALE (scenario changed)',
    },
    {
      asset: 'todoseq-missing-historical.png',
      status: 'MISSING (no manifest entry)',
    },
    { asset: 'todoseq-settings.png', status: 'UNREFERENCED' },
    { asset: 'todoseq-task-entry.gif', status: 'FRESH' },
  ];

  it('prioritizes matching plugin drift, including the light twin', () => {
    const grouped = groupCheckRows(rows, ['date-autocomplete']);
    expect(grouped.focused.map((row) => row.asset)).toEqual([
      'todoseq-editor-date-autocomplete.png',
      'todoseq-editor-date-autocomplete-light.png',
    ]);
  });

  it('keeps unmatched plugin drift visible and separate', () => {
    const grouped = groupCheckRows(rows, ['date-autocomplete']);
    expect(grouped.outside.map((row) => row.asset)).toEqual([
      'todoseq-editor-checkbox-interaction.png',
      'todoseq-editor-view.png',
      'todoseq-unknown-historical.png',
    ]);
  });

  it('keeps scenario drift, broken references and broad review out of focus', () => {
    const grouped = groupCheckRows(rows, ['date-autocomplete']);
    expect(grouped.diagnostics.map((row) => row.asset)).toEqual([
      'todoseq-dashboard-example-donut.png',
      'todoseq-missing-historical.png',
      'todoseq-settings.png',
    ]);
  });

  it('accounts for every row exactly once', () => {
    const grouped = groupCheckRows(rows, ['date-autocomplete']);
    const fresh = rows.filter((row) => row.status === 'FRESH').length;
    expect(
      grouped.focused.length +
        grouped.outside.length +
        grouped.diagnostics.length +
        fresh,
    ).toBe(rows.length);
  });

  it('matches any selected tag without implying a hierarchy', () => {
    const grouped = groupCheckRows(rows, [
      'dashboard-donut',
      'date-autocomplete',
    ]);
    expect(grouped.focused.map((row) => row.asset)).toEqual([
      'todoseq-editor-date-autocomplete.png',
      'todoseq-editor-date-autocomplete-light.png',
    ]);
    expect(grouped.diagnostics.map((row) => row.asset)).toContain(
      'todoseq-dashboard-example-donut.png',
    );
  });

  it('keeps the plain totals and exit-relevant counts', () => {
    const report = formatFocusedReport(rows, ['date-autocomplete']);
    const totals = summarizeRows(rows);
    expect(report).toContain(
      `${totals.bad} stale/missing/unreferenced, ${totals.fresh} fresh`,
    );
    expect(formatCheckReport(rows)).toContain(
      `${totals.bad} stale/missing/unreferenced, ${totals.fresh} fresh`,
    );
  });

  it('says a feature with no captured asset proves nothing', () => {
    // `org-mode` is part of the vocabulary but no captured still is tagged
    // with it, so an empty match must not read as freshness.
    const report = formatFocusedReport(rows, ['org-mode']);
    expect(report).toMatch(/no dedicated capture/i);
  });
});
