/**
 * Settings migration utilities for TODOseq plugin.
 * Handles migrating settings from older versions to newer versions.
 */

export interface SettingsMigrations {
  version: number;
  migrate: (settings: Record<string, unknown>) => Record<string, unknown>;
}

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
          typeof (oldValue as { enabled: unknown }).enabled === 'boolean'
        ) {
          migrated['languageCommentSupport'] = (
            oldValue as { enabled: boolean }
          ).enabled;
        }
      }

      return migrated;
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
