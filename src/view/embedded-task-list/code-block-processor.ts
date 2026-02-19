import { MarkdownPostProcessorContext } from 'obsidian';
import TodoTracker from '../../main';
import { EmbeddedTaskListRenderer } from './task-list-renderer';
import { EmbeddedTaskListManager } from './task-list-manager';
import { EmbeddedTaskListEventHandler } from './event-handler';
import { TodoseqCodeBlockParser } from './code-block-parser';

/**
 * Main processor for todoseq code blocks.
 * Registers as a markdown code block processor and coordinates all components.
 */
export class TodoseqCodeBlockProcessor {
  private plugin: TodoTracker;
  private renderer: EmbeddedTaskListRenderer;
  private manager: EmbeddedTaskListManager;
  private eventHandler: EmbeddedTaskListEventHandler;
  private unsubscribeFromStateManager: (() => void) | null = null;

  constructor(plugin: TodoTracker) {
    this.plugin = plugin;
    this.renderer = new EmbeddedTaskListRenderer(plugin);
    this.manager = new EmbeddedTaskListManager(plugin.settings);
    this.eventHandler = new EmbeddedTaskListEventHandler(
      plugin,
      this.renderer,
      this.manager,
    );

    // Subscribe to task state changes from the centralized state manager
    // This ensures embedded lists refresh when tasks are updated, added, or removed
    // Use debouncing to prevent excessive re-renders during rapid changes
    let embedRefreshTimeout: ReturnType<typeof setTimeout> | null = null;
    const EMBED_REFRESH_DEBOUNCE_MS = 150;

    this.unsubscribeFromStateManager = plugin.taskStateManager.subscribe(
      (tasks) => {
        if (embedRefreshTimeout) {
          clearTimeout(embedRefreshTimeout);
        }
        embedRefreshTimeout = setTimeout(() => {
          embedRefreshTimeout = null;
          this.onTasksChanged();
        }, EMBED_REFRESH_DEBOUNCE_MS);
      },
    );

    // Register with EventCoordinator for file-level notifications
    // This consolidates debouncing - EventCoordinator handles debounce (250ms)
    // so we don't need separate debounce in eventHandler
    if (plugin.eventCoordinator) {
      plugin.eventCoordinator.onFileChange((event) => {
        // Handle file deletion/rename cleanup for embedded lists
        if (event.type === 'delete') {
          this.eventHandler.handleFileDeleted(event.file.path);
        } else if (event.type === 'rename' && event.oldPath) {
          this.eventHandler.handleFileRenamed(event.oldPath, event.file.path);
        }
        // For modify/create, the TaskStateManager subscription will handle refresh
      });
    }
  }

  /**
   * Register the code block processor with Obsidian
   */
  registerProcessor(): void {
    // Register the markdown code block processor for 'todoseq' language
    this.plugin.registerMarkdownCodeBlockProcessor(
      'todoseq',
      async (source, el, ctx) => {
        await this.processCodeBlock(source, el, ctx);
      },
    );

    // Register event listeners for real-time updates
    this.eventHandler.registerEventListeners();
  }

  /**
   * Process a todoseq code block
   * @param source The code block source content
   * @param el The container element
   * @param ctx The markdown post processor context
   */
  private async processCodeBlock(
    source: string,
    el: HTMLElement,
    ctx: MarkdownPostProcessorContext,
  ): Promise<void> {
    try {
      // Parse parameters from code block
      const params = TodoseqCodeBlockParser.parse(source);

      if (params.error) {
        this.renderer.renderError(el, params.error);
        return;
      }

      // Get all tasks from the vault
      const allTasks = this.plugin.getTasks();

      // Filter, sort, and get count in a single operation
      const { tasks: filteredTasks, totalCount } =
        await this.manager.filterAndSortTasksWithCount(allTasks, params);

      // Generate unique container ID for this code block
      const containerId = `todoseq-${Math.random().toString(36).slice(2, 8)}`;
      el.id = containerId;

      // Determine initial collapse state (collapsed if collapse: true)
      const initialCollapsed = params.collapse === true;

      // Track this code block for real-time updates with initial collapse state
      this.eventHandler.trackCodeBlock(
        containerId,
        el,
        source,
        ctx.sourcePath,
        initialCollapsed,
      );

      // Render the task list with collapse support
      this.renderer.renderTaskList(
        el,
        filteredTasks,
        params,
        totalCount,
        initialCollapsed,
        (id: string) => this.eventHandler.toggleCollapse(id),
        containerId,
      );
    } catch (error) {
      console.error('Error processing todoseq code block:', error);
      this.renderer.renderError(el, `Processing error: ${error.message}`);
    }
  }

  /**
   * Update settings when plugin settings change
   */
  updateSettings(): void {
    this.manager.updateSettings(this.plugin.settings);
    this.eventHandler.updateSettings(this.plugin.settings);
    // Refresh all embedded task lists to reflect new settings
    this.refreshAllEmbeddedTaskLists();
  }

  /**
   * Refresh all active embedded task lists
   * This is called when tasks are updated directly in views (not via file changes)
   */
  refreshAllEmbeddedTaskLists(): void {
    // Invalidate the cache to ensure we get fresh results
    // This increments the version number to force cache miss
    this.manager.invalidateCache();
    // Refresh all active code blocks
    this.eventHandler.refreshAllCodeBlocks();
  }

  /**
   * Called when tasks change in the state manager
   */
  private onTasksChanged(): void {
    this.refreshAllEmbeddedTaskLists();
  }

  /**
   * Clean up resources when plugin unloads
   */
  cleanup(): void {
    // Unsubscribe from state manager
    if (this.unsubscribeFromStateManager) {
      this.unsubscribeFromStateManager();
      this.unsubscribeFromStateManager = null;
    }
    this.eventHandler.clearAllCodeBlocks();
  }
}
