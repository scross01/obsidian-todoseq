// Type definitions for language-specific comment support

export interface LanguageCommentPatterns {
  /** Regular expression for single-line comment start */
  singleLine?: RegExp;
  
  /** Regular expression for multi-line comment start (optional) */
  multiLineStart?: RegExp;
  
  /** Regular expression for multi-line comment end (optional) */
  multiLineEnd?: RegExp;
  
  /** Regular expression for additional lines within multi-line comments (optional) */
  multilineMid?: RegExp;
  
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
}

export interface RegexPair {
  /** Test regex to check if a line contains a task */
  test: RegExp;
  
  /** Capture regex to extract task components */
  capture: RegExp;
}

// Base comment patterns for C-style languages
const C_STYLE_COMMENTS: LanguageCommentPatterns = {
  singleLine: /\/\//,             // starts with //
  multiLineStart: /\/\*{1,2}/,    // starts with /* or /**
  multiLineEnd: /\*\//,           // ends with */
  multilineMid: undefined,
};

// Base comment patterns for hash-style languages
const HASH_STYLE_COMMENTS: LanguageCommentPatterns = {
  singleLine: /#/,                // starts with #
  multiLineStart: undefined,
  multiLineEnd: undefined,
  multilineMid: undefined,
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
    singleLine: /\/\/\/?/, // starts with // or ///
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
    singleLine: /[;#]/, // starts with ; or #
    multiLineStart: undefined,
    multiLineEnd: undefined,
    multilineMid: undefined,
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
    singleLine: /#/,             // starts with #
    multiLineStart: /<#/,        // starts with <#
    multiLineEnd: /#>/,          // ends with #>
  },
};

// Python language definition
const PYTHON_LANGUAGE: LanguageDefinition = {
  name: 'python',
  keywords: ['python', 'py'],
  patterns: {
    singleLine: /#/,             // starts with #
    multiLineStart: /'''|"""/,   // starts with ''' or """
    multiLineEnd: /'''|"""/,     // ends with ''' or """
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
    singleLine: /#/,           // starts with #
    multiLineStart: /=begin/,  // starts with =begin
    multiLineEnd: /=end/,      // ends with =end
  },
};

// Rust language definition
const RUST_LANGUAGE: LanguageDefinition = {
  name: 'rust',
  keywords: ['rust'],
  patterns: {
    singleLine: /\/\/[/!]?/,      // starts with //, /// or //!
    multiLineStart: /\/\*\*?/,     // starts with /* or /**
    multiLineEnd: /\*\//,          // ends with */
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
    singleLine: /--/,            // starts with --
    multiLineStart: /\/\*+/,     // starts with /* or /**
    multiLineEnd: /\*\//,        // ends with */
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
    if (!name) return null;
    return this.languages.get(name.toLowerCase()) || null;
  }

  /**
   * Get language by keyword (case-insensitive)
   * @param keyword The language keyword
   * @returns The language definition or null if not found
   */
  getLanguageByKeyword(keyword: string): LanguageDefinition | null {
    if (!keyword) return null;
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
}
