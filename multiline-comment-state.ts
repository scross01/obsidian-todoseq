import { LanguageDefinition } from './code-block-tasks';

/**
 * Manages the state of multiline comment parsing for code blocks
 */
export class MultilineCommentState {
  private inMultilineComment: boolean = false;
  private multilineCommentIndent: string = '';
  private currentLanguage: LanguageDefinition | null = null;

  /**
   * Update the language context
   * @param language The language definition for the current code block
   */
  setLanguage(language: LanguageDefinition | null): void {
    this.currentLanguage = language;
    this.reset();
  }

  /**
   * Reset the comment state
   */
  reset(): void {
    this.inMultilineComment = false;
    this.multilineCommentIndent = '';
  }

  /**
   * Handle multiline comment state for a given line
   * @param line The current line being processed
   * @returns Updated multiline comment state and indent
   */
  handleLine(line: string): { inMultilineComment: boolean; multilineCommentIndent: string } {
    if (!this.currentLanguage) {
      return { inMultilineComment: false, multilineCommentIndent: '' };
    }

    const patterns = this.currentLanguage.patterns;
    
    if (!this.inMultilineComment) {
      // Check if we're entering a multi-line comment
      if (patterns.multiLineStart) {
        const match = patterns.multiLineStart.exec(line);
        if (match) {
          this.inMultilineComment = true;
          this.multilineCommentIndent = line.substring(0, line.length - line.trimStart().length);
          return { inMultilineComment: true, multilineCommentIndent: this.multilineCommentIndent };
        }
      }
    } else {
      // Check if we're exiting a multi-line comment
      if (patterns.multiLineEnd) {
        const match = patterns.multiLineEnd.exec(line);
        if (match) {
          this.inMultilineComment = false;
          this.multilineCommentIndent = '';
          return { inMultilineComment: false, multilineCommentIndent: '' };
        }
      }
    }
    
    return { inMultilineComment: this.inMultilineComment, multilineCommentIndent: this.multilineCommentIndent };
  }

  /**
   * Check if we're currently inside a multiline comment
   */
  get isInMultilineComment(): boolean {
    return this.inMultilineComment;
  }

  /**
   * Get the current multiline comment indent
   */
  get getMultilineCommentIndent(): string {
    return this.multilineCommentIndent;
  }
}