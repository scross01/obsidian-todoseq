/**
 * Deterministic synthetic-vault generator for performance work.
 *
 * Produces markdown notes (task lists, date lines, tables with inline
 * `<br>` dates), org-mode outlines, and code files with TODO comments —
 * the same construct families the plugin parses in real vaults. Everything
 * derives from a seeded PRNG and an explicit `today`, so the same
 * (size, seed, today) triple always yields byte-identical output; that is
 * what makes profiling runs comparable across machines and commits.
 *
 * Used by:
 *   - scripts/perf/bench.ts        (in-memory node benchmarks)
 *   - tests/integration/perf.test.ts (seeded fixture vault for real-Obsidian runs)
 *   - CLI: npm run perf:fixture -- --size m --out output/perf/vault-m
 *
 * No imports from src/ or obsidian: this module must run under plain
 * ts-node as well as jest.
 */

export type PerfSize = 's' | 'm' | 'l';

export const PERF_SIZES: PerfSize[] = ['s', 'm', 'l'];

/** Shared across both profiling tiers: same seed + same local date. */
export const DEFAULT_SEED = 1337;
/** Local time only (no UTC methods) — both tiers must agree on the clock. */
export const FIXED_TODAY = new Date(2026, 10, 16, 12, 0, 0);

export interface FixtureFile {
  /** Vault-relative path, e.g. `notes/note-0007.md`. */
  path: string;
  content: string;
}

export interface GeneratedVault {
  files: FixtureFile[];
  /** Seeded task count across all files (list tasks, table cells, org tasks, code TODOs). */
  taskCount: number;
}

interface SizeSpec {
  mdFiles: number;
  orgFiles: number;
  codeFiles: number;
  /** Tasks per markdown file. */
  tasksPerMdFile: number;
  /** Tasks per org file. */
  tasksPerOrgFile: number;
  /** Tasks per code file. */
  tasksPerCodeFile: number;
}

const SPECS: Record<PerfSize, SizeSpec> = {
  // 250 tasks / 50 files
  s: {
    mdFiles: 45,
    orgFiles: 3,
    codeFiles: 2,
    tasksPerMdFile: 5,
    tasksPerOrgFile: 3,
    tasksPerCodeFile: 8,
  },
  // 2,500 tasks / 500 files
  m: {
    mdFiles: 450,
    orgFiles: 25,
    codeFiles: 25,
    tasksPerMdFile: 5,
    tasksPerOrgFile: 6,
    tasksPerCodeFile: 4,
  },
  // 10,000 tasks / 2,000 files
  l: {
    mdFiles: 1800,
    orgFiles: 100,
    codeFiles: 100,
    tasksPerMdFile: 5,
    tasksPerOrgFile: 4,
    tasksPerCodeFile: 6,
  },
};

/** Deterministic PRNG (mulberry32). */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Local-time date formatting only (AGENTS: never UTC methods in fixtures). */
function addDays(base: Date, days: number): Date {
  const d = new Date(base.getTime());
  d.setDate(d.getDate() + days);
  return d;
}

function fmtDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day} ${WEEKDAYS[d.getDay()]}`;
}

function fmtStamp(d: Date, hour: number, minute: number): string {
  return `${fmtDate(d)} ${String(hour).padStart(2, '0')}:${String(
    minute,
  ).padStart(2, '0')}`;
}

const VERBS = [
  'refactor',
  'review',
  'update',
  'document',
  'verify',
  'migrate',
  'clean up',
  'profile',
  'triage',
  'reproduce',
];
const NOUNS = [
  'the scanner pipeline',
  'the search tokenizer',
  'dashboard aggregation',
  'the editor decorations',
  'the recurrence coordinator',
  'the archive dialog',
  'the task list renderer',
  'the settings migration',
  'date-line inserts',
  'the keyword manager',
];
const FILLER = [
  'Plain prose lines like this one keep file sizes realistic so parsers pay',
  'their ordinary per-line costs instead of seeing only task-shaped content.',
  'A second filler sentence rounds out the paragraph with more non-task text.',
];

function pick<T>(rng: () => number, arr: T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}

function pickInt(rng: () => number, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

interface TaskSpec {
  keyword: string;
  checkbox: boolean;
  scheduled?: string;
  deadline?: string;
  started?: string;
  closed?: string;
}

function makeDateSuffix(
  rng: () => number,
  today: Date,
): { date: Date; repeat?: string; warning?: string } {
  // Past, current-week, and future dates; repeats and warning periods.
  const bucket = rng();
  let offset: number;
  if (bucket < 0.3) {
    offset = pickInt(rng, -30, -2);
  } else if (bucket < 0.7) {
    offset = pickInt(rng, 0, 6);
  } else {
    offset = pickInt(rng, 7, 60);
  }
  const date = addDays(today, offset);

  const roll = rng();
  let repeat: string | undefined;
  let warning: string | undefined;
  if (roll < 0.15) {
    repeat = pick(rng, ['+1d', '+1w']);
    if (rng() < 0.4) {
      warning = pick(rng, ['-3d', '-5d']);
    }
    if (rng() < 0.3) {
      warning = '--2d'; // first-only, combined form exercised by the parser
    }
  } else if (roll < 0.25) {
    warning = pick(rng, ['-1d', '-3d']);
  }
  return { date, repeat, warning };
}

function fmtDateLine(
  label: 'SCHEDULED' | 'DEADLINE',
  parts: ReturnType<typeof makeDateSuffix>,
): string {
  const inner =
    fmtDate(parts.date) +
    (parts.repeat ? ` ${parts.repeat}` : '') +
    (parts.warning ? ` ${parts.warning}` : '');
  return `${label}: <${inner}>`;
}

function makeListTask(
  rng: () => number,
  today: Date,
): { lines: string[]; count: number } {
  // Only DEFAULT keywords: INACTIVE (etc.) is user-configured and would
  // not parse back under a default KeywordManager.
  const keyword = pick(rng, ['TODO', 'DOING', 'DONE', 'WAITING']);
  const completed = keyword === 'DONE';
  const checkbox = rng() < 0.6;
  const marker = checkbox ? (completed ? '- [x] ' : '- [ ] ') : '- ';

  const spec: TaskSpec = { keyword, checkbox };
  const kind = rng();
  const sched = kind < 0.45 ? undefined : makeDateSuffix(rng, today);
  const dead = kind < 0.75 ? undefined : makeDateSuffix(rng, today);
  if (sched) spec.scheduled = fmtDateLine('SCHEDULED', sched);
  if (dead) spec.deadline = fmtDateLine('DEADLINE', dead);

  if (completed && rng() < 0.7) {
    spec.started = `STARTED: [${fmtStamp(addDays(today, -3), 9, 15)}]`;
    spec.closed = `CLOSED: [${fmtStamp(addDays(today, -1), 16, 45)}]`;
  } else if (!completed && rng() < 0.3) {
    spec.started = `STARTED: [${fmtStamp(addDays(today, -2), 10, 30)}]`;
  }

  const text = `${pick(rng, VERBS)} ${pick(rng, NOUNS)}`;
  const lines = [`${marker}${keyword} ${text}`];
  for (const dl of [spec.started, spec.scheduled, spec.deadline, spec.closed]) {
    if (dl) lines.push(`  ${dl}`);
  }
  return { lines, count: 1 };
}

function makeTableCellText(rng: () => number, today: Date): string {
  const keyword = pick(rng, ['TODO', 'DOING', 'DONE']);
  const text = `${pick(rng, VERBS)} ${pick(rng, NOUNS)}`;
  const parts: string[] = [`${keyword} ${text}`];
  const kind = rng();
  if (kind < 0.6) {
    const sched = makeDateSuffix(rng, today);
    const inner =
      fmtDate(sched.date) +
      (sched.repeat ? ` ${sched.repeat}` : '') +
      (sched.warning ? ` ${sched.warning}` : '');
    parts.push(`SCHEDULED: <${inner}>`);
  } else if (kind < 0.85) {
    const dead = makeDateSuffix(rng, today);
    const inner =
      fmtDate(dead.date) +
      (dead.repeat ? ` ${dead.repeat}` : '') +
      (dead.warning ? ` ${dead.warning}` : '');
    parts.push(`DEADLINE: <${inner}>`);
  }
  return parts.join('<br>');
}

function makeMdFile(
  index: number,
  rng: () => number,
  today: Date,
  spec: SizeSpec,
): { file: FixtureFile; count: number } {
  const lines: string[] = [`## Note ${index}`, ''];
  lines.push(pick(rng, FILLER), '');
  let count = 0;

  const isTableFile = index % 3 === 0;
  if (isTableFile) {
    // 2 rows x 2 task cells = 4 cell tasks, plus 1 list task.
    lines.push('| Task | Owner |', '| --- | --- |');
    for (let r = 0; r < 2; r++) {
      lines.push(
        `| ${makeTableCellText(rng, today)} | ${makeTableCellText(rng, today)} |`,
      );
      count += 2;
    }
    lines.push('');
    const t = makeListTask(rng, today);
    lines.push(...t.lines);
    count += t.count;
  } else {
    for (let i = 0; i < spec.tasksPerMdFile; i++) {
      const t = makeListTask(rng, today);
      lines.push(...t.lines);
      count += t.count;
    }
  }
  return {
    file: {
      path: `notes/note-${String(index).padStart(4, '0')}.md`,
      content: lines.join('\n') + '\n',
    },
    count,
  };
}

