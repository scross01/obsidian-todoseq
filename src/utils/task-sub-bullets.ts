import { App, TFile } from 'obsidian';
import { Task } from '../types/task';
import { CHECKBOX_DETECTION_REGEX, BULLET_LIST_PATTERN } from './patterns';
import { getIndentLength } from './task-line-utils';

/**
 * Metadata lines that belong to the task above them when a task block is
 * copied, moved or migrated. The set matches what TaskParser recognises for
 * a plain note task: the four date/history lines plus a single DESCRIPTION.
 */
export type TaskMetadataLineType =
  'scheduled' | 'deadline' | 'closed' | 'started' | 'description';

const METADATA_PREFIXES: ReadonlyArray<
  readonly [string, TaskMetadataLineType]
> = [
  ['SCHEDULED:', 'scheduled'],
  ['DEADLINE:', 'deadline'],
  ['CLOSED:', 'closed'],
  ['STARTED:', 'started'],
  ['DESCRIPTION:', 'description'],
];

/**
 * Classify a line as task metadata for the task at `taskIndent`.
 *
 * Mirrors TaskParser.getDateLineType/getDescriptionText: quoted metadata is
 * accepted at any indent, plain metadata must be at the task's indent or
 * deeper (heading tasks treat their `# ` indent as zero). Returns null for
 * anything that is not metadata, so the caller can stop its contiguous span.
 */
export function classifyTaskMetadataLine(
  line: string,
  taskIndent: string,
): TaskMetadataLineType | null {
  const trimmed = line.trim();
  if (trimmed === '') return null;

  if (trimmed.startsWith('>')) {
    const contentAfterArrow = trimmed.replace(/^>\s*/, '');
    for (const [prefix, type] of METADATA_PREFIXES) {
      if (contentAfterArrow.startsWith(prefix)) return type;
    }
    return null;
  }

  const isHeadingIndent = /^#{1,6}\s+$/.test(taskIndent);
  const taskIndentLength = isHeadingIndent ? 0 : getIndentLength(taskIndent);
  const lineIndent = line.substring(0, line.length - line.trimStart().length);
  if (getIndentLength(lineIndent) < taskIndentLength) return null;

  for (const [prefix, type] of METADATA_PREFIXES) {
    if (trimmed.startsWith(prefix)) return type;
  }
  return null;
}

/** Leading whitespace of a line, used when no task indent is supplied. */
function leadingIndent(line: string | undefined): string {
  if (!line) return '';
  return line.substring(0, line.length - line.trimStart().length);
}

export function taskHasCheckbox(task: Task): boolean {
  return CHECKBOX_DETECTION_REGEX.test(task.rawText);
}

export function buildRemovalRange(
  lines: string[],
  taskLine: number,
  taskIndent?: string,
): { start: number; end: number } {
  const indent = taskIndent ?? leadingIndent(lines[taskLine]);
  let end = taskLine;
  for (let i = taskLine + 1; i < lines.length; i++) {
    if (classifyTaskMetadataLine(lines[i], indent)) {
      end = i;
    } else {
      break;
    }
  }
  return { start: taskLine, end };
}

export function findSubtaskEnd(
  lines: string[],
  afterLine: number,
  taskIndent: string,
  parentHasCheckbox: boolean,
): number {
  const parentIndentLen = taskIndent.length;
  let end = afterLine;
  for (let i = afterLine + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === '') break;
    const lineIndentLen = line.length - line.trimStart().length;
    const trimmedContent = line.trimStart();
    if (lineIndentLen > parentIndentLen) {
      end = i;
    } else if (lineIndentLen === parentIndentLen) {
      const isCheckbox = CHECKBOX_DETECTION_REGEX.test(line);
      const isPlainBullet =
        !isCheckbox && BULLET_LIST_PATTERN.test(trimmedContent);
      if ((!parentHasCheckbox && isCheckbox) || isPlainBullet) {
        end = i;
      } else {
        break;
      }
    } else {
      break;
    }
  }
  return end;
}

