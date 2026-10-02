/**
 * Splitting `styles.css` so each scenario only hashes the rules it can render.
 *
 * The stylesheet is one 100KB file, so hashing it wholesale marks all 52
 * assets stale after any style change — including a rule that only affects the
 * dashboard. Unlike the JS side there is no bundle to slice and no import
 * graph to follow, so the split is done on the stylesheet's own structure:
 * every top-level rule is parsed out, attributed to the scenarios whose class
 * names appear in its selector, and each scenario hashes only its own.
 *
 * The failure direction is chosen deliberately. A rule that names no known
 * marker — an Obsidian class like `.markdown-preview-view`, a bare `body`
 * rule, an unclaimed plugin class — is attributed to *every* scenario. That
 * means a real restyle is never missed at the cost of occasionally reporting a
 * stale row that was never going to change, which is noise rather than a lie.
 */

/** One leaf rule: its own selector, and its text with the at-rule chain. */
export interface CssRule {
  /**
   * The innermost selector, without any wrapping at-rules. `.markdown-preview-view`
   * rather than `@media (max-width: 480px) { .markdown-preview-view`.
   */
  selector: string;
  /**
   * Everything this rule contributes, at-rule chain included, so a shared
   * media query is part of the text but two rules sharing one are still
   * separately hashable.
   */
  text: string;
}

/** At-rules whose body contains further rules, so they are descended into. */
const NESTING_AT_RULES = /^@(media|supports|container|layer|scope|document)\b/i;

/**
 * Remove `/* … *\/` comments, leaving quoted strings intact.
 *
 * Needed before splitting so a brace inside a comment cannot be mistaken for a
 * rule boundary. The comment's own newlines are preserved so any later
 * line-oriented debugging still lines up with the real file.
 */
export function stripCssComments(css: string): string {
  let out = '';
  let i = 0;
  while (i < css.length) {
    const ch = css[i];
    if (ch === '"' || ch === "'") {
      const end = endOfString(css, i);
      out += css.slice(i, end);
      i = end;
    } else if (ch === '/' && css[i + 1] === '*') {
      const close = css.indexOf('*/', i + 2);
      const stop = close === -1 ? css.length : close + 2;
      // Keep the line count stable.
      out += css.slice(i, stop).replace(/[^\n]/g, ' ');
      i = stop;
    } else {
      out += ch;
      i++;
    }
  }
  return out;
}

/** Index just past the closing quote of the string starting at `start`. */
function endOfString(css: string, start: number): number {
  const quote = css[start];
  let i = start + 1;
  while (i < css.length) {
    if (css[i] === '\\') {
      i += 2;
      continue;
    }
    if (css[i] === quote) return i + 1;
    i++;
  }
  return css.length;
}

/** Index of the `}` closing the block opened before `from`, skipping strings. */
function findBlockEnd(css: string, from: number): number {
  let depth = 0;
  let i = from;
  while (i < css.length) {
    const ch = css[i];
    if (ch === '"' || ch === "'") {
      i = endOfString(css, i);
      continue;
    }
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return i;
    }
    i++;
  }
  return css.length;
}

/** Whether a body opens another block, i.e. holds rules rather than decls. */
function bodyHasNestedRules(body: string): boolean {
  let i = 0;
  while (i < body.length) {
    const ch = body[i];
    if (ch === '"' || ch === "'") {
      i = endOfString(body, i);
      continue;
    }
    if (ch === '{') return true;
    i++;
  }
  return false;
}

/**
 * Parse a stylesheet into leaf rules.
 *
 * Recurses through at-rules that wrap other rules, so a media query becomes
 * part of each leaf's `text` rather than a node of its own. `@keyframes` and
 * friends hold declarations, not rules, so they stay whole — a `from`/`to`
 * block is not a selector and must not be attributed.
 */
export function splitCssRules(css: string): CssRule[] {
  const rules: CssRule[] = [];
  walk(stripCssComments(css), [], rules);
  return rules;
}

function walk(css: string, ancestors: string[], out: CssRule[]): void {
  let i = 0;
  let start = 0;
  while (i < css.length) {
    const ch = css[i];
    if (ch === '"' || ch === "'") {
      i = endOfString(css, i);
      continue;
    }
    if (ch === '}') {
      i++;
      start = i;
      continue;
    }
    if (ch !== '{') {
      i++;
      continue;
    }
    const prelude = css.slice(start, i).trim();
    const close = findBlockEnd(css, i);
    const body = css.slice(i + 1, close);
    // Normalise the interior so indentation and comment padding never make two
    // visually identical rules hash differently.
    const inner = body.replace(/\s+/g, ' ').trim();

    if (prelude.startsWith('@')) {
      // Only the known grouping at-rules wrap other rules. @keyframes and
      // @font-face hold declarations, and descending into one would turn its
      // `from`/`to` blocks into selectors — which are not selectors, and would
      // then be attributed as if they were.
      if (NESTING_AT_RULES.test(prelude)) {
        walk(body, [...ancestors, prelude], out);
      } else {
        out.push({
          selector: prelude,
          text: [...ancestors, `${prelude} { ${inner} }`].join('\n'),
        });
      }
    } else if (bodyHasNestedRules(body)) {
      // Native CSS nesting inside a style rule: descend.
      walk(body, [...ancestors, prelude], out);
    } else {
      out.push({
        selector: prelude,
        text: [...ancestors, `${prelude} { ${inner} }`].join('\n'),
      });
    }
    i = close + 1;
    start = i;
  }
}

/** Class names appearing in a selector, in source order, de-duplicated. */
export function classTokens(selector: string): string[] {
  const found: string[] = [];
  for (const match of selector.matchAll(/\.(-?[A-Za-z_][\w-]*)/g)) {
    if (!found.includes(match[1])) found.push(match[1]);
  }
  return found;
}

/**
 * Whether a class name belongs to a marker.
 *
 * Exact, or a dash-separated extension of it. Matching on a bare prefix would
 * let `todoseq-task` claim `todoseq-embedded-task-item`, which is a different
 * component with different screenshots behind it.
 */
export function classMatchesMarker(className: string, marker: string): boolean {
  return className === marker || className.startsWith(`${marker}-`);
}

/**
 * Assign each rule to the scenarios whose markers its selector mentions.
 *
 * A rule claimed by no scenario goes to all of them, which is what makes a
 * missed marker fail safe: it costs a spurious stale row, not a screenshot
 * that silently stopped being checked.
 */
export function attributeCssRules(
  rules: readonly CssRule[],
  markersByScenario: Record<string, ReadonlySet<string>>,
): Record<string, CssRule[]> {
  const scenarioIds = Object.keys(markersByScenario);
  const slices: Record<string, CssRule[]> = Object.fromEntries(
    scenarioIds.map((id) => [id, []]),
  );
  for (const rule of rules) {
    const tokens = classTokens(rule.selector);
    const claimed = scenarioIds.filter((id) =>
      tokens.some((token) =>
        [...markersByScenario[id]].some((marker) =>
          classMatchesMarker(token, marker),
        ),
      ),
    );
    // Unclaimed rules are the shared baseline every scenario must see.
    for (const id of claimed.length > 0 ? claimed : scenarioIds) {
      slices[id].push(rule);
    }
  }
  return slices;
}
