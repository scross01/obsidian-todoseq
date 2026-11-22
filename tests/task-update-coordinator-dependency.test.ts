/** @jest-environment jsdom */

import { TFile } from 'obsidian';
import { TaskUpdateCoordinator } from '../src/services/task-update-coordinator';
import { TaskStateManager } from '../src/services/task-state-manager';
import {
  createBaseSettings,
  createBaseTask,
  createTestKeywordManager,
} from './helpers/test-helper';

function createHarness() {
  const settings = createBaseSettings();
  const keywordManager = createTestKeywordManager(settings);
  const stateManager = new TaskStateManager(keywordManager);
  const taskEditor = {
    setTaskDependency: jest.fn(),
    migrateBlockerHistory: jest.fn(),
    updateTaskState: jest.fn(),
  };
  const vaultScanner = {
    addSkipIncrementalChange: jest.fn(),
    processIncrementalChange: jest.fn(),
  };
  const app = {
    vault: {
      getAbstractFileByPath: jest.fn(() => {
        const file = new TFile();
        file.path = 'notes/dependent.md';
        return file;
      }),
      process: jest.fn(),
      read: jest.fn(),
    },
    workspace: { getActiveViewOfType: jest.fn() },
  };
  const plugin = {
    app,
    settings,
    taskEditor,
    taskStateManager: stateManager,
    vaultScanner,
    embeddedTaskListProcessor: { refreshAllEmbeddedTaskLists: jest.fn() },
    refreshVisibleEditorDecorations: jest.fn(),
  };
  const coordinator = new TaskUpdateCoordinator(
    plugin as never,
    stateManager,
    keywordManager,
    {} as never,
  );
  return { coordinator, stateManager, taskEditor, vaultScanner };
}

describe('TaskUpdateCoordinator dependency-reference updates', () => {
  it('adds a blocker through the coordinator and leaves state/dates untouched', async () => {
    const { coordinator, stateManager, taskEditor } = createHarness();
    const task = createBaseTask({
      path: 'notes/dependent.md',
      line: 1,
      blockedBy: [],
      scheduledDate: new Date(2026, 0, 2),
    });
    stateManager.addTask(task);
    taskEditor.setTaskDependency.mockResolvedValue({
      status: 'success',
      task: { ...task, blockedBy: ['data-01'] },
      lineDelta: 0,
    });

    const outcome = await coordinator.updateTaskDependency(task, 'add', [
      'data-01',
    ]);

    expect(outcome).toEqual({ status: 'applied' });
    expect(taskEditor.setTaskDependency).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'notes/dependent.md', line: 1 }),
      'data-01',
      true,
    );
    expect(
      stateManager.findTaskByPathAndLine('notes/dependent.md', 1),
    ).toMatchObject({
      state: 'TODO',
      blockedBy: ['data-01'],
      scheduledDate: new Date(2026, 0, 2),
    });
  });

  it('archives references through the writer history primitive', async () => {
    const { coordinator, taskEditor } = createHarness();
    const task = createBaseTask({
      path: 'notes/dependent.md',
      line: 1,
      blockedBy: ['data-01'],
    });
    taskEditor.migrateBlockerHistory.mockResolvedValue({
      status: 'success',
      task: { ...task, blockedBy: [], archivedBlockers: ['data-01'] },
      lineDelta: 0,
    });

    const outcome = await coordinator.updateTaskDependency(task, 'archive', [
      'data-01',
    ]);

    expect(outcome).toEqual({ status: 'applied' });
    expect(taskEditor.migrateBlockerHistory).toHaveBeenCalledWith(
      task,
      'to-history',
      ['data-01'],
    );
  });

  it('returns the writer failure reason without marking the task applied', async () => {
    const { coordinator, stateManager, taskEditor } = createHarness();
    const task = createBaseTask({
      path: 'notes/dependent.md',
      line: 1,
      blockedBy: [],
    });
    stateManager.addTask(task);
    taskEditor.setTaskDependency.mockResolvedValue({
      status: 'ambiguous',
      task: null,
      lineDelta: 0,
      reason: 'Fix the malformed properties drawer.',
    });

    const outcome = await coordinator.updateTaskDependency(task, 'add', [
      'data-01',
    ]);

    expect(outcome).toEqual({
      status: 'failed',
      reason: 'Fix the malformed properties drawer.',
    });
    expect(
      stateManager.findTaskByPathAndLine('notes/dependent.md', 1)?.blockedBy,
    ).toEqual([]);
  });
});
