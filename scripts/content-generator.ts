#!/usr/bin/env node

/**
 * Deprecated alias for the deterministic fixture generator.
 *
 *   npm run generate-content -- --size s --seed 4242 --today 2026-11-10 --out /tmp/vault
 *
 * Replaces the retired Math.random corpus, whose priorities and inline dates
 * the plugin never parsed. Old --files/--length/--tasks counts are rejected
 * because they have no exact mapping to the fixed s/m/l presets.
 */

import { runFixtureCli } from './perf/fixture-cli.ts';

process.exitCode = runFixtureCli(
  process.argv.slice(2),
  {
    stdout: (text) => process.stdout.write(text),
    stderr: (text) => process.stderr.write(text),
  },
  { deprecatedAlias: true },
);
