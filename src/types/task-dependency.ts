/** Shared, read-only dependency diagnostics consumed by search and UI. */

export type DependencyReasonCode =
  | 'incomplete-blocker'
  | 'missing-reference'
  | 'ambiguous-reference'
  | 'invalid-reference'
  | 'unsupported-relation'
  | 'excluded-target'
  | 'pending-validation'
  | 'repeating-blocker'
  | 'cycle'
  | 'structural'
  | 'checkbox';

export interface DependencyReason {
  code: DependencyReasonCode;
  message: string;
  sourceKey: string;
  sourcePath: string;
  sourceLine: number;
  reference?: string;
  targetKey?: string;
  targetLabel?: string;
  /** True only for reasons that make an incomplete task blocked. */
  blocking: boolean;
}

export interface DependencyIssue {
  code: DependencyReasonCode;
  fingerprint: string;
  message: string;
  sourceKey?: string;
  reference?: string;
  targetKey?: string;
}

export interface DependencySnapshot {
  revision: number;
  ready: boolean;
  blocked: ReadonlySet<string>;
  reasonsByKey: ReadonlyMap<string, readonly DependencyReason[]>;
  issues: readonly DependencyIssue[];
  blockedKeys: readonly string[];
}

export interface ArchivedReferencePromotion {
  dependentKey: string;
  reference: string;
  targetKey: string;
  revision: number;
}
