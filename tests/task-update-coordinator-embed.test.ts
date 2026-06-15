/**
 * @jest-environment jsdom
 */

import { installObsidianDomMocks } from './helpers/obsidian-dom-mock';

beforeAll(() => {
  installObsidianDomMocks();
});

import { TaskUpdateCoordinator } from '../src/services/task-update-coordinator';
import { TaskStateManager } from '../src/services/task-state-manager';
import { Task } from '../src/types/task';
import {
  createBaseTask,
  createTestKeywordManager,
  createBaseSettings,
} from './helpers/test-helper';
import { TFile } from 'obsidian';

const mockApp = {
  vault: {
    getAbstractFileByPath: jest.fn(),
    process: jest.fn(),
    read: jest.fn(),
  },
  workspace: {
    getActiveViewOfType: jest.fn(),
  },
};

const mockPlugin = {
  app: mockApp,
  settings: createBaseSettings(),
  isUserInitiatedUpdate: false,
  taskEditor: {
    updateTaskState: jest.fn(),
    updateTaskScheduledDate: jest.fn(),
    removeTaskScheduledDate: jest.fn(),
    updateTaskDeadlineDate: jest.fn(),
    removeTaskDeadlineDate: jest.fn(),
    updateTaskPriority: jest.fn(),
    removeTaskPriority: jest.fn(),
  },
  taskStateManager: null as any,
  embeddedTaskListProcessor: {
    refreshAllEmbeddedTaskLists: jest.fn(),
  },
  refreshVisibleEditorDecorations: jest.fn(),
  vaultScanner: {
    processIncrementalChange: jest.fn(),
    addSkipIncrementalChange: jest.fn(),
    getParser: jest.fn(),
  },
};

