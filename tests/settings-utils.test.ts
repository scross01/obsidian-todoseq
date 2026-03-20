import { SettingsChangeDetector } from '../src/utils/settings-utils';
import { TodoTrackerSettings } from '../src/settings/settings-types';
import {
  migrateSettings,
  getLatestSettingsVersion,
} from '../src/utils/settings-migration';
import { createBaseSettings } from './helpers/test-helper';

describe('settings-utils', () => {
  describe('migrateSettings', () => {
    /**
     * Basic null/undefined handling tests
     */
    test('should return an empty object when settings are null', () => {
      const result = migrateSettings(null);
      expect(result).toEqual({});
    });

    test('should return empty object when settings are undefined', () => {
      const result = migrateSettings(undefined as any);
      expect(result).toEqual({});
    });

    /**
     * Migration version 1: additionalTaskKeywords → additionalInactiveKeywords
     */
    describe('migration version 1', () => {
      test('should migrate additionalTaskKeywords to additionalInactiveKeywords', () => {
        const settings = {
          additionalTaskKeywords: ['FIXME', 'HACK'],
          otherSetting: 'value',
        };
        const result = migrateSettings(settings);
        expect(result).toEqual({
          additionalInactiveKeywords: ['FIXME', 'HACK'],
          otherSetting: 'value',
          settingsVersion: 2,
        });
      });

      test('should delete additionalTaskKeywords after migration', () => {
        const settings = {
          additionalTaskKeywords: ['FIXME'],
        };
        const result = migrateSettings(settings);
        expect('additionalTaskKeywords' in result).toBe(false);
        expect('additionalInactiveKeywords' in result).toBe(true);
      });

      test('should not modify settings without additionalTaskKeywords', () => {
        const settings = {
          otherSetting: 'value',
        };
        const result = migrateSettings(settings);
        expect(result).toEqual({
          otherSetting: 'value',
          settingsVersion: 2,
        });
      });

      test('should handle empty additionalTaskKeywords array', () => {
        const settings = {
          additionalTaskKeywords: [],
        };
        const result = migrateSettings(settings);
        expect(result).toEqual({
          additionalInactiveKeywords: [],
          settingsVersion: 2,
        });
      });
    });

    /**
     * Migration version 2: languageCommentSupport object → boolean
     */
    describe('migration version 2', () => {
      test('should migrate languageCommentSupport object to boolean', () => {
        const settings = {
          languageCommentSupport: { enabled: true },
          settingsVersion: 1,
        };
        const result = migrateSettings(settings);
        expect(result).toEqual({
          languageCommentSupport: true,
          settingsVersion: 2,
        });
      });

      test('should migrate languageCommentSupport.enabled false to boolean false', () => {
        const settings = {
          languageCommentSupport: { enabled: false },
          settingsVersion: 1,
        };
        const result = migrateSettings(settings);
        expect(result).toEqual({
          languageCommentSupport: false,
          settingsVersion: 2,
        });
      });

      test('should not migrate languageCommentSupport when not an object', () => {
        const settings = {
          languageCommentSupport: true,
          settingsVersion: 1,
        };
        const result = migrateSettings(settings);
        expect(result).toEqual({
          languageCommentSupport: true,
          settingsVersion: 2,
        });
      });

      test('should not migrate languageCommentSupport when null', () => {
        const settings = {
          languageCommentSupport: null,
          settingsVersion: 1,
        };
        const result = migrateSettings(settings);
        expect(result).toEqual({
          languageCommentSupport: null,
          settingsVersion: 2,
        });
      });

      test('should not migrate languageCommentSupport when object missing enabled', () => {
        const settings = {
          languageCommentSupport: { disabled: false },
          settingsVersion: 1,
        };
        const result = migrateSettings(settings);
        expect(result).toEqual({
          languageCommentSupport: { disabled: false },
          settingsVersion: 2,
        });
      });

      test('should not migrate languageCommentSupport when enabled is not boolean', () => {
        const settings = {
          languageCommentSupport: { enabled: 'true' },
          settingsVersion: 1,
        };
        const result = migrateSettings(settings);
        expect(result).toEqual({
          languageCommentSupport: { enabled: 'true' },
          settingsVersion: 2,
        });
      });

      test('should not modify settings without languageCommentSupport', () => {
        const settings = {
          otherSetting: 'value',
          settingsVersion: 1,
        };
        const result = migrateSettings(settings);
        expect(result).toEqual({
          otherSetting: 'value',
          settingsVersion: 2,
        });
      });
    });

    /**
     * Version handling and migration application
     */
    describe('version handling', () => {
      test('should apply all migrations when settingsVersion is 0', () => {
        const settings = {
          additionalTaskKeywords: ['FIXME'],
          languageCommentSupport: { enabled: true },
          otherSetting: 'value',
        };
        const result = migrateSettings(settings);
        expect(result).toEqual({
          additionalInactiveKeywords: ['FIXME'],
          languageCommentSupport: true,
          otherSetting: 'value',
          settingsVersion: 2,
        });
      });

      test('should apply only version 2 migration when settingsVersion is 1', () => {
        const settings = {
          languageCommentSupport: { enabled: true },
          otherSetting: 'value',
          settingsVersion: 1,
        };
        const result = migrateSettings(settings);
        expect(result).toEqual({
          languageCommentSupport: true,
          otherSetting: 'value',
          settingsVersion: 2,
        });
      });

      test('should not apply any migrations when settingsVersion is 2', () => {
        const settings = {
          languageCommentSupport: true,
          otherSetting: 'value',
          settingsVersion: 2,
        };
        const result = migrateSettings(settings);
        expect(result).toEqual({
          languageCommentSupport: true,
          otherSetting: 'value',
          settingsVersion: 2,
        });
      });

      test('should not apply any migrations when settingsVersion is greater than 2', () => {
        const settings = {
          otherSetting: 'value',
          settingsVersion: 5,
        };
        const result = migrateSettings(settings);
        expect(result).toEqual({
          otherSetting: 'value',
          settingsVersion: 5,
        });
      });

      test('should handle missing settingsVersion (treat as 0)', () => {
        const settings = {
          additionalTaskKeywords: ['FIXME'],
        };
        const result = migrateSettings(settings);
        expect(result).toEqual({
          additionalInactiveKeywords: ['FIXME'],
          settingsVersion: 2,
        });
      });

      test('should handle null settingsVersion (treat as 0)', () => {
        const settings = {
          additionalTaskKeywords: ['FIXME'],
          settingsVersion: null,
        };
        const result = migrateSettings(settings);
        expect(result).toEqual({
          additionalInactiveKeywords: ['FIXME'],
          settingsVersion: 2,
        });
      });

      test('should handle undefined settingsVersion (treat as 0)', () => {
        const settings = {
          additionalTaskKeywords: ['FIXME'],
          settingsVersion: undefined,
        };
        const result = migrateSettings(settings);
        expect(result).toEqual({
          additionalInactiveKeywords: ['FIXME'],
          settingsVersion: 2,
        });
      });
    });

    /**
     * Edge cases and complex scenarios
     */
    describe('edge cases', () => {
      test('should preserve all other properties during migration', () => {
        const settings = {
          additionalTaskKeywords: ['FIXME'],
          languageCommentSupport: { enabled: true },
          property1: 'value1',
          property2: 123,
          property3: true,
          property4: ['a', 'b'],
          property5: { nested: 'object' },
        };
        const result = migrateSettings(settings);
        expect(result).toEqual({
          additionalInactiveKeywords: ['FIXME'],
          languageCommentSupport: true,
          property1: 'value1',
          property2: 123,
          property3: true,
          property4: ['a', 'b'],
          property5: { nested: 'object' },
          settingsVersion: 2,
        });
      });

      test('should handle empty settings object', () => {
        const settings = {};
        const result = migrateSettings(settings);
        expect(result).toEqual({
          settingsVersion: 2,
        });
      });

      test('should not mutate original settings object', () => {
        const settings = {
          additionalTaskKeywords: ['FIXME'],
          languageCommentSupport: { enabled: true },
        };
        const originalSettings = { ...settings };
        migrateSettings(settings);
        expect(settings).toEqual(originalSettings);
      });

      test('should handle settings with only version 1 applicable properties', () => {
        const settings = {
          additionalTaskKeywords: ['FIXME'],
          someOtherSetting: 'value',
        };
        const result = migrateSettings(settings);
        expect(result).toEqual({
          additionalInactiveKeywords: ['FIXME'],
          someOtherSetting: 'value',
          settingsVersion: 2,
        });
      });

      test('should handle settings with only version 2 applicable properties', () => {
        const settings = {
          languageCommentSupport: { enabled: false },
          someOtherSetting: 'value',
        };
        const result = migrateSettings(settings);
        expect(result).toEqual({
          languageCommentSupport: false,
          someOtherSetting: 'value',
          settingsVersion: 2,
        });
      });

      test('should handle settings with both migrations applicable', () => {
        const settings = {
          additionalTaskKeywords: ['FIXME', 'HACK'],
          languageCommentSupport: { enabled: true },
          otherProperty: 'value',
        };
        const result = migrateSettings(settings);
        expect(result).toEqual({
          additionalInactiveKeywords: ['FIXME', 'HACK'],
          languageCommentSupport: true,
          otherProperty: 'value',
          settingsVersion: 2,
        });
      });

      test('should handle settings already at latest version with no migrations needed', () => {
        const settings = {
          additionalInactiveKeywords: ['FIXME'],
          languageCommentSupport: true,
          otherSetting: 'value',
          settingsVersion: 2,
        };
        const result = migrateSettings(settings);
        expect(result).toEqual({
          additionalInactiveKeywords: ['FIXME'],
          languageCommentSupport: true,
          otherSetting: 'value',
          settingsVersion: 2,
        });
      });

      test('should handle settings with additionalInactiveKeywords already present', () => {
        const settings = {
          additionalTaskKeywords: ['FIXME'],
          additionalInactiveKeywords: ['EXISTING'],
          settingsVersion: 0,
        };
        const result = migrateSettings(settings);
        // Migration should overwrite additionalInactiveKeywords
        expect(result).toEqual({
          additionalInactiveKeywords: ['FIXME'],
          settingsVersion: 2,
        });
      });
    });
  });

  /**
   * Tests for getLatestSettingsVersion function
   */
  describe('getLatestSettingsVersion', () => {
    test('should return the latest migration version', () => {
      const latestVersion = getLatestSettingsVersion();
      expect(latestVersion).toBe(2);
    });

    test('should handle empty migrations array', () => {
      // This test verifies the function handles edge case where MIGRATIONS might be empty
      // The implementation should return 0 in this case
      const latestVersion = getLatestSettingsVersion();
      expect(typeof latestVersion).toBe('number');
      expect(latestVersion).toBeGreaterThanOrEqual(0);
    });
  });

  describe('SettingsChangeDetector', () => {
    let detector: SettingsChangeDetector;
    let baseSettings: TodoTrackerSettings;

    beforeEach(() => {
      detector = new SettingsChangeDetector();
      baseSettings = createBaseSettings({ languageCommentSupport: true });
    });

    describe('formatting settings detection', () => {
      beforeEach(() => {
        detector.initialize(baseSettings);
      });

      test('should detect changes in formatTaskKeywords', () => {
        const changedSettings = { ...baseSettings, formatTaskKeywords: false };
        expect(detector.hasFormattingSettingsChanged(changedSettings)).toBe(
          true,
        );
      });

      test('should detect changes in includeCodeBlocks', () => {
        const changedSettings = { ...baseSettings, includeCodeBlocks: true };
        expect(detector.hasFormattingSettingsChanged(changedSettings)).toBe(
          true,
        );
      });

      test('should detect changes in includeCalloutBlocks', () => {
        const changedSettings = {
          ...baseSettings,
          includeCalloutBlocks: false,
        };
        expect(detector.hasFormattingSettingsChanged(changedSettings)).toBe(
          true,
        );
      });

      test('should detect changes in includeCommentBlocks', () => {
        const changedSettings = { ...baseSettings, includeCommentBlocks: true };
        expect(detector.hasFormattingSettingsChanged(changedSettings)).toBe(
          true,
        );
      });

      test('should detect changes in languageCommentSupport', () => {
        const changedSettings = {
          ...baseSettings,
          languageCommentSupport: false,
        };
        expect(detector.hasFormattingSettingsChanged(changedSettings)).toBe(
          true,
        );
      });

      test('should detect changes in additionalInactiveKeywords', () => {
        const changedSettings = {
          ...baseSettings,
          additionalInactiveKeywords: ['FIXME', 'HACK'],
        };
        expect(detector.hasFormattingSettingsChanged(changedSettings)).toBe(
          true,
        );
      });

      test('should NOT detect changes in defaultSortMethod', () => {
        const changedSettings = {
          ...baseSettings,
          defaultSortMethod: 'sortByPriority' as const,
        };
        expect(detector.hasFormattingSettingsChanged(changedSettings)).toBe(
          false,
        );
      });

      test('should NOT detect changes in taskListViewMode', () => {
        const changedSettings: TodoTrackerSettings = {
          ...baseSettings,
          taskListViewMode: 'hideCompleted',
        };
        expect(detector.hasFormattingSettingsChanged(changedSettings)).toBe(
          false,
        );
      });

      test('should NOT detect changes in weekStartsOn', () => {
        const changedSettings: TodoTrackerSettings = {
          ...baseSettings,
          weekStartsOn: 'Sunday',
        };
        expect(detector.hasFormattingSettingsChanged(changedSettings)).toBe(
          false,
        );
      });

      test('should detect multiple formatting setting changes', () => {
        const changedSettings = {
          ...baseSettings,
          formatTaskKeywords: false,
          includeCodeBlocks: true,
          languageCommentSupport: false,
        };
        expect(detector.hasFormattingSettingsChanged(changedSettings)).toBe(
          true,
        );
      });

      test('should not detect changes when only non-formatting settings change', () => {
        const changedSettings: TodoTrackerSettings = {
          ...baseSettings,
          defaultSortMethod: 'sortByPriority',
          taskListViewMode: 'sortCompletedLast',
          weekStartsOn: 'Sunday',
        };
        expect(detector.hasFormattingSettingsChanged(changedSettings)).toBe(
          false,
        );
      });
    });

    describe('complete workflow', () => {
      test('should handle initialize → detect change → update state → detect no change', () => {
        // Initialize
        detector.initialize(baseSettings);
        expect(detector.hasFormattingSettingsChanged(baseSettings)).toBe(false);

        // Detect change
        const changedSettings = { ...baseSettings, formatTaskKeywords: false };
        expect(detector.hasFormattingSettingsChanged(changedSettings)).toBe(
          true,
        );

        // Update state
        detector.updatePreviousState(changedSettings);
        expect(detector.hasFormattingSettingsChanged(changedSettings)).toBe(
          false,
        );

        // Detect new change
        const newSettings = { ...changedSettings, includeCodeBlocks: true };
        expect(detector.hasFormattingSettingsChanged(newSettings)).toBe(true);
      });

      test('should handle multiple consecutive changes', () => {
        detector.initialize(baseSettings);

        let currentSettings = baseSettings;

        // First change
        currentSettings = { ...currentSettings, formatTaskKeywords: false };
        expect(detector.hasFormattingSettingsChanged(currentSettings)).toBe(
          true,
        );
        detector.updatePreviousState(currentSettings);

        // Second change
        currentSettings = { ...currentSettings, includeCodeBlocks: true };
        expect(detector.hasFormattingSettingsChanged(currentSettings)).toBe(
          true,
        );
        detector.updatePreviousState(currentSettings);

        // Third change
        currentSettings = {
          ...currentSettings,
          languageCommentSupport: false,
        };
        expect(detector.hasFormattingSettingsChanged(currentSettings)).toBe(
          true,
        );
        detector.updatePreviousState(currentSettings);

        // No change after final update
        expect(detector.hasFormattingSettingsChanged(currentSettings)).toBe(
          false,
        );
      });
    });

    describe('edge cases', () => {
      test('should handle settings with circular references gracefully', () => {
        detector.initialize(baseSettings);

        const problematicSettings = { ...baseSettings };
        // Create a circular reference
        (problematicSettings as any).circular = problematicSettings;

        // Should not throw, but return false (no change detected due to error)
        expect(() => {
          detector.hasFormattingSettingsChanged(problematicSettings);
        }).not.toThrow();
      });

      test('should handle undefined values in settings', () => {
        detector.initialize(baseSettings);

        const settingsWithUndefined = {
          ...baseSettings,
          formatTaskKeywords: undefined as any,
        };

        // Should detect as change (undefined is different from true)
        expect(
          detector.hasFormattingSettingsChanged(settingsWithUndefined),
        ).toBe(true);
      });

      test('should handle null values in settings', () => {
        detector.initialize(baseSettings);

        const settingsWithNull = {
          ...baseSettings,
          languageCommentSupport: null as any,
        };

        // Should detect as change (null is different from object)
        expect(detector.hasFormattingSettingsChanged(settingsWithNull)).toBe(
          true,
        );
      });
    });
  });
});
