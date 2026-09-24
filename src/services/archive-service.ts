import { KeywordManager } from '../utils/keyword-manager';
import { RegexCache } from '../utils/regex-cache';
import {
  ArchiveStateMapping,
  TaskArchiveSettings,
} from '../settings/settings-types';

/** The subset of Task the evaluator needs (keeps the service unit-testable without DOM/TFile). */
export interface ArchiveMatchInput {
  state: string;
  closedDate: Date | null;
}

/** An evaluator input that also carries task identity — production always passes full Tasks. */
export type ArchiveCandidate = ArchiveMatchInput & {
  path: string;
  line: number;
  rawText: string;
};

/** An evaluated task that matches the archive criteria, with its resolved target keyword. */
export interface ArchiveMatch extends ArchiveCandidate {
  /** Target archived keyword for this task's state. */
  target: string;
}

/** Runtime copy of the archive settings a run evaluates against. */
export interface ArchiveRunConfig {
  criterionMode: 'days' | 'date';
  criterionDays: number;
  criterionDate: string; // ISO YYYY-MM-DD or ''
  stateMappings: ArchiveStateMapping[];
  includeNoClosedDate: false;
}

/** A task successfully archived by applyArchives, journaled for session undo. */
export interface ArchivedTaskRecord {
  path: string;
  line: number;
  /** State keyword before the run (the undo target). */
  originalState: string;
  /** Archived keyword written by the run. */
  target: string;
  /** rawText before the run — undo verifies the line is unchanged before reverting. */
  rawTextBefore: string;
}

export interface ArchiveRunResult {
  archived: ArchivedTaskRecord[];
  skipped: { path: string; line: number; reason: string }[];
}

export interface UndoOutcome {
  reverted: ArchivedTaskRecord[];
  skipped: { record: ArchivedTaskRecord; reason: string }[];
}

/** Dependencies applyArchives/undoLastRun need, supplied by the wiring layer. */
export interface ApplyArchiveDeps {
  /**
   * Resolve the CURRENT task state for a match (or null if it no longer
   * exists). Production wiring: TaskStateManager.findTaskByPathAndLine.
   */
  getTask: (
    path: string,
    line: number,
  ) => (ArchiveMatchInput & { rawText: string }) | null;
  /** Perform the write. Production wiring: TaskUpdateCoordinator.updateTaskState(task, target, 'task-list'). */
  apply: (task: import('../types/task').Task, target: string) => Promise<void>;
}

export interface UndoDeps {
  /** Current raw line content at path:line, or null when the line/file is gone. */
  getRawLine: (path: string, line: number) => Promise<string | null>;
  /** Perform the revert write with the original keyword. */
  apply: (
    task: import('../types/task').Task,
    originalState: string,
  ) => Promise<void>;
}

const MS_PER_DAY = 86_400_000;

