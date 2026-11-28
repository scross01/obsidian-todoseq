/**
 * Executable contract for the fixture CLIs.
 *
 * These spawn the same local ts-node entry points the npm scripts use, write
 * only inside per-test temp directories, and compare the resulting bytes to the
 * maintained generator and the real parsers.
 */

import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { generateVault, PERF_SIZES } from '../scripts/perf/generate-fixture';
import { TaskParser } from '../src/parser/task-parser';
import { CodeCommentTaskParser } from '../src/parser/code-comment-task-parser';
import { OrgModeTaskParser } from '../src/parser/org-mode-task-parser';
import { Task } from '../src/types/task';
import {
  createBaseSettings,
  createTestKeywordManager,
} from './helpers/test-helper';

const ROOT = process.cwd();
const TS_NODE = path.join(ROOT, 'node_modules', '.bin', 'ts-node');
const CANONICAL = path.join(ROOT, 'scripts', 'perf', 'generate-fixture-cli.ts');
const ALIAS = path.join(ROOT, 'scripts', 'content-generator.ts');
const TODAY = '2026-11-10';
const TODAY_DATE = new Date(2026, 10, 10, 12, 0, 0);

interface CliResult {
  status: number | null;
  stdout: string;
  stderr: string;
}

function runCli(script: string, args: string[]): CliResult {
  const result = spawnSync(TS_NODE, [script, ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 30_000,
    env: { ...process.env, NODE_OPTIONS: '--no-warnings' },
  });
  if (result.error) throw result.error;
  return {
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

function tempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'todoseq-fixture-cli-'));
}

function readTree(root: string): Map<string, Buffer> {
  const files = new Map<string, Buffer>();
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else {
        files.set(
          path.relative(root, full).split(path.sep).join('/'),
          fs.readFileSync(full),
        );
      }
    }
  };
  walk(root);
  return files;
}

function expectBytesEqual(actualRoot: string, expectedRoot: string): void {
  const actual = readTree(actualRoot);
  const expected = readTree(expectedRoot);
  expect([...actual.keys()].sort()).toEqual([...expected.keys()].sort());
  for (const [relative, bytes] of expected) {
    expect(actual.get(relative)?.equals(bytes)).toBe(true);
  }
}

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

