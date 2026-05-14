/**
 * @jest-environment jsdom
 */

import { isPhoneDevice } from '../src/utils/mobile-utils';
import { TABLET_BREAKPOINT } from '../src/utils/constants';

let mockIsMobile = false;

jest.mock('obsidian', () => ({
  Platform: {
    get isMobile() {
      return mockIsMobile;
    },
  },
}));

function setViewportWidth(width: number): void {
  Object.defineProperty(window, 'innerWidth', {
    value: width,
    writable: true,
    configurable: true,
  });
}

describe('isPhoneDevice', () => {
  beforeEach(() => {
    mockIsMobile = false;
  });

  it('returns false on desktop regardless of viewport width', () => {
    setViewportWidth(375);
    expect(isPhoneDevice()).toBe(false);

    setViewportWidth(1920);
    expect(isPhoneDevice()).toBe(false);
  });

  it('returns false on mobile when viewport exceeds breakpoint (tablet)', () => {
    mockIsMobile = true;
    setViewportWidth(TABLET_BREAKPOINT + 1);
    expect(isPhoneDevice()).toBe(false);

    setViewportWidth(1024);
    expect(isPhoneDevice()).toBe(false);
  });

  it('returns true on mobile when viewport equals breakpoint', () => {
    mockIsMobile = true;
    setViewportWidth(TABLET_BREAKPOINT);
    expect(isPhoneDevice()).toBe(true);
  });

  it('returns true on mobile with narrow viewport', () => {
    mockIsMobile = true;
    setViewportWidth(375);
    expect(isPhoneDevice()).toBe(true);
  });

  it('returns true on mobile with typical large phone viewport', () => {
    mockIsMobile = true;
    setViewportWidth(430);
    expect(isPhoneDevice()).toBe(true);
  });

  it('returns true on mobile at boundary between phone and tablet widths', () => {
    mockIsMobile = true;
    setViewportWidth(600);
    expect(isPhoneDevice()).toBe(true);
  });
});
