import {
  SavedSearch,
  TodoTrackerSettings,
} from '../../settings/settings-types';
import { TaskListViewMode, SortMethod } from '../task-list/task-list-filter';

export interface SavedSearchDialogOptions {
  /** Existing saved search to edit (undefined for create mode) */
  existingSearch?: SavedSearch;
  /** Pre-filled query (used when creating from current search) */
  query?: string;
  /** Current view mode to pre-fill */
  currentViewMode?: TaskListViewMode;
  /** Current sort method to pre-fill */
  currentSortMethod?: SortMethod;
  /** Current future task sorting to pre-fill */
  currentFutureTaskSorting?: TodoTrackerSettings['futureTaskSorting'];
  /** Current match case state to pre-fill */
  currentMatchCase?: boolean;
  /** Called when user saves */
  onSave: (search: Omit<SavedSearch, 'id'>) => void;
  /** Called when user deletes (only in edit mode). Return true to close dialog. */
  onDelete?: () => boolean;
  /** Called when user cancels */
  onCancel: () => void;
}

/**
 * Modal dialog for creating or editing a saved search.
 * Shows fields for name, query, view mode, sort method, and future task sorting.
 */
export class SavedSearchDialog {
  private modalEl: HTMLElement | null = null;
  private backdropEl: HTMLElement | null = null;

  constructor(private options: SavedSearchDialogOptions) {}

