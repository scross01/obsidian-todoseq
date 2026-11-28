import { TFile } from 'obsidian';
import { TaskParser } from '../src/parser/task-parser';
import { OrgModeTaskParser } from '../src/parser/org-mode-task-parser';
import { TaskWriter } from '../src/services/task-writer';
import { Task } from '../src/types/task';
import {
  createBaseSettings,
  createTestKeywordManager,
  emulateEditorReplaceRange,
} from './helpers/test-helper';

class MemoryFile extends TFile {
  path: string;
  constructor(path: string) {
    super();
    this.path = path;
  }
}

interface Harness {
  writer: TaskWriter;
  parse: (path: string) => Task;
  store: Map<string, string>;
  editor: ReturnType<typeof createEditor> | null;
}

function createEditor(store: Map<string, string>, path: string) {
  const editor = {
    lineCount: () => (store.get(path) ?? '').split('\n').length,
    getLine: (line: number) => (store.get(path) ?? '').split('\n')[line] ?? '',
    getValue: () => store.get(path) ?? '',
    replaceRange: (
      text: string,
      from: { line: number; ch: number },
      to: { line: number; ch: number },
    ) => {
      const lines = (store.get(path) ?? '').split('\n');
      emulateEditorReplaceRange(lines, text, from, to);
      store.set(path, lines.join('\n'));
    },
  };
  return editor;
}

function harness(
  files: Record<string, string>,
  options?: { openEditor?: boolean },
): Harness {
  const store = new Map(Object.entries(files));
  const activePath = Object.keys(files)[0];
  const editor = options?.openEditor ? createEditor(store, activePath) : null;
  const fileFor = (path: string) =>
    store.has(path) ? new MemoryFile(path) : null;
  const app = {
    vault: {
      getAbstractFileByPath: fileFor,
      read: async (file: TFile) => store.get(file.path) ?? '',
      process: async (file: TFile, fn: (data: string) => string) => {
        const next = fn(store.get(file.path) ?? '');
        store.set(file.path, next);
        return next;
      },
    },
    workspace: {
      getActiveViewOfType: () =>
        editor
          ? {
              file: fileFor(activePath),
              editor,
              getViewType: () => 'markdown',
              getMode: () => 'source',
            }
          : null,
    },
  };
  const settings = createBaseSettings();
  const keywordManager = createTestKeywordManager(settings);
  const parser = TaskParser.create(keywordManager, undefined, undefined, {
    keywordManager,
  });
  return {
    writer: new TaskWriter({ app, settings } as never, keywordManager),
    parse: (path: string) => parser.parseFile(store.get(path) ?? '', path)[0],
    store,
    editor,
  };
}

const PATH = 'notes/tasks.md';

