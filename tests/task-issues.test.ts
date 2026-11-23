import type { DependencyIssue } from '../src/types/task-dependency';
import {
  getIssueKindLabel,
  isActionableTaskIssue,
  summarizeTaskIssues,
} from '../src/view/components/task-issues';

function createIssue(
  overrides: Partial<DependencyIssue> = {},
): DependencyIssue {
  return {
    code: 'missing-reference',
    fingerprint: 'issue-1',
    message: 'The dependency could not be found.',
    sourceKey: 'notes/tasks.md:4',
    ...overrides,
  };
}

describe('task issue helpers', () => {
  describe('isActionableTaskIssue', () => {
    it('accepts a real diagnostic', () => {
      expect(isActionableTaskIssue(createIssue())).toBe(true);
    });

    it('rejects pending validation', () => {
      expect(
        isActionableTaskIssue(
          createIssue({
            code: 'pending-validation',
            message: 'Checking dependencies…',
          }),
        ),
      ).toBe(false);
    });
  });

  describe('summarizeTaskIssues', () => {
    it('returns zero counts for no issues', () => {
      expect(summarizeTaskIssues([])).toEqual({
        total: 0,
        property: 0,
        dependency: 0,
      });
    });

    it('ignores pending-validation issues', () => {
      expect(
        summarizeTaskIssues([
          createIssue({ code: 'pending-validation', kind: 'dependency' }),
        ]),
      ).toEqual({ total: 0, property: 0, dependency: 0 });
    });

    it('counts property issues separately', () => {
      expect(summarizeTaskIssues([createIssue({ kind: 'property' })])).toEqual({
        total: 1,
        property: 1,
        dependency: 0,
      });
    });

    it('treats an issue without a kind as a dependency issue', () => {
      expect(summarizeTaskIssues([createIssue()])).toEqual({
        total: 1,
        property: 0,
        dependency: 1,
      });
    });

    it('counts an explicit dependency kind as a dependency issue', () => {
      expect(
        summarizeTaskIssues([createIssue({ kind: 'dependency' })]),
      ).toEqual({ total: 1, property: 0, dependency: 1 });
    });

    it('sums mixed issues', () => {
      expect(
        summarizeTaskIssues([
          createIssue({ kind: 'property', fingerprint: 'property' }),
          createIssue({ fingerprint: 'dependency-1' }),
          createIssue({ kind: 'dependency', fingerprint: 'dependency-2' }),
        ]),
      ).toEqual({ total: 3, property: 1, dependency: 2 });
    });
  });

  describe('getIssueKindLabel', () => {
    it('labels property issues', () => {
      expect(getIssueKindLabel({ kind: 'property' })).toBe('Property problem');
    });

    it('labels explicit dependency issues', () => {
      expect(getIssueKindLabel({ kind: 'dependency' })).toBe(
        'Dependency problem',
      );
    });

    it('labels issues without a kind as dependency issues', () => {
      expect(getIssueKindLabel({})).toBe('Dependency problem');
    });
  });
});
