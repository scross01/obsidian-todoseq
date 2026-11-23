import type { App } from 'obsidian';
import { Task } from '../types/task';
import {
  ArchivedReferencePromotion,
  DependencyIssue,
  DependencyReason,
  DependencySnapshot,
} from '../types/task-dependency';
import {
  parseDependencyReference,
  type DependencyReference,
} from '../utils/task-properties';
import { getTaskKey } from '../utils/task-utils';
import { buildTaskStructure } from '../utils/task-structure';
import type { StructuralEntry } from '../types/task-structure';
import { CHECKBOX_DETECTION_REGEX } from '../utils/patterns';
import { taskComparator } from '../utils/task-sort';
import { TaskStateManager } from './task-state-manager';

export interface TaskDependencyManagerOptions {
  app?: App;
  isPathExcluded?: (path: string) => boolean;
  getStructuralSettings?: () => {
    hierarchy: boolean;
    checkbox: boolean;
  };
  /** Published structural entries beside the task snapshot. */
  getStructureEntries?: () => ReadonlyMap<string, readonly StructuralEntry[]>;
  getStructureRevision?: () => number;
  /** Published after each successful rebuild, before the next read. */
  onSnapshot?: (snapshot: DependencySnapshot) => void;
}

interface ResolvedReference {
  raw: string;
  target: Task | null;
  code?:
    | 'missing-reference'
    | 'ambiguous-reference'
    | 'invalid-reference'
    | 'excluded-target';
  message?: string;
}

interface BuildEdge {
  sourceKey: string;
  targetKey: string;
}

/**
 * Derived dependency graph over the full collected task set.
 *
 * The manager holds no persistent index. Every read validates the state
 * manager's monotonic revision and rebuilds synchronously when it changed, so
 * completion gating cannot consume a stale snapshot merely because a render
 * was debounced.
 */
export class TaskDependencyManager {
  private unsubscribe: (() => void) | null = null;
  private snapshot: DependencySnapshot = {
    revision: -1,
    ready: false,
    blocked: new Set<string>(),
    reasonsByKey: new Map(),
    issues: [],
    issuesByKey: new Map(),
    blockedKeys: [],
  };
  private lastRevision = -1;
  private structureRevision = -1;
  private validationReady = true;
  private validationEpoch = 0;
  private snapshotValidationEpoch = -1;
  private rebuildCount = 0;
  private cachedTasks: Task[] = [];
  private tasksByKey = new Map<string, Task>();
  private edges: BuildEdge[] = [];
  private edgeKeys = new Set<string>();
  private dependents = new Map<string, Set<string>>();
  private promotions: ArchivedReferencePromotion[] = [];

  constructor(
    private readonly stateManager: TaskStateManager,
    private readonly options: TaskDependencyManagerOptions = {},
  ) {
    this.unsubscribe = this.stateManager.subscribe(() => {
      this.lastRevision = -1;
    });
    this.ensureFresh();
  }

  destroy(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.snapshot = {
      revision: -1,
      ready: false,
      blocked: new Set(),
      reasonsByKey: new Map(),
      issues: [],
      issuesByKey: new Map(),
      blockedKeys: [],
    };
    this.cachedTasks = [];
    this.tasksByKey.clear();
    this.edges = [];
    this.edgeKeys.clear();
    this.dependents.clear();
    this.promotions = [];
    this.validationReady = true;
    this.validationEpoch++;
    this.snapshotValidationEpoch = -1;
    this.structureRevision = -1;
  }

  /**
   * Scanner lifecycle signal. During indexing, an incomplete task that names
   * dependencies is conservatively blocked as checking rather than reported
   * as missing or silently treated as unblocked.
   */
  setValidationReady(ready: boolean): void {
    if (this.validationReady === ready) return;
    this.validationReady = ready;
    this.validationEpoch++;
  }

  isValidationReady(): boolean {
    return this.validationReady;
  }

  getRebuildCount(): number {
    return this.rebuildCount;
  }

  getRevision(): number {
    this.ensureFresh();
    return this.snapshot.revision;
  }

  getSnapshot(): DependencySnapshot {
    this.ensureFresh();
    return this.snapshot;
  }

