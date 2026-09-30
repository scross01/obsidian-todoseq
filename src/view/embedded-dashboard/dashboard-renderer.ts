import { setIcon, setTooltip } from 'obsidian';
import {
  DashboardGroup,
  DashboardResult,
  composeFilterQuery,
} from './aggregation';
import { DashboardParameters } from './dashboard-parser';
import { TodoTrackerSettings } from '../../settings/settings-types';

/**
 * Renderer for todoseq-dashboard cards (plan 020).
 *
 * Builds the card shell (header, chips) once and renders per-display content
 * into a content root the processor can patch in place on task changes —
 * only counts/shares/shapes are rewritten when the group keys are unchanged,
 * so cards on background pages never flicker on unrelated edits.
 *
 * Every color comes from an Obsidian theme variable (no literal hexes); the
 * group color is exposed to CSS as the --todoseq-bar-color /
 * --todoseq-tile-color custom property on the row/tile root.
 */

/** Callbacks the host (processor) provides. */
export interface DashboardCallbacks {
  /**
   * Called with the composed drill-through query and the triggering event so
   * the host can route plain clicks to the existing Task List leaf and
   * Cmd/Ctrl-clicks to a new tab.
   */
  onOpenQuery: (query: string, event: MouseEvent | KeyboardEvent) => void;
}

/** Semantic color per group attribute (theme variables only). */
const PRIORITY_COLORS: Record<string, string> = {
  'priority:high': 'var(--color-red)',
  'priority:medium': 'var(--interactive-accent)',
  'priority:low': 'var(--text-faint)',
  'priority:none': 'var(--text-faint)',
};

const DATE_BUCKET_COLORS: Record<string, string> = {
  'scheduled:overdue': 'var(--color-red)',
  'scheduled:today': 'var(--color-orange)',
  'scheduled:next-7-days': 'var(--color-green)',
  'scheduled:later': 'var(--color-blue)',
  'scheduled:none': 'var(--text-faint)',
  'deadline:overdue': 'var(--color-red)',
  'deadline:today': 'var(--color-orange)',
  'deadline:next-7-days': 'var(--color-green)',
  'deadline:later': 'var(--color-blue)',
  'deadline:none': 'var(--text-faint)',
};

const STATE_COLORS: Record<string, string> = {
  'state:active': 'var(--interactive-accent)',
  'state:inactive': 'var(--color-blue)',
  'state:waiting': 'var(--color-orange)',
  'state:completed': 'var(--color-green)',
  'state:archived': 'var(--text-faint)',
};

/** Neutral ladder for attributes without a semantic mapping. */
const NEUTRAL_LADDER = [
  'var(--interactive-accent)',
  'var(--color-blue)',
  'var(--color-green)',
  'var(--color-orange)',
  'var(--color-purple)',
  'var(--color-cyan)',
  'var(--color-pink)',
  'var(--color-yellow)',
];

/** Accent steps for color: mono (N% accent over the well background). */
const MONO_STEPS = [100, 82, 64, 46, 30];

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
/** Gutter label rows for a Monday-start week (rows Mon..Sun). */
const GUTTER_LABELS_MONDAY = ['Mon', '', 'Wed', '', 'Fri', '', ''];
/** Gutter label rows for a Sunday-start week (rows Sun..Sat). */
const GUTTER_LABELS_SUNDAY = ['Sun', '', 'Tue', '', 'Thu', '', 'Sat'];
const MONTH_LABELS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/** Donut geometry (viewBox units; CSS scales the ring to ~136px). */
const DONUT_SIZE = 136;
const DONUT_RADIUS = 58;
const DONUT_STROKE = 20;
const DONUT_CIRCUMFERENCE = 2 * Math.PI * DONUT_RADIUS;
/** 1%-turn transparent seam between slices. */
const DONUT_GAP = 0.01 * DONUT_CIRCUMFERENCE;

/** Keys of the groups currently rendered into a content root. */
const renderedKeys = new WeakMap<HTMLElement, string>();

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

/** Per-render options the host derives from plugin settings. */
export interface DashboardRenderOptions {
  /** First day of the week for the heatmap gutter (plugin setting). */
  weekStartsOn?: 'Monday' | 'Sunday';
}

export class DashboardRenderer {
  /**
   * Settings are accepted for parity with the embedded list renderer; colors
   * come from theme variables, so nothing is read from them here. Per-render
   * behavior (heatmap week start) arrives via DashboardRenderOptions.
   */
  constructor(_settings: TodoTrackerSettings) {}

