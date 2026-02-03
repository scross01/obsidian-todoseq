import { Task } from '../../src/types/task';
import { TodoTrackerSettings } from '../../src/settings/settings';

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
 * Creates a baseline settings object with common properties
 */
export function createBaseSettings(
  overrides: Partial<TodoTrackerSettings> = {},
): TodoTrackerSettings {
  return {
    additionalTaskKeywords: [],
    includeCodeBlocks: false,
    includeCalloutBlocks: true,
    includeCommentBlocks: false,
    taskListViewMode: 'showAll',
    futureTaskSorting: 'showAll',
    defaultSortMethod: 'default',
    languageCommentSupport: {
      enabled: true,
    },
    weekStartsOn: 'Monday',
    formatTaskKeywords: true,
    ...overrides,
  };
}
