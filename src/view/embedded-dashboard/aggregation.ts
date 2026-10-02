import { Task, KeywordGroup } from '../../types/task';
import { Search } from '../../search/search';
import { TodoTrackerSettings } from '../../settings/settings-types';
import { KeywordManager } from '../../utils/keyword-manager';
import { PropertySearchEngine } from '../../services/property-search-engine';

/**
 * Dashboard aggregation engine (plan 020).
 *
 * Pure module: groups tasks that match a dashboard's base query and produces
 * per-group counts plus click-through filter strings. The filter strings are
 * built from the same search vocabulary the Task List uses, and bucket
 * assignment is evaluator-driven, so a card's counts agree with what the
 * Task List shows for the same filter by construction.
 *
 * The search grammar is frozen for this plan: the "Later" bucket's filter is
 * a negation composition from today's vocabulary only (see LATER_FILTER).
 */

export type DashboardGroupBy =
  'priority' | 'state' | 'keyword' | 'tag' | 'scheduled' | 'deadline';

export type DashboardDisplay =
  'bar' | 'column' | 'donut' | 'tiles' | 'heatmap' | 'strip';

export type DashboardSort = 'fixed' | 'count-desc' | 'count-asc' | 'label';

/** One aggregated group (a bar row, legend row, tile, or pill). */
export interface DashboardGroup {
  /** Stable id, e.g. 'priority:high', 'state:active', 'tag:project-alpha'. */
  key: string;
  /** Display label. */
  label: string;
  count: number;
  /** Click-through filter (see composition below). Empty for the 'more' tail. */
  filter: string;
}

/** One calendar-day cell of a heatmap result. */
export interface HeatmapDay {
  /** Local calendar day, 'YYYY-MM-DD'. */
  date: string;
  count: number;
}

export interface DashboardResult {
  /** Number of tasks matching the base query. */
  total: number;
  groups: DashboardGroup[];
  /** True only for group-by: tag (tags overlap, column sums may exceed total). */
  overlapsTotal: boolean;
  /** Heatmap only: days[weeks * 7] bucketed by local calendar day. */
  days?: HeatmapDay[];
  /** Heatmap only: local 'YYYY-MM-DD' key of today. */
  today?: string;
}

/** Aggregation input. Parser output feeds this structurally. */
export interface DashboardAggregationParams {
  searchQuery?: string;
  groupBy: DashboardGroupBy;
  display?: DashboardDisplay;
  sort?: DashboardSort;
  showEmpty?: boolean;
  maxGroups?: number;
  /** Weeks of future window for the heatmap (default 26). */
  heatmapWindow?: number;
}

/**
 * Single source of truth for the three time-window bucket filters.
 * Bucket assignment and the Later filter both read from this constant so
 * the card's counts and its drill-through query cannot drift apart.
 *
 * The `next 7 days` value is quoted: the tokenizer binds only the immediate
 * word after a prefix, so the unquoted form would parse as
 * `scheduled:next` plus bare terms `7` and `days` (verified at ae4ac8c).
 * Quoting is today's grammar — no extension involved.
 */
export const WINDOW_BUCKET_FILTERS = (field: string): string[] => [
  `${field}:overdue`,
  `${field}:today`,
  `${field}:"next 7 days"`,
];

/**
 * Filter string for the "Later" bucket: has a date, but outside the three
 * windows. The open-ended range form (from 8 days after today onward)
 * matches the bucket assignment exactly: the first-true-wins order puts
 * anything before today+8 into Overdue/Today/Next-7, so Later = tasks
 * dated strictly after today+7 — a single readable range.
 */
export const LATER_FILTER = (field: string): string => {
  const bound = startOfLocalDay(new Date());
  bound.setDate(bound.getDate() + 8);
  return `${field}:${toDateKey(bound)}..`;
};

/**
 * Filter string for the "Next 7 days" bucket. The evaluator's next-7-days
 * window includes today (isDateInNextNDays: today <= date <= today+7), but
 * "Due today" is its own bucket — so the bucket filter excludes today to
 * stay consistent with the first-true-wins assignment. Same-vocabulary
 * negation composition, no grammar change.
 */
export const NEXT_7_DAYS_BUCKET_FILTER = (field: string): string =>
  `${field}:"next 7 days" -${field}:today`;

