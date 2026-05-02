import { Task, DateRepeatInfo } from '../../types/task';
import { getSubtaskDisplayText, hasSubtasks } from '../../utils/task-utils';
import TodoTracker from '../../main';
import { TodoseqParameters } from './code-block-parser';
import { getTaskTextDisplay } from '../../utils/task-utils';
import {
  MarkdownView,
  WorkspaceLeaf,
  TFile,
  Platform,
  setIcon,
  Notice,
} from 'obsidian';
import { truncateMiddle } from '../../utils/task-utils';
import { TAG_PATTERN } from '../../utils/patterns';
import { DateUtils } from '../../utils/date-utils';
import { StateMenuBuilder } from '../components/state-menu-builder';
import { TaskContextMenu } from '../components/task-context-menu';
import { BaseDialog } from '../components/base-dialog';
import {
  getTodayDailyNote,
  isTaskOnTodayDailyNote,
} from '../../utils/daily-note-utils';
import {
  getTaskRemovalRange,
  modifyLinesForMigration,
  readTaskBlockFromVault,
} from '../../utils/task-sub-bullets';
import { TaskStateTransitionManager } from '../../services/task-state-transition-manager';

/**
 * Renders interactive task lists within code blocks.
 * Handles task state changes and navigation.
 */
export class EmbeddedTaskListRenderer {
  private plugin: TodoTracker;
  private menuBuilder: StateMenuBuilder;
  private taskContextMenu: TaskContextMenu;

  constructor(plugin: TodoTracker) {
    this.plugin = plugin;
    this.menuBuilder = new StateMenuBuilder(plugin);

    // Create task context menu for right-click actions
    this.taskContextMenu = new TaskContextMenu(
      {
        onGoToTask: (task) => this.navigateToTask(task),
        onCopyTask: (task) => this.copyTaskToClipboard(task),
        onCopyTaskToToday: async (task) => await this.copyTaskToToday(task),
        onMoveTaskToToday: async (task) => await this.moveTaskToToday(task),
        onMigrateTaskToToday: async (task) =>
          await this.migrateTaskToToday(task),
        onPriorityChange: (task, priority) =>
          this.handlePriorityChange(task, priority),
        onScheduledDateChange: (task, date, repeat) =>
          this.handleScheduledDateChange(task, date, repeat),
        onDeadlineDateChange: (task, date, repeat) =>
          this.handleDeadlineDateChange(task, date, repeat),
      },
      {
        weekStartsOn: plugin.settings.weekStartsOn,
        migrateToTodayState: plugin.settings.migrateToTodayState,
      },
      plugin.app,
      this.plugin.taskStateManager,
    );
  }

  /**
   * Copy task to clipboard in Org mode format
   */
  private async copyTaskToClipboard(task: Task): Promise<void> {
    const allLines = await readTaskBlockFromVault(this.plugin.app, task);
    const textToCopy = allLines.join('\n');
    navigator.clipboard.writeText(textToCopy).then(
      () => {
        new Notice('Task copied to clipboard');
      },
      () => {
        new Notice('Failed to copy task');
      },
    );
  }

  /**
   * Copy task to today's daily note
   */
  private async copyTaskToToday(task: Task): Promise<void> {
    const todayNote = await getTodayDailyNote(this.plugin.app);
    if (!todayNote) {
      new Notice('Failed to get or create today daily note');
      return;
    }

    if (isTaskOnTodayDailyNote(task, todayNote)) {
      new Notice('Task is already on today daily note');
      return;
    }

    const allLines = await readTaskBlockFromVault(this.plugin.app, task);
    const currentContent = await this.plugin.app.vault.read(todayNote);
    const newContent =
      currentContent.trimEnd() + '\n\n' + allLines.join('\n') + '\n';
    await this.plugin.app.vault.modify(todayNote, newContent);
    new Notice('Task copied to today daily note');
  }

  /**
   * Move task to today's daily note
   */
  private async moveTaskToToday(task: Task): Promise<void> {
    const todayNote = await getTodayDailyNote(this.plugin.app);
    if (!todayNote) {
      new Notice('Failed to get or create today daily note');
      return;
    }

    if (isTaskOnTodayDailyNote(task, todayNote)) {
      new Notice('Task is already on today daily note');
      return;
    }

    const allLines = await readTaskBlockFromVault(this.plugin.app, task);

    const todayContent = await this.plugin.app.vault.read(todayNote);
    const newTodayContent =
      todayContent.trimEnd() + '\n\n' + allLines.join('\n') + '\n';
    await this.plugin.app.vault.modify(todayNote, newTodayContent);

    const sourceFile = this.plugin.app.vault.getAbstractFileByPath(task.path);
    if (!(sourceFile instanceof TFile)) {
      new Notice('Failed to find source file');
      return;
    }

    const sourceContent = await this.plugin.app.vault.read(sourceFile);
    const sourceLines = sourceContent.split('\n');
    const { start, end } = getTaskRemovalRange(sourceLines, task);
    const newSourceLines = [
      ...sourceLines.slice(0, start),
      ...sourceLines.slice(end + 1),
    ];
    await this.plugin.app.vault.modify(sourceFile, newSourceLines.join('\n'));
    new Notice('Task moved to today daily note');
  }

  /**
   * Migrate task to today's daily note
   * Copies the task to today's daily note and updates the source task
   * to the migrated state keyword.
   */
  private async migrateTaskToToday(task: Task): Promise<void> {
    const todayNote = await getTodayDailyNote(this.plugin.app);
    if (!todayNote) {
      new Notice('Failed to get or create today daily note');
      return;
    }

    if (isTaskOnTodayDailyNote(task, todayNote)) {
      new Notice('Task is already on today daily note');
      return;
    }

    const allLines = await readTaskBlockFromVault(this.plugin.app, task);

    const todayContent = await this.plugin.app.vault.read(todayNote);
    const newTodayContent =
      todayContent.trimEnd() + '\n\n' + allLines.join('\n') + '\n';
    await this.plugin.app.vault.modify(todayNote, newTodayContent);

    const sourceFile = this.plugin.app.vault.getAbstractFileByPath(task.path);
    if (!(sourceFile instanceof TFile)) {
      new Notice('Failed to find source file');
      return;
    }

    const sourceContent = await this.plugin.app.vault.read(sourceFile);
    const sourceLines = sourceContent.split('\n');
    const migrateState = this.plugin.settings.migrateToTodayState;
    const taskKeyword = task.state || 'TODO';
    const modified = modifyLinesForMigration(
      sourceLines,
      task.line,
      taskKeyword,
      migrateState,
    );
    await this.plugin.app.vault.modify(sourceFile, modified.join('\n'));
    new Notice('Task migrated to today daily note');
  }

