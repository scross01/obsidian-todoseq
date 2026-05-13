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
    // Clean up DOM
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
});
