/**
 * @jest-environment jsdom
 */

/**
 * Unit tests for SearchOptionsDropdown history functionality
 * Tests the actual SearchOptionsDropdown class with mocked dependencies
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

// Minimal mock settings interface (avoids importing from settings.ts which has circular deps)
interface MockSettings {
  additionalTaskKeywords: string[];
  includeCodeBlocks: boolean;
  includeCalloutBlocks: boolean;
  includeCommentBlocks: boolean;
  taskListViewMode: 'showAll' | 'sortCompletedLast' | 'hideCompleted';
  futureTaskSorting: 'showAll' | 'showUpcoming' | 'sortToEnd' | 'hideFuture';
  defaultSortMethod:
    | 'default'
    | 'sortByScheduled'
    | 'sortByDeadline'
    | 'sortByPriority'
    | 'sortByUrgency';
  languageCommentSupport: { enabled: boolean };
  weekStartsOn: 'Monday' | 'Sunday';
  formatTaskKeywords: boolean;
}

// Helper to create mock settings
function createMockSettings(): MockSettings {
  return {
    additionalTaskKeywords: [],
    includeCodeBlocks: false,
    includeCalloutBlocks: true,
    includeCommentBlocks: false,
    taskListViewMode: 'showAll',
    futureTaskSorting: 'showAll',
    defaultSortMethod: 'default',
    languageCommentSupport: { enabled: true },
    weekStartsOn: 'Monday',
    formatTaskKeywords: true,
  };
}

// Helper to create mock tasks array
function createMockTasks(): Task[] {
  return [];
}

describe('SearchOptionsDropdown - History Functionality', () => {
  let dropdown: SearchOptionsDropdown;
  let mockInput: HTMLInputElement;
  let mockVault: Record<string, unknown>;
  let mockTasks: Task[];
  let mockSettings: MockSettings;

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
      mockSettings as unknown as import('../src/settings/settings').TodoTrackerSettings,
    );
  });

  afterEach(() => {
    // Clean up the dropdown container from the DOM
    const containers = document.querySelectorAll('.todoseq-dropdown');
    containers.forEach((container) => container.remove());
  });

  describe('addToHistory', () => {
    it('should add a search query to history', () => {
      dropdown.addToHistory('test query');
      expect(dropdown.getHistory()).toEqual(['test query']);
    });

    it('should add most recent query at the top', () => {
      dropdown.addToHistory('first query');
      dropdown.addToHistory('second query');
      expect(dropdown.getHistory()).toEqual(['second query', 'first query']);
    });

    it('should trim whitespace from queries', () => {
      dropdown.addToHistory('  padded query  ');
      expect(dropdown.getHistory()).toEqual(['padded query']);
    });

    it('should not add empty queries', () => {
      dropdown.addToHistory('');
      dropdown.addToHistory('   ');
      expect(dropdown.getHistory()).toEqual([]);
    });

    it('should move existing query to top when re-added', () => {
      dropdown.addToHistory('first');
      dropdown.addToHistory('second');
      dropdown.addToHistory('third');
      dropdown.addToHistory('first');
      expect(dropdown.getHistory()).toEqual(['first', 'third', 'second']);
    });

    it('should enforce maximum history size of 10', () => {
      for (let i = 1; i <= 15; i++) {
        dropdown.addToHistory(`query ${i}`);
      }
      const history = dropdown.getHistory();
      expect(history.length).toBe(10);
      expect(history[0]).toBe('query 15'); // Most recent
      expect(history[9]).toBe('query 6'); // Oldest kept
    });

    it('should not duplicate queries', () => {
      dropdown.addToHistory('duplicate');
      dropdown.addToHistory('duplicate');
      dropdown.addToHistory('duplicate');
      expect(dropdown.getHistory()).toEqual(['duplicate']);
    });
  });

  describe('clearHistory', () => {
    it('should clear all history', () => {
      dropdown.addToHistory('query 1');
      dropdown.addToHistory('query 2');
      dropdown.addToHistory('query 3');
      dropdown.clearHistory();
      expect(dropdown.getHistory()).toEqual([]);
    });

    it('should be safe to call when history is empty', () => {
      expect(() => dropdown.clearHistory()).not.toThrow();
      expect(dropdown.getHistory()).toEqual([]);
    });
  });

  describe('getHistory', () => {
    it('should return a copy of history array', () => {
      dropdown.addToHistory('query');
      const history1 = dropdown.getHistory();
      const history2 = dropdown.getHistory();
      expect(history1).not.toBe(history2); // Different references
      expect(history1).toEqual(history2); // Same content
    });

    it('should return empty array when no history', () => {
      expect(dropdown.getHistory()).toEqual([]);
    });
  });
});
