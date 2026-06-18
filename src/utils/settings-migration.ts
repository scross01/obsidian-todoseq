import { DEFAULT_SAVED_SEARCHES } from '../settings/settings-types';

/**
 * Settings migration utilities for TODOseq plugin.
 * Handles migrating settings from older versions to newer versions.
 */

export interface SettingsMigrations {
  version: number;
  migrate: (settings: Record<string, unknown>) => Record<string, unknown>;
}

// Note: Migrations v3 and v4 (smart date settings, warning periods) were
// no-op migrations that have been removed for simplicity. Existing users
// with settingsVersion < 5 jump straight to v5, which supplies all defaults
// via DefaultSettings.
const MIGRATIONS: SettingsMigrations[] = [
  {
    version: 1,
    migrate: (settings: Record<string, unknown>): Record<string, unknown> => {
      const migrated = { ...settings };

      if ('additionalTaskKeywords' in migrated) {
        migrated['additionalInactiveKeywords'] =
          migrated['additionalTaskKeywords'];
        delete migrated['additionalTaskKeywords'];
      }

      return migrated;
    },
  },
  {
    version: 2,
    migrate: (settings: Record<string, unknown>): Record<string, unknown> => {
      const migrated = { ...settings };

      if ('languageCommentSupport' in migrated) {
        const oldValue = migrated['languageCommentSupport'];
        if (
          typeof oldValue === 'object' &&
          oldValue !== null &&
          'enabled' in oldValue &&
          typeof oldValue.enabled === 'boolean'
        ) {
          migrated['languageCommentSupport'] = (
            oldValue as { enabled: boolean }
          ).enabled;
        }
      }

      return migrated;
    },
  },
  {
    version: 5,
    migrate: (settings: Record<string, unknown>) => {
      // v5: added saved searches with default presets
      // If savedSearches is not already present, add the default presets.
      // Existing users get the initial set of saved searches.
      // New installs will get them from DefaultSettings.
      if (!('savedSearches' in settings)) {
        return {
          ...settings,
          savedSearches: DEFAULT_SAVED_SEARCHES,
        };
      }
      return { ...settings };
    },
  },
];

export function migrateSettings(
  settings: Record<string, unknown> | null,
): Record<string, unknown> {
  if (!settings) {
    return {};
  }

  const currentVersion = (settings['settingsVersion'] as number) ?? 0;

  let migratedSettings = { ...settings };

  for (const migration of MIGRATIONS) {
    if (currentVersion < migration.version) {
      migratedSettings = migration.migrate(migratedSettings);
      migratedSettings['settingsVersion'] = migration.version;
    }
  }

  return migratedSettings;
}

export function getLatestSettingsVersion(): number {
  return MIGRATIONS.length > 0
    ? Math.max(...MIGRATIONS.map((m) => m.version))
    : 0;
}
