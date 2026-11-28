import { PluginLifecycleManager } from '../src/plugin-lifecycle';
import { Task } from '../src/types/task';
import { createBaseTask } from './helpers/test-helper';

describe('archived reference promotion', () => {
  it('moves a restored target reference back to BLOCKER', async () => {
    const dependent = createBaseTask({
      path: 'dependent.md',
      line: 1,
      text: 'Dependent',
      state: 'TODO',
      archivedBlockers: ['prerequisite'],
      blockedBy: [],
    });
    const migrated: Task = {
      ...dependent,
      blockedBy: ['prerequisite'],
      archivedBlockers: [],
    };
    const coordinator = {
      updateTaskDependency: jest.fn().mockResolvedValue({ status: 'applied' }),
    };
    const stateManager = {
      getTasks: () => [dependent],
      notifySubscribers: jest.fn(),
    };
    const manager = {
      isValidationReady: () => true,
      getArchivedReferencePromotions: () => [
        {
          dependentKey: 'dependent.md:1',
          reference: 'prerequisite',
          targetKey: 'target.md:0',
          revision: 3,
        },
      ],
    };
    const lifecycle = new PluginLifecycleManager({
      taskDependencyManager: manager,
      taskUpdateCoordinator: coordinator,
      taskStateManager: stateManager,
    } as never);

    await lifecycle.promoteArchivedReferences();

    expect(coordinator.updateTaskDependency).toHaveBeenCalledWith(
      dependent,
      'promote',
      ['prerequisite'],
    );
    expect(stateManager.notifySubscribers).toHaveBeenCalled();
  });

  it('does nothing while indexing is unvalidated', async () => {
    const manager = {
      isValidationReady: () => false,
      getArchivedReferencePromotions: jest.fn(),
    };
    const lifecycle = new PluginLifecycleManager({
      taskDependencyManager: manager,
      taskUpdateCoordinator: { updateTaskDependency: jest.fn() },
      taskStateManager: {
        getTasks: () => [],
        updateTaskByPathAndLine: jest.fn(),
        notifySubscribers: jest.fn(),
      },
    } as never);

    await lifecycle.promoteArchivedReferences();

    expect(manager.getArchivedReferencePromotions).not.toHaveBeenCalled();
  });
});
