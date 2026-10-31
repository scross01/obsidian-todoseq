/**
 * Node benchmark entry (run via jest.perf.config.json, NOT the unit suite).
 *
 *   npm run perf:node                    # size m (2,500 tasks)
 *   PERF_SIZE=l npm run perf:node        # size l (10,000 tasks)
 *   PERF_ITERATIONS=30 npm run perf:node
 *
 * Report-only by design: numbers land in output/perf/ (local-only) and a
 * stdout table. There are no thresholds — the numbers are signals for
 * humans, never a gate (same philosophy as the screenshots staleness
 * check).
 */

import * as fs from 'fs';
import * as path from 'path';
import { PerfSize, PERF_SIZES } from './generate-fixture';
import {
  loadContext,
  measure,
  writeArtifact,
  formatTable,
  gitSha,
  DEFAULT_SEED,
} from './harness';
import { SCENARIOS } from './scenarios';

jest.setTimeout(30 * 60 * 1000); // size l over 15 iterations is minutes, not seconds

const size = (process.env.PERF_SIZE ?? 'm') as PerfSize;
const iterations = Number(process.env.PERF_ITERATIONS ?? 15);

describe(`node benchmarks (size=${size})`, () => {
  it(`runs every scenario and writes the artifact`, async () => {
    if (!PERF_SIZES.includes(size)) {
      throw new Error(`PERF_SIZE must be one of ${PERF_SIZES.join(', ')}`);
    }

    const loadStart = performance.now();
    const ctx = loadContext(size);
    const loadMs = performance.now() - loadStart;

    const results = [];
    for (const scenario of SCENARIOS) {
      results.push(
        await measure(scenario.name, iterations, () => scenario.runOnce(ctx)),
      );
    }

    const artifact = writeArtifact(size, {
      seed: DEFAULT_SEED,
      iterations,
      loadMs,
      taskCount: ctx.tasks.length,
      fileCount: ctx.files.length,
      scenarios: results,
    });

    process.stdout.write(
      `\nTODOseq node bench — size=${size} tasks=${ctx.tasks.length} ` +
        `files=${ctx.files.length} git=${gitSha()}\n` +
        formatTable(results) +
        `artifact: ${path.relative(process.cwd(), artifact)}\n` +
        `(fixture load ${loadMs.toFixed(0)}ms — not part of any scenario)\n\n`,
    );
    // The artifact must exist for the run to count as recorded.
    expect(fs.existsSync(artifact)).toBe(true);
  });
});