  getBlockedKeys(): ReadonlySet<string> {
    this.ensureFresh();
    return this.snapshot.blocked;
  }

  isBlocked(taskKey: string): boolean {
    this.ensureFresh();
    return this.snapshot.blocked.has(taskKey);
  }

  getBlockingReasons(taskKey: string): readonly DependencyReason[] {
    this.ensureFresh();
    if (this.tasksByKey.get(taskKey)?.noblocking) return [];
    return (
      this.snapshot.reasonsByKey
        .get(taskKey)
        ?.filter((reason) => reason.blocking) ?? []
    );
  }

  getReasons(taskKey: string): readonly DependencyReason[] {
    this.ensureFresh();
    return this.snapshot.reasonsByKey.get(taskKey) ?? [];
  }

  getBlockers(taskKey: string): Task[] {
    this.ensureFresh();
    return this.edges
      .filter((edge) => edge.sourceKey === taskKey)
      .map((edge) => this.tasksByKey.get(edge.targetKey))
      .filter((task): task is Task => !!task && !task.completed)
      .sort(taskComparator);
  }

  getDependents(taskKey: string): Task[] {
    this.ensureFresh();
    const keys = this.dependents.get(taskKey) ?? new Set<string>();
    return Array.from(keys)
      .map((key) => this.tasksByKey.get(key))
      .filter((task): task is Task => !!task)
      .sort(taskComparator);
  }

  /**
   * Incoming active BLOCKER references for a task, captured while the target
   * is still in the current snapshot. Unlike getReasons(), this does not
   * require the target to be incomplete: completed prerequisites are exactly
   * the tasks that get archived.
   */
  getIncomingActiveReferences(
    target: Task,
  ): { dependent: Task; references: string[] }[] {
    this.ensureFresh();
    const targetKey = getTaskKey(target);
    const targetPath = target.path.replace(/\\/g, '/');
    const targetAnchor = target.embedReference?.replace(/^\^/, '');
    const pathSet = new Set(this.cachedTasks.map((task) => task.path));
    const result: { dependent: Task; references: string[] }[] = [];

    for (const dependent of this.cachedTasks) {
      if (getTaskKey(dependent) === targetKey) continue;
      const references: string[] = [];
      for (const raw of dependent.blockedBy ?? []) {
        const parsed = parseDependencyReference(
          raw,
          dependent.sourceFormat === 'org' ? 'org' : 'markdown',
        );
        if (parsed.kind === 'id') {
          if (target.id && parsed.id === target.id) references.push(raw);
          continue;
        }
        if (parsed.kind !== 'markdown-anchor' || !targetAnchor) continue;
        if (parsed.anchor !== targetAnchor) continue;
        const resolvedPath = this.resolveLinkPath(
          parsed.path,
          dependent.path,
          pathSet,
        );
        if (resolvedPath === targetPath) references.push(raw);
      }
      if (references.length > 0) result.push({ dependent, references });
    }
    return result;
  }

  getIssues(): readonly DependencyIssue[] {
    this.ensureFresh();
    return this.snapshot.issues;
  }

  /** Issues raised by one task, read from the snapshot's key index. */
  getIssuesForTask(taskKey: string): readonly DependencyIssue[] {
    this.ensureFresh();
    return this.snapshot.issuesByKey.get(taskKey) ?? [];
  }

  getArchivedReferencePromotions(): ArchivedReferencePromotion[] {
    this.ensureFresh();
    return [...this.promotions];
  }

  private ensureFresh(): void {
    const revision = this.stateManager.getRevision();
    const structureRevision = this.options.getStructureRevision?.() ?? 0;
    if (
      revision === this.lastRevision &&
      structureRevision === this.structureRevision &&
      this.validationEpoch === this.snapshotValidationEpoch
    ) {
      return;
    }
    this.rebuild(this.stateManager.getTasks(), revision);
  }

