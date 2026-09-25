import TodoTracker from './main';
import {
  ArchiveDialog,
  showArchiveRunNotice,
} from './view/components/archive-dialog';
import { VaultScanner } from './services/vault-scanner';
import { SmartDateProcessor } from './services/smart-date-processor';
import { TaskWriter } from './services/task-writer';
import { EditorKeywordMenu } from './view/editor-extensions/editor-keyword-menu';
import { StatusBarManager } from './view/editor-extensions/status-bar';
import { TaskListView } from './view/task-list/task-list-view';
import { TodoTrackerSettingTab } from './settings/settings';
import { TaskParser } from './parser/task-parser';
import { OrgModeTaskParser } from './parser/org-mode-task-parser';
import { CodeCommentTaskParser } from './parser/code-comment-task-parser';
import { ParserRegistry } from './parser/parser-registry';
import { TASK_VIEW_ICON } from './main';
import { Editor, MarkdownView, Platform, Notice } from 'obsidian';
import { parseUrgencyCoefficients } from './utils/task-urgency';
import { ReaderViewFormatter } from './view/markdown-renderers/reader-formatting';
import { PropertySearchEngine } from './services/property-search-engine';
import { EventCoordinator } from './services/event-coordinator';
import { TaskUpdateCoordinator } from './services/task-update-coordinator';
import { ArchiveService, shouldAutoArchive } from './services/archive-service';
import { TodoseqCodeBlockProcessor } from './view/embedded-task-list/code-block-processor';
import {
  smartDatePlugin,
  smartDateHighlightPlugin,
} from './view/editor-extensions/smart-date-extension';

