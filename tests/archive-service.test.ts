import {
  DefaultSettings,
  DefaultTaskArchiveSettings,
  TaskArchiveSettings,
} from '../src/settings/settings-types';
import {
  ArchiveCandidate,
  ArchiveRunConfig,
  ArchiveService,
} from '../src/services/archive-service';
import { KeywordManager } from '../src/utils/keyword-manager';

// Timezone-safe local date helper (AGENTS.md rule: never Date.now()/UTC in tests).
function localDate(year: number, month: number, day: number, hour = 12): Date {
  return new Date(year, month - 1, day, hour, 0, 0, 0);
}

/** Days before the reference date, as a local date at noon (avoids DST edges). */
function daysBefore(reference: Date, days: number): Date {
  return new Date(
    reference.getFullYear(),
    reference.getMonth(),
    reference.getDate() - days,
    12,
    0,
    0,
    0,
  );
}

const REFERENCE = localDate(2026, 9, 24); // fixed reference 'now' for all evaluator tests

function makeMapping(
  source: string,
  target = 'ARCHIVED',
  enabled = true,
): ArchiveRunConfig['stateMappings'][number] {
  return { source, enabled, target };
}

function makeConfig(
  overrides: Partial<ArchiveRunConfig> = {},
): ArchiveRunConfig {
  return {
    criterionMode: 'days',
    criterionDays: 90,
    criterionDate: '',
    stateMappings: [makeMapping('DONE'), makeMapping('CANCELLED')],
    includeNoClosedDate: false,
    ...overrides,
  };
}

let nextLine = 0;

function makeTask(
  overrides: Partial<ArchiveCandidate> & {
    state?: string;
    closedDate?: Date | null;
  },
): ArchiveCandidate {
  nextLine += 1;
  return {
    path: `notes/test.md`,
    line: nextLine,
    rawText: `- [x] ${overrides.state ?? 'DONE'} task text`,
    state: 'DONE',
    closedDate: null,
    ...overrides,
  };
}

function makeService(archiveSettings: Partial<TaskArchiveSettings> = {}): {
  service: ArchiveService;
  keywordManager: KeywordManager;
} {
  const keywordManager = new KeywordManager(DefaultSettings);
  const settings: TaskArchiveSettings = {
    ...DefaultTaskArchiveSettings,
    ...archiveSettings,
  };
  return {
    service: new ArchiveService(keywordManager, settings),
    keywordManager,
  };
}

describe('TaskArchiveSettings defaults', () => {
  it('ships with sane defaults', () => {
    expect(DefaultTaskArchiveSettings).toEqual({
      autoArchiveEnabled: false, // opt-in only
      criterionDays: 90, // days-mode threshold
      criterionMode: 'days', // 'days' | 'date' (date = manual runs only)
      criterionDate: '', // ISO YYYY-MM-DD string, used when mode='date'
      stateMappings: [], // ArchiveStateMapping[]
      includeNoClosedDate: false, // reserved: always false in this feature version
    });
    expect(DefaultSettings).toMatchObject({
      taskArchive: DefaultTaskArchiveSettings,
    });
  });
});

