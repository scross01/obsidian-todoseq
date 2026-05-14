/**
 * @jest-environment jsdom
 */

import { getDropAction } from '../src/view/task-list/task-drag-drop';
import {
  buildRemovalRange,
  modifyLinesForMigration,
  findSubtaskEnd,
  extractSubtaskLines,
} from '../src/utils/task-sub-bullets';

describe('getDropAction', () => {
  it('returns copy with no modifiers', () => {
    expect(getDropAction(false, false, false)).toBe('copy');
  });

  it('returns copy with only Ctrl key', () => {
    expect(getDropAction(true, false, false)).toBe('copy');
  });

  it('returns copy with only Meta key', () => {
    expect(getDropAction(false, true, false)).toBe('copy');
  });

  it('returns move with Alt key', () => {
    expect(getDropAction(false, false, true)).toBe('move');
  });

  it('returns move with Alt+Meta', () => {
    expect(getDropAction(false, true, true)).toBe('move');
  });

  it('returns migrate with Ctrl+Alt', () => {
    expect(getDropAction(true, false, true)).toBe('migrate');
  });

  it('returns migrate with all modifiers', () => {
    expect(getDropAction(true, true, true)).toBe('migrate');
  });
});

describe('buildRemovalRange', () => {
  it('returns single line range when no date lines follow', () => {
    const lines = ['TODO some task', 'NEXT_LINE content', 'ANOTHER line'];
    expect(buildRemovalRange(lines, 0)).toEqual({ start: 0, end: 0 });
  });

  it('includes SCHEDULED line', () => {
    const lines = [
      'TODO some task',
      'SCHEDULED: <2026-04-02 Thu>',
      'NEXT_LINE content',
    ];
    expect(buildRemovalRange(lines, 0)).toEqual({ start: 0, end: 1 });
  });

  it('includes DEADLINE line', () => {
    const lines = [
      'TODO some task',
      'DEADLINE: <2026-04-03 Fri>',
      'NEXT_LINE content',
    ];
    expect(buildRemovalRange(lines, 0)).toEqual({ start: 0, end: 1 });
  });

  it('includes both SCHEDULED and DEADLINE lines', () => {
    const lines = [
      'TODO some task',
      'SCHEDULED: <2026-04-02 Thu>',
      'DEADLINE: <2026-04-03 Fri>',
      'NEXT_LINE content',
    ];
    expect(buildRemovalRange(lines, 0)).toEqual({ start: 0, end: 2 });
  });

  it('stops at first non-date line', () => {
    const lines = [
      'some other line',
      'TODO some task',
      'SCHEDULED: <2026-04-02 Thu>',
      'NOT A DATE',
      'DEADLINE: <2026-04-03 Fri>',
    ];
    expect(buildRemovalRange(lines, 1)).toEqual({ start: 1, end: 2 });
  });

  it('handles task at end of file with no trailing lines', () => {
    const lines = ['some other line', 'TODO some task'];
    expect(buildRemovalRange(lines, 1)).toEqual({ start: 1, end: 1 });
  });

  it('handles task at end of file with date lines', () => {
    const lines = [
      'some other line',
      'TODO some task',
      'SCHEDULED: <2026-04-02 Thu>',
      'DEADLINE: <2026-04-03 Fri>',
    ];
    expect(buildRemovalRange(lines, 1)).toEqual({ start: 1, end: 3 });
  });

  it('handles indented SCHEDULED/DEADLINE with leading whitespace', () => {
    const lines = [
      'TODO some task',
      '  SCHEDULED: <2026-04-02 Thu>',
      '  DEADLINE: <2026-04-03 Fri>',
      'NEXT content',
    ];
    expect(buildRemovalRange(lines, 0)).toEqual({ start: 0, end: 2 });
  });

  it('stops at CLOSED line (not a date line to remove)', () => {
    const lines = [
      'TODO some task',
      'SCHEDULED: <2026-04-02 Thu>',
      'CLOSED: [2026-04-01 Wed]',
      'DEADLINE: <2026-04-03 Fri>',
    ];
    expect(buildRemovalRange(lines, 0)).toEqual({ start: 0, end: 1 });
  });
});

