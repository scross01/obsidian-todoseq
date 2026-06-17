import { SearchParser } from './search-parser';
import { SearchEvaluator } from './search-evaluator';
import { SearchError, SearchNode } from './search-types';
import { Task } from '../types/task';
import { TodoTrackerSettings } from '../settings/settings-types';
import { PropertySearchEngine } from '../services/property-search-engine';

/**
 * Thin facade over SearchParser and SearchEvaluator.
 *
 * The AST cache lives in SearchParser (alongside parse()), so any
 * repeated parse — even via Search.validate() or Search.getError() —
 * pre-warms the cache transparently. This class is kept as a façade
 * to preserve the public API used by views, dropdowns, and the saved
 * search manager; the cache machinery has moved into SearchParser.
 */
export class Search {
  static parse(query: string): SearchNode {
    return SearchParser.parse(query);
  }

  static async evaluate(
    query: string,
    task: Task,
    caseSensitive = false,
    settings?: TodoTrackerSettings,
    propertySearchEngine?: PropertySearchEngine,
  ): Promise<boolean> {
    try {
      // Route through Search.parse (not SearchParser.parse) so jest.spyOn on
      // Search.parse continues to intercept in tests that inject errors via
      // the parse path. The cache is preserved transparently because
      // Search.parse delegates to the cached SearchParser.parse.
      const ast = Search.parse(query);
      return await SearchEvaluator.evaluate(
        ast,
        task,
        caseSensitive,
        settings,
        propertySearchEngine,
      );
    } catch (error) {
      if (error instanceof SearchError) {
        // If there's a parse error, return false (don't match)
        return false;
      }
      throw error; // Re-throw unexpected errors
    }
  }

  static validate(query: string): boolean {
    return SearchParser.validate(query);
  }

  static getError(query: string): string | null {
    try {
      // See note in evaluate(): route through Search.parse to keep the
      // jest.spyOn(Search, 'parse') test contract intact.
      Search.parse(query);
      return null;
    } catch (error) {
      if (error instanceof SearchError) {
        return error.message;
      }
      return 'Invalid search query';
    }
  }

  static clearCache(): void {
    SearchParser.clearCache();
  }
}
