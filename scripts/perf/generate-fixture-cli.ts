/**
 * CLI wrapper around generateVault: writes a fixture vault to disk for
 * real-Obsidian profiling runs.
 *
 *   npx ts-node scripts/perf/generate-fixture-cli.ts --size m --out output/perf/vault-m
 *
 * Kept separate from generate-fixture.ts so that module stays pure — it is
 * imported by Playwright's runtime (tests/integration/perf.test.ts), where
 * a require.main guard would throw.
 */

import * as fs from 'fs';
import * as path from 'path';
import { generateVault, PERF_SIZES } from './generate-fixture.ts';
import type { PerfSize } from './generate-fixture.ts';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const arg = (name: string, fallback: string): string => {
    const i = args.indexOf(`--${name}`);
    return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
  };

  const size = arg('size', 'm') as PerfSize;
  if (!PERF_SIZES.includes(size)) {
    throw new Error(`--size must be one of ${PERF_SIZES.join(', ')}`);
  }
  const seed = Number(arg('seed', '1337'));
  const todayArg = arg('today', ''); // YYYY-MM-DD; defaults to local today
  const today = todayArg
    ? new Date(
        Number(todayArg.slice(0, 4)),
        Number(todayArg.slice(5, 7)) - 1,
        Number(todayArg.slice(8, 10)),
      )
    : new Date();
  const out = arg('out', '');
  if (!out) {
    throw new Error('--out <dir> is required');
  }

  const vault = generateVault(size, seed, today);
  for (const file of vault.files) {
    const dest = path.join(out, file.path);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, file.content);
  }
  process.stdout.write(
    `Wrote ${vault.files.length} files / ${vault.taskCount} tasks to ${out} ` +
      `(size=${size} seed=${seed})\n`,
  );
}

main().catch((err) => {
  process.stderr.write(`${String(err)}\n`);
  process.exit(1);
});
