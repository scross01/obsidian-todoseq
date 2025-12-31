import { Plugin, TFile, TAbstractFile, WorkspaceLeaf, Editor, MarkdownView } from 'obsidian';
import { Task } from './task';
import { TodoView, TaskViewMode } from "./view/task-view";
import { TodoTrackerSettingTab, TodoTrackerSettings, DefaultSettings } from "./settings/settings";
import { TaskParser } from './parser/task-parser';
import { TaskEditor } from './view/task-editor';

export const TASK_VIEW_ICON = "list-todo";

export default class TodoTracker extends Plugin {
  settings: TodoTrackerSettings;
  tasks: Task[] = [];
  refreshIntervalId: number;

  // Parser instance configured from current settings
  private parser: TaskParser | null = null;

  // Task editor instance for updating tasks
  private taskEditor: TaskEditor | null = null;

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
      (leaf) => new TodoView(leaf, this.tasks, this.settings.taskViewMode, this.settings)
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

    // Add editor command to toggle task state
    this.addCommand({
      id: 'toggle-task-state',
      name: 'Toggle task state',
      editorCheckCallback: (checking: boolean, editor: Editor, view: MarkdownView) => {
        return this.handleToggleTaskState(checking, editor, view);
      },
      hotkeys: [
        {
          modifiers: ['Ctrl'],
          key: 'Enter'
        }
      ]
    });

    // Initialize task editor
    this.taskEditor = new TaskEditor(this.app);

