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

/** Declarations of the rule whose selector list contains `selector`. */
function declarationsForSelector(css: string, selector: string): string | null {
  for (const { start, end } of rulePreludes(css)) {
    const prelude = css
      .slice(start, end)
      .split(',')
      .map((part) => part.trim().replace(/\s+/g, ' '));
    if (!prelude.includes(selector)) continue;
    const bodyStart = end + 1;
    return css.slice(bodyStart, css.indexOf('}', bodyStart));
  }
  return null;
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

  describe('readable text tokens', () => {
    it('uses the text-safe accent for keyword ink', () => {
      const readableAccent =
        /color:\s*color-mix\(\s*in srgb,\s*var\(--text-accent,\s*var\(--interactive-accent\)\)\s*80%,\s*var\(--text-normal\)/s;
      expect(selectors).toMatch(
        new RegExp(
          `\\.todoseq-keyword-formatted\\s*\\{[^}]*${readableAccent.source}`,
          's',
        ),
      );
      expect(selectors).toMatch(
        new RegExp(
          `\\.todoseq-panel \\.todo-task-keyword\\s*\\{[^}]*${readableAccent.source}`,
          's',
        ),
      );
    });

    it('does not paint completed text with the faint token', () => {
      expect(selectors).not.toMatch(
        /\.todoseq-panel \.todoseq-task-text\.completed\s*\{[^}]*color:\s*var\(--text-faint/s,
      );
      expect(selectors).not.toMatch(
        /\.todoseq-panel \.todoseq-task-item\.completed \.todo-task-keyword\s*\{[^}]*color:\s*var\(--text-faint/s,
      );
    });

    it('blends completed keyword ink into the background', () => {
      const completedAccent =
        /color:\s*color-mix\(\s*in srgb,\s*var\(--text-accent,\s*var\(--interactive-accent\)\)\s*55%,\s*var\(--background-primary\)/s;
      for (const selector of [
        '\\.todoseq-completed-keyword',
        '\\.todoseq-panel \\.todoseq-task-item\\.completed \\.todo-task-keyword',
        '\\.todoseq-table-task-keyword\\.todoseq-completed-keyword',
        '\\.todoseq-footnote-task-keyword\\.todoseq-completed-keyword',
      ]) {
        expect(selectors).toMatch(
          new RegExp(`${selector}\\s*\\{[^}]*${completedAccent.source}`, 's'),
        );
      }
    });

    it('blends archived keyword ink further into the background', () => {
      const archivedAccent =
        /color:\s*color-mix\(\s*in srgb,\s*var\(--text-accent,\s*var\(--interactive-accent\)\)\s*40%,\s*var\(--background-primary\)/s;
      for (const selector of [
        '\\.todoseq-archived-keyword',
        '\\.todoseq-table-task-keyword\\.todoseq-archived-keyword',
        '\\.todoseq-footnote-task-keyword\\.todoseq-archived-keyword',
      ]) {
        expect(selectors).toMatch(
          new RegExp(`${selector}\\s*\\{[^}]*${archivedAccent.source}`, 's'),
        );
      }
    });

    it('leaves embedded task-state keywords uncolored', () => {
      expect(selectors).toMatch(
        /\.todoseq-embedded-task-state\s*\{[^}]*color:\s*var\(--text-normal\)/s,
      );
      expect(selectors).not.toMatch(
        /\.todoseq-embedded-task-state\s*\{[^}]*color:[^;]*(?:--text-accent|--interactive-accent)/s,
      );
      expect(selectors).toMatch(
        /\.todoseq-embedded-task-completed \.todoseq-embedded-task-state\s*\{[^}]*color:\s*color-mix\(\s*in srgb,\s*var\(--text-muted\)\s*55%,\s*var\(--background-primary\)/s,
      );
      expect(selectors).not.toMatch(
        /\.todoseq-embedded-task-completed \.todoseq-embedded-task-state\s*\{[^}]*color:[^;]*(?:--text-accent|--interactive-accent)/s,
      );
    });

    it('qualifies state keyword ink so later context rules cannot override it', () => {
      for (const selector of [
        '\\.todoseq-keyword-formatted\\.todoseq-completed-keyword',
        '\\.todoseq-keyword-formatted\\.todoseq-archived-keyword',
      ]) {
        expect(selectors).toMatch(new RegExp(`${selector}\\s*\\{`, 's'));
      }
    });

    it('mutes priority badges on completed and archived task rows', () => {
      for (const selector of [
        '.todoseq-completed-task-text .todoseq-priority-badge',
        '.todoseq-panel .todoseq-task-item.completed .todoseq-priority-badge',
        '.todoseq-embedded-task-item.todoseq-embedded-task-completed .todoseq-priority-badge',
      ]) {
        const declarations = declarationsForSelector(selectors, selector);
        expect(declarations).not.toBeNull();
        expect(declarations).toMatch(
          /background-color:\s*var\(--background-modifier-border\);/,
        );
        expect(declarations).toMatch(/color:\s*var\(--text-muted\);/);
        expect(declarations).toMatch(/box-shadow:\s*none;/);
      }

      const archivedDeclarations = declarationsForSelector(
        selectors,
        '.todoseq-archived-task-text .todoseq-priority-badge',
      );
      expect(archivedDeclarations).not.toBeNull();
      expect(archivedDeclarations).toMatch(
        /background-color:\s*var\(--background-primary\);/,
      );
      expect(archivedDeclarations).toMatch(/color:\s*var\(--text-faint\);/);
      expect(archivedDeclarations).toMatch(
        /box-shadow:\s*inset 0 0 0 1px var\(--background-modifier-border\);/,
      );
    });

    it('fades completed title ink', () => {
      const completedInk =
        /color:\s*color-mix\(\s*in srgb,\s*var\(--text-muted\)\s*55%,\s*var\(--background-primary\)/s;
      for (const selector of [
        '\\.todoseq-panel \\.todoseq-task-text\\.completed',
        '\\.todoseq-completed-task-text',
        '\\.todoseq-embedded-task-completed \\.todoseq-embedded-task-text',
      ]) {
        expect(selectors).toMatch(
          new RegExp(`${selector}\\s*\\{[^}]*${completedInk.source}`, 's'),
        );
      }
    });

    it('fades archived title ink further than completed', () => {
      const archivedInk =
        /color:\s*color-mix\(\s*in srgb,\s*var\(--text-muted\)\s*40%,\s*var\(--background-primary\)/s;
      expect(selectors).toMatch(
        new RegExp(
          `\\.todoseq-archived-task-text\\s*\\{[^}]*${archivedInk.source}`,
          's',
        ),
      );
    });

    it('does not stack opacity on completed or archived text', () => {
      for (const selector of [
        '\\.todoseq-completed-task-text',
        '\\.todoseq-completed-keyword',
        '\\.todoseq-archived-task-text',
        '\\.todoseq-archived-keyword',
        '\\.todoseq-embedded-task-item\\.todoseq-embedded-task-completed',
      ]) {
        expect(selectors).not.toMatch(
          new RegExp(`${selector}\\s*\\{[^}]*opacity:`, 's'),
        );
      }
    });
  });
});
