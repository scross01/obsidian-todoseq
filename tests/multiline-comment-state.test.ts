import { MultilineCommentState } from '../src/multiline-comment-state';
import { LanguageDefinition } from '../src/code-block-tasks';

// Mock language definition for testing
const mockLanguageDefinition: LanguageDefinition = {
  name: 'test-language',
  patterns: {
    singleLine: /\/\/.*$/,
    multiLineStart: /\/\*/,
    multiLineEnd: /\*\//
  }
};

describe('MultilineCommentState', () => {
  let state: MultilineCommentState;

  beforeEach(() => {
    state = new MultilineCommentState();
  });

  describe('setLanguage', () => {
    it('should set the language and reset state', () => {
      state.setLanguage(mockLanguageDefinition);
      expect(state['currentLanguage']).toBe(mockLanguageDefinition);
      expect(state['inMultilineComment']).toBe(false);
      expect(state['multilineCommentIndent']).toBe('');
    });

    it('should handle null language', () => {
      state.setLanguage(null);
      expect(state['currentLanguage']).toBe(null);
      expect(state['inMultilineComment']).toBe(false);
      expect(state['multilineCommentIndent']).toBe('');
    });
  });

  describe('reset', () => {
    it('should reset the comment state', () => {
      state['inMultilineComment'] = true;
      state['multilineCommentIndent'] = '    ';
      state.reset();
      expect(state['inMultilineComment']).toBe(false);
      expect(state['multilineCommentIndent']).toBe('');
    });
  });

  describe('handleLine', () => {
    beforeEach(() => {
      state.setLanguage(mockLanguageDefinition);
    });

    it('should return empty state when no language is set', () => {
      state.setLanguage(null);
      const result = state.handleLine('/* comment */');
      expect(result).toEqual({ inMultilineComment: false, multilineCommentIndent: '' });
    });

    it('should detect entering a multi-line comment', () => {
      const line = '    /* TODO test task';
      const result = state.handleLine(line);
      expect(result).toEqual({ 
        inMultilineComment: true, 
        multilineCommentIndent: '    ' 
      });
      expect(state['inMultilineComment']).toBe(true);
      expect(state['multilineCommentIndent']).toBe('    ');
    });

    it('should detect staying in a multi-line comment', () => {
      // First, enter a comment
      state['inMultilineComment'] = true;
      state['multilineCommentIndent'] = '    ';
      
      const line = '    * TODO more content';
      const result = state.handleLine(line);
      expect(result).toEqual({ 
        inMultilineComment: true, 
        multilineCommentIndent: '    ' 
      });
    });

    it('should detect exiting a multi-line comment', () => {
      // First, enter a comment
      state['inMultilineComment'] = true;
      state['multilineCommentIndent'] = '    ';
      
      const line = '    */';
      const result = state.handleLine(line);
      expect(result).toEqual({ 
        inMultilineComment: false, 
        multilineCommentIndent: '' 
      });
      expect(state['inMultilineComment']).toBe(false);
      expect(state['multilineCommentIndent']).toBe('');
    });

    it('should handle different indentation levels', () => {
      const line = '\t\t/* TODO test task';
      const result = state.handleLine(line);
      expect(result).toEqual({ 
        inMultilineComment: true, 
        multilineCommentIndent: '\t\t' 
      });
      expect(state['inMultilineComment']).toBe(true);
      expect(state['multilineCommentIndent']).toBe('\t\t');
    });

    it('should handle empty multi-line start pattern', () => {
      const languageWithoutStart: LanguageDefinition = {
        name: 'no-start',
        patterns: {
          singleLine: /\/\/.*$/,
          multiLineStart: undefined,
          multiLineEnd: /\*\//
        }
      };
      
      state.setLanguage(languageWithoutStart);
      const line = '    /* TODO test task';
      const result = state.handleLine(line);
      expect(result).toEqual({ 
        inMultilineComment: false, 
        multilineCommentIndent: '' 
      });
    });

    it('should handle empty multi-line end pattern', () => {
      const languageWithoutEnd: LanguageDefinition = {
        name: 'no-end',
        patterns: {
          singleLine: /\/\/.*$/,
          multiLineStart: /\/\*/,
          multiLineEnd: undefined
        }
      };
      
      state.setLanguage(languageWithoutEnd);
      
      // Enter a comment
      state.handleLine('    /* TODO test task');
      expect(state['inMultilineComment']).toBe(true);
      
      // Try to exit (should not work)
      const line = '    */';
      const result = state.handleLine(line);
      expect(result).toEqual({ 
        inMultilineComment: true, 
        multilineCommentIndent: '    ' 
      });
      expect(state['inMultilineComment']).toBe(true);
    });

    it('should handle lines without comment patterns', () => {
      state['inMultilineComment'] = true;
      state['multilineCommentIndent'] = '    ';
      
      const line = '    const x = 5; // not a comment end';
      const result = state.handleLine(line);
      expect(result).toEqual({ 
        inMultilineComment: true, 
        multilineCommentIndent: '    ' 
      });
    });
  });
});