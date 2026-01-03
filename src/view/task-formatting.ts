import {
  EditorView,
  Decoration,
  DecorationSet,
  ViewPlugin,
  ViewUpdate
} from '@codemirror/view';
import { RangeSetBuilder } from '@codemirror/state';
import { TodoTrackerSettings } from '../settings/settings';
import { TaskParser } from '../parser/task-parser';
import { LanguageRegistry } from '../parser/language-registry';

export class TaskKeywordDecorator {
  private decorations: DecorationSet;
  private parser: TaskParser;
  private settings: TodoTrackerSettings;
  private languageRegistry: LanguageRegistry | null = null;
  private currentLanguage: any = null;
  private inCodeBlock: boolean = false;
  private codeBlockLanguage: string = '';
  
  constructor(private view: EditorView, settings: TodoTrackerSettings) {
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
    this.currentLanguage = this.getLanguageRegistry().getLanguageByIdentifier(lang);
  }
  
  private createDecorations(): DecorationSet {
    const builder = new RangeSetBuilder<Decoration>();
    const doc = this.view.state.doc;
    
    // Reset state tracking
    this.inCodeBlock = false;
    this.codeBlockLanguage = '';
    this.currentLanguage = null;
    
    // Iterate through all lines in the document
    for (let lineNumber = 1; lineNumber <= doc.lines; lineNumber++) {
      const line = doc.line(lineNumber);
      const lineText = line.text;
      
      // Track code block state
      this.updateCodeBlockState(lineText);
      
      // Skip highlighting if code blocks are disabled and we're in a code block
      if (this.inCodeBlock && !this.settings.includeCodeBlocks) {
        continue;
      }
      
      // Check if this line contains a task
      let match = null;
      let useCodeRegex = false;
      
      if (this.inCodeBlock && this.settings.includeCodeBlocks && this.currentLanguage && this.settings.languageCommentSupport.enabled) {
        // Use language-specific regex for code blocks when language comment support is enabled
        const codeRegex = TaskParser.buildCodeRegex(
          this.parser.allKeywords || [],
          this.currentLanguage
        );
        if (codeRegex.test.test(lineText)) {
          match = codeRegex.test.exec(lineText);
          useCodeRegex = true;
        }
      } else if (this.inCodeBlock && this.settings.includeCodeBlocks && (!this.currentLanguage || !this.settings.languageCommentSupport.enabled)) {
        // Use standard regex for code blocks when language comment support is disabled or no language detected
        if (this.parser.testRegex.test(lineText)) {
          match = this.parser.testRegex.exec(lineText);
        }
      } else {
        // Use standard regex for non-code blocks
        if (this.parser.testRegex.test(lineText)) {
          match = this.parser.testRegex.exec(lineText);
        }
      }
      
      if (match && match[4]) { // match[4] contains the keyword
        const keyword = match[4];
        let keywordStart = lineText.indexOf(keyword);
        let keywordEnd = keywordStart + keyword.length;
        
        // For code blocks with language comment support, we need to find the actual keyword position
        // considering comment prefixes
        if (useCodeRegex && this.currentLanguage && this.settings.languageCommentSupport.enabled) {
          // Try to find the keyword more precisely in code context
          const commentPatterns = this.currentLanguage.patterns;
          const singleLinePattern = commentPatterns.singleLine;
          const multiLineStartPattern = commentPatterns.multiLineStart;
          
          if (singleLinePattern) {
            const commentMatch = singleLinePattern.exec(lineText);
            if (commentMatch) {
              // Find keyword after comment prefix
              const afterComment = lineText.substring(commentMatch.index + commentMatch[0].length);
              const keywordInComment = afterComment.indexOf(keyword);
              if (keywordInComment !== -1) {
                keywordStart = commentMatch.index + commentMatch[0].length + keywordInComment;
                keywordEnd = keywordStart + keyword.length;
              }
            }
          }
        }
        
        const startPos = line.from + keywordStart;
        const endPos = line.from + keywordEnd;
        
        // Determine which CSS classes to apply based on context and settings
        let cssClasses = 'todo-keyword-formatted';
        
        if (this.inCodeBlock && this.settings.includeCodeBlocks) {
          cssClasses += ' code-block-task-keyword';
          
          if (this.settings.languageCommentSupport.enabled && this.currentLanguage) {
            cssClasses += ' code-comment-task-keyword';
          }
        }
        
        builder.add(startPos, endPos,
          Decoration.mark({
            class: cssClasses,
            attributes: {
              'data-task-keyword': keyword,
              'aria-role': 'presentation'
            }
          })
        );
      }
    }
    
    return builder.finish();
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
  
  public updateDecorations(): void {
    this.decorations = this.createDecorations();
  }
  
  public getDecorations(): DecorationSet {
    return this.decorations;
  }
  
  }

// ViewPlugin for CodeMirror 6
export const taskKeywordPlugin = (settings: TodoTrackerSettings) => {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      private settings: TodoTrackerSettings;
      private prevSettingsState: string = '';
      
      constructor(view: EditorView) {
        this.settings = settings;
        this.updateDecorations(view);
        this.updatePrevSettingsState();
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
      
      private updatePrevSettingsState(): void {
        // Track all settings that affect decoration creation and CSS classes
        this.prevSettingsState = JSON.stringify({
          formatTaskKeywords: this.settings.formatTaskKeywords,
          includeCodeBlocks: this.settings.includeCodeBlocks,
          languageCommentSupport: this.settings.languageCommentSupport
        });
      }
      
      private hasSettingsChanged(): boolean {
        const currentState = JSON.stringify({
          formatTaskKeywords: this.settings.formatTaskKeywords,
          includeCodeBlocks: this.settings.includeCodeBlocks,
          languageCommentSupport: this.settings.languageCommentSupport
        });
        return currentState !== this.prevSettingsState;
      }
      
      update(update: ViewUpdate) {
        // Always check if formatting is enabled/disabled
        if (!this.settings.formatTaskKeywords) {
          this.decorations = Decoration.none;
          return;
        }
        
        // Recreate decorations when document changes, viewport changes, or settings have changed
        if (update.docChanged || update.viewportChanged || this.hasSettingsChanged()) {
          this.updateDecorations(update.view);
          this.updatePrevSettingsState();
        }
      }
      
    },
    {
      decorations: (value) => value.decorations,
    }
  );
};