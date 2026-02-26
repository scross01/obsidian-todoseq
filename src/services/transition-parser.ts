import { KeywordManager } from '../utils/keyword-manager';

export interface TransitionError {
  line: string;
  message: string;
  type: 'invalid-keyword' | 'conflict' | 'syntax-error';
}

export interface ParsedTransitionResult {
  transitions: Map<string, string>;
  errors: TransitionError[];
}

interface ParseResult {
  transitions: [string, string][];
  error?: TransitionError;
}

/**
 * Parser for declarative state transition syntax.
 *
 * Supported syntax:
 * - Simple chain: STATE -> NEXT_STATE -> NEXT_STATE
 * - Group alternative: (STATE1 | STATE2 | STATE3) -> NEXT_STATE
 * - Terminal state: STATE -> [FINAL_STATE] or STATE -> FINAL_STATE -> FINAL_STATE
 *
 * Examples:
 * - TODO -> DOING -> DONE
 * - (WAIT | WAITING) -> IN-PROGRESS
 * - TODO -> [DONE] (equivalent to TODO -> DONE -> DONE)
 */
export class TransitionParser {
  constructor(private keywordManager: KeywordManager) {}

  /**
   * Parse all transition statements and return the result.
   */
  parse(statements: string[]): ParsedTransitionResult {
    const transitions = new Map<string, string>();
    const errors: TransitionError[] = [];

    for (const statement of statements) {
      const result = this.parseStatement(statement);
      if (result.error) {
        errors.push(result.error);
      } else {
        // Check for conflicts
        for (const [source, target] of result.transitions) {
          if (transitions.has(source)) {
            errors.push({
              line: statement,
              message: `State '${source}' already has a next state`,
              type: 'conflict',
            });
          } else {
            transitions.set(source, target);
          }
        }
      }
    }

    return { transitions, errors };
  }

  /**
   * Parse a single transition statement.
   */
  private parseStatement(statement: string): ParseResult {
    const trimmed = statement.trim();

    // Skip empty lines
    if (trimmed.length === 0) {
      return { transitions: [] };
    }

    // Check for terminal state shorthand: STATE -> [FINAL]
    const terminalMatch = trimmed.match(/^(\S+)\s*->\s*\[(\S+)\]$/);
    if (terminalMatch) {
      const source = this.normalizeKeyword(terminalMatch[1]);
      const target = this.normalizeKeyword(terminalMatch[2]);

      const validationError = this.validateKeywords([source, target]);
      if (validationError) {
        return { transitions: [], error: validationError };
      }

      // Terminal state: target transitions to itself
      return {
        transitions: [
          [source, target],
          [target, target], // Self-transition for terminal state
        ],
      };
    }

    // Parse chain: A -> B -> C or (A | B) -> C
    const parts = trimmed.split('->').map((p) => p.trim());

    if (parts.length < 2) {
      return {
        transitions: [],
        error: {
          line: statement,
          message: 'Invalid syntax: expected at least one -> operator',
          type: 'syntax-error',
        },
      };
    }

    const transitions: [string, string][] = [];

    // Check for terminal state shorthand: STATE -> [FINAL]
    if (
      parts.length === 2 &&
      parts[1].startsWith('[') &&
      parts[1].endsWith(']')
    ) {
      const sourceKeywords = this.parseKeywords(parts[0]);
      const targetKeyword = this.normalizeKeyword(parts[1].slice(1, -1).trim());

      const sourceValidationError = this.validateKeywords(sourceKeywords);
      if (sourceValidationError) {
        return { transitions: [], error: sourceValidationError };
      }

      const targetValidationError = this.validateKeywords([targetKeyword]);
      if (targetValidationError) {
        return { transitions: [], error: targetValidationError };
      }

      // Create transitions from each source to target
      for (const source of sourceKeywords) {
        transitions.push([source, targetKeyword]);
        // Terminal state: target transitions to itself
        transitions.push([targetKeyword, targetKeyword]);
      }

      return { transitions };
    }

    // Handle chain: A -> B -> C
    for (let i = 0; i < parts.length - 1; i++) {
      const sourceKeywords = this.parseKeywords(parts[i]);
      const targetKeywords = this.parseKeywords(parts[i + 1]);

      const sourceValidationError = this.validateKeywords(sourceKeywords);
      if (sourceValidationError) {
        return { transitions: [], error: sourceValidationError };
      }

      const targetValidationError = this.validateKeywords(targetKeywords);
      if (targetValidationError) {
        return { transitions: [], error: targetValidationError };
      }

      // For group alternatives, create transitions from each source to each target
      for (const source of sourceKeywords) {
        for (const target of targetKeywords) {
          transitions.push([source, target]);
        }
      }
    }

    return { transitions };
  }

  /**
   * Parse keywords from a part, handling group alternatives.
   * Examples:
   * - "TODO" -> ["TODO"]
   * - "(TODO | LATER)" -> ["TODO", "LATER"]
   */
  private parseKeywords(part: string): string[] {
    const trimmed = part.trim();

    // Check for group alternative: (A | B | C)
    const groupMatch = trimmed.match(/^\((.+)\)$/);
    if (groupMatch) {
      return groupMatch[1]
        .split('|')
        .map((k) => this.normalizeKeyword(k.trim()));
    }

    // Single keyword
    return [this.normalizeKeyword(trimmed)];
  }

  /**
   * Validate that all keywords exist in the effective keyword set.
   */
  private validateKeywords(keywords: string[]): TransitionError | null {
    const allKeywords = this.keywordManager.getAllKeywords();

    for (const keyword of keywords) {
      if (!allKeywords.includes(keyword)) {
        return {
          line: keyword,
          message: `Keyword '${keyword}' not found in any keyword group (removed by user)`,
          type: 'invalid-keyword',
        };
      }
    }

    return null;
  }

  /**
   * Normalize a keyword to uppercase.
   */
  private normalizeKeyword(keyword: string): string {
    return keyword.toUpperCase();
  }

  /**
   * Check if a state is a terminal state (transitions to itself).
   */
  static isTerminalState(
    state: string,
    transitions: Map<string, string>,
  ): boolean {
    const nextState = transitions.get(state);
    return nextState === state;
  }
}
