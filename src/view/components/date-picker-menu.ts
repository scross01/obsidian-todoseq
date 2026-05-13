import { setIcon } from 'obsidian';
import { DateUtils } from '../../utils/date-utils';
import { DateRepeatInfo } from '../../types/task';
import { isPhoneDevice } from '../../utils/mobile-utils';
import { BaseDialog } from './base-dialog';

/**
 * Callback types for date picker actions
 */
export type DatePickerCallbacks = {
  onDateSelected: (
    date: Date | null,
    repeat: DateRepeatInfo | null,
    mode: DatePickerMode,
  ) => void;
};

/**
 * Configuration for the date picker
 */
export interface DatePickerConfig {
  weekStartsOn: 'Monday' | 'Sunday';
}

/**
 * Date picker mode - determines which date field is being set
 */
export type DatePickerMode = 'scheduled' | 'deadline';

/**
 * DatePicker — A comprehensive date and time picker with repeat options.
 *
 * Features:
 * - Quick date selections (Today, Tomorrow, Next weekend, Next week)
 * - Calendar grid view with month navigation
 * - Time picker with 30-minute increments
 * - Repeat options (Daily, Weekly, Monthly, Yearly, Custom)
 * - Custom repeat dialog with advanced settings
 *
 * Single-instance pattern: only one picker can be open at a time.
 * Supports keyboard navigation and theme compatibility.
 */
export class DatePicker extends BaseDialog {
  // Override positionDialog to use date picker specific default dimensions
  protected positionDialog(x: number, y: number): void {
    super.positionDialog(x, y, 320, 400);
  }
  private config: DatePickerConfig;
  private callbacks: DatePickerCallbacks;

  // State
  private selectedDate: Date | null = null;
  private selectedTime: { hours: number; minutes: number } | null = null;
  private selectedRepeat: DateRepeatInfo | null = null;
  private currentMonth: Date;
  private mode: DatePickerMode = 'scheduled';

  // Sub-components
  private quickSelectSection: HTMLElement | null = null;
  private calendarSection: HTMLElement | null = null;
  private timeSection: HTMLElement | null = null;
  private repeatSection: HTMLElement | null = null;
  private customRepeatDialog: HTMLElement | null = null;

  private timePickerSubmenu: HTMLElement | null = null;
  private repeatPickerSubmenu: HTMLElement | null = null;

  constructor(callbacks: DatePickerCallbacks, config: DatePickerConfig) {
    super();
    this.callbacks = callbacks;
    this.config = config;
    this.currentMonth = new Date();
  }

  /**
   * Update the configuration (e.g. when settings change)
   */
  updateConfig(config: DatePickerConfig): void {
    this.config = config;
  }

  /**
   * Show the date picker at the given position.
   * If already showing, hides the previous picker first.
   */
  async show(
    position: { x: number; y: number },
    mode: DatePickerMode = 'scheduled',
    initialDate?: Date | null,
    initialRepeat?: DateRepeatInfo | null,
  ): Promise<void> {
    this.mode = mode;

    // Close any other active dialog before showing this one
    this.closeActiveDialog();

    if (this.isShowing) {
      this.hide();
    }

    // Set initial date/time if provided
    this.selectedRepeat = initialRepeat ?? null;
    if (initialDate) {
      this.selectedDate = DateUtils.getDateOnly(initialDate);
      // Only set time if the date has a time component (not midnight)
      if (initialDate.getHours() !== 0 || initialDate.getMinutes() !== 0) {
        this.selectedTime = {
          hours: initialDate.getHours(),
          minutes: initialDate.getMinutes(),
        };
      }
      // Set current month to the month of the initial date
      this.currentMonth = new Date(
        initialDate.getFullYear(),
        initialDate.getMonth(),
        1,
      );
    } else {
      this.selectedDate = null;
      this.selectedTime = null;
      this.currentMonth = new Date();
    }

    await this.buildPicker();
    this.positionDialog(position.x, position.y);
    this.attachGlobalListeners();

    // Add backdrop on phones for better UX
    if (isPhoneDevice()) {
      this.addBackdrop();
    }

    this.isShowing = true;
    this.registerAsActiveDialog();
  }