describe('modifyLinesForMigration', () => {
  it('replaces keyword with migrate state', () => {
    const lines = ['TODO buy groceries', 'other content'];
    const result = modifyLinesForMigration(lines, 0, 'TODO', 'DONE');
    expect(result).toEqual(['DONE buy groceries', 'other content']);
  });

  it('replaces keyword and removes SCHEDULED line', () => {
    const lines = [
      'TODO buy groceries',
      'SCHEDULED: <2026-04-02 Thu>',
      'other content',
    ];
    const result = modifyLinesForMigration(lines, 0, 'TODO', 'DONE');
    expect(result).toEqual(['DONE buy groceries', 'other content']);
  });

  it('replaces keyword and removes DEADLINE line', () => {
    const lines = [
      'TODO buy groceries',
      'DEADLINE: <2026-04-03 Fri>',
      'other content',
    ];
    const result = modifyLinesForMigration(lines, 0, 'TODO', 'DONE');
    expect(result).toEqual(['DONE buy groceries', 'other content']);
  });

  it('replaces keyword and removes both SCHEDULED and DEADLINE lines', () => {
    const lines = [
      'TODO buy groceries',
      'SCHEDULED: <2026-04-02 Thu> +1w',
      'DEADLINE: <2026-04-03 Fri>',
      'other content',
    ];
    const result = modifyLinesForMigration(lines, 0, 'TODO', 'MIGRATED');
    expect(result).toEqual(['MIGRATED buy groceries', 'other content']);
  });

  it('removes keyword entirely when migrateState is empty string', () => {
    const lines = [
      'TODO buy groceries',
      'SCHEDULED: <2026-04-02 Thu>',
      'other content',
    ];
    const result = modifyLinesForMigration(lines, 0, 'TODO', '');
    expect(result).toEqual(['buy groceries', 'other content']);
  });

  it('handles task with no date lines (keyword change only)', () => {
    const lines = ['DOING write tests', 'other content'];
    const result = modifyLinesForMigration(lines, 0, 'DOING', 'DONE');
    expect(result).toEqual(['DONE write tests', 'other content']);
  });

  it('handles task with list marker', () => {
    const lines = [
      '- TODO buy groceries',
      'SCHEDULED: <2026-04-02 Thu>',
      'other content',
    ];
    const result = modifyLinesForMigration(lines, 0, 'TODO', 'DONE');
    expect(result).toEqual(['- DONE buy groceries', 'other content']);
  });

  it('handles task with priority', () => {
    const lines = [
      'TODO [#A] important task',
      'SCHEDULED: <2026-04-02 Thu>',
      'other content',
    ];
    const result = modifyLinesForMigration(lines, 0, 'TODO', 'DONE');
    expect(result).toEqual(['DONE [#A] important task', 'other content']);
  });

  it('handles task with indented date lines', () => {
    const lines = [
      'TODO buy groceries',
      '  SCHEDULED: <2026-04-02 Thu>',
      '  DEADLINE: <2026-04-03 Fri>',
      'other content',
    ];
    const result = modifyLinesForMigration(lines, 0, 'TODO', 'DONE');
    expect(result).toEqual(['DONE buy groceries', 'other content']);
  });

  it('preserves lines before and after the task', () => {
    const lines = [
      '# Header',
      'TODO buy groceries',
      'SCHEDULED: <2026-04-02 Thu>',
      'DEADLINE: <2026-04-03 Fri>',
      '- [ ] subtask',
      '# Another section',
    ];
    const result = modifyLinesForMigration(lines, 1, 'TODO', 'DONE');
    expect(result).toEqual([
      '# Header',
      'DONE buy groceries',
      '- [ ] subtask',
      '# Another section',
    ]);
  });

  it('handles case-insensitive keyword replacement', () => {
    const lines = ['todo buy groceries', 'other content'];
    const result = modifyLinesForMigration(lines, 0, 'todo', 'DONE');
    expect(result).toEqual(['DONE buy groceries', 'other content']);
  });

  it('handles task at end of file with date lines', () => {
    const lines = [
      '# Header',
      'TODO buy groceries',
      'SCHEDULED: <2026-04-02 Thu>',
    ];
    const result = modifyLinesForMigration(lines, 1, 'TODO', 'DONE');
    expect(result).toEqual(['# Header', 'DONE buy groceries']);
  });

  it('handles empty migrateState removing keyword with list marker', () => {
    const lines = ['- TODO buy groceries', 'SCHEDULED: <2026-04-02 Thu>'];
    const result = modifyLinesForMigration(lines, 0, 'TODO', '');
    expect(result).toEqual(['- buy groceries']);
  });
});

describe('findSubtaskEnd', () => {
  it('returns afterLine when no subtasks follow', () => {
    const lines = ['TODO task', 'NEXT_LINE'];
    expect(findSubtaskEnd(lines, 0, '')).toBe(0);
  });

  it('includes indented subtask lines', () => {
    const lines = [
      'TODO task',
      'SCHEDULED: <2026-04-02 Thu>',
      '  - [ ] subtask 1',
      '  - [x] subtask 2',
      'NEXT_LINE',
    ];
    expect(findSubtaskEnd(lines, 1, '')).toBe(3);
  });

  it('stops at empty line', () => {
    const lines = ['TODO task', '  - [ ] subtask 1', '', '  - [ ] subtask 2'];
    expect(findSubtaskEnd(lines, 0, '')).toBe(1);
  });

  it('stops at line with same indent as parent', () => {
    const lines = ['TODO task', '  - [ ] subtask 1', 'NEXT task'];
    expect(findSubtaskEnd(lines, 0, '')).toBe(1);
  });

  it('stops at line with less indent than parent', () => {
    const lines = ['  TODO task', '    - [ ] subtask 1', 'NEXT task'];
    expect(findSubtaskEnd(lines, 0, '  ')).toBe(1);
  });

  it('handles indented parent task with deeper subtasks', () => {
    const lines = [
      '    TODO task',
      '    SCHEDULED: <2026-04-02 Thu>',
      '      - [ ] subtask 1',
      '      - [x] subtask 2',
      'NEXT',
    ];
    expect(findSubtaskEnd(lines, 1, '    ')).toBe(3);
  });

  it('returns afterLine when next line is not indented', () => {
    const lines = ['TODO task', 'NEXT_LINE'];
    expect(findSubtaskEnd(lines, 0, '')).toBe(0);
  });

  it('handles subtasks at end of file', () => {
    const lines = ['TODO task', '  - [ ] subtask 1', '  - [x] subtask 2'];
    expect(findSubtaskEnd(lines, 0, '')).toBe(2);
  });
});

describe('extractSubtaskLines', () => {
  it('returns empty array when no subtasks', () => {
    const lines = ['TODO task', 'NEXT_LINE'];
    expect(extractSubtaskLines(lines, 0, '')).toEqual([]);
  });

  it('extracts subtask lines with parent indent stripped', () => {
    const lines = [
      'TODO task',
      'SCHEDULED: <2026-04-02 Thu>',
      '  - [ ] subtask 1',
      '  - [x] subtask 2',
      'NEXT',
    ];
    expect(extractSubtaskLines(lines, 1, '')).toEqual([
      '  - [ ] subtask 1',
      '  - [x] subtask 2',
    ]);
  });

  it('strips parent indent from subtask lines', () => {
    const lines = [
      '    TODO task',
      '    SCHEDULED: <2026-04-02 Thu>',
      '      - [ ] subtask 1',
      '      - [x] subtask 2',
      'NEXT',
    ];
    expect(extractSubtaskLines(lines, 1, '    ')).toEqual([
      '  - [ ] subtask 1',
      '  - [x] subtask 2',
    ]);
  });

  it('returns empty when subtasks are at same indent as parent', () => {
    const lines = [
      '  TODO task',
      '  SCHEDULED: <2026-04-02 Thu>',
      '  - [ ] not a subtask (same indent)',
    ];
    expect(extractSubtaskLines(lines, 1, '  ', true)).toEqual([]);
  });
});

