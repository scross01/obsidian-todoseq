import { MarkdownPostProcessorContext, Notice } from 'obsidian';
import TodoTracker from '../../main';
import { VaultScanner } from '../../services/vault-scanner';
import { DashboardAggregator } from './aggregation';
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
}

const DASHBOARD_REFRESH_DEBOUNCE_MS = 150;

export class DashboardCodeBlockProcessor {
  private plugin: TodoTracker;
  private renderer: DashboardRenderer;
  private aggregator: DashboardAggregator;
  private unsubscribeFromStateManager: (() => void) | null = null;
  private activeDashboards: Map<string, TrackedDashboard> = new Map();

  constructor(plugin: TodoTracker) {
    this.plugin = plugin;
    this.renderer = new DashboardRenderer(plugin.settings);
    this.aggregator = this.createAggregator();

    // Subscribe to task state changes (single source of truth). Debounced to
    // prevent excessive re-aggregation during rapid changes.
    let refreshTimeout: number | null = null;
    this.unsubscribeFromStateManager = plugin.taskStateManager.subscribe(() => {
      if (refreshTimeout !== null) {
        window.clearTimeout(refreshTimeout);
      }
      refreshTimeout = window.setTimeout(() => {
        refreshTimeout = null;
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
  private async processCodeBlock(
    source: string,
    el: HTMLElement,
    ctx: MarkdownPostProcessorContext,
  ): Promise<void> {
    let params: DashboardParameters | null = null;
    try {
      params = TodoseqDashboardParser.parse(source);

      if (params.error) {
        this.renderer.renderError(el, params, params.error);
        return;
      }

      const allTasks = this.plugin.getTasks();
      const result = await this.aggregator.aggregate(allTasks, params);

      const containerId = `todoseq-dashboard-${Math.random()
        .toString(36)
        .slice(2, 8)}`;
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
      });
    } catch (error: unknown) {
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
    this.activeDashboards.forEach((dashboard) => {
      void this.refreshDashboard(dashboard);
    });
  }

  private async refreshDashboard(dashboard: TrackedDashboard): Promise<void> {
    try {
      const params = TodoseqDashboardParser.parse(dashboard.source);
      if (params.error) {
        this.renderer.renderError(dashboard.el, params, params.error);
        return;
      }
      dashboard.params = params;

      const result = await this.aggregator.aggregate(
        this.plugin.getTasks(),
        params,
      );

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
      console.error('Error refreshing TODOseq dashboard block:', error);
      const message = error instanceof Error ? error.message : String(error);
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
    if (this.unsubscribeFromStateManager) {
      this.unsubscribeFromStateManager();
      this.unsubscribeFromStateManager = null;
    }
    this.activeDashboards.clear();
  }
}
