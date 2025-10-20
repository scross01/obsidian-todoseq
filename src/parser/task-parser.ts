import { Task, DEFAULT_COMPLETED_STATES, DEFAULT_PENDING_STATES, DEFAULT_ACTIVE_STATES } from '../task';
import { TodoTrackerSettings } from "../settings/settings";
import { LanguageAwareRegexBuilder, LanguageRegistry, LanguageDefinition, LanguageCommentSupportSettings } from "./code-block-tasks";
import { MultilineCommentState } from "./multiline-comment-state";
import { DateUtils } from "../date-utils";

type RegexPair = { test: RegExp; capture: RegExp };

// Date keyword patterns
const SCHEDULED_PATTERN = /^SCHEDULED:\s*/;
const DEADLINE_PATTERN = /^DEADLINE:\s*/;

// List marker pattern that works for both regular and checkbox formats
const LIST_MARKER_PART = `(?:(?:[-*+]|\\d+[.)]|[A-Za-z][.)]|\\([A-Za-z0-9]+\\))\\s*|[-*+]\\s*\\[[ \\x]\\]\\s*)?`;

// Callout block detection regex
const CALLOUT_BLOCK_REGEX = /^[ \t]*>\s*(?:\[!\s*([^\]]+)\s*\]\s*)?(?:-)?\s*$/;

export class TaskParser {
  private readonly testRegex: RegExp;
  private readonly captureRegex: RegExp;
  private readonly calloutTestRegex: RegExp;
  private readonly calloutCaptureRegex: RegExp;
  private readonly includeCalloutBlocks: boolean;
  private readonly includeCodeBlocks: boolean;
  private readonly languageCommentSupport: LanguageCommentSupportSettings;
  private readonly customKeywords: string[];
  
  // Language support components (lazy-loaded)
  private languageRegistry: LanguageRegistry | null = null;
  private languageAwareRegex: LanguageAwareRegexBuilder | null = null;
  
  // Language state tracking
  private currentLanguage: LanguageDefinition | null = null;
  private multilineCommentState: MultilineCommentState;

  private constructor(
    regex: RegexPair,
    includeCalloutBlocks: boolean,
    includeCodeBlocks: boolean,
    languageCommentSupport: LanguageCommentSupportSettings,
    customKeywords: string[]
  ) {
    this.testRegex = regex.test;
    this.captureRegex = regex.capture;
    
    // Initialize callout block regexes
    const calloutRegex = TaskParser.buildCalloutRegex([
      ...Array.from(DEFAULT_PENDING_STATES),
      ...Array.from(DEFAULT_ACTIVE_STATES),
      ...customKeywords,
      ...Array.from(DEFAULT_COMPLETED_STATES),
    ]);
    this.calloutTestRegex = calloutRegex.test;
    this.calloutCaptureRegex = calloutRegex.capture;
    
    this.includeCalloutBlocks = includeCalloutBlocks;
    this.includeCodeBlocks = includeCodeBlocks;
    this.languageCommentSupport = languageCommentSupport;
    this.customKeywords = customKeywords;
    
    // Initialize multiline comment state
    this.multilineCommentState = new MultilineCommentState();
  }

