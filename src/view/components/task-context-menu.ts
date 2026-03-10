import { setIcon, App } from 'obsidian';
import { Task } from '../../types/task';
import { DateRepeatInfo } from '../../types/task';
import { DateUtils } from '../../utils/date-utils';
import { isDailyNotesPluginEnabled } from '../../utils/daily-note-utils';
import { DatePicker, DatePickerMode } from './date-picker-menu';
import { TaskStateManager } from '../../services/task-state-manager';

/**
 * Callback types for context menu actions
 */
export type TaskContextMenuCallbacks = {
  onGoToTask: (task: Task) => void;
  onCopyTask: (task: Task) => void;
  onCopyTaskToToday: (task: Task) => void;
  onMoveTaskToToday: (task: Task) => void;
  onPriorityChange: (
    task: Task,
    priority: 'high' | 'med' | 'low' | null,
  ) => void;
  onScheduledDateChange: (
    task: Task,
    date: Date | null,
    repeat?: DateRepeatInfo | null,
  ) => void;
  onDeadlineDateChange: (
    task: Task,
    date: Date | null,
    repeat?: DateRepeatInfo | null,
  ) => void;
  onDeadlineClick: (task: Task) => void;
};

/**
 * Configuration for the context menu
 */
export interface TaskContextMenuConfig {
  weekStartsOn: 'Monday' | 'Sunday';
}

/**
 * Scheduled date option definition
 */
interface ScheduledDateOption {
  icon: string;
  label: string;
  getDate: () => Date | null;
  isDatePicker?: boolean; // True for "Pick date..." option
}

/**
 * Priority option definition
 */
interface PriorityOption {
  icon: string;
  label: string;
  priority: 'high' | 'med' | 'low' | null;
  colorClass: string;
}

/**
 * TaskContextMenu — A right-click context menu for tasks in the main task list.
 *
 * Provides quick access to:
 * - Go to task (navigate to source)
 * - Scheduled date shortcuts (Today, Tomorrow, Next week, Next weekend, No date, ...)
 * - Priority selection (A/B/C/None via flag icons)
 * - Deadline (stub for date picker)
 *
 * Single-instance pattern: only one menu can be open at a time.
 * Supports keyboard navigation (Escape to close, arrow keys, Enter to select).
 * Supports mobile long-press.
 */
export class TaskContextMenu {
  private containerEl: HTMLElement | null = null;
  private task: Task | null = null;
  private callbacks: TaskContextMenuCallbacks;
  private config: TaskContextMenuConfig;
  private app: App;
  private isShowing = false;
  private focusedIndex = -1;
  private focusableItems: HTMLElement[] = [];

  // Bound handlers for cleanup
  private documentClickHandler: ((e: MouseEvent) => void) | null = null;
  private keydownHandler: ((e: KeyboardEvent) => void) | null = null;
  private scrollHandler: (() => void) | null = null;
  private datePicker: DatePicker | null = null;
  private taskStateManager: TaskStateManager | null = null;

  constructor(
    callbacks: TaskContextMenuCallbacks,
    config: TaskContextMenuConfig,
    app: App,
    taskStateManager: TaskStateManager | null = null,
  ) {
    this.callbacks = callbacks;
    this.config = config;
    this.app = app;
    this.taskStateManager = taskStateManager;
  }

  /**
   * Update the configuration (e.g. when settings change)
   */
  updateConfig(config: TaskContextMenuConfig): void {
    this.config = config;
  }

  /**
   * Show the context menu at the given position for the given task.
   * If already showing, hides the previous menu first.
   * Also closes any open date picker.
   */
  async show(task: Task, position: { x: number; y: number }): Promise<void> {
    if (this.isShowing) {
      this.hide();
    }

    // Close any open date picker
    if (this.datePicker && this.datePicker.isVisible()) {
      this.datePicker.hide();
    }

    this.task = task;
    await this.buildMenu();
    this.positionMenu(position.x, position.y);
    this.attachGlobalListeners();
    this.isShowing = true;
  }

  /**
   * Show the context menu at a mouse event position.
   */
  async showAtMouseEvent(task: Task, evt: MouseEvent): Promise<void> {
    evt.preventDefault();
    evt.stopPropagation();
    await this.show(task, { x: evt.clientX, y: evt.clientY });
  }

