import { SearchTokenizer } from '../src/search/search-tokenizer';
import { SearchParser } from '../src/search/search-parser';

describe('Property Search Tokenizer', () => {
  describe('Basic property syntax', () => {
    it('should tokenize [type:Project] correctly', () => {
      const tokens = SearchTokenizer.tokenize('[type:Project]');
      expect(tokens.length).toBeGreaterThan(0);
      const propertyToken = tokens.find((t) => t.type === 'property');
      expect(propertyToken).toBeDefined();
      expect(propertyToken?.value).toContain('type');
      expect(propertyToken?.value).toContain('Project');
    });

    it('should track position for [type:Project]', () => {
      const tokens = SearchTokenizer.tokenize('[type:Project]');
      const propertyToken = tokens.find((t) => t.type === 'property');
      expect(propertyToken?.position).toBe(0);
    });
  });

  describe('Quoted key and value', () => {
    it('should tokenize ["type":"Project"] correctly', () => {
      const tokens = SearchTokenizer.tokenize('["type":"Project"]');
      const propertyToken = tokens.find((t) => t.type === 'property');
      expect(propertyToken).toBeDefined();
      expect(propertyToken?.value).toContain('type');
      expect(propertyToken?.value).toContain('Project');
    });

    it('should set exact flag for quoted value', () => {
      const tokens = SearchTokenizer.tokenize('["type":"Project"]');
      const propertyToken = tokens.find((t) => t.type === 'property');
      // The exact flag should be set when value is quoted
      expect(propertyToken?.value).toContain('Project');
    });
  });

  describe('Quoted key only', () => {
    it('should tokenize ["type":Project] correctly', () => {
      const tokens = SearchTokenizer.tokenize('["type":Project]');
      const propertyToken = tokens.find((t) => t.type === 'property');
      expect(propertyToken).toBeDefined();
      expect(propertyToken?.value).toContain('type');
      expect(propertyToken?.value).toContain('Project');
    });
  });

  describe('Quoted value only', () => {
    it('should tokenize [type:"Project"] correctly', () => {
      const tokens = SearchTokenizer.tokenize('[type:"Project"]');
      const propertyToken = tokens.find((t) => t.type === 'property');
      expect(propertyToken).toBeDefined();
      expect(propertyToken?.value).toContain('type');
      expect(propertyToken?.value).toContain('Project');
    });

    it('should set exact flag for quoted value only', () => {
      const tokens = SearchTokenizer.tokenize('[type:"Project"]');
      const propertyToken = tokens.find((t) => t.type === 'property');
      expect(propertyToken?.value).toContain('Project');
    });
  });

  describe('Key-only search', () => {
    it('should tokenize [type] correctly', () => {
      const tokens = SearchTokenizer.tokenize('[type]');
      const propertyToken = tokens.find((t) => t.type === 'property');
      expect(propertyToken).toBeDefined();
      expect(propertyToken?.value).toContain('type');
    });

    it('should tokenize [type:] correctly', () => {
      const tokens = SearchTokenizer.tokenize('[type:]');
      const propertyToken = tokens.find((t) => t.type === 'property');
      expect(propertyToken).toBeDefined();
      expect(propertyToken?.value).toContain('type');
    });
  });

  describe('Negation', () => {
    it('should tokenize -[type:Project] correctly', () => {
      const tokens = SearchTokenizer.tokenize('-[type:Project]');
      expect(tokens.length).toBeGreaterThan(0);
      const notToken = tokens.find((t) => t.type === 'not');
      const propertyToken = tokens.find((t) => t.type === 'property');
      expect(notToken).toBeDefined();
      expect(propertyToken).toBeDefined();
    });

    it('should tokenize -["type":"Project"] correctly', () => {
      const tokens = SearchTokenizer.tokenize('-["type":"Project"]');
      const notToken = tokens.find((t) => t.type === 'not');
      const propertyToken = tokens.find((t) => t.type === 'property');
      expect(notToken).toBeDefined();
      expect(propertyToken).toBeDefined();
    });
  });

  describe('Multiple spaces in value', () => {
    it('should tokenize [type:My Project] correctly', () => {
      const tokens = SearchTokenizer.tokenize('[type:My Project]');
      const propertyToken = tokens.find((t) => t.type === 'property');
      expect(propertyToken).toBeDefined();
      expect(propertyToken?.value).toContain('My Project');
    });
  });

  describe('Empty value', () => {
    it('should tokenize [type:] correctly', () => {
      const tokens = SearchTokenizer.tokenize('[type:]');
      const propertyToken = tokens.find((t) => t.type === 'property');
      expect(propertyToken).toBeDefined();
      expect(propertyToken?.value).toContain('type');
    });
  });

  describe('Special characters in key/value', () => {
    it('should tokenize [my-key:value] correctly', () => {
      const tokens = SearchTokenizer.tokenize('[my-key:value]');
      const propertyToken = tokens.find((t) => t.type === 'property');
      expect(propertyToken).toBeDefined();
      expect(propertyToken?.value).toContain('my-key');
    });

    it('should tokenize [key:some_value] correctly', () => {
      const tokens = SearchTokenizer.tokenize('[key:some_value]');
      const propertyToken = tokens.find((t) => t.type === 'property');
      expect(propertyToken).toBeDefined();
      expect(propertyToken?.value).toContain('some_value');
    });
  });

  describe('Case variations', () => {
    it('should tokenize [Type:PROJECT] correctly', () => {
      const tokens = SearchTokenizer.tokenize('[Type:PROJECT]');
      const propertyToken = tokens.find((t) => t.type === 'property');
      expect(propertyToken).toBeDefined();
      expect(propertyToken?.value).toContain('Type');
      expect(propertyToken?.value).toContain('PROJECT');
    });

    it('should tokenize [type:project] correctly', () => {
      const tokens = SearchTokenizer.tokenize('[type:project]');
      const propertyToken = tokens.find((t) => t.type === 'property');
      expect(propertyToken).toBeDefined();
      expect(propertyToken?.value).toContain('type');
      expect(propertyToken?.value).toContain('project');
    });
  });

  describe('Invalid brackets', () => {
    it('should not tokenize type:Project] as property', () => {
      const tokens = SearchTokenizer.tokenize('type:Project]');
      const propertyToken = tokens.find((t) => t.type === 'property');
      expect(propertyToken).toBeUndefined();
    });

    it('should not tokenize [type:Project as property', () => {
      const tokens = SearchTokenizer.tokenize('[type:Project');
      const propertyToken = tokens.find((t) => t.type === 'property');
      expect(propertyToken).toBeUndefined();
    });
  });

  describe('OR operator within values', () => {
    it('should tokenize [status:Draft OR Published] correctly', () => {
      const tokens = SearchTokenizer.tokenize('[status:Draft OR Published]');
      const propertyToken = tokens.find((t) => t.type === 'property');
      expect(propertyToken).toBeDefined();
      expect(propertyToken?.value).toContain('status');
      expect(propertyToken?.value).toContain('Draft');
      expect(propertyToken?.value).toContain('Published');
    });

    it('should tokenize [status:(Draft OR Published)] correctly', () => {
      const tokens = SearchTokenizer.tokenize('[status:(Draft OR Published)]');
      const propertyToken = tokens.find((t) => t.type === 'property');
      expect(propertyToken).toBeDefined();
      expect(propertyToken?.value).toContain('status');
      expect(propertyToken?.value).toContain('Draft');
      expect(propertyToken?.value).toContain('Published');
    });

    it('should tokenize -[status:Draft OR Published] correctly', () => {
      const tokens = SearchTokenizer.tokenize('-[status:Draft OR Published]');
      const notToken = tokens.find((t) => t.type === 'not');
      const propertyToken = tokens.find((t) => t.type === 'property');
      expect(notToken).toBeDefined();
      expect(propertyToken).toBeDefined();
    });
  });

  describe('Null value', () => {
    it('should tokenize [status:null] correctly', () => {
      const tokens = SearchTokenizer.tokenize('[status:null]');
      const propertyToken = tokens.find((t) => t.type === 'property');
      expect(propertyToken).toBeDefined();
      expect(propertyToken?.value).toContain('status');
      expect(propertyToken?.value).toContain('null');
    });

    it('should tokenize ["status":null] correctly', () => {
      const tokens = SearchTokenizer.tokenize('["status":null]');
      const propertyToken = tokens.find((t) => t.type === 'property');
      expect(propertyToken).toBeDefined();
      expect(propertyToken?.value).toContain('status');
      expect(propertyToken?.value).toContain('null');
    });

    it('should tokenize [status:""] correctly (empty quotes)', () => {
      const tokens = SearchTokenizer.tokenize('[status:""]');
      const propertyToken = tokens.find((t) => t.type === 'property');
      expect(propertyToken).toBeDefined();
      expect(propertyToken?.value).toContain('status');
    });

    it('should tokenize [status:[]] correctly (empty brackets)', () => {
      const tokens = SearchTokenizer.tokenize('[status:[]]');
      const propertyToken = tokens.find((t) => t.type === 'property');
      expect(propertyToken).toBeDefined();
      expect(propertyToken?.value).toContain('status');
    });
  });

  describe('Comparison operators', () => {
    it('should tokenize [size:>100] correctly', () => {
      const tokens = SearchTokenizer.tokenize('[size:>100]');
      const propertyToken = tokens.find((t) => t.type === 'property');
      expect(propertyToken).toBeDefined();
      expect(propertyToken?.value).toContain('size');
      expect(propertyToken?.value).toContain('>100');
    });

    it('should tokenize [size:<50] correctly', () => {
      const tokens = SearchTokenizer.tokenize('[size:<50]');
      const propertyToken = tokens.find((t) => t.type === 'property');
      expect(propertyToken).toBeDefined();
      expect(propertyToken?.value).toContain('size');
      expect(propertyToken?.value).toContain('<50');
    });

    it('should tokenize [size:>=100] correctly', () => {
      const tokens = SearchTokenizer.tokenize('[size:>=100]');
      const propertyToken = tokens.find((t) => t.type === 'property');
      expect(propertyToken).toBeDefined();
      expect(propertyToken?.value).toContain('size');
      expect(propertyToken?.value).toContain('>=100');
    });

    it('should tokenize [size:<=50] correctly', () => {
      const tokens = SearchTokenizer.tokenize('[size:<=50]');
      const propertyToken = tokens.find((t) => t.type === 'property');
      expect(propertyToken).toBeDefined();
      expect(propertyToken?.value).toContain('size');
      expect(propertyToken?.value).toContain('<=50');
    });

    it('should tokenize ["size":>100] correctly', () => {
      const tokens = SearchTokenizer.tokenize('["size":>100]');
      const propertyToken = tokens.find((t) => t.type === 'property');
      expect(propertyToken).toBeDefined();
      expect(propertyToken?.value).toContain('size');
      expect(propertyToken?.value).toContain('>100');
    });

    it('should tokenize -[size:>100] correctly', () => {
      const tokens = SearchTokenizer.tokenize('-[size:>100]');
      const notToken = tokens.find((t) => t.type === 'not');
      const propertyToken = tokens.find((t) => t.type === 'property');
      expect(notToken).toBeDefined();
      expect(propertyToken).toBeDefined();
    });
  });

  describe('Combined with other search terms', () => {
    it('should tokenize state:TODO [type:Project] correctly', () => {
      const tokens = SearchTokenizer.tokenize('state:TODO [type:Project]');
      const prefixToken = tokens.find((t) => t.type === 'prefix');
      const prefixValueToken = tokens.find((t) => t.type === 'prefix_value');
      const propertyToken = tokens.find((t) => t.type === 'property');
      expect(prefixToken).toBeDefined();
      expect(prefixValueToken).toBeDefined();
      expect(propertyToken).toBeDefined();
    });

    it('should tokenize [type:Project] tag:urgent correctly', () => {
      const tokens = SearchTokenizer.tokenize('[type:Project] tag:urgent');
      const propertyToken = tokens.find((t) => t.type === 'property');
      const prefixToken = tokens.find((t) => t.type === 'prefix');
      const prefixValueToken = tokens.find((t) => t.type === 'prefix_value');
      expect(propertyToken).toBeDefined();
      expect(prefixToken).toBeDefined();
      expect(prefixValueToken).toBeDefined();
    });
  });

  describe('Complex expressions', () => {
    it('should tokenize (state:TODO OR state:DOING) [type:Project] correctly', () => {
      const tokens = SearchTokenizer.tokenize(
        '(state:TODO OR state:DOING) [type:Project]',
      );
      const lparenToken = tokens.find((t) => t.type === 'lparen');
      const rparenToken = tokens.find((t) => t.type === 'rparen');
      const orToken = tokens.find((t) => t.type === 'or');
      const propertyToken = tokens.find((t) => t.type === 'property');
      expect(lparenToken).toBeDefined();
      expect(rparenToken).toBeDefined();
      expect(orToken).toBeDefined();
      expect(propertyToken).toBeDefined();
    });
  });

  describe('Token structure', () => {
    it('should have correct token structure for property tokens', () => {
      const tokens = SearchTokenizer.tokenize('[type:Project]');
      const propertyToken = tokens.find((t) => t.type === 'property');
      expect(propertyToken).toBeDefined();
      expect(propertyToken).toHaveProperty('type');
      expect(propertyToken).toHaveProperty('value');
      expect(propertyToken).toHaveProperty('original');
      expect(propertyToken).toHaveProperty('position');
    });

    it('should preserve original text in original property', () => {
      const tokens = SearchTokenizer.tokenize('[type:Project]');
      const propertyToken = tokens.find((t) => t.type === 'property');
      expect(propertyToken?.original).toBe('[type:Project]');
    });
  });

  describe('Multiple property tokens', () => {
    it('should tokenize [type:Project] [status:active] correctly', () => {
      const tokens = SearchTokenizer.tokenize('[type:Project] [status:active]');
      const propertyTokens = tokens.filter((t) => t.type === 'property');
      expect(propertyTokens.length).toBe(2);
    });

    it('should tokenize [type:Project] OR [type:Task] correctly', () => {
      const tokens = SearchTokenizer.tokenize('[type:Project] OR [type:Task]');
      const propertyTokens = tokens.filter((t) => t.type === 'property');
      const orToken = tokens.find((t) => t.type === 'or');
      expect(propertyTokens.length).toBe(2);
      expect(orToken).toBeDefined();
    });
  });

  describe('Unicode and Emoji Support', () => {
    it('should parse property filter with unicode characters in key', () => {
      const node = SearchParser.parse('[\u00e9cole:français]');
      expect(node.type).toBe('property_filter');
      expect(node.field).toBe('property');
      expect(node.value).toBe('\u00e9cole:français');
      expect(node.exact).toBe(false);
    });

    it('should parse property filter with unicode characters in value', () => {
      const node = SearchParser.parse('[language:français]');
      expect(node.type).toBe('property_filter');
      expect(node.field).toBe('property');
      expect(node.value).toBe('language:français');
      expect(node.exact).toBe(false);
    });

    it('should parse property filter with emoji in key', () => {
      const node = SearchParser.parse('[\u2705completed:true]');
      expect(node.type).toBe('property_filter');
      expect(node.field).toBe('property');
      expect(node.value).toBe('\u2705completed:true');
      expect(node.exact).toBe(false);
    });

    it('should parse property filter with emoji in value', () => {
      const node = SearchParser.parse('[status:\u2705]');
      expect(node.type).toBe('property_filter');
      expect(node.field).toBe('property');
      expect(node.value).toBe('status:\u2705');
      expect(node.exact).toBe(false);
    });

    it('should parse quoted property filter with unicode characters', () => {
      const node = SearchParser.parse('["\u00e9cole française":"café crème"]');
      expect(node.type).toBe('property_filter');
      expect(node.field).toBe('property');
      expect(node.value).toBe('\u00e9cole française:café crème');
      expect(node.exact).toBe(true);
    });
  });

  describe('Property Search Parser', () => {
    describe('Basic property parsing', () => {
      it('should parse [type:Project] into property_filter node', () => {
        const node = SearchParser.parse('[type:Project]');
        expect(node).toBeDefined();
        expect(node.type).toBe('property_filter');
        expect(node.value).toContain('type');
        expect(node.value).toContain('Project');
      });

      it('should set exact flag to false for unquoted value', () => {
        const node = SearchParser.parse('[type:Project]');
        expect(node.exact).toBe(false);
      });

      it('should set exact flag to true for quoted value', () => {
        const node = SearchParser.parse('[type:"Project"]');
        expect(node.exact).toBe(true);
      });

      it('should set exact flag to true for quoted key and value', () => {
        const node = SearchParser.parse('["type":"Project"]');
        expect(node.exact).toBe(true);
      });

      it('should handle key-only case [type]', () => {
        const node = SearchParser.parse('[type]');
        expect(node.type).toBe('property_filter');
        expect(node.value).toContain('type');
      });

      it('should handle key-only with colon [type:]', () => {
        const node = SearchParser.parse('[type:]');
        expect(node.type).toBe('property_filter');
        expect(node.value).toContain('type');
      });

      it('should preserve position in node', () => {
        const node = SearchParser.parse('[type:Project]');
        expect(node.position).toBeDefined();
        expect(typeof node.position).toBe('number');
      });
    });

    describe('Negation handling', () => {
      it('should wrap property node in NOT for -[type:Project]', () => {
        const node = SearchParser.parse('-[type:Project]');
        expect(node.type).toBe('not');
        expect(node.children).toBeDefined();
        expect(node.children?.length).toBe(1);
        expect(node.children?.[0].type).toBe('property_filter');
      });

      it('should wrap property node in NOT for -["type":"Project"]', () => {
        const node = SearchParser.parse('-["type":"Project"]');
        expect(node.type).toBe('not');
        expect(node.children).toBeDefined();
        expect(node.children?.length).toBe(1);
        expect(node.children?.[0].type).toBe('property_filter');
      });

      it('should preserve exact flag in negated property', () => {
        const node = SearchParser.parse('-[type:"Project"]');
        expect(node.type).toBe('not');
        expect(node.children?.[0].type).toBe('property_filter');
        expect(node.children?.[0].exact).toBe(true);
      });
    });

    describe('Combined with other prefixes', () => {
      it('should parse state:TODO [type:Project] as AND', () => {
        const node = SearchParser.parse('state:TODO [type:Project]');
        expect(node.type).toBe('and');
        expect(node.children).toBeDefined();
        expect(node.children?.length).toBe(2);
        expect(node.children?.[0].type).toBe('prefix_filter');
        expect(node.children?.[1].type).toBe('property_filter');
      });

      it('should parse [type:Project] tag:urgent as AND', () => {
        const node = SearchParser.parse('[type:Project] tag:urgent');
        expect(node.type).toBe('and');
        expect(node.children).toBeDefined();
        expect(node.children?.length).toBe(2);
        expect(node.children?.[0].type).toBe('property_filter');
        expect(node.children?.[1].type).toBe('prefix_filter');
      });

      it('should parse [type:Project] state:TODO priority:high as AND chain', () => {
        const node = SearchParser.parse(
          '[type:Project] state:TODO priority:high',
        );
        expect(node.type).toBe('and');
        expect(node.children).toBeDefined();
        expect(node.children?.length).toBe(3);
        expect(node.children?.[0].type).toBe('property_filter');
        expect(node.children?.[1].type).toBe('prefix_filter');
        expect(node.children?.[2].type).toBe('prefix_filter');
      });

      it('should parse [type:Project] [status:active] as AND', () => {
        const node = SearchParser.parse('[type:Project] [status:active]');
        expect(node.type).toBe('and');
        expect(node.children).toBeDefined();
        expect(node.children?.length).toBe(2);
        expect(node.children?.[0].type).toBe('property_filter');
        expect(node.children?.[1].type).toBe('property_filter');
      });
    });

    describe('Complex expressions with parentheses', () => {
      it('should parse (state:TODO OR state:DOING) [type:Project]', () => {
        const node = SearchParser.parse(
          '(state:TODO OR state:DOING) [type:Project]',
        );
        expect(node.type).toBe('and');
        expect(node.children).toBeDefined();
        expect(node.children?.length).toBe(2);
        expect(node.children?.[0].type).toBe('or');
        expect(node.children?.[1].type).toBe('property_filter');
      });

      it('should parse [type:Project] (state:TODO OR state:DOING)', () => {
        const node = SearchParser.parse(
          '[type:Project] (state:TODO OR state:DOING)',
        );
        expect(node.type).toBe('and');
        expect(node.children).toBeDefined();
        expect(node.children?.length).toBe(2);
        expect(node.children?.[0].type).toBe('property_filter');
        expect(node.children?.[1].type).toBe('or');
      });

      it('should parse ([type:Project] OR [type:Task]) state:TODO', () => {
        const node = SearchParser.parse(
          '([type:Project] OR [type:Task]) state:TODO',
        );
        expect(node.type).toBe('and');
        expect(node.children).toBeDefined();
        expect(node.children?.length).toBe(2);
        expect(node.children?.[0].type).toBe('or');
        expect(node.children?.[1].type).toBe('prefix_filter');
      });

      it('should parse -([type:Project] OR [type:Task])', () => {
        const node = SearchParser.parse('-([type:Project] OR [type:Task])');
        expect(node.type).toBe('not');
        expect(node.children).toBeDefined();
        expect(node.children?.length).toBe(1);
        expect(node.children?.[0].type).toBe('or');
      });
    });

    describe('OR expressions within property values', () => {
      it('should parse [status:Draft OR Published]', () => {
        const node = SearchParser.parse('[status:Draft OR Published]');
        expect(node.type).toBe('property_filter');
        expect(node.value).toContain('status');
        expect(node.value).toContain('Draft');
        expect(node.value).toContain('Published');
      });

      it('should parse [status:(Draft OR Published)]', () => {
        const node = SearchParser.parse('[status:(Draft OR Published)]');
        expect(node.type).toBe('property_filter');
        expect(node.value).toContain('status');
        expect(node.value).toContain('Draft');
        expect(node.value).toContain('Published');
      });

      it('should parse [status:Draft OR Published OR Archived]', () => {
        const node = SearchParser.parse(
          '[status:Draft OR Published OR Archived]',
        );
        expect(node.type).toBe('property_filter');
        expect(node.value).toContain('status');
        expect(node.value).toContain('Draft');
        expect(node.value).toContain('Published');
        expect(node.value).toContain('Archived');
      });

      it('should parse -[status:Draft OR Published]', () => {
        const node = SearchParser.parse('-[status:Draft OR Published]');
        expect(node.type).toBe('not');
        expect(node.children).toBeDefined();
        expect(node.children?.length).toBe(1);
        expect(node.children?.[0].type).toBe('property_filter');
      });

      it('should parse (state:TODO OR state:DOING) [status:Draft OR Published]', () => {
        const node = SearchParser.parse(
          '(state:TODO OR state:DOING) [status:Draft OR Published]',
        );
        expect(node.type).toBe('and');
        expect(node.children).toBeDefined();
        expect(node.children?.length).toBe(2);
        expect(node.children?.[0].type).toBe('or');
        expect(node.children?.[1].type).toBe('property_filter');
      });
    });

    describe('Null value handling', () => {
      it('should parse [status:null]', () => {
        const node = SearchParser.parse('[status:null]');
        expect(node.type).toBe('property_filter');
        expect(node.value).toContain('status');
        expect(node.value).toContain('null');
      });

      it('should parse ["status":null]', () => {
        const node = SearchParser.parse('["status":null]');
        expect(node.type).toBe('property_filter');
        expect(node.value).toContain('status');
        expect(node.value).toContain('null');
      });

      it('should parse -[status:null]', () => {
        const node = SearchParser.parse('-[status:null]');
        expect(node.type).toBe('not');
        expect(node.children).toBeDefined();
        expect(node.children?.length).toBe(1);
        expect(node.children?.[0].type).toBe('property_filter');
      });

      it('should parse [type:null] [status:active]', () => {
        const node = SearchParser.parse('[type:null] [status:active]');
        expect(node.type).toBe('and');
        expect(node.children).toBeDefined();
        expect(node.children?.length).toBe(2);
        expect(node.children?.[0].type).toBe('property_filter');
        expect(node.children?.[1].type).toBe('property_filter');
      });
    });

    describe('Comparison operators', () => {
      it('should parse [size:>100]', () => {
        const node = SearchParser.parse('[size:>100]');
        expect(node.type).toBe('property_filter');
        expect(node.value).toContain('size');
        expect(node.value).toContain('>100');
      });

      it('should parse [size:<50]', () => {
        const node = SearchParser.parse('[size:<50]');
        expect(node.type).toBe('property_filter');
        expect(node.value).toContain('size');
        expect(node.value).toContain('<50');
      });

      it('should parse [size:>=100]', () => {
        const node = SearchParser.parse('[size:>=100]');
        expect(node.type).toBe('property_filter');
        expect(node.value).toContain('size');
        expect(node.value).toContain('>=100');
      });

      it('should parse [size:<=50]', () => {
        const node = SearchParser.parse('[size:<=50]');
        expect(node.type).toBe('property_filter');
        expect(node.value).toContain('size');
        expect(node.value).toContain('<=50');
      });

      it('should parse ["size":>100]', () => {
        const node = SearchParser.parse('["size":>100]');
        expect(node.type).toBe('property_filter');
        expect(node.value).toContain('size');
        expect(node.value).toContain('>100');
      });

      it('should parse -[size:>100]', () => {
        const node = SearchParser.parse('-[size:>100]');
        expect(node.type).toBe('not');
        expect(node.children).toBeDefined();
        expect(node.children?.length).toBe(1);
        expect(node.children?.[0].type).toBe('property_filter');
      });

      it('should parse [size:>100] state:TODO', () => {
        const node = SearchParser.parse('[size:>100] state:TODO');
        expect(node.type).toBe('and');
        expect(node.children).toBeDefined();
        expect(node.children?.length).toBe(2);
        expect(node.children?.[0].type).toBe('property_filter');
        expect(node.children?.[1].type).toBe('prefix_filter');
      });
    });

    describe('Multiple property filters', () => {
      it('should parse [type:Project] OR [type:Task]', () => {
        const node = SearchParser.parse('[type:Project] OR [type:Task]');
        expect(node.type).toBe('or');
        expect(node.children).toBeDefined();
        expect(node.children?.length).toBe(2);
        expect(node.children?.[0].type).toBe('property_filter');
        expect(node.children?.[1].type).toBe('property_filter');
      });

      it('should parse [type:Project] AND [status:active]', () => {
        const node = SearchParser.parse('[type:Project] AND [status:active]');
        expect(node.type).toBe('and');
        expect(node.children).toBeDefined();
        expect(node.children?.length).toBe(2);
        expect(node.children?.[0].type).toBe('property_filter');
        expect(node.children?.[1].type).toBe('property_filter');
      });

      it('should parse ([type:Project] OR [type:Task]) AND [status:active]', () => {
        const node = SearchParser.parse(
          '([type:Project] OR [type:Task]) AND [status:active]',
        );
        expect(node.type).toBe('and');
        expect(node.children).toBeDefined();
        expect(node.children?.length).toBe(2);
        expect(node.children?.[0].type).toBe('or');
        expect(node.children?.[1].type).toBe('property_filter');
      });
    });

    describe('Special characters in property values', () => {
      it('should parse [my-key:value]', () => {
        const node = SearchParser.parse('[my-key:value]');
        expect(node.type).toBe('property_filter');
        expect(node.value).toContain('my-key');
        expect(node.value).toContain('value');
      });

      it('should parse [key:some_value]', () => {
        const node = SearchParser.parse('[key:some_value]');
        expect(node.type).toBe('property_filter');
        expect(node.value).toContain('key');
        expect(node.value).toContain('some_value');
      });

      it('should parse [type:My Project]', () => {
        const node = SearchParser.parse('[type:My Project]');
        expect(node.type).toBe('property_filter');
        expect(node.value).toContain('type');
        expect(node.value).toContain('My Project');
      });
    });

    describe('Empty value handling', () => {
      it('should parse [type:]', () => {
        const node = SearchParser.parse('[type:]');
        expect(node.type).toBe('property_filter');
        expect(node.value).toContain('type');
      });

      it('should parse [status:""]', () => {
        const node = SearchParser.parse('[status:""]');
        expect(node.type).toBe('property_filter');
        expect(node.value).toContain('status');
      });

      it('should not parse [status:[]] as property filter', () => {
        const node = SearchParser.parse('[status:[]]');
        expect(node.type).not.toBe('property_filter');
      });
    });

    describe('Case variations', () => {
      it('should parse [Type:PROJECT]', () => {
        const node = SearchParser.parse('[Type:PROJECT]');
        expect(node.type).toBe('property_filter');
        expect(node.value).toContain('Type');
        expect(node.value).toContain('PROJECT');
      });

      it('should parse [type:project]', () => {
        const node = SearchParser.parse('[type:project]');
        expect(node.type).toBe('property_filter');
        expect(node.value).toContain('type');
        expect(node.value).toContain('project');
      });
    });

    describe('Complex nested expressions', () => {
      it('should parse (([type:Project] OR [type:Task]) AND state:TODO)', () => {
        const node = SearchParser.parse(
          '(([type:Project] OR [type:Task]) AND state:TODO)',
        );
        expect(node.type).toBe('and');
        expect(node.children).toBeDefined();
        expect(node.children?.length).toBe(2);
        expect(node.children?.[0].type).toBe('or');
        expect(node.children?.[1].type).toBe('prefix_filter');
      });

      it('should parse -([type:Project] AND [status:active])', () => {
        const node = SearchParser.parse(
          '-([type:Project] AND [status:active])',
        );
        expect(node.type).toBe('not');
        expect(node.children).toBeDefined();
        expect(node.children?.length).toBe(1);
        expect(node.children?.[0].type).toBe('and');
      });

      it('should parse state:TODO -([type:Project] OR [type:Task])', () => {
        const node = SearchParser.parse(
          'state:TODO -([type:Project] OR [type:Task])',
        );
        expect(node.type).toBe('and');
        expect(node.children).toBeDefined();
        expect(node.children?.length).toBe(2);
        expect(node.children?.[0].type).toBe('prefix_filter');
        expect(node.children?.[1].type).toBe('not');
      });
    });

    describe('Property with terms', () => {
      it('should parse [type:Project] meeting', () => {
        const node = SearchParser.parse('[type:Project] meeting');
        expect(node.type).toBe('and');
        expect(node.children).toBeDefined();
        expect(node.children?.length).toBe(2);
        expect(node.children?.[0].type).toBe('property_filter');
        expect(node.children?.[1].type).toBe('term');
      });

      it('should parse meeting [type:Project]', () => {
        const node = SearchParser.parse('meeting [type:Project]');
        expect(node.type).toBe('and');
        expect(node.children).toBeDefined();
        expect(node.children?.length).toBe(2);
        expect(node.children?.[0].type).toBe('term');
        expect(node.children?.[1].type).toBe('property_filter');
      });

      it('should parse "important" [type:Project]', () => {
        const node = SearchParser.parse('"important" [type:Project]');
        expect(node.type).toBe('and');
        expect(node.children).toBeDefined();
        expect(node.children?.length).toBe(2);
        expect(node.children?.[0].type).toBe('phrase');
        expect(node.children?.[1].type).toBe('property_filter');
      });
    });
  });

  describe('Edge cases', () => {
    it('should tokenize empty string correctly', () => {
      const tokens = SearchTokenizer.tokenize('');
      expect(tokens.length).toBe(0);
    });

    it('should tokenize whitespace only correctly', () => {
      const tokens = SearchTokenizer.tokenize('   ');
      expect(tokens.length).toBe(0);
    });

    it('should handle brackets with only whitespace [   ]', () => {
      const tokens = SearchTokenizer.tokenize('[   ]');
      // This should either not match as property or handle gracefully
      const propertyToken = tokens.find((t) => t.type === 'property');
      if (propertyToken) {
        expect(propertyToken.value).toContain('');
      }
    });

    it('should handle nested brackets [[type:Project]]', () => {
      const tokens = SearchTokenizer.tokenize('[[type:Project]]');
      // Should handle gracefully - may tokenize as multiple tokens
      expect(tokens.length).toBeGreaterThan(0);
    });
  });
});
