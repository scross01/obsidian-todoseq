import { SearchError, SearchToken } from './search-types';

// Binding power constants for Pratt parser
const enum BP {
  NOT = 100,
  AND = 80,
  OR = 60,
  // Adjacency uses AND's binding power; there is no separate default.
}

export class SearchTokenizer {
  // Token patterns in order of precedence
  private static readonly PATTERNS = [
    { type: 'phrase' as const, regex: /"(?:\\.|[^"\\])*"/y },
    { type: 'or' as const, regex: /\bOR\b/iy },
    { type: 'and' as const, regex: /\bAND\b/iy },
    { type: 'range' as const, regex: /\.\./y },
    { type: 'lparen' as const, regex: /\(/y },
    { type: 'rparen' as const, regex: /\)/y },
    {
      type: 'prefix' as const,
      regex:
        /\b(path|file|tag|state|priority|content|description|heading|scheduled|deadline|closed|started):/y,
    },
    // Property bracket syntax: [key:value], ["key":"value"], [type], [type:Draft OR Published]
    {
      type: 'property' as const,
      regex:
        /\[(?:"([^"\\]*(?:\\.[^"\\]*)*)"|([^\s:"\]]+))(?:\s*:\s*(?:"([^"\\]*(?:\\.[^"\\]*)*)"|([^\]]*)))?\]/y,
    },
    { type: 'not' as const, regex: /-/y },
    { type: 'word' as const, regex: /[^\s"()]+/y },
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

      // Try range pattern first after prefix_value or prefix_value_quoted
      if (
        tokens.length > 0 &&
        (tokens[tokens.length - 1].type === 'prefix_value' ||
          tokens[tokens.length - 1].type === 'prefix_value_quoted') &&
        query.slice(pos).startsWith('..')
      ) {
        tokens.push({
          type: 'range',
          value: '..',
          original: '..',
          position: pos,
        });
        pos += 2;
        matched = true;
      } else {
        // Try each pattern in order. For word pattern after a prefix with a range,
        // extract the prefix value before the range and create a prefix_value token
        for (const pattern of this.PATTERNS) {
          // Extract prefix value before range if we're after a prefix and might have a range
          if (
            pattern.type === 'word' &&
            tokens.length > 0 &&
            tokens[tokens.length - 1].type === 'prefix'
          ) {
            // Bound the lookahead to this value token. Searching the whole
            // remainder let a later date range swallow an earlier prefix
            // value (`state:TODO scheduled:2026-01-01..2026-12-31`).
            const valuePattern = /[^\s"()]+/y;
            valuePattern.lastIndex = pos;
            const valueMatch = valuePattern.exec(query);
            const rangePos = valueMatch ? valueMatch[0].indexOf('..') : -1;
            if (valueMatch && rangePos > 0) {
              const prefixValue = valueMatch[0].slice(0, rangePos);
              tokens.push({
                type: 'prefix_value',
                value: prefixValue,
                original: prefixValue,
                position: pos,
              });
              pos += rangePos;
              matched = true;
              break;
            }
          }

          pattern.regex.lastIndex = pos;
          const match = pattern.regex.exec(query);

          if (match && match.index === pos) {
            const value = this.processTokenValue(match[0], pattern.type);
            let type = pattern.type as SearchToken['type'];

            // Special handling: if this is a word token and the previous token was a prefix,
            // convert it to a prefix_value token
            if (
              type === 'word' &&
              tokens.length > 0 &&
              tokens[tokens.length - 1].type === 'prefix'
            ) {
              type = 'prefix_value';
            }

            // Special handling: if this is a phrase token and the previous token was a prefix,
            // convert it to prefix_value_quoted to track it was originally quoted
            if (
              type === 'phrase' &&
              tokens.length > 0 &&
              tokens[tokens.length - 1].type === 'prefix'
            ) {
              type = 'prefix_value_quoted';
            }

            // Special handling: if this is a dash and the previous token was a prefix_value
            // merge it with the next word token to form a single prefix_value with dash
            // Only merge if there was no whitespace before the dash (i.e., dash is immediately after the prefix_value)
            if (
              type === 'not' &&
              tokens.length > 0 &&
              tokens[tokens.length - 1].type === 'prefix_value'
            ) {
              // Only merge if there was no whitespace before the dash
              const prevTokenEndPos =
                tokens[tokens.length - 1].position +
                tokens[tokens.length - 1].original.length;
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
                    position: prevToken.position,
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
              position: pos,
            });
            pos = pattern.regex.lastIndex;
            matched = true;
            break;
          }
        }
      }

      // If no pattern matched, reject an unterminated quote rather than
      // silently dropping it and searching for the remaining text.
      if (!matched) {
        if (query[pos] === '"') {
          throw new SearchError('Unterminated quoted string');
        }
        pos++;
      }
    }

    return tokens;
  }

  private static processTokenValue(
    token: string,
    type: SearchToken['type'],
  ): string {
    switch (type) {
      case 'phrase': {
        // Remove surrounding quotes and process escaped quotes
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
      case 'prefix_value_quoted':
        // Remove surrounding quotes from quoted prefix values
        if (token.startsWith('"') && token.endsWith('"')) {
          const content = token.slice(1, -1);
          return content.replace(/\\"/g, '"');
        }
        return token;
      case 'property': {
        // Remove outer brackets and process quotes within
        // Format: [key:value] or ["key":"value"] or [key:"value"] etc.
        const inner = token.slice(1, -1); // Remove [ and ]

        // Extract key and value from the regex groups (if using our new regex)
        // First, try to find quoted keys or values
        const quotedKeyMatch = inner.match(
          /^"([^"\\]*(?:\\.[^"\\]*)*)"(\s*:(?:\s*"([^"\\]*(?:\\.[^"\\]*)*)"|\s*([^\]]*)))?$/,
        );
        if (quotedKeyMatch) {
          const processedKey = quotedKeyMatch[1].replace(/\\"/g, '"');
          if (quotedKeyMatch[3]) {
            // Quoted value
            const processedValue = quotedKeyMatch[3].replace(/\\"/g, '"');
            return `${processedKey}:${processedValue}`;
          } else if (quotedKeyMatch[4]) {
            // Unquoted value
            const processedValue = quotedKeyMatch[4]
              .trim()
              .replace(/\\"/g, '"');
            return processedValue
              ? `${processedKey}:${processedValue}`
              : processedKey;
          } else {
            // Key-only
            return processedKey;
          }
        }

        // Fallback to original method for unquoted keys
        const colonIndex = inner.indexOf(':');
        if (colonIndex === -1) {
          // Key-only case like [type]
          return inner;
        }
        const keyPart = inner.slice(0, colonIndex).trim();
        const valuePart = inner.slice(colonIndex + 1).trim();

        // Process key: remove quotes if present
        let processedKey = keyPart;
        if (processedKey.startsWith('"') && processedKey.endsWith('"')) {
          processedKey = processedKey.slice(1, -1).replace(/\\"/g, '"');
        }

        // Process value: remove quotes if present, keep null, operators, and expressions as-is
        let processedValue = valuePart;
        if (processedValue.startsWith('"') && processedValue.endsWith('"')) {
          processedValue = processedValue.slice(1, -1).replace(/\\"/g, '"');
        }

        // Return as "key:value" format for parsing
        return `${processedKey}:${processedValue}`;
      }
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
      case 'not':
        return BP.NOT;
      case 'and':
        return BP.AND;
      case 'or':
        return BP.OR;
      case 'range':
        return BP.AND;
      case 'prefix':
        return BP.AND;
      case 'prefix_value':
        return BP.AND;
      case 'prefix_value_quoted':
        return BP.AND;
      case 'property':
        return BP.AND;
      case 'word':
        return BP.AND;
      case 'phrase':
        return BP.AND;
      default:
        return BP.AND;
    }
  }
}