  static create(settings: TodoTrackerSettings): TaskParser {
    // Build union of non-completed states (defaults + user additional) and completed states (defaults only)
    const additional: string[] = Array.isArray(settings.additionalTaskKeywords)
      ? (settings.additionalTaskKeywords as string[])
      : [];

    // Ensure values are strings and already capitalised by settings UI; filter out empties defensively
    const normalizedAdditional: string[] = additional
      .filter((k): k is string => typeof k === 'string')
      .map(k => k.trim())
      .filter(k => k.length > 0);

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
      !!settings.includeCalloutBlocks,
      !!settings.includeCodeBlocks,
      settings.languageCommentSupport,
      normalizedAdditional
    );
  }

  /**
   * Escape keywords for use in regex patterns
   * @param keywords Array of keywords to escape
   * @returns Escaped keywords joined with OR operator
   */
  private static escapeKeywords(keywords: string[]): string {
    return keywords
      .map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('|');
  }

  /**
   * Build regex patterns with customizable components
   * @param keywords Array of task keywords
   * @param prefixPattern Pattern for the prefix before the list marker
   * @param listMarkerPattern Pattern for the list marker (defaults to LIST_MARKER_PART)
   * @param additionalCaptureGroups Additional capture groups to include before the main groups
   * @returns RegexPair for testing and capturing tasks
   */
  private static buildRegexBase(
    keywords: string[],
    prefixPattern: string,
    listMarkerPattern: string = LIST_MARKER_PART,
    additionalCaptureGroups: string = ''
  ): RegexPair {
    const escaped = TaskParser.escapeKeywords(keywords);
    
    // Intentionally case-sensitive (no flags). Matches capitalised keywords only.
    const test = new RegExp(`^${prefixPattern}${listMarkerPattern}(?:${escaped})\\s+`);
    
    // For capture regex, we need to handle different patterns:
    // - For regular tasks: capture indent, list marker, keyword
    // - For callout tasks: capture whitespace after >, callout type, list marker, keyword
    const capture = new RegExp(
      `^${additionalCaptureGroups ? `(${additionalCaptureGroups})` : ''}${prefixPattern}(${listMarkerPattern})?(${escaped})\\s+`
    );
    return { test, capture };
  }

  static buildRegex(keywords: string[]): RegexPair {
    return TaskParser.buildRegexBase(
      keywords,
      `[ \\t>]*(?:\\[\\![^\\]]+\\]\\s*)?`,
      LIST_MARKER_PART,
      '[ \\t>]*'
    );
  }

  /**
   * Build regex specifically for callout block tasks
   * @param keywords Array of task keywords
   * @returns RegexPair for testing and capturing callout block tasks
   */
  static buildCalloutRegex(keywords: string[]): RegexPair {
    return TaskParser.buildRegexBase(
      keywords,
      `[ \\t]*>\\s*(?:\\[!\\s*([^\\]]+)\\s*\\]\\s*)?(?:-)?\\s*`,
      LIST_MARKER_PART,
      '\\s*'
    );
  }

  /**
   * Parse a date from a line containing SCHEDULED: or DEADLINE: prefix
   * @param line The line to parse
   * @returns Parsed Date object or null if parsing fails
   */
  parseDateFromLine(line: string): Date | null {
    // Remove the SCHEDULED: or DEADLINE: prefix and trim
    // The regex needs to account for leading whitespace and callout blocks (>)
    const content = line.replace(/^\s*>\s*(SCHEDULED|DEADLINE):\s*/, '').replace(/^\s*(SCHEDULED|DEADLINE):\s*/, '').trim();
    
    // Use the DateUtils to parse the date content
    return DateUtils.parseDate(content);
  }

  /**
   * Check if a line contains SCHEDULED: or DEADLINE: at the same indent level
   * @param line The line to check
   * @param indent The expected indent level
   * @returns The type of date line found or null
   */
  getDateLineType(line: string, taskIndent: string): 'scheduled' | 'deadline' | null {
    const trimmedLine = line.trim();
    
    // For callout blocks, check if the line starts with > and the rest starts with SCHEDULED: or DEADLINE:
    if (line.startsWith('>')) {
      const contentAfterArrow = trimmedLine.substring(1).trim();
      if (contentAfterArrow.startsWith('SCHEDULED:') || contentAfterArrow.startsWith('DEADLINE:')) {
        return contentAfterArrow.startsWith('SCHEDULED:') ? 'scheduled' : 'deadline';
      }
    }
    
    // For regular tasks, check if the trimmed line starts with SCHEDULED: or DEADLINE:
    if (!trimmedLine.startsWith('SCHEDULED:') && !trimmedLine.startsWith('DEADLINE:')) {
      return null;
    }

    // For regular tasks, check indent matching
    const lineIndent = line.substring(0, line.length - trimmedLine.length);
    if (lineIndent !== taskIndent && !lineIndent.startsWith(taskIndent)) {
      return null;
    }

    return trimmedLine.startsWith('SCHEDULED:') ? 'scheduled' : 'deadline';
  }

  isTask(line: string, inMultilineComment: boolean = false): boolean {
    // Check if language comment support is enabled
    if (!this.languageCommentSupport.enabled) {
      return this.testRegex.test(line);
    }
    
    // Check if we're inside a code block and language detection is active
    if (this.currentLanguage && this.includeCodeBlocks) {
      // Use language-aware regex when inside a code block
      const languageRegex = this.getLanguageAwareRegex().buildRegexWithAllKeywords(
        this.currentLanguage,
        []
      );
      return languageRegex.test.test(line);
    }
    
    // For tasks outside code blocks, always use the default regex
    // regardless of language comment support settings
    return this.testRegex.test(line);
  }

  /**
   * Check if a line is a task within a callout block
   * @param line The line to check
   * @returns True if the line is a task in a callout block
   */
  private isCalloutTask(line: string): boolean {
    return this.calloutTestRegex.test(line);
  }

  /**
   * Handle multi-line comment state tracking
   * @param line The current line being processed
   * @param inMultilineComment Current multiline comment state
   * @param multilineCommentIndent Current multiline comment indent
   * @returns Updated multiline comment state and indent
   */
  private handleMultilineCommentState(line: string): { inMultilineComment: boolean; multilineCommentIndent: string } {
    if (!this.languageCommentSupport.enabled) {
      return { inMultilineComment: false, multilineCommentIndent: '' };
    }
    
    return this.multilineCommentState.handleLine(line);
  }

  /**
   * Detect and update callout block state
   * @param line The current line being processed
   * @param inCalloutBlock Current callout block state
   * @param calloutBlockType Current callout block type
   * @param calloutBlockCollapsible Current callout block collapsible state
   * @returns Updated callout block state
   */
  private detectCalloutBlockState(
    line: string,
    inCalloutBlock: boolean,
    calloutBlockType: string | null,
    calloutBlockCollapsible: boolean
  ): { inCalloutBlock: boolean; calloutBlockType: string | null; calloutBlockCollapsible: boolean } {
    // Callout block detection regex
    const calloutBlockRegex = /^[ \t]*>\s*(?:\[!\s*([^\]]+)\s*\]\s*)?(?:-)?\s*$/;
    
    let newInCalloutBlock = inCalloutBlock;
    let newCalloutBlockType = calloutBlockType;
    let newCalloutBlockCollapsible = calloutBlockCollapsible;
    
    const calloutMatch = calloutBlockRegex.exec(line);
    
    if (calloutMatch) {
      // This is a callout block declaration line
      if (calloutMatch[1]) {
        // This is a structured callout like >[!info]
        const calloutType = calloutMatch[1].trim();
        newCalloutBlockType = calloutType;
        newCalloutBlockCollapsible = line.includes('-');
      } else {
        // This is a simple quote block
        newCalloutBlockType = 'quote';
        newCalloutBlockCollapsible = false;
      }
      newInCalloutBlock = true;
      // Don't continue here - we still need to process the line for task parsing
    } else if (this.calloutTestRegex.test(line)) {
      // This is a callout task line (for simple quote blocks)
      newCalloutBlockType = 'quote';
      newCalloutBlockCollapsible = false;
      newInCalloutBlock = true;
    }
    
    // Check if we're exiting a callout block
    if (newInCalloutBlock && !line.trim().startsWith('>')) {
      newInCalloutBlock = false;
      newCalloutBlockType = null;
      newCalloutBlockCollapsible = false;
    }
    
    return {
      inCalloutBlock: newInCalloutBlock,
      calloutBlockType: newCalloutBlockType,
      calloutBlockCollapsible: newCalloutBlockCollapsible
    };
  }

  /**
   * Extract task details from a line using appropriate regex
   * @param line The line containing the task
   * @returns Parsed task details
   */
  private extractTaskDetails(line: string): {
    indent: string;
    listMarker: string;
    taskText: string;
    commentPrefix: string;
    trailingCommentEnd: string;
    state: string;
    isCalloutTask: boolean;
  } {
    // Use language-aware regex if applicable or callout regex for callout tasks
    let regex = this.captureRegex;
    let isCalloutTask = false;
    
    if (this.isCalloutTask(line)) {
      regex = this.calloutCaptureRegex;
      isCalloutTask = true;
    } else if (this.currentLanguage && this.languageCommentSupport.enabled) {
        regex = this.getLanguageAwareRegex().buildRegexWithAllKeywords(
          this.currentLanguage,
          this.customKeywords
        ).capture;
    }

    const m = regex.exec(line);
    if (!m) {
      throw new Error(`Failed to parse task line: ${line}`);
    }

    const indent = m[1] ?? '';
    let listMarker = '';
    let taskText = '';
    let commentPrefix = '';
    let trailingCommentEnd = '';
    let state = '';
    
    // Handle different regex patterns for different task types
    if (isCalloutTask) {
      // For callout tasks: m[1] is whitespace after >, m[2] is callout type, m[3] is list marker, m[4] is state
      listMarker = (m[3] ?? '') as string;
      state = (m[4] ?? '') as string;
      const fullMatch = m[0] || '';
      taskText = line.substring(fullMatch.length).trim();
    } else if (this.currentLanguage && this.languageCommentSupport.enabled) {
      // For language-aware regex, the list marker is in m[3], for default regex it's in m[2]
      listMarker = (m[3] ?? '') as string;
      commentPrefix = (m[2] ?? '') as string;
      state = (m[4] ?? '') as string;
      
      // Handle the text content and trailing comment characters
      // For language-aware regex, m[5] is the text, m[6] is trailing comment end
      taskText = (m[5] ?? '') as string;
      trailingCommentEnd = (m[6] ?? '') as string;
    } else {
      // For default regex, the task text is everything after the captured keyword
      // m[0] is the full match, m[1] is indent, m[2] is list marker, m[3] is keyword
      listMarker = (m[2] ?? '') as string;
      state = (m[3] ?? '') as string;
      const fullMatch = m[0] || '';
      taskText = line.substring(fullMatch.length).trim();
    }

    return {
      indent,
      listMarker,
      taskText,
      commentPrefix,
      trailingCommentEnd,
      state,
      isCalloutTask
    };
  }

  /**
   * Extract priority from task text
   * @param taskText The task text to parse
   * @returns Priority information
   */
  private extractPriority(taskText: string): { priority: 'high' | 'med' | 'low' | null; cleanedText: string } {
    let priority: 'high' | 'med' | 'low' | null = null;
    let cleanedText = taskText;
    
    const priMatch = /(\s*)\[#([ABC])\](\s*)/.exec(cleanedText);
    if (priMatch) {
      const letter = priMatch[2];
      if (letter === 'A') priority = 'high';
      else if (letter === 'B') priority = 'med';
      else if (letter === 'C') priority = 'low';

      const before = cleanedText.slice(0, priMatch.index);
      const after = cleanedText.slice(priMatch.index + priMatch[0].length);
      cleanedText = (before + ' ' + after).replace(/[ \t]+/g, ' ').trimStart();
    }

    return { priority, cleanedText };
  }

  /**
   * Extract checkbox state from task line
   * @param line The task line to parse
   * @param state The current state
   * @param listMarker The current list marker
   * @returns Updated state, completion status, and list marker
   */
  private extractCheckboxState(line: string, state: string, listMarker: string): {
    state: string;
    completed: boolean;
    listMarker: string;
  } {
    let finalState = state;
    let finalCompleted = DEFAULT_COMPLETED_STATES.has(state);
    let finalListMarker = listMarker;
    
    // Check if this is a markdown checkbox task and extract checkbox status
    // For callout blocks, we need to handle the > prefix
    let checkboxMatch = line.match(/^(\s*)([-*+]\s*\[(\s|x)\]\s*)\s+([^\s]+)\s+(.+)$/);
    if (!checkboxMatch && line.startsWith('>')) {
      // Try again without the > prefix for callout blocks
      checkboxMatch = line.substring(1).match(/^(\s*)([-*+]\s*\[(\s|x)\]\s*)\s+([^\s]+)\s+(.+)$/);
    }
    
    if (checkboxMatch) {
      const [, checkboxIndent, checkboxListMarker, checkboxStatus, checkboxState, checkboxText] = checkboxMatch;
      finalState = checkboxState;
      finalCompleted = checkboxStatus === 'x';
      // Update listMarker to preserve the original checkbox format, but trim trailing spaces
      finalListMarker = checkboxListMarker.trimEnd();
    }

    return { state: finalState, completed: finalCompleted, listMarker: finalListMarker };
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
    indent: string,
    inCalloutBlock: boolean
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

      // For callout blocks, stop looking for date lines when we exit the callout block
      if (inCalloutBlock && !nextLine.startsWith('>')) {
        break;
      }

      const dateLineType = this.getDateLineType(nextLine, indent);
      
      if (dateLineType === 'scheduled' && !scheduledFound) {
        const date = this.parseDateFromLine(nextLine);
        if (date) {
          scheduledDate = date;
          scheduledFound = true;
        } else {
          console.warn(`Invalid scheduled date format at line ${i + 1}: "${nextLine.trim()}"`);
        }
      } else if (dateLineType === 'deadline' && !deadlineFound) {
        const date = this.parseDateFromLine(nextLine);
        if (date) {
          deadlineDate = date;
          deadlineFound = true;
        } else {
          console.warn(`Invalid deadline date format at line ${i + 1}: "${nextLine.trim()}"`);
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
    let inFence = false;
    let fenceMarker: '`' | '~' | '$' | null = null;
    
    // Multiline comment state
    let inMultilineComment = false;
    let multilineCommentIndent = '';

    // Callout block state
    let inCalloutBlock = false;
    let calloutBlockType: string | null = null;
    let calloutBlockCollapsible = false;

    const tasks: Task[] = [];

    for (let index = 0; index < lines.length; index++) {
      const line = lines[index];

      // Update fence state and skip delimiter lines
      const toggled = this.toggleFenceIfDelimiter(line, inFence, fenceMarker);
      if (toggled.didToggle) {
        inFence = toggled.inFence;
        fenceMarker = toggled.fenceMarker;
        continue;
      }

      // Handle multi-line comment state
      if (this.currentLanguage && inFence && fenceMarker !== '$') {
        const result = this.handleMultilineCommentState(line);
        inMultilineComment = result.inMultilineComment;
        multilineCommentIndent = result.multilineCommentIndent;
      }

      // Update callout block state
      const calloutBlockState = this.detectCalloutBlockState(line, inCalloutBlock, calloutBlockType, calloutBlockCollapsible);
      inCalloutBlock = calloutBlockState.inCalloutBlock;
      calloutBlockType = calloutBlockState.calloutBlockType;
      calloutBlockCollapsible = calloutBlockState.calloutBlockCollapsible;
      
      // Skip lines inside callout blocks if disabled
      if (inCalloutBlock && !this.includeCalloutBlocks) {
        continue;
      }

      // Skip lines inside code blocks if disabled
      if (inFence && !this.includeCodeBlocks && fenceMarker !== '$') {
        continue;
      }

      // Skip lines inside math blocks
      if (inFence && fenceMarker === '$') {
        continue;
      }

      if (!this.isTask(line, inMultilineComment) && !this.isCalloutTask(line)) continue;

      // Extract task details
      const taskDetails = this.extractTaskDetails(line);
      
      // Extract priority
      const { priority, cleanedText } = this.extractPriority(taskDetails.taskText);
      
      // Extract checkbox state
      const { state: finalState, completed: finalCompleted, listMarker: finalListMarker } =
        this.extractCheckboxState(line, taskDetails.state, taskDetails.listMarker);

      // Initialize task with date fields
      const task: Task = {
        path,
        line: index,
        rawText: line,
        indent: taskDetails.indent,
        listMarker: finalListMarker,
        commentPrefix: taskDetails.commentPrefix,
        text: cleanedText,
        state: finalState,
        completed: finalCompleted,
        priority,
        scheduledDate: null,
        deadlineDate: null,
        trailingCommentEnd: taskDetails.trailingCommentEnd, // Include trailing comment end characters for multiline comments
      };

      // Extract dates from following lines
      const { scheduledDate, deadlineDate } = this.extractTaskDates(
        lines,
        index + 1,
        taskDetails.indent,
        inCalloutBlock
      );
      
      task.scheduledDate = scheduledDate;
      task.deadlineDate = deadlineDate;

      tasks.push(task);
    }

    return tasks;
  }

  private detectLanguage(lang: string): void {
    // Use getLanguageByIdentifier to support both language names and keywords
    this.currentLanguage = this.getLanguageRegistry().getLanguageByIdentifier(lang);
    this.multilineCommentState.setLanguage(this.currentLanguage);
  }

  // Enhanced fence delimiter tracker: detects ```lang or ~~~lang or $$ at start (with indent), toggles when matching opener char.
  private toggleFenceIfDelimiter(
    line: string,
    inFence: boolean,
    fenceMarker: '`' | '~' | '$' | null
  ): { didToggle: boolean; inFence: boolean; fenceMarker: '`' | '~' | '$' | null } {
    // Enhanced regex to capture language identifier for code blocks and $$ for math blocks
    const fenceMatch = /^[ \t]*(`{3,}|~{3,}|\$\$)(\w*)/.exec(line);
    if (!fenceMatch) {
      return { didToggle: false, inFence, fenceMarker };
    }

    const markerRun = fenceMatch[1];
    const currentMarker: '`' | '~' | '$' = markerRun[0] === '`' ? '`' : markerRun[0] === '~' ? '~' : '$';
    const language = fenceMatch[2].toLowerCase();

    if (!inFence) {
      // Detect language when entering a code block, or mark as math block for $$
      if (currentMarker === '$') {
        // Math block - no language detection needed
        return { didToggle: true, inFence: true, fenceMarker: currentMarker };
      } else {
        // Code block - detect language
        this.detectLanguage(language);
        return { didToggle: true, inFence: true, fenceMarker: currentMarker };
      }
    } else if (fenceMarker === currentMarker) {
      // Reset language when exiting a code block or math block
      this.currentLanguage = null;
      this.multilineCommentState.setLanguage(null);
      return { didToggle: true, inFence: false, fenceMarker: null };
    }

    // Different fence char while inside: ignore as plain text
    return { didToggle: false, inFence, fenceMarker };
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

  /**
   * Lazy-load and return the LanguageAwareRegexBuilder instance
   */
  private getLanguageAwareRegex(): LanguageAwareRegexBuilder {
    if (!this.languageAwareRegex) {
      this.languageAwareRegex = new LanguageAwareRegexBuilder();
    }
    return this.languageAwareRegex;
  }
}