  /**
   * Hide and destroy the context menu.
   */
  hide(): void {
    if (!this.isShowing) return;

    this.detachGlobalListeners();

    if (this.containerEl && this.containerEl.parentNode) {
      this.containerEl.remove();
    }

    this.containerEl = null;
    this.task = null;
    this.isShowing = false;
    this.focusedIndex = -1;
    this.focusableItems = [];
  }

  /**
   * Whether the menu is currently visible.
   */
  isVisible(): boolean {
    return this.isShowing;
  }

  /**
   * Clean up all resources. Call when the parent view is destroyed.
   */
  cleanup(): void {
    this.hide();
    if (this.datePicker) {
      this.datePicker.cleanup();
      this.datePicker = null;
    }
  }

  // ─── DOM Building ──────────────────────────────────────────────

  private async buildMenu(): Promise<void> {
    this.containerEl = document.createElement('div');
    this.containerEl.className = 'todoseq-task-context-menu';
    this.containerEl.setAttribute('role', 'menu');
    this.containerEl.setAttribute('aria-label', 'Task actions');

    this.focusableItems = [];

    // Go to task
    this.buildGoToTaskRow();

    // Separator
    this.addSeparator();

    // Priority section
    this.buildPrioritySection();

    // Separator
    this.addSeparator();

    // Scheduled date section
    this.buildScheduledSection();

    // Separator
    this.addSeparator();

    // Deadline row
    this.buildDeadlineRow();

    // Separator
    this.addSeparator();

    // Copy task
    this.buildCopyTaskRow();

    // Copy to today (only if daily notes plugin is enabled)
    await this.buildCopyToTodayRow();

    // Move to today (only if daily notes plugin is enabled)
    await this.buildMoveToTodayRow();

    document.body.appendChild(this.containerEl);
  }

  private buildGoToTaskRow(): void {
    if (!this.containerEl || !this.task) return;

    const row = this.createMenuRow('Go to task', 'locate', () => {
      if (this.task) {
        this.callbacks.onGoToTask(this.task);
      }
      this.hide();
    });
    row.setAttribute('role', 'menuitem');
    this.focusableItems.push(row);
  }

  private buildCopyTaskRow(): void {
    if (!this.containerEl || !this.task) return;

    const row = this.createMenuRow('Copy', 'copy', () => {
      if (this.task) {
        this.callbacks.onCopyTask(this.task);
      }
      this.hide();
    });
    row.setAttribute('role', 'menuitem');
    this.focusableItems.push(row);
  }

  private async buildCopyToTodayRow(): Promise<void> {
    if (!this.containerEl || !this.task) return;

    // Only show if daily notes plugin is enabled
    if (!(await isDailyNotesPluginEnabled(this.app))) {
      return;
    }

    const row = this.createMenuRow('Copy to today', 'clipboard-paste', () => {
      if (this.task) {
        this.callbacks.onCopyTaskToToday(this.task);
      }
      this.hide();
    });
    row.setAttribute('role', 'menuitem');
    this.focusableItems.push(row);
  }

  private async buildMoveToTodayRow(): Promise<void> {
    if (!this.containerEl || !this.task) return;

    // Only show if daily notes plugin is enabled
    if (!(await isDailyNotesPluginEnabled(this.app))) {
      return;
    }

    const row = this.createMenuRow('Move to today', 'arrow-right', () => {
      if (this.task) {
        this.callbacks.onMoveTaskToToday(this.task);
      }
      this.hide();
    });
    row.setAttribute('role', 'menuitem');
    this.focusableItems.push(row);
  }

