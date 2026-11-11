/**
 * Scanner publication consistency: per-file updates must not overwrite state
 * that changed while their reads were pending, and a full scan must not
 * publish an old snapshot over a newer incremental result for the same path.
 */

import { VaultScanner } from '../src/services/vault-scanner';
import { TaskStateManager } from '../src/services/task-state-manager';
import { TaskParser } from '../src/parser/task-parser';
import { ParserRegistry } from '../src/parser/parser-registry';
import { ChangeTracker } from '../src/services/change-tracker';
import { KeywordManager } from '../src/utils/keyword-manager';
import { App, TFile } from 'obsidian';
import {
  createBaseSettings,
  createTestKeywordManager,
} from './helpers/test-helper';

function createMockFile(path: string): TFile {
  return Object.assign(new TFile(), {
    path,
    name: path,
    basename: path.replace(/\.md$/, ''),
    extension: 'md',
    stat: {},
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe('scanner state consistency', () => {
  let scanner: VaultScanner;
  let taskStateManager: TaskStateManager;
  let changeTracker: ChangeTracker;
  let keywordManager: KeywordManager;
  let content: Map<string, string>;
  let files: TFile[];
  let mockApp: jest.Mocked<App>;
  let cachedReadHook:
    ((file: TFile) => Promise<string> | null | undefined) | null;

  beforeEach(() => {
    const settings = createBaseSettings({
      additionalArchivedKeywords: ['ARCHIVED'],
    });
    keywordManager = createTestKeywordManager(settings);
    taskStateManager = new TaskStateManager(keywordManager);
    content = new Map();
    files = [];
    cachedReadHook = null;

    mockApp = {
      vault: {
        getFiles: jest.fn(() => files),
        cachedRead: jest.fn(async (file: TFile) => {
          if (cachedReadHook) {
            const hooked = cachedReadHook(file);
            if (hooked) return hooked;
          }
          return content.get(file.path) ?? '';
        }),
        read: jest.fn(async (file: TFile) => content.get(file.path) ?? ''),
        getAbstractFileByPath: jest.fn((path: string) => {
          return files.find((f) => f.path === path) ?? null;
        }),
        getConfig: jest.fn(() => undefined),
      },
      plugins: { getPlugin: jest.fn() },
    } as unknown as jest.Mocked<App>;

    const mockPlugin = {
      app: mockApp,
      settings,
      taskStateManager,
      keywordManager,
    };

    changeTracker = new ChangeTracker();

    const parserRegistry = new ParserRegistry();
    const taskParser = TaskParser.create(keywordManager, mockApp, undefined, {
      includeCalloutBlocks: settings.includeCalloutBlocks,
      includeCodeBlocks: settings.includeCodeBlocks,
      includeCommentBlocks: settings.includeCommentBlocks,
      languageCommentSupport: settings.languageCommentSupport,
    });
    parserRegistry.register(taskParser);

    scanner = new VaultScanner(
      mockPlugin as never,
      settings,
      taskStateManager,
      undefined,
      keywordManager,
      parserRegistry,
      changeTracker,
    );
  });

  afterEach(() => {
    scanner.destroy();
    changeTracker.destroy();
  });

  function addFile(path: string, text: string): TFile {
    const file = createMockFile(path);
    files.push(file);
    content.set(path, text);
    return file;
  }

  describe('per-file publication', () => {
    it('publishes a heading-only change', async () => {
      const file = addFile('a.md', '# Old heading\n\nTODO task');
      await scanner.scanVault();
      expect(taskStateManager.getTasks()[0].parentHeading).toBe('Old heading');

      content.set('a.md', '# New heading\n\nTODO task');
      await scanner.processIncrementalChange(file);

      expect(taskStateManager.getTasks()[0].parentHeading).toBe('New heading');
    });

    it('never publishes a renamed archived task', async () => {
      addFile('a.md', '# A\n\nARCHIVED parked task');
      await scanner.scanVault();
      expect(taskStateManager.getTasks()).toHaveLength(0);

      const renamed = createMockFile('b.md');
      files = [renamed];
      content.set('b.md', '# B\n\nARCHIVED parked task');
      await scanner.processFileRename(renamed, 'a.md');

      expect(taskStateManager.getTasks()).toHaveLength(0);
    });

    it('keeps unrelated state updated while a read was pending', async () => {
      const fileA = addFile('a.md', 'TODO a');
      const fileB = addFile('b.md', 'TODO b');
      await scanner.scanVault();

      const pending = deferred<string>();
      cachedReadHook = (file) =>
        file.path === 'a.md' ? pending.promise : undefined;
      // A's old snapshot is read immediately; B is updated meanwhile.
      content.set('b.md', 'DOING b');
      const incremental = scanner.processIncrementalChange(fileA);
      await scanner.processIncrementalChange(fileB);
      await Promise.resolve();

      pending.resolve('DONE a');
      content.set('a.md', 'DONE a');
      await incremental;

      const tasks = taskStateManager.getTasks();
      expect(tasks.find((t) => t.path === 'b.md')?.state).toBe('DOING');
      expect(tasks.find((t) => t.path === 'a.md')?.state).toBe('DONE');
    });

    it('does not publish an unchanged file', async () => {
      const file = addFile('a.md', 'TODO a');
      await scanner.scanVault();
      const listener = jest.fn();
      scanner.on('tasks-changed', listener);

      await scanner.processIncrementalChange(file);

      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('full-scan publication', () => {
    it('keeps a newer incremental state published during the scan', async () => {
      const fileA = addFile('a.md', 'TODO a');
      const fileB = addFile('b.md', 'TODO b');
      const pendingB = deferred<string>();
      cachedReadHook = (file) =>
        file.path === 'b.md' ? pendingB.promise : undefined;

      const scan = scanner.scanVault();
      // A has been read for the scan; change it and let its event publish.
      content.set('a.md', 'DONE a');
      await new Promise((resolve) => setTimeout(resolve, 0));
      await scanner.processIncrementalChange(fileA);
      expect(
        taskStateManager.getTasks().find((t) => t.path === 'a.md')?.state,
      ).toBe('DONE');

      pendingB.resolve('TODO b');
      await scan;

      expect(
        taskStateManager.getTasks().find((t) => t.path === 'a.md')?.state,
      ).toBe('DONE');
      expect(content.get('a.md')).toBe('DONE a');
      expect(
        taskStateManager.getTasks().find((t) => t.path === 'b.md')?.state,
      ).toBe('TODO');
    });

    it('does not resurrect a path deleted during the scan', async () => {
      const fileA = addFile('a.md', 'TODO a');
      addFile('b.md', 'TODO b');
      const pendingB = deferred<string>();
      cachedReadHook = (file) =>
        file.path === 'b.md' ? pendingB.promise : undefined;

      const scan = scanner.scanVault();
      await new Promise((resolve) => setTimeout(resolve, 0));
      await scanner.processFileDelete(fileA);
      files = files.filter((f) => f.path !== 'a.md');
      content.delete('a.md');

      pendingB.resolve('TODO b');
      await scan;

      expect(taskStateManager.getTasks().some((t) => t.path === 'a.md')).toBe(
        false,
      );
    });

    it('keeps a file created after enumeration when it is published', async () => {
      addFile('a.md', 'TODO a');
      const pendingA = deferred<string>();
      cachedReadHook = (file) =>
        file.path === 'a.md' ? pendingA.promise : undefined;

      const scan = scanner.scanVault();
      const created = addFile('new.md', 'TODO created during scan');
      await scanner.processIncrementalChange(created);

      pendingA.resolve('TODO a');
      await scan;

      expect(
        taskStateManager.getTasks().find((t) => t.path === 'new.md')?.state,
      ).toBe('TODO');
    });
  });
});