  /**
   * Hide and destroy the date picker.
   */
  hide(): void {
    if (!this.isShowing) return;

    // Unregister as active dialog
    this.unregisterAsActiveDialog();

    // Close any open submenus
    this.closeTimePicker();
    this.closeRepeatPicker();
    this.closeCustomRepeatDialog();

    this.detachGlobalListeners();

    // Remove backdrop
    this.removeBackdrop();

    if (this.containerEl && this.containerEl.parentNode) {
      this.containerEl.remove();
    }

    this.containerEl = null;
    this.quickSelectSection = null;
    this.calendarSection = null;
    this.timeSection = null;
    this.repeatSection = null;
    this.customRepeatDialog = null;
    this.isShowing = false;
    this.focusedIndex = -1;
    this.focusableItems = [];
  }

  /**
   * Whether the picker is currently visible.
   */
  isVisible(): boolean {
    return this.isShowing;
  }

  /**
   * Clean up all resources. Call when the parent view is destroyed.
   */
  cleanup(): void {
    this.hide();
  }

  // ─── DOM Building ──────────────────────────────────────────────

  private async buildPicker(): Promise<void> {
    this.containerEl = window.activeDocument.createElement('div');
    this.containerEl.className = 'menu todoseq-date-picker';
    this.containerEl.setAttribute('role', 'menu');

    this.focusableItems = [];

    // Header section
    this.buildHeaderSection();

    // Quick select section
    this.buildQuickSelectSection();

    // Separator
    this.addSeparator();

    // Calendar section
    this.buildCalendarSection();

    // Separator
    this.addSeparator();

    // Time section
    this.buildTimeSection();

    // Repeat section
    this.buildRepeatSection();

    // Separator
    this.addSeparator();

    // No date option
    this.buildNoDateOption();

    window.activeDocument.body.appendChild(this.containerEl);
  }

  private buildHeaderSection(): void {
    if (!this.containerEl) return;

    const header = this.containerEl.createEl('div', {
      cls: 'menu-item menu-item-title todoseq-date-picker-header',
    });

    const headerText =
      this.mode === 'scheduled' ? 'Scheduled Date' : 'Deadline Date';
    header.setText(headerText);
  }

  private buildNoDateOption(): void {
    if (!this.containerEl) return;

    // Create a section for the no date option to match other sections
    const noDateSection = this.containerEl.createEl('div', {
      cls: 'todoseq-date-picker-no-date',
    });

    const noDateRow = this.createMenuRow('No date', 'circle-off', () => {
      this.hide();
      this.callbacks.onDateSelected(null, null, this.mode);
    });
    noDateRow.setAttribute('role', 'menuitem');

    noDateSection.appendChild(noDateRow);
    this.focusableItems.push(noDateRow);
  }

  private buildQuickSelectSection(): void {
    if (!this.containerEl) return;

    this.quickSelectSection = this.containerEl.createEl('div', {
      cls: 'todoseq-date-picker-quick-select',
    });

    const quickSelectOptions = this.getQuickSelectOptions();

    for (const option of quickSelectOptions) {
      const row = this.createQuickSelectRow(option);
      this.quickSelectSection.appendChild(row);
    }
  }

