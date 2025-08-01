import { App, Plugin, PluginSettingTab, Setting, TFile, TAbstractFile, MarkdownView, WorkspaceLeaf, ItemView } from 'obsidian';

interface Task {
  path: string;    // path to the page in the vault
  line: number;    // line number of the task in the page 
  rawText: string; // original full line
  indent: string;  // leading whitespace before any list marker/state
  listMarker: string; // the exact list marker plus trailing space if present (e.g., "- ", "1. ", "(a) ")
  text: string;    // content after the state keyword with priority token removed
  state: string;   // state keyword, TODO, DOING, DONE etc.
  completed: boolean; // is the task considered complete
  priority: 'high' | 'med' | 'low' | null;
}

interface TodoTrackerSettings {
  refreshInterval: number;    // refresh interval in seconds
  taskKeywords: string[];     // supported task state keywords, used to limit or expand the default set
  includeCodeBlocks: boolean; // when false, tasks inside fenced code blocks are ignored
}

const DEFAULT_SETTINGS: TodoTrackerSettings = {
  refreshInterval: 60, // seconds
  taskKeywords: ['TODO', 'DOING', 'DONE', 'NOW', 'LATER', 'WAIT', 'WAITING', 'IN-PROGRESS', 'CANCELED', 'CANCELLED'],
  includeCodeBlocks: false,
}

const NEXT_STATE = new Map<string, string>([
  ['TODO', 'DOING'],
  ['DOING', 'DONE'],
  ['DONE', 'TODO'],
  ['LATER', 'NOW'],
  ['NOW', 'DONE'],
  ['WAIT', 'IN-PROGRESS'],
  ['WAITING', 'IN-PROGRESS'],
  ['IN-PROGRESS', 'DONE'],
  ['CANCELED', 'TODO'],
  ['CANCELLED', 'TODO'],
]);

const TASK_VIEW_TYPE = "todo-view";
const TASK_VIEW_ICON = "list-todo";


export default class TodoTracker extends Plugin {
  settings: TodoTrackerSettings;
  tasks: Task[] = [];
  refreshIntervalId: number;

  // Compiled regexes for task line recognition:
  // - taskLineTestRegex: quick boolean test
  // - taskLineCaptureRegex: captures indent, optional list marker, and state
  private taskLineTestRegex: RegExp | null = null;
  private taskLineCaptureRegex: RegExp | null = null;

  // Builds and assigns regular expressions for detecting and capturing task lines
  // based on configured or default task keywords.
  buildTaskLineRegex() {
    const list = (this.settings.taskKeywords && this.settings.taskKeywords.length > 0)
      ? this.settings.taskKeywords
      : DEFAULT_SETTINGS.taskKeywords;
    const escaped = list
      .map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('|');
    // Optional list marker after indent:
    //  - bullets: -, *, +
    //  - ordered: \d+[.)] | [A-Za-z][.)] | \([A-Za-z0-9]+\)
    // We capture optional marker plus a single space as one group.
    const listMarkerPart = `(?:(?:[-*+]|\\d+[.)]|[A-Za-z][.)]|\\([A-Za-z0-9]+\\))\\s+)?`;
    // Test regex: ^[ \t]*listMarkerPart(KEYWORD)\s+
    this.taskLineTestRegex = new RegExp(`^[ \\t]*${listMarkerPart}(?:${escaped})\\s+`);
    // Capture regex:
    // 1: indent (spaces/tabs)
    // 2: optional list marker (including trailing space), if present
    // 3: state keyword
    this.taskLineCaptureRegex = new RegExp(`^([ \\t]*)(${listMarkerPart})?(${escaped})\\s+`);
  }

  // Determine whether the provided text matches the task line pattern.
  isTask(text: string): boolean {
    if (!this.taskLineTestRegex) this.buildTaskLineRegex();
    return this.taskLineTestRegex!.test(text);
  }
  
