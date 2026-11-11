/**
 * @jest-environment jsdom
 */

import { EditorState } from '@codemirror/state';
import type { TransactionSpec } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import { TaskWriter } from '../src/services/task-writer';
import { Task } from '../src/types/task';
import {
  createBaseSettings,
  createBaseTask,
  createTestKeywordManager,
} from './helpers/test-helper';

interface EditorHarness {
  view: EditorView;
  dispatches: TransactionSpec[];
  text: () => string;
  selection: () => number;
}

function createEditor(doc: string): EditorHarness {
  let state = EditorState.create({ doc });
  const dispatches: TransactionSpec[] = [];
  const view = {
    get state() {
      return state;
    },
    dispatch(spec: TransactionSpec) {
      dispatches.push(spec);
      state = state.update(spec).state;
    },
  } as unknown as EditorView;
  return {
    view,
    dispatches,
    text: () => state.doc.toString(),
    selection: () => state.selection.main.head,
  };
}

function createWriter(path = 'note.md'): TaskWriter {
  const mdView = { file: { path } };
  const settings = createBaseSettings();
  return new TaskWriter(
    {
      app: {
        workspace: { getActiveViewOfType: () => mdView },
      },
      settings,
    } as never,
    createTestKeywordManager(settings),
  );
}

function task(rawText = 'TODO report due tomorrow'): Task {
  return createBaseTask({
    path: 'note.md',
    line: 0,
    rawText,
    indent: '',
    text: 'report due tomorrow',
  });
}

describe('TaskWriter.applySmartDateEdit', () => {
  it('replaces one date line and preserves the other metadata between them', () => {
    const editor = createEditor(
      [
        'TODO report due tomorrow',
        'SCHEDULED: <2026-01-01 Thu>',
        'STARTED: [2026-01-02 Fri]',
        'DEADLINE: <2026-01-03 Sat>',
      ].join('\n'),
    );
    const writer = createWriter();

    const applied = writer.applySmartDateEdit(
      {
        filePath: 'note.md',
        lineNumber: 1,
        expectedTaskText: 'TODO report due tomorrow',
        updatedTaskText: 'TODO report',
        dateLines: [{ type: 'DEADLINE', dateText: '<2026-02-02 Mon>' }],
        replaceLineNumber: 4,
        triggerSource: 'cursorLeave',
      },
      task(),
      editor.view,
    );

    expect(applied).toBe(true);
    expect(editor.text().split('\n')).toEqual([
      'TODO report',
      'SCHEDULED: <2026-01-01 Thu>',
      'STARTED: [2026-01-02 Fri]',
      'DEADLINE: <2026-02-02 Mon>',
    ]);
    expect(editor.dispatches).toHaveLength(1);
    const changes = editor.dispatches[0].changes;
    expect(Array.isArray(changes)).toBe(true);
    expect(changes as unknown[]).toHaveLength(2);
  });

  it('inserts a new date line below the task without touching later metadata', () => {
    const editor = createEditor(
      ['TODO report due tomorrow', 'STARTED: [2026-01-02 Fri]'].join('\n'),
    );
    const writer = createWriter();

    const applied = writer.applySmartDateEdit(
      {
        filePath: 'note.md',
        lineNumber: 1,
        expectedTaskText: 'TODO report due tomorrow',
        updatedTaskText: 'TODO report',
        dateLines: [{ type: 'DEADLINE', dateText: '<2026-02-02 Mon>' }],
        replaceLineNumber: null,
        triggerSource: 'cursorLeave',
      },
      task(),
      editor.view,
    );

    expect(applied).toBe(true);
    expect(editor.text().split('\n')).toEqual([
      'TODO report',
      'DEADLINE: <2026-02-02 Mon>',
      'STARTED: [2026-01-02 Fri]',
    ]);
  });

  it('puts the debounce cursor at the end of the written date line', () => {
    const editor = createEditor(
      ['TODO report due tomorrow', 'SCHEDULED: <2026-01-01 Thu>'].join('\n'),
    );
    const writer = createWriter();
    const dateLine = 'DEADLINE: <2026-02-02 Mon>';

    writer.applySmartDateEdit(
      {
        filePath: 'note.md',
        lineNumber: 1,
        expectedTaskText: 'TODO report due tomorrow',
        updatedTaskText: 'TODO report',
        dateLines: [{ type: 'DEADLINE', dateText: '<2026-02-02 Mon>' }],
        replaceLineNumber: 2,
        triggerSource: 'debounce',
      },
      task(),
      editor.view,
    );

    const text = editor.text();
    expect(text.endsWith(dateLine)).toBe(true);
    expect(editor.selection()).toBe(
      text.lastIndexOf(dateLine) + dateLine.length,
    );
  });

  it('uses the task list-marker indent for the new date line', () => {
    const editor = createEditor('- [ ] TODO report due tomorrow');
    const writer = createWriter();
    const listTask = createBaseTask({
      path: 'note.md',
      line: 0,
      rawText: '- [ ] TODO report due tomorrow',
      indent: '',
      listMarker: '- ',
      text: 'report due tomorrow',
    });

    writer.applySmartDateEdit(
      {
        filePath: 'note.md',
        lineNumber: 1,
        expectedTaskText: '- [ ] TODO report due tomorrow',
        updatedTaskText: '- [ ] TODO report',
        dateLines: [{ type: 'SCHEDULED', dateText: '<2026-02-02 Mon>' }],
        replaceLineNumber: null,
        triggerSource: 'cursorLeave',
      },
      listTask,
      editor.view,
    );

    expect(editor.text().split('\n')[1]).toBe('  SCHEDULED: <2026-02-02 Mon>');
  });

  it('refuses a stale task line and dispatches nothing', () => {
    const editor = createEditor('TODO changed in the meantime');
    const writer = createWriter();

    const applied = writer.applySmartDateEdit(
      {
        filePath: 'note.md',
        lineNumber: 1,
        expectedTaskText: 'TODO report due tomorrow',
        updatedTaskText: 'TODO report',
        dateLines: [{ type: 'DEADLINE', dateText: '<2026-02-02 Mon>' }],
        replaceLineNumber: null,
        triggerSource: 'cursorLeave',
      },
      task(),
      editor.view,
    );

    expect(applied).toBe(false);
    expect(editor.dispatches).toHaveLength(0);
    expect(editor.text()).toBe('TODO changed in the meantime');
  });
});
