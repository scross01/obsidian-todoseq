/**
 * @jest-environment jsdom
 */

/**
 * Unit tests for SearchOptionsDropdown - comprehensive coverage
 * Tests all major functionality of the SearchOptionsDropdown class
 */
import { SearchOptionsDropdown } from '../src/view/components/search-options-dropdown';
import { Task } from '../src/types/task';

// Extend HTMLElement with Obsidian's DOM extensions for jsdom
declare global {
  interface HTMLElement {
    addClass: (cls: string) => void;
    removeClass: (cls: string) => void;
    hasClass: (cls: string) => boolean;
    createEl: <K extends keyof HTMLElementTagNameMap>(
      tag: K,
      options?: { cls?: string; attr?: Record<string, string>; text?: string },
    ) => HTMLElementTagNameMap[K];
    createDiv: (options?: {
      cls?: string;
      attr?: Record<string, string>;
    }) => HTMLDivElement;
    createSpan: (options?: { cls?: string; text?: string }) => HTMLSpanElement;
  }
}

// Install Obsidian-style DOM extensions on HTMLElement prototype
beforeAll(() => {
  HTMLElement.prototype.addClass = function (cls: string): void {
    this.classList.add(cls);
  };
  HTMLElement.prototype.removeClass = function (cls: string): void {
    this.classList.remove(cls);
  };
  HTMLElement.prototype.hasClass = function (cls: string): boolean {
    return this.classList.contains(cls);
  };
  HTMLElement.prototype.createEl = function <
    K extends keyof HTMLElementTagNameMap,
  >(
    tag: K,
    options?: { cls?: string; attr?: Record<string, string>; text?: string },
  ): HTMLElementTagNameMap[K] {
    const el = document.createElement(tag);
    if (options?.cls) el.className = options.cls;
    if (options?.attr) {
      for (const [key, value] of Object.entries(options.attr)) {
        el.setAttribute(key, value);
      }
    }
    if (options?.text) el.textContent = options.text;
    this.appendChild(el);
    return el;
  };
  HTMLElement.prototype.createDiv = function (options?: {
    cls?: string;
    attr?: Record<string, string>;
  }): HTMLDivElement {
    return this.createEl('div', options);
  };
  HTMLElement.prototype.createSpan = function (options?: {
    cls?: string;
    text?: string;
  }): HTMLSpanElement {
    return this.createEl('span', options);
  };
});

// Mock setIcon since it's called in the constructor
jest.mock('obsidian', () => ({
  Vault: jest.fn(),
  App: jest.fn(),
  setIcon: jest.fn(),
}));

// Helper to create a mock input element with proper bounding rect
function createMockInput(): HTMLInputElement {
  const input = document.createElement('input');
  input.type = 'text';
  document.body.appendChild(input);
  // Mock getBoundingClientRect since jsdom doesn't implement layout
  input.getBoundingClientRect = () => ({
    width: 300,
    height: 30,
    top: 100,
    left: 50,
    bottom: 130,
    right: 350,
    x: 50,
    y: 100,
    toJSON: () => ({}),
  });
  return input;
}

// Helper to create mock vault
function createMockVault(): Record<string, unknown> {
  return {};
}

import {
  TodoTrackerSettings,
  DefaultSettings,
} from '../src/settings/settings-types';

// Helper to create mock settings (based on DefaultSettings)
function createMockSettings(): TodoTrackerSettings {
  return {
    ...DefaultSettings,
  };
}

// Helper to create mock tasks array
function createMockTasks(): Task[] {
  return [];
}

