/**
 * Bounded task-block walk for block anchors (Markdown only).
 *
 * Keep this separate from `block-anchor.ts`: the suffix grammar is a leaf
 * imported by task-properties/task-line-utils, so the block walk (which
 * imports those) must live above it to keep the graph acyclic. Callers guard
 * Org, table and code-comment tasks before calling these helpers.
 */

import { splitTrailingBlockAnchor } from './block-anchor';
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
