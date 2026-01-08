import {
  EditorView,
  Decoration,
  DecorationSet,
  ViewPlugin,
  ViewUpdate,
} from '@codemirror/view';
import { RangeSetBuilder } from '@codemirror/state';
import { TodoTrackerSettings } from '../settings/settings';
import { TaskParser, COMMENT_BLOCK_REGEX } from '../parser/task-parser';
import {
  LanguageRegistry,
  LanguageDefinition,
} from '../parser/language-registry';
import { SettingsChangeDetector } from '../utils/settings-utils';

export class TaskKeywordDecorator {
  private decorations: DecorationSet;
  private parser: TaskParser;
  private settings: TodoTrackerSettings;
  private languageRegistry: LanguageRegistry | null = null;
  private currentLanguage: LanguageDefinition | null = null;
  private inCodeBlock = false;
  private codeBlockLanguage = '';
  private inQuoteBlock = false;
  private inCalloutBlock = false;
  private inCommentBlock = false;
  private disposables: Array<() => void> = [];

  // Track task lines to detect SCHEDULED/DEADLINE lines that follow them
  private previousTaskLine: number | null = null;
  private previousTaskIndent = '';

  constructor(
    private view: EditorView,
    settings: TodoTrackerSettings
  ) {
    this.settings = settings;
    this.parser = TaskParser.create(settings);
    this.decorations = this.createDecorations();
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

        // Handle single-line comment blocks (%% ... %%)
        const singleLineCommentMatch = /^\s*%%.*%%$/.test(lineText);
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
            this.currentLanguage
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
          singleLineCommentMatch
        ) {
          // Use standard regex for non-code blocks, but skip if we're in a comment block and comment blocks are disabled
          if (this.parser.testRegex.test(contentForTaskDetection)) {
            match = this.parser.testRegex.exec(contentForTaskDetection);
          }
        }

        if (match && match[4]) {
          // match[4] contains the keyword
          const keyword = match[4];
          let keywordStart = contentForTaskDetection.indexOf(keyword);
          let keywordEnd = keywordStart + keyword.length;

          // Track this as a task line for potential SCHEDULED/DEADLINE detection
          this.previousTaskLine = lineNumber;
          this.previousTaskIndent = lineText.substring(
            0,
            lineText.length - lineText.trimStart().length
          );

          // Adjust positions for single-line comment blocks
          if (singleLineCommentMatch) {
            keywordStart += positionOffset;
            keywordEnd += positionOffset;
          }

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
                  commentMatch.index + commentMatch[0].length
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

          // Determine which CSS classes to apply based on context and settings
          let cssClasses = 'todoseq-keyword-formatted';

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
            cssClasses += ' quote-block-task-keyword';
          } else if (
            this.inCalloutBlock &&
            this.settings.includeCalloutBlocks
          ) {
            cssClasses += ' callout-block-task-keyword';
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
            })
          );
        }

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

    // Update quote/callout block state
    const quoteMatch = /^\s*>/?.exec(lineText);
    if (quoteMatch) {
      // Check if this is a callout block (e.g., > [!info])
      const calloutMatch = /^\s*>\[!\w+\]-?\s+/.exec(lineText);
      this.inCalloutBlock = !!calloutMatch;
      this.inQuoteBlock = !calloutMatch;
    } else {
      this.inQuoteBlock = false;
      this.inCalloutBlock = false;
    }

    // Update comment block state using same logic as task parser
    if (COMMENT_BLOCK_REGEX.test(lineText)) {
      // Check if this is a single-line comment block (%% ... %%)
      const singleLineCommentMatch = /^\s*%%.*%%$/.test(lineText);

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
    line: any,
    builder: RangeSetBuilder<Decoration>
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
        lineText.length - trimmedLine.length
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
          })
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
          })
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
export const taskKeywordPlugin = (settings: TodoTrackerSettings) => {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      private settings: TodoTrackerSettings;
      private settingsDetector: SettingsChangeDetector;

      constructor(view: EditorView) {
        this.settings = settings;
        this.settingsDetector = new SettingsChangeDetector();
        this.settingsDetector.initialize(settings);
        this.updateDecorations(view);
      }

      private updateDecorations(view: EditorView): void {
        if (!this.settings.formatTaskKeywords) {
          // When formatting is disabled, return empty decorations
          this.decorations = Decoration.none;
        } else {
          const decorator = new TaskKeywordDecorator(view, this.settings);
          this.decorations = decorator.getDecorations();
        }
      }

      update(update: ViewUpdate) {
        // Always check if formatting is enabled/disabled
        if (!this.settings.formatTaskKeywords) {
          this.decorations = Decoration.none;
          return;
        }

        // Recreate decorations when document changes, viewport changes, or settings have changed
        if (
          update.docChanged ||
          update.viewportChanged ||
          this.settingsDetector.hasFormattingSettingsChanged(this.settings)
        ) {
          this.updateDecorations(update.view);
          this.settingsDetector.updatePreviousState(this.settings);
        }
      }
    },
    {
      decorations: (value) => value.decorations,
    }
  );
};
