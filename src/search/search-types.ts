export type SearchPrefix =
  | 'path'
  | 'file'
  | 'tag'
  | 'state'
  | 'priority'
  | 'content'
  | 'scheduled'
  | 'deadline'
  | 'property';

export interface SearchToken {
  type:
    | 'word'
    | 'phrase'
    | 'or'
    | 'and'
    | 'not'
    | 'range'
    | 'lparen'
    | 'rparen'
    | 'prefix'
    | 'prefix_value'
    | 'prefix_value_quoted'
    | 'property';
  value: string;
  original: string;
  position: number;
}

export interface SearchNode {
  type:
    | 'and'
    | 'or'
    | 'not'
    | 'term'
    | 'phrase'
    | 'prefix_filter'
    | 'range_filter'
    | 'property_filter';
  children?: SearchNode[];
  value?: string;
  field?: SearchPrefix | 'property'; // Allow 'property' as a field type
  start?: string;
  end?: string;
  position?: number;
  exact?: boolean; // Track if value was originally quoted for exact matching
}

export class SearchError extends Error {
  constructor(
    message: string,
    public position?: number,
  ) {
    super(message);
    this.name = 'SearchError';
  }
}
