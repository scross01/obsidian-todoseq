import type { EditorState } from '@codemirror/state';
import {
  isPropertiesDrawerStart,
  readTaskPropertiesDrawer,
} from './task-properties';

export interface PropertyDrawerFoldRange {
  from: number;
  to: number;
}

export type IsTaskLine = (line: string) => boolean;

const OWNER_SCAN_LIMIT = 60;
const DRAWER_SCAN_LIMIT = 60;

const METADATA_PREFIXES = [
  'SCHEDULED:',
  'DEADLINE:',
  'CLOSED:',
  'STARTED:',
  'DESCRIPTION:',
] as const;

/**
 * Strip indentation and callout quote markers for metadata comparisons. The
 * drawer reader already does this internally; this is only for deciding
 * whether a line above the drawer can sit between it and its task.
 */
function metadataBody(line: string): string {
  return line.trimStart().replace(/^(?:>[ \t]*)+/, '');
}

function hasTaskOwner(
  state: EditorState,
  headerLineNumber: number,
  isTaskLine: IsTaskLine,
): boolean {
  const firstLine = Math.max(1, headerLineNumber - OWNER_SCAN_LIMIT);

  for (
    let lineNumber = headerLineNumber - 1;
    lineNumber >= firstLine;
    lineNumber--
  ) {
    const text = state.doc.line(lineNumber).text;
    if (text.trim() === '') continue;
    if (isTaskLine(text)) return true;

    const body = metadataBody(text);
    if (METADATA_PREFIXES.some((prefix) => body.startsWith(prefix))) {
      continue;
    }
    return false;
  }

  return false;
}

/**
 * Find the native fold range for a task-owned properties drawer.
 *
 * The range starts after `:PROPERTIES:` so the header remains visible while
 * folded. Both the owner scan and the drawer scan are bounded to 60 lines so a
 * fold request stays cheap during editing; a longer drawer simply stays
 * unfolded. Unclosed and empty drawers return no range because folding them
 * would hide the header without useful metadata behind it.
 */
export function findPropertyDrawerFoldRange(
  state: EditorState,
  lineStart: number,
  isTaskLine: IsTaskLine | null,
): PropertyDrawerFoldRange | null {
  if (!isTaskLine) return null;

  const header = state.doc.lineAt(lineStart);
  const isMarkdownDrawer = isPropertiesDrawerStart(header.text, 'markdown');
  if (!isMarkdownDrawer && !isPropertiesDrawerStart(header.text, 'org')) {
    return null;
  }
  if (!hasTaskOwner(state, header.number, isTaskLine)) return null;

  const lastLineNumber = Math.min(
    state.doc.lines,
    header.number + DRAWER_SCAN_LIMIT - 1,
  );
  const lines: string[] = [];
  for (
    let lineNumber = header.number;
    lineNumber <= lastLineNumber;
    lineNumber++
  ) {
    lines.push(state.doc.line(lineNumber).text);
  }

  const drawer =
    readTaskPropertiesDrawer(lines, 0, 'markdown', {
      allowAnyIndent: true,
    }) ??
    readTaskPropertiesDrawer(lines, 0, 'org', {
      allowAnyIndent: true,
    });
  if (!drawer?.closed || drawer.entries.length === 0) return null;

  const closeLine = state.doc.line(header.number + drawer.endLine);
  return { from: header.to, to: closeLine.to };
}
