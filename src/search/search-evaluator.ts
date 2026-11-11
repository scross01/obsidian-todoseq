import { SearchNode } from './search-types';
import { Task } from '../types/task';
import { DateUtils } from '../utils/date-utils';
import { PropertyEvaluator } from '../utils/property-evaluator';
import { TodoTrackerSettings } from '../settings/settings-types';
import { getFilename } from '../utils/task-utils';
import { RegexCache } from '../utils/regex-cache';
import { TAG_PATTERN } from '../utils/patterns';
import { PropertySearchEngine } from '../services/property-search-engine';
import { KeywordManager } from '../utils/keyword-manager';
import { KeywordGroup } from '../types/task';
import { App, TFile } from 'obsidian';
import type { PropertyQueryDescriptor } from './search-types';

const STATE_GROUP_MAP: Record<string, KeywordGroup> = {
  active: 'activeKeywords',
  inactive: 'inactiveKeywords',
  waiting: 'waitingKeywords',
  completed: 'completedKeywords',
};

/**
 * A property filter node's engine query plus its resolution identity.
 * Engine results depend only on the query (never the task), so the bulk
 * path resolves each unique query once per batch.
 */
interface PropertyEngineResolution {
  /** Dedupe key: case-sensitivity class + engine query. */
  key: string;
  /** The engine query (e.g. `[type:Project]`). */
  query: string;
  effectiveCaseSensitive: boolean;
}

export class SearchEvaluator {
  private static regexCache = new RegexCache();

  /** Get the app instance from settings.app (populated by Plugin.loadSettings). */
  private static getApp(settings?: TodoTrackerSettings): App | undefined {
    return (settings as TodoTrackerSettings & { app?: App })?.app;
  }

  /**
   * Get the file for a task, using the app instance from settings.
   * Used as fallback when PropertySearchEngine is not available
   */
  private static getFileForTask(
    task: Task,
    settings?: TodoTrackerSettings,
  ): TFile {
    const app = this.getApp(settings);
    if (!app) {
      throw new Error('Cannot get file: App not available');
    }

    const abstractFile = app.vault.getAbstractFileByPath(task.path);
    if (
      abstractFile &&
      abstractFile instanceof TFile &&
      abstractFile.extension === 'md'
    ) {
      return abstractFile;
    }

    throw new Error('Cannot get file: File not found or not a markdown file');
  }

  static async evaluate(
    node: SearchNode,
    task: Task,
    caseSensitive: boolean,
    settings?: TodoTrackerSettings,
    propertySearchEngine?: PropertySearchEngine,
  ): Promise<boolean> {
    switch (node.type) {
      case 'term':
        return node.value
          ? this.evaluateTerm(node.value, task, caseSensitive)
          : false;
      case 'phrase':
        return node.value
          ? this.evaluatePhrase(node.value, task, caseSensitive)
          : false;
      case 'prefix_filter':
        return this.evaluatePrefixFilter(node, task, caseSensitive, settings);
      case 'range_filter':
        return this.evaluateRangeFilter(node, task, caseSensitive);
      case 'property_filter':
        return this.evaluatePropertyFilter(
          node,
          task,
          caseSensitive,
          settings,
          propertySearchEngine,
        );
      case 'and':
        return node.children
          ? this.evaluateAnd(
              node.children,
              task,
              caseSensitive,
              settings,
              propertySearchEngine,
            )
          : false;
      case 'or':
        return node.children
          ? this.evaluateOr(
              node.children,
              task,
              caseSensitive,
              settings,
              propertySearchEngine,
            )
          : false;
      case 'not':
        return node.children && node.children[0]
          ? this.evaluateNot(
              node.children[0],
              task,
              caseSensitive,
              settings,
              propertySearchEngine,
            )
          : false;
      default:
        return false;
    }
  }

