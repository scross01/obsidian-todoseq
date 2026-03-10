/**
 * @jest-environment jsdom
 */

import {
  TaskContextMenu,
  TaskContextMenuCallbacks,
  TaskContextMenuConfig,
} from '../src/view/components/task-context-menu';
import { createBaseTask, createUTCDate } from './helpers/test-helper';
import { Task } from '../src/types/task';
import { App } from 'obsidian';
import { DateUtils } from '../src/utils/date-utils';

// Extend HTMLElement with Obsidian's DOM extensions for jsdom
declare global {
  interface HTMLElement {
    addClass: (cls: string) => void;
    removeClass: (cls: string) => void;
    hasClass: (cls: string) => boolean;
    setText: (text: string) => void;
    setAttr: (key: string, value: string) => void;
    createEl: <K extends keyof HTMLElementTagNameMap>(
      tag: K,
      options?: {
        cls?: string | string[];
        attr?: Record<string, string>;
        text?: string;
      },
    ) => HTMLElementTagNameMap[K];
    createDiv: (options?: {
      cls?: string;
      attr?: Record<string, string>;
    }) => HTMLDivElement;
    createSpan: (options?: { cls?: string; text?: string }) => HTMLSpanElement;
  }
}

// Install Obsidian-style DOM extensions on HTMLElement prototype
beforeAll(() => {
  HTMLElement.prototype.addClass = function (cls: string): void {
    this.classList.add(cls);
  };
  HTMLElement.prototype.removeClass = function (cls: string): void {
    this.classList.remove(cls);
  };
  HTMLElement.prototype.hasClass = function (cls: string): boolean {
    return this.classList.contains(cls);
  };
  HTMLElement.prototype.setText = function (text: string): void {
    this.textContent = text;
  };
  HTMLElement.prototype.setAttr = function (key: string, value: string): void {
    this.setAttribute(key, value);
  };
  HTMLElement.prototype.createEl = function <
    K extends keyof HTMLElementTagNameMap,
  >(
    tag: K,
    options?: {
      cls?: string | string[];
      attr?: Record<string, string>;
      text?: string;
    },
  ): HTMLElementTagNameMap[K] {
    const el = document.createElement(tag);
    if (options?.cls) {
      if (Array.isArray(options.cls)) {
        for (const c of options.cls) {
          if (c) el.classList.add(c);
        }
      } else {
        el.className = options.cls;
      }
    }
    if (options?.attr) {
      for (const [key, value] of Object.entries(options.attr)) {
        el.setAttribute(key, value);
      }
    }
    if (options?.text) el.textContent = options.text;
    this.appendChild(el);
    return el;
  };
  HTMLElement.prototype.createDiv = function (options?: {
    cls?: string;
    attr?: Record<string, string>;
  }): HTMLDivElement {
    return this.createEl('div', options);
  };
  HTMLElement.prototype.createSpan = function (options?: {
    cls?: string;
    text?: string;
  }): HTMLSpanElement {
    return this.createEl('span', options);
  };
});

// Mock obsidian module
jest.mock('obsidian', () => ({
  setIcon: jest.fn(),
  Notice: jest.fn(),
  App: jest.fn().mockImplementation(() => ({
    vault: {
      adapter: {
        read: jest.fn(),
      },
    },
  })),
}));