describe('ArchiveService.evaluateArchiveCriteria', () => {
  const { service } = makeService();

  describe('days mode', () => {
    it('matches tasks closed more than criterionDays ago', () => {
      const tasks = [
        makeTask({ state: 'DONE', closedDate: daysBefore(REFERENCE, 100) }),
      ];
      const matches = service.evaluateArchiveCriteria(
        tasks,
        makeConfig(),
        REFERENCE,
      );
      expect(matches).toHaveLength(1);
      expect(matches[0]).toMatchObject({ state: 'DONE', target: 'ARCHIVED' });
    });

    it('does not match recently closed tasks', () => {
      const tasks = [
        makeTask({ state: 'DONE', closedDate: daysBefore(REFERENCE, 10) }),
      ];
      expect(
        service.evaluateArchiveCriteria(tasks, makeConfig(), REFERENCE),
      ).toHaveLength(0);
    });

    it('matches at the exact boundary (age >= criterionDays, inclusive)', () => {
      const tasks = [
        makeTask({ state: 'DONE', closedDate: daysBefore(REFERENCE, 90) }),
      ];
      expect(
        service.evaluateArchiveCriteria(tasks, makeConfig(), REFERENCE),
      ).toHaveLength(1);
    });

    it('matches a task closed 91 days ago at 23:59 (time-of-day does not skip the boundary)', () => {
      // 91 days ago late evening: day-difference is 91, must match even though
      // the reference noon-time gives >90 full 24h periods.
      const closed = new Date(
        REFERENCE.getFullYear(),
        REFERENCE.getMonth(),
        REFERENCE.getDate() - 91,
        23,
        59,
      );
      const tasks = [makeTask({ state: 'DONE', closedDate: closed })];
      expect(
        service.evaluateArchiveCriteria(tasks, makeConfig(), REFERENCE),
      ).toHaveLength(1);
    });
  });

  describe('date mode', () => {
    it('matches tasks closed strictly before criterionDate', () => {
      const config = makeConfig({
        criterionMode: 'date',
        criterionDate: '2026-02-01',
      });
      const before = [
        makeTask({ state: 'DONE', closedDate: localDate(2026, 1, 15) }),
      ];
      const after = [
        makeTask({ state: 'DONE', closedDate: localDate(2026, 2, 15) }),
      ];
      expect(
        service.evaluateArchiveCriteria(before, config, REFERENCE),
      ).toHaveLength(1);
      expect(
        service.evaluateArchiveCriteria(after, config, REFERENCE),
      ).toHaveLength(0);
    });

    it('does not match a task closed exactly on criterionDate (strict "before")', () => {
      const config = makeConfig({
        criterionMode: 'date',
        criterionDate: '2026-02-01',
      });
      const tasks = [
        makeTask({ state: 'DONE', closedDate: localDate(2026, 2, 1) }),
      ];
      expect(
        service.evaluateArchiveCriteria(tasks, config, REFERENCE),
      ).toHaveLength(0);
    });

    it('matches nothing when criterionDate is unset', () => {
      const config = makeConfig({ criterionMode: 'date', criterionDate: '' });
      const tasks = [
        makeTask({ state: 'DONE', closedDate: localDate(2020, 1, 1) }),
      ];
      expect(
        service.evaluateArchiveCriteria(tasks, config, REFERENCE),
      ).toHaveLength(0);
    });
  });

  describe('closed-date requirement', () => {
    it('never matches tasks without a CLOSED date', () => {
      const tasks = [makeTask({ state: 'DONE', closedDate: null })];
      expect(
        service.evaluateArchiveCriteria(tasks, makeConfig(), REFERENCE),
      ).toHaveLength(0);
    });

    it('rejects no-closed-date tasks even if includeNoClosedDate is somehow true (regression guard)', () => {
      const config = makeConfig({ includeNoClosedDate: true as const });
      const tasks = [makeTask({ state: 'DONE', closedDate: null })];
      expect(
        service.evaluateArchiveCriteria(tasks, config, REFERENCE),
      ).toHaveLength(0);
    });
  });

  describe('state mapping', () => {
    it('only matches states with an enabled mapping', () => {
      const tasks = [
        makeTask({ state: 'DONE', closedDate: daysBefore(REFERENCE, 100) }),
        makeTask({
          state: 'CANCELLED',
          closedDate: daysBefore(REFERENCE, 100),
        }),
        makeTask({
          state: 'WAIT-DONE',
          closedDate: daysBefore(REFERENCE, 100),
        }),
      ];
      const matches = service.evaluateArchiveCriteria(
        tasks,
        makeConfig(),
        REFERENCE,
      );
      expect(matches.map((m) => m.state)).toEqual(['DONE', 'CANCELLED']);
    });

    it('ignores disabled mappings', () => {
      const config = makeConfig({
        stateMappings: [makeMapping('DONE', 'ARCHIVED', false)],
      });
      const tasks = [
        makeTask({ state: 'DONE', closedDate: daysBefore(REFERENCE, 100) }),
      ];
      expect(
        service.evaluateArchiveCriteria(tasks, config, REFERENCE),
      ).toHaveLength(0);
    });

    it('routes each state to its own mapped target (DONE→ARCHIVED, CANCELLED→ABANDONED)', () => {
      const config = makeConfig({
        stateMappings: [
          makeMapping('DONE', 'ARCHIVED'),
          makeMapping('CANCELLED', 'ABANDONED'),
        ],
      });
      const keywordManager = new KeywordManager({
        ...DefaultSettings,
        additionalArchivedKeywords: ['ABANDONED'],
      });
      const customService = new ArchiveService(
        keywordManager,
        DefaultTaskArchiveSettings,
      );
      const tasks = [
        makeTask({ state: 'DONE', closedDate: daysBefore(REFERENCE, 100) }),
        makeTask({
          state: 'CANCELLED',
          closedDate: daysBefore(REFERENCE, 100),
        }),
      ];
      const matches = customService.evaluateArchiveCriteria(
        tasks,
        config,
        REFERENCE,
      );
      expect(matches).toHaveLength(2);
      expect(matches.find((m) => m.state === 'DONE')?.target).toBe('ARCHIVED');
      expect(matches.find((m) => m.state === 'CANCELLED')?.target).toBe(
        'ABANDONED',
      );
    });

    it('uses the first enabled mapping when duplicates exist (deterministic)', () => {
      const config = makeConfig({
        stateMappings: [
          makeMapping('DONE', 'ARCHIVED', true),
          makeMapping('DONE', 'ARCHIVED', true),
        ],
      });
      const tasks = [
        makeTask({ state: 'DONE', closedDate: daysBefore(REFERENCE, 100) }),
      ];
      const matches = service.evaluateArchiveCriteria(tasks, config, REFERENCE);
      expect(matches).toHaveLength(1);
      expect(matches[0].target).toBe('ARCHIVED');
    });

    it('never matches states that are themselves archived keywords', () => {
      const config = makeConfig({
        stateMappings: [makeMapping('ARCHIVED', 'ARCHIVED', true)],
      });
      const tasks = [
        makeTask({ state: 'ARCHIVED', closedDate: daysBefore(REFERENCE, 100) }),
      ];
      expect(
        service.evaluateArchiveCriteria(tasks, config, REFERENCE),
      ).toHaveLength(0);
    });
  });

  describe('target validation', () => {
    it('rejects mappings whose target is not an archived-group keyword', () => {
      const config = makeConfig({
        stateMappings: [makeMapping('DONE', 'DONE')],
      });
      const tasks = [
        makeTask({ state: 'DONE', closedDate: daysBefore(REFERENCE, 100) }),
      ];
      expect(
        service.evaluateArchiveCriteria(tasks, config, REFERENCE),
      ).toHaveLength(0);
    });

    it('rejects custom targets unknown to the KeywordManager', () => {
      // ABANDONED is not in DefaultSettings archived keywords — mapping is invalid there.
      const config = makeConfig({
        stateMappings: [makeMapping('DONE', 'ABANDONED')],
      });
      const tasks = [
        makeTask({ state: 'DONE', closedDate: daysBefore(REFERENCE, 100) }),
      ];
      expect(
        service.evaluateArchiveCriteria(tasks, config, REFERENCE),
      ).toHaveLength(0);
    });

    it('accepts custom targets present in the user archived-keyword settings', () => {
      const keywordManager = new KeywordManager({
        ...DefaultSettings,
        additionalArchivedKeywords: ['ABANDONED'],
      });
      const customService = new ArchiveService(
        keywordManager,
        DefaultTaskArchiveSettings,
      );
      const config = makeConfig({
        stateMappings: [makeMapping('DONE', 'ABANDONED')],
      });
      const tasks = [
        makeTask({ state: 'DONE', closedDate: daysBefore(REFERENCE, 100) }),
      ];
      const matches = customService.evaluateArchiveCriteria(
        tasks,
        config,
        REFERENCE,
      );
      expect(matches).toHaveLength(1);
      expect(matches[0].target).toBe('ABANDONED');
    });
  });

  describe('config source', () => {
    it('falls back to the constructor settings when config is omitted', () => {
      const { service: configured } = makeService({
        criterionDays: 30,
        stateMappings: [makeMapping('DONE')],
      });
      const tasks = [
        makeTask({ state: 'DONE', closedDate: daysBefore(REFERENCE, 45) }),
        makeTask({ state: 'DONE', closedDate: daysBefore(REFERENCE, 10) }),
      ];
      const matches = configured.evaluateArchiveCriteria(
        tasks,
        undefined,
        REFERENCE,
      );
      expect(matches).toHaveLength(1);
    });
  });
});