  private buildScheduledSection(): void {
    if (!this.containerEl || !this.task) return;

    // Section header
    const header = this.containerEl.createEl('div', {
      cls: 'todoseq-context-menu-header',
    });
    header.setText('Scheduled');

    // Icon row
    const iconRow = this.containerEl.createEl('div', {
      cls: 'todoseq-context-menu-icon-row',
    });

    const options = this.getScheduledDateOptions();

    for (const option of options) {
      const btn = iconRow.createEl('button', {
        cls: 'todoseq-context-menu-icon-btn',
        attr: {
          'aria-label': option.label,
          title: this.getScheduledTooltip(option),
          role: 'menuitem',
          tabindex: '-1',
        },
      });

      const iconEl = btn.createEl('span', {
        cls: 'todoseq-context-menu-icon',
      });
      setIcon(iconEl, option.icon);

      btn.addEventListener('click', (evt) => {
        evt.preventDefault();
        evt.stopPropagation();
        if (this.task) {
          if (option.isDatePicker) {
            // "Pick date..." option - show date picker and hide menu
            // The date picker will handle the callback when a date is selected
            this.showDatePicker('scheduled');
            this.hide();
          } else {
            // Regular date option (Today, Tomorrow, No date, etc.)
            // Get the current task from state manager to ensure we have the latest data
            // The stored task reference might be stale if the task was updated previously
            let currentTask = this.task;
            if (this.taskStateManager && this.task) {
              const freshTask = this.taskStateManager.findTaskByPathAndLine(
                this.task.path,
                this.task.line,
              );
              if (freshTask) {
                currentTask = freshTask;
              }
            }

            const date = option.getDate();

            // Preserve existing time if the task already has a scheduled date with a time component
            if (date && currentTask?.scheduledDate) {
              const existingDate = currentTask.scheduledDate;
              const hasTime =
                existingDate.getHours() !== 0 ||
                existingDate.getMinutes() !== 0;

              if (hasTime) {
                date.setHours(
                  existingDate.getHours(),
                  existingDate.getMinutes(),
                  0,
                  0,
                );
              }
            }

            // Preserve existing repeat component
            const repeat = currentTask?.scheduledDateRepeat;

            // Only pass repeat argument if it exists
            if (repeat) {
              this.callbacks.onScheduledDateChange(currentTask, date, repeat);
            } else {
              this.callbacks.onScheduledDateChange(currentTask, date);
            }
            this.hide();
          }
        }
      });

      this.focusableItems.push(btn);
    }
  }

  private buildPrioritySection(): void {
    if (!this.containerEl || !this.task) return;

    // Section header
    const header = this.containerEl.createEl('div', {
      cls: 'todoseq-context-menu-header',
    });
    header.setText('Priority');

    // Icon row
    const iconRow = this.containerEl.createEl('div', {
      cls: 'todoseq-context-menu-icon-row',
    });

    const options = this.getPriorityOptions();

    for (const option of options) {
      const btn = iconRow.createEl('button', {
        cls: ['todoseq-context-menu-icon-btn', option.colorClass],
        attr: {
          'aria-label': option.label,
          title: option.label,
          role: 'menuitem',
          tabindex: '-1',
        },
      });

      const iconEl = btn.createEl('span', {
        cls: 'todoseq-context-menu-icon',
      });
      setIcon(iconEl, option.icon);

      btn.addEventListener('click', (evt) => {
        evt.preventDefault();
        evt.stopPropagation();
        if (this.task) {
          // Get the current task from state manager to ensure we have the latest data
          // The stored task reference might be stale if the task was updated previously
          let currentTask = this.task;
          if (this.taskStateManager) {
            const freshTask = this.taskStateManager.findTaskByPathAndLine(
              this.task.path,
              this.task.line,
            );
            if (freshTask) {
              currentTask = freshTask;
            }
          }
          this.callbacks.onPriorityChange(currentTask, option.priority);
        }
        this.hide();
      });

      this.focusableItems.push(btn);
    }
  }

  private buildDeadlineRow(): void {
    if (!this.containerEl || !this.task) return;

    const row = this.createMenuRow('Deadline', 'target', () => {
      // Show date picker for deadline
      if (this.task) {
        this.showDatePicker('deadline');
      }
      // Hide the context menu - the date picker will be shown at the same position
      this.hide();
    });
    row.setAttribute('role', 'menuitem');
    this.focusableItems.push(row);
  }

  // ─── Helpers ───────────────────────────────────────────────────

  private createMenuRow(
    label: string,
    iconName: string,
    onClick: () => void,
  ): HTMLElement {
    if (!this.containerEl) {
      throw new Error('Container element not initialized');
    }

    const row = this.containerEl.createEl('div', {
      cls: 'todoseq-context-menu-row',
      attr: {
        tabindex: '-1',
      },
    });

    const iconEl = row.createEl('span', {
      cls: 'todoseq-context-menu-row-icon',
    });
    setIcon(iconEl, iconName);

    const labelEl = row.createEl('span', {
      cls: 'todoseq-context-menu-row-label',
    });
    labelEl.setText(label);

    row.addEventListener('click', (evt) => {
      evt.preventDefault();
      evt.stopPropagation();
      onClick();
    });

    row.addEventListener('keydown', (evt) => {
      if (evt.key === 'Enter' || evt.key === ' ') {
        evt.preventDefault();
        evt.stopPropagation();
        onClick();
      }
    });

    return row;
  }

