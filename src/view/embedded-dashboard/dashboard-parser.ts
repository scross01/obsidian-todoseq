import { Search } from '../../search/search';
import {
  DashboardGroupBy,
  DashboardDisplay,
  DashboardSort,
} from './aggregation';

/**
 * Parsed parameters from a todoseq-dashboard code block.
 *
 * Defaults are emitted (not undefined) so consumers can rely on them;
 * `sort` is the one exception — when unset it stays undefined and the
 * aggregation engine resolves the attribute default (fixed order for
 * priority/state/date buckets, count-desc for keyword/tag).
 */
export interface DashboardParameters {
  searchQuery: string;
  groupBy: DashboardGroupBy;
  /** Visual form, including the headerless `strip` (the former layout). */
  display: DashboardDisplay;
  title?: string;
  showQuery: boolean;
  sort?: DashboardSort;
  showEmpty: boolean;
  maxGroups: number;
  color: 'semantic' | 'mono';
  /**
   * Start the card collapsed behind its header. Named after the embedded
   * task list's `collapse:` option (same true/false convention).
   */
  collapse: boolean;
  /** Weeks of future window for the heatmap (4-52). */
  heatmapWindow: number;
  error?: string;
}

const GROUP_BY_VALUES: DashboardGroupBy[] = [
  'priority',
  'state',
  'keyword',
  'tag',
  'scheduled',
  'deadline',
];

const DISPLAY_VALUES: DashboardDisplay[] = [
  'bar',
  'column',
  'donut',
  'tiles',
  'heatmap',
  'strip',
];

const SORT_VALUES: DashboardSort[] = [
  'fixed',
  'count-desc',
  'count-asc',
  'label',
];

const COLOR_VALUES = ['semantic', 'mono'] as const;

const DEFAULT_HEATMAP_WINDOW = 26;
const MIN_HEATMAP_WINDOW = 4;
const MAX_HEATMAP_WINDOW = 52;

/**
 * Parses the content of a todoseq-dashboard code block.
 *
 * Mirrors TodoseqCodeBlockParser: static parse with try/catch returning an
 * `error` field, `#` comment lines skipped, semantic values lowercased.
 * Boolean options follow the embedded list convention — true/show for on,
 * false/hide for off — except `collapse`, which accepts only true/false
 * (like the embedded `collapse:` option; `collapsed:` is a deprecated alias).
 *
 * Example code block:
 * ```
 * todoseq-dashboard
 * search: tag:project scheduled:due OR scheduled:overdue
 * group-by: priority
 * display: bar
 * title: Due & overdue
 * ```
 */
