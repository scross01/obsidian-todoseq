import { ItemView, WorkspaceLeaf, Menu, TFile, Platform, MarkdownView, setIcon } from 'obsidian';
import { TASK_VIEW_ICON } from '../main';
import { TaskEditor } from './task-editor';
import { Task, NEXT_STATE, DEFAULT_ACTIVE_STATES, DEFAULT_PENDING_STATES, DEFAULT_COMPLETED_STATES } from '../task';
import { DateUtils } from './date-utils';
import { Search } from '../search/search';
import { SearchOptionsDropdown } from '../search/search-options-dropdown';
import { SearchSuggestionDropdown } from '../search/search-suggestion-dropdown';
import { TodoTrackerSettings } from '../settings/settings';


export type TaskViewMode = 'showAll' | 'sortCompletedLast' | 'hideCompleted';
export type SortMethod = 'default' | 'sortByScheduled' | 'sortByDeadline' | 'sortByPriority';

export class TodoView extends ItemView {
  static viewType = "todoseq-view";
  tasks: Task[];
  editor: TaskEditor;
  private defaultViewMode: TaskViewMode;
  private defaultSortMethod: SortMethod;
  private searchInputEl: HTMLInputElement | null = null;
  private _searchKeyHandler: ((e: KeyboardEvent) => void) | undefined;
  private isCaseSensitive = false;
  private searchError: string | null = null;
  private optionsDropdown: SearchOptionsDropdown | null = null;
  private suggestionDropdown: SearchSuggestionDropdown | null = null;

  constructor(leaf: WorkspaceLeaf, tasks: Task[], defaultViewMode: TaskViewMode, private settings: TodoTrackerSettings) {
    super(leaf);
    this.tasks = tasks;
    this.editor = new TaskEditor(this.app);
    this.defaultViewMode = defaultViewMode;
  }

  /** View-mode accessors persisted on the root element to avoid cross-class coupling */
  private getViewMode(): TaskViewMode {
    const attr = this.contentEl.getAttr('data-view-mode');
    if (typeof attr === 'string') {
      // Migrate old mode names to new ones
      if (attr === 'default') return 'showAll';
      if (attr === 'sortCompletedLast') return 'sortCompletedLast';
      if (attr === 'hideCompleted') return 'hideCompleted';
      // Handle new mode names
      if (attr === 'showAll' || attr === 'sortCompletedLast' || attr === 'hideCompleted') return attr;
    }
    // Fallback to current plugin setting from constructor if attribute not set
    // Handle migration from old mode names
    const defaultMode = this.defaultViewMode as string; // Treat as string for migration
    if (defaultMode === 'default') return 'showAll';
    if (defaultMode === 'sortCompletedLast') return 'sortCompletedLast';
    if (defaultMode === 'hideCompleted') return 'hideCompleted';
    if (defaultMode === 'showAll' || defaultMode === 'sortCompletedLast' || defaultMode === 'hideCompleted') {
      return defaultMode as TaskViewMode;
    }
    // Final safety fallback
    return 'showAll';
  }
  setViewMode(mode: TaskViewMode) {
    this.contentEl.setAttr('data-view-mode', mode);
  }

  private getSortMethod(): SortMethod {
    const attr = this.contentEl.getAttr('data-sort-method');
    if (typeof attr === 'string') {
      if (attr === 'default' || attr === 'sortByScheduled' || attr === 'sortByDeadline' || attr === 'sortByPriority') return attr;
    }
    // Fallback to current plugin setting from constructor if attribute not set
    if (this.defaultSortMethod === 'default' || this.defaultSortMethod === 'sortByScheduled' || this.defaultSortMethod === 'sortByDeadline' || this.defaultSortMethod === 'sortByPriority') {
      return this.defaultSortMethod;
    }
    // Final safety fallback
    return 'default';
  }
  setSortMethod(method: SortMethod) {
    this.contentEl.setAttr('data-sort-method', method);
  }

