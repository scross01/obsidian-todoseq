import { TodoTrackerSettings } from '../settings/settings-types';
import { KeywordManager } from './keyword-manager';

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
        additionalInactiveKeywords: settings.additionalInactiveKeywords,
        additionalActiveKeywords: settings.additionalActiveKeywords,
        additionalWaitingKeywords: settings.additionalWaitingKeywords,
        additionalCompletedKeywords: settings.additionalCompletedKeywords,
      });
    } catch (error) {
      console.warn('Failed to create settings fingerprint:', error);
      return '';
    }
  }
}

/**
 * Parse a comma-separated string of keywords into an array
 * @param input The comma-separated string
 * @returns Array of normalized, non-empty keywords
 */
export function parseKeywordInput(input: string): string[] {
  return input
    .split(',')
    .map((k) => k.trim().toUpperCase())
    .filter((k) => k.length > 0);
}

/**
 * Format an array of keywords for display in a text input
 * @param keywords The keywords to format
 * @returns Comma-separated string of keywords
 */
export function formatKeywordsForInput(keywords: string[]): string {
  return keywords.join(', ');
}

/**
 * Input type for keyword group validation
 */
type KeywordGroupValidationInput = {
  activeKeywords?: string[];
  inactiveKeywords?: string[];
  waitingKeywords?: string[];
  completedKeywords?: string[];
  archivedKeywords?: string[];
};

/**
 * Detailed validation result for settings UI.
 * @param groups The keyword groups to validate
 * @returns Validation result with errors and warnings
 */
export function validateKeywordGroupsDetailed(
  groups: KeywordGroupValidationInput,
) {
  const keywordManager = new KeywordManager({
    additionalActiveKeywords: groups.activeKeywords ?? [],
    additionalInactiveKeywords: groups.inactiveKeywords ?? [],
    additionalWaitingKeywords: groups.waitingKeywords ?? [],
    additionalCompletedKeywords: groups.completedKeywords ?? [],
    additionalArchivedKeywords: groups.archivedKeywords ?? [],
  });

  return keywordManager.getValidationResult();
}
