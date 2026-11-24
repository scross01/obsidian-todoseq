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
      cachedRead: async (file: TFile) => store.get(file.path) ?? '',
      getFiles: () => [...store.keys()].map((path) => new MemoryFile(path)),
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

describe('TaskWriter blocker history migration', () => {
  const taggedSource = [
    'Intro',
    '',
    'TODO Water the plants',
    ':PROPERTIES:',
    ':ID: water-1',
    ':BLOCKER: data-02',
    ':END:',
    '',
  ].join('\n');

  it('moves an active reference to history and keeps other properties', async () => {
    const h = harness({ [SOURCE]: taggedSource, [DEST]: '' });
    const result = await h.writer.migrateBlockerHistory(
      task({
        line: 2,
        state: 'TODO',
        rawText: 'TODO Water the plants',
        id: 'water-1',
        blockedBy: ['data-02'],
      }),
      'to-history',
      ['data-02'],
    );

    expect(result.status).toBe('success');
    expect(h.store.get(SOURCE)).toBe(
      [
        'Intro',
        '',
        'TODO Water the plants',
        ':PROPERTIES:',
        ':ID: water-1',
        ':ARCHIVED_BLOCKER: data-02',
        ':END:',
        '',
      ].join('\n'),
    );
  });

  it('is idempotent when the reference is already history', async () => {
    const h = harness({ [SOURCE]: taggedSource, [DEST]: '' });
    const dependent = task({
      line: 2,
      state: 'TODO',
      rawText: 'TODO Water the plants',
      blockedBy: ['data-02'],
    });
    await h.writer.migrateBlockerHistory(dependent, 'to-history', ['data-02']);
    const once = h.store.get(SOURCE);
    const second = await h.writer.migrateBlockerHistory(
      dependent,
      'to-history',
      ['data-02'],
    );

    expect(second.status).toBe('success');
    expect(h.store.get(SOURCE)).toBe(once);
  });

  it('promotes history back to the active list', async () => {
    const source = taggedSource.replace(':BLOCKER:', ':ARCHIVED_BLOCKER:');
    const h = harness({ [SOURCE]: source, [DEST]: '' });
    const result = await h.writer.migrateBlockerHistory(
      task({
        line: 2,
        state: 'TODO',
        rawText: 'TODO Water the plants',
        archivedBlockers: ['data-02'],
      }),
      'to-active',
      ['data-02'],
    );

    expect(result.status).toBe('success');
    expect(h.store.get(SOURCE)).toContain(':BLOCKER: data-02');
    expect(h.store.get(SOURCE)).not.toContain('ARCHIVED_BLOCKER');
  });
});

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

  it('reuses a persisted ID when the task snapshot is stale', async () => {
    const source = [
      'TODO Water the plants',
      ':PROPERTIES:',
      ':ID: water-1',
      ':END:',
      '',
    ].join('\n');
    const h = harness({ [SOURCE]: source });

    const first = await h.writer.ensureTaskId(task({ line: 0, id: undefined }));
    const second = await h.writer.ensureTaskId(
      task({ line: 0, id: undefined }),
    );

    expect(first.identity).toBe('water-1');
    expect(second.identity).toBe('water-1');
    expect(h.store.get(SOURCE)).toBe(source);
  });

  it('reuses a persisted anchor when the task snapshot is stale', async () => {
    const anchored = 'Intro\n\n- [ ] TODO Water the plants ^todoseq-existing\n';
    const h = harness({ [SOURCE]: anchored });

    const result = await h.writer.ensureBlockAnchor(task({ line: 2 }));

    expect(result.status).toBe('success');
    expect(result.link).toBe('[[notes/source#^todoseq-existing]]');
    expect(h.store.get(SOURCE)).toBe(anchored);
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

  it('carries a properties drawer with a copied task', async () => {
    const source = [
      'Intro',
      '',
      'TODO Water the plants',
      ':PROPERTIES:',
      ':ID: water-1',
      ':BLOCKER: data-02',
      ':END:',
      'SCHEDULED: <2026-05-10 Sun>',
      '',
    ].join('\n');
    const h = harness({ [SOURCE]: source, [DEST]: '' });
    const result = await h.writer.transferTask(
      task({ line: 2, state: 'TODO', rawText: 'TODO Water the plants' }),
      h.file(DEST),
      'copy',
    );
    expect(result.status).toBe('success');
    const destination = h.store.get(DEST) ?? '';
    expect(destination).toContain(':BLOCKER: data-02');
    expect(destination).toMatch(/:ID: [0-9a-f-]{36}/);
    expect(destination).not.toContain(':ID: water-1');
    expect(destination).toContain(':END:\nSCHEDULED:');
  });

  it('moves the whole drawer and leaves no metadata behind', async () => {
    const source = [
      'Intro',
      '',
      'TODO Water the plants',
      ':PROPERTIES:',
      ':ID: water-1',
      ':END:',
      'DESCRIPTION: keep',
      '',
    ].join('\n');
    const h = harness({ [SOURCE]: source, [DEST]: '' });
    await h.writer.transferTask(
      task({ line: 2, state: 'TODO', rawText: 'TODO Water the plants' }),
      h.file(DEST),
      'move',
    );
    expect(h.store.get(SOURCE)).toBe('Intro\n\n');
    expect(h.store.get(DEST)).toContain(
      ':ID: water-1\n:END:\nDESCRIPTION: keep',
    );
  });

  it('migrates while retaining the drawer and history lines', async () => {
    const source = [
      'Intro',
      '',
      'TODO Water the plants',
      ':PROPERTIES:',
      ':ID: water-1',
      ':END:',
      'SCHEDULED: <2026-05-10 Sun>',
      'STARTED: [2026-05-09 Sat]',
      '',
    ].join('\n');
    const h = harness({ [SOURCE]: source, [DEST]: '' });
    await h.writer.transferTask(
      task({ line: 2, state: 'TODO', rawText: 'TODO Water the plants' }),
      h.file(DEST),
      'migrate',
    );
    expect(h.store.get(SOURCE)).not.toContain(':ID:');
    expect(h.store.get(SOURCE)).toContain('STARTED:');
    expect(h.store.get(SOURCE)).not.toContain('SCHEDULED:');
    expect(h.store.get(DEST)).toContain(':ID: water-1');
  });

  it('migrates nested task identity out of the retained source', async () => {
    const source = [
      'Intro',
      '',
      '- [ ] TODO Parent ^parent',
      '  :PROPERTIES:',
      '  :ID: parent-1',
      '  :END:',
      '  - [ ] TODO Child ^child',
      '    :PROPERTIES:',
      '    :ID: child-1',
      '    :END:',
      '',
    ].join('\n');
    const h = harness({ [SOURCE]: source, [DEST]: '' });

    const result = await h.writer.transferTask(
      task({
        line: 2,
        text: 'Parent',
        rawText: '- [ ] TODO Parent ^parent',
      }),
      h.file(DEST),
      'migrate',
    );

    expect(result.status).toBe('success');
    const retained = h.store.get(SOURCE) ?? '';
    expect(retained).toContain('- [ ] DONE Parent');
    expect(retained).toContain('  - [ ] TODO Child');
    expect(retained).not.toContain('^parent');
    expect(retained).not.toContain('^child');
    expect(retained).not.toContain('parent-1');
    expect(retained).not.toContain('child-1');
    const destination = h.store.get(DEST) ?? '';
    expect(destination).toContain('Parent ^parent');
    expect(destination).toContain('Child ^child');
    expect(destination).toContain('parent-1');
    expect(destination).toContain('child-1');
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

describe('TaskWriter transfer reference repair', () => {
  const ANCHORED_SOURCE = [
    'Intro',
    '',
    '- [ ] TODO Water the plants ^water',
    ':PROPERTIES:',
    ':ID: water-1',
    ':END:',
    '',
  ].join('\n');

  const anchoredTask = (overrides: Partial<Task> = {}): Task =>
    task({
      line: 2,
      rawText: '- [ ] TODO Water the plants ^water',
      embedReference: '^water',
      id: 'water-1',
      ...overrides,
    });

  it('repairs a dependent BLOCKER in another file after a move', async () => {
    const dependent = [
      'TODO Child',
      ':PROPERTIES:',
      ':BLOCKER: [[notes/source#^water]]',
      ':END:',
      '',
    ].join('\n');
    const h = harness({
      [SOURCE]: ANCHORED_SOURCE,
      [DEST]: '',
      'notes/dependent.md': dependent,
    });

    const result = await h.writer.transferTask(
      anchoredTask(),
      h.file(DEST),
      'move',
    );

    expect(result.status).toBe('success');
    expect(result.referenceRepairs?.[0].applied).toBe(1);
    expect(h.store.get('notes/dependent.md')).toContain(
      '[[notes/today#^water]]',
    );
    expect(h.store.get(DEST)).toContain('Water the plants ^water');
  });

  it('repairs prose links and embeds in a note with no tasks', async () => {
    const prose = 'See [[notes/source#^water]] and ![[notes/source#^water]].';
    const h = harness({
      [SOURCE]: ANCHORED_SOURCE,
      [DEST]: '',
      'notes/prose.md': prose,
    });

    const result = await h.writer.transferTask(
      anchoredTask(),
      h.file(DEST),
      'move',
    );

    expect(result.status).toBe('success');
    expect(result.referenceRepairs?.[0].applied).toBe(2);
    expect(h.store.get('notes/prose.md')).toBe(
      'See [[notes/today#^water]] and ![[notes/today#^water]].',
    );
  });

  it("repairs a reference in the moved task's own file", async () => {
    const child = [
      'TODO Child',
      ':PROPERTIES:',
      ':BLOCKER: [[notes/source#^water]]',
      ':END:',
      '',
    ].join('\n');
    const h = harness({
      [SOURCE]: ANCHORED_SOURCE + child,
      [DEST]: '',
    });

    await h.writer.transferTask(anchoredTask(), h.file(DEST), 'move');

    expect(h.store.get(SOURCE)).toContain('[[notes/today#^water]]');
    expect(h.store.get(SOURCE)).not.toContain('Water the plants');
  });

  it('forks identity on copy and remaps only internal references', async () => {
    const source = [
      'Intro',
      '',
      '- [ ] TODO Water the plants ^water',
      ':PROPERTIES:',
      ':ID: water-1',
      ':BLOCKER: [[notes/source#^water]]',
      ':END:',
      '',
    ].join('\n');
    const external = [
      'TODO Other',
      ':PROPERTIES:',
      ':BLOCKER: [[notes/source#^water]]',
      ':END:',
      '',
    ].join('\n');
    const h = harness({
      [SOURCE]: source,
      [DEST]: '',
      'notes/external.md': external,
    });

    const result = await h.writer.transferTask(
      anchoredTask(),
      h.file(DEST),
      'copy',
    );

    expect(result.status).toBe('success');
    const destination = h.store.get(DEST) ?? '';
    const copiedAnchor = /\^todoseq-[a-z0-9]+/.exec(destination)?.[0];
    expect(copiedAnchor).toBeDefined();
    expect(destination).toContain(`Water the plants ${copiedAnchor}`);
    expect(destination).not.toContain(':ID: water-1');
    expect(destination).toContain(`:BLOCKER: [[notes/today#${copiedAnchor}]]`);
    expect(h.store.get('notes/external.md')).toContain(
      '[[notes/source#^water]]',
    );
    expect(h.store.get(SOURCE)).toContain(':ID: water-1');
  });

  it('gives separate copies distinct anchors', async () => {
    const h = harness({
      [SOURCE]: ANCHORED_SOURCE,
      'notes/a.md': '',
      'notes/b.md': '',
    });
    await h.writer.transferTask(anchoredTask(), h.file('notes/a.md'), 'copy');
    await h.writer.transferTask(anchoredTask(), h.file('notes/b.md'), 'copy');
    const first = /\^todoseq-[a-z0-9]+/.exec(
      h.store.get('notes/a.md') ?? '',
    )?.[0];
    const second = /\^todoseq-[a-z0-9]+/.exec(
      h.store.get('notes/b.md') ?? '',
    )?.[0];
    expect(first).toBeDefined();
    expect(second).toBeDefined();
    expect(first).not.toBe(second);
  });

  it('migrates identity to the destination and off the retained source', async () => {
    const dependent = [
      'TODO Child',
      ':PROPERTIES:',
      ':BLOCKER: [[notes/source#^water]]',
      ':END:',
      '',
    ].join('\n');
    const h = harness({
      [SOURCE]: ANCHORED_SOURCE,
      [DEST]: '',
      'notes/dependent.md': dependent,
    });

    const result = await h.writer.transferTask(
      anchoredTask(),
      h.file(DEST),
      'migrate',
    );

    expect(result.status).toBe('success');
    const source = h.store.get(SOURCE) ?? '';
    expect(source).toContain('- [ ] DONE Water the plants');
    expect(source).not.toContain('^water');
    expect(source).not.toContain(':ID:');
    expect(h.store.get(DEST)).toContain(':ID: water-1');
    expect(h.store.get(DEST)).toContain('Water the plants ^water');
    expect(h.store.get('notes/dependent.md')).toContain(
      '[[notes/today#^water]]',
    );
  });

  it('reports a failed repair and retries only that link', async () => {
    const h = harness({
      [SOURCE]: ANCHORED_SOURCE,
      [DEST]: '',
      'notes/a.md': 'A [[notes/source#^water]]',
      'notes/broken.md': 'B [[notes/source#^water]]',
    });
    const app = (h.writer as unknown as { plugin: { app: App } }).plugin.app;
    const originalProcess = app.vault.process;
    app.vault.process = async (file: TFile, fn: (data: string) => string) => {
      if (file.path === 'notes/broken.md') throw new Error('locked');
      return originalProcess(file, fn);
    };

    try {
      const result = await h.writer.transferTask(
        anchoredTask(),
        h.file(DEST),
        'move',
      );
      expect(result.status).toBe('partial-references');
      expect(h.store.get(DEST)).toContain('Water the plants');
      expect(h.store.get(SOURCE)).not.toContain('Water the plants');
      expect(h.store.get('notes/a.md')).toContain('[[notes/today#^water]]');
      expect(h.writer.hasPendingReferenceRepairs()).toBe(true);
    } finally {
      app.vault.process = originalProcess;
    }

    const reports = await h.writer.retryPendingReferenceRepairs();
    expect(reports[0].applied).toBe(1);
    expect(h.store.get('notes/broken.md')).toBe('B [[notes/today#^water]]');
    expect(h.writer.hasPendingReferenceRepairs()).toBe(false);
  });

  it('repairs references to nested anchors after a move', async () => {
    const source = [
      'Intro',
      '',
      '- [ ] TODO Parent ^parent',
      '  - [ ] TODO Child ^child',
      '',
    ].join('\n');
    const dependent = [
      'TODO Dependent',
      ':PROPERTIES:',
      ':BLOCKER: [[notes/source#^parent]] [[notes/source#^child]]',
      ':END:',
      '',
    ].join('\n');
    const h = harness({
      [SOURCE]: source,
      [DEST]: '',
      'notes/dependent.md': dependent,
    });

    const result = await h.writer.transferTask(
      task({
        line: 2,
        text: 'Parent',
        rawText: '- [ ] TODO Parent ^parent',
      }),
      h.file(DEST),
      'move',
    );

    expect(result.status).toBe('success');
    expect(h.store.get('notes/dependent.md')).toBe(
      'TODO Dependent\n:PROPERTIES:\n:BLOCKER: [[notes/today#^parent]] [[notes/today#^child]]\n:END:\n',
    );
    expect(h.store.get(DEST)).toContain('Parent ^parent');
    expect(h.store.get(DEST)).toContain('Child ^child');
  });

  it('leaves an unharmed transfer untouched when nothing references it', async () => {
    const h = harness({ [SOURCE]: ANCHORED_SOURCE, [DEST]: '' });
    const result = await h.writer.transferTask(
      anchoredTask(),
      h.file(DEST),
      'move',
    );
    expect(result.status).toBe('success');
    expect(result.referenceRepairs).toBeUndefined();
  });
});

describe('Copy anchor placement', () => {
  const anchorTask = (
    line: number,
    rawText: string,
    overrides: Partial<Task> = {},
  ): Task =>
    task({
      line,
      rawText,
      text: 'Water the plants',
      state: 'TODO',
      ...overrides,
    });

  it('puts a new anchor on the task line when it has no metadata', async () => {
    const source = '- [ ] TODO Water the plants\n';
    const h = harness({ [SOURCE]: source });

    const result = await h.writer.ensureBlockAnchor(
      anchorTask(0, '- [ ] TODO Water the plants'),
    );

    expect(result.status).toBe('success');
    expect(result.identity).toMatch(/^todoseq-[0-9a-f]{8}$/);
    expect(h.store.get(SOURCE)).toBe(
      `- [ ] TODO Water the plants ^${result.identity}\n`,
    );
  });

  it('puts a new anchor on the final metadata line', async () => {
    const source =
      '- [ ] TODO Water the plants\n  SCHEDULED: <2026-11-23 Mon>\n';
    const h = harness({ [SOURCE]: source });

    const result = await h.writer.ensureBlockAnchor(
      anchorTask(0, '- [ ] TODO Water the plants'),
    );

    expect(result.status).toBe('success');
    expect(h.store.get(SOURCE)).toBe(
      `- [ ] TODO Water the plants\n  SCHEDULED: <2026-11-23 Mon> ^${result.identity}\n`,
    );
  });

  it('puts a new anchor after :END:', async () => {
    const source = [
      '- [ ] TODO Water the plants',
      ':PROPERTIES:',
      ':ID: water-1',
      ':END:',
      '',
    ].join('\n');
    const h = harness({ [SOURCE]: source });

    const result = await h.writer.ensureBlockAnchor(
      anchorTask(0, '- [ ] TODO Water the plants'),
    );

    expect(result.status).toBe('success');
    expect(h.store.get(SOURCE)).toBe(
      [
        '- [ ] TODO Water the plants',
        ':PROPERTIES:',
        ':ID: water-1',
        `:END: ^${result.identity}`,
        '',
      ].join('\n'),
    );
  });

  it('relocates a legacy task-line anchor once and keeps the same link', async () => {
    const source =
      '- [ ] TODO Water the plants ^water\n  SCHEDULED: <2026-11-23 Mon>\n';
    const h = harness({ [SOURCE]: source });

    const first = await h.writer.ensureBlockAnchor(
      anchorTask(0, '- [ ] TODO Water the plants ^water', {
        embedReference: '^water',
      }),
    );
    expect(first.status).toBe('success');
    expect(first.link).toBe('[[notes/source#^water]]');
    expect(h.store.get(SOURCE)).toBe(
      '- [ ] TODO Water the plants\n  SCHEDULED: <2026-11-23 Mon> ^water\n',
    );

    const second = await h.writer.ensureBlockAnchor(
      anchorTask(0, '- [ ] TODO Water the plants', {
        embedReference: '^water',
      }),
    );
    expect(second.link).toBe(first.link);
    expect(h.store.get(SOURCE)).toBe(
      '- [ ] TODO Water the plants\n  SCHEDULED: <2026-11-23 Mon> ^water\n',
    );
  });

  it('reuses a block-end anchor from a stale snapshot without writing', async () => {
    const source =
      '- [ ] TODO Water the plants\n  SCHEDULED: <2026-11-23 Mon> ^water\n';
    const h = harness({ [SOURCE]: source });

    const result = await h.writer.ensureBlockAnchor(
      anchorTask(0, '- [ ] TODO Water the plants'),
    );

    expect(result.status).toBe('success');
    expect(result.link).toBe('[[notes/source#^water]]');
    expect(h.store.get(SOURCE)).toBe(source);
  });

  it('keeps a task-line anchor when metadata is separated by a blank line', async () => {
    const source =
      '- [ ] TODO Water the plants\n\n  SCHEDULED: <2026-11-23 Mon>\n';
    const h = harness({ [SOURCE]: source });

    const result = await h.writer.ensureBlockAnchor(
      anchorTask(0, '- [ ] TODO Water the plants'),
    );

    expect(result.status).toBe('success');
    expect(h.store.get(SOURCE)).toBe(
      `- [ ] TODO Water the plants ^${result.identity}\n\n  SCHEDULED: <2026-11-23 Mon>\n`,
    );
  });

  it('does not put the anchor on an indented continuation paragraph', async () => {
    const source = '- [ ] TODO Water the plants\n  Continuation prose.\n';
    const h = harness({ [SOURCE]: source });

    const result = await h.writer.ensureBlockAnchor(
      anchorTask(0, '- [ ] TODO Water the plants'),
    );

    expect(result.status).toBe('success');
    expect(h.store.get(SOURCE)).toBe(
      `- [ ] TODO Water the plants ^${result.identity}\n  Continuation prose.\n`,
    );
  });

  it('is byte-idempotent and returns one anchor for repeated calls', async () => {
    const source = '- [ ] TODO Water the plants\n';
    const h = harness({ [SOURCE]: source });
    const t = anchorTask(0, '- [ ] TODO Water the plants');

    const first = await h.writer.ensureBlockAnchor(t);
    const once = h.store.get(SOURCE);
    const second = await h.writer.ensureBlockAnchor(t);

    expect(second.link).toBe(first.link);
    expect(h.store.get(SOURCE)).toBe(once);
    expect(once?.match(/\^todoseq-[0-9a-f]{8}/g)).toHaveLength(1);
  });
});

describe('Anchor preservation through writes', () => {
  it('leaves a block-end anchor on its metadata line after a state change', async () => {
    const source =
      'TODO Water the plants\nSCHEDULED: <2026-11-23 Mon> ^water\n';
    const h = harness({ [SOURCE]: source });

    await h.writer.applyLineUpdate(
      task({
        line: 0,
        rawText: 'TODO Water the plants',
        text: 'Water the plants',
        state: 'TODO',
        embedReference: '^water',
      }),
      'DONE',
      true,
      true,
    );

    expect(h.store.get(SOURCE)).toBe(
      'DONE Water the plants\nSCHEDULED: <2026-11-23 Mon> ^water\n',
    );
  });

  it('moves a block-end anchor to :END: when a drawer is added', async () => {
    const source =
      'TODO Water the plants\nSCHEDULED: <2026-11-23 Mon> ^water\n';
    const h = harness({ [SOURCE]: source });

    await h.writer.ensureTaskId(
      task({
        line: 0,
        rawText: 'TODO Water the plants',
        text: 'Water the plants',
        state: 'TODO',
        embedReference: '^water',
        id: undefined,
      }),
    );

    const out = h.store.get(SOURCE) ?? '';
    expect(out).toContain(':PROPERTIES:');
    expect(out).toMatch(/:END: \^water\n$/);
  });

  it('relocates an anchor to the task line when its date line is removed', async () => {
    const source =
      'TODO Water the plants\nSCHEDULED: <2026-11-23 Mon> ^water\n';
    const h = harness({ [SOURCE]: source });

    await h.writer.removeTaskScheduledDate(
      task({
        line: 0,
        rawText: 'TODO Water the plants',
        text: 'Water the plants',
        state: 'TODO',
        embedReference: '^water',
      }),
    );

    expect(h.store.get(SOURCE)).toBe('TODO Water the plants ^water\n');
  });

  it('keeps the anchor on the rolled date line', async () => {
    const source =
      'TODO Water the plants\nSCHEDULED: <2026-11-23 Mon> ^water\n';
    const h = harness({ [SOURCE]: source });

    await h.writer.applyRecurrenceUpdate(
      task({
        line: 0,
        rawText: 'TODO Water the plants',
        text: 'Water the plants',
        state: 'TODO',
        embedReference: '^water',
        scheduledDate: new Date(2026, 10, 23),
      }),
      { newScheduledDate: new Date(2026, 10, 24) },
    );

    const out = h.store.get(SOURCE) ?? '';
    expect(out).toContain('SCHEDULED: <2026-11-24');
    expect(out).toMatch(/\^water\n$/);
  });
});

describe('Transfer identity with an anchored drawer end', () => {
  const source = [
    'Intro',
    '',
    '- [ ] TODO Water the plants',
    ':PROPERTIES:',
    ':ID: water-1',
    ':END: ^water',
    '',
  ].join('\n');

  const blockTask = (): Task =>
    task({ line: 2, embedReference: '^water', id: 'water-1' });

  it('copies with a fresh ID and anchor, leaving the source untouched', async () => {
    const h = harness({ [SOURCE]: source, [DEST]: '' });

    const result = await h.writer.transferTask(
      blockTask(),
      h.file(DEST),
      'copy',
    );

    expect(result.status).toBe('success');
    const destination = h.store.get(DEST) ?? '';
    expect(destination).toMatch(/:ID: [0-9a-f-]{36}/);
    expect(destination).toMatch(/:END: \^todoseq-[0-9a-f]{8}/);
    expect(destination).not.toContain(':ID: water-1');
    expect(h.store.get(SOURCE)).toBe(source);
  });

  it('moves the anchored drawer without changing its identity', async () => {
    const h = harness({ [SOURCE]: source, [DEST]: '' });

    const result = await h.writer.transferTask(
      blockTask(),
      h.file(DEST),
      'move',
    );

    expect(result.status).toBe('success');
    expect(h.store.get(DEST)).toContain(':END: ^water');
    expect(h.store.get(DEST)).toContain(':ID: water-1');
    expect(h.store.get(SOURCE)).toBe('Intro\n\n');
  });

  it('migrates identity out of the retained source', async () => {
    const h = harness({ [SOURCE]: source, [DEST]: '' });

    const result = await h.writer.transferTask(
      blockTask(),
      h.file(DEST),
      'migrate',
    );

    expect(result.status).toBe('success');
    expect(h.store.get(DEST)).toContain(':END: ^water');
    const retained = h.store.get(SOURCE) ?? '';
    expect(retained).not.toContain('^water');
    expect(retained).not.toContain(':ID: water-1');
    expect(retained).not.toContain(':PROPERTIES:');
  });
});
