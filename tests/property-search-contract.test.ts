/**
 * @jest-environment jsdom
 */
import { TFile } from 'obsidian';
import { PropertySearchEngine } from '../src/services/property-search-engine';
import { PropertyEvaluator } from '../src/utils/property-evaluator';
import { Search } from '../src/search/search';
import type { PropertyQueryDescriptor } from '../src/search/search-types';
import { createBaseSettings, createBaseTask } from './helpers/test-helper';

type Frontmatter = Record<string, unknown>;

const frontmatters: Record<string, Frontmatter> = {
  'a.md': { type: 'Project', place: '' },
  'b.md': { type: 'project', place: 'Café' },
  'c.md': { type: 'Project backlog', place: 'Other backlog' },
  'd.md': { type: null, place: null },
  'e.md': { type: [], place: [] },
  'f.md': { type: '', place: 'null' },
  'g.md': { Type: 'Project', Place: 'Other' },
  'h.md': { title: 'no type key' },
  'i.md': { place: 'Other' },
  'j.md': { résumé: 'Café' },
  'k.md': { resume: 'cafe' },
  'l.md': { place: 'Łódź' },
  'm.md': { résumé: ['Straße', 'Other'] },
};

function tfile(path: string): TFile {
  const file = new TFile(path, path.split('/').pop() ?? path, 'md');
  Object.assign(file, { basename: path.replace('.md', ''), extension: 'md' });
  return file;
}

const files = Object.fromEntries(
  Object.keys(frontmatters).map((path) => [path, tfile(path)]),
);

const app = {
  vault: {
    getAbstractFileByPath: (path: string) => files[path] ?? null,
    getMarkdownFiles: () => Object.values(files),
  },
  metadataCache: {
    getFileCache: (file: TFile) => ({
      frontmatter: frontmatters[file.path] ?? {},
    }),
  },
};

const taskStateManager = {
  getTasks: () => Object.keys(frontmatters).map((path) => ({ path, line: 0 })),
};

function descriptor(
  overrides: Partial<PropertyQueryDescriptor>,
): PropertyQueryDescriptor {
  return {
    key: 'type',
    kind: 'string',
    value: '',
    exact: false,
    keyExact: false,
    ...overrides,
  };
}

async function search(
  overrides: Partial<PropertyQueryDescriptor>,
  caseSensitive = false,
): Promise<string[]> {
  const engine = new PropertySearchEngine(app as never, {
    taskStateManager: taskStateManager as never,
    refreshAllTaskListViews: jest.fn(),
    vaultScanner: {
      isScanning: () => false,
      isObsidianInitializing: () => false,
    },
  });
  await engine.initialize();
  const result = await engine.searchProperty(
    descriptor(overrides),
    caseSensitive,
  );
  return Array.from(result).sort();
}

