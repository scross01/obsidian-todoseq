import { Vault } from 'obsidian';
import { Task } from '../task';
import { SearchSuggestions } from './search-suggestions';
import { TodoTrackerSettings } from '../settings/settings';

/**
 * Dropdown component for search prefix filter suggestions
 * Provides autocomplete functionality for prefix filters
 */
export class SearchSuggestionDropdown {
    private containerEl: HTMLElement;
    private inputEl: HTMLInputElement;
    private vault: Vault;
    private tasks: Task[];
    private settings: TodoTrackerSettings;
    private currentSuggestions: string[] = [];
    private selectedIndex = -1;
    private currentPrefix: string | null = null;
    private isShowing = false;
    public isHandlingPrefixSelection = false;
    
    constructor(inputEl: HTMLInputElement, vault: Vault, tasks: Task[], settings: TodoTrackerSettings) {
    this.inputEl = inputEl;
    this.vault = vault;
    this.tasks = tasks;
    this.settings = settings;
    
    // Create dropdown container
    this.containerEl = document.createElement('div');
    this.containerEl.style.position = 'absolute';
    this.containerEl.style.zIndex = '1000';
    this.containerEl.style.display = 'none';
    
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
        
        // Window resize
        window.addEventListener('resize', () => {
            this.updatePosition();
            this.updateWidth();
        });
        
        // Scroll handling
        window.addEventListener('scroll', () => {
            this.updatePosition();
        }, { passive: true });
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
        this.currentPrefix = null;
        const allOptions = [
            'path:', 'file:', 'tag:', 'state:', 'priority:', 'content:', 'scheduled:', 'deadline:'
        ];
        
        // Filter options based on search term
        if (searchTerm) {
            this.currentSuggestions = SearchSuggestions.filterSuggestions(searchTerm, allOptions);
        } else {
            this.currentSuggestions = allOptions;
        }
        
        await this.renderDropdown();
        this.show();
    }
    
