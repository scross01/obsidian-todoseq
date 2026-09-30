/**
 * Guard test: every todoseq / todoseq-dashboard code block shipped in
 * examples/ and docs/ must parse cleanly through the production block
 * parsers. A bad example query (unknown prefix, lowercase operator, unknown
 * priority value, calendar-invalid date, invalid option) ships a broken
 * result to every user who copies it, and historically rendered as a
 * silent "0 tasks" — so examples are validated at test time.
 *
 * Scope: *.md and *.canvas under examples/ and docs/ (dot-directories such
 * as docs/.vitepress build output are skipped). Canvas files store block
 * text inside JSON strings with escaped newlines, which are restored before
 * fence extraction.
 */
import * as fs from 'fs';
import * as path from 'path';
import { TodoseqCodeBlockParser } from '../src/view/embedded-task-list/code-block-parser';
import { TodoseqDashboardParser } from '../src/view/embedded-dashboard/dashboard-parser';

const REPO_ROOT = path.resolve(__dirname, '..');
const SCAN_DIRS = ['examples', 'docs'].map((dir) => path.join(REPO_ROOT, dir));

interface FencedBlock {
  lang: string;
  body: string;
}

interface BlockFailure {
  file: string;
  blockIndex: number;
  lang: string;
  detail: string;
}

