import { Task, DEFAULT_COMPLETED_STATES, DEFAULT_PENDING_STATES, DEFAULT_ACTIVE_STATES } from '../task';
import { TodoTrackerSettings } from "../settings/settings";
import { LanguageRegistry, LanguageDefinition, LanguageCommentSupportSettings } from "./language-registry";
import { DateParser } from "./date-parser";

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
const CALLOUT_PREFIX = /\s*>\s*\[!\w+\]-?\s+/.source

// Code block marker ``` or ~~~ with language
const CODE_BLOCK_REGEX = /^\s*(```|~~~)\s*(\S+)?$/
// Math block marker %%
const MATH_BLOCK_REGEX = /^\s*%%(?!.*%%).*/ // ignores open and close on same line
// Comment block marker $$
const COMMENT_BLOCK_REGEX = /^\s*\$\$(?!.*\$\$).*/ // ignores open and close on same line
// Callout block marker >
const CALLOUT_BLOCK_REGEX = /^\s*>.*/

// Language code before comment - non greedy
const CODE_PREFIX = /\s*[\s\S]*?/.source

const TASK_TEXT = /[\w[].+?/.source;  // at least one word


export class TaskParser {
  private readonly testRegex: RegExp;
  private readonly captureRegex: RegExp;
  private readonly includeCalloutBlocks: boolean;
  private readonly includeCodeBlocks: boolean;
  private readonly languageCommentSupport: LanguageCommentSupportSettings;
  private readonly customKeywords: string[];
  private allKeywords: string[];
  
  // Language support components (lazy-loaded)
  private languageRegistry: LanguageRegistry | null = null;
  
  // Language state tracking
  private currentLanguage: LanguageDefinition | null = null;

  private constructor(
    regex: RegexPair,
    includeCalloutBlocks: boolean,
    includeCodeBlocks: boolean,
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
      settings.includeCalloutBlocks,
      settings.includeCodeBlocks,
      settings.languageCommentSupport,
      normalizedAdditional,
      allKeywordsArray,
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
   * @returns RegexPair for testing and capturing tasks
   */
  private static buildRegex(
    keywords: string[],
  ): RegexPair {    

    const escaped_keywords = TaskParser.escapeKeywords(keywords);

    const test = new RegExp(
      `^(${STANDARD_PREFIX}|${QUOTED_PREFIX}|${CALLOUT_PREFIX})?`
      + `(${BULLET_LIST_PATTERN}|${NUMBERED_LIST_PATTERN}|${LETTER_LIST_PATTERN}|${CUSTOM_LIST_PATTERN})??`
      + `(${CHECKBOX})?`
      + `(${escaped_keywords})\\s+`
      + `(${TASK_TEXT})$`
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
  private static buildCodeRegex(
    keywords: string[],
    languageDefinition: LanguageDefinition,
  ): RegexPair {    

    const escapedKeywords = TaskParser.escapeKeywords(keywords);
    
    // starts with mutliline or singleline
    const startComment = [
      languageDefinition.patterns.singleLine?.source,
      languageDefinition.patterns.multiLineStart?.source
    ].filter(Boolean).join('|');
    const midComment = languageDefinition.patterns.multilineMid?.source || '.*?';
    const endComment = `\\s+${languageDefinition.patterns.multiLineEnd?.source}\\s*` || '';

    const test = new RegExp(
      `^((?:(?:${CODE_PREFIX})?(?:(?:${startComment})\\s+))|(?:${midComment}\\s*))`
      + `(${BULLET_LIST_PATTERN}|${NUMBERED_LIST_PATTERN}|${LETTER_LIST_PATTERN}|${CUSTOM_LIST_PATTERN})??`
      + `(${CHECKBOX})?`
      + `(${escapedKeywords})\\s+`
      + `(${TASK_TEXT})`
      + `(?=${endComment}$|$)?(${endComment})?$`
    );
    const capture = test;
    return { test, capture };
  }

  /**
   * Extract task details from a line using appropriate regex
   * @param line The line containing the task
   * @returns Parsed task details
   */
  private extractTaskDetails(line: string, regex: RegExp): {
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
    const indent = m[1] || "";
    const listMarker = (m[2] || "") + (m[3] || "");
    const state = m[4]
    const taskText = m[5];
    const tail = m[6]

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
  private extractPriority(taskText: string): { priority: 'high' | 'med' | 'low' | null; cleanedText: string } {
    let priority: 'high' | 'med' | 'low' | null = null;
    let cleanedText = taskText;
    
    // look for [#A] [#B] or [#C]
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
      // map groups from match
      const [, /*checkboxIndent*/, checkboxListMarker, checkboxStatus, checkboxState, /*checkboxText*/ ] = checkboxMatch;
      finalState = checkboxState;
      finalCompleted = checkboxStatus === 'x';
      // Update listMarker to preserve the original checkbox format, but trim trailing spaces
      finalListMarker = checkboxListMarker.trimEnd();
    }

    return { state: finalState, completed: finalCompleted, listMarker: finalListMarker };
  }

  /**
   * Check if a line contains SCHEDULED: or DEADLINE: at the same indent level
   * @param line The line to check
   * @param indent The expected indent level
   * @returns The type of date line found or null
   */
  getDateLineType(line: string, taskIndent: string): 'scheduled' | 'deadline' | null {
    const trimmedLine = line.trim();
    
    // For quoted lines, check if the line starts with > and the rest starts with SCHEDULED: or DEADLINE:
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

  /**
   * Parse a date from a line containing SCHEDULED: or DEADLINE: prefix
   * @param line The line to parse
   * @returns Parsed Date object or null if parsing fails
   */
  parseDateFromLine(line: string): Date | null {
    // Remove the SCHEDULED: or DEADLINE: prefix and trim
    // The regex needs to account for leading whitespace and callout blocks (>)
    const content = line.replace(/^\s*>\s*(SCHEDULED|DEADLINE):\s*/, '').replace(/^\s*(SCHEDULED|DEADLINE):\s*/, '').trim();
    
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
    indent: string,
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
    let inBlock = false;
    let blockMarker: 'code' | 'math' | 'comment' | null = null;
    let codeRegex = null
    
    const tasks: Task[] = [];

    for (let index = 0; index < lines.length; index++) {
      const line = lines[index];

      // skip blank lines
      if (line.trim() == '') {
        continue;
      }
      // check for change of context
      if (CODE_BLOCK_REGEX.test(line)) {
        if (!inBlock) {
          if (this.includeCodeBlocks) {
            // starting a new code block, detect the coding language
            if (this.languageCommentSupport.enabled) {
              const m = CODE_BLOCK_REGEX.exec(line)
              // m[0] is the full match
              // m[1] is block marker
              // m[2] is the language
              // get the language from the registry
              this.detectLanguage(m ? m[2] : "")
              if(this.currentLanguage) {
                codeRegex = TaskParser.buildCodeRegex(this.allKeywords, this.currentLanguage)
              } else {
                codeRegex = null
              }
            }
          }
        }
        inBlock = !inBlock
        blockMarker = inBlock ? 'code' : null  
        continue;
      } else if (MATH_BLOCK_REGEX.test(line)) {
        inBlock = !inBlock
        blockMarker = inBlock ? 'math' : null  
      } else if (COMMENT_BLOCK_REGEX.test(line)) {
        inBlock = !inBlock
        blockMarker = inBlock ? 'comment' : null  
      }

      // Skip lines in quotes and callout blocks if disabled 
      if (!this.includeCalloutBlocks && CALLOUT_BLOCK_REGEX.test(line)) {
        continue;
      }
  
      // Skip lines inside code blocks if disabled
      if (inBlock && !this.includeCodeBlocks && blockMarker === 'code' ) {
        continue;
      }

      // Skip lines inside math blocks
      if (inBlock && blockMarker === 'math') {
        continue;
      }

      // Skip lines inside comment blocks
      if (inBlock && blockMarker === 'comment') {
        continue;
      }

      // first use the test regex to see if this line has a task
      const useCodeRegex = inBlock && this.includeCodeBlocks && blockMarker == 'code' && this.currentLanguage 
      if (useCodeRegex && codeRegex) {
        if (!codeRegex.test.test(line)) {
          continue;
        }
      }
      else if (!this.testRegex.test(line)) {
        continue;
      }

      // Extract task details using the regular are langauge speciifc code regex
      const taskDetails = this.extractTaskDetails(line, (useCodeRegex && codeRegex) ? codeRegex.capture : this.captureRegex);

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
        taskDetails.indent,
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