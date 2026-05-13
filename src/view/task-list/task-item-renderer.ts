import { Task } from '../../types/task';
import { DateUtils } from '../../utils/date-utils';
import { setIcon, Platform, Notice } from 'obsidian';
import {
  TAG_PATTERN,
  WIKI_LINK_REGEX,
  MD_LINK_REGEX,
  URL_REGEX,
} from '../../utils/patterns';
import {
  getFilename,
  getSubtaskDisplayText,
  hasSubtasks,
  getTaskTextDisplay,
} from '../../utils/task-utils';
import { KeywordManager } from '../../utils/keyword-manager';
import type { TaskStateTransitionManager } from '../../services/task-state-transition-manager';
import { StateMenuBuilder } from '../components/state-menu-builder';
import { BaseDialog } from '../components/base-dialog';

interface LinkPattern {
  type: 'wiki' | 'md' | 'url' | 'tag';
  regex: RegExp;
}

const LINK_PATTERNS: LinkPattern[] = [
  { type: 'wiki' as const, regex: new RegExp(WIKI_LINK_REGEX) },
  { type: 'md' as const, regex: new RegExp(MD_LINK_REGEX) },
  { type: 'url' as const, regex: new RegExp(URL_REGEX) },
  { type: 'tag' as const, regex: new RegExp(TAG_PATTERN) },
];

export type TaskStateChangeCallback = (
  task: Task,
  newState: string,
) => Promise<void>;

export type TaskLocationOpenCallback = (task: Task) => void | Promise<void>;

export type TaskContextMenuCallback = (
  task: Task,
  evt: MouseEvent,
) => void | Promise<void>;

/**
 * TaskItemRenderer - Handles rendering individual task items for the Task List View.
 * This class encapsulates all DOM building logic for tasks, including:
 * - Checkbox building
 * - Keyword/priority badges
 * - Date displays (scheduled/deadline)
 * - Subtask indicators
 * - Text with links rendering
 */
export class TaskItemRenderer {
  private getKeywordManager: () => KeywordManager;
  private getStateManager: () => TaskStateTransitionManager;
  private getMenuBuilder: () => StateMenuBuilder;
  private getTaskStateManager: () => {
    findTaskByPathAndLine: (path: string, line: number) => Task | null;
  } | null;
  private onStateChange: TaskStateChangeCallback;
  private onLocationOpen: TaskLocationOpenCallback;
  private onContextMenu: TaskContextMenuCallback | null;

  constructor(
    getKeywordManager: () => KeywordManager,
    getStateManager: () => TaskStateTransitionManager,
    getMenuBuilder: () => StateMenuBuilder,
    onStateChange: TaskStateChangeCallback,
    onLocationOpen: TaskLocationOpenCallback,
    onContextMenu: TaskContextMenuCallback | null = null,
    getTaskStateManager: () => {
      findTaskByPathAndLine: (path: string, line: number) => Task | null;
    } | null = () => null,
  ) {
    this.getKeywordManager = getKeywordManager;
    this.getStateManager = getStateManager;
    this.getMenuBuilder = getMenuBuilder;
    this.getTaskStateManager = getTaskStateManager;
    this.onStateChange = onStateChange;
    this.onLocationOpen = onLocationOpen;
    this.onContextMenu = onContextMenu;
  }

  private get keywordManager(): KeywordManager {
    return this.getKeywordManager();
  }

  private get stateManager(): TaskStateTransitionManager {
    return this.getStateManager();
  }

  private get menuBuilder(): StateMenuBuilder {
    return this.getMenuBuilder();
  }

  /**
   * Set the context menu callback (can be set after construction)
   */
  setContextMenuCallback(callback: TaskContextMenuCallback | null): void {
    this.onContextMenu = callback;
  }