function walkMarkdownAndCanvas(dir: string, out: string[] = []): string[] {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkMarkdownAndCanvas(full, out);
    } else if (/\.(md|canvas)$/i.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

/** Restore canvas JSON escaped newlines so fenced blocks are matchable. */
function readBlockSource(file: string): string {
  const content = fs.readFileSync(file, 'utf8');
  if (file.toLowerCase().endsWith('.canvas')) {
    return content.replace(/\\n/g, '\n');
  }
  return content;
}

export function extractFencedBlocks(content: string): FencedBlock[] {
  const blocks: FencedBlock[] = [];
  const fence = /```(\S*)\n([\s\S]*?)```/g;
  let match: RegExpExecArray | null;
  while ((match = fence.exec(content)) !== null) {
    const lang = match[1].toLowerCase();
    if (lang === 'todoseq' || lang === 'todoseq-dashboard') {
      blocks.push({ lang, body: match[2] });
    }
  }
  return blocks;
}

/** A block body deliberately shipped invalid to demo error handling. */
interface AllowedInvalidBlock {
  file: string;
  /** Exact body fingerprint — edits re-surface the block for review. */
  body: string;
  /** The documented error the block is expected to produce. */
  expectedErrorFragment: string;
}

/**
 * Error-handling examples under "## Error Handling" in Embedded Task Lists.md
 * intentionally ship invalid options to demonstrate the error UI. Each entry
 * pins the exact body and the error it must keep producing: if the example is
 * edited or the parser's message changes, this test flags it for review
 * rather than silently waving the block through.
 */
const ALLOWED_INVALID_BLOCKS: AllowedInvalidBlock[] = [
  {
    file: 'examples/Embedded Task Lists.md',
    body: 'sort: invalid',
    expectedErrorFragment: 'Invalid sort method: invalid',
  },
  {
    file: 'examples/Embedded Task Lists.md',
    body: 'show-future: invalid',
    expectedErrorFragment: 'Invalid show-future option: invalid',
  },
  {
    file: 'examples/Embedded Task Lists.md',
    body: 'show-completed: invalid',
    expectedErrorFragment: 'Invalid show-completed option: invalid',
  },
  {
    file: 'examples/Embedded Task Lists.md',
    body: 'limit: invalid',
    expectedErrorFragment: 'Invalid limit value: invalid',
  },
  {
    file: 'examples/Embedded Task Lists.md',
    body: 'search: path:examples file:"Task Examples"\nsort:keyword\nshow-query: false\ncollapse: true',
    expectedErrorFragment:
      'collapse option requires either title to be set or show-query to be enabled',
  },
];

function allowlistedInvalid(
  rel: string,
  body: string,
  error: string,
): AllowedInvalidBlock | undefined {
  const normalizedBody = body.trim();
  return ALLOWED_INVALID_BLOCKS.find(
    (allowed) =>
      allowed.file === rel &&
      allowed.body === normalizedBody &&
      error.includes(allowed.expectedErrorFragment),
  );
}

/** Parse a block body through its production parser; returns error or null. */
export function blockParseError(lang: string, body: string): string | null {
  if (lang === 'todoseq-dashboard') {
    return TodoseqDashboardParser.parse(body).error ?? null;
  }
  return TodoseqCodeBlockParser.parse(body).error ?? null;
}

describe('Example and docs block guard', () => {
  it('every shipped todoseq block parses cleanly (examples/ and docs/)', () => {
    const failures: BlockFailure[] = [];
    const matchedAllowed = new Set<AllowedInvalidBlock>();
    let filesScanned = 0;
    let blocksValidated = 0;

    for (const dir of SCAN_DIRS) {
      for (const file of walkMarkdownAndCanvas(dir)) {
        filesScanned++;
        const rel = path.relative(REPO_ROOT, file);
        let blocks: FencedBlock[];
        try {
          blocks = extractFencedBlocks(readBlockSource(file));
        } catch {
          continue; // unreadable file: not this test's concern
        }
        for (let i = 0; i < blocks.length; i++) {
          blocksValidated++;
          const error = blockParseError(blocks[i].lang, blocks[i].body);
          if (!error) continue;
          const allowed = allowlistedInvalid(rel, blocks[i].body, error);
          if (allowed) {
            matchedAllowed.add(allowed);
          } else {
            failures.push({
              file: rel,
              blockIndex: i + 1,
              lang: blocks[i].lang,
              detail: error,
            });
          }
        }
      }
    }

    // The walk must actually cover the corpus, or the guard is a no-op.
    expect(filesScanned).toBeGreaterThan(0);
    expect(blocksValidated).toBeGreaterThan(40);

    // Every allowlisted block must still exist in the corpus — otherwise the
    // allowlist silently outlives the examples it describes.
    const unmatchedAllowed = ALLOWED_INVALID_BLOCKS.filter(
      (allowed) => !matchedAllowed.has(allowed),
    );
    expect(unmatchedAllowed).toEqual([]);

    if (failures.length > 0) {
      const lines = [
        `${failures.length} shipped block(s) do not parse — fix the example or the parser:`,
        '',
      ];
      for (const f of failures) {
        lines.push(`${f.file} — block ${f.blockIndex} (${f.lang})`);
        lines.push(`  ${f.detail}`);
        lines.push('');
      }
      throw new Error(lines.join('\n'));
    }
  });

  it('canvas extraction finds the shipped canvas blocks', () => {
    const eisenhower = path.join(
      REPO_ROOT,
      'examples',
      'Eisenhower Matrix (Canvas).canvas',
    );
    const kanban = path.join(REPO_ROOT, 'examples', 'Kanban (Canvas).canvas');

    const eisenhowerBlocks = extractFencedBlocks(
      readBlockSource(eisenhower),
    ).filter((b) => b.body.includes('search:'));
    const kanbanBlocks = extractFencedBlocks(readBlockSource(kanban)).filter(
      (b) => b.body.includes('search:'),
    );

    expect(eisenhowerBlocks.length).toBe(4);
    expect(kanbanBlocks.length).toBe(3);
  });

  it('guard self-check: the production parsers reject known-bad queries', () => {
    // These pin the guard's detection power against regression drift in the
    // parsers themselves — if fail-loud validation ever stops rejecting
    // these, this test fails and the guard must be revisited.
    expect(blockParseError('todoseq', 'search: priority:urgent')).toContain(
      'Unknown priority value',
    );
    expect(
      blockParseError('todoseq', 'search: scheduled:2026-02-30'),
    ).toContain('Invalid date value');
    expect(blockParseError('todoseq', 'sort: bogus')).toContain(
      'Invalid sort method',
    );
    expect(blockParseError('todoseq-dashboard', 'search: tag:(((')).toContain(
      'Invalid search query',
    );
  });
});
