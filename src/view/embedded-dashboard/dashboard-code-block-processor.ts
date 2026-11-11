import {
  MarkdownPostProcessorContext,
  MarkdownRenderChild,
  Notice,
} from 'obsidian';
import TodoTracker from '../../main';
import { VaultScanner } from '../../services/vault-scanner';
import { DashboardAggregator } from './aggregation';
import type { Task } from '../../types/task';
import {
  DashboardCallbacks,
  DashboardRenderOptions,
  DashboardRenderer,
} from './dashboard-renderer';
import {
  DashboardParameters,
  TodoseqDashboardParser,
} from './dashboard-parser';

/**
 * Processor for todoseq-dashboard code blocks.
 *
 * Modeled on the embedded task list processor: registers the markdown code
 * block processor, subscribes to TaskStateManager (150ms debounce) so cards
 * on any page reflect task changes — including writes from the editor, the
 * Task List, and auto-archive (archive mutations go through
 * TaskUpdateCoordinator → TaskStateManager → this subscription; no
 * archive-specific code needed).
 *
 * Unlike the embedded list, dashboards never write tasks, so there is no
 * skipNextRefresh echo flag. Refreshes patch the card content in place
 * (renderer.updateContent) instead of re-rendering the whole card so hover,
 * focus, and scroll survive unrelated task edits.
 */

interface TrackedDashboard {
  el: HTMLElement;
  source: string;
  sourcePath: string;
  params: DashboardParameters | null;
  contentRoot: HTMLElement | null;
  callbacks: DashboardCallbacks;
  refreshGeneration: number;
}

const DASHBOARD_REFRESH_DEBOUNCE_MS = 150;

export class DashboardCodeBlockProcessor {
  private plugin: TodoTracker;
  private renderer: DashboardRenderer;
  private aggregator: DashboardAggregator;
  private unsubscribeFromStateManager: (() => void) | null = null;
  private activeDashboards: Map<string, TrackedDashboard> = new Map();
  private refreshTimeout: number | null = null;

  constructor(plugin: TodoTracker) {
    this.plugin = plugin;
    this.renderer = new DashboardRenderer(plugin.settings);
    this.aggregator = this.createAggregator();

    // Subscribe to task state changes (single source of truth). Debounced to
    // prevent excessive re-aggregation during rapid changes.
    this.unsubscribeFromStateManager = plugin.taskStateManager.subscribe(() => {
      if (this.refreshTimeout !== null) {
        window.clearTimeout(this.refreshTimeout);
      }
      this.refreshTimeout = window.setTimeout(() => {
        this.refreshTimeout = null;
        this.refreshAllDashboards();
      }, DASHBOARD_REFRESH_DEBOUNCE_MS);
    });

    // Register with EventCoordinator for file-level notifications
    if (plugin.eventCoordinator) {
      plugin.eventCoordinator.onFileChange((event) => {
        if (event.type === 'delete') {
          this.handleFileDeleted(event.file.path);
        } else if (event.type === 'rename' && event.oldPath) {
          this.handleFileRenamed(event.oldPath, event.file.path);
        }
        // For modify/create, the TaskStateManager subscription handles refresh
      });
    }
  }

  /** Register the code block processor with Obsidian. */
  registerProcessor(): void {
    this.plugin.registerMarkdownCodeBlockProcessor(
      'todoseq-dashboard',
      async (source, el, ctx) => {
        await this.processCodeBlock(source, el, ctx);
      },
    );
  }

  private createAggregator(): DashboardAggregator {
    const keywordManager = (
      this.plugin as TodoTracker & { vaultScanner: VaultScanner }
    ).vaultScanner?.getKeywordManager();
    return new DashboardAggregator(
      this.plugin.settings,
      keywordManager ?? this.plugin.keywordManager,
      this.plugin.propertySearchEngine,
    );
  }

  /**
   * Process a todoseq-dashboard code block
   * @param source The code block source content
   * @param el The container element
   * @param ctx The markdown post processor context
   */
  /**
   * Filter out archived tasks from a task array.
   * Dashboards are a collection view and must respect the same archived-task
   * exclusion as the vault scanner and the Task List: archived tasks are
   * styled but NOT collected.
   */
  private filterArchivedTasks(tasks: Task[]): Task[] {
    return tasks.filter(
      (task) => !this.plugin.keywordManager.isArchived(task.state),
    );
  }

  /** Register this render with Obsidian's Markdown render lifetime. */
  private registerRenderChild(
    ctx: MarkdownPostProcessorContext,
    el: HTMLElement,
    onDispose: () => void,
  ): { disposed: boolean } {
    const lifetime = { disposed: false };
    const RenderChild = MarkdownRenderChild as unknown;
    if (
      typeof RenderChild !== 'function' ||
      typeof ctx.addChild !== 'function'
    ) {
      return lifetime;
    }
    const child = new (
      RenderChild as new (containerEl: HTMLElement) => MarkdownRenderChild
    )(el);
    child.onunload = () => {
      lifetime.disposed = true;
      onDispose();
    };
    ctx.addChild(child);
    return lifetime;
  }

