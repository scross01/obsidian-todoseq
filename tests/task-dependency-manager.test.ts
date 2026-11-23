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
});