  /**
   * Build checkbox element for a task
   */
  buildCheckbox(task: Task, container: HTMLElement): HTMLInputElement {
    const checkbox = container.createEl('input', {
      type: 'checkbox',
      cls: 'todoseq-task-checkbox',
    });

    checkbox.addClass('task-list-item-checkbox');

    const settings = this.keywordManager.getSettings();

    // Determine data-task character and checked state based on settings
    let dataTaskChar: string;
    if (settings.useExtendedCheckboxStyles) {
      // Theme handles styling via :checked + data-task selectors
      dataTaskChar = this.keywordManager.getCheckboxState(task.state, settings);
      checkbox.checked = dataTaskChar !== ' ';
    } else {
      // Default behavior: use standard checkbox states
      // For active keywords, use '/' so CSS can apply active styling
      if (this.keywordManager.isActive(task.state)) {
        dataTaskChar = '/';
      } else if (this.keywordManager.isCompleted(task.state)) {
        dataTaskChar = 'x';
      } else {
        dataTaskChar = ' ';
      }
      checkbox.checked = task.completed;
    }

    checkbox.setAttribute('data-task', dataTaskChar);

    checkbox.addEventListener('change', async () => {
      // CRITICAL: Look up fresh task state BEFORE computing transition
      // The task object in closure may be stale after recurrence updates
      const freshTask = this.getTaskStateManager()?.findTaskByPathAndLine(
        task.path,
        task.line,
      );
      const currentTask = freshTask || task;
      const currentState = currentTask.state;

      let targetState: string | null = null;

      if (checkbox.checked) {
        targetState =
          this.stateManager.getNextCompletedOrArchivedState(currentState);
      } else {
        targetState = this.stateManager.getNextState(currentState);
        if (targetState === currentState) {
          checkbox.checked = true;
          return;
        }
      }

      // If no state change, don't proceed
      if (targetState === currentState) {
        return;
      }

      await this.onStateChange(currentTask, targetState);
    });

    return checkbox;
  }

  /**
   * Build keyword span element for a task
   */
  buildKeyword(task: Task, parent: HTMLElement): HTMLSpanElement {
    const todoSpan = parent.createEl('span', { cls: 'todo-task-keyword' });
    todoSpan.setText(task.state);
    todoSpan.setAttr('role', 'button');
    todoSpan.setAttr('tabindex', '0');
    todoSpan.setAttr('aria-checked', String(task.completed));

    this.attachKeywordHandlers(todoSpan, task);

    return todoSpan;
  }