/**
 * True when the filter string contains a top-level `OR` (outside parens).
 * Appending such a filter unwrapped would let the OR re-scope over the base
 * (e.g. the archived keywords filter `state:A OR state:B` after a base query
 * parses as `(base AND state:A) OR state:B`), so the filter must be wrapped.
 */
function hasTopLevelOr(filter: string): boolean {
  let depth = 0;
  for (const token of filter.split(/\s+/)) {
    if (!token) continue;
    for (const ch of token) {
      if (ch === '(') depth++;
      else if (ch === ')') depth--;
    }
    if (depth <= 0 && token.toUpperCase() === 'OR') {
      return true;
    }
    if (depth < 0) depth = 0;
  }
  return false;
}

/**
 * Whether a query string is exactly one parenthesised group.
 *
 * The earlier check was `startsWith('(') && endsWith(')')`, which is not the
 * same thing: `(a OR b) OR (c)` starts and ends with a parenthesis but its
 * leading group closes mid-string, leaving a top-level OR. Treating that as
 * already-wrapped skipped the wrap and let the appended filter bind to the
 * last OR arm, so a dashboard group click showed fewer tasks than the Task List
 * did for the same query.
 */
function isSingleParenthesisedGroup(query: string): boolean {
  if (!query.startsWith('(') || !query.endsWith(')')) return false;
  let depth = 0;
  for (let i = 0; i < query.length; i++) {
    if (query[i] === '(') depth++;
    else if (query[i] === ')') {
      depth--;
      // Closed before the final character, so there is more than one group.
      if (depth === 0 && i < query.length - 1) return false;
    }
  }
  return depth === 0;
}

/**
 * Compose a group's click filter with the card's base query.
 *
 * Both sides are guarded against the grammar's operator precedence
 * (NOT > AND > OR, implicit AND between adjacent terms):
 * - The base is wrapped so a top-level OR in the base cannot re-scope a
 *   subsequently appended term into its last OR arm.
 * - A filter with a top-level OR (the OR-joined archived keywords) is
 *   wrapped so its OR cannot re-scope over the base.
 * Either guard missing makes the click count diverge from the Task List
 * count for the composed query.
 */
export function composeFilterQuery(baseQuery: string, filter: string): string {
  if (!baseQuery.trim()) return filter;
  const trimmed = baseQuery.trim();
  const wrapped = isSingleParenthesisedGroup(trimmed)
    ? trimmed
    : `(${trimmed})`;
  const filterText = hasTopLevelOr(filter) ? `(${filter})` : filter;
  return `${wrapped} ${filterText}`;
}

/** Priority buckets in fixed order (task.priority values → bucket). */
const PRIORITY_BUCKETS: Array<{
  key: string;
  label: string;
  filter: string;
  value: 'high' | 'med' | 'low' | null;
}> = [
  {
    key: 'priority:high',
    label: 'High',
    filter: 'priority:high',
    value: 'high',
  },
  {
    key: 'priority:medium',
    label: 'Medium',
    filter: 'priority:medium',
    value: 'med',
  },
  { key: 'priority:low', label: 'Low', filter: 'priority:low', value: 'low' },
  { key: 'priority:none', label: 'None', filter: 'priority:none', value: null },
];

/** The four resolvable state groups, in fixed order. */
const STATE_BUCKETS: Array<{
  key: string;
  label: string;
  filter: string;
  group: KeywordGroup;
}> = [
  {
    key: 'state:active',
    label: 'Active',
    filter: 'state:active',
    group: 'activeKeywords',
  },
  {
    key: 'state:inactive',
    label: 'Inactive',
    filter: 'state:inactive',
    group: 'inactiveKeywords',
  },
  {
    key: 'state:waiting',
    label: 'Waiting',
    filter: 'state:waiting',
    group: 'waitingKeywords',
  },
  {
    key: 'state:completed',
    label: 'Completed',
    filter: 'state:completed',
    group: 'completedKeywords',
  },
];

/** Date buckets in urgency order (labels are literal English). */
const DATE_BUCKET_LABELS = [
  'Overdue',
  'Due today',
  'Next 7 days',
  'Later',
  'No date',
] as const;

/** Tags used for priority tokens (#A/#B/#C) are not content tags. */
const PRIORITY_TAG_NAMES = new Set(['A', 'B', 'C']);

