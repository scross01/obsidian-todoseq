import { Plugin, MarkdownView } from 'obsidian';
import { EditorView } from '@codemirror/view';
import { Task } from './task';
import { TaskListView } from './view/task-list-view';
import { TodoTrackerSettings, DefaultSettings } from './settings/settings';
import { TaskEditor } from './view/task-editor';
import { EditorKeywordMenu } from './view/editor-keyword-menu';
import { VaultScanner } from './services/vault-scanner';
import { StatusBarManager } from './view/status-bar';
import { TaskManager } from './task-manager';
import { UIManager } from './ui-manager';
import { ReaderViewFormatter } from './view/reader-formatting';
import { PluginLifecycleManager } from './plugin-lifecycle';
import { parseUrgencyCoefficients } from './utils/task-urgency';
import { TodoseqCodeBlockProcessor } from './view/embedded-task-list/code-block-processor';
import { TaskStateManager } from './services/task-state-manager';
import { TaskUpdateCoordinator } from './services/task-update-coordinator';

export const TASK_VIEW_ICON = 'list-todo';

export default class TodoTracker extends Plugin {
  settings: TodoTrackerSettings;

  // Centralized state manager - single source of truth for tasks
  public taskStateManager: TaskStateManager;

  // Centralized task update coordinator
  public taskUpdateCoordinator: TaskUpdateCoordinator;

  // Managers for different functional areas
  public taskManager: TaskManager;
  public uiManager: UIManager;
  public lifecycleManager: PluginLifecycleManager;

  // Services and components (made public for manager access)
  public vaultScanner: VaultScanner | null = null;
  public taskEditor: TaskEditor | null = null;
  public editorKeywordMenu: EditorKeywordMenu | null = null;
  public taskFormatters: Map<string, unknown> = new Map();
  public statusBarManager: StatusBarManager | null = null;
  public readerViewFormatter: ReaderViewFormatter | null = null;

  // Embedded task list processor
  public embeddedTaskListProcessor: TodoseqCodeBlockProcessor | null = null;

  // Public getter methods for internal services
  public getVaultScanner(): VaultScanner | null {
    return this.vaultScanner;
  }

  /**
   * Get tasks from the centralized state manager.
   * @returns Current tasks array
   */
  public getTasks(): Task[] {
    return this.taskStateManager.getTasks();
  }

  // Obsidian lifecycle method called when the plugin is loaded.
  async onload() {
    // Expose plugin instance globally for easy access
    (window as unknown as { todoSeqPlugin?: TodoTracker }).todoSeqPlugin = this;

    // Initialize centralized state manager first
    this.taskStateManager = new TaskStateManager();

    // Initialize task update coordinator
    this.taskUpdateCoordinator = new TaskUpdateCoordinator(
      this,
      this.taskStateManager,
    );

    // Initialize managers
    this.taskManager = new TaskManager(this);
    this.uiManager = new UIManager(this);
    this.lifecycleManager = new PluginLifecycleManager(this);

    // Initialize embedded task list processor
    this.embeddedTaskListProcessor = new TodoseqCodeBlockProcessor(this);
    this.embeddedTaskListProcessor.registerProcessor();

    // Delegate to lifecycle manager (which initializes vaultScanner and readerViewFormatter)
    await this.lifecycleManager.onload();
  }

  // Helper: refresh all open Todo views to reflect current tasks without stealing focus
  private async refreshOpenTaskListViews(): Promise<void> {
    const leaves = this.app.workspace.getLeavesOfType(TaskListView.viewType);
    const tasks = this.getTasks();
    for (const leaf of leaves) {
      if (leaf.view instanceof TaskListView) {
        // Update the dropdown's task reference so it uses the latest tasks
        leaf.view.updateTasks(tasks);
        // Lighter refresh: only update the visible list rather than full onOpen re-init
        leaf.view.refreshVisibleList();
      }
    }
  }

  // Obsidian lifecycle method called when the plugin is unloaded
  onunload() {
    // Clean up embedded task list processor
    if (this.embeddedTaskListProcessor) {
      this.embeddedTaskListProcessor.cleanup();
    }

    // Delegate cleanup to lifecycle manager to centralize cleanup logic
    this.lifecycleManager?.onunload();
  }