  /** Non-mutating transform for rendering */
  private transformForView(tasks: Task[], mode: TaskViewMode): Task[] {
    let transformed = tasks.slice();

    // First, handle view mode filtering
    if (mode === 'hideCompleted') {
      // Filter out completed tasks and then apply sorting
      transformed = transformed.filter(t => !t.completed);
      this.applySortToTasks(transformed);
      return transformed;
    }

    // Then apply sorting based on the current sort method
    if (mode === 'sortCompletedLast') {
      // Sort completed tasks to the end, but keep them sorted by the current sort selection
      const pending: Task[] = [];
      const done: Task[] = [];
      for (const t of transformed) {
        (t.completed ? done : pending).push(t);
      }
      
      // Apply the same sorting to both pending and done groups
      this.applySortToTasks(pending);
      this.applySortToTasks(done);
      
      transformed = pending.concat(done);
    } else {
      // For other modes (showAll), apply sorting directly
      this.applySortToTasks(transformed);
    }

    return transformed;
  }

  /**
   * Apply sorting to tasks based on the current sort method
   * @param tasks Array of tasks to sort
   */
  private applySortToTasks(tasks: Task[]): void {
    const sortMethod = this.getSortMethod();
    
    if (sortMethod === 'default') {
      // Sort by file path, then by line number within each file
      tasks.sort((a, b) => {
        const pathCompare = a.path.localeCompare(b.path);
        if (pathCompare !== 0) return pathCompare;
        return a.line - b.line;
      });
    } else if (sortMethod === 'sortByScheduled') {
      tasks.sort((a, b) => {
        // Tasks without scheduled dates go to the end
        if (!a.scheduledDate && !b.scheduledDate) return 0;
        if (!a.scheduledDate) return 1;
        if (!b.scheduledDate) return -1;
        return a.scheduledDate.getTime() - b.scheduledDate.getTime();
      });
    } else if (sortMethod === 'sortByDeadline') {
      tasks.sort((a, b) => {
        // Tasks without deadline dates go to the end
        if (!a.deadlineDate && !b.deadlineDate) return 0;
        if (!a.deadlineDate) return 1;
        if (!b.deadlineDate) return -1;
        return a.deadlineDate.getTime() - b.deadlineDate.getTime();
      });
    } else if (sortMethod === 'sortByPriority') {
      tasks.sort((a, b) => {
        // Priority order: high > med > low > null (no priority)
        const priorityOrder = { 'high': 3, 'med': 2, 'low': 1, 'null': 0 };
        const aPriority = a.priority ? priorityOrder[a.priority] : 0;
        const bPriority = b.priority ? priorityOrder[b.priority] : 0;
        
        if (aPriority !== bPriority) {
          return bPriority - aPriority; // Higher priority first (descending)
        }
        
        // If priorities are equal, fall back to default sorting
        const pathCompare = a.path.localeCompare(b.path);
        if (pathCompare !== 0) return pathCompare;
        return a.line - b.line;
      });
    }
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
    const searchInputWrap = firstRow.createEl('div', { cls: 'search-input-container global-search-input-container' });
    const inputEl = searchInputWrap.createEl('input', { attr: { id: searchId, type: 'search', placeholder: 'Search tasks…', 'aria-label': 'Search tasks' } });
    const clearSearch = searchInputWrap.createEl('div', { cls: 'search-input-clear-button', attr: { 'aria-label': 'Clear search' } });
    clearSearch.addEventListener('click', () => {
      inputEl.value = '';
      this.setSearchQuery('');
      this.refreshVisibleList();
    });
    const matchCase = searchInputWrap.createEl('div', { cls: 'input-right-decorator clickable-icon', attr: { 'aria-label': 'Match case' } });
    setIcon(matchCase, 'uppercase-lowercase-a');

    // Toggle case sensitivity
    matchCase.addEventListener('click', () => {
      this.isCaseSensitive = !this.isCaseSensitive;
      matchCase.toggleClass('is-active', this.isCaseSensitive);
      this.refreshVisibleList();
    });
    // Narrow to HTMLInputElement via runtime guard
    if (!(inputEl instanceof HTMLInputElement)) {
      throw new Error('Failed to create search input element');
    }
    inputEl.value = this.getSearchQuery();
    inputEl.addEventListener('input', () => {
      // Update attribute and re-render list only, preserving focus
      this.setSearchQuery(inputEl.value);
      this.refreshVisibleList();
    });

    // Add Settings button to the right side of the first row
    const settingsBtn = firstRow.createEl('div', { cls: 'clickable-icon' });
    settingsBtn.setAttr('title', 'Task View settings');
    settingsBtn.setAttr('aria-label', 'Task View settings');
    settingsBtn.setAttr('aria-expanded', String(false));
    setIcon(settingsBtn, 'lucide-sliders-horizontal');

    // Create expandable settings section below the first row
    const settingsSection = toolbar.createEl('div', { cls: 'search-params' });
    settingsSection.style.display = 'none'; // Start hidden

    // Add "Show completed tasks" dropdown
    const completedTasksSetting = settingsSection.createEl('div', { cls: 'setting-item' });
    const completedTasksSettingInfo = completedTasksSetting.createEl('div', { cls: 'setting-item-info'});
    const label = completedTasksSettingInfo.createEl('div', {
      cls: 'setting-item-name',
      text: 'Show completed tasks:',
      attr: { for: 'completed-tasks-dropdown' }
    });
    
    const completedTasksSettingControl = completedTasksSetting.createEl('div', { cls: 'setting-item-control'});
    const dropdown = completedTasksSettingControl.createEl('select', {
      cls: 'mod-small ',
      attr: {
        id: 'completed-tasks-dropdown',
        'aria-label': 'Show completed tasks'
      }
    });

    // Add dropdown options
    const options = [
      { value: 'showAll', label: 'Show' },
      { value: 'sortCompletedLast', label: 'Sort to end' },
      { value: 'hideCompleted', label: 'Hide' }
    ];

    for (const option of options) {
      const optionEl = dropdown.createEl('option', {
        attr: { value: option.value },
        text: option.label
      });
    }

    // Set current view mode
    const currentMode = this.getViewMode();
    dropdown.value = currentMode;

    // Toggle settings section visibility
    settingsBtn.addEventListener('click', () => {
      const isExpanded = settingsSection.style.display !== 'none';
      settingsSection.style.display = isExpanded ? 'none' : 'block';
      settingsBtn.setAttr('aria-expanded', String(!isExpanded));
      // Add/remove is-active class for visual feedback
      if (isExpanded) {
        settingsBtn.removeClass('is-active');
      } else {
        settingsBtn.addClass('is-active');
      }
    });

    // Handle dropdown changes
    dropdown.addEventListener('change', () => {
      const selectedValue = dropdown.value as TaskViewMode;
      this.setViewMode(selectedValue);
      
      // Dispatch event for persistence
      const evt = new CustomEvent('todoseq:view-mode-change', { detail: { mode: selectedValue } });
      window.dispatchEvent(evt);
      
      // Refresh the visible list
      this.refreshVisibleList();
    });

    // Add search results info bar (second row)
    const searchResultsInfo = toolbar.createEl('div', { cls: 'search-results-info' });
    
    // Left side: task count
    const searchResultsWarp = searchResultsInfo.createEl('div', { cls: 'search-results-result-count' });
    const searchResultsCount = searchResultsWarp.createEl('span');
    searchResultsCount.setText('0 of 0 tasks');
    
    // Right side: sort dropdown
    // const sortDropdown = searchResultsInfo.createEl('div');
    const select = searchResultsInfo.createEl('select', {
      cls: 'dropdown',
      attr: {
        'aria-label': 'Sort tasks by',
        'data-sort-mode': 'default'
      }
    });

    const sortOptions = [
      { value: 'default', label: 'Default (file path)' },
      { value: 'sortByScheduled', label: 'Scheduled date' },
      { value: 'sortByDeadline', label: 'Deadline date' },
      { value: 'sortByPriority', label: 'Priority' }
    ];

    for (const option of sortOptions) {
      const optionEl = select.createEl('option', {
        attr: { value: option.value }
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
      }
      
      // Update the sort method (keep the current view mode)
      this.setSortMethod(sortMethod);
      
      // Update the dropdown to reflect the current sort method
      select.value = sortMethod;
      
      // Dispatch event for persistence
      const evt = new CustomEvent('todoseq:sort-method-change', { detail: { sortMethod } });
      window.dispatchEvent(evt);
      
      // Refresh the visible list (transformForView will handle the sorting)
      this.refreshVisibleList();
    });

    // Keep a reference for keyboard handlers to focus later
    this.searchInputEl = inputEl;
  }