  /**
   * Build the card shell and initial content. Returns the content root so
   * the processor can call updateContent on it later.
   */
  renderCard(
    el: HTMLElement,
    result: DashboardResult,
    params: DashboardParameters,
    callbacks: DashboardCallbacks,
    options: DashboardRenderOptions = {},
  ): HTMLElement {
    el.empty();
    const container = el.createDiv({ cls: 'todoseq-dashboard-container' });

    if (params.display === 'strip') {
      return this.renderStripContent(container, result, params, callbacks);
    }

    this.renderHeader(container, result, params);
    this.renderChips(container, params);

    const content = container.createDiv({ cls: 'todoseq-dashboard-content' });
    if (params.collapse) {
      container.addClass('todoseq-dashboard-collapsed');
      this.makeHeaderCollapsible(container, params);
    }
    this.renderContent(content, result, params, callbacks, options);
    return content;
  }

  /**
   * Update an existing card's content. Patches counts/shares/shapes in place
   * when the group key sequence is unchanged (the common case), rebuilds
   * otherwise. The heatmap always takes the rebuild path (window slides at
   * midnight; rebuild is debounced and small).
   */
  updateContent(
    contentRoot: HTMLElement,
    nextResult: DashboardResult,
    params: DashboardParameters,
    callbacks: DashboardCallbacks,
    options: DashboardRenderOptions = {},
  ): void {
    const nextKeys = nextResult.groups.map((g) => g.key).join('|');
    const current = renderedKeys.get(contentRoot) ?? '';
    const canPatch =
      nextResult.total > 0 &&
      nextKeys.length > 0 &&
      current === nextKeys &&
      params.display !== 'heatmap';

    if (canPatch) {
      this.patchGroups(contentRoot, nextResult);
      renderedKeys.set(contentRoot, nextKeys);
      return;
    }

    contentRoot.empty();
    if (params.display === 'strip') {
      // The strip renders directly into the container; its host passes the
      // container as contentRoot here. Rebuild the strip content in place.
      this.renderStripContentInto(contentRoot, nextResult, params, callbacks);
      return;
    }
    this.renderContent(contentRoot, nextResult, params, callbacks, options);
  }

  /** One-line error message; header (title/chips) stays. */
  renderError(
    el: HTMLElement,
    params: DashboardParameters,
    message: string,
  ): void {
    el.empty();
    const container = el.createDiv({ cls: 'todoseq-dashboard-container' });
    if (params.display !== 'strip') {
      if (params.title) {
        const header = container.createDiv({
          cls: 'todoseq-dashboard-header',
        });
        header.createDiv({
          cls: 'todoseq-dashboard-title',
          text: params.title,
        });
      }
      this.renderChips(container, params);
    }
    container.createDiv({ cls: 'todoseq-dashboard-error', text: message });
  }

  // ------------------------------------------------------------------
  // Shell pieces
  // ------------------------------------------------------------------

  private renderHeader(
    container: HTMLElement,
    result: DashboardResult,
    params: DashboardParameters,
  ): void {
    const header = container.createDiv({ cls: 'todoseq-dashboard-header' });
    if (params.title) {
      header.createDiv({ cls: 'todoseq-dashboard-title', text: params.title });
    }
    const total = header.createDiv({
      cls: 'todoseq-dashboard-total',
      text: `${result.total} task${result.total === 1 ? '' : 's'}`,
    });
    if (result.overlapsTotal) {
      setTooltip(
        total,
        `Tags can overlap — a task with several tags counts once per tag. ${result.total} is the number of matching tasks.`,
      );
    }
  }

  /**
   * True when the header has no title — the count total is then the line's
   * leading element and carries the collapse chevron before it.
   */
  private hasTitlelessHeader(params: DashboardParameters): boolean {
    return !params.title;
  }