  /**
   * Attach event handlers to a keyword span for click, keyboard, contextmenu, and touch events.
   */
  attachKeywordHandlers(todoSpan: HTMLSpanElement, task: Task): void {
    const activate = async (evt: Event) => {
      evt.stopPropagation();
      await this.onStateChange(
        task,
        this.stateManager.getNextState(task.state),
      );
    };

    // Click advances to next state (quick action)
    todoSpan.addEventListener('click', (evt) => {
      void activate(evt);
    });

    // Keyboard support: Enter/Space and menu keys
    todoSpan.addEventListener('keydown', (evt: KeyboardEvent) => {
      const key = evt.key;
      if (key === 'Enter' || key === ' ') {
        evt.preventDefault();
        evt.stopPropagation();
        activate(evt).catch((error) => {
          new Notice('Failed to activate task');
          console.error('Error activating task:', error);
        });
      }
      if (key === 'F10' && evt.shiftKey) {
        evt.preventDefault();
        evt.stopPropagation();
        const rect = todoSpan.getBoundingClientRect();
        this.openStateMenuAtPosition(task, { x: rect.left, y: rect.bottom });
      }
      if (key === 'ContextMenu') {
        evt.preventDefault();
        evt.stopPropagation();
        const rect = todoSpan.getBoundingClientRect();
        this.openStateMenuAtPosition(task, { x: rect.left, y: rect.bottom });
      }
    });

    // Prevent duplicate context menu on Android: contextmenu + long-press both firing
    let suppressNextContextMenu = false;
    // Also guard re-entrancy so we never open two menus within a short window
    let lastMenuOpenTs = 0;
    const MENU_DEBOUNCE_MS = 350;

    const openMenuAtMouseEventOnce = (evt: MouseEvent) => {
      const now = Date.now();
      if (now - lastMenuOpenTs < MENU_DEBOUNCE_MS) {
        evt.preventDefault();
        evt.stopPropagation();
        return;
      }
      lastMenuOpenTs = now;
      this.openStateMenuAtMouseEvent(task, evt);
    };

    const openMenuAtPositionOnce = (x: number, y: number) => {
      const now = Date.now();
      if (now - lastMenuOpenTs < MENU_DEBOUNCE_MS) return;
      lastMenuOpenTs = now;
      this.openStateMenuAtPosition(task, { x, y });
    };

    // Right-click to open selection menu (Obsidian style)
    todoSpan.addEventListener('contextmenu', (evt: MouseEvent) => {
      // If a long-press just opened the menu, ignore the subsequent contextmenu
      if (suppressNextContextMenu) {
        evt.preventDefault();
        evt.stopPropagation();
        return;
      }
      openMenuAtMouseEventOnce(evt);
    });

    // Long-press for mobile
    let touchTimer: number | null = null;
    todoSpan.addEventListener(
      'touchstart',
      (evt: TouchEvent) => {
        if (evt.touches.length !== 1) return;
        const touch = evt.touches[0];
        suppressNextContextMenu = true;
        touchTimer = window.setTimeout(() => {
          const x = touch.clientX;
          const y = touch.clientY;
          openMenuAtPositionOnce(x, y);
        }, 350);
      },
      { passive: true },
    );

    const clearTouch = () => {
      if (touchTimer) {
        window.clearTimeout(touchTimer);
        touchTimer = null;
      }
      window.setTimeout(() => {
        suppressNextContextMenu = false;
      }, 250);
    };
    todoSpan.addEventListener('touchend', clearTouch, { passive: true });
    todoSpan.addEventListener('touchcancel', clearTouch, { passive: true });

    // Additionally, ignore a click that may be synthesized after contextmenu on mobile
    todoSpan.addEventListener(
      'click',
      (evt) => {
        const now = Date.now();
        if (now - lastMenuOpenTs < MENU_DEBOUNCE_MS) {
          evt.preventDefault();
          evt.stopPropagation();
          return;
        }
      },
      true,
    );
  }

  /**
   * Open state menu at mouse event location
   */
  private openStateMenuAtMouseEvent(task: Task, evt: MouseEvent): void {
    evt.preventDefault();
    evt.stopPropagation();

    // Close any active dialog (task context menu, date picker, etc.)
    BaseDialog.closeAnyActiveDialog();

    const menu = this.menuBuilder.buildStateMenu(
      task.state,
      async (newState: string) => {
        await this.onStateChange(task, newState);
      },
    );

    const maybeShowAtMouseEvent = (
      menu as unknown as { showAtMouseEvent?: (e: MouseEvent) => void }
    ).showAtMouseEvent;
    if (typeof maybeShowAtMouseEvent === 'function') {
      maybeShowAtMouseEvent.call(menu, evt);
    } else {
      menu.showAtPosition({ x: evt.clientX, y: evt.clientY });
    }
  }

  /**
   * Open state menu at a specific screen position
   */
  private openStateMenuAtPosition(
    task: Task,
    pos: { x: number; y: number },
  ): void {
    BaseDialog.closeAnyActiveDialog();
    const menu = this.menuBuilder.buildStateMenu(
      task.state,
      async (newState: string) => {
        await this.onStateChange(task, newState);
      },
    );

    menu.showAtPosition({ x: pos.x, y: pos.y });
  }

