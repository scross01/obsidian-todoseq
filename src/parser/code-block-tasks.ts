import { DEFAULT_PENDING_STATES, DEFAULT_ACTIVE_STATES, DEFAULT_COMPLETED_STATES } from '../task';
import { LanguageCommentPatterns, LanguageDefinition, RegexPair } from './language-registry';

/**
 * Builds language-aware regex patterns for task detection
 */
export class LanguageAwareRegexBuilder {
  /**
   * Build regex for a specific language
   * @param keywords Array of task keywords to search for
   * @param language The language definition (or null for default)
   * @returns RegexPair with test and capture regex
   */
  buildRegex(keywords: string[], language: LanguageDefinition | null): RegexPair {
    if (!language) {
      return this.buildDefaultRegex(keywords);
    }
    
    return this.buildRegexForComments(keywords, language.patterns);
  }

  /**
   * Build regex with comment patterns for a specific language
   * @param keywords Array of task keywords to search for
   * @param patterns Language comment patterns
   * @returns RegexPair with test and capture regex
   */
  private buildRegexForComments(keywords: string[], patterns: LanguageCommentPatterns): RegexPair {
    const escaped = keywords
      .map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('|');
    
    // Build separate patterns for different comment types to handle capture groups correctly
    const singleLinePattern = patterns.singleLine?.source || '';
    const multiLineStartPattern = patterns.multiLineStart?.source || '';
    const multiLineAdditionalPattern = patterns.multiLineAdditional?.source || '';
    const inlinePattern = patterns.inline?.source || '';
    
    const listMarkerPart = `(?:(?:[-*+]|\\d+[.)]|[A-Za-z][.)]|\\([A-Za-z0-9]+\\))\\s*|[-*+]\\s*\\[[ \\x]\\]\\s*)?`;
    
    // Test regex: matches any comment style followed by task keyword
    const testPattern = `^[ \\t]*(?:${singleLinePattern}|${multiLineStartPattern}|${multiLineAdditionalPattern}|${inlinePattern})(?:${escaped})\\s+`;
    const test = new RegExp(testPattern);
    
    // Capture regex: captures indent, comment, list marker, keyword, and text
    // Handle trailing comment characters separately in the parsing logic
    // For single-line comments, remove the ^\s* part to avoid double-matching whitespace
    const modifiedSingleLinePattern = singleLinePattern.replace(/^\^\\s\*/, '');
    const modifiedMultiLineStartPattern = multiLineStartPattern.replace(/^\^\\s\*/, '');
    // For multi-line additional comments, remove the ^\s* part to avoid double-matching whitespace
    const modifiedMultiLineAdditionalPattern = multiLineAdditionalPattern.replace(/^\^\\s\*/, '');
    // For inline comments, keep the original pattern since it needs to match the content before the comment
    const modifiedInlinePattern = inlinePattern;
    
    const commentPattern = `(?:${modifiedSingleLinePattern}|${modifiedMultiLineStartPattern}|${modifiedMultiLineAdditionalPattern}|${modifiedInlinePattern})`;
    const capturePattern = `^([ \\t]*)(${commentPattern})?(${listMarkerPart})?(${escaped})\\s+([^\\n]*?)(\\s*\\*\\/\\s*|\\s*#\\s*>)?$`;
    const capture = new RegExp(capturePattern, 'm'); // multiline flag for better matching
    
    return { test, capture };
  }

  /**
   * Build default regex (fallback when no language is specified)
   * @param keywords Array of task keywords to search for
   * @returns RegexPair with test and capture regex
   */
  private buildDefaultRegex(keywords: string[]): RegexPair {
    const escaped = keywords
      .map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('|');
    
    const listMarkerPart = `(?:(?:[-*+]|\\d+[.)]|[A-Za-z][.)]|\\([A-Za-z0-9]+\\))\\s*|[-*+]\\s*\\[[ \\x]\\]\\s*)?`;
    
    const test = new RegExp(`^[ \\t]*${listMarkerPart}(?:${escaped})\\s+`);
    const capture = new RegExp(`^([ \\t]*)(${listMarkerPart})?(${escaped})\\s+`);
    
    return { test, capture };
  }

  /**
   * Build regex with all default keywords
   * @param language The language definition (or null for default)
   * @param additionalKeywords Additional keywords from settings
   * @returns RegexPair with test and capture regex
   */
  buildRegexWithAllKeywords(language: LanguageDefinition | null, additionalKeywords: string[] = []): RegexPair {
    const allKeywords = [
      ...Array.from(DEFAULT_PENDING_STATES),
      ...Array.from(DEFAULT_ACTIVE_STATES),
      ...Array.from(DEFAULT_COMPLETED_STATES),
      ...(additionalKeywords.filter(k => k && typeof k === 'string') as string[])
    ];
    
    return this.buildRegex(allKeywords, language);
  }
}

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
}