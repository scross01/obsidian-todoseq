import { App, TFile } from 'obsidian';
import { getDailyNoteInfo } from '../src/utils/daily-note-utils';
import { formatTaskLines } from '../src/utils/task-format';
import { getDateFromFile } from 'obsidian-daily-notes-interface';
import { Task, DateRepeatInfo } from '../src/types/task';

// Mock the external module
jest.mock('obsidian-daily-notes-interface', () => ({
  getDateFromFile: jest.fn(),
}));

describe('daily-note-utils', () => {
  describe('getDailyNoteInfo', () => {
    const mockApp: Partial<App> = {};

    beforeEach(() => {
      // Reset all mocks before each test
      jest.clearAllMocks();
    });

    test('should return isDailyNote: true with valid date when file is a daily note', () => {
      // Arrange
      const mockDate = new Date(2023, 0, 1);
      const mockMomentDate = {
        toDate: jest.fn().mockReturnValue(mockDate),
      };
      (getDateFromFile as jest.Mock).mockReturnValue(mockMomentDate);

      const mockFile = {
        path: '2023-01-01.md',
        name: '2023-01-01.md',
      } as unknown as TFile;

      // Act
      const result = getDailyNoteInfo(mockApp as App, mockFile);

      // Assert
      expect(getDateFromFile).toHaveBeenCalledWith(mockFile, 'day');
      expect(result.isDailyNote).toBe(true);
      expect(result.dailyNoteDate).toEqual(mockDate);
      expect(mockMomentDate.toDate).toHaveBeenCalled();
    });

    test('should return isDailyNote: false with null date when file is not a daily note', () => {
      // Arrange
      (getDateFromFile as jest.Mock).mockReturnValue(null);

      const mockFile = {
        path: 'non-daily-note.md',
        name: 'non-daily-note.md',
      } as unknown as TFile;

      // Act
      const result = getDailyNoteInfo(mockApp as App, mockFile);

      // Assert
      expect(getDateFromFile).toHaveBeenCalledWith(mockFile, 'day');
      expect(result.isDailyNote).toBe(false);
      expect(result.dailyNoteDate).toBeNull();
    });

    test('should handle errors gracefully and return false', () => {
      // Arrange
      const mockError = new Error('Daily notes plugin not available');
      (getDateFromFile as jest.Mock).mockImplementation(() => {
        throw mockError;
      });

      const mockFile = {
        path: 'some-file.md',
        name: 'some-file.md',
      } as unknown as TFile;

      // Create a specific spy for console.warn for this test
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation();

      // Act
      const result = getDailyNoteInfo(mockApp as App, mockFile);

      // Assert
      expect(getDateFromFile).toHaveBeenCalledWith(mockFile, 'day');
      expect(result.isDailyNote).toBe(false);
      expect(result.dailyNoteDate).toBeNull();
      expect(warnSpy).toHaveBeenCalledWith(
        'Daily note detection failed:',
        mockError,
      );

      // Restore original console.warn
      warnSpy.mockRestore();
    });

    test('should handle various daily note filename formats', () => {
      // Arrange
      const testCases = [
        '2023-01-01.md',
        '2023/01/01.md',
        'January 1, 2023.md',
        '01-01-2023.md',
      ];

      const mockDate = new Date(2023, 0, 1);
      const mockMomentDate = {
        toDate: jest.fn().mockReturnValue(mockDate),
      };
      (getDateFromFile as jest.Mock).mockReturnValue(mockMomentDate);

      testCases.forEach((filename) => {
        // Act
        const mockFile = {
          path: filename,
          name: filename,
        } as unknown as TFile;
        const result = getDailyNoteInfo(mockApp as App, mockFile);

        // Assert
        expect(getDateFromFile).toHaveBeenCalledWith(mockFile, 'day');
        expect(result.isDailyNote).toBe(true);
        expect(result.dailyNoteDate).toEqual(mockDate);
      });
    });

    test('should return false for files with non-markdown extensions', () => {
      // Arrange
      (getDateFromFile as jest.Mock).mockReturnValue(null);

      const mockFile = {
        path: '2023-01-01.txt',
        name: '2023-01-01.txt',
      } as unknown as TFile;

      // Act
      const result = getDailyNoteInfo(mockApp as App, mockFile);

      // Assert
      expect(getDateFromFile).toHaveBeenCalledWith(mockFile, 'day');
      expect(result.isDailyNote).toBe(false);
      expect(result.dailyNoteDate).toBeNull();
    });

    test('should handle files in nested directories', () => {
      // Arrange
      const mockDate = new Date(2023, 0, 1);
      const mockMomentDate = {
        toDate: jest.fn().mockReturnValue(mockDate),
      };
      (getDateFromFile as jest.Mock).mockReturnValue(mockMomentDate);

      const mockFile = {
        path: 'notes/2023/01/2023-01-01.md',
        name: '2023-01-01.md',
      } as unknown as TFile;

      // Act
      const result = getDailyNoteInfo(mockApp as App, mockFile);

      // Assert
      expect(getDateFromFile).toHaveBeenCalledWith(mockFile, 'day');
      expect(result.isDailyNote).toBe(true);
      expect(result.dailyNoteDate).toEqual(mockDate);
    });
  });

  describe('formatTaskLines', () => {
    function makeTask(overrides: Partial<Task> = {}): Task {
      return {
        path: 'test.md',
        line: 0,
        rawText: 'TODO test task',
        indent: '',
        listMarker: '',
        text: 'test task',
        state: 'TODO',
        completed: false,
        priority: null,
        scheduledDate: null,
        scheduledDateRepeat: null,
        deadlineDate: null,
        deadlineDateRepeat: null,
        closedDate: null,
        urgency: null,
        isDailyNote: false,
        dailyNoteDate: null,
        subtaskCount: 0,
        subtaskCompletedCount: 0,
        ...overrides,
      };
    }

    it('formats a simple task with no dates', () => {
      const task = makeTask();
      expect(formatTaskLines(task)).toEqual(['TODO test task']);
    });

    it('formats a task with priority', () => {
      const task = makeTask({ priority: 'high' });
      expect(formatTaskLines(task)).toEqual(['TODO [#A] test task']);
    });

    it('formats a task with scheduled date', () => {
      const task = makeTask({
        scheduledDate: new Date(2026, 3, 2),
      });
      const result = formatTaskLines(task);
      expect(result).toEqual(['TODO test task', 'SCHEDULED: <2026-04-02 Thu>']);
    });

    it('formats a task with deadline date', () => {
      const task = makeTask({
        deadlineDate: new Date(2026, 3, 3),
      });
      const result = formatTaskLines(task);
      expect(result).toEqual(['TODO test task', 'DEADLINE: <2026-04-03 Fri>']);
    });

    it('formats a task with both scheduled and deadline dates', () => {
      const task = makeTask({
        scheduledDate: new Date(2026, 3, 2),
        deadlineDate: new Date(2026, 3, 3),
      });
      const result = formatTaskLines(task);
      expect(result).toEqual([
        'TODO test task',
        'SCHEDULED: <2026-04-02 Thu>',
        'DEADLINE: <2026-04-03 Fri>',
      ]);
    });

    it('includes scheduled date repeat modifier', () => {
      const repeat: DateRepeatInfo = {
        type: '.+',
        unit: 'd',
        value: 1,
        raw: '.+1d',
      };
      const task = makeTask({
        scheduledDate: new Date(2026, 3, 2),
        scheduledDateRepeat: repeat,
      });
      const result = formatTaskLines(task);
      expect(result).toEqual([
        'TODO test task',
        'SCHEDULED: <2026-04-02 Thu .+1d>',
      ]);
    });

    it('includes deadline date repeat modifier', () => {
      const repeat: DateRepeatInfo = {
        type: '++',
        unit: 'w',
        value: 2,
        raw: '++2w',
      };
      const task = makeTask({
        deadlineDate: new Date(2026, 3, 3),
        deadlineDateRepeat: repeat,
      });
      const result = formatTaskLines(task);
      expect(result).toEqual([
        'TODO test task',
        'DEADLINE: <2026-04-03 Fri ++2w>',
      ]);
    });

    it('includes both scheduled and deadline repeat modifiers', () => {
      const schedRepeat: DateRepeatInfo = {
        type: '+',
        unit: 'm',
        value: 1,
        raw: '+1m',
      };
      const dlRepeat: DateRepeatInfo = {
        type: '.+',
        unit: 'd',
        value: 3,
        raw: '.+3d',
      };
      const task = makeTask({
        scheduledDate: new Date(2026, 3, 2),
        scheduledDateRepeat: schedRepeat,
        deadlineDate: new Date(2026, 3, 3),
        deadlineDateRepeat: dlRepeat,
      });
      const result = formatTaskLines(task);
      expect(result).toEqual([
        'TODO test task',
        'SCHEDULED: <2026-04-02 Thu +1m>',
        'DEADLINE: <2026-04-03 Fri .+3d>',
      ]);
    });

    it('formats date without repeat when repeat is null', () => {
      const task = makeTask({
        scheduledDate: new Date(2026, 3, 2),
        scheduledDateRepeat: null,
      });
      const result = formatTaskLines(task);
      expect(result).toEqual(['TODO test task', 'SCHEDULED: <2026-04-02 Thu>']);
    });
  });
});
