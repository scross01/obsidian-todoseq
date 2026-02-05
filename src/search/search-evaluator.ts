import { SearchNode } from './search-types';
import { Task } from '../types/task';
import { DateUtils } from '../utils/date-utils';
import { TodoTrackerSettings } from '../settings/settings';
import { getFilename } from '../utils/task-utils';
import { RegexCache } from '../utils/regex-cache';
import { TAG_PATTERN } from '../utils/patterns';
import { PropertySearchEngine } from '../services/property-search-engine';

export class SearchEvaluator {
  private static regexCache = new RegexCache();

  static async evaluate(
    node: SearchNode,
    task: Task,
    caseSensitive: boolean,
    settings?: TodoTrackerSettings,
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
        return this.evaluatePropertyFilter(node, task, caseSensitive, settings);
      case 'and':
        return node.children
          ? this.evaluateAnd(node.children, task, caseSensitive, settings)
          : false;
      case 'or':
        return node.children
          ? this.evaluateOr(node.children, task, caseSensitive, settings)
          : false;
      case 'not':
        return node.children && node.children[0]
          ? this.evaluateNot(node.children[0], task, caseSensitive, settings)
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
  ): Promise<boolean> {
    // Short-circuit: return false on first false
    for (const node of nodes) {
      if (!(await this.evaluate(node, task, caseSensitive, settings))) {
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
  ): Promise<boolean> {
    // Short-circuit: return true on first true
    for (const node of nodes) {
      if (await this.evaluate(node, task, caseSensitive, settings)) {
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
  ): Promise<boolean> {
    return !(await this.evaluate(node, task, caseSensitive, settings));
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

    // Do not add one day to end date - parseDateValue already makes ranges inclusive

    return DateUtils.isDateInRange(taskDate, rangeStart, rangeEnd);
  }

  /**
   * Evaluate property filter (e.g., [type:Project])
   * @param node Property filter node
   * @param task Task to evaluate
   * @param caseSensitive Whether matching should be case sensitive
   * @param settings Application settings
   * @returns True if task matches the property filter
   */
  private static async evaluatePropertyFilter(
    node: SearchNode,
    task: Task,
    caseSensitive: boolean,
    settings?: TodoTrackerSettings,
  ): Promise<boolean> {
    const field = node.field;
    const value = node.value;

    if (!field || !value) {
      return false;
    }

    // Parse the field and property value from the stored value
    // The parser stores it as "key:propertyValue" format
    let propertyKey: string;
    let propertyValue: string | null;

    if (value.includes(':')) {
      const colonIndex = value.indexOf(':');
      propertyKey = value.slice(0, colonIndex);
      propertyValue = value.slice(colonIndex + 1);
      
      // Handle empty value case [type:]
      if (propertyValue === '') {
        propertyValue = null;
      }
    } else {
      // Key-only case like [type]
      propertyKey = value;
      propertyValue = null;
    }

    // Get the app instance from settings or global
    let app;
    if (settings && (settings as any).app) {
      app = (settings as any).app;
    } else if (typeof window !== 'undefined' && (window as any).todoSeqPlugin) {
      app = (window as any).todoSeqPlugin.app;
    } else {
      // In test environment, return false since we can't access the app
      return false;
    }

    // Get the PropertySearchEngine instance from settings
    let propertySearchEngine: PropertySearchEngine | null = null;
    if (settings && (settings as any).propertySearchEngine) {
      propertySearchEngine = (settings as any).propertySearchEngine;
    } else if (typeof window !== 'undefined' && (window as any).todoSeqPlugin) {
      // Fallback to global plugin instance for backward compatibility
      propertySearchEngine = (window as any).todoSeqPlugin.propertySearchEngine;
    }

    // When exact flag is true (quoted values), force case sensitivity
    const effectiveCaseSensitive = node.exact ? true : caseSensitive;

    // Use PropertySearchEngine for efficient property search
    if (propertySearchEngine) {
      try {
        // Build the query string
        const query = propertyValue !== null ? `[${propertyKey}:${propertyValue}]` : `[${propertyKey}]`;
        
        // Search for files matching the property query
        const matchingFiles = await propertySearchEngine.searchProperties(query);
        
        // Check if the task's file is in the matching files
        return matchingFiles.has(task.path);
      } catch (error) {
        // Fall back to direct metadata access if PropertySearchEngine fails
      }
    }

    // Fall back to direct metadata access
    // Get file cache and frontmatter
    const fileCache = app.metadataCache.getFileCache(task.path);
    if (!fileCache || !fileCache.frontmatter) {
      return false;
    }

    const frontmatter = fileCache.frontmatter;
    
    // Handle key-only searches (e.g., [type] or [type:])
    // But NOT [type:""] which is a search for empty string value
    if (propertyValue === null || (propertyValue === '' && !node.exact)) {
      // Check if property exists (regardless of value)
      if (effectiveCaseSensitive) {
        return Object.prototype.hasOwnProperty.call(frontmatter, propertyKey);
      } else {
        // Case insensitive key search
        const lowerField = propertyKey.toLowerCase();
        return Object.keys(frontmatter).some(key =>
          key.toLowerCase() === lowerField
        );
      }
    }

    // Handle null value search (e.g., [type:null])
    if (propertyValue === 'null') {
      if (effectiveCaseSensitive) {
        return Object.prototype.hasOwnProperty.call(frontmatter, propertyKey) &&
               frontmatter[propertyKey] === null;
      } else {
        // Case insensitive key search for null value
        const lowerField = propertyKey.toLowerCase();
        return Object.keys(frontmatter).some(key => {
          if (key.toLowerCase() === lowerField) {
            return frontmatter[key] === null;
          }
          return false;
        });
      }
    }

    // Get the property value (case sensitive or insensitive key search)
    let actualPropertyValue;
    if (effectiveCaseSensitive) {
      actualPropertyValue = frontmatter[propertyKey];
    } else {
      // Case insensitive key search
      const lowerField = propertyKey.toLowerCase();
      const foundKey = Object.keys(frontmatter).find(key =>
        key.toLowerCase() === lowerField
      );
      actualPropertyValue = foundKey ? frontmatter[foundKey] : undefined;
    }

    if (actualPropertyValue === undefined) {
      return false;
    }

    // Special case: searching for empty string should NOT match null values
    if (propertyValue === '' && actualPropertyValue === null) {
      return false;
    }

    // Handle parentheses in OR expressions first (e.g., [status:(Draft OR Published)])
    if (propertyValue.startsWith('(') && propertyValue.endsWith(')')) {
      const innerValue = propertyValue.slice(1, -1);
      if (innerValue.includes(' OR ')) {
        const orValues = innerValue.split(' OR ').map(v => v.trim());
        return orValues.some(orValue => {
          // Create a temporary node for each OR value with just the value part
          const tempNode = { ...node, value: orValue };
          return this.evaluateSinglePropertyValue(tempNode, actualPropertyValue, effectiveCaseSensitive);
        });
      }
    }

    // Handle OR expressions in the value (e.g., [status:Draft OR Published])
    if (propertyValue.includes(' OR ')) {
      const orValues = propertyValue.split(' OR ').map(v => v.trim());
      return orValues.some(orValue => {
        // Create a temporary node for each OR value with just the value part
        const tempNode = { ...node, value: orValue };
        return this.evaluateSinglePropertyValue(tempNode, actualPropertyValue, effectiveCaseSensitive);
      });
    }

    // Handle single value comparison - create a node with just the property value
    const valueOnlyNode = { ...node, value: propertyValue };
    return this.evaluateSinglePropertyValue(valueOnlyNode, actualPropertyValue, effectiveCaseSensitive);
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

    // Handle comparison operators (e.g., ["size":>100])
    if (exact && typeof value === 'string') {
      const comparisonMatch = value.match(/^([><]=?|==?)\s*(.+)$/);
      if (comparisonMatch) {
        const operator = comparisonMatch[1];
        const compareValue = comparisonMatch[2];
        
        // Only numeric comparisons are supported
        if (typeof propertyValue === 'number' && !isNaN(Number(compareValue))) {
          const numCompareValue = Number(compareValue);
          
          switch (operator) {
            case '>':
              return propertyValue > numCompareValue;
            case '>=':
              return propertyValue >= numCompareValue;
            case '<':
              return propertyValue < numCompareValue;
            case '<=':
              return propertyValue <= numCompareValue;
            case '==':
            case '=':
              return propertyValue === numCompareValue;
            default:
              return false;
          }
        }
        
        // For non-numeric values, comparison operators are not supported
        return false;
      }
    }

    // Handle different property types
    if (Array.isArray(propertyValue)) {
      // For arrays, check if the search value matches any element
      return propertyValue.some(item => {
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
      const propStr = caseSensitive ? propertyValue : propertyValue.toLowerCase();
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
      const propStr = caseSensitive ? String(propertyValue) : String(propertyValue).toLowerCase();
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
    const propStr = caseSensitive ? String(propertyValue) : String(propertyValue).toLowerCase();
    const searchStr = caseSensitive ? value : value.toLowerCase();
    
    if (exact) {
      return propStr === searchStr;
    } else {
      return propStr.includes(searchStr);
    }
  }
}
