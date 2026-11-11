/**
 * Shared executable contract for the deterministic fixture corpus.
 *
 * Both `npm run perf:fixture` and the deprecated `npm run generate-content`
 * entry points call this module. Parsing and validation finish before any
 * directory is created, so a rejected invocation leaves the filesystem alone.
 */

import * as fs from 'fs';
import * as path from 'path';
import { DEFAULT_SEED, generateVault, PERF_SIZES } from './generate-fixture.ts';
import type { PerfSize } from './generate-fixture.ts';

export interface FixtureCliIo {
  stdout: (text: string) => void;
  stderr: (text: string) => void;
}

export interface FixtureCliRunOptions {
  /** Print the migration warning for the retired generate-content command. */
  deprecatedAlias?: boolean;
}

interface FixtureCliGenerate {
  help: false;
  size: PerfSize;
  seed: number;
  today: Date;
  out: string;
}

interface FixtureCliHelp {
  help: true;
}

export type ParsedFixtureCliOptions = FixtureCliGenerate | FixtureCliHelp;

class FixtureCliError extends Error {}

const HELP = `Usage: npm run perf:fixture -- [options]

Write the deterministic performance fixture corpus (markdown, Org and code
files) to a directory. The output is byte-identical for the same size, seed
and local date.

Options:
  --size <s|m|l>          Corpus size preset (default: m)
  --seed <integer>        Deterministic PRNG seed (default: ${DEFAULT_SEED})
  --today <YYYY-MM-DD>    Local date used for every generated date
                          (default: local today)
  --out <dir>             Output directory (required)
  --output, -o <dir>      Aliases for --out
  -h, --help              Show this help without writing files

Examples:
  npm run perf:fixture -- --size s --seed 4242 --today 2026-11-10 --out output/perf/vault-s

The retired npm run generate-content command is a deprecated alias for this
runner. Old --files/--length/--tasks counts are rejected: they have no exact
mapping to the fixed s/m/l presets. Regeneration overwrites generated paths but
does not remove unrelated files already in the output directory.
`;

const DEPRECATION = `Warning: npm run generate-content is deprecated; use npm run perf:fixture instead.
Migration: replace --files/--length/--tasks with an explicit --size <s|m|l>.
`;

function fail(message: string): never {
  throw new FixtureCliError(message);
}

function parseLocalDate(value: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    fail(`--today must be a whole YYYY-MM-DD date, received "${value}"`);
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(0);
  date.setFullYear(year, month - 1, day);
  date.setHours(0, 0, 0, 0);
  if (
    date.getFullYear() !== year ||
    date.getMonth() + 1 !== month ||
    date.getDate() !== day
  ) {
    fail(`--today is not a real calendar date: "${value}"`);
  }
  return date;
}

/**
 * Parse and fully validate the executable argument list. Help short-circuits
 * before output is required; every other path returns a complete option set.
 */
export function parseFixtureCliOptions(
  args: string[],
): ParsedFixtureCliOptions {
  if (args.includes('-h') || args.includes('--help')) {
    return { help: true };
  }

  const seen = new Set<string>();
  const mark = (key: string, label: string): void => {
    if (seen.has(key)) {
      fail(`Option ${label} was provided more than once`);
    }
    seen.add(key);
  };
  const valueFor = (
    index: number,
    label: string,
    allowNegative = false,
  ): string => {
    const value = args[index + 1];
    if (value === undefined || (!allowNegative && value.startsWith('-'))) {
      fail(`Option ${label} requires a value`);
    }
    return value;
  };

  let size: PerfSize | undefined;
  let seed: number | undefined;
  let today: Date | undefined;
  let out: string | undefined;

  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    switch (arg) {
      case '--size': {
        mark('size', arg);
        const value = valueFor(index, arg);
        if (!PERF_SIZES.includes(value as PerfSize)) {
          fail(
            `--size must be one of ${PERF_SIZES.join(', ')}, received "${value}"`,
          );
        }
        size = value as PerfSize;
        index++;
        break;
      }
      case '--seed': {
        mark('seed', arg);
        const value = valueFor(index, arg, true);
        if (!/^[+-]?\d+$/.test(value)) {
          fail(`--seed must be a finite integer, received "${value}"`);
        }
        seed = Number(value);
        if (!Number.isSafeInteger(seed)) {
          fail(`--seed must be a finite integer, received "${value}"`);
        }
        index++;
        break;
      }
      case '--today': {
        mark('today', arg);
        today = parseLocalDate(valueFor(index, arg));
        index++;
        break;
      }
      case '--out':
      case '--output':
      case '-o': {
        mark('out', arg);
        out = valueFor(index, arg);
        index++;
        break;
      }
      case '--files':
      case '-f':
      case '--length':
      case '-l':
      case '--tasks':
      case '-t':
        fail(
          `Option ${arg} is not supported: custom counts have no exact mapping to the fixed s/m/l corpus. Use --size <s|m|l>.`,
        );
        break;
      default:
        fail(`Unknown option: ${arg}`);
    }
  }

  if (!out) fail('--out <dir> is required (or use --output/-o)');

  return {
    help: false,
    size: size ?? 'm',
    seed: seed ?? DEFAULT_SEED,
    today: today ?? new Date(),
    out,
  };
}

function dateLabel(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/**
 * Run the shared fixture CLI. Returns a process exit code; all diagnostics go
 * through the supplied IO so the entry points stay testable and tiny.
 */
export function runFixtureCli(
  args: string[],
  io: FixtureCliIo,
  options: FixtureCliRunOptions = {},
): number {
  if (options.deprecatedAlias) io.stderr(DEPRECATION);

  let parsed: ParsedFixtureCliOptions;
  try {
    parsed = parseFixtureCliOptions(args);
  } catch (error) {
    io.stderr(
      `Error: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    return 1;
  }

  if (parsed.help) {
    io.stdout(HELP);
    return 0;
  }

  try {
    const vault = generateVault(parsed.size, parsed.seed, parsed.today);
    const resolvedOut = path.resolve(parsed.out);
    const writes = vault.files.map((file) => {
      const dest = path.resolve(parsed.out, file.path);
      if (dest !== resolvedOut && !dest.startsWith(resolvedOut + path.sep)) {
        fail(`Generated path escapes the output directory: ${file.path}`);
      }
      return { dest, content: file.content };
    });

    fs.mkdirSync(parsed.out, { recursive: true });
    for (const file of writes) {
      fs.mkdirSync(path.dirname(file.dest), { recursive: true });
      fs.writeFileSync(file.dest, file.content, 'utf8');
    }
    io.stdout(
      `Wrote ${vault.files.length} files / ${vault.taskCount} tasks to ${parsed.out} ` +
        `(size=${parsed.size} seed=${parsed.seed} today=${dateLabel(parsed.today)})\n`,
    );
    return 0;
  } catch (error) {
    io.stderr(
      `Error: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    return 1;
  }
}
