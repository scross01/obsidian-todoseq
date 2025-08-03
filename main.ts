import { Plugin, TFile, TAbstractFile, WorkspaceLeaf } from 'obsidian';
import { Task } from './task';
import { TodoView, TaskViewMode } from "./task-view";
import { TodoTrackerSettingTab, TodoTrackerSettings, DefaultSettings } from "./settings";
import { TaskParser } from './task-parser';

export const TASK_VIEW_ICON = "list-todo";

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
      TodoView.viewType,
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
    const leaves = this.app.workspace.getLeavesOfType(TodoView.viewType);
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
    this.settings = Object.assign({}, DefaultSettings, await this.loadData());
    // If user cleared keywords, use defaults at runtime
    if (!this.settings.taskKeywords || this.settings.taskKeywords.length === 0) {
      this.settings.taskKeywords = [...DefaultSettings.taskKeywords];
    }
    // Recreate parser whenever settings are loaded (keywords may have changed)
    this.recreateParser();
  }

  // Public method to recreate the parser with current settings
  public recreateParser(): void {
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
    const leaves = workspace.getLeavesOfType(TodoView.viewType);

    if (leaves.length > 0) {
      leaf = leaves[0];
    } else {
      leaf = workspace.getLeaf(true);
      leaf.setViewState({ type: TodoView.viewType, active: true });
    }
    if (leaf) {
      this.app.workspace.revealLeaf(leaf);
    }
  }
}
