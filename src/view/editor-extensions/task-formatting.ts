import {
  EditorView,
  Decoration,
  DecorationSet,
  ViewPlugin,
  ViewUpdate,
  WidgetType,
} from '@codemirror/view';
import { RangeSetBuilder } from '@codemirror/state';
import { TodoTrackerSettings } from '../../settings/settings';
import { TaskParser } from '../../parser/task-parser';
import {
  COMMENT_BLOCK_REGEX,
  FOOTNOTE_DEFINITION_REGEX,
  SINGLE_LINE_COMMENT_REGEX,
  PRIORITY_TOKEN_REGEX,
} from '../../utils/patterns';
import {
  LanguageRegistry,
  LanguageDefinition,
} from '../../parser/language-registry';
import { SettingsChangeDetector } from '../../utils/settings-utils';
import { isCompletedKeyword as isCompletedKeywordUtil } from '../../utils/task-utils';

/**
 * Priority type definition
 */
type PriorityLevel = 'high' | 'med' | 'low';

/**
 * Custom widget for rendering priority pills in the editor
 * Implements eq() for efficient updates and toDOM() for rendering
 */
class PriorityWidget extends WidgetType {
  constructor(
    readonly letter: string,
    readonly priority: PriorityLevel,
  ) {
    super();
  }

  eq(other: PriorityWidget): boolean {
    return this.letter === other.letter && this.priority === other.priority;
  }

  toDOM(): HTMLElement {
    const container = document.createElement('span');
    container.className = `cm-priority-pill priority-badge priority-${this.priority}`;
    container.textContent = this.letter;
    container.setAttribute('data-priority', this.letter);
    container.setAttribute('aria-label', `Priority ${this.letter}`);
    container.setAttribute('role', 'badge');
    return container;
  }

  ignoreEvent(): boolean {
    // Allow text selection within widget area
    return false;
  }
}

export class TaskKeywordDecorator {
  private decorations: DecorationSet;
  private parser: TaskParser;
  private settings: TodoTrackerSettings;
  private languageRegistry: LanguageRegistry | null = null;
  private currentLanguage: LanguageDefinition | null = null;
  private inCodeBlock = false;
  private codeBlockLanguage = '';
  private inQuoteBlock = false;
  private quoteNestingLevel = 0;
  private inCalloutBlock = false;
  private inCommentBlock = false;
  private inFootnote = false;
  private disposables: Array<() => void> = [];

  // Track task lines to detect SCHEDULED/DEADLINE lines that follow them
  private previousTaskLine: number | null = null;
  private previousTaskIndent = '';

  // Proximity buffer for cursor detection (in characters)
  private readonly PROXIMITY_BUFFER = 0;

  constructor(
    private view: EditorView,
    settings: TodoTrackerSettings,
    parser: TaskParser,
  ) {
    this.settings = settings;
    this.parser = parser;
    this.decorations = this.createDecorations();
  }

  /**
   * Check if cursor is near a priority token
   * Used to determine whether to show raw text or widget
   */
  private isCursorNearPriority(tokenFrom: number, tokenTo: number): boolean {
    const selection = this.view.state.selection.main;
    const cursorPos = selection.head;

    // Get line information
    const tokenLine = this.view.state.doc.lineAt(tokenFrom);
    const cursorLine = this.view.state.doc.lineAt(cursorPos);

    // If cursor is on a different line, show widget
    if (tokenLine.number !== cursorLine.number) {
      return false;
    }

    // Define proximity threshold - cursor within or adjacent to token
    const nearStart = tokenFrom - this.PROXIMITY_BUFFER;
    const nearEnd = tokenTo + this.PROXIMITY_BUFFER;

    // Check if cursor is within proximity zone
    if (cursorPos >= nearStart && cursorPos <= nearEnd) {
      return true;
    }

    // Also check if selection overlaps with token
    if (selection.from <= tokenTo && selection.to >= tokenFrom) {
      return true;
    }

    return false;
  }

