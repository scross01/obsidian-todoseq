import { Task } from '../types/task';
import { getIndentLength } from './task-line-utils';
import { getTaskKey } from './task-utils';

/** Source-ordered structure used by explicit previous-sibling and opt-in gates. */
export interface TaskStructure {
  parentByKey: ReadonlyMap<string, string>;
  previousSiblingByKey: ReadonlyMap<string, string>;
  childrenByParent: ReadonlyMap<string, readonly string[]>;
}

interface Frame {
  key: string;
  indent: number;
}

/**
 * Build parent and immediate-previous-sibling links in one bounded pass per
 * file. Heading tasks own their section; indented tasks nest by effective
 * indentation (tabs count as two spaces). This deliberately does not reuse
 * subtaskSpan, which describes checkbox progress rather than dependencies.
 */
export function buildTaskStructure(tasks: readonly Task[]): TaskStructure {
  const parentByKey = new Map<string, string>();
  const previousSiblingByKey = new Map<string, string>();
  const children = new Map<string, string[]>();

  const byPath = new Map<string, Task[]>();
  for (const task of tasks) {
    const list = byPath.get(task.path) ?? [];
    list.push(task);
    byPath.set(task.path, list);
  }

  for (const fileTasks of byPath.values()) {
    fileTasks.sort((a, b) => a.line - b.line);
    const headingStack: Frame[] = [];
    const headingLevels = new Map<string, number>();
    const indentStack: Frame[] = [];
    let currentHeading: string | undefined;
    const lastSiblingByParent = new Map<string, string>();

    for (const task of fileTasks) {
      const key = getTaskKey(task);
      const indent = getIndentLength(task.indent);
      let parentKey: string | undefined;

      if (task.headingLevel !== undefined) {
        while (
          headingStack.length > 0 &&
          (headingLevels.get(headingStack[headingStack.length - 1].key) ?? 0) >=
            task.headingLevel
        ) {
          headingStack.pop();
        }
        parentKey = headingStack[headingStack.length - 1]?.key;
        currentHeading = key;
        indentStack.length = 0;
        headingLevels.set(key, task.headingLevel);
        headingStack.push({ key, indent });
      } else {
        while (
          indentStack.length > 0 &&
          indentStack[indentStack.length - 1].indent >= indent
        ) {
          indentStack.pop();
        }
        parentKey = indentStack[indentStack.length - 1]?.key ?? currentHeading;
        indentStack.push({ key, indent });
      }

      if (parentKey) {
        parentByKey.set(key, parentKey);
        const list = children.get(parentKey) ?? [];
        list.push(key);
        children.set(parentKey, list);
      }

      const siblingKey = lastSiblingByParent.get(parentKey ?? '');
      if (siblingKey) previousSiblingByKey.set(key, siblingKey);
      lastSiblingByParent.set(parentKey ?? '', key);
    }
  }

  return {
    parentByKey,
    previousSiblingByKey,
    childrenByParent: children,
  };
}
