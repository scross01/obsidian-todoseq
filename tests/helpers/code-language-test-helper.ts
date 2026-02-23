import { TodoTrackerSettings } from '../../src/settings/settings-types';
import { createBaseSettings } from './test-helper';

/**
 * Base settings for code language comment parsing tests.
 * These settings enable code block and language comment support,
 * which is required for all code-* test files.
 */
export const baseCodeLanguageSettings: TodoTrackerSettings = createBaseSettings(
  {
    includeCalloutBlocks: true,
    includeCodeBlocks: true,
    includeCommentBlocks: false,
    languageCommentSupport: {
      enabled: true,
    },
  },
);

/**
 * Creates a copy of the base code language settings with optional overrides.
 * Use this when you need to modify specific settings for a test.
 *
 * @param overrides - Partial settings to override the base values
 * @returns A new settings object with overrides applied
 *
 * @example
 * const settings = createCodeLanguageSettings({ includeCodeBlocks: false });
 */
export function createCodeLanguageSettings(
  overrides?: Partial<TodoTrackerSettings>,
): TodoTrackerSettings {
  return {
    ...baseCodeLanguageSettings,
    ...overrides,
  };
}
