import type { TaskDependencyManager } from '../src/services/task-dependency-manager';
import type {
  DependencyIssue,
  DependencyReason,
} from '../src/types/task-dependency';
import { resolveDependencyMarker } from '../src/view/components/dependency-marker';

function issue(
  message: string,
  options: Partial<DependencyIssue> = {},
): DependencyIssue {
  return {
    code: 'missing-reference',
    fingerprint: `missing:${message}`,
    message,
    sourceKey: 'a.md:0',
    ...options,
  };
}

function reason(message: string): DependencyReason {
  return {
    code: 'incomplete-blocker',
    message,
    sourceKey: 'a.md:0',
    sourcePath: 'a.md',
    sourceLine: 0,
    blocking: true,
  };
}

function managerFor(options: {
  issues?: DependencyIssue[];
  blocked?: boolean;
  reasons?: DependencyReason[];
}): TaskDependencyManager {
  const issues = options.issues ?? [];
  return {
    getIssuesForTask: (key: string) =>
      issues.filter((candidate) => candidate.sourceKey === key),
    isBlocked: () => options.blocked ?? false,
    getBlockingReasons: () => options.reasons ?? [],
  } as unknown as TaskDependencyManager;
}

describe('resolveDependencyMarker', () => {
  it('returns an issue marker carrying the first message', () => {
    const marker = resolveDependencyMarker(
      managerFor({ issues: [issue('Dependency missing.')] }),
      'a.md:0',
    );
    expect(marker).toEqual(
      expect.objectContaining({
        kind: 'issue',
        label: 'Dependency problem: Dependency missing.',
        details: 'Dependency missing.',
      }),
    );
  });

  it('counts remaining issues in the label and details', () => {
    const marker = resolveDependencyMarker(
      managerFor({
        issues: [issue('First problem.'), issue('Second problem.')],
      }),
      'a.md:0',
    );
    expect(marker?.details).toBe('First problem. (+1 more)');
    expect(marker?.label).toContain('(+1 more)');
  });

  it('ignores pending validation and falls through to blocked', () => {
    const marker = resolveDependencyMarker(
      managerFor({
        issues: [
          issue('Checking dependencies…', { code: 'pending-validation' }),
        ],
        blocked: true,
        reasons: [reason('Blocked by TODO Blocker.')],
      }),
      'a.md:0',
    );
    expect(marker).toEqual(
      expect.objectContaining({
        kind: 'blocked',
        details: 'Blocked by TODO Blocker.',
      }),
    );
  });

  it('joins blocking reasons for a blocked task with no issues', () => {
    const marker = resolveDependencyMarker(
      managerFor({
        blocked: true,
        reasons: [reason('Blocked by One.'), reason('Blocked by Two.')],
      }),
      'a.md:0',
    );
    expect(marker).toEqual({
      kind: 'blocked',
      label: 'Blocked by One. Blocked by Two.',
      details: 'Blocked by One. Blocked by Two.',
    });
  });

  it('uses the fallback label when a blocked task reports no reasons', () => {
    const marker = resolveDependencyMarker(
      managerFor({ blocked: true }),
      'a.md:0',
    );
    expect(marker?.label).toBe('Blocked by an incomplete dependency');
  });

  it('returns null for an unblocked task without issues', () => {
    expect(resolveDependencyMarker(managerFor({}), 'a.md:0')).toBeNull();
  });

  it('returns null without a manager', () => {
    expect(resolveDependencyMarker(null, 'a.md:0')).toBeNull();
  });

  it('does not let another task key affect the result', () => {
    const marker = resolveDependencyMarker(
      managerFor({
        issues: [issue('Other task problem.', { sourceKey: 'b.md:0' })],
      }),
      'a.md:0',
    );
    expect(marker).toBeNull();
  });
});