    public async showPrefixDropdown(prefix: string, searchTerm = ''): Promise<void> {
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
                allSuggestions = SearchSuggestions.getAllPathsFromTasks(this.tasks);
            } else {
                allSuggestions = await SearchSuggestions.getAllPaths(this.vault);
            }
            break;
        case 'file':
            // Use task-based method if tasks are available, otherwise fallback to vault scan
            if (this.tasks && this.tasks.length > 0) {
                allSuggestions = SearchSuggestions.getAllFilesFromTasks(this.tasks);
            } else {
                allSuggestions = await SearchSuggestions.getAllFiles(this.vault);
            }
            break;
        case 'tag':
            allSuggestions = SearchSuggestions.getAllTags(this.tasks);
            break;
        case 'state':
            allSuggestions = SearchSuggestions.getAllStates(this.settings);
            break;
        case 'priority':
          allSuggestions = SearchSuggestions.getPriorityOptions();
          break;
        case 'scheduled':
          // For scheduled dates, show both standard date suggestions and actual scheduled dates from tasks
          const scheduledSuggestions = SearchSuggestions.getDateSuggestions();
          const taskScheduledDates = this.tasks && this.tasks.length > 0
            ? SearchSuggestions.getScheduledDateSuggestions(this.tasks)
            : [];
          allSuggestions = [...scheduledSuggestions, ...taskScheduledDates];
          break;
        case 'deadline':
          // For deadlines, show both standard date suggestions and actual deadline dates from tasks
          const deadlineSuggestions = SearchSuggestions.getDateSuggestions();
          const taskDeadlineDates = this.tasks && this.tasks.length > 0
            ? SearchSuggestions.getDeadlineDateSuggestions(this.tasks)
            : [];
          allSuggestions = [...deadlineSuggestions, ...taskDeadlineDates];
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
        this.currentSuggestions = SearchSuggestions.filterSuggestions(searchTerm, allSuggestions);
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
            attr: { 'style': 'width: 300px;' }
        });
        const suggestionEl = suggestionContainerEl.createEl('div', {
            cls: 'suggestion'
        });

        if (this.currentSuggestions.length === 0) {
            if (this.currentPrefix === null) {
                // No suggestions for options dropdown
                return;
            } else {
                // Show empty state for prefix dropdown
                const emptyItem = suggestionEl.createEl('div', {
                    cls: 'suggestion-item mod-complex search-suggest-item'
                });
                emptyItem.createEl('div', {
                    cls: 'suggestion-content',
                    text: 'No suggestions found'
                });
                return;
            }
        }
        
        // Add "Search options" title section for options dropdown
        if (this.currentPrefix === null) {
            const titleItem = suggestionEl.createEl('div', {
                cls: 'suggestion-item mod-complex search-suggest-item mod-group'
            });
            
            const titleContent = titleItem.createEl('div', { cls: 'suggestion-content' });
            const titleText = titleContent.createEl('div', {
                cls: 'suggestion-title list-item-part mod-extended'
            });
            titleText.createSpan({ text: 'Search options' });
            
            // Add info icon
            const auxEl = titleItem.createEl('div', { cls: 'suggestion-aux' });
            const iconContainer = auxEl.createEl('div', {
                cls: 'list-item-part search-suggest-icon clickable-icon',
                attr: { 'aria-label': 'Read more' }
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
        }
        
        // Render suggestions
        this.currentSuggestions.forEach((suggestion, index) => {
            const itemEl = suggestionEl.createEl('div', {
                cls: `suggestion-item mod-complex search-suggest-item ${index === this.selectedIndex ? 'is-selected' : ''}`
            });
            
            const contentEl = itemEl.createEl('div', { cls: 'suggestion-content' });
            const titleEl = contentEl.createEl('div', { cls: 'suggestion-title' });
            
            if (this.currentPrefix === null) {
                // Options dropdown - show prefix with description
                titleEl.createSpan({ text: suggestion });
                
                const infoText = this.getPrefixDescription(suggestion);
                if (infoText) {
                    titleEl.createSpan({
                        cls: 'search-suggest-info-text',
                        text: ` ${infoText}`
                    });
                }
            } else {
                // Prefix-specific dropdown - show values
                // Display suggestion without quotes (quotes will be added in handleSelection if needed)
                const displayText = suggestion.endsWith('/') ? suggestion.slice(0, -1) : suggestion;
                titleEl.createSpan({ text: displayText });
            }
            
            // Add click handler
            itemEl.addEventListener('click', (e) => {
                // For prefix selections, set the flag immediately to prevent race conditions
                const isPrefixSelection = suggestion.endsWith(':') && !suggestion.includes(' ');
                if (isPrefixSelection) {
                    this.isHandlingPrefixSelection = true;
                }
                this.handleSelection(suggestion);
            });
            
            // Add mouseover handler for selection
            itemEl.addEventListener('mouseover', () => {
                this.selectedIndex = index;
                this.updateSelection();
            });
        });
    }
    
    private getPrefixDescription(prefix: string): string {
        switch (prefix) {
            case 'path:': return 'match path of the file';
            case 'file:': return 'match file name';
            case 'tag:': return 'search for tags';
            case 'state:': return 'match task state';
            case 'priority:': return 'match task priority';
            case 'content:': return 'match task content';
            case 'scheduled:': return 'filter by scheduled date';
            case 'deadline:': return 'filter by deadline date';
            default: return '';
        }
    }
    
    private updateSelection(): void {
        const items = this.containerEl.querySelectorAll('.search-suggest-item');
        items.forEach((item, index) => {
            // Skip the title section (index 0) when currentPrefix is null
            const adjustedIndex = this.currentPrefix === null ? index - 1 : index;
            if (adjustedIndex === this.selectedIndex) {
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
                this.selectedIndex = Math.min(this.selectedIndex + 1, this.currentSuggestions.length - 1);
                this.updateSelection();
                return true;
            
            case 'ArrowUp':
                event.preventDefault();
                this.selectedIndex = Math.max(this.selectedIndex - 1, -1);
                this.updateSelection();
                return true;
            
            case 'Enter':
                if (this.selectedIndex >= 0 && this.selectedIndex < this.currentSuggestions.length) {
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
                if (this.selectedIndex >= 0 && this.selectedIndex < this.currentSuggestions.length) {
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
    
    // Check if this is a prefix selection (like "path:")
    const isPrefixSelection = suggestion.endsWith(':') && !suggestion.includes(' ');
    
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
            while (endPos < currentValue.length && !/\s/.test(currentValue[endPos])) {
                endPos++;
            }
            
            // Add quotes if suggestion contains spaces
            const finalSuggestion = suggestion.includes(' ') ? `"${suggestion}"` : suggestion;
            
            // Reconstruct with the prefix + the final suggestion
            const newValue = (currentValue.substring(0, startPos) + finalSuggestion + currentValue.substring(endPos));
            input.value = newValue;
            input.selectionStart = input.selectionEnd = startPos + finalSuggestion.length;
        } else {
            // Replace incomplete prefix
            const startPos = prefixStart;
            const endPos = cursorPos;
            const newValue = currentValue.substring(0, startPos) + suggestion + currentValue.substring(endPos);
            input.value = newValue;
            input.selectionStart = input.selectionEnd = startPos + suggestion.length;
        }
    } else {
        // Find the start of the current word/prefix
        let startPos = cursorPos;
        while (startPos > 0 && !/\s/.test(currentValue[startPos - 1])) {
            startPos--;
        }
        
        // Insert new prefix
        const newValue = currentValue.substring(0, startPos) + suggestion + currentValue.substring(cursorPos);
        input.value = newValue;
        input.selectionStart = input.selectionEnd = startPos + suggestion.length;
    }
    
    // For prefix selections, we need to manually show the suggestions
    // because the input handler might not catch it in time
    if (isPrefixSelection) {
        // Set flag to indicate we're handling a prefix selection
        this.isHandlingPrefixSelection = true;
        
        // Manually show the prefix dropdown since we just inserted a prefix
        const prefix = suggestion; // This is already in format like "path:"
        this.showPrefixDropdown(prefix, '');
    }
    
    // Trigger search
    const event = new Event('input', { bubbles: true });
    input.dispatchEvent(event);
    
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
    
    public show(): void {
        if (this.isShowing) return;
        
        this.updatePosition();
        this.containerEl.style.display = 'block';
        this.isShowing = true;
        
        // Scroll selected item into view
        const selectedItem = this.containerEl.querySelector('.is-selected');
        if (selectedItem) {
            selectedItem.scrollIntoView({ block: 'nearest' });
        }
    }
    
    public hide(): void {
        if (!this.isShowing) return;
        
        this.containerEl.style.display = 'none';
        this.isShowing = false;
        this.selectedIndex = -1;
    }
    
    public cleanup(): void {
        if (this.containerEl && this.containerEl.parentNode) {
            this.containerEl.remove();
        }
    }
}