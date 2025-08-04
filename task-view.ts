import { ItemView, WorkspaceLeaf, Menu, TFile, Platform, MarkdownView } from 'obsidian';
import TodoTracker, { TASK_VIEW_ICON } from './main';
import { TaskEditor } from './task-editor';
import { Task, NEXT_STATE, DEFAULT_ACTIVE_STATES, DEFAULT_PENDING_STATES, DEFAULT_COMPLETED_STATES } from './task';


export class TodoView extends ItemView {
  static viewType = "todoseq-view";
  tasks: Task[];
  editor: TaskEditor;
  private defaultViewMode: TaskViewMode;

  constructor(leaf: WorkspaceLeaf, tasks: Task[], defaultViewMode: TaskViewMode) {
    super(leaf);
    this.tasks = tasks;
    this.editor = new TaskEditor(this.app);
    this.defaultViewMode = defaultViewMode;
  }

  /** View-mode accessors persisted on the root element to avoid cross-class coupling */
  private getViewMode(): TaskViewMode {
    const attr = this.contentEl.getAttr('data-view-mode') as TaskViewMode | null;
    if (attr === 'default' || attr === 'sortCompletedLast' || attr === 'hideCompleted') return attr;
    // Fallback to current plugin setting from constructor if attribute not set
    if (this.defaultViewMode === 'default' || this.defaultViewMode === 'sortCompletedLast' || this.defaultViewMode === 'hideCompleted') {
      return this.defaultViewMode;
    }
    // Final safety fallback
    return 'default';
  }
  setViewMode(mode: TaskViewMode) {
    this.contentEl.setAttr('data-view-mode', mode);
  }

  /** Non-mutating transform for rendering */
  private transformForView(tasks: Task[], mode: TaskViewMode): Task[] {
    if (mode === 'hideCompleted') {
      return tasks.filter(t => !t.completed);
    }
    if (mode === 'sortCompletedLast') {
      const pending: Task[] = [];
      const done: Task[] = [];
      for (const t of tasks) {
        (t.completed ? done : pending).push(t);
      }
      return pending.concat(done);
    }
    return tasks.slice();
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

    // Right-aligned search input
    const searchWrap = toolbar.createEl('div', { cls: 'todo-toolbar-right' });
    const searchId = `todoseq-search-${Math.random().toString(36).slice(2, 8)}`;
    const label = searchWrap.createEl('label', { attr: { for: searchId } });
    label.setText('Search');
    label.addClass('sr-only');

    const input = searchWrap.createEl('input', { cls: 'todo-search-input', attr: { id: searchId, type: 'search', placeholder: 'Search tasks…', 'aria-label': 'Search tasks' } }) as HTMLInputElement;
    input.value = this.getSearchQuery();
    input.addEventListener('input', () => {
      // Update attribute and re-render list only, preserving focus
      this.setSearchQuery(input.value);
      this.refreshVisibleList();
    });

    const group = toolbar.createEl('div', { cls: 'todo-mode-icons' });
    group.setAttr('role', 'group');
    group.setAttr('aria-label', 'Task view mode');

    type ButtonSpec = {
      mode: TaskViewMode;
      title: string;
      iconCls: string;
    };

    const buttons: ButtonSpec[] = [
      { mode: 'default',           title: 'Default view',          iconCls: 'todo-icon-list' },
      { mode: 'sortCompletedLast', title: 'Sort completed to end', iconCls: 'todo-icon-sort-end' },
      { mode: 'hideCompleted',     title: 'Hide completed',        iconCls: 'todo-icon-eye-off' },
    ];

    // Helper to sync aria-pressed on all mode buttons based on current view mode
    const updateModeButtons = () => {
      const activeMode = this.getViewMode();
      const buttons = group.querySelectorAll<HTMLButtonElement>('button.todo-mode-icon-btn');
      buttons.forEach((b) => {
        const m = b.getAttr('data-mode') as TaskViewMode | null;
        b.setAttr('aria-pressed', String(m === activeMode));
      });
    };

    const makeHandler = (mode: TaskViewMode) => async () => {
      this.setViewMode(mode);
      // Update button pressed state to reflect newly selected mode
      updateModeButtons();
      const evt = new CustomEvent('todoseq:view-mode-change', { detail: { mode } });
      window.dispatchEvent(evt);
      // Lighter refresh: only re-render the visible list instead of full onOpen
      this.refreshVisibleList();
    };

    for (const spec of buttons) {
      const btn = group.createEl('button', { cls: 'todo-mode-icon-btn' });
      btn.setAttr('type', 'button');
      btn.setAttr('data-mode', spec.mode);
      btn.setAttr('title', spec.title);
      btn.setAttr('aria-label', spec.title);
      // aria-pressed will be set by updateModeButtons; initialize to false to avoid flicker
      btn.setAttr('aria-pressed', String(false));
      const icon = btn.createSpan({ cls: ['todo-mode-icon', spec.iconCls] });
      icon.setAttr('aria-hidden', 'true');
      btn.addEventListener('click', makeHandler(spec.mode));
    }

    // After creating buttons, ensure correct one is marked pressed for initial state
    updateModeButtons();

    // Keep a reference for keyboard handlers to focus later
    (this as any)._searchInputEl = input;
  }

