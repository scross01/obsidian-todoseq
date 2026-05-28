import { Task } from '../types/task';
import { ITaskParser, ParserConfig } from './types';
import { LanguageRegistry, LanguageDefinition } from './language-registry';
import { KeywordManager } from '../utils/keyword-manager';
import { TFile } from 'obsidian';

interface BlockState {
  inComment: boolean;
  inString: boolean;
}

const EXTENSION_TO_LANGUAGE: Record<string, string> = {
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.mts': 'typescript',
  '.py': 'python',
  '.rb': 'ruby',
  '.java': 'java',
  '.rs': 'rust',
  '.go': 'go',
  '.c': 'c',
  '.h': 'c',
  '.cpp': 'cpp',
  '.hpp': 'cpp',
  '.cc': 'cpp',
  '.cxx': 'cpp',
  '.cs': 'csharp',
  '.swift': 'swift',
  '.kt': 'kotlin',
  '.kts': 'kotlin',
  '.sh': 'shell',
  '.bash': 'shell',
  '.zsh': 'shell',
  '.yaml': 'yaml',
  '.yml': 'yaml',
  '.toml': 'toml',
  '.sql': 'sql',
  '.ini': 'ini',
  '.r': 'r',
  '.dockerfile': 'dockerfile',
  '.ps1': 'powershell',
  '.psm1': 'powershell',
  '.psd1': 'powershell',
};

export const SUPPORTED_EXTENSIONS = Object.keys(EXTENSION_TO_LANGUAGE);

