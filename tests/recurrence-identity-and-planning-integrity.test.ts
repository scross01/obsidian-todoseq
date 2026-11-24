/** @jest-environment jsdom */
import { TFile } from 'obsidian';
import { Task } from '../src/types/task';
import { TaskDependencyManager } from '../src/services/task-dependency-manager';
import { TaskStateManager } from '../src/services/task-state-manager';
import { TaskUpdateCoordinator } from '../src/services/task-update-coordinator';
import { TaskWriter } from '../src/services/task-writer';
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

function createCoordinatorFixture(tasks: Task[]) {
  const settings = createBaseSettings({ enforceBlockedTasks: true });
  const keywordManager = createTestKeywordManager(settings);
  const state = new TaskStateManager(keywordManager);
  state.setTasks(tasks);
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
        read: jest.fn().mockResolvedValue(''),
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
  return { coordinator, state, writer };
}

function createWriter(content: string) {
  let written = content;
  const file = makeFile('test.org');
  const app = {
    vault: {
      getAbstractFileFromPath: jest.fn(),
      getAbstractFileByPath: jest.fn().mockReturnValue(file),
      process: jest.fn(
        async (
          _file: TFile,
          update: (data: string) => string,
        ): Promise<string> => {
          written = update(written);
          return written;
        },
      ),
      read: jest.fn(async () => written),
    },
    workspace: {
      getActiveViewOfType: jest.fn().mockReturnValue(null),
    },
  };
  const keywordManager = createTestKeywordManager({});
  const writer = new TaskWriter(
    {
      app,
      settings: createBaseSettings({ trackStartedDate: false }),
    } as never,
    keywordManager,
  );
  return {
    writer,
    keywordManager,
    content: () => written,
  };
}

