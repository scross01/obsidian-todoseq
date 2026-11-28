/**
 * Blocking-density node benchmark.
 *
 * Compares baseline, occasional and heavy property-drawer vaults through
 * the same parse and dependency-rebuild paths. Report-only: no thresholds.
 */

import * as fs from 'fs';
import * as path from 'path';

import { BlockingDensity, createBlockingFixture } from './blocking-fixture';
import {
  createParsers,
  DEFAULT_SEED,
  formatTable,
  gitSha,
  measure,
  writeArtifact,
} from './harness';
import { PerfSize, PERF_SIZES } from './generate-fixture';
import { Task } from '../../src/types/task';
import { TaskStateManager } from '../../src/services/task-state-manager';
import { TaskDependencyManager } from '../../src/services/task-dependency-manager';
import { collectStructuralEntries } from '../../src/utils/task-structure-entries';
import type { StructuralEntry } from '../../src/types/task-structure';
import {
  createBaseSettings,
  createTestKeywordManager,
} from '../../tests/helpers/test-helper';

jest.setTimeout(30 * 60 * 1000);

const size = (process.env.PERF_SIZE ?? 'm') as PerfSize;
const iterations = Number(process.env.PERF_ITERATIONS ?? 15);

const DENSITIES: BlockingDensity[] = ['baseline', 'occasional', 'heavy'];

function parseVault(
  fixture: ReturnType<typeof createBlockingFixture>,
  parsers: ReturnType<typeof createParsers>,
): Task[] {
  const tasks: Task[] = [];
  for (const file of fixture.files) {
    if (file.path.endsWith('.md')) {
      tasks.push(...parsers.md.parseFile(file.content, file.path));
    } else if (file.path.endsWith('.org')) {
      tasks.push(...parsers.org.parseFile(file.content, file.path));
    } else {
      tasks.push(...parsers.code.parseFile(file.content, file.path));
    }
  }
  return tasks;
}

describe(`blocking benchmarks (size=${size})`, () => {
  it('runs both scenarios for every density and writes the artifact', async () => {
    if (!PERF_SIZES.includes(size)) {
      throw new Error(`PERF_SIZE must be one of ${PERF_SIZES.join(', ')}`);
    }

    const results = [];
    const counts: Record<
      string,
      { taskCount: number; drawerCount: number; blockerCount: number }
    > = {};

    for (const density of DENSITIES) {
      const fixture = createBlockingFixture(size, density);
      const settings = createBaseSettings({
        scanCodeFiles: true,
        detectOrgModeFiles: true,
        trackClosedDate: true,
        trackStartedDate: true,
      });
      const keywordManager = createTestKeywordManager(settings);
      const parsers = createParsers(settings);
      const tasks = parseVault(fixture, parsers);

      const entriesByPath = new Map<string, StructuralEntry[]>();
      for (const file of fixture.files) {
        if (file.path.endsWith('.md')) {
          entriesByPath.set(
            file.path,
            collectStructuralEntries(
              file.content,
              file.path,
              'markdown',
              keywordManager,
            ),
          );
        } else if (file.path.endsWith('.org')) {
          entriesByPath.set(
            file.path,
            collectStructuralEntries(
              file.content,
              file.path,
              'org',
              keywordManager,
            ),
          );
        }
      }

      const parsedIds = tasks.filter((task) => task.id !== undefined).length;
      const parsedBlockers = tasks.filter(
        (task) => (task.blockedBy?.length ?? 0) > 0,
      ).length;
      if (
        tasks.length !== fixture.taskCount ||
        parsedIds !== fixture.drawerCount ||
        parsedBlockers !== fixture.blockerCount
      ) {
        throw new Error(
          `blocking fixture mismatch (${density}): ` +
            `tasks ${tasks.length}/${fixture.taskCount}, ` +
            `ids ${parsedIds}/${fixture.drawerCount}, ` +
            `blockers ${parsedBlockers}/${fixture.blockerCount}`,
        );
      }

      counts[density] = {
        taskCount: fixture.taskCount,
        drawerCount: fixture.drawerCount,
        blockerCount: fixture.blockerCount,
      };

      results.push(
        await measure(
          `blocking-parse-${density}`,
          iterations,
          () => parseVault(fixture, parsers).length,
        ),
      );

      const state = new TaskStateManager(keywordManager);
      state.setTasks(tasks);
      const revision = state.getRevision();
      const manager = new TaskDependencyManager(state, {
        getStructuralSettings: () => ({ hierarchy: true, checkbox: true }),
        getStructureEntries: () => entriesByPath,
        getStructureRevision: () => 1,
      });
      manager.rebuild(tasks, revision);
      if (manager.getSnapshot().issues.length > 0) {
        throw new Error(
          `blocking fixture produced dependency issues (${density})`,
        );
      }

      results.push(
        await measure(`blocking-dependency-${density}`, iterations, () => {
          manager.rebuild(tasks, revision);
        }),
      );

      const defaultManager = new TaskDependencyManager(state, {
        getStructuralSettings: () => ({ hierarchy: false, checkbox: false }),
        getStructureEntries: () => entriesByPath,
        getStructureRevision: () => 1,
      });
      defaultManager.rebuild(tasks, revision);
      results.push(
        await measure(
          `blocking-dependency-default-${density}`,
          iterations,
          () => {
            defaultManager.rebuild(tasks, revision);
          },
        ),
      );
      defaultManager.destroy();
      manager.destroy();
    }

    const artifact = writeArtifact(
      size,
      {
        seed: DEFAULT_SEED,
        iterations,
        counts,
        scenarios: results,
      },
      'blocking',
    );

    process.stdout.write(
      `\nTODOseq blocking bench — size=${size} git=${gitSha()}\n` +
        formatTable(results) +
        `artifact: ${path.relative(process.cwd(), artifact)}\n\n`,
    );
    expect(fs.existsSync(artifact)).toBe(true);
  });
});
