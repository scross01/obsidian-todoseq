import { Vault, setIcon } from 'obsidian';
import { Task } from '../../types/task';
import { SearchSuggestions } from '../../search/search-suggestions';
import {
  TodoTrackerSettings,
  SavedSearch,
} from '../../settings/settings-types';
import { SearchSuggestionDropdown } from './search-suggestion-dropdown';
import { BaseDropdown } from './base-dropdown';
import { DOCS_SEARCH_URL } from '../../utils/constants';

export interface HistoryEntry {
  query: string;
  matchCase: boolean;
}

export type SavedSearchCallbacks = {
  onApply: (search: SavedSearch) => void;
  onEdit: (search: SavedSearch) => void;
  onDelete: (search: SavedSearch) => void;
  onSaveFromHistory: (query: string) => void;
};

export class SearchOptionsDropdown extends BaseDropdown {
  private tasks: Task[];
  private settings: TodoTrackerSettings;
  public isHandlingPrefixSelection = false;

  private searchHistory: HistoryEntry[] = [];
  private readonly MAX_HISTORY_SIZE = 10;

  private savedSearches: SavedSearch[] = [];
  private savedSearchCallbacks: SavedSearchCallbacks | null = null;

  constructor(
    inputEl: HTMLInputElement,
    vault: Vault,
    tasks: Task[],
    settings: TodoTrackerSettings,
    private suggestionDropdown?: SearchSuggestionDropdown,
  ) {
    super(inputEl, vault);
    this.tasks = tasks;
    this.settings = settings;

    this.setupKeyboardNavigation();
  }

  public setSavedSearches(searches: SavedSearch[]): void {
    this.savedSearches = searches;
  }

  public setSavedSearchCallbacks(callbacks: SavedSearchCallbacks): void {
    this.savedSearchCallbacks = callbacks;
  }

  protected shouldPreventHide(): boolean {
    return this.isHandlingPrefixSelection;
  }

  public updateTasks(tasks: Task[]): void {
    this.tasks = tasks;
  }

  public addToHistory(query: string, matchCase = false): void {
    const trimmed = query.trim();
    if (!trimmed) return;

    // Remove existing entry with same query
    const existingIndex = this.searchHistory.findIndex(
      (e) => e.query === trimmed,
    );
    if (existingIndex !== -1) {
      this.searchHistory.splice(existingIndex, 1);
    }

    this.searchHistory.unshift({ query: trimmed, matchCase });

    if (this.searchHistory.length > this.MAX_HISTORY_SIZE) {
      this.searchHistory.pop();
    }
  }

  public clearHistory(): void {
    this.searchHistory = [];
    if (this.isShowing) {
      this.renderDropdown().catch((error) => {
        console.error('Error rendering dropdown:', error);
      });
    }
  }

  public getHistory(): HistoryEntry[] {
    return [...this.searchHistory];
  }

  public async showOptionsDropdown(searchTerm = ''): Promise<void> {
    const allOptions = [
      'path:',
      'file:',
      'tag:',
      'state:',
      'priority:',
      'content:',
      'scheduled:',
      'deadline:',
      'closed:',
      '[]',
    ];

    if (searchTerm) {
      this.currentSuggestions = SearchSuggestions.filterSuggestions(
        searchTerm,
        allOptions,
      );
    } else {
      this.currentSuggestions = allOptions;
    }

    await this.renderDropdown();
    this.show();
  }

  private getOptionLabel(option: string): string {
    if (option === '[]') {
      return '[property]';
    }
    return option;
  }

