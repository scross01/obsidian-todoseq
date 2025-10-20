import { Task, DEFAULT_COMPLETED_STATES, DEFAULT_PENDING_STATES, DEFAULT_ACTIVE_STATES } from './task';
import { TodoTrackerSettings } from "./settings";
import { LanguageAwareRegexBuilder, LanguageRegistry, LanguageDefinition, LanguageCommentSupportSettings } from "./code-block-tasks";

type RegexPair = { test: RegExp; capture: RegExp };

// Regex patterns for supported date formats
const DATE_ONLY = /^<(\d{4}-\d{2}-\d{2})>/;
const DATE_WITH_DOW_ONLY = /^<(\d{4}-\d{2}-\d{2})\s+(Mon|Tue|Wed|Thu|Fri|Sat|Sun)>/;
const DATE_WITH_DOW = /^<(\d{4}-\d{2}-\d{2})\s+(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+(\d{2}:\d{2})>/;
const DATE_WITH_TIME = /^<(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})>/;

// Date keyword patterns
const SCHEDULED_PATTERN = /^SCHEDULED:\s*/;
const DEADLINE_PATTERN = /^DEADLINE:\s*/;

export class TaskParser {
  private readonly testRegex: RegExp;
  private readonly captureRegex: RegExp;
  private readonly calloutTestRegex: RegExp;
  private readonly calloutCaptureRegex: RegExp;
  private readonly includeCalloutBlocks: boolean;
  private readonly includeCodeBlocks: boolean;
  private readonly languageCommentSupport: LanguageCommentSupportSettings;
  private readonly customKeywords: string[];
  
  // Language support components
  private readonly languageRegistry: LanguageRegistry;
  private readonly languageAwareRegex: LanguageAwareRegexBuilder;
  
  // Language state tracking
  private currentLanguage: LanguageDefinition | null = null;
  private inMultilineComment: boolean = false;
  private multilineCommentIndent: string = '';

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
    
    // Initialize language support components
    this.languageRegistry = new LanguageRegistry();
    this.languageAwareRegex = new LanguageAwareRegexBuilder();
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

  static buildRegex(keywords: string[]): RegexPair {
    const escaped = keywords
      .map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('|');
    
    // Simple list marker pattern that works for both regular and checkbox formats
    const listMarkerPart = `(?:(?:[-*+]|\\d+[.)]|[A-Za-z][.)]|\\([A-Za-z0-9]+\\))\\s*|[-*+]\\s*\\[[ \\x]\\]\\s*)?`;
    
    // Intentionally case-sensitive (no flags). Matches capitalised keywords only.
    const test = new RegExp(`^[ \\t>]*(?:\\[\\![^\\]]+\\]\\s*)?${listMarkerPart}(?:${escaped})\\s+`);
    const capture = new RegExp(`^([ \\t>]*)?(?:\\[\\![^\\]]+\\]\\s*)?(${listMarkerPart})?(${escaped})\\s+`);
    return { test, capture };
  }

  /**
   * Build regex specifically for callout block tasks
   * @param keywords Array of task keywords
   * @returns RegexPair for testing and capturing callout block tasks
   */
  static buildCalloutRegex(keywords: string[]): RegexPair {
    const escaped = keywords
      .map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('|');
    
    // Simple list marker pattern that works for both regular and checkbox formats
    const listMarkerPart = `(?:(?:[-*+]|\\d+[.)]|[A-Za-z][.)]|\\([A-Za-z0-9]+\\))\\s*|[-*+]\\s*\\[[ \\x]\\]\\s*)?`;
    
    // Regex for callout blocks: > followed by optional callout type, then optional list marker, then keyword
    const test = new RegExp(`^[ \\t]*>\\s*(?:\\[!\\s*[^\\]]+\\s*\\]\\s*)?(?:-)?\\s*${listMarkerPart}(?:${escaped})\\s+`);
    const capture = new RegExp(`^[ \\t]*>(\\s*)(?:\\[!\\s*([^\\]]+)\\s*\\]\\s*)?(?:-)?\\s*(${listMarkerPart})?(${escaped})\\s+`);
    return { test, capture };
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
    
    // Try to match date patterns
    let match = DATE_WITH_DOW.exec(content);
    if (match) {
      const [, dateStr, , timeStr] = match;
      return this.parseDateTimeString(dateStr, timeStr);
    }

    match = DATE_WITH_DOW_ONLY.exec(content);
    if (match) {
      const [, dateStr] = match;
      return this.parseDateString(dateStr);
    }

    match = DATE_WITH_TIME.exec(content);
    if (match) {
      const [, dateStr, timeStr] = match;
      return this.parseDateTimeString(dateStr, timeStr);
    }

    match = DATE_ONLY.exec(content);
    if (match) {
      const [, dateStr] = match;
      return this.parseDateString(dateStr);
    }

    return null;
  }