  /** Visible for tests: build an immutable snapshot from a task array. */
  rebuild(tasks: Task[], revision = this.stateManager.getRevision()): void {
    this.rebuildCount++;
    this.lastRevision = revision;
    this.structureRevision = this.options.getStructureRevision?.() ?? 0;
    this.snapshotValidationEpoch = this.validationEpoch;
    this.cachedTasks = [...tasks];
    this.tasksByKey = new Map(tasks.map((task) => [getTaskKey(task), task]));
    this.edges = [];
    this.edgeKeys.clear();
    this.dependents.clear();
    this.promotions = [];

    const idIndex = new Map<string, Task[]>();
    const anchorIndex = new Map<string, Task[]>();
    const pathSet = new Set(tasks.map((task) => task.path));

    for (const task of tasks) {
      if (task.id) {
        const list = idIndex.get(task.id) ?? [];
        list.push(task);
        idIndex.set(task.id, list);
      }
      if (task.embedReference?.startsWith('^')) {
        const key = `${task.path}#${task.embedReference.slice(1)}`;
        const list = anchorIndex.get(key) ?? [];
        list.push(task);
        anchorIndex.set(key, list);
      }
    }

    const issues: DependencyIssue[] = [];
    const reasonsByKey = new Map<string, DependencyReason[]>();
    const blocked = new Set<string>();
    const entriesByPath = this.options.getStructureEntries?.() ?? new Map();
    const structure = buildTaskStructure(tasks, entriesByPath);
    const structuralReasons = this.buildStructuralReasons(
      tasks,
      structure,
      this.options.getStructuralSettings?.() ?? {
        hierarchy: false,
        checkbox: false,
      },
      entriesByPath,
    );

    for (const [id, owners] of idIndex) {
      if (owners.length < 2) continue;
      issues.push({
        code: 'ambiguous-reference',
        fingerprint: `duplicate-id:${id}`,
        message:
          'Several tasks use the same ID, so references to it are ambiguous. Give each task a unique ID.',
        reference: id,
        sourceKey: getTaskKey(owners[1]),
      });
    }

    for (const task of tasks) {
      for (const propertyIssue of task.propertyIssues ?? []) {
        issues.push({
          code: 'invalid-reference',
          kind: 'property',
          fingerprint: `property:${getTaskKey(task)}:${propertyIssue.code}:${propertyIssue.line}:${propertyIssue.reference ?? propertyIssue.key ?? ''}`,
          message: propertyIssue.message,
          sourceKey: getTaskKey(task),
          reference: propertyIssue.reference,
        });
      }
    }

    for (const task of tasks) {
      const key = getTaskKey(task);
      const reasons: DependencyReason[] = [
        ...(structuralReasons.get(key) ?? []),
      ];
      const refs = task.blockedBy ?? [];
      const archived = new Set(task.archivedBlockers ?? []);

      if (!this.validationReady) {
        if (!task.completed && refs.length > 0) {
          reasons.push(
            this.reason(
              task,
              'pending-validation',
              'Checking dependencies…',
              refs[0],
              true,
            ),
          );
          blocked.add(key);
          reasonsByKey.set(key, reasons);
        }
        continue;
      }

      for (const raw of refs) {
        const parsed = parseDependencyReference(
          raw,
          task.sourceFormat === 'org' ? 'org' : 'markdown',
        );

        if (parsed.kind === 'previous-sibling') {
          const targetKey = structure.previousSiblingByKey.get(key);
          const target = targetKey ? this.tasksByKey.get(targetKey) : null;
          if (!target) {
            const message =
              'No earlier task exists in this section. Add one above this task or remove its previous-sibling dependency.';
            reasons.push(
              this.reason(task, 'missing-reference', message, raw, true),
            );
            issues.push(this.issue(task, 'missing-reference', message, raw));
          } else {
            this.addEdge(key, targetKey!);
            if (!target.completed) {
              reasons.push(
                this.reason(
                  task,
                  'incomplete-blocker',
                  `Blocked by the previous task, ${
                    target.text || target.id || 'an incomplete task'
                  }.`,
                  raw,
                  true,
                  target,
                ),
              );
            }
          }
          continue;
        }

        if (parsed.kind === 'invalid') {
          reasons.push(
            this.reason(task, 'invalid-reference', parsed.reason, raw, true),
          );
          issues.push(
            this.issue(task, 'invalid-reference', parsed.reason, raw),
          );
          continue;
        }

        const resolved = this.resolveReference(
          task,
          parsed,
          idIndex,
          anchorIndex,
          pathSet,
        );
        if (resolved.target) {
          this.addEdge(key, getTaskKey(resolved.target));
          if (!resolved.target.completed) {
            reasons.push(
              this.reason(
                task,
                'incomplete-blocker',
                `Blocked by ${resolved.target.text || resolved.target.id || 'an incomplete task'}.`,
                raw,
                true,
                resolved.target,
              ),
            );
          }
          if (
            resolved.target.scheduledDateRepeat ||
            resolved.target.deadlineDateRepeat
          ) {
            reasons.push(
              this.reason(
                task,
                'repeating-blocker',
                'This task repeats; dependents will be blocked again when it reopens.',
                raw,
                false,
                resolved.target,
              ),
            );
          }
        } else {
          const code = resolved.code ?? 'missing-reference';
          reasons.push(
            this.reason(
              task,
              code,
              resolved.message ??
                'The dependency could not be found. Check the reference or remove it.',
              raw,
              true,
            ),
          );
          issues.push(
            this.issue(
              task,
              code,
              resolved.message ??
                'The dependency could not be found. Check the reference or remove it.',
              raw,
            ),
          );
        }
      }

      if (archived.size > 0 && refs.some((ref) => archived.has(ref))) {
        issues.push(
          this.issue(
            task,
            'ambiguous-reference',
            'This dependency appears in both BLOCKER and ARCHIVED_BLOCKER. Remove it from one list.',
            refs.find((ref) => archived.has(ref)),
          ),
        );
      }

      // Archived history is inactive until its exact target reappears in the
      // permitted index. A unique reappearance is treated as active memory
      // state immediately, while 089 owns moving the source property back.
      for (const raw of archived) {
        if (refs.includes(raw)) continue;
        const parsed = parseDependencyReference(
          raw,
          task.sourceFormat === 'org' ? 'org' : 'markdown',
        );
        if (parsed.kind === 'invalid' || parsed.kind === 'previous-sibling') {
          issues.push(
            this.issue(
              task,
              'invalid-reference',
              'ARCHIVED_BLOCKER cannot store this reference. Remove it or replace it with a saved task ID or file-qualified block link.',
              raw,
            ),
          );
          continue;
        }
        const resolved = this.resolveReference(
          task,
          parsed,
          idIndex,
          anchorIndex,
          pathSet,
        );
        if (!resolved.target) {
          if (resolved.code === 'ambiguous-reference') {
            issues.push(
              this.issue(
                task,
                resolved.code,
                resolved.message ??
                  'The archived dependency matches more than one task. Remove it or use a unique ID or block link.',
                raw,
              ),
            );
          }
          continue;
        }

        const targetKey = getTaskKey(resolved.target);
        this.addEdge(key, targetKey);
        this.promotions.push({
          dependentKey: key,
          reference: raw,
          targetKey,
          revision,
        });
        if (!task.completed && !resolved.target.completed) {
          reasons.push(
            this.reason(
              task,
              'incomplete-blocker',
              `Blocked by ${
                resolved.target.text || raw
              }, restored from archived history and still incomplete.`,
              raw,
              true,
              resolved.target,
            ),
          );
        }
      }

      if (
        !task.completed &&
        !task.noblocking &&
        reasons.some((reason) => reason.blocking)
      ) {
        blocked.add(key);
      }
      if (reasons.length > 0) reasonsByKey.set(key, reasons);
    }

    for (const cycle of this.findCycles(tasks)) {
      const keys = cycle.sort();
      issues.push({
        code: 'cycle',
        fingerprint: `cycle:${keys.join('|')}`,
        message:
          'Dependency cycle detected. These tasks depend on each other, so remove one dependency to unblock them.',
        sourceKey: keys[0],
        targetKey: keys[1],
      });
    }

    const stableIssues = this.stableIssues(issues);
    const issuesByKey = new Map<string, DependencyIssue[]>();
    for (const issue of stableIssues) {
      if (!issue.sourceKey) continue;
      const list = issuesByKey.get(issue.sourceKey);
      if (list) list.push(issue);
      else issuesByKey.set(issue.sourceKey, [issue]);
    }

    this.snapshot = {
      revision,
      ready: this.validationReady,
      blocked,
      reasonsByKey,
      issues: stableIssues,
      issuesByKey,
      blockedKeys: Array.from(blocked).sort(),
    };

    try {
      this.options.onSnapshot?.(this.snapshot);
    } catch (error) {
      console.debug('[TaskDependencyManager] Snapshot listener failed:', error);
    }
  }

