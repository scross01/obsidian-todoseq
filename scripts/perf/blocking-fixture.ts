/**
 * Deterministic property-drawer density fixture.
 *
 * The base vault comes from generate-fixture.ts; this module only adds
 * property drawers and BLOCKER references in memory. That keeps the
 * baseline, occasional and heavy workloads byte-comparable while avoiding
 * any file I/O in the benchmark.
 */

import {
  DEFAULT_SEED,
  FIXED_TODAY,
  generateVault,
  GeneratedVault,
  PerfSize,
} from './generate-fixture';

export type BlockingDensity = 'baseline' | 'occasional' | 'heavy';

export interface BlockingFixture extends GeneratedVault {
  drawerCount: number;
  propertyCount: number;
  blockerCount: number;
}

const DEFAULT_KEYWORDS = '(?:TODO|DOING|DONE|WAITING)';
const MARKDOWN_TASK_LINE = new RegExp(
  `^([ \\t]*)(?:[-*+]|\\d+[.)])[ \\t]+(?:\\[[ xX]\\][ \\t]+)?${DEFAULT_KEYWORDS}\\b`,
);
const ORG_TASK_LINE = new RegExp(`^[ \\t]*\\*+[ \\t]+${DEFAULT_KEYWORDS}\\b`);
const DATE_LINE = /^[ \t]*(?:SCHEDULED|DEADLINE|CLOSED|STARTED|DESCRIPTION):/;
const TABLE_LINE = /^[ \t]*\|/;

function drawerLines(
  indent: string,
  id: string,
  blocker: string | undefined,
  ordered: boolean,
  heavy: boolean,
): string[] {
  const lines = [`${indent}:PROPERTIES:`, `${indent}:ID: ${id}`];
  if (blocker) lines.push(`${indent}:BLOCKER: ${blocker}`);
  if (ordered) lines.push(`${indent}:ORDERED: t`);
  if (heavy) {
    lines.push(`${indent}:OWNER: perf`, `${indent}:NOTES: generated`);
  }
  lines.push(`${indent}:END:`);
  return lines;
}

export function createBlockingFixture(
  size: PerfSize,
  density: BlockingDensity,
  seed = DEFAULT_SEED,
  today = FIXED_TODAY,
): BlockingFixture {
  const generated = generateVault(size, seed, today);
  if (density === 'baseline') {
    return {
      ...generated,
      drawerCount: 0,
      propertyCount: 0,
      blockerCount: 0,
    };
  }

  const heavy = density === 'heavy';
  let eligibleOrdinal = 0;
  let drawerCount = 0;
  let blockerCount = 0;
  let orderedCount = 0;
  let lastId: string | undefined;

  const files = generated.files.map((file) => {
    if (!file.path.endsWith('.md') && !file.path.endsWith('.org')) {
      return file;
    }

    const format = file.path.endsWith('.org') ? 'org' : 'markdown';
    const lines = file.content.split('\n');
    const insertions = new Map<number, string[]>();

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (format === 'markdown' && TABLE_LINE.test(line)) continue;

      const match =
        format === 'markdown'
          ? MARKDOWN_TASK_LINE.exec(line)
          : ORG_TASK_LINE.exec(line);
      if (!match) continue;

      const ordinal = eligibleOrdinal++;
      const hasDrawer = heavy || ordinal % 10 === 0;
      if (!hasDrawer) continue;

      const blockerCandidate = heavy ? ordinal % 2 === 0 : ordinal % 20 === 0;
      const blocker =
        blockerCandidate && lastId !== undefined ? lastId : undefined;
      const ordered = heavy && ordinal % 5 === 0;
      const id = `task-${String(drawerCount).padStart(5, '0')}`;
      const indent = format === 'org' ? '  ' : (match[1] ?? '');

      let insertAfter = i;
      if (format === 'markdown') {
        while (
          insertAfter + 1 < lines.length &&
          DATE_LINE.test(lines[insertAfter + 1])
        ) {
          insertAfter++;
        }
      }

      insertions.set(
        insertAfter,
        drawerLines(indent, id, blocker, ordered, heavy),
      );
      drawerCount++;
      if (blocker) blockerCount++;
      if (ordered) orderedCount++;
      lastId = id;
    }

    if (insertions.size === 0) return file;

    const output: string[] = [];
    for (let i = 0; i < lines.length; i++) {
      output.push(lines[i]);
      const insertion = insertions.get(i);
      if (insertion) output.push(...insertion);
    }
    return { path: file.path, content: output.join('\n') };
  });

  const propertyCount =
    drawerCount + blockerCount + orderedCount + (heavy ? drawerCount * 2 : 0);

  return {
    files,
    taskCount: generated.taskCount,
    drawerCount,
    propertyCount,
    blockerCount,
  };
}
