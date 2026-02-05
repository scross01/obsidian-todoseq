import { SearchParser } from './search-parser';
import { SearchEvaluator } from './search-evaluator';
import { SearchNode, SearchError } from './search-types';
import { Task } from '../types/task';
import { TodoTrackerSettings } from '../settings/settings';

export class Search {
  static parse(query: string): SearchNode {
    return SearchParser.parse(query);
  }

  static async evaluate(
    query: string,
    task: Task,
    caseSensitive = false,
    settings?: TodoTrackerSettings,
  ): Promise<boolean> {
    try {
      const ast = this.parse(query);
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