describe('Plan 120 anchored identity', () => {
  it('refuses a same-title anchor conflict and keeps the original blocked', async () => {
    const blocker = createBaseTask({
      path: 'blocker.md',
      line: 0,
      id: 'blocker',
      text: 'Blocker',
      rawText: 'TODO Blocker',
      state: 'DONE',
      completed: true,
    });
    const original = {
      ...createBaseTask({
        path: 'note.md',
        line: 0,
        embedReference: '^original',
        text: 'Shared title',
        rawText: 'TODO Shared title',
        state: 'TODO',
        blockedBy: ['blocker'],
      }),
      id: undefined,
    };
    const decoy = {
      ...createBaseTask({
        path: 'note.md',
        line: 1,
        embedReference: '^decoy',
        text: 'Shared title',
        rawText: 'TODO Shared title',
        state: 'TODO',
      }),
      id: undefined,
    };
    const mover = createBaseTask({
      path: 'note.md',
      line: 2,
      id: 'mover',
      text: 'Mover',
      rawText: 'TODO Mover',
      state: 'TODO',
    });
    const { coordinator, state, writer } = createCoordinatorFixture([
      blocker,
      original,
      decoy,
      mover,
    ]);

    const started = deferred();
    const release = deferred();
    let calls = 0;
    writer.updateTaskState.mockImplementation(
      async (task: Task, newState: string) => {
        calls += 1;
        if (calls === 1) {
          started.resolve();
          await release.promise;
        }
        return { ...task, state: newState };
      },
    );

    const first = coordinator.updateTaskState(mover, 'DOING', 'task-list');
    await started.promise;
    const completion = coordinator.updateTaskState(
      original,
      'DONE',
      'task-list',
    );

    state.setTasks([
      { ...blocker, state: 'TODO', completed: false },
      { ...decoy, line: 0 },
      { ...original, line: 2 },
      { ...mover, line: 3 },
    ]);
    release.resolve();

    await expect(first).resolves.toEqual({ status: 'applied' });
    await expect(completion).resolves.toMatchObject({ status: 'refused' });
    expect(writer.updateTaskState).toHaveBeenCalledTimes(1);
    expect(state.findTaskByPathAndLine('note.md', 0)?.state).toBe('TODO');
    coordinator.destroy();
  });

  it('relocates recurrence by anchor instead of a same-title row at the old line', async () => {
    const recurring = {
      ...createBaseTask({
        path: 'note.md',
        line: 0,
        embedReference: '^original',
        text: 'Shared title',
        rawText: 'TODO Shared title',
        state: 'TODO',
        scheduledDate: new Date(2026, 5, 24),
        scheduledDateRepeat: { type: '+', unit: 'd', value: 1, raw: '+1d' },
      }),
      id: undefined,
    };
    const decoy = {
      ...createBaseTask({
        path: 'note.md',
        line: 1,
        embedReference: '^decoy',
        text: 'Shared title',
        rawText: 'TODO Shared title',
        state: 'TODO',
      }),
      id: undefined,
    };
    const mover = createBaseTask({
      path: 'note.md',
      line: 2,
      id: 'mover',
      text: 'Mover',
      rawText: 'TODO Mover',
      state: 'TODO',
    });
    const { coordinator, state, writer } = createCoordinatorFixture([
      recurring,
      decoy,
      mover,
    ]);
    const started = deferred();
    const release = deferred();
    writer.updateTaskPriority.mockImplementation(async (task: Task) => {
      started.resolve();
      await release.promise;
      return { ...task, priority: 'high' as const };
    });
    writer.applyRecurrenceUpdate.mockImplementation(
      async (task: Task, options: { newScheduledDate?: Date }) => ({
        ...task,
        scheduledDate: options.newScheduledDate ?? task.scheduledDate,
      }),
    );

    const first = coordinator.updateTaskPriority(mover, 'high', 'task-list');
    await started.promise;
    const recurrence = coordinator.updateTaskRecurrence(recurring, {
      newScheduledDate: new Date(2026, 5, 25),
      newScheduledRepeat: { type: '+', unit: 'd', value: 1, raw: '+1d' },
      newStateForRecurrence: 'TODO',
    });

    state.setTasks([
      { ...decoy, line: 0 },
      { ...recurring, line: 2 },
      { ...mover, line: 3 },
    ]);
    release.resolve();

    await expect(first).resolves.toEqual({ status: 'applied' });
    await expect(recurrence).resolves.toEqual({ status: 'applied' });
    expect(writer.applyRecurrenceUpdate).toHaveBeenCalledTimes(1);
    expect(writer.applyRecurrenceUpdate.mock.calls[0][0]).toMatchObject({
      line: 2,
      embedReference: '^original',
    });
    coordinator.destroy();
  });

  it('fails when the requested anchor was removed and a same-title row remains', async () => {
    const recurring = {
      ...createBaseTask({
        path: 'note.md',
        line: 0,
        embedReference: '^original',
        text: 'Shared title',
        rawText: 'TODO Shared title',
        state: 'TODO',
        scheduledDate: new Date(2026, 5, 24),
        scheduledDateRepeat: { type: '+', unit: 'd', value: 1, raw: '+1d' },
      }),
      id: undefined,
    };
    const decoy = {
      ...createBaseTask({
        path: 'note.md',
        line: 1,
        embedReference: '^decoy',
        text: 'Shared title',
        rawText: 'TODO Shared title',
        state: 'TODO',
      }),
      id: undefined,
    };
    const mover = createBaseTask({
      path: 'note.md',
      line: 2,
      id: 'mover',
      text: 'Mover',
      rawText: 'TODO Mover',
      state: 'TODO',
    });
    const { coordinator, state, writer } = createCoordinatorFixture([
      recurring,
      decoy,
      mover,
    ]);
    const started = deferred();
    const release = deferred();
    writer.updateTaskPriority.mockImplementation(async (task: Task) => {
      started.resolve();
      await release.promise;
      return { ...task, priority: 'high' as const };
    });

    const first = coordinator.updateTaskPriority(mover, 'high', 'task-list');
    await started.promise;
    const recurrence = coordinator.updateTaskRecurrence(recurring, {
      newScheduledDate: new Date(2026, 5, 25),
      newStateForRecurrence: 'TODO',
    });

    state.setTasks([
      { ...decoy, line: 0 },
      {
        ...createBaseTask({
          path: 'note.md',
          line: 1,
          text: 'Unrelated',
          rawText: 'TODO Unrelated',
          state: 'TODO',
        }),
      },
    ]);
    release.resolve();

    await expect(first).resolves.toEqual({ status: 'applied' });
    await expect(recurrence).resolves.toMatchObject({ status: 'failed' });
    expect(writer.applyRecurrenceUpdate).not.toHaveBeenCalled();
    coordinator.destroy();
  });
});