import {
  getDropEffect,
  TaskDragDropHandler,
  TaskDragDropCallbacks,
} from '../src/view/task-list/task-drag-drop';
import { installObsidianDomMocks } from './helpers/obsidian-dom-mock';
import { createBaseTask } from './helpers/test-helper';
import { App, TFile, Notice, MarkdownView, Platform } from 'obsidian';

jest.mock('@codemirror/view', () => ({
  EditorView: class EditorView {
    state: any = { doc: { lineAt: jest.fn() } };
    posAtCoords = jest.fn();
  },
}));

jest.mock('../src/main', () => ({
  __esModule: true,
  default: class TodoTracker {
    settings = { migrateToTodayState: 'MIGRATED' };
  },
}));

// Capture all Notice instances for assertions
const noticeInstances: Array<{ message: string; timeout?: number }> = [];

(Notice as any).instances = noticeInstances;

beforeAll(() => {
  installObsidianDomMocks();
});

beforeEach(() => {
  noticeInstances.length = 0;
  (Notice as any).instances = noticeInstances;
});

function createMockApp(): App {
  const app = new App();
  (app as any).workspace = {
    on: jest.fn().mockReturnValue('editor-drop-ref'),
    offref: jest.fn(),
    getActiveViewOfType: jest.fn(),
  };
  return app;
}

function createMockPlugin(settingsOverrides: Record<string, unknown> = {}) {
  return {
    settings: {
      migrateToTodayState: 'MIGRATED',
      ...settingsOverrides,
    },
  };
}

function createMockEditor() {
  return {
    getCursor: jest.fn().mockReturnValue({ line: 0, ch: 0 }),
    getLine: jest.fn().mockReturnValue(''),
    replaceRange: jest.fn(),
  };
}

function createTaskItemElement(path: string, line: number): HTMLElement {
  const el = activeDocument.createElement('div');
  el.className = 'todoseq-task-item';
  el.setAttribute('data-path', path);
  el.setAttribute('data-line', String(line));
  return el;
}

function createMockDataTransfer(): DataTransfer {
  const dt = {
    setData: jest.fn(),
    getData: jest.fn(),
    effectAllowed: '',
    setDragImage: jest.fn(),
    dropEffect: 'none',
    types: [] as string[],
    files: [] as File[],
    items: [] as DataTransferItem[],
    clearData: jest.fn(),
  };
  return dt as unknown as DataTransfer;
}

function createDragEvent(
  type: string,
  options: Partial<DragEventInit> & { dataTransfer?: DataTransfer } = {},
): DragEvent {
  const event = new DragEvent(type, options as DragEventInit);
  if (options.dataTransfer) {
    Object.defineProperty(event, 'dataTransfer', {
      value: options.dataTransfer,
      writable: false,
      configurable: true,
    });
  }
  return event;
}

describe('getDropEffect', () => {
  it('returns copy for copy action', () => {
    expect(getDropEffect('copy')).toBe('copy');
  });

  it('returns move for move action', () => {
    expect(getDropEffect('move')).toBe('move');
  });

  it('returns link for migrate action', () => {
    expect(getDropEffect('migrate')).toBe('link');
  });
});

