/**
 * The node benchmark scenarios.
 *
 * Each scenario drives real plugin code end to end over the generated
 * fixture vault. One scenario per critical path identified in the
 * profiling exploration: parse, classify/sort (every view-refresh
 * combination), search, dashboard aggregation, natural-date parsing
 * (per-keystroke), and the regex-compile baseline that justifies
 * RegexCache.
 */

import { BenchScenario, BenchContext } from './harness';
import {
  sortTasksWithThreeBlockSystem,
  buildKeywordSortConfig,
  FutureTaskSetting,
  CompletedTaskSetting,
} from '../../src/utils/task-sort';
import { SearchTokenizer } from '../../src/search/search-tokenizer';
import { SearchParser } from '../../src/search/search-parser';
import { SearchEvaluator } from '../../src/search/search-evaluator';
import { DashboardAggregator } from '../../src/view/embedded-dashboard/aggregation';
import { NaturalDateParser } from '../../src/parser/natural-date-parser';
import { RegexCache } from '../../src/utils/regex-cache';
import { DateUtils } from '../../src/utils/date-utils';

/** Parse every fixture file through the parser that owns its format. */
const parseFile: BenchScenario = {
  name: 'parse-file (full vault)',
  runOnce(ctx: BenchContext): void {
    for (const file of ctx.files) {
      if (file.path.endsWith('.md')) {
        ctx.parsers.md.parseFile(file.content, file.path);
      } else if (file.path.endsWith('.org')) {
        ctx.parsers.org.parseFile(file.content, file.path);
      } else {
        ctx.parsers.code.parseFile(file.content, file.path);
      }
    }
  },
};

const FUTURE_SETTINGS: FutureTaskSetting[] = [
  'showAll',
  'showUpcoming',
  'sortToEnd',
  'hideFuture',
];
const COMPLETED_SETTINGS: CompletedTaskSetting[] = [
  'showAll',
  'sortToEnd',
  'hide',
];

/**
 * Classify + block-sort the whole task set for every view-mode × future
 * combination — the work every Task List refresh does (12 combinations).
 */
const classifySort: BenchScenario = {
  name: 'classify-sort (3 modes × 4 future settings)',
  runOnce(ctx: BenchContext): void {
    const keywordConfig = buildKeywordSortConfig(ctx.keywordManager);
    const warningPeriodSettings = {
      upcomingPeriod: ctx.settings.upcomingPeriod,
      defaultDeadlineWarningPeriod: ctx.settings.defaultDeadlineWarningPeriod,
      defaultScheduledWarningPeriod: ctx.settings.defaultScheduledWarningPeriod,
      skipScheduledWarningPeriodIfDeadline:
        ctx.settings.skipScheduledWarningPeriodIfDeadline,
      skipDeadlinePrewarningIfScheduled:
        ctx.settings.skipDeadlinePrewarningIfScheduled,
    };
    for (const future of FUTURE_SETTINGS) {
      for (const completed of COMPLETED_SETTINGS) {
        sortTasksWithThreeBlockSystem(
          ctx.tasks,
          ctx.today,
          future,
          completed,
          'default',
          keywordConfig,
          warningPeriodSettings,
        );
      }
    }
  },
};

/** Queries a user would plausibly type; every one must parse (fail loud). */
const SEARCH_QUERIES = [
  'refactor',
  'the scanner',
  '"search tokenizer"',
  'TODO OR DOING',
  'state:completed',
  '-DONE',
];

/**
 * Tokenize + parse + evaluate a realistic query set over the full task
 * set — the per-keystroke search path.
 */
const search: BenchScenario = {
  name: 'search (6 queries × full task set)',
  async runOnce(ctx: BenchContext): Promise<void> {
    for (const query of SEARCH_QUERIES) {
      const tokens = SearchTokenizer.tokenize(query);
      const node = SearchParser.parse(query);
      let matches = 0;
      for (const task of ctx.tasks) {
        if (await SearchEvaluator.evaluate(node, task, false, ctx.settings)) {
          matches++;
        }
      }
      // Keep the tokens alive so the tokenizer cost stays in the measurement.
      if (tokens.length === 0 || matches < 0) {
        throw new Error(`unreachable for query: ${query}`);
      }
    }
  },
};

