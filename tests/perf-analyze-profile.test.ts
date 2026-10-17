/**
 * CPU-profile analyzer contract (plan 046 D3).
 *
 * The ad-hoc one-liners used for the 2026-10-17 analysis are checked in as
 * `scripts/perf/analyze-profile.ts` so every future profile attribution is
 * reproducible: self-time aggregation by function @ file:line:col, plugin-
 * frame share, and a bounded bundle slice for minified `plugin:todoseq`
 * frames (the step that identified `c L6:C1566` as a `toLocaleDateString`
 * closure by hand).
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  aggregateSelfTime,
  formatTopTable,
  isMinifiedName,
  bundleContext,
  RawProfile,
} from '../scripts/perf/analyze-profile';

/**
 * Minimal CDP-shaped profile: node 2 (2 samples × 1000µs), node 3 (1 ×
 * 1000µs), node 4 (3 × 1000µs). Totals: total 6000µs; plugin (todoseq) =
 * 3000µs.
 */
function fixtureProfile(): RawProfile & { timeDeltas: number[] } {
  return {
    nodes: [
      {
        id: 1,
        callFrame: {
          functionName: '(root)',
          url: '',
          lineNumber: -1,
          columnNumber: -1,
        },
      },
      {
        id: 2,
        callFrame: {
          functionName: 'formatDateTooltip',
          url: 'plugin:todoseq:6',
          lineNumber: 5,
          columnNumber: 1969,
        },
      },
      {
        id: 3,
        callFrame: {
          functionName: 'c',
          url: 'plugin:todoseq:6',
          lineNumber: 5,
          columnNumber: 1566,
        },
      },
      {
        id: 4,
        callFrame: {
          functionName: 'helper',
          url: 'file:///x/node_modules/foo/index.js:1',
          lineNumber: 0,
          columnNumber: 0,
        },
      },
    ],
    samples: [2, 2, 3, 4, 4, 4],
    timeDeltas: [1000, 1000, 1000, 1000, 1000, 1000],
  };
}

describe('analyze-profile aggregation', () => {
  it('aggregates self-time per function @ file:line:col, sorted by self-time desc', () => {
    const rows = aggregateSelfTime(fixtureProfile());
    expect(rows.map((r) => r.functionName)).toEqual([
      'helper',
      'formatDateTooltip',
      'c',
    ]);
    expect(rows[1].selfMs).toBeCloseTo(2);
    expect(rows[1].line).toBe(6); // 1-based display line (cpuprofile is 0-based)
    expect(rows[1].column).toBe(1969);
  });

  it('computes share of total and plugin-frame share (plugin = todoseq frames)', () => {
    const rows = aggregateSelfTime(fixtureProfile());
    const tooltip = rows.find((r) => r.functionName === 'formatDateTooltip');
    const helper = rows.find((r) => r.functionName === 'helper');
    expect(tooltip?.sharePct).toBeCloseTo((2 / 6) * 100);
    // Plugin share: 2ms of the plugin's 3ms self-time.
    expect(tooltip?.pluginSharePct).toBeCloseTo((2 / 3) * 100);
    // Non-plugin frames carry no plugin share.
    expect(helper?.pluginSharePct).toBeNull();
    expect(helper?.isPlugin).toBe(false);
  });

  it('excludes idle and program pseudo-frames from shares but reports them', () => {
    const profile = fixtureProfile();
    profile.nodes.push({
      id: 5,
      callFrame: {
        functionName: '(program)',
        url: '',
        lineNumber: -1,
        columnNumber: -1,
      },
    });
    profile.samples.push(5);
    profile.timeDeltas.push(4000);
    const rows = aggregateSelfTime(profile);
    const program = rows.find((r) => r.functionName === '(program)');
    expect(program).toBeDefined();
    expect(program?.isPseudo).toBe(true);
    // Plugin share denominators ignore pseudo frames: unchanged 2/3.
    const tooltip = rows.find((r) => r.functionName === 'formatDateTooltip');
    expect(tooltip?.pluginSharePct).toBeCloseTo((2 / 3) * 100);
  });
});

describe('analyze-profile formatting', () => {
  it('renders a top-N table with share percentages and locations', () => {
    const rows = aggregateSelfTime(fixtureProfile());
    const table = formatTopTable(rows, 2);
    const lines = table.split('\n');
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain('helper');
    expect(lines[0]).toContain('50.0%');
    expect(lines[1]).toContain('formatDateTooltip');
    expect(lines[1]).toContain('plugin:todoseq:6:6:C1969');
  });

  it('flags minified single/double-letter names for bundle-slice lookup', () => {
    expect(isMinifiedName('c')).toBe(true);
    expect(isMinifiedName('jr')).toBe(true);
    expect(isMinifiedName('(anon)')).toBe(true);
    expect(isMinifiedName('formatDateTooltip')).toBe(false);
  });
});

describe('analyze-profile bundle context', () => {
  let dir: string;
  let bundle: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'todoseq-profile-'));
    bundle = path.join(dir, 'main.js');
    // 3 lines; line 2 is 300 chars so a ±60 slice at col 100 stays inside.
    fs.writeFileSync(
      bundle,
      ['l1', 'x'.repeat(100) + 'TARGET' + 'y'.repeat(194), 'l3'].join('\n'),
    );
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('returns a bounded slice around the column of the requested line', () => {
    const slice = bundleContext(bundle, 2, 106, 60);
    expect(slice).toContain('TARGET');
    // Bounded by 2×radius plus at most two ellipsis chars (both ends).
    expect(slice!.length).toBeLessThanOrEqual(2 * 60 + 2);
  });

  it('returns null when the bundle or location is unreadable', () => {
    expect(bundleContext(path.join(dir, 'missing.js'), 2, 106)).toBeNull();
    expect(bundleContext(bundle, 99, 0)).toBeNull();
  });
});