  private addSeparator(): void {
    if (!this.containerEl) return;
    this.containerEl.createEl('div', {
      cls: 'todoseq-context-menu-separator',
    });
  }

  private getScheduledDateOptions(): ScheduledDateOption[] {
    return [
      {
        icon: 'sun',
        label: 'Today',
        getDate: () => DateUtils.getDateOnly(new Date()),
      },
      {
        icon: 'sunrise',
        label: 'Tomorrow',
        getDate: () => {
          const d = DateUtils.getDateOnly(new Date());
          d.setDate(d.getDate() + 1);
          return d;
        },
      },
      {
        icon: 'calendar-arrow-up',
        label: 'Next week',
        getDate: () => this.getNextWeekStart(),
      },
      {
        icon: 'sofa',
        label: 'Next weekend',
        getDate: () => this.getNextWeekend(),
      },
      {
        icon: 'circle-off',
        label: 'No date',
        getDate: () => null,
      },
      {
        icon: 'calendar',
        label: 'Pick date...',
        getDate: () => null, // Return null, but the isDatePicker flag will handle the special case
        isDatePicker: true,
      },
    ];
  }

  /**
   * Show the date picker dialog
   */
  private showDatePicker(mode: DatePickerMode = 'scheduled'): void {
    if (!this.containerEl) return;

    // Get position of the context menu to overlay the date picker
    const rect = this.containerEl.getBoundingClientRect();
    const position = {
      x: rect.left,
      y: rect.top,
    };

    // Store task reference before hiding the menu (hide() sets this.task = null)
    const task = this.task;
    this.hide();

    // Get the current task from state manager to ensure we have the latest data
    // The stored task reference might be stale if the task was updated previously
    let currentTask = task;
    if (task && this.taskStateManager) {
      const freshTask = this.taskStateManager.findTaskByPathAndLine(
        task.path,
        task.line,
      );
      if (freshTask) {
        currentTask = freshTask;
      }
    }

    // Get the existing date based on mode
    const initialDate = currentTask
      ? mode === 'deadline'
        ? currentTask.deadlineDate
        : currentTask.scheduledDate
      : null;
    const initialRepeat = currentTask
      ? mode === 'deadline'
        ? (currentTask.deadlineDateRepeat ?? null)
        : (currentTask.scheduledDateRepeat ?? null)
      : null;

    this.datePicker = new DatePicker(
      {
        onDateSelected: (date, repeat, mode) => {
          if (currentTask) {
            if (mode === 'deadline') {
              this.callbacks.onDeadlineDateChange(
                currentTask,
                date,
                repeat ?? null,
              );
            } else {
              this.callbacks.onScheduledDateChange(
                currentTask,
                date,
                repeat ?? null,
              );
            }
          }
        },
      },
      {
        weekStartsOn: this.config.weekStartsOn,
      },
    );

    this.datePicker.show(position, mode, initialDate, initialRepeat);
  }

  private getPriorityOptions(): PriorityOption[] {
    return [
      {
        icon: 'flag',
        label: 'Priority A (high)',
        priority: 'high',
        colorClass: 'todoseq-priority-high',
      },
      {
        icon: 'flag',
        label: 'Priority B (medium)',
        priority: 'med',
        colorClass: 'todoseq-priority-med',
      },
      {
        icon: 'flag',
        label: 'Priority C (low)',
        priority: 'low',
        colorClass: 'todoseq-priority-low',
      },
      {
        icon: 'flag-off',
        label: 'No priority',
        priority: null,
        colorClass: 'todoseq-priority-none',
      },
    ];
  }

  private getScheduledTooltip(option: ScheduledDateOption): string {
    if (option.label === 'No date' || option.label === 'Pick date...') {
      return option.label;
    }
    const date = option.getDate();
    if (!date) return option.label;
    return `${option.label} — ${DateUtils.formatDateForDisplay(date)}`;
  }

  /**
   * Get the start of next week based on weekStartsOn setting.
   */
  private getNextWeekStart(): Date {
    const today = DateUtils.getDateOnly(new Date());
    const currentDay = today.getDay(); // 0=Sun, 1=Mon, ...
    const targetDay = this.config.weekStartsOn === 'Monday' ? 1 : 0;

    let daysUntilTarget = targetDay - currentDay;
    if (daysUntilTarget <= 0) {
      daysUntilTarget += 7;
    }

    const result = new Date(today);
    result.setDate(result.getDate() + daysUntilTarget);
    return result;
  }

