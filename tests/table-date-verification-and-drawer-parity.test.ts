/** @jest-environment jsdom */
import { TFile } from 'obsidian';
import { TaskParser } from '../src/parser/task-parser';
import { TaskStateManager } from '../src/services/task-state-manager';
import { TaskUpdateCoordinator } from '../src/services/task-update-coordinator';
import { TaskWriter } from '../src/services/task-writer';
import { OrgModeTaskParser } from '../src/parser/org-mode-task-parser';
import { getDefaultCoefficients } from '../src/utils/task-urgency';
import { Task } from '../src/types/task';
import {
  createBaseSettings,
  createTestKeywordManager,
} from './helpers/test-helper';

(window as unknown as { activeDocument: Document }).activeDocument = document;

function makeFile(path: string): TFile {
  return new TFile(path, path, path.split('.').pop() ?? '');
}

function createWriterHarness(initial: string, path = 'note.md') {
  let content = initial;
  const file = makeFile(path);
  const settings = createBaseSettings();
  const keywordManager = createTestKeywordManager(settings);
  const parser = TaskParser.create(keywordManager, null);
  const app = {
    vault: {
      getAbstractFileByPath: (candidate: string) =>
        candidate === path ? file : null,
      read: jest.fn(async () => content),
      process: jest.fn(
        async (_file: TFile, update: (data: string) => string) => {
          content = update(content);
          return content;
        },
      ),
    },
    workspace: {
      getActiveViewOfType: () => null,
    },
  };
  const writer = new TaskWriter({ app, settings } as never, keywordManager);
  return {
    writer,
    parser,
    content: () => content,
    setContent: (next: string) => {
      content = next;
    },
  };
}

function createOrgWriterHarness(initial: string) {
  let content = initial;
  const file = makeFile('note.org');
  const settings = createBaseSettings();
  const keywordManager = createTestKeywordManager(settings);
  const parser = OrgModeTaskParser.create(
    keywordManager,
    null,
    getDefaultCoefficients(),
  );
  const app = {
    vault: {
      getAbstractFileByPath: (candidate: string) =>
        candidate === 'note.org' ? file : null,
      read: jest.fn(async () => content),
      process: jest.fn(
        async (_file: TFile, update: (data: string) => string) => {
          content = update(content);
          return content;
        },
      ),
    },
    workspace: {
      getActiveViewOfType: () => null,
    },
  };
  const writer = new TaskWriter({ app, settings } as never, keywordManager);
  return { writer, parser, file, content: () => content };
}

function createEditorDateCoordinator(initial: string) {
  let content = initial;
  const file = makeFile('note.md');
  const settings = createBaseSettings({ enforceBlockedTasks: false });
  const keywordManager = createTestKeywordManager(settings);
  const parser = TaskParser.create(keywordManager, null);
  const state = new TaskStateManager(keywordManager);
  const parsed = parser.parseFile(content, 'note.md', file);
  state.setTasks(parsed);

  const writer = {
    updateTaskState: jest.fn(),
    updateTaskScheduledDate: jest.fn(async (task: Task, date: Date) => ({
      ...task,
      scheduledDate: date,
    })),
    removeTaskScheduledDate: jest.fn(async (task: Task) => ({
      ...task,
      scheduledDate: null,
    })),
    updateTaskDeadlineDate: jest.fn(async (task: Task, date: Date) => ({
      ...task,
      deadlineDate: date,
    })),
    removeTaskDeadlineDate: jest.fn(async (task: Task) => ({
      ...task,
      deadlineDate: null,
    })),
    updateTaskPriority: jest.fn(),
    applyRecurrenceUpdate: jest.fn(),
  };
  const vaultScanner = {
    getParser: () => parser,
    getParserForPath: () => parser,
    addSkipIncrementalChange: jest.fn(),
    completeFileWrite: jest.fn(),
    processIncrementalChange: jest.fn(),
  };
  const plugin = {
    settings,
    app: {
      vault: {
        getAbstractFileByPath: () => file,
        read: jest.fn(async () => content),
        process: jest.fn(),
      },
      workspace: {
        getActiveViewOfType: () => null,
        getLeavesOfType: () => [],
      },
    },
    taskEditor: writer,
    taskStateManager: state,
    vaultScanner,
    embeddedTaskListProcessor: undefined,
    refreshVisibleEditorDecorations: jest.fn(),
    isUserInitiatedUpdate: false,
  };
  const coordinator = new TaskUpdateCoordinator(
    plugin as never,
    state,
    keywordManager,
    { isExpectedChange: () => false } as never,
  );
  return {
    coordinator,
    writer,
    task: parsed[0],
    content: () => content,
    setContent: (next: string) => {
      content = next;
    },
    poisonVerification: () => {
      vaultScanner.getParser = () => null as never;
      vaultScanner.getParserForPath = () => null as never;
    },
  };
}

