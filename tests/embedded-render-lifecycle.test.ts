/**
 * @jest-environment jsdom
 *
 * Embedded blocks are owned by the Markdown render that produced them. These
 * tests use the real processors, registries and render lifetime hooks (only
 * the parser/manager boundaries are paused) to prove that unloading a render
 * stops later work and that only the newest refresh can commit.
 */

import { installObsidianDomMocks } from './helpers/obsidian-dom-mock';
import {
  createBaseSettings,
  createTestKeywordManager,
} from './helpers/test-helper';

jest.mock('obsidian', () => {
  const actual = jest.requireActual('obsidian');
  class MockComponent {
    onunload: () => void = () => {};
    load(): void {}
    unload(): void {
      this.onunload();
    }
  }
  class MockMarkdownRenderChild extends MockComponent {
    constructor(public containerEl: HTMLElement) {
      super();
    }
  }
  return {
    ...actual,
    Component: MockComponent,
    MarkdownRenderChild: MockMarkdownRenderChild,
  };
});

import { EmbeddedTaskListEventHandler } from '../src/view/embedded-task-list/event-handler';
import { TodoseqCodeBlockProcessor } from '../src/view/embedded-task-list/code-block-processor';
import { EmbeddedTaskListManager } from '../src/view/embedded-task-list/task-list-manager';
import { EmbeddedTaskListRenderer } from '../src/view/embedded-task-list/task-list-renderer';
import { TodoseqCodeBlockParser } from '../src/view/embedded-task-list/code-block-parser';
import { DashboardCodeBlockProcessor } from '../src/view/embedded-dashboard/dashboard-code-block-processor';
import { DashboardAggregator } from '../src/view/embedded-dashboard/aggregation';
import { DashboardRenderer } from '../src/view/embedded-dashboard/dashboard-renderer';
import { TodoseqDashboardParser } from '../src/view/embedded-dashboard/dashboard-parser';
import { Task } from '../src/types/task';

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const params = {
  error: null,
  limit: 10,
  sort: 'default',
  viewMode: 'showAll',
  collapse: false,
  tags: [],
  excludeTags: [],
  states: [],
  search: '',
};

function task(text: string): Task {
  return {
    path: 'note.md',
    line: 0,
    rawText: `- [ ] TODO ${text}`,
    indent: '',
    listMarker: '- [ ]',
    text,
    state: 'TODO',
    completed: false,
    priority: null,
    scheduledDate: null,
    scheduledDateRepeat: null,
    deadlineDate: null,
    deadlineDateRepeat: null,
    closedDate: null,
    startedDate: null,
    scheduledWarningPeriod: null,
    deadlineWarningPeriod: null,
    urgency: null,
    isDailyNote: false,
    dailyNoteDate: null,
    subtaskCount: 0,
    subtaskCompletedCount: 0,
  };
}