  open(): void {
    // Create backdrop
    this.backdropEl = activeDocument.createElement('div');
    this.backdropEl.className = 'todoseq-saved-search-backdrop';
    this.backdropEl.addEventListener('click', () => this.cancel());

    // Create modal
    this.modalEl = activeDocument.createElement('div');
    this.modalEl.className = 'todoseq-saved-search-modal';
    this.modalEl.addEventListener('click', (e) => e.stopPropagation());

    const isEdit = !!this.options.existingSearch;
    const title = isEdit ? 'Edit saved search' : 'Save search';

    // Title
    const titleEl = this.modalEl.createEl('div', {
      cls: 'todoseq-saved-search-title',
    });
    titleEl.createSpan({ text: title });

    // Close button
    const closeBtn = titleEl.createEl('div', {
      cls: 'todoseq-saved-search-close clickable-icon',
    });
    closeBtn.createSpan({ text: '\u00D7' });
    closeBtn.addEventListener('click', () => this.cancel());

    // Form
    const form = this.modalEl.createEl('div', {
      cls: 'todoseq-saved-search-form',
    });

    // Name field
    const nameGroup = form.createEl('div', {
      cls: 'todoseq-saved-search-field',
    });
    nameGroup.createEl('label', { text: 'Name' });
    const nameInput = nameGroup.createEl('input', {
      attr: {
        type: 'text',
        // eslint-disable-next-line obsidianmd/ui/sentence-case -- placeholder examples
        placeholder: 'e.g., agenda, overdue, work active',
        maxlength: '50',
      },
    });
    nameInput.value = this.options.existingSearch?.name ?? '';

    // Query field
    const queryGroup = form.createEl('div', {
      cls: 'todoseq-saved-search-field',
    });
    queryGroup.createEl('label', { text: 'Search query' });
    const queryInput = queryGroup.createEl('input', {
      attr: {
        type: 'text',
        // eslint-disable-next-line obsidianmd/ui/sentence-case -- placeholder examples
        placeholder: 'e.g., scheduled:today, state:active, tag:work',
      },
    });
    queryInput.value =
      this.options.existingSearch?.query ?? this.options.query ?? '';

    // Match case field
    const matchCaseGroup = form.createEl('div', {
      cls: 'todoseq-saved-search-field',
    });
    matchCaseGroup.createEl('label', { text: 'Match case' });
    const matchCaseSelect = matchCaseGroup.createEl('select');
    const matchCaseOptions = [
      { value: '', label: 'Use current setting' },
      { value: 'off', label: 'Off' },
      { value: 'on', label: 'On' },
    ];
    for (const opt of matchCaseOptions) {
      matchCaseSelect.createEl('option', {
        attr: { value: opt.value },
        text: opt.label,
      });
    }
    const existingMatchCase = this.options.existingSearch?.matchCase;
    if (existingMatchCase === true) {
      matchCaseSelect.value = 'on';
    } else if (existingMatchCase === false) {
      matchCaseSelect.value = 'off';
    } else if (existingMatchCase === undefined) {
      // Use current match case state if provided, otherwise default to off
      matchCaseSelect.value = this.options.currentMatchCase ? 'on' : 'off';
    }

    // Sort method field
    const sortGroup = form.createEl('div', {
      cls: 'todoseq-saved-search-field',
    });
    sortGroup.createEl('label', { text: 'Sort tasks by' });
    const sortSelect = sortGroup.createEl('select');
    const sortOptions = [
      { value: '', label: 'Use current setting' },
      { value: 'default', label: 'Default (file path)' },
      { value: 'sortByScheduled', label: 'Scheduled date' },
      { value: 'sortByDeadline', label: 'Deadline date' },
      { value: 'sortByClosedDate', label: 'Closed date' },
      { value: 'sortByPriority', label: 'Priority' },
      { value: 'sortByUrgency', label: 'Urgency' },
      { value: 'sortByKeyword', label: 'Keyword' },
    ];
    for (const opt of sortOptions) {
      sortSelect.createEl('option', {
        attr: { value: opt.value },
        text: opt.label,
      });
    }
    sortSelect.value =
      this.options.existingSearch?.sortMethod ??
      this.options.currentSortMethod ??
      '';

    // Completed tasks view mode field
    const viewModeGroup = form.createEl('div', {
      cls: 'todoseq-saved-search-field',
    });
    viewModeGroup.createEl('label', { text: 'Completed tasks' });
    const viewModeSelect = viewModeGroup.createEl('select');
    const viewModeOptions = [
      { value: '', label: 'Use current setting' },
      { value: 'showAll', label: 'Show' },
      { value: 'sortCompletedLast', label: 'Sort to end' },
      { value: 'hideCompleted', label: 'Hide' },
    ];
    for (const opt of viewModeOptions) {
      viewModeSelect.createEl('option', {
        attr: { value: opt.value },
        text: opt.label,
      });
    }
    viewModeSelect.value =
      this.options.existingSearch?.viewMode ??
      this.options.currentViewMode ??
      '';

    // Future task sorting field
    const futureGroup = form.createEl('div', {
      cls: 'todoseq-saved-search-field',
    });
    futureGroup.createEl('label', { text: 'Future dated tasks' });
    const futureSelect = futureGroup.createEl('select');
    const futureOptions = [
      { value: '', label: 'Use current setting' },
      { value: 'showAll', label: 'Show' },
      { value: 'showUpcoming', label: 'Show upcoming' },
      { value: 'sortToEnd', label: 'Sort to end' },
      { value: 'hideFuture', label: 'Hide' },
    ];
    for (const opt of futureOptions) {
      futureSelect.createEl('option', {
        attr: { value: opt.value },
        text: opt.label,
      });
    }
    futureSelect.value =
      this.options.existingSearch?.futureTaskSorting ??
      this.options.currentFutureTaskSorting ??
      '';

    // Buttons
    const buttons = form.createEl('div', {
      cls: 'todoseq-saved-search-buttons',
    });

    // Delete button (only in edit mode)
    if (isEdit && this.options.onDelete) {
      const deleteBtn = buttons.createEl('button', {
        text: 'Delete',
        cls: 'todoseq-saved-search-btn-delete',
      });
      deleteBtn.addEventListener('click', () => {
        const shouldClose = this.options.onDelete?.() ?? false;
        if (shouldClose) {
          this.close();
        }
      });
    }

    const cancelBtn = buttons.createEl('button', {
      text: 'Cancel',
      cls: 'todoseq-saved-search-btn-cancel',
    });
    cancelBtn.addEventListener('click', () => this.cancel());

    const saveBtn = buttons.createEl('button', {
      text: isEdit ? 'Save changes' : 'Save',
      cls: 'todoseq-saved-search-btn-save',
    });
    saveBtn.addEventListener('click', () => {
      const name = nameInput.value.trim();
      const query = queryInput.value.trim();

      // Validate
      if (!name) {
        nameInput.addClass('todoseq-saved-search-input-error');
        nameInput.focus();
        return;
      }
      if (!query) {
        queryInput.addClass('todoseq-saved-search-input-error');
        queryInput.focus();
        return;
      }

      this.options.onSave({
        name,
        query,
        viewMode: (viewModeSelect.value || undefined) as
          TaskListViewMode | undefined,
        sortMethod: (sortSelect.value || undefined) as SortMethod | undefined,
        futureTaskSorting: (futureSelect.value || undefined) as
          TodoTrackerSettings['futureTaskSorting'] | undefined,
        matchCase:
          matchCaseSelect.value === 'on'
            ? true
            : matchCaseSelect.value === 'off'
              ? false
              : undefined,
      });
      this.close();
    });

    // Handle Enter key in name input
    nameInput.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        saveBtn.click();
      }
      // Clear error styling on input
      nameInput.removeClass('todoseq-saved-search-input-error');
    });

    // Handle Enter key in query input
    queryInput.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        saveBtn.click();
      }
      queryInput.removeClass('todoseq-saved-search-input-error');
    });

    // Handle Escape key
    this.modalEl.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        this.cancel();
      }
    });

    // Append to DOM
    activeDocument.body.appendChild(this.backdropEl);
    activeDocument.body.appendChild(this.modalEl);

    // Focus the name input
    window.setTimeout(() => {
      nameInput.focus();
      if (!nameInput.value) {
        // If creating new, select the name input for immediate typing
        nameInput.select();
      }
    }, 50);
  }

  private cancel(): void {
    this.options.onCancel();
    this.close();
  }

  private close(): void {
    if (this.modalEl) {
      this.modalEl.remove();
      this.modalEl = null;
    }
    if (this.backdropEl) {
      this.backdropEl.remove();
      this.backdropEl = null;
    }
  }
}
