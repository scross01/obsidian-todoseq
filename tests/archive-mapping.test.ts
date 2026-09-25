import {
  buildArchiveMappingRows,
  mergeMappingRowsIntoStored,
  toStateMappings,
} from '../src/view/components/archive-dialog';

describe('buildArchiveMappingRows', () => {
  const completed = ['DONE', 'CANCELLED', 'WAIT-DONE'];
  const archived = ['ARCHIVED'];

  it('creates one row per completed keyword, in order', () => {
    const rows = buildArchiveMappingRows(completed, archived, [], 'ARCHIVED');
    expect(rows.map((r) => r.source)).toEqual([
      'DONE',
      'CANCELLED',
      'WAIT-DONE',
    ]);
  });

  it('carries over stored mapping enabled/target when present', () => {
    const stored = [
      { source: 'DONE', enabled: true, target: 'ARCHIVED' },
      { source: 'CANCELLED', enabled: false, target: 'ARCHIVED' },
    ];
    const rows = buildArchiveMappingRows(
      completed,
      archived,
      stored,
      'ARCHIVED',
    );
    expect(rows[0]).toMatchObject({
      source: 'DONE',
      enabled: true,
      target: 'ARCHIVED',
    });
    expect(rows[1]).toMatchObject({
      source: 'CANCELLED',
      enabled: false,
      target: 'ARCHIVED',
    });
  });

  it('defaults unmapped sources to disabled with the default target', () => {
    const rows = buildArchiveMappingRows(completed, archived, [], 'ARCHIVED');
    expect(rows.every((r) => r.enabled === false)).toBe(true);
    expect(rows.every((r) => r.target === 'ARCHIVED')).toBe(true);
  });

  it('carries the default target when no stored mapping exists but validTargets differ', () => {
    const stored = [{ source: 'DONE', enabled: true, target: 'ABANDONED' }];
    const rows = buildArchiveMappingRows(
      ['DONE', 'WAIT-DONE'],
      ['ARCHIVED', 'ABANDONED'],
      stored,
      'ARCHIVED',
    );
    expect(rows[0]).toMatchObject({ target: 'ABANDONED', enabled: true });
    expect(rows[1]).toMatchObject({ target: 'ARCHIVED', enabled: false });
    expect(rows[1].validTargets).toEqual(['ARCHIVED', 'ABANDONED']);
  });

  it('flags stored targets that are no longer valid archived keywords', () => {
    const stored = [{ source: 'DONE', enabled: true, target: 'OBSOLETE' }];
    const rows = buildArchiveMappingRows(
      ['DONE'],
      archived,
      stored,
      'ARCHIVED',
    );
    expect(rows[0].targetInvalid).toBe(true);
    expect(rows[0].target).toBe('OBSOLETE'); // untouched until the user changes it
    expect(rows[0].validTargets).toEqual(['ARCHIVED']);
  });

  it('does not flag valid stored targets', () => {
    const stored = [{ source: 'DONE', enabled: true, target: 'ARCHIVED' }];
    const rows = buildArchiveMappingRows(
      ['DONE'],
      archived,
      stored,
      'ARCHIVED',
    );
    expect(rows[0].targetInvalid).toBe(false);
  });

  it('uses the first stored mapping when duplicates exist', () => {
    const stored = [
      { source: 'DONE', enabled: true, target: 'ARCHIVED' },
      { source: 'DONE', enabled: false, target: 'ARCHIVED' },
    ];
    const rows = buildArchiveMappingRows(
      ['DONE'],
      archived,
      stored,
      'ARCHIVED',
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].enabled).toBe(true);
  });

  it('preserves archived keyword order for the dropdown', () => {
    const rows = buildArchiveMappingRows(
      ['DONE'],
      ['ABANDONED', 'ARCHIVED'],
      [],
      'ARCHIVED',
    );
    expect(rows[0].validTargets).toEqual(['ABANDONED', 'ARCHIVED']);
  });

  it('handles empty inputs', () => {
    expect(buildArchiveMappingRows([], archived, [], 'ARCHIVED')).toEqual([]);
    expect(buildArchiveMappingRows(completed, [], [], 'ARCHIVED')).toHaveLength(
      3,
    );
  });
});

