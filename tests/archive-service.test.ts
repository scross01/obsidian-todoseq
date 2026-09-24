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
function localDate(
  year: number,
  month: number,
  day: number,
  hour = 12,
): Date {
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
  overrides: Partial<ArchiveCandidate> & { state?: string; closedDate?: Date | null },
): ArchiveCandidate {
  nextLine += 1;
  return {
    path: `notes/test.md`,
    line: nextLine,
    rawText: `- [x] ${(overrides.state ?? 'DONE')} task text`,
    state: 'DONE',
    closedDate: null,
    ...overrides,
  };
}

function makeService(
  archiveSettings: Partial<TaskArchiveSettings> = {},
): { service: ArchiveService; keywordManager: KeywordManager } {
  const keywordManager = new KeywordManager(DefaultSettings);
  const settings: TaskArchiveSettings = {
    ...DefaultTaskArchiveSettings,
    ...archiveSettings,
  };
  return { service: new ArchiveService(keywordManager, settings), keywordManager };
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
      const tasks = [makeTask({ state: 'DONE', closedDate: daysBefore(REFERENCE, 100) })];
      const matches = service.evaluateArchiveCriteria(tasks, makeConfig(), REFERENCE);
      expect(matches).toHaveLength(1);
      expect(matches[0]).toMatchObject({ state: 'DONE', target: 'ARCHIVED' });
    });

    it('does not match recently closed tasks', () => {
      const tasks = [makeTask({ state: 'DONE', closedDate: daysBefore(REFERENCE, 10) })];
      expect(service.evaluateArchiveCriteria(tasks, makeConfig(), REFERENCE)).toHaveLength(0);
    });

    it('matches at the exact boundary (age >= criterionDays, inclusive)', () => {
      const tasks = [makeTask({ state: 'DONE', closedDate: daysBefore(REFERENCE, 90) })];
      expect(service.evaluateArchiveCriteria(tasks, makeConfig(), REFERENCE)).toHaveLength(1);
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
      expect(service.evaluateArchiveCriteria(tasks, makeConfig(), REFERENCE)).toHaveLength(1);
    });
  });

  describe('date mode', () => {
    it('matches tasks closed strictly before criterionDate', () => {
      const config = makeConfig({ criterionMode: 'date', criterionDate: '2026-02-01' });
      const before = [makeTask({ state: 'DONE', closedDate: localDate(2026, 1, 15) })];
      const after = [makeTask({ state: 'DONE', closedDate: localDate(2026, 2, 15) })];
      expect(service.evaluateArchiveCriteria(before, config, REFERENCE)).toHaveLength(1);
      expect(service.evaluateArchiveCriteria(after, config, REFERENCE)).toHaveLength(0);
    });

    it('does not match a task closed exactly on criterionDate (strict "before")', () => {
      const config = makeConfig({ criterionMode: 'date', criterionDate: '2026-02-01' });
      const tasks = [makeTask({ state: 'DONE', closedDate: localDate(2026, 2, 1) })];
      expect(service.evaluateArchiveCriteria(tasks, config, REFERENCE)).toHaveLength(0);
    });

    it('matches nothing when criterionDate is unset', () => {
      const config = makeConfig({ criterionMode: 'date', criterionDate: '' });
      const tasks = [makeTask({ state: 'DONE', closedDate: localDate(2020, 1, 1) })];
      expect(service.evaluateArchiveCriteria(tasks, config, REFERENCE)).toHaveLength(0);
    });
  });

  describe('closed-date requirement', () => {
    it('never matches tasks without a CLOSED date', () => {
      const tasks = [makeTask({ state: 'DONE', closedDate: null })];
      expect(service.evaluateArchiveCriteria(tasks, makeConfig(), REFERENCE)).toHaveLength(0);
    });

    it('rejects no-closed-date tasks even if includeNoClosedDate is somehow true (regression guard)', () => {
      const config = makeConfig({ includeNoClosedDate: true as const });
      const tasks = [makeTask({ state: 'DONE', closedDate: null })];
      expect(service.evaluateArchiveCriteria(tasks, config, REFERENCE)).toHaveLength(0);
    });
  });

  describe('state mapping', () => {
    it('only matches states with an enabled mapping', () => {
      const tasks = [
        makeTask({ state: 'DONE', closedDate: daysBefore(REFERENCE, 100) }),
        makeTask({ state: 'CANCELLED', closedDate: daysBefore(REFERENCE, 100) }),
        makeTask({ state: 'WAIT-DONE', closedDate: daysBefore(REFERENCE, 100) }),
      ];
      const matches = service.evaluateArchiveCriteria(tasks, makeConfig(), REFERENCE);
      expect(matches.map((m) => m.state)).toEqual(['DONE', 'CANCELLED']);
    });

    it('ignores disabled mappings', () => {
      const config = makeConfig({
        stateMappings: [makeMapping('DONE', 'ARCHIVED', false)],
      });
      const tasks = [makeTask({ state: 'DONE', closedDate: daysBefore(REFERENCE, 100) })];
      expect(service.evaluateArchiveCriteria(tasks, config, REFERENCE)).toHaveLength(0);
    });

    it('routes each state to its own mapped target (DONE→ARCHIVED, CANCELLED→ABANDONED)', () => {
      const config = makeConfig({
        stateMappings: [makeMapping('DONE', 'ARCHIVED'), makeMapping('CANCELLED', 'ABANDONED')],
      });
      const keywordManager = new KeywordManager({
        ...DefaultSettings,
        additionalArchivedKeywords: ['ABANDONED'],
      });
      const customService = new ArchiveService(keywordManager, DefaultTaskArchiveSettings);
      const tasks = [
        makeTask({ state: 'DONE', closedDate: daysBefore(REFERENCE, 100) }),
        makeTask({ state: 'CANCELLED', closedDate: daysBefore(REFERENCE, 100) }),
      ];
      const matches = customService.evaluateArchiveCriteria(tasks, config, REFERENCE);
      expect(matches).toHaveLength(2);
      expect(matches.find((m) => m.state === 'DONE')?.target).toBe('ARCHIVED');
      expect(matches.find((m) => m.state === 'CANCELLED')?.target).toBe('ABANDONED');
    });

    it('uses the first enabled mapping when duplicates exist (deterministic)', () => {
      const config = makeConfig({
        stateMappings: [
          makeMapping('DONE', 'ARCHIVED', true),
          makeMapping('DONE', 'ARCHIVED', true),
        ],
      });
      const tasks = [makeTask({ state: 'DONE', closedDate: daysBefore(REFERENCE, 100) })];
      const matches = service.evaluateArchiveCriteria(tasks, config, REFERENCE);
      expect(matches).toHaveLength(1);
      expect(matches[0].target).toBe('ARCHIVED');
    });

    it('never matches states that are themselves archived keywords', () => {
      const config = makeConfig({
        stateMappings: [makeMapping('ARCHIVED', 'ARCHIVED', true)],
      });
      const tasks = [makeTask({ state: 'ARCHIVED', closedDate: daysBefore(REFERENCE, 100) })];
      expect(service.evaluateArchiveCriteria(tasks, config, REFERENCE)).toHaveLength(0);
    });
  });

  describe('target validation', () => {
    it('rejects mappings whose target is not an archived-group keyword', () => {
      const config = makeConfig({ stateMappings: [makeMapping('DONE', 'DONE')] });
      const tasks = [makeTask({ state: 'DONE', closedDate: daysBefore(REFERENCE, 100) })];
      expect(service.evaluateArchiveCriteria(tasks, config, REFERENCE)).toHaveLength(0);
    });

    it('rejects custom targets unknown to the KeywordManager', () => {
      // ABANDONED is not in DefaultSettings archived keywords — mapping is invalid there.
      const config = makeConfig({ stateMappings: [makeMapping('DONE', 'ABANDONED')] });
      const tasks = [makeTask({ state: 'DONE', closedDate: daysBefore(REFERENCE, 100) })];
      expect(service.evaluateArchiveCriteria(tasks, config, REFERENCE)).toHaveLength(0);
    });

    it('accepts custom targets present in the user archived-keyword settings', () => {
      const keywordManager = new KeywordManager({
        ...DefaultSettings,
        additionalArchivedKeywords: ['ABANDONED'],
      });
      const customService = new ArchiveService(keywordManager, DefaultTaskArchiveSettings);
      const config = makeConfig({ stateMappings: [makeMapping('DONE', 'ABANDONED')] });
      const tasks = [makeTask({ state: 'DONE', closedDate: daysBefore(REFERENCE, 100) })];
      const matches = customService.evaluateArchiveCriteria(tasks, config, REFERENCE);
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
      const matches = configured.evaluateArchiveCriteria(tasks, undefined, REFERENCE);
      expect(matches).toHaveLength(1);
    });
  });
});
