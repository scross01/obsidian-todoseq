import { App, TFile } from 'obsidian';
import {
  getDailyNoteInfo,
  isDailyNotesPluginEnabledSync,
  isDailyNotesPluginEnabled,
  refreshDailyNotesPluginStatus,
  getTodayDailyNote,
  isTaskOnTodayDailyNote,
} from '../src/utils/daily-note-utils';
import { formatTaskLines } from '../src/utils/task-format';
import {
  getDateFromFile,
  appHasDailyNotesPluginLoaded,
  createDailyNote,
  getAllDailyNotes,
  getDailyNote,
} from 'obsidian-daily-notes-interface';
import { Task, DateRepeatInfo } from '../src/types/task';
import { createBaseTask } from './helpers/test-helper';

jest.mock('obsidian-daily-notes-interface', () => ({
  getDateFromFile: jest.fn(),
  appHasDailyNotesPluginLoaded: jest.fn(),
  createDailyNote: jest.fn(),
  getAllDailyNotes: jest.fn(),
  getDailyNote: jest.fn(),
}));

describe('daily-note-utils', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    refreshDailyNotesPluginStatus();
  });

  describe('getDailyNoteInfo', () => {
    const mockApp: Partial<App> = {};

    test('should return isDailyNote: true with valid date when file is a daily note', () => {
      // Arrange
      const mockDate = new Date(2023, 0, 1);
      const mockMomentDate = {
        toDate: jest.fn().mockReturnValue(mockDate),
      };
      (getDateFromFile as jest.Mock).mockReturnValue(mockMomentDate);

      const mockFile = new TFile('2023-01-01.md', '2023-01-01.md');

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

      const mockFile = new TFile('non-daily-note.md', 'non-daily-note.md');

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

      const mockFile = new TFile('some-file.md', 'some-file.md');

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
        const mockFile = new TFile(filename, filename);
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

      const mockFile = new TFile('2023-01-01.txt', '2023-01-01.txt');

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

      const mockFile = new TFile(
        'notes/2023/01/2023-01-01.md',
        '2023-01-01.md',
      );

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

  describe('isTaskOnTodayDailyNote', () => {
    test('returns true when task path matches today note path', () => {
      const task = createBaseTask({ path: '2023-01-01.md' });
      const todayNote = new TFile('2023-01-01.md', '2023-01-01.md');
      expect(isTaskOnTodayDailyNote(task, todayNote)).toBe(true);
    });

    test('returns false when task path differs from today note path', () => {
      const task = createBaseTask({ path: 'other.md' });
      const todayNote = new TFile('2023-01-01.md', '2023-01-01.md');
      expect(isTaskOnTodayDailyNote(task, todayNote)).toBe(false);
    });

    test('returns false when task is in a subfolder', () => {
      const task = createBaseTask({ path: 'notes/2023-01-01.md' });
      const todayNote = new TFile('2023-01-01.md', '2023-01-01.md');
      expect(isTaskOnTodayDailyNote(task, todayNote)).toBe(false);
    });
  });

  describe('isDailyNotesPluginEnabledSync', () => {
    test('returns true when appHasDailyNotesPluginLoaded returns a value', () => {
      (appHasDailyNotesPluginLoaded as jest.Mock).mockReturnValue({});
      const app = new App();
      expect(isDailyNotesPluginEnabledSync(app)).toBe(true);
    });

    test('returns false when appHasDailyNotesPluginLoaded returns undefined', () => {
      (appHasDailyNotesPluginLoaded as jest.Mock).mockReturnValue(undefined);
      const app = new App();
      expect(isDailyNotesPluginEnabledSync(app)).toBe(false);
    });

    test('returns false when appHasDailyNotesPluginLoaded throws', () => {
      (appHasDailyNotesPluginLoaded as jest.Mock).mockImplementation(() => {
        throw new Error('plugin unavailable');
      });
      const app = new App();
      expect(isDailyNotesPluginEnabledSync(app)).toBe(false);
    });

    test('caches result and does not recheck on subsequent calls', () => {
      (appHasDailyNotesPluginLoaded as jest.Mock).mockReturnValue({});
      const app = new App();

      isDailyNotesPluginEnabledSync(app);
      isDailyNotesPluginEnabledSync(app);

      expect(appHasDailyNotesPluginLoaded).toHaveBeenCalledTimes(1);
    });

    test('rechecks after refreshDailyNotesPluginStatus resets cache', () => {
      (appHasDailyNotesPluginLoaded as jest.Mock).mockReturnValue({});
      const app = new App();

      isDailyNotesPluginEnabledSync(app);
      expect(appHasDailyNotesPluginLoaded).toHaveBeenCalledTimes(1);

      refreshDailyNotesPluginStatus();

      isDailyNotesPluginEnabledSync(app);
      expect(appHasDailyNotesPluginLoaded).toHaveBeenCalledTimes(2);
    });
  });

  describe('isDailyNotesPluginEnabled', () => {
    function createAppWithAdapter(readResult?: string | Error): App {
      const adapter = { read: jest.fn() };
      if (readResult instanceof Error) {
        adapter.read.mockRejectedValue(readResult);
      } else if (readResult !== undefined) {
        adapter.read.mockResolvedValue(readResult);
      }
      return {
        // eslint-disable-next-line obsidianmd/hardcoded-config-path
        vault: { adapter, configDir: '.obsidian' },
      } as unknown as App;
    }

    test('returns true when daily-notes is enabled in core-plugins.json', async () => {
      const app = createAppWithAdapter(JSON.stringify({ 'daily-notes': true }));
      await expect(isDailyNotesPluginEnabled(app)).resolves.toBe(true);
    });

    test('returns false when daily-notes is disabled in core-plugins.json', async () => {
      const app = createAppWithAdapter(
        JSON.stringify({ 'daily-notes': false }),
      );
      await expect(isDailyNotesPluginEnabled(app)).resolves.toBe(false);
    });

    test('returns false when daily-notes key is absent from core-plugins.json', async () => {
      const app = createAppWithAdapter(
        JSON.stringify({ 'other-plugin': true }),
      );
      await expect(isDailyNotesPluginEnabled(app)).resolves.toBe(false);
    });

    test('returns false when adapter.read rejects', async () => {
      const app = createAppWithAdapter(new Error('file not found'));
      await expect(isDailyNotesPluginEnabled(app)).resolves.toBe(false);
    });

    test('returns false when core-plugins.json contains invalid JSON', async () => {
      const app = createAppWithAdapter('not valid json');
      await expect(isDailyNotesPluginEnabled(app)).resolves.toBe(false);
    });

    test('caches result across calls without re-reading file', async () => {
      const app = createAppWithAdapter(JSON.stringify({ 'daily-notes': true }));
      await isDailyNotesPluginEnabled(app);
      await isDailyNotesPluginEnabled(app);
      const adapter = (
        app as unknown as { vault: { adapter: { read: jest.Mock } } }
      ).vault.adapter;
      expect(adapter.read).toHaveBeenCalledTimes(1);
    });

    test('forceRefresh re-reads the file', async () => {
      const app = createAppWithAdapter(JSON.stringify({ 'daily-notes': true }));
      await isDailyNotesPluginEnabled(app);
      await isDailyNotesPluginEnabled(app, true);
      const adapter = (
        app as unknown as { vault: { adapter: { read: jest.Mock } } }
      ).vault.adapter;
      expect(adapter.read).toHaveBeenCalledTimes(2);
    });

    test('falls back to appHasDailyNotesPluginLoaded when vault is unavailable', async () => {
      const app = {} as App;
      (appHasDailyNotesPluginLoaded as jest.Mock).mockReturnValue({});
      await expect(isDailyNotesPluginEnabled(app)).resolves.toBe(true);
      expect(appHasDailyNotesPluginLoaded).toHaveBeenCalled();
    });

    test('returns false when vault unavailable and fallback also fails', async () => {
      const app = {} as App;
      (appHasDailyNotesPluginLoaded as jest.Mock).mockImplementation(() => {
        throw new Error('fallback fail');
      });
      await expect(isDailyNotesPluginEnabled(app)).resolves.toBe(false);
    });
  });

  describe('getTodayDailyNote', () => {
    let originalMoment: unknown;

    function createAppWithPluginEnabled(): App {
      return {
        vault: {
          adapter: {
            read: jest
              .fn()
              .mockResolvedValue(JSON.stringify({ 'daily-notes': true })),
          },
          // eslint-disable-next-line obsidianmd/hardcoded-config-path
          configDir: '.obsidian',
        },
      } as unknown as App;
    }

    beforeEach(() => {
      const win = (globalThis as Record<string, unknown>).window as Record<
        string,
        unknown
      >;
      originalMoment = win.moment;
      win.moment = jest.fn().mockReturnValue('mock-today');
    });

    afterEach(() => {
      const win = (globalThis as Record<string, unknown>).window as Record<
        string,
        unknown
      >;
      win.moment = originalMoment;
    });

    test('returns null when daily notes plugin is not enabled', async () => {
      const app = {
        vault: {
          adapter: {
            read: jest
              .fn()
              .mockResolvedValue(JSON.stringify({ 'daily-notes': false })),
          },
          // eslint-disable-next-line obsidianmd/hardcoded-config-path
          configDir: '.obsidian',
        },
      } as unknown as App;

      await expect(getTodayDailyNote(app)).resolves.toBeNull();
    });

    test('returns existing daily note without creating a new one', async () => {
      const app = createAppWithPluginEnabled();
      const existingNote = new TFile('2023-01-01.md', '2023-01-01.md');

      (getAllDailyNotes as jest.Mock).mockReturnValue({
        '2023-01-01': existingNote,
      });
      (getDailyNote as jest.Mock).mockReturnValue(existingNote);

      const result = await getTodayDailyNote(app);
      expect(result).toBe(existingNote);
      expect(createDailyNote).not.toHaveBeenCalled();
    });

    test('creates new daily note when none exists', async () => {
      const app = createAppWithPluginEnabled();
      const newNote = new TFile('2023-01-01.md', '2023-01-01.md');

      (getAllDailyNotes as jest.Mock).mockReturnValue({});
      (getDailyNote as jest.Mock).mockReturnValue(null);
      (createDailyNote as jest.Mock).mockResolvedValue(newNote);

      const result = await getTodayDailyNote(app);
      expect(result).toBe(newNote);
      expect(createDailyNote).toHaveBeenCalledWith('mock-today');
    });

    test('returns null when createDailyNote fails', async () => {
      const app = createAppWithPluginEnabled();

      (getAllDailyNotes as jest.Mock).mockReturnValue({});
      (getDailyNote as jest.Mock).mockReturnValue(null);
      (createDailyNote as jest.Mock).mockRejectedValue(
        new Error('create failed'),
      );

      await expect(getTodayDailyNote(app)).resolves.toBeNull();
    });

    test('returns null when an unexpected error occurs', async () => {
      const app = createAppWithPluginEnabled();
      (getAllDailyNotes as jest.Mock).mockImplementation(() => {
        throw new Error('unexpected');
      });

      await expect(getTodayDailyNote(app)).resolves.toBeNull();
    });

    test('uses window.moment to get today date', async () => {
      const app = createAppWithPluginEnabled();

      (getAllDailyNotes as jest.Mock).mockReturnValue({});
      (getDailyNote as jest.Mock).mockReturnValue(null);
      (createDailyNote as jest.Mock).mockResolvedValue(
        new TFile('2023-01-01.md', '2023-01-01.md'),
      );

      await getTodayDailyNote(app);

      const win = (globalThis as Record<string, unknown>).window as Record<
        string,
        unknown
      >;
      expect(win.moment).toHaveBeenCalled();
    });
  });
});