const ROW = '| TODO Table task<br>SCHEDULED: <2026-06-24 Wed> | keep |';

describe('Plan 124 table date target verification', () => {
  it('fails a stale scheduled-date edit when the live row no longer identifies the target', async () => {
    const h = createEditorDateCoordinator(ROW);
    const replacement =
      '| TODO Different task<br>SCHEDULED: <2026-06-24 Wed> | keep |';
    h.setContent(replacement);

    const outcome = await h.coordinator.updateTask({
      task: h.task,
      type: 'scheduled-date',
      source: 'editor',
      newDate: new Date(2026, 5, 25),
    });

    expect(outcome).toEqual({
      status: 'failed',
      reason: 'Could not verify the task row before writing.',
    });
    expect(h.writer.updateTaskScheduledDate).not.toHaveBeenCalled();
    expect(h.content()).toBe(replacement);
    h.coordinator.destroy();
  });

  it('fails a stale date removal when the live row no longer identifies the target', async () => {
    const h = createEditorDateCoordinator(ROW);
    const replacement =
      '| TODO Different task<br>SCHEDULED: <2026-06-24 Wed> | keep |';
    h.setContent(replacement);

    const outcome = await h.coordinator.updateTask({
      task: h.task,
      type: 'scheduled-date',
      source: 'editor',
      newDate: null,
    });

    expect(outcome).toEqual({
      status: 'failed',
      reason: 'Could not verify the task row before writing.',
    });
    expect(h.writer.removeTaskScheduledDate).not.toHaveBeenCalled();
    expect(h.content()).toBe(replacement);
    h.coordinator.destroy();
  });

  it('fails a stale deadline-date edit when the live row no longer identifies the target', async () => {
    const row = '| TODO Table task<br>DEADLINE: <2026-06-24 Wed> | keep |';
    const h = createEditorDateCoordinator(row);
    const replacement =
      '| TODO Different task<br>DEADLINE: <2026-06-24 Wed> | keep |';
    h.setContent(replacement);

    const outcome = await h.coordinator.updateTask({
      task: h.task,
      type: 'deadline-date',
      source: 'editor',
      newDate: new Date(2026, 5, 25),
    });

    expect(outcome).toEqual({
      status: 'failed',
      reason: 'Could not verify the task row before writing.',
    });
    expect(h.writer.updateTaskDeadlineDate).not.toHaveBeenCalled();
    expect(h.content()).toBe(replacement);
    h.coordinator.destroy();
  });

  it('fails a stale deadline-date removal when the live row no longer identifies the target', async () => {
    const row = '| TODO Table task<br>DEADLINE: <2026-06-24 Wed> | keep |';
    const h = createEditorDateCoordinator(row);
    const replacement =
      '| TODO Different task<br>DEADLINE: <2026-06-24 Wed> | keep |';
    h.setContent(replacement);

    const outcome = await h.coordinator.updateTask({
      task: h.task,
      type: 'deadline-date',
      source: 'editor',
      newDate: null,
    });

    expect(outcome).toEqual({
      status: 'failed',
      reason: 'Could not verify the task row before writing.',
    });
    expect(h.writer.removeTaskDeadlineDate).not.toHaveBeenCalled();
    expect(h.content()).toBe(replacement);
    h.coordinator.destroy();
  });

  it('still relocates a unique table target moved away from the captured row', async () => {
    const h = createEditorDateCoordinator(ROW);
    h.setContent(
      [
        '| plain text | keep |',
        '| TODO Table task<br>SCHEDULED: <2026-06-24 Wed> | keep |',
      ].join('\n'),
    );

    const outcome = await h.coordinator.updateTask({
      task: h.task,
      type: 'scheduled-date',
      source: 'editor',
      newDate: new Date(2026, 5, 25),
    });

    expect(outcome).toEqual({ status: 'applied' });
    expect(h.writer.updateTaskScheduledDate).toHaveBeenCalledTimes(1);
    expect(h.writer.updateTaskScheduledDate.mock.calls[0][0]).toMatchObject({
      line: 1,
      tableCell: { cellIndex: 0 },
    });
    h.coordinator.destroy();
  });

  it('keeps the editor write path when live verification is unavailable', async () => {
    const h = createEditorDateCoordinator(ROW);
    h.poisonVerification();

    const outcome = await h.coordinator.updateTask({
      task: h.task,
      type: 'scheduled-date',
      source: 'editor',
      newDate: new Date(2026, 5, 25),
    });

    expect(outcome).toEqual({ status: 'applied' });
    expect(h.writer.updateTaskScheduledDate).toHaveBeenCalledTimes(1);
    h.coordinator.destroy();
  });

  it('refuses to replace a table date when the target cell was swapped before mutation', async () => {
    const h = createWriterHarness(ROW);
    const task = h.parser.parseFile(ROW, 'note.md', makeFile('note.md'))[0];
    const replacement =
      '| TODO Different task<br>SCHEDULED: <2026-06-24 Wed> | keep |';
    h.setContent(replacement);

    await expect(
      h.writer.updateTaskScheduledDate(task, new Date(2026, 5, 25)),
    ).rejects.toThrow('Task row changed before date update');
    expect(h.content()).toBe(replacement);
  });

  it('refuses to remove a table date when the target cell was swapped before mutation', async () => {
    const h = createWriterHarness(ROW);
    const task = h.parser.parseFile(ROW, 'note.md', makeFile('note.md'))[0];
    const replacement =
      '| TODO Different task<br>SCHEDULED: <2026-06-24 Wed> | keep |';
    h.setContent(replacement);

    await expect(h.writer.removeTaskScheduledDate(task)).rejects.toThrow(
      'Task row changed before date update',
    );
    expect(h.content()).toBe(replacement);
  });

  it('refuses a table date update when the replacement cell dropped the captured anchor', async () => {
    const anchored =
      '| TODO Repeat ^captured<br>SCHEDULED: <2026-06-24 Wed> | keep |';
    const h = createWriterHarness(anchored);
    const task = h.parser.parseFile(
      anchored,
      'note.md',
      makeFile('note.md'),
    )[0];
    expect(task.text).toBe('Repeat');
    const replacement = '| TODO Repeat<br>SCHEDULED: <2026-06-24 Wed> | keep |';
    h.setContent(replacement);

    await expect(
      h.writer.updateTaskScheduledDate(task, new Date(2026, 5, 25)),
    ).rejects.toThrow('Task row changed before date update');
    expect(h.content()).toBe(replacement);
  });

  it('refuses a table date update when the captured row is beyond the note', async () => {
    const source = [
      '| keep |',
      '| TODO Table task<br>SCHEDULED: <2026-06-24 Wed> | keep |',
    ].join('\n');
    const h = createWriterHarness(source);
    const task = h.parser
      .parseFile(source, 'note.md', makeFile('note.md'))
      .find((candidate) => candidate.line === 1)!;
    h.setContent('| keep |');

    await expect(
      h.writer.updateTaskScheduledDate(task, new Date(2026, 5, 25)),
    ).rejects.toThrow('Task row changed before date update');
    expect(h.content()).toBe('| keep |');
  });

  it('refuses a table recurrence rollover when the captured row is beyond the note', async () => {
    const source = [
      '| keep |',
      '| TODO Repeat<br>SCHEDULED: <2026-06-24 Wed +1d> | keep |',
    ].join('\n');
    const h = createWriterHarness(source);
    const task = h.parser
      .parseFile(source, 'note.md', makeFile('note.md'))
      .find((candidate) => candidate.line === 1)!;
    h.setContent('| keep |');

    await expect(
      h.writer.applyRecurrenceUpdate(task, {
        newScheduledDate: new Date(2026, 5, 25),
        newScheduledRepeat: task.scheduledDateRepeat,
        newState: 'TODO',
      }),
    ).rejects.toThrow('Task row changed before recurrence update');
    expect(h.content()).toBe('| keep |');
  });

  it('allows an unrelated cell edit before the date mutation', async () => {
    const h = createWriterHarness(ROW);
    const task = h.parser.parseFile(ROW, 'note.md', makeFile('note.md'))[0];
    h.setContent(
      '| TODO Table task<br>SCHEDULED: <2026-06-24 Wed> | changed elsewhere |',
    );

    await h.writer.updateTaskScheduledDate(task, new Date(2026, 5, 25));

    expect(h.content()).toContain('| changed elsewhere |');
    expect(h.content()).toContain('SCHEDULED: <2026-06-25 Thu>');
  });

  it('updates a table deadline when the target cell still matches', async () => {
    const row = '| TODO Table task<br>DEADLINE: <2026-06-24 Wed> | keep |';
    const h = createWriterHarness(row);
    const task = h.parser.parseFile(row, 'note.md', makeFile('note.md'))[0];
    h.setContent(
      '| TODO Table task<br>DEADLINE: <2026-06-24 Wed> | changed elsewhere |',
    );

    await h.writer.updateTaskDeadlineDate(task, new Date(2026, 5, 25));

    expect(h.content()).toBe(
      '| TODO Table task<br>DEADLINE: <2026-06-25 Thu> | changed elsewhere |',
    );
  });

  it('removes a table deadline when the target cell still matches', async () => {
    const row = '| TODO Table task<br>DEADLINE: <2026-06-24 Wed> | keep |';
    const h = createWriterHarness(row);
    const task = h.parser.parseFile(row, 'note.md', makeFile('note.md'))[0];
    h.setContent(
      '| TODO Table task<br>DEADLINE: <2026-06-24 Wed> | changed elsewhere |',
    );

    await h.writer.removeTaskDeadlineDate(task);

    expect(h.content()).toBe('| TODO Table task | changed elsewhere |');
  });
});

