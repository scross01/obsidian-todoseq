import { DEFAULT_PENDING_STATES, DEFAULT_ACTIVE_STATES, DEFAULT_COMPLETED_STATES } from '../task';
import { LanguageCommentPatterns, LanguageDefinition, RegexPair } from './language-registry';
import { LIST_MARKER_REGEX } from './task-parser';
import { LIST_MARKER_PART } from './task-parser';

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
    const multiLineAdditionalPattern = patterns.multilineMid?.source || '';
        
    // Test regex: matches any comment style followed by task keyword
    const testPattern = `^[ \\t]*(?:${singleLinePattern}|${multiLineStartPattern}|${multiLineAdditionalPattern})(?:${escaped})\\s+`;
    const test = new RegExp(testPattern);
    
    // Capture regex: captures indent, comment, list marker, keyword, and text
    // Handle trailing comment characters separately in the parsing logic
    // For single-line comments, remove the ^\s* part to avoid double-matching whitespace
    const modifiedSingleLinePattern = singleLinePattern.replace(/^\^\\s\*/, '');
    const modifiedMultiLineStartPattern = multiLineStartPattern.replace(/^\^\\s\*/, '');
    // For multi-line additional comments, remove the ^\s* part to avoid double-matching whitespace
    const modifiedMultiLineAdditionalPattern = multiLineAdditionalPattern.replace(/^\^\\s\*/, '');
    // For inline comments, keep the original pattern since it needs to match the content before the comment
    
    const commentPattern = `(?:${modifiedSingleLinePattern}|${modifiedMultiLineStartPattern}|${modifiedMultiLineAdditionalPattern})`;
    const capturePattern = `^([ \\t]*)(${commentPattern})?(${LIST_MARKER_PART})?(${escaped})\\s+([^\\n]*?)(\\s*\\*\\/\\s*|\\s*#\\s*>)?$`;
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
        
    const test = new RegExp(`^[ \\t]*${LIST_MARKER_REGEX.source}(?:${escaped})\\s+`);
    const capture = new RegExp(`^([ \\t]*)(${LIST_MARKER_REGEX.source})?(${escaped})\\s+`);
    
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
