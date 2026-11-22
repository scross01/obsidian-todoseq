/**
 * Org-mode task parser for TODOseq.
 * Parses tasks from org-mode files using org-mode syntax.
 */

import {
  Task,
  DateRepeatInfo,
  WarningPeriodInfo,
  type TaskPropertyIssue,
} from '../types/task';
import { ITaskParser, ParserConfig } from './types';
import { DateParser } from './date-parser';
import { KeywordManager } from '../utils/keyword-manager';
import {
  calculateTaskUrgency,
  getDefaultCoefficients,
  UrgencyCoefficients,
  UrgencyContext,
} from '../utils/task-urgency';
import { getDailyNoteInfo } from '../utils/daily-note-utils';
import { RegexCache } from '../utils/regex-cache';
import {
  buildOrgHeadlineRegex,
  extractOrgPriority,
  getNestingLevel,
} from '../utils/org-patterns';
import {
  extractTaskProperties,
  isPropertiesDrawerStart,
  readTaskPropertiesDrawer,
  type ParsedTaskProperties,
} from '../utils/task-properties';
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
 * const parser = OrgModeTaskParser.create(keywordManager, app);
 * const tasks = parser.parseFile(content, path, file);
 * ```
 */
export class OrgModeTaskParser implements ITaskParser {
  readonly parserId = 'org-mode';
  readonly supportedExtensions = ['.org'];

  private keywords: string[];
  private keywordManager: KeywordManager;
  private urgencyCoefficients: UrgencyCoefficients;
  private regexCache: RegexCache;
  private headlineRegex: RegExp;
  private readonly app: App;

  private constructor(
    keywords: string[],
    keywordManager: KeywordManager,
    urgencyCoefficients: UrgencyCoefficients,
    regexCache: RegexCache,
    app: App,
  ) {
    this.keywords = keywords;
    this.keywordManager = keywordManager;
    this.urgencyCoefficients = urgencyCoefficients;
    this.regexCache = regexCache;
    this.app = app;

    // Build headline regex with all keywords
    this.headlineRegex = buildOrgHeadlineRegex(keywords, regexCache);
  }

  /**
   * Create an OrgModeTaskParser.
   * @param keywordManager KeywordManager instance (single source of truth for keywords)
   * @param app Obsidian app instance
   * @param urgencyCoefficients Optional urgency coefficients
   */
  static create(
    keywordManager: KeywordManager,
    app: App,
    urgencyCoefficients?: UrgencyCoefficients,
  ): OrgModeTaskParser {
    const keywords = keywordManager.getAllKeywords();

    return new OrgModeTaskParser(
      keywords,
      keywordManager,
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
    if (config.keywordManager) {
      this.keywordManager = config.keywordManager;
    }

    // Use keywords from config if provided, otherwise from KeywordManager
    // This allows dynamic keyword updates while maintaining shared KeywordManager
    this.keywords = config.keywords ?? this.keywordManager.getAllKeywords();

    // Rebuild headline regex with new keywords
    this.headlineRegex = buildOrgHeadlineRegex(this.keywords, this.regexCache);

    this.urgencyCoefficients = config.urgencyCoefficients;
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
   * Fast-path check to determine if the string even contains known syntax keywords.
   * If false, the file is guaranteed to have no parseable tasks, skipping regex overhead.
   */
  hasAnyKeyword(content: string): boolean {
    for (let i = 0; i < this.keywords.length; i++) {
      if (content.includes(this.keywords[i])) {
        return true;
      }
    }
    return false;
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
    const completed = this.keywordManager.isCompleted(state);

    // Detect daily note information
    let isDailyNote = false;
    let dailyNoteDate: Date | null = null;

    if (this.app && file) {
      try {
        const dailyNoteInfo = getDailyNoteInfo(this.app, file);
        isDailyNote = dailyNoteInfo.isDailyNote;
        dailyNoteDate = dailyNoteInfo.dailyNoteDate;
      } catch {
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
      scheduledDateRepeat: null,
      deadlineDate: null,
      deadlineDateRepeat: null,
      closedDate: null,
      startedDate: null,
      scheduledWarningPeriod: null,
      deadlineWarningPeriod: null,

      tail: '',
      urgency: null,
      file,
      isDailyNote,
      dailyNoteDate,
      quoteNestingLevel: nestingLevel, // Store nesting level here
      sourceFormat: 'org',
      subtaskCount: 0,
      subtaskCompletedCount: 0,
    };

    // Extract dates from following lines
    if (lines.length > 0) {
      const {
        scheduledDate,
        deadlineDate,
        scheduledDateRepeat,
        deadlineDateRepeat,
        scheduledWarningPeriod,
        deadlineWarningPeriod,
        closedDate,
        startedDate,
        propertyInfo,
      } = this.extractTaskDates(lines, index + 1);
      task.scheduledDate = scheduledDate;
      task.scheduledDateRepeat = scheduledDateRepeat;
      task.deadlineDate = deadlineDate;
      task.deadlineDateRepeat = deadlineDateRepeat;
      task.scheduledWarningPeriod = scheduledWarningPeriod;
      task.deadlineWarningPeriod = deadlineWarningPeriod;
      task.closedDate = closedDate;
      task.startedDate = startedDate;
      if (propertyInfo) {
        this.applyParsedProperties(task, propertyInfo);
      }
    }

    // Calculate urgency for non-completed tasks
    if (!task.completed) {
      const urgencyContext: UrgencyContext = {
        activeKeywordsSet: this.keywordManager.getActiveSet(),
        waitingKeywordsSet: this.keywordManager.getWaitingSet(),
      };
      task.urgency = calculateTaskUrgency(
        task,
        this.urgencyCoefficients,
        urgencyContext,
      );
    }

    return task;
  }

  /**
   * Extract scheduled and deadline dates from lines following a task.
   */
  private extractTaskDates(
    lines: string[],
    startIndex: number,
  ): {
    scheduledDate: Date | null;
    deadlineDate: Date | null;
    scheduledDateRepeat: DateRepeatInfo | null;
    deadlineDateRepeat: DateRepeatInfo | null;
    scheduledWarningPeriod: WarningPeriodInfo | null;
    deadlineWarningPeriod: WarningPeriodInfo | null;
    closedDate: Date | null;
    startedDate: Date | null;
    propertyInfo: ParsedTaskProperties | null;
  } {
    let scheduledDate: Date | null = null;
    let scheduledDateRepeat: DateRepeatInfo | null = null;
    let deadlineDate: Date | null = null;
    let deadlineDateRepeat: DateRepeatInfo | null = null;
    let scheduledWarningPeriod: WarningPeriodInfo | null = null;
    let deadlineWarningPeriod: WarningPeriodInfo | null = null;
    let closedDate: Date | null = null;
    let startedDate: Date | null = null;
    let propertyInfo: ParsedTaskProperties | null = null;
    let seenBody = false;

    for (let i = startIndex; i < lines.length; i++) {
      const line = lines[i];

      // Skip empty lines
      if (line.trim() === '') {
        continue;
      }

      // Check for next headline (starts with *), stop searching. This must
      // happen before drawer handling so an unclosed drawer cannot absorb the
      // next entry.
      if (/^\*/.test(line)) {
        break;
      }

      if (isPropertiesDrawerStart(line, 'org')) {
        const drawer = readTaskPropertiesDrawer(lines, i, 'org', {
          isBoundary: (candidate) => /^\*/.test(candidate),
        });
        if (drawer) {
          if (!seenBody && !propertyInfo) {
            propertyInfo = extractTaskProperties(drawer, 'org');
            if (!drawer.closed) {
              console.debug(
                `Unclosed properties drawer at line ${drawer.startLine + 1}.`,
              );
            }
          } else if (!seenBody && propertyInfo) {
            const existingProperties: ParsedTaskProperties = propertyInfo;
            const issues: TaskPropertyIssue[] = [
              ...(existingProperties.propertyIssues ?? []),
              {
                code: 'duplicate-drawer',
                line: i,
                message: 'A second properties drawer is ignored.',
              },
            ];
            propertyInfo = { ...existingProperties, propertyIssues: issues };
          }
          i = drawer.endLine;
          if (!drawer.closed) break;
          continue;
        }
      }

      // A drawer after body text is preserved but does not attach as entry
      // properties. Skip it without consuming the following headline.
      if (isPropertiesDrawerStart(line, 'org')) {
        const drawer = readTaskPropertiesDrawer(lines, i, 'org', {
          isBoundary: (candidate) => /^\*/.test(candidate),
        });
        if (drawer) {
          i = drawer.endLine;
          if (!drawer.closed) break;
          continue;
        }
      }

      // Planning metadata can share one line. Read both timestamps before
      // continuing so a combined line does not hide DEADLINE.
      const scheduledMatch = !scheduledDate
        ? /(?:^|\s)SCHEDULED:\s*(<[^>]+>|\[[^\]]+\])/.exec(line)
        : null;
      if (scheduledMatch) {
        const { date, repeat, warningPeriod } = this.parseOrgDateWithRepeater(
          scheduledMatch[1],
        );
        if (date) {
          scheduledDate = date;
          scheduledDateRepeat = repeat;
          scheduledWarningPeriod = warningPeriod;
        }
      }

      const deadlineMatch = !deadlineDate
        ? /(?:^|\s)DEADLINE:\s*(<[^>]+>|\[[^\]]+\])/.exec(line)
        : null;
      if (deadlineMatch) {
        const { date, repeat, warningPeriod } = this.parseOrgDateWithRepeater(
          deadlineMatch[1],
        );
        if (date) {
          deadlineDate = date;
          deadlineDateRepeat = repeat;
          deadlineWarningPeriod = warningPeriod;
        }
      }
      if (scheduledMatch || deadlineMatch) continue;

      // History lines use inactive brackets and may sit below the planning
      // dates, so keep scanning until the next headline rather than stopping
      // once scheduled and deadline are known.
      const closedMatch = /^\s*CLOSED:\s*(.+)$/.exec(line);
      if (closedMatch && !closedDate) {
        closedDate = this.parseOrgDateWithRepeater(closedMatch[1]).date;
        continue;
      }

      const startedMatch = /^\s*STARTED:\s*(.+)$/.exec(line);
      if (startedMatch && !startedDate) {
        startedDate = this.parseOrgDateWithRepeater(startedMatch[1]).date;
        continue;
      }

      seenBody = true;
    }

    return {
      scheduledDate,
      deadlineDate,
      scheduledDateRepeat,
      deadlineDateRepeat,
      scheduledWarningPeriod,
      deadlineWarningPeriod,
      closedDate,
      startedDate,
      propertyInfo,
    };
  }

  private applyParsedProperties(
    task: Task,
    parsed: ParsedTaskProperties,
  ): void {
    if (parsed.properties) task.properties = parsed.properties;
    if (parsed.id !== undefined) task.id = parsed.id;
    if (parsed.blockedBy !== undefined) task.blockedBy = parsed.blockedBy;
    if (parsed.archivedBlockers !== undefined) {
      task.archivedBlockers = parsed.archivedBlockers;
    }
    if (parsed.propertyIssues?.length) {
      task.propertyIssues = parsed.propertyIssues;
    }
  }

  /**
   * Parse an org-mode date string with repeater support.
   * Handles both active <...> and inactive [...] dates.
   */
  private parseOrgDateWithRepeater(dateContent: string): {
    date: Date | null;
    repeat: DateRepeatInfo | null;
    warningPeriod: WarningPeriodInfo | null;
  } {
    // Org-mode uses <...> for active dates and [...] for inactive dates
    // The DateParser expects <...> format, so convert [...] to <...>
    let normalizedContent = dateContent;

    // Convert [date] to <date> for DateParser compatibility
    if (normalizedContent.startsWith('[') && normalizedContent.endsWith(']')) {
      normalizedContent = '<' + normalizedContent.slice(1, -1) + '>';
    }

    return DateParser.parseDateWithRepeater(normalizedContent);
  }
}
