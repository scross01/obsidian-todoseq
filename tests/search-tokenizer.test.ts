import { SearchTokenizer } from '../src/search/search-tokenizer';
import { SearchToken } from '../src/search/search-types';

function tokenize(query: string): SearchToken[] {
  return SearchTokenizer.tokenize(query);
}

describe('SearchTokenizer', () => {
  describe('tokenize', () => {
    it('returns empty array for empty string', () => {
      expect(tokenize('')).toEqual([]);
    });

    it('returns empty array for whitespace-only string', () => {
      expect(tokenize('   ')).toEqual([]);
      expect(tokenize('\t\n  ')).toEqual([]);
    });

    it('tokenizes a single word', () => {
      expect(tokenize('hello')).toEqual([
        { type: 'word', value: 'hello', original: 'hello', position: 0 },
      ]);
    });

    it('tokenizes multiple words', () => {
      const tokens = tokenize('hello world');
      expect(tokens).toHaveLength(2);
      expect(tokens[0]).toEqual({
        type: 'word',
        value: 'hello',
        original: 'hello',
        position: 0,
      });
      expect(tokens[1]).toEqual({
        type: 'word',
        value: 'world',
        original: 'world',
        position: 6,
      });
    });

    it('ignores extra whitespace between words', () => {
      expect(tokenize('hello   world')).toHaveLength(2);
    });

    it('tokenizes a phrase', () => {
      expect(tokenize('"hello world"')).toEqual([
        {
          type: 'phrase',
          value: 'hello world',
          original: '"hello world"',
          position: 0,
        },
      ]);
    });

    it('tokenizes phrase with escaped quotes', () => {
      expect(tokenize('"hello \\"world\\""')).toEqual([
        {
          type: 'phrase',
          value: 'hello "world"',
          original: '"hello \\"world\\""',
          position: 0,
        },
      ]);
    });

    it('tokenizes OR operator', () => {
      expect(tokenize('hello OR world')[1]).toEqual({
        type: 'or',
        value: 'or',
        original: 'OR',
        position: 6,
      });
    });

    it('tokenizes AND operator', () => {
      expect(tokenize('hello AND world')[1]).toEqual({
        type: 'and',
        value: 'and',
        original: 'AND',
        position: 6,
      });
    });

    it('does not match lowercase or/and as operators', () => {
      const tokens = tokenize('hello or world');
      expect(tokens).toHaveLength(3);
      expect(tokens[1].type).toBe('word');
      expect(tokens[1].value).toBe('or');
    });

    it('tokenizes parentheses', () => {
      const tokens = tokenize('(hello)');
      expect(tokens[0]).toEqual({
        type: 'lparen',
        value: '(',
        original: '(',
        position: 0,
      });
      expect(tokens[1]).toEqual({
        type: 'word',
        value: 'hello',
        original: 'hello',
        position: 1,
      });
      expect(tokens[2]).toEqual({
        type: 'rparen',
        value: ')',
        original: ')',
        position: 6,
      });
    });

    it('tokenizes NOT operator', () => {
      const tokens = tokenize('-exclude');
      expect(tokens).toHaveLength(2);
      expect(tokens[0]).toEqual({
        type: 'not',
        value: '-',
        original: '-',
        position: 0,
      });
      expect(tokens[1]).toEqual({
        type: 'word',
        value: 'exclude',
        original: 'exclude',
        position: 1,
      });
    });

    it('tokenizes prefix filters', () => {
      const prefixTypes = [
        'path',
        'file',
        'tag',
        'state',
        'priority',
        'content',
        'scheduled',
        'deadline',
        'closed',
      ];
      for (const prefix of prefixTypes) {
        const tokens = tokenize(`${prefix}:value`);
        expect(tokens).toHaveLength(2);
        expect(tokens[0]).toEqual({
          type: 'prefix',
          value: prefix,
          original: `${prefix}:`,
          position: 0,
        });
        expect(tokens[1]).toEqual({
          type: 'prefix_value',
          value: 'value',
          original: 'value',
          position: prefix.length + 1,
        });
      }
    });

    it('tokenizes prefix with quoted value as prefix_value_quoted', () => {
      const tokens = tokenize('tag:"hello world"');
      expect(tokens).toHaveLength(2);
      expect(tokens[0]).toEqual({
        type: 'prefix',
        value: 'tag',
        original: 'tag:',
        position: 0,
      });
      expect(tokens[1].type).toBe('prefix_value_quoted');
      expect(tokens[1].value).toBe('hello world');
      expect(tokens[1].original).toBe('"hello world"');
    });

    it('tokenizes prefix_value with escaped quotes', () => {
      const tokens = tokenize('tag:"hello \\"world\\""');
      expect(tokens).toHaveLength(2);
      expect(tokens[1].type).toBe('prefix_value_quoted');
      expect(tokens[1].value).toBe('hello "world"');
    });

    it('tokenizes range operator', () => {
      const tokens = tokenize('scheduled:2024-01-01..2024-12-31');
      expect(tokens).toHaveLength(4);
      expect(tokens[0].type).toBe('prefix');
      expect(tokens[0].value).toBe('scheduled');
      expect(tokens[1].type).toBe('prefix_value');
      expect(tokens[1].value).toBe('2024-01-01');
      expect(tokens[2].type).toBe('range');
      expect(tokens[2].value).toBe('..');
      // After range, the value becomes a 'word' — the parser handles reclassification
      expect(tokens[3].type).toBe('word');
      expect(tokens[3].value).toBe('2024-12-31');
    });

    it('tokenizes range with no gap between prefix_value and range', () => {
      const tokens = tokenize('priority:high..medium');
      expect(tokens).toHaveLength(4);
      expect(tokens[0].type).toBe('prefix');
      expect(tokens[1].type).toBe('prefix_value');
      expect(tokens[1].value).toBe('high');
      expect(tokens[2].type).toBe('range');
      // After range, the value becomes a 'word' — the parser handles reclassification
      expect(tokens[3].type).toBe('word');
      expect(tokens[3].value).toBe('medium');
    });

    it('tokenizes property bracket syntax with key:value', () => {
      const tokens = tokenize('[type:Draft]');
      expect(tokens).toHaveLength(1);
      expect(tokens[0].type).toBe('property');
      expect(tokens[0].value).toBe('type:Draft');
    });

    it('tokenizes property bracket syntax with key only', () => {
      const tokens = tokenize('[type]');
      expect(tokens).toHaveLength(1);
      expect(tokens[0].type).toBe('property');
      expect(tokens[0].value).toBe('type');
    });

    it('tokenizes property bracket syntax with quoted key and value', () => {
      const tokens = tokenize('["status":"in progress"]');
      expect(tokens).toHaveLength(1);
      expect(tokens[0].type).toBe('property');
      expect(tokens[0].value).toBe('status:in progress');
    });

    it('tokenizes property in compound query', () => {
      const tokens = tokenize('hello [type:Draft] world');
      expect(tokens).toHaveLength(3);
      expect(tokens[0].type).toBe('word');
      expect(tokens[1].type).toBe('property');
      expect(tokens[1].value).toBe('type:Draft');
      expect(tokens[2].type).toBe('word');
    });

    it('handles prefix_value containing dashes', () => {
      const tokens = tokenize('path:my-folder');
      expect(tokens).toHaveLength(2);
      expect(tokens[0].type).toBe('prefix');
      expect(tokens[1].type).toBe('prefix_value');
      expect(tokens[1].value).toBe('my-folder');
    });

    it('skips lone double-quote character that does not match any pattern', () => {
      const tokens = tokenize('hello"world');
      expect(tokens).toHaveLength(2);
      expect(tokens[0].value).toBe('hello');
      expect(tokens[1].value).toBe('world');
    });

    it('tokenizes property with quoted key and unquoted value', () => {
      const tokens = tokenize('["key":value]');
      expect(tokens).toHaveLength(1);
      expect(tokens[0].type).toBe('property');
      expect(tokens[0].value).toBe('key:value');
    });

    it('tokenizes property with quoted key and empty value', () => {
      const tokens = tokenize('["key":]');
      expect(tokens).toHaveLength(1);
      expect(tokens[0].type).toBe('property');
      expect(tokens[0].value).toBe('key');
    });

    it('tokenizes property with quoted key only', () => {
      const tokens = tokenize('["key"]');
      expect(tokens).toHaveLength(1);
      expect(tokens[0].type).toBe('property');
      expect(tokens[0].value).toBe('key');
    });

    it('tokenizes property with unquoted key and quoted value via fallback', () => {
      const tokens = tokenize('[key:"value"]');
      expect(tokens).toHaveLength(1);
      expect(tokens[0].type).toBe('property');
      expect(tokens[0].value).toBe('key:value');
    });

    it('tokenizes property with value containing spaces', () => {
      const tokens = tokenize('[type:Draft OR Published]');
      expect(tokens).toHaveLength(1);
      expect(tokens[0].type).toBe('property');
      expect(tokens[0].value).toBe('type:Draft OR Published');
    });

    it('handles complex query with all token types', () => {
      const tokens = tokenize(
        '(tag:urgent OR state:DOING) path:"work notes" -archived',
      );
      expect(tokens.length).toBeGreaterThan(0);
      const types = tokens.map((t) => t.type);
      expect(types).toContain('lparen');
      expect(types).toContain('prefix');
      expect(types).toContain('prefix_value');
      expect(types).toContain('or');
      expect(types).toContain('rparen');
      expect(types).toContain('prefix_value_quoted');
      expect(types).toContain('not');
      expect(types).toContain('word');
    });

    it('skips characters that do not match any pattern', () => {
      // The @ character is consumed by the word pattern [^\s"()]+, so still one token
      const tokens = tokenize('hello@world');
      expect(tokens).toHaveLength(1);
      expect(tokens[0].type).toBe('word');
      expect(tokens[0].value).toBe('hello@world');
    });

    it('preserves position of each token', () => {
      const tokens = tokenize('foo bar');
      expect(tokens[0].position).toBe(0);
      expect(tokens[1].position).toBe(4);
    });
  });

  describe('getBindingPower', () => {
    it('returns highest binding power for not', () => {
      expect(SearchTokenizer.getBindingPower('not')).toBe(100);
    });

    it('returns binding power 80 for and', () => {
      expect(SearchTokenizer.getBindingPower('and')).toBe(80);
    });

    it('returns binding power 60 for or', () => {
      expect(SearchTokenizer.getBindingPower('or')).toBe(60);
    });

    it('returns default binding power 50 for all other types', () => {
      const defaultTypes: SearchToken['type'][] = [
        'word',
        'phrase',
        'range',
        'prefix',
        'prefix_value',
        'prefix_value_quoted',
        'property',
        'lparen',
        'rparen',
      ];
      for (const type of defaultTypes) {
        expect(SearchTokenizer.getBindingPower(type)).toBe(50);
      }
    });
  });
});
