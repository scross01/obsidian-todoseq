import { Task } from '../types/task';
import type { StructuralEntry } from '../types/task-structure';
import { getIndentLength } from './task-line-utils';
import { getTaskKey } from './task-utils';

/** Source-ordered structure used by explicit previous-sibling and opt-in gates. */
export interface TaskStructure {
  parentByKey: ReadonlyMap<string, string>;
  previousSiblingByKey: ReadonlyMap<string, string>;
  childrenByParent: ReadonlyMap<string, readonly string[]>;
  /** All siblings per parent bucket ('' is top level), in source order. */
  siblingsByParent: ReadonlyMap<string, readonly string[]>;
  /** Sibling group bounded by headings and prose closures. */
  groupByKey: ReadonlyMap<string, string>;
  siblingsByGroup: ReadonlyMap<string, readonly string[]>;
  /** Keywordless checkboxes keyed by their immediate structural parent. */
  checkboxEntriesByParentKey: ReadonlyMap<string, readonly StructuralEntry[]>;
  /** Heading lines per path, for Org entry-scoped checkbox checks. */
  headingLinesByPath: ReadonlyMap<string, readonly number[]>;
}

interface HeadingFrame {
  level: number;
  taskKey: string | null;
  quote: string;
  childGroup: string;
}

interface IndentFrame {
  taskKey: string | null;
  indent: number;
  quote: string;
  archived: boolean;
  childGroup: string;
}

interface Item {
  line: number;
  task?: Task;
  entry?: StructuralEntry;
}

const QUOTE_PREFIX = /^((?:\s*>)+[ \t]*)/;

function splitQuote(indent: string): { quote: string; rest: string } {
  const match = QUOTE_PREFIX.exec(indent);
  if (!match) return { quote: '', rest: indent };
  return { quote: match[1], rest: indent.slice(match[1].length) };
}

function headingLevelOf(task: Task): number | undefined {
  if (task.headingLevel !== undefined) return task.headingLevel;
  if (task.sourceFormat === 'org') return task.quoteNestingLevel;
  return undefined;
}

/**
 * Build parent, sibling and checkbox ownership links in one bounded pass per
 * file. Tasks supply collected rows; structural entries supply non-task
 * headings, prose closures, keywordless checkboxes and archived branches.
 *
 * Frames:
 * - heading frames carry a task key (or null for a non-task heading barrier);
 * - indentation frames carry a task key (or null for an archived barrier);
 * - every task frame owns a group key for its children. A prose line that
 *   closes an indented group replaces that group key, so later indentation
 *   cannot reconnect to the closed siblings.
 */
