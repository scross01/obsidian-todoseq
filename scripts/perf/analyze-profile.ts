/**
 * CPU-profile analyzer (plan 046 D3).
 *
 * Reproduces by script what the 2026-10-17 analysis did by hand: aggregate
 * a V8 `.cpuprofile`'s samples into self-time per `functionName @
 * file:line:col`, report plugin-frame share separately, and — for minified
 * `plugin:todoseq` frames — print a bounded slice of the production bundle
 * at that location so opaque names like `c L6:C1566` can be identified.
 *
 * CLI:
 *   npx ts-node scripts/perf/analyze-profile.ts <profile.cpuprofile> [topN]
 *     [--bundle path/to/main.js]
 *
 * Exit codes: 0 success, 1 unreadable/invalid profile (fail loud).
 */

import * as fs from 'fs';

/** The subset of a CDP `.cpuprofile` this tool reads. */
export interface RawProfile {
  nodes: Array<{
    id: number;
    callFrame: {
      functionName: string;
      url: string;
      lineNumber: number;
      columnNumber: number;
    };
  }>;
  samples: number[];
  timeDeltas?: number[];
}

export interface ProfileRow {
  functionName: string;
  url: string;
  /** 1-based display line (cpuprofile `lineNumber` is 0-based). */
  line: number;
  column: number;
  selfMs: number;
  /** Share of all sampled time. */
  sharePct: number;
  /** Share of plugin (`todoseq`) frames' self-time; null for non-plugin. */
  pluginSharePct: number | null;
  isPlugin: boolean;
  isPseudo: boolean;
}

/** V8 pseudo frames — native/idle buckets, not attributable to source. */
const PSEUDO_NAMES = new Set([
  '(idle)',
  '(program)',
  '(garbage collector)',
  '(root)',
]);

const PLUGIN_URL_MARKER = 'todoseq';

/**
 * Aggregate self-time per call frame. `timeDeltas[i]` is attributed to the
 * node sampled at `samples[i]` (V8 consecutive-sample convention).
 */
export function aggregateSelfTime(profile: RawProfile): ProfileRow[] {
  const nodesById = new Map(profile.nodes.map((n) => [n.id, n]));
  const selfByNode = new Map<number, number>();
  const deltas = profile.timeDeltas ?? [];
  for (let i = 0; i < profile.samples.length; i++) {
    const id = profile.samples[i];
    const dt = deltas[i] ?? 0;
    selfByNode.set(id, (selfByNode.get(id) ?? 0) + dt);
  }

  let totalMs = 0;
  let pluginMs = 0;
  const parts: Array<Omit<ProfileRow, 'sharePct' | 'pluginSharePct'>> = [];
  for (const [id, selfUs] of selfByNode) {
    const node = nodesById.get(id);
    if (!node) continue;
    const cf = node.callFrame;
    const selfMs = selfUs / 1000;
    const isPseudo = PSEUDO_NAMES.has(cf.functionName);
    const isPlugin = cf.url.includes(PLUGIN_URL_MARKER);
    totalMs += selfMs;
    if (isPlugin) pluginMs += selfMs;
    parts.push({
      functionName: cf.functionName,
      url: cf.url,
      line: cf.lineNumber + 1,
      column: cf.columnNumber,
      selfMs,
      isPlugin,
      isPseudo,
    });
  }

  const rows: ProfileRow[] = parts
    .map((p) => ({
      ...p,
      sharePct: totalMs > 0 ? (p.selfMs / totalMs) * 100 : 0,
      pluginSharePct:
        p.isPlugin && pluginMs > 0 ? (p.selfMs / pluginMs) * 100 : null,
    }))
    .sort(
      (a, b) =>
        b.selfMs - a.selfMs || a.functionName.localeCompare(b.functionName),
    );
  return rows;
}

