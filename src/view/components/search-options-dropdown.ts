import { Vault, setIcon } from 'obsidian';
import { Task } from '../../types/task';
import { SearchSuggestions } from '../../search/search-suggestions';
import { TodoTrackerSettings } from '../../settings/settings-types';
import { SearchSuggestionDropdown } from './search-suggestion-dropdown';
import { BaseDropdown } from './base-dropdown';
import { DOCS_SEARCH_URL } from '../../utils/constants';

export class SearchOptionsDropdown extends BaseDropdown {
  private tasks: Task[];
  private settings: TodoTrackerSettings;
  public isHandlingPrefixSelection = false;

  private searchHistory: string[] = [];
  private readonly MAX_HISTORY_SIZE = 10;

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

  protected shouldPreventHide(): boolean {
    return this.isHandlingPrefixSelection;
  }

  public updateTasks(tasks: Task[]): void {
    this.tasks = tasks;
  }

  public addToHistory(query: string): void {
    const trimmed = query.trim();
    if (!trimmed) return;

    const existingIndex = this.searchHistory.indexOf(trimmed);
    if (existingIndex !== -1) {
      this.searchHistory.splice(existingIndex, 1);
    }

    this.searchHistory.unshift(trimmed);

    if (this.searchHistory.length > this.MAX_HISTORY_SIZE) {
      this.searchHistory.pop();
    }
  }

  public clearHistory(): void {
    this.searchHistory = [];
    if (this.isShowing) {
      this.renderDropdown();
    }
  }

  public getHistory(): string[] {
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
    this.containerEl.innerHTML = '';

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

    iconContainer.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"
                fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"
                stroke-linejoin="round" class="svg-icon lucide-info">
                <circle cx="12" cy="12" r="10"></circle>
                <path d="M12 16v-4"></path>
                <path d="M12 8h.01"></path>
            </svg>
        `;

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

    if (this.searchHistory.length > 0) {
      this.renderHistorySection(suggestionEl);
    }
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

    const optionsCount = this.currentSuggestions.length;
    this.searchHistory.forEach((query, index) => {
      const adjustedIndex = optionsCount + index;
      const itemEl = parent.createEl('div', {
        cls: `suggestion-item mod-complex search-suggest-item search-suggest-history-item ${adjustedIndex === this.selectedIndex ? 'is-selected' : ''}`,
      });

      const contentEl = itemEl.createEl('div', { cls: 'suggestion-content' });
      const titleEl = contentEl.createEl('div', { cls: 'suggestion-title' });
      titleEl.createSpan({ text: query });

      itemEl.addEventListener('mousedown', (e) => {
        e.preventDefault();
        this.handleHistorySelection(query);
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

  private handleHistorySelection(query: string): void {
    this.inputEl.value = query;
    this.inputEl.selectionStart = this.inputEl.selectionEnd = query.length;

    this.hide();

    setTimeout(() => {
      const event = new Event('input', { bubbles: true });
      this.inputEl.dispatchEvent(event);
    }, 0);

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
    return this.currentSuggestions.length + this.searchHistory.length;
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
          const optionsCount = this.currentSuggestions.length;
          if (this.selectedIndex < optionsCount) {
            this.handleSelection(this.currentSuggestions[this.selectedIndex]);
          } else {
            const historyIndex = this.selectedIndex - optionsCount;
            this.handleHistorySelection(this.searchHistory[historyIndex]);
          }
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
          const optionsCount = this.currentSuggestions.length;
          if (this.selectedIndex < optionsCount) {
            this.handleSelection(this.currentSuggestions[this.selectedIndex]);
          } else {
            const historyIndex = this.selectedIndex - optionsCount;
            this.handleHistorySelection(this.searchHistory[historyIndex]);
          }
          return true;
        }
        break;
    }

    return false;
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
        this.suggestionDropdown.showPrefixDropdown(prefixForDropdown, '');
      }
    }

    setTimeout(() => {
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
    return Array.from(
      this.containerEl.querySelectorAll(focusableSelector),
    ) as HTMLElement[];
  }

  private setupKeyboardNavigation(): void {
    this.containerEl.addEventListener('keydown', (e: KeyboardEvent) => {
      const focusableElements = this.getFocusableElements();
      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];
      const activeElement = document.activeElement;

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
