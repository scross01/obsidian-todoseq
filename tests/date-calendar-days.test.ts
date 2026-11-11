/**
 * Relative date labels and row status classes count local calendar days.
 * Process-level timezone runs (Toronto/UTC/Tokyo) are recorded separately;
 * these fixtures use local constructors only.
 */

import { DateUtils } from '../src/utils/date-utils';

describe('calendar-day relative labels', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  function freeze(year: number, month: number, day: number): void {
    jest
      .useFakeTimers()
      .setSystemTime(DateUtils.createDate(year, month, day, 12, 0, 0));
  }

  function label(year: number, month: number, day: number): string {
    return DateUtils.formatDateForDisplay(
      DateUtils.createDate(year, month, day),
    );
  }

  it('labels the days after the November 2026 transition once each', () => {
    freeze(2026, 10, 1);
    expect(label(2026, 10, 1)).toBe('Today');
    expect(label(2026, 10, 2)).toBe('Tomorrow');
    expect(label(2026, 10, 3)).toBe('2 days from now');
    expect(label(2026, 9, 31)).toBe('Yesterday');
    expect(label(2026, 9, 30)).toBe('2 days ago');
  });

  it('labels the days after the March 2026 transition once each', () => {
    freeze(2026, 2, 8);
    expect(label(2026, 2, 9)).toBe('Tomorrow');
    expect(label(2026, 2, 10)).toBe('2 days from now');
  });

  it('handles month, year and leap boundaries', () => {
    freeze(2026, 11, 31);
    expect(label(2027, 0, 1)).toBe('Tomorrow');
    freeze(2028, 1, 28);
    expect(label(2028, 1, 29)).toBe('Tomorrow');
  });

  it('counts dates across midnight', () => {
    jest
      .useFakeTimers()
      .setSystemTime(DateUtils.createDate(2026, 10, 1, 23, 59, 30));
    expect(label(2026, 10, 2)).toBe('Tomorrow');
    expect(
      DateUtils.calendarDayDifference(DateUtils.createDate(2026, 10, 2)),
    ).toBe(1);
  });

  it('returns signed calendar distances beyond a week', () => {
    freeze(2026, 10, 1);
    expect(
      DateUtils.calendarDayDifference(DateUtils.createDate(2026, 10, 8)),
    ).toBe(7);
    expect(
      DateUtils.calendarDayDifference(DateUtils.createDate(2026, 10, 9)),
    ).toBe(8);
    expect(
      DateUtils.calendarDayDifference(DateUtils.createDate(2026, 9, 30)),
    ).toBe(-2);
  });
});
