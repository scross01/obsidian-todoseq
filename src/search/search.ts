import { SearchParser } from './search-parser';
import { SearchEvaluator } from './search-evaluator';
import { SearchNode, SearchError } from './search-types';
import { Task } from '../types/task';
import { TodoTrackerSettings } from '../settings/settings-types';

export class Search {
  // Cache for parsed search query ASTs
  private static astCache = new Map<string, SearchNode>();
  private static readonly AST_CACHE_MAX_SIZE = 50;

  static parse(query: string): SearchNode {
    return SearchParser.parse(query);
  }

  /**
   * Get cached AST or parse and cache it
   */
  private static getCachedAst(query: string): SearchNode {
    const cached = this.astCache.get(query);
    if (cached) {
      return cached;
    }

    // Parse and cache
    const ast = this.parse(query);

    // Prevent unbounded cache growth
    if (this.astCache.size >= this.AST_CACHE_MAX_SIZE) {
      // Clear oldest entry (first key in map)
      const iterator = this.astCache.keys();
      const firstResult = iterator.next();
      if (!firstResult.done && firstResult.value) {
        this.astCache.delete(firstResult.value);
      }
    }

    this.astCache.set(query, ast);
    return ast;
  }

  /**
   * Clear the AST cache
   */
  static clearCache(): void {
    this.astCache.clear();
  }

  static async evaluate(
    query: string,
    task: Task,
    caseSensitive = false,
    settings?: TodoTrackerSettings,
  ): Promise<boolean> {
    try {
      const ast = this.getCachedAst(query);
      return await SearchEvaluator.evaluate(ast, task, caseSensitive, settings);
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
      this.parse(query);
      return null;
    } catch (error) {
      if (error instanceof SearchError) {
        return error.message;
      }
      return 'Invalid search query';
    }
  }
}
