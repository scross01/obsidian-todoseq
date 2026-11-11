/**
 * Transfers write through TaskWriter: destination appends are atomic, the
 * source is revalidated before it changes, and table tasks move one cell.
 */

import { App, TFile } from 'obsidian';
import TodoTracker from '../src/main';
import { TaskWriter } from '../src/services/task-writer';
import { Task } from '../src/types/task';
import {
  createBaseSettings,
  createBaseTask,
  createTestKeywordManager,
} from './helpers/test-helper';

class MemoryFile extends TFile {
  path: string;
  constructor(path: string) {
    super();
    this.path = path;
  }
}

interface Harness {
  store: Map<string, string>;
  writer: TaskWriter;
  file: (path: string) => TFile;
}

function harness(files: Record<string, string>): Harness {
  const store = new Map(Object.entries(files));
  const app = {
    vault: {
      getAbstractFileByPath: (path: string) =>
        store.has(path) ? new MemoryFile(path) : null,
      read: async (file: TFile) => store.get(file.path) ?? '',
      process: async (file: TFile, fn: (data: string) => string) => {
        const next = fn(store.get(file.path) ?? '');
        store.set(file.path, next);
        return next;
      },
      modify: async (file: TFile, data: string) => {
        store.set(file.path, data);
      },
    },
    workspace: { getActiveViewOfType: () => null },
  };
  const settings = { ...createBaseSettings(), migrateToTodayState: 'DONE' };
  const plugin = { app, settings };
  const writer = new TaskWriter(
    plugin as unknown as TodoTracker,
    createTestKeywordManager(createBaseSettings()),
  );
  return {
    store,
    writer,
    file: (path: string) => new MemoryFile(path),
  };
}

const SOURCE = 'notes/source.md';
const DEST = 'notes/today.md';
const SOURCE_TEXT = 'Intro\n\n- [ ] TODO Water the plants\n';

function task(overrides: Partial<Task> = {}): Task {
  return createBaseTask({
    path: SOURCE,
    line: 0,
    text: 'Water the plants',
    state: 'TODO',
    rawText: '- [ ] TODO Water the plants',
    ...overrides,
  });
}

describe('TaskWriter transfers', () => {
  it('copies the block and leaves the source untouched', async () => {
    const h = harness({ [SOURCE]: SOURCE_TEXT, [DEST]: 'Existing\n' });
    const result = await h.writer.transferTask(
      task({ line: 2 }),
      h.file(DEST),
      'copy',
    );
    expect(result.status).toBe('success');
    expect(h.store.get(DEST)).toBe('Existing\n\n- [ ] TODO Water the plants\n');
    expect(h.store.get(SOURCE)).toBe(SOURCE_TEXT);
  });

  it('keeps both payloads when two copies race for the destination', async () => {
    const h = harness({ [SOURCE]: SOURCE_TEXT, [DEST]: '' });
    const other = createBaseTask({
      path: 'notes/other.md',
      line: 0,
      text: 'Call the plumber',
      state: 'TODO',
      rawText: '- [ ] TODO Call the plumber',
    });
    h.store.set('notes/other.md', '- [ ] TODO Call the plumber\n');
    const [a, b] = await Promise.all([
      h.writer.transferTask(task({ line: 2 }), h.file(DEST), 'copy'),
      h.writer.transferTask(other, h.file(DEST), 'copy'),
    ]);
    expect([a.status, b.status]).toEqual(['success', 'success']);
    const destination = h.store.get(DEST) ?? '';
    expect(destination).toContain('Water the plants');
    expect(destination).toContain('Call the plumber');
  });

  it('moves a task by removing only its lines', async () => {
    const h = harness({ [SOURCE]: SOURCE_TEXT, [DEST]: '' });
    const result = await h.writer.transferTask(
      task({ line: 2 }),
      h.file(DEST),
      'move',
    );
    expect(result.status).toBe('success');
    expect(h.store.get(SOURCE)).toBe('Intro\n\n');
    expect(h.store.get(DEST)).toContain('Water the plants');
  });

  it('refuses a stale source without touching the destination', async () => {
    const h = harness({ [SOURCE]: SOURCE_TEXT, [DEST]: 'Existing\n' });
    h.store.set(SOURCE, 'Intro\n\n- [ ] TODO Something else\n');
    const result = await h.writer.transferTask(
      task({ line: 2 }),
      h.file(DEST),
      'move',
    );
    expect(result.status).toBe('stale-source');
    expect(h.store.get(DEST)).toBe('Existing\n');
    expect(h.store.get(SOURCE)).toBe('Intro\n\n- [ ] TODO Something else\n');
  });

  it('leaves the source intact when the destination write fails', async () => {
    const h = harness({ [SOURCE]: SOURCE_TEXT });
    const app = (h.writer as unknown as { plugin: { app: App } }).plugin.app;
    const originalProcess = app.vault.process;
    app.vault.process = async () => {
      throw new Error('disk full');
    };
    try {
      const result = await h.writer.transferTask(
        task({ line: 2 }),
        h.file(DEST),
        'move',
      );
      expect(result.status).toBe('destination-failed');
      expect(h.store.get(SOURCE)).toBe(SOURCE_TEXT);
    } finally {
      app.vault.process = originalProcess;
    }
  });

  it('migrates the source keyword after copying', async () => {
    const h = harness({ [SOURCE]: SOURCE_TEXT, [DEST]: '' });
    const result = await h.writer.transferTask(
      task({ line: 2 }),
      h.file(DEST),
      'migrate',
    );
    expect(result.status).toBe('success');
    expect(h.store.get(SOURCE)).toBe('Intro\n\n- [ ] DONE Water the plants\n');
    expect(h.store.get(DEST)).toContain('- [ ] TODO Water the plants');
  });

  it('moves a table task by clearing only its cell', async () => {
    const row = '| a\\|b | TODO Water the plants | keep |';
    const h = harness({ [SOURCE]: row + '\n', [DEST]: '' });
    const tableTask = task({
      line: 0,
      text: 'Water the plants',
      rawText: row,
      isTableTask: true,
      tableCell: { cellIndex: 1 },
    });
    const result = await h.writer.transferTask(tableTask, h.file(DEST), 'move');
    expect(result.status).toBe('success');
    expect(h.store.get(SOURCE)).toBe('| a\\|b |  | keep |\n');
    expect(h.store.get(DEST)).toBe('TODO Water the plants\n');
  });

  it('removes a table row when the task was its only content', async () => {
    const row = '| TODO Water the plants |';
    const h = harness({ [SOURCE]: row + '\n', [DEST]: '' });
    const result = await h.writer.transferTask(
      task({
        line: 0,
        rawText: row,
        isTableTask: true,
        tableCell: { cellIndex: 0 },
      }),
      h.file(DEST),
      'move',
    );
    expect(result.status).toBe('success');
    expect(h.store.get(SOURCE)).toBe('');
  });
});