function makeOrgFile(
  index: number,
  rng: () => number,
  spec: SizeSpec,
): { file: FixtureFile; count: number } {
  const lines: string[] = [`* Inbox ${index}`];
  for (let i = 0; i < spec.tasksPerOrgFile; i++) {
    const keyword = pick(rng, ['TODO', 'DONE', 'WAITING']);
    const stars = i % 2 === 0 ? '**' : '***';
    lines.push(`${stars} ${keyword} ${pick(rng, VERBS)} ${pick(rng, NOUNS)}`);
  }
  return {
    file: {
      path: `org/outline-${String(index).padStart(4, '0')}.org`,
      content: lines.join('\n') + '\n',
    },
    count: spec.tasksPerOrgFile,
  };
}

function makeCodeFile(
  index: number,
  rng: () => number,
  spec: SizeSpec,
): { file: FixtureFile; count: number } {
  const lines: string[] = [
    `// Module ${index} — filler comments keep the file realistic.`,
    '',
    `export function seeded_${index}(n) {`,
    '  // filler: this comment is not a task',
    `  return n * ${index};`,
    '}',
    '',
  ];
  for (let i = 0; i < spec.tasksPerCodeFile; i++) {
    const keyword = rng() < 0.7 ? 'TODO' : 'DOING';
    lines.push(`// ${keyword}: ${pick(rng, VERBS)} ${pick(rng, NOUNS)}`);
  }
  return {
    file: {
      // TypeScript fixtures: `.ts` matches what plugin users actually
      // scan. Nothing in the harness may ever OPEN this file — the plugin
      // only scans it — because OS file associations for `.ts` (MPEG
      // Transport Stream) hand opened files to media players such as IINA.
      path: `scripts/code-${String(index).padStart(4, '0')}.ts`,
      content: lines.join('\n') + '\n',
    },
    count: spec.tasksPerCodeFile,
  };
}

/**
 * Generate a deterministic vault. Same (size, seed, today) => identical
 * bytes. `today` anchors every date so fixtures stay timezone-local and
 * explicit.
 */
export function generateVault(
  size: PerfSize,
  seed: number,
  today: Date,
): GeneratedVault {
  const spec = SPECS[size];
  const rng = mulberry32(seed);
  const files: FixtureFile[] = [];
  let taskCount = 0;

  for (let i = 0; i < spec.mdFiles; i++) {
    const { file, count } = makeMdFile(i, rng, today, spec);
    files.push(file);
    taskCount += count;
  }
  for (let i = 0; i < spec.orgFiles; i++) {
    const { file, count } = makeOrgFile(i, rng, spec);
    files.push(file);
    taskCount += count;
  }
  for (let i = 0; i < spec.codeFiles; i++) {
    const { file, count } = makeCodeFile(i, rng, spec);
    files.push(file);
    taskCount += count;
  }

  return { files, taskCount };
}
