/**
 * @jest-environment jsdom
 *
 * Refused completions must spring back: the gate writes nothing, so the
 * control must not keep the state the file never received.
 */

import { EmbeddedTaskItemRenderer } from '../src/view/embedded-task-list/embedded-task-item-renderer';
import { TaskItemRenderer } from '../src/view/task-list/task-item-renderer';
import { Task } from '../src/types/task';
import type { TaskDependencyManager } from '../src/services/task-dependency-manager';
import { TaskStateTransitionManager } from '../src/services/task-state-transition-manager';
import type { StateMenuBuilder } from '../src/view/components/state-menu-builder';
import {
  createBaseTask,
  createTestKeywordManager,
} from './helpers/test-helper';
import { installObsidianDomMocks } from './helpers/obsidian-dom-mock';

function mockPlugin(task: Task, taskDependencyManager?: unknown) {
  return {
    taskDependencyManager,
    keywordManager: {
      getSettings: jest
        .fn()
        .mockReturnValue({ useExtendedCheckboxStyles: false }),
      getCheckboxState: jest.fn().mockReturnValue(' '),
      isActive: jest.fn().mockReturnValue(false),
      isCompleted: jest.fn().mockReturnValue(false),
    },
    taskStateManager: {
      findTaskByPathAndLine: jest.fn().mockReturnValue(task),
    },
    taskUpdateCoordinator: {
      stateTransitionManager: {
        getNextCompletedOrArchivedState: jest.fn().mockReturnValue('DONE'),
        getNextState: jest.fn().mockReturnValue('DOING'),
      },
      updateTaskByPath: jest
        .fn()
        .mockResolvedValue({ status: 'refused', reasons: [] }),
    },
    settings: { stateTransitions: {} },
    app: {},
  };
}

