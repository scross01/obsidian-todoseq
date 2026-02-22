import { Task, NEXT_STATE } from '../../types/task';
import { DateUtils } from '../../utils/date-utils';
import { TAG_PATTERN } from '../../utils/patterns';
import {
  getFilename,
  getTaskTextDisplay,
  isActiveKeyword,
} from '../../utils/task-utils';
import TodoTracker from '../../main';
import { StateMenuBuilder } from '../components/state-menu-builder';

const WIKI_LINK_REGEX = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
const MD_LINK_REGEX = /\[([^\]]*(?:\[[^\]]*\][^\]]*)*)\]\(([^)]+)\)/g;
const URL_REGEX = /\bhttps?:\/\/[^\s)]+/g;

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

export class TaskRenderer {
  private plugin: TodoTracker;
  private menuBuilder: StateMenuBuilder;

  constructor(plugin: TodoTracker, menuBuilder: StateMenuBuilder) {
    this.plugin = plugin;
    this.menuBuilder = menuBuilder;
  }

  buildCheckbox(task: Task, container: HTMLElement): HTMLInputElement {
    const checkbox = container.createEl('input', {
      type: 'checkbox',
      cls: 'todo-checkbox',
    });

    if (isActiveKeyword(task.state, this.plugin.settings)) {
      checkbox.addClass('todo-checkbox-active');
    }

    checkbox.checked = task.completed;

    checkbox.addEventListener('change', async () => {
      const targetState = checkbox.checked ? 'DONE' : 'TODO';
      await this.updateTaskState(task, targetState);
    });

    return checkbox;
  }

  private async updateTaskState(task: Task, nextState: string): Promise<void> {
    const plugin = (
      window as unknown as {
        todoSeqPlugin?: {
          taskUpdateCoordinator?: {
            updateTaskState: (
              task: Task,
              newState: string,
              source: 'task-list',
            ) => Promise<Task>;
          };
        };
      }
    ).todoSeqPlugin;

    if (!plugin?.taskUpdateCoordinator) {
      console.error('TODOseq: TaskUpdateCoordinator not available');
      return;
    }

    try {
      const updated = await plugin.taskUpdateCoordinator.updateTaskState(
        task,
        nextState,
        'task-list',
      );

      task.rawText = updated.rawText;
      task.state = updated.state;
      task.completed = updated.completed;
    } catch (error) {
      console.error('TODOseq: Failed to update task state:', error);
    }
  }

  buildKeyword(task: Task, parent: HTMLElement): HTMLSpanElement {
    const todoSpan = parent.createEl('span', { cls: 'todo-keyword' });
    todoSpan.setText(task.state);
    todoSpan.setAttr('role', 'button');
    todoSpan.setAttr('tabindex', '0');
    todoSpan.setAttr('aria-checked', String(task.completed));

    const activate = async (evt: Event) => {
      evt.stopPropagation();
      await this.updateTaskState(task, NEXT_STATE.get(task.state) ?? 'DONE');
    };

    todoSpan.addEventListener('click', (evt) => activate(evt));

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

    let suppressNextContextMenu = false;
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

    todoSpan.addEventListener('contextmenu', (evt: MouseEvent) => {
      if (suppressNextContextMenu) {
        evt.preventDefault();
        evt.stopPropagation();
        return;
      }
      openMenuAtMouseEventOnce(evt);
    });

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

    return todoSpan;
  }

