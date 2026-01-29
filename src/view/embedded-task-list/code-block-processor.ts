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

  constructor(plugin: TodoTracker) {
    this.plugin = plugin;
    this.renderer = new EmbeddedTaskListRenderer(plugin);
    this.manager = new EmbeddedTaskListManager(plugin.settings);
    this.eventHandler = new EmbeddedTaskListEventHandler(
      plugin,
      this.renderer,
      this.manager,
    );
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

      // Filter and sort tasks based on parameters
      const filteredTasks = this.manager.filterAndSortTasks(allTasks, params);

      // Render the task list
      this.renderer.renderTaskList(el, filteredTasks, params);

      // Track this code block for real-time updates
      const containerId = `todoseq-${Math.random().toString(36).slice(2, 8)}`;
      el.id = containerId;
      this.eventHandler.trackCodeBlock(containerId, el, source, ctx.sourcePath);
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
  }

  /**
   * Clean up resources when plugin unloads
   */
  cleanup(): void {
    this.eventHandler.clearAllCodeBlocks();
  }
}
