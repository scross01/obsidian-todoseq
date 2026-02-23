import { EditorController } from '../src/services/editor-controller';
import { TaskParser } from '../src/parser/task-parser';
import { TodoTrackerSettings } from '../src/settings/settings-types';
import {
  createBaseSettings,
  createTestKeywordManager,
} from './helpers/test-helper';

describe('Editor Controller - Task State Methods', () => {
  let editorController: EditorController;
  let mockPlugin: any;
  let mockEditor: any;
  let mockView: any;
  let settings: TodoTrackerSettings;

  beforeEach(() => {
    settings = createBaseSettings({
      languageCommentSupport: {
        enabled: false,
      },
      additionalInactiveKeywords: [],
    });

    mockPlugin = {
      getVaultScanner: () => ({
        getParser: () => {
          const parser = TaskParser.create(
            createTestKeywordManager(settings),
            null,
          );
          return parser;
        },
      }),
      taskUpdateCoordinator: {
        updateTaskState: jest.fn(),
      },
      refreshVisibleEditorDecorations: jest.fn(),
      settings,
    };

    editorController = new EditorController(mockPlugin);

    mockEditor = {
      getLine: (lineNumber: number) => {
        const lines = [
          'TODO Test task',
          'DOING Test task',
          'WAIT Test task',
          'DONE Test task',
        ];
        return lines[lineNumber] || '';
      },
      getCursor: () => ({ line: 0, ch: 0 }),
      setCursor: jest.fn(),
      setSelection: jest.fn(),
      replaceRange: jest.fn(),
    };

    mockView = {
      file: { path: 'test.md' },
    };
  });

  describe('parseTaskFromLine', () => {
    it('should parse a valid task from line', () => {
      const task = editorController.parseTaskFromLine(
        'TODO Test task',
        0,
        'test.md',
      );

      expect(task).not.toBeNull();
      if (task) {
        expect(task.state).toBe('TODO');
        expect(task.text).toContain('Test task');
      }
    });

    it('should return null when parser is not available', () => {
      mockPlugin.getVaultScanner = () => null;

      const task = editorController.parseTaskFromLine(
        'TODO Test task',
        0,
        'test.md',
      );

      expect(task).toBeNull();
    });
  });

  describe('handleUpdateTaskStateAtLine', () => {
    it('should return false when vault scanner is not available', async () => {
      mockPlugin.getVaultScanner = () => null;

      const result = await editorController.handleUpdateTaskStateAtLine(
        false,
        0,
        mockEditor as any,
        mockView as any,
      );

      expect(result).toBe(false);
    });

    it('should return false for non-task lines', async () => {
      mockEditor.getLine = () => 'This is not a task line';

      const result = await editorController.handleUpdateTaskStateAtLine(
        false,
        0,
        mockEditor as any,
        mockView as any,
      );

      expect(result).toBe(false);
    });

    it('should return true when checking on valid task line', async () => {
      const result = await editorController.handleUpdateTaskStateAtLine(
        true,
        0,
        mockEditor as any,
        mockView as any,
      );

      expect(result).toBe(true);
      expect(
        mockPlugin.taskUpdateCoordinator.updateTaskState,
      ).not.toHaveBeenCalled();
    });

    it('should cycle task state using NEXT_STATE when no new state provided', async () => {
      await editorController.handleUpdateTaskStateAtLine(
        false,
        0,
        mockEditor as any,
        mockView as any,
      );

      expect(
        mockPlugin.taskUpdateCoordinator.updateTaskState,
      ).toHaveBeenCalled();
    });

    it('should set specific task state when newState is provided', async () => {
      await editorController.handleUpdateTaskStateAtLine(
        false,
        0,
        mockEditor as any,
        mockView as any,
        'DOING',
      );

      expect(
        mockPlugin.taskUpdateCoordinator.updateTaskState,
      ).toHaveBeenCalledWith(expect.anything(), 'DOING', 'editor');
    });

    it('should handle footnote tasks correctly', async () => {
      mockEditor.getLine = () => '[^1]: TODO Test footnote task';

      await editorController.handleUpdateTaskStateAtLine(
        false,
        0,
        mockEditor as any,
        mockView as any,
      );

      expect(
        mockPlugin.taskUpdateCoordinator.updateTaskState,
      ).toHaveBeenCalled();
    });

    it('should call refresh decorations after updating task state', async () => {
      await editorController.handleUpdateTaskStateAtLine(
        false,
        0,
        mockEditor as any,
        mockView as any,
      );

      expect(mockPlugin.refreshVisibleEditorDecorations).toHaveBeenCalled();
    });
  });

  describe('handleUpdateTaskCycleStateAtLine', () => {
    it('should return false when vault scanner is not available', async () => {
      mockPlugin.getVaultScanner = () => null;

      const result = await editorController.handleUpdateTaskCycleStateAtLine(
        false,
        0,
        mockEditor as any,
        mockView as any,
      );

      expect(result).toBe(false);
    });

    it('should always be available when checking', async () => {
      const result = await editorController.handleUpdateTaskCycleStateAtLine(
        true,
        0,
        mockEditor as any,
        mockView as any,
      );

      expect(result).toBe(true);
    });

    it('should use CYCLE_TASK_STATE for existing tasks', async () => {
      await editorController.handleUpdateTaskCycleStateAtLine(
        false,
        0,
        mockEditor as any,
        mockView as any,
      );

      expect(
        mockPlugin.taskUpdateCoordinator.updateTaskState,
      ).toHaveBeenCalled();
    });

    it('should create new task with TODO state for non-task lines', async () => {
      mockEditor.getLine = () => '- This is a normal line';

      await editorController.handleUpdateTaskCycleStateAtLine(
        false,
        0,
        mockEditor as any,
        mockView as any,
      );

      expect(
        mockPlugin.taskUpdateCoordinator.updateTaskState,
      ).toHaveBeenCalled();
    });

    it('should set specific state when newState parameter is provided', async () => {
      await editorController.handleUpdateTaskCycleStateAtLine(
        false,
        0,
        mockEditor as any,
        mockView as any,
        'WAIT',
      );

      expect(
        mockPlugin.taskUpdateCoordinator.updateTaskState,
      ).toHaveBeenCalledWith(expect.anything(), 'WAIT', 'editor');
    });

    it('should handle WAIT keyword by cycling to IN-PROGRESS', async () => {
      mockEditor.getLine = () => 'WAIT Test waiting task';

      await editorController.handleUpdateTaskCycleStateAtLine(
        false,
        0,
        mockEditor as any,
        mockView as any,
      );

      // WAIT -> IN-PROGRESS according to CYCLE_TASK_STATE
      expect(
        mockPlugin.taskUpdateCoordinator.updateTaskState,
      ).toHaveBeenCalledWith(expect.anything(), 'IN-PROGRESS', 'editor');
    });
  });

  describe('cursor handler methods', () => {
    it('handleCycleTaskStateAtCursor should return true', () => {
      const result = editorController.handleCycleTaskStateAtCursor(
        false,
        mockEditor as any,
        mockView as any,
      );

      expect(result).toBe(true);
    });

    it('handleToggleTaskStateAtCursor should return true', () => {
      const result = editorController.handleToggleTaskStateAtCursor(
        false,
        mockEditor as any,
        mockView as any,
      );

      expect(result).toBe(true);
    });

    it('handleAddScheduledDateAtCursor should delegate to handleAddDateAtLine', () => {
      const mockHandleAddDateAtLine = jest.spyOn(
        editorController as any,
        'handleAddDateAtLine',
      );
      mockHandleAddDateAtLine.mockReturnValue(true);

      const result = editorController.handleAddScheduledDateAtCursor(
        false,
        mockEditor as any,
        mockView as any,
      );

      expect(result).toBe(true);
      expect(mockHandleAddDateAtLine).toHaveBeenCalled();
    });

    it('handleAddDeadlineDateAtCursor should delegate to handleAddDateAtLine', () => {
      const mockHandleAddDateAtLine = jest.spyOn(
        editorController as any,
        'handleAddDateAtLine',
      );
      mockHandleAddDateAtLine.mockReturnValue(true);

      const result = editorController.handleAddDeadlineDateAtCursor(
        false,
        mockEditor as any,
        mockView as any,
      );

      expect(result).toBe(true);
      expect(mockHandleAddDateAtLine).toHaveBeenCalled();
    });

    it('priority cursor handlers should delegate to handleSetPriorityAtCursor', () => {
      const mockHandleSetPriorityAtCursor = jest.spyOn(
        editorController as any,
        'handleSetPriorityAtCursor',
      );
      mockHandleSetPriorityAtCursor.mockReturnValue(true);

      const resultHigh = editorController.handleSetPriorityHighAtCursor(
        false,
        mockEditor as any,
        mockView as any,
      );

      const resultMed = editorController.handleSetPriorityMediumAtCursor(
        false,
        mockEditor as any,
        mockView as any,
      );

      const resultLow = editorController.handleSetPriorityLowAtCursor(
        false,
        mockEditor as any,
        mockView as any,
      );

      expect(resultHigh).toBe(true);
      expect(resultMed).toBe(true);
      expect(resultLow).toBe(true);
      expect(mockHandleSetPriorityAtCursor).toHaveBeenCalledTimes(3);
    });
  });

  describe('date handling methods', () => {
    describe('findExistingDateLine', () => {
      it('should find existing date line after task', () => {
        mockEditor = {
          getLine: (lineNumber: number) => {
            const lines = [
              'TODO Test task',
              'SCHEDULED: <2023-12-31>',
              'DEADLINE: <2024-01-15>',
            ];
            return lines[lineNumber] || '';
          },
          lineCount: () => 3,
        };

        const result = editorController['findExistingDateLine'](
          mockEditor as any,
          0,
          'SCHEDULED',
        );

        expect(result).toBe(1);
      });

      it('should return null when date line not found', () => {
        mockEditor = {
          getLine: (lineNumber: number) => {
            const lines = ['TODO Test task', 'Some other content'];
            return lines[lineNumber] || '';
          },
          lineCount: () => 2,
        };

        const result = editorController['findExistingDateLine'](
          mockEditor as any,
          0,
          'SCHEDULED',
        );

        expect(result).toBeNull();
      });

      it('should skip empty lines when searching for date', () => {
        mockEditor = {
          getLine: (lineNumber: number) => {
            const lines = ['TODO Test task', '', '', 'SCHEDULED: <2023-12-31>'];
            return lines[lineNumber] || '';
          },
          lineCount: () => 4,
        };

        const result = editorController['findExistingDateLine'](
          mockEditor as any,
          0,
          'SCHEDULED',
        );

        expect(result).toBe(3);
      });
    });

    describe('moveCursorToDateLine', () => {
      it('should move cursor to date line and select date', () => {
        mockEditor = {
          getLine: (lineNumber: number) => 'SCHEDULED: <2023-12-31>',
          setCursor: jest.fn(),
          setSelection: jest.fn(),
        };

        editorController['moveCursorToDateLine'](mockEditor as any, 1);

        expect(mockEditor.setCursor).toHaveBeenCalled();
        expect(mockEditor.setSelection).toHaveBeenCalled();
      });
    });
  });
});
