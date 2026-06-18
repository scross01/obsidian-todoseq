import { TodoTrackerSettings } from '../settings/settings-types';
import { KeywordManager } from './keyword-manager';

/**
 * Compute a stable string fingerprint of the settings fields that affect task
 * formatting. Returned string is empty when JSON serialization fails (e.g. a
 * circular reference in a keyword array); callers compare against an earlier
 * fingerprint to detect edits.
 */
export function getSettingsFingerprint(settings: TodoTrackerSettings): string {
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
      enableSmartDateRecognition: settings.enableSmartDateRecognition,
      smartDateRemoveKeywords: settings.smartDateRemoveKeywords,
    });
  } catch (error) {
    console.warn('Failed to create settings fingerprint:', error);
    return '';
  }
}

/**
 * Closure-backed change detector for task-formatting settings. Replaces the
 * previous `SettingsChangeDetector` class — no init/reset guards are needed
 * because the previous fingerprint is captured at construction time.
 */
export interface SettingsChangeDetector {
  /** Returns true when `settings` produces a fingerprint different from the last mark. */
  hasChanged(settings: TodoTrackerSettings): boolean;
  /** Records `settings` as the new baseline for subsequent `hasChanged` calls. */
  markCurrent(settings: TodoTrackerSettings): void;
}

/**
 * Create a settings-change detector seeded with `initial` as the baseline.
 * Typical use: build one in a constructor, call `hasChanged(settings)` on each
 * update cycle and `markCurrent(settings)` after applying changes.
 */
export function createSettingsChangeDetector(
  initial: TodoTrackerSettings,
): SettingsChangeDetector {
  let prev = getSettingsFingerprint(initial);
  return {
    hasChanged: (settings) => getSettingsFingerprint(settings) !== prev,
    markCurrent: (settings) => {
      prev = getSettingsFingerprint(settings);
    },
  };
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
