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
  
  /** Alternative keywords for this language */
  keywords?: string[];
  
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

// Base comment patterns for C-style languages
const C_STYLE_COMMENTS: LanguageCommentPatterns = {
  singleLine: /^\s*\/\/\s+/,            // starts with //
  multiLineStart: /^\s*\/\*+\s*/,       // starts with /* or /**
  multiLineEnd: /\s*\*\/\s*$/,          // ends with */
  multiLineAdditional: /^\s*\*?\s*/,    // optional preceding spaces, may include a *
  inline: /.*\s+\/\/\s+|.*\s+\/\*\s+/,  // support both // and /* */ inline comments
};

// Base comment patterns for hash-style languages
const HASH_STYLE_COMMENTS: LanguageCommentPatterns = {
  singleLine: /^\s*#\s+/, // starts with #
  multiLineStart: undefined,
  multiLineEnd: undefined,
  multiLineAdditional: undefined,
  inline: /.*\s+#\s+/, // starts with # after code
};

// C language definition
const C_LANGUAGE: LanguageDefinition = {
  name: 'c',
  keywords: ['c'],
  patterns: C_STYLE_COMMENTS,
};

// C++ language definition
const CPP_LANGUAGE: LanguageDefinition = {
  name: 'cpp',
  keywords: ['cpp', 'c++'],
  patterns: C_STYLE_COMMENTS,
};

// C# language definition
const CSHARP_LANGUAGE: LanguageDefinition = {
  name: 'csharp',
  keywords: ['csharp', 'cs'],
  patterns: {
    ...C_STYLE_COMMENTS,
    singleLine: /^\s*\/\/\/?\s+/, // starts with // or ///
  },
};

// Dockerfile language definition
const DOCKERFILE_LANGUAGE: LanguageDefinition = {
  name: 'dockerfile',
  keywords: ['dockerfile'],
  patterns: HASH_STYLE_COMMENTS,
};

// Go language definition
const GOLANG_LANGUAGE: LanguageDefinition = {
  name: 'go',
  patterns: C_STYLE_COMMENTS,
};