  /**
   * Synchronous evaluation for bulk (list-wide) filtering.
   *
   * The per-row `evaluate` above allocates a Promise per node per task; over
   * a vault-sized task set that is thousands of suspensions and wrapper
   * allocations per keystroke refresh. Bulk filtering is only worthwhile
   * when the tree is synchronously evaluable after the task-independent
   * engine resolutions have been pre-computed (see
   * `collectEngineResolutions` → `resolveEngineFiles`), so callers must
   * keep this contract:
   *
   *   - Every `async`/`await` boundary lives at the batch level, never per
   *     row: the facade awaits the *engine* (whose matching-file set does
   *     not depend on the task being evaluated), then runs one plain loop.
   *   - `engineFiles` maps the dedupe key of every `property_filter` node
   *     in the tree (`S|query` / `I|query`, built by buildPropertyQuery) to
   *     its engine result — `null` when the engine failed, exactly like
   *     the per-row catch. Absent key or absent map falls back to the
   *     task's file metadata path.
   *   - Behavior parity with `evaluate` is pinned by tests/search-bulk.test.ts.
   */
  static evaluateSync(
    node: SearchNode,
    task: Task,
    caseSensitive: boolean,
    settings?: TodoTrackerSettings,
    engineFiles?: Map<string, Set<string> | null>,
  ): boolean {
    switch (node.type) {
      case 'term':
        return node.value
          ? this.evaluateTerm(node.value, task, caseSensitive)
          : false;
      case 'phrase':
        return node.value
          ? this.evaluatePhrase(node.value, task, caseSensitive)
          : false;
      case 'prefix_filter':
        return this.evaluatePrefixFilter(node, task, caseSensitive, settings);
      case 'range_filter':
        return this.evaluateRangeFilter(node, task, caseSensitive);
      case 'property_filter': {
        const built = this.buildPropertyQuery(node);
        if (!built) return false;
        const effectiveCaseSensitive = node.exact ? true : caseSensitive;
        const resolved = engineFiles?.get(
          `${effectiveCaseSensitive ? 'S' : 'I'}|${built.query}`,
        );
        return this.evaluatePropertyFilterSync(
          node,
          task,
          caseSensitive,
          settings,
          resolved,
        );
      }
      case 'and':
        return (node.children ?? []).every((child) =>
          this.evaluateSync(child, task, caseSensitive, settings, engineFiles),
        );
      case 'or':
        return (node.children ?? []).some((child) =>
          this.evaluateSync(child, task, caseSensitive, settings, engineFiles),
        );
      case 'not': {
        const first = node.children?.[0];
        return first
          ? !this.evaluateSync(
              first,
              task,
              caseSensitive,
              settings,
              engineFiles,
            )
          : false;
      }
      default:
        return false;
    }
  }

  /**
   * Walk the AST and collect every `property_filter` node's engine query,
   * deduplicated by (effective case sensitivity | query). Engine results
   * depend only on the query, never on the task, so one resolution per
   * unique filter serves the whole batch — instead of one engine call per
   * row per keystroke.
   */
  static collectEngineResolutions(
    node: SearchNode,
    caseSensitive: boolean,
  ): PropertyEngineResolution[] {
    const resolutions = new Map<string, PropertyEngineResolution>();
    const walk = (n: SearchNode): void => {
      if (n.type === 'property_filter') {
        const built = this.buildPropertyQuery(n);
        if (built) {
          const effectiveCaseSensitive = n.exact ? true : caseSensitive;
          const key = `${effectiveCaseSensitive ? 'S' : 'I'}|${built.query}`;
          if (!resolutions.has(key)) {
            resolutions.set(key, {
              key,
              query: built.query,
              effectiveCaseSensitive,
            });
          }
        }
      }
      for (const child of n.children ?? []) walk(child);
    };
    walk(node);
    return Array.from(resolutions.values());
  }

  /** One engine query → matching-file set (null on engine failure, per-row catch semantics). */
  static async resolveEngineFiles(
    descriptorOrQuery: PropertyQueryDescriptor | string,
    effectiveCaseSensitive: boolean,
    propertySearchEngine: PropertySearchEngine,
  ): Promise<Set<string> | null> {
    const descriptor =
      typeof descriptorOrQuery === 'string'
        ? this.descriptorFromQuery(descriptorOrQuery)
        : descriptorOrQuery;
    try {
      if (typeof propertySearchEngine.searchProperty === 'function') {
        return await propertySearchEngine.searchProperty(
          descriptor,
          effectiveCaseSensitive,
        );
      }
      // Compatibility for partially stubbed engines in existing callers.
      const legacyQuery =
        typeof descriptorOrQuery === 'string'
          ? descriptorOrQuery
          : descriptor.kind === 'existence'
            ? `[${descriptor.key}]`
            : `[${descriptor.key}:${descriptor.value}]`;
      return await propertySearchEngine.searchProperties(
        legacyQuery,
        effectiveCaseSensitive,
      );
    } catch {
      // Fall back to direct metadata access, mirroring the per-row catch.
      return null;
    }
  }

  /** Single-pass bulk filter — the production per-keystroke list shape. */
  static filterTasksByNode(
    node: SearchNode,
    tasks: Task[],
    caseSensitive: boolean,
    settings?: TodoTrackerSettings,
    engineFiles?: Map<string, Set<string> | null>,
  ): Task[] {
    const matched: Task[] = [];
    for (const task of tasks) {
      if (this.evaluateSync(node, task, caseSensitive, settings, engineFiles)) {
        matched.push(task);
      }
    }
    return matched;
  }

  private static evaluateTerm(
    term: string,
    task: Task,
    caseSensitive: boolean,
  ): boolean {
    const searchText = caseSensitive ? term : term.toLowerCase();
    const fields = this.getSearchableFields(task);

    return fields.some((fieldValue) => {
      const target = caseSensitive ? fieldValue : fieldValue.toLowerCase();
      return target.includes(searchText);
    });
  }

