import fs from 'node:fs';
import path from 'node:path';
import {
  SCENARIO_PLUGIN_SOURCES,
  SHARED_PLUGIN_SOURCES,
  expandPluginSources,
  pluginClassNames,
} from '../scripts/screenshots/plugin-surfaces';
import { SCENARIOS } from '../scripts/screenshots/registry';

const REPO_ROOT = path.resolve(__dirname, '..');

/** Every tracked-ish source file under a repo-relative directory. */
function listFiles(dir: string): string[] {
  const abs = path.join(REPO_ROOT, dir);
  if (!fs.existsSync(abs)) return [];
  return fs
    .readdirSync(abs, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith('.ts'))
    .map((e) =>
      path.posix.join(dir, path.relative(abs, path.join(e.parentPath, e.name))),
    )
    .sort();
}

describe('plugin surfaces', () => {
  describe('expandPluginSources', () => {
    const files = [
      'src/view/task-list/task-list-view.ts',
      'src/view/task-list/task-item-renderer.ts',
      'src/view/components/task-context-menu.ts',
      'src/services/archive-service.ts',
      'styles.css',
    ];

    it('matches an exact repo-relative path', () => {
      expect(
        expandPluginSources(
          ['src/view/components/task-context-menu.ts'],
          files,
        ),
      ).toEqual(['src/view/components/task-context-menu.ts']);
    });

    it('matches a /** pattern recursively, one directory level deep or more', () => {
      expect(expandPluginSources(['src/view/task-list/**'], files)).toEqual([
        'src/view/task-list/task-item-renderer.ts',
        'src/view/task-list/task-list-view.ts',
      ]);
    });

    it('does not match a /** pattern against a sibling directory prefix', () => {
      // 'src/view/task-list/**' must not pick up 'src/view/task-lister.ts'.
      const withSibling = [...files, 'src/view/task-lister.ts'];
      expect(
        expandPluginSources(['src/view/task-list/**'], withSibling),
      ).not.toContain('src/view/task-lister.ts');
    });

    it('de-duplicates and sorts, so hash input order is canonical', () => {
      const patterns = [
        'styles.css',
        'src/view/task-list/**',
        'src/view/task-list/task-list-view.ts',
      ];
      const first = expandPluginSources(patterns, files);
      const second = expandPluginSources([...patterns].reverse(), files);
      expect(first).toEqual(second);
      expect(first).toEqual([...new Set(first)].sort());
    });

    it('returns an empty list for a pattern matching nothing', () => {
      expect(expandPluginSources(['src/view/nope/**'], files)).toEqual([]);
    });
  });

  describe('SHARED_PLUGIN_SOURCES', () => {
    it('always includes styles.css, which can restyle any surface', () => {
      expect(SHARED_PLUGIN_SOURCES).toContain('styles.css');
    });

    it('is non-empty and free of duplicates', () => {
      expect(SHARED_PLUGIN_SOURCES.length).toBeGreaterThan(0);
      expect(new Set(SHARED_PLUGIN_SOURCES).size).toBe(
        SHARED_PLUGIN_SOURCES.length,
      );
    });
  });

  describe('SCENARIO_PLUGIN_SOURCES', () => {
    it('covers every registered scenario', () => {
      // A new scenario with no surface entry would silently hash nothing and
      // report FRESH forever, so the registry and the map must not drift.
      expect(Object.keys(SCENARIO_PLUGIN_SOURCES).sort()).toEqual(
        Object.keys(SCENARIOS).sort(),
      );
    });

    it('gives every scenario at least one source', () => {
      for (const [id, sources] of Object.entries(SCENARIO_PLUGIN_SOURCES)) {
        expect({ id, sources: sources.length > 0 }).toEqual({
          id,
          sources: true,
        });
      }
    });

    it('only names files that exist', () => {
      const all = [...listFiles('src'), 'styles.css'];
      for (const [id, patterns] of Object.entries(SCENARIO_PLUGIN_SOURCES)) {
        const resolved = expandPluginSources(
          [...SHARED_PLUGIN_SOURCES, ...patterns],
          all,
        );
        const dangling = patterns.filter(
          (p) => !p.includes('*') && !resolved.includes(p),
        );
        expect({ id, dangling }).toEqual({ id, dangling: [] });
      }
    });
  });

  describe('pluginClassNames', () => {
    it('pulls the plugin’s own class names out of source', () => {
      const found = pluginClassNames({
        'src/view/task-list/task-item-renderer.ts':
          "el.createDiv({ cls: 'todoseq-task-item todoseq-task-text' });\n" +
          "container.addClass('todoseq-panel');",
      });
      expect([...found].sort()).toEqual([
        'todoseq-panel',
        'todoseq-task-item',
        'todoseq-task-text',
      ]);
    });

    it('ignores Obsidian and generic class names', () => {
      // Not the plugin’s to attribute: Obsidian owns them, and no scenario
      // marker can claim them, so their rules fall through to the shared
      // baseline that every scenario hashes.
      const found = pluginClassNames({
        'a.ts': "addClass('cm-editor'); addClass('markdown-preview-view');",
      });
      expect([...found]).toEqual([]);
    });

    it('ignores command ids, which are not classes', () => {
      const found = pluginClassNames({
        'a.ts': "addCommand('todoseq:show-task-list'); id = 'todoseq-panel';",
      });
      expect([...found]).toEqual(['todoseq-panel']);
    });

    it('merges across a scenario’s source files', () => {
      const found = pluginClassNames({
        'a.ts': "addClass('todoseq-alpha');",
        'b.ts': "addClass('todoseq-beta');",
      });
      expect([...found].sort()).toEqual(['todoseq-alpha', 'todoseq-beta']);
    });
  });

  describe('rendering-layer coverage guard', () => {
    it('every src/view module is in some scenario surface', () => {
      // The whole point of narrowing the plugin build hash is to stop
      // non-visual churn from invalidating all 52 assets. The cost is that a
      // NEW view file could be left untracked and report FRESH wrongly — so
      // anything under src/view (pure rendering) must be claimed by a
      // scenario, and adding a view file forces a decision about which
      // screenshots it can change.
      const all = [...listFiles('src'), 'styles.css'];
      const claimed = new Set(
        Object.values(SCENARIO_PLUGIN_SOURCES).flatMap((patterns) =>
          expandPluginSources([...SHARED_PLUGIN_SOURCES, ...patterns], all),
        ),
      );
      const unclaimed = listFiles('src/view').filter((f) => !claimed.has(f));
      expect(unclaimed).toEqual([]);
    });
  });
});
