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
import { OrgModeTaskParser } from './parser/org-mode-task-parser';
import { ParserRegistry } from './parser/parser-registry';
import { TASK_VIEW_ICON } from './main';
import { Editor, MarkdownView, Platform, Notice } from 'obsidian';
import { parseUrgencyCoefficients } from './utils/task-urgency';
import { ReaderViewFormatter } from './view/markdown-renderers/reader-formatting';
import { PropertySearchEngine } from './services/property-search-engine';
import { EventCoordinator } from './services/event-coordinator';
import { TaskUpdateCoordinator } from './services/task-update-coordinator';
import { TodoseqCodeBlockProcessor } from './view/embedded-task-list/code-block-processor';

export class PluginLifecycleManager {
  private eventCoordinator: EventCoordinator | null = null;

  constructor(private plugin: TodoTracker) {}

  /**
   * Obsidian lifecycle method called when the plugin is loaded.
   * Delegates to this.plugin.loadSettings() for settings initialization.
   */
  async onload() {
    await this.loadSettings();

    // Load urgency coefficients on startup
    const urgencyCoefficients = await parseUrgencyCoefficients(this.plugin.app);

    // Create parser registry and parsers
    const parserRegistry = new ParserRegistry();

    // Create and register TaskParser
    const taskParser = TaskParser.create(
      this.plugin.keywordManager,
      this.plugin.app,
      urgencyCoefficients,
      {
        includeCalloutBlocks: this.plugin.settings.includeCalloutBlocks,
        includeCodeBlocks: this.plugin.settings.includeCodeBlocks,
        includeCommentBlocks: this.plugin.settings.includeCommentBlocks,
        languageCommentSupport: this.plugin.settings.languageCommentSupport,
      },
    );
    parserRegistry.register(taskParser);

    // Create and register OrgModeTaskParser if enabled
    if (this.plugin.settings.detectOrgModeFiles) {
      const orgModeParser = OrgModeTaskParser.create(
        this.plugin.keywordManager,
        this.plugin.app,
        urgencyCoefficients,
      );
      parserRegistry.register(orgModeParser);
    }

    // VaultScanner - use shared KeywordManager and ChangeTracker from main.ts
    this.plugin.vaultScanner = new VaultScanner(
      this.plugin,
      this.plugin.settings,
      this.plugin.taskStateManager,
      urgencyCoefficients,
      this.plugin.keywordManager,
      parserRegistry,
      this.plugin.changeTracker,
    );

    // Initialize property search engine after vault scanner
    this.plugin.propertySearchEngine = PropertySearchEngine.getInstance(
      this.plugin.app,
      {
        taskStateManager: this.plugin.taskStateManager,
        refreshAllTaskListViews: () => this.plugin.refreshAllTaskListViews(),
        vaultScanner: this.plugin.vaultScanner,
      },
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

    // Initialize task update coordinator with shared ChangeTracker
    this.plugin.taskUpdateCoordinator = new TaskUpdateCoordinator(
      this.plugin,
      this.plugin.taskStateManager,
      this.plugin.keywordManager,
      this.plugin.changeTracker,
    );

    // Initialize embedded task list processor
    this.plugin.embeddedTaskListProcessor = new TodoseqCodeBlockProcessor(
      this.plugin,
    );
    this.plugin.embeddedTaskListProcessor.registerProcessor();

    this.plugin.taskEditor = new TaskWriter(
      this.plugin,
      this.plugin.vaultScanner.getKeywordManager(),
    );
    this.plugin.editorKeywordMenu = new EditorKeywordMenu(this.plugin);
    this.plugin.statusBarManager = new StatusBarManager(this.plugin);
    this.plugin.statusBarManager.setupStatusBarItem();

    // Initialize reader view formatter with vaultScanner
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
          this.plugin,
          this.plugin.taskStateManager.getKeywordManager(),
        ),
    );

    // Persist view-mode changes coming from TodoView toolbars
    const saveViewMode = async (e: Event) => {
      const detail = (e as CustomEvent).detail as { mode: TaskListViewMode };
      if (!detail?.mode) return;
      this.plugin.settings.taskListViewMode = detail.mode;
      await this.saveSettings();
      await this.plugin.uiManager.refreshOpenTaskListViews();
    };
    const handler = (e: Event) => {
      void saveViewMode(e);
    };
    window.addEventListener('todoseq:view-mode-change', handler);
    this.plugin.register(() =>
      window.removeEventListener('todoseq:view-mode-change', handler),
    );

