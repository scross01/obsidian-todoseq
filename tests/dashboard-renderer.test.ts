/**
 * Unit tests for the dashboard renderer (plan 020 Step 3).
 * jsdom + Obsidian DOM mocks (createEl/createDiv/empty/instanceOf).
 * @jest-environment jsdom
 */
import {
  DashboardRenderer,
  DashboardCallbacks,
} from '../src/view/embedded-dashboard/dashboard-renderer';
import { DashboardCodeBlockProcessor } from '../src/view/embedded-dashboard/dashboard-code-block-processor';
import TodoTracker from '../src/main';
import {
  DashboardResult,
  DashboardGroup,
} from '../src/view/embedded-dashboard/aggregation';
import { DashboardParameters } from '../src/view/embedded-dashboard/dashboard-parser';
import { Task } from '../src/types/task';
import { installObsidianDomMocks } from './helpers/obsidian-dom-mock';
import {
  createBaseSettings,
  createBaseTask,
  createTestKeywordManager,
} from './helpers/test-helper';

installObsidianDomMocks();

function group(
  key: string,
  label: string,
  count: number,
  filter: string,
): DashboardGroup {
  return { key, label, count, filter };
}

function result(overrides: Partial<DashboardResult> = {}): DashboardResult {
  return {
    total: 12,
    groups: [
      group('priority:high', 'High', 4, 'priority:high'),
      group('priority:medium', 'Medium', 2, 'priority:medium'),
      group('priority:none', 'None', 6, 'priority:none'),
    ],
    overlapsTotal: false,
    ...overrides,
  };
}

function params(
  overrides: Partial<DashboardParameters> = {},
): DashboardParameters {
  return {
    searchQuery: 'tag:project',
    groupBy: 'priority',
    display: 'bar',
    title: 'Due & overdue',
    showQuery: true,
    sort: undefined,
    showEmpty: false,
    maxGroups: 8,
    color: 'semantic',
    collapse: false,
    heatmapWindow: 26,
    ...overrides,
  };
}

function noopCallbacks(): DashboardCallbacks {
  return { onOpenQuery: jest.fn() };
}

