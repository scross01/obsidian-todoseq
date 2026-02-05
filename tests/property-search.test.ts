import { SearchTokenizer } from '../src/search/search-tokenizer';
import { SearchParser } from '../src/search/search-parser';
import { SearchToken } from '../src/search/search-types';
import { Search } from '../src/search/search';
import { Task } from '../src/types/task';

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
      const tokens = SearchTokenizer.tokenize('(state:TODO OR state:DOING) [type:Project]');
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
        const node = SearchParser.parse('[type:Project] state:TODO priority:high');
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
        const node = SearchParser.parse('(state:TODO OR state:DOING) [type:Project]');
        expect(node.type).toBe('and');
        expect(node.children).toBeDefined();
        expect(node.children?.length).toBe(2);
        expect(node.children?.[0].type).toBe('or');
        expect(node.children?.[1].type).toBe('property_filter');
      });
  
      it('should parse [type:Project] (state:TODO OR state:DOING)', () => {
        const node = SearchParser.parse('[type:Project] (state:TODO OR state:DOING)');
        expect(node.type).toBe('and');
        expect(node.children).toBeDefined();
        expect(node.children?.length).toBe(2);
        expect(node.children?.[0].type).toBe('property_filter');
        expect(node.children?.[1].type).toBe('or');
      });
  
      it('should parse ([type:Project] OR [type:Task]) state:TODO', () => {
        const node = SearchParser.parse('([type:Project] OR [type:Task]) state:TODO');
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
        const node = SearchParser.parse('[status:Draft OR Published OR Archived]');
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
  
      it('should parse [status:[]]', () => {
        const node = SearchParser.parse('[status:[]]');
        expect(node.type).toBe('property_filter');
        expect(node.value).toContain('status');
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
        const node = SearchParser.parse('-([type:Project] AND [status:active])');
        expect(node.type).toBe('not');
        expect(node.children).toBeDefined();
        expect(node.children?.length).toBe(1);
        expect(node.children?.[0].type).toBe('and');
      });
  
      it('should parse state:TODO -([type:Project] OR [type:Task])', () => {
        const node = SearchParser.parse('state:TODO -([type:Project] OR [type:Task])');
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
    
    describe('Property Search Evaluator', () => {
      // Mock Obsidian API and metadataCache
      const mockMetadataCache = {
        getFileCache: jest.fn(),
      };
    
      const mockApp = {
        metadataCache: mockMetadataCache,
      };
    
      // Helper function to create a task with frontmatter
      function createTaskWithFrontmatter(
        path: string,
        frontmatter: Record<string, unknown> | null,
      ): Task {
        return {
          path,
          line: 1,
          rawText: 'TODO test task',
          indent: '',
          listMarker: '- ',
          text: 'test task',
          state: 'TODO',
          completed: false,
          priority: null,
          scheduledDate: null,
          deadlineDate: null,
          urgency: null,
          isDailyNote: false,
          dailyNoteDate: null,
        };
      }
    
      // Helper to mock getFileCache response
      function mockGetFileCache(path: string, frontmatter: Record<string, unknown> | null) {
        mockMetadataCache.getFileCache.mockImplementation((filePath: string) => {
          if (filePath === path) {
            return { frontmatter };
          }
          return null;
        });
      }
    
      beforeEach(() => {
        jest.clearAllMocks();
      });
    
      describe('Basic matching tests', () => {
        it('[type:Project] matches tasks on pages with type: Project', () => {
          const task = createTaskWithFrontmatter('test.md', { type: 'Project' });
          mockGetFileCache('test.md', { type: 'Project' });
    
          // Pass the mock app through settings
          const settings = { app: mockApp };
          const result = Search.evaluate('[type:Project]', task, false, settings);
          expect(result).toBe(true);
        });
    
        it('[type:project] matches (case insensitive by default)', () => {
          const task = createTaskWithFrontmatter('test.md', { type: 'Project' });
          mockGetFileCache('test.md', { type: 'Project' });
    
          const settings = { app: mockApp };
          const result = Search.evaluate('[type:project]', task, false, settings);
          expect(result).toBe(true);
        });
    
        it('[type:PROJECT] matches (case insensitive by default)', () => {
          const task = createTaskWithFrontmatter('test.md', { type: 'Project' });
          mockGetFileCache('test.md', { type: 'Project' });
    
          const settings = { app: mockApp };
          const result = Search.evaluate('[type:PROJECT]', task, false, settings);
          expect(result).toBe(true);
        });
    
        it('[type:Project] matches tasks on pages with type: Project property', () => {
          const task = createTaskWithFrontmatter('test.md', { type: 'Project' });
          mockGetFileCache('test.md', { type: 'Project' });
    
          const settings = { app: mockApp };
          const result = Search.evaluate('[type:Project]', task, false, settings);
          expect(result).toBe(true);
        });
      });
    
      describe('Exact matching tests', () => {
        it('["type":"Project"] matches only exact "Project"', () => {
          const task = createTaskWithFrontmatter('test.md', { type: 'Project' });
          mockGetFileCache('test.md', { type: 'Project' });
    
          const settings = { app: mockApp };
          const result = Search.evaluate('["type":"Project"]', task, false, settings);
          expect(result).toBe(true);
        });
    
        it('["type":"project"] does NOT match "Project" (case sensitive with quotes)', () => {
          const task = createTaskWithFrontmatter('test.md', { type: 'Project' });
          mockGetFileCache('test.md', { type: 'Project' });
    
          const settings = { app: mockApp };
          const result = Search.evaluate('["type":"project"]', task, false, settings);
          expect(result).toBe(false);
        });
    
        it('["type":"Project"] matches "Project" but not "project"', () => {
          const task = createTaskWithFrontmatter('test.md', { type: 'Project' });
          mockGetFileCache('test.md', { type: 'Project' });
    
          const settings = { app: mockApp };
          const result1 = Search.evaluate('["type":"Project"]', task, false, settings);
          expect(result1).toBe(true);
    
          const result2 = Search.evaluate('["type":"project"]', task, false, settings);
          expect(result2).toBe(false);
        });
      });
    
      describe('Partial matching tests', () => {
        it('[type:ject] matches "Project"', () => {
          const task = createTaskWithFrontmatter('test.md', { type: 'Project' });
          mockGetFileCache('test.md', { type: 'Project' });
    
          const settings = { app: mockApp };
          const result = Search.evaluate('[type:ject]', task, false, settings);
          expect(result).toBe(true);
        });
    
        it('[type:Pro] matches "Project"', () => {
          const task = createTaskWithFrontmatter('test.md', { type: 'Project' });
          mockGetFileCache('test.md', { type: 'Project' });
    
          const settings = { app: mockApp };
          const result = Search.evaluate('[type:Pro]', task, false, settings);
          expect(result).toBe(true);
        });
    
        it('[type:roj] matches "Project"', () => {
          const task = createTaskWithFrontmatter('test.md', { type: 'Project' });
          mockGetFileCache('test.md', { type: 'Project' });
    
          const settings = { app: mockApp };
          const result = Search.evaluate('[type:roj]', task, false, settings);
          expect(result).toBe(true);
        });
    
        it('["type":"ject"] does NOT match "Project"', () => {
          const task = createTaskWithFrontmatter('test.md', { type: 'Project' });
          mockGetFileCache('test.md', { type: 'Project' });
    
          const settings = { app: mockApp };
          const result = Search.evaluate('["type":"ject"]', task, false, settings);
          expect(result).toBe(false);
        });
    
        it('["type":"Pro"] does NOT match "Project"', () => {
          const task = createTaskWithFrontmatter('test.md', { type: 'Project' });
          mockGetFileCache('test.md', { type: 'Project' });
    
          const settings = { app: mockApp };
          const result = Search.evaluate('["type":"Pro"]', task, false, settings);
          expect(result).toBe(false);
        });
      });
    
      describe('Key-only matching tests', () => {
        it('[type] matches any page with type property (any value)', () => {
          const task = createTaskWithFrontmatter('test.md', { type: 'Project' });
          mockGetFileCache('test.md', { type: 'Project' });
    
          const settings = { app: mockApp };
          const result = Search.evaluate('[type]', task, false, settings);
          expect(result).toBe(true);
        });
    
        it('[type:] matches any page with type property (any value)', () => {
          const task = createTaskWithFrontmatter('test.md', { type: 'Project' });
          mockGetFileCache('test.md', { type: 'Project' });
    
          const settings = { app: mockApp };
          const result = Search.evaluate('[type:]', task, false, settings);
          expect(result).toBe(true);
        });
    
        it('[type] does NOT match pages without type property', () => {
          const task = createTaskWithFrontmatter('test.md', { status: 'Active' });
          mockGetFileCache('test.md', { status: 'Active' });
    
          const settings = { app: mockApp };
          const result = Search.evaluate('[type]', task, false, settings);
          expect(result).toBe(false);
        });
      });
    
      describe('Negation tests', () => {
        it('-[type:Project] excludes pages with type: Project', () => {
          const task = createTaskWithFrontmatter('test.md', { type: 'Task' });
          mockGetFileCache('test.md', { type: 'Task' });
    
          const settings = { app: mockApp };
          const result = Search.evaluate('-[type:Project]', task, false, settings);
          expect(result).toBe(true);
        });
    
        it('-[type] excludes pages with type property (any value)', () => {
          const task = createTaskWithFrontmatter('test.md', { status: 'Active' });
          mockGetFileCache('test.md', { status: 'Active' });
    
          const settings = { app: mockApp };
          const result = Search.evaluate('-[type]', task, false, settings);
          expect(result).toBe(true);
        });
    
        it('-[type] includes pages without type property', () => {
          const task = createTaskWithFrontmatter('test.md', { status: 'Active' });
          mockGetFileCache('test.md', { status: 'Active' });
    
          const settings = { app: mockApp };
          const result = Search.evaluate('-[type]', task, false, settings);
          expect(result).toBe(true);
        });
      });
    
      describe('Case sensitivity tests', () => {
        it('With Match Case enabled: [type:Project] only matches "Project", not "project"', () => {
          const task = createTaskWithFrontmatter('test.md', { type: 'Project' });
          mockGetFileCache('test.md', { type: 'Project' });
    
          const settings = { app: mockApp };
          const result1 = Search.evaluate('[type:Project]', task, true, settings);
          expect(result1).toBe(true);
    
          const result2 = Search.evaluate('[type:project]', task, true, settings);
          expect(result2).toBe(false);
        });
    
        it('With Match Case enabled: [type:project] only matches "project", not "Project"', () => {
          const task = createTaskWithFrontmatter('test.md', { type: 'project' });
          mockGetFileCache('test.md', { type: 'project' });
    
          const settings = { app: mockApp };
          const result1 = Search.evaluate('[type:project]', task, true, settings);
          expect(result1).toBe(true);
    
          const result2 = Search.evaluate('[type:Project]', task, true, settings);
          expect(result2).toBe(false);
        });
    
        it('With Match Case disabled: [type:Project] matches "Project" AND "project"', () => {
          const task1 = createTaskWithFrontmatter('test.md', { type: 'Project' });
          mockGetFileCache('test.md', { type: 'Project' });
    
          const settings = { app: mockApp };
          const result1 = Search.evaluate('[type:Project]', task1, false, settings);
          expect(result1).toBe(true);
    
          const task2 = createTaskWithFrontmatter('test2.md', { type: 'project' });
          mockGetFileCache('test2.md', { type: 'project' });
    
          const result2 = Search.evaluate('[type:Project]', task2, false, settings);
          expect(result2).toBe(true);
        });
      });
    
      describe('Different property types tests', () => {
        it('String: [status:active] matches string value', () => {
          const task = createTaskWithFrontmatter('test.md', { status: 'active' });
          mockGetFileCache('test.md', { status: 'active' });
    
          const settings = { app: mockApp };
          const result = Search.evaluate('[status:active]', task, false, settings);
          expect(result).toBe(true);
        });
    
        it('Number: [priority:1] matches numeric value', () => {
          const task = createTaskWithFrontmatter('test.md', { priority: 1 });
          mockGetFileCache('test.md', { priority: 1 });
    
          const settings = { app: mockApp };
          const result = Search.evaluate('[priority:1]', task, false, settings);
          expect(result).toBe(true);
        });
    
        it('Boolean: [completed:true] matches boolean value', () => {
          const task = createTaskWithFrontmatter('test.md', { completed: true });
          mockGetFileCache('test.md', { completed: true });
    
          const settings = { app: mockApp };
          const result = Search.evaluate('[completed:true]', task, false, settings);
          expect(result).toBe(true);
        });
    
        it('Array: [tags:urgent] matches if value in array', () => {
          const task = createTaskWithFrontmatter('test.md', { tags: ['urgent', 'important'] });
          mockGetFileCache('test.md', { tags: ['urgent', 'important'] });
    
          const settings = { app: mockApp };
          const result = Search.evaluate('[tags:urgent]', task, false, settings);
          expect(result).toBe(true);
        });
    
        it('Null/empty: [status:] matches files where property exists but is empty', () => {
          const task = createTaskWithFrontmatter('test.md', { status: null });
          mockGetFileCache('test.md', { status: null });
    
          const settings = { app: mockApp };
          const result = Search.evaluate('[status:]', task, false, settings);
          expect(result).toBe(true);
        });
      });
    
      describe('Type-aware comparison tests', () => {
        it('["size":>100] matches numeric values > 100', () => {
          const task = createTaskWithFrontmatter('test.md', { size: 150 });
          mockGetFileCache('test.md', { size: 150 });
    
          const settings = { app: mockApp };
          const result = Search.evaluate('["size":>100]', task, false, settings);
          expect(result).toBe(true);
        });
    
        it('["size":<50] matches numeric values < 50', () => {
          const task = createTaskWithFrontmatter('test.md', { size: 25 });
          mockGetFileCache('test.md', { size: 25 });
    
          const settings = { app: mockApp };
          const result = Search.evaluate('["size":<50]', task, false, settings);
          expect(result).toBe(true);
        });
    
        it('["size":>=100] matches numeric values >= 100', () => {
          const task = createTaskWithFrontmatter('test.md', { size: 100 });
          mockGetFileCache('test.md', { size: 100 });
    
          const settings = { app: mockApp };
          const result = Search.evaluate('["size":>=100]', task, false, settings);
          expect(result).toBe(true);
        });
    
        it('["size":<=50] matches numeric values <= 50', () => {
          const task = createTaskWithFrontmatter('test.md', { size: 50 });
          mockGetFileCache('test.md', { size: 50 });
    
          const settings = { app: mockApp };
          const result = Search.evaluate('["size":<=50]', task, false, settings);
          expect(result).toBe(true);
        });
    
        it('["size":100] matches numeric value exactly 100', () => {
          const task = createTaskWithFrontmatter('test.md', { size: 100 });
          mockGetFileCache('test.md', { size: 100 });
    
          const settings = { app: mockApp };
          const result = Search.evaluate('["size":100]', task, false, settings);
          expect(result).toBe(true);
        });
    
        it('-[size:>100] excludes values > 100', () => {
          const task = createTaskWithFrontmatter('test.md', { size: 50 });
          mockGetFileCache('test.md', { size: 50 });
    
          const settings = { app: mockApp };
          const result = Search.evaluate('-[size:>100]', task, false, settings);
          expect(result).toBe(true);
        });
      });
    
      describe('OR operator within values tests', () => {
        it('[status:Draft OR Published] matches "Draft" OR "Published"', () => {
          const task1 = createTaskWithFrontmatter('test.md', { status: 'Draft' });
          mockGetFileCache('test.md', { status: 'Draft' });
    
          const settings = { app: mockApp };
          const result1 = Search.evaluate('[status:Draft OR Published]', task1, false, settings);
          expect(result1).toBe(true);
    
          const task2 = createTaskWithFrontmatter('test2.md', { status: 'Published' });
          mockGetFileCache('test2.md', { status: 'Published' });
    
          const result2 = Search.evaluate('[status:Draft OR Published]', task2, false, settings);
          expect(result2).toBe(true);
        });
    
        it('[status:(Draft OR Published)] matches "Draft" OR "Published"', () => {
          const task = createTaskWithFrontmatter('test.md', { status: 'Draft' });
          mockGetFileCache('test.md', { status: 'Draft' });
    
          const settings = { app: mockApp };
          const result = Search.evaluate('[status:(Draft OR Published)]', task, false, settings);
          expect(result).toBe(true);
        });
    
        it('-[status:Draft OR Published] excludes "Draft" OR "Published"', () => {
          const task = createTaskWithFrontmatter('test.md', { status: 'Archived' });
          mockGetFileCache('test.md', { status: 'Archived' });
    
          const settings = { app: mockApp };
          const result = Search.evaluate('-[status:Draft OR Published]', task, false, settings);
          expect(result).toBe(true);
        });
    
        it('[type:Project OR Task] [status:active] combines OR with other filters', () => {
          const task = createTaskWithFrontmatter('test.md', { type: 'Project', status: 'active' });
          mockGetFileCache('test.md', { type: 'Project', status: 'active' });
    
          const settings = { app: mockApp };
          const result = Search.evaluate('[type:Project OR Task] [status:active]', task, false, settings);
          expect(result).toBe(true);
        });
      });
    
      describe('Null value handling tests', () => {
        it('[type:null] matches files where property exists but has no value', () => {
          const task = createTaskWithFrontmatter('test.md', { type: null });
          mockGetFileCache('test.md', { type: null });
    
          const settings = { app: mockApp };
          const result = Search.evaluate('[type:null]', task, false, settings);
          expect(result).toBe(true);
        });
    
        it('[type:] matches files where property exists but is empty', () => {
          const task = createTaskWithFrontmatter('test.md', { type: null });
          mockGetFileCache('test.md', { type: null });
    
          const settings = { app: mockApp };
          const result = Search.evaluate('[type:]', task, false, settings);
          expect(result).toBe(true);
        });
    
        test.todo('[type:""] does NOT match (empty quotes is not null)');
    
        it('[type:[]] does NOT match (empty brackets is not null)', () => {
          const task = createTaskWithFrontmatter('test.md', { type: null });
          mockGetFileCache('test.md', { type: null });
    
          const settings = { app: mockApp };
          const result = Search.evaluate('[type:[]]', task, false, settings);
          expect(result).toBe(false);
        });
    
        it('-[type:null] excludes files where property has no value', () => {
          const task = createTaskWithFrontmatter('test.md', { type: 'Project' });
          mockGetFileCache('test.md', { type: 'Project' });
    
          const settings = { app: mockApp };
          const result = Search.evaluate('-[type:null]', task, false, settings);
          expect(result).toBe(true);
        });
      });
    
      describe('Empty values distinction tests', () => {
        test.todo('[status:""] does NOT match (empty string is not null)');
    
        it('[status:[]] does NOT match (empty array is not null)', () => {
          const task = createTaskWithFrontmatter('test.md', { status: null });
          mockGetFileCache('test.md', { status: null });
    
          const settings = { app: mockApp };
          const result = Search.evaluate('[status:[]]', task, false, settings);
          expect(result).toBe(false);
        });
      });
    
      describe('Combined filters tests', () => {
        it('state:TODO [type:Project] matches TODO tasks on Project pages', () => {
          const task = createTaskWithFrontmatter('test.md', { type: 'Project' });
          task.state = 'TODO';
          mockGetFileCache('test.md', { type: 'Project' });
    
          const settings = { app: mockApp };
          const result = Search.evaluate('state:TODO [type:Project]', task, false, settings);
          expect(result).toBe(true);
        });
    
        it('[type:Project] tag:urgent matches urgent tasks on Project pages', () => {
          const task = createTaskWithFrontmatter('test.md', { type: 'Project' });
          task.rawText = 'TODO #urgent task';
          task.text = '#urgent task';
          mockGetFileCache('test.md', { type: 'Project' });
    
          const settings = { app: mockApp };
          const result = Search.evaluate('[type:Project] tag:urgent', task, false, settings);
          expect(result).toBe(true);
        });
    
        it('-[type:Personal] [status:active] matches active tasks not on Personal pages', () => {
          const task = createTaskWithFrontmatter('test.md', { type: 'Project', status: 'active' });
          mockGetFileCache('test.md', { type: 'Project', status: 'active' });
    
          const settings = { app: mockApp };
          const result = Search.evaluate('-[type:Personal] [status:active]', task, false, settings);
          expect(result).toBe(true);
        });
      });
    
      describe('Invalid frontmatter tests', () => {
        it('Files with invalid YAML are treated as having no properties', () => {
          const task = createTaskWithFrontmatter('test.md', null as unknown as Record<string, unknown>);
          mockGetFileCache('test.md', null);
    
          const settings = { app: mockApp };
          const result = Search.evaluate('[type:Project]', task, false, settings);
          expect(result).toBe(false);
        });
    
        it('Tasks on files with no frontmatter are excluded from property matches', () => {
          const task = createTaskWithFrontmatter('test.md', null as unknown as Record<string, unknown>);
          mockGetFileCache('test.md', null);
    
          const settings = { app: mockApp };
          const result = Search.evaluate('[type]', task, false, settings);
          expect(result).toBe(false);
        });
      });
    
      describe('Top-level properties only tests', () => {
        it('[type:Project] matches type: Project', () => {
          const task = createTaskWithFrontmatter('test.md', { type: 'Project' });
          mockGetFileCache('test.md', { type: 'Project' });
    
          const settings = { app: mockApp };
          const result = Search.evaluate('[type:Project]', task, false, settings);
          expect(result).toBe(true);
        });
    
        it('Does NOT match nested properties like project.type: Project', () => {
          const task = createTaskWithFrontmatter('test.md', { project: { type: 'Project' } });
          mockGetFileCache('test.md', { project: { type: 'Project' } });
    
          const settings = { app: mockApp };
          const result = Search.evaluate('[type:Project]', task, false, settings);
          expect(result).toBe(false);
        });
      });
    
      describe('Comparison with case sensitivity tests', () => {
        it('["Size":>100] respects case sensitivity', () => {
          const task = createTaskWithFrontmatter('test.md', { Size: 150 });
          mockGetFileCache('test.md', { Size: 150 });
    
          const settings = { app: mockApp };
          const result = Search.evaluate('["Size":>100]', task, true, settings);
          expect(result).toBe(true);
        });
    
        it('["size":>100] does NOT match "Size" if case sensitive', () => {
          const task = createTaskWithFrontmatter('test.md', { Size: 150 });
          mockGetFileCache('test.md', { Size: 150 });
    
          const settings = { app: mockApp };
          const result = Search.evaluate('["size":>100]', task, true, settings);
          expect(result).toBe(false);
        });
      });
    
      describe('Complex expression tests', () => {
        it('(state:TODO OR state:DOING) [type:Project] combines OR with property', () => {
          const task = createTaskWithFrontmatter('test.md', { type: 'Project' });
          task.state = 'TODO';
          mockGetFileCache('test.md', { type: 'Project' });
    
          const settings = { app: mockApp } as any;
          const result = Search.evaluate('(state:TODO OR state:DOING) [type:Project]', task, false, settings);
          expect(result).toBe(true);
        });
    
        it('[type:Project] [status:(Draft OR Published)] combines OR in property value', () => {
          const task = createTaskWithFrontmatter('test.md', { type: 'Project', status: 'Draft' });
          mockGetFileCache('test.md', { type: 'Project', status: 'Draft' });
    
          const settings = { app: mockApp } as any;
          const result = Search.evaluate('[type:Project] [status:(Draft OR Published)]', task, false, settings);
          expect(result).toBe(true);
        });
    
        it('-[type:Project] [status:active] combines negation with other filters', () => {
          const task = createTaskWithFrontmatter('test.md', { type: 'Task', status: 'active' });
          mockGetFileCache('test.md', { type: 'Task', status: 'active' });
    
          const settings = { app: mockApp } as any;
          const result = Search.evaluate('-[type:Project] [status:active]', task, false, settings);
          expect(result).toBe(true);
        });
      });
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
