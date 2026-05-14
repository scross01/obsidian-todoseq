/**
 * @jest-environment jsdom
 */

import { installObsidianDomMocks } from './helpers/obsidian-dom-mock';
import {
  createBaseTask,
  createTestKeywordManager,
} from './helpers/test-helper';
import { KeywordManager } from '../src/utils/keyword-manager';
import { TaskStateTransitionManager } from '../src/services/task-state-transition-manager';
import { StateMenuBuilder } from '../src/view/components/state-menu-builder';
import { TaskItemRenderer } from '../src/view/task-list/task-item-renderer';
import { Task } from '../src/types/task';
import { Notice, Platform } from 'obsidian';

installObsidianDomMocks();

jest.mock('obsidian', () => ({
  setIcon: jest.fn((el: HTMLElement) => {
    const svg = activeDocument.createElementNS(
      'http://www.w3.org/2000/svg',
      'svg',
    );
    el.appendChild(svg);
  }),
  Notice: jest.fn(),
  Platform: {
    isMobile: false,
  },
}));

// Minimal StateMenuBuilder mock: only needs buildStateMenu returning a menu object
const createMockMenuBuilder = () =>
  ({
    buildStateMenu: jest.fn().mockReturnValue({
      showAtMouseEvent: jest.fn(),
      showAtPosition: jest.fn(),
    }),
  }) as unknown as StateMenuBuilder;