  /**
   * Get next Saturday.
   */
  private getNextWeekend(): Date {
    const today = DateUtils.getDateOnly(new Date());
    const currentDay = today.getDay(); // 0=Sun, 1=Mon, ...6=Sat
    let daysUntilSaturday = 6 - currentDay;
    if (daysUntilSaturday <= 0) {
      daysUntilSaturday += 7;
    }

    const result = new Date(today);
    result.setDate(result.getDate() + daysUntilSaturday);
    return result;
  }

  // ─── Positioning ───────────────────────────────────────────────

  private positionMenu(x: number, y: number): void {
    if (!this.containerEl) return;

    // Position initially off-screen to measure
    this.containerEl.style.left = '-9999px';
    this.containerEl.style.top = '-9999px';

    // Force layout to get dimensions
    const rect = this.containerEl.getBoundingClientRect();
    const menuWidth = rect.width || 220;
    const menuHeight = rect.height || 300;

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    // Adjust position to keep menu within viewport
    let left = x;
    let top = y;

    if (left + menuWidth > viewportWidth) {
      left = viewportWidth - menuWidth - 8;
    }
    if (left < 8) {
      left = 8;
    }

    if (top + menuHeight > viewportHeight) {
      top = viewportHeight - menuHeight - 8;
    }
    if (top < 8) {
      top = 8;
    }

    this.containerEl.style.left = `${left}px`;
    this.containerEl.style.top = `${top}px`;
  }

  // ─── Global Event Listeners ────────────────────────────────────

  private attachGlobalListeners(): void {
    this.documentClickHandler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (this.containerEl && !this.containerEl.contains(target)) {
        this.hide();
      }
    };

    this.keydownHandler = (e: KeyboardEvent) => {
      this.handleKeyDown(e);
    };

    this.scrollHandler = () => {
      this.hide();
    };

    // Use setTimeout to avoid the same click that opened the menu from closing it
    const clickHandler = this.documentClickHandler;
    window.setTimeout(() => {
      if (clickHandler) {
        document.addEventListener('click', clickHandler);
      }
    }, 0);
    document.addEventListener('keydown', this.keydownHandler);
    window.addEventListener('scroll', this.scrollHandler, { passive: true });
  }

  private detachGlobalListeners(): void {
    if (this.documentClickHandler) {
      document.removeEventListener('click', this.documentClickHandler);
      this.documentClickHandler = null;
    }
    if (this.keydownHandler) {
      document.removeEventListener('keydown', this.keydownHandler);
      this.keydownHandler = null;
    }
    if (this.scrollHandler) {
      window.removeEventListener('scroll', this.scrollHandler);
      this.scrollHandler = null;
    }
  }

  // ─── Keyboard Navigation ──────────────────────────────────────

  private handleKeyDown(e: KeyboardEvent): void {
    if (!this.isShowing) return;

    switch (e.key) {
      case 'Escape':
        e.preventDefault();
        e.stopPropagation();
        this.hide();
        break;

      case 'ArrowDown':
        e.preventDefault();
        e.stopPropagation();
        this.moveFocus(1);
        break;

      case 'ArrowUp':
        e.preventDefault();
        e.stopPropagation();
        this.moveFocus(-1);
        break;

      case 'Enter':
      case ' ':
        if (
          this.focusedIndex >= 0 &&
          this.focusedIndex < this.focusableItems.length
        ) {
          e.preventDefault();
          e.stopPropagation();
          this.focusableItems[this.focusedIndex].click();
        }
        break;
    }
  }

  private moveFocus(direction: number): void {
    if (this.focusableItems.length === 0) return;

    // Remove current focus
    if (
      this.focusedIndex >= 0 &&
      this.focusedIndex < this.focusableItems.length
    ) {
      this.focusableItems[this.focusedIndex].removeClass('is-focused');
    }

    // Calculate new index
    this.focusedIndex += direction;
    if (this.focusedIndex < 0) {
      this.focusedIndex = this.focusableItems.length - 1;
    } else if (this.focusedIndex >= this.focusableItems.length) {
      this.focusedIndex = 0;
    }

    // Apply focus
    const item = this.focusableItems[this.focusedIndex];
    item.addClass('is-focused');
    item.focus();
  }
}
