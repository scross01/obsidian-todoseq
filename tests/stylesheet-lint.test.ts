import fs from 'node:fs';
import path from 'node:path';
import { stripCssComments } from '../scripts/screenshots/css-slices';

/**
 * Stylesheet rules the plugin review enforces, as tests rather than comments.
 *
 * The Obsidian plugin community review flags `:has()` for broad selector
 * invalidation, and it is right to: a relational selector on a container
 * forces the engine to re-evaluate descendants whenever the subtree changes,
 * and this stylesheet applies to a list that re-renders constantly as tasks
 * stream in. The three rules that used it were expressing "this row is
 * completed" — information the renderer already knows when it builds the row.
 *
 * A lint that only exists in review feedback gets fixed once and then quietly
 * reintroduced by the next person who finds `:has()` is the shortest way to
 * write the selector. Failing here is cheaper than failing review again.
 */
const STYLES_PATH = path.resolve(__dirname, '..', 'styles.css');

describe('stylesheet lint', () => {
  const css = fs.readFileSync(STYLES_PATH, 'utf8');
  // Only selectors count. The comment explaining the ban names `:has()`, and
  // prose about a selector is not a use of it.
  const selectors = stripCssComments(css);

  describe('no relational selectors', () => {
    it('uses no :has() selectors', () => {
      const offenders = selectors
        .split('\n')
        .map((line, i) => ({ line: i + 1, text: line.trim() }))
        .filter((l) => l.text.includes(':has('));
      expect(offenders).toEqual([]);
    });

    it('mentions why :has() is banned, so the ban is not mysterious', () => {
      expect(css).toContain(':has(');
    });
  });
});
