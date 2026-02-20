import {
  ItemView,
  WorkspaceLeaf,
  TFile,
  Platform,
  MarkdownView,
  setIcon,
} from 'obsidian';
import { TASK_VIEW_ICON } from '../../main';
import { Task, NEXT_STATE } from '../../types/task';
import { DateUtils } from '../../utils/date-utils';
import { Search } from '../../search/search';
import { SearchOptionsDropdown } from '../components/search-options-dropdown';
import { SearchSuggestionDropdown } from '../components/search-suggestion-dropdown';
import { StateMenuBuilder } from '../components/state-menu-builder';
import TodoTracker from '../../main';
import { getFilename, isActiveKeyword } from '../../utils/task-utils';
import {
  sortTasksWithThreeBlockSystem,
  SortMethod as TaskSortMethod,
  buildKeywordSortConfig,
  KeywordSortConfig,
} from '../../utils/task-sort';
import { TaskStateManager } from '../../services/task-state-manager';
import { TAG_PATTERN } from '../../utils/patterns';
import { getTaskTextDisplay } from '../../utils/task-utils';

const CHUNK_BATCH_SIZE = 15;
const YIELD_EVERY_N_TASKS = 5;
const PRIORITY_FIRST_BATCH = 10;

// Lazy loading constants
const INITIAL_LOAD_COUNT = 50;
const LOAD_BATCH_SIZE = 30;

const WIKI_LINK_REGEX = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
const MD_LINK_REGEX = /\[([^\]]*(?:\[[^\]]*\][^\]]*)*)\]\(([^)]+)\)/g;
const URL_REGEX = /\bhttps?:\/\/[^\s)]+/g;

interface CachedTaskElement {
  element: HTMLLIElement;
  task: Task;
  height: number;
}

class TaskElementCache {
  private cache = new Map<string, CachedTaskElement>();

  private getKey(task: Task): string {
    return `${task.path}:${task.line}`;
  }

  get(task: Task): HTMLLIElement | null {
    const cached = this.cache.get(this.getKey(task));
    return cached?.element ?? null;
  }

  set(task: Task, element: HTMLLIElement): void {
    const height = element.getBoundingClientRect().height;
    this.cache.set(this.getKey(task), { element, task, height });
  }

  invalidate(task: Task): void {
    this.cache.delete(this.getKey(task));
  }

  invalidateByKey(key: string): void {
    this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  has(task: Task): boolean {
    return this.cache.has(this.getKey(task));
  }
}

class ChunkedRenderQueue {
  private pending: Task[] = [];
  private isProcessing = false;
  private renderFn: ((task: Task) => HTMLLIElement) | null = null;
  private container: Element | null = null;
  private cache: TaskElementCache;
  private generation = 0;
  private currentRenderPromise: Promise<void> | null = null;

  constructor(cache: TaskElementCache) {
    this.cache = cache;
  }

  async enqueue(
    tasks: Task[],
    renderFn: (task: Task) => HTMLLIElement,
    container: Element,
  ): Promise<void> {
    // Cancel old render immediately - don't wait
    this.generation++;
    this.pending = [];
    this.isProcessing = false;

    // Set up new render
    this.renderFn = renderFn;
    this.container = container;
    this.pending = tasks;

    // Force start new render (old will exit via generation check)
    this.isProcessing = true;
    this.currentRenderPromise = this.processQueue();
    await this.currentRenderPromise;
    this.currentRenderPromise = null;
  }

  private async processQueue(): Promise<void> {
    const renderFn = this.renderFn;
    const container = this.container;
    const currentGeneration = this.generation;
    if (!renderFn || !container) return;

    let priorityRendered = 0;
    let renderedInBatch = 0;

    while (this.pending.length > 0) {
      // Check generation at start of each batch - exit if cancelled
      if (this.generation !== currentGeneration) {
        return;
      }

      const isFirstBatch = priorityRendered < PRIORITY_FIRST_BATCH;
      const batchSize = isFirstBatch
        ? Math.min(CHUNK_BATCH_SIZE, PRIORITY_FIRST_BATCH - priorityRendered)
        : CHUNK_BATCH_SIZE;

      const batch = this.pending.splice(0, batchSize);

      for (const task of batch) {
        // Check generation before each task - exit if cancelled
        if (this.generation !== currentGeneration) {
          return;
        }

        // Get cached element or render new one
        let element = this.cache.get(task);
        if (!element) {
          element = renderFn(task);
          this.cache.set(task, element);
        }
        container.appendChild(element); // Always append (moves if already in DOM)
        priorityRendered++;
        renderedInBatch++;

        // Yield every N tasks to prevent UI blocking
        if (renderedInBatch >= YIELD_EVERY_N_TASKS) {
          renderedInBatch = 0;
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
      }
    }

    this.isProcessing = false;
  }

  clear(): void {
    this.generation++;
    this.pending = [];
    this.isProcessing = false;
  }

  get isEmpty(): boolean {
    return this.pending.length === 0 && !this.isProcessing;
  }
}

export type TaskListViewMode =
  | 'showAll'
  | 'sortCompletedLast'
  | 'hideCompleted';
export type SortMethod =
  | 'default'
  | 'sortByScheduled'
  | 'sortByDeadline'
  | 'sortByPriority'
  | 'sortByUrgency'
  | 'sortByKeyword';

export class TaskListView extends ItemView {
  static viewType = 'todoseq-view';
  tasks: Task[];
  private defaultViewMode: TaskListViewMode;
  private defaultSortMethod: SortMethod;
  private searchInputEl: HTMLInputElement | null = null;
  private _searchKeyHandler: ((e: KeyboardEvent) => void) | undefined;
  private isCaseSensitive = false;
  private searchError: string | null = null;
  private optionsDropdown: SearchOptionsDropdown | null = null;
  private suggestionDropdown: SearchSuggestionDropdown | null = null;
  private taskListContainer: HTMLElement | null = null;
  private ariaLiveRegion: HTMLElement | null = null;
  private unsubscribeFromStateManager: (() => void) | null = null;
  private cachedVisibleTasks: Task[] = [];
  private wasPanelVisible = false;
  private resizeObserver: ResizeObserver | null = null;

  // Scroll position tracking for preserving scroll across refreshes
  private savedScrollPosition = 0;
  private scrollEventListener: (() => void) | null = null;

  // Chunked rendering for performance with large task lists
  private taskElementCache = new TaskElementCache();
  private renderQueue: ChunkedRenderQueue;

  // Menu builder for state management
  private menuBuilder: StateMenuBuilder;

  // Search history debounce mechanism
  private searchHistoryDebounceTimer: ReturnType<typeof setTimeout> | null =
    null;
  private readonly SEARCH_HISTORY_DEBOUNCE_MS = 3000; // 3 seconds idle timeout
  private searchRefreshDebounceTimer: ReturnType<typeof setTimeout> | null =
    null;
  private readonly SEARCH_REFRESH_DEBOUNCE_MS = 250; // 250ms debounce for search refresh

  // Task state refresh debounce timer (class property for cleanup)
  private taskRefreshTimeout: ReturnType<typeof setTimeout> | null = null;
  private readonly TASK_REFRESH_DEBOUNCE_MS = 150;

  // Keyword sort config caching
  private cachedKeywordConfig: KeywordSortConfig | null = null;
  private cachedKeywords: string | null = null;

  // Reference to the plugin for checking user-initiated updates
  private plugin: TodoTracker;

  // Lazy loading state
  private loadedTaskCount = 0;
  private totalTaskCount = 0;
  private isAllTasksLoaded = false;
  private sentinelElement: HTMLElement | null = null;
  private sentinelObserver: IntersectionObserver | null = null;
  private isLoadingMore = false;

