export type SearchPrefix =
  | 'path'
  | 'file'
  | 'tag'
  | 'state'
  | 'priority'
  | 'content'
  | 'description'
  | 'heading'
  | 'scheduled'
  | 'deadline'
  | 'closed'
  | 'started'
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

export type PropertyValueKind = 'existence' | 'null' | 'string';

/** Lossless property filter intent: presence, null, or a string value. */
export interface PropertyQueryDescriptor {
  key: string;
  kind: PropertyValueKind;
  value: string;
  exact: boolean;
  keyExact: boolean;
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
  /** Structural property intent; authoritative when present. */
  property?: PropertyQueryDescriptor;
}

export class SearchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SearchError';
  }
}
