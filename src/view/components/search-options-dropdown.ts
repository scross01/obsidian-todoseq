import { Vault, setIcon } from 'obsidian';
import { Task } from '../../types/task';
import { SearchSuggestions } from '../../search/search-suggestions';
import { TodoTrackerSettings } from '../../settings/settings-types';
import { SearchSuggestionDropdown } from './search-suggestion-dropdown';
import { DOCS_SEARCH_URL } from '../../utils/constants';

/**
 * Dropdown component for search prefix filter options
 * Handles the selection of search prefixes like "path:", "state:", etc.
 * Also displays search history for quick re-execution of previous searches
 */
export class SearchOptionsDropdown {
  private containerEl: HTMLElement;
  private inputEl: HTMLInputElement;
  private vault: Vault;
  private tasks: Task[];
  private settings: TodoTrackerSettings;
  private currentSuggestions: string[] = [];
  private selectedIndex = -1;
  private isShowing = false;
  public isHandlingPrefixSelection = false;

  // Search history storage (session-only)
  private searchHistory: string[] = [];
  private readonly MAX_HISTORY_SIZE = 10;

  constructor(
    inputEl: HTMLInputElement,
    vault: Vault,
    tasks: Task[],
    settings: TodoTrackerSettings,
    private suggestionDropdown?: SearchSuggestionDropdown,
  ) {
    this.inputEl = inputEl;
    this.vault = vault;
    this.tasks = tasks;
    this.settings = settings;

    // Create dropdown container
    this.containerEl = document.createElement('div');
    this.containerEl.addClass('todoseq-dropdown');

    // Add to document body
    document.body.appendChild(this.containerEl);

    // Set initial width to match input
    this.updateWidth();

    // Add event listeners
    this.setupEventListeners();
    this.setupKeyboardNavigation();
  }

  /**
   * Update the tasks used for generating suggestions
   * @param tasks New task list to use for suggestions
   */
  public updateTasks(tasks: Task[]): void {
    this.tasks = tasks;
  }

  /**
   * Add a search query to the history
   * @param query The search query to add
   */
  public addToHistory(query: string): void {
    const trimmed = query.trim();
    if (!trimmed) return;

    // Remove if already exists to move to top
    const existingIndex = this.searchHistory.indexOf(trimmed);
    if (existingIndex !== -1) {
      this.searchHistory.splice(existingIndex, 1);
    }

    // Add to beginning
    this.searchHistory.unshift(trimmed);

    // Enforce max size
    if (this.searchHistory.length > this.MAX_HISTORY_SIZE) {
      this.searchHistory.pop();
    }
  }

  /**
   * Clear all search history
   */
  public clearHistory(): void {
    this.searchHistory = [];
    // Re-render if currently showing to update the display
    if (this.isShowing) {
      this.renderDropdown();
    }
  }

  /**
   * Get the current search history (for testing/debugging)
   */
  public getHistory(): string[] {
    return [...this.searchHistory];
  }

  private setupEventListeners(): void {
    // Click outside to close - but be careful not to interfere with suggestion clicks
    document.addEventListener('click', (e) => {
      const target = e.target as Node;

      // Don't hide if clicking on a suggestion item
      if (this.containerEl.contains(target)) {
        return;
      }

      // Don't hide if clicking on the input
      if (target === this.inputEl) {
        return;
      }

      // Don't hide if we're currently handling a prefix selection
      if (this.isHandlingPrefixSelection) {
        return;
      }

      // Hide the dropdown for clicks outside
      this.hide();
    });

    // Focus loss handling - hide when input loses focus
    this.inputEl.addEventListener('blur', () => {
      // Use requestAnimationFrame to allow click events to process first
      requestAnimationFrame(() => {
        if (!this.isHandlingPrefixSelection) {
          this.hide();
        }
      });
    });

    // Window resize
    window.addEventListener('resize', () => {
      this.updateWidth();
    });

    // Scroll handling
    window.addEventListener(
      'scroll',
      () => {
        this.updatePosition();
      },
      { passive: true },
    );
  }

  private updateWidth(): void {
    const inputRect = this.inputEl.getBoundingClientRect();
    this.containerEl.style.width = `${inputRect.width}px`;
  }

  public updatePosition(): void {
    const inputRect = this.inputEl.getBoundingClientRect();

    // Position below input
    const leftPos = window.scrollX + inputRect.left;
    const topPos = window.scrollY + inputRect.bottom + 2;

    this.containerEl.style.left = `${leftPos}px`;
    this.containerEl.style.top = `${topPos}px`;
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
      '[]', // Property search - inserts [] instead of property:
    ];

    // Filter options based on search term
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

  /**
   * Get the display label for an option
   * Property option shows as [property] with brackets
   */
  private getOptionLabel(option: string): string {
    if (option === '[]') {
      return '[property]';
    }
    return option;
  }