  constructor(
    leaf: WorkspaceLeaf,
    taskStateManager: TaskStateManager,
    defaultViewMode: TaskListViewMode,
    plugin: TodoTracker,
  ) {
    super(leaf);
    this.tasks = taskStateManager.getTasks();
    this.defaultViewMode = defaultViewMode;
    this.defaultSortMethod = plugin.settings.defaultSortMethod;
    this.menuBuilder = new StateMenuBuilder(plugin);
    this.renderQueue = new ChunkedRenderQueue(this.taskElementCache);
    this.plugin = plugin;

    // Subscribe to task changes from the centralized state manager
    // Uses interrupt pattern: new update cancels pending work and processes immediately
    this.unsubscribeFromStateManager = taskStateManager.subscribe(
      async (tasks) => {
        // Cancel any pending debounced refresh - process immediately (interrupt pattern)
        if (this.taskRefreshTimeout) {
          clearTimeout(this.taskRefreshTimeout);
          this.taskRefreshTimeout = null;
        }

        // Update the tasks reference
        this.updateTasks(tasks);

        // Only refresh if the view is already open (has contentEl)
        if (this.contentEl && this.taskListContainer) {
          // Check if panel is visible (has dimensions)
          const rect = this.contentEl.getBoundingClientRect();
          const isPanelVisible = rect.width > 0 && rect.height > 0;

          if (!isPanelVisible) {
            return;
          }

          // Calculate scroll anchor BEFORE refresh (how many tasks scrolled off top)
          const scrollAnchor = this.calculateScrollAnchor();

          // Full rebuild with scroll preservation
          await this.refreshVisibleList(false);

          // Restore scroll position by task count
          this.restoreScrollByTaskCount(scrollAnchor);
        }
      },
    );
  }

  // Calculate how many tasks are scrolled off the top (scroll anchor)
  private calculateScrollAnchor(): number {
    if (!this.taskListContainer || !this.cachedVisibleTasks) {
      return 0;
    }

    const list = this.taskListContainer.querySelector('ul.todo-list');
    if (!list) return 0;

    const firstVisible = list.querySelector('li.todo-item');
    if (!firstVisible) return 0;

    const firstPath = firstVisible.getAttribute('data-path');
    const firstLine = firstVisible.getAttribute('data-line');

    if (!firstPath || !firstLine) return 0;

    // Find its index in cachedVisibleTasks
    const idx = this.cachedVisibleTasks.findIndex(
      (t) => t.path === firstPath && t.line === parseInt(firstLine, 10),
    );

    return idx >= 0 ? idx : 0;
  }

  // Restore scroll position by keeping same number of tasks scrolled off top
  private restoreScrollByTaskCount(anchor: number): void {
    if (!this.taskListContainer || !this.cachedVisibleTasks) {
      return;
    }

    const list = this.taskListContainer.querySelector('ul.todo-list');
    if (!list) return;

    // Get the task at the anchor position
    const targetTask = this.cachedVisibleTasks[anchor];
    if (!targetTask) {
      this.taskListContainer.scrollTop = 0;
      return;
    }

    // Find the DOM element for that task
    const selector = `li.todo-item[data-path="${CSS.escape(targetTask.path)}"][data-line="${targetTask.line}"]`;
    const targetElement = list.querySelector(selector) as HTMLElement;

    if (!targetElement) {
      this.taskListContainer.scrollTop = 0;
      return;
    }

    // Scroll so that element is at the top
    const containerTop = this.taskListContainer.scrollTop;
    const elementTop =
      targetElement.offsetTop - this.taskListContainer.offsetTop;
    const scrollDelta = elementTop - containerTop;

    this.taskListContainer.scrollTop += scrollDelta;
  }

  /** View-mode accessors persisted on the root element to avoid cross-class coupling */
  private getViewMode(): TaskListViewMode {
    const attr = this.contentEl.getAttr('data-view-mode');
    if (typeof attr === 'string') {
      // Migrate old mode names to new ones
      if (attr === 'default') return 'showAll';
      if (attr === 'sortCompletedLast') return 'sortCompletedLast';
      if (attr === 'hideCompleted') return 'hideCompleted';
      // Handle new mode names
      if (
        attr === 'showAll' ||
        attr === 'sortCompletedLast' ||
        attr === 'hideCompleted'
      )
        return attr;
    }
    // Fallback to current plugin setting from constructor if attribute not set
    // Handle migration from old mode names
    const defaultMode = this.defaultViewMode as string; // Treat as string for migration
    if (defaultMode === 'default') return 'showAll';
    if (defaultMode === 'sortCompletedLast') return 'sortCompletedLast';
    if (defaultMode === 'hideCompleted') return 'hideCompleted';
    if (
      defaultMode === 'showAll' ||
      defaultMode === 'sortCompletedLast' ||
      defaultMode === 'hideCompleted'
    ) {
      return defaultMode as TaskListViewMode;
    }
    // Final safety fallback
    return 'showAll';
  }
  setViewMode(mode: TaskListViewMode) {
    this.contentEl.setAttr('data-view-mode', mode);
  }

  private getSortMethod(): SortMethod {
    const attr = this.contentEl.getAttr('data-sort-method');
    if (typeof attr === 'string') {
      if (
        attr === 'default' ||
        attr === 'sortByScheduled' ||
        attr === 'sortByDeadline' ||
        attr === 'sortByPriority' ||
        attr === 'sortByUrgency' ||
        attr === 'sortByKeyword'
      )
        return attr;
    }
    // Fallback to current plugin setting from constructor if attribute not set
    if (
      this.defaultSortMethod === 'default' ||
      this.defaultSortMethod === 'sortByScheduled' ||
      this.defaultSortMethod === 'sortByDeadline' ||
      this.defaultSortMethod === 'sortByPriority' ||
      this.defaultSortMethod === 'sortByUrgency' ||
      this.defaultSortMethod === 'sortByKeyword'
    ) {
      return this.defaultSortMethod;
    }
    // Final safety fallback
    return 'default';
  }
  setSortMethod(method: SortMethod) {
    this.contentEl.setAttr('data-sort-method', method);
  }

  /**
   * Filter tasks based on view mode
   * @param tasks Array of all tasks
   * @param mode Current view mode
   * @returns Filtered tasks array
   */
  private filterTasksByViewMode(tasks: Task[], mode: TaskListViewMode): Task[] {
    if (mode === 'hideCompleted') {
      return tasks.filter((t) => !t.completed);
    }
    return tasks.slice(); // Return copy for other modes
  }

  /** Non-mutating transform for rendering */
  private transformForView(tasks: Task[], mode: TaskListViewMode): Task[] {
    const now = new Date();
    const sortMethod = this.getSortMethod() as TaskSortMethod;

    // Map TaskListViewMode to CompletedTaskSetting
    let completedSetting: 'showAll' | 'sortToEnd' | 'hide';
    switch (mode) {
      case 'hideCompleted':
        completedSetting = 'hide';
        break;
      case 'sortCompletedLast':
        completedSetting = 'sortToEnd';
        break;
      case 'showAll':
      default:
        completedSetting = 'showAll';
        break;
    }

    // Use the new three-block sorting system
    const futureSetting = this.plugin.settings.futureTaskSorting;

    // Build keyword config if sorting by keyword
    let keywordConfig: KeywordSortConfig | undefined;
    if (sortMethod === 'sortByKeyword') {
      keywordConfig = this.getKeywordSortConfig();
    }

    // Apply the new sorting logic
    const sortedTasks = sortTasksWithThreeBlockSystem(
      tasks,
      now,
      futureSetting,
      completedSetting,
      sortMethod,
      keywordConfig,
    );

    return sortedTasks;
  }

  /**
   * Get cached keyword sort config, rebuilding only when keywords change
   */
  private getKeywordSortConfig(): KeywordSortConfig {
    // Build TaskKeywordGroups from flat settings properties
    const keywordGroups = {
      activeKeywords: this.plugin.settings?.additionalActiveKeywords ?? [],
      inactiveKeywords: this.plugin.settings?.additionalTaskKeywords ?? [],
      waitingKeywords: this.plugin.settings?.additionalWaitingKeywords ?? [],
      completedKeywords:
        this.plugin.settings?.additionalCompletedKeywords ?? [],
    };

    const keywords = Object.values(keywordGroups).flat().join(',');
    if (!this.cachedKeywordConfig || this.cachedKeywords !== keywords) {
      this.cachedKeywords = keywords;
      this.cachedKeywordConfig = buildKeywordSortConfig(keywordGroups);
    }

    return this.cachedKeywordConfig;
  }

  /** Search query (persisted on root contentEl attribute to survive re-renders) */
  private getSearchQuery(): string {
    const q = this.contentEl.getAttr('data-search');
    return typeof q === 'string' ? q : '';
  }
  private setSearchQuery(q: string) {
    this.contentEl.setAttr('data-search', q);
  }

