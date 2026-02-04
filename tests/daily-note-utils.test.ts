import { App, TFile } from 'obsidian';
import { getDailyNoteInfo } from '../src/utils/daily-note-utils';
import { getDateFromFile } from 'obsidian-daily-notes-interface';

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
        'Error checking daily note status:',
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
});