describe('Plan 124 table state and priority target verification', () => {
  const ANCHORED =
    '| TODO Repeat ^captured<br>SCHEDULED: <2026-06-24 Wed> | keep |';

  it('refuses a table state update when the target cell was swapped before mutation', async () => {
    const h = createWriterHarness(ROW);
    const task = h.parser.parseFile(ROW, 'note.md', makeFile('note.md'))[0];
    const replacement =
      '| TODO Different task<br>SCHEDULED: <2026-06-24 Wed> | keep |';
    h.setContent(replacement);

    await expect(h.writer.updateTaskState(task, 'DOING')).rejects.toThrow(
      'Task row changed before state update',
    );
    expect(h.content()).toBe(replacement);
  });

  it('refuses a table state update when the captured row vanished', async () => {
    const h = createWriterHarness(ROW);
    const task = h.parser.parseFile(ROW, 'note.md', makeFile('note.md'))[0];
    h.setContent('| keep |');

    await expect(h.writer.updateTaskState(task, 'DOING')).rejects.toThrow(
      'Task row changed before state update',
    );
    expect(h.content()).toBe('| keep |');
  });

  it('refuses a table priority update when the target cell was swapped before mutation', async () => {
    const h = createWriterHarness(ROW);
    const task = h.parser.parseFile(ROW, 'note.md', makeFile('note.md'))[0];
    const replacement =
      '| TODO Different task<br>SCHEDULED: <2026-06-24 Wed> | keep |';
    h.setContent(replacement);

    await expect(h.writer.updateTaskPriority(task, 'high')).rejects.toThrow(
      'Task row changed before priority update',
    );
    expect(h.content()).toBe(replacement);
  });

  it('refuses a table priority update when the captured row vanished', async () => {
    const h = createWriterHarness(ROW);
    const task = h.parser.parseFile(ROW, 'note.md', makeFile('note.md'))[0];
    h.setContent('| keep |');

    await expect(h.writer.updateTaskPriority(task, 'high')).rejects.toThrow(
      'Task row changed before priority update',
    );
    expect(h.content()).toBe('| keep |');
  });

  it('keeps a captured anchor when setting priority in a table cell', async () => {
    const h = createWriterHarness(ANCHORED);
    const task = h.parser.parseFile(
      ANCHORED,
      'note.md',
      makeFile('note.md'),
    )[0];

    await h.writer.updateTaskPriority(task, 'high');

    expect(h.content()).toBe(
      '| TODO [#A] Repeat ^captured<br>SCHEDULED: <2026-06-24 Wed> | keep |',
    );
  });

  it('keeps a captured anchor across consecutive table state writes', async () => {
    const h = createWriterHarness(ANCHORED);
    const task = h.parser.parseFile(
      ANCHORED,
      'note.md',
      makeFile('note.md'),
    )[0];

    const first = await h.writer.updateTaskState(task, 'DOING');
    expect(first.rawText).toContain('<br>');
    await h.writer.updateTaskState(first, 'LATER');

    expect(h.content()).toBe(
      '| LATER Repeat ^captured<br>SCHEDULED: <2026-06-24 Wed> | keep |',
    );
  });

  it('still applies a date after a state write when the anchor is intact', async () => {
    const h = createWriterHarness(ANCHORED);
    const task = h.parser.parseFile(
      ANCHORED,
      'note.md',
      makeFile('note.md'),
    )[0];
    const stateWritten = await h.writer.updateTaskState(task, 'DOING');

    await h.writer.updateTaskScheduledDate(stateWritten, new Date(2026, 5, 25));

    expect(h.content()).toBe(
      '| DOING Repeat ^captured<br>SCHEDULED: <2026-06-25 Thu> | keep |',
    );
  });

  it('refuses a date after a state write when the replacement cell dropped the captured anchor', async () => {
    const h = createWriterHarness(ANCHORED);
    const task = h.parser.parseFile(
      ANCHORED,
      'note.md',
      makeFile('note.md'),
    )[0];
    const stateWritten = await h.writer.updateTaskState(task, 'DOING');
    // rawText now ends with the <br> date metadata, not the task anchor.
    expect(stateWritten.rawText).toContain('<br>');
    const replacement =
      '| DOING Repeat<br>SCHEDULED: <2026-06-24 Wed> | keep |';
    h.setContent(replacement);

    await expect(
      h.writer.updateTaskScheduledDate(stateWritten, new Date(2026, 5, 25)),
    ).rejects.toThrow('Task row changed before date update');
    expect(h.content()).toBe(replacement);
  });
});

