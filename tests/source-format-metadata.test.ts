/**
 * @jest-environment jsdom
 */

import { TFile } from 'obsidian';
import { TaskWriter } from '../src/services/task-writer';
import { OrgModeTaskParser } from '../src/parser/org-mode-task-parser';
import { Task } from '../src/types/task';
import {
  createBaseSettings,
  createBaseTask,
  createTestKeywordManager,
} from './helpers/test-helper';

class MockFile extends TFile {
  constructor() {
    super('note.js', 'note.js', 'js');
  }
}

interface WriterHarness {
  writer: TaskWriter;
  content: () => string;
  setContent: (value: string) => void;
  process: jest.Mock;
}

function createHarness(): WriterHarness {
  const settings = createBaseSettings({
    trackClosedDate: true,
    trackStartedDate: true,
  });
  const keywordManager = createTestKeywordManager(settings);
  let buffer = '';
  const process = jest.fn(
    async (_file: unknown, callback: (data: string) => string) => {
      buffer = callback(buffer);
      return buffer;
    },
  );
  const file = new MockFile();
  const plugin = {
    app: {
      workspace: { getActiveViewOfType: () => null },
      vault: {
        getAbstractFileByPath: () => file,
        process,
      },
    },
    settings,
  };
  return {
    writer: new TaskWriter(plugin as never, keywordManager),
    content: () => buffer,
    setContent: (value: string) => {
      buffer = value;
    },
    process,
  };
}

function codeTask(rawText: string, text: string): Task {
  return createBaseTask({
    path: 'note.js',
    line: 0,
    rawText,
    indent: 'const x = 1; // ',
    text,
    state: 'TODO',
    sourceFormat: 'code-comment',
  });
}

describe('code capabilities', () => {
  it('does not add CLOSED or STARTED metadata to a code comment', async () => {
    const h = createHarness();
    const raw = 'const x = 1; // TODO: follow up';
    h.setContent(raw);
    const task = codeTask(raw, 'follow up');

    const updated = await h.writer.applyLineUpdate(task, 'DONE');

    expect(h.content()).toBe('const x = 1; // DONE follow up');
    expect(updated.closedDate).toBeNull();
    expect(updated.startedDate).toBeNull();
  });

  it('does not add STARTED when a code task enters an active state', async () => {
    const h = createHarness();
    const raw = 'const x = 1; // TODO: follow up';
    h.setContent(raw);
    const task = codeTask(raw, 'follow up');

    await h.writer.applyLineUpdate(task, 'DOING');

    expect(h.content()).toBe('const x = 1; // DOING follow up');
    expect(h.content().split('\n')).toHaveLength(1);
  });

  it('no-ops direct date writes for code tasks', async () => {
    const h = createHarness();
    const task = codeTask('const x = 1; // TODO: follow up', 'follow up');
    const date = new Date(2026, 0, 5);

    const scheduled = await h.writer.updateTaskScheduledDate(task, date);
    const deadline = await h.writer.updateTaskDeadlineDate(task, date);
    const started = await h.writer.updateTaskStartedDate(task, date);
    const closed = await h.writer.updateTaskClosedDate(task, date);

    expect(scheduled.scheduledDate).toBeNull();
    expect(deadline.deadlineDate).toBeNull();
    expect(started.task.startedDate).toBeNull();
    expect(closed.task.closedDate).toBeNull();
    expect(h.process).not.toHaveBeenCalled();
  });
});

describe('org history', () => {
  it('parses CLOSED and STARTED below planning dates and tags the format', () => {
    const settings = createBaseSettings();
    const keywordManager = createTestKeywordManager(settings);
    const parser = OrgModeTaskParser.create(keywordManager, undefined as never);
    const content = [
      '* TODO write report',
      '  SCHEDULED: <2026-01-01 Thu>',
      '  CLOSED: [2026-01-02 Fri]',
      '  STARTED: [2025-12-31 Wed]',
    ].join('\n');

    const tasks = parser.parseFile(content, 'note.org');

    expect(tasks).toHaveLength(1);
    expect(tasks[0].sourceFormat).toBe('org');
    expect(tasks[0].scheduledDate?.getFullYear()).toBe(2026);
    expect(tasks[0].closedDate?.getFullYear()).toBe(2026);
    expect(tasks[0].startedDate?.getFullYear()).toBe(2025);
  });

  it('writes new org metadata as an indented line, never a headline', async () => {
    const h = createHarness();
    h.setContent('* TODO write report');
    const task = createBaseTask({
      path: 'note.js',
      line: 0,
      rawText: '* TODO write report',
      indent: '*',
      text: 'write report',
      state: 'TODO',
      sourceFormat: 'org',
    });

    await h.writer.updateTaskClosedDate(task, new Date(2026, 0, 2), true);

    const lines = h.content().split('\n');
    expect(lines).toHaveLength(2);
    expect(lines[1].startsWith('*')).toBe(false);
    expect(lines[1]).toMatch(/^ {2}CLOSED: /);
  });
});