  private async processCodeBlock(
    source: string,
    el: HTMLElement,
    ctx: MarkdownPostProcessorContext,
  ): Promise<void> {
    const containerId = `todoseq-dashboard-${Math.random()
      .toString(36)
      .slice(2, 8)}`;
    const lifetime = this.registerRenderChild(ctx, el, () => {
      this.activeDashboards.delete(containerId);
    });
    let params: DashboardParameters | null = null;
    try {
      params = TodoseqDashboardParser.parse(source);

      if (lifetime.disposed) return;
      if (params.error) {
        this.renderer.renderError(el, params, params.error);
        return;
      }

      const allTasks = this.filterArchivedTasks(this.plugin.getTasks());
      const result = await this.aggregator.aggregate(allTasks, params);

      if (lifetime.disposed) return;

      el.id = containerId;

      const callbacks: DashboardCallbacks = {
        onOpenQuery: (query, event) => this.openDrillThrough(query, event),
      };
      const contentRoot = this.renderer.renderCard(
        el,
        result,
        params,
        callbacks,
        this.renderOptions(),
      );

      this.activeDashboards.set(containerId, {
        el,
        source,
        sourcePath: ctx.sourcePath,
        params,
        contentRoot,
        callbacks,
        refreshGeneration: 0,
      });
    } catch (error: unknown) {
      if (lifetime.disposed) return;
      console.error('Error processing TODOseq dashboard block:', error);
      const message = error instanceof Error ? error.message : String(error);
      this.renderer.renderError(
        el,
        params ?? TodoseqDashboardParser.parse(''),
        `Processing error: ${message}`,
      );
    }
  }

  /**
   * Drill-through: plain clicks reuse the existing Task List leaf,
   * Cmd/Ctrl-clicks open a new tab.
   */
  private openDrillThrough(
    query: string,
    event: MouseEvent | KeyboardEvent,
  ): void {
    const newTab =
      event instanceof MouseEvent && (event.metaKey || event.ctrlKey);
    this.plugin.uiManager
      .showTasksWithQuery(query, newTab)
      .catch((error: unknown) => {
        console.error('Error opening task list with dashboard query:', error);
        new Notice('Failed to open task list');
      });
  }

  /**
   * Refresh all active dashboards: invalidate the aggregation cache, then
   * re-aggregate each tracked block and patch its content in place.
   */
  refreshAllDashboards(): void {
    this.aggregator.invalidateCache();
    this.activeDashboards.forEach((dashboard, containerId) => {
      void this.refreshDashboard(containerId, dashboard);
    });
  }

  /** Only the newest refresh of a still-tracked dashboard may render. */
  private isCurrent(
    containerId: string,
    dashboard: TrackedDashboard,
    generation: number,
  ): boolean {
    return (
      this.activeDashboards.get(containerId) === dashboard &&
      dashboard.refreshGeneration === generation
    );
  }

  private async refreshDashboard(
    containerId: string,
    dashboard: TrackedDashboard,
  ): Promise<void> {
    const generation = ++dashboard.refreshGeneration;
    try {
      const params = TodoseqDashboardParser.parse(dashboard.source);
      if (!this.isCurrent(containerId, dashboard, generation)) return;
      if (params.error) {
        // renderError empties the host, so the cached contentRoot is now
        // detached. Drop it, or the next refresh takes the "patch in place"
        // branch and updates a node that is no longer in the document —
        // leaving the card stuck on the error for the rest of the session.
        dashboard.contentRoot = null;
        this.renderer.renderError(dashboard.el, params, params.error);
        return;
      }
      dashboard.params = params;

      const result = await this.aggregator.aggregate(
        this.filterArchivedTasks(this.plugin.getTasks()),
        params,
      );

      if (!this.isCurrent(containerId, dashboard, generation)) return;

      if (dashboard.contentRoot) {
        this.renderer.updateContent(
          dashboard.contentRoot,
          result,
          params,
          dashboard.callbacks,
          this.renderOptions(),
        );
      } else {
        dashboard.contentRoot = this.renderer.renderCard(
          dashboard.el,
          result,
          params,
          dashboard.callbacks,
          this.renderOptions(),
        );
      }
    } catch (error: unknown) {
      if (!this.isCurrent(containerId, dashboard, generation)) return;
      console.error('Error refreshing TODOseq dashboard block:', error);
      const message = error instanceof Error ? error.message : String(error);
      // Same detachment as the parse-error path: the error UI replaced the
      // card, so the cached contentRoot must not be reused by a later
      // refresh. One transient aggregation failure was otherwise permanent.
      dashboard.contentRoot = null;
      this.renderer.renderError(
        dashboard.el,
        dashboard.params ?? TodoseqDashboardParser.parse(''),
        `Refresh error: ${message}`,
      );
    }
  }

  private handleFileDeleted(filePath: string): void {
    this.activeDashboards.forEach((dashboard, containerId) => {
      if (dashboard.sourcePath === filePath) {
        this.activeDashboards.delete(containerId);
      }
    });
  }

  private handleFileRenamed(oldPath: string, newPath: string): void {
    this.activeDashboards.forEach((dashboard) => {
      if (dashboard.sourcePath === oldPath) {
        dashboard.sourcePath = newPath;
      }
    });
  }

  /**
   * Update settings when plugin settings change: recreate the aggregator
   * with fresh settings/keywordManager, then refresh. Heatmaps always take
   * the rebuild path, so the new week start applies on the refresh.
   */
  updateSettings(): void {
    this.aggregator = this.createAggregator();
    this.refreshAllDashboards();
  }

  /** Per-render options derived from plugin settings. */
  private renderOptions(): DashboardRenderOptions {
    return { weekStartsOn: this.plugin.settings.weekStartsOn };
  }

  /** Clean up resources when plugin unloads. */
  cleanup(): void {
    if (this.refreshTimeout !== null) {
      window.clearTimeout(this.refreshTimeout);
      this.refreshTimeout = null;
    }
    if (this.unsubscribeFromStateManager) {
      this.unsubscribeFromStateManager();
      this.unsubscribeFromStateManager = null;
    }
    this.activeDashboards.clear();
  }
}