  /**
   * Handle priority change from context menu
   * Uses TaskUpdateCoordinator for optimistic UI updates
   */
  private async handlePriorityChange(
    task: Task,
    priority: 'high' | 'med' | 'low' | null,
  ): Promise<void> {
    // Get the TaskUpdateCoordinator from the plugin (same pattern as main task list)
    const plugin = (
      window as unknown as {
        todoSeqPlugin?: {
          taskUpdateCoordinator?: {
            updateTaskPriority: (
              task: Task,
              priority: 'high' | 'med' | 'low' | null,
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
      // Get the current task from state manager to ensure we have the latest data
      // The task parameter might be stale if the task was updated previously
      const currentTask = this.plugin.taskStateManager.findTaskByPathAndLine(
        task.path,
        task.line,
      );
      if (!currentTask) {
        console.error('TODOseq: Task not found in state manager');
        return;
      }

      // Use TaskUpdateCoordinator for optimistic UI updates
      await plugin.taskUpdateCoordinator.updateTaskPriority(
        currentTask,
        priority,
      );
    } catch (error) {
      console.error('TODOseq: Failed to update task priority:', error);
    }
  }

  /**
   * Handle scheduled date change from context menu
   * Uses TaskUpdateCoordinator for optimistic UI updates
   */
  private async handleScheduledDateChange(
    task: Task,
    date: Date | null,
    repeat?: DateRepeatInfo | null,
  ): Promise<void> {
    try {
      // Use TaskUpdateCoordinator for optimistic UI updates
      await this.plugin.taskUpdateCoordinator?.updateTaskScheduledDate(
        task,
        date,
        repeat,
      );
    } catch (error) {
      console.error('TODOseq: Failed to update scheduled date:', error);
    }
  }

  /**
   * Handle deadline date change from context menu
   * Uses TaskUpdateCoordinator for optimistic UI updates
   */
  private async handleDeadlineDateChange(
    task: Task,
    date: Date | null,
    repeat?: DateRepeatInfo | null,
  ): Promise<void> {
    try {
      // Use TaskUpdateCoordinator for optimistic UI updates
      await this.plugin.taskUpdateCoordinator?.updateTaskDeadlineDate(
        task,
        date,
        repeat,
      );
    } catch (error) {
      console.error('TODOseq: Failed to update deadline date:', error);
    }
  }

  /**
   * Render a task list within the given container element
   * @param container The container element to render into
   * @param tasks Tasks to render
   * @param params Code block parameters for context
   * @param totalTasksCount Total number of tasks before applying limit
   * @param isCollapsed Current collapse state (for collapsible lists)
   * @param toggleCollapse Callback to toggle collapse state
   * @param containerId Unique ID for this code block (used for toggle callback)
   */
  renderTaskList(
    container: HTMLElement,
    tasks: Task[],
    params: TodoseqParameters,
    totalTasksCount?: number,
    isCollapsed?: boolean,
    toggleCollapse?: (containerId: string) => void,
    containerId?: string,
  ): void {
    // Handle collapsible mode with incremental updates to prevent flicker
    if (params.collapse) {
      const hasTitle = !!params.title;
      const taskListContainer = container.querySelector(
        '.todoseq-embedded-task-list-container',
      ) as HTMLElement | null;

      // Check if we can do an incremental update (container exists with correct structure)
      if (taskListContainer) {
        // Incremental update - keep header, just update state and content
        this.updateCollapsibleList(
          taskListContainer,
          tasks,
          params,
          isCollapsed ?? true,
          totalTasksCount,
          hasTitle,
          toggleCollapse,
          containerId,
        );
        return;
      }

      // Full render needed - clear and rebuild
      container.empty();

      // Create task list container
      const newContainer = container.createEl('div', {
        cls: 'todoseq-embedded-task-list-container',
      });

      // Add collapse state class
      newContainer.addClass(
        isCollapsed
          ? 'todoseq-embedded-task-list-collapsed'
          : 'todoseq-embedded-task-list-expanded',
      );

      if (hasTitle) {
        // When title is set: render title row as collapsible toggle
        this.renderCollapsibleTitle(
          newContainer,
          params,
          isCollapsed ?? true,
          totalTasksCount ?? tasks.length,
          toggleCollapse,
          containerId,
        );
      } else {
        // When no title: render a consistent header that serves as toggle
        this.renderCollapsibleHeaderNoTitle(
          newContainer,
          params,
          isCollapsed ?? true,
          totalTasksCount ?? tasks.length,
          toggleCollapse,
          containerId,
        );
      }

      if (isCollapsed) {
        // Render collapsed footer with total result count
        this.renderCollapsedFooter(newContainer, tasks.length, totalTasksCount);
      } else {
        // Render expanded content
        if (hasTitle) {
          // For title case: include search settings header (no toggle params)
          // Pass renderHeader=true to show search options below the title
          this.renderExpandedContent(
            newContainer,
            tasks,
            params,
            totalTasksCount,
            undefined,
            undefined,
            isCollapsed,
            true, // Render search options header when expanded with title
          );
        } else {
          // For no-title case: header already exists, just add task list to avoid flicker
          this.renderExpandedContent(
            newContainer,
            tasks,
            params,
            totalTasksCount,
            toggleCollapse,
            containerId,
            isCollapsed,
            false, // Don't render header - it already exists
          );
        }
      }
    } else {
      // Standard non-collapsible rendering - always full render
      container.empty();

      // Create task list container
      const taskListContainer = container.createEl('div', {
        cls: 'todoseq-embedded-task-list-container',
      });

      this.renderStandardContent(
        taskListContainer,
        tasks,
        params,
        totalTasksCount,
      );
    }
  }

  /**
   * Update an existing collapsible list without full re-render
   * This prevents flicker by keeping the header in place
   */
  private updateCollapsibleList(
    container: HTMLElement,
    tasks: Task[],
    params: TodoseqParameters,
    isCollapsed: boolean,
    totalTasksCount?: number,
    hasTitle?: boolean,
    toggleCollapse?: (containerId: string) => void,
    containerId?: string,
  ): void {
    // Update collapse state class
    container.removeClass('todoseq-embedded-task-list-collapsed');
    container.removeClass('todoseq-embedded-task-list-expanded');
    container.addClass(
      isCollapsed
        ? 'todoseq-embedded-task-list-collapsed'
        : 'todoseq-embedded-task-list-expanded',
    );

    // Update chevron direction in header
    const chevronSpan = container.querySelector(
      '.todoseq-collapse-toggle-icon',
    );
    if (chevronSpan) {
      if (isCollapsed) {
        chevronSpan.removeClass('is-expanded');
      } else {
        chevronSpan.addClass('is-expanded');
      }
    }

    // Update aria-expanded on header/title
    const headerEl = container.querySelector('[role="button"][aria-expanded]');
    if (headerEl) {
      headerEl.setAttribute('aria-expanded', String(!isCollapsed));
    }

    // Remove old content elements (footer, task list, truncated indicator, empty state)
    const oldFooter = container.querySelector('.todoseq-result-count-footer');
    const oldTaskList = container.querySelector('.todoseq-embedded-task-list');
    const oldTruncated = container.querySelector(
      '.todoseq-embedded-task-list-truncated',
    );
    const oldEmpty = container.querySelector(
      '.todoseq-embedded-task-list-empty',
    );
    const oldHeader = container.querySelector(
      '.todoseq-embedded-task-list-header',
    );

    if (oldFooter) oldFooter.remove();
    if (oldTaskList) oldTaskList.remove();
    if (oldTruncated) oldTruncated.remove();
    if (oldEmpty) oldEmpty.remove();
    // Remove old header when hasTitle is true (title case) to prevent duplicates
    if (hasTitle && oldHeader) oldHeader.remove();

    // Render new content based on state
    if (isCollapsed) {
      this.renderCollapsedFooter(container, tasks.length, totalTasksCount);
    } else {
      // Render expanded content
      if (hasTitle) {
        // For title case: include search settings header (no toggle params)
        // Pass renderHeader=true to show search options below the title
        this.renderExpandedContent(
          container,
          tasks,
          params,
          totalTasksCount,
          undefined,
          undefined,
          isCollapsed,
          true, // Render search options header when expanded with title
        );
      } else {
        // For no-title case: header already exists, just add task list to avoid flicker
        this.renderExpandedContent(
          container,
          tasks,
          params,
          totalTasksCount,
          toggleCollapse, // Pass toggle params to make header interactive
          containerId,
          isCollapsed,
          false, // Don't render header - it already exists
        );
      }
    }
  }

  /**
   * Render the title row as a collapsible toggle
   * Uses the existing todoseq-embedded-task-list-title element with chevron icon
   */
  private renderCollapsibleTitle(
    container: HTMLElement,
    params: TodoseqParameters,
    isCollapsed: boolean,
    taskCount: number,
    toggleCollapse?: (containerId: string) => void,
    containerId?: string,
  ): HTMLElement {
    const titleEl = container.createEl('div', {
      cls: 'todoseq-embedded-task-list-title',
      text: params.title,
      attr: {
        role: 'button',
        tabindex: '0',
        'aria-expanded': String(!isCollapsed),
        'aria-label': isCollapsed
          ? `Expand task list, ${taskCount} tasks`
          : 'Collapse task list',
      },
    });

    // Add click handler if toggle function is provided
    if (toggleCollapse && containerId) {
      titleEl.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleCollapse(containerId);
      });

      // Keyboard handler for accessibility
      titleEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          toggleCollapse(containerId);
        }
      });
    }

