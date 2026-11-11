import { TaskParser } from '../src/parser/task-parser';
import { TaskStateManager } from '../src/services/task-state-manager';
import { Task } from '../src/types/task';
import { createTestKeywordManager } from './helpers/test-helper';

const keywordManager = createTestKeywordManager({
  additionalActiveKeywords: ['TODO'],
});
const parser = TaskParser.create(keywordManager, null);

function managerWith(tasks: Task[]): TaskStateManager {
  const manager = new TaskStateManager(keywordManager);
  tasks.forEach((task) => manager.addTask(task));
  return manager;
}

function findParents(manager: TaskStateManager, task: Task): Task[] {
  return (
    manager as unknown as { findParentTasks(task: Task): Task[] }
  ).findParentTasks(task);
}

function completeOptimistically(manager: TaskStateManager, task: Task): void {
  (
    manager as unknown as {
      updateParentSubtaskCountsForTask(
        task: Task,
        wasCompleted: boolean,
        isCompleted: boolean,
      ): void;
    }
  ).updateParentSubtaskCountsForTask(task, false, true);
}

describe('parsed bounds', () => {
  it('records a span only for counted checkbox children', () => {
    const tasks = parser.parseFile(
      '- [ ] TODO Parent\n  - [ ] child\n\nTODO plain',
      'test.md',
    );
    const parent = tasks.find((task) => task.text === 'Parent');
    const plain = tasks.find((task) => task.text === 'plain');

    expect(parent?.subtaskCount).toBe(1);
    expect(parent?.subtaskSpan).toEqual({ start: 1, end: 1 });
    expect(plain?.subtaskSpan).toBeUndefined();
  });

  it('gives plain siblings no parent relationship', () => {
    const tasks = parser.parseFile('TODO First\nTODO Second', 'test.md');
    const manager = managerWith(tasks);
    const second = tasks.find((task) => task.text === 'Second');

    expect(second).toBeDefined();
    expect(findParents(manager, second as Task)).toEqual([]);
  });

  it('stops at prose and blank boundaries', () => {
    const tasks = parser.parseFile(
      'TODO Parent\nSome prose\n\n- [ ] child',
      'test.md',
    );
    const parent = tasks.find((task) => task.text === 'Parent');
    expect(parent?.subtaskCount).toBe(0);
    expect(parent?.subtaskSpan).toBeUndefined();
  });

  it('keeps nested checkbox ancestry and quoted spans', () => {
    const nested = parser.parseFile(
      '- [ ] TODO Parent\n  - [ ] TODO Child',
      'test.md',
    );
    const nestedParent = nested.find((task) => task.text === 'Parent');
    const child = nested.find((task) => task.text === 'Child');
    expect(nestedParent?.subtaskSpan).toEqual({ start: 1, end: 1 });
    expect(
      findParents(managerWith(nested), child as Task).map((task) => task.line),
    ).toEqual([nestedParent?.line]);

    const quoted = parser.parseFile(
      '> TODO Parent\n>   - [ ] child',
      'test.md',
    );
    const quotedParent = quoted[0];
    expect(quotedParent.subtaskSpan).toEqual({ start: 1, end: 1 });

    const quotedManager = managerWith(quoted);
    expect(
      quotedManager
        .findParentTasksForCheckbox('test.md', 1, '>   ')
        .map((task) => task.line),
    ).toEqual([quotedParent.line]);
  });

  it('does not invent ancestry for legacy tasks without bounds', () => {
    const parent = {
      ...parser.parseFile('TODO Parent', 'test.md')[0],
      subtaskCount: 1,
    };
    const child = {
      ...parser.parseFile('- [ ] TODO Child', 'test.md')[0],
      line: 1,
      indent: '  ',
    };
    const manager = managerWith([parent, child]);
    expect(findParents(manager, child)).toEqual([]);
  });
});

describe('optimistic agreement', () => {
  it('matches a reparse after completing a nested child', () => {
    const tasks = parser.parseFile(
      '- [ ] TODO Parent\n  - [ ] TODO Child',
      'test.md',
    );
    const manager = managerWith(tasks);
    const parent = tasks.find((task) => task.text === 'Parent') as Task;
    const child = tasks.find((task) => task.text === 'Child') as Task;

    completeOptimistically(manager, child);
    expect(
      manager.findTaskByPathAndLine('test.md', parent.line)
        ?.subtaskCompletedCount,
    ).toBe(1);

    const reparsed = parser.parseFile(
      '- [ ] TODO Parent\n  - [x] TODO Child',
      'test.md',
    );
    const reparsedParent = reparsed.find((task) => task.text === 'Parent');
    expect(reparsedParent?.subtaskCompletedCount).toBe(1);
  });

  it('does not change a plain sibling count', () => {
    const tasks = parser.parseFile('TODO First\nTODO Second', 'test.md');
    const manager = managerWith(tasks);
    const first = tasks.find((task) => task.text === 'First') as Task;
    const second = tasks.find((task) => task.text === 'Second') as Task;

    completeOptimistically(manager, second);
    expect(
      manager.findTaskByPathAndLine('test.md', first.line)
        ?.subtaskCompletedCount,
    ).toBe(0);
  });

  it('finds checkbox-only children under a keyword parent', () => {
    const tasks = parser.parseFile('TODO Parent\n- [ ] child', 'test.md');
    const parent = tasks[0];
    const manager = managerWith(tasks);

    expect(parent.subtaskSpan).toEqual({ start: 1, end: 1 });
    expect(manager.findParentTasksForCheckbox('test.md', 1, '')).toEqual([
      parent,
    ]);
  });

  it('shifts parent spans with metadata line changes', () => {
    const tasks = parser.parseFile(
      '- [ ] TODO Parent\n  - [ ] child\n  - [ ] child two',
      'test.md',
    );
    const manager = managerWith(tasks);
    const parent = tasks[0];
    expect(parent.subtaskSpan).toEqual({ start: 1, end: 2 });

    manager.adjustLineIndices('test.md', 1, 1);
    expect(parent.subtaskSpan).toEqual({ start: 2, end: 3 });

    manager.adjustLineIndices('test.md', 2, -1);
    expect(parent.subtaskSpan).toEqual({ start: 1, end: 2 });
  });
});
