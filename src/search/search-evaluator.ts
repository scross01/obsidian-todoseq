import { SearchNode } from './search-types';
import { Task } from '../task';
import { DateUtils } from '../view/date-utils';
import { TodoTrackerSettings } from '../settings/settings';
import { getFilename } from '../utils/task-utils';

export class SearchEvaluator {
  static evaluate(
    node: SearchNode,
    task: Task,
    caseSensitive: boolean,
    settings?: TodoTrackerSettings,
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
      case 'and':
        return node.children
          ? this.evaluateAnd(node.children, task, caseSensitive)
          : false;
      case 'or':
        return node.children
          ? this.evaluateOr(node.children, task, caseSensitive)
          : false;
      case 'not':
        return node.children && node.children[0]
          ? this.evaluateNot(node.children[0], task, caseSensitive)
          : false;
      default:
        return false;
    }
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
    const regexFlags = caseSensitive ? 'g' : 'gi';

    // Use word boundaries to ensure exact phrase matching
    const phraseRegex = new RegExp(`\\b${escapedPhrase}\\b`, regexFlags);

    const fields = this.getSearchableFields(task);

    return fields.some((fieldValue) => {
      return phraseRegex.test(fieldValue);
    });
  }

  private static evaluateAnd(
    nodes: SearchNode[],
    task: Task,
    caseSensitive: boolean,
  ): boolean {
    // Short-circuit: return false on first false
    for (const node of nodes) {
      if (!this.evaluate(node, task, caseSensitive)) {
        return false;
      }
    }
    return true;
  }

  private static evaluateOr(
    nodes: SearchNode[],
    task: Task,
    caseSensitive: boolean,
  ): boolean {
    // Short-circuit: return true on first true
    for (const node of nodes) {
      if (this.evaluate(node, task, caseSensitive)) {
        return true;
      }
    }
    return false;
  }

  private static evaluateNot(
    node: SearchNode,
    task: Task,
    caseSensitive: boolean,
  ): boolean {
    return !this.evaluate(node, task, caseSensitive);
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
        return this.evaluateTagFilter(value, task, caseSensitive);
      case 'state':
        return this.evaluateStateFilter(value, task, caseSensitive);
      case 'priority':
        return this.evaluatePriorityFilter(value, task, caseSensitive);
      case 'content':
        return this.evaluateContentFilter(value, task, caseSensitive);
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
  ): boolean {
    if (!task.rawText) return false;

    const searchText = caseSensitive ? value : value.toLowerCase();
    const targetText = caseSensitive
      ? task.rawText
      : task.rawText.toLowerCase();

    // Look for tag patterns (#tag)
    const tagRegex = /#([\w-]+)/g;
    const matches = targetText.match(tagRegex) || [];

    return matches.some((tag) => {
      const tagContent = caseSensitive ? tag : tag.toLowerCase();
      return tagContent.includes(searchText);
    });
  }

  private static evaluateStateFilter(
    value: string,
    task: Task,
    caseSensitive: boolean,
  ): boolean {
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

  private static getSearchableFields(task: Task): string[] {
    const fields: string[] = [];

    if (task.rawText) fields.push(task.rawText);
    if (task.text) fields.push(task.text);
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
   * @param caseSensitive Whether matching should be case sensitive
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
   * @param caseSensitive Whether matching should be case sensitive
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
          return searchDate.getUTCFullYear() === taskDate.getUTCFullYear();

        case 'year-month':
          // Year-month search (e.g., 2025-11) - match any date in that month/year
          return (
            searchDate.getUTCFullYear() === taskDate.getUTCFullYear() &&
            searchDate.getUTCMonth() === taskDate.getUTCMonth()
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
   * @param caseSensitive Whether matching should be case sensitive
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

    if (!field || !start || !end) {
      return false;
    }

    // Parse the start and end dates
    const startDate = DateUtils.parseDateValue(start);
    const endDate = DateUtils.parseDateValue(end);

    // Both start and end must be valid date ranges or dates
    if (startDate === null || endDate === null) {
      return false;
    }

    // Get the task date based on the field
    const taskDate =
      field === 'scheduled' ? task.scheduledDate : task.deadlineDate;

    // Handle tasks without the specified date
    if (!taskDate) {
      return false;
    }

    // Convert to date range format for comparison
    let rangeStart: Date;
    let rangeEnd: Date;

    // Handle start date
    if (
      typeof startDate === 'object' &&
      startDate !== null &&
      'start' in startDate &&
      'end' in startDate
    ) {
      rangeStart = startDate.start;
    } else if (
      typeof startDate === 'object' &&
      startDate !== null &&
      'date' in startDate
    ) {
      rangeStart = startDate.date;
    } else if (startDate instanceof Date) {
      rangeStart = startDate;
    } else {
      return false;
    }

    // Handle end date
    if (
      typeof endDate === 'object' &&
      endDate !== null &&
      'start' in endDate &&
      'end' in endDate
    ) {
      rangeEnd = endDate.end;
    } else if (
      typeof endDate === 'object' &&
      endDate !== null &&
      'date' in endDate
    ) {
      rangeEnd = endDate.date;
    } else if (endDate instanceof Date) {
      rangeEnd = endDate;
    } else {
      return false;
    }

    // Add one day to end date to make it inclusive
    rangeEnd = new Date(rangeEnd);
    rangeEnd.setDate(rangeEnd.getDate() + 1);

    return DateUtils.isDateInRange(taskDate, rangeStart, rangeEnd);
  }
}
