import { DEFAULT_PENDING_STATES, DEFAULT_ACTIVE_STATES, DEFAULT_COMPLETED_STATES } from './task';

// Type definitions for language-specific comment support

export interface LanguageCommentPatterns {
  /** Regular expression for single-line comment start */
  singleLine: RegExp;
  
  /** Regular expression for multi-line comment start (optional) */
  multiLineStart?: RegExp;
  
  /** Regular expression for multi-line comment end (optional) */
  multiLineEnd?: RegExp;
  
  /** Regular expression for additional lines within multi-line comments (optional) */
  multiLineAdditional?: RegExp;
  
  /** Regular expression for inline comment start (optional) */
  inline?: RegExp;
}

export interface LanguageDefinition {
  /** Unique language identifier */
  name: string;
  
  /** Comment patterns for this language */
  patterns: LanguageCommentPatterns;
  }

export interface LanguageCommentSupportSettings {
  /** Enable/disable language comment support */
  enabled: boolean;
  
  /** List of enabled languages */
  languages: string[];
}

export interface RegexPair {
  /** Test regex to check if a line contains a task */
  test: RegExp;
  
  /** Capture regex to extract task components */
  capture: RegExp;
}

// SQL language definition
const SQL_LANGUAGE: LanguageDefinition = {
  name: 'sql',
  patterns: {
    singleLine: /^\s*--\s+/,           // starts with --
    multiLineStart: /^\s*\/\*+\s+/,    // starts with /* or /**
    multiLineEnd: /\s*\*\/\s*$/,       // ends with */
    multiLineAdditional: /^\s*\*?\s*/, // optional preceesing spaces, may include a * 
    inline: /.*\s+--\s+/
  },
};

// Python language definition
const PYTHON_LANGUAGE: LanguageDefinition = {
  name: 'python',
  patterns: {
    singleLine: /^\s*#\s+/,            // starts with #
    multiLineStart: /^\s*['"]{3}\s+/,  // starts with ''' or """
    multiLineEnd: /\s*['"]{3}\s*$/,    // ends with ''' or """
    multiLineAdditional: /^\s*/,       // optional preceeding spaces
    inline: /.*\s+#\s+/
  },
};

// Java language definition
const JAVA_LANGUAGE: LanguageDefinition = {
  name: 'java',
  patterns: {
    singleLine: /^\s*\/\/\s+/,         // starts with //
    multiLineStart: /^\s*\/\*+\s+/,    // starts with /* or /**
    multiLineEnd: /\s*\*\/\s*$/,       // ends with */
    multiLineAdditional: /^\s*\*?\s*/, // optional preceesing spaces, may include a * 
    inline: /.*\s+\/\/\s+/
  },
};

/**
 * Language registry for managing programming language comment patterns
 */
export class LanguageRegistry {
  private languages: Map<string, LanguageDefinition> = new Map();

  constructor() {
    this.registerDefaultLanguages();
  }

  /**
   * Register default languages (SQL, Python, Java)
   */
  private registerDefaultLanguages(): void {
    this.registerLanguage(SQL_LANGUAGE);
    this.registerLanguage(PYTHON_LANGUAGE);
    this.registerLanguage(JAVA_LANGUAGE);
  }

  /**
   * Register a new language
   * @param language The language definition to register
   */
  registerLanguage(language: LanguageDefinition): void {
    this.languages.set(language.name.toLowerCase(), language);
  }

  /**
   * Get language by name (case-insensitive)
   * @param name The language name
   * @returns The language definition or null if not found
   */
  getLanguage(name: string): LanguageDefinition | null {
    return this.languages.get(name.toLowerCase()) || null;
  }

  /**
   * Get all registered languages
   * @returns Array of all language definitions
   */
  getAllLanguages(): LanguageDefinition[] {
    return Array.from(this.languages.values());
  }

  /**
   * Check if a language is enabled based on settings
   * @param name The language name
   * @param enabledLanguages Array of enabled language names
   * @returns True if the language is enabled
   */
  isLanguageEnabled(name: string, enabledLanguages: string[]): boolean {
    return enabledLanguages.includes(name.toLowerCase());
  }
}

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
    
    const commentPatterns = this.buildCommentPatterns(patterns);
    const listMarkerPart = `(?:(?:[-*+]|\\d+[.)]|[A-Za-z][.)]|\\([A-Za-z0-9]+\\))\\s*|[-*+]\\s*\\[[ \\x]\\]\\s*)?`;
    
    // Test regex: matches any comment style followed by task keyword
    const test = new RegExp(`^[ \\t]*${commentPatterns}(?:${escaped})\\s+`);
    
    // Capture regex: captures indent, comment, list marker, keyword, and text
    const capture = new RegExp(
      `^([ \\t]*)(${commentPatterns})?(${listMarkerPart})?(${escaped})\\s+`,
      'm' // multiline flag for better matching
    );
    
    return { test, capture };
  }

  /**
   * Build comment pattern regex from language patterns
   * @param patterns Language comment patterns
   * @returns Combined regex pattern string
   */
  private buildCommentPatterns(patterns: LanguageCommentPatterns): string {
    const patternParts: string[] = [];
    
    // Single-line comments
    if (patterns.singleLine) {
      patternParts.push(`(?:${patterns.singleLine.source})`);
    }
    
    // Multi-line comments (start)
    if (patterns.multiLineStart) {
      patternParts.push(`(?:${patterns.multiLineStart.source})`);
    }
    
    // Additional lines within multi-line comments
    if (patterns.multiLineAdditional) {
      patternParts.push(`(?:${patterns.multiLineAdditional.source})`);
    }
    
    // Inline comments
    if (patterns.inline) {
      patternParts.push(`(?:${patterns.inline.source})`);
    }
    
    return patternParts.join('|');
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