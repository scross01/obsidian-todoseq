import { Plugin, TFile, TAbstractFile, WorkspaceLeaf, Editor, MarkdownView } from 'obsidian';
import { Task, NEXT_STATE, DEFAULT_COMPLETED_STATES } from './task';
import { TodoView, TaskViewMode } from "./view/task-view";
import { TodoTrackerSettingTab, TodoTrackerSettings, DefaultSettings } from "./settings/settings";
import { TaskParser } from './parser/task-parser';
import { TaskEditor } from './view/task-editor';
import { taskKeywordPlugin, TaskKeywordDecorator } from './view/task-formatting';
import { EditorKeywordMenu } from './view/editor-keyword-menu';
import { VaultScanner } from './services/vault-scanner';
import { StatusBarManager } from './view/status-bar';
import { TaskManager } from './task-manager';
import { UIManager } from './ui-manager';
import { PluginLifecycleManager } from './plugin-lifecycle';
import { taskComparator } from './utils/task-utils';

export const TASK_VIEW_ICON = "list-todo";

export default class TodoTracker extends Plugin {
  settings: TodoTrackerSettings;
  tasks: Task[] = [];
  
  // Managers for different functional areas
  public taskManager: TaskManager;
  public uiManager: UIManager;
  public lifecycleManager: PluginLifecycleManager;
  
  // Services and components (made public for manager access)
  public vaultScanner: VaultScanner | null = null;
  public taskEditor: TaskEditor | null = null;
  public editorKeywordMenu: EditorKeywordMenu | null = null;
  public taskFormatters: Map<string, any> = new Map();
  public statusBarManager: StatusBarManager | null = null;
  
  // Public getter methods for internal services
  public getVaultScanner(): VaultScanner | null {
    return this.vaultScanner;
  }

  public getTasks(): Task[] {
    return this.tasks;
  }

 // Obsidian lifecycle method called when the plugin is loaded.
 async onload() {
   // Initialize managers
   this.taskManager = new TaskManager(this);
   this.uiManager = new UIManager(this);
   this.lifecycleManager = new PluginLifecycleManager(this);
   
   // Delegate to lifecycle manager
   await this.lifecycleManager.onload();
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
    // Clean up UI manager resources
    this.uiManager?.cleanup();
    
    // Clean up VaultScanner resources
    this.vaultScanner?.destroy();
   
    // Clean up status bar manager
    if (this.statusBarManager) {
      this.statusBarManager.cleanup();
      this.statusBarManager = null;
    }
    
    // Clear any remaining references
    this.taskEditor = null;
    this.editorKeywordMenu = null;
    this.taskFormatters.clear();
  }

  // Obsidian lifecycle method called to settings are loaded
  async loadSettings() {
    const loaded = await this.loadData();  // eslint-disable-line @typescript-eslint/no-unsafe-assignment
    this.settings = Object.assign({}, DefaultSettings, loaded as Partial<TodoTrackerSettings>);
    // Normalize settings shape after migration: ensure additionalTaskKeywords exists
    if (!this.settings.additionalTaskKeywords) {
      this.settings.additionalTaskKeywords = [];
    }
    // Update VaultScanner with new settings if it exists
    if (this.vaultScanner) {
      this.vaultScanner.updateSettings(this.settings);
    }
  }

  // Public method to update parser in VaultScanner with current settings
  public recreateParser(): void {
    if (this.vaultScanner) {
      this.vaultScanner.updateParser(TaskParser.create(this.settings));
    }
  }
  
  // Public method to trigger a vault scan using VaultScanner
  public async scanVault(): Promise<void> {
    if (this.vaultScanner) {
      await this.vaultScanner.scanVault();
    }
  }
  
  // Public method to update periodic refresh using VaultScanner
  public setupPeriodicRefresh(): void {
    if (this.vaultScanner) {
      this.vaultScanner.setupPeriodicRefresh(this.settings.refreshInterval);
    }
  }

  // Obsidian lifecycle method called to save settings
  async saveSettings() {
    await this.saveData(this.settings);
  }

  // Update task formatting in all views
  public updateTaskFormatting(): void {
    // Delegate to UI manager
    this.uiManager.updateTaskFormatting();
  }

  // Setup status bar manager for task count
  private setupStatusBarManager(): void {
    import('./view/status-bar').then((module) => {
      this.statusBarManager = new module.StatusBarManager(this);
      this.statusBarManager.setupStatusBarItem();
    }).catch(error => {
      console.error('Failed to load status bar manager:', error);
    });
  }
  
  // Force refresh of editor decorations in all visible markdown editors
  public refreshVisibleEditorDecorations(): void {
    // Get all visible markdown editors
    const leaves = this.app.workspace.getLeavesOfType('markdown');
    for (const leaf of leaves) {
      const view = leaf.view;
      if (view instanceof MarkdownView && view.editor) {
        // Force the editor to refresh its decorations by triggering a viewport change
        const editorView = (view.editor as any).cm;
        if (editorView && typeof editorView.requestMeasure === 'function') {
          // Request a measurement update which will trigger decoration refresh
          editorView.requestMeasure();
        }
        
        // Additional force refresh: trigger a viewport change to ensure decorations are re-evaluated
        if (editorView && typeof editorView.dispatch === 'function') {
          // Dispatch a dummy transaction to force re-render and clear any stacked decorations
          editorView.dispatch({
            selection: editorView.state.selection
          });
          
          // Force a second update to ensure decorations are properly applied/removed
          setTimeout(() => {
            if (editorView && typeof editorView.requestMeasure === 'function') {
              editorView.requestMeasure();
            }
          }, 0);
        }
      }
    }
  }
  


  // Serialize scans to avoid overlapping runs
  private _isScanning = false;
  
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

}
