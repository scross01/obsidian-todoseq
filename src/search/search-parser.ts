import {
  SearchToken,
  SearchNode,
  SearchError,
  SearchPrefix,
} from './search-types';
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
        const right = this.parseExpression(
          SearchTokenizer.getBindingPower('not') - 1,
        );
        left = {
          type: 'and',
          children: [
            left,
            { type: 'not', children: [right], position: currentToken.position },
          ],
          position: currentToken.position,
        };
        continue;
      }

      // Handle prefix tokens as implicit AND with previous prefix filter
      if (currentToken.type === 'prefix') {
        // Parse the next prefix filter (don't increment position yet)
        const right = this.parsePrefixFilter();

        // If left is already an AND node, just add the new filter to its children
        if (left.type === 'and') {
          left.children!.push(right);
        } else {
          left = {
            type: 'and',
            children: [left, right],
            position: currentToken.position,
          };
        }
        continue;
      }

      // Handle property tokens as implicit AND with previous filter
      if (currentToken.type === 'property') {
        // Parse the property filter (don't increment position yet)
        const right = this.parsePropertyFilter();

        // If left is already an AND node, just add the new filter to its children
        if (left.type === 'and') {
          left.children!.push(right);
        } else {
          left = {
            type: 'and',
            children: [left, right],
            position: currentToken.position,
          };
        }
        continue;
      }

      // Handle left parenthesis as a special case - don't increment position yet
      if (currentToken.type === 'lparen') {
        // Parse the parenthesized expression
        this.position++;
        const parenExpr = this.parseExpression(0);

        if (
          this.position >= this.tokens.length ||
          this.tokens[this.position].type !== 'rparen'
        ) {
          throw new SearchError('Expected closing parenthesis', this.position);
        }

        this.position++; // consume rparen

        // If left is already an AND node, just add the parenthesized expression to its children
        if (left.type === 'and') {
          left.children!.push(parenExpr);
        } else {
          left = {
            type: 'and',
            children: [left, parenExpr],
            position: currentToken.position,
          };
        }
      } else {
        this.position++;

        // Handle implicit AND for consecutive terms
        if (currentToken.type === 'word' || currentToken.type === 'phrase') {
          // Create an AND node with the current left and the new term
          const right = this.createTermNode(currentToken);

          // If left is already an AND node, just add the new term to its children
          if (left.type === 'and') {
            left.children!.push(right);
          } else {
            left = {
              type: 'and',
              children: [left, right],
              position: currentToken.position,
            };
          }
        } else {
          left = this.parseInfix(left, currentToken);
        }
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
        {
          const notExpr = this.parseExpression(
            SearchTokenizer.getBindingPower('not') - 1,
          );
          return { type: 'not', children: [notExpr], position: token.position };
        }

      case 'lparen':
        this.position++;
        {
          const parenExpr = this.parseExpression(0);

          if (
            this.position >= this.tokens.length ||
            this.tokens[this.position].type !== 'rparen'
          ) {
            throw new SearchError(
              'Expected closing parenthesis',
              this.position,
            );
          }

          this.position++; // consume rparen
          return parenExpr;
        }

      case 'prefix':
        return this.parsePrefixFilter();

      case 'property':
        return this.parsePropertyFilter();

      case 'word':
      case 'phrase':
        this.position++;
        return this.createTermNode(token);

      default:
        throw new SearchError(
          `Unexpected token: ${token.original}`,
          token.position,
        );
    }
  }

  private parsePrefixFilter(): SearchNode {
    // Expecting a prefix token followed by a prefix_value token
    if (this.position >= this.tokens.length) {
      throw new SearchError(
        'Unexpected end of expression after prefix',
        this.position,
      );
    }

    const prefixToken = this.tokens[this.position];
    if (prefixToken.type !== 'prefix') {
      throw new SearchError(
        `Expected prefix token, got ${prefixToken.type}`,
        prefixToken.position,
      );
    }

    this.position++;

    // Check if there's a value after the prefix
    if (this.position >= this.tokens.length) {
      throw new SearchError(
        'Expected value after prefix',
        prefixToken.position,
      );
    }

    const valueToken = this.tokens[this.position];

    // Handle both prefix_value and regular word/phrase tokens
    if (
      valueToken.type === 'prefix_value' ||
      valueToken.type === 'word' ||
      valueToken.type === 'phrase' ||
      valueToken.type === 'prefix_value_quoted'
    ) {
      const field = prefixToken.value as SearchPrefix; // Will be validated in evaluator
      const value = valueToken.value;
      const exact =
        valueToken.type === 'phrase' ||
        valueToken.type === 'prefix_value_quoted'; // Quoted values should be exact matches
      this.position++;

      return {
        type: 'prefix_filter',
        field: field,
        value: value,
        position: prefixToken.position,
        exact: exact,
      };
    } else {
      throw new SearchError(
        `Expected prefix value, got ${valueToken.type}`,
        valueToken.position,
      );
    }
  }

  private parsePropertyFilter(): SearchNode {
    // Expecting a property token with value in "key:value" format
    if (this.position >= this.tokens.length) {
      throw new SearchError(
        'Unexpected end of expression after property',
        this.position,
      );
    }

    const propertyToken = this.tokens[this.position];
    if (propertyToken.type !== 'property') {
      throw new SearchError(
        `Expected property token, got ${propertyToken.type}`,
        propertyToken.position,
      );
    }

    this.position++;

    // Parse the property value which is in "key:value" format
    const propertyValue = propertyToken.value;

    // Find the colon to split key and value
    const colonIndex = propertyValue.indexOf(':');

    let key: string;
    let value: string | null = null;
    let exact = false;

    if (colonIndex === -1) {
      // Key-only case like [type]
      key = propertyValue;
      value = null;
    } else {
      // Key-value case like [type:Project]
      key = propertyValue.slice(0, colonIndex);
      value = propertyValue.slice(colonIndex + 1);

      // Check if the original property token had quoted values
      // We need to check the original token to determine if it was quoted
      const original = propertyToken.original;

      // Extract the original value part (after colon)
      const originalColonIndex = original.indexOf(':');
      if (originalColonIndex !== -1) {
        const originalValue = original.slice(originalColonIndex + 1, -1); // -1 to exclude closing bracket

        // Check if the original value was quoted
        if (originalValue.startsWith('"') && originalValue.endsWith('"')) {
          exact = true;
        }

        // Check if the original key was quoted
        const originalKeyPart = original.slice(1, originalColonIndex); // 1 to exclude opening bracket
        if (originalKeyPart.startsWith('"') && originalKeyPart.endsWith('"')) {
          exact = true;
        }
      }

      // Handle empty value case [type:]
      if (value === '') {
        value = null;
      }
    }

    return {
      type: 'property_filter',
      field: 'property',
      value: value === null ? key : `${key}:${value}`, // Store as key:value format for evaluator
      position: propertyToken.position,
      exact: exact,
    };
  }

  private parseInfix(left: SearchNode, operator: SearchToken): SearchNode {
    switch (operator.type) {
      case 'or':
      case 'and': {
        const right = this.parseExpression(
          SearchTokenizer.getBindingPower(operator.type) - 1,
        );
        return {
          type: operator.type,
          children: [left, right],
          position: operator.position,
        };
      }

      case 'range': {
        // Handle range expressions like "2024-01-01..2024-01-31"
        // The left node should be a prefix filter with a date value
        if (
          left.type === 'prefix_filter' &&
          left.field &&
          (left.field === 'scheduled' || left.field === 'deadline')
        ) {
          // Parse the right side of the range
          // Note: position was already incremented in parseExpression before calling parseInfix
          const rightToken = this.tokens[this.position];

          if (
            !rightToken ||
            (rightToken.type !== 'prefix_value' &&
              rightToken.type !== 'word' &&
              rightToken.type !== 'phrase')
          ) {
            throw new SearchError(
              'Expected date value after range operator',
              operator.position,
            );
          }

          this.position++;

          return {
            type: 'range_filter',
            field: left.field,
            start: left.value,
            end: rightToken.value,
            position: operator.position,
          };
        } else {
          throw new SearchError(
            'Range operator can only be used with scheduled: or deadline: prefixes',
            operator.position,
          );
        }
      }

      default:
        throw new SearchError(
          `Unexpected infix operator: ${operator.original}`,
          operator.position,
        );
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
        throw new SearchError(
          `Cannot create term from token type: ${token.type}`,
          token.position,
        );
    }
  }

  // Post-processing to handle implicit AND operations
  static postProcessAST(node: SearchNode): SearchNode {
    if (node.type === 'and' || node.type === 'or') {
      // Already explicit, just process children
      if (node.children) {
        node.children = node.children.map((child) =>
          this.postProcessAST(child),
        );
      }
      return node;
    }

    // For other node types, we need to handle implicit AND
    // This would be handled at a higher level during evaluation
    return node;
  }
}
