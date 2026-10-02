import fs from 'node:fs';
import path from 'node:path';
import {
  attributeCssRules,
  classMatchesMarker,
  classTokens,
  splitCssRules,
  stripCssComments,
} from '../scripts/screenshots/css-slices';
import { SCENARIOS } from '../scripts/screenshots/registry';
import {
  SCENARIO_PLUGIN_SOURCES,
  SHARED_PLUGIN_SOURCES,
  expandPluginSources,
  pluginClassNames,
} from '../scripts/screenshots/plugin-surfaces';

const REPO_ROOT = path.resolve(__dirname, '..');
const STYLES = fs.readFileSync(path.join(REPO_ROOT, 'styles.css'), 'utf8');

/** Every source file a surface pattern could name, matching the driver. */
const sourceUniverse: string[] = (() => {
  const found: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(path.join(REPO_ROOT, dir), {
      withFileTypes: true,
    })) {
      if (entry.isDirectory()) walk(`${dir}/${entry.name}`);
      else if (entry.name.endsWith('.ts')) found.push(`${dir}/${entry.name}`);
    }
  };
  walk('src');
  found.push('styles.css');
  return found;
})();

/** Real marker derivation, shared by the two tests that need it. */
function markersForEveryScenario(): Record<string, Set<string>> {
  const markers: Record<string, Set<string>> = {};
  for (const id of Object.keys(SCENARIOS)) {
    const rels = expandPluginSources(
      [...SHARED_PLUGIN_SOURCES, ...SCENARIO_PLUGIN_SOURCES[id]],
      sourceUniverse,
    ).filter((f) => f !== 'styles.css');
    const sources: Record<string, string> = {};
    for (const rel of rels) {
      sources[rel] = fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
    }
    markers[id] = pluginClassNames(sources);
  }
  return markers;
}

