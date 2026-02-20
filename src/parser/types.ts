/**
 * Parser type definitions for the TODOseq plugin.
 * Provides interfaces for implementing multiple file format parsers.
 */

import { Task } from '../types/task';
import { TFile } from 'obsidian';
import { UrgencyCoefficients } from '../utils/task-urgency';

/**
 * Parser configuration passed from settings.
 * Contains all configuration needed for task parsing.
 */
export interface ParserConfig {
  /** All task keywords (TODO, DONE, etc. + custom keywords from settings) */
  keywords: string[];

  /** Keywords that indicate completion (DONE, CANCELED, etc.) */
  completedKeywords: string[];

  /** Keywords that indicate active state (DOING, NOW, etc.) */
  activeKeywords?: string[];

  /** Keywords that indicate waiting state (WAIT, WAITING, etc.) */
  waitingKeywords?: string[];

  /** Urgency coefficients for task scoring */
  urgencyCoefficients: UrgencyCoefficients;

  /** Whether to include tasks inside callout blocks */
  includeCalloutBlocks?: boolean;

  /** Whether to include tasks inside code blocks */
  includeCodeBlocks?: boolean;

  /** Whether to include tasks inside comment blocks */
  includeCommentBlocks?: boolean;

  /** Language comment support settings */
  languageCommentSupport?: {
    enabled: boolean;
  };
}

/**
 * Common interface for all task parsers.
 * Implement this interface to add support for new file formats.
 *
 * @example
 * ```typescript
 * class OrgModeTaskParser implements ITaskParser {
 *   readonly parserId = 'org-mode';
 *   readonly supportedExtensions = ['.org'];
 *
 *   parseFile(content: string, path: string, file?: TFile): Task[] {
 *     // Implementation
 *   }
 *   // ... other methods
 * }
 * ```
 */
export interface ITaskParser {
  /**
   * Unique identifier for this parser type.
   * Used for registration and debugging.
   */
  readonly parserId: string;

  /**
   * File extensions this parser handles (with leading dot, lowercase).
   * Example: ['.md'], ['.org']
   */
  readonly supportedExtensions: string[];

  /**
   * Parse file content and extract tasks.
   *
   * @param content File content as string
   * @param path File path in vault
   * @param file Optional TFile reference for daily note detection
   * @returns Array of parsed tasks
   */
  parseFile(content: string, path: string, file?: TFile): Task[];

  /**
   * Parse a single line as a task.
   * Used for editor operations like task state cycling.
   *
   * @param line Single line to parse
   * @param lineNumber Line number in file (0-indexed)
   * @param filePath File path
   * @returns Parsed task or null if not a task
   */
  parseLine(line: string, lineNumber: number, filePath: string): Task | null;

  /**
   * Check if a line matches task pattern.
   * Quick detection without full parsing.
   *
   * @param line Line to check
   * @returns true if line appears to be a task
   */
  isTaskLine(line: string): boolean;

  /**
   * Update parser configuration.
   * Called when settings change.
   *
   * @param config New configuration
   */
  updateConfig(config: ParserConfig): void;
}
