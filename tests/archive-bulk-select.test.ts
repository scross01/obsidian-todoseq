/**
 * Unit tests for plan-015 deferred items: bulk select-visible/none in the
 * archive dialog preview header, and the title attribute on ellipsized task
 * text. The dialog's DOM interactions are covered by integration specs; these
 * test the pure decision logic the bulk controls rely on.
 */
import {
  computeBulkInclude,
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
