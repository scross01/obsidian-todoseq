import type { DependencyIssue } from '../../types/task-dependency';

export interface TaskIssueSummary {
  total: number;
  property: number;
  dependency: number;
}

/** A source diagnostic that should be shown; indexing is not an error. */
export function isActionableTaskIssue(issue: DependencyIssue): boolean {
  return issue.code !== 'pending-validation';
}

export function summarizeTaskIssues(
  issues: readonly DependencyIssue[],
): TaskIssueSummary {
  let property = 0;
  let dependency = 0;
  for (const issue of issues) {
    if (!isActionableTaskIssue(issue)) continue;
    if (issue.kind === 'property') property += 1;
    else dependency += 1;
  }
  return { total: property + dependency, property, dependency };
}

export function getIssueKindLabel(
  issue: Pick<DependencyIssue, 'kind'>,
): string {
  return issue.kind === 'property' ? 'Property problem' : 'Dependency problem';
}
