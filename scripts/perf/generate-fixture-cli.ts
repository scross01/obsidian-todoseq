/**
 * Canonical CLI for writing the deterministic fixture vault.
 *
 *   npm run perf:fixture -- --size s --seed 4242 --today 2026-11-10 --out output/perf/vault-s
 *
 * All option parsing and corpus writing live in fixture-cli.ts so the
 * deprecated generate-content alias shares exactly one implementation.
 */

import { runFixtureCli } from './fixture-cli.ts';

process.exitCode = runFixtureCli(process.argv.slice(2), {
  stdout: (text) => process.stdout.write(text),
  stderr: (text) => process.stderr.write(text),
});