  clearCache(): void {
    this.lastRevision = -1;
    this.snapshotValidationEpoch = -1;
    this.structureRevision = -1;
  }

  private buildStructuralReasons(
    tasks: readonly Task[],
    structure: ReturnType<typeof buildTaskStructure>,
    settings: { hierarchy: boolean; checkbox: boolean },
    entriesByPath: ReadonlyMap<string, readonly StructuralEntry[]>,
  ): Map<string, DependencyReason[]> {
    const result = new Map<string, DependencyReason[]>();
    if (!settings.hierarchy && !settings.checkbox) return result;

    const seen = new Set<string>();
    const add = (
      parentKey: string,
      childIdentity: string,
      code: 'structural' | 'checkbox',
      message: string,
      target?: Task,
    ): void => {
      const parent = this.tasksByKey.get(parentKey);
      if (!parent) return;
      const fingerprint = `${parentKey}:${code}:${childIdentity}`;
      if (seen.has(fingerprint)) return;
      seen.add(fingerprint);
      const list = result.get(parentKey) ?? [];
      list.push(this.reason(parent, code, message, undefined, true, target));
      result.set(parentKey, list);
    };

    if (settings.hierarchy) {
      for (const child of tasks) {
        if (child.completed) continue;
        const key = getTaskKey(child);
        let parentKey = structure.parentByKey.get(key);
        while (parentKey) {
          add(
            parentKey,
            key,
            'structural',
            `Blocked by incomplete child task ${
              child.text || child.id || 'an incomplete task'
            }.`,
            child,
          );
          parentKey = structure.parentByKey.get(parentKey);
        }

        // ORDERED constrains every later sibling in the bounded group. The
        // nearest unfinished ordered predecessor is the actionable reason.
        const group = structure.groupByKey.get(key);
        const bucket = structure.parentByKey.get(key) ?? '';
        const siblings =
          (group ? structure.siblingsByGroup.get(group) : undefined) ??
          structure.siblingsByParent.get(bucket) ??
          [];
        const index = siblings.indexOf(key);
        for (let i = index - 1; i >= 0; i--) {
          const prior = this.tasksByKey.get(siblings[i]);
          if (prior?.ordered && !prior.completed) {
            const list = result.get(key) ?? [];
            list.push(
              this.reason(
                child,
                'structural',
                `Blocked by the earlier ORDERED task ${
                  prior.text || prior.id || 'in this list'
                }, which must be completed first.`,
                'ORDERED',
                true,
                prior,
              ),
            );
            result.set(key, list);
            break;
          }
        }
      }
    }

    if (settings.checkbox) {
      // Markdown: unchecked descendant checkboxes, including keywordless rows.
      for (const child of tasks) {
        if (child.completed || child.sourceFormat === 'org') continue;
        if (!CHECKBOX_DETECTION_REGEX.test(child.rawText.trimStart())) {
          continue;
        }
        const key = getTaskKey(child);
        let parentKey = structure.parentByKey.get(key);
        while (parentKey) {
          add(
            parentKey,
            key,
            'checkbox',
            `Blocked by an unchecked checkbox at line ${child.line + 1}.`,
            child,
          );
          parentKey = structure.parentByKey.get(parentKey);
        }
      }

      for (const [parentKey, entries] of structure.checkboxEntriesByParentKey) {
        if (!parentKey) continue;
        for (const entry of entries) {
          if (entry.path.toLowerCase().endsWith('.org')) continue;
          let owner: string | undefined = parentKey;
          while (owner) {
            add(
              owner,
              `${entry.path}:${entry.line}`,
              'checkbox',
              `Blocked by an unchecked checkbox at line ${entry.line + 1}.`,
            );
            owner = structure.parentByKey.get(owner);
          }
        }
      }

      // Org: one source-order sweep per file. A checkbox belongs to the
      // nearest preceding Org headline; the next headline (task or non-task)
      // closes that entry body. This replaces the old parent × all-tasks scan.
      const orgPaths = new Set<string>();
      for (const task of tasks) {
        if (
          task.sourceFormat === 'org' ||
          task.path.toLowerCase().endsWith('.org')
        ) {
          orgPaths.add(task.path);
        }
      }
      for (const [path, entries] of entriesByPath) {
        if (entries.some((entry) => entry.kind === 'checkbox')) {
          orgPaths.add(path);
        }
      }
      for (const path of orgPaths) {
        const items: Array<{
          line: number;
          task?: Task;
          entry?: StructuralEntry;
        }> = [];
        for (const task of tasks) {
          if (
            task.path === path &&
            (task.sourceFormat === 'org' ||
              task.path.toLowerCase().endsWith('.org'))
          ) {
            items.push({ line: task.line, task });
          }
        }
        const taskLines = new Set(items.map((item) => item.line));
        for (const entry of entriesByPath.get(path) ?? []) {
          if (
            (entry.kind === 'heading' || entry.kind === 'checkbox') &&
            !taskLines.has(entry.line)
          ) {
            items.push({ line: entry.line, entry });
          }
        }
        items.sort((a, b) => a.line - b.line);

        let current: Task | null = null;
        for (const item of items) {
          if (item.task) {
            current = item.task;
            continue;
          }
          const entry = item.entry!;
          if (entry.kind === 'heading') {
            current = null;
            continue;
          }
          if (entry.checked || !current || current.completed) continue;
          add(
            getTaskKey(current),
            `${entry.path}:${entry.line}`,
            'checkbox',
            `Blocked by an unchecked checkbox at line ${entry.line + 1}.`,
          );
        }
      }
    }

    return result;
  }

