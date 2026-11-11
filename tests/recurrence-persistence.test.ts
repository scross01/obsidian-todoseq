/**
 * End-to-end recurrence persistence: real TaskParser, RecurrenceCoordinator,
 * TaskUpdateCoordinator and TaskWriter sharing an in-memory vault.
 *
 * Completing a task that has one repeating date must keep its other,
 * non-repeating date in the file, and a first-only warning period must
 * disappear from the written date line — not just from the returned
 * snapshot. The coordinator must forward "unchanged" as undefined so the
 * writer cannot mistake it for "delete".
 */

import { RecurrenceCoordinator } from '../src/services/recurrence-coordinator';
import { TaskUpdateCoordinator } from '../src/services/task-update-coordinator';
import { TaskWriter } from '../src/services/task-writer';
import { TaskStateManager } from '../src/services/task-state-manager';
import { TaskParser } from '../src/parser/task-parser';
import { TFile } from 'obsidian';
import { KeywordManager } from '../src/utils/keyword-manager';
import {
  createBaseSettings,
  createTestKeywordManager,
} from './helpers/test-helper';

// The coordinator's embed refresh reads window.activeDocument.
(global as any).document = {
  querySelectorAll: jest.fn(() => []),
};
(global as any).window = {
  ...((global as any).window ?? {}),
  activeDocument: {
    querySelectorAll: jest.fn(() => []),
  },
};

function createMockFile(path: string): TFile {
  return Object.assign(new TFile(), {
    path,
    name: path,
    basename: 'test',
    extension: 'md',
    stat: {},
  });
}

