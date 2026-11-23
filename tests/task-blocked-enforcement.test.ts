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
  return { blocked, coordinator, dependencyManager, state, writer };
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