  /**
   * Attach contextmenu and long-press handlers to a task LI element.
   * Excludes clicks on the keyword span (which has its own state menu).
   */
  private attachTaskContextMenuHandlers(li: HTMLLIElement, task: Task): void {
    let touchTimer: number | null = null;
    let suppressNextContextMenu = false;
    let initialTouchX = 0;
    let initialTouchY = 0;
    const LONG_PRESS_MS = 350;
    const TOUCH_MOVE_THRESHOLD = 10;

    li.addEventListener('contextmenu', (evt: MouseEvent) => {
      // Don't intercept right-clicks on the keyword (it has its own state menu)
      const target = evt.target;
      if (
        target instanceof HTMLElement &&
        (target.hasClass('todo-task-keyword') ||
          target.closest('.todo-task-keyword') !== null)
      ) {
        return;
      }

      if (suppressNextContextMenu) {
        evt.preventDefault();
        evt.stopPropagation();
        return;
      }

      evt.preventDefault();
      evt.stopPropagation();
      if (this.onContextMenu) {
        this.onContextMenu(task, evt);
      }
    });

    li.addEventListener(
      'touchstart',
      (evt: TouchEvent) => {
        if (evt.touches.length !== 1) return;

        // Don't intercept touches on the keyword
        const target = evt.target;
        if (
          target instanceof HTMLElement &&
          (target.hasClass('todo-task-keyword') ||
            target.closest('.todo-task-keyword') !== null)
        ) {
          return;
        }

        const touch = evt.touches[0];
        initialTouchX = touch.clientX;
        initialTouchY = touch.clientY;
        suppressNextContextMenu = true;
        touchTimer = window.setTimeout(() => {
          if (this.onContextMenu) {
            // Create a synthetic MouseEvent for positioning
            const syntheticEvt = new MouseEvent('contextmenu', {
              clientX: touch.clientX,
              clientY: touch.clientY,
              bubbles: true,
            });
            this.onContextMenu(task, syntheticEvt);
          }
        }, LONG_PRESS_MS);
      },
      { passive: true },
    );

    const clearTouch = () => {
      if (touchTimer) {
        window.clearTimeout(touchTimer);
        touchTimer = null;
      }
      window.setTimeout(() => {
        suppressNextContextMenu = false;
      }, 250);
    };
    li.addEventListener('touchend', clearTouch, { passive: true });
    li.addEventListener('touchcancel', clearTouch, { passive: true });
    // Only clear the long-press timer if touch moves beyond threshold (important for iPad)
    li.addEventListener(
      'touchmove',
      (evt: TouchEvent) => {
        if (!touchTimer) return;

        const touch = evt.touches[0];
        const deltaX = Math.abs(touch.clientX - initialTouchX);
        const deltaY = Math.abs(touch.clientY - initialTouchY);

        // Only cancel long-press if moved beyond threshold
        if (deltaX > TOUCH_MOVE_THRESHOLD || deltaY > TOUCH_MOVE_THRESHOLD) {
          clearTouch();
        }
      },
      { passive: true },
    );
  }

  /**
   * Build text content (keyword + priority + task text) for a task
   */
  buildText(task: Task, container: HTMLElement): HTMLSpanElement {
    const taskText = container.createEl('span', { cls: 'todoseq-task-text' });

    // Keyword button
    this.buildKeyword(task, taskText);

    // Priority badge
    if (task.priority) {
      const pri = task.priority;
      const badge = taskText.createEl('span', {
        cls: ['todoseq-priority-badge', `priority-${pri}`],
      });
      badge.setText(pri === 'high' ? 'A' : pri === 'med' ? 'B' : 'C');
      badge.setAttribute('aria-label', `Priority ${pri}`);
      badge.setAttribute('title', `Priority ${pri}`);
    }

    // Remaining text - use lazy-computed textDisplay for better performance
    if (task.text) {
      taskText.appendText(' ');
      this.renderTaskTextWithLinks(task, taskText);
    }

    taskText.toggleClass('completed', task.completed);
    return taskText;
  }

