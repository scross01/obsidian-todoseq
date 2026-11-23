/**
 * @jest-environment jsdom
 *
 * Reader badge and diagnostic-notice behaviour. The badge is derived from the
 * same dependency snapshot as Task List rows; the notice is fingerprint-gated
 * so optimistic updates and rescans do not repeat it.
 */

import { ReaderViewFormatter } from '../src/view/markdown-renderers/reader-formatting';
import { TaskDependencyWarningService } from '../src/services/task-dependency-warning-service';
import type { TaskDependencyManager } from '../src/services/task-dependency-manager';
import type {
  DependencyIssue,
  DependencySnapshot,
} from '../src/types/task-dependency';
import {
  createBaseSettings,
  createBaseTask,
  createTestKeywordManager,
} from './helpers/test-helper';
import { installObsidianDomMocks } from './helpers/obsidian-dom-mock';

type ProcessMarkers = (
  element: HTMLElement,
  context: { sourcePath: string },
) => Promise<void>;

function createIssue(
  fingerprint: string,
  message: string,
  sourceKey = 'blocked.md:0',
): DependencyIssue {
  return {
    code: 'missing-reference',
    fingerprint,
    message,
    sourceKey,
    reference: '^missing',
  };
}

function createWarningManager(
  issues: DependencyIssue[],
  options: { ready?: boolean; validationReady?: boolean } = {},
): TaskDependencyManager {
  const ready = options.ready ?? true;
  const validationReady = options.validationReady ?? true;
  return {
    isValidationReady: jest.fn(() => validationReady),
    getSnapshot: jest.fn((): DependencySnapshot => ({
      revision: 1,
      ready,
      blocked: new Set(),
      reasonsByKey: new Map(),
      issues,
      issuesByKey: new Map(),
      blockedKeys: [],
    })),
  } as unknown as TaskDependencyManager;
}

function createReaderHarness() {
  const settings = createBaseSettings();
  const keywordManager = createTestKeywordManager(settings);
  let blocked = true;
  const manager = {
    getIssues: jest.fn((): DependencyIssue[] => []),
    getIssuesForTask: jest.fn((): DependencyIssue[] => []),
    isBlocked: jest.fn((key: string) => blocked && key === 'blocked.md:0'),
    getBlockingReasons: jest.fn(() => [
      {
        code: 'incomplete-blocker',
        message: 'Blocked by TODO Blocker.',
        sourceKey: 'blocked.md:0',
        sourcePath: 'blocked.md',
        sourceLine: 0,
        blocking: true,
      },
    ]),
  };
  const plugin = {
    settings,
    taskDependencyManager: manager,
    taskStateManager: {
      getTasks: jest.fn(() => [
        createBaseTask({
          path: 'blocked.md',
          line: 0,
          text: 'Dependent task',
        }),
        createBaseTask({ path: 'blocked.md', line: 1, text: 'Other task' }),
      ]),
    },
    keywordManager,
    app: { vault: { getAbstractFileByPath: jest.fn() } },
    registerMarkdownPostProcessor: jest.fn(),
    registerDomEvent: jest.fn(),
  };
  const scanner = {
    getParser: jest.fn(() => null),
    getKeywordManager: jest.fn(() => keywordManager),
  };
  const formatter = new ReaderViewFormatter(
    plugin as unknown as ConstructorParameters<typeof ReaderViewFormatter>[0],
    scanner as unknown as ConstructorParameters<typeof ReaderViewFormatter>[1],
  );
  return {
    formatter,
    manager,
    setBlocked: (value: boolean) => {
      blocked = value;
    },
  };
}

function renderRows(): HTMLElement {
  const root = document.createElement('div');
  const list = document.createElement('ul');

  for (const [line, text] of [
    [0, 'Dependent task'],
    [1, 'Other task'],
  ] as const) {
    const item = document.createElement('li');
    item.className = 'task-list-item';
    item.setAttribute('data-line', String(line));

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'task-list-item-checkbox';

    const task = document.createElement('span');
    task.className = 'todoseq-task';
    const keyword = document.createElement('span');
    keyword.className = 'todoseq-keyword-formatted';
    keyword.setAttribute('data-task-keyword', 'TODO');
    keyword.textContent = 'TODO';
    task.append(keyword, document.createTextNode(` ${text}`));

    item.append(checkbox, task);
    list.append(item);
  }

  root.append(list);
  return root;
}

