/**
 * @jest-environment jsdom
 */

import { EmbeddedTaskItemRenderer } from '../src/view/embedded-task-list/embedded-task-item-renderer';
import { createBaseTask } from './helpers/test-helper';
import { installObsidianDomMocks } from './helpers/obsidian-dom-mock';

/**
 * Update `renderer.plugin.keywordManager.getSettings` to a specific
 * warning-period settings object for the duration of a single test.
 * Must be called *after* the `beforeEach` setup (so `renderer` exists).
 */
function mockPluginKeywordSettings(renderer: any, settings: object) {
  renderer.plugin.keywordManager.getSettings.mockReturnValue({
    useExtendedCheckboxStyles: false,
    ...settings,
  });
}

describe('EmbeddedTaskItemRenderer', () => {
  let renderer: any;

  beforeAll(() => {
    installObsidianDomMocks();
  });

  beforeEach(() => {
    const mockPlugin = {
      keywordManager: {
        getSettings: jest
          .fn()
          .mockReturnValue({ useExtendedCheckboxStyles: false }),
        getCheckboxState: jest.fn().mockReturnValue(' '),
        isActive: jest.fn().mockReturnValue(false),
        isCompleted: jest.fn().mockReturnValue(false),
      },
      taskStateManager: {
        findTaskByPathAndLine: jest.fn(),
      },
      taskUpdateCoordinator: {},
      settings: { stateTransitions: {} },
      app: {},
    };
    const mockMenuBuilder = {};
    const mockContextMenu = {};

    renderer = new (EmbeddedTaskItemRenderer as any)(
      mockPlugin,
      mockMenuBuilder,
      mockContextMenu,
    );
  });

  describe('getDateCategory', () => {
    it('returns none when no dates are set', () => {
      const task = createBaseTask({ scheduledDate: null, deadlineDate: null });
      const result = renderer.getDateCategory(task);
      expect(result).toBe('none');
    });

    it('returns overdue when scheduled date is in the past', () => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 1);
      const task = createBaseTask({
        scheduledDate: pastDate,
        deadlineDate: null,
      });
      const result = renderer.getDateCategory(task);
      expect(result).toBe('overdue');
    });

    it('returns today when scheduled date is today', () => {
      const today = new Date();
      const task = createBaseTask({ scheduledDate: today, deadlineDate: null });
      const result = renderer.getDateCategory(task);
      expect(result).toBe('today');
    });

    it('returns soon when date is within 7 days', () => {
      const soon = new Date();
      soon.setDate(soon.getDate() + 3);
      const task = createBaseTask({ scheduledDate: soon, deadlineDate: null });
      const result = renderer.getDateCategory(task);
      expect(result).toBe('soon');
    });

    it('returns later when date is more than 7 days away', () => {
      const later = new Date();
      later.setDate(later.getDate() + 14);
      const task = createBaseTask({ scheduledDate: later, deadlineDate: null });
      const result = renderer.getDateCategory(task);
      expect(result).toBe('later');
    });

    it('uses deadline date when scheduled is null', () => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 2);
      const task = createBaseTask({
        scheduledDate: null,
        deadlineDate: pastDate,
      });
      const result = renderer.getDateCategory(task);
      expect(result).toBe('overdue');
    });

    it('uses earlier date when both scheduled and deadline are set', () => {
      const scheduled = new Date();
      scheduled.setDate(scheduled.getDate() + 10);
      const deadline = new Date();
      deadline.setDate(deadline.getDate() + 3);
      const task = createBaseTask({
        scheduledDate: scheduled,
        deadlineDate: deadline,
      });
      const result = renderer.getDateCategory(task);
      expect(result).toBe('soon');
    });

    it('returns category based on dates regardless of completion', () => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 1);
      const task = createBaseTask({
        scheduledDate: pastDate,
        deadlineDate: null,
        completed: true,
      });
      const result = renderer.getDateCategory(task);
      // getDateCategory does not check completed; caller does
      expect(result).toBe('overdue');
    });
  });

  describe('getDateOnly', () => {
    it('strips time from a date', () => {
      const date = new Date(2026, 5, 15, 14, 30, 45);
      const result = renderer.getDateOnly(date);
      expect(result.getHours()).toBe(0);
      expect(result.getMinutes()).toBe(0);
      expect(result.getSeconds()).toBe(0);
      expect(result.getMilliseconds()).toBe(0);
    });
  });

  describe('buildDateBadge', () => {
    it('creates a date badge element with icon and formatted date', () => {
      const parent = document.createElement('div');
      const date = new Date(2026, 5, 15);
      renderer.buildDateBadge(date, 'calendar', parent);

      const badge = parent.querySelector('.todoseq-embedded-task-date-badge');
      expect(badge).toBeTruthy();
    });
  });

  describe('buildDateInfoRow', () => {
    it('creates a date info row with label and value', () => {
      const parent = document.createElement('div');
      const date = new Date(2026, 5, 15);
      renderer.buildDateInfoRow('Scheduled', date, parent);

      const row = parent.querySelector('.todoseq-embedded-task-date-info');
      expect(row).toBeTruthy();
      const label = row?.querySelector(
        '.todoseq-embedded-task-date-info-label',
      );
      expect(label?.textContent).toBe('Scheduled: ');
      const value = row?.querySelector(
        '.todoseq-embedded-task-date-info-value',
      );
      expect(value).toBeTruthy();
    });

    it('applies extra class when provided', () => {
      const parent = document.createElement('div');
      const date = new Date(2026, 5, 15);
      renderer.buildDateInfoRow('Deadline', date, parent, 'custom-class');

      const row = parent.querySelector('.todoseq-embedded-task-date-info');
      expect(row?.classList.contains('custom-class')).toBe(true);
    });
  });

  describe('buildInlineDateBadge', () => {
    it('shows scheduled date badge when enabled', () => {
      const parent = document.createElement('div');
      const task = createBaseTask({
        scheduledDate: new Date(2026, 5, 15),
        completed: false,
      });
      renderer.buildInlineDateBadge(task, { showScheduledDate: true }, parent);

      const badge = parent.querySelector('.todoseq-embedded-task-date-badge');
      expect(badge).toBeTruthy();
    });

    it('shows deadline date badge when enabled', () => {
      const parent = document.createElement('div');
      const task = createBaseTask({
        deadlineDate: new Date(2026, 5, 15),
        completed: false,
      });
      renderer.buildInlineDateBadge(task, { showDeadlineDate: true }, parent);

      const badge = parent.querySelector('.todoseq-embedded-task-date-badge');
      expect(badge).toBeTruthy();
    });

    it('shows closed date badge for completed tasks when enabled', () => {
      const parent = document.createElement('div');
      const task = createBaseTask({
        closedDate: new Date(2026, 5, 15),
        completed: true,
      });
      renderer.buildInlineDateBadge(task, { showClosedDate: true }, parent);

      const badge = parent.querySelector('.todoseq-embedded-task-date-badge');
      expect(badge).toBeTruthy();
    });

    it('does not show badges when flags are false', () => {
      const parent = document.createElement('div');
      const task = createBaseTask({
        scheduledDate: new Date(2026, 5, 15),
        completed: false,
      });
      renderer.buildInlineDateBadge(
        task,
        {
          showScheduledDate: false,
          showDeadlineDate: false,
          showClosedDate: false,
        },
        parent,
      );

      const badge = parent.querySelector('.todoseq-embedded-task-date-badge');
      expect(badge).toBeFalsy();
    });
  });

  describe('buildWrapDateInfoRows', () => {
    it('shows scheduled date info row when enabled', () => {
      const parent = document.createElement('div');
      const task = createBaseTask({
        scheduledDate: new Date(2026, 5, 15),
        completed: false,
      });
      renderer.buildWrapDateInfoRows(task, { showScheduledDate: true }, parent);

      const row = parent.querySelector('.todoseq-embedded-task-date-info');
      expect(row).toBeTruthy();
    });

    it('shows deadline date info row when enabled', () => {
      const parent = document.createElement('div');
      const task = createBaseTask({
        deadlineDate: new Date(2026, 5, 15),
        completed: false,
      });
      renderer.buildWrapDateInfoRows(task, { showDeadlineDate: true }, parent);

      const row = parent.querySelector('.todoseq-embedded-task-date-info');
      expect(row).toBeTruthy();
    });

    it('shows closed date info row for completed tasks when enabled', () => {
      const parent = document.createElement('div');
      const task = createBaseTask({
        closedDate: new Date(2026, 5, 15),
        completed: true,
      });
      renderer.buildWrapDateInfoRows(task, { showClosedDate: true }, parent);

      const row = parent.querySelector('.todoseq-embedded-task-date-info');
      expect(row).toBeTruthy();
    });

    it('applies extra class to rows when provided', () => {
      const parent = document.createElement('div');
      const task = createBaseTask({
        scheduledDate: new Date(2026, 5, 15),
        completed: false,
      });
      renderer.buildWrapDateInfoRows(
        task,
        { showScheduledDate: true },
        parent,
        'dynamic-wrap',
      );

      const row = parent.querySelector('.todoseq-embedded-task-date-info');
      expect(row?.classList.contains('dynamic-wrap')).toBe(true);
    });
  });

  describe('buildRepeatIcon', () => {
    it('creates repeat icon for scheduled date repeat', () => {
      const parent = document.createElement('div');
      const task = createBaseTask({
        scheduledDateRepeat: { raw: '+1w', type: 'weekly' },
      });
      renderer.buildRepeatIcon(task, parent);

      const icon = parent.querySelector('.todoseq-task-date-repeat-icon');
      expect(icon).toBeTruthy();
    });

    it('creates repeat icon for deadline date repeat', () => {
      const parent = document.createElement('div');
      const task = createBaseTask({
        deadlineDateRepeat: { raw: '+3d', type: 'daily' },
      });
      renderer.buildRepeatIcon(task, parent);

      const icon = parent.querySelector('.todoseq-task-date-repeat-icon');
      expect(icon).toBeTruthy();
    });

    it('does nothing when no repeat info exists', () => {
      const parent = document.createElement('div');
      const task = createBaseTask();
      renderer.buildRepeatIcon(task, parent);

      const icon = parent.querySelector('.todoseq-task-date-repeat-icon');
      expect(icon).toBeFalsy();
    });

    it('uses scheduled repeat over deadline repeat when both exist', () => {
      const parent = document.createElement('div');
      const task = createBaseTask({
        scheduledDateRepeat: { raw: '+1w', type: 'weekly' },
        deadlineDateRepeat: { raw: '+3d', type: 'daily' },
      });
      renderer.buildRepeatIcon(task, parent);

      const icon = parent.querySelector('.todoseq-task-date-repeat-icon');
      expect(icon).toBeTruthy();
    });
  });

  describe('hasStandaloneWarning', () => {
    it('returns true when scheduled has warning but showScheduledDate is false', () => {
      mockPluginKeywordSettings(renderer, {});
      const task = createBaseTask({
        scheduledDate: new Date(2026, 5, 15),
        scheduledWarningPeriod: {
          value: 3,
          unit: 'd',
          isFirstOnly: false,
        },
        completed: false,
      });
      expect(
        renderer.hasStandaloneWarning(task, {
          showScheduledDate: false,
          showDeadlineDate: false,
          showClosedDate: false,
        }),
      ).toBe(true);
    });

    it('returns false when showScheduledDate is true (arrow shown next to date)', () => {
      mockPluginKeywordSettings(renderer, {});
      const task = createBaseTask({
        scheduledDate: new Date(2026, 5, 15),
        scheduledWarningPeriod: {
          value: 3,
          unit: 'd',
          isFirstOnly: false,
        },
        completed: false,
      });
      expect(
        renderer.hasStandaloneWarning(task, {
          showScheduledDate: true,
          showDeadlineDate: false,
          showClosedDate: false,
        }),
      ).toBe(false);
    });

    it('returns false when task has no warning period', () => {
      mockPluginKeywordSettings(renderer, {});
      const task = createBaseTask({
        scheduledDate: new Date(2026, 5, 15),
        deadlineDate: new Date(2026, 5, 20),
        completed: false,
      });
      expect(
        renderer.hasStandaloneWarning(task, {
          showScheduledDate: false,
          showDeadlineDate: false,
          showClosedDate: false,
        }),
      ).toBe(false);
    });

    it('returns false when task is completed', () => {
      mockPluginKeywordSettings(renderer, {});
      const task = createBaseTask({
        scheduledDate: new Date(2026, 5, 15),
        scheduledWarningPeriod: {
          value: 3,
          unit: 'd',
          isFirstOnly: false,
        },
        completed: true,
      });
      expect(
        renderer.hasStandaloneWarning(task, {
          showScheduledDate: false,
          showDeadlineDate: false,
          showClosedDate: false,
        }),
      ).toBe(false);
    });

    it('returns true on global default when task has no per-task warning period', () => {
      mockPluginKeywordSettings(renderer, { defaultDeadlineWarningPeriod: 5 });
      const task = createBaseTask({
        deadlineDate: new Date(2026, 5, 20),
        deadlineWarningPeriod: null,
        completed: false,
      });
      expect(
        renderer.hasStandaloneWarning(task, {
          showScheduledDate: false,
          showDeadlineDate: false,
          showClosedDate: false,
        }),
      ).toBe(true);
    });
  });

  describe('buildWarningIndicators', () => {
    it('renders scheduled arrow (→) as standalone when date is hidden', () => {
      mockPluginKeywordSettings(renderer, {});
      const task = createBaseTask({
        scheduledDate: new Date(2026, 5, 15),
        scheduledWarningPeriod: {
          value: 3,
          unit: 'd',
          isFirstOnly: false,
        },
        completed: false,
      });
      const parent = document.createElement('div');
      renderer.buildWarningIndicators(
        task,
        {
          showScheduledDate: false,
          showDeadlineDate: false,
          showClosedDate: false,
        },
        parent,
      );

      const arrow = parent.querySelector(
        '.todoseq-embedded-task-warning-arrow',
      );
      expect(arrow).toBeTruthy();
      expect(arrow?.textContent).toBe('→');
    });

    it('renders deadline arrow (←) as standalone when date is hidden', () => {
      mockPluginKeywordSettings(renderer, {});
      const task = createBaseTask({
        deadlineDate: new Date(2026, 5, 20),
        deadlineWarningPeriod: {
          value: 5,
          unit: 'd',
          isFirstOnly: false,
        },
        completed: false,
      });
      const parent = document.createElement('div');
      renderer.buildWarningIndicators(
        task,
        {
          showScheduledDate: false,
          showDeadlineDate: false,
          showClosedDate: false,
        },
        parent,
      );

      const arrows = parent.querySelectorAll(
        '.todoseq-embedded-task-warning-arrow',
      );
      expect(arrows.length).toBe(1);
      expect(arrows[0]?.textContent).toBe('←');
    });

    it('renders both scheduled and deadline arrows when both are hidden', () => {
      mockPluginKeywordSettings(renderer, {});
      const task = createBaseTask({
        scheduledDate: new Date(2026, 5, 15),
        scheduledWarningPeriod: {
          value: 3,
          unit: 'd',
          isFirstOnly: false,
        },
        deadlineDate: new Date(2026, 5, 20),
        deadlineWarningPeriod: {
          value: 5,
          unit: 'd',
          isFirstOnly: false,
        },
        completed: false,
      });
      const parent = document.createElement('div');
      renderer.buildWarningIndicators(
        task,
        {
          showScheduledDate: false,
          showDeadlineDate: false,
          showClosedDate: false,
        },
        parent,
      );

      const arrows = Array.from(
        parent.querySelectorAll('.todoseq-embedded-task-warning-arrow'),
      ).map((el) => el.textContent);
      expect(arrows).toEqual(['→', '←']);
    });

    it('does NOT render standalone arrow when showScheduledDate is true', () => {
      mockPluginKeywordSettings(renderer, {});
      const task = createBaseTask({
        scheduledDate: new Date(2026, 5, 15),
        scheduledWarningPeriod: {
          value: 3,
          unit: 'd',
          isFirstOnly: false,
        },
        completed: false,
      });
      const parent = document.createElement('div');
      renderer.buildWarningIndicators(
        task,
        {
          showScheduledDate: true,
          showDeadlineDate: false,
          showClosedDate: false,
        },
        parent,
      );

      expect(
        parent.querySelector('.todoseq-embedded-task-warning-arrow'),
      ).toBeFalsy();
    });

    it('does NOT render anything when task is completed', () => {
      mockPluginKeywordSettings(renderer, {});
      const task = createBaseTask({
        scheduledDate: new Date(2026, 5, 15),
        scheduledWarningPeriod: {
          value: 3,
          unit: 'd',
          isFirstOnly: false,
        },
        completed: true,
      });
      const parent = document.createElement('div');
      renderer.buildWarningIndicators(
        task,
        {
          showScheduledDate: false,
          showDeadlineDate: false,
          showClosedDate: false,
        },
        parent,
      );

      expect(
        parent.querySelector('.todoseq-embedded-task-warning-arrow'),
      ).toBeFalsy();
    });

    it('does NOT render when warningDays is 0', () => {
      mockPluginKeywordSettings(renderer, {});
      const task = createBaseTask({
        scheduledDate: new Date(2026, 5, 15),
        scheduledWarningPeriod: {
          value: 0,
          unit: 'd',
          isFirstOnly: false,
        },
        completed: false,
      });
      const parent = document.createElement('div');
      renderer.buildWarningIndicators(
        task,
        {
          showScheduledDate: false,
          showDeadlineDate: false,
          showClosedDate: false,
        },
        parent,
      );

      expect(
        parent.querySelector('.todoseq-embedded-task-warning-arrow'),
      ).toBeFalsy();
    });
  });

  describe('renderTaskTextWithLinks', () => {
    it('renders plain text without links', () => {
      const parent = document.createElement('span');
      const task = createBaseTask({ text: 'Plain task text' });
      renderer.renderTaskTextWithLinks(task, parent);

      expect(parent.textContent).toBe('Plain task text');
    });

    it('renders wiki links as clickable spans', () => {
      const parent = document.createElement('span');
      const task = createBaseTask({ text: 'See [[Some Page]] for details' });
      renderer.renderTaskTextWithLinks(task, parent);

      const linkSpan = parent.querySelector('.embedded-task-link-like');
      expect(linkSpan).toBeTruthy();
      expect(linkSpan?.textContent).toBe('Some Page');
    });

    it('renders markdown links as clickable spans', () => {
      const parent = document.createElement('span');
      const task = createBaseTask({
        text: 'Check [label](https://example.com)',
      });
      renderer.renderTaskTextWithLinks(task, parent);

      const linkSpan = parent.querySelector('.embedded-task-link-like');
      expect(linkSpan).toBeTruthy();
      expect(linkSpan?.textContent).toBe('label');
    });

    it('renders URLs as clickable spans', () => {
      const parent = document.createElement('span');
      const task = createBaseTask({ text: 'Visit https://example.com today' });
      renderer.renderTaskTextWithLinks(task, parent);

      const linkSpan = parent.querySelector('.embedded-task-link-like');
      expect(linkSpan).toBeTruthy();
    });

    it('renders tags with special styling', () => {
      const parent = document.createElement('span');
      const task = createBaseTask({ text: 'Task with #tag' });
      renderer.renderTaskTextWithLinks(task, parent);

      const tagSpan = parent.querySelector('.todoseq-embedded-task-tag');
      expect(tagSpan).toBeTruthy();
      expect(tagSpan?.textContent).toBe('#tag');
    });

    it('handles text with no special content', () => {
      const parent = document.createElement('span');
      const task = createBaseTask({ text: 'Simple text' });
      renderer.renderTaskTextWithLinks(task, parent);

      expect(parent.querySelector('.todoseq-embedded-task-tag')).toBeFalsy();
      expect(parent.querySelector('.embedded-task-link-like')).toBeFalsy();
      expect(parent.textContent).toBe('Simple text');
    });
  });

  describe('createTaskListItem', () => {
    it('creates a list item with correct classes', () => {
      const task = createBaseTask({
        path: 'test.md',
        line: 5,
        completed: false,
      });
      const li = renderer.createTaskListItem(task, 0, {});

      expect(li.tagName.toLowerCase()).toBe('li');
      expect(li.classList.contains('todoseq-embedded-task-item')).toBe(true);
    });

    it('sets data attributes on list item', () => {
      const task = createBaseTask({
        path: 'test.md',
        line: 5,
        completed: false,
      });
      const li = renderer.createTaskListItem(task, 0, {});

      expect(li.getAttribute('data-path')).toBe('test.md');
      expect(li.getAttribute('data-line')).toBe('5');
      expect(li.getAttribute('data-index')).toBe('0');
    });

    it('creates checkbox element', () => {
      const task = createBaseTask({ completed: false, state: 'TODO' });
      const li = renderer.createTaskListItem(task, 0, {});

      const checkbox = li.querySelector('input[type="checkbox"]');
      expect(checkbox).toBeTruthy();
    });

    it('sets date category class for overdue tasks', () => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 1);
      const task = createBaseTask({
        scheduledDate: pastDate,
        completed: false,
      });
      const li = renderer.createTaskListItem(task, 0, {});

      expect(
        li.classList.contains('todoseq-embedded-task-item-date-overdue'),
      ).toBe(true);
    });

    it('does not set date category class for completed tasks', () => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 1);
      const task = createBaseTask({
        scheduledDate: pastDate,
        completed: true,
      });
      const li = renderer.createTaskListItem(task, 0, {});

      expect(
        li.classList.contains('todoseq-embedded-task-item-date-overdue'),
      ).toBe(false);
    });

    it('renders standalone scheduled arrow with default (no-show) settings', () => {
      mockPluginKeywordSettings(renderer, {});
      const task = createBaseTask({
        scheduledDate: new Date(2026, 5, 15),
        scheduledWarningPeriod: {
          value: 3,
          unit: 'd',
          isFirstOnly: false,
        },
        completed: false,
      });
      const li = renderer.createTaskListItem(task, 0, {});

      expect(
        li.querySelector('.todoseq-embedded-task-warning-arrow'),
      ).toBeTruthy();
    });

    it('renders standalone deadline arrow with default (no-show) settings', () => {
      mockPluginKeywordSettings(renderer, {});
      const task = createBaseTask({
        deadlineDate: new Date(2026, 5, 20),
        deadlineWarningPeriod: {
          value: 5,
          unit: 'd',
          isFirstOnly: false,
        },
        completed: false,
      });
      const li = renderer.createTaskListItem(task, 0, {});

      expect(
        li.querySelector('.todoseq-embedded-task-warning-arrow'),
      ).toBeTruthy();
    });

    it('renders warning arrows in floating indicators when in wrap mode', () => {
      mockPluginKeywordSettings(renderer, {});
      const task = createBaseTask({
        scheduledDate: new Date(2026, 5, 15),
        scheduledWarningPeriod: {
          value: 3,
          unit: 'd',
          isFirstOnly: false,
        },
        completed: false,
      });
      const li = renderer.createTaskListItem(task, 0, { wrapContent: true });

      const floating = li.querySelector(
        '.todoseq-embedded-task-floating-indicators',
      );
      expect(floating).toBeTruthy();
      expect(
        floating?.querySelector('.todoseq-embedded-task-warning-arrow'),
      ).toBeTruthy();
    });

    describe('row date tooltip', () => {
      it('sets title on textContainer with scheduled date when show-scheduled-date is false (truncate mode)', () => {
        const task = createBaseTask({
          scheduledDate: new Date(2026, 5, 15),
          completed: false,
        });
        const li = renderer.createTaskListItem(task, 0, {
          wrapContent: false,
          showScheduledDate: false,
          showDeadlineDate: false,
        });

        const textContainer = li.querySelector(
          '.todoseq-embedded-task-text-container',
        );
        const title = textContainer?.getAttribute('title');
        expect(title?.startsWith('Scheduled:')).toBe(true);
        // Tooltip should NOT leak to the <li> root to avoid overlap with
        // sibling element tooltips (file info, urgency, etc.).
        expect(li.getAttribute('title')).toBeNull();
      });

      it('sets title on textContainer with deadline date when show-deadline-date is false (truncate mode)', () => {
        const task = createBaseTask({
          deadlineDate: new Date(2026, 5, 20),
          completed: false,
        });
        const li = renderer.createTaskListItem(task, 0, {
          wrapContent: false,
          showScheduledDate: false,
          showDeadlineDate: false,
        });

        const textContainer = li.querySelector(
          '.todoseq-embedded-task-text-container',
        );
        const title = textContainer?.getAttribute('title');
        expect(title?.startsWith('Deadline:')).toBe(true);
      });

      it('sets title with both dates when both show flags are false (truncate mode)', () => {
        const task = createBaseTask({
          scheduledDate: new Date(2026, 5, 15),
          deadlineDate: new Date(2026, 5, 20),
          completed: false,
        });
        const li = renderer.createTaskListItem(task, 0, {
          wrapContent: false,
          showScheduledDate: false,
          showDeadlineDate: false,
        });

        const textContainer = li.querySelector(
          '.todoseq-embedded-task-text-container',
        );
        const title = textContainer?.getAttribute('title');
        expect(title?.includes('Scheduled:')).toBe(true);
        expect(title?.includes('Deadline:')).toBe(true);
      });

      it('still sets title when show flags are true (consolidation, truncate mode)', () => {
        const task = createBaseTask({
          scheduledDate: new Date(2026, 5, 15),
          deadlineDate: new Date(2026, 5, 20),
          completed: false,
        });
        const li = renderer.createTaskListItem(task, 0, {
          wrapContent: false,
          showScheduledDate: true,
          showDeadlineDate: true,
        });

        const textContainer = li.querySelector(
          '.todoseq-embedded-task-text-container',
        );
        const title = textContainer?.getAttribute('title');
        expect(title?.includes('Scheduled:')).toBe(true);
        expect(title?.includes('Deadline:')).toBe(true);
      });

      it('sets title on contentWrapper in wrap mode without show flags', () => {
        const task = createBaseTask({
          scheduledDate: new Date(2026, 5, 15),
          deadlineDate: new Date(2026, 5, 20),
          completed: false,
        });
        const li = renderer.createTaskListItem(task, 0, { wrapContent: true });

        const contentWrapper = li.querySelector(
          '.todoseq-embedded-task-content-wrapper',
        );
        const title = contentWrapper?.getAttribute('title');
        expect(title?.includes('Scheduled:')).toBe(true);
        expect(title?.includes('Deadline:')).toBe(true);
        expect(li.getAttribute('title')).toBeNull();
      });

      it('sets title on contentWrapper in dynamic mode without show flags', () => {
        const task = createBaseTask({
          scheduledDate: new Date(2026, 5, 15),
          completed: false,
        });
        const li = renderer.createTaskListItem(task, 0, {});

        const contentWrapper = li.querySelector(
          '.todoseq-embedded-task-content-wrapper',
        );
        const title = contentWrapper?.getAttribute('title');
        expect(title?.startsWith('Scheduled:')).toBe(true);
        expect(li.getAttribute('title')).toBeNull();
      });

      it('dynamic mode with both show flags: title on contentWrapper only, not textContainer', () => {
        const task = createBaseTask({
          scheduledDate: new Date(2026, 5, 15),
          deadlineDate: new Date(2026, 5, 20),
          completed: false,
        });
        const li = renderer.createTaskListItem(task, 0, {
          showScheduledDate: true,
          showDeadlineDate: true,
        });

        const contentWrapper = li.querySelector(
          '.todoseq-embedded-task-content-wrapper',
        );
        const textContainer = li.querySelector(
          '.todoseq-embedded-task-text-container',
        );
        expect(contentWrapper?.getAttribute('title')).toContain('Scheduled:');
        expect(contentWrapper?.getAttribute('title')).toContain('Deadline:');
        // Consolidation: tooltip should NOT also be on textContainer, to
        // avoid duplicate floating UIs in real Obsidian.
        expect(textContainer?.getAttribute('title')).toBeNull();
        expect(li.getAttribute('title')).toBeNull();
      });

      it('does NOT set the row tooltip when task has no dates (truncate mode)', () => {
        const task = createBaseTask({ completed: false });
        const li = renderer.createTaskListItem(task, 0, {
          wrapContent: false,
        });

        const textContainer = li.querySelector(
          '.todoseq-embedded-task-text-container',
        );
        expect(textContainer?.getAttribute('title')).toBeNull();
        expect(li.getAttribute('title')).toBeNull();
      });

      it('does NOT set the row tooltip when task has no dates (dynamic mode)', () => {
        const task = createBaseTask({ completed: false });
        const li = renderer.createTaskListItem(task, 0, {});

        const contentWrapper = li.querySelector(
          '.todoseq-embedded-task-content-wrapper',
        );
        expect(contentWrapper?.getAttribute('title')).toBeNull();
        expect(li.getAttribute('title')).toBeNull();
      });

      it('does NOT set the row tooltip for completed tasks (even with closed date)', () => {
        const task = createBaseTask({
          scheduledDate: new Date(2026, 5, 15),
          deadlineDate: new Date(2026, 5, 20),
          closedDate: new Date(2026, 5, 21),
          completed: true,
        });
        const li = renderer.createTaskListItem(task, 0, {});

        expect(li.getAttribute('title')).toBeNull();
        const anyTooltipHost = li.querySelector(
          '[title^="Scheduled:"], [title^="Deadline:"]',
        );
        expect(anyTooltipHost).toBeFalsy();
      });
    });
  });
});
