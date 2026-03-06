import { Task } from '../../types/task';
import { DateUtils } from '../../utils/date-utils';
import { setIcon } from 'obsidian';
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
import { TaskStateTransitionManager } from '../../services/task-state-transition-manager';
import { StateMenuBuilder } from '../components/state-menu-builder';

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

export type TaskLocationOpenCallback = (task: Task) => void;

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
  private keywordManager: KeywordManager;
  private stateManager: TaskStateTransitionManager;
  private menuBuilder: StateMenuBuilder;
  private onStateChange: TaskStateChangeCallback;
  private onLocationOpen: TaskLocationOpenCallback;
  private defaultCompleted: string;
  private defaultInactive: string;

  constructor(
    keywordManager: KeywordManager,
    stateManager: TaskStateTransitionManager,
    menuBuilder: StateMenuBuilder,
    onStateChange: TaskStateChangeCallback,
    onLocationOpen: TaskLocationOpenCallback,
    defaultCompleted: 'DONE',
    defaultInactive: 'TODO',
  ) {
    this.keywordManager = keywordManager;
    this.stateManager = stateManager;
    this.menuBuilder = menuBuilder;
    this.onStateChange = onStateChange;
    this.onLocationOpen = onLocationOpen;
    this.defaultCompleted = defaultCompleted;
    this.defaultInactive = defaultInactive;
  }

  /**
   * Build checkbox element for a task
   */
  buildCheckbox(task: Task, container: HTMLElement): HTMLInputElement {
    const checkbox = container.createEl('input', {
      type: 'checkbox',
      cls: 'todo-checkbox',
    });

    // Add state-specific class for styling (includes custom active keywords)
    if (this.keywordManager.isActive(task.state)) {
      checkbox.addClass('todo-checkbox-active');
    }

    checkbox.checked = task.completed;

    checkbox.addEventListener('change', async () => {
      const targetState = checkbox.checked
        ? this.defaultCompleted
        : this.defaultInactive;
      await this.onStateChange(task, targetState);
    });

    return checkbox;
  }

  /**
   * Build keyword span element for a task
   */
  buildKeyword(task: Task, parent: HTMLElement): HTMLSpanElement {
    const todoSpan = parent.createEl('span', { cls: 'todo-keyword' });
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
    todoSpan.addEventListener('click', (evt) => activate(evt));

    // Keyboard support: Enter/Space and menu keys
    todoSpan.addEventListener('keydown', (evt: KeyboardEvent) => {
      const key = evt.key;
      if (key === 'Enter' || key === ' ') {
        evt.preventDefault();
        evt.stopPropagation();
        activate(evt);
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
        }, 450);
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
    const menu = this.menuBuilder.buildStateMenu(
      task.state,
      async (newState: string) => {
        await this.onStateChange(task, newState);
      },
    );

    menu.showAtPosition({ x: pos.x, y: pos.y });
  }

  /**
   * Build text content (keyword + priority + task text) for a task
   */
  buildText(task: Task, container: HTMLElement): HTMLSpanElement {
    const taskText = container.createEl('span', { cls: 'todo-text' });

    // Keyword button
    this.buildKeyword(task, taskText);

    // Priority badge
    if (task.priority) {
      const pri = task.priority;
      const badge = taskText.createEl('span', {
        cls: ['priority-badge', `priority-${pri}`],
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
    const li = createEl('li', { cls: 'todo-item' });
    li.setAttribute('data-path', task.path);
    li.setAttribute('data-line', String(task.line));
    li.setAttribute('data-raw-text', task.rawText);

    const checkbox = this.buildCheckbox(task, li);
    this.buildText(task, li);

    // Add subtask indicator if task has subtasks
    if (hasSubtasks(task)) {
      this.buildSubtaskIndicator(task, li);
    }

    // Add date display if scheduled or deadline dates exist and task is not completed
    if ((task.scheduledDate || task.deadlineDate) && !task.completed) {
      this.buildDateDisplay(task, li);
    }

    // File info
    const fileInfo = li.createEl('div', { cls: 'todo-file-info' });
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
        !target.hasClass('todo-keyword')
      ) {
        this.onLocationOpen(task);
      }
    });

    return li;
  }

  /**
   * Update an existing DOM element with new task data (for smart diff)
   */
  updateTaskElementContent(task: Task, element: HTMLLIElement): void {
    // 1. Update checkbox
    const checkbox = element.querySelector(
      'input.todo-checkbox',
    ) as HTMLInputElement;
    if (checkbox) {
      checkbox.checked = task.completed;
      checkbox.classList.toggle(
        'todo-checkbox-active',
        this.keywordManager.isActive(task.state),
      );
    }

    // 2. Update keyword button
    const keywordBtn = element.querySelector(
      '.todo-keyword',
    ) as HTMLSpanElement;
    if (keywordBtn) {
      keywordBtn.textContent = task.state;
      keywordBtn.setAttribute('aria-checked', String(task.completed));
    }

    // 3. Update todo-text: rebuild the text portion (after keyword and priority)
    // ONLY rebuild if the underlying raw text actually changed (smart diff)
    const currentRawText = element.getAttribute('data-raw-text');
    const textChanged = currentRawText !== task.rawText;

    if (textChanged) {
      element.setAttribute('data-raw-text', task.rawText);
      const todoText = element.querySelector('.todo-text') as HTMLElement;
      if (todoText) {
        // Get keyword info BEFORE clearing
        const keywordSpan = element.querySelector('.todo-keyword');
        const keywordState = keywordSpan?.textContent || task.state;
        const keywordAriaChecked =
          keywordSpan?.getAttribute('aria-checked') || 'false';

        // Clear existing text content
        todoText.innerHTML = '';

        // Re-add keyword span
        const newKeywordSpan = todoText.createEl('span', {
          cls: 'todo-keyword',
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
            cls: ['priority-badge', `priority-${task.priority}`],
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
      const todoText = element.querySelector('.todo-text') as HTMLElement;
      if (todoText) {
        todoText.classList.toggle('completed', task.completed);
      }

      const keywordSpan = element.querySelector('.todo-keyword');
      if (keywordSpan) {
        keywordSpan.setAttribute('aria-checked', String(task.completed));
      }
    }

    // 4. Handle subtask indicator updates
    const existingIndicator = element.querySelector('.todo-subtask-indicator');
    if (hasSubtasks(task)) {
      if (existingIndicator) {
        existingIndicator.textContent = getSubtaskDisplayText(task);
      } else {
        this.buildSubtaskIndicator(task, element);
      }
    } else if (existingIndicator) {
      existingIndicator.remove();
    }

    // 5. Update date display
    const hasDates =
      (task.scheduledDate || task.deadlineDate) && !task.completed;
    const existingDateDisplay = element.querySelector('.todo-date-container');
    const fileInfoElement = element.querySelector('.todo-file-info');
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

    const classes = ['todo-date'];

    if (diffDays < 0) {
      classes.push('todo-date-overdue');
    } else if (diffDays === 0) {
      classes.push('todo-date-today');
    } else if (diffDays <= 3) {
      classes.push('todo-date-soon');
    }

    return classes;
  }

  /**
   * Build date display element for a task
   */
  buildDateDisplay(task: Task, parent: HTMLElement): HTMLElement {
    const dateContainer = parent.createEl('div', {
      cls: 'todo-date-container',
    });

    // Display scheduled date
    if (task.scheduledDate) {
      const scheduledDiv = dateContainer.createEl('div', {
        cls: this.getDateStatusClasses(task.scheduledDate, false),
      });

      const dateRow = scheduledDiv.createEl('div', { cls: 'todo-date-row' });

      const dateLabel = dateRow.createEl('span', {
        cls: 'date-label',
      });
      dateLabel.setText('Scheduled: ');

      const dateValue = dateRow.createEl('span', {
        cls: 'date-value',
      });
      dateValue.setText(this.formatDateForDisplay(task.scheduledDate, true));

      const repeatCell = dateRow.createEl('span', {
        cls: 'todo-date-repeat-cell',
      });

      if (task.scheduledDateRepeat) {
        const repeatIcon = repeatCell.createEl('span', {
          cls: 'todo-date-repeat-icon',
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

    // Display deadline date
    if (task.deadlineDate) {
      const deadlineDiv = dateContainer.createEl('div', {
        cls: this.getDateStatusClasses(task.deadlineDate, true),
      });

      const dateRow = deadlineDiv.createEl('div', { cls: 'todo-date-row' });

      const dateLabel = dateRow.createEl('span', { cls: 'date-label' });
      dateLabel.setText('Deadline: ');

      const dateValue = dateRow.createEl('span', { cls: 'date-value' });
      dateValue.setText(this.formatDateForDisplay(task.deadlineDate, true));

      const repeatCell = dateRow.createEl('span', {
        cls: 'todo-date-repeat-cell',
      });

      if (task.deadlineDateRepeat) {
        const repeatIcon = repeatCell.createEl('span', {
          cls: 'todo-date-repeat-icon',
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

    return dateContainer;
  }

  /**
   * Build subtask indicator element showing completed/total count
   */
  buildSubtaskIndicator(task: Task, parent: HTMLElement): void {
    const indicator = parent.createEl('span', {
      cls: 'todo-subtask-indicator',
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
        const span = parent.createEl('span', { cls: 'todo-tag' });
        const tagName = nextMatch.match[0];
        span.setText(tagName);
        span.setAttribute('title', tagName);
      } else {
        const span = parent.createEl('span', { cls: 'todo-link-like' });

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