  // Cycle state via NEXT_STATE using TaskEditor
  private async updateTaskState(task: Task, nextState): Promise<void> {
    // Construct editor bound to this vault so methods don't need App
    const updated = await this.editor.updateTaskState(task, nextState);
    // Sync in-memory task from returned snapshot
    task.rawText = updated.rawText;
    task.state = updated.state as Task['state'];
    task.completed = updated.completed;
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

    const plugin = (this.app as any).plugins?.plugins?.['todoseq'] as TodoTracker | undefined;
    const configured = (plugin?.settings as any)?.additionalTaskKeywords as string[] | undefined;
    const additional = Array.isArray(configured) ? configured.filter(Boolean) : [];

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
      { group: 'Not Completed', states: nonCompleted.filter(s => s && s !== current) },
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
    if ((menu as any).showAtMouseEvent) {
      (menu as any).showAtMouseEvent(evt);
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
    checkbox.checked = task.completed;

    checkbox.addEventListener('change', async () => {
      const targetState = checkbox.checked ? 'DONE' : 'TODO';
      await this.updateTaskState(task, targetState);
      const mode = this.getViewMode();
      if (mode !== 'default') {
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
    const taskText = this.buildText(task, li);

    // File info
    const fileInfo = li.createEl('div', { cls: 'todo-file-info' });
    const lastSlash = task.path.lastIndexOf('/');
    const baseName = lastSlash >= 0 ? task.path.slice(lastSlash + 1) : task.path;
    fileInfo.setText(`${baseName}:${task.line + 1}`);
    fileInfo.setAttribute('title', task.path);

    // Click to open source (avoid checkbox and keyword)
    li.addEventListener('click', (evt) => {
      if (evt.target !== checkbox && !(evt.target as HTMLElement).hasClass('todo-keyword')) {
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
    const q = this.getSearchQuery().toLowerCase().trim();
    if (q.length > 0) {
      visible = visible.filter(t => {
        const baseName = t.path.slice(t.path.lastIndexOf('/') + 1);
        return (
          (t.rawText && t.rawText.toLowerCase().includes(q)) ||
          (t.text && t.text.toLowerCase().includes(q)) ||
          (t.path && t.path.toLowerCase().includes(q)) ||
          (baseName && baseName.toLowerCase().includes(q))
        );
      });
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

    // Initial list render (preserves focus since toolbar/input already exists)
    this.refreshVisibleList();

    // Keyboard shortcuts: Slash to focus search, Esc to clear
    const input: HTMLInputElement | null = (this as any)._searchInputEl ?? null;
    const keyHandler = (evt: KeyboardEvent) => {
      const active = document.activeElement as HTMLElement | null;
      const isTyping =
        active &&
        (active.tagName === 'INPUT' ||
          active.tagName === 'TEXTAREA' ||
          (active as any).isContentEditable);

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
    (this as any)._searchKeyHandler = keyHandler;
    window.addEventListener('keydown', keyHandler);
  }

  /** Strip Markdown formatting to produce display-only plain text */
  private stripMarkdown(input: string): string {
    if (!input) return '';
    let out = input;

    // HTML tags
    out = out.replace(/<[^>]+>/g, '');

    // Images: ![alt](url) -> alt
    out = out.replace(/!\[([^\]]*)\]\([^\)]*\)/g, '$1');

    // Inline code: `code` -> code
    out = out.replace(/`([^`]+)`/g, '$1');

    // Headings
    out = out.replace(/^\s{0,3}#{1,6}\s+/gm, '');

    // Emphasis/strong/strike
    out = out.replace(/(\*\*|__)(.*?)\1/g, '$2');
    out = out.replace(/(\*|_)(.*?)\1/g, '$2');
    out = out.replace(/~~(.*?)~~/g, '$1');

    // Normalize whitespace
    out = out.replace(/\r/g, '');
    out = out.replace(/[ \t]+\n/g, '\n');
    out = out.replace(/\n{3,}/g, '\n\n');
    out = out.trim();

    return out;
  }

  // Render Obsidian-style links as non-clickable, link-like spans inside task text.
  // Supports:
  //  - Wiki links: [[Note]] and [[Note|Alias]]
  //  - Markdown links: [Alias](url-or-path)
  //  - Bare URLs: http(s)://...
  private renderTaskTextWithLinks(text: string, parent: HTMLElement) {
    // For display only, strip any markdown formatting first
    const textToProcess = this.stripMarkdown(text) || '';
    const patterns: { type: 'wiki' | 'md' | 'url'; regex: RegExp; }[] = [
      // [[Page]] or [[Page|Alias]]
      { type: 'wiki', regex: /\[\[([^\]\|]+)(?:\|([^\]]+))?\]\]/g },
      // [Alias](target)
      { type: 'md', regex: /\[([^\]]+)\]\(([^)]+)\)/g },
      // bare URLs
      { type: 'url', regex: /\bhttps?:\/\/[^\s)]+/g },
    ];

    let i = 0;
    while (i < textToProcess.length) {
      let nextMatch: { type: 'wiki' | 'md' | 'url'; match: RegExpExecArray; } | null = null;

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

      // Create a non-interactive, link-like span
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

      // Advance past the match
      i = nextMatch.match.index + nextMatch.match[0].length;
    }
  }

  // Open the source file in the vault where the task is declared, honoring Obsidian default-like modifiers.
  // Behavior:
  // - Default click (no modifiers): open in new tab.
  // - Cmd (mac) / Ctrl (win/linux) click, or Middle-click: open in new tab.
  // - Shift-click: open in split.
  // - Alt-click: pin the target leaf after opening.
  async openTaskLocation(evt: MouseEvent, task: Task) {
    const file = this.app.vault.getAbstractFileByPath(task.path);
    if (!(file instanceof TFile)) return;

    const { workspace } = this.app;

    const isMac = Platform.isMacOS;
    const isMiddle = (evt.button === 1);
    const metaOrCtrl = isMac ? evt.metaKey : evt.ctrlKey;

    // Determine open mode. Default is 'tab' (per user request).
    let openMode: 'split' | 'tab' = 'tab';
    if (evt.shiftKey) {
      openMode = 'split';
    } else if (isMiddle || metaOrCtrl) {
      openMode = 'tab';
    }

    let leaf: WorkspaceLeaf;
    if (openMode === 'split') {
      leaf = workspace.getLeaf('split');
    } else {
      leaf = workspace.getLeaf('tab');
    }

    await leaf.openFile(file);

    // Pin if Alt pressed
    if (evt.altKey) {
      try { (leaf as any).setPinned?.(true); } catch (_) { }
    }

    // Position cursor and scroll to line
    const markdownView = leaf.view instanceof MarkdownView ? leaf.view : null;
    if (markdownView) {
      const editor = markdownView.editor;
      const pos = { line: task.line, ch: 0 };
      editor.setCursor(pos);
      editor.scrollIntoView({ from: pos, to: pos });
    }

    await workspace.revealLeaf(leaf);
  }

 // Cleanup listeners
 async onClose() {
   const handler = (this as any)._searchKeyHandler as ((e: KeyboardEvent) => void) | undefined;
   if (handler) {
     window.removeEventListener('keydown', handler);
     (this as any)._searchKeyHandler = undefined;
   }
   (this as any)._searchInputEl = undefined;
   await super.onClose?.();
 }
}
/** Controls how tasks are displayed in the TodoView */

export type TaskViewMode = 'default' | 'sortCompletedLast' | 'hideCompleted';