  /**
   * Build a complete LI for a task (used by initial render and refresh)
   */
  buildTaskListItem(task: Task): HTMLLIElement {
    const li = createEl('li', { cls: 'todoseq-task-item' });
    li.setAttribute('data-path', task.path);
    li.setAttribute('data-line', String(task.line));
    li.setAttribute('data-raw-text', task.rawText);
    li.draggable = !Platform.isMobile;

    // Create a flex container for checkbox + text + indicator (all on same row)
    const mainContent = li.createEl('div', { cls: 'todo-main-content' });

    const checkbox = this.buildCheckbox(task, mainContent);

    // Set data-task on the <li> for theme compatibility.
    // Obsidian natively sets data-task on both <li> and <input>. Some themes
    // (Iridium, Velocity) target li[data-task] or [data-task] ancestor selectors
    // rather than input[data-task] directly (like Border does).
    li.setAttribute('data-task', checkbox.getAttribute('data-task') || ' ');

    // Create wrapper div for checkbox + text (they stay together)
    const textWrapper = mainContent.createEl('div', {
      cls: 'todoseq-task-text-wrapper',
    });
    textWrapper.appendChild(checkbox);
    this.buildText(task, textWrapper);

    // Add subtask indicator inside the flex container (right-aligned)
    if (hasSubtasks(task)) {
      this.buildSubtaskIndicator(task, mainContent);
    }

    // Add date display if scheduled, deadline, or closed dates exist
    const hasDatesToShow =
      (!task.completed && (task.scheduledDate || task.deadlineDate)) ||
      (task.completed && task.closedDate);
    if (hasDatesToShow) {
      this.buildDateDisplay(task, li);
    }

    // File info
    const fileInfo = li.createEl('div', { cls: 'todoseq-task-file-info' });
    const fileName = getFilename(task.path);
    const displayName = fileName.replace(/\.md$/, '');
    fileInfo.setText(`${displayName}:${task.line + 1}`);
    fileInfo.setAttribute('title', task.path);

    // Click to open source (avoid checkbox and keyword)
    li.addEventListener('click', (evt) => {
      const target = evt.target;
      if (
        target !== checkbox &&
        target instanceof HTMLElement &&
        !target.hasClass('todo-task-keyword')
      ) {
        this.onLocationOpen(task);
      }
    });

    // Right-click context menu (exclude keyword which has its own state menu)
    if (this.onContextMenu) {
      this.attachTaskContextMenuHandlers(li, task);
    }

    return li;
  }