describe('property search contract', () => {
  it('matches unquoted values partially and case-insensitively across key spellings', async () => {
    expect(await search({ value: 'ject' })).toEqual([
      'a.md',
      'b.md',
      'c.md',
      'g.md',
    ]);
    expect(await search({ value: 'Project' })).toEqual([
      'a.md',
      'b.md',
      'c.md',
      'g.md',
    ]);
  });

  it('keeps key presence distinct from a missing key, including empty arrays', async () => {
    const expected = ['a.md', 'b.md', 'c.md', 'd.md', 'e.md', 'f.md', 'g.md'];
    expect(await search({ kind: 'existence' })).toEqual(expected);
    expect(await search({ kind: 'existence', value: '' })).toEqual(expected);
  });

  it('distinguishes null from an exact empty string', async () => {
    expect(await search({ kind: 'null', value: 'null' })).toEqual(['d.md']);
    expect(await search({ kind: 'string', value: '', exact: true })).toEqual([
      'f.md',
    ]);
  });

  it('treats quoted values exactly and ignores surrounding whitespace', async () => {
    expect(await search({ value: 'Project', exact: true })).toEqual(['a.md']);
    const spaced = Search.parse('[type: "Project"]');
    expect(spaced.type).toBe('property_filter');
    expect(spaced.property?.exact).toBe(true);
    expect(spaced.property?.value).toBe('Project');
  });

  it('preserves quoted empty and key-only intent in the parsed node', () => {
    expect(Search.parse('[type]').property?.kind).toBe('existence');
    expect(Search.parse('[type:]').property?.kind).toBe('existence');
    expect(Search.parse('[type:null]').property?.kind).toBe('null');
    expect(Search.parse('[type:""]').property?.kind).toBe('string');
    expect(Search.parse('[type:""]').property?.exact).toBe(true);
  });

  it('gives bulk and per-row the same quoted, null and key-exact intent', async () => {
    const engine = new PropertySearchEngine(app as never, {
      taskStateManager: taskStateManager as never,
      refreshAllTaskListViews: jest.fn(),
      vaultScanner: {
        isScanning: () => false,
        isObsidianInitializing: () => false,
      },
    });
    await engine.initialize();
    const settings = createBaseSettings({ app } as never);
    const tasks = Object.keys(frontmatters).map((path) =>
      createBaseTask({ path, line: 0 }),
    );

    const cases: Array<[string, string[]]> = [
      ['[place:""]', ['a.md']],
      ['[place:"null"]', ['f.md']],
      ['[place:null]', ['d.md']],
      ['[place:"Other"]', ['i.md']],
      ['["Place":Other]', ['g.md']],
      ['[place:Other]', ['c.md', 'g.md', 'i.md']],
    ];

    for (const [query, expected] of cases) {
      const bulk = await Search.filterTasks(
        tasks,
        query,
        false,
        settings,
        engine,
      );
      expect({ query, files: bulk.map((task) => task.path).sort() }).toEqual({
        query,
        files: expected,
      });

      const perRow: string[] = [];
      for (const task of tasks) {
        if (await Search.evaluate(query, task, false, settings, engine)) {
          perRow.push(task.path);
        }
      }
      expect({ query, files: perRow.sort() }).toEqual({
        query,
        files: expected,
      });
    }
  });

  it('folds unquoted keys and string values in both property paths', async () => {
    const engine = new PropertySearchEngine(app as never, {
      taskStateManager: taskStateManager as never,
      refreshAllTaskListViews: jest.fn(),
      vaultScanner: {
        isScanning: () => false,
        isObsidianInitializing: () => false,
      },
    });
    await engine.initialize();
    const settings = createBaseSettings({ app } as never);
    const tasks = Object.keys(frontmatters).map((path) =>
      createBaseTask({ path, line: 0 }),
    );

    const cases: Array<[string, string[]]> = [
      ['[résumé:cafe]', ['j.md', 'k.md']],
      ['[place:lodz]', ['l.md']],
      ['[place:"lodz"]', []],
      ['[place:"Łódź"]', ['l.md']],
      ['["résumé":cafe]', ['j.md']],
    ];

    for (const [query, expected] of cases) {
      const bulk = await Search.filterTasks(
        tasks,
        query,
        false,
        settings,
        engine,
      );
      expect({ query, files: bulk.map((task) => task.path).sort() }).toEqual({
        query,
        files: expected,
      });

      const fallback = tasks
        .filter((task) =>
          PropertyEvaluator.matchesPropertyFilter(
            frontmatters[task.path],
            descriptor(
              Search.parse(query).property ?? {
                key: '',
                kind: 'existence',
                value: '',
                exact: false,
                keyExact: false,
              },
            ),
            false,
          ),
        )
        .map((task) => task.path)
        .sort();
      expect({ query, files: fallback }).toEqual({ query, files: expected });
    }
  });

  it('gives the metadata fallback the same answers as the index', async () => {
    const ject = descriptor({ value: 'ject' });
    const existence = descriptor({ kind: 'existence', value: '' });
    const nullValue = descriptor({ kind: 'null', value: 'null' });
    const empty = descriptor({ kind: 'string', value: '', exact: true });

    const matches = (filter: PropertyQueryDescriptor) =>
      Object.entries(frontmatters)
        .filter(([, fm]) =>
          PropertyEvaluator.matchesPropertyFilter(fm, filter, false),
        )
        .map(([path]) => path)
        .sort();

    expect(matches(ject)).toEqual(['a.md', 'b.md', 'c.md', 'g.md']);
    expect(matches(existence)).toEqual([
      'a.md',
      'b.md',
      'c.md',
      'd.md',
      'e.md',
      'f.md',
      'g.md',
    ]);
    expect(matches(nullValue)).toEqual(['d.md']);
    expect(matches(empty)).toEqual(['f.md']);
  });
});
