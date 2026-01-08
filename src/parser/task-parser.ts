import {
  Task,
  DEFAULT_COMPLETED_STATES,
  DEFAULT_PENDING_STATES,
  DEFAULT_ACTIVE_STATES,
} from '../task';
import { TodoTrackerSettings } from '../settings/settings';
import {
  LanguageRegistry,
  LanguageDefinition,
  LanguageCommentSupportSettings,
} from './language-registry';
import { DateParser } from './date-parser';
import { extractPriority, CHECKBOX_REGEX } from '../utils/task-utils';

type RegexPair = { test: RegExp; capture: RegExp };

// List marker patterns
// Bullet points: matches -, *, or + characters
const BULLET_LIST_PATTERN = /[-*+]\s+/.source;
// Numbered lists: matches digits followed by . or ) (e.g., "1.", "2)", "12.")
const NUMBERED_LIST_PATTERN = /\d+[.)]\s+/.source;
// Letter lists: matches letters followed by . or ) (e.g., "a.", "B)")
const LETTER_LIST_PATTERN = /[A-Za-z][.)]\s+/.source;
// Custom lists: matches parentheses-enclosed alphanumeric identifiers (e.g., "(A1)", "(A2)")
const CUSTOM_LIST_PATTERN = /\([A-Za-z0-9]+\)\s+/.source;

// Checkboxes: [ ] (unchecked), [x] (checked) or [*] (other checkbox states)
const CHECKBOX = /\[[ x\S]\]\s+/.source;

// Leading spaces only
const STANDARD_PREFIX = /\s*/.source;
// Quoted lines with leading ">"
const QUOTED_PREFIX = /\s*>\s*/.source;
// Callout block declaration, e.g. "> [!info]"
const CALLOUT_PREFIX = /\s*>\s*\[!\w+\]-?\s+/.source;

