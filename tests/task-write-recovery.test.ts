/**
 * @jest-environment jsdom
 */

import { TFile } from 'obsidian';
import { TaskUpdateCoordinator } from '../src/services/task-update-coordinator';
import { TaskStateManager } from '../src/services/task-state-manager';
import { VaultScanner } from '../src/services/vault-scanner';
import { ChangeTracker } from '../src/services/change-tracker';
import { Task } from '../src/types/task';
import {
  createBaseSettings,
  createBaseTask,
  createTestKeywordManager,
} from './helpers/test-helper';

Object.assign(window, { activeDocument: document });

const settings = createBaseSettings();
const keywordManager = createTestKeywordManager(settings);

function makeFile(path = 'note.md'): TFile {
  const file = new TFile();
  file.path = path;
  file.name = path;
  file.extension = 'md';
  return file;
}

describe('standalone recovery', () => {
  it('reads persisted truth even while the failed write skip marker is live', async () => {
    const manager = new TaskStateManager(keywordManager);
    const file = makeFile();
    const optimistic = createBaseTask({
      path: 'note.md',
      line: 0,
      state: 'DONE',
      completed: true,
      rawText: 'DONE Task',
      text: 'Task',
    });
    const persisted = createBaseTask({
      path: 'note.md',
      line: 0,
      state: 'TODO',
      completed: false,
      rawText: 'TODO Task',
      text: 'Task',
    });
    manager.setTasks([optimistic]);

    const scanner = new VaultScanner(
      { app: { vault: { getAbstractFileByPath: () => file } } } as never,
      settings,
      manager,
      undefined as never,
      keywordManager,
      { getParser: () => null, getAllParsers: () => [] } as never,
      new ChangeTracker({} as never),
    );
    const scanFile = jest.fn().mockResolvedValue([persisted]) as unknown as (
      file: TFile,
    ) => Promise<Task[]>;
    (
      scanner as unknown as { scanFile: (file: TFile) => Promise<Task[]> }
    ).scanFile = scanFile;

    scanner.addSkipIncrementalChange(file.path);
    await scanner.processIncrementalChange(file);
    expect(manager.getTasks()[0].state).toBe('DONE');

    const recovered = await scanner.reconcileFileAfterFailedWrite(
      file.path,
      file,
      true,
    );

    expect(scanFile).toHaveBeenCalledTimes(1);
    expect(recovered).toHaveLength(1);
    expect(manager.getTasks()[0].state).toBe('TODO');
  });

  it('removes only the missing file tasks', async () => {
    const manager = new TaskStateManager(keywordManager);
    const missing = createBaseTask({ path: 'gone.md', line: 0 });
    const sibling = createBaseTask({ path: 'kept.md', line: 0 });
    manager.setTasks([missing, sibling]);

    const scanner = new VaultScanner(
      { app: { vault: { getAbstractFileByPath: () => null } } } as never,
      settings,
      manager,
      undefined as never,
      keywordManager,
      { getParser: () => null, getAllParsers: () => [] } as never,
      new ChangeTracker({} as never),
    );

    await scanner.reconcileFileAfterFailedWrite('gone.md', null, true);

    expect(manager.getTasks()).toHaveLength(1);
    expect(manager.getTasks()[0].path).toBe('kept.md');
  });
});

describe('queued recovery', () => {
  let coordinator: TaskUpdateCoordinator;
  let manager: TaskStateManager;
  let task: Task;
  let persisted: Task;
  let reconcile: jest.Mock;
  let priorityWrite: jest.Mock;

  beforeEach(() => {
    manager = new TaskStateManager(keywordManager);
    task = createBaseTask({
      path: 'note.md',
      line: 0,
      state: 'TODO',
      completed: false,
      rawText: 'TODO Task',
      text: 'Task',
    });
    persisted = createBaseTask({
      path: 'note.md',
      line: 0,
      state: 'TODO',
      completed: false,
      rawText: 'TODO Task',
      text: 'Task',
    });
    manager.setTasks([task]);

    reconcile = jest.fn(
      async (
        _path: string,
        _file: TFile | null,
        publish: boolean,
      ): Promise<Task[]> => {
        if (publish) manager.setTasks([persisted]);
        return [persisted];
      },
    );
    priorityWrite = jest.fn(async (target: Task) => ({
      ...target,
      priority: 'high' as const,
    }));

    const file = makeFile();
    const plugin = {
      app: {
        vault: {
          getAbstractFileByPath: () => file,
          process: jest.fn(),
          read: jest.fn().mockResolvedValue('TODO Task'),
        },
        workspace: { getActiveViewOfType: () => null },
      },
      settings,
      isUserInitiatedUpdate: false,
      taskStateManager: manager,
      taskEditor: {
        updateTaskState: jest
          .fn()
          .mockRejectedValueOnce(new Error('disk full')),
        updateTaskPriority: priorityWrite,
      },
      vaultScanner: {
        addSkipIncrementalChange: jest.fn(),
        processIncrementalChange: jest.fn(),
        reconcileFileAfterFailedWrite: reconcile,
        getParser: jest.fn(),
      },
      embeddedTaskListProcessor: {
        refreshAllEmbeddedTaskLists: jest.fn(),
      },
      refreshVisibleEditorDecorations: jest.fn(),
    };
    coordinator = new TaskUpdateCoordinator(
      plugin as never,
      manager,
      keywordManager,
    );
  });

  afterEach(() => {
    coordinator.destroy();
  });

  it('publishes persisted truth after a lone failure', async () => {
    await coordinator.updateTaskState(task, 'DONE', 'task-list');

    expect(reconcile).toHaveBeenCalledTimes(1);
    expect(reconcile.mock.calls[0][0]).toBe('note.md');
    expect(reconcile.mock.calls[0][2]).toBe(true);
    expect(manager.getTasks()[0].state).toBe('TODO');
  });

  it('does not publish an older failure over a newer request and rebases the later edit', async () => {
    const first = coordinator.updateTaskState(task, 'DONE', 'task-list');
    const second = coordinator.updateTaskPriority(task, 'high', 'task-list');

    await expect(first).resolves.toBeUndefined();
    await second;

    // The newer request owned the file, so the older failure supplied a
    // baseline without publishing over the optimistic DONE state.
    expect(reconcile.mock.calls[0][2]).toBe(false);
    expect(priorityWrite).toHaveBeenCalledTimes(1);
    expect(priorityWrite.mock.calls[0][0].state).toBe('TODO');
  });
});