  /**
   * Make the card collapsible and place the expand/collapse indicator on the
   * header line — the one row that stays visible when collapsed.
   *
   * With a title the chevron sits directly after it. Without a title the
   * chevron leads the line, before the task count. DOM adjacency alone is
   * not enough: the header is `justify-content: space-between`, so the
   * total's `margin-left: auto` does the pushing and the middle item would
   * otherwise center — the chevron's margin rules in styles.css account for
   * that (title case) or remove it entirely (count-leading case).
   */
  private makeHeaderCollapsible(
    container: HTMLElement,
    params: DashboardParameters,
  ): void {
    const header = container.querySelector<HTMLElement>(
      '.todoseq-dashboard-header',
    );
    if (!header) return;

    const chevron = header.createSpan({
      cls: 'todoseq-collapse-toggle-icon',
    });
    setIcon(chevron, 'chevron-right');

    if (this.hasTitlelessHeader(params)) {
      // No title: chevron leads the line, before the task count.
      const total = header.querySelector<HTMLElement>(
        '.todoseq-dashboard-total',
      );
      if (total) {
        header.insertBefore(chevron, total);
      }
    } else {
      // Title case: directly after the title, before the total.
      const title = header.querySelector<HTMLElement>(
        '.todoseq-dashboard-title',
      );
      if (title) {
        title.insertAdjacentElement('afterend', chevron);
      }
    }

    header.addClass('todoseq-dashboard-header-toggle');
    header.setAttribute('role', 'button');
    header.setAttribute('tabindex', '0');
    header.setAttribute('aria-expanded', 'false');

    const toggle = (): void => {
      const collapsed = container.hasClass('todoseq-dashboard-collapsed');
      container.toggleClass('todoseq-dashboard-collapsed', !collapsed);
      header.setAttribute('aria-expanded', String(collapsed));
      // Same add/removeClass dance as the embedded task lists' chevron.
      if (collapsed) {
        chevron.addClass('is-expanded');
      } else {
        chevron.removeClass('is-expanded');
      }
    };
    header.addEventListener('click', toggle);
    header.addEventListener('keydown', (event: KeyboardEvent) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        toggle();
      }
    });
  }

  private renderChips(
    container: HTMLElement,
    params: DashboardParameters,
  ): void {
    const chips = container.createDiv({ cls: 'todoseq-dashboard-chips' });
    if (params.showQuery && params.searchQuery) {
      chips.createDiv({
        cls: 'todoseq-dashboard-chip-query',
        text: params.searchQuery,
      });
    }
    chips.createDiv({
      cls: 'todoseq-dashboard-chip-meta',
      text: `group-by: ${params.groupBy}`,
    });
  }

  // ------------------------------------------------------------------
  // Strip layout (no header; chips + pills inline)
  // ------------------------------------------------------------------

  private renderStripContent(
    container: HTMLElement,
    result: DashboardResult,
    params: DashboardParameters,
    callbacks: DashboardCallbacks,
  ): HTMLElement {
    const strip = container.createDiv({ cls: 'todoseq-dashboard-strip' });
    this.renderStripContentInto(strip, result, params, callbacks);
    return strip;
  }

  private renderStripContentInto(
    strip: HTMLElement,
    result: DashboardResult,
    params: DashboardParameters,
    callbacks: DashboardCallbacks,
  ): void {
    if (params.showQuery && params.searchQuery) {
      strip.createDiv({
        cls: 'todoseq-dashboard-chip-query',
        text: params.searchQuery,
      });
    }
    if (result.total === 0 || result.groups.length === 0) {
      this.renderEmptyState(strip);
      renderedKeys.set(strip, '');
      return;
    }
    result.groups.forEach((group, index) => {
      const pill = strip.createDiv({
        cls: 'todoseq-dashboard-pill todoseq-dashboard-clickable',
        attr: {
          role: 'button',
          tabindex: '0',
          'data-key': group.key,
          'aria-label': this.groupAriaLabel(group, result),
        },
      });
      pill.style.setProperty(
        '--todoseq-bar-color',
        this.colorForGroup(params, group, index),
      );
      pill.createSpan({ cls: 'todoseq-dashboard-pill-dot' });
      pill.createSpan({
        cls: 'todoseq-dashboard-pill-label',
        text: group.label,
      });
      pill.createSpan({
        cls: 'todoseq-dashboard-pill-count',
        text: String(group.count),
      });
      setTooltip(pill, this.groupTooltip(group, result));
      this.bindOpen(pill, params, group.filter, callbacks);
    });
    renderedKeys.set(strip, result.groups.map((g) => g.key).join('|'));
  }

  // ------------------------------------------------------------------
  // Per-display content
  // ------------------------------------------------------------------

  renderContent(
    contentRoot: HTMLElement,
    result: DashboardResult,
    params: DashboardParameters,
    callbacks: DashboardCallbacks,
    options: DashboardRenderOptions = {},
  ): void {
    if (result.total === 0 || (result.groups.length === 0 && !result.days)) {
      this.renderEmptyState(contentRoot);
      renderedKeys.set(contentRoot, '');
      return;
    }

    if (params.display === 'heatmap' && result.days) {
      this.renderHeatmap(contentRoot, result, params, callbacks, options);
      renderedKeys.set(contentRoot, '');
      return;
    }

    switch (params.display) {
      case 'column':
        this.renderColumn(contentRoot, result, params, callbacks);
        break;
      case 'donut':
        this.renderDonut(contentRoot, result, params, callbacks);
        break;
      case 'tiles':
        this.renderTiles(contentRoot, result, params, callbacks);
        break;
      case 'bar':
      default:
        this.renderBar(contentRoot, result, params, callbacks);
        break;
    }
    renderedKeys.set(contentRoot, result.groups.map((g) => g.key).join('|'));
  }

  private renderBar(
    contentRoot: HTMLElement,
    result: DashboardResult,
    params: DashboardParameters,
    callbacks: DashboardCallbacks,
  ): void {
    const wrap = contentRoot.createDiv({ cls: 'todoseq-dashboard-bar' });
    const maxCount = this.maxCount(result.groups);
    result.groups.forEach((group, index) => {
      const row = wrap.createDiv({
        cls: 'todoseq-dashboard-bar-row todoseq-dashboard-clickable',
        attr: {
          role: 'button',
          tabindex: '0',
          'data-key': group.key,
          'aria-label': this.groupAriaLabel(group, result),
        },
      });
      row.style.setProperty(
        '--todoseq-bar-color',
        this.colorForGroup(params, group, index),
      );
      row.createDiv({ cls: 'todoseq-dashboard-bar-swatch' });
      row.createDiv({
        cls: 'todoseq-dashboard-bar-label',
        text: group.label,
      });
      const track = row.createDiv({ cls: 'todoseq-dashboard-bar-track' });
      const fill = track.createDiv({ cls: 'todoseq-dashboard-bar-fill' });
      // The mockup dims faint-bucket fills (Low/None) while the swatch dot
      // stays full strength.
      if (this.isFaintBucket(params, group)) {
        fill.addClass('is-muted');
      }
      row.createDiv({
        cls: 'todoseq-dashboard-bar-count',
        text: String(group.count),
      });
      this.applyBarFill(row, group, maxCount);
      setTooltip(row, this.groupTooltip(group, result));
      this.bindOpen(row, params, group.filter, callbacks);
    });
  }

  private renderColumn(
    contentRoot: HTMLElement,
    result: DashboardResult,
    params: DashboardParameters,
    callbacks: DashboardCallbacks,
  ): void {
    const wrap = contentRoot.createDiv({
      cls: 'todoseq-dashboard-column-wrap',
    });
    const columns = wrap.createDiv({ cls: 'todoseq-dashboard-column' });
    const labels = wrap.createDiv({ cls: 'todoseq-dashboard-column-labels' });
    wrap.createDiv({ cls: 'todoseq-dashboard-column-baseline' });
    wrap.insertBefore(
      columns,
      wrap.querySelector('.todoseq-dashboard-column-baseline'),
    );

    const maxCount = this.maxCount(result.groups);
    result.groups.forEach((group, index) => {
      const item = columns.createDiv({
        cls: 'todoseq-dashboard-column-item todoseq-dashboard-clickable',
        attr: {
          role: 'button',
          tabindex: '0',
          'data-key': group.key,
          'aria-label': this.groupAriaLabel(group, result),
        },
      });
      item.style.setProperty(
        '--todoseq-bar-color',
        this.colorForGroup(params, group, index),
      );
      item.createDiv({
        cls: 'todoseq-dashboard-column-count',
        text: String(group.count),
      });
      const bar = item.createDiv({ cls: 'todoseq-dashboard-column-bar' });
      bar.createDiv({ cls: 'todoseq-dashboard-column-bar-fill' });
      this.applyColumnFill(item, group, maxCount);
      setTooltip(item, this.groupTooltip(group, result));
      this.bindOpen(item, params, group.filter, callbacks);

      labels.createDiv({
        cls: 'todoseq-dashboard-column-label',
        text: group.label,
      });
    });
  }

  private renderDonut(
    contentRoot: HTMLElement,
    result: DashboardResult,
    params: DashboardParameters,
    callbacks: DashboardCallbacks,
  ): void {
    const wrap = contentRoot.createDiv({ cls: 'todoseq-dashboard-donut' });

    const ringWrap = wrap.createDiv({
      cls: 'todoseq-dashboard-donut-ring-wrap',
    });
    const svg = document.createElementNS(SVG_NAMESPACE, 'svg');
    svg.setAttribute('class', 'todoseq-dashboard-donut-ring');
    svg.setAttribute('viewBox', `0 0 ${DONUT_SIZE} ${DONUT_SIZE}`);
    svg.setAttribute('role', 'img');
    svg.setAttribute(
      'aria-label',
      `${result.total} tasks by ${params.groupBy}`,
    );
    ringWrap.appendChild(svg);

    const visible = result.groups.filter((g) => g.count > 0);
    // Slice geometry divides by the visible-count sum so the ring closes even
    // for overlapping tag counts. Displayed percentages (legend + tooltip)
    // both use result.total via sharePct — see the legend value below.
    const arcDenominator = visible.reduce((sum, g) => sum + g.count, 0) || 1;
    let accumulated = 0;
    visible.forEach((group, index) => {
      const share = group.count / arcDenominator;
      const arc = Math.max(0, share * DONUT_CIRCUMFERENCE - DONUT_GAP);
      const circle = document.createElementNS(SVG_NAMESPACE, 'circle');
      circle.setAttribute('cx', String(DONUT_SIZE / 2));
      circle.setAttribute('cy', String(DONUT_SIZE / 2));
      circle.setAttribute('r', String(DONUT_RADIUS));
      circle.setAttribute('fill', 'none');
      circle.setAttribute('stroke-width', String(DONUT_STROKE));
      circle.setAttribute('stroke', this.colorForGroup(params, group, index));
      circle.setAttribute(
        'stroke-dasharray',
        `${arc} ${DONUT_CIRCUMFERENCE - arc}`,
      );
      circle.setAttribute(
        'stroke-dashoffset',
        String(-(accumulated * DONUT_CIRCUMFERENCE + DONUT_GAP / 2)),
      );
      circle.setAttribute(
        'transform',
        `rotate(-90 ${DONUT_SIZE / 2} ${DONUT_SIZE / 2})`,
      );
      circle.setAttribute('data-key', group.key);
      svg.appendChild(circle);
      accumulated += share;
    });

    const center = ringWrap.createDiv({
      cls: 'todoseq-dashboard-donut-center',
    });
    center.createDiv({
      cls: 'todoseq-dashboard-donut-total',
      text: String(result.total),
    });
    center.createDiv({ cls: 'todoseq-dashboard-donut-unit', text: 'tasks' });

    const legend = wrap.createDiv({ cls: 'todoseq-dashboard-legend' });
    result.groups.forEach((group, index) => {
      const row = legend.createDiv({
        cls: 'todoseq-dashboard-legend-row todoseq-dashboard-clickable',
        attr: {
          role: 'button',
          tabindex: '0',
          'data-key': group.key,
          'aria-label': this.groupAriaLabel(group, result),
        },
      });
      row.style.setProperty(
        '--todoseq-bar-color',
        this.colorForGroup(params, group, index),
      );
      row.createSpan({ cls: 'todoseq-dashboard-legend-dot' });
      row.createSpan({
        cls: 'todoseq-dashboard-legend-label',
        text: group.label,
      });
      row.createSpan({
        cls: 'todoseq-dashboard-legend-value',
        // Same sharePct(count, result.total) call the tooltip uses, so the
        // legend % and the tooltip's "% of matched" are always one number —
        // even for group-by: tag where sum(counts) may exceed the total.
        text: `${group.count} · ${this.sharePct(group.count, result.total)}%`,
      });
      setTooltip(row, this.groupTooltip(group, result));
      this.bindOpen(row, params, group.filter, callbacks);
    });
  }

  private renderTiles(
    contentRoot: HTMLElement,
    result: DashboardResult,
    params: DashboardParameters,
    callbacks: DashboardCallbacks,
  ): void {
    const grid = contentRoot.createDiv({ cls: 'todoseq-dashboard-tiles' });
    result.groups.forEach((group, index) => {
      const tile = grid.createDiv({
        cls: 'todoseq-dashboard-tile todoseq-dashboard-clickable',
        attr: {
          role: 'button',
          tabindex: '0',
          'data-key': group.key,
          'aria-label': this.groupAriaLabel(group, result),
        },
      });
      tile.style.setProperty(
        '--todoseq-tile-color',
        this.colorForGroup(params, group, index),
      );
      tile.createDiv({
        cls: 'todoseq-dashboard-tile-number',
        text: String(group.count),
      });
      tile.createDiv({
        cls: 'todoseq-dashboard-tile-label',
        text: group.label,
      });
      setTooltip(tile, this.groupTooltip(group, result));
      this.bindOpen(tile, params, group.filter, callbacks);
    });
  }

  private renderHeatmap(
    contentRoot: HTMLElement,
    result: DashboardResult,
    params: DashboardParameters,
    callbacks: DashboardCallbacks,
    options: DashboardRenderOptions = {},
  ): void {
    const days = result.days ?? [];
    const weeks = days.length / 7;
    const today = result.today ?? '';
    const field = params.groupBy; // 'scheduled' | 'deadline'

    const root = contentRoot.createDiv({
      cls: 'todoseq-dashboard-heatmap',
    });
    root.style.setProperty('--todoseq-heatmap-weeks', String(weeks));

    const scroll = root.createDiv({ cls: 'todoseq-dashboard-heatmap-scroll' });
    const body = scroll.createDiv({ cls: 'todoseq-dashboard-heatmap-body' });

    // Weekday gutter (fixed outside the scroll area). Rows follow the
    // week-start setting: Mon..Sun or Sun..Sat; only every other row up to
    // the fifth carries a label.
    const gutter = body.createDiv({ cls: 'todoseq-dashboard-heatmap-gutter' });
    const gutterLabels =
      options.weekStartsOn === 'Sunday'
        ? GUTTER_LABELS_SUNDAY
        : GUTTER_LABELS_MONDAY;
    for (const label of gutterLabels) {
      gutter.createSpan({ text: label });
    }

    const gridArea = body.createDiv({ cls: 'todoseq-dashboard-heatmap-main' });

    // Month labels (weeks ≥ 3 columns apart)
    const months = gridArea.createDiv({
      cls: 'todoseq-dashboard-heatmap-months',
    });
    let lastMonth = -1;
    let lastLabelCol = -3;
    for (let col = 0; col < weeks; col++) {
      const monday = this.dayAt(days, col * 7);
      if (!monday) continue;
      const month = Number(monday.date.slice(5, 7)) - 1;
      if (month !== lastMonth && col - lastLabelCol >= 3) {
        const label = months.createSpan({
          cls: 'todoseq-dashboard-heatmap-month',
          text: MONTH_LABELS[month],
        });
        label.style.gridColumnStart = String(col + 1);
        lastMonth = month;
        lastLabelCol = col;
      } else if (month !== lastMonth) {
        lastMonth = month;
      }
    }

    // Cells: 7 rows, column flow; day 0 is Monday
    const grid = gridArea.createDiv({ cls: 'todoseq-dashboard-heatmap-grid' });
    days.forEach((day) => {
      const isToday = day.date === today;
      const isPast = day.date < today;
      const level = this.heatmapLevel(day.count);
      if (isPast) {
        grid.createDiv({
          cls: `todoseq-dashboard-heatmap-cell past${isToday ? ' today' : ''}`,
          attr: { 'data-date': day.date },
        });
        return;
      }
      if (day.count === 0 && !isToday) {
        grid.createDiv({
          cls: 'todoseq-dashboard-heatmap-cell',
          attr: { 'data-date': day.date },
        });
        return;
      }
      const cell = grid.createDiv({
        cls: `todoseq-dashboard-heatmap-cell todoseq-dashboard-clickable${level ? ` ${level}` : ''}${isToday ? ' today' : ''}`,
        attr: {
          role: 'button',
          tabindex: '0',
          'data-date': day.date,
          'aria-label': `${this.dayAriaLabel(day.date)}: ${day.count} task${day.count === 1 ? '' : 's'} due. Open in task list`,
        },
      });
      setTooltip(
        cell,
        `${this.dayTooltipLabel(day.date)} · ${day.count} task${day.count === 1 ? '' : 's'} due`,
      );
      this.bindOpen(cell, params, `${field}:${day.date}`, callbacks);
    });

    // Footer: hint left, LESS→MORE scale right
    const footer = root.createDiv({ cls: 'todoseq-dashboard-heatmap-footer' });
    const hint = footer.createDiv({ cls: 'todoseq-dashboard-heatmap-hint' });
    hint.createSpan({
      cls: 'todoseq-dashboard-hint-full',
      text: 'Click a day to open its tasks',
    });
    hint.createSpan({
      cls: 'todoseq-dashboard-hint-narrow',
      text: 'Scroll for later weeks',
    });
    const scale = footer.createDiv({ cls: 'todoseq-dashboard-heatmap-scale' });
    scale.createSpan({ text: 'LESS' });
    for (const level of ['', 'l1', 'l2', 'l3', 'l4']) {
      scale.createSpan({
        cls: `todoseq-dashboard-heatmap-swatch${level ? ` ${level}` : ''}`,
      });
    }
    scale.createSpan({ text: 'MORE' });
  }

  private renderEmptyState(contentRoot: HTMLElement): void {
    const empty = contentRoot.createDiv({ cls: 'todoseq-dashboard-empty' });
    const icon = empty.createDiv({ cls: 'todoseq-dashboard-empty-icon' });
    setIcon(icon, 'search');
    // Mockup layout: icon left, title + hint stacked to the right of it
    const text = empty.createDiv({ cls: 'todoseq-dashboard-empty-text' });
    text.createDiv({
      cls: 'todoseq-dashboard-empty-title',
      text: 'No tasks match',
    });
    text.createDiv({
      cls: 'todoseq-dashboard-empty-hint',
      text: "Nothing in the vault matches this dashboard's search. Adjust the query, or add matching tasks.",
    });
  }

  // ------------------------------------------------------------------
  // In-place patching (keys unchanged)
  // ------------------------------------------------------------------

  private patchGroups(
    contentRoot: HTMLElement,
    nextResult: DashboardResult,
  ): void {
    const total = nextResult.total;
    const maxCount = this.maxCount(nextResult.groups);
    // Slice geometry divides by the visible-count sum so the ring closes even
    // for overlapping tag counts. Displayed percentages use result.total.
    const arcDenominator =
      nextResult.groups.reduce((sum, g) => sum + g.count, 0) || 1;

    nextResult.groups.forEach((group) => {
      const node = contentRoot.querySelector(`[data-key="${group.key}"]`);
      if (!node) return;

      // Bar / strip pill count
      const countEl = node.querySelector(
        '.todoseq-dashboard-bar-count, .todoseq-dashboard-pill-count, .todoseq-dashboard-column-count',
      );
      if (countEl) countEl.textContent = String(group.count);

      // Bar fill width / column fill height
      const fill = node.querySelector<HTMLElement>(
        '.todoseq-dashboard-bar-fill',
      );
      if (fill) fill.style.width = this.fillPct(group.count, maxCount);
      const columnFill = node.querySelector<HTMLElement>(
        '.todoseq-dashboard-column-bar-fill',
      );
      if (columnFill) {
        columnFill.style.height = this.fillPct(group.count, maxCount);
      }

      // Donut slice geometry
      const slice = node.tagName.toLowerCase() === 'circle' ? node : null;
      if (slice) {
        const share = group.count / arcDenominator;
        const arc = Math.max(0, share * DONUT_CIRCUMFERENCE - DONUT_GAP);
        slice.setAttribute(
          'stroke-dasharray',
          `${arc} ${DONUT_CIRCUMFERENCE - arc}`,
        );
      }

      // Legend share text — same sharePct(count, result.total) the tooltip
      // uses, so legend % and tooltip "% of matched" stay one number. The
      // legend row is matched by class: the donut's SVG circle carries the
      // same data-key and precedes the row in document order, so a bare
      // [data-key] lookup would return the circle and miss the row entirely.
      const legendRow = contentRoot.querySelector<HTMLElement>(
        `.todoseq-dashboard-legend-row[data-key="${group.key}"]`,
      );
      const value = legendRow?.querySelector('.todoseq-dashboard-legend-value');
      if (value) {
        value.textContent = `${group.count} · ${this.sharePct(group.count, total)}%`;
      }

      // Tile number
      const tileNumber = node.querySelector('.todoseq-dashboard-tile-number');
      if (tileNumber) tileNumber.textContent = String(group.count);

      // Tooltips and aria-labels are stale after a patch — re-apply. The
      // donut's circle node carries no visible tooltip of its own; its
      // legend row is refreshed below.
      if (node.tagName.toLowerCase() !== 'circle') {
        node.setAttribute('aria-label', this.groupAriaLabel(group, nextResult));
        setTooltip(node as HTMLElement, this.groupTooltip(group, nextResult));
      }
      if (legendRow) {
        legendRow.setAttribute(
          'aria-label',
          this.groupAriaLabel(group, nextResult),
        );
        setTooltip(legendRow, this.groupTooltip(group, nextResult));
      }
    });

    // Donut center total
    const donutTotal = contentRoot.querySelector(
      '.todoseq-dashboard-donut-total',
    );
    if (donutTotal) donutTotal.textContent = String(total);

    // Header total
    const headerTotal = contentRoot.parentElement?.querySelector(
      ':scope > .todoseq-dashboard-header > .todoseq-dashboard-total',
    );
    if (headerTotal) {
      headerTotal.textContent = `${total} task${total === 1 ? '' : 's'}`;
    }
  }

  // ------------------------------------------------------------------
  // Shared helpers
  // ------------------------------------------------------------------

  private bindOpen(
    el: HTMLElement,
    params: DashboardParameters,
    filter: string,
    callbacks: DashboardCallbacks,
  ): void {
    const open = (event: MouseEvent | KeyboardEvent): void => {
      callbacks.onOpenQuery(
        composeFilterQuery(params.searchQuery, filter),
        event,
      );
    };
    el.addEventListener('click', (event) => open(event as MouseEvent));
    el.addEventListener('keydown', (event: KeyboardEvent) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        open(event);
      }
    });
  }

  private maxCount(groups: DashboardGroup[]): number {
    return Math.max(1, ...groups.map((g) => g.count));
  }

  private fillPct(count: number, maxCount: number): string {
    const pct = Math.round((count / maxCount) * 10000) / 100;
    return `${pct}%`;
  }

  private sharePct(count: number, denominator: number): number {
    return Math.round((count / denominator) * 100);
  }

  private applyBarFill(
    row: HTMLElement,
    group: DashboardGroup,
    maxCount: number,
  ): void {
    const fill = row.querySelector<HTMLElement>('.todoseq-dashboard-bar-fill');
    if (fill) fill.style.width = this.fillPct(group.count, maxCount);
  }

  private applyColumnFill(
    item: HTMLElement,
    group: DashboardGroup,
    maxCount: number,
  ): void {
    const fill = item.querySelector<HTMLElement>(
      '.todoseq-dashboard-column-bar-fill',
    );
    if (fill) fill.style.height = this.fillPct(group.count, maxCount);
  }

  private groupTooltip(group: DashboardGroup, result: DashboardResult): string {
    if (result.total <= 0) return group.label;
    return `${group.label}: ${group.count} tasks · ${this.sharePct(
      group.count,
      result.total,
    )}% of matched`;
  }

  private groupAriaLabel(
    group: DashboardGroup,
    result: DashboardResult,
  ): string {
    return `${group.label}: ${group.count} of ${result.total} tasks. Open in task list`;
  }

  private dayTooltipLabel(dateKey: string): string {
    const date = this.parseDayKey(dateKey);
    if (!date) return dateKey;
    return `${WEEKDAY_LABELS[date.getDay()]}, ${MONTH_LABELS[date.getMonth()]} ${date.getDate()}`;
  }

  private dayAriaLabel(dateKey: string): string {
    return this.dayTooltipLabel(dateKey);
  }

  private parseDayKey(dateKey: string): Date | null {
    const [year, month, day] = dateKey.split('-').map(Number);
    if (!year || !month || !day) return null;
    return new Date(year, month - 1, day);
  }

  private dayAt(
    days: { date: string }[],
    index: number,
  ): { date: string } | null {
    return days[index] ?? null;
  }

  private heatmapLevel(count: number): string {
    if (count <= 0) return '';
    if (count === 1) return 'l1';
    if (count === 2) return 'l2';
    if (count === 3) return 'l3';
    return 'l4';
  }

  /**
   * True when the group's semantic color is the faint bucket (Low / None /
   * Archived / the 'more' tail). The mockup dims such bar fills while the
   * swatch dot stays full strength.
   */
  private isFaintBucket(
    params: DashboardParameters,
    group: DashboardGroup,
  ): boolean {
    return this.colorForGroup(params, group, 0) === 'var(--text-faint)';
  }

  private colorForGroup(
    params: DashboardParameters,
    group: DashboardGroup,
    index: number,
  ): string {
    if (params.color === 'mono') {
      const step = MONO_STEPS[Math.min(index, MONO_STEPS.length - 1)];
      return `color-mix(in srgb, var(--interactive-accent) ${step}%, var(--background-secondary))`;
    }

    switch (params.groupBy) {
      case 'priority':
        return (
          PRIORITY_COLORS[group.key] ??
          NEUTRAL_LADDER[index % NEUTRAL_LADDER.length]
        );
      case 'state':
        return (
          STATE_COLORS[group.key] ??
          NEUTRAL_LADDER[index % NEUTRAL_LADDER.length]
        );
      case 'scheduled':
      case 'deadline':
        return (
          DATE_BUCKET_COLORS[group.key] ??
          NEUTRAL_LADDER[index % NEUTRAL_LADDER.length]
        );
      case 'tag':
      case 'keyword':
      default:
        if (group.key.endsWith(':none') || group.key === 'more') {
          return 'var(--text-faint)';
        }
        return NEUTRAL_LADDER[index % NEUTRAL_LADDER.length];
    }
  }
}