  /** Build toolbar with icon-only mode buttons plus right-aligned search; dispatch event for persistence */
  private buildToolbar(container: HTMLElement) {
    const toolbar = container.createEl('div', { cls: 'todo-toolbar' });

    // First row: search input with mode icons on the right
    const firstRow = toolbar.createEl('div', { cls: 'search-row' });

    // Right-aligned search input with icon
    const searchId = `todoseq-search-${Math.random().toString(36).slice(2, 8)}`;
    const searchLabel = firstRow.createEl('label', { attr: { for: searchId } });
    searchLabel.setText('Search');
    searchLabel.addClass('sr-only');
    const searchInputWrap = firstRow.createEl('div', {
      cls: 'search-input-container global-search-input-container',
    });
    const inputEl = searchInputWrap.createEl('input', {
      attr: {
        id: searchId,
        type: 'search',
        placeholder: 'Search tasks…',
        'aria-label': 'Search tasks',
      },
    });
    const clearSearch = searchInputWrap.createEl('div', {
      cls: 'search-input-clear-button',
      attr: { 'aria-label': 'Clear search' },
    });
    clearSearch.addEventListener('click', async () => {
      inputEl.value = '';
      this.setSearchQuery('');
      await this.refreshVisibleList();
    });
    const matchCase = searchInputWrap.createEl('div', {
      cls: 'input-right-decorator clickable-icon',
      attr: { 'aria-label': 'Match case' },
    });
    setIcon(matchCase, 'uppercase-lowercase-a');

    // Toggle case sensitivity
    matchCase.addEventListener('click', async () => {
      this.isCaseSensitive = !this.isCaseSensitive;
      matchCase.toggleClass('is-active', this.isCaseSensitive);
      await this.refreshVisibleList();
    });
    // Narrow to HTMLInputElement via runtime guard
    if (!(inputEl instanceof HTMLInputElement)) {
      throw new Error('Failed to create search input element');
    }
    inputEl.value = this.getSearchQuery();
    inputEl.addEventListener('input', async () => {
      // Debounce search refresh to avoid excessive re-renders
      if (this.searchRefreshDebounceTimer) {
        clearTimeout(this.searchRefreshDebounceTimer);
      }
      this.searchRefreshDebounceTimer = setTimeout(async () => {
        this.searchRefreshDebounceTimer = null;
        // Update attribute and re-render list only, preserving focus
        this.setSearchQuery(inputEl.value);
        await this.refreshVisibleList();
        // Start debounce timer for history capture
        this.handleSearchHistoryDebounce(inputEl.value);
      }, this.SEARCH_REFRESH_DEBOUNCE_MS);
    });

    // Capture search on Enter key (immediate) - only when both dropdowns are closed
    inputEl.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        // Only capture to history if both dropdowns are not visible
        // This prevents capturing when Enter is used to select from a dropdown
        const suggestionVisible = this.suggestionDropdown?.isVisible() ?? false;
        const optionsVisible = this.optionsDropdown?.isVisible() ?? false;
        if (!suggestionVisible && !optionsVisible) {
          this.captureSearchToHistory(inputEl.value);
        }
      }
    });

    // Also handle 'search' event for mobile keyboards (Android magnifying glass button)
    // The search event fires when user presses the search button on mobile
    inputEl.addEventListener('search', () => {
      // Only capture if there's a non-empty query and both dropdowns are closed
      const query = inputEl.value.trim();
      if (query) {
        const suggestionVisible = this.suggestionDropdown?.isVisible() ?? false;
        const optionsVisible = this.optionsDropdown?.isVisible() ?? false;
        if (!suggestionVisible && !optionsVisible) {
          this.captureSearchToHistory(query);
        }
      }
    });

    // Add Settings button to the right side of the first row
    const settingsBtn = firstRow.createEl('div', { cls: 'clickable-icon' });
    settingsBtn.setAttr('title', 'Task List settings');
    settingsBtn.setAttr('aria-label', 'Task List settings');
    settingsBtn.setAttr('aria-expanded', String(false));
    settingsBtn.setAttr('tabindex', '0');
    setIcon(settingsBtn, 'lucide-sliders-horizontal');

    // Create expandable settings section below the first row
    const settingsSection = toolbar.createEl('div', { cls: 'search-params' });
    settingsSection.style.display = 'none'; // Start hidden

    // Add "Show completed tasks" dropdown
    const completedTasksSetting = settingsSection.createEl('div', {
      cls: 'setting-item',
    });
    const completedTasksSettingInfo = completedTasksSetting.createEl('div', {
      cls: 'setting-item-info',
    });
    completedTasksSettingInfo.createEl('div', {
      cls: 'setting-item-name',
      text: 'Completed tasks:',
      attr: { for: 'completed-tasks-dropdown' },
    });

    const completedTasksSettingControl = completedTasksSetting.createEl('div', {
      cls: 'setting-item-control',
    });
    const dropdown = completedTasksSettingControl.createEl('select', {
      cls: 'mod-small ',
      attr: {
        id: 'completed-tasks-dropdown',
        'aria-label': 'Show completed tasks',
      },
    });

    // Add dropdown options
    const options = [
      { value: 'showAll', label: 'Show' },
      { value: 'sortCompletedLast', label: 'Sort to end' },
      { value: 'hideCompleted', label: 'Hide' },
    ];

    for (const option of options) {
      dropdown.createEl('option', {
        attr: { value: option.value },
        text: option.label,
      });
    }

    // Set current view mode
    const currentMode = this.getViewMode();
    dropdown.value = currentMode;

    // Toggle settings section visibility
    const toggleSettings = () => {
      const isExpanded = settingsSection.style.display !== 'none';
      settingsSection.style.display = isExpanded ? 'none' : 'block';
      settingsBtn.setAttr('aria-expanded', String(!isExpanded));
      // Add/remove is-active class for visual feedback
      if (isExpanded) {
        settingsBtn.removeClass('is-active');
      } else {
        settingsBtn.addClass('is-active');
      }
    };

    settingsBtn.addEventListener('click', toggleSettings);

