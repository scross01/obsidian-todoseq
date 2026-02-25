import { App } from 'obsidian';
import {
  getPluginSettings,
  SettingsChangeDetector,
  createSettingsChangeDetector,
} from '../src/utils/settings-utils';
import { TodoTrackerSettings } from '../src/settings/settings-types';
import { migrateSettings } from '../src/utils/settings-migration';

describe('settings-utils', () => {
  describe('migrateSettings', () => {
    test('should return an empty object when settings are null', () => {
      const result = migrateSettings(null);
      expect(result).toEqual({});
    });
  });

  describe('getPluginSettings', () => {
    const mockApp: Partial<App> = {};

    beforeEach(() => {
      // Reset mock app before each test
      Object.assign(mockApp, {});
    });

    test('should return null when plugin settings are not found', () => {
      const result = getPluginSettings(mockApp as App);
      expect(result).toBeNull();
    });

    test('should return null when plugin is not found', () => {
      (mockApp as any).plugins = {};
      const result = getPluginSettings(mockApp as App);
      expect(result).toBeNull();
    });

    test('should return null when todoseq plugin is not found', () => {
      (mockApp as any).plugins = {
        plugins: {
          'other-plugin': {},
        },
      };
      const result = getPluginSettings(mockApp as App);
      expect(result).toBeNull();
    });

    test('should return null when plugin exists but has no settings', () => {
      (mockApp as any).plugins = {
        plugins: {
          todoseq: {},
        },
      };

      const result = getPluginSettings(mockApp as App);
      expect(result).toBeNull();
    });

    test('should merge partial settings with defaults', () => {
      (mockApp as any).plugins = {
        plugins: {
          todoseq: {
            settings: {
              formatTaskKeywords: false,
              includeCodeBlocks: true,
            },
          },
        },
      };

      const result = getPluginSettings(mockApp as App);
      expect(result).not.toBeNull();
      expect(result?.formatTaskKeywords).toBe(false);
      expect(result?.includeCodeBlocks).toBe(true);
      // Default values should be applied for missing properties
      expect(result?.weekStartsOn).toBe('Monday');
    });

    test('should return complete settings without modification', () => {
      const completeSettings: TodoTrackerSettings = {
        additionalInactiveKeywords: ['FIXME', 'HACK'],
        additionalInactiveKeywords: ['FIXME', 'HACK'],
        additionalActiveKeywords: ['STARTED'],
        additionalWaitingKeywords: ['PAUSED'],
        additionalCompletedKeywords: ['ABANDONED'],
        additionalArchivedKeywords: [],
        includeCodeBlocks: true,
        includeCalloutBlocks: false,
        includeCommentBlocks: true,
        taskListViewMode: 'hideCompleted',
        futureTaskSorting: 'showAll',
        defaultSortMethod: 'default',
        languageCommentSupport: { enabled: false },
        weekStartsOn: 'Sunday',
        formatTaskKeywords: false,
        additionalFileExtensions: [],
        detectOrgModeFiles: false,
      };

      (mockApp as any).plugins = {
        plugins: {
          todoseq: {
            settings: completeSettings,
          },
        },
      };

      const result = getPluginSettings(mockApp as App);
      expect(result).not.toBeNull();
      expect(result).toEqual(completeSettings);
    });
  });

  describe('SettingsChangeDetector', () => {
    let detector: SettingsChangeDetector;
    let baseSettings: TodoTrackerSettings;

    beforeEach(() => {
      detector = new SettingsChangeDetector();
      baseSettings = {
        additionalInactiveKeywords: [],
        additionalInactiveKeywords: [],
        additionalActiveKeywords: [],
        additionalWaitingKeywords: [],
        additionalCompletedKeywords: [],
        additionalArchivedKeywords: [],
        includeCodeBlocks: false,
        includeCalloutBlocks: true,
        includeCommentBlocks: false,
        taskListViewMode: 'showAll',
        futureTaskSorting: 'showAll',
        defaultSortMethod: 'default',
        languageCommentSupport: { enabled: true },
        weekStartsOn: 'Monday',
        formatTaskKeywords: true,
        additionalFileExtensions: [],
        detectOrgModeFiles: false,
      };
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
          languageCommentSupport: { enabled: false },
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
          languageCommentSupport: { enabled: false },
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
          languageCommentSupport: { enabled: false },
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

  describe('createSettingsChangeDetector', () => {
    test('should create new detector instance', () => {
      const detector = createSettingsChangeDetector();
      expect(detector).toBeInstanceOf(SettingsChangeDetector);
    });

    test('should create independent detector instances', () => {
      const detector1 = createSettingsChangeDetector();
      const detector2 = createSettingsChangeDetector();

      const settings: TodoTrackerSettings = {
        additionalInactiveKeywords: [],
        additionalInactiveKeywords: [],
        additionalActiveKeywords: [],
        additionalWaitingKeywords: [],
        additionalCompletedKeywords: [],
        additionalArchivedKeywords: [],
        includeCodeBlocks: false,
        includeCalloutBlocks: true,
        includeCommentBlocks: false,
        taskListViewMode: 'showAll',
        futureTaskSorting: 'showAll',
        defaultSortMethod: 'default',
        languageCommentSupport: { enabled: true },
        weekStartsOn: 'Monday',
        formatTaskKeywords: true,
        additionalFileExtensions: [],
        detectOrgModeFiles: false,
      };

      detector1.initialize(settings);
      detector2.initialize(settings);

      const changedSettings = { ...settings, formatTaskKeywords: false };

      // Both should detect changes independently
      expect(detector1.hasFormattingSettingsChanged(changedSettings)).toBe(
        true,
      );
      expect(detector2.hasFormattingSettingsChanged(changedSettings)).toBe(
        true,
      );

      // Update one detector
      detector1.updatePreviousState(changedSettings);
      expect(detector1.hasFormattingSettingsChanged(changedSettings)).toBe(
        false,
      );
      // Other detector should still detect change
      expect(detector2.hasFormattingSettingsChanged(changedSettings)).toBe(
        true,
      );
    });
  });
});
