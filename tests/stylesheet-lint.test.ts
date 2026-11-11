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

/**
 * Selector preludes of every rule, as offsets into `css`.
 *
 * Only preludes are inspected so a declaration such as `padding: 0` can never
 * be mistaken for a selector. Rules inside `@media` / `@container` blocks are
 * included: a media-query-scoped rule is just as global as an unscoped one.
 */
function rulePreludes(css: string): Array<{ start: number; end: number }> {
  const out: Array<{ start: number; end: number }> = [];
  let start = 0;
  for (let i = 0; i < css.length; i++) {
    if (css[i] === '{') {
      out.push({ start, end: i });
      start = i + 1;
    } else if (css[i] === '}') {
      start = i + 1;
    }
  }
  return out;
}

function lineAt(css: string, index: number): number {
  return css.slice(0, index).split('\n').length;
}

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

  /**
   * Issue #90: a paragraph-level reset styled every `<p>` in the reading view
   * and outranked both theme rules and colour inherited from a plugin
   * container, so markdown that other plugins render inside a coloured
   * wrapper (Fantasy Statblocks trait names, for example) lost its colour.
   *
   * The reset had nothing to do: date-line styling lives on the
   * `<span class="todoseq-*-line">` that `ReaderFormatting.wrapDateKeyword`
   * creates, and `display: inline-block` confines it there. A paragraph rule
   * can only ever restyle paragraphs TODOseq does not own, so the stylesheet
   * never type-selects a paragraph: rules hang off TODOseq classes, and a
   * class-qualified `p.todoseq-x` or a `p` inside `:is()` is rejected just as
   * a bare `p` is.
   */
  describe('reading view scope', () => {
    it('never type-selects a paragraph element', () => {
      const offenders = rulePreludes(selectors).flatMap(({ start, end }) => {
        const prelude = selectors.slice(start, end);
        return [...prelude.matchAll(/(^|[\s,>+~(])p(?=[\s:.,{[)])/g)].map(
          (match) => ({
            line: lineAt(selectors, start + match.index + match[1].length),
            selector: prelude.trim().replace(/\s+/g, ' '),
          }),
        );
      });
      expect(offenders).toEqual([]);
      // Positive control: the date-line rules this guard protects must exist.
      // Deleting the styling instead of adding a bad selector would otherwise
      // leave the lint above green.
      expect(selectors).toContain(
        '.markdown-preview-view .todoseq-scheduled-line',
      );
    });
  });
});
