import { TFile } from 'obsidian';
import TodoTracker from '../../main';
import { EmbeddedTaskListRenderer } from './task-list-renderer';
import { EmbeddedTaskListManager } from './task-list-manager';
import { TodoseqCodeBlockParser } from './code-block-parser';
import { TodoTrackerSettings } from '../../settings/settings';

/**
 * Handles real-time updates for embedded task lists.
 * Monitors vault events and triggers re-rendering when tasks change.
 */
export class EmbeddedTaskListEventHandler {
  private plugin: TodoTracker;
  private renderer: EmbeddedTaskListRenderer;
  private manager: EmbeddedTaskListManager;

  // Track active code blocks
  private activeCodeBlocks: Map<
    string,
    {
      element: HTMLElement;
      source: string;
      filePath: string;
      isCollapsed?: boolean;
    }
  > = new Map();

  // Debounce timers for file changes
  private refreshTimeouts: Map<string, NodeJS.Timeout> = new Map();
  private readonly DEBOUNCE_MS = 300;

  constructor(
    plugin: TodoTracker,
    renderer: EmbeddedTaskListRenderer,
    manager: EmbeddedTaskListManager,
  ) {
    this.plugin = plugin;
    this.renderer = renderer;
    this.manager = manager;
  }

  /**
   * Register all event listeners
   */
  registerEventListeners(): void {
    // File modification events
    this.plugin.registerEvent(
      this.plugin.app.vault.on('modify', (file) => {
        if (file instanceof TFile && file.extension === 'md') {
          this.handleFileModified(file.path);
        }
      }),
    );

    // File creation events
    this.plugin.registerEvent(
      this.plugin.app.vault.on('create', (file) => {
        if (file instanceof TFile && file.extension === 'md') {
          this.handleFileCreated(file.path);
        }
      }),
    );

    // File deletion events
    this.plugin.registerEvent(
      this.plugin.app.vault.on('delete', (file) => {
        if (file instanceof TFile && file.extension === 'md') {
          this.handleFileDeleted(file.path);
        }
      }),
    );

    // File rename events
    this.plugin.registerEvent(
      this.plugin.app.vault.on('rename', (file, oldPath) => {
        if (file instanceof TFile && file.extension === 'md') {
          this.handleFileRenamed(oldPath, file.path);
        }
      }),
    );

    // Metadata cache events (for task changes)
    this.plugin.registerEvent(
      this.plugin.app.metadataCache.on('changed', (file) => {
        if (file instanceof TFile) {
          this.handleMetadataChanged(file.path);
        }
      }),
    );

    // Workspace events for file opening
    this.plugin.registerEvent(
      this.plugin.app.workspace.on('file-open', (file) => {
        if (file instanceof TFile) {
          this.handleFileOpened(file.path);
        }
      }),
    );
  }

  /**
   * Track a new code block
   * @param containerId Unique ID for the code block container
   * @param element The container element
   * @param source The code block source content
   * @param filePath The file path containing this code block
   * @param initialCollapsed Optional initial collapsed state
   */
  trackCodeBlock(
    containerId: string,
    element: HTMLElement,
    source: string,
    filePath: string,
    initialCollapsed?: boolean,
  ): void {
    this.activeCodeBlocks.set(containerId, {
      element,
      source,
      filePath,
      isCollapsed: initialCollapsed,
    });
  }

  /**
   * Toggle the collapse state of a code block
   * @param containerId ID of the code block to toggle
   */
  toggleCollapse(containerId: string): void {
    const codeBlock = this.activeCodeBlocks.get(containerId);
    if (!codeBlock) return;

    // Toggle the collapse state
    codeBlock.isCollapsed = !codeBlock.isCollapsed;

    // Refresh the code block to re-render with new state
    this.refreshCodeBlock(containerId);
  }

  /**
   * Get the current collapse state of a code block
   * @param containerId ID of the code block
   * @returns The current collapse state, or undefined if not tracked
   */
  getCollapseState(containerId: string): boolean | undefined {
    const codeBlock = this.activeCodeBlocks.get(containerId);
    return codeBlock?.isCollapsed;
  }

  /**
   * Remove tracking for a code block
   * @param containerId The ID of the code block to remove
   */
  untrackCodeBlock(containerId: string): void {
    this.activeCodeBlocks.delete(containerId);
  }

  /**
   * Handle file modification event
   * @param filePath Path of the modified file
   */
  private handleFileModified(filePath: string): void {
    // Debounce rapid file changes
    this.debounceRefresh(filePath);
  }

  /**
   * Handle file creation event
   * @param filePath Path of the created file
   */
  private handleFileCreated(filePath: string): void {
    // New file might contain tasks, refresh all code blocks
    this.refreshAllCodeBlocks();
  }

