import { PluginLifecycleManager } from '../src/plugin-lifecycle';
import { PropertySearchEngine } from '../src/services/property-search-engine';
import { createBaseSettings } from './helpers/test-helper';

// Mock obsidian
jest.mock('obsidian', () => ({
  Editor: jest.fn(),
  MarkdownView: jest.fn().mockImplementation(function () {
    this.file = null;
    this.editor = null;
  }),
  Platform: { isMobile: false },
  PluginSettingTab: jest.fn(),
  Setting: jest.fn().mockImplementation(function () {
    this.setName = jest.fn().mockReturnThis();
    this.setDesc = jest.fn().mockReturnThis();
    this.setHeading = jest.fn().mockReturnThis();
    this.addToggle = jest.fn().mockReturnThis();
    this.addText = jest.fn().mockReturnThis();
    this.addTextArea = jest.fn().mockReturnThis();
    this.addDropdown = jest.fn().mockReturnThis();
  }),
  Notice: jest.fn(),
  TFile: jest.fn(),
  WorkspaceLeaf: jest.fn(),
}));

jest.mock('../src/main', () => ({
  TASK_VIEW_ICON: 'list-todo',
  default: class MockTodoTracker {
    settings = createBaseSettings();
    app = {
      workspace: {
        onLayoutReady: jest.fn(),
        getLeavesOfType: jest.fn().mockReturnValue([]),
        on: jest.fn().mockReturnValue('mock-ref'),
      },
      vault: {
        getMarkdownFiles: jest.fn().mockReturnValue([]),
      },
    };
    keywordManager = {};
    taskStateManager = {
      getTasks: jest.fn().mockReturnValue([]),
      subscribe: jest.fn().mockReturnValue(jest.fn()),
    };
    changeTracker = {};
    vaultScanner = null;
    propertySearchEngine = null;
    eventCoordinator = null;
    taskUpdateCoordinator = null;
    embeddedTaskListProcessor = null;
    taskEditor = null;
    editorKeywordMenu = null;
    statusBarManager = null;
    readerViewFormatter = null;
    taskFormatters = new Map();
    uiManager = {
      setupTaskFormatting: jest.fn(),
      setupTaskKeywordContextMenu: jest.fn(),
      showTasks: jest.fn().mockResolvedValue(undefined),
      refreshOpenTaskListViews: jest.fn().mockResolvedValue(undefined),
      cleanup: jest.fn(),
    };
    getTasks = jest.fn().mockReturnValue([]);
    loadSettings = jest.fn().mockResolvedValue(undefined);
    saveSettings = jest.fn().mockResolvedValue(undefined);
    recreateParser = jest.fn().mockResolvedValue(undefined);
    scanVault = jest.fn().mockResolvedValue(undefined);
    refreshVisibleEditorDecorations = jest.fn();
    refreshReaderViewFormatter = jest.fn();
    refreshAllTaskListViews = jest.fn();
    updateTaskListViewSettings = jest.fn();
    updateTaskUpdateCoordinatorSettings = jest.fn();
    updateTaskWriterKeywordManager = jest.fn();
    register = jest.fn();
    registerView = jest.fn();
    registerEvent = jest.fn().mockReturnValue({ unload: jest.fn() });
    addCommand = jest.fn();
    addSettingTab = jest.fn();
    addRibbonIcon = jest.fn();
    registerMarkdownCodeBlockProcessor = jest.fn();
  },
}));

jest.mock('../src/services/vault-scanner', () => ({
  VaultScanner: jest.fn().mockImplementation(function () {
    this.scanVault = jest.fn().mockResolvedValue(undefined);
    this.destroy = jest.fn();
    this.on = jest.fn();
    this.getKeywordManager = jest.fn().mockReturnValue({});
    this.getParser = jest.fn().mockReturnValue(null);
    this.setPropertySearchEngine = jest.fn();
    this.setInitializationComplete = jest.fn();
  }),
}));

jest.mock('../src/services/task-writer', () => ({
  TaskWriter: jest.fn().mockImplementation(function () {
    this.updateTaskState = jest.fn().mockResolvedValue(undefined);
  }),
}));

jest.mock('../src/view/editor-extensions/editor-keyword-menu', () => ({
  EditorKeywordMenu: jest.fn().mockImplementation(function () {
    this.updateSettings = jest.fn();
  }),
}));

jest.mock('../src/view/editor-extensions/status-bar', () => ({
  StatusBarManager: jest.fn().mockImplementation(function () {
    this.setupStatusBarItem = jest.fn();
    this.updateTaskCount = jest.fn();
    this.cleanup = jest.fn();
  }),
}));

jest.mock('../src/view/task-list/task-list-view', () => ({
  TaskListView: jest.fn().mockImplementation(function () {
    this.updateTasks = jest.fn();
    this.refreshVisibleList = jest.fn().mockResolvedValue(undefined);
  }),
  TaskListViewMode: jest.fn(),
}));