export function extractSubtaskLines(
  lines: string[],
  dateEnd: number,
  taskIndent: string,
  parentHasCheckbox: boolean,
): string[] {
  const subtaskEnd = findSubtaskEnd(
    lines,
    dateEnd,
    taskIndent,
    parentHasCheckbox,
  );
  if (subtaskEnd <= dateEnd) return [];

  const parentIndentLen = taskIndent.length;
  const result: string[] = [];
  for (let i = dateEnd + 1; i <= subtaskEnd; i++) {
    result.push(lines[i].substring(parentIndentLen));
  }
  return result;
}

export function getSubtaskLinesFromLines(
  lines: string[],
  task: Task,
): string[] {
  const { end: dateEnd } = buildRemovalRange(lines, task.line, task.indent);
  return extractSubtaskLines(
    lines,
    dateEnd,
    task.indent,
    taskHasCheckbox(task),
  );
}

export function getTaskRemovalRange(
  lines: string[],
  task: Task,
): { start: number; end: number } {
  const { start, end: dateEnd } = buildRemovalRange(
    lines,
    task.line,
    task.indent,
  );
  const subtaskEnd = findSubtaskEnd(
    lines,
    dateEnd,
    task.indent,
    taskHasCheckbox(task),
  );
  return { start, end: subtaskEnd };
}

export function modifyLinesForMigration(
  lines: string[],
  taskLine: number,
  oldKeyword: string,
  migrateState: string,
): string[] {
  const result = [...lines];
  const taskLineContent = result[taskLine];
  if (!taskLineContent) return result;

  const escaped = oldKeyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (migrateState === '') {
    result[taskLine] = taskLineContent.replace(
      new RegExp(`^(.*?)\\b${escaped}\\b\\s*`, 'i'),
      '$1',
    );
  } else {
    result[taskLine] = taskLineContent.replace(
      new RegExp(`\\b${escaped}\\b`, 'i'),
      migrateState,
    );
  }

  // Migration has its own cleanup policy: it removes only the source
  // SCHEDULED/DEADLINE dates. STARTED, CLOSED and DESCRIPTION are history or
  // task content and stay on the original line in their original order —
  // never splice the whole metadata span, which would delete them.
  const taskIndent = leadingIndent(result[taskLine]);
  const { end } = buildRemovalRange(result, taskLine, taskIndent);
  if (end > taskLine) {
    const retained: string[] = [];
    for (let i = taskLine + 1; i <= end; i++) {
      const type = classifyTaskMetadataLine(result[i], taskIndent);
      if (type === 'scheduled' || type === 'deadline') continue;
      retained.push(result[i]);
    }
    result.splice(taskLine + 1, end - taskLine, ...retained);
  }

  return result;
}

export function readTaskBlockFromLines(lines: string[], task: Task): string[] {
  const { start } = buildRemovalRange(lines, task.line, task.indent);
  const { end } = getTaskRemovalRange(lines, task);

  const parentIndentLen = task.indent.length;
  const result: string[] = [];
  for (let i = start; i <= end; i++) {
    result.push(lines[i].substring(parentIndentLen));
  }
  return result;
}

export async function readTaskBlockFromVault(
  app: App,
  task: Task,
): Promise<string[]> {
  try {
    const sourceFile = app.vault.getAbstractFileByPath(task.path);
    if (!(sourceFile instanceof TFile)) return [];

    const sourceContent = await app.vault.read(sourceFile);
    const sourceLines = sourceContent.split('\n');

    return readTaskBlockFromLines(sourceLines, task);
  } catch {
    return [];
  }
}

export async function readSubtaskLinesFromVault(
  app: App,
  task: Task,
): Promise<string[]> {
  try {
    const sourceFile = app.vault.getAbstractFileByPath(task.path);
    if (!(sourceFile instanceof TFile)) return [];

    const sourceContent = await app.vault.read(sourceFile);
    const sourceLines = sourceContent.split('\n');

    return getSubtaskLinesFromLines(sourceLines, task);
  } catch {
    return [];
  }
}