  /**
   * Handle file deletion event
   * @param filePath Path of the deleted file
   */
  private handleFileDeleted(filePath: string): void {
    // Remove code blocks from deleted files
    this.activeCodeBlocks.forEach((codeBlock, containerId) => {
      if (codeBlock.filePath === filePath) {
        this.untrackCodeBlock(containerId);
      }
    });

    // Refresh remaining code blocks
    this.refreshAllCodeBlocks();
  }

  /**
   * Handle file rename event
   * @param oldPath Old file path
   * @param newPath New file path
   */
  private handleFileRenamed(oldPath: string, newPath: string): void {
    // Update tracked code blocks with new path
    this.activeCodeBlocks.forEach((codeBlock, containerId) => {
      if (codeBlock.filePath === oldPath) {
        codeBlock.filePath = newPath;
      }
    });

    // Refresh code blocks that might reference the renamed file
    this.refreshAllCodeBlocks();
  }

  /**
   * Handle metadata cache change event
   * @param filePath Path of the file with changed metadata
   */
  private handleMetadataChanged(filePath: string): void {
    // Metadata changes often indicate task state changes
    this.debounceRefresh(filePath);
  }

  /**
   * Handle file opened event
   * @param filePath Path of the opened file
   */
  private handleFileOpened(filePath: string): void {
    // Refresh code blocks in the newly opened file
    this.refreshCodeBlocksInFile(filePath);
  }

  /**
   * Debounce refresh for a specific file
   * @param filePath Path of the file that changed
   */
  private debounceRefresh(filePath: string): void {
    // Clear existing timeout for this file
    if (this.refreshTimeouts.has(filePath)) {
      clearTimeout(this.refreshTimeouts.get(filePath));
    }

    // Set new timeout
    this.refreshTimeouts.set(
      filePath,
      setTimeout(() => {
        this.refreshAffectedCodeBlocks(filePath);
        this.refreshTimeouts.delete(filePath);
      }, this.DEBOUNCE_MS),
    );
  }

  /**
   * Refresh code blocks that might be affected by changes to a specific file
   * @param changedFilePath Path of the file that changed
   */
  private refreshAffectedCodeBlocks(changedFilePath: string): void {
    this.activeCodeBlocks.forEach((codeBlock, containerId) => {
      // Check if this code block's query might include tasks from the changed file
      if (
        TodoseqCodeBlockParser.mightAffectCodeBlock(
          codeBlock.source,
          changedFilePath,
        )
      ) {
        this.refreshCodeBlock(containerId);
      }
    });
  }

  /**
   * Refresh all code blocks
   */
  public refreshAllCodeBlocks(): void {
    this.activeCodeBlocks.forEach((_, containerId) => {
      this.refreshCodeBlock(containerId);
    });
  }

  /**
   * Refresh code blocks in a specific file
   * @param filePath Path of the file
   */
  private refreshCodeBlocksInFile(filePath: string): void {
    this.activeCodeBlocks.forEach((codeBlock, containerId) => {
      if (codeBlock.filePath === filePath) {
        this.refreshCodeBlock(containerId);
      }
    });
  }

  /**
   * Refresh a specific code block
   * @param containerId ID of the code block to refresh
   */
  private async refreshCodeBlock(containerId: string): Promise<void> {
    const codeBlock = this.activeCodeBlocks.get(containerId);
    if (!codeBlock) return;

    try {
      // Parse parameters
      const params = TodoseqCodeBlockParser.parse(codeBlock.source);

      if (params.error) {
        this.renderer.renderError(codeBlock.element, params.error);
        return;
      }

      // Get all tasks
      const allTasks = this.plugin.getTasks();

      // Filter and sort tasks
      const filteredTasks = await this.manager.filterAndSortTasks(
        allTasks,
        params,
      );

      // Get total number of tasks (before applying limit)
      const totalTasksCount = await this.manager.getTotalTasksCount(
        allTasks,
        params,
      );

      // Re-render the task list with collapse state and toggle callback
      this.renderer.renderTaskList(
        codeBlock.element,
        filteredTasks,
        params,
        totalTasksCount,
        codeBlock.isCollapsed,
        (id: string) => this.toggleCollapse(id),
        containerId,
      );
    } catch (error) {
      console.error('Error refreshing code block:', error);
      this.renderer.renderError(
        codeBlock.element,
        `Refresh error: ${error.message}`,
      );
    }
  }

  /**
   * Clear all tracked code blocks
   */
  clearAllCodeBlocks(): void {
    this.activeCodeBlocks.clear();
    this.refreshTimeouts.forEach((timeout) => clearTimeout(timeout));
    this.refreshTimeouts.clear();
  }

  /**
   * Update the task list manager with new settings
   * @param settings New settings
   */
  updateSettings(settings: TodoTrackerSettings): void {
    this.manager.updateSettings(settings);
  }
}