  // Obsidian lifecycle method called to settings are loaded
  async loadSettings() {
    const loaded = await this.loadData(); // eslint-disable-line @typescript-eslint/no-unsafe-assignment
    this.settings = Object.assign(
      {},
      DefaultSettings,
      loaded as Partial<TodoTrackerSettings>,
    );
    // Normalize settings shape after migration: ensure additionalTaskKeywords exists
    if (!this.settings.additionalTaskKeywords) {
      this.settings.additionalTaskKeywords = [];
    }
    // Update VaultScanner with new settings if it exists
    if (this.vaultScanner) {
      // Parse urgency coefficients once and pass to updateSettings to avoid redundant calls
      const urgencyCoefficients = await parseUrgencyCoefficients(this.app);
      await this.vaultScanner.updateSettings(
        this.settings,
        urgencyCoefficients,
      );
    }
  }

  // Public method to update parser in VaultScanner with current settings
  public async recreateParser(): Promise<void> {
    if (this.vaultScanner) {
      const urgencyCoefficients = await parseUrgencyCoefficients(this.app);
      // Update settings with urgency coefficients to avoid redundant parsing
      await this.vaultScanner.updateSettings(
        this.settings,
        urgencyCoefficients,
      );

      // Wait for the parser to be fully created
      await this.vaultScanner.getParser();
    }

    // Update embedded task list processor with new settings
    if (this.embeddedTaskListProcessor) {
      this.embeddedTaskListProcessor.updateSettings();
    }
  }

  // Public method to update reader view formatter with current settings
  public refreshReaderViewFormatter(): void {
    // Force a refresh of all open markdown views to reprocess with new settings
    const leaves = this.app.workspace.getLeavesOfType('markdown');
    leaves.forEach((leaf) => {
      const view = leaf.view;
      if (view && 'previewMode' in view) {
        const previewMode = (
          view as { previewMode?: { rerender: (force: boolean) => void } }
        ).previewMode;
        if (previewMode) {
          // If in reader/preview mode, use rerender() method
          previewMode.rerender(true);
        }
      }
    });
  }

  // Public method to trigger a vault scan using VaultScanner
  public async scanVault(): Promise<void> {
    if (this.vaultScanner) {
      await this.vaultScanner.scanVault();
    }
  }

  // Obsidian lifecycle method called to save settings
  async saveSettings() {
    await this.saveData(this.settings);
  }

  // Test method to manually update reader view formatter
  // Note: The parser is now shared via VaultScanner, so this method
  // is kept for API compatibility but doesn't need to recreate the parser
  public testUpdateReaderViewFormatter(): void {
    // Parser is managed by VaultScanner - no action needed here
  }

  // Update task formatting in all views
  public updateTaskFormatting(): void {
    // Delegate to UI manager
    this.uiManager.updateTaskFormatting();
  }

  /**
   * Refresh all open task list views (including embedded task lists)
   */
  public refreshAllTaskListViews(): void {
    // Refresh main task list views
    this.uiManager.refreshOpenTaskListViews();

    // Refresh embedded task lists
    if (this.embeddedTaskListProcessor) {
      this.embeddedTaskListProcessor.refreshAllEmbeddedTaskLists();
    }
  }

  // Setup status bar manager for task count
  private setupStatusBarManager(): void {
    import('./view/status-bar')
      .then((module) => {
        this.statusBarManager = new module.StatusBarManager(this);
        this.statusBarManager.setupStatusBarItem();
      })
      .catch((error) => {
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
        const editorView = (view.editor as { cm?: EditorView })?.cm;
        if (editorView && typeof editorView.requestMeasure === 'function') {
          // Request a measurement update which will trigger decoration refresh
          editorView.requestMeasure();
        }

        // Additional force refresh: trigger a viewport change to ensure decorations are re-evaluated
        if (editorView && typeof editorView.dispatch === 'function') {
          // Dispatch a dummy transaction to force re-render and clear any stacked decorations
          editorView.dispatch({
            selection: editorView.state.selection,
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
}
