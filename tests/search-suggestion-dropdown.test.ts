/**
 * @jest-environment jsdom
 */

import { SearchSuggestionDropdown } from '../src/view/components/search-suggestion-dropdown';
import { installObsidianDomMocks } from './helpers/obsidian-dom-mock';
import {
  createBaseSettings,
  createBaseTask,
  createDate,
} from './helpers/test-helper';

describe('SearchSuggestionDropdown', () => {
  let dropdown: any;
  let mockInput: HTMLInputElement;
  let mockVault: any;
  let mockApp: any;

  beforeAll(() => {
    installObsidianDomMocks();
  });

  beforeEach(() => {
    mockInput = document.createElement('input');
    document.body.appendChild(mockInput);

    const vaultFiles = [
      { path: 'vault/notes/note1.md', name: 'note1.md' },
      { path: 'vault/notes/note2.md', name: 'note2.md' },
    ];

    mockVault = {
      getMarkdownFiles: jest.fn().mockReturnValue(vaultFiles),
    };

    mockApp = {
      vault: mockVault,
      metadataCache: {
        getFileCache: jest.fn().mockReturnValue({
          frontmatter: { status: 'active', priority: 'high' },
        }),
      },
    };

    const settings = createBaseSettings();
    const tasks = [createBaseTask({ path: 'test.md', state: 'TODO' })];

    dropdown = new (SearchSuggestionDropdown as any)(
      mockInput,
      mockVault,
      mockApp,
      tasks,
      settings,
      'showAll',
    );
  });

  afterEach(() => {
    dropdown.cleanup();
    mockInput.remove();
  });

  describe('shouldPreventHide', () => {
    it('returns true when handling prefix selection', () => {
      dropdown.isHandlingPrefixSelection = true;
      expect(dropdown.shouldPreventHide()).toBe(true);
    });

    it('returns false when not handling prefix selection', () => {
      dropdown.isHandlingPrefixSelection = false;
      expect(dropdown.shouldPreventHide()).toBe(false);
    });
  });

  describe('updateTasks', () => {
    it('updates the internal tasks reference', () => {
      const newTasks = [createBaseTask({ path: 'new.md', state: 'DONE' })];
      dropdown.updateTasks(newTasks);
      expect((dropdown as any).tasks).toBe(newTasks);
    });
  });

  describe('showPrefixDropdown', () => {
    it('skips when justSelected is true', async () => {
      dropdown.justSelected = true;
      await dropdown.showPrefixDropdown('path:');
      expect((dropdown as any).currentPrefix).toBeNull();
      expect(dropdown.isVisible()).toBe(false);
    });

    it('hides dropdown for content prefix', async () => {
      dropdown.currentSuggestions = ['item'];
      dropdown.show();
      expect(dropdown.isVisible()).toBe(true);

      await dropdown.showPrefixDropdown('content:');

      expect(dropdown.isVisible()).toBe(false);
    });

    it('shows path suggestions from tasks', async () => {
      dropdown.updateTasks([
        createBaseTask({ path: 'notes/project-a/task.md' }),
        createBaseTask({ path: 'notes/project-b/task.md' }),
      ]);

      await dropdown.showPrefixDropdown('path:');

      expect(dropdown.isVisible()).toBe(true);
      expect(dropdown.currentSuggestions).toContain('notes');
      expect(dropdown.currentSuggestions).toContain('notes/project-a');
      expect(dropdown.currentSuggestions).toContain('notes/project-b');
    });

    it('falls back to vault paths when no tasks', async () => {
      dropdown.updateTasks([]);

      await dropdown.showPrefixDropdown('path:');

      expect(dropdown.isVisible()).toBe(true);
      expect(dropdown.currentSuggestions).toContain('vault');
      expect(dropdown.currentSuggestions).toContain('vault/notes');
    });

    it('shows file suggestions from tasks', async () => {
      dropdown.updateTasks([
        createBaseTask({ path: 'folder/file-a.md' }),
        createBaseTask({ path: 'folder/file-b.md' }),
      ]);

      await dropdown.showPrefixDropdown('file:');

      expect(dropdown.isVisible()).toBe(true);
      expect(dropdown.currentSuggestions).toContain('file-a.md');
      expect(dropdown.currentSuggestions).toContain('file-b.md');
    });

    it('falls back to vault files when no tasks', async () => {
      dropdown.updateTasks([]);

      await dropdown.showPrefixDropdown('file:');

      expect(dropdown.isVisible()).toBe(true);
      expect(dropdown.currentSuggestions).toContain('note1.md');
      expect(dropdown.currentSuggestions).toContain('note2.md');
    });

    it('shows tag suggestions from tasks', async () => {
      dropdown.updateTasks([
        createBaseTask({ rawText: 'TODO Task #work #urgent' }),
        createBaseTask({ rawText: 'TODO Other #personal' }),
      ]);

      await dropdown.showPrefixDropdown('tag:');

      expect(dropdown.isVisible()).toBe(true);
      expect(dropdown.currentSuggestions).toContain('work');
      expect(dropdown.currentSuggestions).toContain('urgent');
      expect(dropdown.currentSuggestions).toContain('personal');
    });

    it('shows state suggestions from settings', async () => {
      await dropdown.showPrefixDropdown('state:');

      expect(dropdown.isVisible()).toBe(true);
      const suggestions = dropdown.currentSuggestions;
      expect(suggestions).toContain('active');
      expect(suggestions).toContain('completed');
      expect(suggestions).toContain('inactive');
      expect(suggestions).toContain('waiting');
    });

    it('shows priority options', async () => {
      await dropdown.showPrefixDropdown('priority:');

      expect(dropdown.isVisible()).toBe(true);
      expect(dropdown.currentSuggestions).toEqual([
        'A',
        'B',
        'C',
        'high',
        'medium',
        'low',
        'none',
      ]);
    });

    it('shows scheduled date suggestions with task dates', async () => {
      dropdown.updateTasks([
        createBaseTask({ scheduledDate: createDate(2026, 5, 14, 12) }),
        createBaseTask({ scheduledDate: createDate(2026, 6, 1, 12) }),
      ]);

      await dropdown.showPrefixDropdown('scheduled:');

      expect(dropdown.isVisible()).toBe(true);
      const suggestions = dropdown.currentSuggestions;
      expect(suggestions).toContain('today');
      expect(suggestions).toContain('none');
      expect(suggestions).toContain('2026-05-14');
      expect(suggestions).toContain('2026-06-01');
    });

    it('shows only date suggestions when no tasks for scheduled', async () => {
      dropdown.updateTasks([]);

      await dropdown.showPrefixDropdown('scheduled:');

      expect(dropdown.isVisible()).toBe(true);
      const suggestions = dropdown.currentSuggestions;
      expect(suggestions).toContain('today');
      expect(suggestions).toContain('none');
      expect(suggestions.length).toBe(SearchSuggestionDropdown ? 10 : 10);
    });

    it('shows deadline date suggestions with task dates', async () => {
      dropdown.updateTasks([
        createBaseTask({ deadlineDate: createDate(2026, 5, 20, 12) }),
      ]);

      await dropdown.showPrefixDropdown('deadline:');

      expect(dropdown.isVisible()).toBe(true);
      const suggestions = dropdown.currentSuggestions;
      expect(suggestions).toContain('today');
      expect(suggestions).toContain('2026-05-20');
    });

    it('shows closed date suggestions with task dates', async () => {
      dropdown.updateTasks([
        createBaseTask({ closedDate: createDate(2026, 5, 10, 12) }),
      ]);

      await dropdown.showPrefixDropdown('closed:');

      expect(dropdown.isVisible()).toBe(true);
      const suggestions = dropdown.currentSuggestions;
      expect(suggestions).toContain('today');
      expect(suggestions).toContain('yesterday');
      expect(suggestions).toContain('2026-05-10');
    });

    it('shows only closed date suggestions when no tasks', async () => {
      dropdown.updateTasks([]);

      await dropdown.showPrefixDropdown('closed:');

      expect(dropdown.isVisible()).toBe(true);
      const suggestions = dropdown.currentSuggestions;
      expect(suggestions).toContain('today');
      expect(suggestions).toContain('none');
    });

    it('shows property keys from app metadata', async () => {
      await dropdown.showPrefixDropdown('property:');

      expect(dropdown.isVisible()).toBe(true);
      expect(dropdown.currentSuggestions).toContain('status');
      expect(dropdown.currentSuggestions).toContain('priority');
    });

    it('returns empty suggestions for unknown prefix', async () => {
      await dropdown.showPrefixDropdown('unknown:');

      expect(dropdown.isVisible()).toBe(true);
      expect(dropdown.currentSuggestions).toEqual([]);
    });

    it('filters suggestions by search term', async () => {
      await dropdown.showPrefixDropdown('priority:', 'hi');

      expect(dropdown.isVisible()).toBe(true);
      expect(dropdown.currentSuggestions).toEqual(['high']);
    });

    it('handles prefix without trailing colon', async () => {
      await dropdown.showPrefixDropdown('priority');

      expect(dropdown.isVisible()).toBe(true);
      expect(dropdown.currentSuggestions).toContain('A');
    });
  });

  describe('renderDropdown', () => {
    it('shows empty message when no suggestions', async () => {
      dropdown.currentSuggestions = [];
      await dropdown.renderDropdown();

      expect(dropdown.containerEl.textContent).toContain(
        'No suggestions found',
      );
    });

    it('renders suggestion items', async () => {
      dropdown.currentSuggestions = ['suggestion-a', 'suggestion-b'];
      dropdown.selectedIndex = -1;
      await dropdown.renderDropdown();

      const items = dropdown.containerEl.querySelectorAll(
        '.search-suggest-item',
      );
      expect(items.length).toBe(2);
      expect(items[0].textContent).toContain('suggestion-a');
      expect(items[1].textContent).toContain('suggestion-b');
    });

    it('applies is-selected class to selected item', async () => {
      dropdown.currentSuggestions = ['first', 'second'];
      dropdown.selectedIndex = 1;
      await dropdown.renderDropdown();

      const items = dropdown.containerEl.querySelectorAll(
        '.search-suggest-item',
      );
      expect(items[0].classList.contains('is-selected')).toBe(false);
      expect(items[1].classList.contains('is-selected')).toBe(true);
    });

    it('strips trailing slash from directory suggestions in display', async () => {
      dropdown.currentSuggestions = ['folder/'];
      dropdown.selectedIndex = -1;
      await dropdown.renderDropdown();

      const title = dropdown.containerEl.querySelector('.suggestion-title');
      expect(title?.textContent).toBe('folder');
    });

    it('invokes handleSelection on mousedown', async () => {
      dropdown.currentSuggestions = ['item-a'];
      dropdown.selectedIndex = -1;
      const handleSelectionSpy = jest.spyOn(dropdown, 'handleSelection');
      await dropdown.renderDropdown();

      const item = dropdown.containerEl.querySelector(
        '.search-suggest-item',
      ) as HTMLElement;
      const mousedownEvent = new MouseEvent('mousedown', { cancelable: true });
      const preventDefaultSpy = jest.spyOn(mousedownEvent, 'preventDefault');

      item.dispatchEvent(mousedownEvent);

      expect(preventDefaultSpy).toHaveBeenCalled();
      expect(handleSelectionSpy).toHaveBeenCalledWith('item-a');
    });

    it('updates selectedIndex on mouseover', async () => {
      dropdown.currentSuggestions = ['first', 'second'];
      dropdown.selectedIndex = -1;
      await dropdown.renderDropdown();

      const items = dropdown.containerEl.querySelectorAll(
        '.search-suggest-item',
      );
      items[1].dispatchEvent(new MouseEvent('mouseover'));

      expect(dropdown.selectedIndex).toBe(1);
    });
  });

  describe('handleSelection', () => {
    it('replaces prefix value after colon', () => {
      mockInput.value = 'path:old value';
      mockInput.selectionStart = 8;
      mockInput.selectionEnd = 8;

      dropdown.handleSelection('new');

      expect(mockInput.value).toBe('path:new value');
    });

    it('extends replacement to end of current word', () => {
      mockInput.value = 'path:oldvalue';
      mockInput.selectionStart = 7;
      mockInput.selectionEnd = 7;

      dropdown.handleSelection('new');

      expect(mockInput.value).toBe('path:new');
    });

    it('wraps property value in brackets', () => {
      mockInput.value = 'property:';
      mockInput.selectionStart = 9;
      mockInput.selectionEnd = 9;

      dropdown.handleSelection('status');

      expect(mockInput.value).toContain('["status":');
    });

    it('quotes values with spaces', () => {
      mockInput.value = 'path:';
      mockInput.selectionStart = 5;
      mockInput.selectionEnd = 5;

      dropdown.handleSelection('my folder');

      expect(mockInput.value).toContain('"my folder"');
    });

    it('replaces bracket content for property key selection', () => {
      mockInput.value = '[old rest';
      mockInput.selectionStart = 4;

      dropdown.handleSelection('newkey');

      expect(mockInput.value).toBe('[newkey: rest');
      expect(mockInput.selectionStart).toBe(8);
    });

    it('inserts suggestion at cursor when no prefix or bracket', () => {
      mockInput.value = 'search val rest';
      mockInput.selectionStart = 10;
      mockInput.selectionEnd = 10;

      dropdown.handleSelection('value');

      expect(mockInput.value).toBe('search value rest');
    });

    it('sets justSelected flag and clears after timeout', () => {
      mockInput.value = 'test';
      mockInput.selectionStart = 4;
      mockInput.selectionEnd = 4;
      jest.useFakeTimers();

      dropdown.handleSelection('value');

      expect(dropdown.justSelected).toBe(true);

      jest.advanceTimersByTime(150);

      expect(dropdown.justSelected).toBe(false);
      jest.useRealTimers();
    });

    it('dispatches input event after selection', () => {
      mockInput.value = 'test';
      mockInput.selectionStart = 4;
      mockInput.selectionEnd = 4;
      const dispatchSpy = jest.spyOn(mockInput, 'dispatchEvent');

      dropdown.handleSelection('value');

      expect(dispatchSpy).toHaveBeenCalled();
      const event = dispatchSpy.mock.calls[0][0] as Event;
      expect(event.type).toBe('input');
    });

    it('resets isHandlingPrefixSelection after selection', () => {
      dropdown.isHandlingPrefixSelection = true;
      mockInput.value = 'test';
      mockInput.selectionStart = 4;
      mockInput.selectionEnd = 4;

      dropdown.handleSelection('value');

      expect(dropdown.isHandlingPrefixSelection).toBe(false);
    });
  });
});
