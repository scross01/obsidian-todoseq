import { Vault, App } from 'obsidian';
import { Task } from '../../types/task';
import { SearchSuggestions } from '../../search/search-suggestions';
import { TodoTrackerSettings } from '../../settings/settings-types';
import { TaskListViewMode } from '../task-list/task-list-view';
import { BaseDropdown } from './base-dropdown';

export class SearchSuggestionDropdown extends BaseDropdown {
  private app: App;
  private tasks: Task[];
  private settings: TodoTrackerSettings;
  private viewMode: TaskListViewMode;
  private currentPrefix: string | null = null;
  public isHandlingPrefixSelection = false;
  private justSelected = false;

  constructor(
    inputEl: HTMLInputElement,
    vault: Vault,
    app: App,
    tasks: Task[],
    settings: TodoTrackerSettings,
    viewMode: TaskListViewMode,
  ) {
    super(inputEl, vault);
    this.app = app;
    this.tasks = tasks;
    this.settings = settings;
    this.viewMode = viewMode;
  }

  protected shouldPreventHide(): boolean {
    return this.isHandlingPrefixSelection;
  }

  public updateTasks(tasks: Task[]): void {
    this.tasks = tasks;
  }

  public async showPrefixDropdown(
    prefix: string,
    searchTerm = '',
  ): Promise<void> {
    if (this.justSelected) return;

    this.currentPrefix = prefix;

    const prefixKey = prefix.endsWith(':') ? prefix.slice(0, -1) : prefix;

    if (prefixKey === 'content') {
      this.hide();
      return;
    }

    let allSuggestions: string[] = [];
    switch (prefixKey) {
      case 'path':
        if (this.tasks && this.tasks.length > 0) {
          allSuggestions = SearchSuggestions.getAllPathsFromTasks(
            this.tasks,
            this.viewMode,
          );
        } else {
          allSuggestions = await SearchSuggestions.getAllPaths(this.vault);
        }
        break;
      case 'file':
        if (this.tasks && this.tasks.length > 0) {
          allSuggestions = SearchSuggestions.getAllFilesFromTasks(
            this.tasks,
            this.viewMode,
          );
        } else {
          allSuggestions = await SearchSuggestions.getAllFiles(this.vault);
        }
        break;
      case 'tag':
        allSuggestions = SearchSuggestions.getAllTags(
          this.tasks,
          this.viewMode,
        );
        break;
      case 'state':
        allSuggestions = SearchSuggestions.getAllStates(this.settings);
        break;
      case 'priority':
        allSuggestions = SearchSuggestions.getPriorityOptions();
        break;
      case 'scheduled':
        {
          const scheduledSuggestions = SearchSuggestions.getDateSuggestions();
          const taskScheduledDates =
            this.tasks && this.tasks.length > 0
              ? SearchSuggestions.getScheduledDateSuggestions(
                  this.tasks,
                  this.viewMode,
                )
              : [];
          allSuggestions = [...scheduledSuggestions, ...taskScheduledDates];
        }
        break;
      case 'deadline':
        {
          const deadlineSuggestions = SearchSuggestions.getDateSuggestions();
          const taskDeadlineDates =
            this.tasks && this.tasks.length > 0
              ? SearchSuggestions.getDeadlineDateSuggestions(
                  this.tasks,
                  this.viewMode,
                )
              : [];
          allSuggestions = [...deadlineSuggestions, ...taskDeadlineDates];
        }
        break;
      case 'property':
        allSuggestions = SearchSuggestions.getAllPropertyKeys(this.app);
        break;
      case 'content':
        allSuggestions = [];
        break;
      default:
        allSuggestions = [];
    }

    if (searchTerm) {
      this.currentSuggestions = SearchSuggestions.filterSuggestions(
        searchTerm,
        allSuggestions,
      );
    } else {
      this.currentSuggestions = allSuggestions;
    }

    await this.renderDropdown();
    this.show();
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
      const emptyItem = suggestionEl.createEl('div', {
        cls: 'suggestion-item mod-complex search-suggest-item',
      });
      emptyItem.createEl('div', {
        cls: 'suggestion-content',
        text: 'No suggestions found',
      });
      return;
    }

    this.currentSuggestions.forEach((suggestion, index) => {
      const itemEl = suggestionEl.createEl('div', {
        cls: `suggestion-item mod-complex search-suggest-item ${index === this.selectedIndex ? 'is-selected' : ''}`,
      });

      const contentEl = itemEl.createEl('div', { cls: 'suggestion-content' });
      const titleEl = contentEl.createEl('div', { cls: 'suggestion-title' });

      const displayText = suggestion.endsWith('/')
        ? suggestion.slice(0, -1)
        : suggestion;
      titleEl.createSpan({ text: displayText });

      itemEl.addEventListener('mousedown', (e) => {
        e.preventDefault();
        this.handleSelection(suggestion);
      });

      itemEl.addEventListener('mouseover', () => {
        this.selectedIndex = index;
        this.updateSelection();
      });
    });
  }

  protected handleSelection(suggestion: string): void {
    const input = this.inputEl;
    const cursorPos = input.selectionStart ?? 0;
    const currentValue = input.value;

    const beforeCursor = currentValue.substring(0, cursorPos);
    const prefixMatch = beforeCursor.match(/(\w+):([^\s]*)$/);
    const bracketMatch = beforeCursor.match(/\[([^\]]*)$/);

    if (bracketMatch && !prefixMatch) {
      const bracketContent = bracketMatch[1];
      const bracketStart = cursorPos - bracketContent.length;

      const newValue =
        currentValue.substring(0, bracketStart) +
        `${suggestion}:` +
        currentValue.substring(cursorPos);
      input.value = newValue;
      input.selectionStart = input.selectionEnd =
        bracketStart + suggestion.length + 1;
    } else if (prefixMatch) {
      const fullPrefix = prefixMatch[0];
      const prefixBase = prefixMatch[1];
      const prefixStart = cursorPos - fullPrefix.length;

      if (prefixBase === 'property') {
        const startPos = prefixStart;
        const endPos = cursorPos;
        const newValue =
          currentValue.substring(0, startPos) +
          `["${suggestion}":` +
          currentValue.substring(endPos);
        input.value = newValue;
        input.selectionStart = input.selectionEnd =
          startPos + `["${suggestion}":`.length;
      } else if (
        prefixBase + ':' ===
        fullPrefix.substring(0, prefixBase.length + 1)
      ) {
        const startPos = prefixStart + prefixBase.length + 1;
        let endPos = cursorPos;

        while (
          endPos < currentValue.length &&
          !/\s/.test(currentValue[endPos])
        ) {
          endPos++;
        }

        const finalSuggestion = suggestion.includes(' ')
          ? `"${suggestion}"`
          : suggestion;

        const newValue =
          currentValue.substring(0, startPos) +
          finalSuggestion +
          currentValue.substring(endPos);
        input.value = newValue;
        input.selectionStart = input.selectionEnd =
          startPos + finalSuggestion.length;
      } else {
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
      let startPos = cursorPos;
      while (startPos > 0 && !/\s/.test(currentValue[startPos - 1])) {
        startPos--;
      }

      const newValue =
        currentValue.substring(0, startPos) +
        suggestion +
        currentValue.substring(cursorPos);
      input.value = newValue;
      input.selectionStart = input.selectionEnd = startPos + suggestion.length;
    }

    this.hide();
    this.justSelected = true;

    const event = new Event('input', { bubbles: true });
    input.dispatchEvent(event);

    this.isHandlingPrefixSelection = false;

    input.focus();

    setTimeout(() => {
      this.justSelected = false;
    }, 100);
  }
}
