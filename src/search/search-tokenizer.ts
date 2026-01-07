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
    { type: 'range' as const, regex: /\.\./y },
    { type: 'lparen' as const, regex: /\(/y },
    { type: 'rparen' as const, regex: /\)/y },
    { type: 'prefix' as const, regex: /\b(path|file|tag|state|priority|content|scheduled|deadline):/y },
    { type: 'word' as const, regex: /[^\s"()-]+/y }
  ] as const;

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
          let type = pattern.type as SearchToken['type'];
          
          // Special handling: if this is a word token and the previous token was a prefix,
          // convert it to a prefix_value token
          if (type === 'word' && tokens.length > 0 && tokens[tokens.length - 1].type === 'prefix') {
            type = 'prefix_value';
          }
          
          // Special handling: if this is a dash and the previous token was a prefix_value
          // merge it with the next word token to form a single prefix_value with dash
          // Only merge if there was no whitespace before the dash (i.e., dash is immediately after the prefix_value)
          if (type === 'not' && tokens.length > 0 && tokens[tokens.length - 1].type === 'prefix_value') {
            // Only merge if there was no whitespace before the dash
            const prevTokenEndPos = tokens[tokens.length - 1].position + tokens[tokens.length - 1].original.length;
            const dashStartPos = pos;
            const hasWhitespaceBeforeDash = dashStartPos > prevTokenEndPos;
            
            if (!hasWhitespaceBeforeDash) {
              // Look ahead to see if there's a word after the dash
              const lookaheadPos = pattern.regex.lastIndex;
              const wordPattern = /[^\s"()-]+/y;
              wordPattern.lastIndex = lookaheadPos;
              const wordMatch = wordPattern.exec(query);
              
              if (wordMatch && wordMatch.index === lookaheadPos) {
                // Merge the previous prefix_value, dash, and next word into one prefix_value
                const prevToken = tokens[tokens.length - 1];
                tokens[tokens.length - 1] = {
                  type: 'prefix_value',
                  value: prevToken.value + '-' + wordMatch[0],
                  original: prevToken.original + '-' + wordMatch[0],
                  position: prevToken.position
                };
                pos = wordPattern.lastIndex;
                matched = true;
                break;
              }
            }
          }

          tokens.push({
            type: type,
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
        {
          const content = token.slice(1, -1);
          return content.replace(/\\"/g, '"');
        }
      case 'prefix':
        // Remove colon from prefix (e.g., "path:" -> "path")
        return token.slice(0, -1);
      case 'prefix_value':
        // Remove surrounding quotes if present
        if (token.startsWith('"') && token.endsWith('"')) {
          const content = token.slice(1, -1);
          return content.replace(/\\"/g, '"');
        }
        return token;
      case 'or':
      case 'and':
      case 'range':
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
      case 'range': return BP.DEFAULT;
      case 'prefix': return BP.DEFAULT;
      case 'prefix_value': return BP.DEFAULT;
      case 'word': return BP.DEFAULT;
      case 'phrase': return BP.DEFAULT;
      default: return BP.DEFAULT;
    }
  }
}