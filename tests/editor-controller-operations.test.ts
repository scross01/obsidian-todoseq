import { EditorController } from '../src/services/editor-controller';
import { TaskParser } from '../src/parser/task-parser';
import { TodoTrackerSettings } from '../src/settings/settings-types';
import {
  createBaseSettings,
  createTestKeywordManager,
  createBaseTask,
} from './helpers/test-helper';

describe('Editor Controller - Operations (copy, move, migrate, context menu)', () => {
  let editorController: EditorController;
  let mockPlugin: any;
  let mockEditor: any;
  let mockView: any;
  let settings: TodoTrackerSettings;
  let keywordManager: ReturnType<typeof createTestKeywordManager>;

  beforeEach(() => {
    settings = createBaseSettings({
      languageCommentSupport: false,
      additionalInactiveKeywords: [],
      stateTransitions: {
        defaultInactive: 'TODO',
        defaultActive: 'DOING',
        defaultCompleted: 'DONE',
        transitionStatements: [],
      },
    });

    keywordManager = createTestKeywordManager(settings);

    mockPlugin = {
      app: {},
      getVaultScanner: () => ({
        getParser: () => {
          return TaskParser.create(keywordManager, null);
        },
      }),
      taskUpdateCoordinator: {
        updateTask: jest.fn().mockResolvedValue({}),
        updateTaskState: jest.fn().mockResolvedValue({}),
        updateTaskByPath: jest.fn().mockResolvedValue({}),
        updateTaskPriority: jest.fn().mockResolvedValue({}),
      },
      taskEditor: {
        updateTaskState: jest.fn().mockResolvedValue({}),
        updateTaskPriority: jest.fn().mockResolvedValue({}),
      },
      taskStateManager: {
        findTaskByPathAndLine: jest.fn().mockReturnValue(null),
        optimisticUpdate: jest.fn(),
      },
      refreshVisibleEditorDecorations: jest.fn(),
      settings,
    };

    editorController = new EditorController(mockPlugin, keywordManager);

    mockEditor = {
      getLine: (lineNumber: number) => {
        const lines = ['TODO Test task'];
        return lines[lineNumber] || '';
      },
      lineCount: () => 1,
      getCursor: () => ({ line: 0, ch: 0 }),
      getValue: () => 'TODO Test task',
      setCursor: jest.fn(),
      setSelection: jest.fn(),
      replaceRange: jest.fn(),
      posToOffset: () => 0,
    };

    mockView = {
      file: { path: 'test.md' },
      editor: {},
    };
  });

  describe('cleanTaskTextFromSlashCommand', () => {
    it('should return original text when there is no slash command', () => {
      const editor = {
        getCursor: () => ({ line: 0, ch: 20 }),
        getLine: () => 'TODO Test task text',
      };

      const result = editorController['cleanTaskTextFromSlashCommand'](
        'Test task text',
        editor as any,
        0,
      );

      expect(result).toBe('Test task text');
    });

    it('should remove slash command at end of text before cursor', () => {
      const editor = {
        getCursor: () => ({ line: 0, ch: 25 }),
        getLine: () => 'TODO Test task text /high',
      };

      const result = editorController['cleanTaskTextFromSlashCommand'](
        'Test task text /high',
        editor as any,
        0,
      );

      expect(result).toBe('Test task text');
    });

    it('should remove slash command with trailing spaces before cursor', () => {
      const editor = {
        getCursor: () => ({ line: 0, ch: 26 }),
        getLine: () => 'TODO Test task text /high ',
      };

      const result = editorController['cleanTaskTextFromSlashCommand'](
        'Test task text /high ',
        editor as any,
        0,
      );

      expect(result).toBe('Test task text');
    });

    it('should remove slash command even after cursor via fallback regex', () => {
      // The fallback regex in cleanTaskTextFromSlashCommand removes any
      // slash command in the full taskText, regardless of cursor position
      const editor = {
        getCursor: () => ({ line: 0, ch: 5 }),
        getLine: () => 'TODO Hello /high',
      };

      const result = editorController['cleanTaskTextFromSlashCommand'](
        'Hello /high',
        editor as any,
        0,
      );

      expect(result).toBe('Hello');
    });

    it('should handle slash command in middle of text before cursor', () => {
      const editor = {
        getCursor: () => ({ line: 0, ch: 30 }),
        getLine: () => 'TODO Buy groceries /high and milk',
      };

      const result = editorController['cleanTaskTextFromSlashCommand'](
        'Buy groceries /high and milk',
        editor as any,
        0,
      );

      // Should remove /high and keep rest
      expect(result).toContain('Buy groceries');
      expect(result).toContain('and milk');
      expect(result).not.toContain('/high');
    });

    it('should handle text without any slash-like pattern', () => {
      const editor = {
        getCursor: () => ({ line: 0, ch: 5 }),
        getLine: () => 'TODO No slash here',
      };

      const result = editorController['cleanTaskTextFromSlashCommand'](
        'No slash here',
        editor as any,
        0,
      );

      expect(result).toBe('No slash here');
    });
  });

  describe('parseTaskFromLine', () => {
    it('should return null when parser is not available', () => {
      mockPlugin.getVaultScanner = () => ({
        getParser: () => null,
      });

      const result = editorController.parseTaskFromLine(
        'TODO Test task',
        0,
        'test.md',
      );

      expect(result).toBeNull();
    });

    it('should return existing task from taskStateManager when available', () => {
      const existingTask = createBaseTask({
        path: 'test.md',
        line: 0,
        state: 'DOING',
        text: 'Test task with dates',
        scheduledDate: new Date(2026, 0, 15),
        deadlineDate: new Date(2026, 1, 1),
      });
      mockPlugin.taskStateManager.findTaskByPathAndLine.mockReturnValue(
        existingTask,
      );

      const result = editorController.parseTaskFromLine(
        'DOING Test task with dates',
        0,
        'test.md',
      );

      expect(result).not.toBeNull();
      expect(result?.state).toBe('DOING');
      expect(result?.scheduledDate).toEqual(new Date(2026, 0, 15));
      expect(result?.deadlineDate).toEqual(new Date(2026, 1, 1));
      expect(
        mockPlugin.taskStateManager.findTaskByPathAndLine,
      ).toHaveBeenCalledWith('test.md', 0);
    });
  });

  describe('handleCopyTaskAtCursor', () => {
    beforeEach(() => {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        jest.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
      }
    });

    it('should return false when vault scanner is not available', () => {
      mockPlugin.getVaultScanner = () => null;

      const result = editorController.handleCopyTaskAtCursor(
        false,
        mockEditor as any,
        mockView as any,
      );

      expect(result).toBe(false);
    });

    it('should return false for non-task lines', () => {
      mockEditor.getLine = () => 'This is not a task line';

      const result = editorController.handleCopyTaskAtCursor(
        false,
        mockEditor as any,
        mockView as any,
      );

      expect(result).toBe(false);
    });

    it('should return true when checking on valid task line', () => {
      const result = editorController.handleCopyTaskAtCursor(
        true,
        mockEditor as any,
        mockView as any,
      );

      expect(result).toBe(true);
    });

    it('should copy task text to clipboard', () => {
      mockEditor.getValue = () => 'TODO Test task';
      const originalNavigator = (globalThis as any).navigator;

      const mockWriteText = jest.fn().mockResolvedValue(undefined);
      (globalThis as any).navigator = {
        clipboard: { writeText: mockWriteText },
      };

      const result = editorController.handleCopyTaskAtCursor(
        false,
        mockEditor as any,
        mockView as any,
      );

      expect(result).toBe(true);
      expect(mockWriteText).toHaveBeenCalledWith('TODO Test task');

      (globalThis as any).navigator = originalNavigator;
    });

    it('should show notice when clipboard write fails', () => {
      mockEditor.getValue = () => 'TODO Test task';
      const originalNavigator = (globalThis as any).navigator;

      const mockWriteText = jest
        .fn()
        .mockRejectedValue(new Error('clipboard error'));
      (globalThis as any).navigator = {
        clipboard: { writeText: mockWriteText },
      };

      editorController.handleCopyTaskAtCursor(
        false,
        mockEditor as any,
        mockView as any,
      );

      (globalThis as any).navigator = originalNavigator;
    });
  });

  describe('handleCopyTaskToTodayAtCursor', () => {
    it('should return false when daily notes plugin is not enabled', () => {
      const result = editorController.handleCopyTaskToTodayAtCursor(
        false,
        mockEditor as any,
        mockView as any,
      );

      expect(result).toBe(false);
    });

    it('should return false when vault scanner is not available', () => {
      mockPlugin.getVaultScanner = () => null;

      const result = editorController.handleCopyTaskToTodayAtCursor(
        false,
        mockEditor as any,
        mockView as any,
      );

      expect(result).toBe(false);
    });

    it('should return false for non-task lines', () => {
      mockEditor.getLine = () => 'This is not a task line';

      const result = editorController.handleCopyTaskToTodayAtCursor(
        false,
        mockEditor as any,
        mockView as any,
      );

      expect(result).toBe(false);
    });

    it('should return false when checking on valid task line because daily notes are disabled', () => {
      // Daily notes check happens before checking mode, so returns false
      const result = editorController.handleCopyTaskToTodayAtCursor(
        true,
        mockEditor as any,
        mockView as any,
      );

      expect(result).toBe(false);
    });
  });

  describe('handleMoveTaskToTodayAtCursor', () => {
    it('should return false when daily notes plugin is not enabled', () => {
      const result = editorController.handleMoveTaskToTodayAtCursor(
        false,
        mockEditor as any,
        mockView as any,
      );

      expect(result).toBe(false);
    });

    it('should return false when vault scanner is not available', () => {
      mockPlugin.getVaultScanner = () => null;

      const result = editorController.handleMoveTaskToTodayAtCursor(
        false,
        mockEditor as any,
        mockView as any,
      );

      expect(result).toBe(false);
    });

    it('should return false for non-task lines', () => {
      mockEditor.getLine = () => 'This is not a task line';

      const result = editorController.handleMoveTaskToTodayAtCursor(
        false,
        mockEditor as any,
        mockView as any,
      );

      expect(result).toBe(false);
    });

    it('should return false when checking on valid task line because daily notes are disabled', () => {
      const result = editorController.handleMoveTaskToTodayAtCursor(
        true,
        mockEditor as any,
        mockView as any,
      );

      expect(result).toBe(false);
    });
  });

  describe('handleMigrateTaskToTodayAtCursor', () => {
    it('should return false when daily notes plugin is not enabled', () => {
      const result = editorController.handleMigrateTaskToTodayAtCursor(
        false,
        mockEditor as any,
        mockView as any,
      );

      expect(result).toBe(false);
    });

    it('should return false when migrateToTodayState is not configured', () => {
      settings.migrateToTodayState = '';

      const result = editorController.handleMigrateTaskToTodayAtCursor(
        false,
        mockEditor as any,
        mockView as any,
      );

      expect(result).toBe(false);
    });

    it('should return false when vault scanner is not available', () => {
      settings.migrateToTodayState = 'DONE';
      mockPlugin.getVaultScanner = () => null;

      const result = editorController.handleMigrateTaskToTodayAtCursor(
        false,
        mockEditor as any,
        mockView as any,
      );

      expect(result).toBe(false);
    });

    it('should return false for non-task lines', () => {
      settings.migrateToTodayState = 'DONE';
      mockEditor.getLine = () => 'This is not a task line';

      const result = editorController.handleMigrateTaskToTodayAtCursor(
        false,
        mockEditor as any,
        mockView as any,
      );

      expect(result).toBe(false);
    });

    it('should return false when checking on valid task line because daily notes are disabled', () => {
      settings.migrateToTodayState = 'DONE';

      const result = editorController.handleMigrateTaskToTodayAtCursor(
        true,
        mockEditor as any,
        mockView as any,
      );

      expect(result).toBe(false);
    });
  });

  describe('handleOpenContextMenuAtCursor', () => {
    it('should return false when vault scanner is not available', () => {
      mockPlugin.getVaultScanner = () => null;

      const result = editorController.handleOpenContextMenuAtCursor(
        false,
        mockEditor as any,
        mockView as any,
      );

      expect(result).toBe(false);
    });

    it('should return false for non-task lines', () => {
      mockEditor.getLine = () => 'This is not a task line';

      const result = editorController.handleOpenContextMenuAtCursor(
        false,
        mockEditor as any,
        mockView as any,
      );

      expect(result).toBe(false);
    });

    it('should return true when checking on valid task line', () => {
      const result = editorController.handleOpenContextMenuAtCursor(
        true,
        mockEditor as any,
        mockView as any,
      );

      expect(result).toBe(true);
    });

    it('should handle footnote task lines', () => {
      mockEditor.getLine = () => '[^1]: TODO Test footnote task';

      const result = editorController.handleOpenContextMenuAtCursor(
        true,
        mockEditor as any,
        mockView as any,
      );

      expect(result).toBe(true);
    });
  });

  describe('handleOpenDatePickerAtCursor', () => {
    it('should return false when vault scanner is not available (scheduled)', () => {
      mockPlugin.getVaultScanner = () => null;

      const result = editorController.handleOpenScheduledDatePickerAtCursor(
        false,
        mockEditor as any,
        mockView as any,
      );

      expect(result).toBe(false);
    });

    it('should return false when vault scanner is not available (deadline)', () => {
      mockPlugin.getVaultScanner = () => null;

      const result = editorController.handleOpenDeadlineDatePickerAtCursor(
        false,
        mockEditor as any,
        mockView as any,
      );

      expect(result).toBe(false);
    });

    it('should return false for non-task lines', () => {
      mockEditor.getLine = () => 'This is not a task line';

      const result = editorController.handleOpenScheduledDatePickerAtCursor(
        false,
        mockEditor as any,
        mockView as any,
      );

      expect(result).toBe(false);
    });

    it('should return true when checking on valid task line', () => {
      const result = editorController.handleOpenScheduledDatePickerAtCursor(
        true,
        mockEditor as any,
        mockView as any,
      );

      expect(result).toBe(true);
    });
  });

  describe('handleAddDateAtLine', () => {
    it('should return false for non-task lines when not checking', () => {
      mockEditor.getLine = () => 'This is not a task line';

      const result = editorController['handleAddDateAtLine'](
        false,
        0,
        mockEditor as any,
        mockView as any,
        'SCHEDULED',
      );

      expect(result).toBe(false);
    });

    it('should return false for non-task lines when checking', () => {
      mockEditor.getLine = () => 'This is not a task line';

      const result = editorController['handleAddDateAtLine'](
        true,
        0,
        mockEditor as any,
        mockView as any,
        'SCHEDULED',
      );

      expect(result).toBe(false);
    });

    it('should return true when checking on valid task line', () => {
      const result = editorController['handleAddDateAtLine'](
        true,
        0,
        mockEditor as any,
        mockView as any,
        'SCHEDULED',
      );

      expect(result).toBe(true);
    });

    it('should insert date line when no existing date found', () => {
      const result = editorController['handleAddDateAtLine'](
        false,
        0,
        mockEditor as any,
        mockView as any,
        'SCHEDULED',
      );

      expect(result).toBe(true);
      expect(mockEditor.replaceRange).toHaveBeenCalled();
    });

    it('should insert deadline when no scheduled exists (covers default branch)', () => {
      mockEditor.lineCount = () => 1;

      const result = editorController['handleAddDateAtLine'](
        false,
        0,
        mockEditor as any,
        mockView as any,
        'DEADLINE',
      );

      expect(result).toBe(true);
      expect(mockEditor.replaceRange).toHaveBeenCalled();
    });
  });

  describe('handleUpdateTaskStateAtLine fallback', () => {
    it('should use taskEditor fallback when taskUpdateCoordinator is not available', () => {
      mockPlugin.taskUpdateCoordinator = null;

      const result = editorController.handleUpdateTaskStateAtLine(
        false,
        0,
        mockEditor as any,
        mockView as any,
        'DOING',
      );

      expect(result).toBe(true);
      expect(mockPlugin.taskEditor.updateTaskState).toHaveBeenCalled();
    });

    it('should use taskEditor fallback with cycle state when no newState provided', () => {
      mockPlugin.taskUpdateCoordinator = null;

      const result = editorController.handleUpdateTaskStateAtLine(
        false,
        0,
        mockEditor as any,
        mockView as any,
      );

      expect(result).toBe(true);
      expect(mockPlugin.taskEditor.updateTaskState).toHaveBeenCalled();
    });
  });

  describe('handleUpdateTaskCycleStateAtLine fallback', () => {
    it('should still refresh decorations even when taskUpdateCoordinator is not available', () => {
      mockPlugin.taskUpdateCoordinator = null;

      const result = editorController.handleUpdateTaskCycleStateAtLine(
        false,
        0,
        mockEditor as any,
        mockView as any,
      );

      expect(result).toBe(true);
      expect(mockPlugin.refreshVisibleEditorDecorations).toHaveBeenCalled();
    });
  });

  describe('handleSetPriorityAtLine', () => {
    it('should return false when taskEditor is null', async () => {
      mockPlugin.taskEditor = null;

      const result = await editorController.handleSetPriorityAtLine(
        false,
        0,
        mockEditor as any,
        mockView as any,
        'high',
      );

      expect(result).toBe(false);
    });

    it('should return false when vaultScanner is null', async () => {
      mockPlugin.getVaultScanner = () => null;

      const result = await editorController.handleSetPriorityAtLine(
        false,
        0,
        mockEditor as any,
        mockView as any,
        'high',
      );

      expect(result).toBe(false);
    });

    it('should remove slash command from task text before updating priority', async () => {
      mockEditor.getLine = () => 'TODO Buy groceries /high';
      mockEditor.getCursor = () => ({ line: 0, ch: 28 });

      await editorController.handleSetPriorityAtLine(
        false,
        0,
        mockEditor as any,
        mockView as any,
        'high',
      );

      expect(
        mockPlugin.taskUpdateCoordinator.updateTaskPriority,
      ).toHaveBeenCalled();
      const updateCall =
        mockPlugin.taskUpdateCoordinator.updateTaskPriority.mock.calls[0];
      const cleanedTask = updateCall[0];
      expect(cleanedTask.text).not.toContain('/high');
      expect(cleanedTask.text).toContain('Buy groceries');
    });

    it('should use fallback slash command removal when primary regex does not match', async () => {
      // Primary regex checks text before cursor for /\s+\/([a-zA-Z]+)\s*$/
      // If cursor is early, it won't match, but fallback regex checks full taskText
      mockEditor.getLine = () => 'TODO Task with slash /high in middle';
      mockEditor.getCursor = () => ({ line: 0, ch: 10 });

      await editorController.handleSetPriorityAtLine(
        false,
        0,
        mockEditor as any,
        mockView as any,
        'high',
      );

      expect(
        mockPlugin.taskUpdateCoordinator.updateTaskPriority,
      ).toHaveBeenCalled();
      const updateCall =
        mockPlugin.taskUpdateCoordinator.updateTaskPriority.mock.calls[0];
      const cleanedTask = updateCall[0];
      expect(cleanedTask.text).not.toContain('/high');
      expect(cleanedTask.text).toContain('Task with slash');
      expect(cleanedTask.text).toContain('in middle');
    });

    it('should use fallback taskEditor when taskUpdateCoordinator is null', async () => {
      mockPlugin.taskUpdateCoordinator = null;

      const result = await editorController.handleSetPriorityAtLine(
        false,
        0,
        mockEditor as any,
        mockView as any,
        'high',
      );

      expect(result).toBe(true);
      expect(mockPlugin.taskEditor.updateTaskPriority).toHaveBeenCalled();
    });
  });

  describe('fallback error handlers', () => {
    it('should catch errors from taskEditor.updateTaskState in handleUpdateTaskStateAtLine', async () => {
      mockPlugin.taskUpdateCoordinator = null;
      mockPlugin.taskEditor.updateTaskState = jest
        .fn()
        .mockRejectedValue(new Error('test error'));
      const consoleSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      editorController.handleUpdateTaskStateAtLine(
        false,
        0,
        mockEditor as any,
        mockView as any,
        'DOING',
      );

      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should catch errors from updateTaskPriority in handleSetPriorityAtLine fallback', async () => {
      mockPlugin.taskUpdateCoordinator = null;
      mockPlugin.taskEditor.updateTaskPriority = jest
        .fn()
        .mockRejectedValue(new Error('test error'));
      const consoleSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      await editorController.handleSetPriorityAtLine(
        false,
        0,
        mockEditor as any,
        mockView as any,
        'high',
      );

      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('error handlers', () => {
    it('should catch errors from updateTaskByPath in handleUpdateTaskStateAtLine', async () => {
      const consoleSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      mockPlugin.taskUpdateCoordinator.updateTaskByPath = jest
        .fn()
        .mockRejectedValue(new Error('test error'));

      editorController.handleUpdateTaskStateAtLine(
        false,
        0,
        mockEditor as any,
        mockView as any,
        'DOING',
      );

      // Flush microtask queue to let .catch() handler execute
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should catch errors from updateTaskState in handleUpdateTaskCycleStateAtLine', async () => {
      const consoleSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      mockPlugin.taskUpdateCoordinator.updateTaskState = jest
        .fn()
        .mockRejectedValue(new Error('test error'));

      editorController.handleUpdateTaskCycleStateAtLine(
        false,
        0,
        mockEditor as any,
        mockView as any,
      );

      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should catch errors from updateTaskState in handleUpdateTaskCycleStateAtLine for non-task lines', async () => {
      const consoleSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      mockEditor.getLine = () => '- Normal list item';
      mockPlugin.taskUpdateCoordinator.updateTaskState = jest
        .fn()
        .mockRejectedValue(new Error('test error'));

      editorController.handleUpdateTaskCycleStateAtLine(
        false,
        0,
        mockEditor as any,
        mockView as any,
      );

      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('getCurrentDateString', () => {
    it('should return date in YYYY-MM-DD format', () => {
      const now = new Date();
      const expected = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

      const result = editorController['getCurrentDateString']();

      expect(result).toBe(expected);
    });
  });

  describe('handleCycleTaskStateAtCursor', () => {
    it('should return true', () => {
      const result = editorController.handleCycleTaskStateAtCursor(
        false,
        mockEditor as any,
        mockView as any,
      );

      expect(result).toBe(true);
    });

    it('should delegate to handleUpdateTaskCycleStateAtLine', () => {
      const spy = jest.spyOn(
        editorController,
        'handleUpdateTaskCycleStateAtLine' as any,
      );

      editorController.handleCycleTaskStateAtCursor(
        false,
        mockEditor as any,
        mockView as any,
      );

      expect(spy).toHaveBeenCalledWith(false, 0, mockEditor, mockView);
    });
  });

  describe('handleToggleTaskStateAtCursor', () => {
    it('should return true', () => {
      const result = editorController.handleToggleTaskStateAtCursor(
        false,
        mockEditor as any,
        mockView as any,
      );

      expect(result).toBe(true);
    });

    it('should delegate to handleUpdateTaskStateAtLine', () => {
      const spy = jest.spyOn(
        editorController,
        'handleUpdateTaskStateAtLine' as any,
      );

      editorController.handleToggleTaskStateAtCursor(
        false,
        mockEditor as any,
        mockView as any,
      );

      expect(spy).toHaveBeenCalledWith(false, 0, mockEditor, mockView);
    });
  });
});