/** Default sort per group-by attribute (fixed order vs. popularity). */
const DEFAULT_SORT: Record<DashboardGroupBy, DashboardSort> = {
  priority: 'fixed',
  state: 'fixed',
  keyword: 'count-desc',
  tag: 'count-desc',
  scheduled: 'fixed',
  deadline: 'fixed',
};

const DEFAULT_MAX_GROUPS = 8;
const DEFAULT_HEATMAP_WINDOW_WEEKS = 26;

/** Local 'YYYY-MM-DD' key for a date. */
function toDateKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/** Local midnight of a date. */
function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** Day-number of a local date (UTC-of-local-parts; DST-safe difference). */
function dayNumber(date: Date): number {
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
}

interface CacheEntry {
  version: number;
  paramsKey: string;
  tasksRef: Task[];
  result: DashboardResult;
}

export class DashboardAggregator {
  private settings: TodoTrackerSettings;
  private keywordManager: KeywordManager;
  private propertySearchEngine: PropertySearchEngine | null;
  private version = 0;
  private cache: CacheEntry | null = null;

  constructor(
    settings: TodoTrackerSettings,
    keywordManager: KeywordManager,
    propertySearchEngine: PropertySearchEngine | null = null,
  ) {
    this.settings = settings;
    this.keywordManager = keywordManager;
    this.propertySearchEngine = propertySearchEngine;
  }

  /** Invalidate the memo (version bump → next aggregate recomputes). */
  invalidateCache(): void {
    this.version++;
  }

  /**
   * Aggregate matched tasks into groups (or heatmap days) for one card.
   * @param tasks All tasks from the vault
   * @param params Aggregation parameters (parsed code block parameters)
   */
  async aggregate(
    tasks: Task[],
    params: DashboardAggregationParams,
  ): Promise<DashboardResult> {
    const paramsKey = JSON.stringify(params);
    if (
      this.cache &&
      this.cache.version === this.version &&
      this.cache.paramsKey === paramsKey &&
      this.cache.tasksRef === tasks
    ) {
      return this.cache.result;
    }

    const matched = await this.filterTasks(tasks, params.searchQuery ?? '');
    const total = matched.length;
    const field = params.groupBy;

    let result: DashboardResult;
    if (
      params.display === 'heatmap' &&
      (field === 'scheduled' || field === 'deadline')
    ) {
      result = {
        total,
        groups: [],
        overlapsTotal: false,
        ...this.resolveHeatmap(field, matched, params.heatmapWindow),
      };
    } else {
      const rawGroups = await this.resolveGroups(field, matched);
      result = {
        total,
        groups: this.finalizeGroups(rawGroups, params),
        overlapsTotal: field === 'tag',
      };
    }

    this.cache = { version: this.version, paramsKey, tasksRef: tasks, result };
    return result;
  }

  /** Filter tasks through the shared Search evaluator (Task List pattern). */
  private async filterTasks(
    tasks: Task[],
    searchQuery: string,
  ): Promise<Task[]> {
    if (!searchQuery.trim()) {
      return tasks;
    }
    const results = await Promise.all(
      tasks.map(async (task) => {
        const matches = await Search.evaluate(
          searchQuery,
          task,
          false,
          this.settings,
          this.propertySearchEngine ?? undefined,
        );
        return { task, matches };
      }),
    );
    return results
      .filter((result) => result.matches)
      .map((result) => result.task);
  }

  /** Dispatch to the resolver for the group-by attribute. */
  private async resolveGroups(
    groupBy: DashboardGroupBy,
    matched: Task[],
  ): Promise<DashboardGroup[]> {
    switch (groupBy) {
      case 'priority':
        return this.resolvePriorityGroups(matched);
      case 'state':
        return this.resolveStateGroups(matched);
      case 'keyword':
        return this.resolveKeywordGroups(matched);
      case 'tag':
        return this.resolveTagGroups(matched);
      case 'scheduled':
      case 'deadline':
        return this.resolveDateBucketGroups(groupBy, matched);
      default:
        return [];
    }
  }

  private resolvePriorityGroups(matched: Task[]): DashboardGroup[] {
    return PRIORITY_BUCKETS.map((bucket) => ({
      key: bucket.key,
      label: bucket.label,
      filter: bucket.filter,
      count: matched.filter((task) => task.priority === bucket.value).length,
    }));
  }

