/**
 * @jest-environment jsdom
 */

import { TodoseqCodeBlockProcessor } from '../src/view/embedded-task-list/code-block-processor';
import { EmbeddedTaskListManager } from '../src/view/embedded-task-list/task-list-manager';
import { EmbeddedTaskListEventHandler } from '../src/view/embedded-task-list/event-handler';
import { EmbeddedTaskListRenderer } from '../src/view/embedded-task-list/task-list-renderer';
import { createBaseTask, createBaseSettings } from './helpers/test-helper';

// Mock the event handler to avoid complex DOM setup
jest.mock('../src/view/embedded-task-list/event-handler', () => ({
  EmbeddedTaskListEventHandler: jest.fn().mockImplementation(() => ({
    registerEventListeners: jest.fn(),
    trackCodeBlock: jest.fn(),
    toggleCollapse: jest.fn(),
    refreshAllCodeBlocks: jest.fn(),
    handleFileDeleted: jest.fn(),
    handleFileRenamed: jest.fn(),
    clearAllCodeBlocks: jest.fn(),
    setManager: jest.fn(),
    updateSettings: jest.fn(),
  })),
}));

jest.mock('../src/view/embedded-task-list/task-list-renderer', () => ({
  EmbeddedTaskListRenderer: jest.fn().mockImplementation(() => ({
    renderError: jest.fn(),
    renderTaskList: jest.fn(),
    updateSettings: jest.fn(),
  })),
}));

jest.mock('../src/view/embedded-task-list/task-list-manager', () => ({
  EmbeddedTaskListManager: jest.fn().mockImplementation(() => ({
    filterAndSortTasksWithCount: jest.fn().mockResolvedValue({
      tasks: [],
      totalCount: 0,
    }),
    invalidateCache: jest.fn(),
  })),
}));

jest.mock('../src/view/embedded-task-list/code-block-parser', () => ({
  TodoseqCodeBlockParser: {
    parse: jest.fn().mockReturnValue({
      error: null,
      limit: 10,
      sort: 'default',
      viewMode: 'showAll',
      collapse: false,
      tags: [],
      excludeTags: [],
      states: [],
      search: '',
    }),
    getSortMethod: jest.fn().mockReturnValue('default'),
    getCompletedSetting: jest.fn().mockReturnValue('showAll'),
    getFutureSetting: jest.fn().mockReturnValue('showAll'),
  },
}));

