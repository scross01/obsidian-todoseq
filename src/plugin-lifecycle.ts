import TodoTracker from './main';
import { TodoTrackerSettings, DefaultSettings } from './settings/settings';
import { VaultScanner } from './services/vault-scanner';
import { TaskEditor } from './view/task-editor';
import { EditorKeywordMenu } from './view/editor-keyword-menu';
import { StatusBarManager } from './view/status-bar';
import { TodoView, TaskViewMode } from "./view/task-view";
import { TodoTrackerSettingTab } from "./settings/settings";
import { TaskParser } from './parser/task-parser';
import { TASK_VIEW_ICON } from './main';
import { Editor, MarkdownView } from 'obsidian';

export class PluginLifecycleManager {
  constructor(private plugin: TodoTracker) {}
  
  /**
   * Obsidian lifecycle method called when the plugin is loaded
   */
  async onload() {
    await this.loadSettings();

    // Initialize services
    this.plugin.vaultScanner = new VaultScanner(this.plugin.app, this.plugin.settings, TaskParser.create(this.plugin.settings));
    this.plugin.taskEditor = new TaskEditor(this.plugin.app);
    this.plugin.editorKeywordMenu = new EditorKeywordMenu(this.plugin.app, this.plugin.settings, this.plugin.taskEditor);
    this.plugin.statusBarManager = new StatusBarManager(this.plugin);
    this.plugin.statusBarManager.setupStatusBarItem();

    // Register the custom view type
    this.plugin.registerView(
      TodoView.viewType,
      (leaf) => new TodoView(leaf, this.plugin.tasks, this.plugin.settings.taskViewMode, this.plugin.settings)
    );

    // Persist view-mode changes coming from TodoView toolbars
    const handler = async (e: Event) => {
      const detail = (e as CustomEvent).detail as { mode: TaskViewMode };
      if (!detail?.mode) return;
      this.plugin.settings.taskViewMode = detail.mode;
      await this.saveSettings();
      await this.plugin.uiManager.refreshOpenTaskViews();
    };
    window.addEventListener('todoseq:view-mode-change', handler);
    this.plugin.register(() => window.removeEventListener('todoseq:view-mode-change', handler));

    this.plugin.addRibbonIcon(TASK_VIEW_ICON, 'Open TODOseq', () => {
      this.plugin.uiManager.showTasks();
    });

    // Add settings tab
    this.plugin.addSettingTab(new TodoTrackerSettingTab(this.plugin.app, this.plugin));

    // Add command to show tasks
    this.plugin.addCommand({
      id: 'show-todo-tasks',
      name: 'Show TODO tasks',
      callback: () => this.plugin.uiManager.showTasks()
    });

    // Add editor command to toggle task state
    this.plugin.addCommand({
      id: 'toggle-task-state',
      name: 'Toggle task state',
      editorCheckCallback: (checking: boolean, editor: Editor, view: MarkdownView) => {
        return this.plugin.taskManager.handleToggleTaskState(checking, editor, view);
      },
      hotkeys: [
        {
          modifiers: ['Ctrl'],
          key: 'Enter'
        }
      ]
    });

    // Listen to VaultScanner events for task updates
    this.plugin.vaultScanner.on('tasks-changed', (tasks) => {
      this.plugin.tasks = tasks;
      this.plugin.uiManager.refreshOpenTaskViews();
    });

    this.plugin.vaultScanner.on('scan-error', (error) => {
      console.error('TODOseq: VaultScanner scan error:', error);
    });

    // Setup task formatting based on current settings
    this.plugin.uiManager.setupTaskFormatting();

    // Setup right-click event handlers for task keywords
    this.plugin.uiManager.setupTaskKeywordContextMenu();

    // Initial scan using VaultScanner
    await this.plugin.vaultScanner.scanVault();

    // Setup periodic refresh
    this.plugin.setupPeriodicRefresh();

    // Register file change events that delegate to VaultScanner
    this.plugin.registerEvent(
      this.plugin.app.vault.on('modify', (file) => {
        this.plugin.vaultScanner?.handleFileChange(file)
      })
    );
    this.plugin.registerEvent(
      this.plugin.app.vault.on('delete', (file) => {
        this.plugin.vaultScanner?.handleFileChange(file)
      })
    );
    this.plugin.registerEvent(
      this.plugin.app.vault.on('create', (file) => {
        this.plugin.vaultScanner?.handleFileChange(file)
      })
    );
    this.plugin.registerEvent(
      // Obsidian passes (file, oldPath) for rename
      this.plugin.app.vault.on('rename', (file, oldPath) => {
        this.plugin.vaultScanner?.handleFileRename(file, oldPath)
      })
    );
  }

  /**
   * Obsidian lifecycle method called when the plugin is unloaded
   */
  onunload() {
    // Clean up UI manager resources
    this.plugin.uiManager?.cleanup();
    
    // Clean up VaultScanner resources
    this.plugin.vaultScanner?.destroy();
    
    // Clean up status bar manager
    if (this.plugin.statusBarManager) {
      this.plugin.statusBarManager.cleanup();
      this.plugin.statusBarManager = null;
    }
  }

  /**
   * Obsidian lifecycle method called when settings are loaded
   */
  async loadSettings() {
    const loaded = await this.plugin.loadData();  // eslint-disable-line @typescript-eslint/no-unsafe-assignment
    this.plugin.settings = Object.assign({}, DefaultSettings, loaded as Partial<TodoTrackerSettings>);
    // Normalize settings shape after migration: ensure additionalTaskKeywords exists
    if (!this.plugin.settings.additionalTaskKeywords) {
      this.plugin.settings.additionalTaskKeywords = [];
    }
    // Update VaultScanner with new settings if it exists
    if (this.plugin.vaultScanner) {
      this.plugin.vaultScanner.updateSettings(this.plugin.settings);
    }
  }

  /**
   * Save current settings
   */
  async saveSettings() {
    await this.plugin.saveData(this.plugin.settings);
  }

  /**
   * Public method to update parser in VaultScanner with current settings
   */
  public recreateParser(): void {
    if (this.plugin.vaultScanner) {
      this.plugin.vaultScanner.updateParser(TaskParser.create(this.plugin.settings));
    }
  }

  /**
   * Public method to trigger a vault scan using VaultScanner
   */
  public async scanVault(): Promise<void> {
    if (this.plugin.vaultScanner) {
      await this.plugin.vaultScanner.scanVault();
    }
  }

  /**
   * Public method to update periodic refresh using VaultScanner
   */
  public setupPeriodicRefresh(): void {
    if (this.plugin.vaultScanner) {
      this.plugin.vaultScanner.setupPeriodicRefresh(this.plugin.settings.refreshInterval);
    }
  }
}