describe('toStateMappings', () => {
  it('round-trips rows to stored mappings, keeping disabled rows', () => {
    const rows = buildArchiveMappingRows(
      ['DONE', 'CANCELLED'],
      ['ARCHIVED'],
      [{ source: 'DONE', enabled: true, target: 'ARCHIVED' }],
      'ARCHIVED',
    );
    const mappings = toStateMappings(rows);
    expect(mappings).toEqual([
      { source: 'DONE', enabled: true, target: 'ARCHIVED' },
      { source: 'CANCELLED', enabled: false, target: 'ARCHIVED' },
    ]);
  });

  it('keeps invalid targets in the persisted mappings (they are just unusable)', () => {
    const rows = buildArchiveMappingRows(
      ['DONE'],
      ['ARCHIVED'],
      [{ source: 'DONE', enabled: true, target: 'OBSOLETE' }],
      'ARCHIVED',
    );
    expect(toStateMappings(rows)).toEqual([
      { source: 'DONE', enabled: true, target: 'OBSOLETE' },
    ]);
  });
});

describe('mergeMappingRowsIntoStored', () => {
  it('applies dialog rows for sources the dialog shows', () => {
    const stored = [
      { source: 'DONE', enabled: true, target: 'ARCHIVED' },
      { source: 'CANCELLED', enabled: false, target: 'ARCHIVED' },
    ];
    const rows = buildArchiveMappingRows(
      ['DONE'],
      ['ARCHIVED'],
      [{ source: 'DONE', enabled: false, target: 'ARCHIVED' }],
      'ARCHIVED',
    );
    const merged = mergeMappingRowsIntoStored(rows, stored);
    expect(merged.find((m) => m.source === 'DONE')?.enabled).toBe(false);
    // Sources the dialog does not render survive untouched.
    expect(merged.find((m) => m.source === 'CANCELLED')).toEqual({
      source: 'CANCELLED',
      enabled: false,
      target: 'ARCHIVED',
    });
  });

  it('preserves stored entries for sources NOT in the dialog rows (the lost-update fix)', () => {
    // Settings tab added CANCELLED while the dialog was open; the dialog's
    // rows predate that and only know about DONE. The merge must NOT drop
    // the concurrent write.
    const stored = [
      { source: 'DONE', enabled: true, target: 'ARCHIVED' },
      { source: 'CANCELLED', enabled: true, target: 'ARCHIVED' },
    ];
    const rows = buildArchiveMappingRows(
      ['DONE'],
      ['ARCHIVED'],
      [{ source: 'DONE', enabled: false, target: 'ARCHIVED' }],
      'ARCHIVED',
    );
    const merged = mergeMappingRowsIntoStored(rows, stored);
    expect(merged.map((m) => m.source).sort()).toEqual(['CANCELLED', 'DONE']);
    expect(merged.find((m) => m.source === 'CANCELLED')?.enabled).toBe(true);
  });

  it('keeps unknown stored entries (e.g. rows for removed keywords) and appends genuinely new dialog rows', () => {
    const stored = [{ source: 'REMOVED', enabled: false, target: 'ARCHIVED' }];
    const rows = buildArchiveMappingRows(
      ['DONE', 'SHIPPED'],
      ['ARCHIVED'],
      [],
      'ARCHIVED',
    );
    const merged = mergeMappingRowsIntoStored(rows, stored);
    const bySource = new Map(merged.map((m) => [m.source, m]));
    // Removed keyword's entry persists (rows for removed keywords are kept).
    expect(bySource.get('REMOVED')).toEqual({
      source: 'REMOVED',
      enabled: false,
      target: 'ARCHIVED',
    });
    // Fresh dialog rows land.
    expect(bySource.get('SHIPPED')).toEqual({
      source: 'SHIPPED',
      enabled: false,
      target: 'ARCHIVED',
    });
  });
});