  /**
   * Get the priority level from a priority letter
   */
  private getPriorityLevel(letter: string): PriorityLevel {
    if (letter === 'A') return 'high';
    if (letter === 'B') return 'med';
    return 'low';
  }

  private getLanguageRegistry(): LanguageRegistry {
    if (!this.languageRegistry) {
      this.languageRegistry = new LanguageRegistry();
    }
    return this.languageRegistry;
  }

  private detectLanguage(lang: string): void {
    this.currentLanguage =
      this.getLanguageRegistry().getLanguageByIdentifier(lang);
  }

  private createDecorations(): DecorationSet {
    const builder = new RangeSetBuilder<Decoration>();
    const doc = this.view.state.doc;

    try {
      // Reset state tracking
      this.inCodeBlock = false;
      this.codeBlockLanguage = '';
      this.currentLanguage = null;
      this.inQuoteBlock = false;
      this.inCalloutBlock = false;
      this.inCommentBlock = false;
      this.inFootnote = false;
      this.previousTaskLine = null;
      this.previousTaskIndent = '';

      // Iterate through all lines in the document
      for (let lineNumber = 1; lineNumber <= doc.lines; lineNumber++) {
        const line = doc.line(lineNumber);
        const lineText = line.text;

        // Track all block states
        this.updateBlockStates(lineText);

        // Skip highlighting if code blocks are disabled and we're in a code block
        if (this.inCodeBlock && !this.settings.includeCodeBlocks) {
          continue;
        }

        // Skip highlighting if quote blocks are disabled and we're in a quote block
        if (this.inQuoteBlock && !this.settings.includeCalloutBlocks) {
          continue;
        }

        // Skip highlighting if callout blocks are disabled and we're in a callout block
        if (this.inCalloutBlock && !this.settings.includeCalloutBlocks) {
          continue;
        }

        // Skip highlighting if comment blocks are disabled and we're in a comment block
        if (this.inCommentBlock && !this.settings.includeCommentBlocks) {
          continue;
        }

        // Check if this line contains a task
        let match = null;
        let useCodeRegex = false;
        let contentForTaskDetection = lineText;
        let positionOffset = 0;

        // Handle footnote tasks with a more robust approach
        if (this.inFootnote) {
          // Check if this line matches footnote pattern and extract task content
          const footnoteMarkerMatch = lineText.match(FOOTNOTE_DEFINITION_REGEX);
          if (footnoteMarkerMatch) {
            // Extract content after footnote marker for task detection
            const contentAfterFootnote = lineText.substring(
              footnoteMarkerMatch[0].length,
            );

            // Check if the content after footnote marker contains a task
            if (this.parser.testRegex.test(contentAfterFootnote)) {
              // Use the original parser regex but adjust positions
              const contentMatch =
                this.parser.testRegex.exec(contentAfterFootnote);
              if (contentMatch) {
                match = contentMatch;
                // Use the position after the footnote marker
                positionOffset = footnoteMarkerMatch[0].length;
              }
            }
          }
        }

        // Handle single-line comment blocks (%% ... %%)
        const singleLineCommentMatch = SINGLE_LINE_COMMENT_REGEX.test(lineText);
        if (singleLineCommentMatch && this.settings.includeCommentBlocks) {
          // Extract content between %% markers for task detection
          contentForTaskDetection = lineText
            .replace(/^\s*%%\s*/, '')
            .replace(/\s*%%$/, '');
          // Calculate position offset to account for the leading %% marker
          const leadingMarkerMatch = lineText.match(/^\s*%%\s*/);
          if (leadingMarkerMatch) {
            positionOffset = leadingMarkerMatch[0].length;
          }
        }

        // Skip task detection in multi-line comment blocks when comment formatting is disabled
        if (this.inCommentBlock && !this.settings.includeCommentBlocks) {
          // Don't detect tasks in multi-line comment blocks when comment blocks are disabled
          match = null;
        } else if (
          this.inCodeBlock &&
          this.settings.includeCodeBlocks &&
          this.currentLanguage &&
          this.settings.languageCommentSupport.enabled
        ) {
          // Use language-specific regex for code blocks when language comment support is enabled
          const codeRegex = TaskParser.buildCodeRegex(
            this.parser.allKeywords || [],
            this.currentLanguage,
          );
          if (codeRegex.test.test(lineText)) {
            match = codeRegex.test.exec(lineText);
            useCodeRegex = true;
          }
        } else if (
          this.inCodeBlock &&
          this.settings.includeCodeBlocks &&
          (!this.currentLanguage ||
            !this.settings.languageCommentSupport.enabled)
        ) {
          // Use standard regex for code blocks when language comment support is disabled or no language detected
          if (this.parser.testRegex.test(lineText)) {
            match = this.parser.testRegex.exec(lineText);
          }
        } else if (
          !this.inCommentBlock ||
          this.settings.includeCommentBlocks ||
          (singleLineCommentMatch && this.settings.includeCommentBlocks)
        ) {
          // Use standard regex for non-code blocks, but skip if we're in a comment block and comment blocks are disabled
          if (this.parser.testRegex.test(contentForTaskDetection)) {
            match = this.parser.testRegex.exec(contentForTaskDetection);
          }
        }

        if (match && match[4]) {
          // match[4] contains the keyword
          const keyword = match[4];

          // For footnotes, we need to find the keyword position directly in the original line text
          let keywordStart = 0;
          let keywordEnd = 0;

          if (this.inFootnote) {
            // Find the actual position of the keyword in the original line text
            const footnoteMarkerMatch = lineText.match(
              FOOTNOTE_DEFINITION_REGEX,
            );
            if (footnoteMarkerMatch) {
              // Search for the keyword after the footnote marker
              const contentAfterFootnote = lineText.substring(
                footnoteMarkerMatch[0].length,
              );
              const keywordInContent = contentAfterFootnote.indexOf(keyword);
              if (keywordInContent !== -1) {
                keywordStart = footnoteMarkerMatch[0].length + keywordInContent;
                keywordEnd = keywordStart + keyword.length;
              } else {
                // Fallback: search the entire line
                keywordStart = lineText.indexOf(keyword);
                keywordEnd = keywordStart + keyword.length;
              }
            } else {
              // Fallback: search the entire line
              keywordStart = lineText.indexOf(keyword);
              keywordEnd = keywordStart + keyword.length;
            }
          } else {
            // For non-footnote content, use the original logic
            keywordStart = contentForTaskDetection.indexOf(keyword);
            keywordEnd = keywordStart + keyword.length;

            // Adjust positions for single-line comment blocks
            if (singleLineCommentMatch) {
              keywordStart += positionOffset;
              keywordEnd += positionOffset;
            }
          }

          // Track this as a task line for potential SCHEDULED/DEADLINE detection
          this.previousTaskLine = lineNumber;
          this.previousTaskIndent = lineText.substring(
            0,
            lineText.length - lineText.trimStart().length,
          );

          // For code blocks with language comment support, we need to find the actual keyword position
          // considering comment prefixes
          if (
            useCodeRegex &&
            this.currentLanguage &&
            this.settings.languageCommentSupport.enabled
          ) {
            // Try to find the keyword more precisely in code context
            const commentPatterns = (this.currentLanguage as LanguageDefinition)
              .patterns;
            const singleLinePattern = commentPatterns?.singleLine;

            if (singleLinePattern) {
              const commentMatch = singleLinePattern.exec(lineText);
              if (commentMatch) {
                // Find keyword after comment prefix
                const afterComment = lineText.substring(
                  commentMatch.index + commentMatch[0].length,
                );
                const keywordInComment = afterComment.indexOf(keyword);
                if (keywordInComment !== -1) {
                  keywordStart =
                    commentMatch.index +
                    commentMatch[0].length +
                    keywordInComment;
                  keywordEnd = keywordStart + keyword.length;
                }
              }
            }
          }

          const startPos = line.from + keywordStart;
          const endPos = line.from + keywordEnd;

          // All keywords use the same styling - no group-based CSS classes
          let cssClasses = 'todoseq-keyword-formatted';

          // Add completed keyword class for strikethrough styling on the keyword itself
          if (isCompletedKeywordUtil(keyword, this.settings)) {
            cssClasses += ' todoseq-completed-keyword';
          }

          if (this.inCodeBlock && this.settings.includeCodeBlocks) {
            cssClasses += ' code-block-task-keyword';

            if (
              this.settings.languageCommentSupport.enabled &&
              this.currentLanguage
            ) {
              cssClasses += ' code-comment-task-keyword';
            }
          } else if (
            (this.inCommentBlock || singleLineCommentMatch) &&
            this.settings.includeCommentBlocks
          ) {
            cssClasses += ' comment-block-task-keyword';
          } else if (this.inQuoteBlock && this.settings.includeCalloutBlocks) {
            // Add nesting level to CSS class (e.g., quote-block-task-keyword-2 for > > TODO)
            cssClasses += ` quote-block-task-keyword-${this.quoteNestingLevel}`;
          } else if (
            this.inCalloutBlock &&
            this.settings.includeCalloutBlocks
          ) {
            cssClasses += ' callout-block-task-keyword';
          } else if (this.inFootnote) {
            cssClasses += ' footnote-task-keyword';
          }

          builder.add(
            startPos,
            endPos,
            Decoration.mark({
              class: cssClasses,
              attributes: {
                'data-task-keyword': keyword,
                'aria-label': `Task keyword: ${keyword}`,
                role: 'mark',
                tabindex: '0', // Make keyboard accessible
              },
            }),
          );

          // Add separate span for task text in completed tasks
          if (isCompletedKeywordUtil(keyword, this.settings)) {
            // Calculate task text position (text after keyword)
            const taskTextStart = line.from + keywordEnd;
            const taskTextEnd = line.to; // End of line

            // Only create task text decoration if there's actual text after keyword
            if (taskTextStart < taskTextEnd) {
              builder.add(
                taskTextStart,
                taskTextEnd,
                Decoration.mark({
                  class: 'todoseq-completed-task-text',
                  attributes: {
                    'data-completed-task-text': 'true',
                  },
                }),
              );
            }
          }
        }

        // Process priority tokens on this line
        this.processPriorityTokens(lineText, line, builder);

        // Check if this line contains SCHEDULED: or DEADLINE: and follows a task line
        this.checkAndDecorateDateLine(lineNumber, lineText, line, builder);
      }

      return builder.finish();
    } catch (error) {
      console.error('Error creating task decorations:', error);
      // Return empty decorations on error to prevent breaking the editor
      return Decoration.none;
    }
  }