  private async renderDropdown(): Promise<void> {
    this.containerEl.innerHTML = '';

    const suggestionContainerEl = this.containerEl.createEl('div', {
      cls: 'suggestion-container mod-search-suggestion',
      attr: { style: 'width: 300px;' },
    });
    const suggestionEl = suggestionContainerEl.createEl('div', {
      cls: 'suggestion',
    });

    if (this.currentSuggestions.length === 0) {
      // No suggestions for options dropdown
      return;
    }

    // Add "Search options" title section for options dropdown
    const titleItem = suggestionEl.createEl('div', {
      cls: 'suggestion-item mod-complex search-suggest-item mod-group',
    });

    // Add click handler to titleItem to prevent bubbling
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

    // Add info icon
    const auxEl = titleItem.createEl('div', { cls: 'suggestion-aux' });
    const iconContainer = auxEl.createEl('div', {
      cls: 'list-item-part search-suggest-icon clickable-icon',
      attr: { 'aria-label': 'Read more' },
    });

    // Create SVG info icon using innerHTML
    iconContainer.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"
                fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"
                stroke-linejoin="round" class="svg-icon lucide-info">
                <circle cx="12" cy="12" r="10"></circle>
                <path d="M12 16v-4"></path>
                <path d="M12 8h.01"></path>
            </svg>
        `;

    // Add mousedown handler to prevent focus loss and handle click
    iconContainer.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
    });

    // Add click listener to open search documentation
    iconContainer.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();

      try {
        // Open the search documentation in the default browser
        window.open(DOCS_SEARCH_URL, '_blank');
      } catch (error) {
        console.error('TODOseq: Failed to open search documentation:', error);
      }
    });

    // Render suggestions
    this.currentSuggestions.forEach((suggestion, index) => {
      const itemEl = suggestionEl.createEl('div', {
        cls: `suggestion-item mod-complex search-suggest-item ${index === this.selectedIndex ? 'is-selected' : ''}`,
      });

      const contentEl = itemEl.createEl('div', { cls: 'suggestion-content' });
      const titleEl = contentEl.createEl('div', { cls: 'suggestion-title' });

      // Options dropdown - show prefix with description (use label for display)
      titleEl.createSpan({ text: this.getOptionLabel(suggestion) });

      const infoText = this.getPrefixDescription(suggestion);
      if (infoText) {
        titleEl.createSpan({
          cls: 'search-suggest-info-text',
          text: ` ${infoText}`,
        });
      }

      // Add click handler
      itemEl.addEventListener('mousedown', (e) => {
        e.preventDefault(); // Prevent focus loss
        // For prefix selections, set the flag immediately to prevent race conditions
        const isPrefixSelection =
          suggestion.endsWith(':') && !suggestion.includes(' ');
        if (isPrefixSelection) {
          this.isHandlingPrefixSelection = true;
        }
        this.handleSelection(suggestion);
      });

      // Add click handler to prevent bubbling (fixes issue where suggestion dropdown closes immediately)
      itemEl.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
      });

      // Add mouseover handler for selection
      itemEl.addEventListener('mouseover', () => {
        this.selectedIndex = index;
        this.updateSelectionWithHistory();
      });
    });

    // Render history section if we have history items
    if (this.searchHistory.length > 0) {
      this.renderHistorySection(suggestionEl);
    }
  }

  /**
   * Render the history section with header and history items
   */
  private renderHistorySection(parent: HTMLElement): void {
    // History header with clear button
    const headerItem = parent.createEl('div', {
      cls: 'suggestion-item mod-complex search-suggest-item mod-group',
    });

    // Prevent click from closing dropdown
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

    // Clear button (X icon)
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

    // History items
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

  /**
   * Handle selection of a history item
   */
  private handleHistorySelection(query: string): void {
    // Replace entire input with the history query
    this.inputEl.value = query;
    this.inputEl.selectionStart = this.inputEl.selectionEnd = query.length;

    // Hide dropdown
    this.hide();

    // Trigger search
    setTimeout(() => {
      const event = new Event('input', { bubbles: true });
      this.inputEl.dispatchEvent(event);
    }, 0);

    // Focus input
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

  /**
   * Update selection visual state including history items
   */
  private updateSelectionWithHistory(): void {
    const items = this.containerEl.querySelectorAll(
      '.search-suggest-item:not(.mod-group)',
    );

    items.forEach((item, index) => {
      // Map the DOM index to the logical index
      // DOM order: option items first, then history items
      if (index === this.selectedIndex) {
        item.addClass('is-selected');
      } else {
        item.removeClass('is-selected');
      }
    });
  }

  public handleKeyDown(event: KeyboardEvent): boolean {
    if (!this.isShowing) return false;

    // Calculate total items: options + history items
    const totalItems =
      this.currentSuggestions.length + this.searchHistory.length;

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
            // Selected an option
            this.handleSelection(this.currentSuggestions[this.selectedIndex]);
          } else {
            // Selected a history item
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

  private handleSelection(suggestion: string): void {
    const input = this.inputEl;
    const cursorPos = input.selectionStart ?? 0;
    const currentValue = input.value;

    // Check if this is a prefix selection (like "path:")
    // Property search [] is also treated as a prefix selection
    const isPrefixSelection =
      (suggestion.endsWith(':') && !suggestion.includes(' ')) ||
      suggestion === '[]';

    // Find the start of the current word/prefix
    let startPos = cursorPos;
    while (startPos > 0 && !/\s/.test(currentValue[startPos - 1])) {
      startPos--;
    }

    // Insert new prefix (including [] for property search)
    const newValue =
      currentValue.substring(0, startPos) +
      suggestion +
      currentValue.substring(cursorPos);
    input.value = newValue;

    // For property search [], position cursor inside the brackets
    if (suggestion === '[]') {
      input.selectionStart = input.selectionEnd = startPos + 1; // Position between [ and ]
    } else {
      input.selectionStart = input.selectionEnd = startPos + suggestion.length;
    }

    // For prefix selections, we need to manually show the suggestions
    // because the input handler might not catch it in time
    if (isPrefixSelection) {
      // Hide this options dropdown first
      this.hide();

      // Set flag to indicate we're handling a prefix selection
      this.isHandlingPrefixSelection = true;

      // Also set the suggestion dropdown's flag to prevent it from being hidden on blur
      if (this.suggestionDropdown) {
        this.suggestionDropdown.isHandlingPrefixSelection = true;
        // For property search, pass 'property:' as the prefix for the suggestion dropdown
        // so it knows to show property suggestions
        const prefixForDropdown =
          suggestion === '[]' ? 'property:' : suggestion;
        this.suggestionDropdown.showPrefixDropdown(prefixForDropdown, '');
      }
    }

    // Trigger search - defer to allow click event to process first
    setTimeout(() => {
      const event = new Event('input', { bubbles: true });
      input.dispatchEvent(event);
    }, 150);

    // For prefix selections, keep the flag set until the next user interaction
    // The flag will be reset when the user starts typing or makes another selection
    if (!isPrefixSelection) {
      // Only reset the flag if this is not a prefix selection
      this.isHandlingPrefixSelection = false;
    }

    // Focus input
    input.focus();

    // If this was a prefix selection, set up a one-time keydown handler to reset the flag
    // when the user starts typing after the selection
    if (isPrefixSelection) {
      const resetFlagOnKeyDown = (e: KeyboardEvent) => {
        this.isHandlingPrefixSelection = false;
        input.removeEventListener('keydown', resetFlagOnKeyDown);
      };
      input.addEventListener('keydown', resetFlagOnKeyDown);
    }
  }

  private onVisibilityChange: ((isVisible: boolean) => void) | null = null;

  /**
   * Set a callback to be notified when dropdown visibility changes
   * @param callback Function called with true when shown, false when hidden
   */
  public setOnVisibilityChange(callback: (isVisible: boolean) => void): void {
    this.onVisibilityChange = callback;
  }

  public show(): void {
    if (this.isShowing) return;

    this.updatePosition();
    this.containerEl.addClass('show');
    this.isShowing = true;

    // Notify visibility change
    if (this.onVisibilityChange) {
      this.onVisibilityChange(true);
    }

    // Scroll selected item into view
    const selectedItem = this.containerEl.querySelector('.is-selected');
    if (selectedItem) {
      selectedItem.scrollIntoView({ block: 'nearest' });
    }
  }

  public hide(): void {
    if (!this.isShowing) return;

    this.containerEl.removeClass('show');
    this.isShowing = false;
    this.selectedIndex = -1;

    // Notify visibility change
    if (this.onVisibilityChange) {
      this.onVisibilityChange(false);
    }
  }

  /**
   * Check if the dropdown is currently visible
   * @returns true if the dropdown is showing
   */
  public isVisible(): boolean {
    return this.isShowing;
  }

  /**
   * Get all focusable elements within the dropdown
   * @returns Array of focusable HTMLElements
   */
  private getFocusableElements(): HTMLElement[] {
    const focusableSelector =
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
    return Array.from(
      this.containerEl.querySelectorAll(focusableSelector),
    ) as HTMLElement[];
  }

  /**
   * Add keyboard navigation and focus trapping to dropdown
   */
  private setupKeyboardNavigation(): void {
    this.containerEl.addEventListener('keydown', (e: KeyboardEvent) => {
      const focusableElements = this.getFocusableElements();
      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];
      const activeElement = document.activeElement;

      // Trap Tab key within dropdown
      if (e.key === 'Tab') {
        if (e.shiftKey && activeElement === firstElement) {
          // Shift+Tab on first element - trap at first element
          e.preventDefault();
          lastElement.focus();
        } else if (!e.shiftKey && activeElement === lastElement) {
          // Tab on last element - trap at last element
          e.preventDefault();
          firstElement.focus();
        }
      }

      // Arrow key navigation
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

      // Escape key to close dropdown
      if (e.key === 'Escape') {
        e.preventDefault();
        this.hide();
        this.inputEl.focus();
      }
    });
  }

  public cleanup(): void {
    if (this.containerEl && this.containerEl.parentNode) {
      this.containerEl.remove();
    }
  }
}
