/**
 * Unit tests for TodoseqCodeBlockParser
 * Tests all major functionality including the previously uncovered methods
 */
import { TodoseqCodeBlockParser } from '../src/view/embedded-task-list/code-block-parser';

describe('TodoseqCodeBlockParser', () => {
  describe('parse() method', () => {
    it('should parse minimal code block with search query', () => {
      const source = 'search: tag:test';
      const params = TodoseqCodeBlockParser.parse(source);

      expect(params.searchQuery).toBe('tag:test');
      expect(params.sortMethod).toBe('default');
      expect(params.completed).toBeUndefined();
      expect(params.future).toBeUndefined();
      expect(params.limit).toBeUndefined();
      expect(params.error).toBeUndefined();
    });

    it('should parse all valid parameters', () => {
      const source = `search: tag:test AND content:"example"
sort: priority
completed: hide
future: show-upcoming
limit: 10
show-file: true
title: My Task List
show-query: true
wrap-content: dynamic
collapse: true`;

      const params = TodoseqCodeBlockParser.parse(source);

      expect(params.searchQuery).toBe('tag:test AND content:"example"');
      expect(params.sortMethod).toBe('priority');
      expect(params.completed).toBe('hide');
      expect(params.future).toBe('show-upcoming');
      expect(params.limit).toBe(10);
      expect(params.showFile).toBe(true);
      expect(params.title).toBe('My Task List');
      expect(params.showQuery).toBe(true);
      expect(params.wrapContent).toBe('dynamic');
      expect(params.collapse).toBe(true);
      expect(params.error).toBeUndefined();
    });

    it('should parse closed sort method', () => {
      const source = 'sort: closed';
      const params = TodoseqCodeBlockParser.parse(source);
      expect(params.sortMethod).toBe('closed');
      expect(params.error).toBeUndefined();
    });

    it('should handle invalid parameters gracefully', () => {
      const source =
        'search: invalid query syntax\n sort: invalid\n completed: invalid\n future: invalid\n limit: -1';
      const params = TodoseqCodeBlockParser.parse(source);

      expect(params.error).not.toBeUndefined();
    });

    it('should map old parameter names to new ones', () => {
      const source = 'show-completed: sort-to-end\n show-future: hide';
      const params = TodoseqCodeBlockParser.parse(source);

      expect(params.completed).toBe('sort-to-end');
      expect(params.future).toBe('hide');
    });

    it('should parse show-scheduled-date option', () => {
      expect(
        TodoseqCodeBlockParser.parse(
          'search: tag:test\n show-scheduled-date: true',
        ).showScheduledDate,
      ).toBe(true);
      expect(
        TodoseqCodeBlockParser.parse(
          'search: tag:test\n show-scheduled-date: show',
        ).showScheduledDate,
      ).toBe(true);
      expect(
        TodoseqCodeBlockParser.parse(
          'search: tag:test\n show-scheduled-date: false',
        ).showScheduledDate,
      ).toBe(false);
      expect(
        TodoseqCodeBlockParser.parse(
          'search: tag:test\n show-scheduled-date: hide',
        ).showScheduledDate,
      ).toBe(false);
      expect(
        TodoseqCodeBlockParser.parse('search: tag:test').showScheduledDate,
      ).toBeUndefined();
    });

    it('should parse show-deadline-date option', () => {
      expect(
        TodoseqCodeBlockParser.parse(
          'search: tag:test\n show-deadline-date: true',
        ).showDeadlineDate,
      ).toBe(true);
      expect(
        TodoseqCodeBlockParser.parse(
          'search: tag:test\n show-deadline-date: show',
        ).showDeadlineDate,
      ).toBe(true);
      expect(
        TodoseqCodeBlockParser.parse(
          'search: tag:test\n show-deadline-date: false',
        ).showDeadlineDate,
      ).toBe(false);
      expect(
        TodoseqCodeBlockParser.parse(
          'search: tag:test\n show-deadline-date: hide',
        ).showDeadlineDate,
      ).toBe(false);
      expect(
        TodoseqCodeBlockParser.parse('search: tag:test').showDeadlineDate,
      ).toBeUndefined();
    });

    it('should reject invalid show-scheduled-date values', () => {
      const params = TodoseqCodeBlockParser.parse(
        'search: tag:test\n show-scheduled-date: yes',
      );
      expect(params.error).toBeDefined();
    });

    it('should reject invalid show-deadline-date values', () => {
      const params = TodoseqCodeBlockParser.parse(
        'search: tag:test\n show-deadline-date: yes',
      );
      expect(params.error).toBeDefined();
    });

    it('should parse show-closed-date option', () => {
      expect(
        TodoseqCodeBlockParser.parse(
          'search: tag:test\n show-closed-date: true',
        ).showClosedDate,
      ).toBe(true);
      expect(
        TodoseqCodeBlockParser.parse(
          'search: tag:test\n show-closed-date: show',
        ).showClosedDate,
      ).toBe(true);
      expect(
        TodoseqCodeBlockParser.parse(
          'search: tag:test\n show-closed-date: false',
        ).showClosedDate,
      ).toBe(false);
      expect(
        TodoseqCodeBlockParser.parse(
          'search: tag:test\n show-closed-date: hide',
        ).showClosedDate,
      ).toBe(false);
      expect(
        TodoseqCodeBlockParser.parse('search: tag:test').showClosedDate,
      ).toBeUndefined();
    });

    it('should reject invalid show-closed-date values', () => {
      const params = TodoseqCodeBlockParser.parse(
        'search: tag:test\n show-closed-date: yes',
      );
      expect(params.error).toBeDefined();
    });

    it('should parse both date display options together', () => {
      const source =
        'search: tag:test\n show-scheduled-date: true\n show-deadline-date: show';
      const params = TodoseqCodeBlockParser.parse(source);
      expect(params.showScheduledDate).toBe(true);
      expect(params.showDeadlineDate).toBe(true);
      expect(params.error).toBeUndefined();
    });

    it('should parse all three date display options together', () => {
      const source =
        'search: tag:test\n show-scheduled-date: true\n show-deadline-date: show\n show-closed-date: true';
      const params = TodoseqCodeBlockParser.parse(source);
      expect(params.showScheduledDate).toBe(true);
      expect(params.showDeadlineDate).toBe(true);
      expect(params.showClosedDate).toBe(true);
      expect(params.error).toBeUndefined();
    });

    it('should parse upcoming-period option', () => {
      const params = TodoseqCodeBlockParser.parse(
        'search: tag:test\n upcoming-period: 14',
      );
      expect(params.upcomingPeriod).toBe(14);
      expect(params.error).toBeUndefined();
    });

    it('should parse upcoming-period with zero value', () => {
      const params = TodoseqCodeBlockParser.parse(
        'search: tag:test\n upcoming-period: 0',
      );
      expect(params.upcomingPeriod).toBe(0);
      expect(params.error).toBeUndefined();
    });

    it('should reject upcoming-period with negative value', () => {
      const params = TodoseqCodeBlockParser.parse(
        'search: tag:test\n upcoming-period: -3',
      );
      expect(params.error).toBeDefined();
    });

    it('should reject upcoming-period with non-numeric value', () => {
      const params = TodoseqCodeBlockParser.parse(
        'search: tag:test\n upcoming-period: abc',
      );
      expect(params.error).toBeDefined();
    });

    it('should parse scheduled-warning-period option', () => {
      const params = TodoseqCodeBlockParser.parse(
        'search: tag:test\n scheduled-warning-period: 3',
      );
      expect(params.scheduledWarningPeriod).toBe(3);
      expect(params.error).toBeUndefined();
    });

    it('should allow scheduled-warning-period of zero', () => {
      const params = TodoseqCodeBlockParser.parse(
        'search: tag:test\n scheduled-warning-period: 0',
      );
      expect(params.scheduledWarningPeriod).toBe(0);
      expect(params.error).toBeUndefined();
    });

    it('should reject scheduled-warning-period with negative value', () => {
      const params = TodoseqCodeBlockParser.parse(
        'search: tag:test\n scheduled-warning-period: -1',
      );
      expect(params.error).toBeDefined();
    });

    it('should parse deadline-warning-period option', () => {
      const params = TodoseqCodeBlockParser.parse(
        'search: tag:test\n deadline-warning-period: 5',
      );
      expect(params.deadlineWarningPeriod).toBe(5);
      expect(params.error).toBeUndefined();
    });

    it('should allow deadline-warning-period of zero', () => {
      const params = TodoseqCodeBlockParser.parse(
        'search: tag:test\n deadline-warning-period: 0',
      );
      expect(params.deadlineWarningPeriod).toBe(0);
      expect(params.error).toBeUndefined();
    });

    it('should reject deadline-warning-period with negative value', () => {
      const params = TodoseqCodeBlockParser.parse(
        'search: tag:test\n deadline-warning-period: -2',
      );
      expect(params.error).toBeDefined();
    });

    it('should parse skip-scheduled-warning-if-deadline option', () => {
      expect(
        TodoseqCodeBlockParser.parse(
          'search: tag:test\n skip-scheduled-warning-if-deadline: true',
        ).skipScheduledWarningIfDeadline,
      ).toBe(true);
      expect(
        TodoseqCodeBlockParser.parse(
          'search: tag:test\n skip-scheduled-warning-if-deadline: false',
        ).skipScheduledWarningIfDeadline,
      ).toBe(false);
      expect(
        TodoseqCodeBlockParser.parse('search: tag:test')
          .skipScheduledWarningIfDeadline,
      ).toBeUndefined();
    });

    it('should reject invalid skip-scheduled-warning-if-deadline values', () => {
      const params = TodoseqCodeBlockParser.parse(
        'search: tag:test\n skip-scheduled-warning-if-deadline: yes',
      );
      expect(params.error).toBeDefined();
    });

    it('should parse skip-deadline-warning-if-scheduled option', () => {
      expect(
        TodoseqCodeBlockParser.parse(
          'search: tag:test\n skip-deadline-warning-if-scheduled: true',
        ).skipDeadlineWarningIfScheduled,
      ).toBe(true);
      expect(
        TodoseqCodeBlockParser.parse(
          'search: tag:test\n skip-deadline-warning-if-scheduled: false',
        ).skipDeadlineWarningIfScheduled,
      ).toBe(false);
      expect(
        TodoseqCodeBlockParser.parse('search: tag:test')
          .skipDeadlineWarningIfScheduled,
      ).toBeUndefined();
    });

    it('should reject invalid skip-deadline-warning-if-scheduled values', () => {
      const params = TodoseqCodeBlockParser.parse(
        'search: tag:test\n skip-deadline-warning-if-scheduled: yes',
      );
      expect(params.error).toBeDefined();
    });

    it('should parse all warning period overrides together', () => {
      const source = [
        'search: tag:test',
        'upcoming-period: 14',
        'scheduled-warning-period: 3',
        'deadline-warning-period: 5',
        'skip-scheduled-warning-if-deadline: true',
        'skip-deadline-warning-if-scheduled: false',
      ].join('\n');
      const params = TodoseqCodeBlockParser.parse(source);
      expect(params.upcomingPeriod).toBe(14);
      expect(params.scheduledWarningPeriod).toBe(3);
      expect(params.deadlineWarningPeriod).toBe(5);
      expect(params.skipScheduledWarningIfDeadline).toBe(true);
      expect(params.skipDeadlineWarningIfScheduled).toBe(false);
      expect(params.error).toBeUndefined();
    });

    it('should leave warning period fields undefined when not specified', () => {
      const params = TodoseqCodeBlockParser.parse('search: tag:test');
      expect(params.upcomingPeriod).toBeUndefined();
      expect(params.scheduledWarningPeriod).toBeUndefined();
      expect(params.deadlineWarningPeriod).toBeUndefined();
      expect(params.skipScheduledWarningIfDeadline).toBeUndefined();
      expect(params.skipDeadlineWarningIfScheduled).toBeUndefined();
    });

    it('should validate collapse option requirements', () => {
      // Should NOT throw error when collapse=true without title or showQuery (showQuery is undefined)
      const source = 'search: tag:test\n collapse: true';
      const params = TodoseqCodeBlockParser.parse(source);
      expect(params.error).toBeUndefined();
      expect(params.collapse).toBe(true);

      // Should throw error when collapse=true with showQuery: false and no title
      const sourceWithHideQuery =
        'search: tag:test\n show-query: false\n collapse: true';
      const paramsWithHideQuery =
        TodoseqCodeBlockParser.parse(sourceWithHideQuery);
      expect(paramsWithHideQuery.error).not.toBeUndefined();

      // Should not throw error when collapse=true with title
      const sourceWithTitle =
        'search: tag:test\n title: My List\n collapse: true';
      const paramsWithTitle = TodoseqCodeBlockParser.parse(sourceWithTitle);
      expect(paramsWithTitle.error).toBeUndefined();
      expect(paramsWithTitle.collapse).toBe(true);
    });
  });

  describe('mightAffectCodeBlock() method', () => {
    it('should return true when no search query', () => {
      const source = 'sort: priority';
      const result = TodoseqCodeBlockParser.mightAffectCodeBlock(
        source,
        'test.md',
      );
      expect(result).toBe(true);
    });

    it('should return true when code block has parsing error', () => {
      const source = 'search: invalid syntax\n sort: invalid';
      const result = TodoseqCodeBlockParser.mightAffectCodeBlock(
        source,
        'test.md',
      );
      expect(result).toBe(true);
    });

    it('should check file: filter for matching file', () => {
      const source = 'search: file:test.md';
      expect(
        TodoseqCodeBlockParser.mightAffectCodeBlock(source, 'test.md'),
      ).toBe(true);
      expect(
        TodoseqCodeBlockParser.mightAffectCodeBlock(source, 'other.md'),
      ).toBe(false);
    });

    it('should check path: filter for matching file', () => {
      const source = 'search: path:folder/test.md';
      expect(
        TodoseqCodeBlockParser.mightAffectCodeBlock(source, 'folder/test.md'),
      ).toBe(true);
      expect(
        TodoseqCodeBlockParser.mightAffectCodeBlock(
          source,
          'other/folder/test.md',
        ),
      ).toBe(false);
    });

    it('should return true when no file-specific filters', () => {
      const source = 'search: tag:test';
      const result = TodoseqCodeBlockParser.mightAffectCodeBlock(
        source,
        'anyfile.md',
      );
      expect(result).toBe(true);
    });
  });

  describe('getSortMethod() method', () => {
    it('should map sort options to internal sort methods', () => {
      expect(
        TodoseqCodeBlockParser.getSortMethod({ sortMethod: 'default' }),
      ).toBe('default');
      expect(
        TodoseqCodeBlockParser.getSortMethod({ sortMethod: 'filepath' }),
      ).toBe('default');
      expect(
        TodoseqCodeBlockParser.getSortMethod({ sortMethod: 'scheduled' }),
      ).toBe('sortByScheduled');
      expect(
        TodoseqCodeBlockParser.getSortMethod({ sortMethod: 'deadline' }),
      ).toBe('sortByDeadline');
      expect(
        TodoseqCodeBlockParser.getSortMethod({ sortMethod: 'priority' }),
      ).toBe('sortByPriority');
      expect(
        TodoseqCodeBlockParser.getSortMethod({ sortMethod: 'urgency' }),
      ).toBe('sortByUrgency');
      expect(
        TodoseqCodeBlockParser.getSortMethod({ sortMethod: 'keyword' }),
      ).toBe('sortByKeyword');
      expect(
        TodoseqCodeBlockParser.getSortMethod({ sortMethod: 'closed' }),
      ).toBe('sortByClosedDate');
    });

    it('should return default for unknown sort method', () => {
      // @ts-ignore - testing with invalid sort method
      expect(
        TodoseqCodeBlockParser.getSortMethod({ sortMethod: 'invalid' }),
      ).toBe('default');
    });
  });

  describe('getCompletedSetting() method', () => {
    it('should map completed options to internal settings', () => {
      expect(TodoseqCodeBlockParser.getCompletedSetting(undefined)).toBe(
        'showAll',
      );
      expect(TodoseqCodeBlockParser.getCompletedSetting('show')).toBe(
        'showAll',
      );
      expect(TodoseqCodeBlockParser.getCompletedSetting('sort-to-end')).toBe(
        'sortToEnd',
      );
      expect(TodoseqCodeBlockParser.getCompletedSetting('hide')).toBe('hide');
    });
  });

  describe('getFutureSetting() method', () => {
    it('should map future options to internal settings', () => {
      expect(TodoseqCodeBlockParser.getFutureSetting(undefined)).toBe(
        'showAll',
      );
      expect(TodoseqCodeBlockParser.getFutureSetting('show-all')).toBe(
        'showAll',
      );
      expect(TodoseqCodeBlockParser.getFutureSetting('show-upcoming')).toBe(
        'showUpcoming',
      );
      expect(TodoseqCodeBlockParser.getFutureSetting('hide')).toBe(
        'hideFuture',
      );
      expect(TodoseqCodeBlockParser.getFutureSetting('sort-to-end')).toBe(
        'sortToEnd',
      );
    });
  });
});