    // Initial scan
    await this.scanVault();
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
      this.app.vault.on('rename', (file, oldPath) => this.handleFileRename(file, oldPath))
    );
  }

  // Helper: refresh all open Todo views to reflect this.tasks without stealing focus
  private async refreshOpenTaskViews(): Promise<void> {
    const leaves = this.app.workspace.getLeavesOfType(TodoView.viewType);
    for (const leaf of leaves) {
      if (leaf.view instanceof TodoView) {
        // Update data source
        leaf.view.tasks = this.tasks;
        // Update the dropdown's task reference so it uses the latest tasks
        leaf.view.updateTasks(this.tasks);
        // Lighter refresh: only update the visible list rather than full onOpen re-init
        leaf.view.refreshVisibleList();
      }
    }
  }

  // Obsidian lifecycle method called when the plugin is unloaded
  onunload() {
    window.clearInterval(this.refreshIntervalId);
  }

  // Obsidian lifecycle method called to settings are loaded
  async loadSettings() {
    const loaded = await this.loadData();  // eslint-disable-line @typescript-eslint/no-unsafe-assignment
    this.settings = Object.assign({}, DefaultSettings, loaded as Partial<TodoTrackerSettings>);
    // Normalize settings shape after migration: ensure additionalTaskKeywords exists
    if (!this.settings.additionalTaskKeywords) {
      this.settings.additionalTaskKeywords = [];
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
    window.clearInterval(this.refreshIntervalId);

    // Use a serialized async tick to avoid overlap and unhandled rejections
    this.refreshIntervalId = window.setInterval(async () => {
      if (this._isScanning) return;
      this._isScanning = true;
      try {
        await this.scanVault();
        await this.refreshOpenTaskViews(); // will now perform lighter refresh
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

      // Refresh all open TodoView leaves (lighter refresh)
      await this.refreshOpenTaskViews();
    } catch (err) {
      console.error('TODOseq handleFileChange error', err);
      // Best-effort UI refresh so view doesn't get stuck
      try { await this.refreshOpenTaskViews(); } catch (_) {}
    }
  }

  // Handle rename: remove tasks for the old path, then scan the new file location and refresh views.
  private async handleFileRename(file: TAbstractFile, oldPath: string) {
    try {
      // Remove existing tasks for the old path
      this.tasks = this.tasks.filter(t => t.path !== oldPath);
      
      // If the file still exists (it should after rename), scan it at its new location
      if (file instanceof TFile) {
        await this.scanFile(file);
      }
      
      // Keep sorted state
      this.tasks.sort(this.taskComparator);
      await this.refreshOpenTaskViews(); // lighter refresh
    } catch (err) {
      console.error('TODOseq handleFileRename error', err);
      try { await this.refreshOpenTaskViews(); } catch (_) {}
    }
  }
  
  // Show tasks in the task view
  async showTasks() {
    const { workspace } = this.app;
    
    // Create new leaf or use existing
    let leaf: WorkspaceLeaf | null = null;
    const leaves = workspace.getLeavesOfType(TodoView.viewType);

    if (leaves.length > 0) {
      leaf = leaves[0];
      // Only reveal if the leaf is not already active to avoid focus stealing
      const activeLeaf = workspace.activeLeaf;
      if (activeLeaf !== leaf) {
        await workspace.revealLeaf(leaf);
      }
    } else {
      leaf = workspace.getLeaf(true);
      leaf.setViewState({ type: TodoView.viewType, active: true });
      // Only reveal if the leaf is not already active to avoid focus stealing
      const activeLeaf = workspace.activeLeaf;
      if (activeLeaf !== leaf) {
        await workspace.revealLeaf(leaf);
      }
    }
  }

  /**
   * Handle the toggle task state command
   * @param checking - Whether this is just a check to see if the command is available
   * @param editor - The editor instance
   * @param view - The markdown view
   * @returns boolean indicating if the command is available
   */
  private handleToggleTaskState(checking: boolean, editor: Editor, view: MarkdownView): boolean {
    if (!this.taskEditor) {
      return false;
    }

    // Get the current line from the editor
    const cursor = editor.getCursor();
    const line = editor.getLine(cursor.line);
    
    // Check if this line contains a valid task
    if (!this.parser?.testRegex.test(line)) {
      return false;
    }

    if (checking) {
      return true;
    }

    // Parse the task from the current line
    const task = this.parseTaskFromLine(line, cursor.line, view.file?.path || '');
    
    if (task) {
      // Update the task state
      this.taskEditor.updateTaskState(task);
    }

    return true;
  }

  /**
   * Parse a task from a line of text
   * @param line - The line of text containing the task
   * @param lineNumber - The line number in the file
   * @param filePath - The path to the file
   * @returns Parsed Task object or null if not a valid task
   */
  private parseTaskFromLine(line: string, lineNumber: number, filePath: string): Task | null {
    if (!this.parser) {
      return null;
    }

    const match = this.parser.captureRegex.exec(line);
    if (!match) {
      return null;
    }

    // Extract task details using the same logic as TaskParser
    const indent = match[1] || "";
    const listMarker = (match[2] || "") + (match[3] || "");
    const state = match[4];
    const taskText = match[5];
    const tail = match[6];

    // Extract priority
    let priority: 'high' | 'med' | 'low' | null = null;
    const cleanedText = taskText.replace(/(\s*)\[#([ABC])\](\s*)/, (match, before, letter, after) => {
      if (letter === 'A') priority = 'high';
      else if (letter === 'B') priority = 'med';
      else if (letter === 'C') priority = 'low';
      return ' ';
    }).replace(/[ \t]+/g, ' ').trimStart();

    // Extract checkbox state
    let completed = false;
    const checkboxMatch = line.match(/^(\s*)([-*+]\s*\[(\s|x)\]\s*)\s+([^\s]+)\s+(.+)$/);
    if (checkboxMatch) {
      const [, , , checkboxStatus] = checkboxMatch;
      completed = checkboxStatus === 'x';
    } else {
      completed = new Set(['DONE', 'CANCELED', 'CANCELLED']).has(state);
    }

    return {
      path: filePath,
      line: lineNumber,
      rawText: line,
      indent,
      listMarker,
      text: cleanedText,
      state: state as Task['state'],
      completed,
      priority,
      scheduledDate: null,
      deadlineDate: null,
      tail
    };
  }
}