  private static evaluatePhrase(
    phrase: string,
    task: Task,
    caseSensitive: boolean,
  ): boolean {
    // Escape regex special characters in the phrase
    const escapedPhrase = this.escapeRegex(phrase);
    const regexFlags = caseSensitive ? '' : 'i';

    // Use word boundaries to ensure exact phrase matching
    // Cache the compiled regex to avoid repeated compilation
    const phraseRegex = this.regexCache.get(
      `\\b${escapedPhrase}\\b`,
      regexFlags,
    );

    const fields = this.getSearchableFields(task);

    return fields.some((fieldValue) => {
      return phraseRegex.test(fieldValue);
    });
  }

  private static async evaluateAnd(
    nodes: SearchNode[],
    task: Task,
    caseSensitive: boolean,
    settings?: TodoTrackerSettings,
    propertySearchEngine?: PropertySearchEngine,
  ): Promise<boolean> {
    // Short-circuit: return false on first false
    for (const node of nodes) {
      if (
        !(await this.evaluate(
          node,
          task,
          caseSensitive,
          settings,
          propertySearchEngine,
        ))
      ) {
        return false;
      }
    }
    return true;
  }

  private static async evaluateOr(
    nodes: SearchNode[],
    task: Task,
    caseSensitive: boolean,
    settings?: TodoTrackerSettings,
    propertySearchEngine?: PropertySearchEngine,
  ): Promise<boolean> {
    // Short-circuit: return true on first true
    for (const node of nodes) {
      if (
        await this.evaluate(
          node,
          task,
          caseSensitive,
          settings,
          propertySearchEngine,
        )
      ) {
        return true;
      }
    }
    return false;
  }

  private static async evaluateNot(
    node: SearchNode,
    task: Task,
    caseSensitive: boolean,
    settings?: TodoTrackerSettings,
    propertySearchEngine?: PropertySearchEngine,
  ): Promise<boolean> {
    return !(await this.evaluate(
      node,
      task,
      caseSensitive,
      settings,
      propertySearchEngine,
    ));
  }

  private static evaluatePrefixFilter(
    node: SearchNode,
    task: Task,
    caseSensitive: boolean,
    settings?: TodoTrackerSettings,
  ): boolean {
    const field = node.field;
    const value = node.value;

    if (!field || !value) {
      return false;
    }

    switch (field) {
      case 'path':
        return this.evaluatePathFilter(value, task, caseSensitive);
      case 'file':
        return this.evaluateFileFilter(value, task, caseSensitive);
      case 'tag':
        return this.evaluateTagFilter(value, task, caseSensitive, node.exact);
      case 'state':
        return this.evaluateStateFilter(value, task, caseSensitive, settings);
      case 'priority':
        return this.evaluatePriorityFilter(value, task, caseSensitive);
      case 'content':
        return this.evaluateContentFilter(value, task, caseSensitive);
      case 'description':
        return this.evaluateDescriptionFilter(value, task, caseSensitive);
      case 'heading':
        return this.evaluateHeadingFilter(value, task, caseSensitive);
      case 'scheduled':
        return this.evaluateScheduledFilter(
          value,
          task,
          caseSensitive,
          settings,
        );
      case 'deadline':
        return this.evaluateDeadlineFilter(
          value,
          task,
          caseSensitive,
          settings,
        );
      case 'closed':
        return this.evaluateClosedFilter(value, task, caseSensitive, settings);
      case 'started':
        return this.evaluateStartedFilter(value, task, caseSensitive, settings);
      default:
        return false;
    }
  }

  private static evaluatePathFilter(
    value: string,
    task: Task,
    caseSensitive: boolean,
  ): boolean {
    if (!task.path) return false;

    const searchText = caseSensitive ? value : value.toLowerCase();
    const targetPath = caseSensitive ? task.path : task.path.toLowerCase();

    // Check if the path starts with the search value followed by a slash
    // This matches both immediate parent and subfolders
    const expectedPrefix = searchText + '/';

    // Handle root-level case (e.g., "examples/File.md" where search is "examples")
    if (targetPath === searchText || targetPath.startsWith(expectedPrefix)) {
      return true;
    }

    // Also check if any parent directory in the path matches (for nested cases)
    const pathParts = targetPath.split('/');
    for (let i = 0; i < pathParts.length - 1; i++) {
      // Don't check the filename
      if (pathParts[i] === searchText) {
        return true;
      }
    }

    return false;
  }

  private static evaluateFileFilter(
    value: string,
    task: Task,
    caseSensitive: boolean,
  ): boolean {
    if (!task.path) return false;

    // Extract just the filename using shared utility
    const filename = getFilename(task.path);

    const searchText = caseSensitive ? value : value.toLowerCase();
    const targetFilename = caseSensitive ? filename : filename.toLowerCase();

    return targetFilename.includes(searchText);
  }

