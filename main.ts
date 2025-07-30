import { App, Plugin, PluginSettingTab, Setting, TFile, TAbstractFile, MarkdownView, WorkspaceLeaf } from 'obsidian';

interface Task {
  path: string;
  line: number;
  text: string;
  keyword: string;
  completed: boolean;
}

interface TodoTrackerSettings {
  refreshInterval: number;
  taskKeywords: string[];
}

const DEFAULT_SETTINGS: TodoTrackerSettings = {
  refreshInterval: 60, // seconds
  taskKeywords: ['TODO', 'DOING', 'DONE', 'NOW', 'LATER', 'WAIT', 'WAITING', 'COMPLETE', 'COMPLETED'],
}

const NEXT_STATE = new Map<string, string>([
  ['TODO', 'DOING'],
  ['DOING', 'DONE'],
  ['DONE', 'TODO'],
  ['LATER', 'NOW'],
  ['NOW', 'DONE'],
  ['WAIT', 'TODO'],
  ['WAITING', 'TODO'],
  ['COMPLETE', 'TODO'],
  ['COMPLETED', 'TODO'],
]);

export default class TodoTracker extends Plugin {
  settings: TodoTrackerSettings;
  tasks: Task[] = [];
  refreshIntervalId: number;

  isTask(text: string): boolean {
    return this.settings.taskKeywords.some(keyword => text.startsWith(keyword + ' '));
  }
  
  async onload() {
    await this.loadSettings();
    
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
    
    lines.forEach((line, index) => {
      if (this.isTask(line)) {
        this.tasks.push({
          path: file.path,
          line: index,
          text: line,
          keyword: line.split(' ')[0],
          completed: true ? line.startsWith('DONE') : false
        });
      }
    });
  }

  async handleFileChange(file: TAbstractFile) {
    if (file instanceof TFile && file.extension === 'md') {
      // Remove existing tasks for this file
      this.tasks = this.tasks.filter(task => task.path !== file.path);
      
      // Re-scan the file
      await this.scanFile(file);
      
      // If there's an active TodoView, refresh it
      const leaves = this.app.workspace.getLeavesOfType('todo-view');
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
    const leaves = workspace.getLeavesOfType('todo-view');
    
    if (leaves.length > 0) {
      leaf = leaves[0];
    } else {
      leaf = workspace.getLeaf(true);
    }
    
    // Create view
    const view = new TodoView(leaf, this.tasks);
    leaf.open(view);
  }
}

class TodoView extends MarkdownView {
  tasks: Task[];
  
  constructor(leaf: WorkspaceLeaf, tasks: Task[]) {
    super(leaf);
    this.tasks = tasks;
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
      todoSpan.setText(task.keyword);
      todoSpan.addEventListener('click', (evt) => {
        evt.stopPropagation();
        this.toggleTaskStatus(task);
      });
      
      // Add the rest of the task text
      const restOfText = task.text.substring(task.keyword.length); // Remove "TODO"
      taskText.appendText(restOfText);
      
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
    // Update the task text
    const oldState = task.keyword
    const newState = NEXT_STATE.get(oldState) ?? 'DONE'
    const oldText = task.text
    const newText = newState + oldText.substring(oldState.length); // Replace "TODO" with "DONE"

    // Update the file
    const file = this.app.vault.getAbstractFileByPath(task.path);
    if (file instanceof TFile) {
      const content = await this.app.vault.read(file);
      const lines = content.split('\n');
      
      if (task.line < lines.length) {
        lines[task.line] = newText;
        await this.app.vault.modify(file, lines.join('\n'));
        
        // Update the task in our list
        task.text = newText;
        task.keyword = newState;
        task.completed = newState == 'DONE'
        // Refresh the view
        this.onOpen();
      }
    }
  }

  async openTaskLocation(task: Task) {
    const file = this.app.vault.getAbstractFileByPath(task.path);
    
    if (file instanceof TFile) {
      const leaf = this.app.workspace.getLeaf(true);
      await leaf.openFile(file);
      
      const markdownView = leaf.view instanceof MarkdownView ? leaf.view : null;
      if (markdownView) {
        const editor = markdownView.editor;
        editor.setCursor({ line: task.line, ch: 0 });
        editor.scrollIntoView({ from: { line: task.line, ch: 0 }, to: { line: task.line, ch: 0 } });
      }
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
        }));
  }
}