  private resolveReference(
    source: Task,
    reference: Exclude<DependencyReference, { kind: 'invalid' }>,
    idIndex: Map<string, Task[]>,
    anchorIndex: Map<string, Task[]>,
    pathSet: Set<string>,
  ): ResolvedReference {
    if (reference.kind === 'previous-sibling') {
      return {
        raw: reference.raw,
        target: null,
        code: 'invalid-reference',
        message: 'previous-sibling is not resolvable in this version.',
      };
    }

    if (reference.kind === 'id') {
      const targets = idIndex.get(reference.id);
      if (!targets || targets.length === 0) {
        return {
          raw: reference.raw,
          target: null,
          code: 'missing-reference',
          message: `Dependency ID unavailable: ${reference.id} not found in scanned tasks.`,
        };
      }
      if (targets.length > 1) {
        return {
          raw: reference.raw,
          target: null,
          code: 'ambiguous-reference',
          message: `Dependency ID ${reference.id} is declared by multiple tasks.`,
        };
      }
      return { raw: reference.raw, target: targets[0] };
    }

    const resolvedPath = this.resolveLinkPath(
      reference.path,
      source.path,
      pathSet,
    );
    if (this.options.isPathExcluded?.(resolvedPath)) {
      return {
        raw: reference.raw,
        target: null,
        code: 'excluded-target',
        message: 'Dependency unavailable: target excluded from scanning.',
      };
    }

    const fileKnown =
      pathSet.has(resolvedPath) ||
      !!this.options.app?.vault.getAbstractFileByPath(resolvedPath);
    if (!fileKnown) {
      return {
        raw: reference.raw,
        target: null,
        code: 'missing-reference',
        message: `Dependency link target not found: ${resolvedPath}.`,
      };
    }

    const targets = anchorIndex.get(`${resolvedPath}#${reference.anchor}`);
    if (!targets || targets.length === 0) {
      return {
        raw: reference.raw,
        target: null,
        code: 'missing-reference',
        message: `Dependency block ^${reference.anchor} was not found in ${resolvedPath}.`,
      };
    }
    if (targets.length > 1) {
      return {
        raw: reference.raw,
        target: null,
        code: 'ambiguous-reference',
        message: `Dependency block ^${reference.anchor} is ambiguous in ${resolvedPath}.`,
      };
    }
    return { raw: reference.raw, target: targets[0] };
  }