jest.mock('../src/settings/settings', () => ({
  TodoTrackerSettingTab: jest.fn().mockImplementation(function () {
    this.display = jest.fn();
  }),
}));

jest.mock('../src/parser/task-parser', () => ({
  TaskParser: {
    create: jest.fn().mockReturnValue({}),
    validateKeywords: jest.fn(),
  },
}));

jest.mock('../src/parser/org-mode-task-parser', () => ({
  OrgModeTaskParser: {
    create: jest.fn().mockReturnValue({}),
  },
}));

jest.mock('../src/parser/parser-registry', () => ({
  ParserRegistry: jest.fn().mockImplementation(function () {
    this.register = jest.fn();
  }),
}));

jest.mock('../src/view/markdown-renderers/reader-formatting', () => ({
  ReaderViewFormatter: jest.fn().mockImplementation(function () {
    this.registerPostProcessor = jest.fn();
    this.cleanup = jest.fn();
  }),
}));

jest.mock('../src/services/property-search-engine', () => ({
  PropertySearchEngine: {
    getInstance: jest.fn().mockReturnValue({}),
    resetInstance: jest.fn(),
  },
}));

jest.mock('../src/services/event-coordinator', () => ({
  EventCoordinator: jest.fn().mockImplementation(function () {
    this.initialize = jest.fn();
    this.destroy = jest.fn().mockResolvedValue(undefined);
    this.setVaultScanner = jest.fn();
    this.setPropertySearchEngine = jest.fn();
    this.onFileChange = jest.fn();
  }),
}));

jest.mock('../src/services/task-update-coordinator', () => ({
  TaskUpdateCoordinator: jest.fn().mockImplementation(function () {
    this.updateTaskByPath = jest.fn().mockResolvedValue(undefined);
  }),
}));

jest.mock('../src/view/embedded-task-list/code-block-processor', () => ({
  TodoseqCodeBlockProcessor: jest.fn().mockImplementation(function () {
    this.registerProcessor = jest.fn();
    this.cleanup = jest.fn();
    this.refreshAllEmbeddedTaskLists = jest.fn();
    this.updateSettings = jest.fn();
  }),
}));

jest.mock('../src/utils/task-urgency', () => ({
  parseUrgencyCoefficients: jest.fn().mockResolvedValue({}),
}));

