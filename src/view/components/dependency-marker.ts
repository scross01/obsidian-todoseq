import type { TaskDependencyManager } from '../../services/task-dependency-manager';
import { getIssueKindLabel } from './task-issues';

export type DependencyMarkerKind = 'issue' | 'blocked';

export interface DependencyMarker {
  kind: DependencyMarkerKind;
  /** Accessible label and tooltip. Already user-facing prose. */
  label: string;
  /** Joined reason text, used by click-to-details notices and lock labels. */
  details: string;
}

/**
 * The single marker decision shared by every task surface: a source diagnostic
 * outranks the ordinary blocked lock, and both are read from the manager's
 * snapshot index rather than a per-render scan of all issues.
 */
export function resolveDependencyMarker(
  manager: TaskDependencyManager | null,
  taskKey: string,
): DependencyMarker | null {
  if (!manager) return null;

  const issues = manager
    .getIssuesForTask(taskKey)
    .filter((issue) => issue.code !== 'pending-validation');
  if (issues.length > 0) {
    const first = issues[0];
    const details =
      issues.length > 1
        ? `${first.message} (+${issues.length - 1} more)`
        : first.message;
    return {
      kind: 'issue',
      label: `${getIssueKindLabel(first)}: ${details}`,
      details,
    };
  }

  if (!manager.isBlocked(taskKey)) return null;
  const details = manager
    .getBlockingReasons(taskKey)
    .map((reason) => reason.message)
    .join(' ');
  return {
    kind: 'blocked',
    label: details || 'Blocked by an incomplete dependency',
    details,
  };
}