  /**
   * Update an existing DOM element with new task data (for smart diff)
   */
  updateTaskElementContent(task: Task, element: HTMLLIElement): void {
    // Ensure draggable is set for reused elements
    element.draggable = !Platform.isMobile;

    // 1. Update checkbox
    const checkbox = element.querySelector(
      'input.todoseq-task-checkbox',
    ) as HTMLInputElement;
    if (checkbox) {
      const settings = this.keywordManager.getSettings();

      // Determine data-task character and checked state based on settings
      let dataTaskChar: string;
      if (settings.useExtendedCheckboxStyles) {
        dataTaskChar = this.keywordManager.getCheckboxState(
          task.state,
          settings,
        );
        checkbox.checked = dataTaskChar !== ' ';
      } else {
        // Default behavior: use standard checkbox states
        // For active keywords, use '/' so CSS can apply active styling
        if (this.keywordManager.isActive(task.state)) {
          dataTaskChar = '/';
        } else if (this.keywordManager.isCompleted(task.state)) {
          dataTaskChar = 'x';
        } else {
          dataTaskChar = ' ';
        }
        checkbox.checked = task.completed;
      }

      checkbox.setAttribute('data-task', dataTaskChar);
      // Also set data-task on the <li> for theme compatibility.
      // Obsidian natively sets data-task on both <li> and <input>. Some themes
      // (Iridium, Velocity) target li[data-task] or [data-task] ancestor selectors.
      element.setAttribute('data-task', dataTaskChar);
    }

    // 2. Update keyword button
    const keywordBtn = element.querySelector(
      '.todo-task-keyword',
    ) as HTMLSpanElement;
    if (keywordBtn) {
      keywordBtn.textContent = task.state;
      keywordBtn.setAttribute('aria-checked', String(task.completed));
    }

    // 3. Update todoseq-task-text: rebuild the text portion (after keyword and priority)
    // ONLY rebuild if the underlying raw text actually changed (smart diff)
    const currentRawText = element.getAttribute('data-raw-text');
    const textChanged = currentRawText !== task.rawText;

    if (textChanged) {
      element.setAttribute('data-raw-text', task.rawText);
      const todoText = element.querySelector(
        '.todoseq-task-text',
      ) as HTMLElement;
      if (todoText) {
        // Get keyword info BEFORE clearing
        const keywordSpan = element.querySelector('.todo-task-keyword');
        const keywordState = keywordSpan?.textContent || task.state;
        const keywordAriaChecked =
          keywordSpan?.getAttribute('aria-checked') || 'false';

        // Clear existing text content
        todoText.innerHTML = '';

        // Re-add keyword span
        const newKeywordSpan = todoText.createEl('span', {
          cls: 'todo-task-keyword',
        });
        newKeywordSpan.setText(keywordState);
        newKeywordSpan.setAttr('role', 'button');
        newKeywordSpan.setAttr('tabindex', '0');
        newKeywordSpan.setAttr('aria-checked', keywordAriaChecked);
        this.attachKeywordHandlers(newKeywordSpan, task);
        todoText.appendText(' ');

        // Rebuild priority badge
        if (task.priority) {
          const priorityText =
            task.priority === 'high'
              ? 'A'
              : task.priority === 'med'
                ? 'B'
                : 'C';
          const badge = todoText.createEl('span', {
            cls: ['todoseq-priority-badge', `priority-${task.priority}`],
          });
          badge.setText(priorityText);
          badge.setAttribute('aria-label', `Priority ${task.priority}`);
          badge.setAttribute('title', `Priority ${task.priority}`);
          todoText.appendText(' ');
        }

        // Re-add task text with links
        if (task.text) {
          this.renderTaskTextWithLinks(task, todoText);
        }

        todoText.classList.toggle('completed', task.completed);
      }
    } else {
      // Even if text didn't change, we still need to toggle the completed class
      const todoText = element.querySelector(
        '.todoseq-task-text',
      ) as HTMLElement;
      if (todoText) {
        todoText.classList.toggle('completed', task.completed);
      }

      const keywordSpan = element.querySelector('.todo-task-keyword');
      if (keywordSpan) {
        keywordSpan.setAttribute('aria-checked', String(task.completed));
      }
    }

    // 4. Handle subtask indicator updates
    // Find the content wrapper (now uses todo-main-content)
    const contentWrapper = element.querySelector(
      '.todo-main-content',
    ) as HTMLElement | null;
    const existingIndicator = element.querySelector(
      '.todoseq-subtask-indicator',
    );
    if (hasSubtasks(task)) {
      if (existingIndicator) {
        existingIndicator.textContent = getSubtaskDisplayText(task);
      } else if (contentWrapper) {
        this.buildSubtaskIndicator(task, contentWrapper);
      } else {
        // Fallback: create main content wrapper and add indicator
        const newWrapper = element.createEl('div', {
          cls: 'todo-main-content',
        });
        const todoText = element.querySelector('.todoseq-task-text');
        if (todoText && todoText instanceof HTMLElement) {
          // Insert newWrapper before the text wrapper
          const textWrapper = element.querySelector(
            '.todoseq-task-text-wrapper',
          );
          if (textWrapper) {
            element.insertBefore(newWrapper, textWrapper);
          } else {
            element.insertBefore(newWrapper, todoText);
          }
          // Move checkbox and text to the new wrapper
          const checkbox = element.querySelector('.todoseq-task-checkbox');
          if (checkbox) {
            newWrapper.appendChild(checkbox);
            newWrapper.appendChild(todoText);
          }
        }
        this.buildSubtaskIndicator(task, newWrapper);
      }
    } else if (existingIndicator) {
      existingIndicator.remove();
    }

    // 5. Update date display
    const hasDates =
      (!task.completed && (task.scheduledDate || task.deadlineDate)) ||
      (task.completed && task.closedDate);
    const existingDateDisplay = element.querySelector(
      '.todoseq-task-date-container',
    );
    const fileInfoElement = element.querySelector('.todoseq-task-file-info');
    if (existingDateDisplay) {
      if (hasDates) {
        existingDateDisplay.remove();
        if (fileInfoElement) {
          const newDateContainer = this.buildDateDisplay(task, element);
          element.insertBefore(newDateContainer, fileInfoElement);
        } else {
          this.buildDateDisplay(task, element);
        }
      } else {
        existingDateDisplay.remove();
      }
    } else if (hasDates) {
      if (fileInfoElement) {
        const newDateContainer = this.buildDateDisplay(task, element);
        element.insertBefore(newDateContainer, fileInfoElement);
      } else {
        this.buildDateDisplay(task, element);
      }
    }

    // 6. Update LI classes for task state
    element.classList.toggle('completed', task.completed);
    element.classList.toggle(
      'cancelled',
      this.keywordManager.isCompleted(task.state),
    );
    element.classList.toggle(
      'in-progress',
      this.keywordManager.isActive(task.state),
    );
    element.classList.toggle(
      'active',
      this.keywordManager.isActive(task.state),
    );
  }

