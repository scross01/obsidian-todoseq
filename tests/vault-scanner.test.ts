import { VaultScanner } from '../src/services/vault-scanner';
import { TaskStateManager } from '../src/services/task-state-manager';
import {
  createBaseSettings,
  createTestKeywordManager,
} from './helpers/test-helper';
import { Task } from '../src/types/task';

describe('VaultScanner.tasksIdentical', () => {
  let vaultScanner: VaultScanner;
  const settings = createBaseSettings();
  const keywordManager = createTestKeywordManager(settings);
  const taskStateManager = new TaskStateManager(keywordManager);

  beforeEach(() => {
    // Create a new VaultScanner instance before each test
    vaultScanner = new VaultScanner(
      {} as any, // mock app
      settings,
      taskStateManager,
    );
  });

  describe('tasksIdentical method', () => {
    test('should return true for identical tasks', () => {
      const date = new Date(2024, 0, 15);

      const tasks1: Task[] = [
        {
          path: 'test.md',
          line: 0,
          rawText: '- TODO test task',
          indent: '',
          listMarker: '- ',
          text: 'test task',
          state: 'TODO',
          completed: false,
          priority: null,
          scheduledDate: date,
          deadlineDate: null,
          urgency: null,
          isDailyNote: false,
          dailyNoteDate: null,
        },
      ];

      const tasks2: Task[] = [
        {
          path: 'test.md',
          line: 0,
          rawText: '- TODO test task',
          indent: '',
          listMarker: '- ',
          text: 'test task',
          state: 'TODO',
          completed: false,
          priority: null,
          scheduledDate: date,
          deadlineDate: null,
          urgency: null,
          isDailyNote: false,
          dailyNoteDate: null,
        },
      ];

      // @ts-ignore - Accessing private method for testing
      const result = vaultScanner.tasksIdentical(tasks1, tasks2);
      expect(result).toBe(true);
    });

    test('should return false when scheduled date changes', () => {
      const tasks1: Task[] = [
        {
          path: 'test.md',
          line: 0,
          rawText: '- TODO test task',
          indent: '',
          listMarker: '- ',
          text: 'test task',
          state: 'TODO',
          completed: false,
          priority: null,
          scheduledDate: new Date(2024, 0, 15),
          deadlineDate: null,
          urgency: null,
          isDailyNote: false,
          dailyNoteDate: null,
        },
      ];

      const tasks2: Task[] = [
        {
          path: 'test.md',
          line: 0,
          rawText: '- TODO test task',
          indent: '',
          listMarker: '- ',
          text: 'test task',
          state: 'TODO',
          completed: false,
          priority: null,
          scheduledDate: new Date(2024, 0, 16),
          deadlineDate: null,
          urgency: null,
          isDailyNote: false,
          dailyNoteDate: null,
        },
      ];

      // @ts-ignore - Accessing private method for testing
      const result = vaultScanner.tasksIdentical(tasks1, tasks2);
      expect(result).toBe(false);
    });

    test('should return false when deadline date changes', () => {
      const tasks1: Task[] = [
        {
          path: 'test.md',
          line: 0,
          rawText: '- TODO test task',
          indent: '',
          listMarker: '- ',
          text: 'test task',
          state: 'TODO',
          completed: false,
          priority: null,
          scheduledDate: null,
          deadlineDate: new Date(2024, 0, 20),
          urgency: null,
          isDailyNote: false,
          dailyNoteDate: null,
        },
      ];

      const tasks2: Task[] = [
        {
          path: 'test.md',
          line: 0,
          rawText: '- TODO test task',
          indent: '',
          listMarker: '- ',
          text: 'test task',
          state: 'TODO',
          completed: false,
          priority: null,
          scheduledDate: null,
          deadlineDate: new Date(2024, 0, 21),
          urgency: null,
          isDailyNote: false,
          dailyNoteDate: null,
        },
      ];

      // @ts-ignore - Accessing private method for testing
      const result = vaultScanner.tasksIdentical(tasks1, tasks2);
      expect(result).toBe(false);
    });

    test('should return false when scheduled date is added', () => {
      const tasks1: Task[] = [
        {
          path: 'test.md',
          line: 0,
          rawText: '- TODO test task',
          indent: '',
          listMarker: '- ',
          text: 'test task',
          state: 'TODO',
          completed: false,
          priority: null,
          scheduledDate: null,
          deadlineDate: null,
          urgency: null,
          isDailyNote: false,
          dailyNoteDate: null,
        },
      ];

      const tasks2: Task[] = [
        {
          path: 'test.md',
          line: 0,
          rawText: '- TODO test task',
          indent: '',
          listMarker: '- ',
          text: 'test task',
          state: 'TODO',
          completed: false,
          priority: null,
          scheduledDate: new Date(2024, 0, 15),
          deadlineDate: null,
          urgency: null,
          isDailyNote: false,
          dailyNoteDate: null,
        },
      ];

      // @ts-ignore - Accessing private method for testing
      const result = vaultScanner.tasksIdentical(tasks1, tasks2);
      expect(result).toBe(false);
    });

    test('should return false when deadline date is added', () => {
      const tasks1: Task[] = [
        {
          path: 'test.md',
          line: 0,
          rawText: '- TODO test task',
          indent: '',
          listMarker: '- ',
          text: 'test task',
          state: 'TODO',
          completed: false,
          priority: null,
          scheduledDate: null,
          deadlineDate: null,
          urgency: null,
          isDailyNote: false,
          dailyNoteDate: null,
        },
      ];

      const tasks2: Task[] = [
        {
          path: 'test.md',
          line: 0,
          rawText: '- TODO test task',
          indent: '',
          listMarker: '- ',
          text: 'test task',
          state: 'TODO',
          completed: false,
          priority: null,
          scheduledDate: null,
          deadlineDate: new Date(2024, 0, 20),
          urgency: null,
          isDailyNote: false,
          dailyNoteDate: null,
        },
      ];

      // @ts-ignore - Accessing private method for testing
      const result = vaultScanner.tasksIdentical(tasks1, tasks2);
      expect(result).toBe(false);
    });

    test('should return false when scheduled date is removed', () => {
      const tasks1: Task[] = [
        {
          path: 'test.md',
          line: 0,
          rawText: '- TODO test task',
          indent: '',
          listMarker: '- ',
          text: 'test task',
          state: 'TODO',
          completed: false,
          priority: null,
          scheduledDate: new Date(2024, 0, 15),
          deadlineDate: null,
          urgency: null,
          isDailyNote: false,
          dailyNoteDate: null,
        },
      ];

      const tasks2: Task[] = [
        {
          path: 'test.md',
          line: 0,
          rawText: '- TODO test task',
          indent: '',
          listMarker: '- ',
          text: 'test task',
          state: 'TODO',
          completed: false,
          priority: null,
          scheduledDate: null,
          deadlineDate: null,
          urgency: null,
          isDailyNote: false,
          dailyNoteDate: null,
        },
      ];

      // @ts-ignore - Accessing private method for testing
      const result = vaultScanner.tasksIdentical(tasks1, tasks2);
      expect(result).toBe(false);
    });

    test('should return false when deadline date is removed', () => {
      const tasks1: Task[] = [
        {
          path: 'test.md',
          line: 0,
          rawText: '- TODO test task',
          indent: '',
          listMarker: '- ',
          text: 'test task',
          state: 'TODO',
          completed: false,
          priority: null,
          scheduledDate: null,
          deadlineDate: new Date(2024, 0, 20),
          urgency: null,
          isDailyNote: false,
          dailyNoteDate: null,
        },
      ];

      const tasks2: Task[] = [
        {
          path: 'test.md',
          line: 0,
          rawText: '- TODO test task',
          indent: '',
          listMarker: '- ',
          text: 'test task',
          state: 'TODO',
          completed: false,
          priority: null,
          scheduledDate: null,
          deadlineDate: null,
          urgency: null,
          isDailyNote: false,
          dailyNoteDate: null,
        },
      ];

      // @ts-ignore - Accessing private method for testing
      const result = vaultScanner.tasksIdentical(tasks1, tasks2);
      expect(result).toBe(false);
    });

    test('should return false when both scheduled and deadline dates change', () => {
      const tasks1: Task[] = [
        {
          path: 'test.md',
          line: 0,
          rawText: '- TODO test task',
          indent: '',
          listMarker: '- ',
          text: 'test task',
          state: 'TODO',
          completed: false,
          priority: null,
          scheduledDate: new Date(2024, 0, 15),
          deadlineDate: new Date(2024, 0, 20),
          urgency: null,
          isDailyNote: false,
          dailyNoteDate: null,
        },
      ];

      const tasks2: Task[] = [
        {
          path: 'test.md',
          line: 0,
          rawText: '- TODO test task',
          indent: '',
          listMarker: '- ',
          text: 'test task',
          state: 'TODO',
          completed: false,
          priority: null,
          scheduledDate: new Date(2024, 0, 16),
          deadlineDate: new Date(2024, 0, 21),
          urgency: null,
          isDailyNote: false,
          dailyNoteDate: null,
        },
      ];

      // @ts-ignore - Accessing private method for testing
      const result = vaultScanner.tasksIdentical(tasks1, tasks2);
      expect(result).toBe(false);
    });

    test('should return false when task has different path', () => {
      const date = new Date(2024, 0, 15);

      const tasks1: Task[] = [
        {
          path: 'test1.md',
          line: 0,
          rawText: '- TODO test task',
          indent: '',
          listMarker: '- ',
          text: 'test task',
          state: 'TODO',
          completed: false,
          priority: null,
          scheduledDate: date,
          deadlineDate: null,
          urgency: null,
          isDailyNote: false,
          dailyNoteDate: null,
        },
      ];

      const tasks2: Task[] = [
        {
          path: 'test2.md',
          line: 0,
          rawText: '- TODO test task',
          indent: '',
          listMarker: '- ',
          text: 'test task',
          state: 'TODO',
          completed: false,
          priority: null,
          scheduledDate: date,
          deadlineDate: null,
          urgency: null,
          isDailyNote: false,
          dailyNoteDate: null,
        },
      ];

      // @ts-ignore - Accessing private method for testing
      const result = vaultScanner.tasksIdentical(tasks1, tasks2);
      expect(result).toBe(false);
    });

    test('should return false when task has different line number', () => {
      const date = new Date(2024, 0, 15);

      const tasks1: Task[] = [
        {
          path: 'test.md',
          line: 0,
          rawText: '- TODO test task',
          indent: '',
          listMarker: '- ',
          text: 'test task',
          state: 'TODO',
          completed: false,
          priority: null,
          scheduledDate: date,
          deadlineDate: null,
          urgency: null,
          isDailyNote: false,
          dailyNoteDate: null,
        },
      ];

      const tasks2: Task[] = [
        {
          path: 'test.md',
          line: 1,
          rawText: '- TODO test task',
          indent: '',
          listMarker: '- ',
          text: 'test task',
          state: 'TODO',
          completed: false,
          priority: null,
          scheduledDate: date,
          deadlineDate: null,
          urgency: null,
          isDailyNote: false,
          dailyNoteDate: null,
        },
      ];

      // @ts-ignore - Accessing private method for testing
      const result = vaultScanner.tasksIdentical(tasks1, tasks2);
      expect(result).toBe(false);
    });

    test('should return false when task has different rawText', () => {
      const date = new Date(2024, 0, 15);

      const tasks1: Task[] = [
        {
          path: 'test.md',
          line: 0,
          rawText: '- TODO test task',
          indent: '',
          listMarker: '- ',
          text: 'test task',
          state: 'TODO',
          completed: false,
          priority: null,
          scheduledDate: date,
          deadlineDate: null,
          urgency: null,
          isDailyNote: false,
          dailyNoteDate: null,
        },
      ];

      const tasks2: Task[] = [
        {
          path: 'test.md',
          line: 0,
          rawText: '- TODO updated task',
          indent: '',
          listMarker: '- ',
          text: 'updated task',
          state: 'TODO',
          completed: false,
          priority: null,
          scheduledDate: date,
          deadlineDate: null,
          urgency: null,
          isDailyNote: false,
          dailyNoteDate: null,
        },
      ];

      // @ts-ignore - Accessing private method for testing
      const result = vaultScanner.tasksIdentical(tasks1, tasks2);
      expect(result).toBe(false);
    });

    test('should return false when arrays have different lengths', () => {
      const date = new Date(2024, 0, 15);

      const tasks1: Task[] = [
        {
          path: 'test.md',
          line: 0,
          rawText: '- TODO test task',
          indent: '',
          listMarker: '- ',
          text: 'test task',
          state: 'TODO',
          completed: false,
          priority: null,
          scheduledDate: date,
          deadlineDate: null,
          urgency: null,
          isDailyNote: false,
          dailyNoteDate: null,
        },
      ];

      const tasks2: Task[] = [
        {
          path: 'test.md',
          line: 0,
          rawText: '- TODO test task',
          indent: '',
          listMarker: '- ',
          text: 'test task',
          state: 'TODO',
          completed: false,
          priority: null,
          scheduledDate: date,
          deadlineDate: null,
          urgency: null,
          isDailyNote: false,
          dailyNoteDate: null,
        },
        {
          path: 'test.md',
          line: 1,
          rawText: '- DOING another task',
          indent: '',
          listMarker: '- ',
          text: 'another task',
          state: 'DOING',
          completed: false,
          priority: null,
          scheduledDate: null,
          deadlineDate: null,
          urgency: null,
          isDailyNote: false,
          dailyNoteDate: null,
        },
      ];

      // @ts-ignore - Accessing private method for testing
      const result = vaultScanner.tasksIdentical(tasks1, tasks2);
      expect(result).toBe(false);
    });
  });
});
