export type SearchPrefix = 'path' | 'file' | 'tag' | 'state' | 'priority' | 'content';

export interface SearchToken {
  type: 'word' | 'phrase' | 'or' | 'and' | 'not' | 'lparen' | 'rparen' | 'prefix' | 'prefix_value';
  value: string;
  original: string;
  position: number;
}

export interface SearchNode {
  type: 'and' | 'or' | 'not' | 'term' | 'phrase' | 'prefix_filter';
  children?: SearchNode[];
  value?: string;
  field?: SearchPrefix;
  position?: number;
}

export class SearchError extends Error {
  constructor(message: string, public position?: number) {
    super(message);
    this.name = 'SearchError';
  }
}