import { Search } from '../../search/search';

/**
 * Valid sort options for embedded task lists
 */
export type SortOption =
  | 'filepath'
  | 'scheduled'
  | 'deadline'
  | 'priority'
  | 'urgency'
  | 'keyword';

/**
 * Valid completed task display options
 */
export type CompletedOption = 'show' | 'hide' | 'sort-to-end';

/**
 * Valid future task display options
 */
export type FutureOption =
  | 'show-all'
  | 'show-upcoming'
  | 'hide'
  | 'sort-to-end';

/**
 * Parsed parameters from a todoseq code block
 */
export interface TodoseqParameters {
  searchQuery: string;
  sortMethod: SortOption | 'default';
  completed?: CompletedOption;
  future?: FutureOption;
  limit?: number;
  showFile?: boolean;
  title?: string;
  showQuery?: boolean;
  error?: string;
}

/**
 * Parses the content of a todoseq code block to extract search and sort parameters.
 *
 * Example code block:
 * ```
 * todoseq
 * search: tag:project1 AND content:"example"
 * sort: priority
 * completed: hide
 * future: show-all
 * limit: 10
 * ```
 */
export class TodoseqCodeBlockParser {
  /**
   * Parse parameters from code block source content
   * @param source The content of the code block
   * @returns Parsed parameters with validation
   */
  static parse(source: string): TodoseqParameters {
    try {
      const lines = source.split('\n');
      let searchQuery = '';
      let sortMethod: SortOption | 'default' = 'default';
      let completed: CompletedOption | undefined;
      let future: FutureOption | undefined;
      let limit: number | undefined;
      let showFile: boolean | undefined;
      let title: string | undefined;
      let showQuery: boolean | undefined;

      // Parse each line for parameters
      for (const line of lines) {
        const trimmed = line.trim();

        if (trimmed.startsWith('search:')) {
          searchQuery = trimmed.substring('search:'.length).trim();
        } else if (trimmed.startsWith('sort:')) {
          const sortValue = trimmed
            .substring('sort:'.length)
            .trim()
            .toLowerCase();
          // Map old sort values to new ones for backward compatibility
          const sortMap: Record<string, SortOption | 'default'> = {
            default: 'default',
            priority: 'priority',
            due: 'deadline',
            deadline: 'deadline',
            urgency: 'urgency',
            urgent: 'urgency',
            scheduled: 'scheduled',
            filepath: 'filepath',
            file: 'filepath',
            path: 'filepath',
            keyword: 'keyword',
            keywords: 'keyword',
          };
          const mappedSort = sortMap[sortValue];
          if (mappedSort) {
            sortMethod = mappedSort;
          } else {
            throw new Error(
              `Invalid sort method: ${sortValue}. Valid options: filepath, scheduled, deadline, priority, urgency, keyword`,
            );
          }
        } else if (trimmed.startsWith('show-completed:')) {
          const completedValue = trimmed
            .substring('show-completed:'.length)
            .trim()
            .toLowerCase();
          const validCompleted: CompletedOption[] = [
            'show',
            'hide',
            'sort-to-end',
          ];
          if (validCompleted.includes(completedValue as CompletedOption)) {
            completed = completedValue as CompletedOption;
          } else {
            throw new Error(
              `Invalid show-completed option: ${completedValue}. Valid options: show, hide, sort-to-end`,
            );
          }
        } else if (trimmed.startsWith('completed:')) {
          const completedValue = trimmed
            .substring('completed:'.length)
            .trim()
            .toLowerCase();
          const validCompleted: CompletedOption[] = [
            'show',
            'hide',
            'sort-to-end',
          ];
          if (validCompleted.includes(completedValue as CompletedOption)) {
            completed = completedValue as CompletedOption;
          } else {
            throw new Error(
              `Invalid completed option: ${completedValue}. Valid options: show, hide, sort-to-end`,
            );
          }
        } else if (trimmed.startsWith('show-future:')) {
          const futureValue = trimmed
            .substring('show-future:'.length)
            .trim()
            .toLowerCase();
          const validFuture: FutureOption[] = [
            'show-all',
            'show-upcoming',
            'hide',
            'sort-to-end',
          ];
          if (validFuture.includes(futureValue as FutureOption)) {
            future = futureValue as FutureOption;
          } else {
            throw new Error(
              `Invalid show-future option: ${futureValue}. Valid options: show-all, show-upcoming, hide, sort-to-end`,
            );
          }
        } else if (trimmed.startsWith('future:')) {
          const futureValue = trimmed
            .substring('future:'.length)
            .trim()
            .toLowerCase();
          const validFuture: FutureOption[] = [
            'show-all',
            'show-upcoming',
            'hide',
            'sort-to-end',
          ];
          if (validFuture.includes(futureValue as FutureOption)) {
            future = futureValue as FutureOption;
          } else {
            throw new Error(
              `Invalid future option: ${futureValue}. Valid options: show-all, show-upcoming, hide, sort-to-end`,
            );
          }
        } else if (trimmed.startsWith('limit:')) {
          const limitValue = trimmed.substring('limit:'.length).trim();
          const parsedLimit = parseInt(limitValue, 10);
          if (isNaN(parsedLimit) || parsedLimit < 1) {
            throw new Error(
              `Invalid limit value: ${limitValue}. Must be a positive number.`,
            );
          }
          limit = parsedLimit;
        } else if (trimmed.startsWith('show-file:')) {
          const showFileValue = trimmed
            .substring('show-file:'.length)
            .trim()
            .toLowerCase();
          if (showFileValue === 'false' || showFileValue === 'hide') {
            showFile = false;
          } else if (showFileValue === 'true' || showFileValue === 'show') {
            showFile = true;
          } else {
            throw new Error(
              `Invalid show-file option: ${showFileValue}. Valid options: true, false, show, hide`,
            );
          }
        } else if (trimmed.startsWith('title:')) {
          title = trimmed.substring('title:'.length).trim();
        } else if (trimmed.startsWith('show-query:')) {
          const showQueryValue = trimmed
            .substring('show-query:'.length)
            .trim()
            .toLowerCase();
          if (showQueryValue === 'false' || showQueryValue === 'hide') {
            showQuery = false;
          } else if (showQueryValue === 'true' || showQueryValue === 'show') {
            showQuery = true;
          } else {
            throw new Error(
              `Invalid show-query option: ${showQueryValue}. Valid options: true, false, show, hide`,
            );
          }
        }
      }

      // Validate search query syntax
      if (searchQuery) {
        try {
          Search.validate(searchQuery);
        } catch (error) {
          throw new Error(`Invalid search query: ${error.message}`);
        }
      }

      return {
        searchQuery,
        sortMethod,
        completed,
        future,
        limit,
        showFile,
        title,
        showQuery,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return {
        searchQuery: '',
        sortMethod: 'default',
        error: errorMessage,
        showFile: undefined,
        title: undefined,
        showQuery: undefined,
      };
    }
  }

  /**
   * Check if a code block might be affected by changes to a specific file
   * @param source The code block source content
   * @param changedFilePath The path of the file that changed
   * @returns True if the code block might display tasks from the changed file
   */
  static mightAffectCodeBlock(
    source: string,
    changedFilePath: string,
  ): boolean {
    // If no search query, it might show all tasks including from this file
    if (!source.includes('search:')) {
      return true;
    }

    // Parse the search query to check if it references the changed file
    const params = this.parse(source);
    if (params.error) {
      return true; // Be safe and assume it might be affected
    }

    // Check if search query contains file path references
    const searchQuery = params.searchQuery.toLowerCase();
    const filePath = changedFilePath.toLowerCase();

    // Check for file: filter
    if (searchQuery.includes('file:')) {
      return searchQuery.includes(filePath);
    }

    // Check for path: filter
    if (searchQuery.includes('path:')) {
      return searchQuery.includes(filePath);
    }

    // If no file-specific filters, assume it might be affected
    return true;
  }

  /**
   * Extract the sort method from parameters
   * @param params Parsed parameters
   * @returns Sort method string compatible with task-sort utilities
   */
  static getSortMethod(params: TodoseqParameters): string {
    // Map user-friendly sort names to internal sort methods
    const sortMap: Record<string, string> = {
      default: 'default',
      filepath: 'default',
      scheduled: 'sortByScheduled',
      deadline: 'sortByDeadline',
      priority: 'sortByPriority',
      urgency: 'sortByUrgency',
    };

    return sortMap[params.sortMethod] || 'default';
  }

  /**
   * Map completed option to internal completed task setting
   * @param completed The completed option from code block
   * @returns Internal completed task setting value
   */
  static getCompletedSetting(
    completed: CompletedOption | undefined,
  ): 'showAll' | 'sortToEnd' | 'hide' {
    if (!completed) {
      return 'showAll'; // Default to showing all
    }
    const map: Record<CompletedOption, 'showAll' | 'sortToEnd' | 'hide'> = {
      show: 'showAll',
      'sort-to-end': 'sortToEnd',
      hide: 'hide',
    };
    return map[completed];
  }

  /**
   * Map future option to internal future task setting
   * @param future The future option from code block
   * @returns Internal future task setting value
   */
  static getFutureSetting(
    future: FutureOption | undefined,
  ): 'showAll' | 'showUpcoming' | 'sortToEnd' | 'hideFuture' {
    if (!future) {
      return 'showAll'; // Default to showing all
    }
    const map: Record<
      FutureOption,
      'showAll' | 'showUpcoming' | 'sortToEnd' | 'hideFuture'
    > = {
      'show-all': 'showAll',
      'show-upcoming': 'showUpcoming',
      hide: 'hideFuture',
      'sort-to-end': 'sortToEnd',
    };
    return map[future];
  }
}