  /**
   * Parse a date string with optional time
   * @param dateStr Date string in YYYY-MM-DD format
   * @param timeStr Optional time string in HH:mm format
   * @returns Date object in local time (timezone independent)
   */
  private parseDateTimeString(dateStr: string, timeStr: string): Date {
    const [year, month, day] = dateStr.split('-').map(Number);
    const [hours, minutes] = timeStr.split(':').map(Number);
    
    // Create date in local time to preserve the intended time
    return new Date(year, month - 1, day, hours, minutes);
  }

  /**
   * Parse a date string (date only)
   * @param dateStr Date string in YYYY-MM-DD format
   * @returns Date object at midnight local time (timezone independent)
   */
  private parseDateString(dateStr: string): Date {
    const [year, month, day] = dateStr.split('-').map(Number);
    
    // Create date at midnight local time
    return new Date(year, month - 1, day, 0, 0, 0, 0);
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
      const languageRegex = this.languageAwareRegex.buildRegexWithAllKeywords(
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
  private handleMultilineCommentState(line: string, inMultilineComment: boolean, multilineCommentIndent: string): { inMultilineComment: boolean; multilineCommentIndent: string } {
    if (!this.currentLanguage || !this.languageCommentSupport.enabled) {
      return { inMultilineComment, multilineCommentIndent };
    }
    
    const patterns = this.currentLanguage.patterns;
    
    if (!inMultilineComment) {
      // Check if we're entering a multi-line comment
      if (patterns.multiLineStart) {
        const match = patterns.multiLineStart.exec(line);
        if (match) {
          return {
            inMultilineComment: true,
            multilineCommentIndent: line.substring(0, line.length - line.trimStart().length)
          };
        }
      }
    } else {
      // Check if we're exiting a multi-line comment
      if (patterns.multiLineEnd) {
        const match = patterns.multiLineEnd.exec(line);
        if (match) {
          return { inMultilineComment: false, multilineCommentIndent: '' };
        }
      }
    }
    
    return { inMultilineComment, multilineCommentIndent };
  }

  // Parse a single file content into Task[], pure and stateless w.r.t. external app
  parseFile(content: string, path: string): Task[] {
    const lines = content.split('\n');

    // Fence state
    let inFence = false;
    let fenceMarker: '`' | '~' | '$' | null = null;
    
    // Multiline comment state
    let inMultilineComment = false;
    let multilineCommentIndent = '';

    // Callout block state
    let inCalloutBlock = false;
    let calloutBlockType: string | null = null;
    let calloutBlockCollapsible = false;
    
    // Callout block detection regex
    const calloutBlockRegex = /^[ \t]*>\s*(?:\[!\s*([^\]]+)\s*\]\s*)?(?:-)?\s*$/;

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
        const result = this.handleMultilineCommentState(line, inMultilineComment, multilineCommentIndent);
        inMultilineComment = result.inMultilineComment;
        multilineCommentIndent = result.multilineCommentIndent;
      }

      // Detect callout blocks
      const calloutMatch = calloutBlockRegex.exec(line);
      
      if (calloutMatch) {
        // This is a callout block declaration line
        if (calloutMatch[1]) {
          // This is a structured callout like >[!info]
          const calloutType = calloutMatch[1].trim();
          calloutBlockType = calloutType;
          calloutBlockCollapsible = line.includes('-');
        } else {
          // This is a simple quote block
          calloutBlockType = 'quote';
          calloutBlockCollapsible = false;
        }
        inCalloutBlock = true;
        // Don't continue here - we still need to process the line for task parsing
      } else if (this.calloutTestRegex.test(line)) {
        // This is a callout task line (for simple quote blocks)
        calloutBlockType = 'quote';
        calloutBlockCollapsible = false;
        inCalloutBlock = true;
      }
      
      // Check if we're exiting a callout block
      if (inCalloutBlock && !line.trim().startsWith('>')) {
        inCalloutBlock = false;
        calloutBlockType = null;
        calloutBlockCollapsible = false;
      }
      
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

      // Use language-aware regex if applicable or callout regex for callout tasks
      let regex = this.captureRegex;
      let isCalloutTask = false;
      
      if (this.isCalloutTask(line)) {
        regex = this.calloutCaptureRegex;
        isCalloutTask = true;
      } else if (this.currentLanguage && this.languageCommentSupport.enabled) {
          regex = this.languageAwareRegex.buildRegexWithAllKeywords(
            this.currentLanguage,
            this.customKeywords
          ).capture;
      }

      const m = regex.exec(line);
      if (!m) continue;

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

      // Priority parsing: first occurrence wins, then remove it preserving spacing semantics
      let priority: 'high' | 'med' | 'low' | null = null;
      const priMatch = /(\s*)\[#([ABC])\](\s*)/.exec(taskText);
      let cleanedText = taskText;
      if (priMatch) {
        const letter = priMatch[2];
        if (letter === 'A') priority = 'high';
        else if (letter === 'B') priority = 'med';
        else if (letter === 'C') priority = 'low';

        const before = cleanedText.slice(0, priMatch.index);
        const after = cleanedText.slice(priMatch.index + priMatch[0].length);
        cleanedText = (before + ' ' + after).replace(/[ \t]+/g, ' ').trimStart();
      }

      const text = cleanedText;

      // Handle checkbox state determination
      let finalState = state;
      let finalCompleted = DEFAULT_COMPLETED_STATES.has(state);
      
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
        listMarker = checkboxListMarker.trimEnd();
        // Update text to use the extracted text from checkbox format
        // The text should be everything after the state keyword
      }

      // Initialize task with date fields
      const task: Task = {
        path,
        line: index,
        rawText: line,
        indent,
        listMarker,
        commentPrefix,
        text,
        state: finalState,
        completed: finalCompleted,
        priority,
        scheduledDate: null,
        deadlineDate: null,
        trailingCommentEnd, // Include trailing comment end characters for multiline comments
      };

      // Look for SCHEDULED: and DEADLINE: lines immediately after the task line
      let scheduledFound = false;
      let deadlineFound = false;

      for (let i = index + 1; i < lines.length; i++) {
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
            task.scheduledDate = date;
            scheduledFound = true;
          } else {
            console.warn(`Invalid scheduled date format at ${path}:${i + 1}: "${nextLine.trim()}"`);
          }
        } else if (dateLineType === 'deadline' && !deadlineFound) {
          const date = this.parseDateFromLine(nextLine);
          if (date) {
            task.deadlineDate = date;
            deadlineFound = true;
          } else {
            console.warn(`Invalid deadline date format at ${path}:${i + 1}: "${nextLine.trim()}"`);
          }
        } else {
          // Stop looking for date lines if we encounter a non-empty line that's not a date line
          // or if we've already found both scheduled and deadline dates
          if (dateLineType === null || (scheduledFound && deadlineFound)) {
            break;
          }
        }
      }

      tasks.push(task);
    }

    return tasks;
  }

  private detectLanguage(lang: string): void {
    // Use getLanguageByIdentifier to support both language names and keywords
    this.currentLanguage = this.languageRegistry.getLanguageByIdentifier(lang);
    this.inMultilineComment = false;
    this.multilineCommentIndent = '';
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
      this.inMultilineComment = false;
      this.multilineCommentIndent = '';
      return { didToggle: true, inFence: false, fenceMarker: null };
    }

    // Different fence char while inside: ignore as plain text
    return { didToggle: false, inFence, fenceMarker };
  }
}