/** Window flag key to detect hot reload vs fresh Obsidian startup */
const TODOSEQ_HOT_RELOAD_FLAG = '__todoseq_wasUnloaded';

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

    // Create and register CodeCommentTaskParser if enabled
    if (this.plugin.settings.scanCodeFiles) {
      const codeCommentParser = CodeCommentTaskParser.create(
        this.plugin.keywordManager,
      );
      parserRegistry.register(codeCommentParser);
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

    // Initialize property search engine after vault scanner (it polls vault
    // scanner status during init, so the scanner must exist first).
    this.plugin.propertySearchEngine = new PropertySearchEngine(
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
      this.plugin.vaultScanner,
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

    // Initialize archive service (Auto-Archive engine) — reads the shared
    // KeywordManager for group validation; settings live under
    // settings.taskArchive. Constructed after the coordinator because apply
    // wiring delegates writes to it.
    this.plugin.archiveService = new ArchiveService(
      this.plugin.keywordManager,
      this.plugin.settings.taskArchive,
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

    // Initialize smart date processor and register its editor extension
    this.plugin.smartDateProcessor = new SmartDateProcessor(this.plugin);
    this.plugin.smartDateProcessor.setEnabled(
      this.plugin.settings.enableSmartDateRecognition,
    );
    this.plugin.registerEditorExtension([
      smartDatePlugin(this.plugin.smartDateProcessor, this.plugin.settings),
      smartDateHighlightPlugin(
        this.plugin.settings,
        () => this.plugin.vaultScanner?.getParser() ?? null,
      ),
    ]);

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

    // Add editor command to add description
    this.plugin.addCommand({
      id: 'add-description',
      name: 'Add description',
      icon: 'text',
      editorCheckCallback: (
        checking: boolean,
        editor: Editor,
        view: MarkdownView,
      ) => {
        return this.plugin.editorController.handleAddDescriptionAtCursor(
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

    // Add command to open the archive preview dialog
    this.plugin.addCommand({
      id: 'archive-completed-tasks',
      name: 'Archive completed tasks',
      icon: 'archive',
      callback: () => {
        this.openArchiveDialog();
      },
    });

    // Add command to undo the most recent archive run (session-scoped)
    this.plugin.addCommand({
      id: 'archive-undo-last-run',
      name: 'Undo last archive run',
      icon: 'undo-2',
      checkCallback: (checking: boolean) => {
        const service = this.plugin.archiveService;
        if (!service?.hasUndoableRun()) return false;
        if (!checking) {
          void this.performArchiveUndo();
        }
        return true;
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
        // Opt-in auto-archive after a full scan (plan 013). scan-completed
        // only fires from scanVault() — incremental file updates emit
        // tasks-changed without it — so no extra full-scan gating is needed.
        this.runAutoArchiveIfEnabled();
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
      // workaround obsidianmd/ui/sentence-case -- "Open TODOseq"
      this.plugin.addRibbonIcon(TASK_VIEW_ICON, 'Open ' + 'TODOseq', () => {
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

      // Auto-open behavior:
      // - First install: always show the task list (with reveal/focus)
      // - Plugin reload (hot reload/update): recreate the task list (without focus)
      // - Fresh Obsidian startup: do NOT auto-open (user opens manually via command/ribbon)
      //
      // The window flag distinguishes hot reload from fresh startup:
      // onunload() sets it, and since hot reload reuses the same JS context,
      // the flag survives. A fresh Obsidian startup has no flag.
      const isReload =
        (window as unknown as Record<string, unknown>)[
          TODOSEQ_HOT_RELOAD_FLAG
        ] === true;

      if (!this.plugin.settings._hasShownFirstInstallView) {
        this.plugin.settings._hasShownFirstInstallView = true;
        await this.plugin.saveSettings();
        // First install: reveal=true to show the sidebar and bring view into focus
        this.plugin.uiManager.showTasks(true).catch((error) => {
          new Notice('Failed to open task list');
          console.error('Error opening task list:', error);
        });
      } else if (isReload) {
        // Plugin was just reloaded (hot reload or update) — leaves were detached
        // in onunload, so recreate the panel without stealing focus
        (window as unknown as Record<string, unknown>)[
          TODOSEQ_HOT_RELOAD_FLAG
        ] = false;
        this.plugin.uiManager.showTasks(false).catch((error) => {
          new Notice('Failed to open task list');
          console.error('Error opening task list:', error);
        });
      }
      // else: fresh Obsidian startup — do not auto-open

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
    // Set window flag to indicate this was a hot reload (not a fresh startup)
    // This survives the reload because hot reload reuses the same JS context.
    // Checked in onLayoutReady to recreate the task list on reload.
    (window as unknown as Record<string, unknown>)[TODOSEQ_HOT_RELOAD_FLAG] =
      true;

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

    // Destroy PropertySearchEngine and clear plugin reference.
    // The instance is owned by this lifecycle manager - no static singleton to reset.
    this.plugin.propertySearchEngine?.destroy();
    this.plugin.propertySearchEngine = null;

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

    // Clean up smart date processor
    if (this.plugin.smartDateProcessor) {
      this.plugin.smartDateProcessor.destroy();
      this.plugin.smartDateProcessor = null;
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
   * Open the Auto-Archive preview dialog. Shared by the command, the
   * settings entry point, and (in plan 013) nowhere else — the auto-run
   * never opens a dialog.
   */
  openArchiveDialog(): void {
    const service = this.plugin.archiveService;
    const scanner = this.plugin.vaultScanner;
    const { taskStateManager, taskUpdateCoordinator, keywordManager } =
      this.plugin;
    if (
      !service ||
      !scanner ||
      !taskStateManager ||
      !taskUpdateCoordinator ||
      !keywordManager
    ) {
      new Notice(
        'Archive service is not ready yet. Try again after the vault scan completes.',
      );
      return;
    }
    const dialog = new ArchiveDialog(
      {
        settings: this.plugin.settings,
        taskStateManager,
        taskUpdateCoordinator,
        archiveService: service,
        keywordManager,
        vaultScanner: scanner,
        saveSettings: () => this.plugin.saveSettings(),
        performUndo: () => this.performArchiveUndo(),
        app: this.plugin.app,
      },
      scanner.getKeywordManager(),
    );
    dialog.open();
  }

  /**
   * Opt-in auto-archive (plan 013): after a full vault scan, archive tasks
   * matching the days-mode criteria when the user enabled the setting.
   * Silent-except-notice: no matches → no notice; the completion notice
   * carries an Undo button that reuses the shared undo flow. Never throws
   * into the scan listener.
   */
  private runAutoArchiveIfEnabled(): void {
    const service = this.plugin.archiveService;
    const coordinator = this.plugin.taskUpdateCoordinator;
    const taskArchive = this.plugin.settings.taskArchive;
    const decision = shouldAutoArchive({
      autoArchiveEnabled: taskArchive?.autoArchiveEnabled === true,
      hasService: !!service && !!coordinator,
      isManualRunInProgress: service?.isRunning() === true,
    });
    if (!decision.run) {
      console.debug(`TODOseq: auto-archive skipped (${decision.reason})`);
      return;
    }

    // Fire-and-forget with full error containment — never break the scan listener.
    void (async () => {
      if (!service || !coordinator) return; // re-check inside the async closure
      // Enforce days-mode for automatic runs regardless of the saved
      // criterionMode: date mode is manual-run only by product decision.
      const matches = service.evaluateArchiveCriteria(
        this.plugin.taskStateManager.getTasks(),
        { ...taskArchive, criterionMode: 'days' },
        new Date(),
      );
      if (matches.length === 0) return; // no notice on no-ops

      const taskStateManager = this.plugin.taskStateManager;
      const result = await service.applyArchives(matches, {
        getTask: (path, line, cellIndex) =>
          taskStateManager.findTaskByPathAndLine(path, line, cellIndex),
        apply: (task, target) =>
          coordinator.updateTaskState(task, target, 'task-list'),
      });

      const archivedCount = result.archived.length;
      if (archivedCount === 0) return;

      showArchiveRunNotice(
        `TODOseq auto-archived ${archivedCount} task${
          archivedCount === 1 ? '' : 's'
        }`,
        {
          actionLabel: service.hasUndoableRun() ? 'Undo' : undefined,
          onAction: () => void this.performArchiveUndo(),
          timeoutMs: 10_000,
        },
      );
    })().catch((error) => {
      console.debug('TODOseq: auto-archive skipped:', error);
    });
  }

  /**
   * Revert the most recent archive run (session undo). Each journal record
   * is verified against the current file line before reverting; changed or
   * missing lines are skipped and reported. Shared by the undo command and
   * the auto-run completion notice (plan 013) so the flows cannot drift.
   */
  async performArchiveUndo(): Promise<void> {
    const service = this.plugin.archiveService;
    const coordinator = this.plugin.taskUpdateCoordinator;
    if (!service || !coordinator) return;

    try {
      const outcome = await service.undoLastRun({
        // Live line read: prefers the editor buffer for open files (cachedRead
        // can lag until autosave, which would fail undo verification).
        getRawLine: (path, line) => this.plugin.readLiveLine(path, line),
        apply: async (task, originalState) => {
          // The service re-applies the journaled full-task snapshot (current
          // rawText + archived state) — no reconstruction needed. Table-cell
          // tasks carry their isTableTask/tableCell identity in the
          // snapshot, so generateTaskLine regenerates the cell correctly.
          await coordinator.updateTaskState(task, originalState, 'task-list');
        },
      });

      new Notice(
        `Restored ${outcome.reverted.length} task${
          outcome.reverted.length === 1 ? '' : 's'
        }` +
          (outcome.skipped.length > 0
            ? `, skipped ${outcome.skipped.length}`
            : ''),
      );
      // No full rescan: the coordinator re-added restored tasks to the state
      // manager (archived→non-archived re-add path). A rescan would read
      // stale pre-undo content via cachedRead for open files and undo the
      // manager update.
    } catch (error) {
      console.debug('TODOseq: archive undo failed:', error);
      new Notice('Undo failed. See console for details.');
    }
  }
}
