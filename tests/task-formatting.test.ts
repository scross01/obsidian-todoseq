import { TodoTrackerSettings } from '../src/settings/settings';
import { createBaseSettings } from './helpers/test-helper';

describe('Task Formatting Settings Change Detection', () => {
  let mockSettings: TodoTrackerSettings;
  let prevSettingsState: string;

  beforeEach(() => {
    // Create mock settings
    mockSettings = createBaseSettings({
      refreshInterval: 60,
      languageCommentSupport: {
        enabled: false,
      },
    });

    // Initialize previous state
    prevSettingsState = JSON.stringify({
      includeCodeBlocks: mockSettings.includeCodeBlocks,
      languageCommentSupport: mockSettings.languageCommentSupport,
      formatTaskKeywords: mockSettings.formatTaskKeywords,
    });
  });

  function hasSettingsChanged(): boolean {
    const currentState = JSON.stringify({
      includeCodeBlocks: mockSettings.includeCodeBlocks,
      languageCommentSupport: mockSettings.languageCommentSupport,
      formatTaskKeywords: mockSettings.formatTaskKeywords,
    });
    return currentState !== prevSettingsState;
  }

  function updatePrevSettingsState(): void {
    prevSettingsState = JSON.stringify({
      includeCodeBlocks: mockSettings.includeCodeBlocks,
      languageCommentSupport: mockSettings.languageCommentSupport,
      formatTaskKeywords: mockSettings.formatTaskKeywords,
    });
  }

  test('should detect settings changes', () => {
    // Should not detect changes initially
    expect(hasSettingsChanged()).toBe(false);

    // Change settings
    mockSettings.includeCodeBlocks = true;
    mockSettings.languageCommentSupport.enabled = true;

    // Should detect changes
    expect(hasSettingsChanged()).toBe(true);

    // Update previous state
    updatePrevSettingsState();

    // Should not detect changes after update
    expect(hasSettingsChanged()).toBe(false);
  });

  test('should handle includeCodeBlocks setting change', () => {
    // Initial state
    expect(mockSettings.includeCodeBlocks).toBe(false);
    expect(hasSettingsChanged()).toBe(false);

    // Change includeCodeBlocks
    mockSettings.includeCodeBlocks = true;
    expect(hasSettingsChanged()).toBe(true);
  });

  test('should handle languageCommentSupport setting change', () => {
    // Initial state
    expect(mockSettings.languageCommentSupport.enabled).toBe(false);
    expect(hasSettingsChanged()).toBe(false);

    // Change languageCommentSupport
    mockSettings.languageCommentSupport.enabled = true;
    expect(hasSettingsChanged()).toBe(true);
  });

  test('should handle formatTaskKeywords setting change', () => {
    // Initial state
    expect(mockSettings.formatTaskKeywords).toBe(true);
    expect(hasSettingsChanged()).toBe(false);

    // Change formatTaskKeywords
    mockSettings.formatTaskKeywords = false;
    expect(hasSettingsChanged()).toBe(true);
  });

  test('should not detect changes when settings are the same', () => {
    // Should not detect changes initially
    expect(hasSettingsChanged()).toBe(false);

    // Update state
    updatePrevSettingsState();

    // Should still not detect changes
    expect(hasSettingsChanged()).toBe(false);
  });

  test('should handle multiple setting changes', () => {
    // Initial state
    expect(hasSettingsChanged()).toBe(false);

    // Change multiple settings
    mockSettings.includeCodeBlocks = true;
    mockSettings.languageCommentSupport.enabled = true;
    mockSettings.formatTaskKeywords = false;

    // Should detect changes
    expect(hasSettingsChanged()).toBe(true);

    // Update state
    updatePrevSettingsState();

    // Should not detect changes after update
    expect(hasSettingsChanged()).toBe(false);

    // Change back to original values
    mockSettings.includeCodeBlocks = false;
    mockSettings.languageCommentSupport.enabled = false;
    mockSettings.formatTaskKeywords = true;

    // Should detect changes again
    expect(hasSettingsChanged()).toBe(true);
  });
});
