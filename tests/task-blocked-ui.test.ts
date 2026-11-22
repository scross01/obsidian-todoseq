/**
 * @jest-environment jsdom
 *
 * Refused completions must spring back: the gate writes nothing, so the
 * control must not keep the state the file never received.
 */

import { EmbeddedTaskItemRenderer } from '../src/view/embedded-task-list/embedded-task-item-renderer';
import { Task } from '../src/types/task';
import { createBaseTask } from './helpers/test-helper';
import { installObsidianDomMocks } from './helpers/obsidian-dom-mock';

function mockPlugin(task: Task) {
  return {
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
    const renderer = new (EmbeddedTaskItemRenderer as unknown as new (
      ...args: unknown[]
    ) => EmbeddedTaskItemRenderer)(plugin, {}, {});
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
});
