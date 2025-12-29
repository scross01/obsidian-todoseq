import { SearchToken, SearchNode, SearchError } from './search-types';
import { SearchTokenizer } from './search-tokenizer';

export class SearchParser {
  
  static parse(query: string): SearchNode {
    const tokens = SearchTokenizer.tokenize(query);
    return this.parseTokens(tokens);
  }

  static parseTokens(tokens: SearchToken[]): SearchNode {
    const parser = new PrattParser(tokens);
    return parser.parseExpression(0);
  }

  static validate(query: string): boolean {
    try {
      this.parse(query);
      return true;
    } catch (error) {
      return false;
    }
  }
}

// Pratt parser implementation for search expressions
class PrattParser {
  private tokens: SearchToken[];
  private position = 0;

  constructor(tokens: SearchToken[]) {
    this.tokens = tokens;
  }

  parseExpression(bp: number): SearchNode {
    let left = this.parsePrefix();

    while (this.position < this.tokens.length) {
      const currentToken = this.tokens[this.position];
      
      // Stop at right parenthesis - let the parent context handle it
      if (currentToken.type === 'rparen') {
        break;
      }

      const currentBP = SearchTokenizer.getBindingPower(currentToken.type);

      if (currentBP <= bp) {
        break;
      }

      // Handle NOT operator as prefix (special case)
      if (currentToken.type === 'not') {
        this.position++;
        // Parse the term that NOT applies to
        const right = this.parseExpression(SearchTokenizer.getBindingPower('not') - 1);
        left = {
          type: 'and',
          children: [left, { type: 'not', children: [right], position: currentToken.position }],
          position: currentToken.position
        };
        continue;
      }

      // Handle prefix tokens as implicit AND with previous prefix filter
      if (currentToken.type === 'prefix') {
        // Parse the next prefix filter (don't increment position yet)
        const right = this.parsePrefixFilter();
        left = {
          type: 'and',
          children: [left, right],
          position: currentToken.position
        };
        continue;
      }

      this.position++;

      // Handle implicit AND for consecutive terms
      if (currentToken.type === 'word' || currentToken.type === 'phrase') {
        // Create an AND node with the current left and the new term
        const right = this.createTermNode(currentToken);
        left = {
          type: 'and',
          children: [left, right],
          position: currentToken.position
        };
      } else {
        left = this.parseInfix(left, currentToken);
      }
    }

    return left;
  }

  private parsePrefix(): SearchNode {
    if (this.position >= this.tokens.length) {
      throw new SearchError('Unexpected end of expression', this.position);
    }

    const token = this.tokens[this.position];

    switch (token.type) {
      case 'not':
        this.position++;
        const notExpr = this.parseExpression(SearchTokenizer.getBindingPower('not') - 1);
        return { type: 'not', children: [notExpr], position: token.position };
      
      case 'lparen':
        this.position++;
        const parenExpr = this.parseExpression(0);
        
        if (this.position >= this.tokens.length || this.tokens[this.position].type !== 'rparen') {
          throw new SearchError('Expected closing parenthesis', this.position);
        }
        
        this.position++; // consume rparen
        return parenExpr;
      
      case 'prefix':
        return this.parsePrefixFilter();
      
      case 'word':
      case 'phrase':
        this.position++;
        return this.createTermNode(token);
      
      default:
        throw new SearchError(`Unexpected token: ${token.original}`, token.position);
    }
  }

  private parsePrefixFilter(): SearchNode {
    // Expecting a prefix token followed by a prefix_value token
    if (this.position >= this.tokens.length) {
      throw new SearchError('Unexpected end of expression after prefix', this.position);
    }

    const prefixToken = this.tokens[this.position];
    if (prefixToken.type !== 'prefix') {
      throw new SearchError(`Expected prefix token, got ${prefixToken.type}`, prefixToken.position);
    }

    this.position++;

    // Check if there's a value after the prefix
    if (this.position >= this.tokens.length) {
      throw new SearchError('Expected value after prefix', prefixToken.position);
    }

    const valueToken = this.tokens[this.position];
    
    // Handle both prefix_value and regular word/phrase tokens
    if (valueToken.type === 'prefix_value' || valueToken.type === 'word' || valueToken.type === 'phrase') {
      const field = prefixToken.value as any; // Will be validated in evaluator
      const value = valueToken.value;
      this.position++;
      
      return {
        type: 'prefix_filter',
        field: field,
        value: value,
        position: prefixToken.position
      };
    } else {
      throw new SearchError(`Expected prefix value, got ${valueToken.type}`, valueToken.position);
    }
  }

  private parseInfix(left: SearchNode, operator: SearchToken): SearchNode {
    switch (operator.type) {
      case 'or':
      case 'and': {
        const right = this.parseExpression(SearchTokenizer.getBindingPower(operator.type) - 1);
        return {
          type: operator.type,
          children: [left, right],
          position: operator.position
        };
      }
      
      case 'range': {
        // Handle range expressions like "2024-01-01..2024-01-31"
        // The left node should be a prefix filter with a date value
        if (left.type === 'prefix_filter' && left.field && (left.field === 'scheduled' || left.field === 'deadline')) {
          // Parse the right side of the range
          // Note: position was already incremented in parseExpression before calling parseInfix
          const rightToken = this.tokens[this.position];
          
          if (!rightToken || (rightToken.type !== 'prefix_value' && rightToken.type !== 'word' && rightToken.type !== 'phrase')) {
            throw new SearchError('Expected date value after range operator', operator.position);
          }
          
          this.position++;
          
          return {
            type: 'range_filter',
            field: left.field,
            start: left.value,
            end: rightToken.value,
            position: operator.position
          };
        } else {
          throw new SearchError('Range operator can only be used with scheduled: or deadline: prefixes', operator.position);
        }
      }
      
      default:
        throw new SearchError(`Unexpected infix operator: ${operator.original}`, operator.position);
    }
  }

  private createTermNode(token: SearchToken): SearchNode {
    switch (token.type) {
      case 'word':
        return { type: 'term', value: token.value, position: token.position };
      case 'phrase':
        return { type: 'phrase', value: token.value, position: token.position };
      case 'prefix_value':
        // Treat prefix_value as a term when not preceded by a prefix
        return { type: 'term', value: token.value, position: token.position };
      default:
        throw new SearchError(`Cannot create term from token type: ${token.type}`, token.position);
    }
  }

  // Post-processing to handle implicit AND operations
  static postProcessAST(node: SearchNode): SearchNode {
    if (node.type === 'and' || node.type === 'or') {
      // Already explicit, just process children
      if (node.children) {
        node.children = node.children.map(child => this.postProcessAST(child));
      }
      return node;
    }
    
    // For other node types, we need to handle implicit AND
    // This would be handled at a higher level during evaluation
    return node;
  }
}