describe('Plan 120 recurrence mutation guards', () => {
  const task = (): Task => ({
    ...createBaseTask({
      rawText: 'DONE Task text',
      text: 'Task text',
      state: 'DONE',
      completed: true,
      scheduledDate: new Date(2026, 5, 24),
      scheduledDateRepeat: { type: '+', unit: 'd', value: 1, raw: '+1d' },
    }),
    path: 'test.org',
    line: 0,
  });

  it('rejects a longer title at the target line', async () => {
    const { writer, content } = createWriter(
      'DONE Task text extended\n  SCHEDULED: <2026-06-24 Wed +1d>',
    );

    await expect(
      writer.applyRecurrenceUpdate(task(), {
        newScheduledDate: new Date(2026, 5, 25),
        newState: 'TODO',
      }),
    ).rejects.toThrow('Task row changed before recurrence update');
    expect(content()).toBe(
      'DONE Task text extended\n  SCHEDULED: <2026-06-24 Wed +1d>',
    );
  });

  it('allows an unrelated table cell edit but rejects a changed target cell', async () => {
    const tableTask = {
      ...task(),
      isTableTask: true,
      tableCell: { cellIndex: 0 },
      rawText: 'DONE Task text',
    };
    const unchanged = createWriter(
      '| DONE Task text<br>SCHEDULED: <2026-06-24 Wed +1d> | untouched |',
    );
    await unchanged.writer.applyRecurrenceUpdate(tableTask, {
      newScheduledDate: new Date(2026, 5, 25),
      newState: 'TODO',
    });
    expect(unchanged.content()).toContain('| untouched |');

    const changed = createWriter(
      '| DONE Task text extended<br>SCHEDULED: <2026-06-24 Wed +1d> | untouched |',
    );
    await expect(
      changed.writer.applyRecurrenceUpdate(tableTask, {
        newScheduledDate: new Date(2026, 5, 25),
        newState: 'TODO',
      }),
    ).rejects.toThrow('Task row changed before recurrence update');
    expect(changed.content()).toBe(
      '| DONE Task text extended<br>SCHEDULED: <2026-06-24 Wed +1d> | untouched |',
    );
  });
});

describe('Plan 120 Org planning tokens', () => {
  function parseOrg(content: string) {
    const keywordManager = createTestKeywordManager({});
    const parser = OrgModeTaskParser.create(
      keywordManager,
      null,
      getDefaultCoefficients(),
    );
    const parsed = parser.parseFile(content, 'test.org', makeFile('test.org'));
    return { parser, task: parsed[0], keywordManager };
  }

  it('updates only the repeating timestamp on a shared planning line', async () => {
    const source = [
      '* Project',
      '** TODO Repeat',
      '   SCHEDULED: <2026-06-24 Wed +1d> DEADLINE: <2026-06-26 Fri>',
      '** TODO Sibling',
      '   SCHEDULED: <2026-06-24 Wed +1d> DEADLINE: <2026-06-30 Tue>',
    ].join('\n');
    const { parser, task } = parseOrg(source);
    const { writer, content } = createWriter(source);

    await writer.applyRecurrenceUpdate(task, {
      newScheduledDate: new Date(2026, 5, 25),
      newScheduledRepeat: task.scheduledDateRepeat,
      newState: 'TODO',
    });

    expect(content()).toContain(
      '   SCHEDULED: <2026-06-25 Thu +1d> DEADLINE: <2026-06-26 Fri>',
    );
    expect(content()).toContain(
      '   SCHEDULED: <2026-06-24 Wed +1d> DEADLINE: <2026-06-30 Tue>',
    );
    const reparsed = parser.parseFile(
      content(),
      'test.org',
      makeFile('test.org'),
    )[0];
    expect(reparsed.scheduledDate).toEqual(new Date(2026, 5, 25));
    expect(reparsed.deadlineDate).toEqual(new Date(2026, 5, 26));
    expect(reparsed.deadlineDateRepeat).toBeNull();
  });

  it('updates two repeating timestamps on the same planning line', async () => {
    const source = [
      '* Project',
      '** TODO Repeat',
      '   SCHEDULED: <2026-06-24 Wed +1d> DEADLINE: <2026-06-26 Fri +2d>',
    ].join('\n');
    const { task } = parseOrg(source);
    const { writer, content } = createWriter(source);

    await writer.applyRecurrenceUpdate(task, {
      newScheduledDate: new Date(2026, 5, 25),
      newScheduledRepeat: task.scheduledDateRepeat,
      newDeadlineDate: new Date(2026, 5, 28),
      newDeadlineRepeat: task.deadlineDateRepeat,
      newState: 'TODO',
    });

    expect(content()).toContain(
      '   SCHEDULED: <2026-06-25 Thu +1d> DEADLINE: <2026-06-28 Sun +2d>',
    );
  });

  it('keeps a fixed scheduled timestamp when the deadline is the repeat', async () => {
    const source = [
      '* Project',
      '** TODO Repeat',
      '   SCHEDULED: <2026-06-24 Wed> DEADLINE: <2026-06-26 Fri +2d>',
    ].join('\n');
    const { task } = parseOrg(source);
    const { writer, content } = createWriter(source);

    await writer.applyRecurrenceUpdate(task, {
      newDeadlineDate: new Date(2026, 5, 28),
      newDeadlineRepeat: task.deadlineDateRepeat,
      newState: 'TODO',
    });

    expect(content()).toContain(
      '   SCHEDULED: <2026-06-24 Wed> DEADLINE: <2026-06-28 Sun +2d>',
    );
  });

  it('finds the scheduled token when deadline comes first', async () => {
    const source = [
      '* Project',
      '** TODO Repeat',
      '   DEADLINE: <2026-06-26 Fri> SCHEDULED: <2026-06-24 Wed +1d>',
    ].join('\n');
    const { task } = parseOrg(source);
    const { writer, content } = createWriter(source);

    await writer.applyRecurrenceUpdate(task, {
      newScheduledDate: new Date(2026, 5, 25),
      newScheduledRepeat: task.scheduledDateRepeat,
      newState: 'TODO',
    });

    expect(content()).toContain(
      '   DEADLINE: <2026-06-26 Fri> SCHEDULED: <2026-06-25 Thu +1d>',
    );
  });

  it('removes only the scheduled token and keeps the fixed deadline', async () => {
    const source = [
      '* Project',
      '** TODO Repeat',
      '   SCHEDULED: <2026-06-24 Wed +1d> DEADLINE: <2026-06-26 Fri>',
    ].join('\n');
    const { task } = parseOrg(source);
    const { writer, content } = createWriter(source);

    await writer.applyRecurrenceUpdate(task, {
      newScheduledDate: null,
      newState: 'TODO',
    });

    expect(content()).toContain('   DEADLINE: <2026-06-26 Fri>');
    expect(content()).not.toContain('SCHEDULED:');
  });
});

