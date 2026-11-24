/** @jest-environment jsdom */
import { TFile } from 'obsidian';
import { Task } from '../src/types/task';
import { TaskDependencyManager } from '../src/services/task-dependency-manager';
import { TaskStateManager } from '../src/services/task-state-manager';
import { TaskUpdateCoordinator } from '../src/services/task-update-coordinator';
import { RecurrenceCoordinator } from '../src/services/recurrence-coordinator';
import { OrgModeTaskParser } from '../src/parser/org-mode-task-parser';
import { getDefaultCoefficients } from '../src/utils/task-urgency';
import {
  createBaseSettings,
  createBaseTask,
  createTestKeywordManager,
} from './helpers/test-helper';

(window as unknown as { activeDocument: Document }).activeDocument = document;

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve = (): void => {};
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function makeFile(path: string): TFile {
  return new TFile(path, path, path.split('.').pop() ?? '');
}

interface RecoveryFixture {
  coordinator: TaskUpdateCoordinator;
  state: TaskStateManager;
  writer: {
    updateTaskState: jest.Mock;
    updateTaskPriority: jest.Mock;
    applyRecurrenceUpdate: jest.Mock;
  };
  reconcile: jest.Mock;
  blocker: Task;
  blocked: Task;
  sibling: Task;
}

function createRecoveryFixture(): RecoveryFixture {
  const settings = createBaseSettings({ enforceBlockedTasks: true });
  const keywordManager = createTestKeywordManager(settings);
  const state = new TaskStateManager(keywordManager);
  const blocker = createBaseTask({
    path: 'blocker.md',
    line: 0,
    id: 'blocker',
    text: 'Blocker',
    rawText: 'TODO Blocker',
    state: 'TODO',
    completed: false,
  });
  const blocked = createBaseTask({
    path: 'blocked.md',
    line: 0,
    id: 'blocked',
    text: 'Blocked',
    rawText: 'TODO Blocked',
    state: 'TODO',
    completed: false,
    blockedBy: ['blocker'],
  });
  const sibling = createBaseTask({
    path: 'blocked.md',
    line: 1,
    id: 'sibling',
    text: 'Sibling',
    rawText: 'TODO Sibling',
    state: 'TODO',
    completed: false,
  });
  state.setTasks([blocker, blocked, sibling]);

  const file = makeFile('blocked.md');
  const reconcile = jest.fn(
    async (
      _path: string,
      _file: TFile | null,
      publish: boolean | (() => boolean),
    ): Promise<Task[]> => {
      const shouldPublish = typeof publish === 'function' ? publish() : publish;
      const recovered = [
        { ...sibling, line: 0, state: 'TODO', completed: false },
        { ...blocker, state: 'TODO', completed: false },
        {
          ...blocked,
          line: 2,
          rawText: 'TODO Blocked',
          state: 'TODO',
          completed: false,
        },
      ];
      if (shouldPublish) {
        const current = state
          .getTasks()
          .filter((task) => task.path !== 'blocked.md');
        state.setTasks([
          ...current,
          ...recovered.filter((task) => task.path === 'blocked.md'),
        ]);
      } else {
        state.setCommittedTasksForPaths(
          recovered.filter((task) => task.path === 'blocked.md'),
          ['blocked.md'],
        );
      }
      return recovered;
    },
  );

  const writer = {
    updateTaskState: jest.fn(),
    updateTaskPriority: jest.fn(async (task: Task) => ({
      ...task,
      priority: 'high' as const,
    })),
    applyRecurrenceUpdate: jest.fn(),
  };
  const dependencyManager = new TaskDependencyManager(state);
  const plugin = {
    settings,
    app: {
      vault: {
        getAbstractFileByPath: () => file,
        read: jest.fn().mockResolvedValue('TODO Blocked'),
      },
      workspace: {
        getActiveViewOfType: () => null,
        getLeavesOfType: () => [],
      },
    },
    taskEditor: writer,
    taskStateManager: state,
    vaultScanner: {
      addSkipIncrementalChange: jest.fn(),
      completeFileWrite: jest.fn(),
      getParser: () => null,
      reconcileFileAfterFailedWrite: reconcile,
    },
    embeddedTaskListProcessor: undefined,
    refreshVisibleEditorDecorations: jest.fn(),
    isUserInitiatedUpdate: false,
  };
  const coordinator = new TaskUpdateCoordinator(
    plugin as never,
    state,
    keywordManager,
    { isExpectedChange: () => false } as never,
    dependencyManager,
  );

  return { coordinator, state, writer, reconcile, blocker, blocked, sibling };
}

