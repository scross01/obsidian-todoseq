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
      
      case 'word':
      case 'phrase':
        this.position++;
        return this.createTermNode(token);
      
      default:
        throw new SearchError(`Unexpected token: ${token.original}`, token.position);
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