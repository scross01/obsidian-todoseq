import { EditorController } from '../src/services/editor-controller';
import { TaskParser } from '../src/parser/task-parser';
import { TodoTrackerSettings } from '../src/settings/settings-types';
import { Task } from '../src/types/task';
import {
  createBaseSettings,
  createTestKeywordManager,
} from './helpers/test-helper';

describe('Priority Commands', () => {
  let editorController: EditorController;
  let mockPlugin: any;
  let settings: TodoTrackerSettings;

  beforeEach(() => {
    // Use createBaseSettings to ensure all properties are included
    settings = createBaseSettings({
      languageCommentSupport: { enabled: false },
    });

    // Mock plugin with necessary properties
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
      taskEditor: {
        updateTaskPriority: jest.fn(
          (task: Task, priority: 'high' | 'med' | 'low') => {
            return Promise.resolve({
              ...task,
              priority,
              rawText:
                task.rawText.replace(/\s*\[#[ABC]\]/, '') +
                ` [#${priority === 'high' ? 'A' : priority === 'med' ? 'B' : 'C'}]`,
            });
          },
        ),
      },
      taskUpdateCoordinator: {
        updateTaskPriority: jest.fn().mockResolvedValue(undefined),
      },
    };

    editorController = new EditorController(
      mockPlugin,
      createTestKeywordManager(settings),
    );
  });

  describe('handleSetPriorityAtCursor', () => {
    it('should set high priority on task line via cursor handler', async () => {
      const mockEditor = {
        getLine: (lineNumber: number) => 'TODO Test task without priority',
        getCursor: () => ({ line: 0 }),
      };

      const mockView = {
        file: { path: 'test.md' },
      };

      const result = await editorController.handleSetPriorityAtCursor(
        false, // not checking
        mockEditor as any,
        mockView as any,
        'high',
      );

      expect(result).toBe(true);
      expect(
        mockPlugin.taskUpdateCoordinator.updateTaskPriority,
      ).toHaveBeenCalled();
    });

    it('should set medium priority on task line via cursor handler', async () => {
      const mockEditor = {
        getLine: (lineNumber: number) => 'TODO Test task without priority',
        getCursor: () => ({ line: 0 }),
      };

      const mockView = {
        file: { path: 'test.md' },
      };

      const result = await editorController.handleSetPriorityAtCursor(
        false, // not checking
        mockEditor as any,
        mockView as any,
        'med',
      );

      expect(result).toBe(true);
      expect(
        mockPlugin.taskUpdateCoordinator.updateTaskPriority,
      ).toHaveBeenCalled();
    });

    it('should set low priority on task line via cursor handler', async () => {
      const mockEditor = {
        getLine: (lineNumber: number) => 'TODO Test task without priority',
        getCursor: () => ({ line: 0 }),
      };

      const mockView = {
        file: { path: 'test.md' },
      };

      const result = await editorController.handleSetPriorityAtCursor(
        false, // not checking
        mockEditor as any,
        mockView as any,
        'low',
      );

      expect(result).toBe(true);
      expect(
        mockPlugin.taskUpdateCoordinator.updateTaskPriority,
      ).toHaveBeenCalled();
    });
  });

  describe('handleSetPriorityAtLine', () => {
    it('should set high priority on task line', async () => {
      const mockEditor = {
        getLine: (lineNumber: number) => {
          return 'TODO Test task without priority';
        },
        getCursor: () => ({ line: 0, ch: 0 }),
      };

      const mockView = {
        file: { path: 'test.md' },
      };

      const result = await editorController.handleSetPriorityAtLine(
        false, // not checking
        0, // line number
        mockEditor as any,
        mockView as any,
        'high',
      );

      expect(result).toBe(true);
      expect(
        mockPlugin.taskUpdateCoordinator.updateTaskPriority,
      ).toHaveBeenCalled();
    });

    it('should set medium priority on task line', async () => {
      const mockEditor = {
        getLine: (lineNumber: number) => {
          return 'TODO Test task without priority';
        },
        getCursor: () => ({ line: 0, ch: 0 }),
      };

      const mockView = {
        file: { path: 'test.md' },
      };

      const result = await editorController.handleSetPriorityAtLine(
        false, // not checking
        0, // line number
        mockEditor as any,
        mockView as any,
        'med',
      );

      expect(result).toBe(true);
      expect(
        mockPlugin.taskUpdateCoordinator.updateTaskPriority,
      ).toHaveBeenCalled();
    });

    it('should set low priority on task line', async () => {
      const mockEditor = {
        getLine: (lineNumber: number) => {
          return 'TODO Test task without priority';
        },
        getCursor: () => ({ line: 0, ch: 0 }),
      };

      const mockView = {
        file: { path: 'test.md' },
      };

      const result = await editorController.handleSetPriorityAtLine(
        false, // not checking
        0, // line number
        mockEditor as any,
        mockView as any,
        'low',
      );

      expect(result).toBe(true);
      expect(
        mockPlugin.taskUpdateCoordinator.updateTaskPriority,
      ).toHaveBeenCalled();
    });

    it('should return false for non-task lines', async () => {
      const mockEditor = {
        getLine: (lineNumber: number) => {
          return 'This is not a task line';
        },
        getCursor: () => ({ line: 0, ch: 0 }),
      };

      const mockView = {
        file: { path: 'test.md' },
      };

      const result = await editorController.handleSetPriorityAtLine(
        false, // not checking
        0, // line number
        mockEditor as any,
        mockView as any,
        'high',
      );

      expect(result).toBe(false);
      expect(
        mockPlugin.taskUpdateCoordinator.updateTaskPriority,
      ).not.toHaveBeenCalled();
    });

    it('should return true when checking on valid task line', async () => {
      const mockEditor = {
        getLine: (lineNumber: number) => {
          return 'TODO Test task without priority';
        },
        getCursor: () => ({ line: 0, ch: 0 }),
      };

      const mockView = {
        file: { path: 'test.md' },
      };

      const result = await editorController.handleSetPriorityAtLine(
        true, // checking only
        0, // line number
        mockEditor as any,
        mockView as any,
        'high',
      );

      expect(result).toBe(true);
      expect(
        mockPlugin.taskUpdateCoordinator.updateTaskPriority,
      ).not.toHaveBeenCalled();
    });
  });
});
