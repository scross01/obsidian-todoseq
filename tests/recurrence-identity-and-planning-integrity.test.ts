/** @jest-environment jsdom */
import { TFile } from 'obsidian';
import { Task } from '../src/types/task';
import { TaskDependencyManager } from '../src/services/task-dependency-manager';
import { TaskStateManager } from '../src/services/task-state-manager';
import { TaskUpdateCoordinator } from '../src/services/task-update-coordinator';
import { TaskWriter } from '../src/services/task-writer';
import { OrgModeTaskParser } from '../src/parser/org-mode-task-parser';
import { TaskParser } from '../src/parser/task-parser';
import { getDefaultCoefficients } from '../src/utils/task-urgency';
import {
  createBaseSettings,
  createBaseTask,
  createTestKeywordManager,
  emulateEditorReplaceRange,
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
    updateTaskScheduledDate: jest.fn(),
    updateTaskDeadlineDate: jest.fn(),
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

function createWriter(content: string, path = 'test.org') {
  let written = content;
  const file = makeFile(path);
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

function createMarkdownHarness(
  content: string,
  options: { openEditor?: boolean } = {},
) {
  const lines = content.split('\n');
  const file = makeFile('test.md');
  const current = (): string => lines.join('\n');
  const editor = {
    lineCount: () => lines.length,
    getLine: (line: number) => lines[line] ?? '',
    getValue: current,
    replaceRange: (
      text: string,
      from: { line: number; ch: number },
      to: { line: number; ch: number },
    ) => {
      emulateEditorReplaceRange(lines, text, from, to);
    },
  };
  const app = {
    vault: {
      getAbstractFileByPath: (path: string) =>
        path === file.path ? file : null,
      process: jest.fn(
        async (
          _file: TFile,
          update: (data: string) => string,
        ): Promise<string> => {
          const next = update(current());
          lines.splice(0, lines.length, ...next.split('\n'));
          return next;
        },
      ),
      read: jest.fn(async () => current()),
    },
    workspace: {
      getActiveViewOfType: () =>
        options.openEditor
          ? {
              file,
              editor,
              getViewType: () => 'markdown',
              getMode: () => 'source',
            }
          : null,
    },
  };
  const settings = createBaseSettings({ trackStartedDate: false });
  const keywordManager = createTestKeywordManager(settings);
  const writer = new TaskWriter({ app, settings } as never, keywordManager);
  const parser = TaskParser.create(keywordManager, null);
  return {
    writer,
    parser,
    content: current,
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

describe('Plan 121 indented Markdown recurrence', () => {
  const source = [
    '- [ ] TODO Parent',
    '  - [ ] TODO nested task   ',
    '    SCHEDULED: <2026-06-24 Wed +1d>',
    '  - [ ] TODO sibling',
  ].join('\n');

  it.each([
    ['vault', false],
    ['editor', true],
  ])('rolls over through the %s path', async (_name, openEditor) => {
    const harness = createMarkdownHarness(source, { openEditor });
    const task = harness.parser
      .parseFile(source, 'test.md')
      .find((candidate) => candidate.text.trim() === 'nested task');
    expect(task).toBeDefined();

    await harness.writer.applyRecurrenceUpdate(task!, {
      newScheduledDate: new Date(2026, 5, 25),
      newScheduledRepeat: task!.scheduledDateRepeat,
      newState: 'TODO',
    });

    const output = harness.content();
    expect(output).toContain('  - [ ] TODO nested task');
    expect(output).toContain('    SCHEDULED: <2026-06-25 Thu +1d>');
    expect(output).toContain('  - [ ] TODO sibling');
    const reparsed = harness.parser.parseFile(output, 'test.md');
    expect(
      reparsed.find((candidate) => candidate.text.trim() === 'nested task')
        ?.scheduledDate,
    ).toEqual(new Date(2026, 5, 25));
    expect(
      reparsed.find((candidate) => candidate.text === 'sibling')?.scheduledDate,
    ).toBeNull();
  });
});

describe('Plan 121 mutation-time block identity', () => {
  const source = [
    'TODO Task text',
    'SCHEDULED: <2026-06-24 Wed +1d>',
    ':PROPERTIES:',
    ':ID: original-id',
    ':END: ^original-anchor',
    'TODO Unrelated',
  ].join('\n');

  it('rejects a replacement block with a different drawer ID', async () => {
    const task = createMarkdownHarness(source).parser.parseFile(
      source,
      'test.md',
    )[0];
    const replacement = source.replace(':ID: original-id', ':ID: decoy-id');
    const replaced = createMarkdownHarness(replacement);

    await expect(
      replaced.writer.applyRecurrenceUpdate(task, {
        newScheduledDate: new Date(2026, 5, 25),
        newScheduledRepeat: task.scheduledDateRepeat,
        newState: 'TODO',
      }),
    ).rejects.toThrow('Task row changed before recurrence update');
    expect(replaced.content()).toBe(replacement);
  });

  it('rejects a replacement block with a different block-end anchor', async () => {
    const replacement = source.replace('^original-anchor', '^decoy-anchor');
    const harness = createMarkdownHarness(replacement);
    const original = createMarkdownHarness(source).parser.parseFile(
      source,
      'test.md',
    )[0];

    await expect(
      harness.writer.applyRecurrenceUpdate(original, {
        newScheduledDate: new Date(2026, 5, 25),
        newScheduledRepeat: original.scheduledDateRepeat,
        newState: 'TODO',
      }),
    ).rejects.toThrow('Task row changed before recurrence update');
    expect(harness.content()).toBe(replacement);
  });

  it('allows an unrelated block edit when the intended identity still matches', async () => {
    const changed = source.replace('TODO Unrelated', 'TODO Edited elsewhere');
    const harness = createMarkdownHarness(changed);
    const task = harness.parser.parseFile(source, 'test.md')[0];

    await harness.writer.applyRecurrenceUpdate(task, {
      newScheduledDate: new Date(2026, 5, 25),
      newScheduledRepeat: task.scheduledDateRepeat,
      newState: 'TODO',
    });

    const output = harness.content();
    expect(output).toContain(':ID: original-id');
    expect(output).toContain('^original-anchor');
    expect(output).toContain('SCHEDULED: <2026-06-25 Thu +1d>');
    expect(output).toContain('TODO Edited elsewhere');
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

  it('rejects an occurrence whose repeat mode changed', async () => {
    const source = 'DONE Task text\nSCHEDULED: <2026-06-24 Wed ++1d>';
    const { writer, content } = createWriter(source, 'test.md');

    await expect(
      writer.applyRecurrenceUpdate(task(), {
        newScheduledDate: new Date(2026, 5, 25),
        newScheduledRepeat: { type: '+', unit: 'd', value: 1, raw: '+1d' },
        newState: 'TODO',
        expectedRecurrence: {
          scheduledDate: new Date(2026, 5, 24),
          scheduledDateRepeat: { type: '+', unit: 'd', value: 1, raw: '+1d' },
        },
      }),
    ).rejects.toThrow('Task row changed before recurrence update');
    expect(content()).toBe(source);
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

  it('ignores a different planning timestamp in a properties drawer', async () => {
    const source = [
      '* Project',
      '** TODO Repeat',
      ':PROPERTIES:',
      ':SCHEDULED: <2026-06-30 Tue>',
      ':END:',
      '   SCHEDULED: <2026-06-24 Wed +1d> DEADLINE: <2026-06-26 Fri>',
    ].join('\n');
    const { parser, task } = parseOrg(source);
    const { writer, content } = createWriter(source);

    await writer.applyRecurrenceUpdate(task, {
      newScheduledDate: new Date(2026, 5, 25),
      newScheduledRepeat: task.scheduledDateRepeat,
      newState: 'TODO',
    });

    const output = content();
    expect(output).toContain(':SCHEDULED: <2026-06-30 Tue>');
    expect(output).toContain(
      '   SCHEDULED: <2026-06-25 Thu +1d> DEADLINE: <2026-06-26 Fri>',
    );
    const reparsed = parser.parseFile(
      output,
      'test.org',
      makeFile('test.org'),
    )[0];
    expect(reparsed.scheduledDate).toEqual(new Date(2026, 5, 25));
    expect(reparsed.deadlineDate).toEqual(new Date(2026, 5, 26));
  });

  it('ignores an identical planning timestamp in a properties drawer', async () => {
    const source = [
      '* Project',
      '** TODO Repeat',
      ':PROPERTIES:',
      ':SCHEDULED: <2026-06-24 Wed +1d>',
      ':END:',
      '   SCHEDULED: <2026-06-24 Wed +1d>',
    ].join('\n');
    const { task } = parseOrg(source);
    const { writer, content } = createWriter(source);

    await writer.applyRecurrenceUpdate(task, {
      newScheduledDate: new Date(2026, 5, 25),
      newScheduledRepeat: task.scheduledDateRepeat,
      newState: 'TODO',
    });

    expect(content()).toContain(':SCHEDULED: <2026-06-24 Wed +1d>');
    expect(content()).toContain('   SCHEDULED: <2026-06-25 Thu +1d>');
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

  it('cancels a rollover after the repeat mode changed', async () => {
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

    const changedMode = {
      type: '.+' as const,
      unit: 'd' as const,
      value: 1,
      raw: '.+1d',
    };
    state.setTasks([
      { ...recurring, scheduledDateRepeat: changedMode },
      { ...mover, line: 1 },
    ]);
    release.resolve();

    await expect(first).resolves.toEqual({ status: 'applied' });
    await expect(recurrence).resolves.toMatchObject({ status: 'failed' });
    expect(writer.applyRecurrenceUpdate).not.toHaveBeenCalled();
    expect(
      state.findTaskByPathAndLine('note.md', 0)?.scheduledDateRepeat,
    ).toEqual(changedMode);
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

describe('Plan 122 anonymous block identity', () => {
  const source = ['TODO Task text', 'SCHEDULED: <2026-06-24 Wed +1d>'].join(
    '\n',
  );

  function options(task: Task) {
    return {
      newScheduledDate: new Date(2026, 5, 25),
      newScheduledRepeat: task.scheduledDateRepeat,
      newState: 'TODO',
    };
  }

  it('rejects a replacement row that introduces a drawer ID', async () => {
    const replacement = [source, ':PROPERTIES:', ':ID: decoy-id', ':END:'].join(
      '\n',
    );
    const task = createMarkdownHarness(source).parser.parseFile(
      source,
      'test.md',
    )[0];
    expect(task.id).toBeUndefined();
    expect(task.embedReference).toBeUndefined();
    const harness = createMarkdownHarness(replacement);

    await expect(
      harness.writer.applyRecurrenceUpdate(task, options(task)),
    ).rejects.toThrow('Task row changed before recurrence update');
    expect(harness.content()).toBe(replacement);
  });

  it('rejects a replacement row that introduces a block-end anchor', async () => {
    const replacement = [
      'TODO Task text',
      'SCHEDULED: <2026-06-24 Wed +1d> ^decoy-anchor',
    ].join('\n');
    const task = createMarkdownHarness(source).parser.parseFile(
      source,
      'test.md',
    )[0];
    const harness = createMarkdownHarness(replacement);

    await expect(
      harness.writer.applyRecurrenceUpdate(task, options(task)),
    ).rejects.toThrow('Task row changed before recurrence update');
    expect(harness.content()).toBe(replacement);
  });

  it('allows an anonymous row whose identity is unchanged', async () => {
    const harness = createMarkdownHarness(source);
    const task = harness.parser.parseFile(source, 'test.md')[0];

    await harness.writer.applyRecurrenceUpdate(task, options(task));

    expect(harness.content()).toBe(
      'TODO Task text\nSCHEDULED: <2026-06-25 Thu +1d>',
    );
  });
});

describe('Plan 122 drawer ID normalization', () => {
  const source = [
    '> TODO Task text',
    '> SCHEDULED: <2026-06-24 Wed +1d>',
    '> :PROPERTIES:',
    '> :ID: original-id   ',
    '> :END:',
  ].join('\n');

  it('accepts a valid drawer ID with trailing spaces and preserves the bytes', async () => {
    const harness = createMarkdownHarness(source);
    const task = harness.parser.parseFile(source, 'test.md')[0];
    expect(task.id).toBe('original-id');

    await harness.writer.applyRecurrenceUpdate(task, {
      newScheduledDate: new Date(2026, 5, 25),
      newScheduledRepeat: task.scheduledDateRepeat,
      newState: 'TODO',
    });

    expect(harness.content()).toContain('> :ID: original-id   ');
    expect(harness.content()).toContain('> SCHEDULED: <2026-06-25 Thu +1d>');
  });

  it('still rejects a conflicting live ID', async () => {
    const task = createMarkdownHarness(source).parser.parseFile(
      source,
      'test.md',
    )[0];
    const replacement = source.replace('original-id', 'decoy-id');
    const harness = createMarkdownHarness(replacement);

    await expect(
      harness.writer.applyRecurrenceUpdate(task, {
        newScheduledDate: new Date(2026, 5, 25),
        newScheduledRepeat: task.scheduledDateRepeat,
        newState: 'TODO',
      }),
    ).rejects.toThrow('Task row changed before recurrence update');
    expect(harness.content()).toBe(replacement);
  });
});

describe('Plan 122 warning-period mutation guards', () => {
  const regularWarning = { value: 3, unit: 'd' as const, isFirstOnly: false };
  const recurrenceTask = (): Task => ({
    ...createBaseTask({
      rawText: 'DONE Task text',
      text: 'Task text',
      state: 'DONE',
      completed: true,
      scheduledDate: new Date(2026, 5, 24),
      scheduledDateRepeat: { type: '+', unit: 'd', value: 1, raw: '+1d' },
      scheduledWarningPeriod: regularWarning,
    }),
    path: 'test.md',
    line: 0,
  });

  it('rejects a changed warning period on a date line', async () => {
    const source = 'DONE Task text\nSCHEDULED: <2026-06-24 Wed +1d -1d>';
    const { writer, content } = createWriter(source, 'test.md');

    await expect(
      writer.applyRecurrenceUpdate(recurrenceTask(), {
        newScheduledDate: new Date(2026, 5, 25),
        newScheduledRepeat: { type: '+', unit: 'd', value: 1, raw: '+1d' },
        newScheduledWarningPeriod: regularWarning,
        newState: 'TODO',
        expectedRecurrence: {
          scheduledDate: new Date(2026, 5, 24),
          scheduledDateRepeat: { type: '+', unit: 'd', value: 1, raw: '+1d' },
          scheduledWarningPeriod: regularWarning,
        },
      }),
    ).rejects.toThrow('Task row changed before recurrence update');
    expect(content()).toBe(source);
  });

  it('rejects a changed deadline warning period on a date line', async () => {
    const source = 'DONE Task text\nDEADLINE: <2026-06-26 Fri +1d -1d>';
    const task: Task = {
      ...recurrenceTask(),
      scheduledDate: null,
      scheduledDateRepeat: null,
      scheduledWarningPeriod: null,
      deadlineDate: new Date(2026, 5, 26),
      deadlineDateRepeat: { type: '+', unit: 'd', value: 1, raw: '+1d' },
      deadlineWarningPeriod: regularWarning,
    };
    const { writer, content } = createWriter(source, 'test.md');

    await expect(
      writer.applyRecurrenceUpdate(task, {
        newDeadlineDate: new Date(2026, 5, 27),
        newDeadlineRepeat: { type: '+', unit: 'd', value: 1, raw: '+1d' },
        newDeadlineWarningPeriod: regularWarning,
        newState: 'TODO',
        expectedRecurrence: {
          deadlineDate: new Date(2026, 5, 26),
          deadlineDateRepeat: { type: '+', unit: 'd', value: 1, raw: '+1d' },
          deadlineWarningPeriod: regularWarning,
        },
      }),
    ).rejects.toThrow('Task row changed before recurrence update');
    expect(content()).toBe(source);
  });

  it('rejects a changed warning period in a table cell', async () => {
    const source =
      '| DONE Task text<br>SCHEDULED: <2026-06-24 Wed +1d -1d> | untouched |';
    const tableTask = {
      ...recurrenceTask(),
      isTableTask: true,
      tableCell: { cellIndex: 0 },
    };
    const { writer, content } = createWriter(source, 'test.md');

    await expect(
      writer.applyRecurrenceUpdate(tableTask, {
        newScheduledDate: new Date(2026, 5, 25),
        newScheduledRepeat: { type: '+', unit: 'd', value: 1, raw: '+1d' },
        newScheduledWarningPeriod: regularWarning,
        newState: 'TODO',
        expectedRecurrence: {
          scheduledDate: new Date(2026, 5, 24),
          scheduledDateRepeat: { type: '+', unit: 'd', value: 1, raw: '+1d' },
          scheduledWarningPeriod: regularWarning,
        },
      }),
    ).rejects.toThrow('Task row changed before recurrence update');
    expect(content()).toBe(source);
  });
});

describe('Plan 122 queued warning-period edits', () => {
  const regularWarning = { value: 3, unit: 'd' as const, isFirstOnly: false };
  const firstOnlyWarning = {
    value: 2,
    unit: 'd' as const,
    isFirstOnly: true,
  };

  type WarningDate = 'scheduled' | 'deadline';

  function queuedTask(
    warning: Task['scheduledWarningPeriod'],
    dateType: WarningDate = 'scheduled',
  ): Task {
    return {
      ...createBaseTask({
        path: 'note.md',
        line: 0,
        id: 'recurring',
        text: 'Recurring',
        rawText: 'TODO Recurring',
        state: 'TODO',
        ...(dateType === 'scheduled'
          ? {
              scheduledDate: new Date(2026, 5, 24),
              scheduledDateRepeat: {
                type: '+' as const,
                unit: 'd' as const,
                value: 1,
                raw: '+1d',
              },
              scheduledWarningPeriod: warning,
            }
          : {
              deadlineDate: new Date(2026, 5, 26),
              deadlineDateRepeat: {
                type: '+' as const,
                unit: 'd' as const,
                value: 1,
                raw: '+1d',
              },
              deadlineWarningPeriod: warning,
            }),
      }),
    };
  }

  async function runQueuedEdit(
    before: Task['scheduledWarningPeriod'],
    after: Task['scheduledWarningPeriod'],
    dateType: WarningDate = 'scheduled',
  ): Promise<{
    state: TaskStateManager;
    writer: ReturnType<typeof createCoordinatorFixture>['writer'];
    outcome: Awaited<ReturnType<TaskUpdateCoordinator['updateTaskRecurrence']>>;
  }> {
    const recurring = queuedTask(before, dateType);
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
    const recurrence = coordinator.updateTaskRecurrence(
      recurring,
      dateType === 'scheduled'
        ? {
            newScheduledDate: new Date(2026, 5, 25),
            newScheduledRepeat: recurring.scheduledDateRepeat,
            newScheduledWarningPeriod: after,
            newStateForRecurrence: 'TODO',
          }
        : {
            newDeadlineDate: new Date(2026, 5, 27),
            newDeadlineRepeat: recurring.deadlineDateRepeat,
            newDeadlineWarningPeriod: after,
            newStateForRecurrence: 'TODO',
          },
    );

    state.setTasks([
      dateType === 'scheduled'
        ? { ...recurring, scheduledWarningPeriod: after }
        : { ...recurring, deadlineWarningPeriod: after },
      { ...mover, line: 1 },
    ]);
    release.resolve();

    await expect(first).resolves.toEqual({ status: 'applied' });
    const outcome = await recurrence;
    coordinator.destroy();
    return { state, writer, outcome };
  }

  it('fails when the warning was changed while queued', async () => {
    const changed = { value: 1, unit: 'd' as const, isFirstOnly: false };
    const { state, writer, outcome } = await runQueuedEdit(
      regularWarning,
      changed,
    );

    expect(outcome).toMatchObject({ status: 'failed' });
    expect(writer.applyRecurrenceUpdate).not.toHaveBeenCalled();
    expect(
      state.findTaskByPathAndLine('note.md', 0)?.scheduledWarningPeriod,
    ).toEqual(changed);
  });

  it('fails when the warning was removed while queued', async () => {
    const { state, writer, outcome } = await runQueuedEdit(
      regularWarning,
      null,
    );

    expect(outcome).toMatchObject({ status: 'failed' });
    expect(writer.applyRecurrenceUpdate).not.toHaveBeenCalled();
    expect(
      state.findTaskByPathAndLine('note.md', 0)?.scheduledWarningPeriod,
    ).toBeNull();
  });

  it('fails when a warning was added while queued', async () => {
    const added = { value: 1, unit: 'w' as const, isFirstOnly: false };
    const { state, writer, outcome } = await runQueuedEdit(null, added);

    expect(outcome).toMatchObject({ status: 'failed' });
    expect(writer.applyRecurrenceUpdate).not.toHaveBeenCalled();
    expect(
      state.findTaskByPathAndLine('note.md', 0)?.scheduledWarningPeriod,
    ).toEqual(added);
  });

  it('fails when the deadline warning was changed while queued', async () => {
    const changed = { value: 1, unit: 'd' as const, isFirstOnly: true };
    const { state, writer, outcome } = await runQueuedEdit(
      regularWarning,
      changed,
      'deadline',
    );

    expect(outcome).toMatchObject({ status: 'failed' });
    expect(writer.applyRecurrenceUpdate).not.toHaveBeenCalled();
    expect(
      state.findTaskByPathAndLine('note.md', 0)?.deadlineWarningPeriod,
    ).toEqual(changed);
  });

  it.each([
    ['keeps a regular warning', regularWarning, regularWarning],
    ['strips a first-only warning', firstOnlyWarning, null],
  ])(
    'still rolls over when the queued warning is unchanged and %s',
    async (_label, initial, next) => {
      const recurring = queuedTask(initial);
      const mover = createBaseTask({
        path: 'note.md',
        line: 1,
        id: 'mover',
        text: 'Mover',
        rawText: 'TODO Mover',
        state: 'TODO',
      });
      const { coordinator, writer } = createCoordinatorFixture([
        recurring,
        mover,
      ]);
      writer.applyRecurrenceUpdate.mockImplementation(
        async (task: Task, options: { newScheduledDate?: Date }) => ({
          ...task,
          scheduledDate: options.newScheduledDate ?? task.scheduledDate,
        }),
      );
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
        newScheduledWarningPeriod: next,
        newStateForRecurrence: 'TODO',
      });
      release.resolve();

      await expect(first).resolves.toEqual({ status: 'applied' });
      await expect(recurrence).resolves.toEqual({ status: 'applied' });
      expect(writer.applyRecurrenceUpdate).toHaveBeenCalledTimes(1);
      const options = writer.applyRecurrenceUpdate.mock.calls[0][1];
      expect(options.newScheduledWarningPeriod).toEqual(next);
      expect(options.expectedRecurrence.scheduledWarningPeriod).toEqual(
        initial,
      );
      coordinator.destroy();
    },
  );
});

describe('Plan 122 queued write identity audit', () => {
  const target = (): Task =>
    createBaseTask({
      path: 'note.md',
      line: 0,
      id: 'target',
      text: 'Shared title',
      rawText: 'TODO Shared title',
      state: 'TODO',
      scheduledDate: new Date(2026, 5, 24),
      scheduledDateRepeat: { type: '+', unit: 'd', value: 1, raw: '+1d' },
    });

  function fixture(): {
    coordinator: TaskUpdateCoordinator;
    state: TaskStateManager;
    writer: ReturnType<typeof createCoordinatorFixture>['writer'];
    task: Task;
    mover: Task;
    started: ReturnType<typeof deferred>;
    release: ReturnType<typeof deferred>;
  } {
    const task = target();
    const mover = createBaseTask({
      path: 'note.md',
      line: 1,
      id: 'mover',
      text: 'Mover',
      rawText: 'TODO Mover',
      state: 'TODO',
    });
    const { coordinator, state, writer } = createCoordinatorFixture([
      task,
      mover,
    ]);
    const started = deferred();
    const release = deferred();
    writer.updateTaskPriority.mockImplementation(async (queued: Task) => {
      started.resolve();
      await release.promise;
      return { ...queued, priority: 'high' as const };
    });
    return { coordinator, state, writer, task, mover, started, release };
  }

  it('re-resolves a queued scheduled-date write by ID after a decoy takes the line', async () => {
    const { coordinator, state, writer, task, mover, started, release } =
      fixture();
    writer.updateTaskScheduledDate.mockImplementation(
      async (queued: Task, date: Date) => ({
        ...queued,
        scheduledDate: date,
        lineDelta: 0,
      }),
    );

    const first = coordinator.updateTaskPriority(mover, 'high', 'task-list');
    await started.promise;
    const update = coordinator.updateTaskScheduledDate(
      task,
      new Date(2026, 5, 25),
    );
    state.setTasks([
      createBaseTask({
        path: 'note.md',
        line: 0,
        id: 'decoy',
        text: 'Shared title',
        rawText: 'TODO Shared title',
        state: 'TODO',
      }),
      { ...mover, line: 1 },
      { ...task, line: 2 },
    ]);
    release.resolve();

    await expect(first).resolves.toEqual({ status: 'applied' });
    await expect(update).resolves.toEqual({ status: 'applied' });
    expect(writer.updateTaskScheduledDate).toHaveBeenCalledTimes(1);
    expect(writer.updateTaskScheduledDate.mock.calls[0][0]).toMatchObject({
      id: 'target',
      line: 2,
    });
    coordinator.destroy();
  });

  it('re-resolves a queued state write by ID after a decoy takes the line', async () => {
    const { coordinator, state, writer, task, mover, started, release } =
      fixture();
    writer.updateTaskState.mockImplementation(
      async (queued: Task, nextState: string) => ({
        ...queued,
        state: nextState,
        rawText: queued.rawText.replace(queued.state, nextState),
        lineDelta: 0,
      }),
    );

    const first = coordinator.updateTaskPriority(mover, 'high', 'task-list');
    await started.promise;
    const update = coordinator.updateTaskState(task, 'DOING', 'task-list');
    state.setTasks([
      createBaseTask({
        path: 'note.md',
        line: 0,
        id: 'decoy',
        text: 'Shared title',
        rawText: 'TODO Shared title',
        state: 'TODO',
      }),
      { ...mover, line: 1 },
      { ...task, line: 2 },
    ]);
    release.resolve();

    await expect(first).resolves.toEqual({ status: 'applied' });
    await expect(update).resolves.toEqual({ status: 'applied' });
    expect(writer.updateTaskState).toHaveBeenCalledTimes(1);
    expect(writer.updateTaskState.mock.calls[0][0]).toMatchObject({
      id: 'target',
      line: 2,
    });
    coordinator.destroy();
  });

  it('refuses a queued completion when an anonymous replacement gains an anchor', async () => {
    const { coordinator, state, writer, mover, started, release } = fixture();
    const anonymous = {
      ...target(),
      id: undefined,
    };
    state.setTasks([anonymous, mover]);

    const first = coordinator.updateTaskPriority(mover, 'high', 'task-list');
    await started.promise;
    const completion = coordinator.updateTaskState(
      anonymous,
      'DONE',
      'task-list',
    );
    state.setTasks([
      {
        ...createBaseTask({
          path: 'note.md',
          line: 0,
          text: 'Shared title',
          rawText: 'TODO Shared title',
          state: 'TODO',
          embedReference: '^decoy-anchor',
        }),
      },
      { ...mover, line: 1 },
    ]);
    release.resolve();

    await expect(first).resolves.toEqual({ status: 'applied' });
    await expect(completion).resolves.toMatchObject({ status: 'failed' });
    expect(writer.updateTaskState).not.toHaveBeenCalled();
    coordinator.destroy();
  });

  it('refuses an identified sibling when an anonymous completion target is gone', async () => {
    const { coordinator, state, writer, mover, started, release } = fixture();
    const anonymous = { ...target(), id: undefined };
    state.setTasks([anonymous, mover]);

    const first = coordinator.updateTaskPriority(mover, 'high', 'task-list');
    await started.promise;
    const completion = coordinator.updateTaskState(
      anonymous,
      'DONE',
      'task-list',
    );
    state.setTasks([
      createBaseTask({
        path: 'note.md',
        line: 0,
        id: 'sibling',
        text: 'Shared title',
        rawText: 'TODO Shared title',
        state: 'TODO',
        scheduledDate: new Date(2026, 5, 24),
        scheduledDateRepeat: { type: '+', unit: 'd', value: 1, raw: '+1d' },
      }),
      { ...mover, line: 1 },
    ]);
    release.resolve();

    await expect(first).resolves.toEqual({ status: 'applied' });
    await expect(completion).resolves.toMatchObject({ status: 'failed' });
    expect(writer.updateTaskState).not.toHaveBeenCalled();
    expect(state.findTaskByPathAndLine('note.md', 0)?.id).toBe('sibling');
    coordinator.destroy();
  });

  it('refuses an anchored sibling when an anonymous recurrence target is gone', async () => {
    const { coordinator, state, writer, mover, started, release } = fixture();
    const anonymous = { ...target(), id: undefined };
    state.setTasks([anonymous, mover]);

    const first = coordinator.updateTaskPriority(mover, 'high', 'task-list');
    await started.promise;
    const recurrence = coordinator.updateTaskRecurrence(anonymous, {
      newScheduledDate: new Date(2026, 5, 25),
      newScheduledRepeat: { type: '+', unit: 'd', value: 1, raw: '+1d' },
      newStateForRecurrence: 'TODO',
    });
    state.setTasks([
      createBaseTask({
        path: 'note.md',
        line: 0,
        text: 'Shared title',
        rawText: 'TODO Shared title',
        state: 'TODO',
        embedReference: '^sibling-anchor',
        scheduledDate: new Date(2026, 5, 24),
        scheduledDateRepeat: { type: '+', unit: 'd', value: 1, raw: '+1d' },
      }),
      { ...mover, line: 1 },
    ]);
    release.resolve();

    await expect(first).resolves.toEqual({ status: 'applied' });
    await expect(recurrence).resolves.toMatchObject({ status: 'failed' });
    expect(writer.applyRecurrenceUpdate).not.toHaveBeenCalled();
    coordinator.destroy();
  });
});

describe('Plan 123 recurrence drawer ownership', () => {
  const unquotedSource = [
    'TODO Recurring task',
    'SCHEDULED: <2026-06-24 Wed +1d>',
    '> :PROPERTIES:',
    '> :ID: unrelated-quoted',
    '> :END:',
  ].join('\n');

  it('ignores an unrelated quoted drawer and advances the anonymous task', async () => {
    const harness = createMarkdownHarness(unquotedSource);
    const task = harness.parser.parseFile(unquotedSource, 'test.md')[0];
    expect(task.id).toBeUndefined();
    expect(task.scheduledDateRepeat).toMatchObject({ raw: '+1d' });

    await harness.writer.applyRecurrenceUpdate(task, {
      newScheduledDate: new Date(2026, 5, 25),
      newScheduledRepeat: task.scheduledDateRepeat,
      newState: 'TODO',
    });

    const output = harness.content();
    expect(output).toContain('SCHEDULED: <2026-06-25 Thu +1d>');
    expect(output).toContain('> :ID: unrelated-quoted');
  });

  it('uses a quoted task\'s owned drawer', async () => {
    const source = [
      '> TODO Recurring task',
      '> SCHEDULED: <2026-06-24 Wed +1d>',
      '> :PROPERTIES:',
      '> :ID: quoted-owner',
      '> :END:',
    ].join('\n');
    const harness = createMarkdownHarness(source);
    const task = harness.parser.parseFile(source, 'test.md')[0];
    expect(task.id).toBe('quoted-owner');

    await harness.writer.applyRecurrenceUpdate(task, {
      newScheduledDate: new Date(2026, 5, 25),
      newScheduledRepeat: task.scheduledDateRepeat,
      newState: 'TODO',
    });

    const output = harness.content();
    expect(output).toContain('> SCHEDULED: <2026-06-25 Thu +1d>');
    expect(output).toContain('> :ID: quoted-owner');
  });

  it('still rejects a changed ID in the quoted task\'s own drawer', async () => {
    const source = [
      '> TODO Recurring task',
      '> SCHEDULED: <2026-06-24 Wed +1d>',
      '> :PROPERTIES:',
      '> :ID: quoted-owner',
      '> :END:',
    ].join('\n');
    const replacement = source.replace('quoted-owner', 'decoy-owner');
    const original = createMarkdownHarness(source).parser.parseFile(
      source,
      'test.md',
    )[0];
    const harness = createMarkdownHarness(replacement);

    await expect(
      harness.writer.applyRecurrenceUpdate(original, {
        newScheduledDate: new Date(2026, 5, 25),
        newScheduledRepeat: original.scheduledDateRepeat,
        newState: 'TODO',
      }),
    ).rejects.toThrow('Task row changed before recurrence update');
    expect(harness.content()).toBe(replacement);
  });
});
