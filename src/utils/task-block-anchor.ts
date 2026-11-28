/**
 * Bounded task-block walk for block anchors (Markdown only).
 *
 * Keep this separate from `block-anchor.ts`: the suffix grammar is a leaf
 * imported by task-properties/task-line-utils, so the block walk (which
 * imports those) must live above it to keep the graph acyclic. Callers guard
 * Org, table and code-comment tasks before calling these helpers.
 */

import { Editor } from 'obsidian';
import { appendBlockAnchor, splitTrailingBlockAnchor } from './block-anchor';
import { buildRemovalRange } from './task-sub-bullets';

/**
 * Final line of the recognised task block: the task line plus contiguous
 * metadata and one bounded properties drawer. A blank line, prose, a sibling
 * or a child task ends the block.
 */
export function findTaskBlockEndLine(
  lines: string[],
  taskLine: number,
  taskIndent: string,
): number {
  return buildRemovalRange(lines, taskLine, taskIndent).end;
}

/**
 * The task's block anchor, scanning the task line first and then the block
 * end. The task-line anchor wins for legacy notes. An anchor on an
 * intermediate metadata line is ordinary text.
 */
function editorLines(editor: Editor): string[] {
  return Array.from({ length: editor.lineCount() }, (_, i) =>
    editor.getLine(i),
  );
}

/** Re-home a captured anchor on the editor's resulting block end. */
export function relocateBlockAnchorInEditor(
  editor: Editor,
  taskLine: number,
  taskIndent: string,
  anchor: string | null,
): void {
  if (!anchor) return;
  const replaceLine = (index: number, text: string): void => {
    editor.replaceRange(
      text,
      { line: index, ch: 0 },
      { line: index, ch: editor.getLine(index).length },
    );
  };
  const end = findTaskBlockEndLine(editorLines(editor), taskLine, taskIndent);
  for (let i = taskLine; i <= end; i++) {
    const split = splitTrailingBlockAnchor(editor.getLine(i) ?? '');
    if (split.anchor === anchor) {
      replaceLine(i, split.text);
      break;
    }
  }
  const newEnd = findTaskBlockEndLine(
    editorLines(editor),
    taskLine,
    taskIndent,
  );
  replaceLine(newEnd, appendBlockAnchor(editor.getLine(newEnd) ?? '', anchor));
}

export function findTaskBlockAnchor(
  lines: string[],
  taskLine: number,
  taskIndent: string,
): { anchor: string; line: number } | null {
  const taskLineAnchor = splitTrailingBlockAnchor(lines[taskLine] ?? '').anchor;
  if (taskLineAnchor) return { anchor: taskLineAnchor, line: taskLine };

  const endLine = findTaskBlockEndLine(lines, taskLine, taskIndent);
  if (endLine === taskLine) return null;

  const endAnchor = splitTrailingBlockAnchor(lines[endLine] ?? '').anchor;
  return endAnchor ? { anchor: endAnchor, line: endLine } : null;
}