  protected async renderDropdown(): Promise<void> {
    this.containerEl.empty();

    const suggestionContainerEl = this.containerEl.createEl('div', {
      cls: 'suggestion-container mod-search-suggestion',
      attr: { style: 'width: 300px;' },
    });
    const suggestionEl = suggestionContainerEl.createEl('div', {
      cls: 'suggestion',
    });

    if (this.currentSuggestions.length === 0) {
      return;
    }

    const titleItem = suggestionEl.createEl('div', {
      cls: 'suggestion-item mod-complex search-suggest-item mod-group',
    });

    titleItem.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
    });

    const titleContent = titleItem.createEl('div', {
      cls: 'suggestion-content',
    });
    const titleText = titleContent.createEl('div', {
      cls: 'suggestion-title list-item-part mod-extended',
    });
    titleText.createSpan({ text: 'Search options' });

    const auxEl = titleItem.createEl('div', { cls: 'suggestion-aux' });
    const iconContainer = auxEl.createEl('div', {
      cls: 'list-item-part search-suggest-icon clickable-icon',
      attr: { 'aria-label': 'Read more' },
    });
    setIcon(iconContainer, 'lucide-info');

    iconContainer.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
    });

    iconContainer.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();

      try {
        window.open(DOCS_SEARCH_URL, '_blank');
      } catch (error) {
        console.error('TODOseq: Failed to open search documentation:', error);
      }
    });

    this.currentSuggestions.forEach((suggestion, index) => {
      const itemEl = suggestionEl.createEl('div', {
        cls: `suggestion-item mod-complex search-suggest-item ${index === this.selectedIndex ? 'is-selected' : ''}`,
      });

      const contentEl = itemEl.createEl('div', { cls: 'suggestion-content' });
      const titleEl = contentEl.createEl('div', { cls: 'suggestion-title' });

      titleEl.createSpan({ text: this.getOptionLabel(suggestion) });

      const infoText = this.getPrefixDescription(suggestion);
      if (infoText) {
        titleEl.createSpan({
          cls: 'search-suggest-info-text',
          text: ` ${infoText}`,
        });
      }

      itemEl.addEventListener('mousedown', (e) => {
        e.preventDefault();
        const isPrefixSelection =
          suggestion.endsWith(':') && !suggestion.includes(' ');
        if (isPrefixSelection) {
          this.isHandlingPrefixSelection = true;
        }
        this.handleSelection(suggestion);
      });

      itemEl.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
      });

      itemEl.addEventListener('mouseover', () => {
        this.selectedIndex = index;
        this.updateSelectionWithHistory();
      });
    });

    if (this.savedSearches.length > 0) {
      this.renderSavedSearchesSection(
        suggestionEl,
        this.currentSuggestions.length,
      );
    }

    if (this.searchHistory.length > 0) {
      this.renderHistorySection(suggestionEl);
    }
  }

  private renderSavedSearchesSection(
    parent: HTMLElement,
    startIndex: number,
  ): void {
    const headerItem = parent.createEl('div', {
      cls: 'suggestion-item mod-complex search-suggest-item mod-group',
    });

    headerItem.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
    });

    const headerContent = headerItem.createEl('div', {
      cls: 'suggestion-content',
    });
    const headerTitle = headerContent.createEl('div', {
      cls: 'suggestion-title list-item-part mod-extended',
    });
    headerTitle.createSpan({ text: 'Saved searches' });

    const auxEl = headerItem.createEl('div', { cls: 'suggestion-aux' });
    const iconContainer = auxEl.createEl('div', {
      cls: 'list-item-part search-suggest-icon clickable-icon',
      attr: { 'aria-label': 'Add saved search' },
    });
    setIcon(iconContainer, 'lucide-bookmark');
    iconContainer.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
    });
    iconContainer.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.savedSearchCallbacks?.onSaveFromHistory(this.inputEl.value);
      this.hide();
    });

    this.savedSearches.forEach((search, index) => {
      const adjustedIndex = startIndex + index;
      const itemEl = parent.createEl('div', {
        cls: `suggestion-item mod-complex search-suggest-item search-suggest-saved-item ${adjustedIndex === this.selectedIndex ? 'is-selected' : ''}`,
      });

      const contentEl = itemEl.createEl('div', {
        cls: 'suggestion-content',
      });
      const titleEl = contentEl.createEl('div', {
        cls: 'suggestion-title',
      });
      titleEl.createSpan({
        cls: 'search-suggest-saved-name',
        text: `${search.name}:`,
      });
      titleEl.createSpan({
        cls: 'search-suggest-saved-query',
        text: ` ${search.query}`,
        attr: { title: search.query },
      });

      // Hover actions (edit and delete)
      const auxEl = itemEl.createEl('div', { cls: 'suggestion-aux' });

      const editBtn = auxEl.createEl('div', {
        cls: 'list-item-part search-suggest-icon clickable-icon',
        attr: { 'aria-label': 'Edit saved search' },
      });
      setIcon(editBtn, 'lucide-pencil');
      editBtn.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
      });
      editBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.savedSearchCallbacks?.onEdit(search);
        this.hide();
      });

      const deleteBtn = auxEl.createEl('div', {
        cls: 'list-item-part search-suggest-icon clickable-icon',
        attr: { 'aria-label': 'Delete saved search' },
      });
      setIcon(deleteBtn, 'lucide-trash-2');
      deleteBtn.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
      });
      deleteBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.savedSearchCallbacks?.onDelete(search);
        this.hide();
      });

      // Click on the item itself applies the saved search
      itemEl.addEventListener('mousedown', (e) => {
        // Don't apply if clicking on action buttons
        const target = e.target as HTMLElement;
        if (target.closest('.clickable-icon')) return;
        e.preventDefault();
        this.savedSearchCallbacks?.onApply(search);
        this.hide();
      });

      itemEl.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
      });

      itemEl.addEventListener('mouseover', () => {
        this.selectedIndex = adjustedIndex;
        this.updateSelectionWithHistory();
      });
    });
  }

  private renderHistorySection(parent: HTMLElement): void {
    const headerItem = parent.createEl('div', {
      cls: 'suggestion-item mod-complex search-suggest-item mod-group',
    });

    headerItem.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
    });

    const headerContent = headerItem.createEl('div', {
      cls: 'suggestion-content',
    });
    const headerTitle = headerContent.createEl('div', {
      cls: 'suggestion-title list-item-part mod-extended',
    });
    headerTitle.createSpan({ text: 'History' });

    const auxEl = headerItem.createEl('div', { cls: 'suggestion-aux' });
    const clearBtn = auxEl.createEl('div', {
      cls: 'list-item-part search-suggest-icon clickable-icon',
      attr: { 'aria-label': 'Clear history' },
    });
    setIcon(clearBtn, 'lucide-x');

    clearBtn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
    });

    clearBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.clearHistory();
    });

    const optionsCount =
      this.currentSuggestions.length + this.savedSearches.length;
    this.searchHistory.forEach((entry, index) => {
      const adjustedIndex = optionsCount + index;
      const itemEl = parent.createEl('div', {
        cls: `suggestion-item mod-complex search-suggest-item search-suggest-history-item ${adjustedIndex === this.selectedIndex ? 'is-selected' : ''}`,
      });

      const contentEl = itemEl.createEl('div', { cls: 'suggestion-content' });
      const titleEl = contentEl.createEl('div', { cls: 'suggestion-title' });
      if (entry.matchCase) {
        titleEl.createSpan({
          cls: 'search-suggest-history-matchcase',
          text: 'Aa',
          attr: { title: 'Case sensitive' },
        });
        titleEl.createSpan({ text: ' ' });
      }
      titleEl.createSpan({
        cls: 'search-suggest-history-query',
        text: entry.query,
        attr: { title: entry.query },
      });

      // Save icon for history items
      if (this.savedSearchCallbacks) {
        const auxEl = itemEl.createEl('div', { cls: 'suggestion-aux' });
        const saveBtn = auxEl.createEl('div', {
          cls: 'list-item-part search-suggest-icon clickable-icon',
          attr: { 'aria-label': 'Save as saved search' },
        });
        setIcon(saveBtn, 'lucide-bookmark');
        saveBtn.addEventListener('mousedown', (e) => {
          e.preventDefault();
          e.stopPropagation();
        });
        saveBtn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.savedSearchCallbacks?.onSaveFromHistory(entry.query);
          this.hide();
        });
      }

      itemEl.addEventListener('mousedown', (e) => {
        // Don't apply history if clicking on save button
        const target = e.target as HTMLElement;
        if (target.closest('.clickable-icon')) return;
        e.preventDefault();
        this.handleHistorySelection(entry.query, entry.matchCase);
      });

      itemEl.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
      });

      itemEl.addEventListener('mouseover', () => {
        this.selectedIndex = adjustedIndex;
        this.updateSelectionWithHistory();
      });
    });
  }

  private handleHistorySelection(query: string, matchCase = false): void {
    this.inputEl.value = query;
    this.inputEl.selectionStart = this.inputEl.selectionEnd = query.length;

    this.hide();

    // Dispatch a custom event to restore the match case state
    window.dispatchEvent(
      new CustomEvent('todoseq:history-select', {
        detail: { query, matchCase },
      }),
    );

    this.inputEl.focus();
  }

  private getPrefixDescription(prefix: string): string {
    switch (prefix) {
      case 'path:':
        return 'match path of the file';
      case 'file:':
        return 'match file name';
      case 'tag:':
        return 'search for tags';
      case 'state:':
        return 'match task state';
      case 'priority:':
        return 'match task priority';
      case 'content:':
        return 'match task content';
      case 'scheduled:':
        return 'filter by scheduled date';
      case 'deadline:':
        return 'filter by deadline date';
      case 'closed:':
        return 'filter by closed date';
      case '[]':
        return 'match page property';
      default:
        return '';
    }
  }

  private updateSelectionWithHistory(): void {
    const items = this.containerEl.querySelectorAll(
      '.search-suggest-item:not(.mod-group)',
    );

    items.forEach((item, index) => {
      if (index === this.selectedIndex) {
        item.addClass('is-selected');
      } else {
        item.removeClass('is-selected');
      }
    });
  }

  protected getTotalItems(): number {
    return (
      this.currentSuggestions.length +
      this.savedSearches.length +
      this.searchHistory.length
    );
  }

  public handleKeyDown(event: KeyboardEvent): boolean {
    if (!this.isShowing) return false;

    const totalItems = this.getTotalItems();

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this.selectedIndex = Math.min(this.selectedIndex + 1, totalItems - 1);
        this.updateSelectionWithHistory();
        return true;

      case 'ArrowUp':
        event.preventDefault();
        this.selectedIndex = Math.max(this.selectedIndex - 1, -1);
        this.updateSelectionWithHistory();
        return true;

      case 'Enter':
        if (this.selectedIndex >= 0) {
          event.preventDefault();
          this.commitSelectedIndex();
          return true;
        }
        break;

      case 'Escape':
        event.preventDefault();
        this.hide();
        return true;

      case 'Tab':
        if (this.selectedIndex >= 0) {
          event.preventDefault();
          this.commitSelectedIndex();
          return true;
        }
        break;
    }

    return false;
  }

  private commitSelectedIndex(): void {
    const optionsCount = this.currentSuggestions.length;
    const savedCount = this.savedSearches.length;
    if (this.selectedIndex < optionsCount) {
      this.handleSelection(this.currentSuggestions[this.selectedIndex]);
    } else if (this.selectedIndex < optionsCount + savedCount) {
      const savedIndex = this.selectedIndex - optionsCount;
      const search = this.savedSearches[savedIndex];
      if (search) {
        this.savedSearchCallbacks?.onApply(search);
      }
      this.hide();
    } else {
      const historyIndex = this.selectedIndex - optionsCount - savedCount;
      const entry = this.searchHistory[historyIndex];
      if (entry) {
        this.handleHistorySelection(entry.query, entry.matchCase);
      }
    }
  }

  protected handleSelection(suggestion: string): void {
    const input = this.inputEl;
    const cursorPos = input.selectionStart ?? 0;
    const currentValue = input.value;

    const isPrefixSelection =
      (suggestion.endsWith(':') && !suggestion.includes(' ')) ||
      suggestion === '[]';

    let startPos = cursorPos;
    while (startPos > 0 && !/\s/.test(currentValue[startPos - 1])) {
      startPos--;
    }

    const newValue =
      currentValue.substring(0, startPos) +
      suggestion +
      currentValue.substring(cursorPos);
    input.value = newValue;

    if (suggestion === '[]') {
      input.selectionStart = input.selectionEnd = startPos + 1;
    } else {
      input.selectionStart = input.selectionEnd = startPos + suggestion.length;
    }

    if (isPrefixSelection) {
      this.hide();

      this.isHandlingPrefixSelection = true;

      if (this.suggestionDropdown) {
        this.suggestionDropdown.isHandlingPrefixSelection = true;
        const prefixForDropdown =
          suggestion === '[]' ? 'property:' : suggestion;
        this.suggestionDropdown
          .showPrefixDropdown(prefixForDropdown, '')
          .catch((error) => {
            console.error('Error showing prefix dropdown:', error);
          });
      }
    }

    window.setTimeout(() => {
      const event = new Event('input', { bubbles: true });
      input.dispatchEvent(event);
    }, 150);

    if (!isPrefixSelection) {
      this.isHandlingPrefixSelection = false;
    }

    input.focus();

    if (isPrefixSelection) {
      const resetFlagOnKeyDown = (e: KeyboardEvent) => {
        this.isHandlingPrefixSelection = false;
        input.removeEventListener('keydown', resetFlagOnKeyDown);
      };
      input.addEventListener('keydown', resetFlagOnKeyDown);
    }
  }

  private getFocusableElements(): HTMLElement[] {
    const focusableSelector =
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
    return Array.from(this.containerEl.querySelectorAll(focusableSelector));
  }

  private setupKeyboardNavigation(): void {
    this.containerEl.addEventListener('keydown', (e: KeyboardEvent) => {
      const focusableElements = this.getFocusableElements();
      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];
      const activeElement = window.activeDocument.activeElement;

      if (e.key === 'Tab') {
        if (e.shiftKey && activeElement === firstElement) {
          e.preventDefault();
          lastElement.focus();
        } else if (!e.shiftKey && activeElement === lastElement) {
          e.preventDefault();
          firstElement.focus();
        }
      }

      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (focusableElements.length > 0) {
          let currentIndex = focusableElements.findIndex(
            (el: HTMLElement) => el === activeElement,
          );
          if (currentIndex === -1) {
            currentIndex = e.key === 'ArrowDown' ? -1 : 0;
          }

          currentIndex =
            e.key === 'ArrowDown' ? currentIndex + 1 : currentIndex - 1;

          if (currentIndex >= 0 && currentIndex < focusableElements.length) {
            focusableElements[currentIndex].focus();
          }
        }
      }

      if (e.key === 'Escape') {
        e.preventDefault();
        this.hide();
        this.inputEl.focus();
      }
    });
  }
}
