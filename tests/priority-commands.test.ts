import { TaskManager } from '../src/services/editor-controller';
import { TaskParser } from '../src/parser/task-parser';
import { TodoTrackerSettings } from '../src/settings/settings';
import { Task } from '../src/types/task';

describe('Priority Commands', () => {
  let taskManager: TaskManager;
  let mockPlugin: any;
  let settings: TodoTrackerSettings;

  beforeEach(() => {
    // Create settings manually to avoid importing DefaultSettings
    settings = {
      refreshInterval: 60,
      includeCalloutBlocks: true,
      includeCodeBlocks: false,
      includeCommentBlocks: false,
      languageCommentSupport: {
        enabled: false,
      },
      additionalTaskKeywords: [],
      taskListViewMode: 'showAll',
      weekStartsOn: 'Monday',
      formatTaskKeywords: true,
    };

    // Mock plugin with necessary properties
    mockPlugin = {
      getVaultScanner: () => ({
        getParser: () => {
          const parser = TaskParser.create(settings);
          return parser;
        },
      }),
      taskEditor: {
        updateTaskPriority: jest.fn(
          (task: Task, priority: 'high' | 'med' | 'low') => {
            // Simple mock that returns a task with updated priority
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
    };

    taskManager = new TaskManager(mockPlugin);
  });

  describe('handleSetPriorityAtCursor', () => {
    it('should set high priority on task line via cursor handler', () => {
      const mockEditor = {
        getLine: (lineNumber: number) => 'TODO Test task without priority',
        getCursor: () => ({ line: 0 }),
      };

      const mockView = {
        file: { path: 'test.md' },
      };

      const result = taskManager.handleSetPriorityAtCursor(
        false, // not checking
        mockEditor as any,
        mockView as any,
        'high',
      );

      expect(result).toBe(true);
      expect(mockPlugin.taskEditor.updateTaskPriority).toHaveBeenCalled();
    });

    it('should set medium priority on task line via cursor handler', () => {
      const mockEditor = {
        getLine: (lineNumber: number) => 'TODO Test task without priority',
        getCursor: () => ({ line: 0 }),
      };

      const mockView = {
        file: { path: 'test.md' },
      };

      const result = taskManager.handleSetPriorityAtCursor(
        false, // not checking
        mockEditor as any,
        mockView as any,
        'med',
      );

      expect(result).toBe(true);
      expect(mockPlugin.taskEditor.updateTaskPriority).toHaveBeenCalled();
    });

    it('should set low priority on task line via cursor handler', () => {
      const mockEditor = {
        getLine: (lineNumber: number) => 'TODO Test task without priority',
        getCursor: () => ({ line: 0 }),
      };

      const mockView = {
        file: { path: 'test.md' },
      };

      const result = taskManager.handleSetPriorityAtCursor(
        false, // not checking
        mockEditor as any,
        mockView as any,
        'low',
      );

      expect(result).toBe(true);
      expect(mockPlugin.taskEditor.updateTaskPriority).toHaveBeenCalled();
    });
  });

  describe('handleSetPriorityAtLine', () => {
    it('should set high priority on task line', () => {
      const mockEditor = {
        getLine: (lineNumber: number) => {
          return 'TODO Test task without priority';
        },
      };

      const mockView = {
        file: { path: 'test.md' },
      };

      const result = taskManager.handleSetPriorityAtLine(
        false, // not checking
        0, // line number
        mockEditor as any,
        mockView as any,
        'high',
      );

      expect(result).toBe(true);
      expect(mockPlugin.taskEditor.updateTaskPriority).toHaveBeenCalled();
    });

    it('should set medium priority on task line', () => {
      const mockEditor = {
        getLine: (lineNumber: number) => {
          return 'TODO Test task without priority';
        },
      };

      const mockView = {
        file: { path: 'test.md' },
      };

      const result = taskManager.handleSetPriorityAtLine(
        false, // not checking
        0, // line number
        mockEditor as any,
        mockView as any,
        'med',
      );

      expect(result).toBe(true);
      expect(mockPlugin.taskEditor.updateTaskPriority).toHaveBeenCalled();
    });

    it('should set low priority on task line', () => {
      const mockEditor = {
        getLine: (lineNumber: number) => {
          return 'TODO Test task without priority';
        },
      };

      const mockView = {
        file: { path: 'test.md' },
      };

      const result = taskManager.handleSetPriorityAtLine(
        false, // not checking
        0, // line number
        mockEditor as any,
        mockView as any,
        'low',
      );

      expect(result).toBe(true);
      expect(mockPlugin.taskEditor.updateTaskPriority).toHaveBeenCalled();
    });

    it('should return false for non-task lines', () => {
      const mockEditor = {
        getLine: (lineNumber: number) => {
          return 'This is not a task line';
        },
      };

      const mockView = {
        file: { path: 'test.md' },
      };

      const result = taskManager.handleSetPriorityAtLine(
        false, // not checking
        0, // line number
        mockEditor as any,
        mockView as any,
        'high',
      );

      expect(result).toBe(false);
      expect(mockPlugin.taskEditor.updateTaskPriority).not.toHaveBeenCalled();
    });

    it('should return true when checking on valid task line', () => {
      const mockEditor = {
        getLine: (lineNumber: number) => {
          return 'TODO Test task without priority';
        },
      };

      const mockView = {
        file: { path: 'test.md' },
      };

      const result = taskManager.handleSetPriorityAtLine(
        true, // checking only
        0, // line number
        mockEditor as any,
        mockView as any,
        'high',
      );

      expect(result).toBe(true);
      expect(mockPlugin.taskEditor.updateTaskPriority).not.toHaveBeenCalled();
    });
  });
});