describe('queued completion target identity', () => {
  it('does not let recovery substitute a sibling at the old line', async () => {
    const { coordinator, state, writer, blocker, blocked, sibling } =
      createRecoveryFixture();
    state.setTasks([
      { ...blocker, state: 'DONE', completed: true },
      blocked,
      sibling,
    ]);

    const firstStarted = deferred();
    const releaseFirst = deferred();
    let calls = 0;
    writer.updateTaskState.mockImplementation(
      async (task: Task, newState: string) => {
        calls += 1;
        if (calls === 1) {
          firstStarted.resolve();
          await releaseFirst.promise;
          throw new Error('disk full');
        }
        return {
          ...task,
          state: newState,
          completed: newState === 'DONE',
        };
      },
    );

    const first = coordinator.updateTaskState(sibling, 'DOING', 'task-list');
    await firstStarted.promise;

    const completion = coordinator.updateTaskState(
      blocked,
      'DONE',
      'task-list',
    );

    // The prerequisite reopens while the three writes are serialized. The
    // failed first write then publishes the sibling at the old line.
    state.updateTaskByPathAndLine('blocker.md', 0, {
      state: 'TODO',
      completed: false,
    });
    state.notifySubscribers();
    releaseFirst.resolve();

    await expect(first).resolves.toEqual({ status: 'failed' });
    await expect(completion).resolves.toMatchObject({ status: 'refused' });

    expect(writer.updateTaskState).toHaveBeenCalledTimes(1);
    expect(state.findTaskByPathAndLine('blocked.md', 0)?.id).toBe('sibling');
    expect(state.findTaskByPathAndLine('blocked.md', 0)?.state).toBe('TODO');
    expect(state.findTaskByPathAndLine('blocked.md', 2)?.id).toBe('blocked');
    expect(state.findTaskByPathAndLine('blocked.md', 2)?.state).toBe('TODO');
    coordinator.destroy();
  });

  it('relocates an unblocked completion by its stable identity', async () => {
    const { coordinator, state, writer, blocker, blocked, sibling } =
      createRecoveryFixture();
    state.setTasks([
      { ...blocker, state: 'DONE', completed: true },
      blocked,
      sibling,
    ]);

    const firstStarted = deferred();
    const releaseFirst = deferred();
    let calls = 0;
    writer.updateTaskState.mockImplementation(
      async (task: Task, newState: string) => {
        calls += 1;
        if (calls === 1) {
          firstStarted.resolve();
          await releaseFirst.promise;
        }
        return {
          ...task,
          state: newState,
          completed: newState === 'DONE',
        };
      },
    );

    const first = coordinator.updateTaskState(sibling, 'DOING', 'task-list');
    await firstStarted.promise;
    const completion = coordinator.updateTaskState(
      blocked,
      'DONE',
      'task-list',
    );

    state.setTasks([
      { ...blocker, state: 'DONE', completed: true },
      createBaseTask({
        path: 'blocked.md',
        line: 0,
        id: 'decoy',
        text: 'Decoy',
        rawText: 'TODO Decoy',
        state: 'TODO',
      }),
      sibling,
      { ...blocked, line: 2 },
    ]);
    releaseFirst.resolve();

    await expect(first).resolves.toEqual({ status: 'applied' });
    await expect(completion).resolves.toEqual({ status: 'applied' });

    expect(writer.updateTaskState).toHaveBeenCalledTimes(2);
    expect(writer.updateTaskState.mock.calls[1][0]).toMatchObject({
      id: 'blocked',
      line: 2,
    });
    coordinator.destroy();
  });

  it('fails without writing when the requested row was removed', async () => {
    const { coordinator, state, writer, blocker, blocked, sibling } =
      createRecoveryFixture();
    state.setTasks([
      { ...blocker, state: 'DONE', completed: true },
      blocked,
      sibling,
    ]);

    const firstStarted = deferred();
    const releaseFirst = deferred();
    let calls = 0;
    writer.updateTaskState.mockImplementation(
      async (task: Task, newState: string) => {
        calls += 1;
        if (calls === 1) {
          firstStarted.resolve();
          await releaseFirst.promise;
        }
        return {
          ...task,
          state: newState,
          completed: newState === 'DONE',
        };
      },
    );

    const first = coordinator.updateTaskState(sibling, 'DOING', 'task-list');
    await firstStarted.promise;
    const completion = coordinator.updateTaskState(
      blocked,
      'DONE',
      'task-list',
    );

    state.setTasks([
      { ...blocker, state: 'DONE', completed: true },
      createBaseTask({
        path: 'blocked.md',
        line: 0,
        id: 'decoy',
        text: 'Decoy',
        rawText: 'TODO Decoy',
        state: 'TODO',
      }),
      sibling,
    ]);
    releaseFirst.resolve();

    await expect(first).resolves.toEqual({ status: 'applied' });
    await expect(completion).resolves.toMatchObject({ status: 'failed' });
    expect(writer.updateTaskState).toHaveBeenCalledTimes(1);
    coordinator.destroy();
  });
});

