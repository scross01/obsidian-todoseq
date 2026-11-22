import { Notice } from 'obsidian';
import type { DependencyIssue } from '../types/task-dependency';
import type { TaskDependencyManager } from './task-dependency-manager';

type NoticeFactory = (message: string) => void;
type DebugLogger = (message: string, details?: unknown) => void;

/**
 * Surfaces source diagnostics (unresolved, ambiguous and invalid references,
 * cycles, duplicate IDs) once per changed issue set. Ordinary "blocked by an
 * incomplete task" state is not a diagnostic and never reaches this service.
 *
 * The fingerprint gate is deliberate: a rebuild publishes the same issues on
 * every optimistic update and rescan, but the user only needs to hear about a
 * set that changed. Empty sets reset the memory so a later relapse notifies.
 */
export class TaskDependencyWarningService {
  private lastFingerprint = '';

  constructor(
    private readonly manager: TaskDependencyManager,
    private readonly notify: NoticeFactory = (message) => {
      new Notice(message);
    },
    private readonly debug: DebugLogger = (message, details) => {
      console.debug(message, details);
    },
  ) {}

  /**
   * Notify when the published diagnostic set changed and is non-empty.
   * Returns true when a notice was emitted.
   */
  check(): boolean {
    if (!this.manager.isValidationReady()) return false;

    const snapshot = this.manager.getSnapshot();
    if (!snapshot.ready) return false;

    const issues = snapshot.issues.filter(
      (issue) => issue.code !== 'pending-validation',
    );
    const fingerprint = Array.from(
      new Set(issues.map((issue) => issue.fingerprint)),
    )
      .sort()
      .join('|');

    if (fingerprint === this.lastFingerprint) return false;
    this.lastFingerprint = fingerprint;
    if (issues.length === 0) return false;

    this.debug(
      '[TODOseq] Dependency diagnostics:',
      issues.map((issue) => issue.message),
    );
    this.notify(this.formatNotice(issues));
    return true;
  }

  /** Forget the last set; used on teardown/tests. */
  reset(): void {
    this.lastFingerprint = '';
  }

  private formatNotice(issues: readonly DependencyIssue[]): string {
    const first = issues[0]?.message ?? 'Dependency problem detected.';
    return issues.length > 1
      ? `${first} (+${issues.length - 1} more)`
      : first;
  }
}