describe('DashboardRenderer', () => {
  let renderer: DashboardRenderer;
  let host: HTMLElement;

  beforeEach(() => {
    renderer = new DashboardRenderer(createBaseSettings());
    host = document.createElement('div');
    document.body.appendChild(host);
  });

  afterEach(() => {
    host.remove();
  });

  describe('renderCard structure', () => {
    it('builds container, header with title and total, chips, content root', () => {
      const content = renderer.renderCard(
        host,
        result(),
        params(),
        noopCallbacks(),
      );

      const container = host.querySelector('.todoseq-dashboard-container');
      expect(container).not.toBeNull();
      expect(
        container?.querySelector('.todoseq-dashboard-title')?.textContent,
      ).toBe('Due & overdue');
      expect(
        container?.querySelector('.todoseq-dashboard-total')?.textContent,
      ).toBe('12 tasks');
      // Query chip + group-by meta chip
      const chips = container?.querySelectorAll(
        '.todoseq-dashboard-chip-query',
      );
      expect(chips?.length).toBe(1);
      expect(chips?.[0].textContent).toBe('tag:project');
      expect(
        container?.querySelector('.todoseq-dashboard-chip-meta')?.textContent,
      ).toBe('group-by: priority');
      expect(content.classList.contains('todoseq-dashboard-content')).toBe(
        true,
      );
    });

    it('omits the title and query chip when not configured', () => {
      renderer.renderCard(
        host,
        result(),
        params({ title: undefined, searchQuery: '' }),
        noopCallbacks(),
      );
      expect(host.querySelector('.todoseq-dashboard-title')).toBeNull();
      expect(host.querySelector('.todoseq-dashboard-chip-query')).toBeNull();
      // group-by chip still present
      expect(host.querySelector('.todoseq-dashboard-chip-meta')).not.toBeNull();
    });

    it('adds the overlap tooltip to the header total for tag grouping', () => {
      renderer.renderCard(
        host,
        result({
          overlapsTotal: true,
          groups: [group('tag:home', '#home', 20, 'tag:home')],
        }),
        params({ groupBy: 'tag' }),
        noopCallbacks(),
      );
      const total = host.querySelector('.todoseq-dashboard-total');
      // The obsidian mock's setTooltip writes the title attribute
      expect(total?.getAttribute('title')).toContain('Tags can overlap');
      expect(total?.getAttribute('title')).toContain('12');
    });

    it('renders a collapsed card with a toggle header', () => {
      const content = renderer.renderCard(
        host,
        result(),
        params({ collapse: true }),
        noopCallbacks(),
      );
      const container = host.querySelector('.todoseq-dashboard-container');
      expect(container?.classList.contains('todoseq-dashboard-collapsed')).toBe(
        true,
      );
      const toggle = container?.querySelector('[role="button"][aria-expanded]');
      expect(toggle).not.toBeNull();
      expect(toggle?.getAttribute('aria-expanded')).toBe('false');

      toggle?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      expect(container?.classList.contains('todoseq-dashboard-collapsed')).toBe(
        false,
      );
      expect(toggle?.getAttribute('aria-expanded')).toBe('true');
      expect(content.classList.contains('todoseq-dashboard-content')).toBe(
        true,
      );
    });
  });

  describe('bar display', () => {
    it('renders one row per group with button semantics and aria labels', () => {
      renderer.renderCard(host, result(), params(), noopCallbacks());
      const rows = host.querySelectorAll('.todoseq-dashboard-bar-row');
      expect(rows.length).toBe(3);
      expect(rows[0].getAttribute('role')).toBe('button');
      expect(rows[0].getAttribute('tabindex')).toBe('0');
      expect(rows[0].getAttribute('aria-label')).toBe(
        'High: 4 of 12 tasks. Open in task list',
      );
      expect(
        rows[0].querySelector('.todoseq-dashboard-bar-label')?.textContent,
      ).toBe('High');
      expect(
        rows[0].querySelector('.todoseq-dashboard-bar-count')?.textContent,
      ).toBe('4');
      // Group color exposed via the --todoseq-bar-color custom property
      expect(
        (rows[0] as HTMLElement).style.getPropertyValue('--todoseq-bar-color'),
      ).toContain('--color-red');
    });

    it('sizes fills proportional to the max group count', () => {
      renderer.renderCard(host, result(), params(), noopCallbacks());
      const fills = host.querySelectorAll<HTMLElement>(
        '.todoseq-dashboard-bar-fill',
      );
      expect(fills.length).toBe(3);
      expect(fills[0].style.width).toBe('66.67%'); // 4 / 6
      expect(fills[1].style.width).toBe('33.33%'); // 2 / 6
      expect(fills[2].style.width).toBe('100%'); // 6 / 6
    });

    it('renders 100% width for a single-group card', () => {
      renderer.renderCard(
        host,
        result({
          groups: [group('priority:high', 'High', 3, 'priority:high')],
        }),
        params(),
        noopCallbacks(),
      );
      const fill = host.querySelector<HTMLElement>(
        '.todoseq-dashboard-bar-fill',
      );
      expect(fill?.style.width).toBe('100%');
    });

    it('dims faint-bucket fills (Low/None) with an is-muted class', () => {
      renderer.renderCard(
        host,
        result({
          groups: [
            group('priority:high', 'High', 4, 'priority:high'),
            group('priority:low', 'Low', 2, 'priority:low'),
          ],
        }),
        params(),
        noopCallbacks(),
      );
      const rows = host.querySelectorAll('.todoseq-dashboard-bar-row');
      expect(rows.length).toBe(2);
      // High keeps a full-strength fill; Low's fill is dimmed (dot stays full)
      const highFill = rows[0].querySelector('.todoseq-dashboard-bar-fill');
      const lowFill = rows[1].querySelector('.todoseq-dashboard-bar-fill');
      expect(highFill?.classList.contains('is-muted')).toBe(false);
      expect(lowFill?.classList.contains('is-muted')).toBe(true);
    });

    it('click and Enter trigger onOpenQuery with the composed query', () => {
      const callbacks = noopCallbacks();
      renderer.renderCard(host, result(), params(), callbacks);

      const row = host.querySelector<HTMLElement>('.todoseq-dashboard-bar-row');
      row?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      expect(callbacks.onOpenQuery).toHaveBeenCalledWith(
        '(tag:project) priority:high',
        expect.anything(),
      );

      (row as HTMLElement).dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
      );
      expect(callbacks.onOpenQuery).toHaveBeenCalledTimes(2);

      (row as HTMLElement).dispatchEvent(
        new KeyboardEvent('keydown', { key: ' ', bubbles: true }),
      );
      expect(callbacks.onOpenQuery).toHaveBeenCalledTimes(3);

      // Non-activation keys are ignored
      (row as HTMLElement).dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }),
      );
      expect(callbacks.onOpenQuery).toHaveBeenCalledTimes(3);
    });
  });

  describe('column display', () => {
    it('renders count above bar with baseline and labels below', () => {
      renderer.renderCard(
        host,
        result(),
        params({ display: 'column' }),
        noopCallbacks(),
      );
      const items = host.querySelectorAll('.todoseq-dashboard-column-item');
      expect(items.length).toBe(3);
      expect(
        items[0].querySelector('.todoseq-dashboard-column-count')?.textContent,
      ).toBe('4');
      const fill = items[0].querySelector<HTMLElement>(
        '.todoseq-dashboard-column-bar-fill',
      );
      expect(fill?.style.height).toBe('66.67%');
      expect(
        host.querySelector('.todoseq-dashboard-column-baseline'),
      ).not.toBeNull();
      const labels = host.querySelectorAll('.todoseq-dashboard-column-label');
      expect(labels.length).toBe(3);
      expect(labels[0].textContent).toBe('High');
    });
  });

  describe('donut display', () => {
    it('renders svg slices with dasharray offsets, center total, legend', () => {
      renderer.renderCard(
        host,
        result({ total: 12 }),
        params({ display: 'donut', groupBy: 'state' }),
        noopCallbacks(),
      );
      const ring = host.querySelector('svg.todoseq-dashboard-donut-ring');
      expect(ring).not.toBeNull();
      expect(ring?.getAttribute('role')).toBe('img');
      expect(ring?.getAttribute('aria-label')).toBe('12 tasks by state');

      const circles = ring?.querySelectorAll('circle');
      expect(circles?.length).toBe(3);

      const C = 2 * Math.PI * 58;
      const gap = 0.01 * C;
      const share = 4 / 12;
      const first = circles?.[0];
      const [dash] = (first?.getAttribute('stroke-dasharray') ?? '').split(' ');
      expect(parseFloat(dash)).toBeCloseTo(share * C - gap, 5);
      const offset = parseFloat(first?.getAttribute('stroke-dashoffset') ?? '');
      expect(offset).toBeCloseTo(-(gap / 2), 5);

      expect(
        host.querySelector('.todoseq-dashboard-donut-total')?.textContent,
      ).toBe('12');
      const legendRows = host.querySelectorAll('.todoseq-dashboard-legend-row');
      expect(legendRows.length).toBe(3);
      expect(legendRows[0].getAttribute('role')).toBe('button');
      expect(
        legendRows[0].querySelector('.todoseq-dashboard-legend-value')
          ?.textContent,
      ).toBe('4 · 33%');
      expect(legendRows[0].getAttribute('aria-label')).toBe(
        'High: 4 of 12 tasks. Open in task list',
      );
    });

    it('legend rows are clickable and raise onOpenQuery', () => {
      const callbacks = noopCallbacks();
      renderer.renderCard(
        host,
        result(),
        params({ display: 'donut' }),
        callbacks,
      );
      const row = host.querySelector<HTMLElement>(
        '.todoseq-dashboard-legend-row',
      );
      row?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      expect(callbacks.onOpenQuery).toHaveBeenCalledWith(
        '(tag:project) priority:high',
        expect.anything(),
      );
    });

    it('computes legend shares from the card total when counts overlap (tag grouping)', () => {
      // sum(counts) = 7 > total = 5 — shares must divide by the total so the
      // legend % matches the tooltip's "% of matched" number.
      const overlapResult = result({
        total: 5,
        overlapsTotal: true,
        groups: [
          group('tag:home', '#home', 3, 'tag:home'),
          group('tag:project', '#project', 3, 'tag:project'),
          group('tag:work', '#work', 1, 'tag:work'),
        ],
      });
      renderer.renderCard(
        host,
        overlapResult,
        params({ display: 'donut', groupBy: 'tag' }),
        noopCallbacks(),
      );

      const values = Array.from(
        host.querySelectorAll('.todoseq-dashboard-legend-value'),
      ).map((el) => el.textContent);
      // sharePct(count, total): 3/5 = 60%, 3/5 = 60%, 1/5 = 20%
      // (dividing by the count sum 7 would give 43/43/14 instead)
      expect(values).toEqual(['3 · 60%', '3 · 60%', '1 · 20%']);

      // The tooltip's "% of matched" is the same number as the legend value
      const firstRow = host.querySelector<HTMLElement>(
        '.todoseq-dashboard-legend-row',
      );
      expect(firstRow?.getAttribute('title')).toBe(
        '#home: 3 tasks · 60% of matched',
      );
    });

    it('recomputes legend shares from the total when patching overlapping counts', () => {
      const callbacks = noopCallbacks();
      const p = params({ display: 'donut', groupBy: 'tag' });
      renderer.renderCard(
        host,
        result({
          total: 5,
          overlapsTotal: true,
          groups: [
            group('tag:home', '#home', 3, 'tag:home'),
            group('tag:project', '#project', 3, 'tag:project'),
            group('tag:work', '#work', 1, 'tag:work'),
          ],
        }),
        p,
        callbacks,
      );

      renderer.updateContent(
        host.querySelector('.todoseq-dashboard-content') as HTMLElement,
        result({
          total: 5,
          overlapsTotal: true,
          groups: [
            group('tag:home', '#home', 4, 'tag:home'),
            group('tag:project', '#project', 2, 'tag:project'),
            group('tag:work', '#work', 2, 'tag:work'),
          ],
        }),
        p,
        callbacks,
      );

      const values = Array.from(
        host.querySelectorAll('.todoseq-dashboard-legend-value'),
      ).map((el) => el.textContent);
      // sharePct(count, total): 4/5 = 80%, 2/5 = 40%, 2/5 = 40%
      expect(values).toEqual(['4 · 80%', '2 · 40%', '2 · 40%']);
    });
  });

  describe('tiles display', () => {
    it('renders grid tiles with colored numbers and labels', () => {
      renderer.renderCard(
        host,
        result(),
        params({ display: 'tiles' }),
        noopCallbacks(),
      );
      const tiles = host.querySelectorAll('.todoseq-dashboard-tile');
      expect(tiles.length).toBe(3);
      expect(tiles[0].getAttribute('role')).toBe('button');
      expect(
        tiles[0].querySelector('.todoseq-dashboard-tile-number')?.textContent,
      ).toBe('4');
      // The group color custom property lives on the tile root; CSS cascades
      // it to the numeral.
      expect(
        (tiles[0] as HTMLElement).style.getPropertyValue(
          '--todoseq-tile-color',
        ),
      ).toContain('--color-red');
      expect(
        tiles[0].querySelector('.todoseq-dashboard-tile-label')?.textContent,
      ).toBe('High');
    });
  });

  describe('heatmap display', () => {
    const heatmapResult = (over: Partial<DashboardResult> = {}) => {
      const today = new Date();
      const key = (d: Date): string =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
          d.getDate(),
        ).padStart(2, '0')}`;
      const windowStart = new Date(
        today.getFullYear(),
        today.getMonth(),
        today.getDate() - ((today.getDay() + 6) % 7),
      );
      const days = Array.from({ length: 26 * 7 }, (_, i) => {
        const day = new Date(
          windowStart.getFullYear(),
          windowStart.getMonth(),
          windowStart.getDate() + i,
        );
        return { date: key(day), count: 0 };
      });
      const todayIdx = (today.getDay() + 6) % 7;
      days[todayIdx] = { date: key(today), count: 2 };
      days[todayIdx + 1] = {
        date: key(
          new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1),
        ),
        count: 4,
      };
      if (todayIdx >= 1) {
        days[todayIdx - 1] = {
          date: key(
            new Date(
              today.getFullYear(),
              today.getMonth(),
              today.getDate() - 1,
            ),
          ),
          count: 9, // past day: aggregation keeps this at 0 in production
        };
      }
      return result({
        total: 160,
        groups: [],
        days,
        today: key(today),
        ...over,
      });
    };

    it('renders 7-row grid cells with intensity, today and past classes', () => {
      renderer.renderCard(
        host,
        heatmapResult(),
        params({
          display: 'heatmap',
          groupBy: 'scheduled',
          heatmapWindow: 26,
        }),
        noopCallbacks(),
      );
      const grid = host.querySelector('.todoseq-dashboard-heatmap-grid');
      expect(grid).not.toBeNull();
      const cells = grid?.querySelectorAll('.todoseq-dashboard-heatmap-cell');
      expect(cells?.length).toBe(26 * 7);

      // Intensity classes: count 2 -> l2, count 4 -> l4
      expect(
        grid?.querySelector('.todoseq-dashboard-heatmap-cell.l2'),
      ).not.toBeNull();
      expect(
        grid?.querySelector('.todoseq-dashboard-heatmap-cell.l4'),
      ).not.toBeNull();

      // Today is outlined and interactive even though intensity applies
      const todayCell = grid?.querySelector(
        '.todoseq-dashboard-heatmap-cell.today',
      );
      expect(todayCell).not.toBeNull();
      expect(todayCell?.getAttribute('role')).toBe('button');

      // Past days are rendered but not interactive
      const pastCells = grid?.querySelectorAll(
        '.todoseq-dashboard-heatmap-cell.past',
      );
      expect(pastCells?.length).toBeGreaterThan(0);
      pastCells?.forEach((cell) => {
        expect(cell.getAttribute('role')).toBeNull();
      });

      // Gutter labels
      const gutter = host.querySelectorAll(
        '.todoseq-dashboard-heatmap-gutter span',
      );
      const gutterTexts = Array.from(gutter).map((g) => g.textContent);
      expect(gutterTexts).toEqual(['Mon', '', 'Wed', '', 'Fri', '', '']);
      // Footer: hint + LESS/MORE scale
      expect(
        host.querySelector('.todoseq-dashboard-heatmap-hint')?.textContent,
      ).toContain('Click a day');
      expect(
        host.querySelector('.todoseq-dashboard-heatmap-scale'),
      ).not.toBeNull();
      expect(host.textContent).toContain('LESS');
      expect(host.textContent).toContain('MORE');
    });

    it('rotates gutter labels when the week starts on Sunday', () => {
      renderer.renderCard(
        host,
        heatmapResult(),
        params({ display: 'heatmap', groupBy: 'scheduled' }),
        noopCallbacks(),
        { weekStartsOn: 'Sunday' },
      );
      const gutter = host.querySelectorAll(
        '.todoseq-dashboard-heatmap-gutter span',
      );
      const texts = Array.from(gutter).map((g) => g.textContent);
      expect(texts).toEqual(['Sun', '', 'Tue', '', 'Thu', '', 'Sat']);
    });

    it('clicking a day raises onOpenQuery with the day filter', () => {
      const callbacks = noopCallbacks();
      renderer.renderCard(
        host,
        heatmapResult(),
        params({ display: 'heatmap', groupBy: 'scheduled' }),
        callbacks,
      );
      const today = new Date();
      const todayKey = `${today.getFullYear()}-${String(
        today.getMonth() + 1,
      ).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      const cell = host.querySelector<HTMLElement>(
        `.todoseq-dashboard-heatmap-cell[data-date="${todayKey}"]`,
      );
      expect(cell).not.toBeNull();
      cell?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      expect(callbacks.onOpenQuery).toHaveBeenCalledWith(
        `(tag:project) scheduled:${todayKey}`,
        expect.anything(),
      );
    });
  });

  describe('collapsed header', () => {
    it('places the chevron directly after the title when a title is set', () => {
      renderer.renderCard(
        host,
        result(),
        params({ collapse: true, title: 'Dash' }),
        noopCallbacks(),
      );
      const header = host.querySelector<HTMLElement>(
        '.todoseq-dashboard-header',
      );
      expect(header?.getAttribute('aria-expanded')).toBe('false');
      // Placement contract: chevron sits immediately after the title
      // element; the total is pushed right by CSS, not by DOM order.
      const children = header
        ? Array.from(header.children).map((c) => c.className.split(' ').pop())
        : [];
      const titleIdx = children.indexOf('todoseq-dashboard-title');
      const chevronIdx = children.indexOf('todoseq-collapse-toggle-icon');
      expect(chevronIdx).toBe(titleIdx + 1);
      expect(children[children.length - 1]).toBe('todoseq-dashboard-total');
      const chevron = header?.querySelector('.todoseq-collapse-toggle-icon');
      // Collapsed by default: chevron-right (points at the closed content);
      // embedded task lists add .is-expanded to rotate it when open.
      expect(chevron?.getAttribute('data-icon')).toBe('chevron-right');
      expect(chevron?.classList.contains('is-expanded')).toBe(false);
    });

    it('leads the header line with the chevron before the task count when there is no title', () => {
      renderer.renderCard(
        host,
        result(),
        params({ collapse: true, title: undefined }),
        noopCallbacks(),
      );
      // No title: the header row (chevron + count) is the toggle — it is the
      // one row that stays visible when collapsed (the chips row hides).
      const header = host.querySelector<HTMLElement>(
        '.todoseq-dashboard-header',
      );
      expect(header?.getAttribute('role')).toBe('button');
      expect(header?.getAttribute('aria-expanded')).toBe('false');
      const children = header
        ? Array.from(header.children).map((c) => c.className.split(' ').pop())
        : [];
      expect(children[0]).toBe('todoseq-collapse-toggle-icon');
      expect(children[1]).toBe('todoseq-dashboard-total');
      const chevron = header?.querySelector('.todoseq-collapse-toggle-icon');
      expect(chevron?.getAttribute('data-icon')).toBe('chevron-right');

      // The chips row is NOT the toggle.
      const chips = host.querySelector<HTMLElement>('.todoseq-dashboard-chips');
      expect(chips?.getAttribute('role')).toBeNull();

      // Toggling expands the card and rotates the chevron.
      header?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      const container = host.querySelector('.todoseq-dashboard-container');
      expect(container?.classList.contains('todoseq-dashboard-collapsed')).toBe(
        false,
      );
      expect(chevron?.classList.contains('is-expanded')).toBe(true);
    });

    it('keeps the count-leading chevron when there is no title and no query chip', () => {
      renderer.renderCard(
        host,
        result(),
        params({
          collapse: true,
          title: undefined,
          searchQuery: undefined,
        }),
        noopCallbacks(),
      );
      const header = host.querySelector<HTMLElement>(
        '.todoseq-dashboard-header',
      );
      const children = header
        ? Array.from(header.children).map((c) => c.className.split(' ').pop())
        : [];
      expect(children[0]).toBe('todoseq-collapse-toggle-icon');
      expect(children[1]).toBe('todoseq-dashboard-total');
      // The chips row still carries the group-by chip (visible when open).
      expect(
        host.querySelector('.todoseq-dashboard-chips')?.getAttribute('role'),
      ).toBeNull();
    });

    it('expands the card and rotates the chevron on header click', () => {
      renderer.renderCard(
        host,
        result(),
        params({ collapse: true, title: 'Dash' }),
        noopCallbacks(),
      );
      const container = host.querySelector<HTMLElement>(
        '.todoseq-dashboard-container',
      );
      const header = host.querySelector<HTMLElement>(
        '.todoseq-dashboard-header',
      );
      header?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      expect(container?.classList.contains('todoseq-dashboard-collapsed')).toBe(
        false,
      );
      expect(header?.getAttribute('aria-expanded')).toBe('true');
      const chevron = header?.querySelector('.todoseq-collapse-toggle-icon');
      expect(chevron?.classList.contains('is-expanded')).toBe(true);
    });
  });

  describe('strip display', () => {
    it('renders query chip and pills without a header', () => {
      renderer.renderCard(
        host,
        result(),
        params({ display: 'strip', title: undefined }),
        noopCallbacks(),
      );
      expect(host.querySelector('.todoseq-dashboard-header')).toBeNull();
      expect(
        host.querySelector('.todoseq-dashboard-chip-query'),
      ).not.toBeNull();
      const pills = host.querySelectorAll('.todoseq-dashboard-pill');
      expect(pills.length).toBe(3);
      expect(pills[0].getAttribute('role')).toBe('button');
      expect(
        pills[0].querySelector('.todoseq-dashboard-pill-label')?.textContent,
      ).toBe('High');
      expect(
        pills[0].querySelector('.todoseq-dashboard-pill-count')?.textContent,
      ).toBe('4');
    });
  });

  describe('empty and error states', () => {
    it('renders the empty state when no tasks match', () => {
      renderer.renderCard(
        host,
        result({ total: 0, groups: [] }),
        params(),
        noopCallbacks(),
      );
      const empty = host.querySelector('.todoseq-dashboard-empty');
      expect(empty).not.toBeNull();
      expect(empty?.textContent).toContain('No tasks match');
      expect(empty?.textContent).toContain('Nothing in the vault matches');
      // Mockup layout: icon left, title + hint stacked to the right
      expect(
        empty?.querySelector('.todoseq-dashboard-empty-icon'),
      ).not.toBeNull();
      const text = empty?.querySelector('.todoseq-dashboard-empty-text');
      expect(text).not.toBeNull();
      expect(
        text?.querySelector('.todoseq-dashboard-empty-title')?.textContent,
      ).toBe('No tasks match');
      expect(
        text?.querySelector('.todoseq-dashboard-empty-hint'),
      ).not.toBeNull();
    });

    it('renders a one-line error while keeping the header', () => {
      renderer.renderError(
        host,
        params(),
        'Invalid search query: unbalanced parenthesis',
      );
      const container = host.querySelector('.todoseq-dashboard-container');
      expect(container).not.toBeNull();
      expect(
        container?.querySelector('.todoseq-dashboard-title')?.textContent,
      ).toBe('Due & overdue');
      const error = container?.querySelector('.todoseq-dashboard-error');
      expect(error?.textContent).toBe(
        'Invalid search query: unbalanced parenthesis',
      );
    });
  });

  describe('donut in-place patching', () => {
    const C = 2 * Math.PI * 58;
    const GAP = 0.01 * C;

    function donutRing(): SVGSVGElement | null {
      return host.querySelector<SVGSVGElement>(
        'svg.todoseq-dashboard-donut-ring',
      );
    }

    function slice(key: string): SVGCircleElement | null {
      return (
        donutRing()?.querySelector<SVGCircleElement>(
          `circle[data-key="${key}"]`,
        ) ?? null
      );
    }

    it('recomputes stroke-dashoffset when counts change', () => {
      // The offset is what positions each arc along the ring. The initial
      // render sets it from a running total; patching only the dasharray left
      // every arc at its original position, so a count change repainted the
      // ring into overlapping arcs.
      const callbacks = noopCallbacks();
      const content = renderer.renderCard(
        host,
        result(),
        params({ display: 'donut' }),
        callbacks,
      );
      expect(slice('priority:high')).not.toBeNull();
      const beforeOffset =
        slice('priority:high')!.getAttribute('stroke-dashoffset');

      renderer.updateContent(
        content,
        result({
          total: 12,
          groups: [
            group('priority:high', 'High', 1, 'priority:high'),
            group('priority:medium', 'Medium', 5, 'priority:medium'),
            group('priority:none', 'None', 6, 'priority:none'),
          ],
        }),
        params({ display: 'donut' }),
        callbacks,
      );

      const afterOffset =
        slice('priority:high')!.getAttribute('stroke-dashoffset');
      // High was first before and after, so its own offset is unchanged —
      // but Medium's share grew, so Medium's arc must move.
      expect(afterOffset).toBe(beforeOffset);
      const mediumDash = parseFloat(
        (
          slice('priority:medium')!.getAttribute('stroke-dasharray') ?? ''
        ).split(' ')[0],
      );
      expect(mediumDash).toBeCloseTo((5 / 12) * C - GAP, 5);
      const mediumOffset = parseFloat(
        slice('priority:medium')!.getAttribute('stroke-dashoffset') ?? '',
      );
      expect(mediumOffset).toBeCloseTo(-((1 / 12) * C + GAP / 2), 5);
    });

    it('materialises a slice for a group that goes from 0 to non-zero', () => {
      // Zero-count groups get no circle at render time, so patching could only
      // ever update slices that already existed — a group gaining its first
      // task stayed invisible until a full re-render.
      const callbacks = noopCallbacks();
      const content = renderer.renderCard(
        host,
        result({
          total: 4,
          groups: [
            group('priority:high', 'High', 4, 'priority:high'),
            group('priority:low', 'Low', 0, 'priority:low'),
          ],
        }),
        params({ display: 'donut' }),
        callbacks,
      );
      expect(slice('priority:low')).toBeNull();

      renderer.updateContent(
        content,
        result({
          total: 6,
          groups: [
            group('priority:high', 'High', 4, 'priority:high'),
            group('priority:low', 'Low', 2, 'priority:low'),
          ],
        }),
        params({ display: 'donut' }),
        callbacks,
      );

      expect(slice('priority:low')).not.toBeNull();
      expect(donutRing()?.querySelectorAll('circle').length).toBe(2);
    });

    it('drops the slice for a group that falls back to zero', () => {
      const callbacks = noopCallbacks();
      const content = renderer.renderCard(
        host,
        result({
          total: 6,
          groups: [
            group('priority:high', 'High', 4, 'priority:high'),
            group('priority:low', 'Low', 2, 'priority:low'),
          ],
        }),
        params({ display: 'donut' }),
        callbacks,
      );
      expect(slice('priority:low')).not.toBeNull();

      renderer.updateContent(
        content,
        result({
          total: 4,
          groups: [
            group('priority:high', 'High', 4, 'priority:high'),
            group('priority:low', 'Low', 0, 'priority:low'),
          ],
        }),
        params({ display: 'donut' }),
        callbacks,
      );

      expect(slice('priority:low')).toBeNull();
      expect(donutRing()?.querySelectorAll('circle').length).toBe(1);
    });
  });

  describe('non-clickable groups', () => {
    it('does not bind open handlers for a group with an empty filter', () => {
      // The "N more" truncation tail carries filter: '' so the renderer shows
      // it as a muted footer. It was still getting click and keydown handlers,
      // which composed to the unfiltered base query — so the footer behaved
      // like a button that filtered nothing.
      const callbacks = noopCallbacks();
      renderer.renderCard(
        host,
        result({
          total: 12,
          groups: [
            group('priority:high', 'High', 4, 'priority:high'),
            group('more', '2 more', 6, ''),
          ],
        }),
        params({ display: 'bar', maxGroups: 1 }),
        callbacks,
      );

      const tail = host.querySelector<HTMLElement>(
        '.todoseq-dashboard-bar-row[data-key="more"]',
      );
      expect(tail).not.toBeNull();
      tail?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      expect(callbacks.onOpenQuery).not.toHaveBeenCalled();
    });

    it('still binds open handlers for a group with a real filter', () => {
      const callbacks = noopCallbacks();
      renderer.renderCard(
        host,
        result(),
        params({ display: 'bar' }),
        callbacks,
      );
      const row = host.querySelector<HTMLElement>(
        '.todoseq-dashboard-bar-row[data-key="priority:high"]',
      );
      row?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      expect(callbacks.onOpenQuery).toHaveBeenCalledTimes(1);
    });
  });

  describe('updateContent', () => {
    it('patches counts in place when the group keys match', () => {
      const callbacks = noopCallbacks();
      const content = renderer.renderCard(host, result(), params(), callbacks);
      const row = content.querySelector('.todoseq-dashboard-bar-row');
      const countEl = row?.querySelector('.todoseq-dashboard-bar-count');
      const fillEl = row?.querySelector<HTMLElement>(
        '.todoseq-dashboard-bar-fill',
      );
      expect(countEl?.textContent).toBe('4');
      expect(fillEl?.style.width).toBe('66.67%');

      const next = result({
        groups: [
          group('priority:high', 'High', 5, 'priority:high'),
          group('priority:medium', 'Medium', 1, 'priority:medium'),
          group('priority:none', 'None', 6, 'priority:none'),
        ],
      });
      renderer.updateContent(content, next, params(), callbacks);

      // Same DOM node updated, not replaced
      expect(content.querySelector('.todoseq-dashboard-bar-row')).toBe(row);
      expect(countEl?.textContent).toBe('5');
      expect(fillEl?.style.width).toBe('83.33%');
      // Tooltip re-applied with the fresh count (mock writes title attr)
      expect(row?.getAttribute('title')).toContain('High: 5 tasks');
    });

    it('rebuilds the content when the group keys differ', () => {
      const callbacks = noopCallbacks();
      const content = renderer.renderCard(host, result(), params(), callbacks);
      const originalRow = content.querySelector('.todoseq-dashboard-bar-row');

      const next = result({
        groups: [
          group('state:active', 'Active', 5, 'state:active'),
          group('state:waiting', 'Waiting', 1, 'state:waiting'),
        ],
      });
      renderer.updateContent(content, next, params(), callbacks);

      const newRow = content.querySelector('.todoseq-dashboard-bar-row');
      expect(newRow).not.toBeNull();
      expect(newRow).not.toBe(originalRow);
      expect(
        newRow?.querySelector('.todoseq-dashboard-bar-label')?.textContent,
      ).toBe('Active');
    });

    it('rebuilds when the new result is empty (empty state)', () => {
      const callbacks = noopCallbacks();
      const content = renderer.renderCard(host, result(), params(), callbacks);
      renderer.updateContent(
        content,
        result({ total: 0, groups: [] }),
        params(),
        callbacks,
      );
      expect(content.querySelector('.todoseq-dashboard-empty')).not.toBeNull();
    });

    it('rebuilds from empty state when tasks return', () => {
      const callbacks = noopCallbacks();
      const content = renderer.renderCard(
        host,
        result({ total: 0, groups: [] }),
        params(),
        callbacks,
      );
      renderer.updateContent(content, result(), params(), callbacks);
      expect(content.querySelector('.todoseq-dashboard-empty')).toBeNull();
      expect(
        content.querySelectorAll('.todoseq-dashboard-bar-row').length,
      ).toBe(3);
    });

    it('always rebuilds the heatmap', () => {
      const callbacks = noopCallbacks();
      const p = params({ display: 'heatmap', groupBy: 'scheduled' });
      const res = result({
        total: 2,
        groups: [],
        days: [{ date: '2026-09-29', count: 2 }],
        today: '2026-09-29',
      });
      const content = renderer.renderCard(host, res, p, callbacks);
      const grid = content.querySelector('.todoseq-dashboard-heatmap-grid');
      expect(grid).not.toBeNull();
      renderer.updateContent(content, res, p, callbacks);
      expect(content.querySelector('.todoseq-dashboard-heatmap-grid')).not.toBe(
        grid,
      );
    });

    it('patches strip pill counts in place', () => {
      const callbacks = noopCallbacks();
      const p = params({ display: 'strip', title: undefined });
      const content = renderer.renderCard(host, result(), p, callbacks);
      const pill = content.querySelector('.todoseq-dashboard-pill');
      const countEl = pill?.querySelector('.todoseq-dashboard-pill-count');
      expect(countEl?.textContent).toBe('4');

      const next = result({
        groups: [
          group('priority:high', 'High', 7, 'priority:high'),
          group('priority:medium', 'Medium', 2, 'priority:medium'),
          group('priority:none', 'None', 6, 'priority:none'),
        ],
      });
      renderer.updateContent(content, next, p, callbacks);
      expect(content.querySelector('.todoseq-dashboard-pill')).toBe(pill);
      expect(countEl?.textContent).toBe('7');
    });
  });
});