describe('queued recurrence target identity', () => {
  function createRecurrenceFixture(): {
    coordinator: TaskUpdateCoordinator;
    state: TaskStateManager;
    writer: RecoveryFixture['writer'];
    recurring: Task;
    sibling: Task;
  } {
    const settings = createBaseSettings();
    const keywordManager = createTestKeywordManager(settings);
    const state = new TaskStateManager(keywordManager);
    const recurring = createBaseTask({
      path: 'note.md',
      line: 0,
      id: 'recurring',
      text: 'Recurring',
      rawText: 'TODO Recurring',
      state: 'TODO',
      scheduledDate: new Date(2026, 5, 24),
      scheduledDateRepeat: { type: '+', unit: 'd', value: 1, raw: '+1d' },
    });
    const sibling = createBaseTask({
      path: 'note.md',
      line: 1,
      id: 'sibling',
      text: 'Sibling',
      rawText: 'TODO Sibling',
      state: 'TODO',
    });
    state.setTasks([recurring, sibling]);

    const writer = {
      updateTaskState: jest.fn(),
      updateTaskPriority: jest.fn(),
      applyRecurrenceUpdate: jest.fn(),
    };
    const plugin = {
      settings,
      app: {
        vault: {
          getAbstractFileByPath: () => makeFile('note.md'),
          read: jest.fn().mockResolvedValue('TODO Recurring'),
        },
        workspace: {
          getActiveViewOfType: () => null,
          getLeavesOfType: () => [],
        },
      },
      taskEditor: writer,
      taskStateManager: state,
      vaultScanner: {
        addSkipIncrementalChange: jest.fn(),
        completeFileWrite: jest.fn(),
        processIncrementalChange: jest.fn(),
        getParser: () => null,
      },
      embeddedTaskListProcessor: undefined,
      refreshVisibleEditorDecorations: jest.fn(),
      isUserInitiatedUpdate: false,
    };
    const coordinator = new TaskUpdateCoordinator(
      plugin as never,
      state,
      keywordManager,
      { isExpectedChange: () => false } as never,
      new TaskDependencyManager(state),
    );
    return { coordinator, state, writer, recurring, sibling };
  }

  it('does not roll a sibling that took the captured line', async () => {
    const { coordinator, state, writer, recurring, sibling } =
      createRecurrenceFixture();
    const firstStarted = deferred();
    const releaseFirst = deferred();
    writer.updateTaskPriority.mockImplementation(async (task: Task) => {
      firstStarted.resolve();
      await releaseFirst.promise;
      return { ...task, priority: 'high' as const };
    });
    writer.applyRecurrenceUpdate.mockImplementation(
      async (
        task: Task,
        options: { newScheduledDate?: Date; newState?: string },
      ) => ({
        ...task,
        scheduledDate: options.newScheduledDate ?? task.scheduledDate,
        state: options.newState ?? task.state,
      }),
    );

    const first = coordinator.updateTaskPriority(sibling, 'high', 'task-list');
    await firstStarted.promise;
    const recurrence = coordinator.updateTaskRecurrence(recurring, {
      newScheduledDate: new Date(2026, 5, 25),
      newStateForRecurrence: 'TODO',
    });

    state.setTasks([
      createBaseTask({
        path: 'note.md',
        line: 0,
        id: 'decoy',
        text: 'Decoy',
        rawText: 'TODO Decoy',
        state: 'TODO',
      }),
      sibling,
      { ...recurring, line: 2 },
    ]);
    releaseFirst.resolve();

    await expect(first).resolves.toEqual({ status: 'applied' });
    await expect(recurrence).resolves.toEqual({ status: 'applied' });
    expect(writer.applyRecurrenceUpdate).toHaveBeenCalledTimes(1);
    expect(writer.applyRecurrenceUpdate.mock.calls[0][0]).toMatchObject({
      id: 'recurring',
      line: 2,
    });
    coordinator.destroy();
  });

  it('fails without writing when the recurrence target was removed', async () => {
    const { coordinator, state, writer, recurring, sibling } =
      createRecurrenceFixture();
    const firstStarted = deferred();
    const releaseFirst = deferred();
    writer.updateTaskPriority.mockImplementation(async (task: Task) => {
      firstStarted.resolve();
      await releaseFirst.promise;
      return { ...task, priority: 'high' as const };
    });

    const first = coordinator.updateTaskPriority(sibling, 'high', 'task-list');
    await firstStarted.promise;
    const recurrence = coordinator.updateTaskRecurrence(recurring, {
      newScheduledDate: new Date(2026, 5, 25),
      newStateForRecurrence: 'TODO',
    });

    state.setTasks([
      createBaseTask({
        path: 'note.md',
        line: 0,
        id: 'decoy',
        text: 'Decoy',
        rawText: 'TODO Decoy',
        state: 'TODO',
      }),
      sibling,
    ]);
    releaseFirst.resolve();

    await expect(first).resolves.toEqual({ status: 'applied' });
    await expect(recurrence).resolves.toMatchObject({ status: 'failed' });
    expect(writer.applyRecurrenceUpdate).not.toHaveBeenCalled();
    coordinator.destroy();
  });
});

