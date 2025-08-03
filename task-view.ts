import { ItemView, WorkspaceLeaf, Menu, TFile, Platform, MarkdownView } from 'obsidian';
import TodoTracker, { TASK_VIEW_TYPE, TASK_VIEW_ICON } from './main';
import { TaskEditor } from './task-editor';
import { Task, TaskViewMode, DEFAULT_SETTINGS, NEXT_STATE } from './types';


export class TodoView extends ItemView {
  static viewType = TASK_VIEW_TYPE;
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
  private setViewMode(mode: TaskViewMode) {
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

  /** Build toolbar with icon-only mode buttons; dispatch event for persistence */
  private buildToolbar(container: HTMLElement) {
    const toolbar = container.createEl('div', { cls: 'todo-toolbar' });

    // Icon-only pill buttons (Default, Sort completed last, Hide completed)
    const current = this.getViewMode();

    const group = toolbar.createEl('div', { cls: 'todo-mode-icons' });
    group.setAttr('role', 'group');
    group.setAttr('aria-label', 'Task view mode');

    type ButtonSpec = {
      mode: TaskViewMode;
      title: string;
      svg: string;
    };

    const buttons: ButtonSpec[] = [
      {
        mode: 'default',
        title: 'Default view',
        svg: `
<svg viewBox="0 0 24 24" aria-hidden="true">
  <path d="M4 6h16" />
  <path d="M4 12h16" />
  <path d="M4 18h16" />
</svg>`.trim()
      },
      {
        mode: 'sortCompletedLast',
        title: 'Sort completed to end',
        svg: `
<svg viewBox="0 0 24 24" aria-hidden="true">
  <path d="M4 6h12" />
  <path d="M4 12h12" />
  <path d="M4 18h8" />
  <path d="M18 7v10" />
  <path d="M15 14l3 3 3-3" />
</svg>`.trim()
      },
      {
        mode: 'hideCompleted',
        title: 'Hide completed',
        svg: `
<svg viewBox="0 0 24 24" aria-hidden="true">
  <path d="M1 12s4-7 11-7 11 7 11 7-2.5 4.375-7 6" />
  <path d="M1 1l22 22" />
</svg>`.trim()
      },
    ];

    const makeHandler = (mode: TaskViewMode) => async () => {
      this.setViewMode(mode);
      const evt = new CustomEvent('todoseq:view-mode-change', { detail: { mode } });
      window.dispatchEvent(evt);
      await this.onOpen();
    };

    for (const spec of buttons) {
      const btn = group.createEl('button', { cls: 'todo-mode-icon-btn' });
      btn.setAttr('type', 'button');
      btn.setAttr('data-mode', spec.mode);
      btn.setAttr('title', spec.title);
      btn.setAttr('aria-label', spec.title);
      btn.setAttr('aria-pressed', String(spec.mode === current));
      btn.innerHTML = spec.svg;
      btn.addEventListener('click', makeHandler(spec.mode));
    }
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

  /** Return full list of state keywords from settings or DEFAULT_SETTINGS */
  private getAllTaskStates(): string[] {
    // Prefer the plugin's current settings provided via the constructor defaultViewMode owner
    // We can safely read DEFAULT_SETTINGS as a fallback
    // Access settings by locating the running plugin instance of this class's owner:
    const plugin = (this.app as any).plugins?.plugins?.['todoseq'] as TodoTracker | undefined;
    const configured = plugin?.settings?.taskKeywords;
    if (Array.isArray(configured) && configured.length > 0) {
      return configured.slice();
    }
    return DEFAULT_SETTINGS.taskKeywords.slice();
  }

  /** Open Obsidian Menu at mouse event location listing states (excluding current) */
  private openStateMenuAtMouseEvent(task: Task, evt: MouseEvent): void {
    evt.preventDefault();
    evt.stopPropagation();
    const menu = new Menu();
    const allStates = this.getAllTaskStates();
    for (const state of allStates) {
      if (!state || state === task.state) continue;
      menu.addItem((item) => {
        item.setTitle(state);
        item.onClick(async () => {
          await this.updateTaskState(task, state);
          this.refreshTaskElement(task);
        });
      });
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
    const allStates = this.getAllTaskStates();
    for (const state of allStates) {
      if (!state || state === task.state) continue;
      menu.addItem((item) => {
        item.setTitle(state);
        item.onClick(async () => {
          await this.updateTaskState(task, state);
          this.refreshTaskElement(task);
        });
      });
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
        await this.onOpen();
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

    // Right-click to open selection menu (Obsidian style)
    todoSpan.addEventListener('contextmenu', (evt: MouseEvent) => {
      this.openStateMenuAtMouseEvent(task, evt);
    });

    // Long-press for mobile
    let touchTimer: number | null = null;
    todoSpan.addEventListener('touchstart', (evt: TouchEvent) => {
      if (evt.touches.length !== 1) return;
      const touch = evt.touches[0];
      touchTimer = window.setTimeout(() => {
        const x = touch.clientX;
        const y = touch.clientY;
        this.openStateMenuAtPosition(task, { x, y });
      }, 450);
    }, { passive: true });
    const clearTouch = () => {
      if (touchTimer) {
        window.clearTimeout(touchTimer);
        touchTimer = null;
      }
    };
    todoSpan.addEventListener('touchend', clearTouch);
    todoSpan.addEventListener('touchcancel', clearTouch);

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

  // Obsidian lifecycle methods for view open: keyed, minimal render
  async onOpen() {
    const container = this.contentEl;
    container.empty();
    container.addClass('todo-view');

    // Toolbar
    this.buildToolbar(container);

    const mode = this.getViewMode();
    const taskList = container.createEl('ul', { cls: 'todo-list' });

    const visible = this.transformForView(this.tasks, mode);
    for (const task of visible) {
      const li = this.buildTaskListItem(task);
      taskList.appendChild(li);
    }
  }

  // Render Obsidian-style links as non-clickable, link-like spans inside task text.
  // Supports:
  //  - Wiki links: [[Note]] and [[Note|Alias]]
  //  - Markdown links: [Alias](url-or-path)
  //  - Bare URLs: http(s)://...
  private renderTaskTextWithLinks(text: string, parent: HTMLElement) {
    const patterns: { type: 'wiki' | 'md' | 'url'; regex: RegExp; }[] = [
      // [[Page]] or [[Page|Alias]]
      { type: 'wiki', regex: /\[\[([^\]\|]+)(?:\|([^\]]+))?\]\]/g },
      // [Alias](target)
      { type: 'md', regex: /\[([^\]]+)\]\(([^)]+)\)/g },
      // bare URLs
      { type: 'url', regex: /\bhttps?:\/\/[^\s)]+/g },
    ];

    let i = 0;
    while (i < text.length) {
      let nextMatch: { type: 'wiki' | 'md' | 'url'; match: RegExpExecArray; } | null = null;

      for (const p of patterns) {
        p.regex.lastIndex = i;
        const m = p.regex.exec(text);
        if (m) {
          if (!nextMatch || m.index < nextMatch.match.index) {
            nextMatch = { type: p.type, match: m };
          }
        }
      }

      if (!nextMatch) {
        // Append any remaining text
        parent.appendText(text.slice(i));
        break;
      }

      // Append plain text preceding the match
      if (nextMatch.match.index > i) {
        parent.appendText(text.slice(i, nextMatch.match.index));
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
}
