import { Vault } from 'obsidian';
import { Task } from '../task';
import { SearchSuggestions } from '../search/search-suggestions';
import { TodoTrackerSettings } from '../settings/settings';
import { TaskListViewMode } from './task-list-view';

/**
 * Dropdown component for search prefix filter suggestions
 * Provides autocomplete functionality for prefix-specific values
 */
export class SearchSuggestionDropdown {
  private containerEl: HTMLElement;
  private inputEl: HTMLInputElement;
  private vault: Vault;
  private tasks: Task[];
  private settings: TodoTrackerSettings;
  private viewMode: TaskListViewMode;
  private currentSuggestions: string[] = [];
  private selectedIndex = -1;
  private currentPrefix: string | null = null;
  private isShowing = false;
  public isHandlingPrefixSelection = false;
  private justSelected = false;

  constructor(
    inputEl: HTMLInputElement,
    vault: Vault,
    tasks: Task[],
    settings: TodoTrackerSettings,
    viewMode: TaskListViewMode
  ) {
    this.inputEl = inputEl;
    this.vault = vault;
    this.tasks = tasks;
    this.settings = settings;
    this.viewMode = viewMode;

    // Create dropdown container
    this.containerEl = document.createElement('div');
    this.containerEl.addClass('todoseq-dropdown');

    // Add to document body
    document.body.appendChild(this.containerEl);

    // Set initial width to match input
    this.updateWidth();

    // Add event listeners
    this.setupEventListeners();
  }

  /**
   * Update the tasks used for generating suggestions
   * @param tasks New task list to use for suggestions
   */
  public updateTasks(tasks: Task[]): void {
    this.tasks = tasks;
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
      { passive: true }
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

  public async showPrefixDropdown(
    prefix: string,
    searchTerm = ''
  ): Promise<void> {
    if (this.justSelected) return;

    this.currentPrefix = prefix;

    // Remove colon from prefix for matching (e.g., "path:" -> "path")
    const prefixKey = prefix.endsWith(':') ? prefix.slice(0, -1) : prefix;

    // For content prefix, don't show any dropdown since it's user input only
    if (prefixKey === 'content') {
      this.hide();
      return;
    }

    // Get suggestions based on prefix type
    let allSuggestions: string[] = [];
    switch (prefixKey) {
      case 'path':
        // Use task-based method if tasks are available, otherwise fallback to vault scan
        if (this.tasks && this.tasks.length > 0) {
          allSuggestions = SearchSuggestions.getAllPathsFromTasks(
            this.tasks,
            this.viewMode
          );
        } else {
          allSuggestions = await SearchSuggestions.getAllPaths(this.vault);
        }
        break;
      case 'file':
        // Use task-based method if tasks are available, otherwise fallback to vault scan
        if (this.tasks && this.tasks.length > 0) {
          allSuggestions = SearchSuggestions.getAllFilesFromTasks(
            this.tasks,
            this.viewMode
          );
        } else {
          allSuggestions = await SearchSuggestions.getAllFiles(this.vault);
        }
        break;
      case 'tag':
        allSuggestions = SearchSuggestions.getAllTags(
          this.tasks,
          this.viewMode
        );
        break;
      case 'state':
        allSuggestions = SearchSuggestions.getAllStates(this.settings);
        break;
      case 'priority':
        allSuggestions = SearchSuggestions.getPriorityOptions();
        break;
      case 'scheduled':
        // For scheduled dates, show both standard date suggestions and actual scheduled dates from tasks
        {
          const scheduledSuggestions = SearchSuggestions.getDateSuggestions();
          const taskScheduledDates =
            this.tasks && this.tasks.length > 0
              ? SearchSuggestions.getScheduledDateSuggestions(
                  this.tasks,
                  this.viewMode
                )
              : [];
          allSuggestions = [...scheduledSuggestions, ...taskScheduledDates];
        }
        break;
      case 'deadline':
        // For deadlines, show both standard date suggestions and actual deadline dates from tasks
        {
          const deadlineSuggestions = SearchSuggestions.getDateSuggestions();
          const taskDeadlineDates =
            this.tasks && this.tasks.length > 0
              ? SearchSuggestions.getDeadlineDateSuggestions(
                  this.tasks,
                  this.viewMode
                )
              : [];
          allSuggestions = [...deadlineSuggestions, ...taskDeadlineDates];
        }
        break;
      case 'content':
        // For content, we don't have specific suggestions
        allSuggestions = [];
        break;
      default:
        allSuggestions = [];
    }

    // Filter suggestions based on search term
    if (searchTerm) {
      this.currentSuggestions = SearchSuggestions.filterSuggestions(
        searchTerm,
        allSuggestions
      );
    } else {
      this.currentSuggestions = allSuggestions;
    }

    await this.renderDropdown();
    this.show();
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
      // Show empty state for prefix dropdown
      const emptyItem = suggestionEl.createEl('div', {
        cls: 'suggestion-item mod-complex search-suggest-item',
      });
      emptyItem.createEl('div', {
        cls: 'suggestion-content',
        text: 'No suggestions found',
      });
      return;
    }

    // Render suggestions
    this.currentSuggestions.forEach((suggestion, index) => {
      const itemEl = suggestionEl.createEl('div', {
        cls: `suggestion-item mod-complex search-suggest-item ${index === this.selectedIndex ? 'is-selected' : ''}`,
      });

      const contentEl = itemEl.createEl('div', { cls: 'suggestion-content' });
      const titleEl = contentEl.createEl('div', { cls: 'suggestion-title' });

      // Prefix-specific dropdown - show values
      // Display suggestion without quotes (quotes will be added in handleSelection if needed)
      const displayText = suggestion.endsWith('/')
        ? suggestion.slice(0, -1)
        : suggestion;
      titleEl.createSpan({ text: displayText });

      // Add click handler
      itemEl.addEventListener('mousedown', (e) => {
        e.preventDefault(); // Prevent focus loss on input
        this.handleSelection(suggestion);
      });

      // Add mouseover handler for selection
      itemEl.addEventListener('mouseover', () => {
        this.selectedIndex = index;
        this.updateSelection();
      });
    });
  }

