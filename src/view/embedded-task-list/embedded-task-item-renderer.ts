import { Task } from '../../types/task';
import {
  getSubtaskDisplayText,
  hasSubtasks,
  getTaskTextDisplay,
  truncateMiddle,
} from '../../utils/task-utils';
import TodoTracker from '../../main';
import { TodoseqParameters } from './code-block-parser';
import {
  MarkdownView,
  WorkspaceLeaf,
  TFile,
  Platform,
  setIcon,
  Notice,
} from 'obsidian';
import {
  TAG_PATTERN,
  WIKI_LINK_REGEX,
  MD_LINK_REGEX,
  URL_REGEX,
} from '../../utils/patterns';
import { DateUtils } from '../../utils/date-utils';
import { StateMenuBuilder } from '../components/state-menu-builder';
import { TaskContextMenu } from '../components/task-context-menu';
import { BaseDialog } from '../components/base-dialog';
import { getStateTransitionManager } from '../../services/task-update-coordinator';

export class EmbeddedTaskItemRenderer {
  constructor(
    private plugin: TodoTracker,
    private menuBuilder: StateMenuBuilder,
    private taskContextMenu: TaskContextMenu,
  ) {}

  createTaskListItem(
    task: Task,
    index: number,
    params: TodoseqParameters,
  ): HTMLLIElement {
    const li = window.activeDocument.createElement('li');
    li.className = 'todoseq-embedded-task-item';

    const dateCategory = this.getDateCategory(task);
    if (dateCategory !== 'none' && !task.completed) {
      li.classList.add(`todoseq-embedded-task-item-date-${dateCategory}`);
    }

    li.setAttribute('data-path', task.path);
    li.setAttribute('data-line', String(task.line));
    li.setAttribute('data-index', String(index));

    const checkbox = li.createEl('input', {
      cls: 'todoseq-embedded-task-checkbox task-list-item-checkbox',
      attr: { type: 'checkbox' },
    });

    const settings = this.plugin.keywordManager.getSettings();

    let dataTaskChar: string;
    if (settings.useExtendedCheckboxStyles) {
      dataTaskChar = this.plugin.keywordManager.getCheckboxState(
        task.state,
        settings,
      );
      checkbox.checked = dataTaskChar !== ' ';
    } else {
      if (this.plugin.keywordManager.isActive(task.state)) {
        dataTaskChar = '/';
      } else if (this.plugin.keywordManager.isCompleted(task.state)) {
        dataTaskChar = 'x';
      } else {
        dataTaskChar = ' ';
      }
      checkbox.checked = task.completed;
    }

    checkbox.setAttribute('data-task', dataTaskChar);
    li.setAttribute('data-task', dataTaskChar);
    if (dataTaskChar === 'x' || dataTaskChar === '-') {
      li.classList.add('todoseq-embedded-task-completed');
    }
    checkbox.setAttribute(
      'aria-label',
      `Toggle task: ${task.text || task.state}`,
    );

    const wrapMode: 'dynamic' | boolean = params.wrapContent ?? 'dynamic';
    const isTrueWrapMode = wrapMode === true;
    const isDynamicMode = wrapMode === 'dynamic';

    const hasSubtask = hasSubtasks(task);
    const hasRepeat =
      !task.completed && (task.scheduledDateRepeat || task.deadlineDateRepeat);
    const needsFloatingIndicators =
      (isTrueWrapMode || isDynamicMode) && (hasSubtask || hasRepeat);

    if (isTrueWrapMode) {
      li.classList.add('todoseq-embedded-task-item-wrap');

      const contentWrapper = li.createDiv({
        cls: 'todoseq-embedded-task-content-wrapper',
      });
      const textRow = contentWrapper.createDiv({
        cls: 'todoseq-embedded-task-text-row',
      });
      const textContainer = textRow.createDiv({
        cls: 'todoseq-embedded-task-text-container todoseq-embedded-task-text-wrap',
      });

      this.buildItemContents(textContainer, task, li);

      if (needsFloatingIndicators) {
        const floatingIndicators = textRow.createDiv({
          cls: 'todoseq-embedded-task-floating-indicators',
        });
        if (hasSubtask) {
          floatingIndicators.createSpan({
            cls: 'todoseq-subtask-indicator',
            text: getSubtaskDisplayText(task),
            attr: {
              title: `${task.subtaskCompletedCount} of ${task.subtaskCount} subtasks complete`,
            },
          });
        }
        if (hasRepeat) {
          this.buildRepeatIcon(task, floatingIndicators);
        }

        textRow.appendChild(floatingIndicators);
      }

      this.buildWrapDateInfoRows(task, params, contentWrapper);

      const urgencyValue = task.urgency;
      const showUrgency =
        params.showUrgency === true &&
        urgencyValue !== null &&
        urgencyValue !== undefined;
      const showFile = params.showFile !== false;

      if (showFile || showUrgency) {
        const fileInfoRow = contentWrapper.createDiv({
          cls: 'todoseq-embedded-task-file-info-row',
        });
        if (showFile) {
          const fileName = task.path.split('/').pop() || task.path;
          const displayName = fileName.replace(/\.md$/, '');
          fileInfoRow.createSpan({
            cls: 'todoseq-embedded-task-file-info-wrap',
            text: `${displayName}:${task.line + 1}`,
            attr: { title: task.path },
          });
        }
        if (
          showUrgency &&
          urgencyValue !== null &&
          urgencyValue !== undefined
        ) {
          fileInfoRow.createSpan({
            cls: 'todoseq-embedded-task-urgency-wrap',
            text: `${urgencyValue.toFixed(2)}`,
            attr: { title: `Urgency: ${urgencyValue.toFixed(2)}` },
          });
        }
      }
    } else if (isDynamicMode) {
      li.classList.add('todoseq-embedded-task-item-wrap-dynamic');

      const contentWrapper = li.createDiv({
        cls: 'todoseq-embedded-task-content-wrapper',
      });
      const textRow = contentWrapper.createDiv({
        cls: 'todoseq-embedded-task-text-row',
      });
      const textContainer = textRow.createDiv({
        cls: 'todoseq-embedded-task-text-container todoseq-embedded-task-text-wrap-dynamic',
      });

      this.buildItemContents(textContainer, task, li);

      if (needsFloatingIndicators) {
        const floatingIndicators = textRow.createDiv({
          cls: 'todoseq-embedded-task-floating-indicators',
        });
        if (hasSubtask) {
          floatingIndicators.createSpan({
            cls: 'todoseq-subtask-indicator',
            text: getSubtaskDisplayText(task),
            attr: {
              title: `${task.subtaskCompletedCount} of ${task.subtaskCount} subtasks complete`,
            },
          });
        }
        if (hasRepeat) {
          this.buildRepeatIcon(task, floatingIndicators);
        }
      }

      this.buildInlineDateBadge(task, params, textContainer);
      this.buildWrapDateInfoRows(
        task,
        params,
        contentWrapper,
        'todoseq-embedded-task-date-info-dynamic-wrap',
      );

      const urgencyValue = task.urgency;
      const showUrgency =
        params.showUrgency === true &&
        urgencyValue !== null &&
        urgencyValue !== undefined;
      const showFile = params.showFile !== false;

      if (showFile || showUrgency) {
        const fileInfoRow = contentWrapper.createDiv({
          cls: 'todoseq-embedded-task-file-info-row',
        });
        if (showFile) {
          const fileName = task.path.split('/').pop() || task.path;
          const displayName = fileName.replace(/\.md$/, '');
          fileInfoRow.createSpan({
            cls: 'todoseq-embedded-task-file-info-wrap',
            text: `${displayName}:${task.line + 1}`,
            attr: { title: task.path },
          });
        }
        if (
          showUrgency &&
          urgencyValue !== null &&
          urgencyValue !== undefined
        ) {
          fileInfoRow.createSpan({
            cls: 'todoseq-embedded-task-urgency-dynamic',
            text: `${urgencyValue.toFixed(2)}`,
            attr: { title: `Urgency: ${urgencyValue.toFixed(2)}` },
          });
        }

        if (showFile) {
          const fileName = task.path.split('/').pop() || task.path;
          const displayName = fileName.replace(/\.md$/, '');
          const displayText = `${displayName}:${task.line + 1}`;
          contentWrapper.createDiv({
            cls: 'todoseq-embedded-task-file-info',
            text: truncateMiddle(displayText, 32),
            attr: { title: task.path },
          });
        }
        if (
          showUrgency &&
          urgencyValue !== null &&
          urgencyValue !== undefined
        ) {
          contentWrapper.createSpan({
            cls: 'todoseq-embedded-task-urgency',
            text: `${urgencyValue.toFixed(2)}`,
            attr: { title: `Urgency: ${urgencyValue.toFixed(2)}` },
          });
        }
      }
    } else {
      const textContainer = li.createDiv({
        cls: 'todoseq-embedded-task-text-container',
      });

      this.buildItemContents(textContainer, task, li);

      if (params.showFile !== false) {
        const fileName = task.path.split('/').pop() || task.path;
        const displayName = fileName.replace(/\.md$/, '');
        const displayText = `${displayName}:${task.line + 1}`;
        li.createDiv({
          cls: 'todoseq-embedded-task-file-info',
          text: truncateMiddle(displayText, 32),
          attr: { title: task.path },
        });

        if (
          params.showUrgency === true &&
          task.urgency !== null &&
          task.urgency !== undefined
        ) {
          li.createSpan({
            cls: 'todoseq-embedded-task-urgency',
            text: `${task.urgency.toFixed(2)}`,
            attr: { title: `Urgency: ${task.urgency.toFixed(2)}` },
          });
        }
      } else {
        if (
          params.showUrgency === true &&
          task.urgency !== null &&
          task.urgency !== undefined
        ) {
          li.createSpan({
            cls: 'todoseq-embedded-task-urgency',
            text: `${task.urgency.toFixed(2)}`,
            attr: { title: `Urgency: ${task.urgency.toFixed(2)}` },
          });
        }
      }

      if (hasSubtask) {
        textContainer.createSpan({
          cls: 'todoseq-subtask-indicator',
          text: getSubtaskDisplayText(task),
          attr: {
            title: `${task.subtaskCompletedCount} of ${task.subtaskCount} subtasks complete`,
          },
        });
      }

      this.buildInlineDateBadge(task, params, textContainer);

      if (!task.completed) {
        this.buildRepeatIcon(task, textContainer);
      }
    }

    this.addTaskEventListeners(li, checkbox, task);

    return li;
  }