  private static evaluateTagFilter(
    value: string,
    task: Task,
    caseSensitive: boolean,
    exact?: boolean,
  ): boolean {
    if (!task.rawText) return false;

    const targetText = caseSensitive
      ? task.rawText
      : task.rawText.toLowerCase();

    // Look for tag patterns with support for subtags (#context, #context/home, etc.)
    const matches = targetText.match(TAG_PATTERN) || [];

    if (exact) {
      // Exact match behavior for quoted searches
      // Normalize search value - make # prefix optional
      let normalizedValue = value;
      if (normalizedValue.startsWith('#')) {
        normalizedValue = normalizedValue.slice(1);
      }
      const searchText = caseSensitive
        ? normalizedValue
        : normalizedValue.toLowerCase();

      return matches.some((tag) => {
        const tagContent = tag.slice(1); // Remove #
        const normalizedTag = caseSensitive
          ? tagContent
          : tagContent.toLowerCase();
        return normalizedTag === searchText;
      });
    } else {
      // Unquoted behavior - exact match if starts with #, prefix match otherwise
      if (value.startsWith('#')) {
        // Exact match on the full tag including the #
        const searchText = caseSensitive ? value : value.toLowerCase();
        return matches.some((tag) => {
          const normalizedTag = caseSensitive ? tag : tag.toLowerCase();
          return normalizedTag === searchText;
        });
      } else {
        // Prefix match behavior for unquoted searches without #
        const searchText = caseSensitive ? value : value.toLowerCase();
        return matches.some((tag) => {
          const tagContent = tag.slice(1); // Remove #
          const normalizedTag = caseSensitive
            ? tagContent
            : tagContent.toLowerCase();
          return (
            normalizedTag === searchText ||
            normalizedTag.startsWith(searchText + '/')
          );
        });
      }
    }
  }

  private static evaluateStateFilter(
    value: string,
    task: Task,
    caseSensitive: boolean,
    settings?: TodoTrackerSettings,
  ): boolean {
    const group = STATE_GROUP_MAP[value];
    if (group && settings) {
      const groupKeywords = KeywordManager.getKeywordsForGroup(group, settings);
      const taskState = caseSensitive ? task.state : task.state.toLowerCase();
      return groupKeywords.some((k) =>
        caseSensitive ? k === task.state : k.toLowerCase() === taskState,
      );
    }

    const searchText = caseSensitive ? value : value.toLowerCase();
    const taskState = caseSensitive ? task.state : task.state.toLowerCase();

    return taskState === searchText;
  }

  private static evaluatePriorityFilter(
    value: string,
    task: Task,
    caseSensitive: boolean,
  ): boolean {
    // Normalize the search value
    let normalizedSearch = value.toLowerCase();

    // Map priority keywords to standard values
    if (normalizedSearch === 'high' || normalizedSearch === 'a') {
      normalizedSearch = 'high';
    } else if (normalizedSearch === 'medium' || normalizedSearch === 'b') {
      normalizedSearch = 'med';
    } else if (normalizedSearch === 'low' || normalizedSearch === 'c') {
      normalizedSearch = 'low';
    } else if (normalizedSearch === 'none') {
      // Handle 'none' case separately
      return !task.priority;
    }

    const taskPriority = task.priority ? task.priority.toLowerCase() : null;
    return taskPriority === normalizedSearch;
  }

  private static evaluateContentFilter(
    value: string,
    task: Task,
    caseSensitive: boolean,
  ): boolean {
    if (!task.text) return false;

    const searchText = caseSensitive ? value : value.toLowerCase();
    const targetText = caseSensitive ? task.text : task.text.toLowerCase();

    return targetText.includes(searchText);
  }

  /** `description:` — substring of the task's DESCRIPTION: line; tasks without one never match. */
  private static evaluateDescriptionFilter(
    value: string,
    task: Task,
    caseSensitive: boolean,
  ): boolean {
    if (!task.description) return false;

    const searchText = caseSensitive ? value : value.toLowerCase();
    const target = caseSensitive
      ? task.description
      : task.description.toLowerCase();

    return target.includes(searchText);
  }

  /** `heading:` — substring of the nearest enclosing markdown heading; absent → no match. */
  private static evaluateHeadingFilter(
    value: string,
    task: Task,
    caseSensitive: boolean,
  ): boolean {
    if (!task.parentHeading) return false;

    const searchText = caseSensitive ? value : value.toLowerCase();
    const target = caseSensitive
      ? task.parentHeading
      : task.parentHeading.toLowerCase();

    return target.includes(searchText);
  }

  private static getSearchableFields(task: Task): string[] {
    const fields: string[] = [];

    // `rawText` is the full original line. `text` is the normalized line with
    // the keyword, priority token and footnote/embed references stripped. That
    // stripping removes tokens from the middle, so a displayed phrase such as
    // `Review report` (from `Review[^1] report`) is NOT a contiguous substring
    // of `rawText`; index the normalized text too, but only when it differs.
    if (task.rawText) fields.push(task.rawText);
    if (task.text && task.text !== task.rawText) fields.push(task.text);
    // DESCRIPTION text joins the default (no-prefix) search: an unprefixed
    // term matches the task line OR its description. Kept out of
    // `parentHeading`-based matching, which stays scoped via heading:.
    if (task.description) fields.push(task.description);
    if (task.path) {
      fields.push(task.path);
      // Also add just the filename using shared utility
      fields.push(getFilename(task.path));
    }

    return fields;
  }

