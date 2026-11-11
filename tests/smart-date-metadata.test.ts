/**
 * @jest-environment jsdom
 */

import { EditorState } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import { SmartDateProcessor } from '../src/services/smart-date-processor';
import { TaskWriter } from '../src/services/task-writer';
import { formatOrgDate } from '../src/utils/task-format';
import { Task } from '../src/types/task';
import {
  createBaseSettings,
  createBaseTask,
  createTestKeywordManager,
} from './helpers/test-helper';

interface Harness {
  editorView: EditorView;
  processor: SmartDateProcessor;
  text: () => string;
}

function createEditor(doc: string): {
  view: EditorView;
  text: () => string;
  state: () => ReturnType<typeof EditorState.create>;
} {
  let state = EditorState.create({ doc });
  const view = {
    get state() {
      return state;
    },
    dispatch(spec: Parameters<typeof state.update>[0]) {
      state = state.update(spec).state;
    },
  } as unknown as EditorView;
  return { view, text: () => state.doc.toString(), state: () => state };
}

function createHarness(doc: string, task: Task): Harness {
  const editor = createEditor(doc);
  const mdView = {
    file: { path: 'note.md' },
    editor: { cm: editor.view },
    getViewType: () => 'markdown',
    getMode: () => 'source',
  };
  const settings = createBaseSettings({
    enableSmartDateRecognition: true,
    smartDateRemoveKeywords: true,
    trackStartedDate: true,
  });
  const keywordManager = createTestKeywordManager(settings);
  const writer = new TaskWriter(
    {
      app: { workspace: { getActiveViewOfType: () => mdView } },
      settings,
    } as never,
    keywordManager,
  );
  const parser = {
    isTaskLine: (line: string) => /\b(TODO|DOING|DONE)\b/.test(line),
    getDateLineType: () => null,
    parseLineAsTask: () => task,
  };
  const processor = new SmartDateProcessor({
    app: { workspace: { getActiveViewOfType: () => mdView } },
    settings,
    keywordManager,
    taskEditor: writer,
    getVaultScanner: () => ({ getParser: () => parser }),
  } as never);
  return { editorView: editor.view, processor, text: editor.text };
}

async function processTaskLine(h: Harness, text: string): Promise<void> {
  const bound = h.processor as unknown as {
    processLine: (
      filePath: string,
      lineNumber: number,
      lineText: string,
      view: EditorView,
      skipCursorCheck: boolean,
      forceReprocess: boolean,
      triggerSource: 'debounce' | 'cursorLeave',
    ) => Promise<void>;
  };
  await bound.processLine(
    'note.md',
    1,
    text,
    h.editorView,
    true,
    true,
    'cursorLeave',
  );
}

function tomorrowString(): string {
  const now = new Date();
  const tomorrow = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + 1,
  );
  return formatOrgDate(tomorrow);
}

describe('smart dates preserve metadata', () => {
  beforeEach(() => {
    window.requestAnimationFrame = jest.fn((callback: FrameRequestCallback) => {
      callback(0);
      return 0;
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('keeps SCHEDULED and STARTED when a new DEADLINE replaces an old one', async () => {
    const taskText = 'TODO report due tomorrow';
    const task = createBaseTask({
      path: 'note.md',
      line: 0,
      rawText: taskText,
      text: 'report due tomorrow',
    });
    const h = createHarness(
      [
        taskText,
        'SCHEDULED: <2026-01-01 Thu>',
        'STARTED: [2026-01-02 Fri]',
        'DEADLINE: <2026-01-03 Sat>',
      ].join('\n'),
      task,
    );

    await processTaskLine(h, taskText);

    expect(h.text().split('\n')).toEqual([
      'TODO report',
      'SCHEDULED: <2026-01-01 Thu>',
      'STARTED: [2026-01-02 Fri]',
      `DEADLINE: ${tomorrowString()}`,
    ]);
  });

  it('finds a date below STARTED and updates it instead of adding a duplicate', async () => {
    const taskText = 'TODO report due tomorrow';
    const task = createBaseTask({
      path: 'note.md',
      line: 0,
      rawText: taskText,
      text: 'report due tomorrow',
    });
    const h = createHarness(
      [
        taskText,
        'STARTED: [2026-01-02 Fri]',
        'SCHEDULED: <2026-01-01 Thu>',
      ].join('\n'),
      task,
    );

    await processTaskLine(h, taskText);

    const lines = h.text().split('\n');
    expect(lines).toHaveLength(3);
    expect(lines[1]).toBe('STARTED: [2026-01-02 Fri]');
    expect(lines[2]).toBe(`DEADLINE: ${tomorrowString()}`);
    expect(lines.filter((line) => line.startsWith('SCHEDULED:'))).toHaveLength(
      0,
    );
  });

  it('moves inline structured dates below the task and keeps later metadata', async () => {
    const taskText =
      'TODO report SCHEDULED: <2026-01-01 Thu> DEADLINE: <2026-01-02 Fri>';
    const task = createBaseTask({
      path: 'note.md',
      line: 0,
      rawText: taskText,
      text: 'report',
    });
    const h = createHarness(
      [taskText, 'STARTED: [2026-01-02 Fri]'].join('\n'),
      task,
    );

    await processTaskLine(h, taskText);

    expect(h.text().split('\n')).toEqual([
      'TODO report',
      'SCHEDULED: <2026-01-01 Thu>',
      'DEADLINE: <2026-01-02 Fri>',
      'STARTED: [2026-01-02 Fri]',
    ]);
  });
});