  private buildItemContents(
    textContainer: HTMLElement,
    task: Task,
    li: HTMLLIElement,
  ): void {
    const stateSpan = textContainer.createSpan({
      cls: 'todoseq-embedded-task-state',
      attr: {
        role: 'button',
        tabindex: '0',
        'aria-checked': String(task.completed),
      },
    });
    stateSpan.textContent = task.state;

    const liWithFlag = li as HTMLLIElement & {
      _stateSpanTouchActive?: boolean;
    };

    let stateTouchTimer: number | null = null;
    let stateInitialTouchX = 0;
    let stateInitialTouchY = 0;
    let lastStateMenuOpenTs = 0;
    const STATE_MENU_DEBOUNCE_MS = 350;

    const openStateMenuOnceAtPosition = (x: number, y: number) => {
      const now = Date.now();
      if (now - lastStateMenuOpenTs < STATE_MENU_DEBOUNCE_MS) return;
      lastStateMenuOpenTs = now;
      this.clearAllPressed();
      li.classList.add('todoseq-pressed');
      this.openStateMenuAtPosition(task, { x, y }, () =>
        li.classList.remove('todoseq-pressed'),
      );
    };

    const openStateMenuOnceAtMouseEvent = (evt: MouseEvent) => {
      const now = Date.now();
      if (now - lastStateMenuOpenTs < STATE_MENU_DEBOUNCE_MS) {
        evt.preventDefault();
        evt.stopPropagation();
        return;
      }
      lastStateMenuOpenTs = now;
      this.clearAllPressed();
      li.classList.add('todoseq-pressed');
      this.openStateMenuAtMouseEvent(task, evt, () =>
        li.classList.remove('todoseq-pressed'),
      );
    };

    let highlightTimer: number | null = null;

    stateSpan.addEventListener(
      'touchstart',
      (evt: TouchEvent) => {
        if (evt.touches.length !== 1) return;
        evt.stopPropagation();
        liWithFlag._stateSpanTouchActive = true;
        const touch = evt.touches[0];
        stateInitialTouchX = touch.clientX;
        stateInitialTouchY = touch.clientY;
        highlightTimer = window.setTimeout(() => {
          li.classList.add('todoseq-pressed');
          highlightTimer = null;
        }, 150);
        stateTouchTimer = window.setTimeout(() => {
          const x = touch.clientX;
          const y = touch.clientY;
          openStateMenuOnceAtPosition(x, y);
        }, 350);
      },
      { passive: true },
    );

    const clearStateTouch = () => {
      if (stateTouchTimer) {
        window.clearTimeout(stateTouchTimer);
        stateTouchTimer = null;
      }
      if (highlightTimer) {
        window.clearTimeout(highlightTimer);
        highlightTimer = null;
      }
      li.classList.remove('todoseq-pressed');
      window.setTimeout(() => {
        liWithFlag._stateSpanTouchActive = false;
      }, 500);
    };

    stateSpan.addEventListener('touchend', clearStateTouch, { passive: true });
    stateSpan.addEventListener('touchcancel', clearStateTouch, {
      passive: true,
    });

    stateSpan.addEventListener(
      'touchmove',
      (evt: TouchEvent) => {
        if (!stateTouchTimer) return;
        const touch = evt.touches[0];
        const deltaX = Math.abs(touch.clientX - stateInitialTouchX);
        const deltaY = Math.abs(touch.clientY - stateInitialTouchY);
        if (deltaX > 10 || deltaY > 10) {
          clearStateTouch();
        }
      },
      { passive: true },
    );

    stateSpan.addEventListener('contextmenu', (evt: MouseEvent) => {
      evt.preventDefault();
      evt.stopPropagation();
      if (liWithFlag._stateSpanTouchActive) return;
      openStateMenuOnceAtMouseEvent(evt);
    });

    if (task.priority) {
      const pri = task.priority;
      textContainer.createSpan({
        cls: `todoseq-priority-badge priority-${pri}`,
        text: pri === 'high' ? 'A' : pri === 'med' ? 'B' : 'C',
        attr: { 'aria-label': `Priority ${pri}`, title: `Priority ${pri}` },
      });
    }

    if (task.text) {
      const textSpan = textContainer.createSpan({
        cls: 'todoseq-embedded-task-text',
      });
      if (textContainer.children.length > 1) {
        textSpan.appendText(' ');
      }
      this.renderTaskTextWithLinks(task, textSpan);
    }
  }