  private resolveLinkPath(
    linkPath: string,
    sourcePath: string,
    pathSet: Set<string>,
  ): string {
    const metadataCache = this.options.app?.metadataCache as
      | {
          getFirstLinkpathDest?: (
            linkpath: string,
            sourcePath: string,
          ) => { path: string } | null;
        }
      | undefined;
    const resolved = metadataCache?.getFirstLinkpathDest?.(
      linkPath,
      sourcePath,
    );
    if (resolved?.path) return resolved.path;

    const normalized = linkPath.replace(/^\/+/, '');
    if (pathSet.has(normalized)) return normalized;
    if (pathSet.has(`${normalized}.md`)) return `${normalized}.md`;
    return normalized.includes('.') ? normalized : `${normalized}.md`;
  }

  private addEdge(sourceKey: string, targetKey: string): void {
    const edgeKey = `${sourceKey}\u0000${targetKey}`;
    if (!this.edgeKeys.has(edgeKey)) {
      this.edgeKeys.add(edgeKey);
      this.edges.push({ sourceKey, targetKey });
    }
    const set = this.dependents.get(targetKey) ?? new Set<string>();
    set.add(sourceKey);
    this.dependents.set(targetKey, set);
  }

  private reason(
    source: Task,
    code: DependencyReason['code'],
    message: string,
    reference: string | undefined,
    blocking: boolean,
    target?: Task,
  ): DependencyReason {
    return {
      code,
      message,
      sourceKey: getTaskKey(source),
      sourcePath: source.path,
      sourceLine: source.line,
      reference,
      targetKey: target ? getTaskKey(target) : undefined,
      targetLabel: target?.text,
      blocking,
    };
  }

