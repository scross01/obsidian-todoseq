import { Task } from '../../src/types/task';
import {
  TodoTrackerSettings,
  DefaultSettings,
} from '../../src/settings/settings-types';
import { KeywordManager } from '../../src/utils/keyword-manager';
import { TaskParser } from '../../src/parser/task-parser';

type TaskKeywordGroups = {
  activeKeywords: string[];
  inactiveKeywords: string[];
  waitingKeywords: string[];
  completedKeywords: string[];
  archivedKeywords: string[];
};

/**
 * Creates a baseline task with common properties
 */
export function createBaseTask(overrides: Partial<Task> = {}): Task {
  return {
    path: 'test.md',
    line: 0,
    rawText: 'TODO Task text',
    indent: '',
    listMarker: '',
    text: 'Task text',
    state: 'TODO',
    completed: false,
    priority: null,
    scheduledDate: null,
    deadlineDate: null,
    urgency: null,
    isDailyNote: false,
    dailyNoteDate: null,
    ...overrides,
  };
}

/**
 * Creates a checkbox task with common properties
 */
export function createCheckboxTask(overrides: Partial<Task> = {}): Task {
  return createBaseTask({
    rawText: '- [ ] TODO Task text',
    listMarker: '- ',
    ...overrides,
  });
}

/**
 * Default empty keyword groups for testing
 */
export const defaultTaskKeywordGroups: TaskKeywordGroups = {
  activeKeywords: [],
  inactiveKeywords: [],
  waitingKeywords: [],
  completedKeywords: [],
  archivedKeywords: [],
};

/**
 * Creates a baseline settings object with common properties
 */
export function createBaseSettings(
  overrides: Partial<TodoTrackerSettings> = {},
): TodoTrackerSettings {
  return {
    ...DefaultSettings,
    ...overrides,
  };
}

/**
 * Creates a KeywordManager for testing.
 * This is the preferred way to create KeywordManager in tests.
 * @param settings Settings with custom keywords
 * @throws Error if keywords contain dangerous regex patterns
 */
export function createTestKeywordManager(
  settings: Partial<TodoTrackerSettings> = {},
): KeywordManager {
  // Validate custom keywords before creating KeywordManager
  const allCustomKeywords = [
    ...(settings.additionalActiveKeywords ?? []),
    ...(settings.additionalWaitingKeywords ?? []),
    ...(settings.additionalCompletedKeywords ?? []),
    ...(settings.additionalInactiveKeywords ?? []),
    ...(settings.additionalArchivedKeywords ?? []),
  ];
  if (allCustomKeywords.length > 0) {
    TaskParser.validateKeywords(allCustomKeywords);
  }
  return new KeywordManager(settings);
}
