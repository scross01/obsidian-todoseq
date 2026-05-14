/**
 * @jest-environment jsdom
 */

import {
  DatePicker,
  DatePickerCallbacks,
  DatePickerConfig,
} from '../src/view/components/date-picker-menu';
import { installObsidianDomMocks } from './helpers/obsidian-dom-mock';

// Install Obsidian-style DOM extensions on HTMLElement prototype
beforeAll(() => {
  installObsidianDomMocks();
});

// Mock obsidian module
jest.mock('obsidian', () => ({
  setIcon: jest.fn(),
  Notice: jest.fn(),
  Platform: {
    isMobile: false,
  },
}));

// Mock isPhoneDevice to control phone detection in tests
let mockIsPhoneDevice = false;
jest.mock('../src/utils/mobile-utils', () => ({
  isPhoneDevice: () => mockIsPhoneDevice,
  TABLET_BREAKPOINT: 768,
}));

describe('DatePicker', () => {
  let picker: DatePicker;
  let callbacks: DatePickerCallbacks;
  let config: DatePickerConfig;

  beforeEach(() => {
    HTMLElement.prototype.scrollIntoView = jest.fn();

    activeDocument.body.innerHTML = '';

    callbacks = {
      onDateSelected: jest.fn(),
    };

    config = {
      weekStartsOn: 'Monday',
    };

    picker = new DatePicker(callbacks, config);
  });

  afterEach(() => {
    picker.cleanup();
    jest.restoreAllMocks();
  });

  describe('show/hide lifecycle', () => {
    it('should not be visible initially', () => {
      expect(picker.isVisible()).toBe(false);
    });

    it('should be visible after show()', async () => {
      await picker.show({ x: 100, y: 100 });
      expect(picker.isVisible()).toBe(true);
    });

    it('should not be visible after hide()', async () => {
      await picker.show({ x: 100, y: 100 });
      picker.hide();
      expect(picker.isVisible()).toBe(false);
    });

    it('should create a container element in DOM', async () => {
      await picker.show({ x: 100, y: 100 });
      const container = activeDocument.querySelector('.todoseq-date-picker');
      expect(container).not.toBeNull();
    });

    it('should remove container element from DOM on hide', async () => {
      await picker.show({ x: 100, y: 100 });
      picker.hide();
      const container = activeDocument.querySelector('.todoseq-date-picker');
      expect(container).toBeNull();
    });

    it('should set role=menu on container', async () => {
      await picker.show({ x: 100, y: 100 });
      const container = activeDocument.querySelector('.todoseq-date-picker');
      expect(container?.getAttribute('role')).toBe('menu');
    });
  });

  describe('phone-centered positioning', () => {
    let originalInnerWidth: number;
    let originalInnerHeight: number;

    beforeEach(() => {
      // Store original values
      originalInnerWidth = window.innerWidth;
      originalInnerHeight = window.innerHeight;
    });

    afterEach(() => {
      // Restore original values
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: originalInnerWidth,
      });
      Object.defineProperty(window, 'innerHeight', {
        writable: true,
        configurable: true,
        value: originalInnerHeight,
      });
      // Reset isPhoneDevice mock to default (desktop)
      mockIsPhoneDevice = false;
    });

    it('should position at cursor on desktop (not mobile)', async () => {
      // Simulate desktop environment
      mockIsPhoneDevice = false;
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 1920,
      });
      Object.defineProperty(window, 'innerHeight', {
        writable: true,
        configurable: true,
        value: 1080,
      });

      await picker.show({ x: 100, y: 100 });
      const container = activeDocument.querySelector(
        '.todoseq-date-picker',
      ) as HTMLElement;

      // Picker should be at cursor position
      expect(parseFloat(container.style.left)).toBe(100);
      expect(parseFloat(container.style.top)).toBe(100);
    });

    it('should position at cursor on tablet (mobile + large viewport)', async () => {
      // Simulate tablet environment
      mockIsPhoneDevice = false;
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 768, // iPad Mini width (at breakpoint)
      });
      Object.defineProperty(window, 'innerHeight', {
        writable: true,
        configurable: true,
        value: 1024,
      });

      await picker.show({ x: 100, y: 100 });
      const container = activeDocument.querySelector(
        '.todoseq-date-picker',
      ) as HTMLElement;

      // Picker should be at cursor position (not centered, as viewport > 768px)
      expect(parseFloat(container.style.left)).toBe(100);
      expect(parseFloat(container.style.top)).toBe(100);
    });

    it('should handle viewport bounds on desktop when picker would overflow right', async () => {
      mockIsPhoneDevice = false;
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 400,
      });
      Object.defineProperty(window, 'innerHeight', {
        writable: true,
        configurable: true,
        value: 500,
      });

      // Position near right edge
      await picker.show({ x: 350, y: 100 });
      const container = activeDocument.querySelector(
        '.todoseq-date-picker',
      ) as HTMLElement;

      // Picker should be adjusted to stay within viewport: 400 - 320 - 8 = 72
      expect(parseFloat(container.style.left)).toBe(72);
    });

    it('should handle viewport bounds on desktop when picker would overflow bottom', async () => {
      mockIsPhoneDevice = false;
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 500,
      });
      Object.defineProperty(window, 'innerHeight', {
        writable: true,
        configurable: true,
        value: 400,
      });

      // Position near bottom edge
      await picker.show({ x: 100, y: 350 });
      const container = activeDocument.querySelector(
        '.todoseq-date-picker',
      ) as HTMLElement;

      // Picker should be adjusted to stay within viewport with minimum 8px margin
      const top = parseFloat(container.style.top);
      expect(top).toBeGreaterThanOrEqual(8);
      const rect = container.getBoundingClientRect();
      expect(top + rect.height).toBeLessThanOrEqual(400 - 8);
    });
  });

  describe('header section', () => {
    it('should show "Scheduled Date" header in scheduled mode', async () => {
      await picker.show({ x: 100, y: 100 }, 'scheduled');
      const header = activeDocument.querySelector(
        '.todoseq-date-picker-header',
      );
      expect(header?.textContent).toBe('Scheduled Date');
    });

    it('should show "Deadline Date" header in deadline mode', async () => {
      await picker.show({ x: 100, y: 100 }, 'deadline');
      const header = activeDocument.querySelector(
        '.todoseq-date-picker-header',
      );
      expect(header?.textContent).toBe('Deadline Date');
    });
  });

  describe('quick select section', () => {
    it('should render 4 quick select options', async () => {
      await picker.show({ x: 100, y: 100 });
      const rows = activeDocument.querySelectorAll(
        '.todoseq-date-picker-quick-select-row',
      );
      expect(rows.length).toBe(4);
    });

    it('should have correct labels for quick select options', async () => {
      await picker.show({ x: 100, y: 100 });
      const labels = activeDocument.querySelectorAll(
        '.todoseq-date-picker-quick-select-label',
      );
      const labelTexts = Array.from(labels).map((el) => el.textContent);
      expect(labelTexts).toEqual([
        'Today',
        'Tomorrow',
        'Next weekend',
        'Next week',
      ]);
    });

    it('should invoke callback with today date when "Today" is clicked', async () => {
      await picker.show({ x: 100, y: 100 });
      const todayRow = activeDocument.querySelectorAll(
        '.todoseq-date-picker-quick-select-row',
      )[0] as HTMLElement;
      todayRow.click();

      expect(callbacks.onDateSelected).toHaveBeenCalledTimes(1);
      const calledDate = (callbacks.onDateSelected as jest.Mock).mock
        .calls[0][0] as Date;
      const today = new Date();
      expect(calledDate.getFullYear()).toBe(today.getFullYear());
      expect(calledDate.getMonth()).toBe(today.getMonth());
      expect(calledDate.getDate()).toBe(today.getDate());
      expect(calledDate.getHours()).toBe(0);
      expect(calledDate.getMinutes()).toBe(0);
    });

    it('should invoke callback with tomorrow date when "Tomorrow" is clicked', async () => {
      await picker.show({ x: 100, y: 100 });
      const tomorrowRow = activeDocument.querySelectorAll(
        '.todoseq-date-picker-quick-select-row',
      )[1] as HTMLElement;
      tomorrowRow.click();

      const calledDate = (callbacks.onDateSelected as jest.Mock).mock
        .calls[0][0] as Date;
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      expect(calledDate.getFullYear()).toBe(tomorrow.getFullYear());
      expect(calledDate.getMonth()).toBe(tomorrow.getMonth());
      expect(calledDate.getDate()).toBe(tomorrow.getDate());
    });

    it('should invoke callback with next Saturday when "Next weekend" is clicked', async () => {
      await picker.show({ x: 100, y: 100 });
      const weekendRow = activeDocument.querySelectorAll(
        '.todoseq-date-picker-quick-select-row',
      )[2] as HTMLElement;
      weekendRow.click();

      const calledDate = (callbacks.onDateSelected as jest.Mock).mock
        .calls[0][0] as Date;
      expect(calledDate.getDay()).toBe(6);
    });

    it('should invoke callback with next Monday when "Next week" is clicked with Monday config', async () => {
      await picker.show({ x: 100, y: 100 });
      const nextWeekRow = activeDocument.querySelectorAll(
        '.todoseq-date-picker-quick-select-row',
      )[3] as HTMLElement;
      nextWeekRow.click();

      const calledDate = (callbacks.onDateSelected as jest.Mock).mock
        .calls[0][0] as Date;
      expect(calledDate.getDay()).toBe(1);
    });
  });

  describe('calendar section', () => {
    it('should render weekday labels starting from Monday when config is Monday', async () => {
      await picker.show({ x: 100, y: 100 });
      const labels = activeDocument.querySelectorAll(
        '.todoseq-date-picker-calendar-weekday',
      );
      const labelTexts = Array.from(labels).map((el) => el.textContent);
      expect(labelTexts).toEqual([
        'Mon',
        'Tue',
        'Wed',
        'Thu',
        'Fri',
        'Sat',
        'Sun',
      ]);
    });

    it('should render weekday labels starting from Sunday when config is Sunday', async () => {
      const sundayPicker = new DatePicker(callbacks, {
        weekStartsOn: 'Sunday',
      });
      await sundayPicker.show({ x: 100, y: 100 });
      const labels = activeDocument.querySelectorAll(
        '.todoseq-date-picker-calendar-weekday',
      );
      const labelTexts = Array.from(labels).map((el) => el.textContent);
      expect(labelTexts).toEqual([
        'Sun',
        'Mon',
        'Tue',
        'Wed',
        'Thu',
        'Fri',
        'Sat',
      ]);
      sundayPicker.cleanup();
    });

    it('should render correct number of day cells for current month', async () => {
      await picker.show({ x: 100, y: 100 });
      const dayCells = activeDocument.querySelectorAll(
        '.todoseq-date-picker-calendar-day:not(.empty)',
      );
      const today = new Date();
      const expectedDays = new Date(
        today.getFullYear(),
        today.getMonth() + 1,
        0,
      ).getDate();
      expect(dayCells.length).toBe(expectedDays);
    });

    it('should highlight today in the calendar', async () => {
      await picker.show({ x: 100, y: 100 });
      const todayCells = activeDocument.querySelectorAll(
        '.todoseq-date-picker-calendar-day.today',
      );
      expect(todayCells.length).toBe(1);
      const today = new Date();
      expect(todayCells[0].textContent).toBe(today.getDate().toString());
    });

    it('should highlight selected date when shown with initial date', async () => {
      const initialDate = new Date(2026, 4, 10);
      await picker.show({ x: 100, y: 100 }, 'scheduled', initialDate);

      const monthLabel = activeDocument.querySelector(
        '.todoseq-date-picker-calendar-month',
      );
      expect(monthLabel?.textContent).toContain('May');
      expect(monthLabel?.textContent).toContain('2026');

      const selectedCells = activeDocument.querySelectorAll(
        '.todoseq-date-picker-calendar-day.selected',
      );
      expect(selectedCells.length).toBe(1);
      expect(selectedCells[0].textContent).toBe('10');
    });

    it('should invoke callback when a calendar day is clicked', async () => {
      await picker.show({ x: 100, y: 100 });
      const dayCells = activeDocument.querySelectorAll(
        '.todoseq-date-picker-calendar-day:not(.empty)',
      );
      const fifthDay = dayCells[4] as HTMLElement;
      fifthDay.click();

      expect(callbacks.onDateSelected).toHaveBeenCalledTimes(1);
      const calledDate = (callbacks.onDateSelected as jest.Mock).mock
        .calls[0][0] as Date;
      expect(calledDate.getDate()).toBe(5);
    });

    it('should render empty cells for days before first of month', async () => {
      await picker.show({ x: 100, y: 100 }, 'scheduled', new Date(2026, 0, 1));
      const emptyCells = activeDocument.querySelectorAll(
        '.todoseq-date-picker-calendar-day.empty',
      );
      expect(emptyCells.length).toBeGreaterThanOrEqual(0);
      expect(emptyCells.length).toBeLessThan(7);
    });
  });

  describe('calendar navigation', () => {
    it('should navigate to previous month when prev button is clicked', async () => {
      await picker.show({ x: 100, y: 100 }, 'scheduled', new Date(2026, 5, 15));
      const monthBefore = activeDocument.querySelector(
        '.todoseq-date-picker-calendar-month',
      )?.textContent;

      const prevBtn = activeDocument.querySelectorAll(
        '.todoseq-date-picker-calendar-nav',
      )[0] as HTMLElement;
      prevBtn.click();

      const monthAfter = activeDocument.querySelector(
        '.todoseq-date-picker-calendar-month',
      )?.textContent;
      expect(monthAfter).not.toBe(monthBefore);
      expect(monthAfter).toContain('May');
    });

    it('should navigate to next month when next button is clicked', async () => {
      await picker.show({ x: 100, y: 100 }, 'scheduled', new Date(2026, 0, 15));
      const monthBefore = activeDocument.querySelector(
        '.todoseq-date-picker-calendar-month',
      )?.textContent;

      const nextBtn = activeDocument.querySelectorAll(
        '.todoseq-date-picker-calendar-nav',
      )[1] as HTMLElement;
      nextBtn.click();

      const monthAfter = activeDocument.querySelector(
        '.todoseq-date-picker-calendar-month',
      )?.textContent;
      expect(monthAfter).not.toBe(monthBefore);
      expect(monthAfter).toContain('Feb');
    });

    it('should update day cells when navigating months', async () => {
      await picker.show({ x: 100, y: 100 }, 'scheduled', new Date(2026, 0, 15));
      const nextBtn = activeDocument.querySelectorAll(
        '.todoseq-date-picker-calendar-nav',
      )[1] as HTMLElement;
      nextBtn.click();

      const dayCells = activeDocument.querySelectorAll(
        '.todoseq-date-picker-calendar-day:not(.empty)',
      );
      expect(dayCells.length).toBe(28);
    });
  });

  describe('time section', () => {
    it('should show "Time" label when no time is selected', async () => {
      await picker.show({ x: 100, y: 100 });
      const timeLabel = activeDocument.querySelector(
        '.todoseq-date-picker-time .todoseq-date-picker-menu-row-label',
      );
      expect(timeLabel?.textContent).toBe('Time');
    });

    it('should show formatted time when time is selected via initial date', async () => {
      const dateWithTime = new Date(2026, 4, 10, 14, 30);
      await picker.show({ x: 100, y: 100 }, 'scheduled', dateWithTime);
      const timeLabel = activeDocument.querySelector(
        '.todoseq-date-picker-time .todoseq-date-picker-menu-row-label',
      );
      expect(timeLabel?.textContent).toBe('14:30');
      expect(timeLabel?.classList.contains('is-selected')).toBe(true);
    });

    it('should show clear button when time is selected', async () => {
      const dateWithTime = new Date(2026, 4, 10, 14, 30);
      await picker.show({ x: 100, y: 100 }, 'scheduled', dateWithTime);
      const clearBtn = activeDocument.querySelector(
        '.todoseq-date-picker-time .todoseq-date-picker-clear-btn',
      );
      expect(clearBtn).not.toBeNull();
    });

    it('should not show clear button when no time is selected', async () => {
      await picker.show({ x: 100, y: 100 });
      const clearBtn = activeDocument.querySelector(
        '.todoseq-date-picker-time .todoseq-date-picker-clear-btn',
      );
      expect(clearBtn).toBeNull();
    });

    it('should not set time when initial date is midnight', async () => {
      const midnightDate = new Date(2026, 4, 10, 0, 0);
      await picker.show({ x: 100, y: 100 }, 'scheduled', midnightDate);
      const timeLabel = activeDocument.querySelector(
        '.todoseq-date-picker-time .todoseq-date-picker-menu-row-label',
      );
      expect(timeLabel?.textContent).toBe('Time');
    });
  });

  describe('time picker submenu', () => {
    it('should open time picker submenu when time row is clicked', async () => {
      await picker.show({ x: 100, y: 100 });
      const timeRow = activeDocument.querySelector(
        '.todoseq-date-picker-time .todoseq-date-picker-menu-row',
      ) as HTMLElement;
      timeRow.click();

      expect(
        activeDocument.querySelector('.todoseq-date-picker-submenu'),
      ).not.toBeNull();
    });

    it('should close time picker submenu when clicked again', async () => {
      await picker.show({ x: 100, y: 100 });
      const timeRow = activeDocument.querySelector(
        '.todoseq-date-picker-time .todoseq-date-picker-menu-row',
      ) as HTMLElement;
      timeRow.click();
      expect(
        activeDocument.querySelector('.todoseq-date-picker-submenu'),
      ).not.toBeNull();

      timeRow.click();
      expect(
        activeDocument.querySelector('.todoseq-date-picker-submenu'),
      ).toBeNull();
    });

    it('should generate time options in 30-minute increments', async () => {
      await picker.show({ x: 100, y: 100 });
      const timeRow = activeDocument.querySelector(
        '.todoseq-date-picker-time .todoseq-date-picker-menu-row',
      ) as HTMLElement;
      timeRow.click();

      const timeOptions = activeDocument.querySelectorAll(
        '.todoseq-date-picker-submenu-row',
      );
      expect(timeOptions.length).toBe(48);
      expect(timeOptions[0].textContent).toBe('00:00');
      expect(timeOptions[1].textContent).toBe('00:30');
      expect(timeOptions[47].textContent).toBe('23:30');
    });

    it('should update time section when a time option is selected', async () => {
      await picker.show({ x: 100, y: 100 });
      const timeRow = activeDocument.querySelector(
        '.todoseq-date-picker-time .todoseq-date-picker-menu-row',
      ) as HTMLElement;
      timeRow.click();

      const timeOptions = activeDocument.querySelectorAll(
        '.todoseq-date-picker-submenu-row',
      );
      (timeOptions[0] as HTMLElement).click();

      expect(
        activeDocument.querySelector('.todoseq-date-picker-submenu'),
      ).toBeNull();
      const timeLabel = activeDocument.querySelector(
        '.todoseq-date-picker-time .todoseq-date-picker-menu-row-label',
      );
      expect(timeLabel?.textContent).toBe('00:00');
    });

    it('should highlight selected time in submenu', async () => {
      const dateWithTime = new Date(2026, 4, 10, 14, 30);
      await picker.show({ x: 100, y: 100 }, 'scheduled', dateWithTime);
      const timeRow = activeDocument.querySelector(
        '.todoseq-date-picker-time .todoseq-date-picker-menu-row',
      ) as HTMLElement;
      timeRow.click();

      const selectedOptions = activeDocument.querySelectorAll(
        '.todoseq-date-picker-submenu-row.is-selected',
      );
      expect(selectedOptions.length).toBe(1);
      expect(selectedOptions[0].textContent).toBe('14:30');
    });

    it('should clear time when clear button is clicked', async () => {
      const dateWithTime = new Date(2026, 4, 10, 14, 30);
      await picker.show({ x: 100, y: 100 }, 'scheduled', dateWithTime);

      const clearBtn = activeDocument.querySelector(
        '.todoseq-date-picker-time .todoseq-date-picker-clear-btn',
      ) as HTMLElement;
      clearBtn.click();

      const timeLabel = activeDocument.querySelector(
        '.todoseq-date-picker-time .todoseq-date-picker-menu-row-label',
      );
      expect(timeLabel?.textContent).toBe('Time');
      expect(
        activeDocument.querySelector(
          '.todoseq-date-picker-time .todoseq-date-picker-clear-btn',
        ),
      ).toBeNull();
    });

    it('should close repeat picker when time picker is opened', async () => {
      await picker.show({ x: 100, y: 100 });

      const repeatRow = activeDocument.querySelector(
        '.todoseq-date-picker-repeat .todoseq-date-picker-menu-row',
      ) as HTMLElement;
      repeatRow.click();
      expect(
        activeDocument.querySelectorAll('.todoseq-date-picker-submenu').length,
      ).toBe(1);

      const timeRow = activeDocument.querySelector(
        '.todoseq-date-picker-time .todoseq-date-picker-menu-row',
      ) as HTMLElement;
      timeRow.click();

      expect(
        activeDocument.querySelectorAll('.todoseq-date-picker-submenu').length,
      ).toBe(1);
    });
  });

  describe('repeat section', () => {
    it('should show "Repeat" label when no repeat is selected', async () => {
      await picker.show({ x: 100, y: 100 });
      const repeatLabel = activeDocument.querySelector(
        '.todoseq-date-picker-repeat .todoseq-date-picker-menu-row-label',
      );
      expect(repeatLabel?.textContent).toBe('Repeat');
    });

    it('should show formatted repeat when repeat is selected', async () => {
      const repeat = {
        type: '.+' as const,
        unit: 'd' as const,
        value: 1,
        raw: '.+1d',
      };
      await picker.show({ x: 100, y: 100 }, 'scheduled', null, repeat);
      const repeatLabel = activeDocument.querySelector(
        '.todoseq-date-picker-repeat .todoseq-date-picker-menu-row-label',
      );
      expect(repeatLabel?.textContent).toBe('Every 1 day (from done)');
      expect(repeatLabel?.classList.contains('is-selected')).toBe(true);
    });

    it('should show plural unit label for value > 1', async () => {
      const repeat = {
        type: '+' as const,
        unit: 'd' as const,
        value: 3,
        raw: '+3d',
      };
      await picker.show({ x: 100, y: 100 }, 'scheduled', null, repeat);
      const repeatLabel = activeDocument.querySelector(
        '.todoseq-date-picker-repeat .todoseq-date-picker-menu-row-label',
      );
      expect(repeatLabel?.textContent).toBe('Every 3 days');
    });

    it('should show clear button when repeat is selected', async () => {
      const repeat = {
        type: '++' as const,
        unit: 'w' as const,
        value: 1,
        raw: '++1w',
      };
      await picker.show({ x: 100, y: 100 }, 'scheduled', null, repeat);
      expect(
        activeDocument.querySelector(
          '.todoseq-date-picker-repeat .todoseq-date-picker-clear-btn',
        ),
      ).not.toBeNull();
    });

    it('should not show clear button when no repeat is selected', async () => {
      await picker.show({ x: 100, y: 100 });
      expect(
        activeDocument.querySelector(
          '.todoseq-date-picker-repeat .todoseq-date-picker-clear-btn',
        ),
      ).toBeNull();
    });

    it('should format catch-up repeat type correctly', async () => {
      const repeat = {
        type: '++' as const,
        unit: 'w' as const,
        value: 2,
        raw: '++2w',
      };
      await picker.show({ x: 100, y: 100 }, 'scheduled', null, repeat);
      const repeatLabel = activeDocument.querySelector(
        '.todoseq-date-picker-repeat .todoseq-date-picker-menu-row-label',
      );
      expect(repeatLabel?.textContent).toBe('Every 2 weeks (catch up)');
    });
  });

  describe('repeat picker submenu', () => {
    it('should open repeat picker submenu when repeat row is clicked', async () => {
      await picker.show({ x: 100, y: 100 });
      const repeatRow = activeDocument.querySelector(
        '.todoseq-date-picker-repeat .todoseq-date-picker-menu-row',
      ) as HTMLElement;
      repeatRow.click();

      expect(
        activeDocument.querySelector('.todoseq-date-picker-submenu'),
      ).not.toBeNull();
    });

    it('should close repeat picker submenu when clicked again', async () => {
      await picker.show({ x: 100, y: 100 });
      const repeatRow = activeDocument.querySelector(
        '.todoseq-date-picker-repeat .todoseq-date-picker-menu-row',
      ) as HTMLElement;
      repeatRow.click();
      expect(
        activeDocument.querySelector('.todoseq-date-picker-submenu'),
      ).not.toBeNull();

      repeatRow.click();
      expect(
        activeDocument.querySelector('.todoseq-date-picker-submenu'),
      ).toBeNull();
    });

    it('should show preset options and Custom', async () => {
      await picker.show({ x: 100, y: 100 });
      const repeatRow = activeDocument.querySelector(
        '.todoseq-date-picker-repeat .todoseq-date-picker-menu-row',
      ) as HTMLElement;
      repeatRow.click();

      const rows = activeDocument.querySelectorAll(
        '.todoseq-date-picker-submenu-row',
      );
      expect(rows.length).toBe(5);
      const labels = Array.from(rows).map(
        (r) =>
          r.querySelector('.todoseq-date-picker-submenu-label')?.textContent,
      );
      expect(labels).toEqual([
        'Daily',
        'Weekly',
        'Monthly',
        'Yearly',
        'Custom...',
      ]);
    });

    it('should update repeat section when Daily preset is selected', async () => {
      await picker.show({ x: 100, y: 100 });
      const repeatRow = activeDocument.querySelector(
        '.todoseq-date-picker-repeat .todoseq-date-picker-menu-row',
      ) as HTMLElement;
      repeatRow.click();

      const dailyRow = activeDocument.querySelectorAll(
        '.todoseq-date-picker-submenu-row',
      )[0] as HTMLElement;
      dailyRow.click();

      expect(
        activeDocument.querySelector('.todoseq-date-picker-submenu'),
      ).toBeNull();
      const repeatLabel = activeDocument.querySelector(
        '.todoseq-date-picker-repeat .todoseq-date-picker-menu-row-label',
      );
      expect(repeatLabel?.textContent).toBe('Every 1 day (from done)');
    });

    it('should highlight selected preset in submenu', async () => {
      const repeat = {
        type: '.+' as const,
        unit: 'd' as const,
        value: 1,
        raw: '.+1d',
      };
      await picker.show({ x: 100, y: 100 }, 'scheduled', null, repeat);
      const repeatRow = activeDocument.querySelector(
        '.todoseq-date-picker-repeat .todoseq-date-picker-menu-row',
      ) as HTMLElement;
      repeatRow.click();

      const selectedRows = activeDocument.querySelectorAll(
        '.todoseq-date-picker-submenu-row.is-selected',
      );
      expect(selectedRows.length).toBe(1);
      expect(
        selectedRows[0].querySelector('.todoseq-date-picker-submenu-label')
          ?.textContent,
      ).toBe('Daily');
    });

    it('should close time picker when repeat picker is opened', async () => {
      await picker.show({ x: 100, y: 100 });

      const timeRow = activeDocument.querySelector(
        '.todoseq-date-picker-time .todoseq-date-picker-menu-row',
      ) as HTMLElement;
      timeRow.click();
      expect(
        activeDocument.querySelectorAll('.todoseq-date-picker-submenu').length,
      ).toBe(1);

      const repeatRow = activeDocument.querySelector(
        '.todoseq-date-picker-repeat .todoseq-date-picker-menu-row',
      ) as HTMLElement;
      repeatRow.click();
      expect(
        activeDocument.querySelectorAll('.todoseq-date-picker-submenu').length,
      ).toBe(1);
    });

    it('should open custom repeat dialog when Custom is clicked', async () => {
      await picker.show({ x: 100, y: 100 });
      const repeatRow = activeDocument.querySelector(
        '.todoseq-date-picker-repeat .todoseq-date-picker-menu-row',
      ) as HTMLElement;
      repeatRow.click();

      const customRow = activeDocument.querySelectorAll(
        '.todoseq-date-picker-submenu-row',
      )[4] as HTMLElement;
      customRow.click();

      expect(
        activeDocument.querySelector('.todoseq-date-picker-custom-repeat'),
      ).not.toBeNull();
      expect(
        activeDocument.querySelector('.todoseq-date-picker-submenu'),
      ).toBeNull();
    });

    it('should clear repeat when clear button is clicked', async () => {
      const repeat = {
        type: '.+' as const,
        unit: 'd' as const,
        value: 1,
        raw: '.+1d',
      };
      await picker.show({ x: 100, y: 100 }, 'scheduled', null, repeat);
      const clearBtn = activeDocument.querySelector(
        '.todoseq-date-picker-repeat .todoseq-date-picker-clear-btn',
      ) as HTMLElement;
      clearBtn.click();

      const repeatLabel = activeDocument.querySelector(
        '.todoseq-date-picker-repeat .todoseq-date-picker-menu-row-label',
      );
      expect(repeatLabel?.textContent).toBe('Repeat');
      expect(
        activeDocument.querySelector(
          '.todoseq-date-picker-repeat .todoseq-date-picker-clear-btn',
        ),
      ).toBeNull();
    });
  });

  describe('custom repeat dialog', () => {
    async function openCustomDialog(): Promise<void> {
      await picker.show({ x: 100, y: 100 });
      const repeatRow = activeDocument.querySelector(
        '.todoseq-date-picker-repeat .todoseq-date-picker-menu-row',
      ) as HTMLElement;
      repeatRow.click();
      const customRow = activeDocument.querySelectorAll(
        '.todoseq-date-picker-submenu-row',
      )[4] as HTMLElement;
      customRow.click();
    }

    it('should open with correct structure', async () => {
      await openCustomDialog();

      expect(
        activeDocument.querySelector('.todoseq-date-picker-custom-repeat'),
      ).not.toBeNull();
      expect(
        activeDocument.querySelector(
          '.todoseq-date-picker-custom-repeat-header',
        )?.textContent,
      ).toBe('Custom repeat');

      const typeButtons = activeDocument.querySelectorAll(
        '.todoseq-date-picker-custom-repeat-type-btn',
      );
      expect(typeButtons.length).toBe(3);

      const input = activeDocument.querySelector(
        '.todoseq-date-picker-custom-repeat-value-input',
      ) as HTMLInputElement;
      expect(input).not.toBeNull();
      expect(input.value).toBe('1');

      const select = activeDocument.querySelector(
        '.todoseq-date-picker-custom-repeat-unit-select',
      );
      expect(select).not.toBeNull();
      const options = select?.querySelectorAll('option');
      expect(options?.length).toBe(5);
    });

    it('should save custom repeat with default values when Save is clicked', async () => {
      await openCustomDialog();

      const saveBtn = activeDocument.querySelector(
        '.todoseq-date-picker-custom-repeat-save',
      ) as HTMLElement;
      saveBtn.click();

      expect(
        activeDocument.querySelector('.todoseq-date-picker-custom-repeat'),
      ).toBeNull();
      const repeatLabel = activeDocument.querySelector(
        '.todoseq-date-picker-repeat .todoseq-date-picker-menu-row-label',
      );
      expect(repeatLabel?.textContent).toBe('Every 1 hour (from done)');
    });

    it('should close without saving when Cancel is clicked', async () => {
      await openCustomDialog();

      const cancelBtn = activeDocument.querySelector(
        '.todoseq-date-picker-custom-repeat-cancel',
      ) as HTMLElement;
      cancelBtn.click();

      expect(
        activeDocument.querySelector('.todoseq-date-picker-custom-repeat'),
      ).toBeNull();
      const repeatLabel = activeDocument.querySelector(
        '.todoseq-date-picker-repeat .todoseq-date-picker-menu-row-label',
      );
      expect(repeatLabel?.textContent).toBe('Repeat');
    });

    it('should allow changing repeat type', async () => {
      await openCustomDialog();

      const typeButtons = activeDocument.querySelectorAll(
        '.todoseq-date-picker-custom-repeat-type-btn',
      );
      (typeButtons[0] as HTMLElement).click();

      expect(typeButtons[0].classList.contains('is-selected')).toBe(true);
      expect(typeButtons[1].classList.contains('is-selected')).toBe(false);

      const saveBtn = activeDocument.querySelector(
        '.todoseq-date-picker-custom-repeat-save',
      ) as HTMLElement;
      saveBtn.click();

      const repeatLabel = activeDocument.querySelector(
        '.todoseq-date-picker-repeat .todoseq-date-picker-menu-row-label',
      );
      expect(repeatLabel?.textContent).toBe('Every 1 hour');
    });

    it('should default to .+ type selected', async () => {
      await openCustomDialog();

      const typeButtons = activeDocument.querySelectorAll(
        '.todoseq-date-picker-custom-repeat-type-btn',
      );
      expect(typeButtons[0].classList.contains('is-selected')).toBe(false);
      expect(typeButtons[1].classList.contains('is-selected')).toBe(true);
      expect(typeButtons[2].classList.contains('is-selected')).toBe(false);
    });
  });

  describe('no date option', () => {
    it('should invoke callback with null date when "No date" is clicked', async () => {
      await picker.show({ x: 100, y: 100 });
      const noDateRow = activeDocument.querySelector(
        '.todoseq-date-picker-no-date .todoseq-date-picker-menu-row',
      ) as HTMLElement;
      noDateRow.click();

      expect(callbacks.onDateSelected).toHaveBeenCalledWith(
        null,
        null,
        'scheduled',
      );
    });
  });

  describe('date and time combination', () => {
    it('should combine date and time in callback', async () => {
      const dateWithTime = new Date(2026, 4, 10, 14, 30);
      await picker.show({ x: 100, y: 100 }, 'scheduled', dateWithTime);

      const todayRow = activeDocument.querySelectorAll(
        '.todoseq-date-picker-quick-select-row',
      )[0] as HTMLElement;
      todayRow.click();

      const calledDate = (callbacks.onDateSelected as jest.Mock).mock
        .calls[0][0] as Date;
      const today = new Date();
      expect(calledDate.getFullYear()).toBe(today.getFullYear());
      expect(calledDate.getMonth()).toBe(today.getMonth());
      expect(calledDate.getDate()).toBe(today.getDate());
      expect(calledDate.getHours()).toBe(14);
      expect(calledDate.getMinutes()).toBe(30);
    });

    it('should include repeat in callback when selecting a date', async () => {
      const repeat = {
        type: '.+' as const,
        unit: 'w' as const,
        value: 2,
        raw: '.+2w',
      };
      await picker.show({ x: 100, y: 100 }, 'scheduled', null, repeat);

      const todayRow = activeDocument.querySelectorAll(
        '.todoseq-date-picker-quick-select-row',
      )[0] as HTMLElement;
      todayRow.click();

      expect(callbacks.onDateSelected).toHaveBeenCalledWith(
        expect.any(Date),
        repeat,
        'scheduled',
      );
    });

    it('should pass mode in callback', async () => {
      await picker.show({ x: 100, y: 100 }, 'deadline');

      const todayRow = activeDocument.querySelectorAll(
        '.todoseq-date-picker-quick-select-row',
      )[0] as HTMLElement;
      todayRow.click();

      expect(callbacks.onDateSelected).toHaveBeenCalledWith(
        expect.any(Date),
        null,
        'deadline',
      );
    });

    it('should include time selected from picker in callback', async () => {
      await picker.show({ x: 100, y: 100 });

      const timeRow = activeDocument.querySelector(
        '.todoseq-date-picker-time .todoseq-date-picker-menu-row',
      ) as HTMLElement;
      timeRow.click();

      const timeOptions = activeDocument.querySelectorAll(
        '.todoseq-date-picker-submenu-row',
      );
      const nineThirty = timeOptions[19] as HTMLElement;
      nineThirty.click();

      const todayRow = activeDocument.querySelectorAll(
        '.todoseq-date-picker-quick-select-row',
      )[0] as HTMLElement;
      todayRow.click();

      const calledDate = (callbacks.onDateSelected as jest.Mock).mock
        .calls[0][0] as Date;
      expect(calledDate.getHours()).toBe(9);
      expect(calledDate.getMinutes()).toBe(30);
    });
  });

  describe('updateConfig', () => {
    it('should use updated config on next show', async () => {
      await picker.show({ x: 100, y: 100 });
      let labels = activeDocument.querySelectorAll(
        '.todoseq-date-picker-calendar-weekday',
      );
      expect(Array.from(labels).map((el) => el.textContent)).toEqual([
        'Mon',
        'Tue',
        'Wed',
        'Thu',
        'Fri',
        'Sat',
        'Sun',
      ]);
      picker.hide();

      picker.updateConfig({ weekStartsOn: 'Sunday' });
      await picker.show({ x: 100, y: 100 });
      labels = activeDocument.querySelectorAll(
        '.todoseq-date-picker-calendar-weekday',
      );
      expect(Array.from(labels).map((el) => el.textContent)).toEqual([
        'Sun',
        'Mon',
        'Tue',
        'Wed',
        'Thu',
        'Fri',
        'Sat',
      ]);
    });
  });

  describe('separators', () => {
    it('should render 3 separators between sections', async () => {
      await picker.show({ x: 100, y: 100 });
      const separators = activeDocument.querySelectorAll(
        '.todoseq-date-picker-separator',
      );
      expect(separators.length).toBe(3);
    });
  });

  describe('hide cleanup', () => {
    it('should close open submenus when hiding', async () => {
      await picker.show({ x: 100, y: 100 });

      const timeRow = activeDocument.querySelector(
        '.todoseq-date-picker-time .todoseq-date-picker-menu-row',
      ) as HTMLElement;
      timeRow.click();
      expect(
        activeDocument.querySelector('.todoseq-date-picker-submenu'),
      ).not.toBeNull();

      picker.hide();
      expect(
        activeDocument.querySelector('.todoseq-date-picker-submenu'),
      ).toBeNull();
      expect(activeDocument.querySelector('.todoseq-date-picker')).toBeNull();
    });
  });

  describe('reshowing', () => {
    it('should replace picker when show is called while already visible', async () => {
      await picker.show({ x: 100, y: 100 });
      expect(
        activeDocument.querySelectorAll('.todoseq-date-picker').length,
      ).toBe(1);

      await picker.show({ x: 200, y: 200 });
      expect(
        activeDocument.querySelectorAll('.todoseq-date-picker').length,
      ).toBe(1);
      expect(picker.isVisible()).toBe(true);
    });
  });
});