  private issue(
    source: Task,
    code: DependencyIssue['code'],
    message: string,
    reference?: string,
  ): DependencyIssue {
    const key = getTaskKey(source);
    return {
      code,
      fingerprint: `${code}:${key}:${reference ?? ''}`,
      message,
      sourceKey: key,
      reference,
    };
  }

  private stableIssues(issues: DependencyIssue[]): DependencyIssue[] {
    const seen = new Set<string>();
    return issues.filter((issue) => {
      if (seen.has(issue.fingerprint)) return false;
      seen.add(issue.fingerprint);
      return true;
    });
  }

  /** Iterative Kosaraju pass; no recursion on large vaults. */
  private findCycles(tasks: Task[]): string[][] {
    const keys = tasks.map(getTaskKey);
    const forward = new Map<string, string[]>();
    const reverse = new Map<string, string[]>();
    for (const key of keys) {
      forward.set(key, []);
      reverse.set(key, []);
    }
    for (const edge of this.edges) {
      forward.get(edge.sourceKey)?.push(edge.targetKey);
      reverse.get(edge.targetKey)?.push(edge.sourceKey);
    }

    const visited = new Set<string>();
    const finish: string[] = [];
    for (const start of keys) {
      if (visited.has(start)) continue;
      const stack: Array<{ key: string; index: number }> = [
        { key: start, index: 0 },
      ];
      visited.add(start);
      while (stack.length > 0) {
        const frame = stack[stack.length - 1];
        const next = forward.get(frame.key)?.[frame.index];
        if (next !== undefined) {
          frame.index++;
          if (!visited.has(next)) {
            visited.add(next);
            stack.push({ key: next, index: 0 });
          }
        } else {
          finish.push(frame.key);
          stack.pop();
        }
      }
    }

    const assigned = new Set<string>();
    const cycles: string[][] = [];
    for (let i = finish.length - 1; i >= 0; i--) {
      const start = finish[i];
      if (assigned.has(start)) continue;
      const component: string[] = [];
      const stack = [start];
      assigned.add(start);
      while (stack.length > 0) {
        const key = stack.pop()!;
        component.push(key);
        for (const previous of reverse.get(key) ?? []) {
          if (!assigned.has(previous)) {
            assigned.add(previous);
            stack.push(previous);
          }
        }
      }
      const selfLoop =
        component.length === 1 &&
        (forward.get(component[0]) ?? []).includes(component[0]);
      if (component.length > 1 || selfLoop) cycles.push(component);
    }
    return cycles;
  }
}