/** Render the top-N rows as plain-text lines (terminal report). */
export function formatTopTable(rows: ProfileRow[], topN: number): string {
  return rows
    .slice(0, topN)
    .map((r) => {
      const loc = `${r.url || '(no url)'}:${r.line}:C${r.column}`;
      const plugin = r.isPlugin
        ? ` [plugin ${(r.pluginSharePct ?? 0).toFixed(1)}%]`
        : '';
      return `${r.sharePct.toFixed(1).padStart(5)}% ${r.selfMs.toFixed(0).padStart(5)}ms  ${r.functionName} @ ${loc}${plugin}`;
    })
    .join('\n');
}

/**
 * Heuristic: bundle-minified names and anonymous frames need the source
 * slice for attribution; real method names are already readable.
 */
export function isMinifiedName(name: string): boolean {
  if (name === '(anon)') return true;
  if (name.startsWith('(')) return false;
  return /^[A-Za-z_$][A-Za-z0-9_$]{0,1}$/.test(name);
}

/**
 * Bounded context slice of the bundle at `line` (1-based) around `column`
 * (0-based, cpuprofile semantics). Returns null when unreadable — the CLI
 * reports the gap rather than guessing.
 */
export function bundleContext(
  bundlePath: string,
  line: number,
  column: number,
  radius = 120,
): string | null {
  let content: string;
  try {
    content = fs.readFileSync(bundlePath, 'utf8');
  } catch {
    return null;
  }
  const lines = content.split('\n');
  if (line < 1 || line > lines.length) return null;
  const target = lines[line - 1];
  const start = Math.max(0, Math.min(column - radius, target.length));
  const end = Math.min(target.length, start + radius * 2);
  if (start >= end) return null;
  const slice = target.slice(start, end);
  return `${start > 0 ? '…' : ''}${slice}${end < target.length ? '…' : ''}`;
}

function main(argv: string[]): number {
  const positional = argv.filter((a) => !a.startsWith('--'));
  const profilePath = positional[0];
  const topN = Number(positional[1] ?? 20);
  if (!profilePath || !Number.isFinite(topN) || topN <= 0) {
    process.stderr.write(
      'usage: analyze-profile.ts <profile.cpuprofile> [topN] [--bundle <main.js>]\n',
    );
    return 1;
  }
  let profile: RawProfile;
  try {
    profile = JSON.parse(fs.readFileSync(profilePath, 'utf8')) as RawProfile;
  } catch (err) {
    process.stderr.write(`cannot read profile: ${String(err)}\n`);
    return 1;
  }
  if (!Array.isArray(profile.nodes) || !Array.isArray(profile.samples)) {
    process.stderr.write('not a cpuprofile (missing nodes/samples)\n');
    return 1;
  }

  const rows = aggregateSelfTime(profile);
  const pluginRows = rows.filter((r) => r.isPlugin && !r.isPseudo);
  const pluginTotal = pluginRows.reduce((sum, r) => sum + r.selfMs, 0);

  process.stdout.write(
    `profile: ${profilePath}\n` +
      `samples: ${profile.samples.length}, plugin self: ${pluginTotal.toFixed(0)}ms\n\n` +
      `${formatTopTable(rows, topN)}\n`,
  );

  const bundleIdx = argv.indexOf('--bundle');
  const bundlePath =
    bundleIdx >= 0 ? argv[bundleIdx + 1] : 'output/todoseq-build/main.js';
  const opaque = pluginRows.filter((r) => isMinifiedName(r.functionName));
  if (opaque.length > 0) {
    process.stdout.write('\nminified plugin frames — bundle context:\n');
    for (const r of opaque.slice(0, 5)) {
      const slice = bundleContext(bundlePath, r.line, r.column);
      process.stdout.write(
        `  ${r.functionName} @ ${r.url}:${r.line}:C${r.column}\n` +
          `    ${slice ?? `(bundle not found at ${bundlePath} — pass --bundle)`}\n`,
      );
    }
  }
  return 0;
}

// CLI entry detection: `require.main` does not exist under ts-node's ESM
// loader (the repo is "type": "module"), and this module must stay inert
// when imported by the jest test (where argv[1] is the jest runner).
const invokedDirectly = (process.argv[1] ?? '').includes('analyze-profile');
if (invokedDirectly) {
  process.exitCode = main(process.argv.slice(2));
}