describe('fixture generator CLIs', () => {
  const dirs: string[] = [];

  function makeDir(): string {
    const dir = tempDir();
    dirs.push(dir);
    return dir;
  }

  afterEach(() => {
    while (dirs.length > 0) {
      fs.rmSync(dirs.pop()!, { recursive: true, force: true });
    }
  });

  it('both entry points write byte-identical generated corpora', () => {
    const canonicalOut = makeDir();
    const aliasOut = makeDir();
    const args = ['--size', 's', '--seed', '4242', '--today', TODAY];

    const canonical = runCli(CANONICAL, [...args, '--out', canonicalOut]);
    expect(canonical.status).toBe(0);
    expect(canonical.stderr).toBe('');

    const alias = runCli(ALIAS, [...args, '--out', aliasOut]);
    expect(alias.status).toBe(0);
    expect(alias.stderr).toContain('deprecated');
    expect(alias.stderr).toContain('npm run perf:fixture');

    expectBytesEqual(canonicalOut, aliasOut);
    const vault = generateVault('s', 4242, TODAY_DATE);
    expect(canonical.stdout).toContain(`${vault.files.length} files`);
    expect(canonical.stdout).toContain(`${vault.taskCount} tasks`);
    expect(alias.stdout).toContain(`${vault.files.length} files`);
    expect(alias.stdout).toContain(`${vault.taskCount} tasks`);
  });

  it('accepts --output and -o as equivalents of --out', () => {
    const longOut = makeDir();
    const shortOut = makeDir();
    const base = ['--size', 's', '--seed', '4242', '--today', TODAY];

    expect(runCli(CANONICAL, [...base, '--output', longOut]).status).toBe(0);
    expect(runCli(ALIAS, [...base, '-o', shortOut]).status).toBe(0);
    expectBytesEqual(longOut, shortOut);
  });

  it('prints help without requiring or creating output', () => {
    const out = path.join(makeDir(), 'not-created');
    for (const [script, deprecated] of [
      [CANONICAL, false],
      [ALIAS, true],
    ] as const) {
      const result = runCli(script, ['--help', '--out', out]);
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('--size');
      expect(result.stdout).toContain('--seed');
      expect(result.stdout).toContain('--today');
      expect(result.stdout).toContain('--out');
      expect(result.stderr.includes('deprecated')).toBe(deprecated);
      expect(fs.existsSync(out)).toBe(false);
    }
  });

  it.each([
    ['--files', '-f'],
    ['--length', '-l'],
    ['--tasks', '-t'],
  ])('rejects legacy count option %s before creating output', (flag) => {
    for (const script of [CANONICAL, ALIAS]) {
      const out = path.join(makeDir(), 'not-created');
      const result = runCli(script, [flag, '10', '--out', out]);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain(flag);
      expect(result.stderr).toContain('--size');
      expect(fs.existsSync(out)).toBe(false);
    }
  });

  it('rejects invalid, repeated and conflicting options before writing', () => {
    const cases: string[][] = [
      ['--size', 'xl', '--out', '<OUT>'],
      ['--seed', 'not-a-number', '--out', '<OUT>'],
      ['--seed', '1.5', '--out', '<OUT>'],
      ['--seed', 'Infinity', '--out', '<OUT>'],
      ['--today', '2026-02-31', '--out', '<OUT>'],
      ['--today', '2026-13-01', '--out', '<OUT>'],
      ['--today', '2026-2-3', '--out', '<OUT>'],
      ['--size', 's', '--size', 'm', '--out', '<OUT>'],
      ['--out', '<OUT>', '--output', '<OUT2>'],
      ['--bogus', '--out', '<OUT>'],
      ['--out'],
    ];

    for (const script of [CANONICAL, ALIAS]) {
      for (const args of cases) {
        const out = path.join(makeDir(), 'not-created');
        const other = path.join(makeDir(), 'not-created-other');
        const resolved = args.map((arg) =>
          arg === '<OUT>' ? out : arg === '<OUT2>' ? other : arg,
        );
        const result = runCli(script, resolved);
        expect(result.status).toBe(1);
        expect(fs.existsSync(out)).toBe(false);
        expect(fs.existsSync(other)).toBe(false);
      }
    }
  });

  it('writes the generator bytes and they parse back with real parsers', () => {
    const out = makeDir();
    const result = runCli(CANONICAL, [
      '--size',
      's',
      '--seed',
      '4242',
      '--today',
      TODAY,
      '--out',
      out,
    ]);
    expect(result.status).toBe(0);

    const expected = generateVault('s', 4242, TODAY_DATE);
    const actual = readTree(out);
    expect([...actual.keys()].sort()).toEqual(
      expected.files.map((file) => file.path).sort(),
    );
    for (const file of expected.files) {
      expect(actual.get(file.path)?.toString('utf8')).toBe(file.content);
    }

    const tasks = parseVault(expected);
    expect(tasks.length).toBe(expected.taskCount);
    expect(tasks.some((task) => task.scheduledDate !== null)).toBe(true);
    expect(tasks.some((task) => task.deadlineDate !== null)).toBe(true);
    expect(tasks.some((task) => task.scheduledDateRepeat !== null)).toBe(true);
    expect(tasks.some((task) => task.scheduledWarningPeriod !== null)).toBe(
      true,
    );
    expect(tasks.some((task) => task.path.endsWith('.org'))).toBe(true);
    expect(tasks.some((task) => task.path.endsWith('.ts'))).toBe(true);
    expect(PERF_SIZES).toEqual(['s', 'm', 'l']);
  });
});
