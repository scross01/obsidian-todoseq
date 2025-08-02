import { App, Plugin, PluginSettingTab, Setting, TFile, TAbstractFile, MarkdownView, WorkspaceLeaf, ItemView, Platform } from 'obsidian';
import { Task, TodoTrackerSettings, DEFAULT_SETTINGS, COMPLETED_STATES, NEXT_STATE, TaskViewMode } from './types';
import { TaskParser } from './task-parser';
import { TaskEditor } from './task-editor';

const TASK_VIEW_TYPE = "todo-view";
const TASK_VIEW_ICON = "list-todo";

export default class TodoTracker extends Plugin {
  settings: TodoTrackerSettings;
  tasks: Task[] = [];
  refreshIntervalId: number;

  // Parser instance configured from current settings
  private parser: TaskParser | null = null;

  // Shared comparator to avoid reallocation and ensure consistent ordering
  private readonly taskComparator = (a: Task, b: Task): number => {
    if (a.path === b.path) return a.line - b.line;
    return a.path.localeCompare(b.path);
  };

 // Obsidian lifecycle method called when the plugin is loaded.
  async onload() {
    await this.loadSettings();

    // Register the custom view type
    this.registerView(
      TASK_VIEW_TYPE,
      (leaf) => new TodoView(leaf, this.tasks, this.settings.taskViewMode)
    );
 
    // Persist view-mode changes coming from TodoView toolbars
    const handler = async (e: Event) => {
      const detail = (e as CustomEvent).detail as { mode: TaskViewMode };
      if (!detail?.mode) return;
      this.settings.taskViewMode = detail.mode;
      await this.saveSettings();
      await this.refreshOpenTaskViews();
    };
    window.addEventListener('todoseq:view-mode-change', handler);
    this.register(() => window.removeEventListener('todoseq:view-mode-change', handler));
 
    this.addRibbonIcon(TASK_VIEW_ICON, 'Open TODOseq', () => {
      this.showTasks();
    });

    // Add settings tab
    this.addSettingTab(new TodoTrackerSettingTab(this.app, this));

    // Add command to show tasks
    this.addCommand({
      id: 'show-todo-tasks',
      name: 'Show TODO tasks',
      callback: () => this.showTasks()
    });

    // Initial scan
    await this.scanVault();

    // If the Task view tab is already open when the plugin reloads, refresh it
    await this.refreshOpenTaskViews();

    // Set up periodic refresh
    this.setupPeriodicRefresh();

    // Register file change events
    this.registerEvent(
      this.app.vault.on('modify', (file) => this.handleFileChange(file))
    );
    this.registerEvent(
      this.app.vault.on('delete', (file) => this.handleFileChange(file))
    );
    this.registerEvent(
      this.app.vault.on('create', (file) => this.handleFileChange(file))
    );
    this.registerEvent(
      // Obsidian passes (file, oldPath) for rename
      this.app.vault.on('rename', (_file, oldPath) => this.handleFileRename(oldPath))
    );
  }

  // Helper: refresh all open Todo views to reflect this.tasks
  private async refreshOpenTaskViews(): Promise<void> {
    const leaves = this.app.workspace.getLeavesOfType(TASK_VIEW_TYPE);
    for (const leaf of leaves) {
      const view = leaf.view as TodoView;
      view.tasks = this.tasks;
      await view.onOpen();
    }
  }

  // Obsidian lifecycle method called when the plugin is unloaded
  onunload() {
    clearInterval(this.refreshIntervalId);
  }

