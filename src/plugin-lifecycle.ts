import TodoTracker from './main';
import { VaultScanner } from './services/vault-scanner';
import { TaskEditor } from './view/task-editor';
import { EditorKeywordMenu } from './view/editor-keyword-menu';
import { StatusBarManager } from './view/status-bar';
import { TaskListView, TaskListViewMode } from './view/task-list-view';
import { TodoTrackerSettingTab } from './settings/settings';
import { TaskParser } from './parser/task-parser';
import { TASK_VIEW_ICON } from './main';
import { Editor, MarkdownView, TFile, Platform } from 'obsidian';
import { parseUrgencyCoefficients } from './utils/task-urgency';

export class PluginLifecycleManager {
  constructor(private plugin: TodoTracker) {}

  /**
   * Obsidian lifecycle method called when the plugin is loaded
   */
  async onload() {
    await this.loadSettings();

    // Initialize services
    // Load urgency coefficients on startup
    const urgencyCoefficients = await parseUrgencyCoefficients(this.plugin.app);
    this.plugin.vaultScanner = new VaultScanner(
      this.plugin.app,
      this.plugin.settings,
      TaskParser.create(
        this.plugin.settings,
        this.plugin.app,
        urgencyCoefficients,
      ),
      urgencyCoefficients,
    );
    this.plugin.taskEditor = new TaskEditor(this.plugin.app);
    this.plugin.editorKeywordMenu = new EditorKeywordMenu(this.plugin);
    this.plugin.statusBarManager = new StatusBarManager(this.plugin);
    this.plugin.statusBarManager.setupStatusBarItem();

    // Register the custom view type
    this.plugin.registerView(
      TaskListView.viewType,
      (leaf) =>
        new TaskListView(
          leaf,
          this.plugin.tasks,
          this.plugin.settings.taskListViewMode,
          this.plugin.settings,
        ),
    );

    // Persist view-mode changes coming from TodoView toolbars
    const handler = async (e: Event) => {
      const detail = (e as CustomEvent).detail as { mode: TaskListViewMode };
      if (!detail?.mode) return;
      this.plugin.settings.taskListViewMode = detail.mode;
      await this.saveSettings();
      await this.plugin.uiManager.refreshOpenTaskListViews();
    };
    window.addEventListener('todoseq:view-mode-change', handler);
    this.plugin.register(() =>
      window.removeEventListener('todoseq:view-mode-change', handler),
    );

    // Persist future task sorting changes coming from TodoView toolbars
    const futureTaskHandler = async (e: Event) => {
      const detail = (e as CustomEvent).detail as {
        mode: 'showAll' | 'showUpcoming' | 'sortToEnd' | 'hideFuture';
      };
      if (!detail?.mode) return;
      this.plugin.settings.futureTaskSorting = detail.mode;
      await this.saveSettings();
      await this.plugin.uiManager.refreshOpenTaskListViews();
    };
    window.addEventListener(
      'todoseq:future-task-sorting-change',
      futureTaskHandler,
    );
    this.plugin.register(() =>
      window.removeEventListener(
        'todoseq:future-task-sorting-change',
        futureTaskHandler,
      ),
    );

    // Add settings tab
    this.plugin.addSettingTab(
      new TodoTrackerSettingTab(this.plugin.app, this.plugin),
    );

    // Add command to show tasks
    this.plugin.addCommand({
      id: 'show-task-list',
      name: 'Show task list',
      callback: () => this.plugin.uiManager.showTasks(),
    });

    // Add command to rescan vault
    this.plugin.addCommand({
      id: 'rescan-vault',
      name: 'Rescan vault',
      callback: async () => {
        await this.plugin.vaultScanner?.scanVault();
      },
    });

    // Add editor command to toggle task state
    this.plugin.addCommand({
      id: 'toggle-task-state',
      name: 'Toggle task state',
      editorCheckCallback: (
        checking: boolean,
        editor: Editor,
        view: MarkdownView,
      ) => {
        return this.plugin.taskManager.handleToggleTaskStateAtCursor(
          checking,
          editor,
          view,
        );
      },
      hotkeys: [
        {
          modifiers: ['Ctrl'],
          key: 'Enter',
        },
      ],
    });

    // Add editor command to cycle task state
    this.plugin.addCommand({
      id: 'cycle-task-state',
      name: 'Cycle task state',
      editorCheckCallback: (
        checking: boolean,
        editor: Editor,
        view: MarkdownView,
      ) => {
        return this.plugin.taskManager.handleCycleTaskStateAtCursor(
          checking,
          editor,
          view,
        );
      },
    });

    // Add editor command to add scheduled date
    this.plugin.addCommand({
      id: 'add-scheduled-date',
      name: 'Add scheduled date',
      editorCheckCallback: (
        checking: boolean,
        editor: Editor,
        view: MarkdownView,
      ) => {
        return this.plugin.taskManager.handleAddScheduledDateAtCursor(
          checking,
          editor,
          view,
        );
      },
    });

    // Add editor command to add deadline date
    this.plugin.addCommand({
      id: 'add-deadline-date',
      name: 'Add deadline date',
      editorCheckCallback: (
        checking: boolean,
        editor: Editor,
        view: MarkdownView,
      ) => {
        return this.plugin.taskManager.handleAddDeadlineDateAtCursor(
          checking,
          editor,
          view,
        );
      },
    });

    // Add editor command to set high priority
    this.plugin.addCommand({
      id: 'set-priority-high',
      name: 'Set priority high',
      editorCheckCallback: (
        checking: boolean,
        editor: Editor,
        view: MarkdownView,
      ) => {
        return this.plugin.taskManager.handleSetPriorityHighAtCursor(
          checking,
          editor,
          view,
        );
      },
    });

    // Add editor command to set medium priority
    this.plugin.addCommand({
      id: 'set-priority-medium',
      name: 'Set priority medium',
      editorCheckCallback: (
        checking: boolean,
        editor: Editor,
        view: MarkdownView,
      ) => {
        return this.plugin.taskManager.handleSetPriorityMediumAtCursor(
          checking,
          editor,
          view,
        );
      },
    });

    // Add editor command to set low priority
    this.plugin.addCommand({
      id: 'set-priority-low',
      name: 'Set priority low',
      editorCheckCallback: (
        checking: boolean,
        editor: Editor,
        view: MarkdownView,
      ) => {
        return this.plugin.taskManager.handleSetPriorityLowAtCursor(
          checking,
          editor,
          view,
        );
      },
    });

    // Listen to VaultScanner events for task updates
    this.plugin.vaultScanner.on('tasks-changed', (tasks) => {
      this.plugin.tasks = tasks;
      this.plugin.uiManager.refreshOpenTaskListViews();
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

    // Register file change events that delegate to VaultScanner
    this.plugin.registerEvent(
      this.plugin.app.vault.on('modify', (file) => {
        this.plugin.vaultScanner?.handleFileChange(file);
      }),
    );
    this.plugin.registerEvent(
      this.plugin.app.vault.on('create', (file) => {
        this.plugin.vaultScanner?.handleFileChange(file);
      }),
    );
    this.plugin.registerEvent(
      this.plugin.app.vault.on('delete', (file) => {
        this.plugin.vaultScanner?.handleFileChange(file);
      }),
    );
    this.plugin.registerEvent(
      // Obsidian passes (file, oldPath) for rename
      this.plugin.app.vault.on('rename', (file, oldPath) => {
        this.plugin.vaultScanner?.handleFileRename(file, oldPath);
      }),
    );

    // Conditional ribbon icon - only show on mobile devices
    if (Platform.isMobile) {
      this.plugin.addRibbonIcon(TASK_VIEW_ICON, 'Open TODOseq', () => {
        this.plugin.uiManager.showTasks();
      });
    }

    // Auto-open task view in right sidebar when plugin loads
    // Use onLayoutReady to ensure workspace is fully initialized
    this.plugin.app.workspace.onLayoutReady(() => {
      this.plugin.uiManager.showTasks();
    });
  }

  /**
   * Obsidian lifecycle method called when the plugin is unloaded
   */
  onunload() {
    // Clean up VaultScanner resources
    this.plugin.vaultScanner?.destroy();

    // Clean up UI manager resources
    this.plugin.uiManager?.cleanup();

    // Clean up status bar manager
    if (this.plugin.statusBarManager) {
      this.plugin.statusBarManager.cleanup();
      this.plugin.statusBarManager = null;
    }

    // Clear any remaining references
    this.plugin.taskEditor = null;
    this.plugin.editorKeywordMenu = null;
    this.plugin.taskFormatters.clear();
  }

  /**
   * Load settings from storage
   */
  private async loadSettings(): Promise<void> {
    await this.plugin.loadSettings();
  }

  /**
   * Save settings to storage
   */
  private async saveSettings(): Promise<void> {
    await this.plugin.saveSettings();
  }

  /**
   * Handle file metadata changes
   */
  private handleMetadataChange(file: TFile): void {
    this.plugin.vaultScanner?.handleFileChange(file);
  }

  /**
   * Handle workspace layout changes
   */
  private handleLayoutChange(): void {
    // Refresh task formatting when layout changes
    this.plugin.uiManager.setupTaskFormatting();
  }
}
