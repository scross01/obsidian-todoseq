/**
 * Unit tests for plan-015 deferred items: bulk select-visible/none in the
 * archive dialog preview header, and the title attribute on ellipsized task
 * text. The dialog's DOM interactions are covered by integration specs; these
 * test the pure decision logic the bulk controls rely on.
 */
import {
  computeBulkInclude,
  reconcileInclusions,
  BULK_INCLUDES_VISIBLE_ONLY,
} from '../src/view/components/archive-dialog';
import type { ArchiveMatch } from '../src/services/archive-service';

function makeMatch(path: string, line: number): ArchiveMatch {
  return {
    path,
    line,
    rawText: `- [x] DONE task ${path}:${line}`,
    state: 'DONE',
    target: 'ARCHIVED',
    closedDate: new Date(2026, 0, 1),
  } as unknown as ArchiveMatch;
}

describe('computeBulkInclude', () => {
  const matches = [
    makeMatch('a.md', 1),
    makeMatch('a.md', 5),
    makeMatch('b.md', 2),
  ];
  const keys = matches.map((m) => `${m.path}:${m.line}`);

  it('marks only the visible slice for inclusion', () => {
    // Simulate 500 matches where only the first 200 are rendered.
    const many = Array.from({ length: 500 }, (_, i) =>
      makeMatch('bulk.md', i + 1),
    );
    const visibleSlice = many.slice(0, 200).map((m) => `${m.path}:${m.line}`);
    const result = computeBulkInclude(visibleSlice, true);
    expect(result.includeKeys).toHaveLength(200);
    expect(result.excludeKeys).toHaveLength(0);
  });

  it('computes exclusions from the visible slice only', () => {
    const visibleSlice = keys.slice(0, 2);
    const result = computeBulkInclude(visibleSlice, false);
    expect(result.excludeKeys).toEqual(visibleSlice);
    expect(result.includeKeys).toHaveLength(0);
  });

  it('returns only the side requested, with deduplicated keys', () => {
    const visibleSlice = [...keys, ...keys];
    const include = computeBulkInclude(visibleSlice, true);
    const exclude = computeBulkInclude(visibleSlice, false);
    // Each call returns only its own side (the caller applies exactly one).
    expect(include.excludeKeys).toHaveLength(0);
    expect(exclude.includeKeys).toHaveLength(0);
    // Duplicate visible keys collapse to one entry per task.
    expect(include.includeKeys).toEqual(keys);
    expect(exclude.excludeKeys).toEqual(keys);
  });

  it('documents that bulk operations never exceed the visible slice', () => {
    // The plan-015 constraint: "select visible / none" is scoped to rendered
    // rows; selecting ALL matches is a different product decision.
    expect(BULK_INCLUDES_VISIBLE_ONLY).toBe(true);
  });
});

describe('reconcileInclusions', () => {
  // The preview refresh used to re-add every match to the included set, which
  // made an exclusion indistinguishable from "not seen yet" — so touching any
  // criteria field re-checked every box the user had unticked, and the Apply
  // button quietly went back to archiving tasks they had excluded.
  const keys = ['a.md:1', 'a.md:5', 'b.md:2'];

  it('includes every match on the first refresh', () => {
    const included = new Set<string>();
    const seen = new Set<string>();
    reconcileInclusions(included, seen, keys);
    expect([...included].sort()).toEqual([...keys].sort());
    expect(seen.size).toBe(3);
  });

  it('keeps a user exclusion across a refresh of the same matches', () => {
    const included = new Set<string>();
    const seen = new Set<string>();
    reconcileInclusions(included, seen, keys);

    included.delete('a.md:5'); // user unticks one row
    reconcileInclusions(included, seen, keys);

    expect(included.has('a.md:5')).toBe(false);
    expect(included.size).toBe(2);
  });

  it('keeps a user exclusion when a criteria change adds and drops tasks', () => {
    const included = new Set<string>();
    const seen = new Set<string>();
    reconcileInclusions(included, seen, keys);
    included.delete('a.md:5');

    // 'b.md:2' stopped matching; 'c.md:9' is new.
    reconcileInclusions(included, seen, ['a.md:1', 'a.md:5', 'c.md:9']);

    expect(included.has('a.md:5')).toBe(false);
    expect(included.has('c.md:9')).toBe(true);
    expect(included.has('b.md:2')).toBe(false);
  });

  it('does not re-include a task that stopped matching and came back', () => {
    const included = new Set<string>();
    const seen = new Set<string>();
    reconcileInclusions(included, seen, keys);
    included.delete('b.md:2');

    reconcileInclusions(included, seen, ['a.md:1', 'a.md:5']);
    reconcileInclusions(included, seen, keys);

    expect(included.has('b.md:2')).toBe(false);
  });

  it('drops a stale key from included but keeps it in seen', () => {
    const included = new Set<string>();
    const seen = new Set<string>();
    reconcileInclusions(included, seen, keys);
    reconcileInclusions(included, seen, ['a.md:1']);

    expect(included.has('b.md:2')).toBe(false);
    expect(seen.has('b.md:2')).toBe(true);
  });
});
