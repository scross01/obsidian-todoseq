/**
 * Linter for screenshot seed content.
 *
 * The demo content rules in AGENTS.md are only worth writing down if something
 * checks them, because seeds rot quietly: nothing fails when a future scenario
 * adds an inline date or an H1, the pipeline still captures, and the docs end
 * up asserting a syntax TODOseq does not support.
 *
 * Pure and dependency-free so it is cheap to unit test — the guard in
 * tests/screenshot-seed-lint.test.ts runs it over every real seed.
 */

/** Which demo rule a problem violates. */
export type SeedRule =
  'todo-seq-syntax' | 'no-h1' | 'date-placement' | 'single-line-prose';

/** One violation, anchored to a line so the failure is fixable. */
export interface SeedProblem {
  rule: SeedRule;
  /** 1-based line number within the note. */
  line: number;
  /** The offending source line, trimmed. */
  text: string;
  /** Why it is wrong, phrased as the correction. */
  message: string;
}

/**
 * Built-in state keywords. Seeds are ours, so the built-in set is the whole
 * vocabulary — treating any capitalized word as a keyword would let prose pass
 * as a task and make the date-placement rule unenforceable.
 */
export const BUILT_IN_KEYWORDS = [
  'DOING',
  'NOW',
  'IN-PROGRESS',
  'TODO',
  'LATER',
  'WAIT',
  'WAITING',
  'DONE',
  'CANCELED',
  'CANCELLED',
  'ARCHIVED',
] as const;

const KEYWORD_ALT = BUILT_IN_KEYWORDS.join('|');

/** Optional list marker, then optional checkbox, then a state keyword. */
const TASK_LINE = new RegExp(
  `^\\s*(?:[-*+]\\s+|\\d+\\.\\s+)?(?:\\[[ xX]\\]\\s+)?(?:${KEYWORD_ALT})\\b`,
);

/** An org-style date: `<2026-10-01>`, `<2026-10-01 17:00>`, `<2026-03-05 Wed 07:00 .+1d>`. */
const ORG_DATE = /<\d{4}-\d{2}-\d{2}[^>]*>/;

/** A date carried on a keyword line, either standalone or after `<br>` in a table. */
const DATE_KEYWORD = /(?:SCHEDULED|DEADLINE|CLOSED|STARTED)\s*:/i;