    // Keyboard support for settings button
    settingsBtn.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggleSettings();
      }
    });

    // Handle dropdown changes
    dropdown.addEventListener('change', () => {
      const selectedValue = dropdown.value as TaskListViewMode;
      this.setViewMode(selectedValue);

      // Dispatch event for persistence
      const evt = new CustomEvent('todoseq:view-mode-change', {
        detail: { mode: selectedValue },
      });
      window.dispatchEvent(evt);

      // Refresh the visible list - preserve scroll position
      this.refreshVisibleList(false);
    });

    // Add Future Task Sorting dropdown
    const futureTasksSetting = settingsSection.createEl('div', {
      cls: 'setting-item',
    });
    const futureTasksSettingInfo = futureTasksSetting.createEl('div', {
      cls: 'setting-item-info',
    });
    futureTasksSettingInfo.createEl('div', {
      cls: 'setting-item-name',
      text: 'Future dated tasks:',
      attr: { for: 'future-tasks-dropdown' },
    });
    //  futureTasksSettingInfo.createEl('div', {
    //    cls: 'setting-item-description',
    //    text: 'Control how tasks with future dates are displayed',
    //  });

    const futureTasksSettingControl = futureTasksSetting.createEl('div', {
      cls: 'setting-item-control',
    });
    const futureDropdown = futureTasksSettingControl.createEl('select', {
      cls: 'mod-small',
      attr: {
        id: 'future-tasks-dropdown',
        'aria-label': 'Future task sorting',
      },
    });

    // Add future task sorting options
    const futureOptions = [
      { value: 'showAll', label: 'Show' },
      { value: 'showUpcoming', label: 'Show upcoming' },
      { value: 'sortToEnd', label: 'Sort to end' },
      { value: 'hideFuture', label: 'Hide' },
    ];

    for (const option of futureOptions) {
      futureDropdown.createEl('option', {
        attr: { value: option.value },
        text: option.label,
      });
    }

    // Set current future task sorting mode
    futureDropdown.value = this.plugin.settings.futureTaskSorting;

    // Handle future task sorting changes
    futureDropdown.addEventListener('change', async () => {
      const selectedValue = futureDropdown.value as
        | 'showAll'
        | 'showUpcoming'
        | 'sortToEnd'
        | 'hideFuture';

      // Update settings and re-render
      this.plugin.settings.futureTaskSorting = selectedValue;

      // Dispatch event for persistence
      const evt = new CustomEvent('todoseq:future-task-sorting-change', {
        detail: { mode: selectedValue },
      });
      window.dispatchEvent(evt);

      // Re-render with new future task sorting - preserve scroll position
      await this.refreshVisibleList(false);
    });

    // Add search results info bar (second row)
    const searchResultsInfo = toolbar.createEl('div', {
      cls: 'search-results-info',
    });

    // Left side: task count
    const searchResultsWarp = searchResultsInfo.createEl('div', {
      cls: 'search-results-result-count',
    });
    const searchResultsCount = searchResultsWarp.createEl('span');
    searchResultsCount.setText('0 of 0 tasks');

    // Right side: sort dropdown
    // const sortDropdown = searchResultsInfo.createEl('div');
    const select = searchResultsInfo.createEl('select', {
      cls: 'dropdown',
      attr: {
        'aria-label': 'Sort tasks by',
        'data-sort-mode': 'default',
      },
    });

    const sortOptions = [
      { value: 'default', label: 'Default (file path)' },
      { value: 'sortByScheduled', label: 'Scheduled date' },
      { value: 'sortByDeadline', label: 'Deadline date' },
      { value: 'sortByPriority', label: 'Priority' },
      { value: 'sortByUrgency', label: 'Urgency' },
      { value: 'sortByKeyword', label: 'Keyword' },
    ];

    for (const option of sortOptions) {
      const optionEl = select.createEl('option', {
        attr: { value: option.value },
      });
      optionEl.setText(option.label);
    }

    // Set current sort mode
    const currentSortMethod = this.getSortMethod();
    select.value = currentSortMethod;

    // Add change handler for dropdown
    select.addEventListener('change', () => {
      const selectedValue = select.value;
      let sortMethod: SortMethod = 'default';

      if (selectedValue === 'sortByScheduled') {
        sortMethod = 'sortByScheduled';
      } else if (selectedValue === 'sortByDeadline') {
        sortMethod = 'sortByDeadline';
      } else if (selectedValue === 'sortByPriority') {
        sortMethod = 'sortByPriority';
      } else if (selectedValue === 'sortByUrgency') {
        sortMethod = 'sortByUrgency';
      } else if (selectedValue === 'sortByKeyword') {
        sortMethod = 'sortByKeyword';
      }

      // Update the sort method (keep the current view mode)
      this.setSortMethod(sortMethod);

      // Update the dropdown to reflect the current sort method
      select.value = sortMethod;

      // Dispatch event for persistence
      const evt = new CustomEvent('todoseq:sort-method-change', {
        detail: { sortMethod },
      });
      window.dispatchEvent(evt);

      // Refresh the visible list (transformForView will handle the sorting)
      // Reset to top since sort order changed fundamentally
      this.refreshVisibleList(true);
    });

    // Keep a reference for keyboard handlers to focus later
    this.searchInputEl = inputEl;
  }

  /** Setup search suggestion dropdowns for prefix filter autocomplete */
  private setupSearchSuggestions(): void {
    const inputEl = this.searchInputEl;
    if (!inputEl) return;

    // Clean up any existing dropdowns before creating new ones
    if (this.optionsDropdown) {
      this.optionsDropdown.cleanup();
      this.optionsDropdown = null;
    }
    if (this.suggestionDropdown) {
      this.suggestionDropdown.cleanup();
      this.suggestionDropdown = null;
    }

    // Import both dropdown classes dynamically to avoid circular dependencies
    Promise.all([
      import('../components/search-options-dropdown'),
      import('../components/search-suggestion-dropdown'),
    ])
      .then(([optionsModule, suggestionsModule]) => {
        this.suggestionDropdown = new (
          suggestionsModule as {
            SearchSuggestionDropdown: typeof SearchSuggestionDropdown;
          }
        ).SearchSuggestionDropdown(
          inputEl,
          this.app.vault,
          this.app,
          this.tasks,
          this.plugin.settings,
          this.getViewMode(),
        );

        this.optionsDropdown = new (
          optionsModule as {
            SearchOptionsDropdown: typeof SearchOptionsDropdown;
          }
        ).SearchOptionsDropdown(
          inputEl,
          this.app.vault,
          this.tasks,
          this.plugin.settings,
          this.suggestionDropdown,
        );

        // Set up visibility change callbacks to manage debounce timer
        this.suggestionDropdown.setOnVisibilityChange((isVisible) => {
          this.handleDropdownVisibilityChange(isVisible);
        });
        this.optionsDropdown.setOnVisibilityChange((isVisible) => {
          this.handleDropdownVisibilityChange(isVisible);
        });

        // Input event handler for dropdown triggering
        inputEl.addEventListener('input', () => {
          this.handleSearchInputForSuggestions();
        });

        // Focus event handler
        inputEl.addEventListener('focus', () => {
          this.handleSearchFocus();
        });

        // Keydown event handler
        inputEl.addEventListener('keydown', (e) => {
          if (this.optionsDropdown && this.optionsDropdown.handleKeyDown(e)) {
            e.preventDefault();
            e.stopPropagation();
          } else if (
            this.suggestionDropdown &&
            this.suggestionDropdown.handleKeyDown(e)
          ) {
            e.preventDefault();
            e.stopPropagation();
          }
        });
      })
      .catch((error) => {
        console.error('Failed to load search suggestion dropdowns:', error);
      });
  }

  private handleSearchInputForSuggestions(): void {
    if (
      !this.searchInputEl ||
      !this.optionsDropdown ||
      !this.suggestionDropdown
    )
      return;

    const value = this.searchInputEl.value;
    const cursorPos = this.searchInputEl.selectionStart ?? 0;

    // Check if we should show suggestions
    if (value.length === 0) {
      // Empty input - show options dropdown
      this.optionsDropdown.showOptionsDropdown(value);
      this.suggestionDropdown.hide();
      return;
    }

    // Check if cursor is at end of a prefix or typing after a prefix
    const textBeforeCursor = value.substring(0, cursorPos);

    // Match either:
    // 1. Complete prefix with colon and optional search term: path:search
    // 2. Incomplete prefix being typed: path
    const prefixMatch = textBeforeCursor.match(/(\w+)(:([^\s]*))?$/);

    if (prefixMatch) {
      const prefixBase = prefixMatch[1];
      const hasColon = prefixMatch[2] !== undefined;
      const searchTerm = prefixMatch[3] || ''; // Text typed after the colon

      // Check if this is a valid prefix
      const validPrefixes = [
        'path',
        'file',
        'tag',
        'state',
        'priority',
        'content',
        'scheduled',
        'deadline',
      ];
      if (
        validPrefixes.includes(prefixBase) ||
        validPrefixes.some((p) => p.startsWith(prefixBase))
      ) {
        if (hasColon) {
          // Complete prefix with colon - show filtered suggestions
          const prefix = prefixBase + ':';
          this.suggestionDropdown.showPrefixDropdown(prefix, searchTerm);
          this.optionsDropdown.hide();
        } else {
          // Incomplete prefix being typed - show options dropdown if it matches the start of any prefix
          this.optionsDropdown.showOptionsDropdown(prefixBase);
          this.suggestionDropdown.hide();
        }
        return;
      }
    }

    // Check if cursor is at end of text that ends with space
    if (cursorPos === value.length && value.endsWith(' ')) {
      // Show options dropdown
      this.optionsDropdown.showOptionsDropdown();
      this.suggestionDropdown.hide();
      return;
    }

    // No suggestions to show, but check if we're handling a prefix selection
    if (
      !this.optionsDropdown.isHandlingPrefixSelection &&
      !this.suggestionDropdown.isHandlingPrefixSelection
    ) {
      this.optionsDropdown.hide();
      this.suggestionDropdown.hide();
    }
  }

  private handleSearchFocus(): void {
    if (
      !this.searchInputEl ||
      !this.optionsDropdown ||
      !this.suggestionDropdown
    )
      return;

    const value = this.searchInputEl.value;

    if (value.length === 0) {
      // Show options dropdown when focusing empty input
      this.optionsDropdown.showOptionsDropdown();
      this.suggestionDropdown.hide();
    }
  }

  /**
   * Handle dropdown visibility changes
   * Clears debounce timer when dropdown opens, restarts when both close
   */
  private handleDropdownVisibilityChange(_isVisible: boolean): void {
    const suggestionVisible = this.suggestionDropdown?.isVisible() ?? false;
    const optionsVisible = this.optionsDropdown?.isVisible() ?? false;

    if (suggestionVisible || optionsVisible) {
      // A dropdown is visible - clear the debounce timer
      if (this.searchHistoryDebounceTimer) {
        clearTimeout(this.searchHistoryDebounceTimer);
        this.searchHistoryDebounceTimer = null;
      }
    } else {
      // Both dropdowns are closed - restart debounce timer with current query
      const query = this.getSearchQuery();
      if (query.trim()) {
        this.handleSearchHistoryDebounce(query);
      }
    }
  }

  /**
   * Handle search history debounce - starts/restarts idle timeout
   * Captures search query after user stops typing
   */
  private handleSearchHistoryDebounce(query: string): void {
    // Don't start debounce if either dropdown is visible
    const suggestionVisible = this.suggestionDropdown?.isVisible() ?? false;
    const optionsVisible = this.optionsDropdown?.isVisible() ?? false;
    if (suggestionVisible || optionsVisible) {
      return;
    }

    // Clear any existing timer
    if (this.searchHistoryDebounceTimer) {
      clearTimeout(this.searchHistoryDebounceTimer);
      this.searchHistoryDebounceTimer = null;
    }

    // Start new timer
    this.searchHistoryDebounceTimer = setTimeout(() => {
      this.captureSearchToHistory(query);
      this.searchHistoryDebounceTimer = null;
    }, this.SEARCH_HISTORY_DEBOUNCE_MS);
  }

  /**
   * Capture a search query to history
   * Called after debounce timeout or immediately on Enter key
   */
  private captureSearchToHistory(query: string): void {
    if (!this.optionsDropdown) return;
    this.optionsDropdown.addToHistory(query);
  }

  // Cycle state via NEXT_STATE using the centralized coordinator
  private async updateTaskState(task: Task, nextState: string): Promise<void> {
    // Store old state for announcement
    const oldState = task.state;

    // Get the plugin instance
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
      // Use the centralized coordinator for the update
      // This handles optimistic updates, file writes, and embed refreshes
      const updated = await plugin.taskUpdateCoordinator.updateTaskState(
        task,
        nextState,
        'task-list',
      );

      // Sync in-memory task from returned snapshot
      task.rawText = updated.rawText;
      task.state = updated.state;
      task.completed = updated.completed;

      // Announce state change to screen readers
      if (oldState !== task.state) {
        this.announceTaskStateChange(task, oldState);
      }
    } catch (error) {
      // Full refresh will be triggered by subscribe callback
      console.error('TODOseq: Failed to update task state:', error);
    }
  }

  /**
   * Update the task list and refresh the search suggestions dropdown
   * @param tasks New task list
   */
  public updateTasks(tasks: Task[]): void {
    this.tasks = tasks;
    // Update the dropdowns' task reference so they use the latest tasks
    if (this.optionsDropdown) {
      this.optionsDropdown.updateTasks(tasks);
    }
    if (this.suggestionDropdown) {
      this.suggestionDropdown.updateTasks(tasks);
    }
  }

  getViewType() {
    return TaskListView.viewType;
  }

  /** Open Obsidian Menu at mouse event location listing default and additional keywords (excluding current) */
  private openStateMenuAtMouseEvent(task: Task, evt: MouseEvent): void {
    evt.preventDefault();
    evt.stopPropagation();

    // Use the shared StateMenuBuilder for consistent menu structure
    const menu = this.menuBuilder.buildStateMenu(
      task.state,
      async (newState: string) => {
        await this.updateTaskState(task, newState);
        // Full refresh handled by subscribe callback
      },
    );

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

  /** Open Obsidian Menu at a specific screen position */
  private openStateMenuAtPosition(
    task: Task,
    pos: { x: number; y: number },
  ): void {
    // Use the shared StateMenuBuilder for consistent menu structure
    const menu = this.menuBuilder.buildStateMenu(
      task.state,
      async (newState: string) => {
        await this.updateTaskState(task, newState);
        // Full refresh handled by subscribe callback
      },
    );

    menu.showAtPosition({ x: pos.x, y: pos.y });
  }

  getDisplayText() {
    return 'TODOseq';
  }

  getIcon(): string {
    // Use the same icon as the ribbon button
    return TASK_VIEW_ICON;
  }

  // Build helpers for a single task's subtree (idempotent, single responsibility)
  private buildCheckbox(task: Task, container: HTMLElement): HTMLInputElement {
    const checkbox = container.createEl('input', {
      type: 'checkbox',
      cls: 'todo-checkbox',
    });

    // Add state-specific class for styling (includes custom active keywords)
    if (isActiveKeyword(task.state, this.plugin.settings)) {
      checkbox.addClass('todo-checkbox-active');
    }

    checkbox.checked = task.completed;

    checkbox.addEventListener('change', async () => {
      const targetState = checkbox.checked ? 'DONE' : 'TODO';
      await this.updateTaskState(task, targetState);
      // Full refresh handled by subscribe callback
    });

    return checkbox;
  }

  private buildKeyword(task: Task, parent: HTMLElement): HTMLSpanElement {
    const todoSpan = parent.createEl('span', { cls: 'todo-keyword' });
    todoSpan.setText(task.state);
    todoSpan.setAttr('role', 'button');
    todoSpan.setAttr('tabindex', '0');
    todoSpan.setAttr('aria-checked', String(task.completed));

    const activate = async (evt: Event) => {
      evt.stopPropagation();
      await this.updateTaskState(task, NEXT_STATE.get(task.state) ?? 'DONE');
      // Full refresh handled by subscribe callback
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
        // do not immediately clear; allow a micro-window to absorb chained events
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
        // Many Android browsers will still emit a contextmenu after long press.
        // We mark suppression immediately on touchstart so the later contextmenu is eaten.
        suppressNextContextMenu = true;
        touchTimer = window.setTimeout(() => {
          // Re-read last known coordinates in case the user moved a bit during press
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
      // Keep suppression for a short grace period to absorb the trailing native contextmenu
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
          // a menu was just opened; prevent accidental state toggle
          evt.preventDefault();
          evt.stopPropagation();
          return;
        }
      },
      true,
    ); // capture to intercept before activate handler

    return todoSpan;
  }

  /**
   * Announce task state change to screen readers
   * @param task Task that was updated
   * @param oldState Previous state of the task
   */
  private announceTaskStateChange(task: Task, oldState: string): void {
    if (this.ariaLiveRegion) {
      const taskDescription = `${task.text} changed from ${oldState} to ${task.state}`;
      this.ariaLiveRegion.textContent = taskDescription;
    }
  }

  private buildText(task: Task, container: HTMLElement): HTMLSpanElement {
    const taskText = container.createEl('span', { cls: 'todo-text' });

    // Keyword button
    this.buildKeyword(task, taskText);

    // Priority badge
    if (task.priority) {
      const pri = task.priority; // 'high' | 'med' | 'low'
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

  // Build a complete LI for a task (used by initial render and refresh)
  private buildTaskListItem(task: Task): HTMLLIElement {
    const li = createEl('li', { cls: 'todo-item' });
    li.setAttribute('data-path', task.path);
    li.setAttribute('data-line', String(task.line));

    const checkbox = this.buildCheckbox(task, li);
    this.buildText(task, li);

    // Add date display if scheduled or deadline dates exist and task is not completed
    if ((task.scheduledDate || task.deadlineDate) && !task.completed) {
      this.buildDateDisplay(task, li);
    }

    // File info
    const fileInfo = li.createEl('div', { cls: 'todo-file-info' });
    const fileName = getFilename(task.path);
    // Strip .md extension from display name
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
        this.openTaskLocation(evt, task);
      }
    });

    return li;
  }

  // Update an existing DOM element with new task data (for smart diff)
  private updateTaskElementContent(task: Task, element: HTMLLIElement): void {
    // 1. Update checkbox
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

    // 2. Update keyword button
    const keywordBtn = element.querySelector(
      '.todo-keyword',
    ) as HTMLSpanElement;
    if (keywordBtn) {
      keywordBtn.textContent = task.state;
      keywordBtn.setAttribute('aria-checked', String(task.completed));
    }

    // 3. Update todo-text: rebuild the text portion (after keyword and priority)
    const todoText = element.querySelector('.todo-text') as HTMLElement;
    if (todoText) {
      // Get keyword info BEFORE clearing (since innerHTML='' removes it)
      const keywordSpan = element.querySelector('.todo-keyword');
      const keywordState = keywordSpan?.textContent || task.state;
      const keywordAriaChecked =
        keywordSpan?.getAttribute('aria-checked') || 'false';

      // Clear existing text content
      todoText.innerHTML = '';

      // Re-add keyword span
      const newKeywordSpan = todoText.createEl('span', { cls: 'todo-keyword' });
      newKeywordSpan.setText(keywordState);
      newKeywordSpan.setAttr('role', 'button');
      newKeywordSpan.setAttr('tabindex', '0');
      newKeywordSpan.setAttr('aria-checked', keywordAriaChecked);
      todoText.appendText(' ');

      // Rebuild priority badge (in case it changed or was added/removed)
      if (task.priority) {
        const priorityText =
          task.priority === 'high' ? 'A' : task.priority === 'med' ? 'B' : 'C';
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

    // 4. Update date display (may need to add/remove/rebuild)
    const hasDates =
      (task.scheduledDate || task.deadlineDate) && !task.completed;
    const existingDateDisplay = element.querySelector('.todo-date-container');
    if (existingDateDisplay) {
      if (hasDates) {
        // Dates exist - rebuild to update the display
        existingDateDisplay.remove();
        this.buildDateDisplay(task, element);
      } else {
        // No dates but element exists - remove it
        existingDateDisplay.remove();
      }
    } else if (hasDates) {
      // No element but dates exist - add it
      this.buildDateDisplay(task, element);
    }

    // 5. Update LI classes for task state
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

  // Set up scroll listener for lazy loading
  private setupSentinelObserver(): void {
    this.cleanupSentinelObserver();

    const list = this.taskListContainer?.querySelector('ul.todo-list');
    if (!list || !this.taskListContainer) return;

    // Create sentinel element if not exists
    if (!this.sentinelElement) {
      this.sentinelElement = list.createEl('div', {
        cls: 'todo-sentinel',
        attr: { 'aria-hidden': 'true' },
      });
    }

    // Use scroll event listener instead of IntersectionObserver
    const scrollHandler = () => {
      if (!this.taskListContainer || !this.sentinelElement) return;

      const container = this.taskListContainer;
      const sentinel = this.sentinelElement;

      const scrollBottom = container.scrollTop + container.clientHeight;
      const sentinelTop = sentinel.offsetTop;
      const threshold = container.clientHeight + 200;
      const isNearBottom = sentinelTop <= scrollBottom + threshold;

      if (isNearBottom && !this.isLoadingMore && !this.isAllTasksLoaded) {
        requestAnimationFrame(() => {
          this.loadMoreTasks();
        });
      }
    };

    this.taskListContainer.addEventListener('scroll', scrollHandler);
    this.scrollEventListener = scrollHandler;
  }

  private cleanupSentinelObserver(): void {
    // Remove scroll listener (reuse existing scrollEventListener property)
    if (this.taskListContainer && this.scrollEventListener) {
      this.taskListContainer.removeEventListener(
        'scroll',
        this.scrollEventListener,
      );
    }
    // Don't null out scrollEventListener as it's used for scroll position tracking

    if (this.sentinelObserver) {
      this.sentinelObserver.disconnect();
      this.sentinelObserver = null;
    }
    if (this.sentinelElement) {
      this.sentinelElement.remove();
      this.sentinelElement = null;
    }
  }

  private async loadMoreTasks(): Promise<void> {
    if (this.isLoadingMore || this.isAllTasksLoaded) return;

    this.isLoadingMore = true;
    const list = this.taskListContainer?.querySelector('ul.todo-list');
    if (!list) {
      this.isLoadingMore = false;
      return;
    }

    const remaining = this.totalTaskCount - this.loadedTaskCount;
    if (remaining <= 0) {
      this.isAllTasksLoaded = true;
      this.isLoadingMore = false;
      this.cleanupSentinelObserver();
      return;
    }

    const toLoad = Math.min(remaining, LOAD_BATCH_SIZE);
    const visibleTasks = this.cachedVisibleTasks;
    const startIndex = this.loadedTaskCount;
    const endIndex = startIndex + toLoad;
    const tasksToLoad = visibleTasks.slice(startIndex, endIndex);

    // Use chunked rendering for the new batch
    await this.renderQueue.enqueue(
      tasksToLoad,
      (task) => this.buildTaskListItem(task),
      list,
    );

    // Move sentinel to end so it's always after all loaded tasks
    if (this.sentinelElement) {
      list.appendChild(this.sentinelElement);
    }

    this.loadedTaskCount += toLoad;
    this.isLoadingMore = false;

    // Check if all tasks are now loaded
    if (this.loadedTaskCount >= this.totalTaskCount) {
      this.isAllTasksLoaded = true;
      this.cleanupSentinelObserver();
    }
  }

  private resetLazyLoading(): void {
    this.loadedTaskCount = 0;
    this.isAllTasksLoaded = false;
    this.isLoadingMore = false;
    this.cleanupSentinelObserver();
  }

  /** Recalculate visible tasks for current mode + search and update only the list subtree
   * Always does a full rebuild to ensure correct sort order
   * @param resetScroll If true, reset to top of list. If false, preserve scroll position.
   */
  async refreshVisibleList(resetScroll = false): Promise<void> {
    // Cancel any pending debounced refresh - this call takes precedence
    if (this.taskRefreshTimeout) {
      clearTimeout(this.taskRefreshTimeout);
      this.taskRefreshTimeout = null;
    }

    // Get saved scroll position (unless reset is requested)
    // This is updated continuously via scroll event listener, so it's always accurate
    const scrollContainer = this.taskListContainer;
    const previousScrollTop = resetScroll ? 0 : this.savedScrollPosition;

    const container = this.contentEl;

    // Yield to main thread to prevent blocking user typing
    await new Promise((resolve) => setTimeout(resolve, 0));

    // Sync dropdown with current sort method
    const sortDropdown = container.querySelector(
      '.sort-dropdown select',
    ) as HTMLSelectElement;
    if (sortDropdown) {
      const currentSortMethod = this.getSortMethod();
      sortDropdown.value = currentSortMethod;
    }

    const mode = this.getViewMode();
    const allTasks = this.tasks ?? [];
    let visible = this.transformForView(allTasks, mode);

    // Apply search filtering
    const q = this.getSearchQuery().trim();
    if (q.length > 0) {
      try {
        // Use new advanced search functionality
        const searchResults = await Promise.all(
          visible.map(async (t) => {
            const matches = await Search.evaluate(
              q,
              t,
              this.isCaseSensitive,
              this.plugin.settings,
            );
            return { task: t, matches };
          }),
        );

        // Filter based on the results
        visible = searchResults
          .filter((result) => result.matches)
          .map((result) => result.task);
        this.searchError = null;
      } catch (error) {
        // If there's an error in parsing, fall back to simple search
        const searchQuery = this.isCaseSensitive ? q : q.toLowerCase();
        const searchText = this.isCaseSensitive
          ? (text: string) => text
          : (text: string) => text.toLowerCase();

        visible = visible.filter((t) => {
          const baseName = t.path.slice(t.path.lastIndexOf('/') + 1);
          return (
            (t.rawText && searchText(t.rawText).includes(searchQuery)) ||
            (t.text && searchText(t.text).includes(searchQuery)) ||
            (t.path && searchText(t.path).includes(searchQuery)) ||
            (baseName && searchText(baseName).includes(searchQuery))
          );
        });

        // Store the error for display
        this.searchError = Search.getError(q) || 'Invalid search query';
      }
    } else {
      this.searchError = null;
    }

    // Update search results info
    const searchResultsCount = container.querySelector(
      '.search-results-result-count',
    );
    if (searchResultsCount) {
      const filteredAllTasks = this.filterTasksByViewMode(allTasks, mode);
      searchResultsCount.setText(
        `${visible.length} of ${filteredAllTasks.length} task` +
          (filteredAllTasks.length === 1 ? '' : 's'),
      );
    }

    // Display search error if present
    const searchErrorContainer = container.querySelector(
      '.search-error-container',
    );
    if (this.searchError) {
      if (!searchErrorContainer) {
        const errorContainer = container.createEl('div', {
          cls: 'search-error-container',
        });
        const errorEl = errorContainer.createEl('div', { cls: 'search-error' });
        errorEl.setText(this.searchError);
      }
    } else {
      if (searchErrorContainer) {
        searchErrorContainer.detach();
      }
    }

    // Empty-state guidance UI
    // Check scan status first - show scanning message even when tasks exist
    const plugin = (
      window as unknown as {
        todoSeqPlugin?: {
          vaultScanner?: {
            isScanning: () => boolean;
            shouldShowScanningMessage: () => boolean;
          };
        };
      }
    ).todoSeqPlugin;
    const isScanning =
      plugin?.vaultScanner?.shouldShowScanningMessage() ?? false;

    // Check if we're in initial load state (before first scan has started)
    // This prevents "No tasks found" from flashing before the scan begins
    const isInitialLoad =
      !isScanning && visible.length === 0 && allTasks.length === 0;

    if (isScanning || isInitialLoad) {
      // Remove any previous empty-state
      const prevEmpty = container.querySelector('.todo-empty');
      if (prevEmpty) prevEmpty.detach?.();

      // Build empty message container (below toolbar, above list)
      const emptyContainer = this.taskListContainer || container;
      const empty = emptyContainer.createEl('div', { cls: 'todo-empty' });

      const title = empty.createEl('div', { cls: 'todo-empty-title' });
      const subtitle = empty.createEl('div', { cls: 'todo-empty-subtitle' });

      // Show appropriate message based on state
      if (isScanning) {
        // Vault scan in progress with no visible tasks
        title.setText('Scanning vault...');
        subtitle.setText('Please wait while your tasks are being indexed.');
      } else {
        // Initial load state (Obsidian starting up, no tasks loaded yet)
        title.setText('Loading tasks...');
        subtitle.setText('Please wait while your vault is being indexed.');
      }

      // Keep toolbar enabled: do not disable or overlay; list remains empty
      return;
    } else if (visible.length === 0) {
      // Remove any previous empty-state
      const prevEmpty = container.querySelector('.todo-empty');
      if (prevEmpty) prevEmpty.detach?.();

      // Build empty message container (below toolbar, above list)
      const emptyContainer = this.taskListContainer || container;
      const empty = emptyContainer.createEl('div', { cls: 'todo-empty' });

      const title = empty.createEl('div', { cls: 'todo-empty-title' });
      const subtitle = empty.createEl('div', { cls: 'todo-empty-subtitle' });

      // Determine scenario
      const hasAnyTasks = allTasks.length > 0;
      const hasAnyIncomplete = allTasks.some((t) => !t.completed);
      const isHideCompleted = mode === 'hideCompleted';

      if (!hasAnyTasks) {
        // No tasks in vault at all
        title.setText('No tasks found');
        subtitle.setText(
          'Create tasks in your notes using "TODO Your task". They will appear here automatically.',
        );
      } else if (isHideCompleted && !hasAnyIncomplete) {
        // b) Hide-completed enabled, but only completed tasks exist
        title.setText('All tasks are completed');
        subtitle.setText(
          'You are hiding completed tasks. Switch view mode or add new tasks to see more.',
        );
      } else {
        // General empty from search filter or other modes
        title.setText('No matching tasks');
        subtitle.setText('Try clearing the search or switching view modes.');
      }

      // Keep toolbar enabled: do not disable or overlay; list remains empty
      return;
    } else {
      // Remove any empty-state if present
      const prevEmpty = container.querySelector('.todo-empty');
      if (prevEmpty) prevEmpty.detach?.();
    }

    // Render visible tasks using chunked rendering for performance
    // Ensure list container exists and is the sole place for items
    let list = this.taskListContainer?.querySelector('ul.todo-list');
    if (!list && this.taskListContainer) {
      list = this.taskListContainer.createEl('ul', { cls: 'todo-list' });
    }

    if (list) {
      // Smart diff: reuse existing DOM elements instead of full rebuild
      // This prevents visible flicker when tasks are updated

      // Get all existing elements by their stable ID (path:line)
      const existingElements = new Map<string, HTMLElement>();
      const existingKeys = new Set<string>();
      list.querySelectorAll('li.todo-item').forEach((el) => {
        const path = el.getAttribute('data-path');
        const line = el.getAttribute('data-line');
        if (path && line) {
          const key = `${path}:${line}`;
          existingElements.set(key, el as HTMLElement);
          existingKeys.add(key);
        }
      });

      // Determine which visible tasks to render
      const renderCount = Math.min(visible.length, INITIAL_LOAD_COUNT);
      const toRender = visible.slice(0, renderCount);

      // Build a set of keys we're keeping
      const keepKeys = new Set<string>();
      toRender.forEach((t) => {
        keepKeys.add(`${t.path}:${t.line}`);
      });

      // Track which elements we've already used this render cycle
      const usedKeys = new Set<string>();

      // Reorder/reuse existing elements, create new ones only if needed
      for (let i = 0; i < toRender.length; i++) {
        const task = toRender[i];
        const key = `${task.path}:${task.line}`;

        let element: HTMLLIElement;

        if (existingElements.has(key)) {
          // Reuse existing element - but update its content with new task data
          const existingEl = existingElements.get(key);
          if (existingEl) {
            element = existingEl as HTMLLIElement;
            this.updateTaskElementContent(task, element);
            usedKeys.add(key);
          } else {
            element = this.buildTaskListItem(task);
          }
        } else {
          // Create new element (task wasn't in DOM before)
          element = this.buildTaskListItem(task);
        }

        // Update cache with the element (whether reused or new)
        this.taskElementCache.set(task, element);

        // Append to list in correct position
        // If it's already in the list at a different position, appendChild moves it
        list.appendChild(element);
      }

      // Remove elements that are no longer in visible list (lazy loaded items scrolled out)
      existingKeys.forEach((key) => {
        if (!keepKeys.has(key)) {
          const el = existingElements.get(key);
          if (el && el.parentNode && el.parentNode === list) {
            list.removeChild(el);
          }
        }
      });

      // Update lazy loading state
      this.renderQueue.clear();
      this.resetLazyLoading();
      this.totalTaskCount = visible.length;
      this.isAllTasksLoaded = renderCount >= visible.length;
      this.loadedTaskCount = renderCount;

      // Set up sentinel observer for lazy loading if there are more tasks
      if (!this.isAllTasksLoaded) {
        this.setupSentinelObserver();
      }
    }

    // Cache visible tasks
    this.cachedVisibleTasks = visible;

    // Restore scroll position (unless reset was requested)
    if (!resetScroll && scrollContainer) {
      scrollContainer.scrollTop = previousScrollTop;
    }
  }

  // Obsidian lifecycle methods for view open: keyed, minimal render
  async onOpen() {
    const container = this.contentEl;
    container.empty();
    container.addClass('todo-view');

    // Toolbar
    this.buildToolbar(container);

    // Create scrollable container for task list
    this.taskListContainer = container.createEl('div', {
      cls: 'todo-task-list-container',
    });

    // Set up scroll event listener to continuously track scroll position
    // This ensures scroll position is preserved across refreshes
    this.scrollEventListener = () => {
      if (this.taskListContainer) {
        this.savedScrollPosition = this.taskListContainer.scrollTop;
      }
    };
    this.taskListContainer.addEventListener('scroll', this.scrollEventListener);

    // Create aria-live region for screen reader announcements
    this.ariaLiveRegion = container.createEl('div', {
      attr: {
        role: 'status',
        'aria-live': 'polite',
        'aria-atomic': 'true',
        class: 'sr-only',
      },
    });

    // Setup search suggestions dropdown
    this.setupSearchSuggestions();

    // Initial list render (preserves focus since toolbar/input already exists)
    await this.refreshVisibleList();

    // Set up ResizeObserver to detect when panel becomes visible from collapsed
    this.setupVisibilityObserver();

    // Keyboard shortcuts: Slash to focus search, Esc to clear
    const input: HTMLInputElement | null = this.searchInputEl ?? null;
    const keyHandler = async (evt: KeyboardEvent) => {
      const active = document.activeElement as HTMLElement | null;
      const isTyping =
        !!active &&
        (active.tagName === 'INPUT' ||
          active.tagName === 'TEXTAREA' ||
          (active as unknown as { isContentEditable?: boolean })
            .isContentEditable === true);

      if (evt.key === '/' && !evt.metaKey && !evt.ctrlKey && !evt.altKey) {
        if (!isTyping && input) {
          evt.preventDefault();
          input.focus();
          input.select();
        }
      }

      if (evt.key === 'Escape') {
        if (active === input && input) {
          evt.preventDefault();
          input.value = '';
          this.setSearchQuery('');
          await this.refreshVisibleList(); // re-render cleared without losing focus context
          queueMicrotask(() => input.blur());
        }
      }
    };

    // Save references for cleanup
    this._searchKeyHandler = keyHandler;
    window.addEventListener('keydown', keyHandler);
  }

  /**
   * Format a date for display with relative time indicators
   * @param date The date to format
   * @param includeTime Whether to include time if available
   * @returns Formatted date string
   */
  private formatDateForDisplay(date: Date | null, includeTime = false): string {
    if (!date) return '';
    return DateUtils.formatDateForDisplay(date, includeTime);
  }

  /**
   * Get CSS classes for date display based on deadline status
   * @param date The date to check
   * @param isDeadline Whether this is a deadline date
   * @returns Array of CSS classes
   */
  private getDateStatusClasses(
    date: Date | null,
    isDeadline = false,
  ): string[] {
    if (!date) return [];

    const today = DateUtils.getDateOnly(new Date());
    const taskDate = DateUtils.getDateOnly(date);

    const diffTime = taskDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / DateUtils.MILLISECONDS_PER_DAY);

    const classes = ['todo-date'];

    classes.push('todo-date');

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
   * @param task The task to display dates for
   * @param parent The parent element to append to
   */
  private buildDateDisplay(task: Task, parent: HTMLElement): void {
    const dateContainer = parent.createEl('div', {
      cls: 'todo-date-container',
    });

    // Display scheduled date
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

    // Display deadline date
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
      { type: 'wiki', regex: new RegExp(WIKI_LINK_REGEX) },
      { type: 'md', regex: new RegExp(MD_LINK_REGEX) },
      { type: 'url', regex: new RegExp(URL_REGEX) },
      { type: 'tag', regex: new RegExp(TAG_PATTERN) },
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
        // Create a tag-like span
        const span = parent.createEl('span', { cls: 'todo-tag' });
        const tagName = nextMatch.match[0]; // Full #tag text including #
        span.setText(tagName);
        span.setAttribute('title', tagName);
      } else {
        // Create a non-interactive, link-like span for other types
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

      // Advance past the match
      i = nextMatch.match.index + nextMatch.match[0].length;
    }
  }

  // Open the source file in the vault where the task is declared, honoring Obsidian default-like modifiers.
  // Behavior:
  // - Default click (no modifiers): navigate to existing tab or open in new tab.
  // - Cmd (mac) / Ctrl (win/linux) click, or Middle-click: open in new tab.
  // - Shift-click: open in split.
  // - Alt-click: pin the target leaf after opening.
  // Additionally: Never open pages in the TODOseq tab (ensure this on mobile too).
  async openTaskLocation(evt: MouseEvent, task: Task) {
    const file = this.app.vault.getAbstractFileByPath(task.path);
    if (!(file instanceof TFile)) return;

    const { workspace } = this.app;
    const isMac = Platform.isMacOS;
    const isMiddle = evt.button === 1;
    const metaOrCtrl = isMac ? evt.metaKey : evt.ctrlKey;

    // Helpers
    const isMarkdownLeaf = (
      leaf: WorkspaceLeaf | null | undefined,
    ): boolean => {
      if (!leaf) return false;
      if (leaf.view instanceof MarkdownView) return true;
      return leaf.view?.getViewType?.() === 'markdown';
    };
    const isTodoSeqLeaf = (leaf: WorkspaceLeaf | null | undefined): boolean => {
      if (!leaf) return false;
      return leaf.view instanceof TaskListView;
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
    const doSplit = evt.shiftKey;

    let targetLeaf: WorkspaceLeaf | null = null;

    // Get current active leaf and check if it's a markdown view
    const currentActiveLeaf = workspace.activeLeaf;
    const isCurrentActiveMarkdown =
      currentActiveLeaf && isMarkdownLeaf(currentActiveLeaf);

    // Check if file is already open
    const existingLeafForFile = findExistingLeafForFile();
    const isFileAlreadyOpen = existingLeafForFile !== null;

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
      // Priority 1: If file is already open, focus it
      if (isFileAlreadyOpen) {
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

    if (!targetLeaf) {
      // Fallback to creating a new tab if somehow targetLeaf is null
      targetLeaf = workspace.getLeaf('tab');
    }
    await targetLeaf.openFile(file);

    if (evt.altKey) {
      try {
        (
          targetLeaf as WorkspaceLeaf & {
            setPinned?: (pinned: boolean) => void;
          }
        ).setPinned?.(true);
      } catch (_) {
        /* ignore */
      }
      try {
        (targetLeaf as WorkspaceLeaf as { pinned?: boolean }).pinned = true;
      } catch (_) {
        /* ignore */
      }
    }

    if (targetLeaf.view instanceof MarkdownView) {
      const markdownView = targetLeaf.view;
      const editor = markdownView.editor;
      const lineContent = editor.getLine(task.line);
      const pos = { line: task.line, ch: lineContent.length };
      editor.setCursor(pos);
      try {
        (
          markdownView as unknown as {
            setEphemeralState?: (state: { line: number; col: number }) => void;
          }
        ).setEphemeralState?.({ line: task.line, col: lineContent.length });
      } catch (_) {}
      editor.scrollIntoView({ from: pos, to: pos }, true);
    }

    if (targetLeaf) {
      await workspace.revealLeaf(targetLeaf);
    }
  }

  // Cleanup listeners
  async onClose() {
    const handler = this._searchKeyHandler as
      | ((e: KeyboardEvent) => void)
      | undefined;
    if (handler) {
      window.removeEventListener('keydown', handler);
      this._searchKeyHandler = undefined;
    }

    // Cleanup search history debounce timer
    if (this.searchHistoryDebounceTimer) {
      clearTimeout(this.searchHistoryDebounceTimer);
      this.searchHistoryDebounceTimer = null;
    }

    // Cleanup search refresh debounce timer
    if (this.searchRefreshDebounceTimer) {
      clearTimeout(this.searchRefreshDebounceTimer);
      this.searchRefreshDebounceTimer = null;
    }

    // Cleanup task refresh debounce timer
    if (this.taskRefreshTimeout) {
      clearTimeout(this.taskRefreshTimeout);
      this.taskRefreshTimeout = null;
    }

    // Cleanup suggestion dropdowns
    if (this.optionsDropdown) {
      this.optionsDropdown.cleanup();
      this.optionsDropdown = null;
    }
    if (this.suggestionDropdown) {
      this.suggestionDropdown.cleanup();
      this.suggestionDropdown = null;
    }

    // Unsubscribe from state manager
    if (this.unsubscribeFromStateManager) {
      this.unsubscribeFromStateManager();
      this.unsubscribeFromStateManager = null;
    }

    // Cleanup ResizeObserver
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }

    // Cleanup scroll event listener
    if (this.scrollEventListener && this.taskListContainer) {
      this.taskListContainer.removeEventListener(
        'scroll',
        this.scrollEventListener,
      );
      this.scrollEventListener = null;
    }

    this.searchInputEl = null;
    this.taskListContainer = null;
    await super.onClose?.();
  }

  /**
   * Set up ResizeObserver to detect when panel becomes visible from collapsed
   */
  private setupVisibilityObserver(): void {
    if (!this.contentEl) return;

    // Initialize visibility state
    const rect = this.contentEl.getBoundingClientRect();
    this.wasPanelVisible = rect.width > 0 && rect.height > 0;

    this.resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        const isNowVisible = width > 0 && height > 0;

        // Panel went from hidden to visible - refresh the list
        if (isNowVisible && !this.wasPanelVisible) {
          this.refreshVisibleList();
        }

        this.wasPanelVisible = isNowVisible;
      }
    });

    this.resizeObserver.observe(this.contentEl);
  }
}
