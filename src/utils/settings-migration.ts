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
];

export function migrateSettings(
  settings: Record<string, unknown>,
): Record<string, unknown> {
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
