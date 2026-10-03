import {
  classifyAsset,
  computePluginBuildHash,
  computeScenarioHash,
  formatCheckReport,
  summarizeRows,
  type CheckRow,
  type Manifest,
} from '../scripts/screenshots/manifest';

describe('screenshot manifest', () => {
  describe('computePluginBuildHash', () => {
    it('returns a stable sha256 over the same source set', () => {
      const first = computePluginBuildHash({
        'styles.css': 'css',
        'src/view/task-list/task-list-view.ts': 'view',
      });
      const second = computePluginBuildHash({
        'src/view/task-list/task-list-view.ts': 'view',
        'styles.css': 'css',
      });
      expect(first).toBe(second);
      expect(first).toMatch(/^[0-9a-f]{64}$/);
    });

    it('changes when any hashed source changes', () => {
      const base = computePluginBuildHash({
        'styles.css': 'css',
        'src/view/task-list/task-list-view.ts': 'view',
      });
      expect(
        computePluginBuildHash({
          'styles.css': 'css changed',
          'src/view/task-list/task-list-view.ts': 'view',
        }),
      ).not.toBe(base);
      expect(
        computePluginBuildHash({
          'styles.css': 'css',
          'src/view/task-list/task-list-view.ts': 'view changed',
        }),
      ).not.toBe(base);
    });

    it('changes when a source is added, i.e. a new surface claim', () => {
      const before = computePluginBuildHash({ 'styles.css': 'css' });
      const after = computePluginBuildHash({
        'styles.css': 'css',
        'src/view/embedded-dashboard/dashboard-renderer.ts': 'donut',
      });
      expect(after).not.toBe(before);
    });

    it('is order-independent over source entries', () => {
      const a = computePluginBuildHash({ 'a.ts': 'a', 'b.ts': 'b' });
      const b = computePluginBuildHash({ 'b.ts': 'b', 'a.ts': 'a' });
      expect(a).toBe(b);
    });

    it('separates path from content (no boundary-concatenation collisions)', () => {
      // Two files whose concatenated "path + content" could otherwise splice
      // into the same byte stream as a differently-split pair.
      const a = computePluginBuildHash({ 'a.ts': 'bc' });
      const b = computePluginBuildHash({ 'a.tsb': 'c' });
      expect(a).not.toBe(b);
    });

    it('distinguishes same content at different paths', () => {
      const a = computePluginBuildHash({ 'src/view/a.ts': 'same' });
      const b = computePluginBuildHash({ 'src/view/b.ts': 'same' });
      expect(a).not.toBe(b);
    });
  });

  describe('computeScenarioHash', () => {
    it('is stable for identical scenario definitions', () => {
      const scenario = {
        id: 'todoseq-editor-view',
        sources: { 'editor.ts': 'export default {}' },
        seed: { 'Projects/Website.md': '- [ ] ship it' },
      };
      const a = computeScenarioHash(scenario);
      const b = computeScenarioHash(scenario);
      expect(a).toBe(b);
      expect(a).toMatch(/^[0-9a-f]{64}$/);
    });

    it('changes when the seed content changes', () => {
      const a = computeScenarioHash({
        id: 'x',
        sources: { 's.ts': '' },
        seed: { 'Note.md': '- [ ] one' },
      });
      const b = computeScenarioHash({
        id: 'x',
        sources: { 's.ts': '' },
        seed: { 'Note.md': '- [ ] two' },
      });
      expect(a).not.toBe(b);
    });

    it('changes when a scenario source file changes', () => {
      const a = computeScenarioHash({
        id: 'x',
        sources: { 's.ts': 'one' },
        seed: {},
      });
      const b = computeScenarioHash({
        id: 'x',
        sources: { 's.ts': 'two' },
        seed: {},
      });
      expect(a).not.toBe(b);
    });

    it('changes when a SHARED source changes (helpers edit invalidates)', () => {
      // Scenario scripts delegate seeds/waits to helpers.ts. Hashing only the
      // scenario file would leave a helpers edit looking fresh.
      const base = { id: 'x', seed: {} };
      const a = computeScenarioHash({
        ...base,
        sources: { 's.ts': 'same', 'helpers.ts': 'export const SEEDS = {}' },
      });
      const b = computeScenarioHash({
        ...base,
        sources: {
          's.ts': 'same',
          'helpers.ts': 'export const SEEDS = { a: 1 }',
        },
      });
      expect(a).not.toBe(b);
    });

    it('is order-independent over source and seed entries', () => {
      const a = computeScenarioHash({
        id: 'x',
        sources: { 'a.ts': 'a', 'b.ts': 'b' },
        seed: { 'A.md': 'a', 'B.md': 'b' },
      });
      const b = computeScenarioHash({
        id: 'x',
        sources: { 'b.ts': 'b', 'a.ts': 'a' },
        seed: { 'B.md': 'b', 'A.md': 'a' },
      });
      expect(a).toBe(b);
    });

    it('normalizes resolved dates so hashes are stable across days', () => {
      // Seeds use dates relative to capture day; the hash must not change
      // just because the check runs on a different day than the capture.
      const a = computeScenarioHash({
        id: 'x',
        sources: { 's.ts': '' },
        seed: { 'Note.md': '- [ ] ship it ⏳ 2026-10-01 📅 2026-10-15' },
      });
      const b = computeScenarioHash({
        id: 'x',
        sources: { 's.ts': '' },
        seed: { 'Note.md': '- [ ] ship it ⏳ 2027-03-22 📅 2027-04-05' },
      });
      expect(a).toBe(b);
    });

    it('still changes when non-date content changes', () => {
      const a = computeScenarioHash({
        id: 'x',
        sources: { 's.ts': '' },
        seed: { 'Note.md': '- [ ] ship it ⏳ 2026-10-01' },
      });
      const b = computeScenarioHash({
        id: 'x',
        sources: { 's.ts': '' },
        seed: { 'Note.md': '- [ ] ship the thing ⏳ 2026-10-01' },
      });
      expect(a).not.toBe(b);
    });
  });

  describe('classifyAsset', () => {
    const pluginBuildHash = 'pbh-123';
    const scenarioHash = 'sh-456';

    it('reports FRESH for a manifest entry matching current hashes', () => {
      const entry: Manifest = {
        assets: {
          'todoseq-editor-view.png': {
            id: 'todoseq-editor-view',
            scenarioId: 'docs-editor',
            scenarioHash,
            pluginBuildHash,
            outputSha256: 'abc',
            capturedAt: '2026-10-01',
            capturedAtCommit: 'ed8df48',
          },
        },
      };
      expect(
        classifyAsset(entry, 'todoseq-editor-view.png', {
          scenarioHash,
          pluginBuildHash,
          outputSha256: 'abc',
        }),
      ).toBe('FRESH');
    });

    it('reports STALE (scenario changed) when the scenario hash differs', () => {
      const entry: Manifest = {
        assets: {
          'todoseq-editor-view.png': {
            id: 'todoseq-editor-view',
            scenarioId: 'docs-editor',
            scenarioHash,
            pluginBuildHash,
            outputSha256: 'abc',
            capturedAt: '2026-10-01',
            capturedAtCommit: 'ed8df48',
          },
        },
      };
      expect(
        classifyAsset(entry, 'todoseq-editor-view.png', {
          scenarioHash: 'sh-999',
          pluginBuildHash,
          outputSha256: 'abc',
        }),
      ).toBe('STALE (scenario changed)');
    });

    it('reports STALE (plugin build changed) when only the build hash differs', () => {
      const entry: Manifest = {
        assets: {
          'todoseq-editor-view.png': {
            id: 'todoseq-editor-view',
            scenarioId: 'docs-editor',
            scenarioHash,
            pluginBuildHash,
            outputSha256: 'abc',
            capturedAt: '2026-10-01',
            capturedAtCommit: 'ed8df48',
          },
        },
      };
      expect(
        classifyAsset(entry, 'todoseq-editor-view.png', {
          scenarioHash,
          pluginBuildHash: 'pbh-999',
          outputSha256: 'abc',
        }),
      ).toBe('STALE (plugin build changed)');
    });

    it('reports MISSING when the asset has no manifest entry', () => {
      expect(
        classifyAsset({ assets: {} }, 'todoseq-editor-view.png', {
          scenarioHash,
          pluginBuildHash,
          outputSha256: 'abc',
        }),
      ).toBe('MISSING');
    });

    it('reports STALE (output changed) when the on-disk file hash differs', () => {
      const entry: Manifest = {
        assets: {
          'todoseq-editor-view.png': {
            id: 'todoseq-editor-view',
            scenarioId: 'docs-editor',
            scenarioHash,
            pluginBuildHash,
            outputSha256: 'abc',
            capturedAt: '2026-10-01',
            capturedAtCommit: 'ed8df48',
          },
        },
      };
      expect(
        classifyAsset(entry, 'todoseq-editor-view.png', {
          scenarioHash,
          pluginBuildHash,
          outputSha256: 'def',
        }),
      ).toBe('STALE (output changed)');
    });
  });

  describe('summarizeRows', () => {
    it('counts only FRESH rows as good', () => {
      const rows: CheckRow[] = [
        { asset: 'a.png', status: 'FRESH' },
        { asset: 'b.png', status: 'FRESH' },
        { asset: 'c.png', status: 'STALE (plugin build changed)' },
        { asset: 'd.png', status: 'UNREFERENCED' },
      ];
      expect(summarizeRows(rows)).toEqual({ fresh: 2, bad: 2 });
    });

    it('reports zero of each for an empty run', () => {
      expect(summarizeRows([])).toEqual({ fresh: 0, bad: 0 });
    });
  });

  describe('formatCheckReport', () => {
    it('renders one aligned row per asset plus a summary', () => {
      const rows: CheckRow[] = [
        { asset: 'todoseq-editor-view.png', status: 'FRESH' },
        {
          asset: 'todoseq-settings.png',
          status: 'STALE (plugin build changed)',
        },
        { asset: 'todoseq-task-list-example.png', status: 'UNREFERENCED' },
        { asset: 'todoseq-search-options-menu.png', status: 'MISSING' },
      ];
      const report = formatCheckReport(rows);
      expect(report).toContain('todoseq-editor-view.png');
      expect(report).toContain('FRESH');
      expect(report).toContain('UNREFERENCED');
      expect(report).toMatch(/3 stale\/missing\/unreferenced, 1 fresh/);
    });

    it('returns an all-fresh summary when nothing is stale', () => {
      const report = formatCheckReport([{ asset: 'a.png', status: 'FRESH' }]);
      expect(report).toMatch(/all .*fresh/i);
    });
  });
});
