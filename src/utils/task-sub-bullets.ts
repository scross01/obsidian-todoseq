import { App, TFile } from 'obsidian';
import { Task } from '../types/task';
import { CHECKBOX_DETECTION_REGEX, BULLET_LIST_PATTERN } from './patterns';

export function taskHasCheckbox(task: Task): boolean {
  return CHECKBOX_DETECTION_REGEX.test(task.rawText);
}

export function buildRemovalRange(
  lines: string[],
  taskLine: number,
): { start: number; end: number } {
  let end = taskLine;
  for (let i = taskLine + 1; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed.startsWith('SCHEDULED:') || trimmed.startsWith('DEADLINE:')) {
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
  const { end: dateEnd } = buildRemovalRange(lines, task.line);
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
  const { start, end: dateEnd } = buildRemovalRange(lines, task.line);
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

  const { end } = buildRemovalRange(result, taskLine);
  if (end > taskLine) {
    result.splice(taskLine + 1, end - taskLine);
  }

  return result;
}

export function readTaskBlockFromLines(lines: string[], task: Task): string[] {
  const { start } = buildRemovalRange(lines, task.line);
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