  /**
   * Format a date for display with relative time indicators
   */
  formatDateForDisplay(date: Date | null, includeTime = false): string {
    if (!date) return '';
    return DateUtils.formatDateForDisplay(date, includeTime);
  }

  /**
   * Get CSS classes for date display based on deadline status
   */
  getDateStatusClasses(date: Date | null, _isDeadline = false): string[] {
    if (!date) return [];

    const today = DateUtils.getDateOnly(new Date());
    const taskDate = DateUtils.getDateOnly(date);

    const diffTime = taskDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / DateUtils.MILLISECONDS_PER_DAY);

    const classes = ['todoseq-task-date'];

    if (diffDays < 0) {
      classes.push('todoseq-task-date-overdue');
    } else if (diffDays === 0) {
      classes.push('todoseq-task-date-today');
    } else if (diffDays <= 7) {
      classes.push('todoseq-task-date-soon');
    }

    return classes;
  }

  /**
   * Build date display element for a task
   */
  buildDateDisplay(task: Task, parent: HTMLElement): HTMLElement {
    const dateContainer = parent.createEl('div', {
      cls: 'todoseq-task-date-container',
    });

    // Display scheduled date (only for non-completed tasks)
    if (task.scheduledDate && !task.completed) {
      const scheduledDiv = dateContainer.createEl('div', {
        cls: this.getDateStatusClasses(task.scheduledDate, false),
      });

      const dateRow = scheduledDiv.createEl('div', {
        cls: 'todoseq-task-date-row',
      });

      const dateLabel = dateRow.createEl('span', {
        cls: 'todoseq-task-date-label',
      });
      dateLabel.setText('Scheduled: ');

      const dateValue = dateRow.createEl('span', {
        cls: 'todoseq-task-date-value',
      });
      dateValue.setText(this.formatDateForDisplay(task.scheduledDate, true));

      const repeatCell = dateRow.createEl('span', {
        cls: 'todoseq-task-date-repeat-cell',
      });

      if (task.scheduledDateRepeat) {
        const repeatIcon = repeatCell.createEl('span', {
          cls: 'todoseq-task-date-repeat-icon',
        });
        setIcon(repeatIcon, 'repeat-2');
        const svg = repeatIcon.querySelector('svg');
        if (svg) {
          svg.removeAttribute('width');
          svg.removeAttribute('height');
        }
        repeatIcon.setAttribute(
          'title',
          `Repeats ${task.scheduledDateRepeat.raw}`,
        );
      }
    }

    // Display deadline date (only for non-completed tasks)
    if (task.deadlineDate && !task.completed) {
      const deadlineDiv = dateContainer.createEl('div', {
        cls: this.getDateStatusClasses(task.deadlineDate, true),
      });

      const dateRow = deadlineDiv.createEl('div', {
        cls: 'todoseq-task-date-row',
      });

      const dateLabel = dateRow.createEl('span', {
        cls: 'todoseq-task-date-label',
      });
      dateLabel.setText('Deadline: ');

      const dateValue = dateRow.createEl('span', {
        cls: 'todoseq-task-date-value',
      });
      dateValue.setText(this.formatDateForDisplay(task.deadlineDate, true));

      const repeatCell = dateRow.createEl('span', {
        cls: 'todoseq-task-date-repeat-cell',
      });

      if (task.deadlineDateRepeat) {
        const repeatIcon = repeatCell.createEl('span', {
          cls: 'todoseq-task-date-repeat-icon',
        });
        setIcon(repeatIcon, 'repeat-2');
        const svg = repeatIcon.querySelector('svg');
        if (svg) {
          svg.removeAttribute('width');
          svg.removeAttribute('height');
        }
        repeatIcon.setAttribute(
          'title',
          `Repeats ${task.deadlineDateRepeat.raw}`,
        );
      }
    }

    // Display closed date (only for completed tasks with closed date)
    if (task.closedDate && task.completed) {
      const closedDiv = dateContainer.createEl('div', {
        cls: ['todoseq-task-date', 'todoseq-task-date-closed'],
      });

      const dateRow = closedDiv.createEl('div', {
        cls: 'todoseq-task-date-row',
      });

      const dateLabel = dateRow.createEl('span', {
        cls: 'todoseq-task-date-label',
      });
      dateLabel.setText('Closed: ');

      const dateValue = dateRow.createEl('span', {
        cls: 'todoseq-task-date-value',
      });
      dateValue.setText(this.formatDateForDisplay(task.closedDate, true));

      // Add empty repeat cell to match scheduled/deadline layout
      dateRow.createEl('span', {
        cls: 'todoseq-task-date-repeat-cell',
      });
    }

    return dateContainer;
  }

  /**
   * Build subtask indicator element showing completed/total count
   */
  buildSubtaskIndicator(task: Task, parent: HTMLElement): void {
    const indicator = parent.createEl('span', {
      cls: 'todoseq-subtask-indicator',
    });
    indicator.setText(getSubtaskDisplayText(task));
    indicator.setAttribute(
      'title',
      `${task.subtaskCompletedCount} of ${task.subtaskCount} subtasks complete`,
    );
  }

  /**
   * Render task text with links, converting wiki links, markdown links, URLs, and tags
   * into clickable span elements.
   * @param task The task to render text for
   * @param parent The parent element to append rendered content to
   */
  renderTaskTextWithLinks(task: Task, parent: HTMLElement): void {
    const textToProcess = getTaskTextDisplay(task);

    let i = 0;
    while (i < textToProcess.length) {
      let nextMatch: {
        type: 'wiki' | 'md' | 'url' | 'tag';
        match: RegExpExecArray;
      } | null = null;

      for (const p of LINK_PATTERNS) {
        p.regex.lastIndex = i;
        const m = p.regex.exec(textToProcess);
        if (m) {
          if (!nextMatch || m.index < nextMatch.match.index) {
            nextMatch = { type: p.type, match: m };
          }
        }
      }

      if (!nextMatch) {
        parent.appendText(textToProcess.slice(i));
        break;
      }

      if (nextMatch.match.index > i) {
        parent.appendText(textToProcess.slice(i, nextMatch.match.index));
      }

      if (nextMatch.type === 'tag') {
        const span = parent.createEl('span', { cls: 'todoseq-task-tag' });
        const tagName = nextMatch.match[0];
        span.setText(tagName);
        span.setAttribute('title', tagName);
      } else {
        const span = parent.createEl('span', { cls: 'todoseq-task-link' });

        if (nextMatch.type === 'wiki') {
          const target = nextMatch.match[1];
          const alias = nextMatch.match[2];
          span.setText(alias ?? target);
          span.setAttribute('title', target);
        } else if (nextMatch.type === 'md') {
          const label = nextMatch.match[1];
          const url = nextMatch.match[2];
          span.setText(label);
          span.setAttribute('title', url);
        } else {
          const url = nextMatch.match[0];
          span.setText(url);
          span.setAttribute('title', url);
        }
      }

      i = nextMatch.match.index + nextMatch.match[0].length;
    }
  }
}
