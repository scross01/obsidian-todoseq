/**
 * Unit tests for SavedSearchManager service
 * Tests CRUD operations, validation, and reordering of saved searches
 */
import {
  SavedSearch,
  TodoTrackerSettings,
  DefaultSettings,
} from '../src/settings/settings-types';
import {
  validateSavedSearchName,
  createSavedSearch,
  addSavedSearch,
  updateSavedSearch,
  deleteSavedSearch,
  getSavedSearches,
  findSavedSearch,
  findSavedSearchByQuery,
  reorderSavedSearches,
} from '../src/services/saved-search-manager';
import {
  migrateSettings,
  getLatestSettingsVersion,
} from '../src/utils/settings-migration';
import { createBaseSettings } from './helpers/test-helper';

describe('saved-search-manager', () => {
  describe('validateSavedSearchName', () => {
    test('should return null for valid name', () => {
      expect(validateSavedSearchName('My Search')).toBeNull();
    });

    test('should return null for name with leading/trailing spaces', () => {
      expect(validateSavedSearchName('  My Search  ')).toBeNull();
    });

    test('should return error for empty name', () => {
      expect(validateSavedSearchName('')).toBe('Name cannot be empty');
    });

    test('should return error for whitespace-only name', () => {
      expect(validateSavedSearchName('   ')).toBe('Name cannot be empty');
    });

    test('should return error for name exceeding 50 characters', () => {
      const longName = 'a'.repeat(51);
      expect(validateSavedSearchName(longName)).toBe(
        'Name cannot exceed 50 characters',
      );
    });

    test('should accept name at exactly 50 characters', () => {
      const maxName = 'a'.repeat(50);
      expect(validateSavedSearchName(maxName)).toBeNull();
    });
  });

  describe('createSavedSearch', () => {
    test('should create a saved search with name and query', () => {
      const search = createSavedSearch('My Search', 'state:active');
      expect(search.name).toBe('My Search');
      expect(search.query).toBe('state:active');
      expect(search.id).toBeDefined();
      expect(search.id.startsWith('ss-')).toBe(true);
    });

    test('should trim whitespace from name', () => {
      const search = createSavedSearch('  My Search  ', 'tag:work');
      expect(search.name).toBe('My Search');
    });

    test('should include optional settings when provided', () => {
      const search = createSavedSearch('Test', 'scheduled:today', {
        viewMode: 'hideCompleted',
        sortMethod: 'sortByScheduled',
        futureTaskSorting: 'hideFuture',
      });
      expect(search.viewMode).toBe('hideCompleted');
      expect(search.sortMethod).toBe('sortByScheduled');
      expect(search.futureTaskSorting).toBe('hideFuture');
    });

    test('should have undefined optional fields when not provided', () => {
      const search = createSavedSearch('Test', 'tag:work');
      expect(search.viewMode).toBeUndefined();
      expect(search.sortMethod).toBeUndefined();
      expect(search.futureTaskSorting).toBeUndefined();
    });

    test('should generate unique IDs', () => {
      const search1 = createSavedSearch('A', 'tag:a');
      const search2 = createSavedSearch('B', 'tag:b');
      expect(search1.id).not.toBe(search2.id);
    });
  });

  describe('addSavedSearch', () => {
    test('should add a saved search to settings', () => {
      const settings = createBaseSettings({ savedSearches: [] });
      const search = createSavedSearch('Test', 'tag:test');
      addSavedSearch(settings, search);
      expect(settings.savedSearches).toHaveLength(1);
      expect(settings.savedSearches[0]).toBe(search);
    });

    test('should append to existing saved searches', () => {
      const existing = createSavedSearch('Existing', 'tag:old');
      const settings = createBaseSettings({ savedSearches: [existing] });
      const newSearch = createSavedSearch('New', 'tag:new');
      addSavedSearch(settings, newSearch);
      expect(settings.savedSearches).toHaveLength(2);
      expect(settings.savedSearches[1]).toBe(newSearch);
    });
  });

  describe('updateSavedSearch', () => {
    test('should update an existing saved search', () => {
      const search = createSavedSearch('Old Name', 'old:query');
      const settings = createBaseSettings({ savedSearches: [search] });
      const result = updateSavedSearch(settings, search.id, {
        name: 'New Name',
        query: 'new:query',
      });
      expect(result).toBe(true);
      expect(settings.savedSearches[0].name).toBe('New Name');
      expect(settings.savedSearches[0].query).toBe('new:query');
    });

    test('should preserve unchanged fields', () => {
      const search = createSavedSearch('Name', 'query', {
        viewMode: 'hideCompleted',
        sortMethod: 'sortByPriority',
      });
      const settings = createBaseSettings({ savedSearches: [search] });
      updateSavedSearch(settings, search.id, { name: 'Updated' });
      expect(settings.savedSearches[0].viewMode).toBe('hideCompleted');
      expect(settings.savedSearches[0].sortMethod).toBe('sortByPriority');
    });

    test('should return false for non-existent ID', () => {
      const settings = createBaseSettings({ savedSearches: [] });
      const result = updateSavedSearch(settings, 'non-existent', {
        name: 'Test',
      });
      expect(result).toBe(false);
    });
  });

  describe('deleteSavedSearch', () => {
    test('should delete an existing saved search', () => {
      const search = createSavedSearch('Test', 'tag:test');
      const settings = createBaseSettings({ savedSearches: [search] });
      const result = deleteSavedSearch(settings, search.id);
      expect(result).toBe(true);
      expect(settings.savedSearches).toHaveLength(0);
    });

    test('should return false for non-existent ID', () => {
      const settings = createBaseSettings({ savedSearches: [] });
      const result = deleteSavedSearch(settings, 'non-existent');
      expect(result).toBe(false);
    });

    test('should only delete the targeted search', () => {
      const search1 = createSavedSearch('A', 'tag:a');
      const search2 = createSavedSearch('B', 'tag:b');
      const settings = createBaseSettings({
        savedSearches: [search1, search2],
      });
      deleteSavedSearch(settings, search1.id);
      expect(settings.savedSearches).toHaveLength(1);
      expect(settings.savedSearches[0].name).toBe('B');
    });
  });

  describe('getSavedSearches', () => {
    test('should return all saved searches', () => {
      const search1 = createSavedSearch('A', 'tag:a');
      const search2 = createSavedSearch('B', 'tag:b');
      const settings = createBaseSettings({
        savedSearches: [search1, search2],
      });
      expect(getSavedSearches(settings)).toHaveLength(2);
    });

    test('should return empty array when no saved searches', () => {
      const settings = createBaseSettings({ savedSearches: [] });
      expect(getSavedSearches(settings)).toHaveLength(0);
    });
  });

  describe('findSavedSearch', () => {
    test('should find a saved search by ID', () => {
      const search = createSavedSearch('Test', 'tag:test');
      const settings = createBaseSettings({ savedSearches: [search] });
      expect(findSavedSearch(settings, search.id)).toBe(search);
    });

    test('should return undefined for non-existent ID', () => {
      const settings = createBaseSettings({ savedSearches: [] });
      expect(findSavedSearch(settings, 'non-existent')).toBeUndefined();
    });
  });

  describe('findSavedSearchByQuery', () => {
    test('should find a saved search by exact query match', () => {
      const search = createSavedSearch('Today', 'scheduled:today');
      const settings = createBaseSettings({ savedSearches: [search] });
      expect(findSavedSearchByQuery(settings, 'scheduled:today')).toBe(search);
    });

    test('should trim whitespace when matching', () => {
      const search = createSavedSearch('Test', 'tag:work');
      const settings = createBaseSettings({ savedSearches: [search] });
      expect(findSavedSearchByQuery(settings, '  tag:work  ')).toBe(search);
    });

    test('should return undefined when no match', () => {
      const search = createSavedSearch('Test', 'tag:work');
      const settings = createBaseSettings({ savedSearches: [search] });
      expect(findSavedSearchByQuery(settings, 'tag:personal')).toBeUndefined();
    });
  });

  describe('reorderSavedSearches', () => {
    test('should move a search from one position to another', () => {
      const search1 = createSavedSearch('A', 'tag:a');
      const search2 = createSavedSearch('B', 'tag:b');
      const search3 = createSavedSearch('C', 'tag:c');
      const settings = createBaseSettings({
        savedSearches: [search1, search2, search3],
      });
      reorderSavedSearches(settings, 0, 2);
      expect(settings.savedSearches[0].name).toBe('B');
      expect(settings.savedSearches[1].name).toBe('C');
      expect(settings.savedSearches[2].name).toBe('A');
    });

    test('should handle same position (no-op)', () => {
      const search1 = createSavedSearch('A', 'tag:a');
      const search2 = createSavedSearch('B', 'tag:b');
      const settings = createBaseSettings({
        savedSearches: [search1, search2],
      });
      reorderSavedSearches(settings, 0, 0);
      expect(settings.savedSearches[0].name).toBe('A');
      expect(settings.savedSearches[1].name).toBe('B');
    });

    test('should handle out-of-bounds indices gracefully', () => {
      const search = createSavedSearch('A', 'tag:a');
      const settings = createBaseSettings({ savedSearches: [search] });
      reorderSavedSearches(settings, -1, 0);
      expect(settings.savedSearches).toHaveLength(1);
      reorderSavedSearches(settings, 0, 5);
      expect(settings.savedSearches).toHaveLength(1);
    });
  });
});

