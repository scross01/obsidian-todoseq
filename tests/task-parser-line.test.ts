import { TaskParser } from '../src/parser/task-parser';
import { TodoTrackerSettings } from '../src/settings/settings';
import { ParserConfig } from '../src/parser/types';
import { getDailyNoteInfo } from '../src/utils/daily-note-utils';
import { createBaseSettings } from './helpers/test-helper';

// Mock the daily note utils
jest.mock('../src/utils/daily-note-utils', () => ({
  getDailyNoteInfo: jest.fn(),
}));

describe('TaskParser', () => {
  describe('updateConfig', () => {
    let parser: TaskParser;
    let settings: TodoTrackerSettings;

    beforeEach(() => {
      settings = createBaseSettings({
        additionalTaskKeywords: ['FIXME'],
        languageCommentSupport: {
          enabled: false,
        },
      });
      parser = TaskParser.create(settings, null);
    });

    it('should update allKeywords and regex when keywords change', () => {
      const originalKeywords = parser.allKeywords;
      const newConfig: ParserConfig = {
        keywords: [...originalKeywords, 'CUSTOM'],
        urgencyCoefficients: {},
      };

      parser.updateConfig(newConfig);

      expect(parser.allKeywords).toEqual(
        expect.arrayContaining([...originalKeywords, 'CUSTOM']),
      );
      expect(parser.testRegex.test('CUSTOM test task')).toBe(true);
    });

    it('should update urgency coefficients', () => {
      const newCoefficients = {
        overDue: 10,
        dueToday: 5,
        dueTomorrow: 3,
        dueThisWeek: 2,
        dueThisMonth: 1,
        activeBonus: 2,
        waitingPenalty: 0.5,
      };

      parser.updateConfig({
        keywords: parser.allKeywords,
        urgencyCoefficients: newCoefficients,
      });

      // We can't directly access private property, but we can test via parseFile which uses it
      const result = parser.parseFile('TODO Test task', 'test.md');
      expect(result).not.toBeNull();
    });

    it('should update completed keywords set', () => {
      parser.updateConfig({
        keywords: [...parser.allKeywords, 'COMPLETED'],
        urgencyCoefficients: {},
        completedKeywords: ['DONE', 'COMPLETED'],
      });

      const task1 = parser.parseLineAsTask('DONE Completed task', 0, 'test.md');
      const task2 = parser.parseLineAsTask(
        'COMPLETED Finished task',
        0,
        'test.md',
      );

      expect(task1?.completed).toBe(true);
      expect(task2?.completed).toBe(true);
    });

    it('should update active and waiting keywords sets', () => {
      parser.updateConfig({
        keywords: parser.allKeywords,
        urgencyCoefficients: {},
        activeKeywords: ['DOING', 'ACTIVE'],
        waitingKeywords: ['WAITING', 'PENDING'],
      });

      // Test that these keywords are recognized as tasks
      expect(parser.testRegex.test('DOING Active task')).toBe(true);
      expect(parser.testRegex.test('WAITING Pending task')).toBe(true);
    });

    it('should update task detection settings', () => {
      parser.updateConfig({
        keywords: parser.allKeywords,
        urgencyCoefficients: {},
        includeCalloutBlocks: false,
        includeCodeBlocks: true,
        includeCommentBlocks: true,
      });

      // Verify settings were updated (using type assertion to access private properties)
      const parserRef = parser as unknown as {
        includeCalloutBlocks: boolean;
        includeCodeBlocks: boolean;
        includeCommentBlocks: boolean;
      };

      expect(parserRef.includeCalloutBlocks).toBe(false);
      expect(parserRef.includeCodeBlocks).toBe(true);
      expect(parserRef.includeCommentBlocks).toBe(true);
    });
  });

  describe('daily note info retrieval', () => {
    let parser: TaskParser;
    let settings: TodoTrackerSettings;
    const mockApp: any = {
      vault: {
        getAbstractFileByPath: jest.fn(),
      },
    };

    beforeEach(() => {
      settings = createBaseSettings({
        additionalTaskKeywords: ['FIXME'],
        languageCommentSupport: {
          enabled: false,
        },
      });

      (getDailyNoteInfo as jest.Mock).mockReturnValue({
        isDailyNote: false,
        dailyNoteDate: null,
      });

      parser = TaskParser.create(settings, mockApp);
    });

    it('should retrieve daily note info when parsing footnote tasks', () => {
      const mockFile = {
        path: 'test.md',
        name: 'test.md',
      };
      mockApp.vault.getAbstractFileByPath.mockReturnValue(mockFile);

      const mockDailyNoteInfo = {
        isDailyNote: true,
        dailyNoteDate: new Date('2023-01-01'),
      };
      (getDailyNoteInfo as jest.Mock).mockReturnValue(mockDailyNoteInfo);

      const content = '[^1]: TODO Footnote task';
      const tasks = parser.parseFile(content, 'test.md');

      expect(getDailyNoteInfo).toHaveBeenCalled();
      expect(tasks[0].isDailyNote).toBe(true);
      expect(tasks[0].dailyNoteDate).toEqual(mockDailyNoteInfo.dailyNoteDate);
    });

    it('should retrieve daily note info when parsing comment block tasks', () => {
      // Enable comment blocks in settings
      settings.includeCommentBlocks = true;
      parser = TaskParser.create(settings, mockApp);

      const mockFile = {
        path: 'test.md',
        name: 'test.md',
      };
      mockApp.vault.getAbstractFileByPath.mockReturnValue(mockFile);

      const mockDailyNoteInfo = {
        isDailyNote: true,
        dailyNoteDate: new Date('2023-01-01'),
      };
      (getDailyNoteInfo as jest.Mock).mockReturnValue(mockDailyNoteInfo);

      const content = '%% TODO Comment block task %%';
      const tasks = parser.parseFile(content, 'test.md');

      expect(getDailyNoteInfo).toHaveBeenCalled();
      expect(tasks[0].isDailyNote).toBe(true);
      expect(tasks[0].dailyNoteDate).toEqual(mockDailyNoteInfo.dailyNoteDate);
    });

    it('should handle daily note info retrieval errors', () => {
      const mockError = new Error('Failed to get daily note info');
      (getDailyNoteInfo as jest.Mock).mockImplementation(() => {
        throw mockError;
      });

      const content = '[^1]: TODO Task with error';
      const tasks = parser.parseFile(content, 'test.md');

      expect(getDailyNoteInfo).toHaveBeenCalled();
      expect(tasks[0].isDailyNote).toBe(false);
      expect(tasks[0].dailyNoteDate).toBeNull();
    });

    it('should not call getDailyNoteInfo when app is null', () => {
      (getDailyNoteInfo as jest.Mock).mockReset();
      const parserWithoutApp = TaskParser.create(settings, null);

      const content = 'TODO Task without app';
      parserWithoutApp.parseFile(content, 'test.md');

      expect(getDailyNoteInfo).not.toHaveBeenCalled();
    });
  });

  describe('parseLineAsTask', () => {
    let parser: TaskParser;
    let settings: TodoTrackerSettings;

    beforeEach(() => {
      settings = createBaseSettings({
        additionalTaskKeywords: ['FIXME'],
        languageCommentSupport: {
          enabled: false,
        },
      });
      parser = TaskParser.create(settings, null);
    });

    describe('Basic task parsing', () => {
      test('should parse simple task', () => {
        const line = 'TODO Task text';
        const result = parser.parseLineAsTask(line, 0, 'test.md');

        expect(result).not.toBeNull();
        expect(result?.state).toBe('TODO');
        expect(result?.text).toBe('Task text');
        expect(result?.completed).toBe(false);
      });

      test('should parse task with priority', () => {
        const line = 'TODO [#A] High priority task';
        const result = parser.parseLineAsTask(line, 0, 'test.md');

        expect(result).not.toBeNull();
        expect(result?.priority).toBe('high');
        expect(result?.text).toBe('High priority task');
      });

      test('should parse checkbox task', () => {
        const line = '- [x] DONE Completed task';
        const result = parser.parseLineAsTask(line, 0, 'test.md');

        expect(result).not.toBeNull();
        expect(result?.state).toBe('DONE');
        expect(result?.completed).toBe(true);
      });

      test('should parse task with tags', () => {
        const line = 'DOING Task with #tag and #another';
        const result = parser.parseLineAsTask(line, 0, 'test.md');

        expect(result).not.toBeNull();
        expect(result?.state).toBe('DOING');
        expect(result?.text).toBe('Task with #tag and #another');
      });
    });

    describe('List marker detection', () => {
      test('should parse bullet list task', () => {
        const line = '- TODO Bullet list task';
        const result = parser.parseLineAsTask(line, 0, 'test.md');

        expect(result).not.toBeNull();
        expect(result?.state).toBe('TODO');
        expect(result?.text).toBe('Bullet list task');
      });

      test('should parse numbered list task', () => {
        const line = '1. TODO Numbered list task';
        const result = parser.parseLineAsTask(line, 0, 'test.md');

        expect(result).not.toBeNull();
        expect(result?.state).toBe('TODO');
        expect(result?.text).toBe('Numbered list task');
      });

      test('should parse letter list task', () => {
        const line = 'a) TODO Letter list task';
        const result = parser.parseLineAsTask(line, 0, 'test.md');

        expect(result).not.toBeNull();
        expect(result?.state).toBe('TODO');
        expect(result?.text).toBe('Letter list task');
      });
    });

    describe('Indentation handling', () => {
      test('should preserve indentation', () => {
        const line = '  TODO Indented task';
        const result = parser.parseLineAsTask(line, 0, 'test.md');

        expect(result).not.toBeNull();
        expect(result?.indent).toBe('  ');
        expect(result?.text).toBe('Indented task');
      });
    });

    describe('Non-task lines', () => {
      test('should return null for non-task lines', () => {
        const line = 'This is not a task';
        const result = parser.parseLineAsTask(line, 0, 'test.md');

        expect(result).toBeNull();
      });

      test('should return null for empty lines', () => {
        const line = '';
        const result = parser.parseLineAsTask(line, 0, 'test.md');

        expect(result).toBeNull();
      });
    });
  });

  describe('Custom keywords', () => {
    let parser: TaskParser;
    let settings: TodoTrackerSettings;

    beforeEach(() => {
      settings = createBaseSettings({
        additionalTaskKeywords: ['FIXME'],
        languageCommentSupport: {
          enabled: false,
        },
      });
      parser = TaskParser.create(settings, null);
    });

    test('should parse tasks with custom keywords', () => {
      const line = 'FIXME Custom keyword task';
      const result = parser.parseLineAsTask(line, 0, 'test.md');

      expect(result).not.toBeNull();
      expect(result?.state).toBe('FIXME');
      expect(result?.text).toBe('Custom keyword task');
    });
  });
});