describe('Plan 120 stale queued recurrence payloads', () => {
  it('cancels a rollover after the occurrence date or repeater changed', async () => {
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
    const mover = createBaseTask({
      path: 'note.md',
      line: 1,
      id: 'mover',
      text: 'Mover',
      rawText: 'TODO Mover',
      state: 'TODO',
    });
    const { coordinator, state, writer } = createCoordinatorFixture([
      recurring,
      mover,
    ]);
    const started = deferred();
    const release = deferred();
    writer.updateTaskPriority.mockImplementation(async (task: Task) => {
      started.resolve();
      await release.promise;
      return { ...task, priority: 'high' as const };
    });

    const first = coordinator.updateTaskPriority(mover, 'high', 'task-list');
    await started.promise;
    const recurrence = coordinator.updateTaskRecurrence(recurring, {
      newScheduledDate: new Date(2026, 5, 25),
      newScheduledRepeat: recurring.scheduledDateRepeat,
      newStateForRecurrence: 'TODO',
    });

    state.setTasks([
      {
        ...recurring,
        scheduledDate: new Date(2026, 6, 2),
        scheduledDateRepeat: null,
      },
      { ...mover, line: 1 },
    ]);
    release.resolve();

    await expect(first).resolves.toEqual({ status: 'applied' });
    await expect(recurrence).resolves.toMatchObject({ status: 'failed' });
    expect(writer.applyRecurrenceUpdate).not.toHaveBeenCalled();
    expect(state.findTaskByPathAndLine('note.md', 0)?.scheduledDate).toEqual(
      new Date(2026, 6, 2),
    );
    coordinator.destroy();
  });

  it('still rolls over when a preceding edit only moves the row', async () => {
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
    const mover = createBaseTask({
      path: 'note.md',
      line: 1,
      id: 'mover',
      text: 'Mover',
      rawText: 'TODO Mover',
      state: 'TODO',
    });
    const { coordinator, state, writer } = createCoordinatorFixture([
      recurring,
      mover,
    ]);
    const started = deferred();
    const release = deferred();
    writer.updateTaskPriority.mockImplementation(async (task: Task) => {
      started.resolve();
      await release.promise;
      return { ...task, priority: 'high' as const };
    });
    writer.applyRecurrenceUpdate.mockImplementation(
      async (task: Task, options: { newScheduledDate?: Date }) => ({
        ...task,
        scheduledDate: options.newScheduledDate ?? task.scheduledDate,
      }),
    );

    const first = coordinator.updateTaskPriority(mover, 'high', 'task-list');
    await started.promise;
    const recurrence = coordinator.updateTaskRecurrence(recurring, {
      newScheduledDate: new Date(2026, 5, 25),
      newScheduledRepeat: recurring.scheduledDateRepeat,
      newStateForRecurrence: 'TODO',
    });

    state.setTasks([
      { ...mover, line: 0 },
      { ...recurring, line: 2 },
    ]);
    release.resolve();

    await expect(first).resolves.toEqual({ status: 'applied' });
    await expect(recurrence).resolves.toEqual({ status: 'applied' });
    expect(writer.applyRecurrenceUpdate).toHaveBeenCalledTimes(1);
    expect(writer.applyRecurrenceUpdate.mock.calls[0][0]).toMatchObject({
      line: 2,
    });
    coordinator.destroy();
  });
});
