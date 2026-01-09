import { App } from 'obsidian';
import { TodoTrackerSettings } from '../settings/settings';

/**
 * Structural typing for accessing Obsidian plugin system
 */
export type AppWithPlugins = {
  plugins?: {
    plugins?: Record<string, unknown>;
  };
};

/**
 * Structural typing for accessing plugin settings (partial, only what we need)
 */
export type HasPluginSettings = {
  settings?: Partial<TodoTrackerSettings>;
};

/**
 * Get the plugin settings from the Obsidian app instance
 * @param app The Obsidian app instance
 * @returns The plugin settings or null if not found
 */
export function getPluginSettings(app: App): TodoTrackerSettings | null {
  const appWithPlugins = app as unknown as AppWithPlugins;
  // Avoid importing TodoTracker type just to read settings; keep structural typing
  const maybePlugin = appWithPlugins.plugins?.plugins?.[
    'todoseq'
  ] as unknown as HasPluginSettings | undefined;
  const settings = maybePlugin?.settings;
  if (!settings) return null;

  // Return a complete settings object with defaults for any missing properties
  return {
    refreshInterval: 60,
    additionalTaskKeywords: [],
    includeCodeBlocks: false,
    includeCalloutBlocks: true,
    includeCommentBlocks: false,
    taskListViewMode: 'showAll',
    languageCommentSupport: { enabled: true },
    weekStartsOn: 'Monday',
    formatTaskKeywords: true,
    ...settings,
  } as TodoTrackerSettings;
}

/**
 * Utility class for managing settings change detection
 * Centralizes the logic for detecting when settings that affect task formatting have changed
 */
export class SettingsChangeDetector {
  private prevSettingsState = '';
  private isInitialized = false;

  /**
   * Initialize the detector with current settings
   * @param settings Current settings to track
   * @throws Error if detector is already initialized
   */
  initialize(settings: TodoTrackerSettings): void {
    if (this.isInitialized) {
      throw new Error(
        'SettingsChangeDetector is already initialized. Create a new instance instead.',
      );
    }

    this.prevSettingsState = this.getSettingsFingerprint(settings);
    this.isInitialized = true;
  }

  /**
   * Check if settings that affect task formatting have changed
   * @param settings Current settings to compare against
   * @returns true if settings have changed, false otherwise
   * @throws Error if detector has not been initialized
   */
  hasFormattingSettingsChanged(settings: TodoTrackerSettings): boolean {
    if (!this.isInitialized) {
      throw new Error(
        'SettingsChangeDetector must be initialized before use. Call initialize() first.',
      );
    }

    const currentState = this.getSettingsFingerprint(settings);
    return currentState !== this.prevSettingsState;
  }

  /**
   * Update the previous settings state to the current state
   * @param settings Current settings to store as previous
   * @throws Error if detector has not been initialized
   */
  updatePreviousState(settings: TodoTrackerSettings): void {
    if (!this.isInitialized) {
      throw new Error(
        'SettingsChangeDetector must be initialized before use. Call initialize() first.',
      );
    }

    this.prevSettingsState = this.getSettingsFingerprint(settings);
  }

  /**
   * Reset the detector to uninitialized state
   */
  reset(): void {
    this.prevSettingsState = '';
    this.isInitialized = false;
  }

  /**
   * Get a fingerprint of the settings that affect task formatting
   * @param settings Settings to create fingerprint from
   * @returns String representation of relevant settings
   */
  private getSettingsFingerprint(settings: TodoTrackerSettings): string {
    try {
      return JSON.stringify({
        formatTaskKeywords: settings.formatTaskKeywords,
        includeCodeBlocks: settings.includeCodeBlocks,
        includeCalloutBlocks: settings.includeCalloutBlocks,
        includeCommentBlocks: settings.includeCommentBlocks,
        languageCommentSupport: settings.languageCommentSupport,
        additionalTaskKeywords: settings.additionalTaskKeywords,
      });
    } catch (error) {
      console.warn('Failed to create settings fingerprint:', error);
      return '';
    }
  }
}

/**
 * Create a new settings change detector instance
 * @returns New SettingsChangeDetector instance
 */
export function createSettingsChangeDetector(): SettingsChangeDetector {
  return new SettingsChangeDetector();
}
