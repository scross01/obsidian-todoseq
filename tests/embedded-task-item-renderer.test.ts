/**
 * @jest-environment jsdom
 */

import { EmbeddedTaskItemRenderer } from '../src/view/embedded-task-list/embedded-task-item-renderer';
import { createBaseTask } from './helpers/test-helper';
import { installObsidianDomMocks } from './helpers/obsidian-dom-mock';

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
  });
});
