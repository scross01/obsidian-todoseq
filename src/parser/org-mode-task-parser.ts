/**
 * Org-mode task parser for TODOseq.
 * Parses tasks from org-mode files using org-mode syntax.
 */

import { Task, DEFAULT_COMPLETED_STATES } from '../types/task';
import { ITaskParser, ParserConfig } from './types';
import { DateParser } from './date-parser';
import { buildTaskKeywords } from '../utils/task-utils';
import {
  calculateTaskUrgency,
  getDefaultCoefficients,
  UrgencyCoefficients,
} from '../utils/task-urgency';
import { getDailyNoteInfo } from '../utils/daily-note-utils';
import { RegexCache } from '../utils/regex-cache';
import {
  buildOrgHeadlineRegex,
  ORG_SCHEDULED_LINE_PATTERN,
  ORG_DEADLINE_LINE_PATTERN,
  ORG_PROPERTIES_START,
  ORG_PROPERTIES_END,
  extractOrgPriority,
  getNestingLevel,
} from '../utils/org-patterns';
import { TFile, App } from 'obsidian';

/**
 * Org-mode task parser.
 * Parses tasks from org-mode files using org-mode headline syntax.
 *
 * Supported org-mode syntax:
 * - Headlines: * TODO, ** DONE, *** IN-PROGRESS, etc.
 * - Priority: [#A], [#B], [#C] or #A, #B, #C
 * - Scheduled: SCHEDULED: <2026-02-12 Thu>
 * - Deadline: DEADLINE: <2026-02-15 Sun>
 * - Properties drawer: :PROPERTIES: ... :END:
 *
 * @example
 * ```typescript
 * const parser = OrgModeTaskParser.create(settings, app);
 * const tasks = parser.parseFile(content, path, file);
 * ```
 */
export class OrgModeTaskParser implements ITaskParser {
  readonly parserId = 'org-mode';
  readonly supportedExtensions = ['.org'];

  private keywords: string[];
  private completedKeywords: Set<string>;
  private urgencyCoefficients: UrgencyCoefficients;
  private regexCache: RegexCache;
  private headlineRegex: RegExp;
  private readonly app: App | null;

  private constructor(
    keywords: string[],
    completedKeywords: Set<string>,
    urgencyCoefficients: UrgencyCoefficients,
    regexCache: RegexCache,
    app: App | null,
  ) {
    this.keywords = keywords;
    this.completedKeywords = completedKeywords;
    this.urgencyCoefficients = urgencyCoefficients;
    this.regexCache = regexCache;
    this.app = app;

    // Build headline regex with all keywords
    this.headlineRegex = buildOrgHeadlineRegex(keywords, regexCache);
  }

  /**
   * Create an OrgModeTaskParser from settings.
   * Uses buildTaskKeywords() to include custom keywords.
   */
  static create(
    additionalKeywords: string[],
    app: App | null,
    urgencyCoefficients?: UrgencyCoefficients,
  ): OrgModeTaskParser {
    // Use buildTaskKeywords to get all keywords (standard + custom)
    const { allKeywords } = buildTaskKeywords(additionalKeywords);

    return new OrgModeTaskParser(
      allKeywords,
      DEFAULT_COMPLETED_STATES,
      urgencyCoefficients ?? getDefaultCoefficients(),
      new RegexCache(),
      app,
    );
  }

  /**
   * Update parser configuration.
   * Called when settings change.
   */
  updateConfig(config: ParserConfig): void {
    this.keywords = config.keywords;
    this.completedKeywords = config.completedKeywords;
    this.urgencyCoefficients = config.urgencyCoefficients;

    // Rebuild headline regex with new keywords
    this.headlineRegex = buildOrgHeadlineRegex(
      config.keywords,
      this.regexCache,
    );
  }

  /**
   * Parse file content and extract tasks.
   */
  parseFile(content: string, path: string, file?: TFile): Task[] {
    const lines = content.split('\n');
    const tasks: Task[] = [];

    for (let index = 0; index < lines.length; index++) {
      const line = lines[index];

      // Skip empty lines
      if (line.trim() === '') {
        continue;
      }

      // Try to parse as org-mode headline task
      const task = this.tryParseHeadlineTask(line, index, path, lines, file);
      if (task) {
        tasks.push(task);
      }
    }

    return tasks;
  }

  /**
   * Parse a single line as a task.
   * Used for editor operations.
   */
  parseLine(line: string, lineNumber: number, filePath: string): Task | null {
    return this.tryParseHeadlineTask(line, lineNumber, filePath, [], undefined);
  }

  /**
   * Check if a line matches org-mode task pattern.
   */
  isTaskLine(line: string): boolean {
    return this.headlineRegex.test(line);
  }

