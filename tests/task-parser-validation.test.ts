import { TaskParser } from '../src/parser/task-parser';
import { TodoTrackerSettings } from '../src/settings/settings';

describe('TaskParser keyword validation', () => {
  describe('validateKeywords', () => {
    it('should accept valid simple keywords', () => {
      const validKeywords = ['FIXME', 'HACK', 'TODO', 'NOTE'];
      expect(() => TaskParser['validateKeywords'](validKeywords)).not.toThrow();
    });

    it('should reject keywords with nested quantifiers', () => {
      const invalidKeywords = ['A*B*C', 'A+B+C', 'A?B?C'];
      expect(() => TaskParser['validateKeywords'](invalidKeywords)).toThrow('dangerous regex pattern');
    });

    it('should reject keywords with repeated quantifiers', () => {
      const invalidKeywords = ['A**', 'B++', 'C??'];
      expect(() => TaskParser['validateKeywords'](invalidKeywords)).toThrow('dangerous regex pattern');
    });

    it('should reject keywords with excessive repetitions', () => {
      const invalidKeywords = ['A*{10,}', 'B+{10,}', 'C?{10,}'];
      expect(() => TaskParser['validateKeywords'](invalidKeywords)).toThrow('dangerous regex pattern');
    });

    it('should reject keywords with backreferences', () => {
      const invalidKeywords = ['A(B)X\\1', '(X)Y\\2'];
      expect(() => TaskParser['validateKeywords'](invalidKeywords)).toThrow('dangerous regex pattern');
    });

    it('should reject keywords with lookaheads/lookbehinds', () => {
      const invalidKeywords = ['(?=A)', '(?!B)', '(?<=C)', '(?<!D)'];
      expect(() => TaskParser['validateKeywords'](invalidKeywords)).toThrow('dangerous regex pattern');
    });

    it('should reject very long keywords', () => {
      const longKeyword = 'A'.repeat(51); // 51 characters
      expect(() => TaskParser['validateKeywords']([longKeyword])).toThrow('dangerous regex pattern');
    });

    it('should reject empty keywords', () => {
      expect(() => TaskParser['validateKeywords']([''])).toThrow('empty keyword');
    });

    it('should reject whitespace-only keywords', () => {
      expect(() => TaskParser['validateKeywords'](['   '])).toThrow('whitespace-only');
    });

    it('should accept keywords with normal special characters after escaping', () => {
      const keywordsWithSpecialChars = ['FIX-ME', 'TODO_V2', 'NOTE.1'];
      expect(() => TaskParser['validateKeywords'](keywordsWithSpecialChars)).not.toThrow();
    });
  });

  describe('create method with validation', () => {
    const baseSettings: TodoTrackerSettings = {
      refreshInterval: 60,
      additionalTaskKeywords: [],
      includeCodeBlocks: false,
      includeCalloutBlocks: true,
      includeCommentBlocks: false,
      taskListViewMode: 'showAll',
      languageCommentSupport: { enabled: true },
      weekStartsOn: 'Monday',
      formatTaskKeywords: true
    };

    it('should create parser with valid keywords', () => {
      const settings = { ...baseSettings, additionalTaskKeywords: ['FIXME', 'HACK'] };
      expect(() => TaskParser.create(settings)).not.toThrow();
      const parser = TaskParser.create(settings);
      expect(parser).toBeInstanceOf(TaskParser);
    });

    it('should throw error with invalid keywords', () => {
      const settings = { ...baseSettings, additionalTaskKeywords: ['A*B*C'] };
      expect(() => TaskParser.create(settings)).toThrow('dangerous regex pattern');
    });

    it('should work with empty additional keywords', () => {
      const settings = { ...baseSettings, additionalTaskKeywords: [] };
      expect(() => TaskParser.create(settings)).not.toThrow();
      const parser = TaskParser.create(settings);
      expect(parser).toBeInstanceOf(TaskParser);
    });
  });
});