// Code block marker ``` or ~~~ with language
const CODE_BLOCK_REGEX = /^\s*(```|~~~)\s*(\S+)?$/;
// Math block marker $$
const MATH_BLOCK_REGEX = /^\s*\$\$(?!.*\$\$).*/; // ignores open and close on same line
// Comment block marker %%
export const COMMENT_BLOCK_REGEX = /^\s*%%.*%%$|^\s*%%(?!.*%%).*/; // matches both single-line and multi-line comment blocks
// Callout block marker >
const CALLOUT_BLOCK_REGEX = /^\s*>.*/;
// Footnote definition marker
const FOOTNOTE_DEFINITION_REGEX = /^\[\^\d+\]:\s*/;

// Language code before comment - non greedy
const CODE_PREFIX = /\s*[\s\S]*?/.source;

const TASK_TEXT = /[\S][\s\S]*?/.source; // at least one non-whitespace character, then any characters

export class TaskParser {
  private readonly includeCalloutBlocks: boolean;
  private readonly includeCodeBlocks: boolean;
  private readonly includeCommentBlocks: boolean;
  private readonly languageCommentSupport: LanguageCommentSupportSettings;
  private readonly customKeywords: string[];
  public allKeywords: string[];

  // Public access to regex patterns for editor commands
  public readonly testRegex: RegExp;
  public readonly captureRegex: RegExp;

  // Language support components (lazy-loaded)
  private languageRegistry: LanguageRegistry | null = null;

  // Language state tracking
  private currentLanguage: LanguageDefinition | null = null;

  private constructor(
    regex: RegexPair,
    includeCalloutBlocks: boolean,
    includeCodeBlocks: boolean,
    includeCommentBlocks: boolean,
    languageCommentSupport: LanguageCommentSupportSettings,
    customKeywords: string[],
    allKeywords: string[]
  ) {
    this.customKeywords = customKeywords;
    this.allKeywords = allKeywords;

    this.testRegex = regex.test;
    this.captureRegex = regex.capture;

    this.includeCalloutBlocks = includeCalloutBlocks;
    this.includeCodeBlocks = includeCodeBlocks;
    this.includeCommentBlocks = includeCommentBlocks;
    this.languageCommentSupport = languageCommentSupport;
  }

  static create(settings: TodoTrackerSettings): TaskParser {
    // Build union of non-completed states (defaults + user additional) and completed states (defaults only)
    const additional: string[] = Array.isArray(settings.additionalTaskKeywords)
      ? (settings.additionalTaskKeywords as string[])
      : [];

    // Ensure values are strings and already capitalised by settings UI; filter out empties defensively
    const normalizedAdditional: string[] = additional
      .filter((k): k is string => typeof k === 'string')
      .map((k) => k.trim())
      .filter((k) => k.length > 0);

    // Validate user-provided keywords to prevent regex injection vulnerabilities
    if (normalizedAdditional.length > 0) {
      TaskParser.validateKeywords(normalizedAdditional);
    }

    const nonCompletedArray: string[] = [
      ...Array.from(DEFAULT_PENDING_STATES),
      ...Array.from(DEFAULT_ACTIVE_STATES),
      ...normalizedAdditional,
    ];
    const nonCompleted = new Set<string>(nonCompletedArray);

    const allKeywordsArray: string[] = [
      ...Array.from(nonCompleted),
      ...Array.from(DEFAULT_COMPLETED_STATES),
    ];

    const regex = TaskParser.buildRegex(allKeywordsArray);
    return new TaskParser(
      regex,
      settings.includeCalloutBlocks,
      settings.includeCodeBlocks,
      settings.includeCommentBlocks,
      settings.languageCommentSupport,
      normalizedAdditional,
      allKeywordsArray
    );
  }

  /**
   * Validate that keywords don't contain dangerous regex patterns
   * that could cause catastrophic backtracking or other issues
   * @param keywords Array of keywords to validate
   * @throws Error if any keyword contains dangerous patterns
   */
  public static validateKeywords(keywords: string[]): void {
    // Patterns that could cause catastrophic backtracking or other regex issues
    const dangerousPatterns = [
      // Nested quantifiers (can cause exponential backtracking)
      /\*.*\*/, // * followed by *
      /\+.*\+/, // + followed by +
      /\?.*\?/, // ? followed by ?

      // Repeated quantifiers (3 or more - allow single * as it gets escaped)
      /\*\*\*+/, // ***, ****, etc. (but allow single *)
      /\+\+\++/, // +++, ++++, etc. (but allow single +)
      /\?\?\?+/, // ???, ????, etc. (but allow single ?)

      // Very long repetitions that could cause performance issues
      /\*\{10,\}/, // *{10,} - excessive repetition
      /\+\{10,\}/, // +{10,} - excessive repetition
      /\?\{10,\}/, // ?{10,} - excessive repetition

      // Backreferences (complex and potentially dangerous)
      /\([^)]*\)[^)]*\\\d+/,

      // Lookaheads/lookbehinds (complex and potentially dangerous)
      /\(?=/, // (?= positive lookahead
      /\(?!/, // (?! negative lookahead
      /\(?<=/, // (?<= positive lookbehind
      /\(?<!/, // (?<! negative lookbehind

      // Very long keywords (performance concern)
      /^.{50,}$/, // keywords longer than 50 characters
    ];

    for (const keyword of keywords) {
      for (const pattern of dangerousPatterns) {
        if (pattern.test(keyword)) {
          throw new Error(
            `Invalid task keyword "${keyword}": contains dangerous regex pattern. ` +
              `Keywords should be simple words without complex regex syntax.`
          );
        }
      }

      // Additional validation: keywords should be reasonable task identifiers
      if (keyword.length === 0) {
        throw new Error(`Invalid task keyword: empty keyword not allowed`);
      }

      if (/^\s+$/.test(keyword)) {
        throw new Error(
          `Invalid task keyword "${keyword}": whitespace-only keywords not allowed`
        );
      }
    }
  }

  /**
   * Escape keywords for use in regex patterns
   * @param keywords Array of keywords to escape
   * @returns Escaped keywords joined with OR operator
   */
  private static escapeKeywords(keywords: string[]): string {
    return keywords
      .map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('|');
  }

  /**
   * Build regex patterns with customizable components
   * @param keywords Array of task keywords
   * @returns RegexPair for testing and capturing tasks
   */
  private static buildRegex(keywords: string[]): RegexPair {
    const escaped_keywords = TaskParser.escapeKeywords(keywords);

    const test = new RegExp(
      `^(${STANDARD_PREFIX}|${QUOTED_PREFIX}|${CALLOUT_PREFIX})?` +
        `(${BULLET_LIST_PATTERN}|${NUMBERED_LIST_PATTERN}|${LETTER_LIST_PATTERN}|${CUSTOM_LIST_PATTERN})??` +
        `(${CHECKBOX})?` +
        `(${escaped_keywords})\\s+` +
        `(${TASK_TEXT})$`
    );
    const capture = test;
    return { test, capture };
  }

  /**
   * Build footnote regex patterns for footnote task detection
   * @param keywords Array of task keywords
   * @returns RegexPair for testing and capturing footnote tasks
   */
  private static buildFootnoteRegex(keywords: string[]): RegexPair {
    const escapedKeywords = TaskParser.escapeKeywords(keywords);

    // Footnote pattern: [^1]: TODO task text
    const footnotePattern = `\\[\\^\\d+\\]:\\s+`;

    const test = new RegExp(
      `^${footnotePattern}` + `(${escapedKeywords})\\s+` + `(${TASK_TEXT})$`
    );
    const capture = test;
    return { test, capture };
  }

  /**
   * Build code language regex patterns with customizable components
   * @param keywords Array of task keywords
   * @param languageDefinition Language specific config
   * @returns RegexPair for testing and capturing tasks
   */
  public static buildCodeRegex(
    keywords: string[],
    languageDefinition: LanguageDefinition
  ): RegexPair {
    const escapedKeywords = TaskParser.escapeKeywords(keywords);

    // starts with mutliline or singleline
    const startComment = [
      languageDefinition.patterns.singleLine?.source,
      languageDefinition.patterns.multiLineStart?.source,
    ]
      .filter(Boolean)
      .join('|');
    const midComment =
      languageDefinition.patterns.multilineMid?.source || '.*?';
    const endComment =
      `\\s+${languageDefinition.patterns.multiLineEnd?.source}\\s*` || '';

    const test = new RegExp(
      `^((?:(?:${CODE_PREFIX})?(?:(?:${startComment})\\s+))|(?:${midComment}\\s*))` +
        `(${BULLET_LIST_PATTERN}|${NUMBERED_LIST_PATTERN}|${LETTER_LIST_PATTERN}|${CUSTOM_LIST_PATTERN})??` +
        `(${CHECKBOX})?` +
        `(${escapedKeywords})\\s+` +
        `(${TASK_TEXT})` +
        `(?=${endComment}$|$)?(${endComment})?$`
    );
    const capture = test;
    return { test, capture };
  }

  /**
   * Extract footnote task details from a line using footnote regex
   * @param line The line containing the footnote task
   * @param regex The footnote regex to use
   * @returns Parsed footnote task details
   */
  private extractFootnoteTaskDetails(
    line: string,
    regex: RegExp
  ): {
    indent: string;
    listMarker: string;
    taskText: string;
    tail: string;
    state: string;
  } {
    const m = regex.exec(line);
    if (!m) {
      throw new Error(`Failed to parse footnote task line: ${line}`);
    }

    // For footnote regex, the structure is:
    // m[0] is the full match
    // m[1] is the state keyword
    // m[2] is the task text
    const indent = ''; // Footnotes don't have traditional indentation
    const listMarker = ''; // Footnotes don't have list markers
    const state = m[1];
    const taskText = m[2];
    const tail = '';

    return {
      indent,
      listMarker,
      taskText,
      tail,
      state,
    };
  }

  /**
   * Extract task details from a line using appropriate regex
   * @param line The line containing the task
   * @returns Parsed task details
   */
  private extractTaskDetails(
    line: string,
    regex: RegExp
  ): {
    indent: string;
    listMarker: string;
    taskText: string;
    tail: string;
    state: string;
  } {
    // Use language-aware regex if applicable or callout regex for callout tasks
    const m = regex.exec(line);
    if (!m) {
      throw new Error(`Failed to parse task line: ${line}`);
    }

    // For default regex, the task text is everything after the captured keyword
    // m[0] is the full match
    // m[1] is the indent (spacing, prefix text, comment characters )
    // m[2] is the list marker
    // m[3] is the checkbox
    // m[4] is the state keyword
    // m[5] is the task text
    // m[6] is the closing comment characters
    const indent = m[1] || '';
    const listMarker = (m[2] || '') + (m[3] || '');
    const state = m[4];
    const taskText = m[5];
    const tail = m[6];

    return {
      indent,
      listMarker,
      taskText,
      tail,
      state,
    };
  }

  /**
   * Extract priority from task text
   * @param taskText The task text to parse
   * @returns Priority information
   */
  private extractPriority(taskText: string): {
    priority: 'high' | 'med' | 'low' | null;
    cleanedText: string;
  } {
    return extractPriority(taskText);
  }

  /**
   * Extract checkbox state from task line
   * @param line The task line to parse
   * @param state The current state
   * @param listMarker The current list marker
   * @returns Updated state, completion status, and list marker
   */
  private extractCheckboxState(
    line: string,
    state: string,
    listMarker: string
  ): {
    state: string;
    completed: boolean;
    listMarker: string;
  } {
    let finalState = state;
    let finalCompleted = DEFAULT_COMPLETED_STATES.has(state);
    let finalListMarker = listMarker;

    // Check if this is a markdown checkbox task and extract checkbox status
    // For callout blocks, we need to handle the > prefix
    let checkboxMatch = CHECKBOX_REGEX.exec(line);
    if (!checkboxMatch && line.startsWith('>')) {
      // Try again without the > prefix for callout blocks
      checkboxMatch = CHECKBOX_REGEX.exec(line.substring(1));
    }

    if (checkboxMatch) {
      // map groups from match
      const [
        ,
        ,
        /*checkboxIndent*/ checkboxListMarker,
        checkboxStatus,
        checkboxState /*checkboxText*/,
      ] = checkboxMatch;
      finalState = checkboxState;
      finalCompleted = checkboxStatus === 'x';
      // Update listMarker to preserve the original checkbox format, but trim trailing spaces
      finalListMarker = checkboxListMarker.trimEnd();
    }

    return {
      state: finalState,
      completed: finalCompleted,
      listMarker: finalListMarker,
    };
  }

  /**
   * Check if a line contains SCHEDULED: or DEADLINE: at the same indent level
   * @param line The line to check
   * @param indent The expected indent level
   * @returns The type of date line found or null
   */
  getDateLineType(
    line: string,
    taskIndent: string
  ): 'scheduled' | 'deadline' | null {
    const trimmedLine = line.trim();

    // For quoted lines, check if the line starts with > and the rest starts with SCHEDULED: or DEADLINE:
    if (line.startsWith('>')) {
      const contentAfterArrow = trimmedLine.substring(1).trim();
      if (
        contentAfterArrow.startsWith('SCHEDULED:') ||
        contentAfterArrow.startsWith('DEADLINE:')
      ) {
        return contentAfterArrow.startsWith('SCHEDULED:')
          ? 'scheduled'
          : 'deadline';
      }
    }

    // For regular tasks, check if the trimmed line starts with SCHEDULED: or DEADLINE:
    if (
      !trimmedLine.startsWith('SCHEDULED:') &&
      !trimmedLine.startsWith('DEADLINE:')
    ) {
      return null;
    }

    // For regular tasks, check indent matching
    const lineIndent = line.substring(0, line.length - trimmedLine.length);
    if (lineIndent !== taskIndent && !lineIndent.startsWith(taskIndent)) {
      return null;
    }

    return trimmedLine.startsWith('SCHEDULED:') ? 'scheduled' : 'deadline';
  }

  /**
   * Parse a date from a line containing SCHEDULED: or DEADLINE: prefix
   * @param line The line to parse
   * @returns Parsed Date object or null if parsing fails
   */
  parseDateFromLine(line: string): Date | null {
    // Remove the SCHEDULED: or DEADLINE: prefix and trim
    // The regex needs to account for leading whitespace and callout blocks (>)
    const content = line
      .replace(/^\s*>\s*(SCHEDULED|DEADLINE):\s*/, '')
      .replace(/^\s*(SCHEDULED|DEADLINE):\s*/, '')
      .trim();

    // Use the DateParser to parse the date content
    return DateParser.parseDate(content);
  }

  /**
   * Extract scheduled and deadline dates from lines following a task
   * @param lines Array of lines in the file
   * @param startIndex Index to start searching from
   * @param indent Task indent level
   * @param inCalloutBlock Whether we're in a callout block
   * @returns Date information
   */
  private extractTaskDates(
    lines: string[],
    startIndex: number,
    indent: string
  ): { scheduledDate: Date | null; deadlineDate: Date | null } {
    let scheduledDate: Date | null = null;
    let deadlineDate: Date | null = null;
    let scheduledFound = false;
    let deadlineFound = false;

    for (let i = startIndex; i < lines.length; i++) {
      const nextLine = lines[i];

      // Check if we've moved to a different indent level or non-empty line that's not a date line
      const nextLineTrimmed = nextLine.trim();
      if (nextLineTrimmed === '') {
        continue; // Skip empty lines
      }

      const dateLineType = this.getDateLineType(nextLine, indent);

      if (dateLineType === 'scheduled' && !scheduledFound) {
        const date = this.parseDateFromLine(nextLine);
        if (date) {
          scheduledDate = date;
          scheduledFound = true;
        } else {
          console.warn(
            `Invalid scheduled date format at line ${i + 1}: "${nextLine.trim()}"`
          );
        }
      } else if (dateLineType === 'deadline' && !deadlineFound) {
        const date = this.parseDateFromLine(nextLine);
        if (date) {
          deadlineDate = date;
          deadlineFound = true;
        } else {
          console.warn(
            `Invalid deadline date format at line ${i + 1}: "${nextLine.trim()}"`
          );
        }
      } else {
        // Stop looking for date lines if we encounter a non-empty line that's not a date line
        // or if we've already found both scheduled and deadline dates
        if (dateLineType === null || (scheduledFound && deadlineFound)) {
          break;
        }
      }
    }

    return { scheduledDate, deadlineDate };
  }

  // Parse a single file content into Task[], pure and stateless w.r.t. external app
  parseFile(content: string, path: string): Task[] {
    const lines = content.split('\n');

    // Initialize state machine
    let inBlock = false;
    let blockMarker: 'code' | 'math' | 'comment' | null = null;
    let codeRegex: RegExp | null = null;

    const tasks: Task[] = [];

    for (let index = 0; index < lines.length; index++) {
      const line = lines[index];

      // Skip blank lines
      if (line.trim() === '') {
        continue;
      }

      // Check for footnote definitions
      if (FOOTNOTE_DEFINITION_REGEX.test(line)) {
        const footnoteTask = this.tryParseFootnoteTask(
          line,
          path,
          index,
          lines
        );
        if (footnoteTask) {
          tasks.push(footnoteTask);
        }
        continue;
      }

      // Check for block transitions
      const blockTransition = this.detectBlockTransition(
        line,
        inBlock,
        blockMarker
      );
      if (blockTransition) {
        const result = this.handleBlockTransition(
          blockTransition,
          index,
          lines,
          inBlock,
          codeRegex,
          path
        );
        if (result) {
          inBlock = result.inBlock;
          blockMarker = result.blockMarker;
          codeRegex = result.codeRegex;
        }
        continue;
      }

      // Check for single-line comment blocks (%% ... %%)
      const isSingleLineComment = /^\s*%%.*%%$/.test(line);
      if (isSingleLineComment) {
        const commentTask = this.tryParseCommentBlockTask(
          line,
          path,
          index,
          lines
        );
        if (commentTask) {
          tasks.push(commentTask);
        }
        continue;
      }

      // Check if line should be skipped
      if (this.shouldSkipLine(line, inBlock, blockMarker)) {
        continue;
      }

      // Determine which regex to use
      const useCodeRegex =
        inBlock &&
        this.includeCodeBlocks &&
        blockMarker === 'code' &&
        this.currentLanguage &&
        codeRegex;
      if (
        !this.shouldParseLine(
          line,
          useCodeRegex && codeRegex ? codeRegex : undefined
        )
      ) {
        continue;
      }

      // Extract task details and create task
      const regex = useCodeRegex && codeRegex ? codeRegex : this.captureRegex;
      const taskDetails = this.extractTaskDetails(line, regex);
      const task = this.createTaskFromDetails(
        line,
        path,
        index,
        taskDetails,
        lines
      );

      if (task) {
        tasks.push(task);
      }
    }

    return tasks;
  }

  /**
   * Determine if line starts/ends a code/math/comment block
   * @param line The line to check
   * @param currentInBlock Whether currently inside a block
   * @param currentBlockMarker Current block type
   * @returns Block transition info or null
   */
  private detectBlockTransition(
    line: string,
    currentInBlock: boolean,
    currentBlockMarker: 'code' | 'math' | 'comment' | null
  ): {
    type: 'code' | 'math' | 'comment';
    entering: boolean;
    language?: string;
  } | null {
    const codeMatch = CODE_BLOCK_REGEX.exec(line);
    if (codeMatch) {
      // If we're already in a code block, this is an exit
      if (currentInBlock && currentBlockMarker === 'code') {
        return { type: 'code', entering: false };
      }
      return { type: 'code', entering: true };
    }

    const mathMatch = MATH_BLOCK_REGEX.exec(line);
    if (mathMatch) {
      if (currentInBlock && currentBlockMarker === 'math') {
        return { type: 'math', entering: false };
      }
      return { type: 'math', entering: true };
    }

    const commentMatch = COMMENT_BLOCK_REGEX.exec(line);
    if (commentMatch) {
      // Check if it's a single-line comment (has closing %%)
      const isSingleLine = /^\s*%%.*%%$/.test(line);
      if (isSingleLine) {
        // Single-line comments are not block transitions - they should be parsed normally
        return null;
      }
      // Multi-line comment: entering if not already in one
      if (currentInBlock && currentBlockMarker === 'comment') {
        return { type: 'comment', entering: false };
      }
      return { type: 'comment', entering: true };
    }

    return null;
  }

  /**
   * Handle entering/exiting a code/math/comment block
   * @param transition Block transition info
   * @param index Current line index
   * @param lines All lines in file
   * @param currentInBlock Current block state
   * @param currentCodeRegex Current code regex
   * @param path File path for task creation
   * @returns Updated block state and optionally a parsed task
   */
  private handleBlockTransition(
    transition: {
      type: 'code' | 'math' | 'comment';
      entering: boolean;
      language?: string;
    },
    index: number,
    lines: string[],
    currentInBlock: boolean,
    currentCodeRegex: RegExp | null,
    path: string
  ): {
    inBlock: boolean;
    blockMarker: 'code' | 'math' | 'comment' | null;
    codeRegex: RegExp | null;
  } {
    let inBlock = currentInBlock;
    let blockMarker: 'code' | 'math' | 'comment' | null = null;
    let codeRegex: RegExp | null = currentCodeRegex;

    if (transition.type === 'code') {
      if (transition.entering) {
        inBlock = true;
        blockMarker = 'code';
        if (this.includeCodeBlocks && this.languageCommentSupport.enabled) {
          const line = lines[index];
          const m = CODE_BLOCK_REGEX.exec(line);
          const language = m ? m[2] : '';
          this.detectLanguage(language);
          if (this.currentLanguage) {
            const regexPair = TaskParser.buildCodeRegex(
              this.allKeywords,
              this.currentLanguage
            );
            codeRegex = regexPair.test;
          }
        }
      } else {
        inBlock = false;
        blockMarker = null;
        codeRegex = null;
        this.currentLanguage = null;
      }
    } else if (transition.type === 'math') {
      if (transition.entering) {
        inBlock = true;
        blockMarker = 'math';
      } else {
        inBlock = false;
        blockMarker = null;
      }
    } else if (transition.type === 'comment') {
      if (transition.entering) {
        inBlock = true;
        blockMarker = 'comment';
      } else {
        inBlock = false;
        blockMarker = null;
      }
    }

    return { inBlock, blockMarker, codeRegex };
  }

  /**
   * Check if a line should be skipped based on current block state and settings
   * @param line The line to check
   * @param inBlock Whether currently inside a block
   * @param blockMarker Current block type
   * @returns True if line should be skipped
   */
  private shouldSkipLine(
    line: string,
    inBlock: boolean,
    blockMarker: 'code' | 'math' | 'comment' | null
  ): boolean {
    // Skip lines in quotes and callout blocks if disabled
    if (!this.includeCalloutBlocks && CALLOUT_BLOCK_REGEX.test(line)) {
      return true;
    }

    // Skip lines inside code blocks if disabled
    if (inBlock && !this.includeCodeBlocks && blockMarker === 'code') {
      return true;
    }

    // Skip lines inside math blocks
    if (inBlock && blockMarker === 'math') {
      return true;
    }

    // Skip lines inside comment blocks if the setting is disabled
    if (inBlock && blockMarker === 'comment' && !this.includeCommentBlocks) {
      return true;
    }

    return false;
  }

  /**
   * Check if a line matches the task regex
   * @param line The line to check
   * @param codeRegex Optional code-specific regex
   * @returns True if line should be parsed as a task
   */
  private shouldParseLine(
    line: string,
    codeRegex?: { test: (str: string) => boolean }
  ): boolean {
    if (codeRegex) {
      return codeRegex.test(line);
    }
    return this.testRegex.test(line);
  }

  /**
   * Try to parse a footnote task from a line
   * @param line The line to parse
   * @param path File path
   * @param index Line index
   * @param lines All lines in file
   * @returns Parsed task or null
   */
  private tryParseFootnoteTask(
    line: string,
    path: string,
    index: number,
    lines: string[]
  ): Task | null {
    const footnoteRegex = TaskParser.buildFootnoteRegex(this.allKeywords);
    if (!footnoteRegex.test.test(line)) {
      return null;
    }

    const taskDetails = this.extractFootnoteTaskDetails(
      line,
      footnoteRegex.capture
    );
    const { priority, cleanedText } = this.extractPriority(
      taskDetails.taskText
    );

    const task: Task = {
      path,
      line: index,
      rawText: line,
      indent: taskDetails.indent,
      listMarker: taskDetails.listMarker,
      text: cleanedText,
      state: taskDetails.state,
      completed: DEFAULT_COMPLETED_STATES.has(taskDetails.state),
      priority,
      scheduledDate: null,
      deadlineDate: null,
      tail: taskDetails.tail,
    };

    // Extract dates from following lines
    const { scheduledDate, deadlineDate } = this.extractTaskDates(
      lines,
      index + 1,
      taskDetails.indent
    );

    task.scheduledDate = scheduledDate;
    task.deadlineDate = deadlineDate;

    return task;
  }

  /**
   * Try to parse a single-line comment block task
   * @param line The line to parse
   * @param path File path
   * @param index Line index
   * @param lines All lines in file
   * @returns Parsed task or null
   */
  private tryParseCommentBlockTask(
    line: string,
    path: string,
    index: number,
    lines: string[]
  ): Task | null {
    if (!this.includeCommentBlocks) {
      return null;
    }

    // Extract the content between %% and %%
    const content = line.replace(/^\s*%%\s*/, '').replace(/\s*%%$/, '');

    if (!this.testRegex.test(content)) {
      return null;
    }

    const taskDetails = this.extractTaskDetails(content, this.captureRegex);
    const { priority, cleanedText } = this.extractPriority(
      taskDetails.taskText
    );
    const {
      state: finalState,
      completed: finalCompleted,
      listMarker: finalListMarker,
    } = this.extractCheckboxState(
      content,
      taskDetails.state,
      taskDetails.listMarker
    );

    const task: Task = {
      state: finalState,
      completed: finalCompleted,
      text: cleanedText,
      priority,
      rawText: content.trim(),
      path,
      line: index,
      indent: taskDetails.indent,
      listMarker: finalListMarker,
      scheduledDate: null,
      deadlineDate: null,
      tail: taskDetails.tail,
    };

    // Extract dates from following lines
    const { scheduledDate, deadlineDate } = this.extractTaskDates(
      lines,
      index + 1,
      taskDetails.indent
    );

    task.scheduledDate = scheduledDate;
    task.deadlineDate = deadlineDate;

    return task;
  }

  /**
   * Create a Task from extracted task details
   * @param line Original line
   * @param path File path
   * @param index Line index
   * @param taskDetails Extracted task details
   * @param lines All lines in file
   * @returns Parsed task
   */
  private createTaskFromDetails(
    line: string,
    path: string,
    index: number,
    taskDetails: {
      indent: string;
      listMarker: string;
      taskText: string;
      tail: string;
      state: string;
    },
    lines: string[]
  ): Task {
    // Extract priority
    const { priority, cleanedText } = this.extractPriority(
      taskDetails.taskText
    );

    // Extract checkbox state
    const {
      state: finalState,
      completed: finalCompleted,
      listMarker: finalListMarker,
    } = this.extractCheckboxState(
      line,
      taskDetails.state,
      taskDetails.listMarker
    );

    // Initialize task with date fields
    const task: Task = {
      path,
      line: index,
      rawText: line,
      indent: taskDetails.indent,
      listMarker: finalListMarker,
      text: cleanedText,
      state: finalState,
      completed: finalCompleted,
      priority,
      scheduledDate: null,
      deadlineDate: null,
      tail: taskDetails.tail,
    };

    // Extract dates from following lines
    const { scheduledDate, deadlineDate } = this.extractTaskDates(
      lines,
      index + 1,
      taskDetails.indent
    );

    task.scheduledDate = scheduledDate;
    task.deadlineDate = deadlineDate;

    return task;
  }

  private detectLanguage(lang: string): void {
    // Use getLanguageByIdentifier to support both language names and keywords
    this.currentLanguage =
      this.getLanguageRegistry().getLanguageByIdentifier(lang);
  }

  /**
   * Lazy-load and return the LanguageRegistry instance
   */
  private getLanguageRegistry(): LanguageRegistry {
    if (!this.languageRegistry) {
      this.languageRegistry = new LanguageRegistry();
    }
    return this.languageRegistry;
  }
}
