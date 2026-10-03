/**
 * Unit tests for the todoseq-dashboard code block parser.
 * Modeled after tests/code-block-parser.test.ts.
 */
import { TodoseqDashboardParser } from '../src/view/embedded-dashboard/dashboard-parser';

describe('TodoseqDashboardParser', () => {
  describe('defaults', () => {
    it('returns documented defaults for an empty block', () => {
      const params = TodoseqDashboardParser.parse('');

      expect(params.error).toBeUndefined();
      expect(params.searchQuery).toBe('');
      expect(params.groupBy).toBe('state');
      expect(params.display).toBe('bar');
      expect(params.title).toBeUndefined();
      expect(params.showQuery).toBe(true);
      expect(params.sort).toBeUndefined();
      expect(params.showEmpty).toBe(false);
      expect(params.maxGroups).toBe(8);
      expect(params.color).toBe('semantic');
      expect(params.collapse).toBe(false);
      expect(params.heatmapWindow).toBe(26);
    });
  });

  describe('option parsing', () => {
    it('parses every option', () => {
      const source = [
        'search: tag:project',
        'group-by: priority',
        'display: donut',
        'title: Work pipeline',
        'show-query: false',
        'sort: count-asc',
        'show-empty: true',
        'max-groups: 5',
        'color: mono',
        'collapse: false',
        'heatmap-window: 12',
      ].join('\n');

      const params = TodoseqDashboardParser.parse(source);

      expect(params.error).toBeUndefined();
      expect(params.searchQuery).toBe('tag:project');
      expect(params.groupBy).toBe('priority');
      expect(params.display).toBe('donut');
      expect(params.title).toBe('Work pipeline');
      expect(params.showQuery).toBe(false);
      expect(params.sort).toBe('count-asc');
      expect(params.showEmpty).toBe(true);
      expect(params.maxGroups).toBe(5);
      expect(params.color).toBe('mono');
      expect(params.collapse).toBe(false);
      expect(params.heatmapWindow).toBe(12);
    });

    it('accepts display: strip', () => {
      const params = TodoseqDashboardParser.parse('display: strip');
      expect(params.error).toBeUndefined();
      expect(params.display).toBe('strip');
    });

    it('ignores the removed layout: option (never released)', () => {
      const stripParams = TodoseqDashboardParser.parse('layout: strip');
      expect(stripParams.error).toBeUndefined();
      expect(stripParams.display).toBe('bar');
      expect(
        TodoseqDashboardParser.parse('layout: card').error,
      ).toBeUndefined();
      expect(
        TodoseqDashboardParser.parse('layout: bogus').error,
      ).toBeUndefined();
    });

    it('rejects display: bogus with the display error message', () => {
      const params = TodoseqDashboardParser.parse('display: bogus');
      expect(params.error).toBeDefined();
      expect(params.error).toContain('display');
    });

    it('rejects strip combined with a title (the strip has no header)', () => {
      const params = TodoseqDashboardParser.parse(
        'display: strip\ntitle: Pipeline',
      );
      expect(params.error).toBeDefined();
    });

    it('rejects strip combined with heatmap-window (meaningless for pills)', () => {
      const params = TodoseqDashboardParser.parse(
        'display: strip\nheatmap-window: 12',
      );
      expect(params.error).toBeDefined();
    });

    it('rejects strip combined with collapse (the strip has no header to toggle)', () => {
      const params = TodoseqDashboardParser.parse(
        'display: strip\ncollapse: true',
      );
      expect(params.error).toBeDefined();
    });

    it('accepts group: as an alias for group-by:', () => {
      expect(TodoseqDashboardParser.parse('group: tag').groupBy).toBe('tag');
    });

    it('is case-insensitive for semantic values', () => {
      const params = TodoseqDashboardParser.parse(
        'group-by: TAG\ndisplay: DONUT\ncolor: MONO\nsort: COUNT-DESC',
      );
      expect(params.groupBy).toBe('tag');
      expect(params.display).toBe('donut');
      expect(params.color).toBe('mono');
      expect(params.sort).toBe('count-desc');
    });

    it('preserves the search query and title casing', () => {
      const params = TodoseqDashboardParser.parse(
        'search: tag:MyProject\n title: My Dashboard',
      );
      expect(params.searchQuery).toBe('tag:MyProject');
      expect(params.title).toBe('My Dashboard');
    });
  });

  describe('boolean alternates (true/show, false/hide)', () => {
    it('accepts show/hide for show-query', () => {
      expect(TodoseqDashboardParser.parse('show-query: show').showQuery).toBe(
        true,
      );
      expect(TodoseqDashboardParser.parse('show-query: hide').showQuery).toBe(
        false,
      );
    });

    it('accepts show/hide for show-empty', () => {
      expect(TodoseqDashboardParser.parse('show-empty: show').showEmpty).toBe(
        true,
      );
      expect(TodoseqDashboardParser.parse('show-empty: hide').showEmpty).toBe(
        false,
      );
    });

    it('rejects invalid boolean values', () => {
      expect(
        TodoseqDashboardParser.parse('show-query: yes').error,
      ).toBeDefined();
      expect(
        TodoseqDashboardParser.parse('show-empty: yes').error,
      ).toBeDefined();
    });
  });

  describe('collapse option', () => {
    it('accepts only true/false (the embedded collapse: precedent)', () => {
      expect(TodoseqDashboardParser.parse('collapse: true').collapse).toBe(
        true,
      );
      expect(TodoseqDashboardParser.parse('collapse: false').collapse).toBe(
        false,
      );
      // 'show' is NOT accepted for collapse (stays invalid, default false)
      const showParams = TodoseqDashboardParser.parse('collapse: show');
      expect(showParams.error).toBeDefined();
    });

    it('ignores the removed collapsed: alias (never released)', () => {
      const params = TodoseqDashboardParser.parse('collapsed: true');
      expect(params.error).toBeUndefined();
      expect(params.collapse).toBe(false);
    });

    it('errors when collapse is set without title or query chip', () => {
      const guarded = TodoseqDashboardParser.parse(
        'collapse: true\nshow-query: false',
      );
      expect(guarded.error).toBeDefined();

      const withTitle = TodoseqDashboardParser.parse(
        'collapse: true\ntitle: Pipeline',
      );
      expect(withTitle.error).toBeUndefined();
      expect(withTitle.collapse).toBe(true);

      const withQuery = TodoseqDashboardParser.parse('collapse: true');
      expect(withQuery.error).toBeUndefined();
      expect(withQuery.collapse).toBe(true);
    });
  });

  describe('error cases', () => {
    it('rejects an unknown group-by with the specified message', () => {
      const params = TodoseqDashboardParser.parse('group-by: bogus');
      expect(params.error).toBe('Unknown group-by: bogus');
    });

    it('rejects an unknown display', () => {
      const params = TodoseqDashboardParser.parse('display: pie');
      expect(params.error).toBeDefined();
    });

    it('rejects heatmap without a date group-by', () => {
      const params = TodoseqDashboardParser.parse(
        'display: heatmap\ngroup-by: priority',
      );
      expect(params.error).toBe(
        'heatmap requires group-by: scheduled or deadline',
      );
    });

    it('allows heatmap with scheduled or deadline group-by', () => {
      expect(
        TodoseqDashboardParser.parse('display: heatmap\ngroup-by: scheduled')
          .error,
      ).toBeUndefined();
      expect(
        TodoseqDashboardParser.parse('display: heatmap\ngroup-by: deadline')
          .error,
      ).toBeUndefined();
    });

    it('rejects an invalid search query', () => {
      const params = TodoseqDashboardParser.parse('search: tag:(((');
      expect(params.error).toBeDefined();
      expect(params.error).toContain('Invalid search query');
    });

    it('rejects an unknown sort option', () => {
      const params = TodoseqDashboardParser.parse('sort: bogus');
      expect(params.error).toBeDefined();
    });

    it('rejects an unknown color', () => {
      const params = TodoseqDashboardParser.parse('color: rainbow');
      expect(params.error).toBeDefined();
    });

    it('rejects non-positive or non-numeric max-groups', () => {
      expect(TodoseqDashboardParser.parse('max-groups: 0').error).toBeDefined();
      expect(
        TodoseqDashboardParser.parse('max-groups: -2').error,
      ).toBeDefined();
      expect(
        TodoseqDashboardParser.parse('max-groups: abc').error,
      ).toBeDefined();
      expect(TodoseqDashboardParser.parse('max-groups: 3').maxGroups).toBe(3);
    });

    it('rejects heatmap-window outside 4-52', () => {
      expect(
        TodoseqDashboardParser.parse('heatmap-window: 3').error,
      ).toBeDefined();
      expect(
        TodoseqDashboardParser.parse('heatmap-window: 53').error,
      ).toBeDefined();
      expect(
        TodoseqDashboardParser.parse('heatmap-window: 4').heatmapWindow,
      ).toBe(4);
      expect(
        TodoseqDashboardParser.parse('heatmap-window: 52').heatmapWindow,
      ).toBe(52);
      expect(
        TodoseqDashboardParser.parse('heatmap-window: abc').error,
      ).toBeDefined();
    });
  });

  describe('comments and whitespace', () => {
    it('skips # comment lines', () => {
      const source = [
        '# Team dashboard',
        '# adjusted 2026-09',
        'search: tag:project',
        'group-by: priority',
        '# footer note',
      ].join('\n');

      const params = TodoseqDashboardParser.parse(source);

      expect(params.error).toBeUndefined();
      expect(params.searchQuery).toBe('tag:project');
      expect(params.groupBy).toBe('priority');
    });

    it('tolerates surrounding whitespace', () => {
      const params = TodoseqDashboardParser.parse(
        '  search:   tag:project  \n\ngroup-by:   state  ',
      );
      expect(params.searchQuery).toBe('tag:project');
      expect(params.groupBy).toBe('state');
    });
  });

  describe('all group-by and display values', () => {
    it('accepts every documented group-by value', () => {
      for (const value of [
        'priority',
        'state',
        'keyword',
        'tag',
        'scheduled',
        'deadline',
      ]) {
        const params = TodoseqDashboardParser.parse(`group-by: ${value}`);
        expect(params.error).toBeUndefined();
        expect(params.groupBy).toBe(value);
      }
    });

    it('accepts every documented display value', () => {
      for (const value of ['bar', 'column', 'donut', 'tiles', 'heatmap']) {
        const params = TodoseqDashboardParser.parse(
          `display: ${value}\ngroup-by: scheduled`,
        );
        expect(params.error).toBeUndefined();
        expect(params.display).toBe(value);
      }
    });
  });
});