  private static escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Evaluate scheduled date filter
   * @param value Filter value
   * @param task Task to evaluate
   * @param settings Application settings
   * @returns True if task matches the scheduled filter
   */
  private static evaluateScheduledFilter(
    value: string,
    task: Task,
    caseSensitive: boolean,
    settings?: TodoTrackerSettings,
  ): boolean {
    return this.evaluateDateFilter(value, task.scheduledDate, settings);
  }

  /**
   * Evaluate deadline date filter
   * @param value Filter value
   * @param task Task to evaluate
   * @param settings Application settings
   * @returns True if task matches the deadline filter
   */
  private static evaluateDeadlineFilter(
    value: string,
    task: Task,
    caseSensitive: boolean,
    settings?: TodoTrackerSettings,
  ): boolean {
    return this.evaluateDateFilter(value, task.deadlineDate, settings);
  }

  /**
   * Evaluate closed date filter
   * @param value Filter value
   * @param task Task to evaluate
   * @param settings Application settings
   * @returns True if task matches the closed filter
   */
  private static evaluateClosedFilter(
    value: string,
    task: Task,
    caseSensitive: boolean,
    settings?: TodoTrackerSettings,
  ): boolean {
    return this.evaluateDateFilter(value, task.closedDate, settings);
  }

  /**
   * Evaluate started date filter
   * @param value Filter value
   * @param task Task to evaluate
   * @param caseSensitive Whether matching should be case sensitive
   * @param settings Application settings
   * @returns True if task matches the started filter
   * Note: 'overdue' and 'due' are intentionally NOT meaningful for started
   * dates (first-ever-start is a one-way record); they never match, regardless
   * of the date's value.
   */
  private static evaluateStartedFilter(
    value: string,
    task: Task,
    caseSensitive: boolean,
    settings?: TodoTrackerSettings,
  ): boolean {
    // 'overdue' and 'due' describe planning dates (SCHEDULED/DEADLINE). A
    // STARTED date records when work first began, so these expressions have
    // no meaning here — reject them before generic date evaluation.
    const normalized = value.trim().toLowerCase();
    if (normalized === 'overdue' || normalized === 'due') {
      return false;
    }
    return this.evaluateDateFilter(value, task.startedDate, settings);
  }

  /**
   * Common date filter evaluation logic
   * @param value Filter value
   * @param taskDate Task date to evaluate against
   * @param settings Application settings
   * @returns True if task matches the date filter
   */
  private static evaluateDateFilter(
    value: string,
    taskDate: Date | null,
    settings?: TodoTrackerSettings,
  ): boolean {
    const parsedDate = DateUtils.parseDateValue(value);

    // Handle null/undefined parsedDate
    if (parsedDate === null || parsedDate === undefined) {
      return false;
    }

    // Handle 'none' case - tasks without dates
    if (parsedDate === 'none') {
      return !taskDate;
    }

    // Handle tasks without dates
    if (!taskDate) {
      return false;
    }

    // Handle string-based relative date expressions
    if (typeof parsedDate === 'string') {
      return this.evaluateDateExpression(parsedDate, taskDate, settings);
    }

    // Handle date ranges
    if (
      typeof parsedDate === 'object' &&
      parsedDate !== null &&
      'start' in parsedDate &&
      'end' in parsedDate
    ) {
      return DateUtils.isDateInRange(
        taskDate,
        parsedDate.start,
        parsedDate.end,
      );
    }

    // Handle exact date comparisons with format information
    if (
      typeof parsedDate === 'object' &&
      parsedDate !== null &&
      'date' in parsedDate &&
      'format' in parsedDate
    ) {
      const searchDate = parsedDate.date;
      const format = parsedDate.format;

      switch (format) {
        case 'year':
          // Year-only search (e.g., 2025) - match any date in that year
          return searchDate.getFullYear() === taskDate.getFullYear();

        case 'year-month':
          // Year-month search (e.g., 2025-11) - match any date in that month/year
          return (
            searchDate.getFullYear() === taskDate.getFullYear() &&
            searchDate.getMonth() === taskDate.getMonth()
          );

        case 'full':
          // Full date search (e.g., 2025-11-30) - exact date match
          return DateUtils.compareDates(taskDate, searchDate);

        default:
          return false;
      }
    }

    // Handle Date objects (from natural language parsing)
    if (parsedDate instanceof Date) {
      return DateUtils.compareDates(taskDate, parsedDate);
    }

    return false;
  }

