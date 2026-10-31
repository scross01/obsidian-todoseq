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

  /**
   * Bulk task filter — the per-keystroke shape used by the Task List,
   * embedded dashboards, and embedded task lists.
   *
   * The per-row `evaluate` + `Promise.all` deployment costs a Promise per
   * node per task plus two wrapper allocations per row for list-sized N;
   * this filters in a single pass. The only genuine await boundary in the
   * evaluator is the property engine — whose result depends on the query,
   * not the row — so its resolutions are hoisted out of the loop and
   * pre-computed once per batch (defer-await pattern; parity pinned by
   * tests/search-bulk.test.ts).
   *
   * Error contract matches `evaluate` over every row:
   *   - SearchError (invalid query) → [] (no row matches),
   *   - non-SearchError → rethrown, so callers keep their own fallbacks.
   * A blank query returns the input array unchanged (call sites pre-guard).
   */
  static async filterTasks(
    tasks: Task[],
    query: string,
    caseSensitive = false,
    settings?: TodoTrackerSettings,
    propertySearchEngine?: PropertySearchEngine,
  ): Promise<Task[]> {
    if (!query.trim()) return tasks;
    try {
      // Route through Search.parse (not SearchParser.parse) — see evaluate():
      // the jest.spyOn(Search, 'parse') error-injection contract stays intact.
      const ast = Search.parse(query);
      const resolutions = SearchEvaluator.collectEngineResolutions(
        ast,
        caseSensitive,
      );
      let engineFiles: Map<string, Set<string> | null> | undefined;
      if (resolutions.length > 0 && propertySearchEngine) {
        engineFiles = new Map();
        // Batch-level await boundary: one resolution per unique filter,
        // shared by every row on the pass below.
        for (const resolution of resolutions) {
          engineFiles.set(
            resolution.key,
            await SearchEvaluator.resolveEngineFiles(
              resolution.query,
              resolution.effectiveCaseSensitive,
              propertySearchEngine,
            ),
          );
        }
      }
      return SearchEvaluator.filterTasksByNode(
        ast,
        tasks,
        caseSensitive,
        settings,
        engineFiles,
      );
    } catch (error) {
      if (error instanceof SearchError) {
        return [];
      }
      throw error; // Re-throw unexpected errors
    }
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