  private buildCalendarSection(): void {
    if (!this.containerEl) return;

    this.calendarSection = this.containerEl.createEl('div', {
      cls: 'todoseq-date-picker-calendar',
    });

    // Month header with navigation
    const monthHeader = this.calendarSection.createEl('div', {
      cls: 'todoseq-date-picker-calendar-header',
    });

    const prevBtn = monthHeader.createEl('button', {
      cls: 'todoseq-date-picker-calendar-nav',
      attr: {
        'aria-label': 'Previous month',
        role: 'menuitem',
        tabindex: '-1',
      },
    });
    const prevIcon = prevBtn.createEl('span', {
      cls: 'menu-item-icon todoseq-date-picker-calendar-nav-icon',
    });
    setIcon(prevIcon, 'lucide-chevron-left');
    prevBtn.addEventListener('click', (evt) => {
      evt.stopPropagation();
      this.previousMonth();
    });

    const monthYearLabel = monthHeader.createEl('span', {
      cls: 'todoseq-date-picker-calendar-month',
    });
    monthYearLabel.setText(this.formatMonthYear(this.currentMonth));

    const nextBtn = monthHeader.createEl('button', {
      cls: 'todoseq-date-picker-calendar-nav',
      attr: {
        'aria-label': 'Next month',
        role: 'menuitem',
        tabindex: '-1',
      },
    });
    const nextIcon = nextBtn.createEl('span', {
      cls: 'menu-item-icon todoseq-date-picker-calendar-nav-icon',
    });
    setIcon(nextIcon, 'lucide-chevron-right');
    nextBtn.addEventListener('click', (evt) => {
      evt.stopPropagation();
      this.nextMonth();
    });

    // Weekday headers
    const weekdayHeader = this.calendarSection.createEl('div', {
      cls: 'todoseq-date-picker-calendar-weekdays',
    });

    const weekdays = this.getWeekdayLabels();
    for (const weekday of weekdays) {
      const dayLabel = weekdayHeader.createEl('span', {
        cls: 'todoseq-date-picker-calendar-weekday',
      });
      dayLabel.setText(weekday);
    }

    // Days grid
    const daysGrid = this.calendarSection.createEl('div', {
      cls: 'todoseq-date-picker-calendar-days',
    });

    const daysInMonth = this.getDaysInMonth(this.currentMonth);
    const firstDayOffset = this.getFirstDayOffset(this.currentMonth);

    // Empty cells for days before the first day of the month
    for (let i = 0; i < firstDayOffset; i++) {
      daysGrid.createEl('div', {
        cls: 'todoseq-date-picker-calendar-day empty',
      });
    }

    // Days of the month
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(
        this.currentMonth.getFullYear(),
        this.currentMonth.getMonth(),
        day,
      );
      const dayCell = daysGrid.createEl('div', {
        cls: 'todoseq-date-picker-calendar-day',
        attr: {
          'aria-label': date.toLocaleDateString(),
          role: 'menuitem',
          tabindex: '-1',
        },
      });
      dayCell.setText(day.toString());

      // Highlight today
      if (DateUtils.isSameDay(date, new Date())) {
        dayCell.addClass('today');
      }

      // Highlight selected date
      if (this.selectedDate && DateUtils.isSameDay(date, this.selectedDate)) {
        dayCell.addClass('selected');
      }

      dayCell.addEventListener('click', () => this.selectDate(date));
      this.focusableItems.push(dayCell);
    }
  }

  private buildTimeSection(): void {
    if (!this.containerEl) return;

    this.timeSection = this.containerEl.createEl('div', {
      cls: 'todoseq-date-picker-time',
    });

    const timeRow = this.createMenuRow(
      this.selectedTime ? this.formatTime(this.selectedTime) : 'Time',
      'clock',
      () => this.toggleTimePicker(),
    );
    timeRow.setAttribute('role', 'menuitem');

    if (this.selectedTime) {
      const labelEl = timeRow.querySelector(
        '.todoseq-date-picker-menu-row-label',
      );
      if (labelEl) {
        labelEl.addClass('is-selected');
      }
    }

    // Add clear button if time is selected
    if (this.selectedTime) {
      const clearBtn = timeRow.createEl('button', {
        cls: 'todoseq-date-picker-clear-btn',
        attr: {
          'aria-label': 'Clear time',
          role: 'button',
          tabindex: '-1',
        },
      });
      const clearIcon = clearBtn.createEl('span', {
        cls: 'menu-item-icon todoseq-date-picker-clear-icon',
      });
      setIcon(clearIcon, 'lucide-x');
      clearBtn.addEventListener('click', (evt) => {
        evt.stopPropagation();
        this.clearTime();
      });
    }

    this.timeSection.appendChild(timeRow);
    this.focusableItems.push(timeRow);
  }

  private buildRepeatSection(): void {
    if (!this.containerEl) return;

    this.repeatSection = this.containerEl.createEl('div', {
      cls: 'todoseq-date-picker-repeat',
    });

    const repeatRow = this.createMenuRow(
      this.selectedRepeat ? this.formatRepeat(this.selectedRepeat) : 'Repeat',
      'rotate-ccw',
      () => this.toggleRepeatPicker(),
    );
    repeatRow.setAttribute('role', 'menuitem');

    if (this.selectedRepeat) {
      const labelEl = repeatRow.querySelector(
        '.todoseq-date-picker-menu-row-label',
      );
      if (labelEl) {
        labelEl.addClass('is-selected');
      }
    }

    // Add clear button if repeat is selected
    if (this.selectedRepeat) {
      const clearBtn = repeatRow.createEl('button', {
        cls: 'todoseq-date-picker-clear-btn',
        attr: {
          'aria-label': 'Clear repeat',
          role: 'button',
          tabindex: '-1',
        },
      });
      const clearIcon = clearBtn.createEl('span', {
        cls: 'menu-item-icon todoseq-date-picker-clear-icon',
      });
      setIcon(clearIcon, 'lucide-x');
      clearBtn.addEventListener('click', (evt) => {
        evt.stopPropagation();
        this.clearRepeat();
      });
    }

    this.repeatSection.appendChild(repeatRow);
    this.focusableItems.push(repeatRow);
  }

  // ─── Quick Select Options ───────────────────────────────────────

  private getQuickSelectOptions(): Array<{
    icon: string;
    label: string;
    getDate: () => Date;
  }> {
    return [
      {
        icon: 'sun',
        label: 'Today',
        getDate: () => DateUtils.getDateOnly(new Date()),
      },
      {
        icon: 'sunrise',
        label: 'Tomorrow',
        getDate: () => {
          const d = DateUtils.getDateOnly(new Date());
          d.setDate(d.getDate() + 1);
          return d;
        },
      },
      {
        icon: 'sofa',
        label: 'Next weekend',
        getDate: () => this.getNextWeekend(),
      },
      {
        icon: 'calendar-arrow-up',
        label: 'Next week',
        getDate: () => this.getNextWeekStart(),
      },
    ];
  }

  private createQuickSelectRow(option: {
    icon: string;
    label: string;
    getDate: () => Date;
  }): HTMLElement {
    const row = window.activeDocument.createElement('div');
    row.className = 'menu-item todoseq-date-picker-quick-select-row';
    row.setAttribute('role', 'menuitem');
    row.setAttribute('tabindex', '-1');

    const iconEl = row.createEl('span', {
      cls: 'menu-item-icon todoseq-date-picker-quick-select-icon',
    });
    setIcon(iconEl, option.icon);

    const labelEl = row.createEl('span', {
      cls: 'menu-item-title todoseq-date-picker-quick-select-label',
    });
    labelEl.setText(option.label);

    const dateEl = row.createEl('span', {
      cls: 'todoseq-date-picker-quick-select-date',
    });
    const date = option.getDate();
    // Format date using locale-aware short date format with day of week
    dateEl.setText(
      date.toLocaleDateString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      }),
    );

    row.addEventListener('click', () => {
      this.selectDate(date);
    });

    this.focusableItems.push(row);

    return row;
  }

  // ─── Calendar Navigation ────────────────────────────────────────

  private previousMonth(): void {
    this.currentMonth.setMonth(this.currentMonth.getMonth() - 1);
    this.refreshCalendar();
  }

  private nextMonth(): void {
    this.currentMonth.setMonth(this.currentMonth.getMonth() + 1);
    this.refreshCalendar();
  }

  private refreshCalendar(): void {
    // Count calendar items BEFORE removing the old calendar section
    const calendarItemCount = this.countCurrentCalendarItems();

    // Clear old focusable items from calendar section before rebuilding
    this.focusableItems.splice(-calendarItemCount, calendarItemCount);

    const calendarSection = this.calendarSection;
    let parent: Node | null = null;
    let nextSibling: Node | null = null;
    if (calendarSection) {
      parent = calendarSection.parentNode;
      nextSibling = calendarSection.nextSibling;
      if (parent) {
        parent.removeChild(calendarSection);
      }
    }
    this.buildCalendarSection();
    // Insert the new calendar section at the original position
    if (this.calendarSection && parent) {
      if (nextSibling) {
        parent.insertBefore(this.calendarSection, nextSibling);
      } else {
        parent.appendChild(this.calendarSection);
      }
    }
  }

  private countCurrentCalendarItems(): number {
    // Count how many focusable items are in the current calendar section
    // This includes: nav buttons (2), weekday labels (7), day cells, and empty cells
    if (!this.calendarSection) return 0;

    let count = 0;
    const navButtons = this.calendarSection.querySelectorAll(
      '.todoseq-date-picker-calendar-nav',
    );
    count += navButtons.length;

    const weekdayLabels = this.calendarSection.querySelectorAll(
      '.todoseq-date-picker-calendar-weekday',
    );
    count += weekdayLabels.length;

    const dayCells = this.calendarSection.querySelectorAll(
      '.todoseq-date-picker-calendar-day:not(.empty)',
    );
    count += dayCells.length;

    const emptyCells = this.calendarSection.querySelectorAll(
      '.todoseq-date-picker-calendar-day.empty',
    );
    count += emptyCells.length;

    return count;
  }

  private formatMonthYear(date: Date): string {
    return date.toLocaleDateString(undefined, {
      month: 'short',
      year: 'numeric',
    });
  }

  private getDaysInMonth(date: Date): number {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  }

  private getFirstDayOffset(date: Date): number {
    const firstDay = new Date(date.getFullYear(), date.getMonth(), 1);
    let day = firstDay.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat

    // If week starts on Monday, we need to shift Sunday (0) to 6
    if (this.config.weekStartsOn === 'Monday') {
      day = (day + 6) % 7; // Convert to 0=Mon, 1=Tue, ..., 6=Sun
    }

    return day;
  }

  private getWeekdayLabels(): string[] {
    const labels: string[] = [];
    const startDay = this.config.weekStartsOn === 'Monday' ? 1 : 0;

    // Use fixed weekday names directly to avoid any reference date issues
    // JavaScript's getDay() returns: 0=Sunday, 1=Monday, ..., 6=Saturday
    const weekdayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    for (let i = 0; i < 7; i++) {
      const dayIndex = (startDay + i) % 7;
      labels.push(weekdayNames[dayIndex]);
    }

    return labels;
  }

  // ─── Time Selection ─────────────────────────────────────────────

  private toggleTimePicker(): void {
    // Close repeat picker if open
    if (this.repeatPickerSubmenu) {
      this.closeRepeatPicker();
    }

    if (this.timePickerSubmenu) {
      this.closeTimePicker();
    } else {
      this.openTimePicker();
    }
  }

  private openTimePicker(): void {
    if (!this.timeSection || !this.containerEl) return;

    // Create submenu
    this.timePickerSubmenu = window.activeDocument.createElement('div');
    this.timePickerSubmenu.className = 'menu todoseq-date-picker-submenu';

    // Determine which time to focus: selected time or 12:00
    const targetHours = this.selectedTime ? this.selectedTime.hours : 12;
    const targetMinutes = this.selectedTime ? this.selectedTime.minutes : 0;

    let targetRow: HTMLElement | null = null;

    // Generate time options in 30-minute increments
    for (let hours = 0; hours < 24; hours++) {
      for (let minutes = 0; minutes < 60; minutes += 30) {
        const time: { hours: number; minutes: number } = { hours, minutes };
        const timeStr = this.formatTime(time);

        const row = window.activeDocument.createElement('div');
        row.className = 'menu-item todoseq-date-picker-submenu-row';
        row.setAttribute('role', 'menuitem');
        row.setAttribute('tabindex', '-1');
        row.setText(timeStr);

        // Highlight if selected
        if (
          this.selectedTime &&
          this.selectedTime.hours === hours &&
          this.selectedTime.minutes === minutes
        ) {
          row.addClass('is-selected');
        }

        // Track the target row for focusing
        if (hours === targetHours && minutes === targetMinutes) {
          targetRow = row;
        }

        row.addEventListener('click', (evt) => {
          evt.stopPropagation();
          this.selectTime(time);
        });

        this.timePickerSubmenu.appendChild(row);
      }
    }

    // Append submenu temporarily to measure its height
    this.timePickerSubmenu.addClass('todoseq-date-picker-submenu-measuring');
    this.containerEl.appendChild(this.timePickerSubmenu);

    // Measure submenu height
    const submenuHeight = this.timePickerSubmenu.offsetHeight;

    // Position the submenu to overlay (above the time section)
    const timeSectionOffsetTop = this.timeSection.offsetTop;
    this.timePickerSubmenu.removeClass('todoseq-date-picker-submenu-measuring');
    this.timePickerSubmenu.style.setProperty(
      '--todoseq-submenu-top',
      `${timeSectionOffsetTop - submenuHeight}px`,
    );
    this.timePickerSubmenu.addClass('todoseq-date-picker-submenu-visible');

    // Scroll the target row into view
    if (targetRow) {
      targetRow.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  }

  private closeTimePicker(): void {
    if (this.timePickerSubmenu && this.timePickerSubmenu.parentNode) {
      this.timePickerSubmenu.remove();
    }
    this.timePickerSubmenu = null;
  }

  private selectTime(time: { hours: number; minutes: number }): void {
    this.selectedTime = time;
    this.closeTimePicker();
    this.refreshTimeSection();
  }

  private clearTime(): void {
    this.selectedTime = null;
    this.refreshTimeSection();
  }

  private refreshTimeSection(): void {
    const timeSection = this.timeSection;
    let parent: Node | null = null;
    let nextSibling: Node | null = null;
    if (timeSection) {
      parent = timeSection.parentNode;
      nextSibling = timeSection.nextSibling;
      if (parent) {
        parent.removeChild(timeSection);
      }
    }
    this.buildTimeSection();
    if (this.timeSection && parent) {
      if (nextSibling) {
        parent.insertBefore(this.timeSection, nextSibling);
      } else {
        parent.appendChild(this.timeSection);
      }
    }
  }

  private formatTime(time: { hours: number; minutes: number }): string {
    const hours = time.hours.toString().padStart(2, '0');
    const minutes = time.minutes.toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  }

  // ─── Repeat Selection ───────────────────────────────────────────

  private toggleRepeatPicker(): void {
    // Close time picker if open
    if (this.timePickerSubmenu) {
      this.closeTimePicker();
    }

    if (this.repeatPickerSubmenu) {
      this.closeRepeatPicker();
    } else {
      this.openRepeatPicker();
    }
  }

  private openRepeatPicker(): void {
    if (!this.repeatSection || !this.containerEl) return;

    // Create submenu
    this.repeatPickerSubmenu = window.activeDocument.createElement('div');
    this.repeatPickerSubmenu.className = 'menu todoseq-date-picker-submenu';

    // Preset repeat options
    const presetOptions: Array<{
      label: string;
      repeat: DateRepeatInfo;
    }> = [
      {
        label: 'Daily',
        repeat: { type: '.+', unit: 'd', value: 1, raw: '.+1d' },
      },
      {
        label: 'Weekly',
        repeat: { type: '++', unit: 'w', value: 1, raw: '++1w' },
      },
      {
        label: 'Monthly',
        repeat: { type: '.+', unit: 'm', value: 1, raw: '.+1m' },
      },
      {
        label: 'Yearly',
        repeat: { type: '.+', unit: 'y', value: 1, raw: '.+1y' },
      },
    ];

    for (const option of presetOptions) {
      const row = this.repeatPickerSubmenu.createDiv({
        cls: 'menu-item todoseq-date-picker-submenu-row',
        attr: { role: 'menuitem', tabindex: '-1' },
      });

      row.createSpan({
        cls: 'menu-item-title todoseq-date-picker-submenu-label',
        text: option.label,
      });

      row.createSpan({
        cls: 'todoseq-date-picker-submenu-value',
        text: option.repeat.raw,
      });

      if (
        this.selectedRepeat &&
        this.selectedRepeat.raw === option.repeat.raw
      ) {
        row.addClass('is-selected');
      }

      row.addEventListener('click', (evt) => {
        evt.stopPropagation();
        this.selectRepeat(option.repeat);
      });
    }

    const customRow = this.repeatPickerSubmenu.createDiv({
      cls: 'menu-item todoseq-date-picker-submenu-row',
      attr: { role: 'menuitem', tabindex: '-1' },
    });

    customRow.createSpan({
      cls: 'menu-item-title todoseq-date-picker-submenu-label',
      text: 'Custom...',
    });

    customRow.addEventListener('click', (evt) => {
      evt.stopPropagation();
      this.closeRepeatPicker();
      this.openCustomRepeatDialog();
    });

    // Append submenu temporarily to measure its height
    this.repeatPickerSubmenu.addClass('todoseq-date-picker-submenu-measuring');
    this.containerEl.appendChild(this.repeatPickerSubmenu);

    // Measure submenu height
    const submenuHeight = this.repeatPickerSubmenu.offsetHeight;

    // Position the submenu to overlay (above the repeat section)
    const repeatSectionOffsetTop = this.repeatSection.offsetTop;
    this.repeatPickerSubmenu.removeClass(
      'todoseq-date-picker-submenu-measuring',
    );
    this.repeatPickerSubmenu.style.setProperty(
      '--todoseq-submenu-top',
      `${repeatSectionOffsetTop - submenuHeight}px`,
    );
    this.repeatPickerSubmenu.addClass('todoseq-date-picker-submenu-visible');
  }

  private closeRepeatPicker(): void {
    if (this.repeatPickerSubmenu && this.repeatPickerSubmenu.parentNode) {
      this.repeatPickerSubmenu.remove();
    }
    this.repeatPickerSubmenu = null;
  }

  private selectRepeat(repeat: DateRepeatInfo): void {
    this.selectedRepeat = repeat;
    this.closeRepeatPicker();
    this.refreshRepeatSection();
  }

  private openCustomRepeatDialog(): void {
    if (!this.containerEl) return;

    // Create custom repeat dialog
    this.customRepeatDialog = window.activeDocument.createElement('div');
    this.customRepeatDialog.className = 'todoseq-date-picker-custom-repeat';

    // Header
    const header = this.customRepeatDialog.createEl('div', {
      cls: 'todoseq-date-picker-custom-repeat-header',
    });
    header.setText('Custom repeat');

    // Repeat type section
    const typeLabel = this.customRepeatDialog.createEl('div', {
      cls: 'todoseq-date-picker-custom-repeat-label',
    });
    typeLabel.setText('Repeat type');

    const typeOptions = this.customRepeatDialog.createEl('div', {
      cls: 'todoseq-date-picker-custom-repeat-type-options',
    });

    const typeChoices = [
      { value: '+', label: '+ (from original)' },
      { value: '.+', label: '.+ (from done)' },
      { value: '++', label: '++ (catch up)' },
    ];

    let selectedType: '+' | '.+' | '++' = '.+';

    for (const choice of typeChoices) {
      const typeBtn = typeOptions.createEl('button', {
        cls: 'todoseq-date-picker-custom-repeat-type-btn',
        attr: {
          'data-type': choice.value,
          role: 'button',
          tabindex: '-1',
        },
      });
      typeBtn.setText(choice.label);

      if (choice.value === selectedType) {
        typeBtn.addClass('is-selected');
      }

      typeBtn.addEventListener('click', () => {
        selectedType = choice.value as '+' | '.+' | '++';
        // Update selection visual
        const buttons = typeOptions.querySelectorAll(
          '.todoseq-date-picker-custom-repeat-type-btn',
        );
        buttons.forEach((btn) => {
          btn.removeClass('is-selected');
          if ((btn as HTMLElement).dataset.type === selectedType) {
            btn.addClass('is-selected');
          }
        });
      });
    }

    // Repeat value section
    const valueLabel = this.customRepeatDialog.createEl('div', {
      cls: 'todoseq-date-picker-custom-repeat-label',
    });
    valueLabel.setText('Repeat every');

    const valueRow = this.customRepeatDialog.createEl('div', {
      cls: 'todoseq-date-picker-custom-repeat-value-row',
    });

    const valueInput = valueRow.createEl('input', {
      cls: 'todoseq-date-picker-custom-repeat-value-input',
      attr: {
        type: 'number',
        min: '1',
        max: '99',
        value: '1',
      },
    });

    const unitSelect = valueRow.createEl('select', {
      cls: 'todoseq-date-picker-custom-repeat-unit-select',
    });

    const unitOptions = [
      { value: 'h', label: 'hour(s)' },
      { value: 'd', label: 'day(s)' },
      { value: 'w', label: 'week(s)' },
      { value: 'm', label: 'month(s)' },
      { value: 'y', label: 'year(s)' },
    ];

    for (const unit of unitOptions) {
      const option = unitSelect.createEl('option', {
        attr: { value: unit.value },
      });
      option.setText(unit.label);
    }

    // Buttons
    const buttonRow = this.customRepeatDialog.createEl('div', {
      cls: 'todoseq-date-picker-custom-repeat-buttons',
    });

    const cancelBtn = buttonRow.createEl('button', {
      cls: 'todoseq-date-picker-custom-repeat-cancel',
    });
    cancelBtn.setText('Cancel');
    cancelBtn.addEventListener('click', (evt) => {
      evt.preventDefault();
      evt.stopPropagation();
      this.closeCustomRepeatDialog();
    });

    const saveBtn = buttonRow.createEl('button', {
      cls: 'todoseq-date-picker-custom-repeat-save',
    });
    saveBtn.setText('Save');
    saveBtn.addEventListener('click', (evt) => {
      evt.preventDefault();
      evt.stopPropagation();
      const value = parseInt(valueInput.value, 10) || 1;
      const unit = unitSelect.value as 'y' | 'm' | 'w' | 'd' | 'h';
      const repeat: DateRepeatInfo = {
        type: selectedType,
        unit,
        value,
        raw: `${selectedType}${value}${unit}`,
      };
      this.selectedRepeat = repeat;
      this.closeCustomRepeatDialog();
      this.refreshRepeatSection();
    });

    // Position the dialog
    this.customRepeatDialog.addClass(
      'todoseq-date-picker-custom-repeat-centered',
    );

    this.containerEl.appendChild(this.customRepeatDialog);
  }

  private closeCustomRepeatDialog(): void {
    if (this.customRepeatDialog && this.customRepeatDialog.parentNode) {
      this.customRepeatDialog.remove();
    }
    this.customRepeatDialog = null;
  }

  private clearRepeat(): void {
    this.selectedRepeat = null;
    this.refreshRepeatSection();
  }

  private refreshRepeatSection(): void {
    const repeatSection = this.repeatSection;
    let parent: Node | null = null;
    let nextSibling: Node | null = null;
    if (repeatSection) {
      parent = repeatSection.parentNode;
      nextSibling = repeatSection.nextSibling;
      if (parent) {
        parent.removeChild(repeatSection);
      }
    }
    this.buildRepeatSection();
    if (this.repeatSection && parent) {
      if (nextSibling) {
        parent.insertBefore(this.repeatSection, nextSibling);
      } else {
        parent.appendChild(this.repeatSection);
      }
    }
  }

  private formatRepeat(repeat: DateRepeatInfo): string {
    const unitLabels: Record<string, string> = {
      y: 'year',
      m: 'month',
      w: 'week',
      d: 'day',
      h: 'hour',
    };

    const unitLabel = unitLabels[repeat.unit];
    const unitStr = repeat.value === 1 ? unitLabel : `${unitLabel}s`;

    switch (repeat.type) {
      case '+':
        return `Every ${repeat.value} ${unitStr}`;
      case '.+':
        return `Every ${repeat.value} ${unitStr} (from done)`;
      case '++':
        return `Every ${repeat.value} ${unitStr} (catch up)`;
      default:
        return `${repeat.raw}`;
    }
  }

  // ─── Helpers ───────────────────────────────────────────────────

  private createMenuRow(
    label: string,
    iconName: string,
    onClick: () => void,
  ): HTMLElement {
    if (!this.containerEl) {
      throw new Error('Container element not initialized');
    }

    const row = window.activeDocument.createElement('div');
    row.className = 'menu-item todoseq-date-picker-menu-row';
    row.setAttribute('tabindex', '-1');

    const iconEl = row.createEl('span', {
      cls: 'menu-item-icon todoseq-date-picker-menu-row-icon',
    });
    setIcon(iconEl, iconName);

    const labelEl = row.createEl('span', {
      cls: 'menu-item-title todoseq-date-picker-menu-row-label',
    });
    labelEl.setText(label);

    row.addEventListener('click', (evt) => {
      evt.preventDefault();
      evt.stopPropagation();
      onClick();
    });

    row.addEventListener('keydown', (evt) => {
      if (evt.key === 'Enter' || evt.key === ' ') {
        evt.preventDefault();
        evt.stopPropagation();
        onClick();
      }
    });

    return row;
  }

  private addSeparator(): void {
    if (!this.containerEl) return;
    this.containerEl.createEl('div', {
      cls: 'menu-separator todoseq-date-picker-separator',
    });
  }

  private selectDate(date: Date): void {
    this.selectedDate = DateUtils.getDateOnly(date);
    this.refreshCalendar();
    // Call the callback with the selected date
    this.hide();
    this.callbacks.onDateSelected(
      this.buildSelectedDateTime(),
      this.selectedRepeat,
      this.mode,
    );
  }

  private buildSelectedDateTime(): Date | null {
    if (!this.selectedDate) return null;

    const date = new Date(this.selectedDate);

    if (this.selectedTime) {
      date.setHours(this.selectedTime.hours, this.selectedTime.minutes, 0, 0);
    }

    return date;
  }

  // ─── Date Calculations ─────────────────────────────────────────

  private getNextWeekStart(): Date {
    const today = DateUtils.getDateOnly(new Date());
    const currentDay = today.getDay(); // 0=Sun, 1=Mon, ...
    const targetDay = this.config.weekStartsOn === 'Monday' ? 1 : 0;

    let daysUntilTarget = targetDay - currentDay;
    if (daysUntilTarget <= 0) {
      daysUntilTarget += 7;
    }

    const result = new Date(today);
    result.setDate(result.getDate() + daysUntilTarget);
    return result;
  }

  private getNextWeekend(): Date {
    const today = DateUtils.getDateOnly(new Date());
    const currentDay = today.getDay(); // 0=Sun, 1=Mon, ...6=Sat
    let daysUntilSaturday = 6 - currentDay;
    if (daysUntilSaturday <= 0) {
      daysUntilSaturday += 7;
    }

    const result = new Date(today);
    result.setDate(result.getDate() + daysUntilSaturday);
    return result;
  }
}