export class TodoseqDashboardParser {
  /**
   * Parse parameters from code block source content
   * @param source The content of the code block
   * @returns Parsed parameters with validation
   */
  static parse(source: string): DashboardParameters {
    try {
      const lines = source.split('\n');
      let searchQuery = '';
      let groupBy: DashboardGroupBy = 'state';
      let display: DashboardDisplay = 'bar';
      let title: string | undefined;
      let showQuery = true;
      let sort: DashboardSort | undefined;
      let showEmpty = false;
      let maxGroups = 8;
      let color: 'semantic' | 'mono' = 'semantic';
      let collapse = false;
      let heatmapWindow = DEFAULT_HEATMAP_WINDOW;

      for (const line of lines) {
        const trimmed = line.trim();

        // Skip comment lines
        if (trimmed.startsWith('#')) {
          continue;
        }

        if (trimmed.startsWith('search:')) {
          searchQuery = trimmed.substring('search:'.length).trim();
        } else if (trimmed.startsWith('group-by:')) {
          groupBy = this.parseGroupBy(
            trimmed.substring('group-by:'.length).trim().toLowerCase(),
          );
        } else if (trimmed.startsWith('group:')) {
          groupBy = this.parseGroupBy(
            trimmed.substring('group:'.length).trim().toLowerCase(),
          );
        } else if (trimmed.startsWith('display:')) {
          const value = trimmed
            .substring('display:'.length)
            .trim()
            .toLowerCase();
          if (!DISPLAY_VALUES.includes(value as DashboardDisplay)) {
            throw new Error(
              `Unknown display: ${value}. Valid options: ${DISPLAY_VALUES.join(', ')}`,
            );
          }
          display = value as DashboardDisplay;
        } else if (trimmed.startsWith('layout:')) {
          // Deprecated 020 spelling: `layout: strip` == `display: strip` and
          // `layout: card` is a no-op. `display:` is the documented form.
          const value = trimmed
            .substring('layout:'.length)
            .trim()
            .toLowerCase();
          if (value === 'strip') {
            display = 'strip';
          } else if (value !== 'card') {
            throw new Error(
              `Invalid layout option: ${value}. Valid options: card, strip (prefer display: bar | column | donut | tiles | heatmap | strip)`,
            );
          }
        } else if (trimmed.startsWith('title:')) {
          title = trimmed.substring('title:'.length).trim();
        } else if (trimmed.startsWith('show-query:')) {
          showQuery = this.parseBooleanOption(
            'show-query',
            trimmed.substring('show-query:'.length).trim().toLowerCase(),
          );
        } else if (trimmed.startsWith('sort:')) {
          const value = trimmed.substring('sort:'.length).trim().toLowerCase();
          if (!SORT_VALUES.includes(value as DashboardSort)) {
            throw new Error(
              `Invalid sort option: ${value}. Valid options: ${SORT_VALUES.join(', ')}`,
            );
          }
          sort = value as DashboardSort;
        } else if (trimmed.startsWith('show-empty:')) {
          showEmpty = this.parseBooleanOption(
            'show-empty',
            trimmed.substring('show-empty:'.length).trim().toLowerCase(),
          );
        } else if (trimmed.startsWith('max-groups:')) {
          const value = trimmed.substring('max-groups:'.length).trim();
          const parsed = parseInt(value, 10);
          if (isNaN(parsed) || parsed < 1) {
            throw new Error(
              `Invalid max-groups value: ${value}. Must be a positive integer.`,
            );
          }
          maxGroups = parsed;
        } else if (trimmed.startsWith('color:')) {
          const value = trimmed.substring('color:'.length).trim().toLowerCase();
          if (!COLOR_VALUES.includes(value as 'semantic' | 'mono')) {
            throw new Error(
              `Invalid color option: ${value}. Valid options: ${COLOR_VALUES.join(', ')}`,
            );
          }
          color = value as 'semantic' | 'mono';
        } else if (trimmed.startsWith('collapse:')) {
          // Same option name as the embedded task list's collapse control.
          const value = trimmed
            .substring('collapse:'.length)
            .trim()
            .toLowerCase();
          if (value === 'true') {
            collapse = true;
          } else if (value === 'false') {
            collapse = false;
          } else {
            throw new Error(
              `Invalid collapse option: ${value}. Valid options: true, false`,
            );
          }
        } else if (trimmed.startsWith('collapsed:')) {
          // Deprecated 020 spelling, kept as an alias so existing notes keep
          // rendering; `collapse:` is the documented form.
          const value = trimmed
            .substring('collapsed:'.length)
            .trim()
            .toLowerCase();
          if (value === 'true') {
            collapse = true;
          } else if (value === 'false') {
            collapse = false;
          } else {
            throw new Error(
              `Invalid collapsed option: ${value}. Valid options: true, false (prefer collapse:)`,
            );
          }
        } else if (trimmed.startsWith('heatmap-window:')) {
          const value = trimmed.substring('heatmap-window:'.length).trim();
          const parsed = parseInt(value, 10);
          if (
            isNaN(parsed) ||
            parsed < MIN_HEATMAP_WINDOW ||
            parsed > MAX_HEATMAP_WINDOW
          ) {
            throw new Error(
              `Invalid heatmap-window value: ${value}. Must be between ${MIN_HEATMAP_WINDOW} and ${MAX_HEATMAP_WINDOW} weeks.`,
            );
          }
          heatmapWindow = parsed;
        }
      }

      // Validate search query syntax
      if (searchQuery) {
        if (!Search.validate(searchQuery)) {
          const message = Search.getError(searchQuery);
          throw new Error(
            message
              ? `Invalid search query: ${message}`
              : 'Invalid search query',
          );
        }
      }

      // heatmap display requires a date field to bucket by
      if (
        display === 'heatmap' &&
        groupBy !== 'scheduled' &&
        groupBy !== 'deadline'
      ) {
        throw new Error('heatmap requires group-by: scheduled or deadline');
      }

      // The strip is a headerless inline row of pills: neither the title nor
      // the collapse machinery (which is built on the header) applies.
      if (display === 'strip') {
        if (title) {
          throw new Error(
            'strip display renders no header, so it cannot be combined with a title',
          );
        }
        if (heatmapWindow !== DEFAULT_HEATMAP_WINDOW) {
          throw new Error(
            'strip display renders no heatmap, so heatmap-window does not apply',
          );
        }
        if (collapse) {
          throw new Error(
            'strip display renders no header, so it cannot be collapsed',
          );
        }
      }

      // collapse needs a clickable header: either a title or the query chip
      if (collapse === true && !title && showQuery === false) {
        throw new Error(
          'collapse option requires either title to be set or show-query to be enabled',
        );
      }

      return {
        searchQuery,
        groupBy,
        display,
        title,
        showQuery,
        sort,
        showEmpty,
        maxGroups,
        color,
        collapse,
        heatmapWindow,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return {
        searchQuery: '',
        groupBy: 'state',
        display: 'bar',
        title: undefined,
        showQuery: true,
        sort: undefined,
        showEmpty: false,
        maxGroups: 8,
        color: 'semantic',
        collapse: false,
        heatmapWindow: DEFAULT_HEATMAP_WINDOW,
        error: errorMessage,
      };
    }
  }

  private static parseGroupBy(value: string): DashboardGroupBy {
    if (!GROUP_BY_VALUES.includes(value as DashboardGroupBy)) {
      throw new Error(`Unknown group-by: ${value}`);
    }
    return value as DashboardGroupBy;
  }

  /**
   * Boolean option convention shared with the embedded task list:
   * true/show for on, false/hide for off.
   */
  private static parseBooleanOption(
    optionName: string,
    value: string,
  ): boolean {
    if (value === 'false' || value === 'hide') {
      return false;
    }
    if (value === 'true' || value === 'show') {
      return true;
    }
    throw new Error(
      `Invalid ${optionName} option: ${value}. Valid options: true, false, show, hide`,
    );
  }
}