  /**
   * Try to parse a line as an org-mode headline task.
   */
  private tryParseHeadlineTask(
    line: string,
    index: number,
    path: string,
    lines: string[],
    file?: TFile,
  ): Task | null {
    const match = this.headlineRegex.exec(line);
    if (!match) {
      return null;
    }

    // Extract components
    const asterisks = match[1];
    const state = match[2];
    const headlineText = match[3];

    // Calculate nesting level
    const nestingLevel = getNestingLevel(asterisks);

    // Extract priority and clean text
    const { priority, cleanedText } = extractOrgPriority(headlineText);

    // Determine completion status
    const completed = this.completedKeywords.has(state);

    // Detect daily note information
    let isDailyNote = false;
    let dailyNoteDate: Date | null = null;
    const taskFile: TFile | undefined = file;

    if (this.app && file) {
      try {
        const dailyNoteInfo = getDailyNoteInfo(this.app, file);
        isDailyNote = dailyNoteInfo.isDailyNote;
        dailyNoteDate = dailyNoteInfo.dailyNoteDate;
      } catch (error) {
        // If daily note detection fails, continue without it
      }
    }

    // Create task object
    const task: Task = {
      path,
      line: index,
      rawText: line,
      indent: asterisks, // Use asterisks as indent indicator
      listMarker: '', // No list marker in org-mode
      text: cleanedText,
      state,
      completed,
      priority,
      scheduledDate: null,
      deadlineDate: null,
      tail: '',
      urgency: null,
      file: taskFile,
      isDailyNote,
      dailyNoteDate,
      quoteNestingLevel: nestingLevel, // Store nesting level here
    };

    // Extract dates from following lines
    if (lines.length > 0) {
      const { scheduledDate, deadlineDate } = this.extractTaskDates(
        lines,
        index + 1,
      );
      task.scheduledDate = scheduledDate;
      task.deadlineDate = deadlineDate;
    }

    // Calculate urgency for non-completed tasks
    if (!task.completed) {
      task.urgency = calculateTaskUrgency(task, this.urgencyCoefficients);
    }

    return task;
  }

  /**
   * Extract scheduled and deadline dates from lines following a task.
   */
  private extractTaskDates(
    lines: string[],
    startIndex: number,
  ): { scheduledDate: Date | null; deadlineDate: Date | null } {
    let scheduledDate: Date | null = null;
    let deadlineDate: Date | null = null;
    let inPropertiesDrawer = false;

    for (let i = startIndex; i < lines.length; i++) {
      const line = lines[i];

      // Skip empty lines
      if (line.trim() === '') {
        continue;
      }

      // Check for properties drawer
      if (ORG_PROPERTIES_START.test(line)) {
        inPropertiesDrawer = true;
        continue;
      }

      if (ORG_PROPERTIES_END.test(line)) {
        inPropertiesDrawer = false;
        continue;
      }

      // Skip lines inside properties drawer (except for date lines which are outside)
      if (inPropertiesDrawer) {
        continue;
      }

      // Check for next headline (starts with *), stop searching
      if (/^\*/.test(line)) {
        break;
      }

      // Check for scheduled date
      const scheduledMatch = ORG_SCHEDULED_LINE_PATTERN.exec(line);
      if (scheduledMatch && !scheduledDate) {
        const dateContent = scheduledMatch[1];
        const date = this.parseOrgDate(dateContent);
        if (date) {
          scheduledDate = date;
        }
        continue;
      }

      // Check for deadline date
      const deadlineMatch = ORG_DEADLINE_LINE_PATTERN.exec(line);
      if (deadlineMatch && !deadlineDate) {
        const dateContent = deadlineMatch[1];
        const date = this.parseOrgDate(dateContent);
        if (date) {
          deadlineDate = date;
        }
        continue;
      }

      // If we hit a non-empty line that's not a date line, stop
      // (org-mode dates are on separate lines immediately after the headline)
      // But allow for body text - dates should be on the first few lines
      // So we only break if we've already found dates or hit another headline
      if (scheduledDate && deadlineDate) {
        break;
      }
    }

    return { scheduledDate, deadlineDate };
  }

  /**
   * Parse an org-mode date string.
   * Handles both active <...> and inactive [...] dates.
   */
  private parseOrgDate(dateContent: string): Date | null {
    // Org-mode uses <...> for active dates and [...] for inactive dates
    // The DateParser expects <...> format, so convert [...] to <...>
    let normalizedContent = dateContent;

    // Convert [date] to <date> for DateParser compatibility
    if (normalizedContent.startsWith('[') && normalizedContent.endsWith(']')) {
      normalizedContent = '<' + normalizedContent.slice(1, -1) + '>';
    }

    return DateParser.parseDate(normalizedContent);
  }
}
