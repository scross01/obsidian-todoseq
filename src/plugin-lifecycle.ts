import TodoTracker from './main';
import { VaultScanner } from './services/vault-scanner';
import { TaskWriter } from './services/task-writer';
import { EditorKeywordMenu } from './view/editor-extensions/editor-keyword-menu';
import { StatusBarManager } from './view/editor-extensions/status-bar';
import {
  TaskListView,
  TaskListViewMode,
} from './view/task-list/task-list-view';
import { TodoTrackerSettingTab } from './settings/settings';
import { TaskParser } from './parser/task-parser';
import { TASK_VIEW_ICON } from './main';
import { Editor, MarkdownView, Platform } from 'obsidian';
import { parseUrgencyCoefficients } from './utils/task-urgency';
import { ReaderViewFormatter } from './view/markdown-renderers/reader-formatting';
import { PropertySearchEngine } from './services/property-search-engine';
import { EventCoordinator } from './services/event-coordinator';

export class PluginLifecycleManager {
  private eventCoordinator: EventCoordinator | null = null;

  constructor(private plugin: TodoTracker) {}

  /**
   * Obsidian lifecycle method called when the plugin is loaded
   */
  async onload() {
    await this.loadSettings();

    // Initialize services
    // Load urgency coefficients on startup
    const urgencyCoefficients = await parseUrgencyCoefficients(this.plugin.app);

    // VaultScanner now uses the centralized TaskStateManager
    this.plugin.vaultScanner = new VaultScanner(
      this.plugin.app,
      this.plugin.settings,
      TaskParser.create(
        this.plugin.settings,
        this.plugin.app,
        urgencyCoefficients,
      ),
      this.plugin.taskStateManager,
    );

    // Initialize property search engine after vault scanner (we'll register listeners later)
    this.plugin.propertySearchEngine = PropertySearchEngine.getInstance(
      this.plugin.app,
    );

    // Create EventCoordinator - single source for vault events
    this.eventCoordinator = new EventCoordinator(
      this.plugin.app,
      this.plugin.taskStateManager,
    );
    this.eventCoordinator.setVaultScanner(this.plugin.vaultScanner);
    this.eventCoordinator.setPropertySearchEngine(
      this.plugin.propertySearchEngine,
    );
    this.eventCoordinator.initialize();

    // Expose EventCoordinator on plugin for other components
    this.plugin.eventCoordinator = this.eventCoordinator;

    this.plugin.taskEditor = new TaskWriter(this.plugin.app);
    this.plugin.editorKeywordMenu = new EditorKeywordMenu(this.plugin);
    this.plugin.statusBarManager = new StatusBarManager(this.plugin);
    this.plugin.statusBarManager.setupStatusBarItem();

    // Initialize reader view formatter with vaultScanner
    // Note: ReaderViewFormatter now uses the shared parser from VaultScanner
    this.plugin.readerViewFormatter = new ReaderViewFormatter(
      this.plugin,
      this.plugin.vaultScanner,
    );
    this.plugin.readerViewFormatter.registerPostProcessor();

    // Register the custom view type
    // TaskListView now subscribes to TaskStateManager for task updates
    this.plugin.registerView(
      TaskListView.viewType,
      (leaf) =>
        new TaskListView(
          leaf,
          this.plugin.taskStateManager,
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
        return this.plugin.editorController.handleToggleTaskStateAtCursor(
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
        return this.plugin.editorController.handleCycleTaskStateAtCursor(
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
        return this.plugin.editorController.handleAddScheduledDateAtCursor(
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
        return this.plugin.editorController.handleAddDeadlineDateAtCursor(
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
        return this.plugin.editorController.handleSetPriorityHighAtCursor(
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
        return this.plugin.editorController.handleSetPriorityMediumAtCursor(
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
        return this.plugin.editorController.handleSetPriorityLowAtCursor(
          checking,
          editor,
          view,
        );
      },
    });

    // Listen to VaultScanner events for task updates
    // Note: TaskListView now subscribes directly to TaskStateManager,
    // but we still refresh UI components that need updates
    this.plugin.vaultScanner.on('scan-started', () => {
      // Refresh all task list views to show "Scanning vault..." message
      // This updates views that have no tasks yet to indicate scan is in progress
      this.plugin.uiManager.refreshOpenTaskListViews();
      this.plugin.embeddedTaskListProcessor?.refreshAllEmbeddedTaskLists();
    });

    this.plugin.vaultScanner.on('scan-completed', () => {
      // Use setTimeout to ensure tasks are fully set in TaskStateManager before refreshing
      setTimeout(() => {
        // Explicitly refresh the TaskListView to ensure it updates
        this.plugin.uiManager.refreshOpenTaskListViews();
        // Also refresh embedded lists
        this.plugin.embeddedTaskListProcessor?.refreshAllEmbeddedTaskLists();
      }, 0);
    });

    this.plugin.vaultScanner.on('tasks-changed', () => {
      // UI components that aren't subscribed to TaskStateManager directly
      // can be refreshed here if needed
      this.plugin.statusBarManager?.updateTaskCount();
    });

    this.plugin.vaultScanner.on('scan-error', (error) => {
      console.error('TODOseq: VaultScanner scan error:', error);
    });

    // Setup task formatting based on current settings
    this.plugin.uiManager.setupTaskFormatting();

    // Setup right-click event handlers for task keywords
    this.plugin.uiManager.setupTaskKeywordContextMenu();

    // Vault events are now handled by EventCoordinator (single source of truth)
    // File change events are debounced and batched by the coordinator

    // Conditional ribbon icon - only show on mobile devices
    if (Platform.isMobile) {
      this.plugin.addRibbonIcon(TASK_VIEW_ICON, 'Open TODOseq', () => {
        this.plugin.uiManager.showTasks();
      });
    }

    // Auto-open task view in right sidebar when plugin loads
    // Use onLayoutReady to ensure workspace is fully initialized
    this.plugin.app.workspace.onLayoutReady(async () => {
      // Set initialization flag to show scanning message immediately
      // This ensures views show "Scanning vault..." before the scan starts
      this.plugin.vaultScanner?.setInitializationComplete();

      // Wait for the initial vault scan to complete before showing the task view
      // This ensures tasks are available when the view first renders
      await this.plugin.vaultScanner?.scanVault();

      // Set property search engine on vault scanner and register listeners (but don't initialize yet - lazy initialize)
      if (this.plugin.propertySearchEngine) {
        this.plugin.vaultScanner?.setPropertySearchEngine(
          this.plugin.propertySearchEngine,
        );
      }

      // Only show the task view on first install (not on subsequent reloads)
      if (!this.plugin.settings._hasShownFirstInstallView) {
        this.plugin.settings._hasShownFirstInstallView = true;
        await this.plugin.saveSettings();
        // First install: reveal=true to show the sidebar and bring view into focus
        this.plugin.uiManager.showTasks(true);
      } else {
        // On subsequent reloads, ensure the panel is available but don't steal focus
        this.plugin.uiManager.showTasks(false);
      }
    });
  }

  /**
   * Obsidian lifecycle method called when the plugin is unloaded
   */
  onunload() {
    // Clean up EventCoordinator (removes all vault event listeners)
    this.eventCoordinator?.destroy();

    // Clean up VaultScanner resources
    this.plugin.vaultScanner?.destroy();

    // Reset PropertySearchEngine singleton to prevent stale references on reload
    PropertySearchEngine.resetInstance();

    // Clean up UI manager resources
    this.plugin.uiManager?.cleanup();

    // Clean up status bar manager
    if (this.plugin.statusBarManager) {
      this.plugin.statusBarManager.cleanup();
      this.plugin.statusBarManager = null;
    }

    // Clean up reader view formatter
    if (this.plugin.readerViewFormatter) {
      this.plugin.readerViewFormatter.cleanup();
      this.plugin.readerViewFormatter = null;
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
   * Handle workspace layout changes
   */
  private handleLayoutChange(): void {
    // Refresh task formatting when layout changes
    this.plugin.uiManager.setupTaskFormatting();
  }
}