describe('SearchOptionsDropdown - Comprehensive Tests', () => {
  let dropdown: SearchOptionsDropdown;
  let mockInput: HTMLInputElement;
  let mockVault: Record<string, unknown>;
  let mockTasks: Task[];
  let mockSettings: TodoTrackerSettings;

  beforeEach(() => {
    // Clean up any existing dropdown containers from previous tests
    document.body.innerHTML = '';

    mockInput = createMockInput();
    mockVault = createMockVault();
    mockTasks = createMockTasks();
    mockSettings = createMockSettings();

    dropdown = new SearchOptionsDropdown(
      mockInput,
      mockVault as unknown as import('obsidian').Vault,
      mockTasks,
      mockSettings as unknown as import('../src/settings/settings-types').TodoTrackerSettings,
    );
  });

  afterEach(() => {
    // Clean up the dropdown container from the DOM
    const containers = document.querySelectorAll('.todoseq-dropdown');
    containers.forEach((container) => container.remove());
  });

  describe('Initialization', () => {
    it('should initialize with default state', () => {
      expect(dropdown.isVisible()).toBe(false);
      expect(dropdown.getHistory()).toEqual([]);
    });

    it('should create container element in DOM', () => {
      const container = document.querySelector('.todoseq-dropdown');
      expect(container).not.toBeNull();
    });
  });

  describe('Visibility Methods', () => {
    it('should show and hide the dropdown', () => {
      dropdown.show();
      expect(dropdown.isVisible()).toBe(true);

      dropdown.hide();
      expect(dropdown.isVisible()).toBe(false);
    });

    it('should notify callback on visibility change', () => {
      const callback = jest.fn();
      dropdown.setOnVisibilityChange(callback);

      dropdown.show();
      expect(callback).toHaveBeenCalledWith(true);

      dropdown.hide();
      expect(callback).toHaveBeenCalledWith(false);
      expect(callback).toHaveBeenCalledTimes(2);
    });
  });

  describe('Positioning Methods', () => {
    it('should update width to match input', () => {
      const container = document.querySelector('.todoseq-dropdown');
      expect(container).not.toBeNull();
      if (container) {
        // Mock getBoundingClientRect to return known width
        const mockRect = {
          width: 400,
          height: 30,
          top: 100,
          left: 50,
          bottom: 130,
          right: 450,
          x: 50,
          y: 100,
          toJSON: () => ({}),
        };
        mockInput.getBoundingClientRect = jest.fn().mockReturnValue(mockRect);

        // Call updateWidth directly
        // @ts-ignore - accessing private method for testing
        dropdown.updateWidth();

        expect((container as HTMLElement).style.width).toBe('400px');
      }
    });

    it('should update position below input', () => {
      const container = document.querySelector('.todoseq-dropdown');
      expect(container).not.toBeNull();
      if (container) {
        // Mock scroll positions
        const originalScrollX = window.scrollX;
        const originalScrollY = window.scrollY;
        Object.defineProperty(window, 'scrollX', {
          value: 100,
          writable: true,
        });
        Object.defineProperty(window, 'scrollY', {
          value: 200,
          writable: true,
        });

        // Call updatePosition directly
        dropdown.updatePosition();

        expect((container as HTMLElement).style.left).toBe('150px'); // 100 (scrollX) + 50 (input left)
        expect((container as HTMLElement).style.top).toBe('332px'); // 200 (scrollY) + 130 (input bottom) + 2

        // Restore original values
        Object.defineProperty(window, 'scrollX', {
          value: originalScrollX,
          writable: true,
        });
        Object.defineProperty(window, 'scrollY', {
          value: originalScrollY,
          writable: true,
        });
      }
    });
  });

  describe('Rendering Methods', () => {
    it('should render options dropdown with suggestions', async () => {
      await dropdown.showOptionsDropdown();

      const container = document.querySelector('.todoseq-dropdown');
      expect(container).not.toBeNull();

      const suggestionItems = container?.querySelectorAll(
        '.search-suggest-item:not(.mod-group)',
      );
      expect(suggestionItems?.length).toBeGreaterThan(0);
    });

    it('should render search options with descriptions', async () => {
      await dropdown.showOptionsDropdown();

      const container = document.querySelector('.todoseq-dropdown');
      const infoTexts = container?.querySelectorAll(
        '.search-suggest-info-text',
      );
      expect(infoTexts?.length).toBeGreaterThan(0);
    });

    it('should render history section when history exists', async () => {
      dropdown.addToHistory('test query');
      await dropdown.showOptionsDropdown();

      const container = document.querySelector('.todoseq-dropdown');
      const historyItems = container?.querySelectorAll(
        '.search-suggest-history-item',
      );
      expect(historyItems?.length).toBe(1);
    });
  });

  describe('Search History Methods', () => {
    it('should render history items with correct text', async () => {
      dropdown.addToHistory('test query');
      await dropdown.showOptionsDropdown();

      const container = document.querySelector('.todoseq-dropdown');
      const historyItem = container?.querySelector(
        '.search-suggest-history-item',
      );
      expect(historyItem?.textContent?.includes('test query')).toBe(true);
    });
  });

  describe('Prefix Description', () => {
    it('should return correct descriptions for known prefixes', () => {
      // @ts-ignore - accessing private method for testing
      expect(dropdown.getPrefixDescription('path:')).toBe(
        'match path of the file',
      );
      // @ts-ignore - accessing private method for testing
      expect(dropdown.getPrefixDescription('file:')).toBe('match file name');
      // @ts-ignore - accessing private method for testing
      expect(dropdown.getPrefixDescription('tag:')).toBe('search for tags');
      // @ts-ignore - accessing private method for testing
      expect(dropdown.getPrefixDescription('state:')).toBe('match task state');
      // @ts-ignore - accessing private method for testing
      expect(dropdown.getPrefixDescription('priority:')).toBe(
        'match task priority',
      );
      // @ts-ignore - accessing private method for testing
      expect(dropdown.getPrefixDescription('content:')).toBe(
        'match task content',
      );
      // @ts-ignore - accessing private method for testing
      expect(dropdown.getPrefixDescription('scheduled:')).toBe(
        'filter by scheduled date',
      );
      // @ts-ignore - accessing private method for testing
      expect(dropdown.getPrefixDescription('deadline:')).toBe(
        'filter by deadline date',
      );
      // @ts-ignore - accessing private method for testing
      expect(dropdown.getPrefixDescription('[]')).toBe('match page property');
    });

    it('should return empty string for unknown prefix', () => {
      // @ts-ignore - accessing private method for testing
      expect(dropdown.getPrefixDescription('unknown:')).toBe('');
    });
  });

  describe('Event Listeners', () => {
    it('should setup and cleanup event listeners', () => {
      // Test that cleanup removes container from DOM
      const container = document.querySelector('.todoseq-dropdown');
      expect(container).not.toBeNull();

      dropdown.cleanup();

      const removedContainer = document.querySelector('.todoseq-dropdown');
      expect(removedContainer).toBeNull();
    });
  });

  describe('Selection Handling', () => {
    it('should handle selection of search options', async () => {
      await dropdown.showOptionsDropdown();

      // Simulate selection of "path:" option
      // @ts-ignore - accessing private method for testing
      dropdown.handleSelection('path:');

      expect(mockInput.value).toBe('path:');
      expect(mockInput.selectionStart).toBe(5);
      expect(mockInput.selectionEnd).toBe(5);
    });

    it('should handle property search selection with cursor positioning', async () => {
      await dropdown.showOptionsDropdown();

      // Simulate selection of property search option
      // @ts-ignore - accessing private method for testing
      dropdown.handleSelection('[]');

      expect(mockInput.value).toBe('[]');
      expect(mockInput.selectionStart).toBe(1);
      expect(mockInput.selectionEnd).toBe(1);
    });
  });

  describe('Keyboard Navigation', () => {
    it('should handle ArrowDown key to move selection', async () => {
      await dropdown.showOptionsDropdown();

      const initialIndex = dropdown['selectedIndex'];
      expect(initialIndex).toBe(-1);

      const event = new KeyboardEvent('keydown', { key: 'ArrowDown' });
      dropdown.handleKeyDown(event);

      expect(dropdown['selectedIndex']).toBe(0);
    });

    it('should handle ArrowUp key to move selection', async () => {
      await dropdown.showOptionsDropdown();

      // Move to first item
      const eventDown = new KeyboardEvent('keydown', { key: 'ArrowDown' });
      dropdown.handleKeyDown(eventDown);
      expect(dropdown['selectedIndex']).toBe(0);

      // Move up from first item should go to -1
      const eventUp = new KeyboardEvent('keydown', { key: 'ArrowUp' });
      dropdown.handleKeyDown(eventUp);
      expect(dropdown['selectedIndex']).toBe(-1);
    });

    it('should handle Escape key to hide dropdown', async () => {
      await dropdown.showOptionsDropdown();
      dropdown.show();
      expect(dropdown.isVisible()).toBe(true);

      const event = new KeyboardEvent('keydown', { key: 'Escape' });
      dropdown.handleKeyDown(event);

      expect(dropdown.isVisible()).toBe(false);
    });
  });

  describe('Focus Management', () => {
    it('should get focusable elements from dropdown', async () => {
      await dropdown.showOptionsDropdown();

      // @ts-ignore - accessing private method for testing
      const focusableElements = dropdown.getFocusableElements();
      expect(Array.isArray(focusableElements)).toBe(true);
    });
  });

  describe('Integration Tests', () => {
    it('should handle complete flow: show -> select -> hide', async () => {
      await dropdown.showOptionsDropdown();
      dropdown.show();
      expect(dropdown.isVisible()).toBe(true);

      // @ts-ignore - accessing private method for testing
      dropdown.handleSelection('tag:');

      expect(mockInput.value).toBe('tag:');
    });
  });
});