/** Local-midnight truncation — timezone-safe day comparisons (local components only). */
function localMidnight(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** Parse YYYY-MM-DD as a LOCAL date (avoids UTC shift from `new Date(string)`). */
function parseIsoDateLocal(iso: string): Date | null {
  const parts = iso.split('-').map((p) => Number.parseInt(p, 10));
  if (parts.length !== 3 || parts.some((p) => Number.isNaN(p))) return null;
  const [year, month, day] = parts;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(year, month - 1, day);
  // Reject rollovers like 2026-02-31 (February 31 becomes March 3).
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  return date;
}

/**
 * Auto-Archive engine: evaluates which completed tasks match the archive
 * criteria and applies/undoes bulk keyword rewrites. Pure logic — file
 * writes and state-manager access are injected via deps, keeping this
 * class unit-testable without mocks of Obsidian services.
 *
 * Product invariants (plans/011-archive-service-core.md):
 * - Tasks without a CLOSED date NEVER match (includeNoClosedDate is
 *   reserved; this version always treats it as false).
 * - Only states with an enabled mapping to a VALID archived-group keyword
 *   match; the first enabled mapping wins for duplicate sources.
 * - Archived states are never re-archived.
 */
export class ArchiveService {
  private lastRun: ArchivedTaskRecord[] = [];
  private running = false;
  /** Cached compiled patterns for lineStillArchived — targets repeat across journal records. */
  private readonly linePatternCache = new RegexCache();

  constructor(
    private readonly keywordManager: KeywordManager,
    private readonly settings: TaskArchiveSettings,
  ) {}

  /** True while an applyArchives batch is in flight (used to gate auto-run against manual runs). */
  isRunning(): boolean {
    return this.running;
  }

  /** True when a previous run left undoable journal entries. */
  hasUndoableRun(): boolean {
    return this.lastRun.length > 0;
  }

  /**
   * Pure evaluation: which completed tasks match, and their targets.
   * @param tasks candidate tasks (archived tasks are ignored internally)
   * @param config run configuration; defaults to the constructor settings
   * @param referenceDate 'now' — injected for testability
   */
  evaluateArchiveCriteria(
    tasks: readonly ArchiveCandidate[],
    config: ArchiveRunConfig = this.settings,
    referenceDate: Date = new Date(),
  ): ArchiveMatch[] {
    const targetBySource = this.buildMappingLookup(config.stateMappings);
    const matches: ArchiveMatch[] = [];

    for (const task of tasks) {
      // Archived states are terminal — never re-archive them.
      if (this.keywordManager.isArchived(task.state)) continue;

      const mapping = targetBySource.get(task.state);
      if (!mapping) continue; // no enabled mapping for this state

      // Product invariant: no CLOSED date → never matches. includeNoClosedDate
      // is typed `false` this version; even a `true` value is ignored here.
      if (task.closedDate === null) continue;

      if (!this.isOldEnough(task.closedDate, config, referenceDate)) continue;

      matches.push({
        path: task.path,
        line: task.line,
        rawText: task.rawText,
        state: task.state,
        closedDate: task.closedDate,
        target: mapping.target,
      });
    }
    return matches;
  }

  /**
   * Batch-apply matches. Each match is re-verified against a fresh task
   * snapshot immediately before write; stale entries are skipped, not
   * applied. A successful run REPLACES the undo journal (undo reverts the
   * most recent run only).
   */
  async applyArchives(
    matches: readonly ArchiveMatch[],
    deps: ApplyArchiveDeps,
  ): Promise<ArchiveRunResult> {
    this.running = true;
    const archived: ArchivedTaskRecord[] = [];
    const skipped: { path: string; line: number; reason: string }[] = [];
    try {
      for (const match of matches) {
        const current = deps.getTask(match.path, match.line);
        if (!current) {
          skipped.push({ path: match.path, line: match.line, reason: 'stale' });
          continue;
        }
        if (current.state !== match.state) {
          skipped.push({ path: match.path, line: match.line, reason: 'stale' });
          continue;
        }
        await deps.apply(current as import('../types/task').Task, match.target);
        archived.push({
          path: match.path,
          line: match.line,
          originalState: match.state,
          target: match.target,
          rawTextBefore: current.rawText,
        });
      }
    } finally {
      this.running = false;
    }
    this.lastRun = archived;
    return { archived, skipped };
  }

  /**
   * Revert the most recent run. Each journal entry is re-verified: the line
   * must still exist and still contain the archived target keyword; anything
   * else is skipped with a reason. The journal is cleared afterwards.
   */
  async undoLastRun(deps: UndoDeps): Promise<UndoOutcome> {
    const journal = this.lastRun;
    this.lastRun = [];
    const reverted: ArchivedTaskRecord[] = [];
    const skipped: { record: ArchivedTaskRecord; reason: string }[] = [];

    for (const record of journal) {
      const rawLine = await deps.getRawLine(record.path, record.line);
      if (rawLine === null) {
        skipped.push({ record, reason: 'line-missing' });
        continue;
      }
      if (!this.lineStillArchived(rawLine, record)) {
        skipped.push({ record, reason: 'line-changed' });
        continue;
      }
      // Reconstruct a minimal Task: the wiring layer's apply performs the
      // state rewrite through TaskWriter.generateTaskLine, which needs
      // path/line/rawText/state to regenerate the line correctly.
      const task = {
        path: record.path,
        line: record.line,
        rawText: rawLine,
        state: record.target,
      } as import('../types/task').Task;
      await deps.apply(task, record.originalState);
      reverted.push(record);
    }
    return { reverted, skipped };
  }

  /**
   * Cheap line verification: the line must still contain the archived
   * target keyword as the state token (after the list marker). Combined
   * with rawTextBefore length sanity, this is the agreed verification
   * level — full line-shape comparison is deliberately not attempted.
   */
  private lineStillArchived(
    rawLine: string,
    record: ArchivedTaskRecord,
  ): boolean {
    // The target keyword must appear as a standalone token on the line.
    // Cached: the same target pattern repeats for every record of a run.
    const pattern = this.linePatternCache.get(
      `(^|\\s|\\[|\\*)${this.escapeRegExp(record.target)}(\\s|\\]|$)`,
    );
    if (!pattern.test(rawLine)) return false;
    // If the line still matches the ORIGINAL pre-archive shape, it was never
    // actually archived (or was reverted out-of-band) — treat as changed.
    if (rawLine === record.rawTextBefore) return false;
    return true;
  }

  private escapeRegExp(text: string): string {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /** source → first enabled mapping; targets invalid for this vault's keywords are dropped. */
  private buildMappingLookup(
    mappings: readonly ArchiveStateMapping[],
  ): Map<string, ArchiveStateMapping> {
    const lookup = new Map<string, ArchiveStateMapping>();
    for (const mapping of mappings) {
      if (!mapping.enabled) continue;
      if (lookup.has(mapping.source)) continue; // first enabled mapping wins
      if (!this.keywordManager.isArchived(mapping.target)) continue; // invalid target → rule unusable
      lookup.set(mapping.source, mapping);
    }
    return lookup;
  }

  /** Days-mode: closed ≥ criterionDays local midnights ago. Date-mode: closed strictly before criterionDate. */
  private isOldEnough(
    closedDate: Date,
    config: ArchiveRunConfig,
    referenceDate: Date,
  ): boolean {
    const closedMidnight = localMidnight(closedDate);
    if (config.criterionMode === 'date') {
      const criterion = parseIsoDateLocal(config.criterionDate);
      if (!criterion) return false; // unset/invalid date matches nothing
      return closedMidnight.getTime() < criterion.getTime();
    }
    const referenceMidnight = localMidnight(referenceDate);
    const ageDays = Math.round(
      (referenceMidnight.getTime() - closedMidnight.getTime()) / MS_PER_DAY,
    );
    return ageDays >= config.criterionDays;
  }
}