const STRING_PATTERNS: Record<string, RegExp> = {
  cstyle: /'[^'\\]*(?:\\.[^'\\]*)*'|"[^"\\]*(?:\\.[^"\\]*)*"/g,
  jsts: /'[^'\\]*(?:\\.[^'\\]*)*'|"[^"\\]*(?:\\.[^"\\]*)*"|`[^`\\]*(?:\\.[^`\\]*)*`/g,
  python:
    /'''[^']*(?:'[^']*)*'''|"""[^"]*(?:"[^"]*)*"""|'[^'\\]*(?:\\.[^'\\]*)*'|"[^"\\]*(?:\\.[^"\\]*)*"/g,
  shell: /'[^']*'|"[^"\\$`]*"/g,
  ruby: /'[^'\\]*(?:\\.[^'\\]*)*'|"[^"\\]*(?:\\.[^"\\]*)*"/g,
  sql: /'[^']*(?:''[^']*)*'/g,
};

const JSTS = new Set(['javascript', 'typescript']);
const PY = new Set(['python']);
const SH = new Set(['shell', 'dockerfile']);
const RB = new Set(['ruby']);
const SQ = new Set(['sql']);

function getStringPattern(languageName: string): RegExp | null {
  if (JSTS.has(languageName)) return STRING_PATTERNS.jsts;
  if (PY.has(languageName)) return STRING_PATTERNS.python;
  if (SH.has(languageName)) return STRING_PATTERNS.shell;
  if (RB.has(languageName)) return STRING_PATTERNS.ruby;
  if (SQ.has(languageName)) return STRING_PATTERNS.sql;
  return STRING_PATTERNS.cstyle;
}

const BLANK_CACHE = new Map<number, string>();

function blankString(length: number): string {
  let blank = BLANK_CACHE.get(length);
  if (blank === undefined) {
    blank = ' '.repeat(length);
    BLANK_CACHE.set(length, blank);
  }
  return blank;
}

const BLOCK_COMMENT_FAMILY: Record<string, string | null> = {
  c: 'c-style',
  cpp: 'c-style',
  csharp: 'c-style',
  java: 'c-style',
  javascript: 'c-style',
  typescript: 'c-style',
  go: 'c-style',
  rust: 'c-style',
  swift: 'c-style',
  kotlin: 'c-style',
  sql: 'c-style',
  python: 'python',
  ruby: 'ruby',
  powershell: 'powershell',
};

const BLOCK_STRING_FAMILY: Record<string, string | null> = {
  python: 'python',
};

const BLOCK_COMMENT_STARTS: Record<string, RegExp> = {
  'c-style': /\/\*/,
  python: /'''|"""/,
  ruby: /=begin/,
  powershell: /<#/,
};

const BLOCK_COMMENT_ENDS: Record<string, RegExp> = {
  'c-style': /\*\//,
  python: /'''|"""/,
  ruby: /=end/,
  powershell: /#>/,
};

const BLOCK_STRING_STARTS: Record<string, RegExp> = {
  python: /'''|"""/,
};

const BLOCK_STRING_ENDS: Record<string, RegExp> = {
  python: /'''|"""/,
};

/**
 * Code comment task parser for TODOseq.
 * Parses tasks from code files by detecting registered keywords in comments.
 */
export class CodeCommentTaskParser implements ITaskParser {
  readonly parserId = 'code-comment';
  readonly supportedExtensions = SUPPORTED_EXTENSIONS;

  private keywords: string[];
  private keywordManager: KeywordManager;
  private languageRegistry: LanguageRegistry;
  private langCache = new Map<string, LanguageDefinition | null>();

  constructor(
    keywordManager: KeywordManager,
    languageRegistry?: LanguageRegistry,
  ) {
    this.keywords = keywordManager.getAllKeywords();
    this.keywordManager = keywordManager;
    this.languageRegistry = languageRegistry ?? new LanguageRegistry();
  }

  static create(
    keywordManager: KeywordManager,
    languageRegistry?: LanguageRegistry,
  ): CodeCommentTaskParser {
    return new CodeCommentTaskParser(keywordManager, languageRegistry);
  }

  updateConfig(config: ParserConfig): void {
    if (config.keywordManager) {
      this.keywordManager = config.keywordManager;
    }
    this.keywords = config.keywords ?? this.keywordManager.getAllKeywords();
  }

  parseFile(content: string, path: string, file?: TFile): Task[] {
    const ext = this.getExtension(path);
    const lang = this.getLanguageForExtension(ext);
    if (!lang) return [];

    const lines = content.split('\n');
    const tasks: Task[] = [];
    const stringPattern = getStringPattern(lang.name);
    const blockFamily = BLOCK_COMMENT_FAMILY[lang.name] ?? null;
    const blockStringFamily = BLOCK_STRING_FAMILY[lang.name] ?? null;
    const blockState: BlockState = { inComment: false, inString: false };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      if (blockStringFamily) {
        this.updateBlockState(line, blockState, 'inString', blockStringFamily);
      }
      if (blockState.inString) continue;

      // Replace strings with spaces to preserve positions for keyword lookup
      const searchLine = stringPattern
        ? line.replace(stringPattern, (m) => blankString(m.length))
        : line;

      const commentIndex = this.findCommentStart(searchLine, lang);
      if (commentIndex !== -1) {
        const task = this.tryExtractTask(
          searchLine,
          commentIndex,
          i,
          line,
          path,
          lang,
        );
        if (task) {
          tasks.push(task);
          continue;
        }
      }

      // Multi-line comment tracking
      if (blockFamily) {
        const wasInComment = blockState.inComment;
        this.updateBlockState(line, blockState, 'inComment', blockFamily);
        if (blockState.inComment || wasInComment) {
          const task = this.tryExtractTask(searchLine, 0, i, line, path, lang);
          if (task) tasks.push(task);
        }
      }
    }

    return tasks;
  }

  parseLine(line: string, lineNumber: number, filePath: string): Task | null {
    const lang = this.getLanguageForPath(filePath);
    if (!lang) return null;

    const stringPattern = getStringPattern(lang.name);
    const searchLine = stringPattern
      ? line.replace(stringPattern, (m) => blankString(m.length))
      : line;

    const commentIndex = this.findCommentStart(searchLine, lang);
    if (commentIndex === -1) return null;

    return this.tryExtractTask(
      searchLine,
      commentIndex,
      lineNumber,
      line,
      filePath,
      lang,
    );
  }

  private static readonly COMMENT_PREFIX_RE = /^\s*(?:\/\/|#|--|;)/;

  isTaskLine(line: string): boolean {
    // Check against all known single-line comment patterns
    // instead of defaulting to C-style only via 'default.js'
    if (!CodeCommentTaskParser.COMMENT_PREFIX_RE.test(line)) return false;
    return this.keywords.some((kw) => line.includes(kw));
  }

  hasAnyKeyword(content: string): boolean {
    // Skip oversized files (>500KB) to avoid excessive allocation
    if (content.length > 512000) return true;
    return this.keywords.some((kw) => content.includes(kw));
  }

  private getExtension(path: string): string {
    const dotIndex = path.lastIndexOf('.');
    if (dotIndex === -1) return '';
    return path.slice(dotIndex).toLowerCase();
  }

  private getLanguageForPath(path: string): LanguageDefinition | null {
    const ext = this.getExtension(path);
    return this.getLanguageForExtension(ext);
  }

  private getLanguageForExtension(ext: string): LanguageDefinition | null {
    if (this.langCache.has(ext)) {
      return this.langCache.get(ext) ?? null;
    }
    const langName = EXTENSION_TO_LANGUAGE[ext];
    if (!langName) {
      this.langCache.set(ext, null);
      return null;
    }
    const lang = this.languageRegistry.getLanguage(langName);
    this.langCache.set(ext, lang ?? null);
    return lang ?? null;
  }

  /**
   * Find the start of a comment in a line (with strings already blanked out).
   */
  private findCommentStart(line: string, lang: LanguageDefinition): number {
    const patterns = lang.patterns;
    if (patterns.singleLine) {
      const match = line.match(patterns.singleLine);
      if (match && match.index !== undefined) return match.index;
    }
    if (patterns.multiLineStart) {
      const match = line.match(patterns.multiLineStart);
      if (match && match.index !== undefined) return match.index;
    }
    return -1;
  }

  /**
   * Try to extract a task from a line that has a comment.
   * searchLine has strings blanked (positions preserved), rawLine is the original.
   * commentIndex is the position of the comment delimiter in searchLine (same as rawLine).
   */
  private tryExtractTask(
    searchLine: string,
    commentIndex: number,
    lineNumber: number,
    rawLine: string,
    filePath: string,
    lang: LanguageDefinition,
  ): Task | null {
    const afterComment = searchLine.slice(commentIndex);

    let matchedKeyword: string | null = null;
    let keywordIndex = -1;

    for (const kw of this.keywords) {
      // Search the original text — only uppercase keywords (TODO, DOING, DONE) match
      const idx = afterComment.indexOf(kw);
      if (idx === -1) continue;

      // Check word boundaries to avoid substring matches (e.g. TODOLIST matching TODO)
      const beforeChar = idx > 0 ? afterComment[idx - 1] : '';
      const afterChar = afterComment[idx + kw.length];
      const isWordChar = (c: string) => c && /[A-Z0-9_]/i.test(c);
      if (isWordChar(beforeChar) || isWordChar(afterChar)) continue;

      if (keywordIndex === -1 || idx < keywordIndex) {
        matchedKeyword = kw;
        keywordIndex = idx;
      }
    }

    if (!matchedKeyword) return null;

    // Everything before the keyword in the raw line
    const rawKwIndex = commentIndex + keywordIndex;
    const indent = rawLine.slice(0, rawKwIndex);

    // Text after the keyword in the raw line
    const afterKw = rawLine.slice(rawKwIndex + matchedKeyword.length);
    const text = afterKw.replace(/^\s+/, '');

    const state = matchedKeyword;
    const completed = this.keywordManager.isCompleted(state);

    return {
      path: filePath,
      line: lineNumber,
      rawText: rawLine,
      indent,
      listMarker: '',
      text,
      state,
      completed,
      priority: null,
      scheduledDate: null,
      scheduledDateRepeat: null,
      deadlineDate: null,
      deadlineDateRepeat: null,
      closedDate: null,
      tail: '',
      urgency: null,
      tags: [],
      isDailyNote: false,
      dailyNoteDate: null,
      subtaskCount: 0,
      subtaskCompletedCount: 0,
    };
  }

  private updateBlockState(
    line: string,
    state: BlockState,
    field: 'inComment' | 'inString',
    family: string,
  ): void {
    const starts =
      field === 'inComment' ? BLOCK_COMMENT_STARTS : BLOCK_STRING_STARTS;
    const ends = field === 'inComment' ? BLOCK_COMMENT_ENDS : BLOCK_STRING_ENDS;

    const startPattern = starts[family];
    const endPattern = ends[family];
    if (!startPattern || !endPattern) return;

    if (state[field]) {
      if (endPattern.test(line)) {
        state[field] = false;
      }
    } else {
      if (startPattern.test(line)) {
        state[field] = true;
        if (endPattern.test(line)) {
          state[field] = false;
        }
      }
    }
  }
}