export function buildTaskStructure(
  tasks: readonly Task[],
  entriesByPath: ReadonlyMap<string, readonly StructuralEntry[]> = new Map(),
): TaskStructure {
  const parentByKey = new Map<string, string>();
  const previousSiblingByKey = new Map<string, string>();
  const children = new Map<string, string[]>();
  const siblingsByParent = new Map<string, string[]>();
  const groupByKey = new Map<string, string>();
  const siblingsByGroup = new Map<string, string[]>();
  const checkboxEntriesByParentKey = new Map<string, StructuralEntry[]>();
  const headingLinesByPath = new Map<string, number[]>();

  const byPath = new Map<string, Task[]>();
  for (const task of tasks) {
    const list = byPath.get(task.path) ?? [];
    list.push(task);
    byPath.set(task.path, list);
  }

  const paths = new Set<string>([...byPath.keys(), ...entriesByPath.keys()]);
  for (const path of paths) {
    const fileTasks = (byPath.get(path) ?? []).slice().sort(
      (a, b) => a.line - b.line,
    );
    const taskLines = new Set(fileTasks.map((task) => task.line));
    const entries = (entriesByPath.get(path) ?? []).filter(
      (entry) => !taskLines.has(entry.line),
    );

    const items: Item[] = [
      ...fileTasks.map((task) => ({ line: task.line, task })),
      ...entries.map((entry) => ({ line: entry.line, entry })),
    ].sort((a, b) => a.line - b.line);

    let groupSerial = 0;
    const nextGroup = (): string => `${path}#g${groupSerial++}`;
    let rootGroup = nextGroup();

    const headingStack: HeadingFrame[] = [];
    const indentStack: IndentFrame[] = [];
    let currentHeading: string | undefined;
    let headingQuote = '';
    const childGroupByTask = new Map<string, string>();
    const lastByGroup = new Map<string, string>();
    const lastByParent = new Map<string, string>();

    const record = (task: Task, parentKey: string | undefined): void => {
      const key = getTaskKey(task);
      if (parentKey) {
        parentByKey.set(key, parentKey);
        const list = children.get(parentKey) ?? [];
        list.push(key);
        children.set(parentKey, list);
      }

      const group = parentKey
        ? (childGroupByTask.get(parentKey) ?? rootGroup)
        : rootGroup;
      groupByKey.set(key, group);
      const groupSiblings = siblingsByGroup.get(group) ?? [];
      const priorInGroup = lastByGroup.get(group);
      if (priorInGroup) previousSiblingByKey.set(key, priorInGroup);
      groupSiblings.push(key);
      siblingsByGroup.set(group, groupSiblings);
      lastByGroup.set(group, key);

      const bucket = parentKey ?? '';
      const parentSiblings = siblingsByParent.get(bucket) ?? [];
      parentSiblings.push(key);
      siblingsByParent.set(bucket, parentSiblings);
      lastByParent.set(bucket, key);
    };

    for (const item of items) {
      if (item.task) {
        const task = item.task;
        const key = getTaskKey(task);
        const level = headingLevelOf(task);

        if (level !== undefined) {
          const { quote } = splitQuote(task.indent);
          while (
            headingStack.length > 0 &&
            (headingStack[headingStack.length - 1].level >= level ||
              headingStack[headingStack.length - 1].quote !== quote)
          ) {
            headingStack.pop();
          }
          const parentKey = headingStack[headingStack.length - 1]?.taskKey;
          if (parentKey === undefined || parentKey === null) {
            rootGroup = nextGroup();
          }
          record(task, parentKey ?? undefined);
          currentHeading = key;
          headingQuote = quote;
          const headingLines = headingLinesByPath.get(path) ?? [];
          headingLines.push(task.line);
          headingLinesByPath.set(path, headingLines);
          indentStack.length = 0;
          const childGroup = nextGroup();
          childGroupByTask.set(key, childGroup);
          headingStack.push({ level, taskKey: key, quote, childGroup });
          continue;
        }

        const { quote, rest } = splitQuote(task.indent);
        const indent = getIndentLength(rest);
        while (
          indentStack.length > 0 &&
          (indentStack[indentStack.length - 1].indent >= indent ||
            indentStack[indentStack.length - 1].quote !== quote)
        ) {
          indentStack.pop();
        }
        const top = indentStack[indentStack.length - 1];
        let parentKey = top?.taskKey ?? undefined;
        if (!top && currentHeading && headingQuote === quote) {
          parentKey = currentHeading;
        }
        if (top?.archived) parentKey = undefined;

        record(task, parentKey);
        const childGroup = nextGroup();
        childGroupByTask.set(key, childGroup);
        indentStack.push({
          taskKey: key,
          indent,
          quote,
          archived: false,
          childGroup,
        });
        continue;
      }

      const entry = item.entry!;
      if (entry.kind === 'heading') {
        const level = entry.headingLevel ?? 1;
        while (
          headingStack.length > 0 &&
          (headingStack[headingStack.length - 1].level >= level ||
            headingStack[headingStack.length - 1].quote !== entry.quotePrefix)
        ) {
          headingStack.pop();
        }
        headingStack.push({
          level,
          taskKey: null,
          quote: entry.quotePrefix,
          childGroup: nextGroup(),
        });
        currentHeading = undefined;
        headingQuote = entry.quotePrefix;
        indentStack.length = 0;
        rootGroup = nextGroup();
        const lines = headingLinesByPath.get(path) ?? [];
        lines.push(entry.line);
        headingLinesByPath.set(path, lines);
        continue;
      }

      if (entry.kind === 'archived') {
        while (
          indentStack.length > 0 &&
          (indentStack[indentStack.length - 1].indent >= entry.indentLength ||
            indentStack[indentStack.length - 1].quote !== entry.quotePrefix)
        ) {
          indentStack.pop();
        }
        indentStack.push({
          taskKey: null,
          indent: entry.indentLength,
          quote: entry.quotePrefix,
          archived: true,
          childGroup: nextGroup(),
        });
        rootGroup = nextGroup();
        continue;
      }

      if (entry.kind === 'prose') {
        let popped = false;
        while (
          indentStack.length > 0 &&
          indentStack[indentStack.length - 1].indent >= entry.indentLength &&
          indentStack[indentStack.length - 1].quote === entry.quotePrefix
        ) {
          indentStack.pop();
          popped = true;
        }
        if (popped) {
          const parent = indentStack[indentStack.length - 1];
          if (parent) parent.childGroup = nextGroup();
        }
        if (entry.indentLength === 0 && entry.quotePrefix === '') {
          rootGroup = nextGroup();
        }
        continue;
      }

      if (entry.kind === 'checkbox' && !entry.checked) {
        let parentKey: string | undefined;
        for (let index = indentStack.length - 1; index >= 0; index--) {
          const frame = indentStack[index];
          if (
            frame.quote === entry.quotePrefix &&
            frame.indent < entry.indentLength
          ) {
            parentKey = frame.taskKey ?? undefined;
            break;
          }
        }
        if (
          parentKey === undefined &&
          entry.indentLength === 0 &&
          currentHeading &&
          headingQuote === entry.quotePrefix
        ) {
          parentKey = currentHeading;
        }
        const bucket = parentKey ?? '';
        const list = checkboxEntriesByParentKey.get(bucket) ?? [];
        list.push(entry);
        checkboxEntriesByParentKey.set(bucket, list);
      }
    }

    const headingLines = headingLinesByPath.get(path);
    if (headingLines) headingLines.sort((a, b) => a - b);
  }

  return {
    parentByKey,
    previousSiblingByKey,
    childrenByParent: children,
    siblingsByParent,
    groupByKey,
    siblingsByGroup,
    checkboxEntriesByParentKey,
    headingLinesByPath,
  };
}
