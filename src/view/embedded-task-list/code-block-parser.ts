import { Search } from '../../search/search';

/**
 * Parsed parameters from a todoseq code block
 */
export interface TodoseqParameters {
  searchQuery: string;
  sortMethod: string;
  error?: string;
}

/**
 * Parses the content of a todoseq code block to extract search and sort parameters.
 *
 * Example code block:
 * ```
 * todoseq
 * search: tag:project1 AND content:"example"
 * sort: Priority
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
      let sortMethod = 'default';

      // Parse each line for parameters
      for (const line of lines) {
        const trimmed = line.trim();

        if (trimmed.startsWith('search:')) {
          searchQuery = trimmed.substring('search:'.length).trim();
        } else if (trimmed.startsWith('sort:')) {
          sortMethod = trimmed.substring('sort:'.length).trim();
        }
      }

      // Validate sort method
      const validSortMethods = ['default', 'Priority', 'Due', 'Urgency'];
      if (!validSortMethods.includes(sortMethod)) {
        throw new Error(
          `Invalid sort method: ${sortMethod}. Valid options: ${validSortMethods.join(', ')}`,
        );
      }

      // Validate search query syntax
      if (searchQuery) {
        try {
          Search.validate(searchQuery);
        } catch (error) {
          throw new Error(`Invalid search query: ${error.message}`);
        }
      }

      return { searchQuery, sortMethod };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return {
        searchQuery: '',
        sortMethod: 'default',
        error: errorMessage,
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
      Priority: 'sortByPriority',
      Due: 'sortByDeadline',
      Urgency: 'sortByUrgency',
    };

    return sortMap[params.sortMethod] || 'default';
  }
}
