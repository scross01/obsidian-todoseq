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
    const writer = {
      migrateBlockerHistory: jest.fn().mockResolvedValue({
        status: 'success',
        task: migrated,
        lineDelta: 0,
      }),
    };
    const stateManager = {
      getTasks: () => [dependent],
      updateTaskByPathAndLine: jest.fn(),
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
      taskEditor: writer,
      taskStateManager: stateManager,
    } as never);

    await lifecycle.promoteArchivedReferences();

    expect(writer.migrateBlockerHistory).toHaveBeenCalledWith(
      dependent,
      'to-active',
      ['prerequisite'],
    );
    expect(stateManager.updateTaskByPathAndLine).toHaveBeenCalledWith(
      'dependent.md',
      1,
      { blockedBy: ['prerequisite'], archivedBlockers: [] },
      undefined,
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
      taskEditor: { migrateBlockerHistory: jest.fn() },
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
