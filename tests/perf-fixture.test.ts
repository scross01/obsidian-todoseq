/**
 * Perf fixture generator contract.
 *
 * Repo convention check: only markdown fixture files may ever be opened
 * during a run; raw source fixtures (`.ts`, `.org`) are scan-only.
 *
 * The node bench runner (scripts/perf/bench.ts) and the in-Obsidian
 * profiling scenarios both seed their vaults from this generator, so its
 * determinism and its parseability by the REAL parsers are what make
 * profiling runs repeatable. If one of these pins fails, every number the
 * framework produces is suspect.
 */

import {
  generateVault,
  PERF_SIZES,
  PerfSize,
  FIXED_TODAY,
} from '../scripts/perf/generate-fixture';
import { TaskParser } from '../src/parser/task-parser';
import { CodeCommentTaskParser } from '../src/parser/code-comment-task-parser';
import { OrgModeTaskParser } from '../src/parser/org-mode-task-parser';
import { Task } from '../src/types/task';
import {
  createBaseSettings,
  createTestKeywordManager,
} from './helpers/test-helper';

// FIXED_TODAY is a local-time Date pinned inside the generator so both
// profiling tiers (node benches and real-Obsidian scenarios) see the
// same clock.

function parseVault(vault: ReturnType<typeof generateVault>): Task[] {
  const settings = createBaseSettings({
    scanCodeFiles: true,
    detectOrgModeFiles: true,
  });
  const keywordManager = createTestKeywordManager(settings);
  const mdParser = TaskParser.create(keywordManager, null, undefined, {
    includeCalloutBlocks: true,
    includeCodeBlocks: true,
    includeCommentBlocks: true,
  });
  const codeParser = CodeCommentTaskParser.create(keywordManager);
  const orgParser = OrgModeTaskParser.create(keywordManager, null);

  const tasks: Task[] = [];
  for (const file of vault.files) {
    if (file.path.endsWith('.md')) {
      tasks.push(...mdParser.parseFile(file.content, file.path));
    } else if (file.path.endsWith('.org')) {
      tasks.push(...orgParser.parseFile(file.content, file.path));
    } else {
      tasks.push(...codeParser.parseFile(file.content, file.path));
    }
  }
  return tasks;
}

describe('perf fixture generator', () => {
  it('is byte-deterministic for the same seed and date, and the seed changes the output', () => {
    const a = generateVault('s', 1337, FIXED_TODAY);
    const b = generateVault('s', 1337, FIXED_TODAY);
    expect(JSON.stringify(a.files)).toBe(JSON.stringify(b.files));
    expect(a.taskCount).toBe(b.taskCount);

    const other = generateVault('s', 1338, FIXED_TODAY);
    expect(JSON.stringify(other.files)).not.toBe(JSON.stringify(a.files));
  });

  it('seeds the documented task count for every size', () => {
    const counts: Record<PerfSize, number> = { s: 250, m: 2500, l: 10000 };
    for (const size of PERF_SIZES) {
      expect(generateVault(size, 1, FIXED_TODAY).taskCount).toBe(counts[size]);
    }
  });

  it('every seeded task parses back through the real parsers', () => {
    const vault = generateVault('s', 4242, FIXED_TODAY);
    const tasks = parseVault(vault);

    // The generator's advertised count is the parsers' detected count.
    expect(tasks.length).toBe(vault.taskCount);

    const states = new Set(tasks.map((t) => t.state));
    for (const keyword of ['TODO', 'DOING', 'DONE']) {
      expect(states).toContain(keyword);
    }

    // Every variant the generator emits is exercised by the parsers.
    const tableTasks = tasks.filter((t) => t.isTableTask);
    expect(tableTasks.length).toBeGreaterThan(0);
    expect(tableTasks.some((t) => t.scheduledDate !== null)).toBe(true);

    const dated = tasks.filter((t) => t.scheduledDate !== null);
    expect(dated.length).toBeGreaterThan(0);
    expect(dated.some((t) => t.scheduledDateRepeat !== null)).toBe(true);
    expect(dated.some((t) => t.scheduledWarningPeriod !== null)).toBe(true);

    expect(tasks.some((t) => t.deadlineDate !== null)).toBe(true);
    expect(tasks.some((t) => t.startedDate !== null)).toBe(true);
    expect(tasks.some((t) => t.closedDate !== null)).toBe(true);

    // All three file families contribute tasks.
    expect(tasks.some((t) => t.path.endsWith('.org'))).toBe(true);
    // Code family: TypeScript fixtures (`.ts`), matching real users' code
    // files. The harness must never OPEN these — only scan them — because
    // `.ts` is also the MPEG Transport Stream extension and OS file
    // associations would hand opened files to media players.
    expect(tasks.some((t) => t.path.endsWith('.ts'))).toBe(true);
    expect(tasks.some((t) => t.path.endsWith('.js'))).toBe(false);
    expect(tasks.some((t) => t.path.endsWith('.md'))).toBe(true);
  });
});