describe('recurrence persistence (real write path)', () => {
  let content: string;
  let mockApp: any;
  let mockPlugin: any;
  let taskStateManager: TaskStateManager;
  let taskWriter: TaskWriter;
  let taskUpdateCoordinator: TaskUpdateCoordinator;
  let recurrenceCoordinator: RecurrenceCoordinator;
  let taskParser: TaskParser;
  let keywordManager: KeywordManager;
  const file = createMockFile('test.md');

  beforeEach(() => {
    jest.useFakeTimers();

    const settings = createBaseSettings();
    keywordManager = createTestKeywordManager(settings);
    taskStateManager = new TaskStateManager(keywordManager);

    mockApp = {
      vault: {
        getAbstractFileByPath: jest.fn(() => file),
        read: jest.fn(async () => content),
        process: jest.fn(async (_file: TFile, fn: (data: string) => string) => {
          content = fn(content);
          return content;
        }),
        getConfig: jest.fn(() => undefined),
      },
      workspace: {
        getActiveViewOfType: jest.fn(() => null),
        getLeavesOfType: jest.fn(() => []),
      },
      // RecurrenceCoordinator resolves the parser through the plugin registry.
      plugins: {
        getPlugin: jest.fn(() => mockPlugin),
      },
    };

    mockPlugin = {
      app: mockApp,
      settings,
      keywordManager,
      taskStateManager,
      isUserInitiatedUpdate: false,
      refreshVisibleEditorDecorations: jest.fn(),
      embeddedTaskListProcessor: { refreshAllEmbeddedTaskLists: jest.fn() },
    };

    taskParser = TaskParser.create(keywordManager, mockApp, undefined, {
      includeCalloutBlocks: settings.includeCalloutBlocks,
      includeCodeBlocks: settings.includeCodeBlocks,
      includeCommentBlocks: settings.includeCommentBlocks,
      languageCommentSupport: settings.languageCommentSupport,
    });

    mockPlugin.vaultScanner = {
      getParser: () => taskParser,
      addSkipIncrementalChange: jest.fn(),
      processIncrementalChange: jest.fn(async () => undefined),
    };

    taskWriter = new TaskWriter(mockPlugin, keywordManager);
    mockPlugin.taskEditor = taskWriter;

    taskUpdateCoordinator = new TaskUpdateCoordinator(
      mockPlugin,
      taskStateManager,
      keywordManager,
    );
    recurrenceCoordinator = new RecurrenceCoordinator(
      mockPlugin,
      taskStateManager,
      keywordManager,
    );
    recurrenceCoordinator.setTaskUpdateCoordinator(taskUpdateCoordinator);
  });

  afterEach(() => {
    taskUpdateCoordinator.destroy();
    jest.useRealTimers();
  });

  const parsedTask = (): ReturnType<TaskParser['parseFile']>[number] => {
    const tasks = taskParser.parseFile(content, 'test.md', file);
    taskStateManager.setTasks(tasks);
    const task = tasks[0];
    if (!task) throw new Error('fixture did not parse a task');
    return task;
  };

  it('keeps the one-off deadline when only SCHEDULED repeats', async () => {
    content = [
      'DONE Weekly review',
      'SCHEDULED: <2026-03-10 Tue +1w>',
      'DEADLINE: <2026-03-15 Sun>',
    ].join('\n');
    const task = parsedTask();
    expect(task.scheduledDateRepeat).not.toBeNull();
    expect(task.deadlineDateRepeat).toBeNull();

    const result = await recurrenceCoordinator.performRecurrenceUpdate(task);

    expect(result.success).toBe(true);
    expect(content).toContain('DEADLINE: <2026-03-15 Sun>');
    expect(content.match(/DEADLINE:/g)).toHaveLength(1);
    expect(content.match(/SCHEDULED:/g)).toHaveLength(1);
    // The old scheduled date was advanced, not duplicated.
    expect(content).not.toContain('2026-03-10');
    const reparsed = taskParser.parseFile(content, 'test.md', file)[0];
    expect(reparsed.deadlineDate).toEqual(task.deadlineDate);
    expect(reparsed.scheduledDate).not.toBeNull();
  });

  it('keeps the one-off scheduled date when only DEADLINE repeats', async () => {
    content = [
      'DONE Send invoice',
      'SCHEDULED: <2026-03-10 Tue>',
      'DEADLINE: <2026-03-12 Thu +1w>',
    ].join('\n');
    const task = parsedTask();
    expect(task.scheduledDateRepeat).toBeNull();
    expect(task.deadlineDateRepeat).not.toBeNull();

    const result = await recurrenceCoordinator.performRecurrenceUpdate(task);

    expect(result.success).toBe(true);
    expect(content).toContain('SCHEDULED: <2026-03-10 Tue>');
    expect(content.match(/SCHEDULED:/g)).toHaveLength(1);
    expect(content).not.toContain('2026-03-12');
    const reparsed = taskParser.parseFile(content, 'test.md', file)[0];
    expect(reparsed.scheduledDate).toEqual(task.scheduledDate);
  });

  it('removes a first-only --Nd warning period from the written line', async () => {
    content = ['DONE Water plants', 'DEADLINE: <2026-06-24 Wed +1d --3d>'].join(
      '\n',
    );
    const task = parsedTask();
    expect(task.deadlineWarningPeriod?.isFirstOnly).toBe(true);

    const result = await recurrenceCoordinator.performRecurrenceUpdate(task);

    expect(result.success).toBe(true);
    expect(content).not.toContain('--3d');
    expect(content.match(/DEADLINE:/g)).toHaveLength(1);
    const reparsed = taskParser.parseFile(content, 'test.md', file)[0];
    expect(reparsed.deadlineWarningPeriod).toBeNull();
  });

  it('keeps a regular -Nd warning period in the written line', async () => {
    content = ['DONE Pay rent', 'DEADLINE: <2026-06-24 Wed +1m -3d>'].join(
      '\n',
    );
    const task = parsedTask();
    expect(task.deadlineWarningPeriod?.isFirstOnly).toBe(false);

    const result = await recurrenceCoordinator.performRecurrenceUpdate(task);

    expect(result.success).toBe(true);
    expect(content).toContain('-3d');
    const reparsed = taskParser.parseFile(content, 'test.md', file)[0];
    expect(reparsed.deadlineWarningPeriod).toEqual({
      value: 3,
      unit: 'd',
      isFirstOnly: false,
    });
  });
});