  private resolveStateGroups(matched: Task[]): DashboardGroup[] {
    const groups = STATE_BUCKETS.map((bucket) => {
      const keywords = this.keywordManager
        .getKeywordsForGroup(bucket.group)
        .map((k) => k.toLowerCase());
      return {
        key: bucket.key,
        label: bucket.label,
        filter: bucket.filter,
        count: matched.filter((task) =>
          keywords.includes(task.state.toLowerCase()),
        ).length,
      };
    });

    // Archived wrinkle: `state:archived` does not resolve through the
    // evaluator's STATE_GROUP_MAP, but individual keywords do. A task whose
    // keyword is in the archived group matches none of the four state:*
    // filters, so append an "Archived" group whose count is computed by
    // membership and whose filter OR-joins the individual keywords. This
    // keeps sum(counts) == total for state grouping.
    const archivedKeywords =
      this.keywordManager.getKeywordsForGroup('archivedKeywords');
    if (archivedKeywords.length > 0) {
      const archivedSet = new Set(archivedKeywords.map((k) => k.toLowerCase()));
      const uniqueKeywords = Array.from(new Set(archivedKeywords));
      groups.push({
        key: 'state:archived',
        label: 'Archived',
        filter: uniqueKeywords.map((k) => `state:${k}`).join(' OR '),
        count: matched.filter((task) =>
          archivedSet.has(task.state.toLowerCase()),
        ).length,
      });
    }

    return groups;
  }

  private resolveKeywordGroups(matched: Task[]): DashboardGroup[] {
    // One group per distinct task.state present in matched tasks, ordered by
    // the settings' keyword order, then strays alphabetically.
    const counts = new Map<string, number>();
    for (const task of matched) {
      counts.set(task.state, (counts.get(task.state) ?? 0) + 1);
    }

    const settingsOrder = this.keywordManager
      .getAllKeywords()
      .map((k) => k.toLowerCase());
    const states = Array.from(counts.keys());
    const rank = (state: string): number =>
      settingsOrder.indexOf(state.toLowerCase());
    const known = states
      .filter((state) => rank(state) >= 0)
      .sort((a, b) => rank(a) - rank(b));
    const strays = states
      .filter((state) => rank(state) < 0)
      .sort((a, b) => a.localeCompare(b));

    return [...known, ...strays].map((state) => ({
      key: `state:${state}`,
      label: state,
      filter: `state:${state}`,
      count: counts.get(state) ?? 0,
    }));
  }

  private resolveTagGroups(matched: Task[]): DashboardGroup[] {
    // Not disjoint: a task with several tags counts once per tag, so column
    // sums may exceed the card total (result.overlapsTotal flags this).
    const counts = new Map<string, number>();
    for (const task of matched) {
      for (const tag of task.tags ?? []) {
        if (PRIORITY_TAG_NAMES.has(tag)) {
          continue;
        }
        counts.set(tag, (counts.get(tag) ?? 0) + 1);
      }
    }
    return Array.from(counts.entries()).map(([name, count]) => ({
      key: `tag:${name}`,
      label: `#${name}`,
      filter: `tag:${name}`,
      count,
    }));
  }

  /**
   * Five urgency buckets for a date field. Bucket assignment is
   * evaluator-driven: for each matched task, evaluate the three window
   * filters in order — first true wins. Later = has a date and none of the
   * three matched; its click filter is exactly LATER_FILTER(field). No date
   * = date is null with filter `<field>:none`.
   */
  private async resolveDateBucketGroups(
    field: 'scheduled' | 'deadline',
    matched: Task[],
  ): Promise<DashboardGroup[]> {
    const windowFilters = WINDOW_BUCKET_FILTERS(field);
    const counts = [0, 0, 0, 0, 0];

    await Promise.all(
      matched.map(async (task) => {
        const date =
          field === 'scheduled' ? task.scheduledDate : task.deadlineDate;
        if (!date) {
          counts[4]++;
          return;
        }
        const windowResults = await Promise.all(
          windowFilters.map((filter) =>
            Search.evaluate(
              filter,
              task,
              false,
              this.settings,
              this.propertySearchEngine ?? undefined,
            ),
          ),
        );
        const idx = windowResults.findIndex(Boolean);
        if (idx >= 0) {
          counts[idx]++;
        } else {
          counts[3]++; // Later: dated but outside all three windows
        }
      }),
    );

    const filters = [
      windowFilters[0],
      windowFilters[1],
      NEXT_7_DAYS_BUCKET_FILTER(field),
      LATER_FILTER(field),
      `${field}:none`,
    ];
    const keys = [
      `${field}:overdue`,
      `${field}:today`,
      `${field}:next-7-days`,
      `${field}:later`,
      `${field}:none`,
    ];

    return DATE_BUCKET_LABELS.map((label, i) => ({
      key: keys[i],
      label,
      filter: filters[i],
      count: counts[i],
    }));
  }