  /**
   * Evaluate date expressions like 'overdue', 'today', 'tomorrow', etc.
   * @param expression Date expression
   * @param date Date to evaluate
   * @param settings Application settings
   * @returns True if date matches the expression
   */
  private static evaluateDateExpression(
    expression: string,
    date: Date,
    settings?: TodoTrackerSettings,
  ): boolean {
    const now = new Date();
    const weekStartsOn = settings?.weekStartsOn ?? 'Monday';

    switch (expression) {
      case 'overdue':
        return DateUtils.isDateOverdue(date, now);
      case 'due':
        return (
          DateUtils.isDateDueToday(date, now) ||
          DateUtils.isDateOverdue(date, now)
        );
      case 'today':
        return DateUtils.isDateDueToday(date, now);
      case 'tomorrow':
        return DateUtils.isDateDueTomorrow(date, now);
      case 'this week':
        return DateUtils.isDateInCurrentWeek(date, now, weekStartsOn);
      case 'next week':
        return DateUtils.isDateInNextWeek(date, now, weekStartsOn);
      case 'this month':
        return DateUtils.isDateInCurrentMonth(date, now);
      case 'next month':
        return DateUtils.isDateInNextMonth(date, now);
      case 'yesterday':
        return DateUtils.isDateYesterday(date, now);
      case 'last 7 days':
        return DateUtils.isDateInLast7Days(date, now);
      case 'last week':
        return DateUtils.isDateInLastWeek(date, now, weekStartsOn);
      case 'last month':
        return DateUtils.isDateInLastMonth(date, now);
      default:
        // Handle "next N days" pattern
        {
          const nextNDaysMatch = expression.match(/^next\s+(\d+)\s+days$/);
          if (nextNDaysMatch) {
            const days = parseInt(nextNDaysMatch[1], 10);
            return DateUtils.isDateInNextNDays(date, days, now);
          }
        }
        return false;
    }
  }

  /**
   * Evaluate range filter (e.g., scheduled:2024-01-01..2024-01-31)
   * @param node Range filter node
   * @param task Task to evaluate
   * @returns True if task matches the range filter
   */
  private static evaluateRangeFilter(
    node: SearchNode,
    task: Task,
    caseSensitive: boolean,
  ): boolean {
    const field = node.field;
    const start = node.start;
    const end = node.end;

    // One-sided ranges are allowed: at least one bound must be present.
    // A bound that is present but invalid fails closed below (parseDateValue
    // returns null for 2026-13-01, 2026-02-30, etc.).
    if (!field || (!start && !end)) {
      return false;
    }

    // Resolve bounds through parseDateBound (interval edges): a start bound
    // is its interval's first day, an end bound the day after its interval's
    // last day — identical semantics for full dates (legacy behavior) and
    // correct month/year expansion for partial dates (2026-10 as an end
    // bound = through Oct 31, not through Oct 1).
    const startDate = start ? DateUtils.parseDateBound(start, 'start') : null;
    const endDate = end ? DateUtils.parseDateBound(end, 'end') : null;

    // Present bounds must resolve; absent bounds are fine (one-sided range).
    if ((start && startDate === null) || (end && endDate === null)) {
      return false;
    }

    // Get the task date based on the field
    const taskDate =
      field === 'scheduled'
        ? task.scheduledDate
        : field === 'deadline'
          ? task.deadlineDate
          : field === 'closed'
            ? task.closedDate
            : field === 'started'
              ? task.startedDate
              : null;

    // Handle tasks without the specified date
    if (!taskDate) {
      return false;
    }

    // Bounds are already resolved to local-midnight Dates by parseDateBound
    // (start = interval first day, end = exclusive day after interval last).
    // Absent sides use the min/max sentinel so isDateInRange stays open.
    const rangeStart = startDate ?? new Date(-8640000000000000 / 2);
    const rangeEnd = endDate ?? new Date(8640000000000000 / 2);

    return DateUtils.isDateInRange(taskDate, rangeStart, rangeEnd);
  }

  /**
   * Evaluate property filter (e.g., [type:Project])
   * @param node Property filter node
   * @param task Task to evaluate
   * @param caseSensitive Whether matching should be case sensitive
   * @param settings Application settings
   * @param propertySearchEngine Property search engine instance
   * @returns True if task matches the property filter
   */
  static async evaluatePropertyFilter(
    node: SearchNode,
    task: Task,
    caseSensitive: boolean,
    settings?: TodoTrackerSettings,
    propertySearchEngine?: PropertySearchEngine,
  ): Promise<boolean> {
    const built = this.buildPropertyQuery(node);
    if (!built) return false;
    const effectiveCaseSensitive = node.exact ? true : caseSensitive;
    const matchingFiles = propertySearchEngine
      ? await this.resolveEngineFiles(
          built.descriptor,
          effectiveCaseSensitive,
          propertySearchEngine,
        )
      : undefined;
    return this.evaluatePropertyFilterSync(
      node,
      task,
      caseSensitive,
      settings,
      matchingFiles,
    );
  }

