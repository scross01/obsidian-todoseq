/**
 * Shared wiring for the node benchmark suite.
 *
 * Builds one real parser/keyword stack (no mocks of the code under test —
 * only the obsidian module is mapped, exactly like the unit suite), loads a
 * generated fixture vault, and provides the measurement + artifact helpers
 * the runner uses.
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

import {
  generateVault,
  FixtureFile,
  PerfSize,
  DEFAULT_SEED,
  FIXED_TODAY,
} from './generate-fixture';
import { TaskParser } from '../../src/parser/task-parser';
import { CodeCommentTaskParser } from '../../src/parser/code-comment-task-parser';
import { OrgModeTaskParser } from '../../src/parser/org-mode-task-parser';
import { Task } from '../../src/types/task';
import { TodoTrackerSettings } from '../../src/settings/settings-types';
import { KeywordManager } from '../../src/utils/keyword-manager';
import {
  createBaseSettings,
  createTestKeywordManager,
} from '../../tests/helpers/test-helper';

export { DEFAULT_SEED, FIXED_TODAY };

export interface BenchContext {
  today: Date;
  settings: TodoTrackerSettings;
  keywordManager: KeywordManager;
  parsers: {
    md: TaskParser;
    code: CodeCommentTaskParser;
    org: OrgModeTaskParser;
  };
  files: FixtureFile[];
  /** Every task the parsers detect across the fixture vault. */
  tasks: Task[];
}

export interface BenchScenario {
  /** Artifact-facing scenario name. */
  name: string;
  /** One measured pass. Must be idempotent. */
  runOnce(ctx: BenchContext): void | Promise<void>;
}

export interface ScenarioResult {
  name: string;
  iterations: number;
  medianMs: number;
  p95Ms: number;
  minMs: number;
  meanMs: number;
}

/** Fixed seed + fixed local date so runs are comparable across machines. */

export function createParsers(
  settings: TodoTrackerSettings,
): BenchContext['parsers'] {
  const keywordManager = createTestKeywordManager(settings);
  return {
    md: TaskParser.create(keywordManager, null, undefined, {
      includeCalloutBlocks: true,
      includeCodeBlocks: true,
      includeCommentBlocks: true,
    }),
    code: CodeCommentTaskParser.create(keywordManager),
    org: OrgModeTaskParser.create(keywordManager, null),
  };
}

export function loadContext(size: PerfSize): BenchContext {
  const today = FIXED_TODAY;
  const settings = createBaseSettings({
    scanCodeFiles: true,
    detectOrgModeFiles: true,
    trackClosedDate: true,
    trackStartedDate: true,
  });
  const keywordManager = createTestKeywordManager(settings);
  const parsers = createParsers(settings);
  const { files } = generateVault(size, DEFAULT_SEED, today);

  const tasks: Task[] = [];
  for (const file of files) {
    if (file.path.endsWith('.md')) {
      tasks.push(...parsers.md.parseFile(file.content, file.path));
    } else if (file.path.endsWith('.org')) {
      tasks.push(...parsers.org.parseFile(file.content, file.path));
    } else {
      tasks.push(...parsers.code.parseFile(file.content, file.path));
    }
  }

  return { today, settings, keywordManager, parsers, files, tasks };
}

function percentile(sorted: number[], p: number): number {
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1),
  );
  return sorted[idx];
}

/**
 * Time `fn`: 3 untimed warmup passes, then `iterations` timed passes.
 * Median is the headline number; p95 and min bracket the noise.
 */
export async function measure(
  name: string,
  iterations: number,
  fn: () => void | Promise<void>,
): Promise<ScenarioResult> {
  for (let i = 0; i < 3; i++) {
    await fn();
  }
  const samples: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    await fn();
    samples.push(performance.now() - start);
  }
  const sorted = [...samples].sort((a, b) => a - b);
  const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
  return {
    name,
    iterations,
    medianMs: percentile(sorted, 50),
    p95Ms: percentile(sorted, 95),
    minMs: sorted[0],
    meanMs: mean,
  };
}

export function gitSha(): string {
  try {
    return execSync('git rev-parse --short HEAD', {
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim();
  } catch {
    return 'unknown';
  }
}

/** Write the JSON artifact under the local-only output/ directory. */
export function writeArtifact(
  size: PerfSize,
  payload: Record<string, unknown>,
): string {
  const dir = path.join(process.cwd(), 'output', 'perf');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `node-${size}.json`);
  fs.writeFileSync(
    file,
    JSON.stringify(
      {
        kind: 'node-bench',
        size,
        gitSha: gitSha(),
        node: process.version,
        platform: `${process.platform}-${process.arch}`,
        recordedAt: new Date().toISOString(),
        ...payload,
      },
      null,
      2,
    ) + '\n',
  );
  return file;
}

export function formatTable(results: ScenarioResult[]): string {
  const rows = results.map((r) => [
    r.name,
    r.medianMs.toFixed(2),
    r.p95Ms.toFixed(2),
    r.minMs.toFixed(2),
    String(r.iterations),
  ]);
  const header = ['scenario', 'median ms', 'p95 ms', 'min ms', 'iters'];
  const widths = header.map((h, i) =>
    Math.max(h.length, ...rows.map((row) => row[i].length)),
  );
  const line = (cells: string[]): string =>
    cells.map((c, i) => c.padEnd(widths[i])).join('  ');
  return [line(header), ...rows.map(line)].join('\n') + '\n';
}