  // Obsidian lifecycle method called to settings are loaded
  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    // If user cleared keywords, use defaults at runtime
    if (!this.settings.taskKeywords || this.settings.taskKeywords.length === 0) {
      this.settings.taskKeywords = [...DEFAULT_SETTINGS.taskKeywords];
    }
    // Recreate parser whenever settings are loaded (keywords may have changed)
    this.parser = TaskParser.create(this.settings);
  }

  // Obsidian lifecycle method called to save settings
  async saveSettings() {
    await this.saveData(this.settings);
  }

  // Serialize scans to avoid overlapping runs
  private _isScanning = false;

  // Run a regular refresh of the vault based on the refresh inerval
  setupPeriodicRefresh() {
    // Clear any previous interval
    clearInterval(this.refreshIntervalId);

    // Use a serialized async tick to avoid overlap and unhandled rejections
    this.refreshIntervalId = window.setInterval(async () => {
      if (this._isScanning) return;
      this._isScanning = true;
      try {
        await this.scanVault();
        await this.refreshOpenTaskViews();
      } catch (err) {
        console.error('TODOseq periodic scan error', err);
      } finally {
        this._isScanning = false;
      }
    }, this.settings.refreshInterval * 1000);
  }

  // Yield a frame to keep UI responsive during long operations
  private async yieldToEventLoop(): Promise<void> {
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
  }

  // Scan the Obsidian Vault for tasks
  async scanVault() {
    if (this._isScanning) return;
    this._isScanning = true;
    try {
      this.tasks = [];
      const files = this.app.vault.getFiles();

      // Yield configuration: how often to yield a frame while scanning
      const YIELD_EVERY_FILES = 20;
      let processedMd = 0;

      for (const file of files) {
        if (file.extension === 'md') {
          await this.scanFile(file);
          processedMd++;

          if (processedMd % YIELD_EVERY_FILES === 0) {
            // Yield to the event loop to keep UI responsive during large scans
            await this.yieldToEventLoop();
          }
        }
      }
      // Default sort
      this.tasks.sort(this.taskComparator);
    } finally {
      this._isScanning = false;
    }
  }

  // Scan a single file for tasks
  async scanFile(file: TFile) {
    const content = await this.app.vault.read(file);

    if (!this.parser) {
      // Lazily create if not already set (should be set by loadSettings)
      this.parser = TaskParser.create(this.settings);
    }

    const parsed = this.parser.parseFile(content, file.path);
    this.tasks.push(...parsed);
  }

  // Handle file change, rescan for tasks
  async handleFileChange(file: TAbstractFile) {
    try {
      // Only process Markdown files
      if (!(file instanceof TFile) || file.extension !== 'md') return;

      // Remove existing tasks for this file (path-safe even if file was deleted/renamed)
      this.tasks = this.tasks.filter(task => task.path !== file.path);

      // Check if the file still exists before attempting to read it (delete events)
      const stillExists = this.app.vault.getAbstractFileByPath(file.path) instanceof TFile;
      if (stillExists) {
        // Re-scan the file
        await this.scanFile(file);
      }

      // Maintain default sort after incremental updates
      this.tasks.sort(this.taskComparator);

      // Refresh all open TodoView leaves
      await this.refreshOpenTaskViews();
    } catch (err) {
      console.error('TODOseq handleFileChange error', err);
      // Best-effort UI refresh so view doesn't get stuck
      try { await this.refreshOpenTaskViews(); } catch (_) {}
    }
  }

  // Handle rename: remove tasks for the old path, then refresh views.
  // The new file path will trigger modify/create separately and be rescanned there.
  private async handleFileRename(oldPath: string) {
    try {
      this.tasks = this.tasks.filter(t => t.path !== oldPath);
      // Keep sorted state
      this.tasks.sort(this.taskComparator);
      await this.refreshOpenTaskViews();
    } catch (err) {
      console.error('TODOseq handleFileRename error', err);
      try { await this.refreshOpenTaskViews(); } catch (_) {}
    }
  }
  
  // Show tasks in the task view
  showTasks() {
    const { workspace } = this.app;
    
    // Create new leaf or use existing
    let leaf: WorkspaceLeaf | null = null;
    const leaves = workspace.getLeavesOfType(TASK_VIEW_TYPE);

    if (leaves.length > 0) {
      leaf = leaves[0];
    } else {
      leaf = workspace.getLeaf(true);
      leaf.setViewState({ type: TASK_VIEW_TYPE, active: true });
    }
    if (leaf) {
      this.app.workspace.revealLeaf(leaf);
    }
  }
}

class TodoView extends ItemView {
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