  /**
   * Validate a property filter node and build its engine query.
   * Returns null when the node is missing field or value — no match, per
   * the original inline guard. Shared by the per-row and bulk property
   * paths, and by the resolution collector, so the two cannot drift.
   */
  private static buildPropertyQuery(node: SearchNode): {
    descriptor: PropertyQueryDescriptor;
    query: string;
    propertyKey: string;
    propertyValue: string | null;
  } | null {
    let descriptor = node.property;

    if (!descriptor) {
      const value = node.value;
      if (!value) return null;

      if (value.includes(':')) {
        const colonIndex = value.indexOf(':');
        const key = value.slice(0, colonIndex);
        const rawValue = value.slice(colonIndex + 1);
        descriptor =
          rawValue === ''
            ? {
                key,
                kind: 'existence',
                value: '',
                exact: false,
                keyExact: false,
              }
            : {
                key,
                kind: rawValue === 'null' ? 'null' : 'string',
                value: rawValue,
                exact: node.exact === true,
                keyExact: false,
              };
      } else {
        descriptor = {
          key: value,
          kind: 'existence',
          value: '',
          exact: false,
          keyExact: false,
        };
      }
    }

    if (!descriptor.key) return null;

    const query =
      descriptor.kind === 'existence'
        ? `[${descriptor.key}]`
        : `[${descriptor.key}:${descriptor.value}]`;

    return {
      descriptor,
      query,
      propertyKey: descriptor.key,
      propertyValue: descriptor.kind === 'existence' ? null : descriptor.value,
    };
  }

  /** Adapter for older string-query callers; keeps their shape unchanged. */
  private static descriptorFromQuery(query: string): PropertyQueryDescriptor {
    const inner =
      query.startsWith('[') && query.endsWith(']') ? query.slice(1, -1) : query;
    const colonIndex = inner.indexOf(':');
    if (colonIndex === -1) {
      return {
        key: inner.trim(),
        kind: 'existence',
        value: '',
        exact: false,
        keyExact: false,
      };
    }
    const key = inner.slice(0, colonIndex).trim();
    const value = inner.slice(colonIndex + 1).trim();
    if (value === 'null') {
      return {
        key,
        kind: 'null',
        value: 'null',
        exact: false,
        keyExact: false,
      };
    }
    return {
      key,
      kind: 'string',
      value,
      exact: false,
      keyExact: false,
    };
  }

  /**
   * The metadata-cache property path shared by per-row and bulk evaluation.
   * `matchingFiles` short-circuits when the engine resolved a set to test
   * against; undefined (no engine) or null (engine failed) falls through to
   * the task's file frontmatter, exactly as the inline path always did.
   */
  private static evaluatePropertyFilterSync(
    node: SearchNode,
    task: Task,
    caseSensitive: boolean,
    settings?: TodoTrackerSettings,
    matchingFiles?: Set<string> | null,
  ): boolean {
    const built = this.buildPropertyQuery(node);
    if (!built) return false;
    const { descriptor } = built;

    // Engine pre-resolution (bulk) or per-row engine hit: the matching-file
    // set is task-independent, so membership is the whole answer.
    if (matchingFiles) {
      return matchingFiles.has(task.path);
    }

    let file;
    try {
      file = this.getFileForTask(task, settings);
    } catch {
      return false;
    }

    const app = this.getApp(settings);
    if (!app) {
      return false;
    }

    const fileCache = app.metadataCache.getFileCache(file);
    if (!fileCache || !fileCache.frontmatter) {
      return false;
    }

    const frontmatter = fileCache.frontmatter as Record<string, unknown>;
    const effectiveCaseSensitive = node.exact ? true : caseSensitive;

    if (descriptor.kind === 'string') {
      let text = descriptor.value.trim();
      if (text.startsWith('(') && text.endsWith(')')) {
        text = text.slice(1, -1).trim();
      }

      if (text.includes(' OR ')) {
        return text
          .split(' OR ')
          .map((part) => part.trim())
          .filter(Boolean)
          .some((part) =>
            PropertyEvaluator.matchesPropertyFilter(
              frontmatter,
              { ...descriptor, value: part },
              effectiveCaseSensitive,
            ),
          );
      }

      if (!descriptor.exact) {
        const parsedDate = DateUtils.parseDateValue(text);
        if (parsedDate) {
          const keys = PropertyEvaluator.matchingKeys(
            frontmatter,
            descriptor,
            effectiveCaseSensitive,
          );
          const matched = keys.some((key) => {
            const raw = frontmatter[key];
            const values = Array.isArray(raw) ? raw : [raw];
            return values.some((value) => {
              const taskDate =
                PropertyEvaluator.parsePropertyValueAsDate(value);
              return taskDate
                ? PropertyEvaluator.compareDate(taskDate, parsedDate)
                : false;
            });
          });
          if (matched) return true;
        }

        const comparison = text.match(/^([><]=?)(.+)$/);
        if (comparison) {
          const operator = comparison[1];
          const compareText = comparison[2];
          const compareDate =
            PropertyEvaluator.parseDateForComparison(compareText);
          const compareNumber = Number(compareText);
          const keys = PropertyEvaluator.matchingKeys(
            frontmatter,
            descriptor,
            effectiveCaseSensitive,
          );
          return keys.some((key) => {
            const raw = frontmatter[key];
            const values = Array.isArray(raw) ? raw : [raw];
            return values.some((value) => {
              if (compareDate) {
                const taskDate =
                  PropertyEvaluator.parsePropertyValueAsDate(value);
                return taskDate
                  ? PropertyEvaluator.evaluateDateComparison(
                      taskDate,
                      operator,
                      compareDate,
                    )
                  : false;
              }
              if (typeof value !== 'number' || isNaN(compareNumber)) {
                return false;
              }
              switch (operator) {
                case '>':
                  return value > compareNumber;
                case '>=':
                  return value >= compareNumber;
                case '<':
                  return value < compareNumber;
                case '<=':
                  return value <= compareNumber;
                default:
                  return false;
              }
            });
          });
        }
      }
    }

    return PropertyEvaluator.matchesPropertyFilter(
      frontmatter,
      descriptor,
      effectiveCaseSensitive,
    );
  }