function drawerSource(id: string, blanks = 65): string {
  return [
    '- [ ] TODO Repeat',
    '  SCHEDULED: <2026-06-24 Wed +1d>',
    ...Array.from({ length: blanks }, () => ''),
    '  :PROPERTIES:',
    `  :ID: ${id}`,
    '  :END:',
    '- [ ] TODO Sibling',
  ].join('\n');
}

describe('Plan 124 recurrence drawer ownership parity', () => {
  it('attaches and preserves an owned ID drawer beyond the old 60-line limit', async () => {
    const source = drawerSource('original-id');
    const h = createWriterHarness(source);
    const task = h.parser.parseFile(source, 'note.md', makeFile('note.md'))[0];

    expect(task.id).toBe('original-id');

    await h.writer.applyRecurrenceUpdate(task, {
      newScheduledDate: new Date(2026, 5, 25),
      newScheduledRepeat: task.scheduledDateRepeat,
      newState: 'TODO',
    });

    expect(h.content()).toBe(
      source.replace(
        'SCHEDULED: <2026-06-24 Wed +1d>',
        'SCHEDULED: <2026-06-25 Thu +1d>',
      ),
    );
  });

  it('still rejects a conflicting ID drawer beyond the old limit without writing', async () => {
    const original = drawerSource('original-id');
    const h = createWriterHarness(drawerSource('other-id'));
    const task = h.parser.parseFile(
      original,
      'note.md',
      makeFile('note.md'),
    )[0];

    await expect(
      h.writer.applyRecurrenceUpdate(task, {
        newScheduledDate: new Date(2026, 5, 25),
        newScheduledRepeat: task.scheduledDateRepeat,
        newState: 'TODO',
      }),
    ).rejects.toThrow('Task row changed before recurrence update');
    expect(h.content()).toBe(drawerSource('other-id'));
  });

  it('stops ownership at a real block boundary instead of scanning across it', async () => {
    const source = [
      '- [ ] TODO Repeat',
      '  SCHEDULED: <2026-06-24 Wed +1d>',
      '',
      'Paragraph outside the task block',
      ':PROPERTIES:',
      ':ID: outside-id',
      ':END:',
      '- [ ] TODO Sibling',
    ].join('\n');
    const h = createWriterHarness(source);
    const task = h.parser.parseFile(source, 'note.md', makeFile('note.md'))[0];

    expect(task.id).toBeUndefined();
    expect(task.scheduledDate).toEqual(new Date(2026, 5, 24));

    await h.writer.applyRecurrenceUpdate(task, {
      newScheduledDate: new Date(2026, 5, 25),
      newScheduledRepeat: task.scheduledDateRepeat,
      newState: 'TODO',
    });

    expect(h.content()).toBe(
      source.replace(
        'SCHEDULED: <2026-06-24 Wed +1d>',
        'SCHEDULED: <2026-06-25 Thu +1d>',
      ),
    );
  });

  it('stops ownership at indented quoted metadata the parser does not own', async () => {
    const original = [
      '- [ ] TODO Repeat',
      '  SCHEDULED: <2026-06-24 Wed +1d>',
      '  :PROPERTIES:',
      '  :ID: original-id',
      '  :END:',
    ].join('\n');
    const replacement = [
      '- [ ] TODO Repeat',
      '  SCHEDULED: <2026-06-24 Wed +1d>',
      '  > DESCRIPTION: separated',
      '  :PROPERTIES:',
      '  :ID: original-id',
      '  :END:',
    ].join('\n');
    const task = createWriterHarness(original).parser.parseFile(
      original,
      'note.md',
      makeFile('note.md'),
    )[0];
    expect(task.id).toBe('original-id');

    const h = createWriterHarness(replacement);
    expect(
      h.parser.parseFile(replacement, 'note.md', makeFile('note.md'))[0].id,
    ).toBeUndefined();

    await expect(
      h.writer.applyRecurrenceUpdate(task, {
        newScheduledDate: new Date(2026, 5, 25),
        newScheduledRepeat: task.scheduledDateRepeat,
        newState: 'TODO',
      }),
    ).rejects.toThrow('Task row changed before recurrence update');
    expect(h.content()).toBe(replacement);
  });

  it('keeps ownership through a nested-quoted description', async () => {
    const source = [
      '> TODO Repeat',
      '> SCHEDULED: <2026-06-24 Wed +1d>',
      '> > DESCRIPTION: separated',
      '> :PROPERTIES:',
      '> :ID: original-id',
      '> :END:',
    ].join('\n');
    const h = createWriterHarness(source);
    const task = h.parser.parseFile(source, 'note.md', makeFile('note.md'))[0];

    expect(task.id).toBe('original-id');
    expect(task.description).toBe('separated');

    await h.writer.applyRecurrenceUpdate(task, {
      newScheduledDate: new Date(2026, 5, 25),
      newScheduledRepeat: task.scheduledDateRepeat,
      newState: 'TODO',
    });

    expect(h.content()).toBe(
      source.replace(
        'SCHEDULED: <2026-06-24 Wed +1d>',
        'SCHEDULED: <2026-06-25 Thu +1d>',
      ),
    );
  });

  it('keeps ownership of an unindented description under an indented task', async () => {
    const source = [
      '  - [ ] TODO Repeat',
      '  SCHEDULED: <2026-06-24 Wed +1d>',
      'DESCRIPTION: separated',
      '  :PROPERTIES:',
      '  :ID: original-id',
      '  :END:',
    ].join('\n');
    const h = createWriterHarness(source);
    const task = h.parser.parseFile(source, 'note.md', makeFile('note.md'))[0];

    expect(task.id).toBe('original-id');
    expect(task.description).toBe('separated');

    await h.writer.applyRecurrenceUpdate(task, {
      newScheduledDate: new Date(2026, 5, 25),
      newScheduledRepeat: task.scheduledDateRepeat,
      newState: 'TODO',
    });

    expect(h.content()).toBe(
      source.replace(
        'SCHEDULED: <2026-06-24 Wed +1d>',
        'SCHEDULED: <2026-06-25 Thu +1d>',
      ),
    );
  });

  it('advances a parser-owned quoted date line under an unquoted task', async () => {
    // getDateLineType owns any single-quoted date line, whatever the task's
    // own quote level; the rollover must edit that line, not add a second one.
    const source = 'TODO Repeat\n> SCHEDULED: <2026-06-24 Wed +1d>';
    const h = createWriterHarness(source);
    const task = h.parser.parseFile(source, 'note.md', makeFile('note.md'))[0];

    expect(task.scheduledDate).toEqual(new Date(2026, 5, 24));

    await h.writer.applyRecurrenceUpdate(task, {
      newScheduledDate: new Date(2026, 5, 25),
      newScheduledRepeat: task.scheduledDateRepeat,
      newState: 'TODO',
      expectedRecurrence: {
        scheduledDate: task.scheduledDate,
        scheduledDateRepeat: task.scheduledDateRepeat,
        scheduledWarningPeriod: task.scheduledWarningPeriod,
      },
    });

    expect(h.content()).toBe('TODO Repeat\n> SCHEDULED: <2026-06-25 Thu +1d>');
  });

  it('advances a quoted date line under a double-quoted task', async () => {
    const source = '> > TODO Repeat\n> SCHEDULED: <2026-06-24 Wed +1d>';
    const h = createWriterHarness(source);
    const task = h.parser.parseFile(source, 'note.md', makeFile('note.md'))[0];

    expect(task.scheduledDate).toEqual(new Date(2026, 5, 24));

    await h.writer.applyRecurrenceUpdate(task, {
      newScheduledDate: new Date(2026, 5, 25),
      newScheduledRepeat: task.scheduledDateRepeat,
      newState: 'TODO',
      expectedRecurrence: {
        scheduledDate: task.scheduledDate,
        scheduledDateRepeat: task.scheduledDateRepeat,
        scheduledWarningPeriod: task.scheduledWarningPeriod,
      },
    });

    expect(h.content()).toBe(
      '> > TODO Repeat\n> SCHEDULED: <2026-06-25 Thu +1d>',
    );
  });

  it('keeps an Org drawer reachable past a line with an inline planning token', async () => {
    // The Org parser reads a first SCHEDULED/DEADLINE timestamp anywhere in a
    // line and only starts body text on lines it cannot classify, so a drawer
    // below such a note line still attaches as the entry's identity.
    const source = [
      '* TODO Repeat',
      'Note: see SCHEDULED: <2026-06-24 Wed +1d> for context',
      '  :PROPERTIES:',
      '  :ID: inline-note-id',
      '  :END:',
    ].join('\n');
    const h = createOrgWriterHarness(source);
    const task = h.parser.parseFile(source, 'note.org', h.file)[0];

    expect(task.id).toBe('inline-note-id');
    expect(task.scheduledDate).toEqual(new Date(2026, 5, 24));

    await h.writer.applyRecurrenceUpdate(task, {
      newScheduledDate: new Date(2026, 5, 25),
      newScheduledRepeat: task.scheduledDateRepeat,
      newState: 'TODO',
      expectedRecurrence: {
        scheduledDate: task.scheduledDate,
        scheduledDateRepeat: task.scheduledDateRepeat,
        scheduledWarningPeriod: task.scheduledWarningPeriod,
      },
    });

    expect(h.content()).toBe(
      source.replace(
        'SCHEDULED: <2026-06-24 Wed +1d>',
        'SCHEDULED: <2026-06-25 Thu +1d>',
      ),
    );
  });

  it('does not take an Org drawer below body text as the entry identity', async () => {
    // Org has no DESCRIPTION line: the Org parser stops attaching properties
    // once body text appears, so this drawer is not the entry's identity.
    const source = [
      '* TODO Repeat',
      '  SCHEDULED: <2026-06-24 Wed +1d>',
      '  DESCRIPTION: note',
      '  :PROPERTIES:',
      '  :ID: original-id',
      '  :END:',
    ].join('\n');
    const h = createOrgWriterHarness(source);
    const task = h.parser.parseFile(source, 'note.org', h.file)[0];

    expect(task.id).toBeUndefined();

    await h.writer.applyRecurrenceUpdate(task, {
      newScheduledDate: new Date(2026, 5, 25),
      newScheduledRepeat: task.scheduledDateRepeat,
      newState: 'TODO',
    });

    expect(h.content()).toBe(
      source.replace(
        'SCHEDULED: <2026-06-24 Wed +1d>',
        'SCHEDULED: <2026-06-25 Thu +1d>',
      ),
    );
  });
});
