import { SavedSearch, TodoTrackerSettings } from '../settings/settings-types';
import { SortMethod } from '../view/task-list/task-list-filter';

const MAX_NAME_LENGTH = 50;

/**
 * Generate a unique ID for a saved search
 */
function generateId(): string {
  return `ss-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Validates a saved search name
 * @returns null if valid, error message if invalid
 */
export function validateSavedSearchName(name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) {
    return 'Name cannot be empty';
  }
  if (trimmed.length > MAX_NAME_LENGTH) {
    return `Name cannot exceed ${MAX_NAME_LENGTH} characters`;
  }
  return null;
}

/**
 * Create a new saved search from the current view state
 */
export function createSavedSearch(
  name: string,
  query: string,
  options: {
    viewMode?: TodoTrackerSettings['taskListViewMode'];
    sortMethod?: SortMethod;
    futureTaskSorting?: TodoTrackerSettings['futureTaskSorting'];
    matchCase?: boolean;
  } = {},
): SavedSearch {
  return {
    id: generateId(),
    name: name.trim(),
    query,
    viewMode: options.viewMode,
    sortMethod: options.sortMethod,
    futureTaskSorting: options.futureTaskSorting,
    matchCase: options.matchCase,
  };
}

/**
 * Add a saved search to settings
 */
export function addSavedSearch(
  settings: TodoTrackerSettings,
  savedSearch: SavedSearch,
): void {
  settings.savedSearches.push(savedSearch);
}

/**
 * Update an existing saved search in settings
 */
export function updateSavedSearch(
  settings: TodoTrackerSettings,
  id: string,
  updates: Partial<Omit<SavedSearch, 'id'>>,
): boolean {
  const index = settings.savedSearches.findIndex((s) => s.id === id);
  if (index === -1) {
    return false;
  }
  const existing = settings.savedSearches[index];
  if (existing === undefined) {
    return false;
  }
  settings.savedSearches[index] = { ...existing, ...updates };
  return true;
}

/**
 * Delete a saved search from settings
 */
export function deleteSavedSearch(
  settings: TodoTrackerSettings,
  id: string,
): boolean {
  const index = settings.savedSearches.findIndex((s) => s.id === id);
  if (index === -1) {
    return false;
  }
  settings.savedSearches.splice(index, 1);
  return true;
}

/**
 * Get all saved searches from settings
 */
export function getSavedSearches(settings: TodoTrackerSettings): SavedSearch[] {
  return settings.savedSearches;
}

/**
 * Find a saved search by ID
 */
export function findSavedSearch(
  settings: TodoTrackerSettings,
  id: string,
): SavedSearch | undefined {
  return settings.savedSearches.find((s) => s.id === id);
}

/**
 * Find a saved search that matches the given query
 */
export function findSavedSearchByQuery(
  settings: TodoTrackerSettings,
  query: string,
): SavedSearch | undefined {
  const trimmed = query.trim();
  return settings.savedSearches.find((s) => s.query === trimmed);
}

/**
 * Reorder saved searches by moving one from oldIndex to newIndex
 */
export function reorderSavedSearches(
  settings: TodoTrackerSettings,
  oldIndex: number,
  newIndex: number,
): void {
  const searches = settings.savedSearches;
  if (
    oldIndex < 0 ||
    oldIndex >= searches.length ||
    newIndex < 0 ||
    newIndex >= searches.length
  ) {
    return;
  }
  const [moved] = searches.splice(oldIndex, 1);
  if (moved) {
    searches.splice(newIndex, 0, moved);
  }
}