describe('PluginLifecycleManager', () => {
  let lifecycleManager: PluginLifecycleManager;
  let pluginMock: Record<string, unknown>;
  let originalAddEventListener: typeof window.addEventListener;
  let originalRemoveEventListener: typeof window.removeEventListener;

  beforeAll(() => {
    originalAddEventListener = window.addEventListener;
    originalRemoveEventListener = window.removeEventListener;
    Object.assign(window, {
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    });
  });

  afterAll(() => {
    Object.assign(window, {
      addEventListener: originalAddEventListener,
      removeEventListener: originalRemoveEventListener,
    });
  });

  beforeEach(() => {
    pluginMock = {
      settings: createBaseSettings(),
      app: {
        workspace: {
          onLayoutReady: jest.fn((callback) => callback()),
          getLeavesOfType: jest.fn().mockReturnValue([]),
          on: jest.fn().mockReturnValue('mock-ref'),
        },
        vault: {
          getMarkdownFiles: jest.fn().mockReturnValue([]),
        },
      },
      keywordManager: {},
      taskStateManager: {
        getTasks: jest.fn().mockReturnValue([]),
        subscribe: jest.fn().mockReturnValue(jest.fn()),
      },
      changeTracker: {},
      vaultScanner: null,
      propertySearchEngine: null,
      eventCoordinator: null,
      taskUpdateCoordinator: null,
      embeddedTaskListProcessor: null,
      taskEditor: null,
      editorKeywordMenu: null,
      statusBarManager: null,
      readerViewFormatter: null,
      taskFormatters: new Map(),
      uiManager: {
        setupTaskFormatting: jest.fn(),
        setupTaskKeywordContextMenu: jest.fn(),
        showTasks: jest.fn().mockResolvedValue(undefined),
        refreshOpenTaskListViews: jest.fn().mockResolvedValue(undefined),
        cleanup: jest.fn(),
      },
      getTasks: jest.fn().mockReturnValue([]),
      loadSettings: jest.fn().mockResolvedValue(undefined),
      saveSettings: jest.fn().mockResolvedValue(undefined),
      recreateParser: jest.fn().mockResolvedValue(undefined),
      scanVault: jest.fn().mockResolvedValue(undefined),
      refreshVisibleEditorDecorations: jest.fn(),
      refreshReaderViewFormatter: jest.fn(),
      refreshAllTaskListViews: jest.fn(),
      updateTaskListViewSettings: jest.fn(),
      updateTaskUpdateCoordinatorSettings: jest.fn(),
      updateTaskWriterKeywordManager: jest.fn(),
      register: jest.fn(),
      registerView: jest.fn(),
      registerEvent: jest.fn().mockReturnValue({ unload: jest.fn() }),
      addCommand: jest.fn(),
      addSettingTab: jest.fn(),
      addRibbonIcon: jest.fn(),
      registerMarkdownCodeBlockProcessor: jest.fn(),
    };

    lifecycleManager = new PluginLifecycleManager(pluginMock as any);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create lifecycle manager with plugin reference', () => {
      expect(lifecycleManager).toBeDefined();
    });
  });

  describe('onload', () => {
    it('should load settings on load', async () => {
      await lifecycleManager.onload();
      expect(pluginMock.loadSettings).toHaveBeenCalled();
    });

    it('should create vault scanner', async () => {
      await lifecycleManager.onload();
      expect(pluginMock.vaultScanner).not.toBeNull();
    });

    it('should initialize event coordinator', async () => {
      await lifecycleManager.onload();
      expect(pluginMock.eventCoordinator).not.toBeNull();
    });

    it('should initialize task update coordinator', async () => {
      await lifecycleManager.onload();
      expect(pluginMock.taskUpdateCoordinator).not.toBeNull();
    });

    it('should initialize embedded task list processor', async () => {
      await lifecycleManager.onload();
      expect(pluginMock.embeddedTaskListProcessor).not.toBeNull();
    });

    it('should register view type', async () => {
      await lifecycleManager.onload();
      expect(pluginMock.registerView).toHaveBeenCalled();
    });

    it('should add commands', async () => {
      await lifecycleManager.onload();
      expect(pluginMock.addCommand).toHaveBeenCalled();
      const calls = (pluginMock.addCommand as jest.Mock).mock.calls;
      // Should have multiple commands
      expect(calls.length).toBeGreaterThan(5);
    });

    it('should add settings tab', async () => {
      await lifecycleManager.onload();
      expect(pluginMock.addSettingTab).toHaveBeenCalled();
    });

    it('should register event listeners for view mode changes', async () => {
      await lifecycleManager.onload();
      expect(pluginMock.register).toHaveBeenCalled();
    });

    it('should set up UI manager formatting', async () => {
      await lifecycleManager.onload();
      expect(
        (pluginMock.uiManager as any).setupTaskFormatting,
      ).toHaveBeenCalled();
    });

    it('should set up context menu', async () => {
      await lifecycleManager.onload();
      expect(
        (pluginMock.uiManager as any).setupTaskKeywordContextMenu,
      ).toHaveBeenCalled();
    });
  });

  describe('onunload', () => {
    it('should detach all task list leaves', async () => {
      const leafMock = { detach: jest.fn() };
      (pluginMock.app as any).workspace.getLeavesOfType = jest
        .fn()
        .mockReturnValue([leafMock]);

      await lifecycleManager.onunload();

      expect(leafMock.detach).toHaveBeenCalled();
    });

    it('should cleanup embedded task list processor', async () => {
      const embeddedProcessorMock = { cleanup: jest.fn() };
      pluginMock.embeddedTaskListProcessor = embeddedProcessorMock;

      await lifecycleManager.onunload();

      expect(embeddedProcessorMock.cleanup).toHaveBeenCalled();
    });

    it('should destroy event coordinator', async () => {
      await lifecycleManager.onload();
      const eventCoordinatorMock = {
        destroy: jest.fn().mockResolvedValue(undefined),
      };
      // Replace the lifecycle manager's internal eventCoordinator reference
      (lifecycleManager as any).eventCoordinator = eventCoordinatorMock;

      await lifecycleManager.onunload();

      expect(eventCoordinatorMock.destroy).toHaveBeenCalled();
    });

    it('should destroy vault scanner', async () => {
      const vaultScannerMock = { destroy: jest.fn() };
      pluginMock.vaultScanner = vaultScannerMock;

      await lifecycleManager.onunload();

      expect(vaultScannerMock.destroy).toHaveBeenCalled();
    });

    it('should reset property search engine', async () => {
      await lifecycleManager.onunload();
      expect(
        (PropertySearchEngine as unknown as { resetInstance: jest.Mock })
          .resetInstance,
      ).toHaveBeenCalled();
    });

    it('should cleanup UI manager', async () => {
      await lifecycleManager.onunload();
      expect((pluginMock.uiManager as any).cleanup).toHaveBeenCalled();
    });

    it('should cleanup status bar manager', async () => {
      const statusBarMock = { cleanup: jest.fn() };
      pluginMock.statusBarManager = statusBarMock;

      await lifecycleManager.onunload();

      expect(statusBarMock.cleanup).toHaveBeenCalled();
    });

    it('should cleanup reader view formatter', async () => {
      const readerFormatterMock = { cleanup: jest.fn() };
      pluginMock.readerViewFormatter = readerFormatterMock;

      await lifecycleManager.onunload();

      expect(readerFormatterMock.cleanup).toHaveBeenCalled();
    });

    it('should clear task formatters', async () => {
      const clearSpy = jest.spyOn(
        pluginMock.taskFormatters as Map<string, unknown>,
        'clear',
      );
      await lifecycleManager.onunload();
      expect(clearSpy).toHaveBeenCalled();
    });
  });
});