  // Obsidian lifecycle method called when the plugin is loaded.
  async onload() {
    await this.loadSettings();

    // Register the custom view type
    this.registerView(
      TASK_VIEW_TYPE,
      (leaf) => new TodoView(leaf, this.tasks)
    );

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
    // Rebuild regex whenever settings are loaded (keywords may have changed)
    this.buildTaskLineRegex();
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

  // Scan the Obsidian Vault for tasks
  async scanVault() {
    if (this._isScanning) return;
    this._isScanning = true;
    try {
    this.tasks = [];
    const files = this.app.vault.getFiles();
    
    for (const file of files) {
      if (file.extension === 'md') {
        await this.scanFile(file);
      }
    }
    // Default sort: by path asc, then line asc
    const sortByPathThenLine = (a: Task, b: Task) => {
      if (a.path === b.path) return a.line - b.line;
      return a.path.localeCompare(b.path);
    };
    this.tasks.sort(sortByPathThenLine);
    } finally {
      this._isScanning = false;
    }
  }

  // Scan a single file for tasks
  async scanFile(file: TFile) {
    const content = await this.app.vault.read(file);
    const lines = content.split('\n');

    // Ensure regex is built
    if (!this.taskLineCaptureRegex || !this.taskLineTestRegex) this.buildTaskLineRegex();
    const capture = this.taskLineCaptureRegex!;

    // Track whether each line is inside a fenced code block.
    // Supports ``` or ~~~ fences, with optional language, allowing leading spaces.
    let inFence = false;
    let fenceMarker: '`' | '~' | null = null;

    for (let index = 0; index < lines.length; index++) {
      const line = lines[index];

      // Detect fence starts/ends. We count the number of backticks/tilde runs at line start.
      // A fence open is a run of 3 or more of the same char; a fence close is another run
      // of the same char while currently inside a fence.
      const fenceMatch = /^[ \t]*(`{3,}|~{3,})/.exec(line);
      if (fenceMatch) {
        const markerRun = fenceMatch[1]; // e.g. "```" or "~~~~"
        const currentMarker: '`' | '~' = markerRun[0] === '`' ? '`' : '~';
        if (!inFence) {
          inFence = true;
          fenceMarker = currentMarker;
        } else {
          // Only close if marker matches the one used to open
          if (fenceMarker === currentMarker) {
            inFence = false;
            fenceMarker = null;
          }
        }
        // The fence delimiter line itself should not be considered a task.
        // Continue to next line after toggling state.
        continue;
      }

      // Skip task detection if inside a fence and includeCodeBlocks is disabled
      if (inFence && !this.settings.includeCodeBlocks) {
        continue;
      }

      // See if the line matched the task pattern
      if (this.isTask(line)) {
        const m = capture.exec(line);
        if (m) {
          const indent = m[1] ?? '';
          const listMarker = (m[2] ?? '') as string;
          const state = m[3] ?? '';
          const afterPrefix = line.slice(m[0].length);

          // Parse priority token [#A|#B|#C] and remove from display text
          // We only consider the first occurrence and ignore others per "first occurrence wins".
          // Match token boundaries exactly: [#A], [#B], [#C]
          let priority: 'high' | 'med' | 'low' | null = null;

          // Find the first priority token
          const priMatch = /(\s*)\[#([ABC])\](\s*)/.exec(afterPrefix);
          let cleanedText = afterPrefix;
          if (priMatch) {
            const letter = priMatch[2];
            if (letter === 'A') priority = 'high';
            else if (letter === 'B') priority = 'med';
            else if (letter === 'C') priority = 'low';

            // Remove just this first occurrence (including its adjacent spaces captured)
            const before = cleanedText.slice(0, priMatch.index);
            const after = cleanedText.slice(priMatch.index + priMatch[0].length);
            cleanedText = (before + ' ' + after).replace(/[ \t]+/g, ' ').trimStart();
          }

          const text = cleanedText;

          this.tasks.push({
            path: file.path,
            line: index,
            rawText: line,
            indent,
            listMarker,
            text,
            state,
            completed: state === 'DONE' || state === 'CANCELED' || state === 'CANCELLED',
            priority
          });
        }
      }
    }
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
      this.tasks.sort((a, b) => {
        if (a.path === b.path) return a.line - b.line;
        return a.path.localeCompare(b.path);
      });

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
      this.tasks.sort((a, b) => {
        if (a.path === b.path) return a.line - b.line;
        return a.path.localeCompare(b.path);
      });
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
  
  constructor(leaf: WorkspaceLeaf, tasks: Task[]) {
    super(leaf);
    this.tasks = tasks;
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

  // Obsidian lifecycle mothods for view open
  async onOpen() {
    const container = this.contentEl;
    container.empty();
    // Ensure this view inherits Obsidian theme fonts and variables via a scoped root class
    container.addClass('todo-view');
    
    // Create task list
    const taskList = container.createEl('ul', { cls: 'todo-list' });
    
    this.tasks.forEach(task => {
      const taskItem = taskList.createEl('li', { cls: 'todo-item' });
      
      // Checkbox
      const checkbox = taskItem.createEl('input', {
        type: 'checkbox',
        cls: 'todo-checkbox'
      });
      checkbox.checked = task.completed;
      
      // Task text with clickable TODO
      const taskText = taskItem.createEl('span', { cls: 'todo-text' });
      
      // Create clickable TODO span
      const todoSpan = taskText.createEl('span', { cls: 'todo-keyword' });
      todoSpan.setText(task.state);
      todoSpan.addEventListener('click', (evt) => {
        evt.stopPropagation();
        this.toggleTaskStatus(task);
      });

      // Priority badge (if any)
      if (task.priority) {
        const pri = task.priority; // 'high' | 'med' | 'low'
        const badge = taskText.createEl('span', { cls: ['priority-badge', `priority-${pri}`] });
        badge.setText(pri === 'high' ? 'A' : pri === 'med' ? 'B' : 'C');
        badge.setAttribute('aria-label', `Priority ${pri}`);
        badge.setAttribute('title', `Priority ${pri}`);
      }
      
      // Add the rest of the task text (already only the text after the state keyword)
      const restOfText = task.text;
      if (restOfText) {
        taskText.appendText(' ');
        this.renderTaskTextWithLinks(restOfText, taskText);
      }
      taskText.toggleClass('completed', task.completed);
    
      // File info
      const fileInfo = taskItem.createEl('div', { cls: 'todo-file-info' });
      // Show only filename and line in the UI; keep full path as hover tooltip
      const lastSlash = task.path.lastIndexOf('/');
      const baseName = lastSlash >= 0 ? task.path.slice(lastSlash + 1) : task.path;
      fileInfo.setText(`${baseName}:${task.line + 1}`);
      fileInfo.setAttribute('title', task.path);
      
      // Event listeners
      checkbox.addEventListener('change', async () => {
        // Toggle only DONE/TODO via checkbox
        const targetState = checkbox.checked ? 'DONE' : 'TODO';

        // Priority token reconstruction
        const priToken = task.priority === 'high' ? '[#A]'
          : task.priority === 'med' ? '[#B]'
          : task.priority === 'low' ? '[#C]'
          : null;

        // Construct new line: indent + listMarker? + state + [#X]? + text
        const newLine = `${task.indent}${task.listMarker || ''}${targetState}` + (priToken ? ` ${priToken}` : '') + (task.text ? ` ${task.text}` : '');

        const file = this.app.vault.getAbstractFileByPath(task.path);
        if (file instanceof TFile) {
          const content = await this.app.vault.read(file);
          const lines = content.split('\n');
          if (task.line < lines.length) {
            lines[task.line] = newLine;
            await this.app.vault.modify(file, lines.join('\n'));

            // Update in-memory task
            task.rawText = newLine;
            task.state = targetState;
            task.completed = targetState === 'DONE';

            // Reflect UI state
            taskText.toggleClass('completed', task.completed);
            await this.onOpen();
          }
        }
      });
      
      taskItem.addEventListener('click', (evt) => {
        if (evt.target !== checkbox && !(evt.target as HTMLElement).hasClass('todo-keyword')) {
          this.openTaskLocation(task);
        }
      });
    });
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

  // Change the task state when the state keywork is clicked  
  async toggleTaskStatus(task: Task) {
    // Compute new state and rebuild the line as: indent + state + ' ' + [#X]? + ' ' + text
    // Priority token must be placed immediately after the state keyword per requirements.
    const oldState = task.state;
    const newState = NEXT_STATE.get(oldState) ?? 'DONE';

    // Map stored priority back to token
    const priToken = task.priority === 'high' ? '[#A]'
      : task.priority === 'med' ? '[#B]'
      : task.priority === 'low' ? '[#C]'
      : null;

    // Build new line ensuring single spaces and priority immediately after state if present
    const newLine = `${task.indent}${task.listMarker || ''}${newState}` + (priToken ? ` ${priToken}` : '') + (task.text ? ` ${task.text}` : '');

    // Update the file
    const file = this.app.vault.getAbstractFileByPath(task.path);
    if (file instanceof TFile) {
      const content = await this.app.vault.read(file);
      const lines = content.split('\n');
      
      if (task.line < lines.length) {
        lines[task.line] = newLine;
        await this.app.vault.modify(file, lines.join('\n'));
        
        // Update the task in our list
        task.rawText = newLine;
        task.state = newState;
        task.completed = newState == 'DONE';
        // text and indent remain the same; priority unchanged
        // Refresh the view
        this.onOpen();
      }
    }
  }

  // Open the source file in the vault the task is declared in
  async openTaskLocation(task: Task) {
    const file = this.app.vault.getAbstractFileByPath(task.path);

    if (!(file instanceof TFile)) return;

    const { workspace } = this.app;

    // 1) Try to find an existing leaf already showing this file
    const allLeaves = workspace.getLeavesOfType('markdown');
    let targetLeaf: WorkspaceLeaf | null = null;

    for (const l of allLeaves) {
      const v = l.view;
      if (v instanceof MarkdownView && v.file?.path === file.path) {
        targetLeaf = l;
        break;
      }
    }

    // 2) If found, activate and reveal it; otherwise reuse the most relevant leaf without opening a new tab
    if (targetLeaf) {
      await workspace.revealLeaf(targetLeaf);
      await targetLeaf.openFile(file);
    } else {
      // getLeaf(false) prefers reusing the active leaf/split rather than creating a new tab
      targetLeaf = workspace.getLeaf(false);
      await targetLeaf.openFile(file);
    }

    // 3) Position cursor and scroll
    const markdownView = targetLeaf.view instanceof MarkdownView ? targetLeaf.view : null;
    if (markdownView) {
      const editor = markdownView.editor;
      const pos = { line: task.line, ch: 0 };
      editor.setCursor(pos);
      editor.scrollIntoView({ from: pos, to: pos });
    }
  }
}

class TodoTrackerSettingTab extends PluginSettingTab {
  plugin: TodoTracker;

  constructor(app: App, plugin: TodoTracker) {
    super(app, plugin);
    this.plugin = plugin;
  }

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
          // Refresh existing task view tabs to reflect any timing-related updates
          const leaves = this.app.workspace.getLeavesOfType(TASK_VIEW_TYPE);
          for (const leaf of leaves) {
            const view = leaf.view as TodoView;
            view.tasks = this.plugin.tasks;
            await view.onOpen();
          }
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
            // Rebuild regex and rescan using defaults if empty
            this.plugin.buildTaskLineRegex();
            await this.plugin.scanVault();
            // Refresh existing task view tabs to display updated results
            const leaves = this.app.workspace.getLeavesOfType(TASK_VIEW_TYPE);
            for (const leaf of leaves) {
              const view = leaf.view as TodoView;
              view.tasks = this.plugin.tasks;
              await view.onOpen();
            }
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
          await this.plugin.scanVault();
          // Refresh existing task view tabs to display updated results
          const leaves = this.app.workspace.getLeavesOfType(TASK_VIEW_TYPE);
          for (const leaf of leaves) {
            const view = leaf.view as TodoView;
            view.tasks = this.plugin.tasks;
            await view.onOpen();
          }
        }));
  }
}