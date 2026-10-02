import {
  formatSeedProblems,
  lintSeedContent,
  type SeedProblem,
} from '../scripts/screenshots/seed-lint';
import {
  ARCHIVE_SEEDS,
  DASHBOARD_SEEDS,
  DEMO_SEEDS,
  EDITOR_SEEDS,
  EMBED_SEEDS,
  SEARCH_FILTER_SEEDS,
  TASK_ENTRY_SEEDS,
} from '../scripts/screenshots/scenarios/helpers';

/**
 * The demo content rules from AGENTS.md, enforced rather than documented.
 *
 * Both rules exist because a real screenshot lied: an inline `<2026-10-01>` sat
 * in task text that TODOseq never parses, so the docs appeared to show inline
 * dates working; and every note opened with an `# H1` duplicating the file name
 * Obsidian already renders at that size.
 */

/** Every seeded note in the screenshot pipeline, by vault path. */
const ALL_SEEDS: Record<string, Record<string, string>> = {
  DEMO_SEEDS,
  SEARCH_FILTER_SEEDS,
  EDITOR_SEEDS,
  EMBED_SEEDS,
  TASK_ENTRY_SEEDS,
  DASHBOARD_SEEDS,
  ARCHIVE_SEEDS,
};

/** Flatten the seed maps into [vaultPath, content] pairs. */
function seededNotes(): Array<[string, string]> {
  return Object.entries(ALL_SEEDS).flatMap(([map, notes]) =>
    Object.entries(notes).map(
      ([path, content]) => [`${map}/${path}`, content] as [string, string],
    ),
  );
}

const rules = (
  problems: SeedProblem[],
  rule: SeedProblem['rule'],
): SeedProblem[] => problems.filter((p) => p.rule === rule);

