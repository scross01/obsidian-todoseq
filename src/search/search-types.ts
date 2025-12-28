export interface SearchToken {
  type: 'word' | 'phrase' | 'or' | 'and' | 'not' | 'lparen' | 'rparen';
  value: string;
  original: string;
  position: number;
}

export interface SearchNode {
  type: 'and' | 'or' | 'not' | 'term' | 'phrase';
  children?: SearchNode[];
  value?: string;
  position?: number;
}

export class SearchError extends Error {
  constructor(message: string, public position?: number) {
    super(message);
    this.name = 'SearchError';
  }
}