describe('ArchiveService.applyArchives', () => {
  class FakeCoordinator {
    calls: { state: string; target: string; rawText: string }[] = [];
    async updateTaskState(
      task: { state: string; rawText: string },
      newState: string,
    ): Promise<void> {
      this.calls.push({
        state: task.state,
        target: newState,
        rawText: task.rawText,
      });
    }
  }

  function setup() {
    const { service } = makeService({ stateMappings: [makeMapping('DONE')] });
    const coordinator = new FakeCoordinator();
    const store = new Map<string, ArchiveCandidate>();
    const deps = {
      getTask: (path: string, line: number) =>
        store.get(`${path}:${line}`) ?? null,
      apply: async (task: { state: string }, target: string) => {
        await coordinator.updateTaskState(task, target);
      },
    };
    return { service, coordinator, store, deps };
  }

  it('applies to all matches and journals one record per apply', async () => {
    const { service, coordinator, store, deps } = setup();
    const tasks = [
      makeTask({
        state: 'DONE',
        closedDate: daysBefore(REFERENCE, 100),
        rawText: '- [x] DONE first',
      }),
      makeTask({
        state: 'DONE',
        closedDate: daysBefore(REFERENCE, 120),
        rawText: '- [x] DONE second',
      }),
    ];
    tasks.forEach((t) => store.set(`${t.path}:${t.line}`, t));
    const matches = service.evaluateArchiveCriteria(
      tasks,
      makeConfig(),
      REFERENCE,
    );

    const result = await service.applyArchives(matches, deps);

    expect(result.archived).toHaveLength(2);
    expect(result.skipped).toHaveLength(0);
    expect(coordinator.calls).toHaveLength(2);
    expect(coordinator.calls.every((c) => c.target === 'ARCHIVED')).toBe(true);
    expect(service.hasUndoableRun()).toBe(true);
    expect(result.archived[0]).toMatchObject({
      path: tasks[0].path,
      line: tasks[0].line,
      originalState: 'DONE',
      target: 'ARCHIVED',
      rawTextBefore: '- [x] DONE first',
    });
  });

  it('skips stale tasks (no longer present) without applying or journaling', async () => {
    const { service, coordinator, deps } = setup();
    const task = makeTask({
      state: 'DONE',
      closedDate: daysBefore(REFERENCE, 100),
    });
    const matches = service.evaluateArchiveCriteria(
      [task],
      makeConfig(),
      REFERENCE,
    );

    const result = await service.applyArchives(matches, deps); // store empty → getTask returns null

    expect(result.archived).toHaveLength(0);
    expect(result.skipped).toEqual([
      { path: task.path, line: task.line, reason: 'stale' },
    ]);
    expect(coordinator.calls).toHaveLength(0);
    expect(service.hasUndoableRun()).toBe(false);
  });

  it('skips tasks whose state changed since evaluation', async () => {
    const { service, coordinator, store, deps } = setup();
    const task = makeTask({
      state: 'DONE',
      closedDate: daysBefore(REFERENCE, 100),
    });
    store.set(`${task.path}:${task.line}`, { ...task, state: 'DOING' }); // changed underneath us
    const matches = service.evaluateArchiveCriteria(
      [task],
      makeConfig(),
      REFERENCE,
    );

    const result = await service.applyArchives(matches, deps);

    expect(result.archived).toHaveLength(0);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].reason).toBe('stale');
    expect(coordinator.calls).toHaveLength(0);
  });

  it('reports isRunning during the batch and false after', async () => {
    const { service, store, deps } = setup();
    const task = makeTask({
      state: 'DONE',
      closedDate: daysBefore(REFERENCE, 100),
    });
    store.set(`${task.path}:${task.line}`, task);
    const matches = service.evaluateArchiveCriteria(
      [task],
      makeConfig(),
      REFERENCE,
    );

    const runningDuring: boolean[] = [];
    await service.applyArchives(matches, {
      ...deps,
      apply: async (t, target) => {
        runningDuring.push(service.isRunning());
        await Promise.resolve();
      },
    });

    expect(runningDuring).toEqual([true]);
    expect(service.isRunning()).toBe(false);
  });

  it('journals the full task snapshot, preserving table-cell identity', async () => {
    const { service, store, deps } = setup();
    const task = makeTask({
      state: 'DONE',
      closedDate: daysBefore(REFERENCE, 100),
      isTableTask: true,
      tableCell: { cellIndex: 1 },
    });
    store.set(`${task.path}:${task.line}`, task);
    const matches = service.evaluateArchiveCriteria(
      [task],
      makeConfig(),
      REFERENCE,
    );

    const result = await service.applyArchives(matches, deps);

    expect(result.archived[0].taskSnapshot).toMatchObject({
      path: task.path,
      line: task.line,
      state: 'DONE',
      rawText: task.rawText,
      isTableTask: true,
      tableCell: { cellIndex: 1 },
    });
  });

  it('a new successful run overwrites the journal', async () => {
    const { service, store, deps } = setup();
    const first = makeTask({
      state: 'DONE',
      closedDate: daysBefore(REFERENCE, 100),
      rawText: '- [x] DONE first run',
    });
    const second = makeTask({
      state: 'DONE',
      closedDate: daysBefore(REFERENCE, 200),
      rawText: '- [x] DONE second run',
    });

    store.set(`${first.path}:${first.line}`, first);
    await service.applyArchives(
      service.evaluateArchiveCriteria([first], makeConfig(), REFERENCE),
      deps,
    );

    store.delete(`${first.path}:${first.line}`);
    store.set(`${second.path}:${second.line}`, second);
    await service.applyArchives(
      service.evaluateArchiveCriteria([second], makeConfig(), REFERENCE),
      deps,
    );

    expect(service.hasUndoableRun()).toBe(true);
    // Journal must contain ONLY the second run's record.
    const outcome = await service.undoLastRun({
      getRawLine: async () => `- [ ] ARCHIVED second run`,
      apply: async () => undefined,
    });
    expect(outcome.reverted).toHaveLength(1);
    expect(outcome.reverted[0].rawTextBefore).toBe('- [x] DONE second run');
  });

  it('an empty apply clears any previous journal (no-op run is not undoable)', async () => {
    const { service, store, deps } = setup();
    const first = makeTask({
      state: 'DONE',
      closedDate: daysBefore(REFERENCE, 100),
    });
    store.set(`${first.path}:${first.line}`, first);
    await service.applyArchives(
      service.evaluateArchiveCriteria([first], makeConfig(), REFERENCE),
      deps,
    );
    expect(service.hasUndoableRun()).toBe(true);

    // Second run with all matches stale → empty archived list overwrites journal.
    store.delete(`${first.path}:${first.line}`);
    const staleMatch = { ...first, target: 'ARCHIVED' };
    const result = await service.applyArchives([staleMatch], deps);

    expect(result.archived).toHaveLength(0);
    expect(service.hasUndoableRun()).toBe(false);
  });
});