  private updateSelection(): void {
    const items = this.containerEl.querySelectorAll('.search-suggest-item');
    items.forEach((item, index) => {
      if (index === this.selectedIndex) {
        item.addClass('is-selected');
      } else {
        item.removeClass('is-selected');
      }
    });
  }

  public handleKeyDown(event: KeyboardEvent): boolean {
    if (!this.isShowing) return false;

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this.selectedIndex = Math.min(
          this.selectedIndex + 1,
          this.currentSuggestions.length - 1
        );
        this.updateSelection();
        return true;

      case 'ArrowUp':
        event.preventDefault();
        this.selectedIndex = Math.max(this.selectedIndex - 1, -1);
        this.updateSelection();
        return true;

      case 'Enter':
        if (
          this.selectedIndex >= 0 &&
          this.selectedIndex < this.currentSuggestions.length
        ) {
          event.preventDefault();
          this.handleSelection(this.currentSuggestions[this.selectedIndex]);
          return true;
        }
        break;

      case 'Escape':
        event.preventDefault();
        this.hide();
        return true;

      case 'Tab':
        if (
          this.selectedIndex >= 0 &&
          this.selectedIndex < this.currentSuggestions.length
        ) {
          event.preventDefault();
          this.handleSelection(this.currentSuggestions[this.selectedIndex]);
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

    // If we're completing a prefix, include the prefix in replacement
    const beforeCursor = currentValue.substring(0, cursorPos);
    const prefixMatch = beforeCursor.match(/(\w+):([^\s]*)$/);

    if (prefixMatch) {
      const fullPrefix = prefixMatch[0];
      const prefixBase = prefixMatch[1];
      const prefixStart = cursorPos - fullPrefix.length;

      if (prefixBase + ':' === fullPrefix.substring(0, prefixBase.length + 1)) {
        // Complete the value after prefix - replace any existing text after the colon
        const startPos = prefixStart + prefixBase.length + 1; // +1 for the colon
        let endPos = cursorPos;

        // Find the end position - either end of string or next space
        while (
          endPos < currentValue.length &&
          !/\s/.test(currentValue[endPos])
        ) {
          endPos++;
        }

        // Add quotes if suggestion contains spaces
        const finalSuggestion = suggestion.includes(' ')
          ? `"${suggestion}"`
          : suggestion;

        // Reconstruct with the prefix + the final suggestion
        const newValue =
          currentValue.substring(0, startPos) +
          finalSuggestion +
          currentValue.substring(endPos);
        input.value = newValue;
        input.selectionStart = input.selectionEnd =
          startPos + finalSuggestion.length;
      } else {
        // Replace incomplete prefix
        const startPos = prefixStart;
        const endPos = cursorPos;
        const newValue =
          currentValue.substring(0, startPos) +
          suggestion +
          currentValue.substring(endPos);
        input.value = newValue;
        input.selectionStart = input.selectionEnd =
          startPos + suggestion.length;
      }
    } else {
      // Find the start of the current word/prefix
      let startPos = cursorPos;
      while (startPos > 0 && !/\s/.test(currentValue[startPos - 1])) {
        startPos--;
      }

      // Insert new prefix
      const newValue =
        currentValue.substring(0, startPos) +
        suggestion +
        currentValue.substring(cursorPos);
      input.value = newValue;
      input.selectionStart = input.selectionEnd = startPos + suggestion.length;
    }

    // Hide dropdown and set flag to prevent immediate reopening
    this.hide();
    this.justSelected = true;

    // Trigger search
    const event = new Event('input', { bubbles: true });
    input.dispatchEvent(event);

    // Reset the prefix selection flag
    this.isHandlingPrefixSelection = false;

    // Focus input
    input.focus();

    // Reset justSelected flag after a delay to handle potential async calls in showPrefixDropdown
    setTimeout(() => {
      this.justSelected = false;
    }, 100);
  }

  public show(): void {
    if (this.isShowing) return;

    this.updatePosition();
    this.containerEl.addClass('show');
    this.isShowing = true;

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
  }

  public cleanup(): void {
    if (this.containerEl && this.containerEl.parentNode) {
      this.containerEl.remove();
    }
  }
}