  /** Setup search suggestion dropdowns for prefix filter autocomplete */
  private setupSearchSuggestions(): void {
    const inputEl = this.searchInputEl;
    if (!inputEl) return;
    
    // Import both dropdown classes dynamically to avoid circular dependencies
    Promise.all([
      import('../search/search-options-dropdown'),
      import('../search/search-suggestion-dropdown')
    ]).then(([optionsModule, suggestionsModule]) => {
      this.suggestionDropdown = new suggestionsModule.SearchSuggestionDropdown(
        inputEl,
        this.app.vault,
        this.tasks,
        this.settings
      );
      
      this.optionsDropdown = new optionsModule.SearchOptionsDropdown(
        inputEl,
        this.app.vault,
        this.tasks,
        this.settings,
        this.suggestionDropdown
      );
      
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
        } else if (this.suggestionDropdown && this.suggestionDropdown.handleKeyDown(e)) {
          e.preventDefault();
          e.stopPropagation();
        }
      });
    }).catch(error => {
      console.error('Failed to load search suggestion dropdowns:', error);
    });
  }

  private handleSearchInputForSuggestions(): void {
  if (!this.searchInputEl || !this.optionsDropdown || !this.suggestionDropdown) return;
  
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
      const validPrefixes = ['path', 'file', 'tag', 'state', 'priority', 'content', 'scheduled', 'deadline'];
      if (validPrefixes.includes(prefixBase) || validPrefixes.some(p => p.startsWith(prefixBase))) {
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
  if (!this.optionsDropdown.isHandlingPrefixSelection && !this.suggestionDropdown.isHandlingPrefixSelection) {
      this.optionsDropdown.hide();
      this.suggestionDropdown.hide();
  }
}

  private handleSearchFocus(): void {
    if (!this.searchInputEl || !this.optionsDropdown || !this.suggestionDropdown) return;
    
    const value = this.searchInputEl.value;
    
    if (value.length === 0) {
        // Show options dropdown when focusing empty input
        this.optionsDropdown.showOptionsDropdown();
        this.suggestionDropdown.hide();
    }
  }

  // Cycle state via NEXT_STATE using TaskEditor
  private async updateTaskState(task: Task, nextState: string): Promise<void> {
    // Construct editor bound to this vault so methods don't need App
    const updated = await this.editor.updateTaskState(task, nextState);
    // Sync in-memory task from returned snapshot
    task.rawText = updated.rawText;
    if (typeof (updated as { state?: unknown }).state === 'string') {
      task.state = (updated as { state: string }).state as Task['state'];
    }
    task.completed = !!(updated as { completed?: unknown }).completed;
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
    return TodoView.viewType;
  }

  /** Return default keyword sets (non-completed and completed) and additional keywords using constants from task.ts */
  private getKeywordSets(): { pendingActive: string[]; completed: string[]; additional: string[] } {
    const pendingActiveDefaults = [
      ...Array.from(DEFAULT_PENDING_STATES),
      ...Array.from(DEFAULT_ACTIVE_STATES),
    ];
    const completedDefaults = Array.from(DEFAULT_COMPLETED_STATES);

    type AppWithPlugins = {
      plugins?: {
        plugins?: Record<string, unknown>;
      };
    };
    type HasSettingsWithKeywords = {
      settings?: {
        additionalTaskKeywords?: unknown;
      };
    };
    const appWithPlugins = this.app as unknown as AppWithPlugins;
    // Avoid importing TodoTracker type just to read settings; keep structural typing
    const maybePlugin = appWithPlugins.plugins?.plugins?.['todoseq'] as unknown as HasSettingsWithKeywords | undefined;
    const configured = maybePlugin?.settings?.additionalTaskKeywords;
    const additional = Array.isArray(configured)
      ? configured.filter((v): v is string => typeof v === 'string' && v.length > 0)
      : [];

    return {
      pendingActive: pendingActiveDefaults,
      completed: completedDefaults,
      additional,
    };
  }

  /** Build the list of selectable states for the context menu, excluding the current state */
  private getSelectableStatesForMenu(current: string): { group: string; states: string[] }[] {
    const { pendingActive, completed, additional } = this.getKeywordSets();

    const dedupe = (arr: string[]) => Array.from(new Set(arr));
    const nonCompleted = dedupe([...pendingActive, ...additional]);
    const completedOnly = dedupe(completed);

    // Present two groups: Non-completed and Completed
    const groups: { group: string; states: string[] }[] = [
      { group: 'Not completed', states: nonCompleted.filter(s => s && s !== current) },
      { group: 'Completed', states: completedOnly.filter(s => s && s !== current) },
    ];
    return groups.filter(g => g.states.length > 0);
  }

  /** Open Obsidian Menu at mouse event location listing default and additional keywords (excluding current) */
  private openStateMenuAtMouseEvent(task: Task, evt: MouseEvent): void {
    evt.preventDefault();
    evt.stopPropagation();
    const menu = new Menu();
    const groups = this.getSelectableStatesForMenu(task.state);

    for (const g of groups) {
      // Section header (disabled item)
      menu.addItem((item) => {
        item.setTitle(g.group);
        item.setDisabled(true);
      });
      for (const state of g.states) {
        menu.addItem((item) => {
          item.setTitle(state);
          item.onClick(async () => {
            await this.updateTaskState(task, state);
            this.refreshTaskElement(task);
          });
        });
      }
      // Divider between groups when both exist
      menu.addSeparator();
    }

    // Prefer API helper when available; fallback to explicit coordinates
    const maybeShowAtMouseEvent = (menu as unknown as { showAtMouseEvent?: (e: MouseEvent) => void }).showAtMouseEvent;
    if (typeof maybeShowAtMouseEvent === 'function') {
      maybeShowAtMouseEvent.call(menu, evt);
    } else {
      menu.showAtPosition({ x: evt.clientX, y: evt.clientY });
    }
  }

  /** Open Obsidian Menu at a specific screen position */
  private openStateMenuAtPosition(task: Task, pos: { x: number; y: number; }): void {
    const menu = new Menu();
    const groups = this.getSelectableStatesForMenu(task.state);

    for (const g of groups) {
      menu.addItem((item) => {
        item.setTitle(g.group);
        item.setDisabled(true);
      });
      for (const state of g.states) {
        menu.addItem((item) => {
          item.setTitle(state);
          item.onClick(async () => {
            await this.updateTaskState(task, state);
            this.refreshTaskElement(task);
          });
        });
      }
      menu.addSeparator();
    }
    menu.showAtPosition({ x: pos.x, y: pos.y });
  }

  getDisplayText() {
    return "TODOseq";
  }

  getIcon(): string {
    // Use the same icon as the ribbon button
    return TASK_VIEW_ICON;
  }

  // Build helpers for a single task's subtree (idempotent, single responsibility)
  private buildCheckbox(task: Task, container: HTMLElement): HTMLInputElement {
    const checkbox = container.createEl('input', {
      type: 'checkbox',
      cls: 'todo-checkbox'
    });
    
    // Add state-specific class for styling
    if (DEFAULT_ACTIVE_STATES.has(task.state)) {
      checkbox.addClass('todo-checkbox-active');
    }
        
    checkbox.checked = task.completed;

    checkbox.addEventListener('change', async () => {
      const targetState = checkbox.checked ? 'DONE' : 'TODO';
      await this.updateTaskState(task, targetState);
      const mode = this.getViewMode();
      if (mode !== 'showAll') {
        // Lighter refresh: recompute and redraw only the list
        this.refreshVisibleList();
      } else {
        this.refreshTaskElement(task);
      }
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
      this.refreshTaskElement(task);
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
    todoSpan.addEventListener('touchstart', (evt: TouchEvent) => {
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
    }, { passive: true });

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
    todoSpan.addEventListener('click', (evt) => {
      const now = Date.now();
      if (now - lastMenuOpenTs < MENU_DEBOUNCE_MS) {
        // a menu was just opened; prevent accidental state toggle
        evt.preventDefault();
        evt.stopPropagation();
        return;
      }
    }, true); // capture to intercept before activate handler

    return todoSpan;
  }

  private buildText(task: Task, container: HTMLElement): HTMLSpanElement {
    const taskText = container.createEl('span', { cls: 'todo-text' });

    // Keyword button
    this.buildKeyword(task, taskText);

    // Priority badge
    if (task.priority) {
      const pri = task.priority; // 'high' | 'med' | 'low'
      const badge = taskText.createEl('span', { cls: ['priority-badge', `priority-${pri}`] });
      badge.setText(pri === 'high' ? 'A' : pri === 'med' ? 'B' : 'C');
      badge.setAttribute('aria-label', `Priority ${pri}`);
      badge.setAttribute('title', `Priority ${pri}`);
    }

    // Remaining text
    const restOfText = task.text;
    if (restOfText) {
      taskText.appendText(' ');
      this.renderTaskTextWithLinks(restOfText, taskText);
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
    const lastSlash = task.path.lastIndexOf('/');
    const baseName = lastSlash >= 0 ? task.path.slice(lastSlash + 1) : task.path;
    fileInfo.setText(`${baseName}:${task.line + 1}`);
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

  // Replace only the LI subtree for the given task (state-driven, idempotent)
  private refreshTaskElement(task: Task): void {
    const container = this.contentEl;
    const list = container.querySelector('ul.todo-list');
    if (!list) return;

    const selector = `li.todo-item[data-path="${CSS.escape(task.path)}"][data-line="${task.line}"]`;
    const existing = list.querySelector(selector);
    const freshLi = this.buildTaskListItem(task);

    if (existing && existing.parentElement === list) {
      list.replaceChild(freshLi, existing);
    } else {
      // Fallback: append if not found (shouldn't normally happen)
      list.appendChild(freshLi);
    }
  }

  /** Recalculate visible tasks for current mode + search and update only the list subtree */
  refreshVisibleList(): void {
    const container = this.contentEl;

    // Sync dropdown with current sort method
    const sortDropdown = container.querySelector('.sort-dropdown select') as HTMLSelectElement;
    if (sortDropdown) {
      const currentSortMethod = this.getSortMethod();
      sortDropdown.value = currentSortMethod;
    }

    // Ensure list container exists and is the sole place for items
    let list = container.querySelector('ul.todo-list');
    if (!list) {
      list = container.createEl('ul', { cls: 'todo-list' });
    }
    list.empty();

    const mode = this.getViewMode();
    const allTasks = this.tasks ?? [];
    let visible = this.transformForView(allTasks, mode);

    // Apply search filtering
    const q = this.getSearchQuery().trim();
    if (q.length > 0) {
      try {
        // Use new advanced search functionality
        visible = visible.filter(t => {
          return Search.evaluate(q, t, this.isCaseSensitive, this.settings);
        });
        this.searchError = null;
      } catch (error) {
        // If there's an error in parsing, fall back to simple search
        const searchQuery = this.isCaseSensitive ? q : q.toLowerCase();
        const searchText = this.isCaseSensitive ? (text: string) => text : (text: string) => text.toLowerCase();
        
        visible = visible.filter(t => {
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
    const searchResultsCount = container.querySelector('.search-results-result-count');
    if (searchResultsCount) {
      searchResultsCount.setText(`${visible.length} of ${allTasks.length} task` + (allTasks.length === 1 ? '' : 's'));
    }

    // Display search error if present
    const searchErrorContainer = container.querySelector('.search-error-container');
    if (this.searchError) {
      if (!searchErrorContainer) {
        const errorContainer = container.createEl('div', { cls: 'search-error-container' });
        const errorEl = errorContainer.createEl('div', { cls: 'search-error' });
        errorEl.setText(this.searchError);
      }
    } else {
      if (searchErrorContainer) {
        searchErrorContainer.detach();
      }
    }

    // Empty-state guidance UI
    if (visible.length === 0) {
      // Remove any previous empty-state
      const prevEmpty = container.querySelector('.todo-empty');
      if (prevEmpty) prevEmpty.detach?.();

      // Determine scenario
      const hasAnyTasks = allTasks.length > 0;
      const hasAnyIncomplete = allTasks.some(t => !t.completed);
      const isHideCompleted = mode === 'hideCompleted';

      // Build empty message container (below toolbar, above list)
      const empty = container.createEl('div', { cls: 'todo-empty' });

      const title = empty.createEl('div', { cls: 'todo-empty-title' });
      const subtitle = empty.createEl('div', { cls: 'todo-empty-subtitle' });

      if (!hasAnyTasks) {
        // a) No tasks found at all
        title.setText('No tasks found');
        subtitle.setText('Create tasks in your notes using "TODO Your task". They will appear here automatically.');
      } else if (isHideCompleted && !hasAnyIncomplete) {
        // b) Hide-completed enabled, but only completed tasks exist
        title.setText('All tasks are completed');
        subtitle.setText('You are hiding completed tasks. Switch view mode or add new tasks to see more.');
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

    // Render visible tasks
    for (const task of visible) {
      const li = this.buildTaskListItem(task);
      list.appendChild(li);
    }
  }

  // Obsidian lifecycle methods for view open: keyed, minimal render
  async onOpen() {
    const container = this.contentEl;
    container.empty();
    container.addClass('todo-view');

    // Toolbar
    this.buildToolbar(container);

    // Setup search suggestions dropdown
    this.setupSearchSuggestions();

    // Initial list render (preserves focus since toolbar/input already exists)
    this.refreshVisibleList();

    // Keyboard shortcuts: Slash to focus search, Esc to clear
    const input: HTMLInputElement | null = this.searchInputEl ?? null;
    const keyHandler = (evt: KeyboardEvent) => {
      const active = document.activeElement as HTMLElement | null;
      const isTyping =
        !!active &&
        (active.tagName === 'INPUT' ||
          active.tagName === 'TEXTAREA' ||
          (active as unknown as { isContentEditable?: boolean }).isContentEditable === true);

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
          this.refreshVisibleList(); // re-render cleared without losing focus context
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
  private getDateStatusClasses(date: Date | null, isDeadline = false): string[] {
    if (!date) return [];
    
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const taskDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    
    const diffTime = taskDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
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
    const dateContainer = parent.createEl('div', { cls: 'todo-date-container' });
    
    // Display scheduled date
    if (task.scheduledDate) {
      const scheduledDiv = dateContainer.createEl('div', {
        cls: this.getDateStatusClasses(task.scheduledDate, false)
      });
      
      const scheduledLabel = scheduledDiv.createEl('span', { cls: 'date-label' });
      scheduledLabel.setText('Scheduled: ');
      
      const scheduledValue = scheduledDiv.createEl('span', { cls: 'date-value' });
      scheduledValue.setText(this.formatDateForDisplay(task.scheduledDate, true));
    }
    
    // Display deadline date
    if (task.deadlineDate) {
      const deadlineDiv = dateContainer.createEl('div', {
        cls: this.getDateStatusClasses(task.deadlineDate, true)
      });
      
      const deadlineLabel = deadlineDiv.createEl('span', { cls: 'date-label' });
      deadlineLabel.setText('Deadline: ');
      
      const deadlineValue = deadlineDiv.createEl('span', { cls: 'date-value' });
      deadlineValue.setText(this.formatDateForDisplay(task.deadlineDate, true));
    }
  }

  /** Strip Markdown formatting to produce display-only plain text */
  private stripMarkdown(input: string): string {
    if (!input) return '';
    let out = input;

    // HTML tags - use DOMParser to safely strip HTML tags
    const doc = new DOMParser().parseFromString(out, 'text/html');
    out = doc.body.textContent || '';

    // Images: ![alt](url) -> alt
    out = out.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1');

    // Inline code: `code` -> code
    out = out.replace(/`([^`]+)`/g, '$1');

    // Headings
    out = out.replace(/^\s{0,3}#{1,6}\s+/gm, '');

    // Emphasis/strong
    out = out.replace(/(\*\*|__)(.*?)\1/g, '$2');
    out = out.replace(/(\*|_)(.*?)\1/g, '$2');

    // Strike/highlight/math
    out = out.replace(/~~(.*?)~~/g, '$1');
    out = out.replace(/==(.*?)==/g, '$1');
    out = out.replace(/\$\$(.*?)\$\$/g, '$1');

    // Normalize whitespace
    out = out.replace(/\r/g, '');
    out = out.replace(/[ \t]+\n/g, '\n');
    out = out.replace(/\n{3,}/g, '\n\n');
    out = out.trim();

    return out;
  }

  // Render Obsidian-style links and tags as non-clickable, styled spans inside task text.
  // Supports:
  //  - Wiki links: [[Note]] and [[Note|Alias]]
  //  - Markdown links: [Alias](url-or-path)
  //  - Bare URLs: http(s)://...
  //  - Tags: #tag
  private renderTaskTextWithLinks(text: string, parent: HTMLElement) {
    // For display only, strip any markdown formatting first
    const textToProcess = this.stripMarkdown(text) || '';
    const patterns: { type: 'wiki' | 'md' | 'url' | 'tag'; regex: RegExp; }[] = [
      // [[Page]] or [[Page|Alias]]
      { type: 'wiki', regex: /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g },
      // [Alias](target)
      { type: 'md', regex: /\[([^\]]+)\]\(([^)]+)\)/g },
      // bare URLs
      { type: 'url', regex: /\bhttps?:\/\/[^\s)]+/g },
      // #tags (must come after URLs to avoid conflicts with URLs containing #)
      { type: 'tag', regex: /#([^\s\])[}{>]+)/g },
    ];

    let i = 0;
    while (i < textToProcess.length) {
      let nextMatch: { type: 'wiki' | 'md' | 'url' | 'tag'; match: RegExpExecArray; } | null = null;

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
    const isMiddle = (evt.button === 1);
    const metaOrCtrl = isMac ? evt.metaKey : evt.ctrlKey;

    // Helpers
    const isMarkdownLeaf = (leaf: WorkspaceLeaf | null | undefined): boolean => {
      if (!leaf) return false;
      if (leaf.view instanceof MarkdownView) return true;
      return leaf.view?.getViewType?.() === 'markdown';
    };
    const isTodoSeqLeaf = (leaf: WorkspaceLeaf | null | undefined): boolean => {
      if (!leaf) return false;
      return leaf.view instanceof TodoView;
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
    // Each page should own its tab. Only "reuse" when it's the same file.
    const findReusableMarkdownLeaf = (): WorkspaceLeaf | null => {
      // Only return a leaf if it's already showing this exact file.
      return findExistingLeafForFile();
    };

    const forceNewTab = isMiddle || metaOrCtrl;
    const doSplit = evt.shiftKey;

    let targetLeaf: WorkspaceLeaf | null = null;

    if (doSplit) {
      // New behavior: if the file is already open, focus that existing tab instead of creating a split.
      const existing = findExistingLeafForFile();
      if (existing) {
        targetLeaf = existing;
      } else {
        targetLeaf = workspace.getLeaf('split');
        // Guard: ensure not TODOseq and is a markdown-capable leaf
        if (isTodoSeqLeaf(targetLeaf) || !isMarkdownLeaf(targetLeaf)) {
          targetLeaf = findReusableMarkdownLeaf() ?? workspace.getLeaf('tab');
        }
      }
    } else if (forceNewTab) {
      targetLeaf = workspace.getLeaf('tab');
      if (isTodoSeqLeaf(targetLeaf) || !isMarkdownLeaf(targetLeaf)) {
        targetLeaf = findReusableMarkdownLeaf() ?? workspace.getLeaf('tab');
      }
    } else {
      targetLeaf = findExistingLeafForFile();
      if (!targetLeaf) {
        targetLeaf = findReusableMarkdownLeaf();
      }
      if (!targetLeaf) {
        targetLeaf = workspace.getLeaf('tab');
      }
      if (isTodoSeqLeaf(targetLeaf)) {
        targetLeaf = findReusableMarkdownLeaf() ?? workspace.getLeaf('tab');
      }
    }

    await targetLeaf.openFile(file);

    if (evt.altKey) {
      try { (targetLeaf as WorkspaceLeaf & { setPinned?: (pinned: boolean) => void }).setPinned?.(true); } catch (_) { /* ignore */ }
      try { ((targetLeaf as WorkspaceLeaf) as { pinned?: boolean }).pinned = true; } catch (_) { /* ignore */ }
    }

    if (targetLeaf.view instanceof MarkdownView) {
      const markdownView = targetLeaf.view;
      const editor = markdownView.editor;
      const pos = { line: task.line, ch: 0 };
      editor.setCursor(pos);
      try { (markdownView as unknown as { setEphemeralState?: (state: { line: number; col: number }) => void }).setEphemeralState?.({ line: task.line, col: 0 }); } catch (_) {}
      editor.scrollIntoView({ from: pos, to: pos });
    }

    await workspace.revealLeaf(targetLeaf);
  }

 // Cleanup listeners
 async onClose() {
   const handler = this._searchKeyHandler as ((e: KeyboardEvent) => void) | undefined;
   if (handler) {
     window.removeEventListener('keydown', handler);
     this._searchKeyHandler = undefined;
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
   
   this.searchInputEl = null;
   await (super.onClose?.());
 }
}

