/**
 * @jest-environment jsdom
 */

import { SearchOptionsDropdown } from '../src/view/components/search-options-dropdown';
import { Task } from '../src/types/task';
import { installObsidianDomMocks } from './helpers/obsidian-dom-mock';

beforeAll(() => {
  installObsidianDomMocks();
});

jest.mock('obsidian', () => ({
  Vault: jest.fn(),
  App: jest.fn(),
  setIcon: jest.fn(),
}));

import {
  DefaultSettings,
  TodoTrackerSettings,
} from '../src/settings/settings-types';

function createMockInput(): HTMLInputElement {
  const input = activeDocument.createElement('input');
  input.type = 'text';
  activeDocument.body.appendChild(input);
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

function createDropdown(
  input?: HTMLInputElement,
  suggestionDropdown?: unknown,
): SearchOptionsDropdown {
  const mockInput = input ?? createMockInput();
  return new SearchOptionsDropdown(
    mockInput,
    {} as import('obsidian').Vault,
    [] as Task[],
    { ...DefaultSettings } as TodoTrackerSettings,
    suggestionDropdown as never,
  );
}

describe('SearchOptionsDropdown - Coverage Gap Tests', () => {
  let mockInput: HTMLInputElement;

  beforeEach(() => {
    activeDocument.body.innerHTML = '';
    jest.useFakeTimers();
    mockInput = createMockInput();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('updateTasks', () => {
    it('should store updated tasks', () => {
      const dropdown = createDropdown();
      const tasks: Task[] = [{ id: '1' } as Task];
      dropdown.updateTasks(tasks);
      expect(dropdown['tasks']).toBe(tasks);
    });
  });

  describe('shouldPreventHide', () => {
    it('returns true when isHandlingPrefixSelection is true', () => {
      const dropdown = createDropdown();
      expect(dropdown.isVisible()).toBe(false);

      dropdown.isHandlingPrefixSelection = true;
      dropdown.show();

      expect(dropdown.isVisible()).toBe(true);

      dropdown.isHandlingPrefixSelection = false;
    });
  });

  describe('showOptionsDropdown with search term', () => {
    it('filters suggestions when search term provided', async () => {
      const dropdown = createDropdown();
      await dropdown.showOptionsDropdown('pat');
      const items = dropdown['currentSuggestions'];
      expect(items.length).toBeLessThan(10);
      expect(items.some((s) => s.includes('path:'))).toBe(true);
    });

    it('returns all options when search term is empty', async () => {
      const dropdown = createDropdown();
      await dropdown.showOptionsDropdown('');
      expect(dropdown['currentSuggestions'].length).toBe(10);
    });

    it('returns empty array for non-matching search term', async () => {
      const dropdown = createDropdown();
      await dropdown.showOptionsDropdown('zzzznonexistent');
      expect(dropdown['currentSuggestions']).toEqual([]);
    });
  });

  describe('renderDropdown - empty suggestions', () => {
    it('renders no suggestion items when suggestions are empty', async () => {
      const dropdown = createDropdown();
      await dropdown.showOptionsDropdown('zzzznonexistent');
      const container = dropdown['containerEl'];
      const items = container.querySelectorAll(
        '.search-suggest-item:not(.mod-group)',
      );
      expect(items.length).toBe(0);
    });
  });

  describe('renderDropdown - title item click', () => {
    it('stops propagation on title item click', async () => {
      const dropdown = createDropdown();
      await dropdown.showOptionsDropdown();

      const titleItem = dropdown['containerEl'].querySelector('.mod-group');
      expect(titleItem).not.toBeNull();

      const event = new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
      });
      const spy = jest.spyOn(event, 'stopPropagation');
      const preventSpy = jest.spyOn(event, 'preventDefault');
      titleItem!.dispatchEvent(event);

      expect(preventSpy).toHaveBeenCalled();
      expect(spy).toHaveBeenCalled();
    });
  });

  describe('renderDropdown - info icon click', () => {
    it('opens docs URL on icon click and stops propagation', async () => {
      const dropdown = createDropdown();
      await dropdown.showOptionsDropdown();

      const iconContainer = dropdown['containerEl'].querySelector(
        '.search-suggest-icon',
      ) as HTMLElement;
      expect(iconContainer).not.toBeNull();

      const mockOpen = jest.fn();
      jest.spyOn(window, 'open').mockImplementation(mockOpen);

      const clickEvent = new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
      });
      const stopSpy = jest.spyOn(clickEvent, 'stopPropagation');
      const preventSpy = jest.spyOn(clickEvent, 'preventDefault');

      iconContainer.dispatchEvent(clickEvent);
      expect(mockOpen).toHaveBeenCalled();
      expect(stopSpy).toHaveBeenCalled();
      expect(preventSpy).toHaveBeenCalled();

      (window.open as jest.Mock).mockRestore();
    });

    it('prevents default on icon mousedown', async () => {
      const dropdown = createDropdown();
      await dropdown.showOptionsDropdown();

      const iconContainer = dropdown['containerEl'].querySelector(
        '.search-suggest-icon',
      ) as HTMLElement;

      const mousedownEvent = new MouseEvent('mousedown', {
        bubbles: true,
        cancelable: true,
      });
      const preventSpy = jest.spyOn(mousedownEvent, 'preventDefault');
      const stopSpy = jest.spyOn(mousedownEvent, 'stopPropagation');

      iconContainer.dispatchEvent(mousedownEvent);
      expect(preventSpy).toHaveBeenCalled();
      expect(stopSpy).toHaveBeenCalled();
    });
  });

  describe('renderDropdown - suggestion item events', () => {
    it('sets isHandlingPrefixSelection for prefix mousedown', async () => {
      const dropdown = createDropdown();
      await dropdown.showOptionsDropdown();

      const items = dropdown['containerEl'].querySelectorAll(
        '.search-suggest-item:not(.mod-group)',
      );

      const mousedownEvent = new MouseEvent('mousedown', {
        bubbles: true,
        cancelable: true,
      });
      jest.spyOn(mousedownEvent, 'preventDefault');

      items[0].dispatchEvent(mousedownEvent);
      expect(dropdown.isHandlingPrefixSelection).toBe(true);
    });

    it('does not set isHandlingPrefixSelection for non-prefix mousedown', async () => {
      const dropdown = createDropdown();
      await dropdown.showOptionsDropdown();

      const items = dropdown['containerEl'].querySelectorAll(
        '.search-suggest-item:not(.mod-group)',
      );

      const lastItem = items[items.length - 1];

      const mousedownEvent = new MouseEvent('mousedown', {
        bubbles: true,
        cancelable: true,
      });
      jest.spyOn(mousedownEvent, 'preventDefault');

      dropdown.isHandlingPrefixSelection = false;
      lastItem.dispatchEvent(mousedownEvent);
    });

    it('stops propagation on suggestion click', async () => {
      const dropdown = createDropdown();
      await dropdown.showOptionsDropdown();

      const items = dropdown['containerEl'].querySelectorAll(
        '.search-suggest-item:not(.mod-group)',
      );

      const clickEvent = new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
      });
      const stopSpy = jest.spyOn(clickEvent, 'stopPropagation');
      const preventSpy = jest.spyOn(clickEvent, 'preventDefault');

      items[0].dispatchEvent(clickEvent);
      expect(stopSpy).toHaveBeenCalled();
      expect(preventSpy).toHaveBeenCalled();
    });

    it('updates selectedIndex on mouseover', async () => {
      const dropdown = createDropdown();
      await dropdown.showOptionsDropdown();

      const items = dropdown['containerEl'].querySelectorAll(
        '.search-suggest-item:not(.mod-group)',
      );

      items[2].dispatchEvent(new MouseEvent('mouseover'));
      expect(dropdown['selectedIndex']).toBe(2);

      const selectedItems =
        dropdown['containerEl'].querySelectorAll('.is-selected');
      expect(selectedItems.length).toBe(1);
    });
  });

  describe('renderHistorySection events', () => {
    it('stops propagation on history header click', async () => {
      const dropdown = createDropdown();
      dropdown.addToHistory('test query');
      await dropdown.showOptionsDropdown();

      const headers = dropdown['containerEl'].querySelectorAll('.mod-group');
      const historyHeader = headers[1];
      expect(historyHeader).not.toBeNull();

      const clickEvent = new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
      });
      const stopSpy = jest.spyOn(clickEvent, 'stopPropagation');
      const preventSpy = jest.spyOn(clickEvent, 'preventDefault');

      historyHeader!.dispatchEvent(clickEvent);
      expect(stopSpy).toHaveBeenCalled();
      expect(preventSpy).toHaveBeenCalled();
    });

    it('clears history on clear button click', async () => {
      const dropdown = createDropdown();
      dropdown.addToHistory('query1');
      dropdown.addToHistory('query2');
      await dropdown.showOptionsDropdown();

      expect(dropdown.getHistory().length).toBe(2);

      const clearBtn = dropdown['containerEl'].querySelector(
        '[aria-label="Clear history"]',
      ) as HTMLElement;

      const mousedownEvent = new MouseEvent('mousedown', {
        bubbles: true,
        cancelable: true,
      });
      jest.spyOn(mousedownEvent, 'preventDefault');
      jest.spyOn(mousedownEvent, 'stopPropagation');
      clearBtn.dispatchEvent(mousedownEvent);

      const clickEvent = new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
      });
      const stopSpy = jest.spyOn(clickEvent, 'stopPropagation');
      const preventSpy = jest.spyOn(clickEvent, 'preventDefault');
      clearBtn.dispatchEvent(clickEvent);

      expect(preventSpy).toHaveBeenCalled();
      expect(stopSpy).toHaveBeenCalled();

      jest.runAllTimers();
      expect(dropdown.getHistory()).toEqual([]);
    });

    it('handles history item mousedown to select query', async () => {
      const dropdown = createDropdown(mockInput);
      dropdown.addToHistory('path:foo bar');
      await dropdown.showOptionsDropdown();

      const historyItems = dropdown['containerEl'].querySelectorAll(
        '.search-suggest-history-item',
      );
      expect(historyItems.length).toBe(1);

      const mousedownEvent = new MouseEvent('mousedown', {
        bubbles: true,
        cancelable: true,
      });
      jest.spyOn(mousedownEvent, 'preventDefault');

      historyItems[0].dispatchEvent(mousedownEvent);

      expect(mockInput.value).toBe('path:foo bar');
      expect(mockInput.selectionStart).toBe('path:foo bar'.length);
      expect(dropdown.isVisible()).toBe(false);
    });

    it('dispatches input event after history selection', async () => {
      const dropdown = createDropdown(mockInput);
      dropdown.addToHistory('tag:work');
      await dropdown.showOptionsDropdown();

      const historyItems = dropdown['containerEl'].querySelectorAll(
        '.search-suggest-history-item',
      );

      const inputListener = jest.fn();
      mockInput.addEventListener('input', inputListener);

      historyItems[0].dispatchEvent(
        new MouseEvent('mousedown', { bubbles: true, cancelable: true }),
      );

      jest.runAllTimers();
      expect(inputListener).toHaveBeenCalled();
    });

    it('stops propagation on history item click', async () => {
      const dropdown = createDropdown();
      dropdown.addToHistory('test');
      await dropdown.showOptionsDropdown();

      const historyItems = dropdown['containerEl'].querySelectorAll(
        '.search-suggest-history-item',
      );

      const clickEvent = new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
      });
      const stopSpy = jest.spyOn(clickEvent, 'stopPropagation');
      const preventSpy = jest.spyOn(clickEvent, 'preventDefault');

      historyItems[0].dispatchEvent(clickEvent);
      expect(stopSpy).toHaveBeenCalled();
      expect(preventSpy).toHaveBeenCalled();
    });

    it('updates selectedIndex on history item mouseover', async () => {
      const dropdown = createDropdown();
      dropdown.addToHistory('query1');
      dropdown.addToHistory('query2');
      await dropdown.showOptionsDropdown();

      const historyItems = dropdown['containerEl'].querySelectorAll(
        '.search-suggest-history-item',
      );

      historyItems[0].dispatchEvent(new MouseEvent('mouseover'));
      expect(dropdown['selectedIndex']).toBe(10);

      const selectedAfter = dropdown['containerEl'].querySelectorAll(
        '.search-suggest-item:not(.mod-group).is-selected',
      );
      expect(selectedAfter.length).toBe(1);
    });
  });

  describe('handleKeyDown - Enter', () => {
    it('selects suggestion with Enter key', async () => {
      const dropdown = createDropdown(mockInput);
      await dropdown.showOptionsDropdown();

      dropdown.handleKeyDown(
        new KeyboardEvent('keydown', { key: 'ArrowDown' }),
      );
      expect(dropdown['selectedIndex']).toBe(0);

      const enterEvent = new KeyboardEvent('keydown', {
        key: 'Enter',
        bubbles: true,
        cancelable: true,
      });
      const preventSpy = jest.spyOn(enterEvent, 'preventDefault');
      const result = dropdown.handleKeyDown(enterEvent);

      expect(result).toBe(true);
      expect(preventSpy).toHaveBeenCalled();
      expect(mockInput.value).toBeTruthy();
    });

    it('selects history item with Enter key', async () => {
      const dropdown = createDropdown(mockInput);
      dropdown.addToHistory('history query');
      await dropdown.showOptionsDropdown();

      for (let i = 0; i <= 10; i++) {
        dropdown.handleKeyDown(
          new KeyboardEvent('keydown', { key: 'ArrowDown' }),
        );
      }
      expect(dropdown['selectedIndex']).toBe(10);

      const enterEvent = new KeyboardEvent('keydown', {
        key: 'Enter',
        cancelable: true,
      });
      const result = dropdown.handleKeyDown(enterEvent);
      expect(result).toBe(true);

      expect(mockInput.value).toBe('history query');
    });

    it('returns false for Enter with no selection', async () => {
      const dropdown = createDropdown();
      await dropdown.showOptionsDropdown();

      const result = dropdown.handleKeyDown(
        new KeyboardEvent('keydown', { key: 'Enter' }),
      );
      expect(result).toBe(false);
    });

    it('returns false when not showing', () => {
      const dropdown = createDropdown();
      const result = dropdown.handleKeyDown(
        new KeyboardEvent('keydown', { key: 'Enter' }),
      );
      expect(result).toBe(false);
    });
  });

  describe('handleKeyDown - Tab', () => {
    it('selects suggestion with Tab key', async () => {
      const dropdown = createDropdown(mockInput);
      await dropdown.showOptionsDropdown();

      dropdown.handleKeyDown(
        new KeyboardEvent('keydown', { key: 'ArrowDown' }),
      );

      const tabEvent = new KeyboardEvent('keydown', {
        key: 'Tab',
        cancelable: true,
      });
      const preventSpy = jest.spyOn(tabEvent, 'preventDefault');
      const result = dropdown.handleKeyDown(tabEvent);

      expect(result).toBe(true);
      expect(preventSpy).toHaveBeenCalled();
    });

    it('selects history item with Tab key', async () => {
      const dropdown = createDropdown(mockInput);
      dropdown.addToHistory('tab history');
      await dropdown.showOptionsDropdown();

      for (let i = 0; i <= 10; i++) {
        dropdown.handleKeyDown(
          new KeyboardEvent('keydown', { key: 'ArrowDown' }),
        );
      }

      const tabEvent = new KeyboardEvent('keydown', {
        key: 'Tab',
        cancelable: true,
      });
      const result = dropdown.handleKeyDown(tabEvent);
      expect(result).toBe(true);
      expect(mockInput.value).toBe('tab history');
    });

    it('returns false for Tab with no selection', async () => {
      const dropdown = createDropdown();
      await dropdown.showOptionsDropdown();

      const result = dropdown.handleKeyDown(
        new KeyboardEvent('keydown', { key: 'Tab' }),
      );
      expect(result).toBe(false);
    });
  });

  describe('handleSelection - with existing input text', () => {
    it('replaces the word at cursor position', async () => {
      const dropdown = createDropdown(mockInput);
      await dropdown.showOptionsDropdown();

      mockInput.value = 'hello path:old';
      mockInput.selectionStart = 15;
      mockInput.selectionEnd = 15;

      dropdown['handleSelection']('tag:');

      expect(mockInput.value).toBe('hello tag:');
      expect(mockInput.selectionStart).toBe(10);
    });

    it('replaces from start when cursor is at beginning of word', async () => {
      const dropdown = createDropdown(mockInput);
      await dropdown.showOptionsDropdown();

      mockInput.value = 'tag:old rest';
      mockInput.selectionStart = 7;
      mockInput.selectionEnd = 7;

      dropdown['handleSelection']('path:');

      expect(mockInput.value).toBe('path: rest');
    });

    it('dispatches input event after selection', async () => {
      const dropdown = createDropdown(mockInput);
      await dropdown.showOptionsDropdown();

      const inputListener = jest.fn();
      mockInput.addEventListener('input', inputListener);

      dropdown['handleSelection']('path:');

      jest.advanceTimersByTime(200);
      expect(inputListener).toHaveBeenCalled();
    });

    it('hides dropdown for prefix selections and shows suggestion dropdown', async () => {
      const mockSuggestionDropdown = {
        isHandlingPrefixSelection: false,
        showPrefixDropdown: jest.fn().mockResolvedValue(undefined),
      };

      const dropdown = createDropdown(mockInput, mockSuggestionDropdown);
      await dropdown.showOptionsDropdown();
      dropdown.show();
      expect(dropdown.isVisible()).toBe(true);

      dropdown['handleSelection']('path:');

      expect(dropdown.isVisible()).toBe(false);
      expect(dropdown.isHandlingPrefixSelection).toBe(true);
      expect(mockSuggestionDropdown.isHandlingPrefixSelection).toBe(true);
      expect(mockSuggestionDropdown.showPrefixDropdown).toHaveBeenCalledWith(
        'path:',
        '',
      );
    });

    it('shows property prefix for [] selection', async () => {
      const mockSuggestionDropdown = {
        isHandlingPrefixSelection: false,
        showPrefixDropdown: jest.fn().mockResolvedValue(undefined),
      };

      const dropdown = createDropdown(mockInput, mockSuggestionDropdown);
      await dropdown.showOptionsDropdown();

      dropdown['handleSelection']('[]');

      expect(mockSuggestionDropdown.showPrefixDropdown).toHaveBeenCalledWith(
        'property:',
        '',
      );
    });

    it('resets isHandlingPrefixSelection on next keydown', async () => {
      const mockSuggestionDropdown = {
        isHandlingPrefixSelection: false,
        showPrefixDropdown: jest.fn().mockResolvedValue(undefined),
      };

      const dropdown = createDropdown(mockInput, mockSuggestionDropdown);
      await dropdown.showOptionsDropdown();

      dropdown['handleSelection']('path:');
      expect(dropdown.isHandlingPrefixSelection).toBe(true);

      mockInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
      expect(dropdown.isHandlingPrefixSelection).toBe(false);
    });

    it('resets flag immediately for non-prefix selection', async () => {
      const dropdown = createDropdown(mockInput);
      await dropdown.showOptionsDropdown();

      dropdown.isHandlingPrefixSelection = true;

      dropdown['handleSelection']('tag:with space');

      expect(dropdown.isHandlingPrefixSelection).toBe(false);
    });
  });

  describe('setupKeyboardNavigation - container keydown', () => {
    it('traps Tab focus by wrapping from last to first element', async () => {
      const dropdown = createDropdown(mockInput);
      await dropdown.showOptionsDropdown();

      const container = dropdown['containerEl'];
      const el1 = activeDocument.createElement('button');
      const el2 = activeDocument.createElement('button');
      container.appendChild(el1);
      container.appendChild(el2);

      Object.defineProperty(activeDocument, 'activeElement', {
        value: el2,
        configurable: true,
      });

      const tabEvent = new KeyboardEvent('keydown', {
        key: 'Tab',
        bubbles: true,
        cancelable: true,
      });
      const preventSpy = jest.spyOn(tabEvent, 'preventDefault');
      const focusSpy = jest.spyOn(el1, 'focus');

      container.dispatchEvent(tabEvent);
      expect(preventSpy).toHaveBeenCalled();
      expect(focusSpy).toHaveBeenCalled();
    });

    it('traps Shift+Tab focus by wrapping from first to last element', async () => {
      const dropdown = createDropdown(mockInput);
      await dropdown.showOptionsDropdown();

      const container = dropdown['containerEl'];
      const el1 = activeDocument.createElement('button');
      const el2 = activeDocument.createElement('button');
      container.appendChild(el1);
      container.appendChild(el2);

      Object.defineProperty(activeDocument, 'activeElement', {
        value: el1,
        configurable: true,
      });

      const shiftTabEvent = new KeyboardEvent('keydown', {
        key: 'Tab',
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      });
      const preventSpy = jest.spyOn(shiftTabEvent, 'preventDefault');
      const focusSpy = jest.spyOn(el2, 'focus');

      container.dispatchEvent(shiftTabEvent);
      expect(preventSpy).toHaveBeenCalled();
      expect(focusSpy).toHaveBeenCalled();
    });

    it('navigates focus with ArrowDown in container', async () => {
      const dropdown = createDropdown(mockInput);
      await dropdown.showOptionsDropdown();

      const container = dropdown['containerEl'];
      const el1 = activeDocument.createElement('button');
      container.appendChild(el1);

      Object.defineProperty(activeDocument, 'activeElement', {
        value: null,
        configurable: true,
      });

      const focusSpy = jest.spyOn(el1, 'focus');
      const arrowDown = new KeyboardEvent('keydown', {
        key: 'ArrowDown',
        bubbles: true,
        cancelable: true,
      });

      container.dispatchEvent(arrowDown);
      expect(focusSpy).toHaveBeenCalled();
    });

    it('navigates focus with ArrowUp in container', async () => {
      const dropdown = createDropdown(mockInput);
      await dropdown.showOptionsDropdown();

      const container = dropdown['containerEl'];
      const el1 = activeDocument.createElement('button');
      const el2 = activeDocument.createElement('button');
      container.appendChild(el1);
      container.appendChild(el2);

      Object.defineProperty(activeDocument, 'activeElement', {
        value: el2,
        configurable: true,
      });

      const focusSpy = jest.spyOn(el1, 'focus');
      const arrowUp = new KeyboardEvent('keydown', {
        key: 'ArrowUp',
        bubbles: true,
        cancelable: true,
      });

      container.dispatchEvent(arrowUp);
      expect(focusSpy).toHaveBeenCalled();
    });

    it('hides dropdown on Escape from container', async () => {
      const dropdown = createDropdown(mockInput);
      await dropdown.showOptionsDropdown();
      dropdown.show();
      expect(dropdown.isVisible()).toBe(true);

      const container = dropdown['containerEl'];
      const escapeEvent = new KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true,
        cancelable: true,
      });

      container.dispatchEvent(escapeEvent);
      expect(dropdown.isVisible()).toBe(false);
    });
  });

  describe('getTotalItems', () => {
    it('returns suggestion count + history count', async () => {
      const dropdown = createDropdown();
      dropdown.addToHistory('query1');
      dropdown.addToHistory('query2');
      await dropdown.showOptionsDropdown();

      expect(dropdown['getTotalItems']()).toBe(12);
    });
  });

  describe('clearHistory while showing', () => {
    it('re-renders dropdown when clearHistory is called while visible', async () => {
      const dropdown = createDropdown();
      dropdown.addToHistory('query1');
      await dropdown.showOptionsDropdown();
      dropdown.show();

      const historyBefore = dropdown['containerEl'].querySelectorAll(
        '.search-suggest-history-item',
      );
      expect(historyBefore.length).toBe(1);

      dropdown.clearHistory();
      await jest.runAllTimersAsync();

      const historyAfter = dropdown['containerEl'].querySelectorAll(
        '.search-suggest-history-item',
      );
      expect(historyAfter.length).toBe(0);
    });
  });
});