describe('TaskWriter properties drawers', () => {
  it('inserts a drawer after date lines and before DESCRIPTION', async () => {
    const content = [
      'TODO Parent',
      'SCHEDULED: <2026-05-10 Sun>',
      'DESCRIPTION: Keep me',
      'Child prose',
    ].join('\n');
    const h = harness({ [PATH]: content });
    const task = h.parse(PATH);

    const result = await h.writer.setTaskDependency(task, 'data-02', true);

    expect(result.status).toBe('success');
    expect(result.task?.blockedBy).toEqual(['data-02']);
    expect(h.store.get(PATH)).toBe(
      [
        'TODO Parent',
        'SCHEDULED: <2026-05-10 Sun>',
        ':PROPERTIES:',
        ':BLOCKER: data-02',
        ':END:',
        'DESCRIPTION: Keep me',
        'Child prose',
      ].join('\n'),
    );
  });

  it('inserts a drawer before a quoted DESCRIPTION line', async () => {
    const content = [
      'TODO Parent',
      '> DESCRIPTION: Keep me',
      'Child prose',
    ].join('\n');
    const h = harness({ [PATH]: content });
    const task = h.parse(PATH);

    const result = await h.writer.setTaskDependency(task, 'data-02', true);

    expect(result.status).toBe('success');
    expect(h.store.get(PATH)).toBe(
      [
        'TODO Parent',
        ':PROPERTIES:',
        ':BLOCKER: data-02',
        ':END:',
        '> DESCRIPTION: Keep me',
        'Child prose',
      ].join('\n'),
    );
  });

  it('adds and removes references while preserving unknown entries', async () => {
    const content = [
      'TODO Parent',
      ':PROPERTIES:',
      ':ID: parent-1',
      ':BLOCKER: data-02 literature-03',
      ':Unknown: keep',
      ':END:',
    ].join('\n');
    const h = harness({ [PATH]: content });
    const task = h.parse(PATH);

    await h.writer.setTaskDependency(task, 'approval-04', true);
    const afterAdd = h.parse(PATH);
    expect(afterAdd.blockedBy).toEqual([
      'data-02',
      'literature-03',
      'approval-04',
    ]);
    expect(h.store.get(PATH)).toContain(':Unknown: keep');

    await h.writer.setTaskDependency(afterAdd, 'literature-03', false);
    expect(h.parse(PATH).blockedBy).toEqual(['data-02', 'approval-04']);
    expect(h.store.get(PATH)).toContain(':Unknown: keep');
  });

  it('removes the drawer only when its last property is removed', async () => {
    const content = [
      'TODO Parent',
      ':PROPERTIES:',
      ':BLOCKER: data-02',
      ':END:',
    ].join('\n');
    const h = harness({ [PATH]: content });
    const task = h.parse(PATH);
    await h.writer.setTaskDependency(task, 'data-02', false);
    expect(h.store.get(PATH)).toBe('TODO Parent');

    const withUnknown = harness({
      [PATH]: [
        'TODO Parent',
        ':PROPERTIES:',
        ':BLOCKER: data-02',
        ':Unknown: keep',
        ':END:',
      ].join('\n'),
    });
    const unknownTask = withUnknown.parse(PATH);
    await withUnknown.writer.setTaskDependency(unknownTask, 'data-02', false);
    expect(withUnknown.store.get(PATH)).toBe(
      ['TODO Parent', ':PROPERTIES:', ':Unknown: keep', ':END:'].join('\n'),
    );
  });

  it('writes an identical result through an open editor buffer', async () => {
    const content = [
      'TODO Parent',
      ':PROPERTIES:',
      ':BLOCKER: data-02',
      ':END:',
    ].join('\n');
    const vault = harness({ [PATH]: content });
    const editor = harness({ [PATH]: content }, { openEditor: true });

    await vault.writer.setTaskDependency(vault.parse(PATH), 'new-03', true);
    await editor.writer.setTaskDependency(editor.parse(PATH), 'new-03', true);

    expect(editor.store.get(PATH)).toBe(vault.store.get(PATH));
    expect(editor.store.get(PATH)).toContain(':BLOCKER: data-02 new-03');
  });

  it('refuses to mutate an unclosed drawer', async () => {
    const content = ['TODO Parent', ':PROPERTIES:', ':BLOCKER: data-02'].join(
      '\n',
    );
    const h = harness({ [PATH]: content });
    const result = await h.writer.setTaskDependency(
      h.parse(PATH),
      'new-03',
      true,
    );
    expect(result.status).toBe('ambiguous');
    expect(h.store.get(PATH)).toBe(content);
  });

  it('writes Org drawers with entry indentation', async () => {
    const content = ['* TODO Parent', '  SCHEDULED: <2026-05-10 Sun>'].join(
      '\n',
    );
    const h = harness({ 'notes/tasks.org': content });
    const keywordManager = createTestKeywordManager(createBaseSettings());
    const parser = OrgModeTaskParser.create(keywordManager, undefined as never);
    const task = parser.parseFile(content, 'notes/tasks.org')[0];

    const result = await h.writer.setTaskDependency(task, 'data-02', true);

    expect(result.status).toBe('success');
    expect(h.store.get('notes/tasks.org')).toBe(
      [
        '* TODO Parent',
        '  SCHEDULED: <2026-05-10 Sun>',
        '  :PROPERTIES:',
        '  :BLOCKER: data-02',
        '  :END:',
      ].join('\n'),
    );
  });

  it('finds a date after a drawer instead of inserting a duplicate', async () => {
    const content = [
      'TODO Parent',
      ':PROPERTIES:',
      ':ID: parent-1',
      ':END:',
      'CLOSED: [2026-05-01 Fri]',
    ].join('\n');
    const h = harness({ [PATH]: content });
    const task = h.parse(PATH);

    await h.writer.updateTaskClosedDate(task, new Date(2026, 4, 2), true);

    const lines = (h.store.get(PATH) ?? '').split('\n');
    expect(lines.filter((line) => line.startsWith('CLOSED:'))).toHaveLength(1);
    expect(lines[4]).toContain('2026-05-02');
  });

  it('does not mutate table or code-comment tasks', async () => {
    const h = harness({ [PATH]: '| TODO Cell |' });
    const table = h.parse(PATH);
    expect(await h.writer.setTaskDependency(table, 'id', true)).toMatchObject({
      status: 'unsupported',
    });
    expect(h.store.get(PATH)).toBe('| TODO Cell |');
  });
});