/** A standalone date line, which must sit immediately under its task. */
const DATE_LINE =
  /^\s*(?:SCHEDULED|DEADLINE)\s*:\s*[<[]|^\s*(?:CLOSED|STARTED)\s*:\s*\[/;

/**
 * A leading H1. Matches `# Title` and the no-space `#Title`, but not `##` or
 * deeper — a second `#` means a deeper heading, not an H1.
 */
const H1_LINE = /^#(?:[ \t]|[^#\s])/;

/** A checkbox item, keyword or not. */
const CHECKBOX_LINE = /^\s*[-*+]\s*\[[ xX]\]/;

/**
 * Emoji that signal state or dates in other plugins' conventions. TODOseq
 * carries both in the keyword and the date lines, so an emoji here is at best
 * decoration and at worst a second, contradictory claim about state.
 */
const FOREIGN_EMOJI = /[✅❌☑✔✖🗹⭕📅⏳🛫🛑➕🆔🔁🔺⏲🕒]/u;

/**
 * A prose line: plain text, not a heading, task, date, list item or blockquote.
 */
function isProse(line: string, isTask: boolean, isDateLine: boolean): boolean {
  return (
    !isTask && !isDateLine && !/^[#>\-*+\d]/.test(line) && !/^\s/.test(line)
  );
}

/**
 * Check one seeded note against the demo content rules.
 *
 * Fenced code blocks are skipped throughout: embed query blocks carry their own
 * bracket syntax, and a code sample may legitimately contain `#` or a date.
 */
export function lintSeedContent(content: string): SeedProblem[] {
  const problems: SeedProblem[] = [];
  const lines = content.split('\n');

  let inFence = false;
  // Nearest preceding non-blank line, and whether it was a task.
  let prevNonBlank = '';
  let prevWasTask = false;
  // Whether that line was prose, so a hard-wrapped continuation is detectable.
  let prevWasProse = false;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.trim();

    if (/^(?:```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence || line === '') continue;

    const isTask = TASK_LINE.test(line);
    const isCheckbox = CHECKBOX_LINE.test(line);
    const isIndentedSubtask = isCheckbox && /^\s/.test(raw);
    const isDateLine = DATE_LINE.test(line);

    // Rule: no H1. The file name is already the page's H1.
    if (H1_LINE.test(line)) {
      problems.push({
        rule: 'no-h1',
        line: i + 1,
        text: line,
        message:
          'H1 duplicates the file name, which Obsidian already renders at H1 size. Open with a line of content and use ## sub-headings.',
      });
    }

    // Rule: TODOseq syntax only — org dates belong on keyword lines.
    if (ORG_DATE.test(line) && !DATE_KEYWORD.test(line)) {
      problems.push({
        rule: 'todo-seq-syntax',
        line: i + 1,
        text: line,
        message:
          'org-style date outside a SCHEDULED:/DEADLINE:/CLOSED:/STARTED: line is not parsed by TODOseq and renders as dead text. Move it to its own line under the task.',
      });
    }

    if (FOREIGN_EMOJI.test(line)) {
      problems.push({
        rule: 'todo-seq-syntax',
        line: i + 1,
        text: line,
        message:
          'state/date emoji belongs to other task plugins. TODOseq carries state in the keyword and dates in the date lines.',
      });
    }

    // A checkbox with no keyword is not a task, unless it is an indented
    // subtask under a task (or another subtask, for chains).
    if (isCheckbox && !isTask) {
      const followsTaskOrSubtask =
        prevWasTask || (isIndentedSubtask && CHECKBOX_LINE.test(prevNonBlank));
      if (!followsTaskOrSubtask) {
        problems.push({
          rule: 'todo-seq-syntax',
          line: i + 1,
          text: line,
          message:
            'checkbox with no state keyword is not a TODOseq task. Add a keyword (e.g. `- [ ] TODO …`), or indent it under a parent task to make it a subtask.',
        });
      }
    }

    // Rule: date lines must sit immediately under the task they belong to.
    if (isDateLine) {
      const followsTask = prevWasTask;
      const followsDateOrDescription =
        DATE_LINE.test(prevNonBlank) || /^DESCRIPTION\s*:/i.test(prevNonBlank);
      if (!followsTask && !followsDateOrDescription) {
        problems.push({
          rule: 'date-placement',
          line: i + 1,
          text: line,
          message:
            'date line does not immediately follow its task. TODOseq only reads dates on the line(s) directly beneath the task.',
        });
      }
    }

    // Rule: prose paragraphs live on one source line. Obsidian renders each
    // source line as its own block, so wrapping a sentence mid-way to keep the
    // seed readable shows up in the screenshot as a gap through the paragraph.
    if (prevWasProse && isProse(line, isTask, isDateLine)) {
      problems.push({
        rule: 'single-line-prose',
        line: i + 1,
        text: line,
        message:
          'prose continues on a second source line, which renders as a visible gap mid-paragraph. Keep each paragraph on one line (a long line is the lesser evil) and let the editor soft-wrap it.',
      });
    }

    prevNonBlank = line;
    prevWasTask = isTask;
    prevWasProse = isProse(line, isTask, isDateLine);
  }

  return problems;
}

/**
 * Render problems for a failure message: note name, line, rule and the fix.
 * Empty string when there is nothing to report, so callers can concatenate.
 */
export function formatSeedProblems(
  problems: SeedProblem[],
  name: string,
): string {
  if (problems.length === 0) return '';
  return problems
    .map((p) => `${name}:${p.line}: [${p.rule}] ${p.message}\n    → ${p.text}`)
    .join('\n');
}
