/**
 * A source line that affects dependency structure without becoming a Task.
 *
 * Entries are memory-only and published alongside the task snapshot. Blank
 * lines are deliberately absent: their effect is "preserve the current group",
 * which the structure builder gets by simply not seeing an entry.
 */
export type StructuralEntryKind =
  | 'heading'
  | 'prose'
  | 'checkbox'
  | 'archived';

export interface StructuralEntry {
  kind: StructuralEntryKind;
  path: string;
  /** Zero-based source line. */
  line: number;
  /** Whitespace indentation, excluding any quote prefix. */
  indent: string;
  indentLength: number;
  quotePrefix: string;
  /** Markdown 1–6 or Org star depth for headings. */
  headingLevel?: number;
  /** Heading text or checkbox label, whitespace-normalised. */
  text?: string;
  /** Org/Markdown checkbox state; `-` is partial and not checked. */
  checked?: boolean;
  /** Archived task or archived heading: a boundary, never a prerequisite. */
  archived?: boolean;
}
