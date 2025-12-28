import { SearchToken } from './search-types';

// Binding power constants for Pratt parser
const enum BP {
  NOT = 100,
  AND = 80,
  OR = 60,
  DEFAULT = 50
}

export class SearchTokenizer {
  
  // Token patterns in order of precedence
  private static readonly PATTERNS = [
    { type: 'phrase' as const, regex: /"(?:\\.|[^"\\])*"/y },
    { type: 'or' as const, regex: /\bOR\b/y },
    { type: 'and' as const, regex: /\bAND\b/y },
    { type: 'not' as const, regex: /-/y },
    { type: 'lparen' as const, regex: /\(/y },
    { type: 'rparen' as const, regex: /\)/y },
    { type: 'word' as const, regex: /[^\s"()\-]+/y }
  ];

  static tokenize(query: string): SearchToken[] {
    const tokens: SearchToken[] = [];
    let pos = 0;

    while (pos < query.length) {
      // Skip whitespace
      if (/\s/.test(query[pos])) {
        pos++;
        continue;
      }

      let matched = false;

      // Try each pattern in order
      for (const pattern of this.PATTERNS) {
        pattern.regex.lastIndex = pos;
        const match = pattern.regex.exec(query);

        if (match && match.index === pos) {
          const value = this.processTokenValue(match[0], pattern.type);
          tokens.push({
            type: pattern.type,
            value: value,
            original: match[0],
            position: pos
          });
          pos = pattern.regex.lastIndex;
          matched = true;
          break;
        }
      }

      // If no pattern matched, skip character (error handling)
      if (!matched) {
        pos++;
      }
    }

    return tokens;
  }

  private static processTokenValue(token: string, type: SearchToken['type']): string {
    switch (type) {
      case 'phrase':
        // Remove surrounding quotes and process escaped quotes
        const content = token.slice(1, -1);
        return content.replace(/\\"/g, '"');
      case 'or':
      case 'and':
        // Convert to lowercase for consistency
        return token.toLowerCase();
      case 'word':
      case 'not':
      case 'lparen':
      case 'rparen':
        return token;
      default:
        return token;
    }
  }

  static getBindingPower(type: SearchToken['type']): number {
    switch (type) {
      case 'not': return BP.NOT;
      case 'and': return BP.AND;
      case 'or': return BP.OR;
      case 'word': return BP.DEFAULT;
      case 'phrase': return BP.DEFAULT;
      default: return BP.DEFAULT;
    }
  }
}