describe('embedded task list render lifetime', () => {
  let handler: EmbeddedTaskListEventHandler;
  let renderer: { renderTaskList: jest.Mock; renderError: jest.Mock };
  let manager: { filterAndSortTasksWithCount: jest.Mock };

  beforeAll(() => {
    installObsidianDomMocks();
    jest
      .spyOn(TodoseqCodeBlockParser, 'parse')
      .mockReturnValue(params as never);
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  beforeEach(() => {
    renderer = { renderTaskList: jest.fn(), renderError: jest.fn() };
    manager = { filterAndSortTasksWithCount: jest.fn() };
    handler = new EmbeddedTaskListEventHandler(
      { getTasks: () => [], settings: createBaseSettings() } as never,
      renderer as never,
      manager as never,
    );
  });

  it('does not render a refresh that settles after its block unloaded', async () => {
    const result = deferred<{ tasks: Task[]; totalCount: number }>();
    manager.filterAndSortTasksWithCount.mockReturnValue(result.promise);
    handler.trackCodeBlock(
      'block-a',
      document.createElement('div'),
      'x',
      'a.md',
    );

    handler.refreshAllCodeBlocks();
    handler.untrackCodeBlock('block-a');
    result.resolve({ tasks: [task('hidden')], totalCount: 1 });
    await Promise.resolve();
    await Promise.resolve();

    expect(renderer.renderTaskList).not.toHaveBeenCalled();
  });

  it('does not paint an error onto an unloaded block', async () => {
    const result = deferred<{ tasks: Task[]; totalCount: number }>();
    manager.filterAndSortTasksWithCount.mockReturnValue(result.promise);
    handler.trackCodeBlock(
      'block-b',
      document.createElement('div'),
      'x',
      'b.md',
    );

    handler.refreshAllCodeBlocks();
    handler.untrackCodeBlock('block-b');
    result.reject(new Error('property engine failed'));
    await Promise.resolve();
    await Promise.resolve();

    expect(renderer.renderError).not.toHaveBeenCalled();
  });

  it('lets only the newest refresh of a live block commit', async () => {
    const first = deferred<{ tasks: Task[]; totalCount: number }>();
    const second = deferred<{ tasks: Task[]; totalCount: number }>();
    manager.filterAndSortTasksWithCount
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    handler.trackCodeBlock(
      'block-c',
      document.createElement('div'),
      'x',
      'c.md',
    );

    handler.refreshAllCodeBlocks();
    handler.refreshAllCodeBlocks();
    second.resolve({ tasks: [task('newest')], totalCount: 2 });
    await Promise.resolve();
    await Promise.resolve();
    first.resolve({ tasks: [task('stale')], totalCount: 9 });
    await Promise.resolve();
    await Promise.resolve();

    expect(renderer.renderTaskList).toHaveBeenCalledTimes(1);
    const call = renderer.renderTaskList.mock.calls[0];
    expect(call[3]).toBe(2);
    expect((call[1] as Task[])[0].text).toBe('newest');
  });

  it('keeps two live blocks in one note independent', async () => {
    const first = deferred<{ tasks: Task[]; totalCount: number }>();
    const second = deferred<{ tasks: Task[]; totalCount: number }>();
    manager.filterAndSortTasksWithCount
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    handler.trackCodeBlock(
      'one',
      document.createElement('div'),
      'x',
      'same.md',
    );
    handler.trackCodeBlock(
      'two',
      document.createElement('div'),
      'x',
      'same.md',
    );

    handler.refreshAllCodeBlocks();
    handler.untrackCodeBlock('two');
    first.resolve({ tasks: [task('kept')], totalCount: 1 });
    second.resolve({ tasks: [task('unloaded')], totalCount: 4 });
    await Promise.resolve();
    await Promise.resolve();

    expect(renderer.renderTaskList).toHaveBeenCalledTimes(1);
    expect(renderer.renderTaskList.mock.calls[0][0].id).not.toBe('two');
  });
});

describe('code block processor render ownership', () => {
  function pluginStub() {
    return {
      settings: createBaseSettings(),
      keywordManager: {},
      taskStateManager: {
        subscribe: jest.fn(() => () => {}),
        getTasks: jest.fn(() => []),
      },
      eventCoordinator: null,
      vaultScanner: { getKeywordManager: () => ({}) },
      getTasks: jest.fn(() => []),
      registerMarkdownCodeBlockProcessor: jest.fn(),
    };
  }

  let renderSpy: jest.SpyInstance;
  let managerSpy: jest.SpyInstance;

  beforeAll(() => {
    installObsidianDomMocks();
    jest
      .spyOn(TodoseqCodeBlockParser, 'parse')
      .mockReturnValue(params as never);
  });

  beforeEach(() => {
    renderSpy = jest
      .spyOn(EmbeddedTaskListRenderer.prototype, 'renderTaskList')
      .mockImplementation(() => {});
    managerSpy = jest.spyOn(
      EmbeddedTaskListManager.prototype,
      'filterAndSortTasksWithCount',
    );
  });

  afterEach(() => {
    renderSpy.mockRestore();
    managerSpy.mockRestore();
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  it('registers a render child and stops a pending initial render on unload', async () => {
    const result = deferred<{ tasks: Task[]; totalCount: number }>();
    managerSpy.mockReturnValue(result.promise);
    const processor = new TodoseqCodeBlockProcessor(pluginStub() as never);
    const el = document.createElement('div');
    let child: { unload: () => void } | undefined;
    const ctx = {
      sourcePath: 'note.md',
      addChild: (c: { unload: () => void }) => {
        child = c;
      },
    };

    const processing = (
      processor as never as {
        processCodeBlock: (
          source: string,
          el: HTMLElement,
          ctx: unknown,
        ) => Promise<void>;
      }
    ).processCodeBlock('search: x', el, ctx);
    expect(child).toBeDefined();
    child!.unload();
    result.resolve({ tasks: [task('gone')], totalCount: 1 });
    await processing;

    expect(renderSpy).not.toHaveBeenCalled();
    expect(
      (
        processor as never as {
          eventHandler: { activeCodeBlocks: Map<string, unknown> };
        }
      ).eventHandler.activeCodeBlocks.size,
    ).toBe(0);
  });

  it('tracks a live render and untracks it when the render unloads', async () => {
    managerSpy.mockResolvedValue({ tasks: [task('kept')], totalCount: 1 });
    const processor = new TodoseqCodeBlockProcessor(pluginStub() as never);
    const el = document.createElement('div');
    let child: { unload: () => void } | undefined;
    const ctx = {
      sourcePath: 'note.md',
      addChild: (c: { unload: () => void }) => {
        child = c;
      },
    };

    await (
      processor as never as {
        processCodeBlock: (
          source: string,
          el: HTMLElement,
          ctx: unknown,
        ) => Promise<void>;
      }
    ).processCodeBlock('search: x', el, ctx);

    expect(renderSpy).toHaveBeenCalledTimes(1);
    const tracked = (
      processor as never as {
        eventHandler: { activeCodeBlocks: Map<string, unknown> };
      }
    ).eventHandler.activeCodeBlocks;
    expect(tracked.size).toBe(1);

    child!.unload();
    expect(tracked.size).toBe(0);
  });
});

describe('dashboard render ownership', () => {
  function pluginStub() {
    const keywordManager = createTestKeywordManager(createBaseSettings());
    return {
      settings: createBaseSettings(),
      keywordManager,
      vaultScanner: { getKeywordManager: () => keywordManager },
      propertySearchEngine: null,
      taskStateManager: { subscribe: jest.fn(() => () => {}) },
      eventCoordinator: null,
      getTasks: jest.fn(() => []),
      registerMarkdownCodeBlockProcessor: jest.fn(),
      uiManager: { showTasksWithQuery: jest.fn() },
    };
  }

  let renderSpy: jest.SpyInstance;
  let aggregateSpy: jest.SpyInstance;

  beforeAll(() => {
    installObsidianDomMocks();
    jest
      .spyOn(TodoseqDashboardParser, 'parse')
      .mockReturnValue({ error: null } as never);
  });

  beforeEach(() => {
    renderSpy = jest
      .spyOn(DashboardRenderer.prototype, 'renderCard')
      .mockImplementation(() => document.createElement('div'));
    aggregateSpy = jest.spyOn(DashboardAggregator.prototype, 'aggregate');
  });

  afterEach(() => {
    renderSpy.mockRestore();
    aggregateSpy.mockRestore();
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  it('does not render a dashboard whose render unloaded while aggregating', async () => {
    const result = deferred<unknown>();
    aggregateSpy.mockReturnValue(result.promise as never);
    const processor = new DashboardCodeBlockProcessor(pluginStub() as never);
    const el = document.createElement('div');
    let child: { unload: () => void } | undefined;
    const ctx = {
      sourcePath: 'note.md',
      addChild: (c: { unload: () => void }) => {
        child = c;
      },
    };

    const processing = (
      processor as never as {
        processCodeBlock: (
          source: string,
          el: HTMLElement,
          ctx: unknown,
        ) => Promise<void>;
      }
    ).processCodeBlock('query: x', el, ctx);
    expect(child).toBeDefined();
    child!.unload();
    result.resolve({});
    await processing;

    expect(renderSpy).not.toHaveBeenCalled();
    expect(
      (
        processor as never as {
          activeDashboards: Map<string, unknown>;
        }
      ).activeDashboards.size,
    ).toBe(0);
  });

  it('tracks a live dashboard and drops it when the render unloads', async () => {
    aggregateSpy.mockResolvedValue({} as never);
    const processor = new DashboardCodeBlockProcessor(pluginStub() as never);
    const el = document.createElement('div');
    let child: { unload: () => void } | undefined;
    const ctx = {
      sourcePath: 'note.md',
      addChild: (c: { unload: () => void }) => {
        child = c;
      },
    };

    await (
      processor as never as {
        processCodeBlock: (
          source: string,
          el: HTMLElement,
          ctx: unknown,
        ) => Promise<void>;
      }
    ).processCodeBlock('query: x', el, ctx);

    const tracked = (
      processor as never as {
        activeDashboards: Map<string, unknown>;
      }
    ).activeDashboards;
    expect(renderSpy).toHaveBeenCalledTimes(1);
    expect(tracked.size).toBe(1);
    child!.unload();
    expect(tracked.size).toBe(0);
  });
});