describe('settings migration v5 - saved searches', () => {
  test('should add default saved searches when migrating from version 4', () => {
    const settings = {
      settingsVersion: 4,
      someSetting: 'value',
    };
    const result = migrateSettings(settings as Record<string, unknown>);
    expect(result.settingsVersion).toBe(5);
    expect(result.savedSearches).toBeDefined();
    const searches = result.savedSearches as SavedSearch[];
    expect(searches).toHaveLength(3);
    expect(searches[0].name).toBe('Today');
    expect(searches[0].query).toBe('scheduled:today');
    expect(searches[1].name).toBe('Overdue');
    expect(searches[1].query).toBe('deadline:overdue');
    expect(searches[2].name).toBe('Active');
    expect(searches[2].query).toBe('state:active');
  });

  test('should not overwrite existing saved searches', () => {
    const existingSearches = [
      { id: 'custom-1', name: 'Custom', query: 'tag:custom' },
    ];
    const settings = {
      settingsVersion: 4,
      savedSearches: existingSearches,
    };
    const result = migrateSettings(settings as Record<string, unknown>);
    expect(result.settingsVersion).toBe(5);
    const searches = result.savedSearches as SavedSearch[];
    expect(searches).toHaveLength(1);
    expect(searches[0].name).toBe('Custom');
  });

  test('should not apply migration when already at version 5', () => {
    const settings = {
      settingsVersion: 5,
      savedSearches: [{ id: 'test', name: 'Test', query: 'tag:test' }],
    };
    const result = migrateSettings(settings as Record<string, unknown>);
    const searches = result.savedSearches as SavedSearch[];
    expect(searches).toHaveLength(1);
    expect(searches[0].name).toBe('Test');
  });

  test('should set correct view mode and sort for Today preset', () => {
    const settings = { settingsVersion: 4 };
    const result = migrateSettings(settings as Record<string, unknown>);
    const searches = result.savedSearches as SavedSearch[];
    const today = searches.find((s) => s.name === 'Today');
    expect(today).toBeDefined();
    expect(today!.viewMode).toBe('hideCompleted');
    expect(today!.sortMethod).toBe('sortByScheduled');
  });

  test('getLatestSettingsVersion should return 5', () => {
    expect(getLatestSettingsVersion()).toBe(5);
  });
});

describe('DefaultSettings - saved searches', () => {
  test('should include 3 default saved searches', () => {
    expect(DefaultSettings.savedSearches).toHaveLength(3);
  });

  test('should have Today as first default', () => {
    expect(DefaultSettings.savedSearches[0].name).toBe('Today');
    expect(DefaultSettings.savedSearches[0].query).toBe('scheduled:today');
  });

  test('should have Overdue as second default', () => {
    expect(DefaultSettings.savedSearches[1].name).toBe('Overdue');
    expect(DefaultSettings.savedSearches[1].query).toBe('deadline:overdue');
  });

  test('should have Active as third default', () => {
    expect(DefaultSettings.savedSearches[2].name).toBe('Active');
    expect(DefaultSettings.savedSearches[2].query).toBe('state:active');
  });
});