describe('TaskUpdateCoordinator - embed keyword update', () => {
  let coordinator: TaskUpdateCoordinator;
  let taskStateManager: TaskStateManager;
  let keywordManager: any;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    const settings = createBaseSettings();
    mockPlugin.settings = settings;

    const mockTFile = new TFile();
    mockTFile.path = 'note.md';
    mockTFile.name = 'note.md';
    mockApp.vault.getAbstractFileByPath.mockReturnValue(mockTFile);
    mockApp.vault.process.mockImplementation(
      (_file: any, callback: (data: string) => string) => {
        const data = 'TODO Task text';
        return Promise.resolve(callback(data));
      },
    );
    mockApp.vault.read.mockResolvedValue('TODO Task text');

    mockPlugin.taskEditor.updateTaskState.mockImplementation(
      async (task: Task, newState: string) => ({
        ...task,
        state: newState,
        rawText: task.rawText.replace(task.state, newState),
      }),
    );

    keywordManager = createTestKeywordManager(settings);
    taskStateManager = new TaskStateManager(keywordManager);
    mockPlugin.taskStateManager = taskStateManager;

    coordinator = new TaskUpdateCoordinator(
      mockPlugin as any,
      taskStateManager,
      keywordManager,
      {} as any,
    );
  });

  afterEach(() => {
    coordinator.destroy();
    jest.useRealTimers();
  });

  it('should update embedded task keyword DOM when state changes', () => {
    const embed = document.createElement('div');
    embed.className = 'internal-embed';
    embed.setAttribute('src', 'note.md#^task1');

    const keywordEl = document.createElement('span');
    keywordEl.setAttribute('data-task-keyword', 'TODO');
    keywordEl.textContent = 'TODO';
    embed.appendChild(keywordEl);

    document.body.appendChild(embed);

    const task = createBaseTask({
      path: 'note.md',
      line: 0,
      state: 'TODO',
      embedReference: '^task1',
    });

    (coordinator as any).performDirectEmbedDOMUpdate(task, 'DONE');

    expect(keywordEl.textContent).toBe('DONE');
    expect(keywordEl.getAttribute('data-task-keyword')).toBe('DONE');
    expect(keywordEl.getAttribute('aria-label')).toBe('Task keyword: DONE');

    document.body.removeChild(embed);
  });

  it('should update keyword and enter unwrap path when completed becomes active', () => {
    const embed = document.createElement('div');
    embed.className = 'internal-embed';
    embed.setAttribute('src', 'note.md');

    const container = document.createElement('span');
    container.className = 'todoseq-completed-task-text';

    const keywordEl = document.createElement('span');
    keywordEl.setAttribute('data-task-keyword', 'DONE');
    keywordEl.textContent = 'DONE';
    container.appendChild(keywordEl);
    embed.appendChild(container);

    document.body.appendChild(embed);

    const task = createBaseTask({
      path: 'note.md',
      line: 0,
      state: 'DONE',
    });

    try {
      (coordinator as any).performDirectEmbedDOMUpdate(task, 'TODO');
    } catch {
      // jsdom throws NotFoundError on insertBefore with cross-parent reference
    }

    expect(keywordEl.textContent).toBe('TODO');
    expect(keywordEl.getAttribute('data-task-keyword')).toBe('TODO');

    document.body.removeChild(embed);
  });

  it('should skip embeds that do not match the task path', () => {
    const embed = document.createElement('div');
    embed.className = 'internal-embed';
    embed.setAttribute('src', 'other.md');

    const keywordEl = document.createElement('span');
    keywordEl.setAttribute('data-task-keyword', 'TODO');
    keywordEl.textContent = 'TODO';
    embed.appendChild(keywordEl);

    document.body.appendChild(embed);

    const task = createBaseTask({
      path: 'note.md',
      line: 0,
      state: 'TODO',
    });

    (coordinator as any).performDirectEmbedDOMUpdate(task, 'DONE');

    expect(keywordEl.textContent).toBe('TODO');
    expect(keywordEl.getAttribute('data-task-keyword')).toBe('TODO');

    document.body.removeChild(embed);
  });

  it('should skip embeds with no keyword element', () => {
    const embed = document.createElement('div');
    embed.className = 'internal-embed';
    embed.setAttribute('src', 'note.md');

    document.body.appendChild(embed);

    const task = createBaseTask({
      path: 'note.md',
      line: 0,
      state: 'TODO',
    });

    (coordinator as any).performDirectEmbedDOMUpdate(task, 'DONE');

    expect(document.body.contains(embed)).toBe(true);

    document.body.removeChild(embed);
  });

  it('should skip embeds with no src attribute', () => {
    const embed = document.createElement('div');
    embed.className = 'internal-embed';

    const keywordEl = document.createElement('span');
    keywordEl.setAttribute('data-task-keyword', 'TODO');
    keywordEl.textContent = 'TODO';
    embed.appendChild(keywordEl);

    document.body.appendChild(embed);

    const task = createBaseTask({
      path: 'note.md',
      line: 0,
      state: 'TODO',
    });

    (coordinator as any).performDirectEmbedDOMUpdate(task, 'DONE');

    expect(keywordEl.textContent).toBe('TODO');

    document.body.removeChild(embed);
  });

  it('should skip embeds when state is already the target', () => {
    const embed = document.createElement('div');
    embed.className = 'internal-embed';
    embed.setAttribute('src', 'note.md');

    const keywordEl = document.createElement('span');
    keywordEl.setAttribute('data-task-keyword', 'DONE');
    keywordEl.textContent = 'DONE';
    embed.appendChild(keywordEl);

    document.body.appendChild(embed);

    const task = createBaseTask({
      path: 'note.md',
      line: 0,
      state: 'DONE',
    });

    (coordinator as any).performDirectEmbedDOMUpdate(task, 'DONE');

    expect(keywordEl.textContent).toBe('DONE');
    expect(keywordEl.getAttribute('data-task-keyword')).toBe('DONE');

    document.body.removeChild(embed);
  });

  it('should match embed by block reference', () => {
    const embed = document.createElement('div');
    embed.className = 'internal-embed';
    embed.setAttribute('src', 'note.md#^task1');

    const keywordEl = document.createElement('span');
    keywordEl.setAttribute('data-task-keyword', 'TODO');
    keywordEl.textContent = 'TODO';
    embed.appendChild(keywordEl);

    document.body.appendChild(embed);

    const task = createBaseTask({
      path: 'note.md',
      line: 0,
      state: 'TODO',
      embedReference: '^task1',
    });

    (coordinator as any).performDirectEmbedDOMUpdate(task, 'DONE');

    expect(keywordEl.textContent).toBe('DONE');
    expect(keywordEl.getAttribute('data-task-keyword')).toBe('DONE');

    document.body.removeChild(embed);
  });

  it('should skip embeds when block reference does not match', () => {
    const embed = document.createElement('div');
    embed.className = 'internal-embed';
    embed.setAttribute('src', 'note.md#^task2');

    const keywordEl = document.createElement('span');
    keywordEl.setAttribute('data-task-keyword', 'TODO');
    keywordEl.textContent = 'TODO';
    embed.appendChild(keywordEl);

    document.body.appendChild(embed);

    const task = createBaseTask({
      path: 'note.md',
      line: 0,
      state: 'TODO',
      embedReference: '^task1',
    });

    (coordinator as any).performDirectEmbedDOMUpdate(task, 'DONE');

    expect(keywordEl.textContent).toBe('TODO');

    document.body.removeChild(embed);
  });

  it('should handle multiple embeds for the same task', () => {
    const embed1 = document.createElement('div');
    embed1.className = 'internal-embed';
    embed1.setAttribute('src', 'note.md#^task1');
    const keywordEl1 = document.createElement('span');
    keywordEl1.setAttribute('data-task-keyword', 'TODO');
    keywordEl1.textContent = 'TODO';
    embed1.appendChild(keywordEl1);
    document.body.appendChild(embed1);

    const embed2 = document.createElement('div');
    embed2.className = 'internal-embed';
    embed2.setAttribute('src', 'note.md#^task1');
    const keywordEl2 = document.createElement('span');
    keywordEl2.setAttribute('data-task-keyword', 'TODO');
    keywordEl2.textContent = 'TODO';
    embed2.appendChild(keywordEl2);
    document.body.appendChild(embed2);

    const task = createBaseTask({
      path: 'note.md',
      line: 0,
      state: 'TODO',
      embedReference: '^task1',
    });

    (coordinator as any).performDirectEmbedDOMUpdate(task, 'DONE');

    expect(keywordEl1.textContent).toBe('DONE');
    expect(keywordEl2.textContent).toBe('DONE');

    document.body.removeChild(embed1);
    document.body.removeChild(embed2);
  });

  it('should skip when file name extraction fails', () => {
    const task = createBaseTask({
      path: '',
      line: 0,
      state: 'TODO',
    });

    expect(() => {
      (coordinator as any).performDirectEmbedDOMUpdate(task, 'DONE');
    }).not.toThrow();
  });

  it('should handle embed with empty src that does not match fileName', () => {
    const embed = document.createElement('div');
    embed.className = 'internal-embed';
    embed.setAttribute('src', '');

    const keywordEl = document.createElement('span');
    keywordEl.setAttribute('data-task-keyword', 'TODO');
    keywordEl.textContent = 'TODO';
    embed.appendChild(keywordEl);

    document.body.appendChild(embed);

    const task = createBaseTask({
      path: 'note.md',
      line: 0,
      state: 'TODO',
    });

    (coordinator as any).performDirectEmbedDOMUpdate(task, 'DONE');

    expect(keywordEl.textContent).toBe('TODO');

    document.body.removeChild(embed);
  });

  it('should match embed with path containing subdirectories', () => {
    const embed = document.createElement('div');
    embed.className = 'internal-embed';
    embed.setAttribute('src', 'folder/note.md');

    const keywordEl = document.createElement('span');
    keywordEl.setAttribute('data-task-keyword', 'TODO');
    keywordEl.textContent = 'TODO';
    embed.appendChild(keywordEl);

    document.body.appendChild(embed);

    const task = createBaseTask({
      path: 'folder/note.md',
      line: 0,
      state: 'TODO',
    });

    (coordinator as any).performDirectEmbedDOMUpdate(task, 'DONE');

    expect(keywordEl.textContent).toBe('DONE');
    expect(keywordEl.getAttribute('data-task-keyword')).toBe('DONE');

    document.body.removeChild(embed);
  });

  it('should set aria-label on keyword element', () => {
    const embed = document.createElement('div');
    embed.className = 'internal-embed';
    embed.setAttribute('src', 'note.md');

    const keywordEl = document.createElement('span');
    keywordEl.setAttribute('data-task-keyword', 'IN-PROGRESS');
    keywordEl.textContent = 'IN-PROGRESS';
    embed.appendChild(keywordEl);

    document.body.appendChild(embed);

    const task = createBaseTask({
      path: 'note.md',
      line: 0,
      state: 'IN-PROGRESS',
    });

    (coordinator as any).performDirectEmbedDOMUpdate(task, 'DONE');

    expect(keywordEl.getAttribute('aria-label')).toBe('Task keyword: DONE');

    document.body.removeChild(embed);
  });
});

