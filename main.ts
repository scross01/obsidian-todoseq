import { App, Plugin, PluginSettingTab, Setting, TFile, TAbstractFile, MarkdownView, WorkspaceLeaf } from 'obsidian';

interface Task {
  path: string;
  line: number;
  text: string;
  completed: boolean;
}

interface TodoTrackerSettings {
  refreshInterval: number;
}

const DEFAULT_SETTINGS: TodoTrackerSettings = {
  refreshInterval: 60 // seconds
}

export default class TodoTracker extends Plugin {
  settings: TodoTrackerSettings;
  tasks: Task[] = [];
  refreshIntervalId: number;

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
      if (line.startsWith('TODO')) {
        this.tasks.push({
          path: file.path,
          line: index,
          text: line,
          completed: false
        });
      }
    });
  }

  handleFileChange(file: TAbstractFile) {
    if (file instanceof TFile && file.extension === 'md') {
      // Remove existing tasks for this file
      this.tasks = this.tasks.filter(task => task.path !== file.path);
      
      // Re-scan the file
      this.scanFile(file);
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
      
      // Task text
      const taskText = taskItem.createEl('span', { cls: 'todo-text' });
      taskText.setText(task.text);
      
      // File info
      const fileInfo = taskItem.createEl('div', { cls: 'todo-file-info' });
      fileInfo.setText(`${task.path}:${task.line + 1}`);
      
      // Event listeners
      checkbox.addEventListener('change', () => {
        task.completed = checkbox.checked;
        taskText.toggleClass('completed', task.completed);
      });
      
      taskItem.addEventListener('click', (evt) => {
        if (evt.target !== checkbox) {
          this.openTaskLocation(task);
        }
      });
    });
  }

  async openTaskLocation(task: Task) {
    const file = this.app.vault.getAbstractFileByPath(task.path);
    
    if (file instanceof TFile) {
      const leaf = this.app.workspace.getLeaf(true);
      await leaf.openFile(file);
      
      const editor = leaf.view.editor;
      editor.setCursor({ line: task.line, ch: 0 });
      editor.scrollIntoView({ from: { line: task.line, ch: 0 }, to: { line: task.line, ch: 0 } });
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
  }
}