describe('TaskDragDropHandler', () => {
  let handler: TaskDragDropHandler;
  let containerEl: HTMLElement;
  let mockApp: App;
  let mockPlugin: ReturnType<typeof createMockPlugin>;
  let callbacks: TaskDragDropCallbacks;
  let mockEditor: ReturnType<typeof createMockEditor>;

  beforeEach(() => {
    activeDocument.body.innerHTML = '';
    mockApp = createMockApp();
    mockPlugin = createMockPlugin();
    mockEditor = createMockEditor();
    containerEl = activeDocument.createElement('div');
    activeDocument.body.appendChild(containerEl);

    callbacks = {
      onGetTask: jest.fn(),
    };

    handler = new TaskDragDropHandler(
      mockApp,
      mockPlugin as any,
      containerEl,
    );
  });

  afterEach(() => {
    handler.destroy();
    activeDocument.body.innerHTML = '';
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create a handler instance', () => {
      expect(handler).toBeInstanceOf(TaskDragDropHandler);
    });
  });

  describe('initialize', () => {
    it('should register event listeners on container', () => {
      const addEventListenerSpy = jest.spyOn(containerEl, 'addEventListener');
      handler.initialize(callbacks);
      expect(addEventListenerSpy).toHaveBeenCalledWith(
        'dragstart',
        expect.any(Function),
      );
      expect(addEventListenerSpy).toHaveBeenCalledWith(
        'dragend',
        expect.any(Function),
      );
    });

    it('should register key listeners on document', () => {
      const addEventListenerSpy = jest.spyOn(
        activeDocument,
        'addEventListener',
      );
      handler.initialize(callbacks);
      expect(addEventListenerSpy).toHaveBeenCalledWith(
        'keydown',
        expect.any(Function),
        true,
      );
      expect(addEventListenerSpy).toHaveBeenCalledWith(
        'keyup',
        expect.any(Function),
        true,
      );
    });

    it('should register editor-drop on workspace', () => {
      handler.initialize(callbacks);
      expect((mockApp as any).workspace.on).toHaveBeenCalledWith(
        'editor-drop',
        expect.any(Function),
      );
    });

    it('should store callbacks reference', () => {
      handler.initialize(callbacks);
      expect((handler as any).callbacks).toBe(callbacks);
    });

    it('should return early on mobile without registering listeners', () => {
      const originalIsMobile = Platform.isMobile;
      Platform.isMobile = true;

      const addEventListenerSpy = jest.spyOn(containerEl, 'addEventListener');
      handler.initialize(callbacks);

      expect(addEventListenerSpy).not.toHaveBeenCalled();
      expect((mockApp as any).workspace.on).not.toHaveBeenCalled();

      Platform.isMobile = originalIsMobile;
    });
  });

  describe('destroy', () => {
    it('should remove container listeners', () => {
      handler.initialize(callbacks);
      const removeEventListenerSpy = jest.spyOn(
        containerEl,
        'removeEventListener',
      );
      handler.destroy();
      expect(removeEventListenerSpy).toHaveBeenCalledWith(
        'dragstart',
        expect.any(Function),
      );
      expect(removeEventListenerSpy).toHaveBeenCalledWith(
        'dragend',
        expect.any(Function),
      );
    });

    it('should remove key listeners', () => {
      handler.initialize(callbacks);
      const removeEventListenerSpy = jest.spyOn(
        activeDocument,
        'removeEventListener',
      );
      handler.destroy();
      expect(removeEventListenerSpy).toHaveBeenCalledWith(
        'keydown',
        expect.any(Function),
        true,
      );
      expect(removeEventListenerSpy).toHaveBeenCalledWith(
        'keyup',
        expect.any(Function),
        true,
      );
    });

    it('should unregister workspace ref', () => {
      handler.initialize(callbacks);
      handler.destroy();
      expect((mockApp as any).workspace.offref).toHaveBeenCalledWith(
        'editor-drop-ref',
      );
    });

    it('should reset internal state', () => {
      handler.initialize(callbacks);
      (handler as any).draggedTask = createBaseTask();
      (handler as any).currentAction = 'move';
      handler.destroy();
      expect((handler as any).draggedTask).toBeNull();
      expect((handler as any).currentAction).toBe('copy');
      expect((handler as any).callbacks).toBeNull();
    });

    it('should remove drag overlay if present', () => {
      handler.initialize(callbacks);
      const overlay = activeDocument.createElement('div');
      overlay.className = 'todoseq-drag-overlay';
      activeDocument.body.appendChild(overlay);
      (handler as any).dragImageEl = overlay;
      handler.destroy();
      expect(activeDocument.body.contains(overlay)).toBe(false);
    });
  });

  describe('onDragStart', () => {
    beforeEach(() => {
      handler.initialize(callbacks);
    });

    it('should set draggedTask when starting drag from a task item', () => {
      const task = createBaseTask({ path: 'test.md', line: 5 });
      callbacks.onGetTask.mockReturnValue(task);

      const taskEl = createTaskItemElement('test.md', 5);
      containerEl.appendChild(taskEl);

      const dt = createMockDataTransfer();
      const event = createDragEvent('dragstart', {
        bubbles: true,
        clientX: 100,
        clientY: 200,
        dataTransfer: dt,
      });
      taskEl.dispatchEvent(event);

      expect(callbacks.onGetTask).toHaveBeenCalledWith('test.md', 5);
      expect((handler as any).draggedTask).toBe(task);
    });

    it('should add dragging class to task element', () => {
      const task = createBaseTask({ path: 'test.md', line: 5 });
      callbacks.onGetTask.mockReturnValue(task);

      const taskEl = createTaskItemElement('test.md', 5);
      containerEl.appendChild(taskEl);

      const dt = createMockDataTransfer();
      const event = createDragEvent('dragstart', {
        bubbles: true,
        clientX: 100,
        clientY: 200,
        dataTransfer: dt,
      });
      taskEl.dispatchEvent(event);

      expect(taskEl.hasClass('todoseq-task-dragging')).toBe(true);
    });

    it('should set dataTransfer with task state and text', () => {
      const task = createBaseTask({
        path: 'test.md',
        line: 5,
        state: 'TODO',
        text: 'Buy milk',
      });
      callbacks.onGetTask.mockReturnValue(task);

      const taskEl = createTaskItemElement('test.md', 5);
      containerEl.appendChild(taskEl);

      const dt = createMockDataTransfer();
      const event = createDragEvent('dragstart', {
        bubbles: true,
        clientX: 100,
        clientY: 200,
        dataTransfer: dt,
      });
      taskEl.dispatchEvent(event);

      expect(dt.setData).toHaveBeenCalledWith('text/plain', 'TODO Buy milk');
      expect(dt.effectAllowed).toBe('all');
    });

    it('should create drag overlay', () => {
      const task = createBaseTask({ path: 'test.md', line: 5 });
      callbacks.onGetTask.mockReturnValue(task);

      const taskEl = createTaskItemElement('test.md', 5);
      containerEl.appendChild(taskEl);

      const dt = createMockDataTransfer();
      const event = createDragEvent('dragstart', {
        bubbles: true,
        clientX: 100,
        clientY: 200,
        dataTransfer: dt,
      });
      taskEl.dispatchEvent(event);

      const overlay = activeDocument.querySelector('.todoseq-drag-overlay');
      expect(overlay).not.toBeNull();
      expect(overlay!.textContent).toContain('TODO');
    });

    it('should do nothing when target is not a task item', () => {
      const unrelatedEl = activeDocument.createElement('div');
      unrelatedEl.className = 'unrelated';
      containerEl.appendChild(unrelatedEl);

      const dt = createMockDataTransfer();
      const event = createDragEvent('dragstart', {
        bubbles: true,
        clientX: 100,
        clientY: 200,
        dataTransfer: dt,
      });
      unrelatedEl.dispatchEvent(event);

      expect((handler as any).draggedTask).toBeNull();
    });

    it('should do nothing when data-line is missing', () => {
      const taskEl = activeDocument.createElement('div');
      taskEl.className = 'todoseq-task-item';
      taskEl.setAttribute('data-path', 'test.md');
      containerEl.appendChild(taskEl);

      const dt = createMockDataTransfer();
      const event = createDragEvent('dragstart', {
        bubbles: true,
        clientX: 100,
        clientY: 200,
        dataTransfer: dt,
      });
      taskEl.dispatchEvent(event);

      expect(callbacks.onGetTask).not.toHaveBeenCalled();
    });

    it('should do nothing when onGetTask returns no task', () => {
      callbacks.onGetTask.mockReturnValue(undefined);

      const taskEl = createTaskItemElement('test.md', 5);
      containerEl.appendChild(taskEl);

      const dt = createMockDataTransfer();
      const event = createDragEvent('dragstart', {
        bubbles: true,
        clientX: 100,
        clientY: 200,
        dataTransfer: dt,
      });
      taskEl.dispatchEvent(event);

      expect((handler as any).draggedTask).toBeNull();
    });
  });

  describe('onDragEnd', () => {
    beforeEach(() => {
      handler.initialize(callbacks);
    });

    it('should remove dragging class and clean up', () => {
      const task = createBaseTask({ path: 'test.md', line: 5 });
      callbacks.onGetTask.mockReturnValue(task);

      const taskEl = createTaskItemElement('test.md', 5);
      containerEl.appendChild(taskEl);

      const dt = createMockDataTransfer();
      const startEvent = createDragEvent('dragstart', {
        bubbles: true,
        clientX: 100,
        clientY: 200,
        dataTransfer: dt,
      });
      taskEl.dispatchEvent(startEvent);

      expect(taskEl.hasClass('todoseq-task-dragging')).toBe(true);

      const endEvent = createDragEvent('dragend', { bubbles: true });
      taskEl.dispatchEvent(endEvent);

      expect(taskEl.hasClass('todoseq-task-dragging')).toBe(false);
      expect((handler as any).draggedTask).toBeNull();
      expect(activeDocument.querySelector('.todoseq-drag-overlay')).toBeNull();
    });

    it('should handle dragend when target is not an HTMLElement', () => {
      const endEvent = createDragEvent('dragend', { bubbles: true });
      // Dispatch on container where closest won't find a task item
      containerEl.dispatchEvent(endEvent);
      expect(() => containerEl.dispatchEvent(endEvent)).not.toThrow();
    });
  });

  describe('onDragOver', () => {
    beforeEach(() => {
      handler.initialize(callbacks);
      const task = createBaseTask({ path: 'test.md', line: 5 });
      callbacks.onGetTask.mockReturnValue(task);

      const taskEl = createTaskItemElement('test.md', 5);
      containerEl.appendChild(taskEl);

      const dt = createMockDataTransfer();
      const startEvent = createDragEvent('dragstart', {
        bubbles: true,
        clientX: 100,
        clientY: 200,
        dataTransfer: dt,
      });
      taskEl.dispatchEvent(startEvent);
    });

    it('should update overlay position on dragover', () => {
      const overlay = activeDocument.querySelector(
        '.todoseq-drag-overlay',
      ) as HTMLElement;
      expect(overlay).not.toBeNull();

      const overEvent = createDragEvent('dragover', {
        bubbles: true,
        clientX: 300,
        clientY: 400,
      });
      window.dispatchEvent(overEvent);

      expect(overlay.style.left).toBe('300px');
      expect(overlay.style.top).toBe('400px');
    });

    it('should update action text when modifier keys change', () => {
      const overEvent = createDragEvent('dragover', {
        bubbles: true,
        clientX: 300,
        clientY: 400,
        altKey: true,
      });
      window.dispatchEvent(overEvent);

      const actionLine = activeDocument.querySelector(
        '.todoseq-drag-overlay-action',
      );
      expect(actionLine!.textContent).toBe('Move task here');
      expect((handler as any).currentAction).toBe('move');
    });

    it('should toggle over-target class when over valid drop target', () => {
      const sourceView = activeDocument.createElement('div');
      sourceView.className = 'markdown-source-view';
      activeDocument.body.appendChild(sourceView);

      const overEvent = createDragEvent('dragover', {
        bubbles: true,
        clientX: 300,
        clientY: 400,
      });
      sourceView.dispatchEvent(overEvent);

      const overlay = activeDocument.querySelector(
        '.todoseq-drag-overlay',
      ) as HTMLElement;
      expect(overlay.hasClass('todoseq-drag-overlay-over-target')).toBe(true);

      activeDocument.body.removeChild(sourceView);
    });

    it('should do nothing when no dragged task', () => {
      (handler as any).draggedTask = null;
      const overEvent = createDragEvent('dragover', {
        bubbles: true,
        clientX: 300,
        clientY: 400,
      });
      expect(() => window.dispatchEvent(overEvent)).not.toThrow();
    });
  });

  describe('drag overlay', () => {
    it('createDragOverlay should build correct DOM structure', () => {
      handler.initialize(callbacks);
      const task = createBaseTask({ state: 'TODO', text: 'Test task' });
      const overlay = (handler as any).createDragOverlay(task, 'copy', 50, 60);

      expect(overlay.className).toBe('todoseq-drag-overlay');
      expect(overlay.style.left).toBe('50px');
      expect(overlay.style.top).toBe('60px');

      const taskLine = overlay.querySelector('.todoseq-drag-overlay-task');
      expect(taskLine).not.toBeNull();
      expect(taskLine!.textContent).toBe('TODO Test task');

      const actionLine = overlay.querySelector('.todoseq-drag-overlay-action');
      expect(actionLine).not.toBeNull();
      expect(actionLine!.textContent).toBe('Copy task here');

      overlay.remove();
    });

    it('updateOverlayAction should change action text', () => {
      handler.initialize(callbacks);
      const task = createBaseTask({ state: 'TODO', text: 'Test' });
      const overlay = (handler as any).createDragOverlay(task, 'copy', 0, 0);

      (handler as any).updateOverlayAction(overlay, 'migrate');
      const actionLine = overlay.querySelector('.todoseq-drag-overlay-action');
      expect(actionLine!.textContent).toBe('Migrate task here');

      overlay.remove();
    });

    it('removeDragOverlay should remove element from DOM', () => {
      handler.initialize(callbacks);
      const overlay = activeDocument.createElement('div');
      overlay.className = 'todoseq-drag-overlay';
      activeDocument.body.appendChild(overlay);
      (handler as any).dragImageEl = overlay;

      (handler as any).removeDragOverlay();
      expect(activeDocument.body.contains(overlay)).toBe(false);
      expect((handler as any).dragImageEl).toBeNull();
    });

    it('removeDragOverlay should be safe when no overlay exists', () => {
      handler.initialize(callbacks);
      expect(() => (handler as any).removeDragOverlay()).not.toThrow();
    });

    it('setActionText should handle all actions', () => {
      handler.initialize(callbacks);
      const el = activeDocument.createElement('div');

      (handler as any).setActionText(el, 'copy');
      expect(el.textContent).toBe('Copy task here');

      (handler as any).setActionText(el, 'move');
      expect(el.textContent).toBe('Move task here');

      (handler as any).setActionText(el, 'migrate');
      expect(el.textContent).toBe('Migrate task here');
    });
  });

  describe('key listeners', () => {
    beforeEach(() => {
      handler.initialize(callbacks);
    });

    it('should update modifier keys on keydown', () => {
      const event = new KeyboardEvent('keydown', {
        key: 'Control',
        ctrlKey: true,
        bubbles: true,
      });
      activeDocument.dispatchEvent(event);

      expect((handler as any).modifierKeys.ctrl).toBe(true);
    });

    it('should update modifier keys on keyup', () => {
      (handler as any).modifierKeys = { ctrl: true, meta: false, alt: false };
      const event = new KeyboardEvent('keyup', {
        key: 'Control',
        ctrlKey: false,
        bubbles: true,
      });
      activeDocument.dispatchEvent(event);

      expect((handler as any).modifierKeys.ctrl).toBe(false);
    });
  });

  describe('onEditorDrop', () => {
    beforeEach(() => {
      handler.initialize(callbacks);
    });

    it('should return early when no draggedTask', () => {
      const dropCallback = (mockApp as any).workspace.on.mock.calls[0][1];
      const mockEvt = createDragEvent('drop', { preventDefault: jest.fn() });
      const result = dropCallback(mockEvt, mockEditor, { file: null });
      expect(result).toBeUndefined();
    });

    it('should return early when targetFile is null', () => {
      const task = createBaseTask({ path: 'source.md', line: 0 });
      (handler as any).draggedTask = task;

      const dropCallback = (mockApp as any).workspace.on.mock.calls[0][1];
      const mockEvt = createDragEvent('drop', { preventDefault: jest.fn() });
      const result = dropCallback(mockEvt, mockEditor, { file: null });
      expect(result).toBeUndefined();
    });

    it('should show notice when dropping into same file', () => {
      const task = createBaseTask({ path: 'same.md', line: 0 });
      (handler as any).draggedTask = task;

      const dropCallback = (mockApp as any).workspace.on.mock.calls[0][1];
      const preventDefault = jest.fn();
      const mockEvt = createDragEvent('drop', { preventDefault });
      const view = { file: new TFile('same.md', 'same.md') };
      dropCallback(mockEvt, mockEditor, view);

      expect(noticeInstances.length).toBeGreaterThanOrEqual(1);
      expect(noticeInstances.some((n) => n.message === 'Task is already in this file')).toBe(true);
    });

    it('should show notice when migrate is disabled', () => {
      (handler as any).plugin.settings.migrateToTodayState = '';
      const task = createBaseTask({ path: 'source.md', line: 0 });
      (handler as any).draggedTask = task;
      (handler as any).modifierKeys = { ctrl: true, meta: false, alt: true };

      const dropCallback = (mockApp as any).workspace.on.mock.calls[0][1];
      const mockEvt = createDragEvent('drop', {
        ctrlKey: true,
        altKey: true,
      });
      const view = { file: new TFile('target.md', 'target.md') };
      dropCallback(mockEvt, mockEditor, view);

      expect(noticeInstances.some((n) =>
        n.message.includes('Migration is disabled'),
      )).toBe(true);
    });

    it('should call executeDrop and show notice for copy action', async () => {
      const task = createBaseTask({ path: 'source.md', line: 0 });
      (handler as any).draggedTask = task;

      const readSpy = jest
        .spyOn(mockApp.vault, 'read')
        .mockResolvedValue('TODO Test task');
      const modifySpy = jest
        .spyOn(mockApp.vault, 'modify')
        .mockResolvedValue(undefined);

      const dropCallback = (mockApp as any).workspace.on.mock.calls[0][1];
      const mockEvt = createDragEvent('drop', {
        ctrlKey: false,
        metaKey: false,
        altKey: false,
      });
      const preventDefaultSpy = jest.spyOn(mockEvt, 'preventDefault');
      const view = { file: new TFile('target.md', 'target.md') };
      dropCallback(mockEvt, mockEditor, view);

      // Wait for async executeDrop
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(preventDefaultSpy).toHaveBeenCalled();
      expect(readSpy).toHaveBeenCalled();
      expect(modifySpy).toHaveBeenCalled();

      expect(noticeInstances.some((n) =>
        n.message.includes('copied'),
      )).toBe(true);

      readSpy.mockRestore();
      modifySpy.mockRestore();
      preventDefaultSpy.mockRestore();
    });
  });

  describe('getDropPosition', () => {
    it('should return null when editorView is missing', () => {
      const view = new MarkdownView();
      (view as any).editor = {};
      const result = (handler as any).getDropPosition(
        view,
        createDragEvent('drop', { clientX: 100, clientY: 200 }),
      );
      expect(result).toBeNull();
    });

    it('should return null when posAtCoords returns null', () => {
      const view = new MarkdownView();
      const mockEditorView = {
        posAtCoords: jest.fn().mockReturnValue(null),
        state: { doc: { lineAt: jest.fn() } },
      };
      (view as any).editor = { cm: mockEditorView };
      const result = (handler as any).getDropPosition(
        view,
        createDragEvent('drop', { clientX: 100, clientY: 200 }),
      );
      expect(result).toBeNull();
    });

    it('should return line and ch when posAtCoords succeeds', () => {
      const view = new MarkdownView();
      const mockLine = { number: 5, length: 10 };
      const mockEditorView = {
        posAtCoords: jest.fn().mockReturnValue(42),
        state: { doc: { lineAt: jest.fn().mockReturnValue(mockLine) } },
      };
      (view as any).editor = { cm: mockEditorView };
      const result = (handler as any).getDropPosition(
        view,
        createDragEvent('drop', { clientX: 100, clientY: 200 }),
      );
      expect(result).toEqual({ line: 4, ch: 10 });
    });
  });

  describe('insertAtPosition', () => {
    it('should insert lines at given position', () => {
      const editor = createMockEditor();
      editor.getLine.mockReturnValue('existing line');

      (handler as any).insertAtPosition(
        editor as any,
        ['TODO New task', 'SCHEDULED: <2026-04-02 Thu>'],
        { line: 0, ch: 13 },
      );

      expect(editor.replaceRange).toHaveBeenCalledWith(
        '\nTODO New task\nSCHEDULED: <2026-04-02 Thu>',
        { line: 0, ch: 13 },
      );
    });

    it('should insert without newline when current line is empty', () => {
      const editor = createMockEditor();
      editor.getLine.mockReturnValue('');

      (handler as any).insertAtPosition(
        editor as any,
        ['TODO New task'],
        { line: 0, ch: 0 },
      );

      expect(editor.replaceRange).toHaveBeenCalledWith(
        'TODO New task',
        { line: 0, ch: 0 },
      );
    });

    it('should use editor cursor when pos is null', () => {
      const editor = createMockEditor();
      editor.getLine.mockReturnValue('existing');

      (handler as any).insertAtPosition(editor as any, ['TODO Task'], null);

      expect(editor.replaceRange).toHaveBeenCalledWith(
        '\nTODO Task',
        { line: 0, ch: 8 },
      );
    });
  });

  describe('insertAtEnd', () => {
    it('should append lines to file content', async () => {
      const file = new TFile('target.md', 'target.md');
      const readSpy = jest
        .spyOn(mockApp.vault, 'read')
        .mockResolvedValue('# Notes\n\nExisting');
      const modifySpy = jest
        .spyOn(mockApp.vault, 'modify')
        .mockResolvedValue(undefined);

      await (handler as any).insertAtEnd(file, ['TODO New task']);

      expect(readSpy).toHaveBeenCalledWith(file);
      expect(modifySpy).toHaveBeenCalledWith(
        file,
        '# Notes\n\nExisting\n\nTODO New task\n',
      );

      readSpy.mockRestore();
      modifySpy.mockRestore();
    });
  });

  describe('handleSourceModification', () => {
    it('should do nothing for copy action', async () => {
      const task = createBaseTask({ path: 'source.md', line: 1 });
      const modifySpy = jest.spyOn(mockApp.vault, 'modify');

      await (handler as any).handleSourceModification(task, 'copy');
      expect(modifySpy).not.toHaveBeenCalled();

      modifySpy.mockRestore();
    });

    it('should remove task lines for move action', async () => {
      const task = createBaseTask({
        path: 'source.md',
        line: 1,
        indent: '',
        rawText: '- [ ] TODO Task',
      });

      const sourceFile = new TFile('source.md', 'source.md');
      jest
        .spyOn(mockApp.vault, 'getAbstractFileByPath')
        .mockReturnValue(sourceFile);
      jest
        .spyOn(mockApp.vault, 'read')
        .mockResolvedValue(
          ['# Header', '- [ ] TODO Task', '  - [ ] sub', 'Next line'].join(
            '\n',
          ),
        );
      const modifySpy = jest
        .spyOn(mockApp.vault, 'modify')
        .mockResolvedValue(undefined);

      await (handler as any).handleSourceModification(task, 'move');

      expect(modifySpy).toHaveBeenCalled();
      const modifiedContent = modifySpy.mock.calls[0][1];
      expect(modifiedContent).not.toContain('TODO Task');

      modifySpy.mockRestore();
    });

    it('should migrate keyword for migrate action', async () => {
      const task = createBaseTask({
        path: 'source.md',
        line: 1,
        indent: '',
        state: 'TODO',
        rawText: 'TODO Task',
      });

      const sourceFile = new TFile('source.md', 'source.md');
      jest
        .spyOn(mockApp.vault, 'getAbstractFileByPath')
        .mockReturnValue(sourceFile);
      jest
        .spyOn(mockApp.vault, 'read')
        .mockResolvedValue(
          ['# Header', 'TODO Task', 'SCHEDULED: <2026-04-02 Thu>', 'Next'].join(
            '\n',
          ),
        );
      const modifySpy = jest
        .spyOn(mockApp.vault, 'modify')
        .mockResolvedValue(undefined);

      await (handler as any).handleSourceModification(task, 'migrate');

      expect(modifySpy).toHaveBeenCalled();
      const modifiedContent = modifySpy.mock.calls[0][1];
      expect(modifiedContent).toContain('MIGRATED Task');
      expect(modifiedContent).not.toContain('SCHEDULED');

      modifySpy.mockRestore();
    });

    it('should handle error during source modification', async () => {
      const task = createBaseTask({ path: 'source.md', line: 1 });

      jest
        .spyOn(mockApp.vault, 'getAbstractFileByPath')
        .mockImplementation(() => {
          throw new Error('disk error');
        });

      const consoleSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      await (handler as any).handleSourceModification(task, 'move');

      expect(consoleSpy).toHaveBeenCalled();
      expect(noticeInstances.some((n) =>
        n.message.includes('Failed to update source task'),
      )).toBe(true);

      consoleSpy.mockRestore();
    });

    it('should return early when source file is not a TFile', async () => {
      const task = createBaseTask({ path: 'source.md', line: 1 });
      jest.spyOn(mockApp.vault, 'getAbstractFileByPath').mockReturnValue(null);
      const modifySpy = jest.spyOn(mockApp.vault, 'modify');

      await (handler as any).handleSourceModification(task, 'move');
      expect(modifySpy).not.toHaveBeenCalled();

      modifySpy.mockRestore();
    });
  });

  describe('showActionNotice', () => {
    it('should show copy notice', () => {
      (handler as any).showActionNotice('copy');
      expect(noticeInstances[noticeInstances.length - 1].message).toBe(
        'Task copied',
      );
    });

    it('should show move notice', () => {
      (handler as any).showActionNotice('move');
      expect(noticeInstances[noticeInstances.length - 1].message).toBe(
        'Task moved',
      );
    });

    it('should show migrate notice', () => {
      (handler as any).showActionNotice('migrate');
      expect(noticeInstances[noticeInstances.length - 1].message).toBe(
        'Task migrated',
      );
    });
  });

  describe('isOverValidDropTarget', () => {
    it('should return false when target is not HTMLElement', () => {
      const evt = createDragEvent('dragover');
      Object.defineProperty(evt, 'target', { value: null });
      expect((handler as any).isOverValidDropTarget(evt)).toBe(false);
    });

    it('should return true when over markdown source view', () => {
      const sourceView = activeDocument.createElement('div');
      sourceView.className = 'markdown-source-view';
      activeDocument.body.appendChild(sourceView);

      const evt = createDragEvent('dragover');
      Object.defineProperty(evt, 'target', { value: sourceView });
      expect((handler as any).isOverValidDropTarget(evt)).toBe(true);

      activeDocument.body.removeChild(sourceView);
    });

    it('should return false when not over markdown source view', () => {
      const div = activeDocument.createElement('div');
      const evt = createDragEvent('dragover');
      Object.defineProperty(evt, 'target', { value: div });
      expect((handler as any).isOverValidDropTarget(evt)).toBe(false);
    });
  });

  describe('executeDrop', () => {
    it('should insert at position in source mode', async () => {
      const task = createBaseTask({ path: 'source.md', line: 0 });
      const insertAtPositionSpy = jest
        .spyOn(handler as any, 'insertAtPosition')
        .mockReturnValue(undefined);
      const handleSourceModificationSpy = jest
        .spyOn(handler as any, 'handleSourceModification')
        .mockResolvedValue(undefined);

      jest
        .spyOn(mockApp.vault, 'read')
        .mockResolvedValue('TODO Task');

      await (handler as any).executeDrop(
        task,
        mockEditor as any,
        new TFile('target.md', 'target.md'),
        true,
        'copy',
        { line: 2, ch: 0 },
      );

      expect(insertAtPositionSpy).toHaveBeenCalled();
      expect(handleSourceModificationSpy).toHaveBeenCalledWith(task, 'copy');

      insertAtPositionSpy.mockRestore();
      handleSourceModificationSpy.mockRestore();
    });

    it('should insert at end when not in source mode', async () => {
      const task = createBaseTask({ path: 'source.md', line: 0 });
      const insertAtEndSpy = jest
        .spyOn(handler as any, 'insertAtEnd')
        .mockResolvedValue(undefined);
      const handleSourceModificationSpy = jest
        .spyOn(handler as any, 'handleSourceModification')
        .mockResolvedValue(undefined);

      jest
        .spyOn(mockApp.vault, 'read')
        .mockResolvedValue('TODO Task');

      await (handler as any).executeDrop(
        task,
        mockEditor as any,
        new TFile('target.md', 'target.md'),
        false,
        'copy',
      );

      expect(insertAtEndSpy).toHaveBeenCalled();
      expect(handleSourceModificationSpy).toHaveBeenCalledWith(task, 'copy');

      insertAtEndSpy.mockRestore();
      handleSourceModificationSpy.mockRestore();
    });
  });

  describe('removeDragoverListener', () => {
    it('should remove listener when present', () => {
      const removeEventListenerSpy = jest.spyOn(window, 'removeEventListener');
      const mockFn = jest.fn();
      (handler as any).dragoverHandler = mockFn;
      (handler as any).removeDragoverListener();
      expect(removeEventListenerSpy).toHaveBeenCalledWith(
        'dragover',
        mockFn,
        true,
      );
      expect((handler as any).dragoverHandler).toBeNull();
    });

    it('should be safe when no listener exists', () => {
      expect(() => (handler as any).removeDragoverListener()).not.toThrow();
    });
  });

  describe('removeKeyListeners', () => {
    it('should remove keydown and keyup listeners', () => {
      handler.initialize(callbacks);
      const removeEventListenerSpy = jest.spyOn(
        activeDocument,
        'removeEventListener',
      );
      (handler as any).removeKeyListeners();
      expect(removeEventListenerSpy).toHaveBeenCalledWith(
        'keydown',
        expect.any(Function),
        true,
      );
      expect(removeEventListenerSpy).toHaveBeenCalledWith(
        'keyup',
        expect.any(Function),
        true,
      );
    });

    it('should be safe when listeners are null', () => {
      (handler as any).keydownHandler = null;
      (handler as any).keyupHandler = null;
      expect(() => (handler as any).removeKeyListeners()).not.toThrow();
    });
  });
});