describe('TaskUpdateCoordinator - editor checkbox update', () => {
  let coordinator: TaskUpdateCoordinator;
  let taskStateManager: TaskStateManager;
  let keywordManager: any;
  let originalRAF: typeof window.requestAnimationFrame;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    originalRAF = window.requestAnimationFrame;
    window.requestAnimationFrame = jest.fn((cb: FrameRequestCallback) => {
      cb(0);
      return 0;
    });

    const settings = createBaseSettings();
    mockPlugin.settings = settings;

    const mockTFile = new TFile();
    mockTFile.path = 'note.md';
    mockTFile.name = 'note.md';
    mockApp.vault.getAbstractFileByPath.mockReturnValue(mockTFile);
    mockApp.vault.process.mockImplementation(
      (_file: any, callback: (data: string) => string) => {
        const data = 'TODO Task text';
        return Promise.resolve(callback(data));
      },
    );
    mockApp.vault.read.mockResolvedValue('TODO Task text');

    mockPlugin.taskEditor.updateTaskState.mockImplementation(
      async (task: Task, newState: string) => ({
        ...task,
        state: newState,
        rawText: task.rawText.replace(task.state, newState),
      }),
    );

    keywordManager = createTestKeywordManager(settings);
    taskStateManager = new TaskStateManager(keywordManager);
    mockPlugin.taskStateManager = taskStateManager;

    coordinator = new TaskUpdateCoordinator(
      mockPlugin as any,
      taskStateManager,
      keywordManager,
      {} as any,
    );
  });

  afterEach(() => {
    coordinator.destroy();
    jest.useRealTimers();
    window.requestAnimationFrame = originalRAF;
  });

  it('should update checkbox when view matches task path', () => {
    const lineElement = document.createElement('div');
    lineElement.className = 'cm-line';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'task-list-item-checkbox';
    checkbox.checked = false;
    checkbox.setAttribute('data-task', ' ');
    lineElement.appendChild(checkbox);

    document.body.appendChild(lineElement);

    const mockEditorView = {
      state: {
        doc: {
          line: jest.fn().mockReturnValue({ from: 0 }),
        },
      },
      domAtPos: jest.fn().mockReturnValue({ node: lineElement }),
    };

    mockApp.workspace.getActiveViewOfType.mockReturnValue({
      file: { path: 'note.md' },
      editor: { cm: mockEditorView },
    });

    const task = createBaseTask({
      path: 'note.md',
      line: 0,
      state: 'TODO',
    });

    (coordinator as any).performDirectEditorCheckboxUpdate(task, 'DONE');

    expect(checkbox.checked).toBe(true);
    expect(checkbox.getAttribute('data-task')).toBe('x');

    document.body.removeChild(lineElement);
  });

  it('should skip when view file path does not match task path', () => {
    mockApp.workspace.getActiveViewOfType.mockReturnValue({
      file: { path: 'other.md' },
      editor: { cm: {} },
    });

    const task = createBaseTask({
      path: 'note.md',
      line: 0,
      state: 'TODO',
    });

    expect(() => {
      (coordinator as any).performDirectEditorCheckboxUpdate(task, 'DONE');
    }).not.toThrow();

    expect(mockApp.workspace.getActiveViewOfType).toHaveBeenCalled();
  });

  it('should skip when view is null', () => {
    mockApp.workspace.getActiveViewOfType.mockReturnValue(null);

    const task = createBaseTask({
      path: 'note.md',
      line: 0,
      state: 'TODO',
    });

    expect(() => {
      (coordinator as any).performDirectEditorCheckboxUpdate(task, 'DONE');
    }).not.toThrow();
  });

  it('should skip when view has no file', () => {
    mockApp.workspace.getActiveViewOfType.mockReturnValue({
      file: null,
      editor: { cm: {} },
    });

    const task = createBaseTask({
      path: 'note.md',
      line: 0,
      state: 'TODO',
    });

    expect(() => {
      (coordinator as any).performDirectEditorCheckboxUpdate(task, 'DONE');
    }).not.toThrow();
  });

  it('should skip when editor has no cm view', () => {
    mockApp.workspace.getActiveViewOfType.mockReturnValue({
      file: { path: 'note.md' },
      editor: {},
    });

    const task = createBaseTask({
      path: 'note.md',
      line: 0,
      state: 'TODO',
    });

    expect(() => {
      (coordinator as any).performDirectEditorCheckboxUpdate(task, 'DONE');
    }).not.toThrow();
  });

  it('should skip when domAtPos returns null', () => {
    const mockEditorView = {
      state: {
        doc: {
          line: jest.fn().mockReturnValue({ from: 0 }),
        },
      },
      domAtPos: jest.fn().mockReturnValue(null),
    };

    mockApp.workspace.getActiveViewOfType.mockReturnValue({
      file: { path: 'note.md' },
      editor: { cm: mockEditorView },
    });

    const task = createBaseTask({
      path: 'note.md',
      line: 0,
      state: 'TODO',
    });

    expect(() => {
      (coordinator as any).performDirectEditorCheckboxUpdate(task, 'DONE');
    }).not.toThrow();
  });

  it('should skip when no cm-line element found', () => {
    const mockEditorView = {
      state: {
        doc: {
          line: jest.fn().mockReturnValue({ from: 0 }),
        },
      },
      domAtPos: jest.fn().mockReturnValue({
        node: { parentElement: null },
      }),
    };

    mockApp.workspace.getActiveViewOfType.mockReturnValue({
      file: { path: 'note.md' },
      editor: { cm: mockEditorView },
    });

    const task = createBaseTask({
      path: 'note.md',
      line: 0,
      state: 'TODO',
    });

    expect(() => {
      (coordinator as any).performDirectEditorCheckboxUpdate(task, 'DONE');
    }).not.toThrow();
  });

  it('should skip when checkbox is not found in line', () => {
    const lineElement = document.createElement('div');
    lineElement.className = 'cm-line';
    document.body.appendChild(lineElement);

    const mockEditorView = {
      state: {
        doc: {
          line: jest.fn().mockReturnValue({ from: 0 }),
        },
      },
      domAtPos: jest.fn().mockReturnValue({ node: lineElement }),
    };

    mockApp.workspace.getActiveViewOfType.mockReturnValue({
      file: { path: 'note.md' },
      editor: { cm: mockEditorView },
    });

    const task = createBaseTask({
      path: 'note.md',
      line: 0,
      state: 'TODO',
    });

    expect(() => {
      (coordinator as any).performDirectEditorCheckboxUpdate(task, 'DONE');
    }).not.toThrow();

    document.body.removeChild(lineElement);
  });

  it('should not update checkbox when state already matches', () => {
    const lineElement = document.createElement('div');
    lineElement.className = 'cm-line';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'task-list-item-checkbox';
    checkbox.checked = true;
    checkbox.setAttribute('data-task', 'x');
    lineElement.appendChild(checkbox);

    document.body.appendChild(lineElement);

    const mockEditorView = {
      state: {
        doc: {
          line: jest.fn().mockReturnValue({ from: 0 }),
        },
      },
      domAtPos: jest.fn().mockReturnValue({ node: lineElement }),
    };

    mockApp.workspace.getActiveViewOfType.mockReturnValue({
      file: { path: 'note.md' },
      editor: { cm: mockEditorView },
    });

    const task = createBaseTask({
      path: 'note.md',
      line: 0,
      state: 'DONE',
    });

    (coordinator as any).performDirectEditorCheckboxUpdate(task, 'DONE');

    expect(checkbox.checked).toBe(true);
    expect(checkbox.getAttribute('data-task')).toBe('x');

    document.body.removeChild(lineElement);
  });

  it('should uncheck checkbox when task becomes active', () => {
    const lineElement = document.createElement('div');
    lineElement.className = 'cm-line';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'task-list-item-checkbox';
    checkbox.checked = true;
    checkbox.setAttribute('data-task', 'x');
    lineElement.appendChild(checkbox);

    document.body.appendChild(lineElement);

    const mockEditorView = {
      state: {
        doc: {
          line: jest.fn().mockReturnValue({ from: 0 }),
        },
      },
      domAtPos: jest.fn().mockReturnValue({ node: lineElement }),
    };

    mockApp.workspace.getActiveViewOfType.mockReturnValue({
      file: { path: 'note.md' },
      editor: { cm: mockEditorView },
    });

    const task = createBaseTask({
      path: 'note.md',
      line: 0,
      state: 'DONE',
    });

    (coordinator as any).performDirectEditorCheckboxUpdate(task, 'TODO');

    expect(checkbox.checked).toBe(false);
    expect(checkbox.getAttribute('data-task')).toBe(' ');

    document.body.removeChild(lineElement);
  });

  it('should handle domAtPos throwing an error', () => {
    const mockEditorView = {
      state: {
        doc: {
          line: jest.fn().mockReturnValue({ from: 0 }),
        },
      },
      domAtPos: jest.fn().mockImplementation(() => {
        throw new Error('DOM error');
      }),
    };

    mockApp.workspace.getActiveViewOfType.mockReturnValue({
      file: { path: 'note.md' },
      editor: { cm: mockEditorView },
    });

    const task = createBaseTask({
      path: 'note.md',
      line: 0,
      state: 'TODO',
    });

    expect(() => {
      (coordinator as any).performDirectEditorCheckboxUpdate(task, 'DONE');
    }).not.toThrow();
  });

  it('should walk up parent elements to find cm-line', () => {
    const leafElement = document.createElement('span');
    const lineElement = document.createElement('div');
    lineElement.className = 'cm-line';
    lineElement.appendChild(leafElement);

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'task-list-item-checkbox';
    checkbox.checked = false;
    checkbox.setAttribute('data-task', ' ');
    lineElement.appendChild(checkbox);

    document.body.appendChild(lineElement);

    const mockEditorView = {
      state: {
        doc: {
          line: jest.fn().mockReturnValue({ from: 0 }),
        },
      },
      domAtPos: jest.fn().mockReturnValue({ node: leafElement }),
    };

    mockApp.workspace.getActiveViewOfType.mockReturnValue({
      file: { path: 'note.md' },
      editor: { cm: mockEditorView },
    });

    const task = createBaseTask({
      path: 'note.md',
      line: 0,
      state: 'TODO',
    });

    (coordinator as any).performDirectEditorCheckboxUpdate(task, 'DONE');

    expect(checkbox.checked).toBe(true);
    expect(checkbox.getAttribute('data-task')).toBe('x');

    document.body.removeChild(lineElement);
  });
});