describe('tooltip content', () => {
  it('applies count and share via setTooltip (no open hint)', () => {
    // The obsidian mock's setTooltip writes the title attribute
    const renderer = new DashboardRenderer(createBaseSettings());
    const host = document.createElement('div');
    document.body.appendChild(host);
    renderer.renderCard(host, result(), params(), noopCallbacks());
    const row = host.querySelector('.todoseq-dashboard-bar-row');
    expect(row?.getAttribute('title')).toBe('High: 4 tasks · 33% of matched');
    host.remove();
  });
});

describe('DashboardCodeBlockProcessor', () => {
  let unsubscribeMock: jest.Mock;
  let subscribeMock: jest.Mock;
  let registerProcessorMock: jest.Mock;
  let onFileChangeMock: jest.Mock;
  let getTasksMock: jest.Mock;
  let host: HTMLElement;
  let pluginMock: Record<string, unknown>;

  const SOURCE = [
    'search: tag:project',
    'group-by: priority',
    'title: Due & overdue',
  ].join('\n');

  const taskAt = (
    path: string,
    line: number,
    priority: Task['priority'],
  ): Task =>
    createBaseTask({
      path,
      line,
      rawText: `TODO task #project`,
      tags: ['project'],
      priority,
    });

  beforeEach(() => {
    jest.useFakeTimers();
    unsubscribeMock = jest.fn();
    subscribeMock = jest.fn().mockReturnValue(unsubscribeMock);
    registerProcessorMock = jest.fn();
    onFileChangeMock = jest.fn();
    getTasksMock = jest.fn(() => [
      taskAt('a.md', 0, 'high'),
      taskAt('a.md', 1, 'med'),
    ]);
    host = document.createElement('div');
    document.body.appendChild(host);

    pluginMock = {
      settings: createBaseSettings(),
      keywordManager: createTestKeywordManager(),
      propertySearchEngine: null,
      taskStateManager: { subscribe: subscribeMock },
      eventCoordinator: { onFileChange: onFileChangeMock },
      getTasks: getTasksMock,
      registerMarkdownCodeBlockProcessor: registerProcessorMock,
      vaultScanner: { getKeywordManager: () => createTestKeywordManager() },
      uiManager: {
        showTasks: jest.fn().mockResolvedValue(undefined),
        showTasksInNewTab: jest.fn().mockResolvedValue(undefined),
      },
    };
  });

  afterEach(() => {
    jest.useRealTimers();
    host.remove();
  });

  const makeProcessor = (): DashboardCodeBlockProcessor => {
    const processor = new DashboardCodeBlockProcessor(
      pluginMock as unknown as TodoTracker,
    );
    processor.registerProcessor();
    return processor;
  };

  // renderError empties the host element, detaching the cached contentRoot.
  // While the processor kept that stale reference, the next refresh took the
  // patch-in-place branch and updated a node that was no longer in the
  // document, so one transient failure left the card stuck on the error.
  it('re-renders the card after a transient refresh error', async () => {
    const processor = makeProcessor();
    await processSource(processor);
    const dashboard = processor['activeDashboards'].values().next().value;
    expect(dashboard.contentRoot).not.toBeNull();
    const el = dashboard.el;

    getTasksMock.mockImplementationOnce(() => {
      throw new Error('transient');
    });
    await processor['refreshDashboard'](dashboard);
    expect(el.querySelector('.todoseq-dashboard-error')).not.toBeNull();
    expect(dashboard.contentRoot).toBeNull();

    await processor['refreshDashboard'](dashboard);
    expect(el.querySelector('.todoseq-dashboard-error')).toBeNull();
    expect(el.querySelector('.todoseq-dashboard-container')).not.toBeNull();
  });

  const processSource = async (
    processor: DashboardCodeBlockProcessor,
  ): Promise<void> => {
    const handler = registerProcessorMock.mock.calls.find(
      (call) => call[0] === 'todoseq-dashboard',
    )?.[1] as (source: string, el: HTMLElement, ctx: unknown) => Promise<void>;
    expect(handler).toBeDefined();
    await handler(SOURCE, host, { sourcePath: 'note.md' });
  };

  it('subscribes to the task state manager and registers the processor', () => {
    makeProcessor();
    expect(subscribeMock).toHaveBeenCalledTimes(1);
    expect(registerProcessorMock).toHaveBeenCalledWith(
      'todoseq-dashboard',
      expect.any(Function),
    );
    expect(onFileChangeMock).toHaveBeenCalledTimes(1);
  });
  it('renders a card into the block element and tracks it', async () => {
    const processor = makeProcessor();
    await processSource(processor);

    expect(host.querySelector('.todoseq-dashboard-container')).not.toBeNull();
    expect(host.querySelector('.todoseq-dashboard-title')?.textContent).toBe(
      'Due & overdue',
    );
    const rows = host.querySelectorAll('.todoseq-dashboard-bar-row');
    expect(rows.length).toBe(2); // high 1, medium 1 — none dropped
  });

  it('renders the parser error instead of a card', async () => {
    const processor = makeProcessor();
    const handler = registerProcessorMock.mock.calls[0][1] as (
      source: string,
      el: HTMLElement,
      ctx: unknown,
    ) => Promise<void>;
    await handler('group-by: bogus', host, { sourcePath: 'note.md' });
    // The error line replaces the content; the header shell remains
    expect(host.querySelector('.todoseq-dashboard-error')?.textContent).toBe(
      'Unknown group-by: bogus',
    );
    expect(host.querySelector('.todoseq-dashboard-content')).toBeNull();
    expect(host.querySelector('.todoseq-dashboard-bar-row')).toBeNull();
  });

  it('refreshes tracked dashboards when the state manager notifies', async () => {
    const processor = makeProcessor();
    await processSource(processor);

    const row = host.querySelector('.todoseq-dashboard-bar-row');
    const countEl = row?.querySelector('.todoseq-dashboard-bar-count');
    expect(countEl?.textContent).toBe('1');

    // Task state changed somewhere (e.g. archive run): new counts arrive
    getTasksMock.mockReturnValue([
      taskAt('a.md', 0, 'high'),
      taskAt('a.md', 1, 'high'),
      taskAt('a.md', 2, 'med'),
    ]);
    const notify = subscribeMock.mock.calls[0][0] as (tasks: Task[]) => void;
    notify([]);

    await jest.advanceTimersByTimeAsync(200);

    // Patched in place: same row node, fresh count
    expect(host.querySelector('.todoseq-dashboard-bar-row')).toBe(row);
    expect(countEl?.textContent).toBe('2');
  });

  it('untracks blocks from deleted files and refreshes the rest', async () => {
    const processor = makeProcessor();
    await processSource(processor);
    expect(host.querySelector('.todoseq-dashboard-container')).not.toBeNull();

    const fileChangeHandler = onFileChangeMock.mock.calls[0][0] as (event: {
      type: string;
      file: { path: string };
      oldPath?: string;
    }) => void;

    fileChangeHandler({ type: 'delete', file: { path: 'other.md' } });
    await jest.advanceTimersByTimeAsync(0);
    expect(host.querySelector('.todoseq-dashboard-container')).not.toBeNull();

    fileChangeHandler({ type: 'delete', file: { path: 'note.md' } });
    await jest.advanceTimersByTimeAsync(0);
    // Block untracked; the element is left as-is (Obsidian removes it with
    // the deleted file's markdown view)
    expect(host.querySelector('.todoseq-dashboard-container')).not.toBeNull();
    // Further state-manager notifications no longer refresh anything
    const notify = subscribeMock.mock.calls[0][0] as (tasks: Task[]) => void;
    notify([]);
    await jest.advanceTimersByTimeAsync(200);
  });

  it('renames tracked blocks to the new path', async () => {
    const processor = makeProcessor();
    await processSource(processor);
    const fileChangeHandler = onFileChangeMock.mock.calls[0][0] as (event: {
      type: string;
      file: { path: string };
      oldPath?: string;
    }) => void;

    fileChangeHandler({
      type: 'rename',
      file: { path: 'renamed.md' },
      oldPath: 'note.md',
    });
    await jest.advanceTimersByTimeAsync(0);
    expect(host.querySelector('.todoseq-dashboard-container')).not.toBeNull();
  });

  it('cleanup unsubscribes and clears tracked blocks', async () => {
    const processor = makeProcessor();
    await processSource(processor);
    processor.cleanup();
    expect(unsubscribeMock).toHaveBeenCalledTimes(1);

    const notify = subscribeMock.mock.calls[0][0] as (tasks: Task[]) => void;
    notify([]);
    await jest.advanceTimersByTimeAsync(200);
    // No refresh happened after cleanup (count unchanged)
    const countEl = host.querySelector('.todoseq-dashboard-bar-count');
    expect(countEl?.textContent).toBe('1');
  });
});