describe('ArchiveService.undoLastRun', () => {
  function setupWithJournal() {
    const { service } = makeService({ stateMappings: [makeMapping('DONE')] });
    const coordinator = {
      calls: [] as { state: string; originalState: string }[],
    };
    const task = makeTask({
      state: 'DONE',
      closedDate: daysBefore(REFERENCE, 100),
      rawText: '- [x] DONE original text',
    });
    const archivedLine = '- [x] ARCHIVED original text';

    // Seed the journal directly through a successful apply.
    const store = new Map<string, ArchiveCandidate>([
      [`${task.path}:${task.line}`, task],
    ]);
    return { service, coordinator, task, archivedLine, store };
  }

  it('applies the journaled snapshot (not a minimal reconstruction), preserving table identity', async () => {
    const { service, task } = setupWithJournal();
    const store = new Map<string, ArchiveCandidate>([
      [
        `${task.path}:${task.line}`,
        { ...task, isTableTask: true, tableCell: { cellIndex: 2 } },
      ],
    ]);
    await service.applyArchives(
      service.evaluateArchiveCriteria([task], makeConfig(), REFERENCE),
      {
        getTask: (p, l) => store.get(`${p}:${l}`) ?? null,
        apply: async () => undefined,
      },
    );

    let appliedTask: unknown;
    let appliedState: string | undefined;
    const outcome = await service.undoLastRun({
      getRawLine: async () => '- [x] ARCHIVED original text',
      apply: async (t, originalState) => {
        appliedTask = t;
        appliedState = originalState;
      },
    });

    expect(outcome.reverted).toHaveLength(1);
    expect(appliedState).toBe('DONE');
    expect(appliedTask).toMatchObject({
      path: task.path,
      line: task.line,
      state: 'ARCHIVED',
      isTableTask: true,
      tableCell: { cellIndex: 2 },
    });
  });

  it('skips records without a snapshot and still undoes the rest', async () => {
    const { service } = makeService({ stateMappings: [makeMapping('DONE')] });
    const t1 = makeTask({
      state: 'DONE',
      closedDate: daysBefore(REFERENCE, 100),
      rawText: '- [x] DONE one',
    });
    const t2 = makeTask({
      state: 'DONE',
      closedDate: daysBefore(REFERENCE, 110),
      rawText: '- [x] DONE two',
    });
    const store = new Map<string, ArchiveCandidate>([
      [`${t1.path}:${t1.line}`, t1],
      [`${t2.path}:${t2.line}`, t2],
    ]);
    await service.applyArchives(
      service.evaluateArchiveCriteria([t1, t2], makeConfig(), REFERENCE),
      {
        getTask: (p, l) => store.get(`${p}:${l}`) ?? null,
        apply: async () => undefined,
      },
    );
    // Simulate a legacy journal record without a snapshot.
    (
      service as unknown as { lastRun: { taskSnapshot?: unknown }[] }
    ).lastRun[0].taskSnapshot = undefined;

    const applied: string[] = [];
    const outcome = await service.undoLastRun({
      getRawLine: async (p, l) =>
        l === t1.line ? '- [x] ARCHIVED one' : '- [x] ARCHIVED two',
      apply: async (t) => {
        applied.push(t.rawText);
      },
    });

    expect(outcome.reverted.map((r) => r.line)).toEqual([t2.line]);
    expect(outcome.skipped).toEqual([
      {
        record: expect.objectContaining({ line: t1.line }),
        reason: 'unparseable',
      },
    ]);
    // The apply callback receives the CURRENT archived rawText (the wiring
    // layer re-applies the snapshot; originalState arrives separately).
    expect(applied).toEqual(['- [x] ARCHIVED two']);
  });

  it('a failing apply for one record does not abort the remaining undo', async () => {
    const { service } = makeService({ stateMappings: [makeMapping('DONE')] });
    const t1 = makeTask({
      state: 'DONE',
      closedDate: daysBefore(REFERENCE, 100),
      rawText: '- [x] DONE one',
    });
    const t2 = makeTask({
      state: 'DONE',
      closedDate: daysBefore(REFERENCE, 110),
      rawText: '- [x] DONE two',
    });
    const store = new Map<string, ArchiveCandidate>([
      [`${t1.path}:${t1.line}`, t1],
      [`${t2.path}:${t2.line}`, t2],
    ]);
    await service.applyArchives(
      service.evaluateArchiveCriteria([t1, t2], makeConfig(), REFERENCE),
      {
        getTask: (p, l) => store.get(`${p}:${l}`) ?? null,
        apply: async () => undefined,
      },
    );

    let calls = 0;
    const outcome = await service.undoLastRun({
      getRawLine: async () => '- [x] ARCHIVED text',
      apply: async () => {
        calls += 1;
        if (calls === 1) throw new Error('coordinator exploded');
      },
    });

    expect(outcome.reverted).toHaveLength(1);
    expect(outcome.skipped).toEqual([
      {
        record: expect.objectContaining({ line: t1.line }),
        reason: 'apply-failed',
      },
    ]);
  });

  it('reverts each journaled record to its original state and clears the journal', async () => {
    const { service, coordinator, task, archivedLine, store } =
      setupWithJournal();
    await service.applyArchives(
      service.evaluateArchiveCriteria([task], makeConfig(), REFERENCE),
      {
        getTask: (p, l) => store.get(`${p}:${l}`) ?? null,
        apply: async () => undefined,
      },
    );

    const applied: string[] = [];
    const outcome = await service.undoLastRun({
      getRawLine: async () => archivedLine,
      apply: async (t, originalState) => {
        applied.push(originalState);
        await coordinator.calls.push({ state: t.state, originalState });
      },
    });

    expect(outcome.reverted).toHaveLength(1);
    expect(outcome.skipped).toHaveLength(0);
    expect(applied).toEqual(['DONE']);
    expect(service.hasUndoableRun()).toBe(false);
  });

  it('skips records whose line is missing', async () => {
    const { service, task } = setupWithJournal();
    const store = new Map<string, ArchiveCandidate>([
      [`${task.path}:${task.line}`, task],
    ]);
    await service.applyArchives(
      service.evaluateArchiveCriteria([task], makeConfig(), REFERENCE),
      {
        getTask: (p, l) => store.get(`${p}:${l}`) ?? null,
        apply: async () => undefined,
      },
    );

    const outcome = await service.undoLastRun({
      getRawLine: async () => null,
      apply: async () => undefined,
    });

    expect(outcome.reverted).toHaveLength(0);
    expect(outcome.skipped).toEqual([
      {
        record: expect.objectContaining({ path: task.path }),
        reason: 'line-missing',
      },
    ]);
  });

  it('skips records whose line content changed since the archive', async () => {
    const { service, task } = setupWithJournal();
    const store = new Map<string, ArchiveCandidate>([
      [`${task.path}:${task.line}`, task],
    ]);
    await service.applyArchives(
      service.evaluateArchiveCriteria([task], makeConfig(), REFERENCE),
      {
        getTask: (p, l) => store.get(`${p}:${l}`) ?? null,
        apply: async () => undefined,
      },
    );

    const outcome = await service.undoLastRun({
      getRawLine: async () => '- [x] DONE user edited this line completely',
      apply: async () => undefined,
    });

    expect(outcome.reverted).toHaveLength(0);
    expect(outcome.skipped).toHaveLength(1);
    expect(outcome.skipped[0].reason).toBe('line-changed');
  });

  it('treats a line still matching the pre-archive shape as changed (never archived or reverted out-of-band)', async () => {
    const { service, task } = setupWithJournal();
    const store = new Map<string, ArchiveCandidate>([
      [`${task.path}:${task.line}`, task],
    ]);
    await service.applyArchives(
      service.evaluateArchiveCriteria([task], makeConfig(), REFERENCE),
      {
        getTask: (p, l) => store.get(`${p}:${l}`) ?? null,
        apply: async () => undefined,
      },
    );

    const outcome = await service.undoLastRun({
      getRawLine: async () => task.rawText, // identical to rawTextBefore
      apply: async () => undefined,
    });

    expect(outcome.reverted).toHaveLength(0);
    expect(outcome.skipped[0].reason).toBe('line-changed');
  });

  it('is a no-op when there is no journal', async () => {
    const { service } = makeService();
    let applyCalls = 0;
    const outcome = await service.undoLastRun({
      getRawLine: async () => '- [x] ARCHIVED whatever',
      apply: async () => {
        applyCalls += 1;
      },
    });
    expect(outcome.reverted).toHaveLength(0);
    expect(applyCalls).toBe(0);
    expect(service.hasUndoableRun()).toBe(false);
  });
});

