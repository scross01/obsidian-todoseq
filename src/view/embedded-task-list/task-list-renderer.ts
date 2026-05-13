import { Task, DateRepeatInfo } from '../../types/task';
import TodoTracker from '../../main';
import { TodoseqParameters } from './code-block-parser';
import { TFile, setIcon, Notice } from 'obsidian';
import { StateMenuBuilder } from '../components/state-menu-builder';
import { TaskContextMenu } from '../components/task-context-menu';
import {
  getTodayDailyNote,
  isTaskOnTodayDailyNote,
} from '../../utils/daily-note-utils';
import {
  getTaskRemovalRange,
  modifyLinesForMigration,
  readTaskBlockFromVault,
} from '../../utils/task-sub-bullets';
import { EmbeddedTaskItemRenderer } from './embedded-task-item-renderer';

/**
 * Renders interactive task lists within code blocks.
 * Handles task state changes and navigation.
 */
export class EmbeddedTaskListRenderer {
  private plugin: TodoTracker;
  private menuBuilder: StateMenuBuilder;
  private taskContextMenu: TaskContextMenu;
  private itemRenderer: EmbeddedTaskItemRenderer;

  constructor(plugin: TodoTracker) {
    this.plugin = plugin;
    this.menuBuilder = new StateMenuBuilder(plugin);

    // Create task context menu for right-click actions
    this.taskContextMenu = new TaskContextMenu(
      {
        onGoToTask: (task) => this.itemRenderer.navigateToTask(task),
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

    this.itemRenderer = new EmbeddedTaskItemRenderer(
      plugin,
      this.menuBuilder,
      this.taskContextMenu,
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
      );

      // Check if we can do an incremental update (container exists with correct structure)
      if (taskListContainer) {
        // Incremental update - keep header, just update state and content
        this.updateCollapsibleList(
          taskListContainer as HTMLElement,
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
      const taskItem = this.itemRenderer.createTaskListItem(
        task,
        index,
        params,
      );
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
      const taskItem = this.itemRenderer.createTaskListItem(
        task,
        index,
        params,
      );
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
      const taskItem = this.itemRenderer.createTaskListItem(
        task,
        index,
        params,
      );
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