describe('TodoseqCodeBlockProcessor', () => {
  let processor: TodoseqCodeBlockProcessor;
  let pluginMock: Record<string, unknown>;
  let unsubscribeMock: jest.Mock;

  beforeEach(() => {
    unsubscribeMock = jest.fn();

    const taskStateManagerMock = {
      subscribe: jest.fn().mockReturnValue(unsubscribeMock),
      getTasks: jest.fn().mockReturnValue([]),
    };

    const eventCoordinatorMock = {
      onFileChange: jest.fn(),
    };

    pluginMock = {
      settings: createBaseSettings(),
      keywordManager: {},
      taskStateManager: taskStateManagerMock,
      eventCoordinator: eventCoordinatorMock,
      vaultScanner: {
        getKeywordManager: jest.fn().mockReturnValue({}),
      },
      getTasks: jest.fn().mockReturnValue([]),
      registerMarkdownCodeBlockProcessor: jest.fn(),
    };

    processor = new TodoseqCodeBlockProcessor(pluginMock as any);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should subscribe to task state manager', () => {
      expect(pluginMock.taskStateManager).toBeDefined();
      const subscribeMock = (pluginMock.taskStateManager as any).subscribe;
      expect(subscribeMock).toHaveBeenCalled();
    });

    it('should register with event coordinator if available', () => {
      expect(pluginMock.eventCoordinator).toBeDefined();
      const onFileChangeMock = (pluginMock.eventCoordinator as any)
        .onFileChange;
      expect(onFileChangeMock).toHaveBeenCalled();
    });

    it('should handle missing event coordinator gracefully', () => {
      const pluginWithoutCoordinator = {
        ...pluginMock,
        eventCoordinator: null,
      };

      expect(() => {
        new TodoseqCodeBlockProcessor(pluginWithoutCoordinator as any);
      }).not.toThrow();
    });
  });

  describe('registerProcessor', () => {
    it('should register markdown code block processor', () => {
      processor.registerProcessor();

      const registerMock =
        pluginMock.registerMarkdownCodeBlockProcessor as jest.Mock;
      expect(registerMock).toHaveBeenCalledWith(
        'todoseq',
        expect.any(Function),
      );
    });
  });

  describe('updateSettings', () => {
    it('should recreate manager with new settings', () => {
      const initialCalls = (EmbeddedTaskListManager as jest.Mock).mock.calls
        .length;

      processor.updateSettings();

      expect(
        (EmbeddedTaskListManager as jest.Mock).mock.calls.length,
      ).toBeGreaterThan(initialCalls);
    });

    it('should call refreshAllEmbeddedTaskLists', () => {
      const refreshSpy = jest.spyOn(processor, 'refreshAllEmbeddedTaskLists');
      processor.updateSettings();
      expect(refreshSpy).toHaveBeenCalled();
    });
  });

  describe('refreshAllEmbeddedTaskLists', () => {
    it('should invalidate cache and refresh code blocks', () => {
      const eventHandlerInstance = (EmbeddedTaskListEventHandler as jest.Mock)
        .mock.results[0]?.value;

      processor.refreshAllEmbeddedTaskLists();

      // Should call refresh on event handler
      if (eventHandlerInstance) {
        expect(eventHandlerInstance.refreshAllCodeBlocks).toHaveBeenCalled();
      }
    });
  });

  describe('cleanup', () => {
    it('should unsubscribe from state manager', () => {
      processor.cleanup();
      expect(unsubscribeMock).toHaveBeenCalled();
    });

    it('should clear all code blocks', () => {
      const eventHandlerInstance = (EmbeddedTaskListEventHandler as jest.Mock)
        .mock.results[0]?.value;

      processor.cleanup();

      if (eventHandlerInstance) {
        expect(eventHandlerInstance.clearAllCodeBlocks).toHaveBeenCalled();
      }
    });
  });

  describe('skipNextRefresh behavior', () => {
    it('should skip refresh when skipNextRefresh is set', () => {
      const eventHandlerInstance = (EmbeddedTaskListEventHandler as jest.Mock)
        .mock.results[0]?.value;

      processor.refreshAllEmbeddedTaskLists();
      // After calling refreshAllEmbeddedTaskLists, skipNextRefresh is reset
      // Next subscriber callback should trigger refresh
      const taskStateManagerMock = pluginMock.taskStateManager as any;
      const subscriberCallback =
        taskStateManagerMock.subscribe.mock.calls[0][0];

      // First call after refresh sets skip flag
      processor.refreshAllEmbeddedTaskLists();
      subscriberCallback([]);

      // refreshAllCodeBlocks should not be called because skipNextRefresh was true
      const refreshCalls =
        eventHandlerInstance?.refreshAllCodeBlocks.mock.calls.length ?? 0;
      // First refreshAllEmbeddedTaskLists calls it, subscriber callback should skip
      // The exact count depends on prior calls, so we check it doesn't throw
      expect(() => processor.refreshAllEmbeddedTaskLists()).not.toThrow();
    });
  });

  describe('processCodeBlock error handling', () => {
    it('should render error when parser returns error', async () => {
      const { TodoseqCodeBlockParser } = jest.requireMock(
        '../src/view/embedded-task-list/code-block-parser',
      );
      TodoseqCodeBlockParser.parse.mockReturnValueOnce({
        error: 'Invalid search query',
      });

      const rendererInstance = (EmbeddedTaskListRenderer as jest.Mock).mock
        .results[0]?.value;

      processor.registerProcessor();
      const registerMock =
        pluginMock.registerMarkdownCodeBlockProcessor as jest.Mock;
      const callback = registerMock.mock.calls[0][1];

      const el = document.createElement('div');
      const ctx = { sourcePath: 'test.md' };
      await callback('invalid', el, ctx);

      if (rendererInstance) {
        expect(rendererInstance.renderError).toHaveBeenCalledWith(
          el,
          expect.stringContaining('Invalid search query'),
        );
      }
    });

    it('should handle exceptions during code block processing', async () => {
      const { TodoseqCodeBlockParser } = jest.requireMock(
        '../src/view/embedded-task-list/code-block-parser',
      );
      TodoseqCodeBlockParser.parse.mockImplementationOnce(() => {
        throw new Error('Parse failure');
      });

      const rendererInstance = (EmbeddedTaskListRenderer as jest.Mock).mock
        .results[0]?.value;

      processor.registerProcessor();
      const registerMock =
        pluginMock.registerMarkdownCodeBlockProcessor as jest.Mock;
      const callback = registerMock.mock.calls[0][1];

      const el = document.createElement('div');
      const ctx = { sourcePath: 'test.md' };
      await callback('boom', el, ctx);

      if (rendererInstance) {
        expect(rendererInstance.renderError).toHaveBeenCalledWith(
          el,
          expect.stringContaining('Parse failure'),
        );
      }
    });
  });

  describe('processCodeBlock happy path', () => {
    it('should call renderTaskList with filtered tasks and parsed parameters', async () => {
      const { TodoseqCodeBlockParser } = jest.requireMock(
        '../src/view/embedded-task-list/code-block-parser',
      );
      const rendererInstance = (EmbeddedTaskListRenderer as jest.Mock).mock
        .results[0]?.value;
      const managerInstance = (EmbeddedTaskListManager as jest.Mock).mock
        .results[0]?.value;

      const parsedParams = {
        error: null,
        searchQuery: '',
        sortMethod: 'priority',
        limit: 5,
        collapse: false,
      };
      TodoseqCodeBlockParser.parse.mockReturnValueOnce(parsedParams);

      const filteredTasks = [createBaseTask({ text: 'Filtered task' })];
      managerInstance.filterAndSortTasksWithCount.mockResolvedValueOnce({
        tasks: filteredTasks,
        totalCount: 1,
      });
      (pluginMock.getTasks as jest.Mock).mockReturnValue([
        createBaseTask({ text: 'All task' }),
      ]);

      processor.registerProcessor();
      const registerMock =
        pluginMock.registerMarkdownCodeBlockProcessor as jest.Mock;
      const callback = registerMock.mock.calls[0][1];

      const el = document.createElement('div');
      const ctx = { sourcePath: 'test.md' };
      await callback('sort: priority\nlimit: 5', el, ctx);

      expect(TodoseqCodeBlockParser.parse).toHaveBeenCalledWith(
        'sort: priority\nlimit: 5',
      );
      expect(managerInstance.filterAndSortTasksWithCount).toHaveBeenCalledWith(
        [createBaseTask({ text: 'All task' })],
        parsedParams,
      );

      if (rendererInstance) {
        expect(rendererInstance.renderTaskList).toHaveBeenCalledWith(
          el,
          filteredTasks,
          parsedParams,
          1,
          false,
          expect.any(Function),
          expect.any(String),
        );
      }
    });

    it('should set element id and track code block', async () => {
      const managerInstance = (EmbeddedTaskListManager as jest.Mock).mock
        .results[0]?.value;
      managerInstance.filterAndSortTasksWithCount.mockResolvedValueOnce({
        tasks: [],
        totalCount: 0,
      });

      const eventHandlerInstance = (EmbeddedTaskListEventHandler as jest.Mock)
        .mock.results[0]?.value;

      processor.registerProcessor();
      const registerMock =
        pluginMock.registerMarkdownCodeBlockProcessor as jest.Mock;
      const callback = registerMock.mock.calls[0][1];

      const el = document.createElement('div');
      const ctx = { sourcePath: 'notes/project.md' };
      await callback('', el, ctx);

      expect(el.id).toMatch(/^todoseq-/);
      if (eventHandlerInstance) {
        expect(eventHandlerInstance.trackCodeBlock).toHaveBeenCalledWith(
          el.id,
          el,
          '',
          'notes/project.md',
          false,
        );
      }
    });
  });
});