describe('ArchiveService batch performance (stress)', () => {
  /**
   * Vault-scale guard: 5000 matches must flow through evaluate → apply →
   * undo in linear time. Bounds are deliberately generous (a linear
   * implementation lands in the tens of milliseconds; these fail only on
   * accidental O(n²) behavior, e.g. per-match journal array copies or
   * unbounded regex recompilation).
   *
   * Uses performance.now() (not Date.now()) per the AGENTS.md test rule.
   */
  const STRESS_SIZE = 5000;
  const APPLY_BUDGET_MS = 5000;
  const UNDO_BUDGET_MS = 5000;

  function buildStressTasks(): ArchiveCandidate[] {
    const tasks: ArchiveCandidate[] = [];
    for (let i = 0; i < STRESS_SIZE; i++) {
      tasks.push({
        path: `notes/stress-${i % 50}.md`, // spread across 50 files
        line: 10 + i,
        rawText: `- [x] DONE stress task ${i} lorem ipsum`,
        state: 'DONE',
        closedDate: daysBefore(REFERENCE, 100 + (i % 30)),
      });
    }
    return tasks;
  }

  it(`applies ${STRESS_SIZE} matches within ${APPLY_BUDGET_MS}ms (linear, no O(n²))`, async () => {
    const { service } = makeService({ stateMappings: [makeMapping('DONE')] });
    const tasks = buildStressTasks();
    const matches = service.evaluateArchiveCriteria(
      tasks,
      makeConfig(),
      REFERENCE,
    );
    expect(matches).toHaveLength(STRESS_SIZE);

    // Identity-store getTask: Map lookup per match, no per-call allocation.
    const store = new Map<string, ArchiveCandidate>();
    tasks.forEach((t) => store.set(`${t.path}:${t.line}`, t));
    let applyCount = 0;

    const start = performance.now();
    const result = await service.applyArchives(matches, {
      getTask: (path, line) => store.get(`${path}:${line}`) ?? null,
      apply: async () => {
        applyCount += 1;
      },
    });
    const elapsed = performance.now() - start;

    expect(applyCount).toBe(STRESS_SIZE);
    expect(result.archived).toHaveLength(STRESS_SIZE);
    expect(result.skipped).toHaveLength(0);
    expect(elapsed).toBeLessThan(APPLY_BUDGET_MS);
  });

  it(`undoes a ${STRESS_SIZE}-record journal within ${UNDO_BUDGET_MS}ms with cached patterns`, async () => {
    const { service } = makeService({ stateMappings: [makeMapping('DONE')] });
    const tasks = buildStressTasks();
    const matches = service.evaluateArchiveCriteria(
      tasks,
      makeConfig(),
      REFERENCE,
    );
    const store = new Map<string, ArchiveCandidate>();
    tasks.forEach((t) => store.set(`${t.path}:${t.line}`, t));
    const applyResult = await service.applyArchives(matches, {
      getTask: (path, line) => store.get(`${path}:${line}`) ?? null,
      apply: async () => undefined,
    });

    // Simulate post-archive file content: one archived line per record,
    // derived from the journal the run produced (path:line → archived line).
    const archivedLines = new Map<string, string>();
    applyResult.archived.forEach((record) => {
      archivedLines.set(
        `${record.path}:${record.line}`,
        record.rawTextBefore.replace(' DONE ', ' ARCHIVED '),
      );
    });
    let undoApplyCount = 0;

    const start = performance.now();
    const outcome = await service.undoLastRun({
      getRawLine: async (path, line) =>
        archivedLines.get(`${path}:${line}`) ?? null,
      apply: async () => {
        undoApplyCount += 1;
      },
    });
    const elapsed = performance.now() - start;

    expect(undoApplyCount).toBe(STRESS_SIZE);
    expect(outcome.reverted).toHaveLength(STRESS_SIZE);
    expect(outcome.skipped).toHaveLength(0);
    expect(elapsed).toBeLessThan(UNDO_BUDGET_MS);
  });
});