    // Persist future task sorting changes coming from TodoView toolbars
    const saveFutureTaskSorting = async (e: Event) => {
      const detail = (e as CustomEvent).detail as {
        mode: 'showAll' | 'showUpcoming' | 'sortToEnd' | 'hideFuture';
      };
      if (!detail?.mode) return;
      this.plugin.settings.futureTaskSorting = detail.mode;
      await this.saveSettings();
      await this.plugin.uiManager.refreshOpenTaskListViews();
    };
    const futureTaskHandler = (e: Event) => {
      void saveFutureTaskSorting(e);
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
      icon: 'list-todo',
      callback: () => this.plugin.uiManager.showTasks(),
    });

    // Add command to show tasks in a new tab
    this.plugin.addCommand({
      id: 'show-task-list-in-new-tab',
      name: 'Open task list in new tab',
      icon: 'list-todo',
      callback: () => this.plugin.uiManager.showTasksInNewTab(),
    });

    // Add command to rescan vault
    this.plugin.addCommand({
      id: 'rescan-vault',
      name: 'Rescan vault',
      icon: 'refresh-cw',
      callback: async () => {
        await this.plugin.vaultScanner?.scanVault();
      },
    });

    // Add editor command to toggle task state
    this.plugin.addCommand({
      id: 'toggle-task-state',
      name: 'Toggle task state',
      icon: 'square-check',
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
    });

    // Add editor command to cycle task state
    this.plugin.addCommand({
      id: 'cycle-task-state',
      name: 'Cycle task state',
      icon: 'circle-check',
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
      icon: 'calendar-clock',
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
      icon: 'calendar-range',
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
      icon: 'chevrons-up',
      editorCheckCallback: ((
        checking: boolean,
        editor: Editor,
        view: MarkdownView,
      ) => {
        return this.plugin.editorController.handleSetPriorityHighAtCursor(
          checking,
          editor,
          view,
        );
      }) as unknown as (
        checking: boolean,
        editor: Editor,
        ctx: unknown,
      ) => boolean | void,
    });

    // Add editor command to set medium priority
    this.plugin.addCommand({
      id: 'set-priority-medium',
      name: 'Set priority medium',
      icon: 'chevron-up',
      editorCheckCallback: ((
        checking: boolean,
        editor: Editor,
        view: MarkdownView,
      ) => {
        return this.plugin.editorController.handleSetPriorityMediumAtCursor(
          checking,
          editor,
          view,
        );
      }) as unknown as (
        checking: boolean,
        editor: Editor,
        ctx: unknown,
      ) => boolean | void,
    });

    // Add editor command to set low priority
    this.plugin.addCommand({
      id: 'set-priority-low',
      name: 'Set priority low',
      icon: 'chevrons-down',
      editorCheckCallback: ((
        checking: boolean,
        editor: Editor,
        view: MarkdownView,
      ) => {
        return this.plugin.editorController.handleSetPriorityLowAtCursor(
          checking,
          editor,
          view,
        );
      }) as unknown as (
        checking: boolean,
        editor: Editor,
        ctx: unknown,
      ) => boolean | void,
    });

    // Add editor command to copy task to today's daily note
    this.plugin.addCommand({
      id: 'copy-task-to-today',
      name: 'Copy task to today',
      icon: 'copy',
      editorCheckCallback: (
        checking: boolean,
        editor: Editor,
        view: MarkdownView,
      ) => {
        return this.plugin.editorController.handleCopyTaskToTodayAtCursor(
          checking,
          editor,
          view,
        );
      },
    });

    // Add editor command to move task to today's daily note
    this.plugin.addCommand({
      id: 'move-task-to-today',
      name: 'Move task to today',
      icon: 'arrow-right',
      editorCheckCallback: (
        checking: boolean,
        editor: Editor,
        view: MarkdownView,
      ) => {
        return this.plugin.editorController.handleMoveTaskToTodayAtCursor(
          checking,
          editor,
          view,
        );
      },
    });

    // Add editor command to migrate task to today's daily note
    this.plugin.addCommand({
      id: 'migrate-task-to-today',
      name: 'Migrate task to today',
      icon: 'arrow-up-right',
      editorCheckCallback: (
        checking: boolean,
        editor: Editor,
        view: MarkdownView,
      ) => {
        return this.plugin.editorController.handleMigrateTaskToTodayAtCursor(
          checking,
          editor,
          view,
        );
      },
    });

    // Add editor command to open context menu
    this.plugin.addCommand({
      id: 'open-context-menu',
      name: 'Open context menu',
      icon: 'square-menu',
      editorCheckCallback: (
        checking: boolean,
        editor: Editor,
        view: MarkdownView,
      ) => {
        return this.plugin.editorController.handleOpenContextMenuAtCursor(
          checking,
          editor,
          view,
        );
      },
    });

    // Add editor command to open scheduled date picker
    this.plugin.addCommand({
      id: 'open-scheduled-date-picker',
      name: 'Open scheduled date picker',
      icon: 'calendar-clock',
      editorCheckCallback: (
        checking: boolean,
        editor: Editor,
        view: MarkdownView,
      ) => {
        return this.plugin.editorController.handleOpenScheduledDatePickerAtCursor(
          checking,
          editor,
          view,
        );
      },
    });

    // Add editor command to open deadline date picker
    this.plugin.addCommand({
      id: 'open-deadline-date-picker',
      name: 'Open deadline date picker',
      icon: 'calendar-range',
      editorCheckCallback: (
        checking: boolean,
        editor: Editor,
        view: MarkdownView,
      ) => {
        return this.plugin.editorController.handleOpenDeadlineDatePickerAtCursor(
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
      this.plugin.uiManager.refreshOpenTaskListViews().catch((error) => {
        new Notice('Failed to refresh task list');
        console.error('Error refreshing task list:', error);
      });
      this.plugin.embeddedTaskListProcessor?.refreshAllEmbeddedTaskLists();
    });

    this.plugin.vaultScanner.on('scan-completed', () => {
      // Use setTimeout to ensure tasks are fully set in TaskStateManager before refreshing
      window.setTimeout(() => {
        // Explicitly refresh the TaskListView to ensure it updates
        this.plugin.uiManager.refreshOpenTaskListViews().catch((error) => {
          new Notice('Failed to refresh task list');
          console.error('Error refreshing task list:', error);
        });
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

    // Conditional ribbon icon - only show on mobile devices
    if (Platform.isMobile) {
      // eslint-disable-next-line obsidianmd/ui/sentence-case
      this.plugin.addRibbonIcon(TASK_VIEW_ICON, 'Open TODOseq', () => {
        this.plugin.uiManager.showTasks().catch((error) => {
          new Notice('Failed to open task list');
          console.error('Error opening task list:', error);
        });
      });
    }

    // Auto-open task view in right sidebar when plugin loads
    // Use onLayoutReady to ensure workspace is fully initialized
    this.plugin.app.workspace.onLayoutReady(async () => {
      // Set initialization flag to show scanning message immediately
      // This ensures views show "Scanning vault..." before the scan starts
      this.plugin.vaultScanner?.setInitializationComplete();

      // IMPORTANT: Run the vault scan concurrently without an 'await' lock!
      // This is absolutely critical to achieving early Largest Contentful Paint (LCP).
      // If we wait for the vault to scan first, the UI widget will not even mount
      // to the screen until the 3-second block succeeds. By firing it off concurrently,
      // the TaskListView renders immediately, and the `chunkedRenderQueue` drops the
      // progressive LCP tasks down securely behind it!
      const scanPromise = this.plugin.vaultScanner?.scanVault();

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
        this.plugin.uiManager.showTasks(true).catch((error) => {
          new Notice('Failed to open task list');
          console.error('Error opening task list:', error);
        });
      } else {
        // On subsequent reloads, ensure the panel is available but don't steal focus
        this.plugin.uiManager.showTasks(false).catch((error) => {
          new Notice('Failed to open task list');
          console.error('Error opening task list:', error);
        });
      }

      // Allow any fatal exceptions inside the unawaited scan sequence to securely log
      // without failing the Obsidian Workspace startup initialization.
      scanPromise?.catch((err) => {
        console.error('TODOseq: Fatal background scanning error:', err);
      });
    });
  }

  /**
   * Obsidian lifecycle method called when the plugin is unloaded
   */
  async onunload() {
    // Close all task list leaves to prevent orphaned views during hot reload
    const leaves = this.plugin.app.workspace.getLeavesOfType(
      TaskListView.viewType,
    );
    for (const leaf of leaves) {
      leaf.detach();
    }

    // Clean up embedded task list processor
    if (this.plugin.embeddedTaskListProcessor) {
      this.plugin.embeddedTaskListProcessor.cleanup();
    }

    // Clean up EventCoordinator (removes all vault event listeners)
    await this.eventCoordinator?.destroy();

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
}