// INI language definition
const INI_LANGUAGE: LanguageDefinition = {
  name: 'ini',
  keywords: ['ini'],
  patterns: {
    singleLine: /^\s*[;#]\s+/, // starts with ; or #
    multiLineStart: undefined,
    multiLineEnd: undefined,
    multiLineAdditional: undefined,
    inline: /.*\s+[;#]\s+/, // starts with ; or # after code
  },
};

// Java language definition
const JAVA_LANGUAGE: LanguageDefinition = {
  name: 'java',
  patterns: C_STYLE_COMMENTS,
};

// JavaScript language definition
const JAVASCRIPT_LANGUAGE: LanguageDefinition = {
  name: 'javascript',
  keywords: ['javascript', 'js'],
  patterns: C_STYLE_COMMENTS,
};

// Kotlin language definition
const KOTLIN_LANGUAGE: LanguageDefinition = {
  name: 'kotlin',
  keywords: ['kotlin'],
  patterns: C_STYLE_COMMENTS,
};

// PowerShell language definition
const POWERSHELL_LANGUAGE: LanguageDefinition = {
  name: 'powershell',
  keywords: ['powershell'],
  patterns: {
    singleLine: /^\s*#\s+/,             // starts with #
    multiLineStart: /^\s*<#\s*/,        // starts with <#
    multiLineEnd: /\s*#\s*$/,           // ends with #>
    multiLineAdditional: /^\s*\*?\s*/,  // optional preceding spaces, may include a *
    inline: /.*\s+#\s+|.*\s+<#\s+/,     // support both # and <# #> inline comments
  },
};

// Python language definition
const PYTHON_LANGUAGE: LanguageDefinition = {
  name: 'python',
  keywords: ['python', 'py'],
  patterns: {
    singleLine: /^\s*#\s+/,             // starts with #
    multiLineStart: /^\s*['"]{3}\s+/,   // starts with ''' or """
    multiLineEnd: /\s*['"]{3}\s*$/,     // ends with ''' or """
    multiLineAdditional: /^\s*/,        // optional preceeding spaces
    inline: /.*\s+#\s+/,                // starts with #
  },
};

// R language definition
const R_LANGUAGE: LanguageDefinition = {
  name: 'r',
  keywords: ['r'],
  patterns: HASH_STYLE_COMMENTS,
};

// Ruby language definition
const RUBY_LANGUAGE: LanguageDefinition = {
  name: 'ruby',
  patterns: {
    singleLine: /^\s*#\s+/,           // starts with #
    multiLineStart: /^\s*=begin\s+/,  // starts with =begin
    multiLineEnd: /\s*=end\s*$/,      // ends with =end
    multiLineAdditional: /^\s*/,      // optional preceding spaces
    inline: /.*\s+#\s+/,              // starts with #
  },
};

// Rust language definition
const RUST_LANGUAGE: LanguageDefinition = {
  name: 'rust',
  keywords: ['rust'],
  patterns: {
    singleLine: /^\s*\/\/[\/!]?\s+/,      // starts with //, /// or //!
    multiLineStart: /^\s*\/\*\*?\s+/,     // starts with /* or /**
    multiLineEnd: /\s*\*\/\s*$/,          // ends with */
    multiLineAdditional: /^\s*\*?\s*/,    // optional preceding spaces, may include a *
    inline: /.*\s+\/\/\s+|.*\s+\/\*\s+/,  // support both // and /* */ inline comments
  },
};

// Shell language definition (Bash/Zsh/Fish)
const SHELL_LANGUAGE: LanguageDefinition = {
  name: 'shell',
  keywords: ['shell', 'sh', 'bash'],
  patterns: HASH_STYLE_COMMENTS,
};

// SQL language definition
const SQL_LANGUAGE: LanguageDefinition = {
  name: 'sql',
  patterns: {
    singleLine: /^\s*--\s+|\s*#\s+/,    // starts with -- or # (MySQL style)
    multiLineStart: /^\s*\/\*+\s+/,     // starts with /* or /**
    multiLineEnd: /\s*\*\/\s*$/,        // ends with */
    multiLineAdditional: /^\s*\*?\s*/,  // optional preceesing spaces, may include a *
    inline: /.*\s+--\s+|.*\s+\/\*\s+/,  // support both -- and /* */ inline comments
  },
};

// Swift language definition
const SWIFT_LANGUAGE: LanguageDefinition = {
  name: 'swift',
  keywords: ['swift'],
  patterns: {
    ...C_STYLE_COMMENTS,
    singleLine: /^\s*\/\/\/?\s+/, // starts with //, ///
  },
};

// TOML language definition
const TOML_LANGUAGE: LanguageDefinition = {
  name: 'toml',
  keywords: ['toml'],
  patterns: HASH_STYLE_COMMENTS,
};

// TypeScript language definition
const TYPESCRIPT_LANGUAGE: LanguageDefinition = {
  name: 'typescript',
  keywords: ['typescript', 'ts'],
  patterns: C_STYLE_COMMENTS,
};

// YAML language definition
const YAML_LANGUAGE: LanguageDefinition = {
  name: 'yaml',
  keywords: ['yaml', 'yml'],
  patterns: HASH_STYLE_COMMENTS,
};

/**
 * Language registry for managing programming language comment patterns
 */
export class LanguageRegistry {
  private languages: Map<string, LanguageDefinition> = new Map();
  private keywordToLanguage: Map<string, LanguageDefinition> = new Map();

  constructor() {
    this.registerDefaultLanguages();
  }

  /**
   * Register supported languages 
   * Some languages support multiple keywords for identification
   */
  private registerDefaultLanguages(): void {
    this.registerLanguage(C_LANGUAGE);
    this.registerLanguage(CPP_LANGUAGE);
    this.registerLanguage(CSHARP_LANGUAGE);
    this.registerLanguage(DOCKERFILE_LANGUAGE);
    this.registerLanguage(GOLANG_LANGUAGE);
    this.registerLanguage(INI_LANGUAGE);
    this.registerLanguage(JAVA_LANGUAGE);
    this.registerLanguage(JAVASCRIPT_LANGUAGE);
    this.registerLanguage(KOTLIN_LANGUAGE);
    this.registerLanguage(POWERSHELL_LANGUAGE);
    this.registerLanguage(PYTHON_LANGUAGE);
    this.registerLanguage(R_LANGUAGE);
    this.registerLanguage(RUBY_LANGUAGE);
    this.registerLanguage(RUST_LANGUAGE);
    this.registerLanguage(SHELL_LANGUAGE);
    this.registerLanguage(SQL_LANGUAGE);
    this.registerLanguage(SWIFT_LANGUAGE);
    this.registerLanguage(TOML_LANGUAGE);
    this.registerLanguage(TYPESCRIPT_LANGUAGE);
    this.registerLanguage(YAML_LANGUAGE);
  }

  /**
   * Register a new language
   * @param language The language definition to register
   */
  registerLanguage(language: LanguageDefinition): void {
    this.languages.set(language.name.toLowerCase(), language);
    
    // Register additional keywords if they exist
    if (language.keywords) {
      language.keywords.forEach(keyword => {
        this.keywordToLanguage.set(keyword.toLowerCase(), language);
      });
    }
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
   * Get language by keyword (case-insensitive)
   * @param keyword The language keyword
   * @returns The language definition or null if not found
   */
  getLanguageByKeyword(keyword: string): LanguageDefinition | null {
    return this.keywordToLanguage.get(keyword.toLowerCase()) || null;
  }

  /**
   * Get language by name or keyword (case-insensitive)
   * @param identifier The language name or keyword
   * @returns The language definition or null if not found
   */
  getLanguageByIdentifier(identifier: string): LanguageDefinition | null {
    return this.getLanguage(identifier) || this.getLanguageByKeyword(identifier);
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