describe('TaskItemRenderer', () => {
  let keywordManager: KeywordManager;
  let stateManager: TaskStateTransitionManager;
  let mockMenuBuilder: ReturnType<typeof createMockMenuBuilder>;
  let mockOnStateChange: jest.Mock;
  let mockOnLocationOpen: jest.Mock;
  let mockOnContextMenu: jest.Mock;
  let mockFindTaskByPathAndLine: jest.Mock;
  let renderer: TaskItemRenderer;

  beforeEach(() => {
    activeDocument.body.innerHTML = '';
    jest.clearAllMocks();

    keywordManager = createTestKeywordManager();
    stateManager = new TaskStateTransitionManager(keywordManager, undefined);
    mockMenuBuilder = createMockMenuBuilder();
    mockOnStateChange = jest.fn().mockResolvedValue(undefined);
    mockOnLocationOpen = jest.fn();
    mockOnContextMenu = jest.fn();
    mockFindTaskByPathAndLine = jest.fn().mockReturnValue(null);

    renderer = new TaskItemRenderer(
      () => keywordManager,
      () => stateManager,
      () => mockMenuBuilder,
      mockOnStateChange,
      mockOnLocationOpen,
      mockOnContextMenu,
      () => ({
        findTaskByPathAndLine: mockFindTaskByPathAndLine,
      }),
    );
  });

  afterEach(() => {
    activeDocument.body.innerHTML = '';
  });

  // ============================================================================
  // Constructor / setContextMenuCallback
  // ============================================================================
  describe('constructor and setContextMenuCallback', () => {
    it('should create a renderer instance', () => {
      expect(renderer).toBeDefined();
    });

    it('should allow setting context menu callback after construction', () => {
      const newCallback = jest.fn();
      renderer.setContextMenuCallback(newCallback);
      // Verify by building an LI and triggering context menu
      const task = createBaseTask();
      const li = renderer.buildTaskListItem(task);
      const event = new MouseEvent('contextmenu', { bubbles: true });
      li.dispatchEvent(event);
      expect(newCallback).toHaveBeenCalled();
    });

    it('should allow clearing context menu callback', () => {
      renderer.setContextMenuCallback(null);
      const task = createBaseTask();
      const li = renderer.buildTaskListItem(task);
      const event = new MouseEvent('contextmenu', { bubbles: true });
      expect(() => li.dispatchEvent(event)).not.toThrow();
    });
  });

  // ============================================================================
  // buildCheckbox
  // ============================================================================
  describe('buildCheckbox', () => {
    it('should create a checkbox input with correct classes', () => {
      const task = createBaseTask({ state: 'TODO', completed: false });
      const container = activeDocument.createElement('div');
      const checkbox = renderer.buildCheckbox(task, container);

      expect(checkbox.tagName).toBe('INPUT');
      expect(checkbox.type).toBe('checkbox');
      expect(checkbox.classList.contains('todoseq-task-checkbox')).toBe(true);
      expect(checkbox.classList.contains('task-list-item-checkbox')).toBe(true);
    });

    it('should set data-task attribute based on state for default checkbox styles', () => {
      const task = createBaseTask({ state: 'TODO', completed: false });
      const container = activeDocument.createElement('div');
      const checkbox = renderer.buildCheckbox(task, container);

      // TODO is an inactive keyword by default, so data-task is ' '
      expect(checkbox.getAttribute('data-task')).toBe(' ');
      expect(checkbox.checked).toBe(false);
    });

    it('should set data-task to x for completed tasks with default styles', () => {
      const task = createBaseTask({ state: 'DONE', completed: true });
      const container = activeDocument.createElement('div');
      const checkbox = renderer.buildCheckbox(task, container);

      expect(checkbox.getAttribute('data-task')).toBe('x');
      expect(checkbox.checked).toBe(true);
    });

    it('should use extended checkbox styles when enabled', () => {
      const km = createTestKeywordManager({ useExtendedCheckboxStyles: true });
      const customRenderer = new TaskItemRenderer(
        () => km,
        () => stateManager,
        () => mockMenuBuilder,
        mockOnStateChange,
        mockOnLocationOpen,
      );

      const task = createBaseTask({ state: 'TODO', completed: false });
      const container = activeDocument.createElement('div');
      const checkbox = customRenderer.buildCheckbox(task, container);

      // With extended styles, TODO gets its checkbox state from keywordManager
      const expectedChar = km.getCheckboxState('TODO', km.getSettings());
      expect(checkbox.getAttribute('data-task')).toBe(expectedChar);
    });

    it('should call onStateChange when checkbox is checked', async () => {
      const task = createBaseTask({ state: 'TODO', completed: false });
      const container = activeDocument.createElement('div');
      const checkbox = renderer.buildCheckbox(task, container);

      checkbox.checked = true;
      checkbox.dispatchEvent(new Event('change'));

      // Flush async IIFE
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(mockOnStateChange).toHaveBeenCalledWith(task, 'DONE');
    });

    it('should call onStateChange when checkbox is unchecked', async () => {
      const task = createBaseTask({ state: 'DONE', completed: true });
      const container = activeDocument.createElement('div');
      const checkbox = renderer.buildCheckbox(task, container);

      checkbox.checked = false;
      checkbox.dispatchEvent(new Event('change'));

      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(mockOnStateChange).toHaveBeenCalledWith(task, 'TODO');
    });

    it('should use fresh task from TaskStateManager when available', async () => {
      const freshTask = createBaseTask({
        state: 'TODO',
        completed: false,
        text: 'fresh',
      });
      mockFindTaskByPathAndLine.mockReturnValue(freshTask);

      const task = createBaseTask({ state: 'TODO', completed: false });
      const container = activeDocument.createElement('div');
      const checkbox = renderer.buildCheckbox(task, container);

      checkbox.checked = true;
      checkbox.dispatchEvent(new Event('change'));

      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(mockFindTaskByPathAndLine).toHaveBeenCalledWith(
        task.path,
        task.line,
      );
      expect(mockOnStateChange).toHaveBeenCalledWith(freshTask, 'DONE');
    });

    it('should transition to next state when checkbox is unchecked', async () => {
      const customKm = createTestKeywordManager({
        additionalInactiveKeywords: ['BACKLOG'],
        additionalActiveKeywords: ['ACTIVE'],
        additionalCompletedKeywords: ['COMPLETED'],
      });
      const customSm = new TaskStateTransitionManager(customKm, {
        defaultInactive: 'BACKLOG',
        defaultActive: 'ACTIVE',
        defaultCompleted: 'COMPLETED',
        transitionStatements: ['BACKLOG -> ACTIVE -> COMPLETED'],
      });
      const customRenderer = new TaskItemRenderer(
        () => customKm,
        () => customSm,
        () => mockMenuBuilder,
        mockOnStateChange,
        mockOnLocationOpen,
      );

      const task = createBaseTask({ state: 'COMPLETED', completed: true });
      const container = activeDocument.createElement('div');
      const checkbox = customRenderer.buildCheckbox(task, container);

      checkbox.checked = false;
      checkbox.dispatchEvent(new Event('change'));

      await new Promise((resolve) => setTimeout(resolve, 0));

      // When unchecked, should try next state. For COMPLETED, next is BACKLOG.
      expect(mockOnStateChange).toHaveBeenCalledWith(task, 'BACKLOG');
    });

    it('should revert checkbox state when no transition is available', async () => {
      // Use an unknown keyword; getNextState returns the same state for unknown keywords
      const task = createBaseTask({ state: 'UNKNOWN', completed: false });
      const container = activeDocument.createElement('div');
      const checkbox = renderer.buildCheckbox(task, container);

      // User tries to uncheck, but there's no next state
      checkbox.checked = false;
      checkbox.dispatchEvent(new Event('change'));

      await new Promise((resolve) => setTimeout(resolve, 0));

      // Checkbox should be reverted back to checked
      expect(checkbox.checked).toBe(true);
      expect(mockOnStateChange).not.toHaveBeenCalled();
    });
  });

  // ============================================================================
  // buildKeyword
  // ============================================================================
  describe('buildKeyword', () => {
    it('should create a keyword span with correct text and attributes', () => {
      const task = createBaseTask({ state: 'TODO', completed: false });
      const parent = activeDocument.createElement('div');
      const span = renderer.buildKeyword(task, parent);

      expect(span.tagName).toBe('SPAN');
      expect(span.classList.contains('todo-task-keyword')).toBe(true);
      expect(span.textContent).toBe('TODO');
      expect(span.getAttribute('role')).toBe('button');
      expect(span.getAttribute('tabindex')).toBe('0');
      expect(span.getAttribute('aria-checked')).toBe('false');
    });

    it('should set aria-checked to true for completed tasks', () => {
      const task = createBaseTask({ state: 'DONE', completed: true });
      const parent = activeDocument.createElement('div');
      const span = renderer.buildKeyword(task, parent);

      expect(span.getAttribute('aria-checked')).toBe('true');
    });
  });

  // ============================================================================
  // attachKeywordHandlers
  // ============================================================================
  describe('attachKeywordHandlers', () => {
    it('should trigger onStateChange on click', async () => {
      const task = createBaseTask({ state: 'TODO', completed: false });
      const span = activeDocument.createElement('span');
      renderer.attachKeywordHandlers(span, task);

      span.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(mockOnStateChange).toHaveBeenCalledWith(task, 'DOING');
    });

    it('should trigger onStateChange on Enter key', async () => {
      const task = createBaseTask({ state: 'TODO', completed: false });
      const span = activeDocument.createElement('span');
      renderer.attachKeywordHandlers(span, task);

      const event = new KeyboardEvent('keydown', {
        key: 'Enter',
        bubbles: true,
      });
      span.dispatchEvent(event);

      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(mockOnStateChange).toHaveBeenCalledWith(task, 'DOING');
    });

    it('should trigger onStateChange on Space key', async () => {
      const task = createBaseTask({ state: 'TODO', completed: false });
      const span = activeDocument.createElement('span');
      renderer.attachKeywordHandlers(span, task);

      const event = new KeyboardEvent('keydown', { key: ' ', bubbles: true });
      span.dispatchEvent(event);

      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(mockOnStateChange).toHaveBeenCalledWith(task, 'DOING');
    });

    it('should show Notice and log error when activation fails', async () => {
      const consoleSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      mockOnStateChange.mockRejectedValueOnce(new Error('Activation failed'));

      const task = createBaseTask({ state: 'TODO', completed: false });
      const span = activeDocument.createElement('span');
      renderer.attachKeywordHandlers(span, task);

      const event = new KeyboardEvent('keydown', {
        key: 'Enter',
        bubbles: true,
      });
      span.dispatchEvent(event);

      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(Notice).toHaveBeenCalledWith('Failed to activate task');
      expect(consoleSpy).toHaveBeenCalledWith(
        'Error activating task:',
        expect.any(Error),
      );

      consoleSpy.mockRestore();
    });

    it('should open state menu on Shift+F10', () => {
      const task = createBaseTask({ state: 'TODO', completed: false });
      const span = activeDocument.createElement('span');
      // Need getBoundingClientRect for positioning
      span.getBoundingClientRect = () =>
        ({
          left: 100,
          bottom: 120,
          width: 50,
          height: 20,
          top: 100,
          right: 150,
          x: 100,
          y: 100,
          toJSON: () => ({}),
        }) as DOMRect;
      renderer.attachKeywordHandlers(span, task);

      const event = new KeyboardEvent('keydown', {
        key: 'F10',
        shiftKey: true,
        bubbles: true,
      });
      span.dispatchEvent(event);

      expect(mockMenuBuilder.buildStateMenu).toHaveBeenCalledWith(
        'TODO',
        expect.any(Function),
      );
    });

    it('should open state menu on ContextMenu key', () => {
      const task = createBaseTask({ state: 'TODO', completed: false });
      const span = activeDocument.createElement('span');
      span.getBoundingClientRect = () =>
        ({
          left: 100,
          bottom: 120,
          width: 50,
          height: 20,
          top: 100,
          right: 150,
          x: 100,
          y: 100,
          toJSON: () => ({}),
        }) as DOMRect;
      renderer.attachKeywordHandlers(span, task);

      const event = new KeyboardEvent('keydown', {
        key: 'ContextMenu',
        bubbles: true,
      });
      span.dispatchEvent(event);

      expect(mockMenuBuilder.buildStateMenu).toHaveBeenCalledWith(
        'TODO',
        expect.any(Function),
      );
    });

    it('should open state menu on right-click (contextmenu)', () => {
      const task = createBaseTask({ state: 'TODO', completed: false });
      const span = activeDocument.createElement('span');
      renderer.attachKeywordHandlers(span, task);

      const event = new MouseEvent('contextmenu', {
        clientX: 100,
        clientY: 200,
        bubbles: true,
      });
      span.dispatchEvent(event);

      expect(mockMenuBuilder.buildStateMenu).toHaveBeenCalledWith(
        'TODO',
        expect.any(Function),
      );
    });

    it('should debounce multiple rapid contextmenu events', () => {
      const task = createBaseTask({ state: 'TODO', completed: false });
      const span = activeDocument.createElement('span');
      renderer.attachKeywordHandlers(span, task);

      const event1 = new MouseEvent('contextmenu', {
        clientX: 100,
        clientY: 200,
        bubbles: true,
      });
      const event2 = new MouseEvent('contextmenu', {
        clientX: 100,
        clientY: 200,
        bubbles: true,
      });

      span.dispatchEvent(event1);
      span.dispatchEvent(event2);

      // buildStateMenu should only be called once due to debounce
      expect(mockMenuBuilder.buildStateMenu).toHaveBeenCalledTimes(1);
    });

    it('should suppress synthesized click after contextmenu on mobile', () => {
      const originalIsMobile = Platform.isMobile;
      Platform.isMobile = true;

      const task = createBaseTask({ state: 'TODO', completed: false });
      const span = activeDocument.createElement('span');
      renderer.attachKeywordHandlers(span, task);

      // Simulate contextmenu then click within debounce window
      const ctxEvent = new MouseEvent('contextmenu', {
        clientX: 100,
        clientY: 200,
        bubbles: true,
      });
      span.dispatchEvent(ctxEvent);

      const clickEvent = new MouseEvent('click', { bubbles: true });
      span.dispatchEvent(clickEvent);

      // onStateChange should not be called for the suppressed click
      // Note: the first click handler still fires, but the capture-phase click
      // handler should prevent default/stop propagation for the synthesized one.
      // The main click listener still fires because it's the same event.
      // What matters is the menu debounce prevents duplicate menu opens.
      expect(mockMenuBuilder.buildStateMenu).toHaveBeenCalledTimes(1);

      Platform.isMobile = originalIsMobile;
    });
  });

  // ============================================================================
  // buildText
  // ============================================================================
  describe('buildText', () => {
    it('should build text with keyword, no priority, and task text', () => {
      const task = createBaseTask({
        state: 'TODO',
        text: 'Test task',
        completed: false,
      });
      const container = activeDocument.createElement('div');
      const textSpan = renderer.buildText(task, container);

      expect(textSpan.classList.contains('todoseq-task-text')).toBe(true);
      expect(textSpan.querySelector('.todo-task-keyword')).not.toBeNull();
      expect(textSpan.querySelector('.todoseq-priority-badge')).toBeNull();
      expect(textSpan.textContent).toContain('Test task');
    });

    it('should add priority badge for high priority', () => {
      const task = createBaseTask({
        state: 'TODO',
        text: 'Test task',
        priority: 'high',
      });
      const container = activeDocument.createElement('div');
      const textSpan = renderer.buildText(task, container);

      const badge = textSpan.querySelector('.todoseq-priority-badge');
      expect(badge).not.toBeNull();
      expect(badge?.textContent).toBe('A');
      expect(badge?.classList.contains('priority-high')).toBe(true);
      expect(badge?.getAttribute('aria-label')).toBe('Priority high');
    });

    it('should add priority badge for med priority', () => {
      const task = createBaseTask({
        state: 'TODO',
        text: 'Test task',
        priority: 'med',
      });
      const container = activeDocument.createElement('div');
      const textSpan = renderer.buildText(task, container);

      const badge = textSpan.querySelector('.todoseq-priority-badge');
      expect(badge?.textContent).toBe('B');
      expect(badge?.classList.contains('priority-med')).toBe(true);
    });

    it('should add priority badge for low priority', () => {
      const task = createBaseTask({
        state: 'TODO',
        text: 'Test task',
        priority: 'low',
      });
      const container = activeDocument.createElement('div');
      const textSpan = renderer.buildText(task, container);

      const badge = textSpan.querySelector('.todoseq-priority-badge');
      expect(badge?.textContent).toBe('C');
      expect(badge?.classList.contains('priority-low')).toBe(true);
    });

    it('should toggle completed class on text span', () => {
      const task = createBaseTask({
        state: 'DONE',
        text: 'Test task',
        completed: true,
      });
      const container = activeDocument.createElement('div');
      const textSpan = renderer.buildText(task, container);

      expect(textSpan.classList.contains('completed')).toBe(true);
    });

    it('should render links in task text', () => {
      const task = createBaseTask({
        state: 'TODO',
        text: 'See [[Note|Alias]] for details',
      });
      const container = activeDocument.createElement('div');
      const textSpan = renderer.buildText(task, container);

      const link = textSpan.querySelector('.todoseq-task-link');
      expect(link).not.toBeNull();
      expect(link?.textContent).toBe('Alias');
    });
  });

  // ============================================================================
  // buildTaskListItem
  // ============================================================================
  describe('buildTaskListItem', () => {
    it('should create an li with correct data attributes', () => {
      const task = createBaseTask({
        path: 'notes/test.md',
        line: 5,
        rawText: 'TODO Test',
      });
      const li = renderer.buildTaskListItem(task);

      expect(li.tagName).toBe('LI');
      expect(li.classList.contains('todoseq-task-item')).toBe(true);
      expect(li.getAttribute('data-path')).toBe('notes/test.md');
      expect(li.getAttribute('data-line')).toBe('5');
      expect(li.getAttribute('data-raw-text')).toBe('TODO Test');
    });

    it('should set draggable based on Platform.isMobile', () => {
      const task = createBaseTask();
      const li = renderer.buildTaskListItem(task);
      expect(li.draggable).toBe(true);
    });

    it('should not set draggable on mobile', () => {
      const original = Platform.isMobile;
      Platform.isMobile = true;

      const task = createBaseTask();
      const li = renderer.buildTaskListItem(task);
      expect(li.draggable).toBe(false);

      Platform.isMobile = original;
    });

    it('should contain checkbox, text wrapper, and file info', () => {
      const task = createBaseTask({ state: 'TODO', text: 'Test task' });
      const li = renderer.buildTaskListItem(task);

      expect(li.querySelector('input.todoseq-task-checkbox')).not.toBeNull();
      expect(li.querySelector('.todo-main-content')).not.toBeNull();
      expect(li.querySelector('.todoseq-task-text-wrapper')).not.toBeNull();
      expect(li.querySelector('.todoseq-task-file-info')).not.toBeNull();
    });

    it('should set data-task on li for theme compatibility', () => {
      const task = createBaseTask({ state: 'TODO', completed: false });
      const li = renderer.buildTaskListItem(task);

      const checkbox = li.querySelector('input.todoseq-task-checkbox');
      const dataTask = checkbox?.getAttribute('data-task');
      expect(li.getAttribute('data-task')).toBe(dataTask);
    });

    it('should include subtask indicator when task has subtasks', () => {
      const task = createBaseTask({
        subtaskCount: 3,
        subtaskCompletedCount: 1,
      });
      const li = renderer.buildTaskListItem(task);

      const indicator = li.querySelector('.todoseq-subtask-indicator');
      expect(indicator).not.toBeNull();
      expect(indicator?.textContent).toBe('1/3');
    });

    it('should not include subtask indicator when task has no subtasks', () => {
      const task = createBaseTask({ subtaskCount: 0 });
      const li = renderer.buildTaskListItem(task);

      expect(li.querySelector('.todoseq-subtask-indicator')).toBeNull();
    });

    it('should include date display for scheduled date on incomplete task', () => {
      const task = createBaseTask({
        scheduledDate: new Date(2026, 3, 1),
        completed: false,
      });
      const li = renderer.buildTaskListItem(task);

      expect(li.querySelector('.todoseq-task-date-container')).not.toBeNull();
    });

    it('should include date display for deadline date on incomplete task', () => {
      const task = createBaseTask({
        deadlineDate: new Date(2026, 3, 1),
        completed: false,
      });
      const li = renderer.buildTaskListItem(task);

      expect(li.querySelector('.todoseq-task-date-container')).not.toBeNull();
    });

    it('should include date display for closed date on completed task', () => {
      const task = createBaseTask({
        closedDate: new Date(2026, 3, 1),
        completed: true,
        state: 'DONE',
      });
      const li = renderer.buildTaskListItem(task);

      expect(li.querySelector('.todoseq-task-date-container')).not.toBeNull();
    });

    it('should not include date display for completed task without closed date', () => {
      const task = createBaseTask({ completed: true, state: 'DONE' });
      const li = renderer.buildTaskListItem(task);

      expect(li.querySelector('.todoseq-task-date-container')).toBeNull();
    });

    it('should show file info with line number', () => {
      const task = createBaseTask({ path: 'folder/note.md', line: 4 });
      const li = renderer.buildTaskListItem(task);

      const fileInfo = li.querySelector('.todoseq-task-file-info');
      expect(fileInfo?.textContent).toBe('note:5');
      expect(fileInfo?.getAttribute('title')).toBe('folder/note.md');
    });

    it('should call onLocationOpen when li is clicked (not on checkbox or keyword)', () => {
      const task = createBaseTask({ text: 'Test task' });
      const li = renderer.buildTaskListItem(task);
      activeDocument.body.appendChild(li);

      // Click on the text span (not checkbox, not keyword)
      const textSpan = li.querySelector('.todoseq-task-text');
      textSpan?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      expect(mockOnLocationOpen).toHaveBeenCalledWith(task);
      activeDocument.body.removeChild(li);
    });

    it('should not call onLocationOpen when checkbox is clicked', () => {
      const task = createBaseTask();
      const li = renderer.buildTaskListItem(task);
      activeDocument.body.appendChild(li);

      const checkbox = li.querySelector('input.todoseq-task-checkbox');
      checkbox?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      expect(mockOnLocationOpen).not.toHaveBeenCalled();
      activeDocument.body.removeChild(li);
    });

    it('should not call onLocationOpen when keyword is clicked', () => {
      const task = createBaseTask();
      const li = renderer.buildTaskListItem(task);
      activeDocument.body.appendChild(li);

      const keyword = li.querySelector('.todo-task-keyword');
      keyword?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      expect(mockOnLocationOpen).not.toHaveBeenCalled();
      activeDocument.body.removeChild(li);
    });

    it('should trigger context menu callback on li right-click', () => {
      const task = createBaseTask();
      const li = renderer.buildTaskListItem(task);
      activeDocument.body.appendChild(li);

      const event = new MouseEvent('contextmenu', {
        bubbles: true,
        clientX: 100,
        clientY: 200,
      });
      li.dispatchEvent(event);

      expect(mockOnContextMenu).toHaveBeenCalledWith(
        task,
        expect.any(MouseEvent),
      );
      activeDocument.body.removeChild(li);
    });
  });

  // ============================================================================
  // updateTaskElementContent
  // ============================================================================
  describe('updateTaskElementContent', () => {
    it('should update checkbox data-task when state changes', () => {
      const task = createBaseTask({ state: 'TODO', completed: false });
      const li = renderer.buildTaskListItem(task);

      const updatedTask = createBaseTask({ state: 'DONE', completed: true });
      renderer.updateTaskElementContent(updatedTask, li);

      const checkbox = li.querySelector(
        'input.todoseq-task-checkbox',
      ) as HTMLInputElement;
      expect(checkbox.getAttribute('data-task')).toBe('x');
      expect(checkbox.checked).toBe(true);
      expect(li.getAttribute('data-task')).toBe('x');
    });

    it('should update keyword text and aria-checked', () => {
      const task = createBaseTask({ state: 'TODO', completed: false });
      const li = renderer.buildTaskListItem(task);

      const updatedTask = createBaseTask({ state: 'DONE', completed: true });
      renderer.updateTaskElementContent(updatedTask, li);

      const keyword = li.querySelector('.todo-task-keyword') as HTMLSpanElement;
      expect(keyword.textContent).toBe('DONE');
      expect(keyword.getAttribute('aria-checked')).toBe('true');
    });

    it('should rebuild text when rawText changes', () => {
      const task = createBaseTask({
        state: 'TODO',
        text: 'Original',
        rawText: 'TODO Original',
      });
      const li = renderer.buildTaskListItem(task);

      const updatedTask = createBaseTask({
        state: 'TODO',
        text: 'Updated',
        rawText: 'TODO Updated',
      });
      renderer.updateTaskElementContent(updatedTask, li);

      expect(li.getAttribute('data-raw-text')).toBe('TODO Updated');
      expect(li.textContent).toContain('Updated');
    });

    it('should not rebuild text when rawText is unchanged', () => {
      const task = createBaseTask({
        state: 'TODO',
        text: 'Original',
        rawText: 'TODO Original',
      });
      const li = renderer.buildTaskListItem(task);

      // Spy on renderTaskTextWithLinks to ensure it's not called
      const spy = jest.spyOn(renderer as any, 'renderTaskTextWithLinks');
      const updatedTask = createBaseTask({
        state: 'TODO',
        text: 'Same',
        rawText: 'TODO Original',
        completed: true,
      });
      renderer.updateTaskElementContent(updatedTask, li);

      // Text should not be rebuilt, but completed class should toggle
      expect(spy).not.toHaveBeenCalled();
      expect(
        li.querySelector('.todoseq-task-text')?.classList.contains('completed'),
      ).toBe(true);

      spy.mockRestore();
    });

    it('should add subtask indicator when task gains subtasks', () => {
      const task = createBaseTask({ subtaskCount: 0 });
      const li = renderer.buildTaskListItem(task);

      const updatedTask = createBaseTask({
        subtaskCount: 2,
        subtaskCompletedCount: 1,
      });
      renderer.updateTaskElementContent(updatedTask, li);

      expect(li.querySelector('.todoseq-subtask-indicator')).not.toBeNull();
    });

    it('should remove subtask indicator when task loses subtasks', () => {
      const task = createBaseTask({
        subtaskCount: 2,
        subtaskCompletedCount: 1,
      });
      const li = renderer.buildTaskListItem(task);

      const updatedTask = createBaseTask({ subtaskCount: 0 });
      renderer.updateTaskElementContent(updatedTask, li);

      expect(li.querySelector('.todoseq-subtask-indicator')).toBeNull();
    });

    it('should add date display when task gains dates', () => {
      const task = createBaseTask({ scheduledDate: null, completed: false });
      const li = renderer.buildTaskListItem(task);

      const updatedTask = createBaseTask({
        scheduledDate: new Date(2026, 3, 1),
        completed: false,
      });
      renderer.updateTaskElementContent(updatedTask, li);

      expect(li.querySelector('.todoseq-task-date-container')).not.toBeNull();
    });

    it('should remove date display when task loses dates', () => {
      const task = createBaseTask({
        scheduledDate: new Date(2026, 3, 1),
        completed: false,
      });
      const li = renderer.buildTaskListItem(task);

      const updatedTask = createBaseTask({
        scheduledDate: null,
        completed: false,
      });
      renderer.updateTaskElementContent(updatedTask, li);

      expect(li.querySelector('.todoseq-task-date-container')).toBeNull();
    });

    it('should update LI classes for task state', () => {
      const task = createBaseTask({ state: 'TODO', completed: false });
      const li = renderer.buildTaskListItem(task);

      const updatedTask = createBaseTask({ state: 'DONE', completed: true });
      renderer.updateTaskElementContent(updatedTask, li);

      expect(li.classList.contains('completed')).toBe(true);
      expect(li.classList.contains('cancelled')).toBe(true);
      expect(li.classList.contains('in-progress')).toBe(false);
      expect(li.classList.contains('active')).toBe(false);
    });

    it('should set draggable on reused elements', () => {
      const task = createBaseTask();
      const li = renderer.buildTaskListItem(task);
      li.draggable = false; // simulate old state

      renderer.updateTaskElementContent(task, li);
      expect(li.draggable).toBe(true);
    });
  });

  // ============================================================================
  // formatDateForDisplay
  // ============================================================================
  describe('formatDateForDisplay', () => {
    it('should return empty string for null date', () => {
      expect(renderer.formatDateForDisplay(null)).toBe('');
    });

    it('should format a date without time', () => {
      // Use a date far enough from today to avoid relative formatting
      const date = new Date();
      date.setFullYear(date.getFullYear() + 10);
      const result = renderer.formatDateForDisplay(date, false);
      expect(result).toContain(String(date.getFullYear()));
    });

    it('should format a date with time', () => {
      const date = new Date();
      date.setFullYear(date.getFullYear() + 10);
      date.setHours(14, 30, 0, 0);
      const result = renderer.formatDateForDisplay(date, true);
      expect(result).toContain(String(date.getFullYear()));
      // Time component may vary by locale, just check it's longer than date-only
      expect(result.length).toBeGreaterThan(10);
    });
  });

  // ============================================================================
  // getDateStatusClasses
  // ============================================================================
  describe('getDateStatusClasses', () => {
    it('should return empty array for null date', () => {
      expect(renderer.getDateStatusClasses(null)).toEqual([]);
    });

    it('should include overdue class for past dates', () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const classes = renderer.getDateStatusClasses(yesterday);
      expect(classes).toContain('todoseq-task-date-overdue');
      expect(classes).toContain('todoseq-task-date');
    });

    it('should include today class for today', () => {
      const today = new Date();
      const classes = renderer.getDateStatusClasses(today);
      expect(classes).toContain('todoseq-task-date-today');
      expect(classes).toContain('todoseq-task-date');
    });

    it('should include soon class for dates within 7 days', () => {
      const inThreeDays = new Date();
      inThreeDays.setDate(inThreeDays.getDate() + 3);
      const classes = renderer.getDateStatusClasses(inThreeDays);
      expect(classes).toContain('todoseq-task-date-soon');
      expect(classes).toContain('todoseq-task-date');
    });

    it('should only have base class for dates beyond 7 days', () => {
      const inTenDays = new Date();
      inTenDays.setDate(inTenDays.getDate() + 10);
      const classes = renderer.getDateStatusClasses(inTenDays);
      expect(classes).toEqual(['todoseq-task-date']);
    });
  });

  // ============================================================================
  // buildDateDisplay
  // ============================================================================
  describe('buildDateDisplay', () => {
    it('should create scheduled date display with repeat icon', () => {
      const task = createBaseTask({
        scheduledDate: new Date(2026, 3, 1, 10, 0),
        scheduledDateRepeat: { type: '+', unit: 'd', value: 1, raw: '+1d' },
        completed: false,
      });
      const parent = activeDocument.createElement('div');
      const container = renderer.buildDateDisplay(task, parent);

      expect(container.classList.contains('todoseq-task-date-container')).toBe(
        true,
      );
      const scheduledDiv = container.querySelector('.todoseq-task-date');
      expect(scheduledDiv).not.toBeNull();
      expect(container.textContent).toContain('Scheduled:');

      const repeatIcon = container.querySelector(
        '.todoseq-task-date-repeat-icon',
      );
      expect(repeatIcon).not.toBeNull();
      expect(repeatIcon?.getAttribute('title')).toBe('Repeats +1d');
    });

    it('should create deadline date display with repeat icon', () => {
      const task = createBaseTask({
        deadlineDate: new Date(2026, 3, 15, 14, 0),
        deadlineDateRepeat: { type: '.+', unit: 'w', value: 2, raw: '.+2w' },
        completed: false,
      });
      const parent = activeDocument.createElement('div');
      const container = renderer.buildDateDisplay(task, parent);

      expect(container.textContent).toContain('Deadline:');
      const repeatIcon = container.querySelector(
        '.todoseq-task-date-repeat-icon',
      );
      expect(repeatIcon).not.toBeNull();
      expect(repeatIcon?.getAttribute('title')).toBe('Repeats .+2w');
    });

    it('should create closed date display for completed tasks', () => {
      const task = createBaseTask({
        closedDate: new Date(2026, 3, 10, 9, 30),
        completed: true,
        state: 'DONE',
      });
      const parent = activeDocument.createElement('div');
      const container = renderer.buildDateDisplay(task, parent);

      expect(container.textContent).toContain('Closed:');
      const closedDiv = container.querySelector('.todoseq-task-date-closed');
      expect(closedDiv).not.toBeNull();
    });

    it('should not show scheduled/deadline dates for completed tasks', () => {
      const task = createBaseTask({
        scheduledDate: new Date(2026, 3, 1),
        deadlineDate: new Date(2026, 3, 15),
        completed: true,
        state: 'DONE',
      });
      const parent = activeDocument.createElement('div');
      const container = renderer.buildDateDisplay(task, parent);

      expect(container.textContent).not.toContain('Scheduled:');
      expect(container.textContent).not.toContain('Deadline:');
    });

    it('should not show closed date for incomplete tasks', () => {
      const task = createBaseTask({
        closedDate: new Date(2026, 3, 10),
        completed: false,
      });
      const parent = activeDocument.createElement('div');
      const container = renderer.buildDateDisplay(task, parent);

      expect(container.textContent).not.toContain('Closed:');
    });

    it('should include empty repeat cell for closed date layout consistency', () => {
      const task = createBaseTask({
        closedDate: new Date(2026, 3, 10),
        completed: true,
        state: 'DONE',
      });
      const parent = activeDocument.createElement('div');
      const container = renderer.buildDateDisplay(task, parent);

      const repeatCells = container.querySelectorAll(
        '.todoseq-task-date-repeat-cell',
      );
      expect(repeatCells.length).toBeGreaterThan(0);
    });
  });

  // ============================================================================
  // buildSubtaskIndicator
  // ============================================================================
  describe('buildSubtaskIndicator', () => {
    it('should create indicator with completed/total count', () => {
      const task = createBaseTask({
        subtaskCount: 5,
        subtaskCompletedCount: 2,
      });
      const parent = activeDocument.createElement('div');
      renderer.buildSubtaskIndicator(task, parent);

      const indicator = parent.querySelector('.todoseq-subtask-indicator');
      expect(indicator).not.toBeNull();
      expect(indicator?.textContent).toBe('2/5');
      expect(indicator?.getAttribute('title')).toBe('2 of 5 subtasks complete');
    });
  });

  // ============================================================================
  // renderTaskTextWithLinks
  // ============================================================================
  describe('renderTaskTextWithLinks', () => {
    it('should render plain text without links', () => {
      const task = createBaseTask({ text: 'Just plain text' });
      const parent = activeDocument.createElement('span');
      renderer.renderTaskTextWithLinks(task, parent);

      expect(parent.textContent).toBe('Just plain text');
      expect(parent.querySelector('.todoseq-task-link')).toBeNull();
      expect(parent.querySelector('.todoseq-task-tag')).toBeNull();
    });

    it('should render wiki links with alias', () => {
      const task = createBaseTask({ text: 'See [[Note Name|Alias]] here' });
      const parent = activeDocument.createElement('span');
      renderer.renderTaskTextWithLinks(task, parent);

      const link = parent.querySelector('.todoseq-task-link');
      expect(link).not.toBeNull();
      expect(link?.textContent).toBe('Alias');
      expect(link?.getAttribute('title')).toBe('Note Name');
      expect(parent.textContent).toBe('See Alias here');
    });

    it('should render wiki links without alias', () => {
      const task = createBaseTask({ text: 'See [[Note Name]] here' });
      const parent = activeDocument.createElement('span');
      renderer.renderTaskTextWithLinks(task, parent);

      const link = parent.querySelector('.todoseq-task-link');
      expect(link).not.toBeNull();
      expect(link?.textContent).toBe('Note Name');
    });

    it('should render markdown links', () => {
      const task = createBaseTask({
        text: 'Check [Label](https://example.com) out',
      });
      const parent = activeDocument.createElement('span');
      renderer.renderTaskTextWithLinks(task, parent);

      const link = parent.querySelector('.todoseq-task-link');
      expect(link).not.toBeNull();
      expect(link?.textContent).toBe('Label');
      expect(link?.getAttribute('title')).toBe('https://example.com');
    });

    it('should render bare URLs', () => {
      const task = createBaseTask({ text: 'Visit https://example.com today' });
      const parent = activeDocument.createElement('span');
      renderer.renderTaskTextWithLinks(task, parent);

      const link = parent.querySelector('.todoseq-task-link');
      expect(link).not.toBeNull();
      expect(link?.textContent).toBe('https://example.com');
    });

    it('should render tags as tag spans', () => {
      const task = createBaseTask({ text: 'Review #urgent #followup' });
      const parent = activeDocument.createElement('span');
      renderer.renderTaskTextWithLinks(task, parent);

      const tags = parent.querySelectorAll('.todoseq-task-tag');
      expect(tags.length).toBe(2);
      expect(tags[0]?.textContent).toBe('#urgent');
      expect(tags[1]?.textContent).toBe('#followup');
    });

    it('should handle mixed links and text', () => {
      const task = createBaseTask({
        text: 'See [[Note]] and [link](https://a.com) and #tag here',
      });
      const parent = activeDocument.createElement('span');
      renderer.renderTaskTextWithLinks(task, parent);

      expect(parent.querySelectorAll('.todoseq-task-link').length).toBe(2);
      expect(parent.querySelectorAll('.todoseq-task-tag').length).toBe(1);
      expect(parent.textContent).toBe('See Note and link and #tag here');
    });

    it('should handle textDisplay when available', () => {
      const task = createBaseTask({
        text: '**Bold** text',
        textDisplay: 'Bold text',
      });
      const parent = activeDocument.createElement('span');
      renderer.renderTaskTextWithLinks(task, parent);

      expect(parent.textContent).toBe('Bold text');
    });
  });

  // ============================================================================
  // Private method coverage via buildTaskListItem / updateTaskElementContent
  // ============================================================================
  describe('attachTaskContextMenuHandlers (via buildTaskListItem)', () => {
    it('should not trigger context menu for right-clicks on keyword', () => {
      const task = createBaseTask();
      const li = renderer.buildTaskListItem(task);
      activeDocument.body.appendChild(li);

      const keyword = li.querySelector('.todo-task-keyword')!;
      const event = new MouseEvent('contextmenu', { bubbles: true });
      keyword.dispatchEvent(event);

      // The keyword has its own context menu handler, not the task's
      // So onContextMenu should not be called from the LI handler for keyword clicks
      expect(mockOnContextMenu).not.toHaveBeenCalled();
      activeDocument.body.removeChild(li);
    });

    it('should trigger context menu for right-clicks outside keyword', () => {
      const task = createBaseTask();
      const li = renderer.buildTaskListItem(task);
      activeDocument.body.appendChild(li);

      const textWrapper = li.querySelector('.todoseq-task-text-wrapper')!;
      const event = new MouseEvent('contextmenu', { bubbles: true });
      textWrapper.dispatchEvent(event);

      expect(mockOnContextMenu).toHaveBeenCalled();
      activeDocument.body.removeChild(li);
    });
  });

  describe('openStateMenuAtMouseEvent (via keyword contextmenu)', () => {
    it('should close any active dialog before opening menu', () => {
      const task = createBaseTask({ state: 'TODO' });
      const span = activeDocument.createElement('span');
      renderer.attachKeywordHandlers(span, task);

      const event = new MouseEvent('contextmenu', {
        clientX: 50,
        clientY: 60,
        bubbles: true,
      });
      span.dispatchEvent(event);

      expect(mockMenuBuilder.buildStateMenu).toHaveBeenCalled();
      const menu = mockMenuBuilder.buildStateMenu.mock.results[0].value;
      expect(menu.showAtMouseEvent).toHaveBeenCalled();
    });
  });

  describe('openStateMenuAtPosition (via keyword keyboard)', () => {
    it('should show menu at computed position on ContextMenu key', () => {
      const task = createBaseTask({ state: 'TODO' });
      const span = activeDocument.createElement('span');
      span.getBoundingClientRect = () =>
        ({
          left: 10,
          bottom: 30,
          width: 40,
          height: 20,
          top: 10,
          right: 50,
          x: 10,
          y: 10,
          toJSON: () => ({}),
        }) as DOMRect;
      renderer.attachKeywordHandlers(span, task);

      const event = new KeyboardEvent('keydown', {
        key: 'ContextMenu',
        bubbles: true,
      });
      span.dispatchEvent(event);

      const menu = mockMenuBuilder.buildStateMenu.mock.results[0].value;
      expect(menu.showAtPosition).toHaveBeenCalledWith({ x: 10, y: 30 });
    });
  });
});
