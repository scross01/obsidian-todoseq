import { Task } from '../../src/types/task';
import {
  TodoTrackerSettings,
  DefaultSettings,
} from '../../src/settings/settings-types';
import { KeywordManager } from '../../src/utils/keyword-manager';
import { TaskParser } from '../../src/parser/task-parser';

/**
 * Creates a date in UTC timezone (timezone-independent)
 * @param year Full year (e.g., 2026)
 * @param month Month (1-12)
 * @param day Day of month (1-31)
 * @param hours Hours (0-23, default 0)
 * @param minutes Minutes (0-59, default 0)
 * @param seconds Seconds (0-59, default 0)
 * @param milliseconds Milliseconds (0-999, default 0)
 * @returns Date object in UTC timezone
 */
export function createUTCDate(
  year: number,
  month: number,
  day: number,
  hours = 0,
  minutes = 0,
  seconds = 0,
  milliseconds = 0,
): Date {
  return new Date(
    Date.UTC(year, month - 1, day, hours, minutes, seconds, milliseconds),
  );
}

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
    closedDate: null,
    urgency: null,
    isDailyNote: false,
    dailyNoteDate: null,
    subtaskCount: 0,
    subtaskCompletedCount: 0,
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
