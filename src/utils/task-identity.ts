import { Task } from '../types/task';

/** Anchor text without the leading caret, or an empty string. */
export function taskAnchor(task: Task): string {
  return task.embedReference?.replace(/^\^/, '').trim() ?? '';
}

export function hasStableTaskIdentity(task: Task): boolean {
  return Boolean(task.id) || taskAnchor(task).length > 0;
}

/**
 * Identity evidence carried by a request. A conflicting authored ID or anchor
 * rejects a row even when its text happens to match.
 */
export function taskIdentityMatches(candidate: Task, task: Task): boolean {
  if (task.id || candidate.id) {
    if (task.id !== candidate.id) return false;
  }

  const expectedAnchor = taskAnchor(task);
  if (taskAnchor(candidate) !== expectedAnchor) {
    return false;
  }

  return candidate.text === task.text;
}

/**
 * Find one row by the request's stable identity. This is deliberately separate
 * from text matching: a request with an ID or anchor must never fall back to a
 * same-title row whose stable identity is missing or different.
 */
export function selectTaskByStableIdentity(
  candidates: readonly Task[],
  task: Task,
): Task | null {
  const expectedAnchor = taskAnchor(task);

  if (task.id) {
    const byId = candidates.filter((candidate) => candidate.id === task.id);
    if (byId.length !== 1) return null;
    if (expectedAnchor && taskAnchor(byId[0]) !== expectedAnchor) return null;
    return byId[0];
  }

  if (expectedAnchor) {
    const byAnchor = candidates.filter(
      (candidate) => taskAnchor(candidate) === expectedAnchor,
    );
    return byAnchor.length === 1 ? byAnchor[0] : null;
  }

  return null;
}
