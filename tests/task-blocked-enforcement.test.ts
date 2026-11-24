/** @jest-environment jsdom */
import { Notice } from 'obsidian';
import { Task } from '../src/types/task';
import { TaskDependencyManager } from '../src/services/task-dependency-manager';
import { TaskStateManager } from '../src/services/task-state-manager';
import { TaskUpdateCoordinator } from '../src/services/task-update-coordinator';
import {
  createBaseSettings,
  createBaseTask,
  createTestKeywordManager,
} from './helpers/test-helper';

(window as unknown as { activeDocument: Document }).activeDocument = document;

jest.mock('obsidian', () => ({
  Notice: jest.fn(),
  TFile: jest.fn().mockImplementation(function () {
    this.path = 'blocked.md';
    this.name = 'blocked.md';
  }),
  MarkdownView: jest.fn(),
}));

function createFixture(enforceBlockedTasks = true) {
  const settings = createBaseSettings({ enforceBlockedTasks });
  const keywordManager = createTestKeywordManager(settings);
  const state = new TaskStateManager(keywordManager);
  const blocker = createBaseTask({
    path: 'blocker.md',
    line: 0,
    id: 'blocker',
    text: 'Blocker',
    state: 'TODO',
  });
  const blocked = createBaseTask({
    path: 'blocked.md',
    line: 0,
    id: 'blocked',
    text: 'Blocked',
    state: 'TODO',
    blockedBy: ['blocker'],
  });
  state.setTasks([blocker, blocked]);
  const dependencyManager = new TaskDependencyManager(state);
  const writer = {
    updateTaskState: jest.fn().mockImplementation(async (task, newState) => ({
      ...task,
      state: newState,
      completed: keywordManager.isCompleted(newState),
    })),
  };
  const plugin = {
    settings,
    app: { vault: {}, workspace: {} },
    taskEditor: writer,
    taskStateManager: state,
    vaultScanner: undefined,
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
  return { blocked, blocker, coordinator, dependencyManager, state, writer };
}

describe('blocked completion enforcement', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('refuses completion before optimism or a write', async () => {
    const { blocked, coordinator, state, writer } = createFixture();
    const outcome = await coordinator.updateTaskState(
      blocked,
      'DONE',
      'task-list',
    );

    expect(outcome.status).toBe('refused');
    expect(outcome.status === 'refused' ? outcome.reasons[0].code : null).toBe(
      'incomplete-blocker',
    );
    expect(writer.updateTaskState).not.toHaveBeenCalled();
    expect(state.findTaskByPathAndLine('blocked.md', 0)?.state).toBe('TODO');
    expect(Notice).toHaveBeenCalledWith(
      expect.stringContaining("Can't complete this task yet"),
      8000,
    );
    expect(Notice).toHaveBeenLastCalledWith(
      expect.stringMatching(
        /To override[\s\S]*Complete anyway[\s\S]*Complete blocked task/,
      ),
      8000,
    );
    coordinator.destroy();
  });

  it('allows the explicit force path', async () => {
    const { blocked, coordinator, state, writer } = createFixture();
    const outcome = await coordinator.updateTask({
      task: blocked,
      type: 'state',
      source: 'task-list',
      newState: 'DONE',
      forceCompletion: true,
    });

    expect(outcome.status).toBe('applied');
    expect(writer.updateTaskState).toHaveBeenCalled();
    expect(state.findTaskByPathAndLine('blocked.md', 0)?.state).toBe('DONE');
    coordinator.destroy();
  });

  it('does not enforce when the setting is off', async () => {
    const { blocked, coordinator, state, writer } = createFixture(false);
    await coordinator.updateTaskState(blocked, 'DONE', 'task-list');

    expect(writer.updateTaskState).toHaveBeenCalled();
    expect(state.findTaskByPathAndLine('blocked.md', 0)?.state).toBe('DONE');
    coordinator.destroy();
  });

  it('allows ordinary non-completion transitions', async () => {
    const { blocked, coordinator, writer } = createFixture();
    await coordinator.updateTaskState(blocked, 'DOING', 'task-list');
    expect(writer.updateTaskState).toHaveBeenCalled();
    coordinator.destroy();
  });

  it('rechecks a queued completion before persistence', async () => {
    const { blocked, coordinator, state, writer } = createFixture();
    const sibling = createBaseTask({
      path: 'blocked.md',
      line: 1,
      id: 'sibling',
      text: 'Sibling',
      state: 'TODO',
    });
    state.addTask(sibling);
    state.updateTaskByPathAndLine('blocker.md', 0, {
      state: 'DONE',
      completed: true,
    });
    state.notifySubscribers();

    let releaseFirst = (): void => {};
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    let call = 0;
    writer.updateTaskState.mockImplementation(
      async (task: Task, newState: string) => {
        call += 1;
        if (call === 1) await firstGate;
        return { ...task, state: newState, completed: false };
      },
    );

    const first = coordinator.updateTaskState(sibling, 'DOING', 'task-list');
    const completion = coordinator.updateTaskState(
      blocked,
      'DONE',
      'task-list',
    );

    // Reopen the blocker while the completion waits behind the file write.
    state.updateTaskByPathAndLine('blocker.md', 0, {
      state: 'TODO',
      completed: false,
    });
    state.notifySubscribers();
    releaseFirst();

    const outcome = await completion;
    await first;

    expect(outcome.status).toBe('refused');
    expect(writer.updateTaskState).toHaveBeenCalledTimes(1);
    expect(Notice).toHaveBeenCalledWith(
      expect.stringContaining("Can't complete this task yet"),
      8000,
    );
    coordinator.destroy();
  });

  it('does not treat a pending prerequisite completion as committed', async () => {
    const { blocked, blocker, coordinator, state, writer } = createFixture();
    let releaseFirst = (): void => {};
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    let call = 0;
    writer.updateTaskState.mockImplementation(
      async (task: Task, newState: string) => {
        call += 1;
        if (call === 1) await firstGate;
        return {
          ...task,
          state: newState,
          completed: newState === 'DONE',
        };
      },
    );

    const prerequisite = coordinator.updateTaskState(
      blocker,
      'DONE',
      'task-list',
    );

    // An unrelated scanner publication must not copy the optimistic
    // prerequisite completion into committed dependency truth.
    state.setTasksForPaths(
      [
        ...state.getTasks(),
        createBaseTask({
          path: 'unrelated.md',
          line: 0,
          id: 'unrelated',
          text: 'Unrelated',
          state: 'DOING',
        }),
      ],
      ['unrelated.md'],
    );

    const dependent = await coordinator.updateTaskState(
      blocked,
      'DONE',
      'task-list',
    );

    expect(dependent.status).toBe('refused');
    expect(writer.updateTaskState).toHaveBeenCalledTimes(1);

    releaseFirst();
    await expect(prerequisite).resolves.toEqual({ status: 'applied' });

    await expect(
      coordinator.updateTaskState(blocked, 'DONE', 'task-list'),
    ).resolves.toEqual({ status: 'applied' });
    expect(writer.updateTaskState).toHaveBeenCalledTimes(2);
    expect(state.findTaskByPathAndLine('blocked.md', 0)?.state).toBe('DONE');
    coordinator.destroy();
  });

  it('does not let an older write erase a newer queued projection', async () => {
    const { blocker, coordinator, state, writer } = createFixture();
    let releaseFirst = (): void => {};
    let releaseSecond = (): void => {};
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const secondGate = new Promise<void>((resolve) => {
      releaseSecond = resolve;
    });
    let call = 0;
    writer.updateTaskState.mockImplementation(
      async (task: Task, newState: string) => {
        call += 1;
        if (call === 1) await firstGate;
        if (call === 2) await secondGate;
        return {
          ...task,
          state: newState,
          completed: newState === 'DONE',
        };
      },
    );

    const first = coordinator.updateTaskState(blocker, 'DONE', 'task-list');
    const second = coordinator.updateTaskState(blocker, 'TODO', 'task-list');

    releaseFirst();
    await first;
    expect(state.findTaskByPathAndLine('blocker.md', 0)?.state).toBe('TODO');

    releaseSecond();
    await second;
    expect(state.findTaskByPathAndLine('blocker.md', 0)?.state).toBe('TODO');
    coordinator.destroy();
  });

  it('rechecks a recurring completion whose blocker reopens while queued', async () => {
    const { blocked, blocker, coordinator, state, writer } = createFixture();
    const recurring = createBaseTask({
      ...blocked,
      scheduledDate: new Date(2026, 0, 2),
      scheduledDateRepeat: { type: '+', unit: 'd', value: 1, raw: '+1d' },
    });
    const sibling = createBaseTask({
      path: 'blocked.md',
      line: 1,
      id: 'sibling',
      text: 'Sibling',
      state: 'TODO',
    });
    state.setTasks([
      { ...blocker, state: 'DONE', completed: true },
      recurring,
      sibling,
    ]);

    let releaseFirst = (): void => {};
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    let call = 0;
    writer.updateTaskState.mockImplementation(
      async (task: Task, newState: string) => {
        call += 1;
        if (call === 1) await firstGate;
        return {
          ...task,
          state: newState,
          completed: newState === 'DONE',
        };
      },
    );

    const first = coordinator.updateTaskState(sibling, 'DOING', 'task-list');
    const completion = coordinator.updateTaskState(
      recurring,
      'DONE',
      'task-list',
    );

    state.updateTaskByPathAndLine('blocker.md', 0, {
      state: 'TODO',
      completed: false,
    });
    state.notifySubscribers();
    releaseFirst();

    await expect(completion).resolves.toMatchObject({ status: 'refused' });
    await first;
    expect(writer.updateTaskState).toHaveBeenCalledTimes(1);
    coordinator.destroy();
  });

  it('refuses a repeated completion from an optimistic completed row', async () => {
    const { blocked, blocker, coordinator, state, writer } = createFixture();
    state.setTasks([{ ...blocker, state: 'DONE', completed: true }, blocked]);
    const sibling = createBaseTask({
      path: 'blocked.md',
      line: 1,
      id: 'sibling',
      text: 'Sibling',
      state: 'TODO',
    });
    state.addTask(sibling);

    let releaseFirst = (): void => {};
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    let call = 0;
    writer.updateTaskState.mockImplementation(
      async (task: Task, newState: string) => {
        call += 1;
        if (call === 1) await firstGate;
        return {
          ...task,
          state: newState,
          completed: newState === 'DONE',
        };
      },
    );

    const first = coordinator.updateTaskState(sibling, 'DOING', 'task-list');
    const completion = coordinator.updateTaskState(
      blocked,
      'DONE',
      'task-list',
    );
    const projected = state.findTaskByPathAndLine('blocked.md', 0);
    expect(projected?.state).toBe('DONE');

    state.updateTaskByPathAndLine('blocker.md', 0, {
      state: 'TODO',
      completed: false,
    });
    state.notifySubscribers();

    const repeated = await coordinator.updateTaskState(
      projected!,
      'DONE',
      'task-list',
    );
    releaseFirst();

    await expect(completion).resolves.toMatchObject({ status: 'refused' });
    await first;
    expect(repeated.status).toBe('refused');
    expect(writer.updateTaskState).toHaveBeenCalledTimes(1);
    coordinator.destroy();
  });

  it('does not authorize against a different row at the same line', () => {
    const { blocked, blocker, coordinator, state } = createFixture();
    const other = createBaseTask({
      path: 'blocked.md',
      line: 0,
      id: 'other',
      text: 'Other',
      rawText: 'TODO Other',
      state: 'TODO',
    });
    state.setTasks([{ ...blocker, state: 'DONE', completed: true }, other]);

    const resolved = (
      coordinator as unknown as {
        resolveCommittedTask(task: Task): Task | null;
      }
    ).resolveCommittedTask({
      ...blocked,
      id: 'missing',
      text: 'Blocked',
      state: 'DONE',
      completed: true,
    });

    expect(resolved).toBeNull();
    coordinator.destroy();
  });

  it('allows a repeated completion of a committed completed task', async () => {
    const { blocked, blocker, coordinator, state, writer } = createFixture();
    const completed = { ...blocked, state: 'DONE', completed: true };
    state.setTasks([
      { ...blocker, state: 'TODO', completed: false },
      completed,
    ]);

    const outcome = await coordinator.updateTaskState(
      completed,
      'DONE',
      'task-list',
    );

    expect(outcome.status).toBe('applied');
    expect(writer.updateTaskState).toHaveBeenCalledTimes(1);
    coordinator.destroy();
  });

  it('allows the explicit override from a projected completed row', async () => {
    const { blocked, blocker, coordinator, state, writer } = createFixture();
    state.setTasks([{ ...blocker, state: 'DONE', completed: true }, blocked]);
    await coordinator.updateTaskState(blocked, 'DONE', 'task-list');
    const projected = state.findTaskByPathAndLine('blocked.md', 0)!;
    state.updateTaskByPathAndLine('blocker.md', 0, {
      state: 'TODO',
      completed: false,
    });
    state.notifySubscribers();

    const outcome = await coordinator.updateTask({
      task: projected,
      type: 'state',
      source: 'task-list',
      newState: 'DONE',
      forceCompletion: true,
    });

    expect(outcome.status).toBe('applied');
    expect(writer.updateTaskState).toHaveBeenCalledTimes(2);
    coordinator.destroy();
  });

  it('rechecks the resolved row after a task shifts lines while queued', async () => {
    const { blocked, blocker, coordinator, state, writer } = createFixture();
    const decoy = createBaseTask({
      path: 'blocked.md',
      line: 2,
      id: 'decoy',
      text: 'Decoy',
      state: 'TODO',
    });
    const requested = { ...blocked, rawText: 'TODO Blocked' };
    state.setTasks([
      { ...blocker, state: 'DONE', completed: true },
      requested,
      decoy,
    ]);

    let releaseFirst = (): void => {};
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    let call = 0;
    writer.updateTaskState.mockImplementation(
      async (task: Task, newState: string) => {
        call += 1;
        if (call === 1) await firstGate;
        return { ...task, state: newState, completed: false };
      },
    );

    const first = coordinator.updateTaskState(decoy, 'DOING', 'task-list');
    const completion = coordinator.updateTaskState(
      requested,
      'DONE',
      'task-list',
    );

    // The requested row moves down, and an unblocked task takes its old key.
    state.adjustLineIndices('blocked.md', 1, 1);
    state.addTask(
      createBaseTask({
        path: 'blocked.md',
        line: 1,
        id: 'replacement',
        text: 'Replacement',
        rawText: 'TODO Replacement',
        state: 'TODO',
      }),
    );
    state.updateTaskByPathAndLine('blocker.md', 0, {
      state: 'TODO',
      completed: false,
    });
    state.notifySubscribers();
    releaseFirst();

    await expect(completion).resolves.toMatchObject({ status: 'refused' });
    await first;
    expect(writer.updateTaskState).toHaveBeenCalledTimes(1);
    coordinator.destroy();
  });

  it('releases once the blocker completes', async () => {
    const { blocked, coordinator, state, writer } = createFixture();
    state.updateTaskByPathAndLine('blocker.md', 0, {
      state: 'DONE',
      completed: true,
    });
    state.notifySubscribers();

    await coordinator.updateTaskState(blocked, 'DONE', 'task-list');
    expect(writer.updateTaskState).toHaveBeenCalled();
    coordinator.destroy();
  });
});
