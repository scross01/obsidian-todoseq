/**
 * @jest-environment jsdom
 */

import {
  TaskContextMenu,
  TaskContextMenuCallbacks,
  TaskContextMenuConfig,
} from '../src/view/components/task-context-menu';
import { createBaseTask } from './helpers/test-helper';
import { Task } from '../src/types/task';
import { App } from 'obsidian';

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
      onPriorityChange: jest.fn(),
      onScheduledDateChange: jest.fn(),
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
  });

  describe('Deadline action', () => {
    it('should call onDeadlineClick when Deadline row clicked', async () => {
      await menu.show(task, { x: 100, y: 100 });
      const rows = document.querySelectorAll('.todoseq-context-menu-row');
      const deadlineRow = Array.from(rows).find((r) => {
        const label = r.querySelector('.todoseq-context-menu-row-label');
        return label?.textContent === 'Deadline';
      }) as HTMLElement;
      deadlineRow.click();

      expect(callbacks.onDeadlineClick).toHaveBeenCalledWith(task);
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
});