async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('blocked controls', () => {
  beforeAll(() => {
    installObsidianDomMocks();
  });

  it('restores the embedded checkbox after a refusal', async () => {
    const task = createBaseTask({
      path: 'blocked.md',
      line: 0,
      text: 'Blocked',
      state: 'TODO',
      completed: false,
    });
    const plugin = mockPlugin(task);
    const renderer = new (
      EmbeddedTaskItemRenderer as unknown as new (
        ...args: unknown[]
      ) => EmbeddedTaskItemRenderer
    )(plugin, {}, {});
    const li = renderer.createTaskListItem(task, 0, {});
    const checkbox = li.querySelector(
      'input[type="checkbox"]',
    ) as HTMLInputElement;
    expect(checkbox.checked).toBe(false);

    checkbox.checked = true;
    checkbox.dispatchEvent(new Event('change'));
    await flush();

    expect(plugin.taskUpdateCoordinator.updateTaskByPath).toHaveBeenCalled();
    expect(checkbox.checked).toBe(false);
    expect(checkbox.getAttribute('data-task')).toBe(' ');
    expect(li.getAttribute('data-task')).toBe(' ');
    expect(li.classList.contains('todoseq-embedded-task-completed')).toBe(
      false,
    );
  });

  it('puts a diagnostic marker between the checkbox and the task text', () => {
    const task = createBaseTask({
      path: 'blocked.md',
      line: 0,
      text: 'Broken dependency',
      state: 'TODO',
      completed: false,
    });
    const plugin = mockPlugin(task, {
      getIssuesForTask: jest.fn(() => [
        {
          code: 'missing-reference',
          fingerprint: 'missing:blocked.md:0',
          message: 'Dependency missing.',
          sourceKey: 'blocked.md:0',
        },
      ]),
      isBlocked: jest.fn(() => true),
      getBlockingReasons: jest.fn(() => []),
    });
    const renderer = new (
      EmbeddedTaskItemRenderer as unknown as new (
        ...args: unknown[]
      ) => EmbeddedTaskItemRenderer
    )(plugin, {}, {});

    const li = renderer.createTaskListItem(task, 0, {});
    const icon = li.querySelector('.todoseq-dependency-issue-icon');
    expect(icon).not.toBeNull();
    expect(icon?.getAttribute('data-icon')).toBe('alert-triangle');
    expect(icon?.getAttribute('role')).toBe('img');
    expect(li.querySelectorAll('.todoseq-task-blocked-icon')).toHaveLength(0);
    expect(li.classList.contains('todoseq-task-blocked')).toBe(true);

    expect(li.children[0].tagName).toBe('INPUT');
    expect(li.children[1]).toBe(icon);
  });

  it('keeps the blocked lock focusable and after the checkbox', () => {
    const task = createBaseTask({
      path: 'blocked.md',
      line: 0,
      text: 'Waiting',
      state: 'TODO',
      completed: false,
    });
    const plugin = mockPlugin(task, {
      getIssuesForTask: jest.fn(() => []),
      isBlocked: jest.fn(() => true),
      getBlockingReasons: jest.fn(() => [
        {
          code: 'incomplete-blocker',
          message: 'Blocked by Source task.',
          sourceKey: 'blocked.md:0',
          sourcePath: 'blocked.md',
          sourceLine: 0,
          blocking: true,
        },
      ]),
    });
    const renderer = new (
      EmbeddedTaskItemRenderer as unknown as new (
        ...args: unknown[]
      ) => EmbeddedTaskItemRenderer
    )(plugin, {}, {});

    const li = renderer.createTaskListItem(task, 0, {});
    const lock = li.querySelector('.todoseq-task-blocked-icon');
    expect(lock?.getAttribute('data-icon')).toBe('lock');
    expect(lock?.getAttribute('tabindex')).toBe('0');
    expect(lock?.getAttribute('role')).toBe('button');
    expect(li.children[0].tagName).toBe('INPUT');
    expect(li.children[1]).toBe(lock);
  });

  it('replaces the Task List lock when a refresh finds a diagnostic', () => {
    const task = createBaseTask({
      path: 'blocked.md',
      line: 0,
      text: 'Dependent task',
      state: 'TODO',
      completed: false,
    });
    const keywordManager = createTestKeywordManager();
    const stateManager = new TaskStateTransitionManager(
      keywordManager,
      undefined,
    );
    let diagnosticMode = false;
    const dependency = {
      getIssuesForTask: jest.fn(() =>
        diagnosticMode
          ? [
              {
                code: 'missing-reference',
                fingerprint: 'missing:blocked.md:0',
                message: 'Dependency missing.',
                sourceKey: 'blocked.md:0',
              },
            ]
          : [],
      ),
      isBlocked: jest.fn(() => true),
      getBlockingReasons: jest.fn(() => [
        {
          code: 'incomplete-blocker',
          message: 'Blocked by Source task.',
          sourceKey: 'blocked.md:0',
          sourcePath: 'blocked.md',
          sourceLine: 0,
          blocking: true,
        },
      ]),
    };
    const renderer = new TaskItemRenderer(
      () => keywordManager,
      () => stateManager,
      () =>
        ({
          buildStateMenu: jest.fn(),
        }) as unknown as StateMenuBuilder,
      jest.fn(),
      jest.fn(),
      null,
      () => null,
      () => dependency as unknown as TaskDependencyManager,
    );

    const li = renderer.buildTaskListItem(task);
    const lock = li.querySelector('.todoseq-task-blocked-icon');
    expect(lock).not.toBeNull();
    expect(
      lock!.compareDocumentPosition(li.querySelector('.todoseq-task-text')!) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    diagnosticMode = true;
    renderer.updateTaskElementContent(task, li);

    expect(li.querySelectorAll('.todoseq-task-blocked-icon')).toHaveLength(0);
    const warning = li.querySelector('.todoseq-dependency-issue-icon');
    expect(warning).not.toBeNull();
    expect(li.querySelectorAll('.todoseq-dependency-issue-icon')).toHaveLength(
      1,
    );
    expect(warning?.getAttribute('data-icon')).toBe('alert-triangle');
    expect(warning?.getAttribute('role')).toBe('img');
    expect(warning?.getAttribute('tabindex')).toBeNull();
    expect(
      warning!.compareDocumentPosition(
        li.querySelector('.todoseq-task-text')!,
      ) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});