describe('recurrence parser routing', () => {
  function createOrgFixture(updateOutcome: {
    status: 'applied' | 'failed';
    reason?: string;
  }): {
    coordinator: RecurrenceCoordinator;
    update: jest.Mock;
    task: Task;
  } {
    const settings = createBaseSettings();
    const keywordManager = createTestKeywordManager(settings);
    const content = [
      '* Project',
      '** TODO Repeat',
      '   SCHEDULED: <2026-06-24 Wed +1d>',
      '** TODO Sibling',
      '   SCHEDULED: <2026-06-24 Wed +1d>',
    ].join('\n');
    const orgParser = OrgModeTaskParser.create(
      keywordManager,
      null,
      getDefaultCoefficients(),
    );
    const task = orgParser.parseFile(
      content,
      'note.org',
      makeFile('note.org'),
    )[0];
    const state = new TaskStateManager(keywordManager);
    state.setTasks([task]);
    const update = jest.fn().mockResolvedValue(updateOutcome);
    const plugin = {
      app: {
        vault: {
          getAbstractFileByPath: () => makeFile('note.org'),
          read: jest.fn().mockResolvedValue(content),
        },
        workspace: { getLeavesOfType: () => [] },
        plugins: {
          getPlugin: () => ({
            vaultScanner: {
              getParser: () => ({
                getDateLineType: () => null,
                parseFile: () => [],
              }),
              getParserForPath: () => orgParser,
            },
          }),
        },
      },
      settings,
    };
    const coordinator = new RecurrenceCoordinator(
      plugin as never,
      state,
      keywordManager,
      {},
    );
    coordinator.setTaskUpdateCoordinator({
      updateTaskRecurrence: update,
    } as never);
    return { coordinator, update, task };
  }

  it('rolls a nested Org heading with the registered parser', async () => {
    const { coordinator, update, task } = createOrgFixture({
      status: 'applied',
    });

    const result = await coordinator.performRecurrenceUpdate(task);

    expect(result.success).toBe(true);
    expect(update).toHaveBeenCalledTimes(1);
    const [passed, options] = update.mock.calls[0];
    expect(passed).toMatchObject({
      path: 'note.org',
      line: 1,
      text: 'Repeat',
    });
    expect(options.newScheduledDate).toBeInstanceOf(Date);
    expect(options.newScheduledDate.getFullYear()).toBe(2026);
    expect(options.newScheduledDate.getMonth()).toBe(5);
    expect(options.newScheduledDate.getDate()).toBe(25);
    coordinator.destroy();
  });

  it('reports a failed queued recurrence as unsuccessful', async () => {
    const { coordinator, update, task } = createOrgFixture({
      status: 'failed',
      reason: 'Task moved before recurrence update',
    });

    const result = await coordinator.performRecurrenceUpdate(task);

    expect(update).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      success: false,
      error: 'Task moved before recurrence update',
    });
    coordinator.destroy();
  });
});