  /**
   * Evaluate a single property value against a filter
   * @param node Property filter node with a single value
   * @param propertyValue Property value from frontmatter
   * @param caseSensitive Whether matching should be case sensitive
   * @returns True if property value matches the filter
   */
  private static evaluateSinglePropertyValue(
    node: SearchNode,
    propertyValue: unknown,
    caseSensitive: boolean,
  ): boolean {
    const value = node.value;
    const exact = node.exact;

    if (value === undefined) {
      return false;
    }

    // Handle date property comparisons
    const parsedDate = DateUtils.parseDateValue(value);

    if (parsedDate) {
      // Try to parse property value as date using PropertyEvaluator
      const taskDate =
        PropertyEvaluator.parsePropertyValueAsDate(propertyValue);

      if (taskDate) {
        // Use PropertyEvaluator for date comparison
        return PropertyEvaluator.compareDate(taskDate, parsedDate);
      }
    }

    // Handle comparison operators (e.g., [size:>100])
    if (typeof value === 'string') {
      const comparisonMatch = value.match(/^([><]=?)\s*(\d+(\.\d+)?)$/);
      if (comparisonMatch) {
        const operator = comparisonMatch[1];
        const compareValue = Number(comparisonMatch[2]);

        // Only numeric comparisons are supported for numeric properties
        if (typeof propertyValue === 'number') {
          switch (operator) {
            case '>':
              return propertyValue > compareValue;
            case '>=':
              return propertyValue >= compareValue;
            case '<':
              return propertyValue < compareValue;
            case '<=':
              return propertyValue <= compareValue;
            default:
              return false;
          }
        }

        // For non-numeric properties, comparison operators are not supported
        return false;
      }
    }

    // Handle different property types
    if (Array.isArray(propertyValue)) {
      // For arrays, check if the search value matches any element
      return propertyValue.some((item) => {
        if (typeof item === 'string') {
          const itemStr = caseSensitive ? item : item.toLowerCase();
          const searchStr = caseSensitive ? value : value.toLowerCase();

          if (exact) {
            return itemStr === searchStr;
          } else {
            return itemStr.includes(searchStr);
          }
        }
        return false;
      });
    } else if (typeof propertyValue === 'string') {
      // For strings, perform comparison
      const propStr = caseSensitive
        ? propertyValue
        : propertyValue.toLowerCase();
      const searchStr = caseSensitive ? value : value.toLowerCase();

      if (exact) {
        return propStr === searchStr;
      } else {
        return propStr.includes(searchStr);
      }
    } else if (typeof propertyValue === 'number') {
      // For numbers, try to parse the search value as a number
      const searchNum = Number(value);
      if (!isNaN(searchNum)) {
        return propertyValue === searchNum;
      }

      // If not a number, convert to string and compare
      const propStr = caseSensitive
        ? String(propertyValue)
        : String(propertyValue).toLowerCase();
      const searchStr = caseSensitive ? value : value.toLowerCase();

      if (exact) {
        return propStr === searchStr;
      } else {
        return propStr.includes(searchStr);
      }
    } else if (typeof propertyValue === 'boolean') {
      // For booleans, check if the search value matches the boolean
      const searchLower = value.toLowerCase();
      if (propertyValue) {
        return searchLower === 'true';
      } else {
        return searchLower === 'false';
      }
    }

    // For other types, convert to string and compare
    const propStr = caseSensitive
      ? String(propertyValue)
      : String(propertyValue).toLowerCase();
    const searchStr = caseSensitive ? value : value.toLowerCase();

    if (exact) {
      return propStr === searchStr;
    } else {
      return propStr.includes(searchStr);
    }
  }
}