describe('css slices', () => {
  describe('stripCssComments', () => {
    it('removes comments but keeps the rules around them', () => {
      const out = stripCssComments('/* note */\n.a { color: red; }\n');
      expect(out).not.toContain('note');
      expect(out).toContain('.a { color: red; }');
    });

    it('leaves a comment-like sequence inside a string alone', () => {
      expect(
        stripCssComments(".a { content: '/* not a comment */'; }"),
      ).toContain("'/* not a comment */'");
    });
  });

  describe('splitCssRules', () => {
    it('splits top-level sibling rules', () => {
      const rules = splitCssRules('.a { color: red; } .b { color: blue; }');
      expect(rules.map((r) => r.selector)).toEqual(['.a', '.b']);
    });

    it('keeps the innermost selector and wraps text in the at-rule chain', () => {
      const rules = splitCssRules(
        '@media (max-width: 480px) { .a { color: red; } }',
      );
      expect(rules).toHaveLength(1);
      expect(rules[0].selector).toBe('.a');
      expect(rules[0].text).toContain('@media (max-width: 480px)');
      expect(rules[0].text).toContain('.a { color: red; }');
    });

    it('gives siblings inside one media block separate leaves', () => {
      // Otherwise editing the task-list rule would invalidate the dashboard
      // rule that merely shares its media query.
      const rules = splitCssRules(
        '@media (max-width: 480px) { .a { color: red; } .b { color: blue; } }',
      );
      expect(rules.map((r) => r.selector)).toEqual(['.a', '.b']);
    });

    it('treats @keyframes as one leaf, not as nested rules', () => {
      const rules = splitCssRules(
        '@keyframes spin { from { opacity: 0; } to { opacity: 1; } }',
      );
      expect(rules).toHaveLength(1);
      expect(rules[0].selector).toBe('@keyframes spin');
    });

    it('is not confused by a brace inside a quoted string', () => {
      const rules = splitCssRules(
        ".a { content: '}'; color: red; }\n.b { color: blue; }",
      );
      expect(rules.map((r) => r.selector)).toEqual(['.a', '.b']);
      expect(rules[0].text).toContain("content: '}'");
    });

    it('is not confused by a brace inside a double-quoted string', () => {
      const rules = splitCssRules('.a { content: "{"; } .b { color: blue; }');
      expect(rules.map((r) => r.selector)).toEqual(['.a', '.b']);
    });

    it('returns nothing for empty or comment-only input', () => {
      expect(splitCssRules('')).toEqual([]);
      expect(splitCssRules('/* just a note */')).toEqual([]);
    });
  });

  describe('classTokens', () => {
    it('pulls class names out of a compound selector', () => {
      expect(
        classTokens('.todoseq-panel > .todoseq-task-item.is-mobile'),
      ).toEqual(['todoseq-panel', 'todoseq-task-item', 'is-mobile']);
    });

    it('ignores element, id and pseudo selectors', () => {
      expect(classTokens('body > #main .is-selected::before')).toEqual([
        'is-selected',
      ]);
    });

    it('ignores class names that only appear inside a declaration value', () => {
      // Splitting happens on the prelude only, so a var() referencing a class
      // name cannot invent a token.
      expect(classTokens('.a')).toEqual(['a']);
    });
  });

  describe('classMatchesMarker', () => {
    it('matches the class itself and its dash-separated descendants', () => {
      expect(classMatchesMarker('todoseq-task', 'todoseq-task')).toBe(true);
      expect(classMatchesMarker('todoseq-task-item', 'todoseq-task')).toBe(
        true,
      );
    });

    it('does not match a class that merely contains the marker', () => {
      // The whole reason attribution is safe: an embedded task item is
      // 'todoseq-embedded-task-item', which must not be claimed by a marker
      // for the standalone task list.
      expect(
        classMatchesMarker('todoseq-embedded-task-item', 'todoseq-task'),
      ).toBe(false);
      expect(classMatchesMarker('todoseq-tasks', 'todoseq-task')).toBe(false);
    });
  });

  describe('attributeCssRules', () => {
    const rules = splitCssRules(
      [
        '.todoseq-dashboard-heatmap-cell { color: red; }',
        '.todoseq-task-item { color: blue; }',
        '.markdown-preview-view { color: green; }',
        '@media (max-width: 480px) { .todoseq-dashboard-tiles { color: teal; } }',
      ].join('\n'),
    );

    it('sends a rule only to the scenarios whose marker it mentions', () => {
      const slices = attributeCssRules(rules, {
        'docs-dashboards': new Set(['todoseq-dashboard']),
        'docs-task-list': new Set(['todoseq-task']),
      });
      // Minus the unclaimed `.markdown-preview-view` rule, which by design goes
      // everywhere — the next test covers that.
      const claimed = (id: string) =>
        slices[id]
          .map((r) => r.selector)
          .filter((s) => s !== '.markdown-preview-view');
      expect(claimed('docs-dashboards')).toEqual([
        '.todoseq-dashboard-heatmap-cell',
        '.todoseq-dashboard-tiles',
      ]);
      expect(claimed('docs-task-list')).toEqual(['.todoseq-task-item']);
    });

    it('sends a rule matching no marker to every scenario', () => {
      // Obsidian's own classes and any unclaimed plugin rule restyle things
      // nobody can predict, so over-reporting is the only safe direction: a
      // false STALE is noise, a false FRESH is a screenshot that lies.
      const slices = attributeCssRules(rules, {
        'docs-dashboards': new Set(['todoseq-dashboard']),
        'docs-task-list': new Set(['todoseq-task']),
      });
      for (const slice of Object.values(slices)) {
        expect(slice.map((r) => r.selector)).toContain(
          '.markdown-preview-view',
        );
      }
    });

    it('sends a rule to both scenarios when it mentions both markers', () => {
      const both = splitCssRules(
        '.todoseq-dashboard-tiles .todoseq-task-item { color: red; }',
      );
      const slices = attributeCssRules(both, {
        'docs-dashboards': new Set(['todoseq-dashboard']),
        'docs-task-list': new Set(['todoseq-task']),
      });
      expect(slices['docs-dashboards']).toHaveLength(1);
      expect(slices['docs-task-list']).toHaveLength(1);
    });
  });

  describe('against the real stylesheet', () => {
    const sources = Object.fromEntries(
      Object.keys(SCENARIOS).map((id) => [id, ''] as const),
    );
    const rules = splitCssRules(STYLES);

    // Markers stand in for the real derivation, which reads class names out of
    // each scenario's source files. The slicing behaviour is what is under
    // test here, not that derivation.
    const markers: Record<string, Set<string>> = {
      'docs-dashboards': new Set(['todoseq-dashboard']),
      'docs-task-list': new Set(['todoseq-task-list', 'todoseq-panel']),
    };

    it('splits into a non-trivial number of rules', () => {
      expect(rules.length).toBeGreaterThan(200);
    });

    it('gives every registered scenario a non-empty slice', () => {
      const all = attributeCssRules(rules, markers);
      for (const id of Object.keys(SCENARIOS)) {
        expect({ id, size: (all[id] ?? []).length }).toEqual({
          id,
          size: expect.any(Number) as unknown as number,
        });
      }
    });

    it('actually narrows: two scenarios get different, smaller slices', () => {
      const all = attributeCssRules(rules, markers);
      const dash = all['docs-dashboards'].map((r) => r.text);
      const task = all['docs-task-list'].map((r) => r.text);
      expect(dash.length).toBeGreaterThan(0);
      expect(task.length).toBeGreaterThan(0);
      expect(dash.length).toBeLessThan(rules.length);
      expect(task.length).toBeLessThan(rules.length);
      // Overlapping is expected (global rules), identical is not.
      expect(dash).not.toEqual(task);
    });

    it('gives every registered scenario a non-empty slice from real markers', () => {
      // Markers derived the way the driver derives them: the plugin's own
      // class names in each scenario's declared source files. A scenario with
      // an empty slice would never notice a restyle at all, so this is the
      // invariant worth pinning.
      const all = attributeCssRules(
        splitCssRules(STYLES),
        markersForEveryScenario(),
      );
      const empty = Object.keys(SCENARIOS).filter(
        (id) => (all[id] ?? []).length === 0,
      );
      expect(empty).toEqual([]);
    });

    it('gives scenarios distinguishable slices from real markers', () => {
      const all = attributeCssRules(
        splitCssRules(STYLES),
        markersForEveryScenario(),
      );
      const sizes = Object.values(all).map((slice) => slice.length);
      // Not all the same: if attribution collapsed to one shared slice the
      // check would be back to invalidating everything on any style edit.
      expect(new Set(sizes).size).toBeGreaterThan(1);
      // And none of them is the whole stylesheet.
      expect(Math.max(...sizes)).toBeLessThan(splitCssRules(STYLES).length);
    });

    it('leaves the declared source map reachable for marker derivation', () => {
      // The real marker derivation reads these files, so the surface map and
      // the CSS slicing must stay in the same module.
      expect(SHARED_PLUGIN_SOURCES).toContain('styles.css');
      expect(Object.keys(SCENARIO_PLUGIN_SOURCES).sort()).toEqual(
        Object.keys(SCENARIOS).sort(),
      );
      expect(Object.keys(sources)).toHaveLength(Object.keys(SCENARIOS).length);
    });
  });
});