describe('reader blocked badge', () => {
  beforeAll(() => {
    installObsidianDomMocks();
  });

  it('adds one accessible badge to the blocked row only', async () => {
    const { formatter } = createReaderHarness();
    const root = renderRows();

    await (
      formatter as unknown as { processDependencyMarkers: ProcessMarkers }
    ).processDependencyMarkers(root, { sourcePath: 'blocked.md' });

    const badges = root.querySelectorAll('.todoseq-reader-blocked-badge');
    expect(badges).toHaveLength(1);
    expect(badges[0].getAttribute('data-icon')).toBe('lock');
    const keyword = root.querySelector(
      'li[data-line="0"] .todoseq-keyword-formatted',
    )!;
    const checkbox = root.querySelector('li[data-line="0"] input')!;
    expect(
      badges[0].compareDocumentPosition(keyword) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      checkbox.compareDocumentPosition(badges[0]) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(badges[0].getAttribute('title')).toContain(
      'Blocked by TODO Blocker.',
    );
    expect(badges[0].getAttribute('aria-label')).toBe(
      'Blocked by TODO Blocker.',
    );
    expect(
      root.querySelectorAll('li[data-line="1"] .todoseq-reader-blocked-badge'),
    ).toHaveLength(0);
  });

  it('is idempotent across repeated renders and removes when unblocked', async () => {
    const { formatter, setBlocked } = createReaderHarness();
    const root = renderRows();
    const process = (
      formatter as unknown as { processDependencyMarkers: ProcessMarkers }
    ).processDependencyMarkers.bind(formatter);

    await process(root, { sourcePath: 'blocked.md' });
    await process(root, { sourcePath: 'blocked.md' });
    expect(root.querySelectorAll('.todoseq-reader-blocked-badge')).toHaveLength(
      1,
    );

    setBlocked(false);
    await process(root, { sourcePath: 'blocked.md' });
    expect(root.querySelectorAll('.todoseq-reader-blocked-badge')).toHaveLength(
      0,
    );
  });

  it('lists every blocking reason without repeating the prefix', async () => {
    const { formatter, manager } = createReaderHarness();
    manager.getBlockingReasons.mockReturnValue([
      {
        code: 'incomplete-blocker',
        message: 'Blocked by TODO One.',
        sourceKey: 'blocked.md:0',
        sourcePath: 'blocked.md',
        sourceLine: 0,
        blocking: true,
      },
      {
        code: 'structural',
        message: 'Blocked by unfinished child Child.',
        sourceKey: 'blocked.md:0',
        sourcePath: 'blocked.md',
        sourceLine: 0,
        blocking: true,
      },
    ]);
    const root = renderRows();

    await (
      formatter as unknown as { processDependencyMarkers: ProcessMarkers }
    ).processDependencyMarkers(root, { sourcePath: 'blocked.md' });

    const badge = root.querySelector('.todoseq-reader-blocked-badge');
    expect(badge?.getAttribute('aria-label')).toBe(
      'Blocked by TODO One. Blocked by unfinished child Child.',
    );
  });

  it('replaces the lock with a warning for a source diagnostic', async () => {
    const { formatter, manager } = createReaderHarness();
    manager.getIssues.mockReturnValue([
      createIssue('missing:a', 'Dependency missing.', 'blocked.md:0'),
    ]);
    const root = renderRows();

    await (
      formatter as unknown as { processDependencyMarkers: ProcessMarkers }
    ).processDependencyMarkers(root, { sourcePath: 'blocked.md' });

    const warning = root.querySelector('.todoseq-reader-issue-badge');
    expect(warning?.getAttribute('data-icon')).toBe('alert-triangle');
    expect(warning?.getAttribute('title')).toBe('Dependency missing.');
    expect(warning?.getAttribute('aria-label')).toContain(
      'Dependency problem:',
    );
    expect(root.querySelectorAll('.todoseq-reader-blocked-badge')).toHaveLength(
      0,
    );
  });

  it('keeps the badge before a property drawer that follows the task', async () => {
    const { formatter } = createReaderHarness();
    const root = renderRows();
    const row = root.querySelector('li[data-line="0"]')!;
    const drawer = document.createElement('div');
    drawer.className = 'properties';
    row.querySelector('.todoseq-task')!.appendChild(drawer);

    await (
      formatter as unknown as { processDependencyMarkers: ProcessMarkers }
    ).processDependencyMarkers(root, { sourcePath: 'blocked.md' });

    const badge = root.querySelector('.todoseq-reader-blocked-badge')!;
    expect(
      badge.compareDocumentPosition(drawer) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('finds a table task diagnostic through its cell-qualified key', async () => {
    const { formatter, manager } = createReaderHarness();
    manager.getIssues.mockReturnValue([
      createIssue('missing:cell', 'Cell dependency missing.', 'blocked.md:0:2'),
    ]);
    const root = renderRows();

    await (
      formatter as unknown as { processDependencyMarkers: ProcessMarkers }
    ).processDependencyMarkers(root, { sourcePath: 'blocked.md' });

    const warning = root.querySelector('.todoseq-reader-issue-badge');
    expect(warning).not.toBeNull();
    expect(warning?.getAttribute('title')).toBe('Cell dependency missing.');
  });

  it('ignores diagnostics for other files and pending validation', async () => {
    const { formatter, manager } = createReaderHarness();
    manager.getIssues.mockReturnValue([
      createIssue('missing:other', 'Other file.', 'other.md:0'),
      {
        ...createIssue('pending', 'Checking dependencies.', 'blocked.md:0'),
        code: 'pending-validation',
      },
    ]);
    const root = renderRows();

    await (
      formatter as unknown as { processDependencyMarkers: ProcessMarkers }
    ).processDependencyMarkers(root, { sourcePath: 'blocked.md' });

    expect(root.querySelectorAll('.todoseq-reader-issue-badge')).toHaveLength(
      0,
    );
    expect(root.querySelectorAll('.todoseq-reader-blocked-badge')).toHaveLength(
      1,
    );
  });
});

describe('dependency warning notice', () => {
  it('notifies once for the same non-empty issue set', () => {
    const issues = [createIssue('missing:a', 'Dependency missing.')];
    const manager = createWarningManager(issues);
    const notify = jest.fn();
    const debug = jest.fn();
    const service = new TaskDependencyWarningService(manager, notify, debug);

    expect(service.check()).toBe(true);
    expect(service.check()).toBe(false);
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith('Dependency missing. (blocked.md:1)');
    expect(debug).toHaveBeenCalled();
  });

  it('notifies for a changed set and caps the text', () => {
    const manager = createWarningManager([
      createIssue('missing:a', 'Dependency missing.'),
      createIssue('cycle:b', 'Task dependency cycle detected.'),
    ]);
    const notify = jest.fn();
    const service = new TaskDependencyWarningService(manager, notify);

    service.check();

    expect(notify).toHaveBeenCalledWith(
      'Dependency missing. (+1 more) (blocked.md:1)',
    );
  });

  it('stays silent for an empty set and notifies again on relapse', () => {
    const issue = createIssue('missing:a', 'Dependency missing.');
    const manager = createWarningManager([]);
    const notify = jest.fn();
    const service = new TaskDependencyWarningService(manager, notify);

    expect(service.check()).toBe(false);
    manager.getSnapshot = jest.fn((): DependencySnapshot => ({
      revision: 2,
      ready: true,
      blocked: new Set(),
      reasonsByKey: new Map(),
      issues: [issue],
      issuesByKey: new Map(),
      blockedKeys: [],
    }));

    expect(service.check()).toBe(true);
    expect(notify).toHaveBeenCalledTimes(1);
    expect(service.check()).toBe(false);
  });

  it('never notifies during indexing or while the snapshot is not ready', () => {
    const indexing = createWarningManager(
      [createIssue('missing:a', 'Dependency missing.')],
      { validationReady: false },
    );
    const notReady = createWarningManager(
      [createIssue('missing:a', 'Dependency missing.')],
      { ready: false },
    );
    const notify = jest.fn();

    expect(new TaskDependencyWarningService(indexing, notify).check()).toBe(
      false,
    );
    expect(new TaskDependencyWarningService(notReady, notify).check()).toBe(
      false,
    );
    expect(notify).not.toHaveBeenCalled();
  });

  it('names the source file and one-based line', () => {
    const manager = createWarningManager([
      createIssue('missing:a', 'Dependency missing.', 'blocked.md:4'),
    ]);
    const notify = jest.fn();

    new TaskDependencyWarningService(manager, notify).check();

    expect(notify).toHaveBeenCalledWith('Dependency missing. (blocked.md:5)');
  });

  it('names the line, not the cell, for a table task', () => {
    const manager = createWarningManager([
      createIssue('missing:a', 'Dependency missing.', 'board.md:4:2'),
    ]);
    const notify = jest.fn();

    new TaskDependencyWarningService(manager, notify).check();

    expect(notify).toHaveBeenCalledWith('Dependency missing. (board.md:5)');
    expect(notify).not.toHaveBeenCalledWith(
      expect.stringContaining('board.md:4:3'),
    );
  });

  it('leaves the message unchanged when the issue has no source', () => {
    const manager = createWarningManager([
      {
        ...createIssue('missing:a', 'Dependency missing.'),
        sourceKey: undefined,
      },
    ]);
    const notify = jest.fn();

    new TaskDependencyWarningService(manager, notify).check();

    expect(notify).toHaveBeenCalledWith('Dependency missing.');
    expect(notify).not.toHaveBeenCalledWith(expect.stringContaining('()'));
  });
});
