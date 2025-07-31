import { App, Plugin, PluginSettingTab, Setting, TFile, TAbstractFile, MarkdownView, WorkspaceLeaf, ItemView } from 'obsidian';

interface Task {
  path: string;
  line: number;
  rawText: string; // original full line
  indent: string;  // leading whitespace before the state keyword
  text: string;    // content after the state keyword with priority token removed
  state: string;
  completed: boolean;
  priority: 'high' | 'med' | 'low' | null;
}

interface TodoTrackerSettings {
  refreshInterval: number;
  taskKeywords: string[];
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

export default class TodoTracker extends Plugin {
  settings: TodoTrackerSettings;
  tasks: Task[] = [];
  refreshIntervalId: number;

  // Compiled regex for task line recognition (optional indent + keyword + single space)
  private taskLineRegex: RegExp | null = null;

  buildTaskLineRegex() {
    const escaped = this.settings.taskKeywords
      .map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('|');
    // ^[ \t]*(KEYWORD1|KEYWORD2|...)\s+
    this.taskLineRegex = new RegExp(`^[ \\t]*(?:${escaped})\\s+`);
  }

  isTask(text: string): boolean {
    if (!this.taskLineRegex) this.buildTaskLineRegex();
    return !!this.taskLineRegex!.test(text);
  }
  
  async onload() {
    await this.loadSettings();

    // Register the custom view type
    this.registerView(
      TASK_VIEW_TYPE,
      (leaf) => new TodoView(leaf, this.tasks)
    );

    this.addRibbonIcon('list-todo', 'Open TODO list', () => {
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
    const existingLeaves = this.app.workspace.getLeavesOfType(TASK_VIEW_TYPE);
    if (existingLeaves.length > 0) {
      for (const leaf of existingLeaves) {
        const view = leaf.view as TodoView;
        view.tasks = this.tasks;
        await view.onOpen();
      }
    }

    // Set up periodic refresh
    this.setupPeriodicRefresh();

    // Register file change events
    this.registerEvent(
      this.app.vault.on('modify', (file) => this.handleFileChange(file))
    );
    
    this.registerEvent(
      this.app.vault.on('delete', (file) => this.handleFileChange(file))
    );
  }

  onunload() {
    clearInterval(this.refreshIntervalId);
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    // Rebuild regex whenever settings are loaded (keywords may have changed)
    this.buildTaskLineRegex();
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  setupPeriodicRefresh() {
    clearInterval(this.refreshIntervalId);
    this.refreshIntervalId = window.setInterval(() => {
      this.scanVault();
    }, this.settings.refreshInterval * 1000);
  }

  async scanVault() {
    this.tasks = [];
    const files = this.app.vault.getFiles();
    
    for (const file of files) {
      if (file.extension === 'md') {
        await this.scanFile(file);
      }
    }
  }

  async scanFile(file: TFile) {
    const content = await this.app.vault.read(file);
    const lines = content.split('\n');

    // Ensure regex is built
    if (!this.taskLineRegex) this.buildTaskLineRegex();
    const kwAlternation = this.settings.taskKeywords
      .map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('|');
    // capture groups:
    // 1: indent (spaces/tabs)
    // 2: state keyword
    // match 0: full prefix up to and including trailing spaces after state
    const stateCapture = new RegExp(`^([ \\t]*)(${kwAlternation})\\s+`);

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

      if (this.isTask(line)) {
        const m = stateCapture.exec(line);
        if (m) {
          const indent = m[1] ?? '';
          const state = m[2] ?? '';
          const afterPrefix = line.slice(m[0].length);

          // FEAT-A3: parse priority token [#A|#B|#C] and remove from display text
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
            text,
            state,
            completed: state === 'DONE',
            priority
          });
        }
      }
    }
  }

  async handleFileChange(file: TAbstractFile) {
    if (file instanceof TFile && file.extension === 'md') {
      // Remove existing tasks for this file
      this.tasks = this.tasks.filter(task => task.path !== file.path);
      
      // Re-scan the file
      await this.scanFile(file);
      
      // If there's an active TodoView, refresh it
      const leaves = this.app.workspace.getLeavesOfType(TASK_VIEW_TYPE);
      if (leaves.length > 0) {
        const view = leaves[0].view as TodoView;
        view.tasks = this.tasks;
        view.onOpen();
      }
    }
  }
  
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
    return "Todo Tracker";
  }

  async onOpen() {
    const container = this.containerEl.children[1];
    container.empty();
    
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
        taskText.appendText(' ' + restOfText);
      }
      taskText.toggleClass('completed', task.completed);
    
      // File info
      const fileInfo = taskItem.createEl('div', { cls: 'todo-file-info' });
      fileInfo.setText(`${task.path}:${task.line + 1}`);
      
      // Event listeners
      checkbox.addEventListener('change', () => {
        task.completed = checkbox.checked;
        taskText.toggleClass('completed', task.completed);
      });
      
      taskItem.addEventListener('click', (evt) => {
        if (evt.target !== checkbox && !(evt.target as HTMLElement).hasClass('todo-keyword')) {
          this.openTaskLocation(task);
        }
      });
    });
  }

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
    const newLine = `${task.indent}${newState}` + (priToken ? ` ${priToken}` : '') + (task.text ? ` ${task.text}` : '');

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
        }));
  
    new Setting(containerEl)
      .setName('Task Keywords')
      .setDesc('Keywords to scan for (e.g. TODO, FIXME)')
      .addText(text => text
        .setValue(this.plugin.settings.taskKeywords.join(', '))
        .onChange(async (value) => {
          this.plugin.settings.taskKeywords = value
            .split(',')
            .map(k => k.trim())
            .filter(k => k.length > 0);
          await this.plugin.saveSettings();
          // Rebuild regex for keywords and rescan
          this.plugin.buildTaskLineRegex();
          await this.plugin.scanVault();
        }));
  
    new Setting(containerEl)
      .setName('Include tasks inside code blocks')
      .setDesc('When enabled, tasks inside fenced code blocks (``` or ~~~) will be included.')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.includeCodeBlocks)
        .onChange(async (value) => {
          this.plugin.settings.includeCodeBlocks = value;
          await this.plugin.saveSettings();
          await this.plugin.scanVault();
        }));
  }
}