  private updateCodeBlockState(lineText: string): void {
    const codeBlockMatch = /^\s*(```|~~~)\s*(\S+)?$/.exec(lineText);
    if (codeBlockMatch) {
      if (!this.inCodeBlock) {
        // Starting a new code block
        this.inCodeBlock = true;
        this.codeBlockLanguage = codeBlockMatch[2] || '';
        this.detectLanguage(this.codeBlockLanguage);
      } else {
        // Ending code block
        this.inCodeBlock = false;
        this.codeBlockLanguage = '';
        this.currentLanguage = null;
      }
    }
  }

  private updateBlockStates(lineText: string): void {
    // Update code block state
    this.updateCodeBlockState(lineText);

    // Update quote/callout block state and nesting level
    const quoteMatch = /^\s*>/?.exec(lineText);
    if (quoteMatch) {
      // Check if this is a callout block (e.g., > [!info])
      const calloutMatch = /^\s*>\[!\w+\]-?\s+/.exec(lineText);
      this.inCalloutBlock = !!calloutMatch;
      this.inQuoteBlock = !calloutMatch;

      // Calculate quote nesting level (count consecutive ">" characters)
      const quotePrefixMatch = lineText.match(/^>\s*/);
      if (quotePrefixMatch) {
        const quotePrefix = quotePrefixMatch[0];
        this.quoteNestingLevel = (quotePrefix.match(/>/g) || []).length;
      } else {
        this.quoteNestingLevel = 0;
      }
    } else {
      this.inQuoteBlock = false;
      this.inCalloutBlock = false;
      this.quoteNestingLevel = 0;
    }

    // Update footnote state
    if (FOOTNOTE_DEFINITION_REGEX.test(lineText)) {
      this.inFootnote = true;
    } else {
      this.inFootnote = false;
    }

    // Update comment block state using same logic as task parser
    if (COMMENT_BLOCK_REGEX.test(lineText)) {
      // Check if this is a single-line comment block (%% ... %%)
      const singleLineCommentMatch = SINGLE_LINE_COMMENT_REGEX.test(lineText);

      if (singleLineCommentMatch) {
        // For single-line comment blocks, treat as comment context for this line only
        // Don't affect the persistent comment block state
        // The single-line case is handled separately in the main loop
      } else {
        // For multi-line comment blocks, toggle the block state
        this.inCommentBlock = !this.inCommentBlock;
      }
    }
    // Note: We don't reset inCommentBlock here because we want to maintain
    // the state between opening and closing %% markers for multi-line blocks
  }

  /**
   * Check if a line contains SCHEDULED: or DEADLINE: and apply appropriate decorations
   * if it follows a task line at the same indent level
   */
  private checkAndDecorateDateLine(
    lineNumber: number,
    lineText: string,
    line: { from: number; to: number },
    builder: RangeSetBuilder<Decoration>,
  ): void {
    // Only check for date lines if we have a previous task line
    if (this.previousTaskLine === null) {
      return;
    }

    // Check if this line is immediately after the task line (with possible empty lines in between)
    const linesSinceTask = lineNumber - this.previousTaskLine;

    // Only consider lines that are close to the task line (within 5 lines)
    if (linesSinceTask > 5) {
      // Too far from task line, reset tracking
      this.previousTaskLine = null;
      this.previousTaskIndent = '';
      return;
    }

    // Check if this line contains SCHEDULED: or DEADLINE:
    const trimmedLine = lineText.trim();
    let dateLineType: 'scheduled' | 'deadline' | null = null;

    // Handle callout blocks (lines starting with >)
    if (lineText.startsWith('>')) {
      const contentAfterArrow = trimmedLine.substring(1).trim();
      if (contentAfterArrow.startsWith('SCHEDULED:')) {
        dateLineType = 'scheduled';
      } else if (contentAfterArrow.startsWith('DEADLINE:')) {
        dateLineType = 'deadline';
      }
    } else if (trimmedLine.startsWith('SCHEDULED:')) {
      dateLineType = 'scheduled';
    } else if (trimmedLine.startsWith('DEADLINE:')) {
      dateLineType = 'deadline';
    }

    // If this is a date line, check if it matches the indent level of the previous task
    if (dateLineType !== null) {
      const lineIndent = lineText.substring(
        0,
        lineText.length - trimmedLine.length,
      );

      // Check if the indent matches or is deeper than the task indent
      if (
        lineIndent === this.previousTaskIndent ||
        lineIndent.startsWith(this.previousTaskIndent)
      ) {
        // Apply full-line decoration
        const lineStartPos = line.from;
        const lineEndPos = line.to;

        // Determine CSS classes based on line type
        const lineClass =
          dateLineType === 'scheduled'
            ? 'todoseq-scheduled-line'
            : 'todoseq-deadline-line';
        const keywordClass =
          dateLineType === 'scheduled'
            ? 'todoseq-scheduled-keyword'
            : 'todoseq-deadline-keyword';

        // Apply decoration to the entire line
        builder.add(
          lineStartPos,
          lineEndPos,
          Decoration.mark({
            class: lineClass,
            attributes: {
              'data-date-line-type': dateLineType,
              'aria-label': `${dateLineType} date line`,
              role: 'note',
            },
          }),
        );

        // Apply specific styling to the keyword itself
        const keyword =
          dateLineType === 'scheduled' ? 'SCHEDULED:' : 'DEADLINE:';
        const keywordStart = trimmedLine.indexOf(keyword);
        // const keywordEnd = keywordStart + keyword.length;
        const keywordStartPos =
          line.from + (lineText.length - trimmedLine.length) + keywordStart;
        const keywordEndPos = keywordStartPos + keyword.length;

        builder.add(
          keywordStartPos,
          keywordEndPos,
          Decoration.mark({
            class: keywordClass,
            attributes: {
              'data-date-keyword': keyword,
              'aria-label': `${dateLineType} keyword`,
              role: 'mark',
            },
          }),
        );

        // Continue tracking for additional date lines (both SCHEDULED and DEADLINE)
        // Don't reset tracking here, allow finding multiple date lines after a single task
      }
    } else if (linesSinceTask > 1 && !trimmedLine) {
      // Empty line, continue tracking for potential date lines
      // Don't reset the task tracking
    } else if (linesSinceTask > 0 && trimmedLine) {
      // Non-empty line that's not a date line, reset tracking
      this.previousTaskLine = null;
      this.previousTaskIndent = '';
    }

    // Add limit to prevent infinite tracking - reset after 10 lines
    if (linesSinceTask > 10) {
      this.previousTaskLine = null;
      this.previousTaskIndent = '';
    }
  }

  /**
   * Check if the editor is in Live Preview mode
   * Priority pills should only be rendered in Live Preview, not Source mode
   * Note: The is-live-preview class is on the parent .markdown-source-view element, not .cm-editor
   */
  private isLivePreviewMode(): boolean {
    return (
      this.view.dom.parentElement?.classList.contains('is-live-preview') ??
      false
    );
  }

  /**
   * Check if a line is a task line (starts with - [ ] or - [x])
   * Priority tokens should only be decorated on actual task lines
   */
  private isTaskLine(lineText: string): boolean {
    // Use the parser's test regex to check if this line contains a task
    return this.parser.testRegex.test(lineText);
  }

  /**
   * Process priority tokens [#A], [#B], [#C] in a line and add decorations
   */
  private processPriorityTokens(
    lineText: string,
    line: { from: number; to: number },
    builder: RangeSetBuilder<Decoration>,
  ): void {
    // Check if we're in Live Preview mode
    const isLivePreview = this.isLivePreviewMode();

    // Skip if this is not a task line - priority pills only appear on tasks
    if (!this.isTaskLine(lineText)) {
      return;
    }

    // Skip if in code block and code blocks disabled
    if (this.inCodeBlock && !this.settings.includeCodeBlocks) {
      return;
    }

    // Skip if in quote block and callout blocks disabled
    if (
      (this.inQuoteBlock || this.inCalloutBlock) &&
      !this.settings.includeCalloutBlocks
    ) {
      return;
    }

    // Skip if in comment block and comment blocks disabled
    if (this.inCommentBlock && !this.settings.includeCommentBlocks) {
      return;
    }

    // Create a regex with global flag to find all matches
    const regex = new RegExp(PRIORITY_TOKEN_REGEX.source, 'g');
    let match: RegExpExecArray | null;

    while ((match = regex.exec(lineText)) !== null) {
      const leadingSpace = match[1] || '';
      const letter = match[2];
      const trailingSpace = match[3] || '';

      // Calculate absolute positions
      const tokenStart = line.from + match.index;
      const tokenEnd = tokenStart + match[0].length;

      // The actual [#A] part (without surrounding whitespace)
      const pillStart = tokenStart + leadingSpace.length;
      const pillEnd = tokenEnd - trailingSpace.length;

      // In Source mode: always show colored text (no pill)
      // In Live Preview: show colored text when cursor is near, otherwise show pill widget
      const showRawText =
        !isLivePreview || this.isCursorNearPriority(pillStart, pillEnd);

      if (showRawText) {
        // Show raw text with colored formatting class
        builder.add(
          pillStart,
          pillEnd,
          Decoration.mark({
            class: `cm-priority-raw cm-priority-${letter.toLowerCase()}`,
            attributes: {
              'data-priority': letter,
            },
          }),
        );
      } else {
        // Replace with widget (Live Preview only, when cursor not near)
        const priority = this.getPriorityLevel(letter);
        const widget = new PriorityWidget(letter, priority);

        builder.add(
          pillStart,
          pillEnd,
          Decoration.replace({
            widget: widget,
            inclusive: false,
          }),
        );
      }
    }
  }

  public updateDecorations(): void {
    this.decorations = this.createDecorations();
  }

  public getDecorations(): DecorationSet {
    return this.decorations;
  }

  /**
   * Dispose of resources and clean up event listeners
   */
  public dispose(): void {
    // Clear any pending disposables
    this.disposables.forEach((dispose) => dispose());
    this.disposables = [];
  }
}

// ViewPlugin for CodeMirror 6
export const taskKeywordPlugin = (
  settings: TodoTrackerSettings,
  getParser: () => TaskParser | null,
) => {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      private settings: TodoTrackerSettings;
      private getParser: () => TaskParser | null;
      private settingsDetector: SettingsChangeDetector;
      private wasLivePreviewMode: boolean | null = null;

      constructor(view: EditorView) {
        this.settings = settings;
        this.getParser = getParser;
        this.settingsDetector = new SettingsChangeDetector();
        this.settingsDetector.initialize(settings);
        // Initialize the mode state
        this.wasLivePreviewMode = this.isLivePreviewMode(view);
        this.updateDecorations(view);
      }

      /**
       * Check if the editor is in Live Preview mode
       */
      private isLivePreviewMode(view: EditorView): boolean {
        return (
          view.dom.parentElement?.classList.contains('is-live-preview') ?? false
        );
      }

      /**
       * Check if the editor mode has changed (Source <-> Live Preview)
       */
      private hasModeChanged(view: EditorView): boolean {
        const currentMode = this.isLivePreviewMode(view);
        if (this.wasLivePreviewMode !== currentMode) {
          this.wasLivePreviewMode = currentMode;
          return true;
        }
        return false;
      }

      private updateDecorations(view: EditorView): void {
        if (!this.settings.formatTaskKeywords) {
          // When formatting is disabled, return empty decorations
          this.decorations = Decoration.none;
        } else {
          const parser = this.getParser();
          if (!parser) {
            // If parser is not available, return empty decorations
            this.decorations = Decoration.none;
            return;
          }
          const decorator = new TaskKeywordDecorator(
            view,
            this.settings,
            parser,
          );
          this.decorations = decorator.getDecorations();
        }
      }

      update(update: ViewUpdate) {
        // Always check if formatting is enabled/disabled
        if (!this.settings.formatTaskKeywords) {
          this.decorations = Decoration.none;
          return;
        }

        // Recreate decorations when document changes, viewport changes, settings have changed,
        // selection changes (for cursor proximity detection of priority pills),
        // or when switching between Source mode and Live Preview mode
        if (
          update.docChanged ||
          update.viewportChanged ||
          update.selectionSet ||
          this.settingsDetector.hasFormattingSettingsChanged(this.settings) ||
          this.hasModeChanged(update.view)
        ) {
          this.updateDecorations(update.view);
          this.settingsDetector.updatePreviousState(this.settings);
        }
      }
    },
    {
      decorations: (value) => value.decorations,
    },
  );
};
