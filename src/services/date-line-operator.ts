/**
 * Date line operation helpers for TaskWriter.
 *
 * Extracts common orchestration logic shared by update/remove methods
 * for SCHEDULED, DEADLINE, and CLOSED date lines.
 *
 * Each operation follows the same pattern:
 * 1. Find existing date line via findDateLine()
 * 2. Determine effective indent (preserve existing or compute default via getDateLineIndent)
 * 3. Update existing line OR insert new line at type-specific position
 * 4. Return mutated lines array and lineDelta
 */

import { Task } from '../types/task';
import { KeywordManager } from '../utils/keyword-manager';
import {
  findDateLine,
  getTaskIndent,
  getDateLineIndent,
} from '../utils/task-line-utils';

export type DateLineType = 'SCHEDULED' | 'DEADLINE' | 'CLOSED';

/**
 * Extract the effective indentation from a date line.
 * Handles both plain indentation and quoted lines ("> " prefixes).
 */
export function getExistingIndent(line: string): string {
  const lineIndent = line.match(/^(\s*)/)?.[1] ?? '';
  const lineQuotePrefix = line.match(/^(\s*(>\s*)+)/)?.[1] ?? '';
  return lineQuotePrefix || lineIndent;
}

/**
 * Resolve the indent to use for a date line operation.
 * If the line already exists, preserves its current indent.
 * Otherwise, computes the default indent for the task.
 */
export function getEffectiveIndent(
  lines: string[],
  existingLineIndex: number,
  task: Task,
): string {
  if (existingLineIndex >= 0) {
    return getExistingIndent(lines[existingLineIndex]);
  }
  return getDateLineIndent(task);
}

/**
 * Calculate the line index where a new date line should be inserted.
 *
 * Insertion rules (all indices relative to task.line):
 * - SCHEDULED: before DEADLINE (if exists), else after task
 * - DEADLINE:  after SCHEDULED (if exists), else after task
 * - CLOSED:    after DEADLINE (if exists), else after SCHEDULED (if exists), else after task
 */
export function calcInsertIndex(
  lines: string[],
  taskLineIndex: number,
  dateType: DateLineType,
  taskIndent: string,
  keywordManager: KeywordManager,
): number {
  if (dateType === 'SCHEDULED') {
    const deadlineIdx = findDateLine(
      lines,
      taskLineIndex + 1,
      'DEADLINE',
      taskIndent,
      keywordManager,
    );
    return deadlineIdx >= 0 ? deadlineIdx : taskLineIndex + 1;
  }
  if (dateType === 'DEADLINE') {
    const scheduledIdx = findDateLine(
      lines,
      taskLineIndex + 1,
      'SCHEDULED',
      taskIndent,
      keywordManager,
    );
    return scheduledIdx >= 0 ? scheduledIdx + 1 : taskLineIndex + 1;
  }
  // CLOSED
  const deadlineIdx = findDateLine(
    lines,
    taskLineIndex + 1,
    'DEADLINE',
    taskIndent,
    keywordManager,
  );
  if (deadlineIdx >= 0) {
    return deadlineIdx + 1;
  }
  const scheduledIdx = findDateLine(
    lines,
    taskLineIndex + 1,
    'SCHEDULED',
    taskIndent,
    keywordManager,
  );
  if (scheduledIdx >= 0) {
    return scheduledIdx + 1;
  }
  return taskLineIndex + 1;
}

/**
 * Update an existing date line or insert a new one.
 * Returns the resulting lines and the line delta.
 */
export function updateOrInsert(
  lines: string[],
  taskLineIndex: number,
  dateType: DateLineType,
  dateStr: string,
  task: Task,
  keywordManager: KeywordManager,
): { lines: string[]; lineDelta: number } {
  const taskIndent = getTaskIndent(task);
  const existingIdx = findDateLine(
    lines,
    taskLineIndex + 1,
    dateType,
    taskIndent,
    keywordManager,
  );

  if (existingIdx >= 0) {
    const indent = getEffectiveIndent(lines, existingIdx, task);
    lines[existingIdx] = `${indent}${dateType}: ${dateStr}`;
    return { lines, lineDelta: 0 };
  }

  const insertIdx = calcInsertIndex(
    lines,
    taskLineIndex,
    dateType,
    taskIndent,
    keywordManager,
  );
  const indent = getEffectiveIndent(lines, -1, task);
  lines.splice(insertIdx, 0, `${indent}${dateType}: ${dateStr}`);
  return { lines, lineDelta: 1 };
}

/**
 * Remove a date line.
 * Returns the resulting lines and the line delta.
 */
export function remove(
  lines: string[],
  taskLineIndex: number,
  dateType: DateLineType,
  task: Task,
  keywordManager: KeywordManager,
): { lines: string[]; lineDelta: number } {
  const taskIndent = getTaskIndent(task);
  const existingIdx = findDateLine(
    lines,
    taskLineIndex + 1,
    dateType,
    taskIndent,
    keywordManager,
  );

  if (existingIdx >= 0) {
    lines.splice(existingIdx, 1);
    return { lines, lineDelta: -1 };
  }

  return { lines, lineDelta: 0 };
}
