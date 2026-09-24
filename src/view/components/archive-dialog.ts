import {
  ArchiveStateMapping,
} from '../../settings/settings-types';

/**
 * One settings/mapping row for the Auto-Archive dialog and settings section.
 * Derived from the user's completed-keyword set plus any stored mappings, so
 * it stays valid by construction: only real keywords appear as sources, and
 * only real archived-group keywords are offered as targets.
 */
export interface ArchiveMappingRow {
  /** Completed-state keyword this row configures (e.g. DONE, CANCELLED). */
  source: string;
  /** Whether this mapping participates in archive runs. */
  enabled: boolean;
  /** Target archived-group keyword (e.g. ARCHIVED, ABANDONED). */
  target: string;
  /** True when the stored target is no longer a valid archived keyword. */
  targetInvalid: boolean;
  /** Valid target options for this row's dropdown (archived keywords, order preserved). */
  validTargets: string[];
}

/**
 * Build one mapping row per completed keyword. Stored mappings carry over
 * `enabled`/`target`; unmapped sources default to disabled with the default
 * target. First stored mapping wins when duplicates exist. Targets that are
 * no longer valid archived keywords are flagged (targetInvalid) but left
 * untouched until the user changes them.
 */
export function buildArchiveMappingRows(
  completedKeywords: string[],
  archivedKeywords: string[],
  stored: ArchiveStateMapping[],
  defaultTarget: string,
): ArchiveMappingRow[] {
  const storedBySource = new Map<string, ArchiveStateMapping>();
  for (const mapping of stored) {
    if (!storedBySource.has(mapping.source)) {
      storedBySource.set(mapping.source, mapping);
    }
  }

  return completedKeywords.map((source) => {
    const mapping = storedBySource.get(source);
    const target = mapping ? mapping.target : defaultTarget;
    return {
      source,
      enabled: mapping ? mapping.enabled : false,
      target,
      targetInvalid:
        mapping !== undefined && !archivedKeywords.includes(mapping.target),
      validTargets: archivedKeywords,
    };
  });
}

/**
 * Inverse of buildArchiveMappingRows for persistence: rows → stored
 * mappings. Keeps disabled rows and invalid targets so user configuration
 * survives keyword-set changes (invalid targets are simply unusable at run
 * time — the evaluator validates them).
 */
export function toStateMappings(
  rows: ArchiveMappingRow[],
): ArchiveStateMapping[] {
  return rows.map((row) => ({
    source: row.source,
    enabled: row.enabled,
    target: row.target,
  }));
}