  private openStateMenuAtMouseEvent(task: Task, evt: MouseEvent): void {
    evt.preventDefault();
    evt.stopPropagation();

    const menu = this.menuBuilder.buildStateMenu(
      task.state,
      async (newState: string) => {
        await this.updateTaskState(task, newState);
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

  private openStateMenuAtPosition(
    task: Task,
    pos: { x: number; y: number },
  ): void {
    const menu = this.menuBuilder.buildStateMenu(
      task.state,
      async (newState: string) => {
        await this.updateTaskState(task, newState);
      },
    );

    menu.showAtPosition({ x: pos.x, y: pos.y });
  }

  buildText(task: Task, container: HTMLElement): HTMLSpanElement {
    const taskText = container.createEl('span', { cls: 'todo-text' });

    this.buildKeyword(task, taskText);

    if (task.priority) {
      const pri = task.priority;
      const badge = taskText.createEl('span', {
        cls: ['priority-badge', `priority-${pri}`],
      });
      badge.setText(pri === 'high' ? 'A' : pri === 'med' ? 'B' : 'C');
      badge.setAttribute('aria-label', `Priority ${pri}`);
      badge.setAttribute('title', `Priority ${pri}`);
    }

    if (task.text) {
      taskText.appendText(' ');
      this.renderTaskTextWithLinks(task, taskText);
    }

    taskText.toggleClass('completed', task.completed);
    return taskText;
  }

  buildTaskListItem(task: Task): HTMLLIElement {
    const li = createEl('li', { cls: 'todo-item' });
    li.setAttribute('data-path', task.path);
    li.setAttribute('data-line', String(task.line));
    li.setAttribute('data-raw-text', task.rawText);

    this.buildCheckbox(task, li);
    this.buildText(task, li);

    if ((task.scheduledDate || task.deadlineDate) && !task.completed) {
      this.buildDateDisplay(task, li);
    }

    const fileInfo = li.createEl('div', { cls: 'todo-file-info' });
    const fileName = getFilename(task.path);
    const displayName = fileName.replace(/\.md$/, '');
    fileInfo.setText(`${displayName}:${task.line + 1}`);
    fileInfo.setAttribute('title', task.path);

    return li;
  }

  updateTaskElementContent(task: Task, element: HTMLLIElement): void {
    const checkbox = element.querySelector(
      'input.todo-checkbox',
    ) as HTMLInputElement;
    if (checkbox) {
      checkbox.checked = task.completed;
      checkbox.classList.toggle(
        'todo-checkbox-active',
        isActiveKeyword(task.state, this.plugin.settings),
      );
    }

    const keywordBtn = element.querySelector(
      '.todo-keyword',
    ) as HTMLSpanElement;
    if (keywordBtn) {
      keywordBtn.textContent = task.state;
      keywordBtn.setAttribute('aria-checked', String(task.completed));
    }

    const currentRawText = element.getAttribute('data-raw-text');
    const textChanged = currentRawText !== task.rawText;

    if (textChanged) {
      element.setAttribute('data-raw-text', task.rawText);
      const todoText = element.querySelector('.todo-text') as HTMLElement;
      if (todoText) {
        const keywordSpan = element.querySelector('.todo-keyword');
        const keywordState = keywordSpan?.textContent || task.state;
        const keywordAriaChecked =
          keywordSpan?.getAttribute('aria-checked') || 'false';

        todoText.innerHTML = '';

        const newKeywordSpan = todoText.createEl('span', {
          cls: 'todo-keyword',
        });
        newKeywordSpan.setText(keywordState);
        newKeywordSpan.setAttr('role', 'button');
        newKeywordSpan.setAttr('tabindex', '0');
        newKeywordSpan.setAttr('aria-checked', keywordAriaChecked);
        todoText.appendText(' ');

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

        if (task.text) {
          this.renderTaskTextWithLinks(task, todoText);
        }

        todoText.classList.toggle('completed', task.completed);
      }
    } else {
      const todoText = element.querySelector('.todo-text') as HTMLElement;
      if (todoText) {
        todoText.classList.toggle('completed', task.completed);
      }

      const keywordSpan = element.querySelector('.todo-keyword');
      if (keywordSpan) {
        keywordSpan.setAttribute('aria-checked', String(task.completed));
      }
    }

    const hasDates =
      (task.scheduledDate || task.deadlineDate) && !task.completed;
    const existingDateDisplay = element.querySelector('.todo-date-container');
    if (existingDateDisplay) {
      if (hasDates) {
        existingDateDisplay.remove();
        this.buildDateDisplay(task, element);
      } else {
        existingDateDisplay.remove();
      }
    } else if (hasDates) {
      this.buildDateDisplay(task, element);
    }

    element.classList.toggle('completed', task.completed);
    element.classList.toggle(
      'cancelled',
      task.state === 'CANCELED' || task.state === 'CANCELLED',
    );
    element.classList.toggle(
      'in-progress',
      task.state === 'DOING' || task.state === 'IN-PROGRESS',
    );
    element.classList.toggle(
      'active',
      isActiveKeyword(task.state, this.plugin.settings),
    );
  }

  formatDateForDisplay(date: Date | null, includeTime = false): string {
    if (!date) return '';
    return DateUtils.formatDateForDisplay(date, includeTime);
  }

  getDateStatusClasses(date: Date | null, isDeadline = false): string[] {
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

  buildDateDisplay(task: Task, parent: HTMLElement): void {
    const dateContainer = parent.createEl('div', {
      cls: 'todo-date-container',
    });

    if (task.scheduledDate) {
      const scheduledDiv = dateContainer.createEl('div', {
        cls: this.getDateStatusClasses(task.scheduledDate, false),
      });

      const scheduledLabel = scheduledDiv.createEl('span', {
        cls: 'date-label',
      });
      scheduledLabel.setText('Scheduled: ');

      const scheduledValue = scheduledDiv.createEl('span', {
        cls: 'date-value',
      });
      scheduledValue.setText(
        this.formatDateForDisplay(task.scheduledDate, true),
      );
    }

    if (task.deadlineDate) {
      const deadlineDiv = dateContainer.createEl('div', {
        cls: this.getDateStatusClasses(task.deadlineDate, true),
      });

      const deadlineLabel = deadlineDiv.createEl('span', { cls: 'date-label' });
      deadlineLabel.setText('Deadline: ');

      const deadlineValue = deadlineDiv.createEl('span', { cls: 'date-value' });
      deadlineValue.setText(this.formatDateForDisplay(task.deadlineDate, true));
    }
  }

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