    // Create chevron icon container inside the title element
    const chevronSpan = titleEl.createEl('span', {
      cls: 'todoseq-collapse-toggle-icon',
    });
    setIcon(chevronSpan, 'chevron-right');
    if (!isCollapsed) {
      chevronSpan.addClass('is-expanded');
    }

    return titleEl;
  }

  /**
   * Render a compact query summary for the collapsible header
   */
  private renderQuerySummary(
    header: HTMLElement,
    params: TodoseqParameters,
  ): void {
    const parts: string[] = [];
    if (params.searchQuery) {
      parts.push(params.searchQuery);
    }
    if (params.sortMethod !== 'default') {
      parts.push(`sort: ${params.sortMethod}`);
    }

    if (parts.length > 0) {
      header.createEl('span', {
        cls: 'todoseq-query-summary',
        text: parts.join(' • '),
      });
    } else {
      // Default text when no query is specified
      header.createEl('span', {
        cls: 'todoseq-query-summary',
        text: 'All tasks',
      });
    }
  }

  /**
   * Render a collapsible header when no title is set
   * This header stays in place for both collapsed and expanded states,
   * preventing flicker on toggle by maintaining consistent DOM structure.
   */
  private renderCollapsibleHeaderNoTitle(
    container: HTMLElement,
    params: TodoseqParameters,
    isCollapsed: boolean,
    taskCount: number,
    toggleCollapse?: (containerId: string) => void,
    containerId?: string,
  ): HTMLElement {
    const header = container.createEl('div', {
      cls: 'todoseq-embedded-task-list-header',
      attr: {
        role: 'button',
        tabindex: '0',
        'aria-expanded': String(!isCollapsed),
        'aria-label': isCollapsed
          ? `Expand task list, ${taskCount} tasks`
          : 'Collapse task list',
      },
    });

    // Add click handler if toggle function is provided
    if (toggleCollapse && containerId) {
      header.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleCollapse(containerId);
      });

      // Keyboard handler for accessibility
      header.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          toggleCollapse(containerId);
        }
      });
    }

    // Show search query using the same format for both states
    if (params.showQuery !== false && params.searchQuery) {
      header.createEl('span', {
        cls: 'todoseq-embedded-task-list-search',
        text: `Search: ${params.searchQuery}`,
      });
    }

    // Show sort method if specified
    if (params.sortMethod !== 'default') {
      header.createEl('span', {
        cls: 'todoseq-embedded-task-list-sort',
        text: `Sort: ${params.sortMethod}`,
      });
    }

    // Show completed filter if specified
    if (params.completed !== undefined) {
      header.createEl('span', {
        cls: 'todoseq-embedded-task-list-completed',
        text: `Completed: ${params.completed}`,
      });
    }

    // Show future filter if specified
    if (params.future !== undefined) {
      header.createEl('span', {
        cls: 'todoseq-embedded-task-list-future',
        text: `Future: ${params.future}`,
      });
    }

    // Show limit if specified
    if (params.limit !== undefined) {
      header.createEl('span', {
        cls: 'todoseq-embedded-task-list-limit',
        text: `Limit: ${params.limit}`,
      });
    }

    // Create chevron icon container after the header content
    const chevronSpan = header.createEl('span', {
      cls: 'todoseq-collapse-toggle-icon',
    });
    setIcon(chevronSpan, 'chevron-right');
    // Add is-expanded class when expanded
    if (!isCollapsed) {
      chevronSpan.addClass('is-expanded');
    }

    return header;
  }

  /**
   * Render just the task list (without header) for expanded collapsible mode
   * The header is already rendered separately to maintain consistent DOM structure
   */
  private renderExpandedTaskList(
    container: HTMLElement,
    tasks: Task[],
    params: TodoseqParameters,
    totalTasksCount?: number,
  ): void {
    // Create task list
    const taskList = container.createEl('ul', {
      cls: 'todoseq-embedded-task-list',
    });

    // Render each task
    tasks.forEach((task, index) => {
      const taskItem = this.createTaskListItem(task, index, params);
      taskList.appendChild(taskItem);
    });

    // Add truncated indicator if results were limited
    if (
      params.limit &&
      totalTasksCount !== undefined &&
      totalTasksCount > params.limit
    ) {
      const truncatedIndicator = container.createEl('div', {
        cls: 'todoseq-embedded-task-list-truncated',
      });
      const moreTasksCount = totalTasksCount - params.limit;
      truncatedIndicator.textContent = `${moreTasksCount} more task${moreTasksCount > 1 ? 's' : ''} not shown`;
    }

    // Add empty state if no tasks
    if (tasks.length === 0) {
      this.renderEmptyState(container);
    }
  }

  /**
   * Render the collapsed footer showing result count
   */
  private renderCollapsedFooter(
    container: HTMLElement,
    taskCount: number,
    totalTasksCount?: number,
  ): void {
    const count = totalTasksCount ?? taskCount;
    const footer = container.createEl('div', {
      cls: 'todoseq-result-count-footer',
    });
    footer.textContent = `${count} matching task${count !== 1 ? 's' : ''}`;
  }

  /**
   * Check if the parameters contain any header content to display.
   * This includes search query, sort method, completed filter, future filter, or limit.
   */
  private hasHeaderContent(params: TodoseqParameters): boolean {
    const showQueryHeader = params.showQuery !== false;
    return (
      showQueryHeader &&
      !!(
        params.searchQuery ||
        params.sortMethod !== 'default' ||
        params.completed !== undefined ||
        params.future !== undefined ||
        params.limit !== undefined
      )
    );
  }

  /**
   * Render the header content spans (search, sort, completed, future, limit) into a header element.
   * This is shared between static and toggle headers.
   */
  private renderHeaderContentSpans(
    header: HTMLElement,
    params: TodoseqParameters,
  ): void {
    if (params.searchQuery) {
      header.createEl('span', {
        cls: 'todoseq-embedded-task-list-search',
        text: `Search: ${params.searchQuery}`,
      });
    }

    if (params.sortMethod !== 'default') {
      header.createEl('span', {
        cls: 'todoseq-embedded-task-list-sort',
        text: `Sort: ${params.sortMethod}`,
      });
    }

    if (params.completed !== undefined) {
      header.createEl('span', {
        cls: 'todoseq-embedded-task-list-completed',
        text: `Completed: ${params.completed}`,
      });
    }

    if (params.future !== undefined) {
      header.createEl('span', {
        cls: 'todoseq-embedded-task-list-future',
        text: `Future: ${params.future}`,
      });
    }

    if (params.limit !== undefined) {
      header.createEl('span', {
        cls: 'todoseq-embedded-task-list-limit',
        text: `Limit: ${params.limit}`,
      });
    }
  }

  /**
   * Render a static (non-toggle) header with query information.
   * Used for standard content and expanded title mode.
   */
  private renderStaticHeader(
    container: HTMLElement,
    params: TodoseqParameters,
  ): void {
    const header = container.createEl('div', {
      cls: 'todoseq-embedded-task-list-header',
    });
    this.renderHeaderContentSpans(header, params);
  }

  /**
   * Render a toggle header that can collapse/expand the task list.
   * Used for collapsible lists without a title.
   */
  private renderToggleHeader(
    container: HTMLElement,
    params: TodoseqParameters,
    toggleCollapse: (containerId: string) => void,
    containerId: string,
    isCollapsed: boolean,
  ): void {
    const header = container.createEl('div', {
      cls: 'todoseq-embedded-task-list-header',
      attr: {
        role: 'button',
        tabindex: '0',
        'aria-expanded': String(!isCollapsed),
        'aria-label': 'Collapse task list',
      },
    });

    header.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleCollapse(containerId);
    });

    header.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggleCollapse(containerId);
      }
    });

    this.renderHeaderContentSpans(header, params);

    // Add chevron icon for toggle functionality
    const chevronSpan = header.createEl('span', {
      cls: 'todoseq-collapse-toggle-icon',
    });
    setIcon(chevronSpan, 'chevron-right');
    // Expanded state - add is-expanded class
    chevronSpan.addClass('is-expanded');
  }

  /**
   * Render expanded content (standard task list content)
   * @param toggleCollapse When provided, adds toggle functionality to the header (for no-title collapsible lists)
   * @param containerId Container ID for toggle callback
   * @param isCollapsed Current collapse state (used for chevron direction)
   * @param renderHeader When true, renders the header; when false, assumes header already exists
   */
  private renderExpandedContent(
    container: HTMLElement,
    tasks: Task[],
    params: TodoseqParameters,
    totalTasksCount?: number,
    toggleCollapse?: (containerId: string) => void,
    containerId?: string,
    isCollapsed?: boolean,
    renderHeader?: boolean,
  ): void {
    // Render header only when explicitly requested and there's content or toggle capability
    // When renderHeader=false, existing header is preserved to prevent flicker
    if (renderHeader) {
      const hasContent = this.hasHeaderContent(params);
      const isToggleMode =
        toggleCollapse && containerId && isCollapsed !== undefined;

      if (isToggleMode) {
        // Toggle header: always render when in toggle mode (even without content)
        // This ensures the collapse/expand functionality is available
        this.renderToggleHeader(
          container,
          params,
          toggleCollapse,
          containerId,
          isCollapsed,
        );
      } else if (hasContent) {
        // Static header: only render when there's actual content to display
        this.renderStaticHeader(container, params);
      }
    }

    // Create task list
    const taskList = container.createEl('ul', {
      cls: 'todoseq-embedded-task-list',
    });

    // Render each task
    tasks.forEach((task, index) => {
      const taskItem = this.createTaskListItem(task, index, params);
      taskList.appendChild(taskItem);
    });

    // Add truncated indicator if results were limited
    if (
      params.limit &&
      totalTasksCount !== undefined &&
      totalTasksCount > params.limit
    ) {
      const truncatedIndicator = container.createEl('div', {
        cls: 'todoseq-embedded-task-list-truncated',
      });
      const moreTasksCount = totalTasksCount - params.limit;
      truncatedIndicator.textContent = `${moreTasksCount} more task${moreTasksCount > 1 ? 's' : ''} not shown`;
    }

    // Add empty state if no tasks
    if (tasks.length === 0) {
      this.renderEmptyState(container);
    }
  }

  /**
   * Render standard non-collapsible content
   */
  private renderStandardContent(
    container: HTMLElement,
    tasks: Task[],
    params: TodoseqParameters,
    totalTasksCount?: number,
  ): void {
    // Add title if provided
    if (params.title) {
      container.createEl('div', {
        cls: 'todoseq-embedded-task-list-title',
        text: params.title,
      });
    }

    // Add header with search/sort info using shared helper
    const hasContent = this.hasHeaderContent(params);
    if (hasContent) {
      this.renderStaticHeader(container, params);
    }

    // Add bottom border to title if there's no header and no task list border will be added
    if (params.title && !hasContent) {
      const titleEl = container.querySelector(
        '.todoseq-embedded-task-list-title',
      );
      if (titleEl) {
        titleEl.addClass('todoseq-embedded-task-list-title-bordered');
      }
    }

    // Create task list
    const taskList = container.createEl('ul', {
      cls: 'todoseq-embedded-task-list',
    });

    // Render each task
    tasks.forEach((task, index) => {
      const taskItem = this.createTaskListItem(task, index, params);
      taskList.appendChild(taskItem);
    });

    // Add truncated indicator if results were limited
    if (
      params.limit &&
      totalTasksCount !== undefined &&
      totalTasksCount > params.limit
    ) {
      const truncatedIndicator = container.createEl('div', {
        cls: 'todoseq-embedded-task-list-truncated',
      });
      const moreTasksCount = totalTasksCount - params.limit;
      truncatedIndicator.textContent = `${moreTasksCount} more task${moreTasksCount > 1 ? 's' : ''} not shown`;
    }

    // Add empty state if no tasks
    if (tasks.length === 0) {
      this.renderEmptyState(container);
    }
  }

  /**
   * Render empty state message
   */
  private renderEmptyState(container: HTMLElement): void {
    const emptyState = container.createEl('div', {
      cls: 'todoseq-embedded-task-list-empty',
    });

    // Check if we should show scanning message
    // This includes both plugin scanning and Obsidian's internal index building
    const isScanning =
      this.plugin.vaultScanner?.shouldShowScanningMessage() ?? false;

    // Check if we're in initial load state (before first scan has started)
    // This prevents "No tasks found" from flashing before the scan begins
    const allTasks = this.plugin.vaultScanner?.getTasks() ?? [];
    const isInitialLoad = !isScanning && allTasks.length === 0;

    if (isScanning || isInitialLoad) {
      emptyState.createEl('div', {
        cls: 'todoseq-embedded-task-list-empty-title',
        text: isScanning ? 'Scanning vault...' : 'Loading tasks...',
      });
      emptyState.createEl('div', {
        cls: 'todoseq-embedded-task-list-empty-subtitle',
        text: isScanning
          ? 'Please wait while your tasks are being indexed'
          : 'Please wait while your vault is being indexed',
      });
    } else {
      emptyState.createEl('div', {
        cls: 'todoseq-embedded-task-list-empty-title',
        text: 'No tasks found',
      });
      emptyState.createEl('div', {
        cls: 'todoseq-embedded-task-list-empty-subtitle',
        text: 'Try adjusting your search or sort parameters',
      });
    }
  }

  // Render Obsidian-style links and tags as non-clickable, styled spans inside task text.
  // Supports:
  //  - Wiki links: [[Note]] and [[Note|Alias]]
  //  - Markdown links: [Alias](url-or-path)
  //  - Bare URLs: http(s)://...
  //  - Tags: #tag
  // Render task text with links, using lazy-computed textDisplay
  private renderTaskTextWithLinks(task: Task, parent: HTMLElement) {
    // Use lazy-computed textDisplay for better performance
    const textToProcess = getTaskTextDisplay(task);
    const patterns: { type: 'wiki' | 'md' | 'url' | 'tag'; regex: RegExp }[] = [
      // [[Page]] or [[Page|Alias]]
      { type: 'wiki', regex: /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g },
      // [Alias](target) - improved regex to handle brackets in link text
      { type: 'md', regex: /\[([^\]]*(?:\[[^\]]*\][^\]]*)*)\]\(([^)]+)\)/g },
      // bare URLs
      { type: 'url', regex: /\bhttps?:\/\/[^\s)]+/g },
      // #tags (must come after URLs to avoid conflicts with URLs containing #)
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
        // Append any remaining text
        parent.appendText(textToProcess.slice(i));
        break;
      }

      // Append plain text preceding the match
      if (nextMatch.match.index > i) {
        parent.appendText(textToProcess.slice(i, nextMatch.match.index));
      }

      // Create appropriate styled element based on type
      if (nextMatch.type === 'tag') {
        // Create a tag-like span using our custom tag styling
        const span = parent.createEl('span', {
          cls: 'todoseq-embedded-task-tag',
        });
        const tagName = nextMatch.match[0]; // Full #tag text including #
        span.setText(tagName);
        span.setAttribute('title', tagName);
      } else {
        // Create a non-interactive, link-like span for other types
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

      // Advance past the match
      i = nextMatch.match.index + nextMatch.match[0].length;
    }
  }

  /**
   * Determine the date category for a task based on its scheduled and deadline dates
   * @param task The task to analyze
   * @returns Date category: 'overdue', 'today', 'soon', 'later', or 'none'
   */
  private getDateCategory(
    task: Task,
  ): 'overdue' | 'today' | 'soon' | 'later' | 'none' {
    const now = new Date();
    const today = this.getDateOnly(now);

    // Get the earliest date if both exist, or the single available date
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

    // If no dates, return 'none'
    if (!targetDate) {
      return 'none';
    }

    const target = this.getDateOnly(targetDate);

    // Check if overdue (before today)
    if (target < today) {
      return 'overdue';
    }

    // Check if due today
    if (target.getTime() === today.getTime()) {
      return 'today';
    }

    // Check if due soon (within next 7 days)
    const soonDate = this.getDateOnly(
      new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
    );
    if (target <= soonDate) {
      return 'soon';
    }

    // Otherwise, it's later
    return 'later';
  }

  /**
   * Get date only (time part set to 00:00:00.000)
   * @param date The date to normalize
   * @returns A new Date object at midnight of the same day
   */
  private getDateOnly(date: Date): Date {
    return DateUtils.getDateOnly(date);
  }

  private buildDateBadge(
    date: Date,
    iconName: 'calendar' | 'calendar-clock' | 'calendar-range' | 'target',
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
    if (task.completed) return;
    const showScheduled = params.showScheduledDate === true;
    const showDeadline = params.showDeadlineDate === true;
    if (!showScheduled && !showDeadline) return;

    if (showScheduled && task.scheduledDate) {
      this.buildDateBadge(task.scheduledDate, 'calendar', parent);
    }
    if (showDeadline && task.deadlineDate) {
      this.buildDateBadge(task.deadlineDate, 'target', parent);
    }
  }

  private buildWrapDateInfoRows(
    task: Task,
    params: TodoseqParameters,
    parent: HTMLElement,
    extraCls?: string,
  ): void {
    if (task.completed) return;
    const showScheduled = params.showScheduledDate === true;
    const showDeadline = params.showDeadlineDate === true;
    if (!showScheduled && !showDeadline) return;

    if (showScheduled && task.scheduledDate) {
      this.buildDateInfoRow('Scheduled', task.scheduledDate, parent, extraCls);
    }
    if (showDeadline && task.deadlineDate) {
      this.buildDateInfoRow('Deadline', task.deadlineDate, parent, extraCls);
    }
  }

  /**
   * Build repeat icon element for a task (only the icon, no date labels/values)
   * Shows the repeat icon at the end of the task details line
   * @param task The task to display repeat icon for
   * @param parent The parent element to append to
   */
  buildRepeatIcon(task: Task, parent: HTMLElement): void {
    // Check if there's any repeat (from scheduled or deadline)
    const scheduledRepeat = task.scheduledDateRepeat;
    const deadlineRepeat = task.deadlineDateRepeat;

    if (!scheduledRepeat && !deadlineRepeat) {
      return;
    }

    // Use the first available repeat for the tooltip
    const repeatInfo = scheduledRepeat ?? deadlineRepeat;

    if (!repeatInfo) {
      return;
    }

    const repeatIcon = parent.createEl('span', {
      cls: 'todoseq-task-date-repeat-icon',
    });
    setIcon(repeatIcon, 'repeat-2');
    // Remove inline width/height to allow CSS to control size
    const svg = repeatIcon.querySelector('svg');
    if (svg) {
      svg.removeAttribute('width');
      svg.removeAttribute('height');
    }
    repeatIcon.setAttribute('title', `Repeats ${repeatInfo.raw}`);
  }

  /**
   * Create a single task list item element
   * @param task The task to render
   * @param index The index of the task in the list
   * @param params Code block parameters
   * @returns HTML list item element
   */
  private createTaskListItem(
    task: Task,
    index: number,
    params: TodoseqParameters,
  ): HTMLLIElement {
    const li = document.createElement('li');
    li.className = 'todoseq-embedded-task-item';

    // Apply date-based background styling if the task has scheduled or deadline dates AND is not completed
    const dateCategory = this.getDateCategory(task);
    if (dateCategory !== 'none' && !task.completed) {
      li.classList.add(`todoseq-embedded-task-item-date-${dateCategory}`);
    }

    li.setAttribute('data-path', task.path);
    li.setAttribute('data-line', String(task.line));
    li.setAttribute('data-index', String(index));

    // Create checkbox
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'todoseq-embedded-task-checkbox';
    checkbox.classList.add('task-list-item-checkbox');

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
    // Also set data-task on the <li> for theme compatibility.
    // Obsidian natively sets data-task on both <li> and <input>. Some themes
    // (Iridium, Velocity) target li[data-task] or [data-task] ancestor selectors.
    li.setAttribute('data-task', dataTaskChar);
    checkbox.setAttribute(
      'aria-label',
      `Toggle task: ${task.text || task.state}`,
    );

    // Create task text container
    const textContainer = document.createElement('div');
    textContainer.className = 'todoseq-embedded-task-text-container';

    // Create task state
    const stateSpan = document.createElement('span');
    stateSpan.className = 'todoseq-embedded-task-state';
    stateSpan.textContent = task.state;
    stateSpan.setAttribute('role', 'button');
    stateSpan.setAttribute('tabindex', '0');
    stateSpan.setAttribute('aria-checked', String(task.completed));

    // Right-click to open state selection menu
    stateSpan.addEventListener('contextmenu', (evt: MouseEvent) => {
      this.openStateMenuAtMouseEvent(task, evt);
    });

    // Long-press for mobile
    let touchTimer: number | null = null;
    let suppressNextContextMenu = false;

    stateSpan.addEventListener(
      'touchstart',
      (evt: TouchEvent) => {
        if (evt.touches.length !== 1) return;
        const touch = evt.touches[0];
        suppressNextContextMenu = true;
        touchTimer = window.setTimeout(() => {
          const x = touch.clientX;
          const y = touch.clientY;
          this.openStateMenuAtPosition(task, { x, y });
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

    stateSpan.addEventListener('touchend', clearTouch, { passive: true });
    stateSpan.addEventListener('touchcancel', clearTouch, { passive: true });

    // Prevent duplicate context menu on Android
    stateSpan.addEventListener('contextmenu', (evt: MouseEvent) => {
      if (suppressNextContextMenu) {
        evt.preventDefault();
        evt.stopPropagation();
        return;
      }
      this.openStateMenuAtMouseEvent(task, evt);
    });

    textContainer.appendChild(stateSpan);

    // Create priority indicator if present
    if (task.priority) {
      const pri = task.priority; // 'high' | 'med' | 'low'
      const prioritySpan = document.createElement('span');
      prioritySpan.className = [
        'todoseq-priority-badge',
        `priority-${pri}`,
      ].join(' ');
      prioritySpan.textContent =
        pri === 'high' ? 'A' : pri === 'med' ? 'B' : 'C';
      prioritySpan.setAttribute('aria-label', `Priority ${pri}`);
      prioritySpan.setAttribute('title', `Priority ${pri}`);
      textContainer.appendChild(prioritySpan);
    }

    // Create task text if present
    if (task.text) {
      const textSpan = document.createElement('span');
      textSpan.className = 'todoseq-embedded-task-text';
      if (textContainer.children.length > 0) {
        textSpan.appendText(' ');
      }
      this.renderTaskTextWithLinks(task, textSpan);
      textContainer.appendChild(textSpan);
    }

    // Handle wrap-content mode (default is 'dynamic' when not specified)
    // - undefined/missing: dynamic (responsive based on viewport)
    // - true: always wrap
    // - false: always truncate
    // - 'dynamic': responsive based on viewport
    const wrapMode = params.wrapContent ?? 'dynamic';
    const isTrueWrapMode = wrapMode === true;
    const isDynamicMode = wrapMode === 'dynamic';

    // Check if we need floating indicators (in wrap mode with subtasks or repeat)
    const hasSubtask = hasSubtasks(task);
    const hasRepeat =
      !task.completed && (task.scheduledDateRepeat || task.deadlineDateRepeat);
    const needsFloatingIndicators =
      (isTrueWrapMode || isDynamicMode) && (hasSubtask || hasRepeat);

    // Create content wrapper variable for wrap modes
    let contentWrapper: HTMLElement | null = null;
    let fileInfoRow: HTMLElement | null = null;

    if (isTrueWrapMode) {
      // Add wrap class to list item
      li.classList.add('todoseq-embedded-task-item-wrap');

      // Add wrap class to text container for CSS styling
      textContainer.classList.add('todoseq-embedded-task-text-wrap');

      // Create content wrapper for wrapped layout
      contentWrapper = document.createElement('div');
      contentWrapper.className = 'todoseq-embedded-task-content-wrapper';

      // Create a text row that holds text + floating indicators side by side
      const textRow = document.createElement('div');
      textRow.className = 'todoseq-embedded-task-text-row';

      // Append text container to text row
      textRow.appendChild(textContainer);

      // Add floating indicators to text row (before file info)
      if (needsFloatingIndicators) {
        const floatingIndicators = document.createElement('div');
        floatingIndicators.className =
          'todoseq-embedded-task-floating-indicators';

        // Add subtask indicator to floating div
        if (hasSubtask) {
          const subtaskSpan = document.createElement('span');
          subtaskSpan.className = 'todoseq-subtask-indicator';
          subtaskSpan.textContent = getSubtaskDisplayText(task);
          subtaskSpan.setAttribute(
            'title',
            `${task.subtaskCompletedCount} of ${task.subtaskCount} subtasks complete`,
          );
          floatingIndicators.appendChild(subtaskSpan);
        }

        // Add repeat icon to floating div (after subtask count if present)
        if (hasRepeat) {
          this.buildRepeatIcon(task, floatingIndicators);
        }

        textRow.appendChild(floatingIndicators);
      }

      // Append text row to content wrapper
      contentWrapper.appendChild(textRow);

      // Add date info rows for wrap mode (both dates on separate lines)
      this.buildWrapDateInfoRows(task, params, contentWrapper);

      // Handle file info and urgency display
      const urgencyValue = task.urgency;
      const showUrgency =
        params.showUrgency === true &&
        urgencyValue !== null &&
        urgencyValue !== undefined;
      const showFile = params.showFile !== false;

      if (showFile || showUrgency) {
        fileInfoRow = document.createElement('div');
        fileInfoRow.className = 'todoseq-embedded-task-file-info-row';

        if (showFile) {
          const fileInfo = document.createElement('span');
          fileInfo.className = 'todoseq-embedded-task-file-info-wrap';
          const fileName = task.path.split('/').pop() || task.path;
          const displayName = fileName.replace(/\.md$/, '');
          fileInfo.textContent = `${displayName}:${task.line + 1}`;
          fileInfo.setAttribute('title', task.path);
          fileInfoRow.appendChild(fileInfo);
        }

        if (
          showUrgency &&
          urgencyValue !== null &&
          urgencyValue !== undefined
        ) {
          const urgencyInfo = document.createElement('span');
          urgencyInfo.className = 'todoseq-embedded-task-urgency-wrap';
          urgencyInfo.textContent = `${urgencyValue.toFixed(2)}`;
          urgencyInfo.setAttribute(
            'title',
            `Urgency: ${urgencyValue.toFixed(2)}`,
          );
          fileInfoRow.appendChild(urgencyInfo);
        }

        contentWrapper.appendChild(fileInfoRow);
      }

      // Assemble the item with content wrapper
      li.appendChild(checkbox);
      li.appendChild(contentWrapper);
    } else if (isDynamicMode) {
      // Dynamic mode: truncated on wide screens, wrap on narrow
      // Use dynamic classes for media query behavior
      li.classList.add('todoseq-embedded-task-item-wrap-dynamic');
      textContainer.classList.add('todoseq-embedded-task-text-wrap-dynamic');

      // Create content wrapper (will be styled by CSS based on viewport width)
      contentWrapper = document.createElement('div');
      contentWrapper.className = 'todoseq-embedded-task-content-wrapper';

      // Create a text row that holds text + floating indicators side by side
      const textRow = document.createElement('div');
      textRow.className = 'todoseq-embedded-task-text-row';

      // Append text container to text row
      textRow.appendChild(textContainer);

      // Add floating indicators to text row (before file info)
      if (needsFloatingIndicators) {
        const floatingIndicators = document.createElement('div');
        floatingIndicators.className =
          'todoseq-embedded-task-floating-indicators';

        // Add subtask indicator to floating div
        if (hasSubtask) {
          const subtaskSpan = document.createElement('span');
          subtaskSpan.className = 'todoseq-subtask-indicator';
          subtaskSpan.textContent = getSubtaskDisplayText(task);
          subtaskSpan.setAttribute(
            'title',
            `${task.subtaskCompletedCount} of ${task.subtaskCount} subtasks complete`,
          );
          floatingIndicators.appendChild(subtaskSpan);
        }

        // Add repeat icon to floating div (after subtask count if present)
        if (hasRepeat) {
          this.buildRepeatIcon(task, floatingIndicators);
        }

        textRow.appendChild(floatingIndicators);
      }

      // Add inline date badge for dynamic mode (visible on wide screens)
      this.buildInlineDateBadge(task, params, textContainer);

      // Append text row to content wrapper
      contentWrapper.appendChild(textRow);

      // Add date info rows for dynamic mode wrap layout (visible on narrow screens)
      this.buildWrapDateInfoRows(
        task,
        params,
        contentWrapper,
        'todoseq-embedded-task-date-info-dynamic-wrap',
      );

      // Handle file info and urgency display
      const urgencyValue = task.urgency;
      const showUrgency =
        params.showUrgency === true &&
        urgencyValue !== null &&
        urgencyValue !== undefined;
      const showFile = params.showFile !== false;

      // In dynamic mode, we create both inline (wide screens) and wrapped (narrow screens) elements
      // CSS will toggle visibility based on viewport width
      if (showFile || showUrgency) {
        // Create file info row for narrow screens (wrapped)
        fileInfoRow = document.createElement('div');
        fileInfoRow.className = 'todoseq-embedded-task-file-info-row';

        if (showFile) {
          const fileInfo = document.createElement('span');
          fileInfo.className = 'todoseq-embedded-task-file-info-wrap';
          const fileName = task.path.split('/').pop() || task.path;
          const displayName = fileName.replace(/\.md$/, '');
          fileInfo.textContent = `${displayName}:${task.line + 1}`;
          fileInfo.setAttribute('title', task.path);
          fileInfoRow.appendChild(fileInfo);
        }

        if (
          showUrgency &&
          urgencyValue !== null &&
          urgencyValue !== undefined
        ) {
          const urgencyInfo = document.createElement('span');
          urgencyInfo.className = 'todoseq-embedded-task-urgency-dynamic';
          urgencyInfo.textContent = `${urgencyValue.toFixed(2)}`;
          urgencyInfo.setAttribute(
            'title',
            `Urgency: ${urgencyValue.toFixed(2)}`,
          );
          fileInfoRow.appendChild(urgencyInfo);
        }

        contentWrapper.appendChild(fileInfoRow);

        // Also create inline file info for wide screens (truncated style)
        // This is shown via CSS at >768px and hidden at <=768px
        // Add it as a sibling of textRow in contentWrapper (like wrap-content:false mode)
        if (showFile) {
          const inlineFileInfo = document.createElement('div');
          inlineFileInfo.className = 'todoseq-embedded-task-file-info';
          const fileName = task.path.split('/').pop() || task.path;
          const displayName = fileName.replace(/\.md$/, '');
          const displayText = `${displayName}:${task.line + 1}`;
          inlineFileInfo.textContent = truncateMiddle(displayText, 32);
          inlineFileInfo.setAttribute('title', task.path);
          // Add after textRow in contentWrapper
          contentWrapper.appendChild(inlineFileInfo);
        }

        // Add inline urgency for wide screens (after textRow)
        if (
          showUrgency &&
          urgencyValue !== null &&
          urgencyValue !== undefined
        ) {
          const urgencyInline = document.createElement('span');
          urgencyInline.className = 'todoseq-embedded-task-urgency';
          urgencyInline.textContent = `${urgencyValue.toFixed(2)}`;
          urgencyInline.setAttribute(
            'title',
            `Urgency: ${urgencyValue.toFixed(2)}`,
          );
          contentWrapper.appendChild(urgencyInline);
        }
      }

      // Assemble the item with content wrapper
      li.appendChild(checkbox);
      li.appendChild(contentWrapper);
    } else {
      // Default (truncated) mode
      // Create file info if show-file is not explicitly false
      if (params.showFile !== false) {
        const fileInfo = document.createElement('div');
        fileInfo.className = 'todoseq-embedded-task-file-info';
        const fileName = task.path.split('/').pop() || task.path;
        // Strip .md extension from display name
        const displayName = fileName.replace(/\.md$/, '');
        const displayText = `${displayName}:${task.line + 1}`;
        // Apply middle truncation with 32 character limit
        fileInfo.textContent = truncateMiddle(displayText, 32);
        fileInfo.setAttribute('title', task.path);

        // Assemble the item
        li.appendChild(checkbox);
        li.appendChild(textContainer);
        li.appendChild(fileInfo);

        // Show urgency value if showUrgency is enabled
        if (
          params.showUrgency === true &&
          task.urgency !== null &&
          task.urgency !== undefined
        ) {
          const urgencyInfo = document.createElement('span');
          urgencyInfo.className = 'todoseq-embedded-task-urgency';
          urgencyInfo.textContent = `${task.urgency.toFixed(2)}`;
          urgencyInfo.setAttribute(
            'title',
            `Urgency: ${task.urgency.toFixed(2)}`,
          );
          li.appendChild(urgencyInfo);
        }
      } else {
        // Assemble the item without file info
        li.appendChild(checkbox);
        li.appendChild(textContainer);

        // Show urgency value if showUrgency is enabled
        if (
          params.showUrgency === true &&
          task.urgency !== null &&
          task.urgency !== undefined
        ) {
          const urgencyInfo = document.createElement('span');
          urgencyInfo.className = 'todoseq-embedded-task-urgency';
          urgencyInfo.textContent = `${task.urgency.toFixed(2)}`;
          urgencyInfo.setAttribute(
            'title',
            `Urgency: ${task.urgency.toFixed(2)}`,
          );
          li.appendChild(urgencyInfo);
        }
      }

      // Add inline subtask indicator and repeat icon for non-wrap mode
      if (hasSubtask) {
        const subtaskSpan = document.createElement('span');
        subtaskSpan.className = 'todoseq-subtask-indicator';
        subtaskSpan.textContent = getSubtaskDisplayText(task);
        subtaskSpan.setAttribute(
          'title',
          `${task.subtaskCompletedCount} of ${task.subtaskCount} subtasks complete`,
        );
        textContainer.appendChild(subtaskSpan);
      }

      // Add inline date badge before repeat icon
      this.buildInlineDateBadge(task, params, textContainer);

      // Add repeat icon only (no date labels/values) at the end of task details
      // Shows after subtask count if present
      if (!task.completed) {
        this.buildRepeatIcon(task, textContainer);
      }
    }

    // Add event listeners
    this.addTaskEventListeners(li, checkbox, task);

    return li;
  }

  /**
   * Add event listeners to a task list item
   * @param li The list item element
   * @param checkbox The checkbox element
   * @param task The task data
   */
  private addTaskEventListeners(
    li: HTMLLIElement,
    checkbox: HTMLInputElement,
    task: Task,
  ): void {
    // Checkbox change handler
    checkbox.addEventListener('change', async (e) => {
      e.stopPropagation();

      try {
        // CRITICAL: Look up fresh task state BEFORE computing transition
        // The task object in closure may be stale after recurrence updates
        const freshTask = this.plugin.taskStateManager.findTaskByPathAndLine(
          task.path,
          task.line,
        );
        const currentTask = freshTask || task;
        const currentState = currentTask.state;

        const stateManager = new TaskStateTransitionManager(
          this.plugin.keywordManager,
          this.plugin.settings?.stateTransitions,
        );

        let newState: string | null = null;
        if (checkbox.checked) {
          newState = stateManager.getNextCompletedOrArchivedState(currentState);
        } else {
          newState = stateManager.getNextState(currentState);
          if (newState === currentState) {
            checkbox.checked = true;
            return;
          }
        }

        // If no state change, don't proceed
        if (newState === currentState) {
          return;
        }

        // Update task state using existing TaskEditor
        await this.updateTaskState(currentTask, newState);

        // Update data-task attribute to reflect new state
        const newCheckboxChar = this.plugin.keywordManager.getCheckboxState(
          newState,
          this.plugin.keywordManager.getSettings(),
        );
        checkbox.setAttribute('data-task', newCheckboxChar);
        // Also update data-task on the parent <li> for theme compatibility
        li.setAttribute('data-task', newCheckboxChar);
      } catch (error) {
        console.error('Error updating task state:', error);
        // Revert checkbox on error
        checkbox.checked = !checkbox.checked;
        // Revert data-task attribute
        const revertedChar = this.plugin.keywordManager.getCheckboxState(
          task.state,
          this.plugin.keywordManager.getSettings(),
        );
        checkbox.setAttribute('data-task', revertedChar);
        // Also revert data-task on the parent <li>
        li.setAttribute('data-task', revertedChar);
      }
    });

    // Click handler for navigation (excluding checkbox)
    li.addEventListener('click', (e) => {
      if (e.target !== checkbox) {
        this.navigateToTask(task, e);
      }
    });

    // Right-click context menu handler
    li.addEventListener('contextmenu', (evt: MouseEvent) => {
      // Don't intercept right-clicks on the checkbox or state span (they have their own menus)
      const target = evt.target;
      if (
        target === checkbox ||
        (target instanceof HTMLElement &&
          (target.hasClass('todoseq-embedded-task-state') ||
            target.closest('.todoseq-embedded-task-state') !== null))
      ) {
        return;
      }

      evt.preventDefault();
      evt.stopPropagation();
      this.taskContextMenu.showAtMouseEvent(task, evt);
    });

    // Long-press for mobile (matching main task list pattern)
    let touchTimer: number | null = null;
    let suppressNextContextMenu = false;
    let initialTouchX = 0;
    let initialTouchY = 0;
    const LONG_PRESS_MS = 450;
    const TOUCH_MOVE_THRESHOLD = 10;

    li.addEventListener(
      'touchstart',
      (evt: TouchEvent) => {
        if (evt.touches.length !== 1) return;

        // Don't intercept touches on checkbox or state span
        const target = evt.target;
        if (
          target === checkbox ||
          (target instanceof HTMLElement &&
            (target.hasClass('todoseq-embedded-task-state') ||
              target.closest('.todoseq-embedded-task-state') !== null))
        ) {
          return;
        }

        const touch = evt.touches[0];
        initialTouchX = touch.clientX;
        initialTouchY = touch.clientY;
        suppressNextContextMenu = true;
        touchTimer = window.setTimeout(() => {
          // Create a synthetic MouseEvent for positioning
          const syntheticEvt = new MouseEvent('contextmenu', {
            clientX: touch.clientX,
            clientY: touch.clientY,
            bubbles: true,
          });
          this.taskContextMenu.showAtMouseEvent(task, syntheticEvt);
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

    // Only clear the long-press timer if touch moves beyond threshold
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

    // Suppress contextmenu event after long-press on mobile
    li.addEventListener('contextmenu', (evt: MouseEvent) => {
      if (suppressNextContextMenu) {
        evt.preventDefault();
        evt.stopPropagation();
      }
    });
  }

  /**
   * Open Obsidian Menu at a specific screen position
   * @param task The task to update
   * @param pos The position to show the menu
   */
  private openStateMenuAtPosition(
    task: Task,
    pos: { x: number; y: number },
  ): void {
    const menu = this.menuBuilder.buildStateMenu(task.state, async (state) => {
      await this.updateTaskState(task, state);
    });
    menu.showAtPosition({ x: pos.x, y: pos.y });
  }

  /**
   * Open Obsidian Menu at mouse event location listing default and additional keywords (excluding current)
   * @param task The task to update
   * @param evt The mouse event
   */
  private openStateMenuAtMouseEvent(task: Task, evt: MouseEvent): void {
    evt.preventDefault();
    evt.stopPropagation();

    // Close any active dialog (task context menu, date picker, etc.)
    BaseDialog.closeAnyActiveDialog();

    const menu = this.menuBuilder.buildStateMenu(task.state, async (state) => {
      await this.updateTaskState(task, state);
    });

    // Prefer API helper when available; fallback to explicit coordinates
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
   * Update task state with proper error handling
   * @param task The task to update
   * @param newState The new state
   */
  private async updateTaskState(task: Task, newState: string): Promise<void> {
    try {
      // Use unified updateTaskByPath method - handles fresh lookup, optimistic update,
      // file write, recurrence, line adjustment, and UI refresh
      if (this.plugin.taskUpdateCoordinator) {
        await this.plugin.taskUpdateCoordinator.updateTaskByPath(
          task.path,
          task.line,
          newState,
          'embedded',
        );
      } else if (this.plugin.taskEditor) {
        // Fallback to TaskEditor if coordinator not available
        await this.plugin.taskEditor.updateTaskState(task, newState, true);
      }
    } catch (error) {
      console.error('Error updating task state:', error);
    }
  }

  /**
   * Navigate to the task's location in the vault with smart tab management
   * @param task The task to navigate to
   * @param evt The mouse event to determine click behavior
   */
  private navigateToTask(task: Task, evt?: MouseEvent): void {
    try {
      const { workspace } = this.plugin.app;
      const isMac = Platform.isMacOS;
      const isMiddle = evt?.button === 1;
      const metaOrCtrl = isMac ? evt?.metaKey : evt?.ctrlKey;

      const file = this.plugin.app.vault.getAbstractFileByPath(task.path);
      if (!(file instanceof TFile)) return;

      // Helper functions
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

      // Shift-click: Always open new tab in split pane, even if already open
      if (doSplit) {
        targetLeaf = workspace.getLeaf('split');
        // For shift-click, we should ALWAYS use the split leaf, even if it's not perfect
        // Don't fall back to existing leaves - this ensures the page opens in the split
      }
      // Cmd/Ctrl-click: Always open new tab, even if page is already open
      else if (forceNewTab) {
        targetLeaf = workspace.getLeaf('tab');
        // For cmd/ctrl-click, we should ALWAYS use the new tab, even if it's not perfect
        // Don't fall back to existing leaves - this ensures the page opens in the new tab
      }
      // Default click: Order of preference
      // 1. Bring page into focus if already open
      // 2. Reuse existing open tab to display new page
      // 3. Open in current active tab if it's markdown
      // 4. Open new tab if no pages already open
      else {
        const currentActiveLeaf = workspace.activeLeaf;
        const isCurrentActiveMarkdown =
          currentActiveLeaf && isMarkdownLeaf(currentActiveLeaf);

        // Priority 1: If file is already open, focus it
        const existingLeafForFile = findExistingLeafForFile();
        if (existingLeafForFile) {
          targetLeaf = existingLeafForFile;
        }
        // Priority 2: Reuse existing markdown leaf (any leaf, not just same file)
        else {
          const allLeaves = workspace.getLeavesOfType('markdown');
          for (const leaf of allLeaves) {
            if (isMarkdownLeaf(leaf) && !isTodoSeqLeaf(leaf)) {
              targetLeaf = leaf;
              break;
            }
          }
          // Priority 3: If current active tab is markdown, use it
          if (!targetLeaf && isCurrentActiveMarkdown) {
            targetLeaf = currentActiveLeaf;
          }
          // Priority 4: Create new tab
          if (!targetLeaf) {
            targetLeaf = workspace.getLeaf('tab');
            // Guard against TODOseq leaf
            if (isTodoSeqLeaf(targetLeaf)) {
              const allLeaves = workspace.getLeavesOfType('markdown');
              for (const leaf of allLeaves) {
                if (isMarkdownLeaf(leaf) && !isTodoSeqLeaf(leaf)) {
                  targetLeaf = leaf;
                  break;
                }
              }
              // If still no good leaf, create regular tab
              if (isTodoSeqLeaf(targetLeaf) || !isMarkdownLeaf(targetLeaf)) {
                targetLeaf = workspace.getLeaf('tab');
              }
            }
          }
        }
      }

      // Open the file in the target leaf
      targetLeaf.openFile(file).then(() => {
        // Focus the editor and move cursor to the task line with highlighting
        setTimeout(() => {
          // Check the view in the target leaf, not the active view
          // This prevents highlighting the wrong file when Obsidian doesn't support
          // certain file types (e.g., .org files)
          const leafView = targetLeaf?.view;
          if (
            !leafView ||
            !(leafView instanceof MarkdownView) ||
            !leafView.editor
          ) {
            console.debug(
              `TaskListRenderer: No valid MarkdownView in leaf - leafView: ${leafView}, is MarkdownView: ${leafView instanceof MarkdownView}, has editor: ${(leafView as MarkdownView).editor ? 'yes' : 'no'}`,
            );
            return;
          }

          // Check if the correct file was successfully opened before navigation
          // This prevents navigation to invalid pages when Obsidian doesn't support
          // certain file types (e.g., .org files)
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

          // Set cursor position
          leafView.editor.setCursor(pos);

          // Try to set ephemeral state for better navigation
          try {
            (
              leafView as MarkdownView & {
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

          // Scroll into view with highlighting
          leafView.editor.scrollIntoView({ from: pos, to: pos }, true);

          // Focus the editor
          leafView.editor.focus();

          // Reveal the leaf to ensure proper focus
          if (targetLeaf) {
            workspace.revealLeaf(targetLeaf);
          }
        }, 100);
      });
    } catch (error) {
      console.error('Error navigating to task:', error);
    }
  }

  /**
   * Render an error message in the container
   * @param container The container element
   * @param errorMessage The error message to display
   */
  renderError(container: HTMLElement, errorMessage: string): void {
    container.empty();

    const errorContainer = container.createEl('div', {
      cls: 'todoseq-embedded-task-list-error',
    });

    errorContainer.createEl('div', {
      cls: 'todoseq-embedded-task-list-error-title',
      text: 'Error rendering task list',
    });

    errorContainer.createEl('div', {
      cls: 'todoseq-embedded-task-list-error-message',
      text: errorMessage,
    });

    errorContainer.createEl('div', {
      cls: 'todoseq-embedded-task-list-error-help',
      text: 'Check your search and sort parameters for syntax errors.',
    });
  }

  /**
   * Update settings - no longer need to refresh menu builder since it now directly accesses the plugin's keyword manager
   */
  public updateSettings(): void {
    // Menu builder now directly accesses the plugin's keyword manager, so no need to recreate it
    // Update context menu configuration
    if (this.taskContextMenu) {
      this.taskContextMenu.updateConfig({
        weekStartsOn: this.plugin.settings.weekStartsOn,
        migrateToTodayState: this.plugin.settings.migrateToTodayState,
      });
    }
  }
}