    todoSpan.addEventListener('click', (evt) => activate(evt));
    todoSpan.addEventListener('keydown', (evt: KeyboardEvent) => {
      const key = evt.key;
      if (key === 'Enter' || key === ' ') {
        evt.preventDefault();
        evt.stopPropagation();
        activate(evt);
      }
    });

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
    const patterns: { type: 'wiki' | 'md' | 'url'; regex: RegExp }[] = [
      // [[Page]] or [[Page|Alias]]
      { type: 'wiki', regex: /\[\[([^\]\|]+)(?:\|([^\]]+))?\]\]/g },
      // [Alias](target)
      { type: 'md', regex: /\[([^\]]+)\]\(([^)]+)\)/g },
      // bare URLs
      { type: 'url', regex: /\bhttps?:\/\/[^\s)]+/g },
    ];

    let i = 0;
    while (i < text.length) {
      let nextMatch: { type: 'wiki' | 'md' | 'url'; match: RegExpExecArray } | null = null;

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
      try { (leaf as any).setPinned?.(true); } catch (_) {}
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

class TodoTrackerSettingTab extends PluginSettingTab {
  plugin: TodoTracker;

  constructor(app: App, plugin: TodoTracker) {
    super(app, plugin);
    this.plugin = plugin;
  }

  private refreshAllTaskViews = async () => {
    const leaves = this.app.workspace.getLeavesOfType(TASK_VIEW_TYPE);
    for (const leaf of leaves) {
      const view = leaf.view as TodoView;
      view.tasks = this.plugin.tasks;
      // Sync each view's mode from settings before render
      const mode = this.plugin.settings.taskViewMode;
      (view as any).setViewMode?.(mode);
      await view.onOpen();
    }
  };

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    
    new Setting(containerEl)
      .setName('Refresh Interval')
      .setDesc('How often to rescan the vault for TODOs (in seconds)')
      .addSlider(slider => slider
        .setLimits(10, 300, 10)
        .setValue(this.plugin.settings.refreshInterval)
        .setDynamicTooltip()
        .onChange(async (value) => {
          this.plugin.settings.refreshInterval = value;
          await this.plugin.saveSettings();
          this.plugin.setupPeriodicRefresh();
          await this.refreshAllTaskViews();
        }));
  
    new Setting(containerEl)
      .setName('Task Keywords')
      .setDesc('Keywords to scan for (e.g. TODO, FIXME). Leave empty to use defaults.')
      .addText(text => {
        const effective = (this.plugin.settings.taskKeywords && this.plugin.settings.taskKeywords.length > 0)
          ? this.plugin.settings.taskKeywords
          : DEFAULT_SETTINGS.taskKeywords;
        text
          .setValue(effective.join(', '))
          .onChange(async (value) => {
            const parsed = value
              .split(',')
              .map(k => k.trim())
              .filter(k => k.length > 0);
            // Save exactly what the user typed (possibly empty)
            this.plugin.settings.taskKeywords = parsed;
            await this.plugin.saveSettings();
            // Recreate parser according to new settings and rescan
            (this.plugin as any).parser = TaskParser.create(this.plugin.settings);
            await this.plugin.scanVault();
            await this.refreshAllTaskViews();
          });
        });
  
    new Setting(containerEl)
      .setName('Include tasks inside code blocks')
      .setDesc('When enabled, tasks inside fenced code blocks (``` or ~~~) will be included.')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.includeCodeBlocks)
        .onChange(async (value) => {
          this.plugin.settings.includeCodeBlocks = value;
          await this.plugin.saveSettings();
          // Recreate parser to reflect includeCodeBlocks change and rescan
          (this.plugin as any).parser = TaskParser.create(this.plugin.settings);
          await this.plugin.scanVault();
          await this.refreshAllTaskViews();
        }));

    new Setting(containerEl)
      .setName('Task view mode')
      .setDesc('Choose how completed items are shown in the task view.')
      .addDropdown(drop => {
        drop.addOption('default', 'Default');
        drop.addOption('sortCompletedLast', 'Sort completed to end');
        drop.addOption('hideCompleted', 'Hide completed');
        drop.setValue(this.plugin.settings.taskViewMode);
        drop.onChange(async (value: string) => {
          const mode = (value as TaskViewMode);
          this.plugin.settings.taskViewMode = mode;
          await this.plugin.saveSettings();
          await this.refreshAllTaskViews();
        });
      });
  }
}