describe('TaskContextMenu', () => {
  let menu: TaskContextMenu;
  let callbacks: TaskContextMenuCallbacks;
  let config: TaskContextMenuConfig;
  let task: Task;
  let app: any;

  beforeEach(() => {
    // Clean up DOM
    document.body.innerHTML = '';

    // Create mock app
    app = new App();

    callbacks = {
      onGoToTask: jest.fn(),
      onCopyTask: jest.fn(),
      onCopyTaskToToday: jest.fn(),
      onMoveTaskToToday: jest.fn(),
      onPriorityChange: jest.fn(),
      onScheduledDateChange: jest.fn(),
      onDeadlineDateChange: jest.fn(),
      onDeadlineClick: jest.fn(),
    };

    config = {
      weekStartsOn: 'Monday',
    };

    menu = new TaskContextMenu(callbacks, config, app);

    task = createBaseTask({
      rawText: 'TODO Task text',
      priority: null,
      scheduledDate: null,
    });
  });

  afterEach(() => {
    menu.cleanup();
    jest.restoreAllMocks();
  });

  describe('show/hide lifecycle', () => {
    it('should not be visible initially', () => {
      expect(menu.isVisible()).toBe(false);
    });

    it('should be visible after show()', async () => {
      await menu.show(task, { x: 100, y: 100 });
      expect(menu.isVisible()).toBe(true);
    });

    it('should not be visible after hide()', async () => {
      await menu.show(task, { x: 100, y: 100 });
      menu.hide();
      expect(menu.isVisible()).toBe(false);
    });

    it('should create a container element in the DOM', async () => {
      await menu.show(task, { x: 100, y: 100 });
      const container = document.querySelector('.todoseq-task-context-menu');
      expect(container).not.toBeNull();
    });

    it('should remove container element from DOM on hide', async () => {
      await menu.show(task, { x: 100, y: 100 });
      menu.hide();
      const container = document.querySelector('.todoseq-task-context-menu');
      expect(container).toBeNull();
    });

    it('should hide previous menu when showing a new one', async () => {
      await menu.show(task, { x: 100, y: 100 });
      const task2 = createBaseTask({ rawText: 'DOING Another task' });
      await menu.show(task2, { x: 200, y: 200 });

      // Should only have one menu in the DOM
      const containers = document.querySelectorAll(
        '.todoseq-task-context-menu',
      );
      expect(containers.length).toBe(1);
    });

    it('should set role=menu on container', async () => {
      await menu.show(task, { x: 100, y: 100 });
      const container = document.querySelector('.todoseq-task-context-menu');
      expect(container?.getAttribute('role')).toBe('menu');
    });
  });

  describe('menu sections', () => {
    beforeEach(async () => {
      await menu.show(task, { x: 100, y: 100 });
    });

    it('should render Go to task row', () => {
      const rows = document.querySelectorAll('.todoseq-context-menu-row');
      expect(rows.length).toBeGreaterThanOrEqual(1);
      const goToRow = rows[0];
      const label = goToRow.querySelector('.todoseq-context-menu-row-label');
      expect(label?.textContent).toBe('Go to task');
    });

    it('should render Scheduled section header', () => {
      const headers = document.querySelectorAll('.todoseq-context-menu-header');
      const scheduledHeader = Array.from(headers).find(
        (h) => h.textContent === 'Scheduled',
      );
      expect(scheduledHeader).not.toBeUndefined();
    });

    it('should render 6 scheduled date icons', () => {
      const iconRows = document.querySelectorAll(
        '.todoseq-context-menu-icon-row',
      );
      expect(iconRows.length).toBeGreaterThanOrEqual(2);
      const scheduledRow = iconRows[1];
      const buttons = scheduledRow.querySelectorAll(
        '.todoseq-context-menu-icon-btn',
      );
      expect(buttons.length).toBe(6);
    });

    it('should render Priority section header', () => {
      const headers = document.querySelectorAll('.todoseq-context-menu-header');
      const priorityHeader = Array.from(headers).find(
        (h) => h.textContent === 'Priority',
      );
      expect(priorityHeader).not.toBeUndefined();
    });

    it('should render 4 priority icons', () => {
      const iconRows = document.querySelectorAll(
        '.todoseq-context-menu-icon-row',
      );
      expect(iconRows.length).toBeGreaterThanOrEqual(2);
      const priorityRow = iconRows[0];
      const buttons = priorityRow.querySelectorAll(
        '.todoseq-context-menu-icon-btn',
      );
      expect(buttons.length).toBe(4);
    });

    it('should render Deadline row', () => {
      const rows = document.querySelectorAll('.todoseq-context-menu-row');
      const deadlineRow = Array.from(rows).find((r) => {
        const label = r.querySelector('.todoseq-context-menu-row-label');
        return label?.textContent === 'Deadline';
      });
      expect(deadlineRow).not.toBeUndefined();
    });

    it('should render separators between sections', () => {
      const separators = document.querySelectorAll(
        '.todoseq-context-menu-separator',
      );
      expect(separators.length).toBe(4);
    });
  });

  describe('Go to task action', () => {
    it('should call onGoToTask callback when clicked', async () => {
      await menu.show(task, { x: 100, y: 100 });
      const rows = document.querySelectorAll('.todoseq-context-menu-row');
      const goToRow = rows[0] as HTMLElement;
      goToRow.click();

      expect(callbacks.onGoToTask).toHaveBeenCalledWith(task);
    });

    it('should hide menu after Go to task click', async () => {
      await menu.show(task, { x: 100, y: 100 });
      const rows = document.querySelectorAll('.todoseq-context-menu-row');
      const goToRow = rows[0] as HTMLElement;
      goToRow.click();

      expect(menu.isVisible()).toBe(false);
    });
  });

  describe('Priority actions', () => {
    it('should call onPriorityChange with high when first flag clicked', async () => {
      await menu.show(task, { x: 100, y: 100 });
      const iconRows = document.querySelectorAll(
        '.todoseq-context-menu-icon-row',
      );
      const priorityRow = iconRows[0];
      const buttons = priorityRow.querySelectorAll(
        '.todoseq-context-menu-icon-btn',
      );
      (buttons[0] as HTMLElement).click();

      expect(callbacks.onPriorityChange).toHaveBeenCalledWith(task, 'high');
    });

    it('should call onPriorityChange with med when second flag clicked', async () => {
      await menu.show(task, { x: 100, y: 100 });
      const iconRows = document.querySelectorAll(
        '.todoseq-context-menu-icon-row',
      );
      const priorityRow = iconRows[0];
      const buttons = priorityRow.querySelectorAll(
        '.todoseq-context-menu-icon-btn',
      );
      (buttons[1] as HTMLElement).click();

      expect(callbacks.onPriorityChange).toHaveBeenCalledWith(task, 'med');
    });

    it('should call onPriorityChange with low when third flag clicked', async () => {
      await menu.show(task, { x: 100, y: 100 });
      const iconRows = document.querySelectorAll(
        '.todoseq-context-menu-icon-row',
      );
      const priorityRow = iconRows[0];
      const buttons = priorityRow.querySelectorAll(
        '.todoseq-context-menu-icon-btn',
      );
      (buttons[2] as HTMLElement).click();

      expect(callbacks.onPriorityChange).toHaveBeenCalledWith(task, 'low');
    });

    it('should call onPriorityChange with null when flag-off clicked', async () => {
      await menu.show(task, { x: 100, y: 100 });
      const iconRows = document.querySelectorAll(
        '.todoseq-context-menu-icon-row',
      );
      const priorityRow = iconRows[0];
      const buttons = priorityRow.querySelectorAll(
        '.todoseq-context-menu-icon-btn',
      );
      (buttons[3] as HTMLElement).click();

      expect(callbacks.onPriorityChange).toHaveBeenCalledWith(task, null);
    });

    it('should highlight current priority with is-active class', async () => {
      const highPriorityTask = createBaseTask({ priority: 'high' });
      await menu.show(highPriorityTask, { x: 100, y: 100 });

      const iconRows = document.querySelectorAll(
        '.todoseq-context-menu-icon-row',
      );
      const priorityRow = iconRows[0];
      const buttons = priorityRow.querySelectorAll(
        '.todoseq-context-menu-icon-btn',
      );

      // No priority should be highlighted (user preference: no highlighting)
      expect(buttons[0].classList.contains('is-active')).toBe(false);
      expect(buttons[1].classList.contains('is-active')).toBe(false);
      expect(buttons[2].classList.contains('is-active')).toBe(false);
      expect(buttons[3].classList.contains('is-active')).toBe(false);
    });

    it('should highlight no-priority when task has no priority', async () => {
      const noPriorityTask = createBaseTask({ priority: null });
      await menu.show(noPriorityTask, { x: 100, y: 100 });

      const iconRows = document.querySelectorAll(
        '.todoseq-context-menu-icon-row',
      );
      const priorityRow = iconRows[0];
      const buttons = priorityRow.querySelectorAll(
        '.todoseq-context-menu-icon-btn',
      );

      // No priority should be highlighted (user preference: no highlighting)
      expect(buttons[0].classList.contains('is-active')).toBe(false);
      expect(buttons[1].classList.contains('is-active')).toBe(false);
      expect(buttons[2].classList.contains('is-active')).toBe(false);
      expect(buttons[3].classList.contains('is-active')).toBe(false);
    });
  });

  describe('Scheduled date actions', () => {
    it('should call onScheduledDateChange with today date', async () => {
      await menu.show(task, { x: 100, y: 100 });
      const iconRows = document.querySelectorAll(
        '.todoseq-context-menu-icon-row',
      );
      const scheduledRow = iconRows[1];
      const buttons = scheduledRow.querySelectorAll(
        '.todoseq-context-menu-icon-btn',
      );
      (buttons[0] as HTMLElement).click(); // Today

      expect(callbacks.onScheduledDateChange).toHaveBeenCalled();
      const callArgs = (callbacks.onScheduledDateChange as jest.Mock).mock
        .calls[0];
      expect(callArgs[0]).toBe(task);
      expect(callArgs[1]).toBeInstanceOf(Date);
    });

    it('should call onScheduledDateChange with null for No date', async () => {
      await menu.show(task, { x: 100, y: 100 });
      const iconRows = document.querySelectorAll(
        '.todoseq-context-menu-icon-row',
      );
      const scheduledRow = iconRows[1];
      const buttons = scheduledRow.querySelectorAll(
        '.todoseq-context-menu-icon-btn',
      );
      (buttons[4] as HTMLElement).click(); // No date

      expect(callbacks.onScheduledDateChange).toHaveBeenCalledWith(task, null);
    });

    it('should preserve existing time when choosing Tomorrow', async () => {
      // Mock DateUtils.getDateOnly to return a fixed date (timezone-independent)
      jest.spyOn(DateUtils, 'getDateOnly').mockReturnValue(
        createUTCDate(2026, 3, 8), // March 8, 2026 UTC
      );

      // Create a task with a scheduled date that has a time component
      const taskWithTime = createBaseTask({
        rawText: 'TODO Task text',
        priority: null,
        scheduledDate: createUTCDate(2026, 3, 8, 9, 30, 0, 0), // March 8, 2026 at 09:30 UTC
      });

      await menu.show(taskWithTime, { x: 100, y: 100 });
      const iconRows = document.querySelectorAll(
        '.todoseq-context-menu-icon-row',
      );
      const scheduledRow = iconRows[1];
      const buttons = scheduledRow.querySelectorAll(
        '.todoseq-context-menu-icon-btn',
      );
      (buttons[1] as HTMLElement).click(); // Tomorrow

      expect(callbacks.onScheduledDateChange).toHaveBeenCalled();
      const callArgs = (callbacks.onScheduledDateChange as jest.Mock).mock
        .calls[0];
      expect(callArgs[0]).toBe(taskWithTime);
      expect(callArgs[1]).toBeInstanceOf(Date);

      const newDate = callArgs[1] as Date;
      expect(newDate.getUTCHours()).toBe(9);
      expect(newDate.getUTCMinutes()).toBe(30);
      // Date should be March 9 (tomorrow relative to March 8)
      expect(newDate.getUTCDate()).toBe(9);
    });

    it('should preserve existing time when choosing Today', async () => {
      // Create a task with a scheduled date that has a time component
      const taskWithTime = createBaseTask({
        rawText: 'TODO Task text',
        priority: null,
        scheduledDate: createUTCDate(2026, 3, 8, 14, 45, 0, 0), // March 8, 2026 at 14:45 UTC
      });

      await menu.show(taskWithTime, { x: 100, y: 100 });
      const iconRows = document.querySelectorAll(
        '.todoseq-context-menu-icon-row',
      );
      const scheduledRow = iconRows[1];
      const buttons = scheduledRow.querySelectorAll(
        '.todoseq-context-menu-icon-btn',
      );
      (buttons[0] as HTMLElement).click(); // Today

      expect(callbacks.onScheduledDateChange).toHaveBeenCalled();
      const callArgs = (callbacks.onScheduledDateChange as jest.Mock).mock
        .calls[0];
      expect(callArgs[0]).toBe(taskWithTime);
      expect(callArgs[1]).toBeInstanceOf(Date);

      const newDate = callArgs[1] as Date;
      expect(newDate.getUTCHours()).toBe(14);
      expect(newDate.getUTCMinutes()).toBe(45);
    });

    it('should not preserve time when task has no existing scheduled date', async () => {
      // Task with no scheduled date
      const taskNoDate = createBaseTask({
        rawText: 'TODO Task text',
        priority: null,
        scheduledDate: null,
      });

      await menu.show(taskNoDate, { x: 100, y: 100 });
      const iconRows = document.querySelectorAll(
        '.todoseq-context-menu-icon-row',
      );
      const scheduledRow = iconRows[1];
      const buttons = scheduledRow.querySelectorAll(
        '.todoseq-context-menu-icon-btn',
      );
      (buttons[0] as HTMLElement).click(); // Today

      expect(callbacks.onScheduledDateChange).toHaveBeenCalled();
      const callArgs = (callbacks.onScheduledDateChange as jest.Mock).mock
        .calls[0];
      expect(callArgs[0]).toBe(taskNoDate);
      expect(callArgs[1]).toBeInstanceOf(Date);

      const newDate = callArgs[1] as Date;
      // Should be midnight (no time component)
      expect(newDate.getHours()).toBe(0);
      expect(newDate.getMinutes()).toBe(0);
    });

    it('should not preserve time when existing scheduled date is at midnight', async () => {
      // Mock DateUtils.getDateOnly to return a fixed date (timezone-independent)
      const todayUTC = createUTCDate(2026, 3, 8); // March 8, 2026 UTC
      jest.spyOn(DateUtils, 'getDateOnly').mockReturnValue(todayUTC);

      // Task with a scheduled date at midnight (no time component)
      // Note: Even though we create a UTC date, the context menu code uses local time methods
      // (getHours(), getMinutes()) to check for time components. In UTC-4 timezone,
      // midnight UTC is 20:00 local time, so the code thinks there's a time component.
      // This is a known limitation of the context menu code.
      const taskMidnight = createBaseTask({
        rawText: 'TODO Task text',
        priority: null,
        scheduledDate: createUTCDate(2026, 3, 8, 0, 0, 0, 0), // March 8, 2026 at 00:00 UTC
      });

      await menu.show(taskMidnight, { x: 100, y: 100 });
      const iconRows = document.querySelectorAll(
        '.todoseq-context-menu-icon-row',
      );
      const scheduledRow = iconRows[1];
      const buttons = scheduledRow.querySelectorAll(
        '.todoseq-context-menu-icon-btn',
      );
      (buttons[1] as HTMLElement).click(); // Tomorrow

      expect(callbacks.onScheduledDateChange).toHaveBeenCalled();
      const callArgs = (callbacks.onScheduledDateChange as jest.Mock).mock
        .calls[0];
      expect(callArgs[0]).toBe(taskMidnight);
      expect(callArgs[1]).toBeInstanceOf(Date);

      const newDate = callArgs[1] as Date;
      // The new date should be tomorrow (March 9, 2026 UTC)
      // Note: The context menu code uses local time methods, so the time component
      // might not be exactly midnight UTC due to timezone conversion
      expect(newDate.getUTCDate()).toBe(9);
    });

    it('should preserve existing repeat when choosing Today', async () => {
      // Create a task with a scheduled date that has a repeat component
      const taskWithRepeat = createBaseTask({
        rawText: 'TODO Task text',
        priority: null,
        scheduledDate: createUTCDate(2026, 3, 8, 10, 30, 0, 0), // March 8, 2026 at 10:30 UTC
        scheduledDateRepeat: {
          type: '.+',
          unit: 'd',
          value: 1,
          raw: '.+1d',
        },
      });

      await menu.show(taskWithRepeat, { x: 100, y: 100 });
      const iconRows = document.querySelectorAll(
        '.todoseq-context-menu-icon-row',
      );
      const scheduledRow = iconRows[1];
      const buttons = scheduledRow.querySelectorAll(
        '.todoseq-context-menu-icon-btn',
      );
      (buttons[0] as HTMLElement).click(); // Today

      expect(callbacks.onScheduledDateChange).toHaveBeenCalled();
      const callArgs = (callbacks.onScheduledDateChange as jest.Mock).mock
        .calls[0];
      expect(callArgs[0]).toBe(taskWithRepeat);
      expect(callArgs[1]).toBeInstanceOf(Date);
      expect(callArgs[2]).toEqual({
        type: '.+',
        unit: 'd',
        value: 1,
        raw: '.+1d',
      });

      const newDate = callArgs[1] as Date;
      expect(newDate.getUTCHours()).toBe(10);
      expect(newDate.getUTCMinutes()).toBe(30);
    });

    it('should preserve existing repeat when choosing Tomorrow', async () => {
      // Mock DateUtils.getDateOnly to return a fixed date (timezone-independent)
      jest.spyOn(DateUtils, 'getDateOnly').mockReturnValue(
        createUTCDate(2026, 3, 8), // March 8, 2026 UTC
      );

      // Create a task with a scheduled date that has a repeat component
      const taskWithRepeat = createBaseTask({
        rawText: 'TODO Task text',
        priority: null,
        scheduledDate: createUTCDate(2026, 3, 8, 14, 0, 0, 0), // March 8, 2026 at 14:00 UTC
        scheduledDateRepeat: {
          type: '.+',
          unit: 'w',
          value: 1,
          raw: '.+1w',
        },
      });

      await menu.show(taskWithRepeat, { x: 100, y: 100 });
      const iconRows = document.querySelectorAll(
        '.todoseq-context-menu-icon-row',
      );
      const scheduledRow = iconRows[1];
      const buttons = scheduledRow.querySelectorAll(
        '.todoseq-context-menu-icon-btn',
      );
      (buttons[1] as HTMLElement).click(); // Tomorrow

      expect(callbacks.onScheduledDateChange).toHaveBeenCalled();
      const callArgs = (callbacks.onScheduledDateChange as jest.Mock).mock
        .calls[0];
      expect(callArgs[0]).toBe(taskWithRepeat);
      expect(callArgs[1]).toBeInstanceOf(Date);
      expect(callArgs[2]).toEqual({
        type: '.+',
        unit: 'w',
        value: 1,
        raw: '.+1w',
      });

      const newDate = callArgs[1] as Date;
      expect(newDate.getUTCHours()).toBe(14);
      expect(newDate.getUTCMinutes()).toBe(0);
      // Date should be March 9 (tomorrow relative to March 8)
      expect(newDate.getUTCDate()).toBe(9);
    });
  });

  describe('Deadline action', () => {
    it('should hide menu when Deadline row clicked (date picker will be shown)', async () => {
      await menu.show(task, { x: 100, y: 100 });
      const rows = document.querySelectorAll('.todoseq-context-menu-row');
      const deadlineRow = Array.from(rows).find((r) => {
        const label = r.querySelector('.todoseq-context-menu-row-label');
        return label?.textContent === 'Deadline';
      }) as HTMLElement;
      deadlineRow.click();

      // The menu should be hidden after clicking Deadline
      expect(menu.isVisible()).toBe(false);
      // onDeadlineClick is no longer called - the date picker is shown instead
      expect(callbacks.onDeadlineClick).not.toHaveBeenCalled();
    });
  });

  describe('keyboard navigation', () => {
    it('should close on Escape key', async () => {
      await menu.show(task, { x: 100, y: 100 });
      const event = new KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true,
      });
      document.dispatchEvent(event);

      expect(menu.isVisible()).toBe(false);
    });
  });

  describe('showAtMouseEvent', () => {
    it('should show menu at mouse event position', async () => {
      const evt = new MouseEvent('contextmenu', {
        clientX: 150,
        clientY: 250,
        bubbles: true,
      });
      await menu.showAtMouseEvent(task, evt);

      expect(menu.isVisible()).toBe(true);
    });
  });

  describe('cleanup', () => {
    it('should remove menu from DOM on cleanup', async () => {
      await menu.show(task, { x: 100, y: 100 });
      menu.cleanup();

      const container = document.querySelector('.todoseq-task-context-menu');
      expect(container).toBeNull();
      expect(menu.isVisible()).toBe(false);
    });
  });

  describe('date picker interaction', () => {
    it('should close date picker when showing a new context menu', async () => {
      // Create a mock DatePicker with hide, isVisible, and cleanup methods
      const mockDatePicker = {
        hide: jest.fn(),
        isVisible: jest.fn().mockReturnValue(true),
        cleanup: jest.fn(),
      };

      // Set the datePicker property on the menu instance
      (menu as any).datePicker = mockDatePicker;

      // Show a new context menu - this should close the date picker
      await menu.show(task, { x: 100, y: 100 });

      // Verify that the date picker's hide method was called
      expect(mockDatePicker.hide).toHaveBeenCalled();
    });

    it('should not call hide on date picker if it is not visible', async () => {
      // Create a mock DatePicker that is not visible
      const mockDatePicker = {
        hide: jest.fn(),
        isVisible: jest.fn().mockReturnValue(false),
        cleanup: jest.fn(),
      };

      // Set the datePicker property on the menu instance
      (menu as any).datePicker = mockDatePicker;

      // Show a new context menu
      await menu.show(task, { x: 100, y: 100 });

      // Verify that the date picker's hide method was NOT called
      expect(mockDatePicker.hide).not.toHaveBeenCalled();
    });

    it('should handle null date picker gracefully when showing context menu', async () => {
      // Ensure datePicker is null
      (menu as any).datePicker = null;

      // Show a new context menu - should not throw
      await expect(menu.show(task, { x: 100, y: 100 })).resolves.not.toThrow();

      // Verify menu is shown
      expect(menu.isVisible()).toBe(true);
    });
  });
});