  /**
   * Heatmap: bucket matched tasks by the calendar day of their date within
   * `weeks` weeks starting the first day of the current week (the plugin's
   * weekStartsOn setting — Monday or Sunday), extending forward. Days before
   * today stay empty (the renderer dims them) — the heatmap is a
   * forward-looking window; overdue work is what the bucket cards show.
   */
  private resolveHeatmap(
    field: 'scheduled' | 'deadline',
    matched: Task[],
    heatmapWindow?: number,
  ): { days: HeatmapDay[]; today: string } {
    const weeks = heatmapWindow ?? DEFAULT_HEATMAP_WINDOW_WEEKS;
    const now = new Date();
    const todayStart = startOfLocalDay(now);
    const windowStart = startOfLocalDay(now);
    windowStart.setDate(windowStart.getDate() - this.daysSinceWeekStart(now));

    const totalDays = weeks * 7;
    const counts = new Array<number>(totalDays).fill(0);
    const windowStartNumber = dayNumber(windowStart);

    for (const task of matched) {
      const date =
        field === 'scheduled' ? task.scheduledDate : task.deadlineDate;
      if (!date) continue;
      const dayStart = startOfLocalDay(date);
      if (dayStart.getTime() < todayStart.getTime()) continue;
      const offset = Math.round(
        (dayNumber(dayStart) - windowStartNumber) / (24 * 60 * 60 * 1000),
      );
      if (offset < 0 || offset >= totalDays) continue;
      counts[offset]++;
    }

    const days: HeatmapDay[] = counts.map((count, i) => {
      const day = startOfLocalDay(windowStart);
      day.setDate(day.getDate() + i);
      return { date: toDateKey(day), count };
    });

    return { days, today: toDateKey(todayStart) };
  }

  /**
   * Days since the first day of the week (0 = week start). The plugin's
   * weekStartsOn setting decides whether weeks start on Monday or Sunday —
   * the heatmap's first column follows it.
   */
  private daysSinceWeekStart(date: Date): number {
    if ((this.settings.weekStartsOn ?? 'Monday') === 'Sunday') {
      return date.getDay();
    }
    return (date.getDay() + 6) % 7;
  }

  /** Apply show-empty, sorting, and max-groups truncation (+ 'more' tail). */
  private finalizeGroups(
    rawGroups: DashboardGroup[],
    params: DashboardAggregationParams,
  ): DashboardGroup[] {
    const sort = params.sort ?? DEFAULT_SORT[params.groupBy];
    const kept = params.showEmpty
      ? rawGroups
      : rawGroups.filter((group) => group.count > 0);
    const sorted = this.sortGroups(kept, sort);

    const maxGroups = params.maxGroups ?? DEFAULT_MAX_GROUPS;
    if (sorted.length > maxGroups) {
      const hidden = sorted.slice(maxGroups);
      const tail: DashboardGroup = {
        key: 'more',
        label: `${hidden.length} more`,
        count: hidden.reduce((sum, group) => sum + group.count, 0),
        filter: '', // non-clickable: the renderer shows it as a muted footer
      };
      return [...sorted.slice(0, maxGroups), tail];
    }
    return sorted;
  }

  private sortGroups(
    groups: DashboardGroup[],
    sort: DashboardSort,
  ): DashboardGroup[] {
    const sorted = groups.slice();
    switch (sort) {
      case 'count-desc':
        sorted.sort(
          (a, b) => b.count - a.count || a.label.localeCompare(b.label),
        );
        break;
      case 'count-asc':
        sorted.sort(
          (a, b) => a.count - b.count || a.label.localeCompare(b.label),
        );
        break;
      case 'label':
        sorted.sort((a, b) => a.label.localeCompare(b.label));
        break;
      default:
        // 'fixed': keep the resolver's table order
        break;
    }
    return sorted;
  }
}
