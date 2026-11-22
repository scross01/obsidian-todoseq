import { App, TFile } from 'obsidian';
import {
  TaskReferenceService,
  TaskReferenceEdit,
} from '../src/services/task-reference-service';
import { findWikiLinks } from '../src/utils/task-link';

class MemoryFile extends TFile {
  path: string;
  constructor(path: string) {
    super();
    this.path = path;
  }
}

function harness(files: Record<string, string>) {
  const store = new Map(Object.entries(files));
  const app = {
    vault: {
      getAbstractFileByPath: (path: string) =>
        store.has(path) ? new MemoryFile(path) : null,
      getFiles: () => [...store.keys()].map((path) => new MemoryFile(path)),
      read: async (file: TFile) => store.get(file.path) ?? '',
      cachedRead: async (file: TFile) => store.get(file.path) ?? '',
      process: async (file: TFile, fn: (data: string) => string) => {
        const next = fn(store.get(file.path) ?? '');
        store.set(file.path, next);
        return next;
      },
    },
    workspace: { getActiveViewOfType: () => null },
    metadataCache: {},
  };
  return {
    store,
    service: new TaskReferenceService(app as unknown as App),
  };
}

describe('task link tokenizer', () => {
  it('reads targets with spaces, aliases and embeds', () => {
    const links = findWikiLinks(
      'See [[My Note#^block|Alias]] and ![[Other#^x]].',
    );

    expect(links).toHaveLength(2);
    expect(links[0]).toMatchObject({
      target: 'My Note',
      anchor: '^block',
      alias: 'Alias',
      embed: false,
    });
    expect(links[1]).toMatchObject({
      target: 'Other',
      anchor: '^x',
      alias: null,
      embed: true,
    });
  });
});

describe('TaskReferenceService', () => {
  it('finds block links that resolve to the moved note and anchor', async () => {
    const h = harness({
      'notes/source.md': 'TODO Moved ^water\n',
      'notes/else.md': '',
      'a.md': [
        '[[notes/source#^water]]',
        '[[notes/source#^other]]',
        '[[notes/else#^water]]',
        '[[source#^water|Local]]',
      ].join('\n'),
    });

    const edits = await h.service.collectAnchorReferences({
      sourcePath: 'notes/source.md',
      anchor: 'water',
      destinationPath: 'notes/today.md',
    });

    expect(edits).toHaveLength(2);
    expect(edits[0].path).toBe('a.md');
    expect(edits[0].line).toBe(0);
    expect(edits[0].replacement).toBe('[[notes/today#^water]]');
    expect(edits[1].replacement).toBe('[[notes/today#^water|Local]]');
  });

  it('rewrites only a line that still contains the recorded token', async () => {
    const h = harness({ 'a.md': 'before [[old]] after' });
    const edits: TaskReferenceEdit[] = [
      {
        path: 'a.md',
        line: 0,
        reference: '[[old]]',
        replacement: '[[new]]',
      },
      {
        path: 'a.md',
        line: 0,
        reference: '[[missing]]',
        replacement: '[[new]]',
      },
    ];

    const outcome = await h.service.apply(edits);

    expect(h.store.get('a.md')).toBe('before [[new]] after');
    expect(outcome.reports[0].applied).toBe(1);
    expect(outcome.reports[0].failed).toHaveLength(1);
    expect(outcome.failedEdits).toEqual([edits[1]]);
  });

  it('reports every edit when the note is gone', async () => {
    const h = harness({});
    const edit: TaskReferenceEdit = {
      path: 'notes/missing.md',
      line: 3,
      reference: '[[old]]',
      replacement: '[[new]]',
    };

    const outcome = await h.service.apply([edit]);

    expect(outcome.reports[0].failed[0].reason).toBe(
      'The note could not be found.',
    );
    expect(outcome.failedEdits).toEqual([edit]);
  });
});