describe('seed lint', () => {
  describe('TODOseq syntax only', () => {
    it('flags an org date left inline in task text', () => {
      // The bug this rule exists for: TODOseq reads dates only from
      // SCHEDULED/DEADLINE/CLOSED/STARTED lines, so this renders as dead text
      // that looks exactly like a working date.
      const problems = lintSeedContent(
        'TODO Finalize launch checklist #phoenix <2026-10-01>\nSCHEDULED: <2026-10-01>\n',
      );
      expect(rules(problems, 'todo-seq-syntax')).toHaveLength(1);
      expect(problems[0].line).toBe(1);
    });

    it('flags a bare checkbox line that carries no state keyword', () => {
      const problems = lintSeedContent(
        '- [ ] Just a checkbox with no keyword\n',
      );
      expect(rules(problems, 'todo-seq-syntax').map((p) => p.line)).toEqual([
        1,
      ]);
    });

    it('flags completion emoji as a second, contradictory state signal', () => {
      const problems = lintSeedContent('DONE Ship the release ✅\n');
      expect(rules(problems, 'todo-seq-syntax')).toHaveLength(1);
    });

    it('flags the Tasks plugin date emoji', () => {
      const problems = lintSeedContent('TODO Book flights 📅 2026-10-01\n');
      expect(rules(problems, 'todo-seq-syntax')).toHaveLength(1);
    });

    it('accepts dates on their own keyword lines', () => {
      const problems = lintSeedContent(
        [
          'TODO Finalize launch checklist #phoenix',
          'SCHEDULED: <2026-10-01>',
          'DOING Implement search filters',
          'DEADLINE: <2026-10-03 17:00>',
          'DONE Write integration suite',
          'CLOSED: [2026-09-30 Wed]',
          '',
        ].join('\n'),
      );
      expect(problems).toEqual([]);
    });

    it('accepts checkbox tasks that also carry a state keyword', () => {
      const problems = lintSeedContent(
        [
          '- [ ] TODO Task with empty checkbox',
          'SCHEDULED: <2026-10-01>',
          '',
        ].join('\n'),
      );
      expect(problems).toEqual([]);
    });

    it('accepts indented subtask checkboxes under a parent task', () => {
      const problems = lintSeedContent(
        [
          'TODO Parent task',
          '  - [ ] first step',
          '  - [ ] second step',
          '',
        ].join('\n'),
      );
      expect(problems).toEqual([]);
    });

    it('accepts a table cell date separated with <br>', () => {
      const problems = lintSeedContent(
        '| TODO feature<br>SCHEDULED: <2026-03-01> | DONE ship<br>CLOSED: [2026-03-02 Sat] |\n',
      );
      expect(problems).toEqual([]);
    });

    it('ignores org dates inside fenced code blocks', () => {
      // Embed query blocks legitimately carry their own bracket syntax.
      const problems = lintSeedContent(
        '```todoseq\nsearch: tag:phoenix\n```\n',
      );
      expect(problems).toEqual([]);
    });

    it('accepts a plain ISO date in prose, which is not a task date', () => {
      const problems = lintSeedContent(
        'Release notes for the 2026-10-01 cutover are drafted.\n',
      );
      expect(problems).toEqual([]);
    });
  });

  describe('no H1 in the note body', () => {
    it('flags an H1 duplicating the file name', () => {
      const problems = lintSeedContent('# Project Phoenix\n\nSome content.\n');
      expect(rules(problems, 'no-h1').map((p) => p.line)).toEqual([1]);
    });

    it('flags an H1 written without a space', () => {
      const problems = lintSeedContent('#Project Phoenix\n');
      expect(rules(problems, 'no-h1')).toHaveLength(1);
    });

    it('accepts H2 and deeper as structure', () => {
      const problems = lintSeedContent(
        [
          'Framing sentence first.',
          '',
          '## Launch',
          '',
          'TODO Something',
          '',
        ].join('\n'),
      );
      expect(problems).toEqual([]);
    });

    it('ignores H1-shaped text inside fenced code blocks', () => {
      const problems = lintSeedContent('```txt\n# not a heading\n```\n');
      expect(problems).toEqual([]);
    });
  });

  describe('date placement', () => {
    it('flags a date line that does not immediately follow a task', () => {
      const problems = lintSeedContent(
        [
          'TODO Write documentation',
          'Some text between',
          'SCHEDULED: <2026-01-15>',
          '',
        ].join('\n'),
      );
      expect(rules(problems, 'date-placement').map((p) => p.line)).toEqual([3]);
    });

    it('flags a date line with no task above it at all', () => {
      const problems = lintSeedContent('DEADLINE: <2026-01-15>\n');
      expect(rules(problems, 'date-placement')).toHaveLength(1);
    });

    it('accepts a date directly under its task', () => {
      const problems = lintSeedContent(
        [
          'TODO Write documentation',
          'SCHEDULED: <2026-01-15>',
          'DEADLINE: <2026-01-20>',
          '',
        ].join('\n'),
      );
      expect(problems).toEqual([]);
    });
  });

  describe('single-line prose', () => {
    it('flags a prose sentence hard-wrapped across source lines', () => {
      // CodeMirror renders each source line as its own block, so a mid-sentence
      // wrap shows up in the screenshot as a visible gap mid-paragraph.
      const problems = lintSeedContent(
        [
          'Tracking the work behind the Phoenix release. Tasks are',
          'declared with a state keyword beneath the task.',
          '',
        ].join('\n'),
      );
      expect(rules(problems, 'single-line-prose').map((p) => p.line)).toEqual([
        2,
      ]);
    });

    it('accepts a paragraph written on one long source line', () => {
      const problems = lintSeedContent(
        ['Tracking the work behind the Phoenix release.', ''].join('\n'),
      );
      expect(problems).toEqual([]);
    });

    it('accepts prose followed by a blank line and a heading', () => {
      const problems = lintSeedContent(
        ['Framing sentence.', '', '## Launch', '', 'TODO Something', ''].join(
          '\n',
        ),
      );
      expect(problems).toEqual([]);
    });

    it('does not mistake a task under prose for a wrapped line', () => {
      const problems = lintSeedContent(
        [
          'Framing sentence.',
          'TODO A task',
          'SCHEDULED: <2026-10-01>',
          '',
        ].join('\n'),
      );
      expect(problems).toEqual([]);
    });
  });

  describe('formatSeedProblems', () => {
    it('names the note, rule and line so the failure is actionable', () => {
      const report = formatSeedProblems(
        lintSeedContent('# Project Phoenix\n'),
        'DEMO_SEEDS/Project Phoenix.md',
      );
      expect(report).toContain('DEMO_SEEDS/Project Phoenix.md');
      expect(report).toContain('no-h1');
      expect(report).toContain(':1');
    });

    it('returns an empty string when there is nothing to report', () => {
      expect(formatSeedProblems([], 'whatever.md')).toBe('');
    });
  });
});

describe('screenshot seeds follow the demo content rules', () => {
  const notes = seededNotes();

  it('seeds every note in the pipeline (guard cannot pass vacuously)', () => {
    expect(notes.length).toBeGreaterThanOrEqual(10);
  });

  it.each(seededNotes())('%s uses TODOseq syntax only', (_name, content) => {
    expect(
      lintSeedContent(content).filter((p) => p.rule === 'todo-seq-syntax'),
    ).toEqual([]);
  });

  it.each(seededNotes())('%s has no H1 heading', (_name, content) => {
    expect(lintSeedContent(content).filter((p) => p.rule === 'no-h1')).toEqual(
      [],
    );
  });

  it.each(seededNotes())(
    '%s places date lines directly under their task',
    (_name, content) => {
      expect(
        lintSeedContent(content).filter((p) => p.rule === 'date-placement'),
      ).toEqual([]);
    },
  );

  it.each(seededNotes())(
    '%s keeps prose paragraphs on one source line',
    (_name, content) => {
      expect(
        lintSeedContent(content).filter((p) => p.rule === 'single-line-prose'),
      ).toEqual([]);
    },
  );
});
