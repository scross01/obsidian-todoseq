import { KeywordManager } from '../src/utils/keyword-manager';
import { TransitionParser } from '../src/services/transition-parser';
import { DefaultSettings } from '../src/settings/settings-types';

describe('TransitionParser', () => {
  let keywordManager: KeywordManager;

  beforeEach(() => {
    keywordManager = new KeywordManager(DefaultSettings);
  });

  describe('Simple chain transitions', () => {
    it('should parse simple chain TODO -> DOING -> DONE', () => {
      const parser = new TransitionParser(keywordManager);
      const result = parser.parse(['TODO -> DOING -> DONE']);

      expect(result.transitions.get('TODO')).toBe('DOING');
      expect(result.transitions.get('DOING')).toBe('DONE');
      expect(result.transitions.get('DONE')).toBeUndefined(); // No explicit transition
      expect(result.errors).toHaveLength(0);
    });

    it('should parse simple chain LATER -> NOW -> DONE', () => {
      const parser = new TransitionParser(keywordManager);
      const result = parser.parse(['LATER -> NOW -> DONE']);

      expect(result.transitions.get('LATER')).toBe('NOW');
      expect(result.transitions.get('NOW')).toBe('DONE');
      expect(result.errors).toHaveLength(0);
    });

    it('should handle empty lines', () => {
      const parser = new TransitionParser(keywordManager);
      const result = parser.parse(['', 'TODO -> DOING', '']);

      expect(result.transitions.size).toBe(1);
      expect(result.transitions.get('TODO')).toBe('DOING');
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('Group alternative transitions', () => {
    it('should parse group alternative (WAIT | WAITING) -> IN-PROGRESS', () => {
      const parser = new TransitionParser(keywordManager);
      const result = parser.parse(['(WAIT | WAITING) -> IN-PROGRESS']);

      expect(result.transitions.get('WAIT')).toBe('IN-PROGRESS');
      expect(result.transitions.get('WAITING')).toBe('IN-PROGRESS');
      expect(result.errors).toHaveLength(0);
    });

    it('should parse group alternative with three states (A | B | C) -> DONE', () => {
      const parser = new TransitionParser(keywordManager);
      const result = parser.parse(['(TODO | LATER | NOW) -> DOING']);

      expect(result.transitions.get('TODO')).toBe('DOING');
      expect(result.transitions.get('LATER')).toBe('DOING');
      expect(result.transitions.get('NOW')).toBe('DOING');
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('Terminal state transitions', () => {
    it('should parse terminal state shorthand TODO -> [DONE]', () => {
      const parser = new TransitionParser(keywordManager);
      const result = parser.parse(['TODO -> [DONE]']);

      expect(result.transitions.get('TODO')).toBe('DONE');
      expect(result.transitions.get('DONE')).toBe('DONE'); // Self-transition
      expect(TransitionParser.isTerminalState('DONE', result.transitions)).toBe(
        true,
      );
      expect(result.errors).toHaveLength(0);
    });

    it('should parse explicit terminal state TODO -> DONE -> DONE', () => {
      const parser = new TransitionParser(keywordManager);
      const result = parser.parse(['TODO -> DONE -> DONE']);

      expect(result.transitions.get('TODO')).toBe('DONE');
      expect(result.transitions.get('DONE')).toBe('DONE'); // Self-transition
      expect(TransitionParser.isTerminalState('DONE', result.transitions)).toBe(
        true,
      );
      expect(result.errors).toHaveLength(0);
    });

    it('should identify non-terminal states', () => {
      const parser = new TransitionParser(keywordManager);
      const result = parser.parse(['TODO -> DOING -> DONE']);

      expect(TransitionParser.isTerminalState('TODO', result.transitions)).toBe(
        false,
      );
      expect(
        TransitionParser.isTerminalState('DOING', result.transitions),
      ).toBe(false);
      expect(TransitionParser.isTerminalState('DONE', result.transitions)).toBe(
        false,
      );
    });
  });

  describe('Invalid keyword handling', () => {
    it('should error on invalid keyword', () => {
      const parser = new TransitionParser(keywordManager);
      const result = parser.parse(['INVALID -> DOING']);

      expect(result.transitions.size).toBe(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].type).toBe('invalid-keyword');
      expect(result.errors[0].message).toContain('INVALID');
    });

    it('should error on invalid keyword in group alternative', () => {
      const parser = new TransitionParser(keywordManager);
      const result = parser.parse(['(TODO | INVALID) -> DOING']);

      expect(result.transitions.size).toBe(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].type).toBe('invalid-keyword');
      expect(result.errors[0].message).toContain('INVALID');
    });

    it('should error on invalid terminal state', () => {
      const parser = new TransitionParser(keywordManager);
      const result = parser.parse(['TODO -> [INVALID]']);

      expect(result.transitions.size).toBe(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].type).toBe('invalid-keyword');
    });

    it('should continue parsing valid lines after error', () => {
      const parser = new TransitionParser(keywordManager);
      const result = parser.parse([
        'INVALID -> DOING',
        'TODO -> DOING',
        'LATER -> NOW',
      ]);

      expect(result.transitions.size).toBe(2);
      expect(result.transitions.get('TODO')).toBe('DOING');
      expect(result.transitions.get('LATER')).toBe('NOW');
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].message).toContain('INVALID');
    });
  });

  describe('Conflict detection', () => {
    it('should detect conflicting declarations', () => {
      const parser = new TransitionParser(keywordManager);
      const result = parser.parse(['TODO -> DOING', 'TODO -> DONE']);

      expect(result.transitions.size).toBe(1);
      expect(result.transitions.get('TODO')).toBe('DOING'); // First declaration wins
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].type).toBe('conflict');
      expect(result.errors[0].message).toContain('TODO');
      expect(result.errors[0].message).toContain('already has a next state');
    });

    it('should detect conflicts in group alternatives', () => {
      const parser = new TransitionParser(keywordManager);
      const result = parser.parse(['(TODO | LATER) -> DOING', 'LATER -> NOW']);

      expect(result.transitions.size).toBe(2); // TODO->DOING and LATER->DOING (first wins)
      expect(result.transitions.get('TODO')).toBe('DOING');
      expect(result.transitions.get('LATER')).toBe('DOING'); // First declaration wins
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].type).toBe('conflict');
      expect(result.errors[0].message).toContain('LATER');
    });
  });

  describe('Syntax error handling', () => {
    it('should error on missing -> operator', () => {
      const parser = new TransitionParser(keywordManager);
      const result = parser.parse(['TODO DOING']);

      expect(result.transitions.size).toBe(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].type).toBe('syntax-error');
      expect(result.errors[0].message).toContain(
        'expected at least one -> operator',
      );
    });

    it('should handle whitespace gracefully', () => {
      const parser = new TransitionParser(keywordManager);
      const result = parser.parse([
        '  TODO  ->  DOING  ->  DONE  ',
        '  ( WAIT  |  WAITING )  ->  IN-PROGRESS  ',
      ]);

      expect(result.transitions.get('TODO')).toBe('DOING');
      expect(result.transitions.get('DOING')).toBe('DONE');
      expect(result.transitions.get('WAIT')).toBe('IN-PROGRESS');
      expect(result.transitions.get('WAITING')).toBe('IN-PROGRESS');
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('Complex scenarios', () => {
    it('should parse multiple statements', () => {
      const parser = new TransitionParser(keywordManager);
      const result = parser.parse([
        'TODO -> DOING -> DONE',
        '(WAIT | WAITING) -> IN-PROGRESS',
        'LATER -> [DONE]', // Terminal state shorthand
      ]);

      expect(result.transitions.get('TODO')).toBe('DOING');
      expect(result.transitions.get('DOING')).toBe('DONE');
      expect(result.transitions.get('WAIT')).toBe('IN-PROGRESS');
      expect(result.transitions.get('WAITING')).toBe('IN-PROGRESS');
      expect(result.transitions.get('LATER')).toBe('DONE');
      expect(result.transitions.get('DONE')).toBe('DONE'); // Terminal
      expect(result.errors).toHaveLength(0);
    });

    it('should handle mix of valid and invalid statements', () => {
      const parser = new TransitionParser(keywordManager);
      const result = parser.parse([
        'TODO -> DOING',
        'INVALID -> DONE',
        'LATER -> NOW',
        '(TODO | INVALID2) -> DONE',
      ]);

      expect(result.transitions.size).toBe(2);
      expect(result.transitions.get('TODO')).toBe('DOING');
      expect(result.transitions.get('LATER')).toBe('NOW');
      expect(result.errors).toHaveLength(2);
    });

    it('should handle case insensitivity', () => {
      const parser = new TransitionParser(keywordManager);
      const result = parser.parse(['todo -> doing -> done']);

      expect(result.transitions.get('TODO')).toBe('DOING');
      expect(result.transitions.get('DOING')).toBe('DONE');
      expect(result.errors).toHaveLength(0);
    });
  });
});