  private addTaskEventListeners(
    li: HTMLLIElement,
    checkbox: HTMLInputElement,
    task: Task,
  ): void {
    checkbox.addEventListener('change', (e) => {
      void (async () => {
        e.stopPropagation();

        try {
          const freshTask = this.plugin.taskStateManager.findTaskByPathAndLine(
            task.path,
            task.line,
          );
          const currentTask = freshTask || task;
          const currentState = currentTask.state;

          const stateManager = getStateTransitionManager(
            this.plugin.taskUpdateCoordinator,
            this.plugin.keywordManager,
            this.plugin.settings?.stateTransitions,
          );

          let newState: string | null = null;
          if (checkbox.checked) {
            newState =
              stateManager.getNextCompletedOrArchivedState(currentState);
          } else {
            newState = stateManager.getNextState(currentState);
            if (newState === currentState) {
              checkbox.checked = true;
              return;
            }
          }

          if (newState === currentState) {
            return;
          }

          await this.updateTaskState(currentTask, newState);

          const newCheckboxChar = this.plugin.keywordManager.getCheckboxState(
            newState,
            this.plugin.keywordManager.getSettings(),
          );
          checkbox.setAttribute('data-task', newCheckboxChar);
          li.setAttribute('data-task', newCheckboxChar);
          li.classList.toggle(
            'todoseq-embedded-task-completed',
            newCheckboxChar === 'x' || newCheckboxChar === '-',
          );
        } catch (error) {
          console.error('Error updating task state:', error);
          checkbox.checked = !checkbox.checked;
          const revertedChar = this.plugin.keywordManager.getCheckboxState(
            task.state,
            this.plugin.keywordManager.getSettings(),
          );
          checkbox.setAttribute('data-task', revertedChar);
          li.setAttribute('data-task', revertedChar);
          li.classList.toggle(
            'todoseq-embedded-task-completed',
            revertedChar === 'x' || revertedChar === '-',
          );
        }
      })();
    });

    li.addEventListener('click', (e) => {
      if (e.target !== checkbox) {
        this.navigateToTask(task, e);
      }
    });

    let touchTimer: number | null = null;
    let suppressNextContextMenu = false;
    let initialTouchX = 0;
    let initialTouchY = 0;
    let liHighlightTimer: number | null = null;
    const LONG_PRESS_MS = 350;
    const TOUCH_MOVE_THRESHOLD = 10;

    li.addEventListener('contextmenu', (evt: MouseEvent) => {
      if (
        (li as HTMLLIElement & { _stateSpanTouchActive?: boolean })
          ._stateSpanTouchActive
      ) {
        evt.preventDefault();
        evt.stopPropagation();
        return;
      }

      const target = evt.target;
      if (
        target === checkbox ||
        (target instanceof HTMLElement &&
          (target.hasClass('todoseq-embedded-task-state') ||
            target.closest('.todoseq-embedded-task-state') !== null))
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
      const prev = this.taskContextMenu.onHide;
      this.taskContextMenu.onHide = () => {
        prev?.();
        li.classList.remove('todoseq-pressed');
      };
      this.taskContextMenu
        .showAtMouseEvent(task, evt)
        .then(() => {
          this.clearAllPressed();
          li.classList.add('todoseq-pressed');
        })
        .catch((error) => {
          console.error('Error showing context menu:', error);
        });
    });

    li.addEventListener(
      'touchstart',
      (evt: TouchEvent) => {
        if (evt.touches.length !== 1) return;

        const target = evt.target;
        if (
          target === checkbox ||
          (target instanceof HTMLElement &&
            (target.hasClass('todoseq-embedded-task-state') ||
              target.closest('.todoseq-embedded-task-state') !== null))
        ) {
          return;
        }

        liHighlightTimer = window.setTimeout(() => {
          li.classList.add('todoseq-pressed');
          liHighlightTimer = null;
        }, 150);
        const touch = evt.touches[0];
        initialTouchX = touch.clientX;
        initialTouchY = touch.clientY;
        suppressNextContextMenu = true;
        touchTimer = window.setTimeout(() => {
          const syntheticEvt = new MouseEvent('contextmenu', {
            clientX: touch.clientX,
            clientY: touch.clientY,
            bubbles: true,
          });
          this.taskContextMenu
            .showAtMouseEvent(task, syntheticEvt)
            .catch((error) => {
              new Notice('Failed to show context menu');
              console.error('Error showing context menu:', error);
            });
        }, LONG_PRESS_MS);
      },
      { passive: true },
    );

    const clearTouch = () => {
      if (touchTimer) {
        window.clearTimeout(touchTimer);
        touchTimer = null;
      }
      if (liHighlightTimer) {
        window.clearTimeout(liHighlightTimer);
        liHighlightTimer = null;
      }
      li.classList.remove('todoseq-pressed');
      window.setTimeout(() => {
        suppressNextContextMenu = false;
      }, 250);
    };
    li.addEventListener('touchend', clearTouch, { passive: true });
    li.addEventListener('touchcancel', clearTouch, { passive: true });

    li.addEventListener(
      'touchmove',
      (evt: TouchEvent) => {
        if (!touchTimer) return;

        const touch = evt.touches[0];
        const deltaX = Math.abs(touch.clientX - initialTouchX);
        const deltaY = Math.abs(touch.clientY - initialTouchY);

        if (deltaX > TOUCH_MOVE_THRESHOLD || deltaY > TOUCH_MOVE_THRESHOLD) {
          clearTouch();
        }
      },
      { passive: true },
    );
  }

  private clearAllPressed(): void {
    activeDocument
      .querySelectorAll('.todoseq-embedded-task-item.todoseq-pressed')
      .forEach((el) => el.classList.remove('todoseq-pressed'));
  }

  private openStateMenuAtPosition(
    task: Task,
    pos: { x: number; y: number },
    onHide?: () => void,
  ): void {
    BaseDialog.closeAnyActiveDialog();
    this.clearAllPressed();
    const menu = this.menuBuilder.buildStateMenu(task.state, async (state) => {
      await this.updateTaskState(task, state);
    });
    if (onHide) menu.onHide(onHide);
    menu.showAtPosition({ x: pos.x, y: pos.y });
  }

  private openStateMenuAtMouseEvent(
    task: Task,
    evt: MouseEvent,
    onHide?: () => void,
  ): void {
    evt.preventDefault();
    evt.stopPropagation();

    BaseDialog.closeAnyActiveDialog();
    this.clearAllPressed();

    const menu = this.menuBuilder.buildStateMenu(task.state, async (state) => {
      await this.updateTaskState(task, state);
    });
    if (onHide) menu.onHide(onHide);

    const maybeShowAtMouseEvent = (
      menu as unknown as { showAtMouseEvent?: (e: MouseEvent) => void }
    ).showAtMouseEvent;
    if (typeof maybeShowAtMouseEvent === 'function') {
      maybeShowAtMouseEvent.call(menu, evt);
    } else {
      menu.showAtPosition({ x: evt.clientX, y: evt.clientY });
    }
  }

  private async updateTaskState(task: Task, newState: string): Promise<void> {
    try {
      if (this.plugin.taskUpdateCoordinator) {
        await this.plugin.taskUpdateCoordinator.updateTaskByPath(
          task.path,
          task.line,
          newState,
          'embedded',
        );
      } else if (this.plugin.taskEditor) {
        await this.plugin.taskEditor.updateTaskState(task, newState, true);
      }
    } catch (error) {
      console.error('Error updating task state:', error);
    }
  }

  private renderTaskTextWithLinks(task: Task, parent: HTMLElement) {
    const textToProcess = getTaskTextDisplay(task);
    const patterns: { type: 'wiki' | 'md' | 'url' | 'tag'; regex: RegExp }[] = [
      { type: 'wiki', regex: new RegExp(WIKI_LINK_REGEX) },
      { type: 'md', regex: new RegExp(MD_LINK_REGEX) },
      { type: 'url', regex: new RegExp(URL_REGEX) },
      { type: 'tag', regex: TAG_PATTERN },
    ];

    let i = 0;
    while (i < textToProcess.length) {
      let nextMatch: {
        type: 'wiki' | 'md' | 'url' | 'tag';
        match: RegExpExecArray;
      } | null = null;

      for (const p of patterns) {
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
        const span = parent.createEl('span', {
          cls: 'todoseq-embedded-task-tag',
        });
        const tagName = nextMatch.match[0];
        span.setText(tagName);
        span.setAttribute('title', tagName);
      } else {
        const span = parent.createEl('span', {
          cls: 'embedded-task-link-like',
        });

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

  private getDateCategory(
    task: Task,
  ): 'overdue' | 'today' | 'soon' | 'later' | 'none' {
    const now = new Date();
    const today = this.getDateOnly(now);

    let targetDate: Date | null = null;

    if (task.scheduledDate && task.deadlineDate) {
      targetDate =
        task.scheduledDate < task.deadlineDate
          ? task.scheduledDate
          : task.deadlineDate;
    } else if (task.scheduledDate) {
      targetDate = task.scheduledDate;
    } else if (task.deadlineDate) {
      targetDate = task.deadlineDate;
    }

    if (!targetDate) {
      return 'none';
    }

    const target = this.getDateOnly(targetDate);

    if (target < today) {
      return 'overdue';
    }

    if (target.getTime() === today.getTime()) {
      return 'today';
    }

    const soonDate = this.getDateOnly(
      new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
    );
    if (target <= soonDate) {
      return 'soon';
    }

    return 'later';
  }

  private getDateOnly(date: Date): Date {
    return DateUtils.getDateOnly(date);
  }

  private buildDateBadge(
    date: Date,
    iconName:
      | 'calendar'
      | 'calendar-clock'
      | 'calendar-range'
      | 'target'
      | 'check-circle',
    parent: HTMLElement,
  ): void {
    const badge = parent.createEl('span', {
      cls: 'todoseq-embedded-task-date-badge',
    });
    setIcon(badge, iconName);
    const svg = badge.querySelector('svg');
    if (svg) {
      svg.removeAttribute('width');
      svg.removeAttribute('height');
    }
    badge.createSpan({
      text: DateUtils.formatDateForDisplay(date),
    });
  }

  private buildDateInfoRow(
    label: string,
    date: Date,
    parent: HTMLElement,
    extraCls?: string,
  ): void {
    const row = parent.createEl('div', {
      cls: 'todoseq-embedded-task-date-info' + (extraCls ? ` ${extraCls}` : ''),
    });
    row.createSpan({
      cls: 'todoseq-embedded-task-date-info-label',
      text: `${label}: `,
    });
    row.createSpan({
      cls: 'todoseq-embedded-task-date-info-value',
      text: DateUtils.formatDateForDisplay(date),
    });
  }

  private buildInlineDateBadge(
    task: Task,
    params: TodoseqParameters,
    parent: HTMLElement,
  ): void {
    const showScheduled = params.showScheduledDate === true;
    const showDeadline = params.showDeadlineDate === true;
    const showClosed = params.showClosedDate === true;
    if (!showScheduled && !showDeadline && !showClosed) return;

    if (showScheduled && task.scheduledDate && !task.completed) {
      this.buildDateBadge(task.scheduledDate, 'calendar', parent);
    }
    if (showDeadline && task.deadlineDate && !task.completed) {
      this.buildDateBadge(task.deadlineDate, 'target', parent);
    }
    if (showClosed && task.closedDate && task.completed) {
      this.buildDateBadge(task.closedDate, 'check-circle', parent);
    }
  }

  private buildWrapDateInfoRows(
    task: Task,
    params: TodoseqParameters,
    parent: HTMLElement,
    extraCls?: string,
  ): void {
    const showScheduled = params.showScheduledDate === true;
    const showDeadline = params.showDeadlineDate === true;
    const showClosed = params.showClosedDate === true;
    if (!showScheduled && !showDeadline && !showClosed) return;

    if (showScheduled && task.scheduledDate && !task.completed) {
      this.buildDateInfoRow('Scheduled', task.scheduledDate, parent, extraCls);
    }
    if (showDeadline && task.deadlineDate && !task.completed) {
      this.buildDateInfoRow('Deadline', task.deadlineDate, parent, extraCls);
    }
    if (showClosed && task.closedDate && task.completed) {
      this.buildDateInfoRow('Closed', task.closedDate, parent, extraCls);
    }
  }

  private buildRepeatIcon(task: Task, parent: HTMLElement): void {
    const scheduledRepeat = task.scheduledDateRepeat;
    const deadlineRepeat = task.deadlineDateRepeat;

    if (!scheduledRepeat && !deadlineRepeat) {
      return;
    }

    const repeatInfo = scheduledRepeat ?? deadlineRepeat;

    if (!repeatInfo) {
      return;
    }

    const repeatIcon = parent.createEl('span', {
      cls: 'todoseq-task-date-repeat-icon',
    });
    setIcon(repeatIcon, 'repeat-2');
    const svg = repeatIcon.querySelector('svg');
    if (svg) {
      svg.removeAttribute('width');
      svg.removeAttribute('height');
    }
    repeatIcon.setAttribute('title', `Repeats ${repeatInfo.raw}`);
  }

  navigateToTask(task: Task, evt?: MouseEvent): void {
    try {
      const { workspace } = this.plugin.app;
      const isMac = Platform.isMacOS;
      const isMiddle = evt?.button === 1;
      const metaOrCtrl = isMac ? evt?.metaKey : evt?.ctrlKey;

      const file = this.plugin.app.vault.getAbstractFileByPath(task.path);
      if (!(file instanceof TFile)) return;

      const isMarkdownLeaf = (
        leaf: WorkspaceLeaf | null | undefined,
      ): boolean => {
        if (!leaf) return false;
        if (leaf.view instanceof MarkdownView) return true;
        return leaf.view?.getViewType?.() === 'markdown';
      };

      const isTodoSeqLeaf = (
        leaf: WorkspaceLeaf | null | undefined,
      ): boolean => {
        if (!leaf) return false;
        return leaf.view?.getViewType() === 'todoseq';
      };

      const findExistingLeafForFile = (): WorkspaceLeaf | null => {
        const leaves = workspace.getLeavesOfType('markdown');
        for (const leaf of leaves) {
          if (isTodoSeqLeaf(leaf)) continue;
          if (leaf.view instanceof MarkdownView) {
            const openFile = leaf.view.file;
            if (openFile && openFile.path === file.path) {
              return leaf;
            }
          }
        }
        return null;
      };

      const forceNewTab = isMiddle || metaOrCtrl;
      const doSplit = evt?.shiftKey;

      let targetLeaf: WorkspaceLeaf | null = null;

      if (doSplit) {
        targetLeaf = workspace.getLeaf('split');
      } else if (forceNewTab) {
        targetLeaf = workspace.getLeaf('tab');
      } else {
        const currentActiveLeaf =
          workspace.getActiveViewOfType(MarkdownView)?.leaf ??
          workspace.getLeaf();
        const isCurrentActiveMarkdown =
          currentActiveLeaf && isMarkdownLeaf(currentActiveLeaf);

        const existingLeafForFile = findExistingLeafForFile();
        if (existingLeafForFile) {
          targetLeaf = existingLeafForFile;
        } else {
          const allLeaves = workspace.getLeavesOfType('markdown');
          for (const leaf of allLeaves) {
            if (isMarkdownLeaf(leaf) && !isTodoSeqLeaf(leaf)) {
              targetLeaf = leaf;
              break;
            }
          }
          if (!targetLeaf && isCurrentActiveMarkdown) {
            targetLeaf = currentActiveLeaf;
          }
          if (!targetLeaf) {
            targetLeaf = workspace.getLeaf('tab');
            if (isTodoSeqLeaf(targetLeaf)) {
              const allLeaves = workspace.getLeavesOfType('markdown');
              for (const leaf of allLeaves) {
                if (isMarkdownLeaf(leaf) && !isTodoSeqLeaf(leaf)) {
                  targetLeaf = leaf;
                  break;
                }
              }
              if (isTodoSeqLeaf(targetLeaf) || !isMarkdownLeaf(targetLeaf)) {
                targetLeaf = workspace.getLeaf('tab');
              }
            }
          }
        }
      }

      targetLeaf
        .openFile(file)
        .then(() => {
          window.setTimeout(() => {
            const leafView = targetLeaf?.view;
            if (
              !leafView ||
              !(leafView instanceof MarkdownView) ||
              !leafView.editor
            ) {
              console.debug(
                `TaskListRenderer: No valid MarkdownView in leaf - leafView: ${leafView?.getViewType?.() || 'unknown'}, is MarkdownView: ${leafView instanceof MarkdownView}, has editor: ${(leafView as MarkdownView).editor ? 'yes' : 'no'}`,
              );
              return;
            }

            const isFileOpenSuccessfully =
              leafView.file && leafView.file.path === task.path;

            if (!isFileOpenSuccessfully) {
              console.debug(
                `TODOseq: File '${task.path}' was not successfully opened. The file type may not be supported by Obsidian.`,
              );
              return;
            }

            const lineContent = leafView.editor.getLine(task.line);
            const pos = { line: task.line, ch: lineContent.length };
            leafView.editor.setCursor(pos);

            try {
              (
                leafView as {
                  setEphemeralState?: (state: {
                    line: number;
                    col: number;
                  }) => void;
                }
              ).setEphemeralState?.({
                line: task.line,
                col: lineContent.length,
              });
            } catch {
              // Ignore if ephemeral state is not available
            }

            leafView.editor.scrollIntoView({ from: pos, to: pos }, true);
            leafView.editor.focus();

            if (targetLeaf) {
              void workspace.revealLeaf(targetLeaf);
            }
          }, 100);
        })
        .catch((error) => {
          console.error('Error opening file:', error);
        });
    } catch (error) {
      console.error('Error navigating to task:', error);
    }
  }
}