/**
 * Dashboard aggregation across every group-by dimension over the full
 * task set.
 */
const dashboardAggregate: BenchScenario = {
  name: 'dashboard-aggregate (6 groupings)',
  async runOnce(ctx: BenchContext): Promise<void> {
    const aggregator = new DashboardAggregator(
      ctx.settings,
      ctx.keywordManager,
    );
    for (const groupBy of [
      'state',
      'priority',
      'keyword',
      'tag',
      'scheduled',
      'deadline',
    ] as const) {
      await aggregator.aggregate(ctx.tasks, { groupBy });
    }
  },
};

/** Keystroke-sized corpus for the smart-date processor's date parser. */
const NATURAL_DATE_CORPUS = [
  'tomorrow',
  'next Monday',
  'in 3 days',
  'today at 9am',
  'friday',
  '2026-11-01',
  'every day',
  'every Friday',
  'next week at 16:00',
  'yesterday',
  'in 2 hours',
  'december 25',
];

/**
 * Date label formatting over mixed spans — the render hot path the CPU
 * profile showed dominated by Intl (toLocale* per row per refresh).
 * Repeats mirror real renders: the same task dates are formatted again
 * on every refresh, which is exactly what a warm memo absorbs.
 */
const dateFormat: BenchScenario = {
  name: 'date-format (6k formats, mixed spans)',
  runOnce(ctx: BenchContext): void {
    const offsets = [0, 1, 2, 3, 7, 9, 30, -1, -5, -40];
    const dates: Date[] = [];
    for (const offset of offsets) {
      const d = new Date(ctx.today);
      d.setDate(d.getDate() + offset);
      dates.push(d);
      dates.push(new Date(d.getFullYear(), d.getMonth(), d.getDate(), 9, 30));
    }
    for (let i = 0; i < 100; i++) {
      for (const d of dates) {
        DateUtils.formatDateForDisplay(d, true);
        DateUtils.formatDateTooltip(d, true);
        DateUtils.formatDateForDisplay(d, false);
      }
    }
  },
};

const naturalDate: BenchScenario = {
  name: 'natural-date (per-keystroke corpus ×25)',
  runOnce(ctx: BenchContext): void {
    for (let i = 0; i < 25; i++) {
      for (const text of NATURAL_DATE_CORPUS) {
        NaturalDateParser.parse(text, ctx.today);
      }
    }
  },
};

/** The regex pattern set the parsers hammer during scans and searches. */
const HEAVY_PATTERNS = [
  ['^- \\[([ x])\\] (TODO|DOING|DONE)', ''],
  ['^(TODO|DOING|DONE|WAITING)\\s+', ''],
  ['(SCHEDULED|DEADLINE|CLOSED|STARTED):\\s*<([^>]+)>', 'gi'],
  ['\\b(\\d{4})-(\\d{2})-(\\d{2})\\b', 'g'],
  ['^\\s*(?:>\\s*)?STARTED:\\s*(.+)$', ''],
  ['<br\\s*/?>', 'gi'],
  ['^\\|(.+)\\|$', 'g'],
  ['\\[([ x])\\]', 'g'],
  ['\\b(#[\\w-]+)\\b', 'g'],
  ['(\\.[+-]?\\d+[dwmy])', 'gi'],
] as const;

/** Cached gets: the steady-state scan path with RegexCache warm. */
const regexCached: BenchScenario = {
  name: 'regex-cache (warm cache gets)',
  runOnce(): void {
    const cache = new RegexCache();
    for (let i = 0; i < 500; i++) {
      for (const [pattern, flags] of HEAVY_PATTERNS) {
        cache.get(pattern, flags);
      }
    }
  },
};

/** Cold compiles: what every one of those gets would cost without the cache. */
const regexCold: BenchScenario = {
  name: 'regex-cold (fresh compiles, no cache)',
  runOnce(): void {
    for (let i = 0; i < 500; i++) {
      for (const [pattern, flags] of HEAVY_PATTERNS) {
        void new RegExp(pattern, flags);
      }
    }
  },
};

export const SCENARIOS: BenchScenario[] = [
  parseFile,
  classifySort,
  search,
  dashboardAggregate,
  naturalDate,
  dateFormat,
  regexCached,
  regexCold,
];
