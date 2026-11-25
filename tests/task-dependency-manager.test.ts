import { Task } from '../src/types/task';
import { TaskDependencyManager } from '../src/services/task-dependency-manager';
import { TaskStateManager } from '../src/services/task-state-manager';
import {
  createBaseTask,
  createTestKeywordManager,
} from './helpers/test-helper';

function task(overrides: Partial<Task> = {}): Task {
  return createBaseTask(overrides);
}

function managerFor(tasks: Task[]): {
  engine: TaskDependencyManager;
  state: TaskStateManager;
} {
  const keywordManager = createTestKeywordManager();
  const state = new TaskStateManager(keywordManager);
  state.setTasks(tasks);
  const engine = new TaskDependencyManager(state);
  return { engine, state };
}

describe('TaskDependencyManager', () => {
  it('blocks an incomplete task with an incomplete direct blocker', () => {
    const { engine } = managerFor([
      task({ path: 'a.md', line: 0, id: 'a', text: 'A', blockedBy: ['b'] }),
      task({ path: 'b.md', line: 0, id: 'b', text: 'B' }),
    ]);
    expect(engine.isBlocked('a.md:0')).toBe(true);
    expect(engine.getBlockingReasons('a.md:0')).toEqual([
      expect.objectContaining({
        code: 'incomplete-blocker',
        reference: 'b',
        targetKey: 'b.md:0',
      }),
    ]);
  });

  it('unblocks when the direct blocker completes and reblocks when it reopens', () => {
    const { engine, state } = managerFor([
      task({ path: 'a.md', line: 0, id: 'a', blockedBy: ['b'] }),
      task({ path: 'b.md', line: 0, id: 'b' }),
    ]);
    // Silent updates still advance the revision; freshness cannot depend on
    // subscriber delivery order.
    state.updateTaskByPathAndLine('b.md', 0, {
      completed: true,
      state: 'DONE',
    });
    expect(engine.isBlocked('a.md:0')).toBe(false);
    expect(engine.getBlockers('a.md:0')).toEqual([]);

    state.updateTaskByPathAndLine('b.md', 0, {
      completed: false,
      state: 'TODO',
    });
    state.notifySubscribers();
    expect(engine.isBlocked('a.md:0')).toBe(true);
  });

  it('uses direct org-depend semantics through a completed intermediary', () => {
    const { engine } = managerFor([
      task({ path: 'a.md', line: 0, id: 'a' }),
      task({ path: 'b.md', line: 0, id: 'b', blockedBy: ['a'] }),
      task({ path: 'c.md', line: 0, id: 'c', blockedBy: ['b'] }),
      task({
        path: 'd.md',
        line: 0,
        id: 'd',
        completed: true,
        state: 'DONE',
        blockedBy: ['c'],
      }),
    ]);
    // b is blocked by a, c is blocked by b, d is complete and never blocked.
    expect(engine.isBlocked('b.md:0')).toBe(true);
    expect(engine.isBlocked('c.md:0')).toBe(true);
    expect(engine.isBlocked('d.md:0')).toBe(false);
  });

  it('does not add implicit hierarchy blocking', () => {
    const { engine } = managerFor([
      task({ path: 'a.md', line: 0, id: 'a' }),
      task({ path: 'a.md', line: 1, text: 'child', indent: '  ' }),
    ]);
    expect(engine.isBlocked('a.md:0')).toBe(false);
  });

  it('resolves forward references and cross-file IDs', () => {
    const { engine } = managerFor([
      task({ path: 'later.md', line: 0, id: 'target' }),
      task({ path: 'first.md', line: 0, id: 'source', blockedBy: ['target'] }),
    ]);
    expect(engine.isBlocked('first.md:0')).toBe(true);
    expect(engine.getDependents('later.md:0')).toEqual([
      expect.objectContaining({ id: 'source' }),
    ]);
  });

  it('blocks a missing or ambiguous reference and never chooses a collision winner', () => {
    const { engine } = managerFor([
      task({ path: 'a.md', line: 0, id: 'a', blockedBy: ['missing', 'dup'] }),
      task({ path: 'b.md', line: 0, id: 'dup' }),
      task({ path: 'c.md', line: 0, id: 'dup' }),
    ]);
    expect(engine.isBlocked('a.md:0')).toBe(true);
    expect(engine.getBlockingReasons('a.md:0')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'missing-reference',
          reference: 'missing',
        }),
        expect.objectContaining({
          code: 'ambiguous-reference',
          reference: 'dup',
        }),
      ]),
    );
    expect(engine.getIssues()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'ambiguous-reference',
          reference: 'dup',
        }),
      ]),
    );
  });

  it('resolves file-qualified anchors by path and anchor, not globally', () => {
    const { engine } = managerFor([
      task({
        path: 'Source.md',
        line: 0,
        id: 'source',
        blockedBy: ['[[Research Notes#^collect-data]]'],
      }),
      task({
        path: 'Research Notes.md',
        line: 2,
        embedReference: '^collect-data',
      }),
      task({
        path: 'Other.md',
        line: 1,
        embedReference: '^collect-data',
        completed: true,
        state: 'DONE',
      }),
    ]);
    expect(engine.isBlocked('Source.md:0')).toBe(true);
    expect(engine.getBlockers('Source.md:0')[0].path).toBe('Research Notes.md');
  });

  it('resolves same-named anchors in different files independently', () => {
    const { engine } = managerFor([
      task({
        path: 'Source.md',
        line: 0,
        blockedBy: ['[[A#^same]]'],
      }),
      task({ path: 'A.md', line: 0, embedReference: '^same' }),
      task({
        path: 'B.md',
        line: 0,
        embedReference: '^same',
        completed: true,
        state: 'DONE',
      }),
    ]);
    expect(engine.isBlocked('Source.md:0')).toBe(true);
  });

  it('flags a self-loop as a cycle', () => {
    const { engine } = managerFor([
      task({ path: 'a.md', line: 0, id: 'a', blockedBy: ['a'] }),
    ]);
    expect(engine.getIssues()).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'cycle' })]),
    );
  });

  it('flags cycles but keeps direct completion checks authoritative', () => {
    const { engine, state } = managerFor([
      task({ path: 'a.md', line: 0, id: 'a', blockedBy: ['b'] }),
      task({ path: 'b.md', line: 0, id: 'b', blockedBy: ['a'] }),
    ]);
    expect(engine.isBlocked('a.md:0')).toBe(true);
    expect(engine.getIssues()).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'cycle' })]),
    );
    state.updateTaskByPathAndLine('b.md', 0, {
      completed: true,
      state: 'DONE',
    });
    state.notifySubscribers();
    expect(engine.isBlocked('a.md:0')).toBe(false);
  });

  it('treats archived history as inactive and only warns about active conflicts', () => {
    const { engine } = managerFor([
      task({
        path: 'a.md',
        line: 0,
        archivedBlockers: ['archived'],
      }),
      task({
        path: 'b.md',
        line: 0,
        blockedBy: ['archived'],
        archivedBlockers: ['archived'],
      }),
    ]);
    expect(engine.isBlocked('a.md:0')).toBe(false);
    expect(engine.getSnapshot().blockingKeys.size).toBe(0);
    expect(engine.getIssues()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'ambiguous-reference',
          reference: 'archived',
        }),
      ]),
    );
  });

  it('invalidates a derived snapshot when the state revision changes', () => {
    const { engine, state } = managerFor([
      task({ path: 'a.md', line: 0, id: 'a', blockedBy: ['b'] }),
      task({ path: 'b.md', line: 0, id: 'b' }),
    ]);
    const before = engine.getRevision();
    state.updateTaskByPathAndLine('b.md', 0, {
      completed: true,
      state: 'DONE',
    });
    state.notifySubscribers();
    expect(engine.getRevision()).toBeGreaterThan(before);
    expect(engine.isBlocked('a.md:0')).toBe(false);
  });

  it('reports pending rather than missing while dependency validation is being rebuilt', () => {
    const { engine, state } = managerFor([
      task({ path: 'a.md', line: 0, id: 'a', blockedBy: ['b'] }),
      task({ path: 'b.md', line: 0, id: 'b' }),
      task({ path: 'plain.md', line: 0, text: 'No dependencies' }),
    ]);
    engine.setValidationReady(false);
    expect(engine.getSnapshot().ready).toBe(false);
    expect(engine.isBlocked('a.md:0')).toBe(true);
    expect(engine.getBlockingReasons('a.md:0')).toEqual([
      expect.objectContaining({
        code: 'pending-validation',
        message: 'Checking dependencies…',
      }),
    ]);
    expect(engine.isBlocked('plain.md:0')).toBe(false);

    state.updateTaskByPathAndLine('b.md', 0, {
      completed: true,
      state: 'DONE',
    });
    engine.setValidationReady(true);
    expect(engine.getSnapshot().ready).toBe(true);
    expect(engine.isBlocked('a.md:0')).toBe(false);
  });

  it('promotes a uniquely restored archived reference into active memory state', () => {
    const keywordManager = createTestKeywordManager();
    const state = new TaskStateManager(keywordManager);
    state.setTasks([
      task({
        path: 'dependent.md',
        line: 0,
        id: 'dependent',
        archivedBlockers: ['restored'],
      }),
      task({ path: 'target.md', line: 0, id: 'restored' }),
    ]);
    const engine = new TaskDependencyManager(state);
    expect(engine.isBlocked('dependent.md:0')).toBe(true);
    expect(engine.getArchivedReferencePromotions()).toEqual([
      expect.objectContaining({
        dependentKey: 'dependent.md:0',
        reference: 'restored',
        targetKey: 'target.md:0',
      }),
    ]);

    state.updateTaskByPathAndLine('target.md', 0, {
      completed: true,
      state: 'DONE',
    });
    expect(engine.isBlocked('dependent.md:0')).toBe(false);
    expect(engine.getArchivedReferencePromotions()).toHaveLength(1);
  });

  it('inventories only references whose unique target is the archived task', () => {
    const target = task({
      path: 'target.md',
      line: 0,
      id: 'target',
      completed: true,
      state: 'DONE',
    });
    const unrelated = task({ path: 'other.md', line: 0, id: 'unrelated' });
    const dependent = task({
      path: 'dependent.md',
      line: 0,
      id: 'dependent',
      blockedBy: ['unrelated', 'target'],
    });
    const { engine } = managerFor([target, unrelated, dependent]);

    expect(engine.getIncomingActiveReferences(target)).toEqual([
      { dependent, references: ['target'] },
    ]);
  });

  it('leaves duplicate-ID references active during archive inventory', () => {
    const first = task({ path: 'a.md', line: 0, id: 'dup' });
    const second = task({ path: 'b.md', line: 0, id: 'dup' });
    const dependent = task({
      path: 'dependent.md',
      line: 0,
      blockedBy: ['dup'],
    });
    const { engine } = managerFor([first, second, dependent]);

    expect(engine.getIncomingActiveReferences(first)).toEqual([]);
    expect(engine.getIncomingActiveReferences(second)).toEqual([]);
  });

  it('leaves duplicate-anchor references active during archive inventory', () => {
    const first = task({
      path: 'Note.md',
      line: 0,
      embedReference: '^dup',
    });
    const second = task({
      path: 'Note.md',
      line: 1,
      embedReference: '^dup',
    });
    const dependent = task({
      path: 'dependent.md',
      line: 0,
      blockedBy: ['[[Note#^dup]]'],
    });
    const { engine } = managerFor([first, second, dependent]);

    expect(engine.getIncomingActiveReferences(first)).toEqual([]);
    expect(engine.getIncomingActiveReferences(second)).toEqual([]);
  });

  it('reports an excluded file-qualified target distinctly and blocks', () => {
    const keywordManager = createTestKeywordManager();
    const state = new TaskStateManager(keywordManager);
    state.setTasks([
      task({
        path: 'source.md',
        line: 0,
        blockedBy: ['[[Hidden#^secret]]'],
      }),
    ]);
    const engine = new TaskDependencyManager(state, {
      isPathExcluded: (path) => path === 'Hidden.md',
    });
    expect(engine.isBlocked('source.md:0')).toBe(true);
    expect(engine.getBlockingReasons('source.md:0')[0]).toEqual(
      expect.objectContaining({
        code: 'excluded-target',
        message: 'Dependency unavailable: target excluded from scanning.',
      }),
    );
  });

  it('surfaces parser property diagnostics without inventing a blocking reason', () => {
    const { engine } = managerFor([
      task({
        path: 'a.md',
        line: 0,
        propertyIssues: [
          {
            code: 'duplicate-key',
            key: 'ID',
            line: 2,
            message: 'ID is declared twice.',
          },
        ],
      }),
    ]);
    expect(engine.isBlocked('a.md:0')).toBe(false);
    expect(engine.getIssues()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'invalid-reference',
          kind: 'property',
          message: 'ID is declared twice.',
        }),
      ]),
    );
  });

  it('surfaces malformed and misplaced property diagnostics without hiding blocking', () => {
    const { engine } = managerFor([
      task({
        path: 'a.md',
        line: 0,
        blockedBy: ['missing-task'],
        propertyIssues: [
          {
            code: 'invalid-property',
            line: 2,
            reference: ':BOGUS',
            message: 'Malformed property entry ":BOGUS".',
          },
          {
            code: 'misplaced-metadata',
            line: 3,
            reference: 'SCHEDULED: <2026-03-05 Thu>',
            message: 'Metadata line is not allowed inside a properties drawer.',
          },
        ],
      }),
    ]);
    expect(engine.isBlocked('a.md:0')).toBe(true);
    expect(engine.getIssues()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'invalid-reference',
          kind: 'property',
          message: 'Malformed property entry ":BOGUS".',
        }),
        expect.objectContaining({
          code: 'invalid-reference',
          kind: 'property',
          message: 'Metadata line is not allowed inside a properties drawer.',
        }),
      ]),
    );
  });

  it('keeps table-cell task identities distinct', () => {
    const { engine } = managerFor([
      task({
        path: 'table.md',
        line: 0,
        isTableTask: true,
        tableCell: { cellIndex: 1 },
        id: 'cell-a',
        blockedBy: ['cell-b'],
      }),
      task({
        path: 'table.md',
        line: 0,
        isTableTask: true,
        tableCell: { cellIndex: 2 },
        id: 'cell-b',
      }),
    ]);
    expect(engine.isBlocked('table.md:0:1')).toBe(true);
    expect(engine.getBlockers('table.md:0:1')).toEqual([
      expect.objectContaining({ tableCell: { cellIndex: 2 } }),
    ]);
  });

  it('rebuilds exactly once per dependency revision for repeated reads', () => {
    const { engine, state } = managerFor([
      task({ path: 'a.md', line: 0, id: 'a', blockedBy: ['b'] }),
      task({ path: 'b.md', line: 0, id: 'b' }),
    ]);
    const before = engine.getRebuildCount();
    state.updateTaskByPathAndLine('b.md', 0, {
      completed: true,
      state: 'DONE',
    });
    expect(engine.isBlocked('a.md:0')).toBe(false);
    expect(engine.isBlocked('a.md:0')).toBe(false);
    expect(engine.getRebuildCount()).toBe(before + 1);
  });

  it('tracks line shifts and file deletion through the central state', () => {
    const { engine, state } = managerFor([
      task({ path: 'a.md', line: 0, id: 'a', blockedBy: ['b'] }),
      task({ path: 'b.md', line: 0, id: 'b' }),
    ]);
    state.adjustLineIndices('b.md', 0, 2);
    expect(engine.getBlockers('a.md:0')).toEqual([
      expect.objectContaining({ path: 'b.md', line: 2 }),
    ]);
    state.setTasks([
      task({ path: 'a.md', line: 0, id: 'a', blockedBy: ['b'] }),
    ]);
    expect(engine.isBlocked('a.md:0')).toBe(true);
    expect(engine.getBlockingReasons('a.md:0')[0].code).toBe(
      'missing-reference',
    );
  });

  it('handles 10k chained tasks without recursion overflow', () => {
    const tasks: Task[] = [];
    for (let i = 0; i < 10_000; i++) {
      tasks.push(
        task({
          path: 'chain.md',
          line: i,
          id: `id-${i}`,
          blockedBy: i > 0 ? [`id-${i - 1}`] : undefined,
        }),
      );
    }
    const { engine } = managerFor(tasks);
    expect(engine.isBlocked('chain.md:9999')).toBe(true);
    expect(engine.getSnapshot().revision).toBeGreaterThanOrEqual(0);
  });

  it('indexes issues by task key for O(1) row reads', () => {
    const { engine } = managerFor([
      task({ path: 'a.md', line: 0, id: 'a', blockedBy: ['missing'] }),
      task({ path: 'b.md', line: 0, id: 'b', blockedBy: ['also-missing'] }),
    ]);
    expect(engine.getIssuesForTask('a.md:0')).toEqual([
      expect.objectContaining({ code: 'missing-reference' }),
    ]);
    expect(engine.getIssuesForTask('b.md:0')).toEqual([
      expect.objectContaining({ code: 'missing-reference' }),
    ]);
    expect(engine.getIssuesForTask('unknown.md:0')).toEqual([]);
  });

  it('drops stale keyed issues when the graph rebuilds', () => {
    const { engine, state } = managerFor([
      task({ path: 'a.md', line: 0, id: 'a', blockedBy: ['missing'] }),
    ]);
    expect(engine.getIssuesForTask('a.md:0')).toHaveLength(1);

    state.setTasks([task({ path: 'a.md', line: 0, id: 'a' })]);
    expect(engine.getIssuesForTask('a.md:0')).toEqual([]);
  });

  describe('empty dependency graph fast path', () => {
    it('does not read structural entries when no task declares dependency metadata', () => {
      const keywordManager = createTestKeywordManager();
      const state = new TaskStateManager(keywordManager);
      state.setTasks([
        task({ path: 'a.md', line: 0 }),
        task({ path: 'b.md', line: 0, properties: { OWNER: 'perf' } }),
      ]);
      const getStructureEntries = jest.fn(() => new Map());
      const onSnapshot = jest.fn();
      const engine = new TaskDependencyManager(state, {
        getStructuralSettings: () => ({ hierarchy: false, checkbox: false }),
        getStructureEntries,
        getStructureRevision: () => 1,
        onSnapshot,
      });

      expect(getStructureEntries).not.toHaveBeenCalled();
      expect(onSnapshot).toHaveBeenCalledTimes(1);
      const snapshot = engine.getSnapshot();
      expect(snapshot.revision).toBe(state.getCommittedRevision());
      expect(snapshot.ready).toBe(true);
      expect(snapshot.blocked.size).toBe(0);
      expect(snapshot.blockingKeys.size).toBe(0);
      expect(snapshot.reasonsByKey.size).toBe(0);
      expect(snapshot.issues).toEqual([]);
      expect(snapshot.blockedKeys).toEqual([]);
    });

    it('reports duplicate IDs without building the graph when there are no references', () => {
      const state = new TaskStateManager(createTestKeywordManager());
      state.setTasks([
        task({ path: 'a.md', line: 0, id: 'dup' }),
        task({ path: 'b.md', line: 0, id: 'dup' }),
      ]);
      const getStructureEntries = jest.fn(() => new Map());
      const engine = new TaskDependencyManager(state, {
        getStructuralSettings: () => ({ hierarchy: false, checkbox: false }),
        getStructureEntries,
      });

      expect(getStructureEntries).not.toHaveBeenCalled();
      expect(engine.getIssues()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: 'ambiguous-reference',
            reference: 'dup',
          }),
        ]),
      );
    });

    it('builds the graph when a task declares a blocker', () => {
      const state = new TaskStateManager(createTestKeywordManager());
      state.setTasks([
        task({ path: 'a.md', line: 0, id: 'a', blockedBy: ['b'] }),
        task({ path: 'b.md', line: 0, id: 'b' }),
      ]);
      const getStructureEntries = jest.fn(() => new Map());
      const engine = new TaskDependencyManager(state, {
        getStructuralSettings: () => ({ hierarchy: false, checkbox: false }),
        getStructureEntries,
      });

      expect(getStructureEntries).toHaveBeenCalledTimes(1);
      expect(engine.isBlocked('a.md:0')).toBe(true);
    });

    it('builds the graph when a task declares archived dependency history', () => {
      const state = new TaskStateManager(createTestKeywordManager());
      state.setTasks([
        task({ path: 'a.md', line: 0, id: 'a', archivedBlockers: ['b'] }),
        task({ path: 'b.md', line: 0, id: 'b' }),
      ]);
      const getStructureEntries = jest.fn(() => new Map());
      const engine = new TaskDependencyManager(state, {
        getStructuralSettings: () => ({ hierarchy: false, checkbox: false }),
        getStructureEntries,
      });

      expect(getStructureEntries).toHaveBeenCalledTimes(1);
      expect(engine.getArchivedReferencePromotions()).toHaveLength(1);
    });

    it('clears cached tasks when a dependency is removed', () => {
      const state = new TaskStateManager(createTestKeywordManager());
      const target = task({ path: 'b.md', line: 0, id: 'b' });
      state.setTasks([
        task({ path: 'a.md', line: 0, id: 'a', blockedBy: ['b'] }),
        target,
      ]);
      const engine = new TaskDependencyManager(state);
      expect(engine.getIncomingActiveReferences(target)).toHaveLength(1);

      state.setTasks([task({ path: 'a.md', line: 0, id: 'a' }), target]);
      expect(engine.getIncomingActiveReferences(target)).toEqual([]);
    });

    it('builds structural reasons when a structural gate is enabled', () => {
      const state = new TaskStateManager(createTestKeywordManager());
      state.setTasks([
        task({ path: 'a.md', line: 0 }),
        task({ path: 'a.md', line: 1, indent: '  ' }),
      ]);
      const getStructureEntries = jest.fn(() => new Map());
      const engine = new TaskDependencyManager(state, {
        getStructuralSettings: () => ({ hierarchy: true, checkbox: false }),
        getStructureEntries,
      });

      expect(getStructureEntries).toHaveBeenCalledTimes(1);
    });
  });

  describe('blocking urgency graph', () => {
    it('indexes a cross-file prerequisite once for multiple dependents', () => {
      const { engine } = managerFor([
        task({ path: 'blocker.md', line: 0, id: 'blocker' }),
        task({ path: 'a.md', line: 0, blockedBy: ['blocker'] }),
        task({ path: 'b.md', line: 0, blockedBy: ['blocker'] }),
      ]);

      const keys = engine.getSnapshot().blockingKeys;
      expect(keys.has('blocker.md:0')).toBe(true);
      expect(keys.size).toBe(1);
    });

    it('drops the prerequisite after the last dependent edge is removed', () => {
      const { engine, state } = managerFor([
        task({ path: 'blocker.md', line: 0, id: 'blocker' }),
        task({ path: 'a.md', line: 0, blockedBy: ['blocker'] }),
      ]);
      expect(engine.getSnapshot().blockingKeys.has('blocker.md:0')).toBe(true);

      state.updateTaskByPathAndLine('a.md', 0, { blockedBy: [] });
      expect(engine.getSnapshot().blockingKeys.size).toBe(0);
    });

    it('updates after a dependent edge is committed in another file', () => {
      const { engine, state } = managerFor([
        task({ path: 'blocker.md', line: 0, id: 'blocker' }),
        task({ path: 'a.md', line: 0, id: 'a' }),
      ]);
      expect(engine.getSnapshot().blockingKeys.size).toBe(0);

      state.updateTaskByPathAndLine('a.md', 0, { blockedBy: ['blocker'] });
      expect(engine.getSnapshot().blockingKeys.has('blocker.md:0')).toBe(true);
    });

    it('deduplicates repeated references and multiple dependents', () => {
      const { engine } = managerFor([
        task({ path: 'blocker.md', line: 0, id: 'blocker' }),
        task({ path: 'a.md', line: 0, blockedBy: ['blocker', 'blocker'] }),
        task({ path: 'b.md', line: 0, blockedBy: ['blocker'] }),
      ]);

      const keys = engine.getSnapshot().blockingKeys;
      expect(keys.has('blocker.md:0')).toBe(true);
      expect(keys.size).toBe(1);
    });

    it('excludes self-references from the boost', () => {
      const { engine } = managerFor([
        task({ path: 'a.md', line: 0, id: 'a', blockedBy: ['a'] }),
      ]);

      expect(engine.getSnapshot().blockingKeys.size).toBe(0);
    });

    it('requires both ends to be incomplete', () => {
      const { engine, state } = managerFor([
        task({
          path: 'blocker.md',
          line: 0,
          id: 'blocker',
          completed: true,
          state: 'DONE',
        }),
        task({ path: 'a.md', line: 0, blockedBy: ['blocker'] }),
      ]);
      expect(engine.getSnapshot().blockingKeys.size).toBe(0);

      state.updateTaskByPathAndLine('blocker.md', 0, {
        completed: false,
        state: 'TODO',
      });
      expect(engine.getSnapshot().blockingKeys.has('blocker.md:0')).toBe(true);

      state.updateTaskByPathAndLine('a.md', 0, {
        completed: true,
        state: 'DONE',
      });
      expect(engine.getSnapshot().blockingKeys.size).toBe(0);

      state.updateTaskByPathAndLine('a.md', 0, {
        completed: false,
        state: 'TODO',
      });
      expect(engine.getSnapshot().blockingKeys.has('blocker.md:0')).toBe(true);
    });

    it('honors the dependent bypass but not the prerequisite bypass', () => {
      const { engine: bypassed } = managerFor([
        task({ path: 'blocker.md', line: 0, id: 'blocker' }),
        task({
          path: 'bypass.md',
          line: 0,
          blockedBy: ['blocker'],
          noblocking: true,
        }),
      ]);
      expect(bypassed.getSnapshot().blockingKeys.size).toBe(0);

      const { engine: prerequisiteBypass } = managerFor([
        task({ path: 'blocker.md', line: 0, id: 'blocker', noblocking: true }),
        task({ path: 'normal.md', line: 0, blockedBy: ['blocker'] }),
      ]);
      expect(
        prerequisiteBypass.getSnapshot().blockingKeys.has('blocker.md:0'),
      ).toBe(true);
    });

    it('ignores unresolved, ambiguous, and completed archived targets', () => {
      const { engine } = managerFor([
        task({ path: 'a.md', line: 0, blockedBy: ['missing'] }),
        task({ path: 'dup1.md', line: 0, id: 'dup' }),
        task({ path: 'dup2.md', line: 0, id: 'dup' }),
        task({ path: 'b.md', line: 0, blockedBy: ['dup'] }),
        task({
          path: 'done.md',
          line: 0,
          id: 'done',
          completed: true,
          state: 'DONE',
          archivedBlockers: ['done'],
        }),
        task({ path: 'c.md', line: 0, archivedBlockers: ['done'] }),
      ]);
      expect(engine.getSnapshot().blockingKeys.size).toBe(0);
    });

    it('scores a restored archived dependency while its target is incomplete', () => {
      const { engine } = managerFor([
        task({ path: 'target.md', line: 0, id: 'target' }),
        task({ path: 'a.md', line: 0, archivedBlockers: ['target'] }),
      ]);
      expect(engine.getSnapshot().blockingKeys.has('target.md:0')).toBe(true);
    });

    it('keeps edges entering or leaving a cycle', () => {
      const { engine } = managerFor([
        task({ path: 'a.md', line: 0, id: 'a', blockedBy: ['b', 'd'] }),
        task({ path: 'b.md', line: 0, id: 'b', blockedBy: ['a'] }),
        task({ path: 'c.md', line: 0, blockedBy: ['a'] }),
        task({ path: 'd.md', line: 0, id: 'd' }),
      ]);
      const keys = engine.getSnapshot().blockingKeys;
      expect(keys.has('a.md:0')).toBe(true);
      expect(keys.has('b.md:0')).toBe(false);
      expect(keys.has('d.md:0')).toBe(true);
    });

    it('keeps edges between distinct cyclic components', () => {
      const { engine } = managerFor([
        task({ path: 'a.md', line: 0, id: 'a', blockedBy: ['b'] }),
        task({ path: 'b.md', line: 0, id: 'b', blockedBy: ['a', 'c'] }),
        task({ path: 'c.md', line: 0, id: 'c', blockedBy: ['d'] }),
        task({ path: 'd.md', line: 0, id: 'd', blockedBy: ['c'] }),
      ]);
      const keys = engine.getSnapshot().blockingKeys;
      expect(keys.has('c.md:0')).toBe(true);
      expect(keys.has('a.md:0')).toBe(false);
    });

    it('includes task-backed hierarchy constraints when enabled', () => {
      const keywordManager = createTestKeywordManager();
      const state = new TaskStateManager(keywordManager);
      state.setTasks([
        task({ path: 'a.md', line: 0, text: 'parent' }),
        task({
          path: 'a.md',
          line: 1,
          text: 'child',
          indent: '  ',
        }),
      ]);
      const settings = { hierarchy: true, checkbox: false };
      const engine = new TaskDependencyManager(state, {
        getStructuralSettings: () => settings,
      });

      expect(engine.getSnapshot().blockingKeys.has('a.md:1')).toBe(true);
      expect(engine.getSnapshot().blockingKeys.has('a.md:0')).toBe(false);

      settings.hierarchy = false;
      engine.clearCache();
      expect(engine.getSnapshot().blockingKeys.size).toBe(0);
    });

    it('includes ORDERED predecessors when hierarchy settings are enabled', () => {
      const keywordManager = createTestKeywordManager();
      const state = new TaskStateManager(keywordManager);
      state.setTasks([
        task({ path: 'a.md', line: 0, text: 'first', ordered: true }),
        task({ path: 'a.md', line: 1, text: 'second' }),
      ]);
      const engine = new TaskDependencyManager(state, {
        getStructuralSettings: () => ({ hierarchy: true, checkbox: false }),
      });

      expect(engine.getSnapshot().blockingKeys.has('a.md:0')).toBe(true);
      expect(engine.getSnapshot().blockingKeys.has('a.md:1')).toBe(false);
    });

    it('includes task-backed checkbox constraints when enabled', () => {
      const keywordManager = createTestKeywordManager();
      const state = new TaskStateManager(keywordManager);
      state.setTasks([
        task({ path: 'a.md', line: 0, text: 'parent' }),
        task({
          path: 'a.md',
          line: 1,
          indent: '  ',
          text: 'child',
          rawText: '- [ ] TODO child',
        }),
      ]);
      const engine = new TaskDependencyManager(state, {
        getStructuralSettings: () => ({ hierarchy: false, checkbox: true }),
      });

      expect(engine.getSnapshot().blockingKeys.has('a.md:1')).toBe(true);
      expect(engine.getSnapshot().blockingKeys.has('a.md:0')).toBe(false);
    });

    it('does not score a standalone checkbox without an indexed task', () => {
      const keywordManager = createTestKeywordManager();
      const state = new TaskStateManager(keywordManager);
      state.setTasks([task({ path: 'a.md', line: 0, text: 'parent' })]);
      const engine = new TaskDependencyManager(state, {
        getStructuralSettings: () => ({ hierarchy: false, checkbox: true }),
        getStructureEntries: () =>
          new Map([
            [
              'a.md',
              [
                {
                  kind: 'checkbox',
                  path: 'a.md',
                  line: 1,
                  indent: '  ',
                  indentLength: 2,
                  quotePrefix: '',
                  checked: false,
                },
              ],
            ],
          ]),
      });

      expect(engine.getSnapshot().blockingKeys.size).toBe(0);
    });

    it('publishes no scoring edges while validation is not ready', () => {
      const { engine } = managerFor([
        task({ path: 'blocker.md', line: 0, id: 'blocker' }),
        task({ path: 'a.md', line: 0, blockedBy: ['blocker'] }),
      ]);
      expect(engine.getSnapshot().blockingKeys.size).toBe(1);

      engine.setValidationReady(false);
      expect(engine.getSnapshot().ready).toBe(false);
      expect(engine.getSnapshot().blockingKeys.size).toBe(0);
    });
  });
});
