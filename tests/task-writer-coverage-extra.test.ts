import { TaskWriter } from '../src/services/task-writer';
import {
  createBaseTask,
  createCheckboxTask,
  createTestKeywordManager,
} from './helpers/test-helper';
import { Task } from '../src/types/task';
import { TFile } from 'obsidian';
import { KeywordManager } from '../src/utils/keyword-manager';

class MockTFile extends TFile {
  constructor() {
    super();
  }

  path = 'test.md';
  stat: any = {};
  basename = 'test';
  extension = 'md';
  name = 'test.md';
}

describe('TaskWriter additional coverage', () => {
  let mockApp: any;
  let mockPlugin: any;
  let taskWriter: TaskWriter;

  beforeEach(() => {
    const mockTFile = new MockTFile();

    mockApp = {
      vault: {
        getAbstractFileByPath: jest.fn().mockReturnValue(mockTFile),
        process: jest.fn().mockResolvedValue(''),
      },
      workspace: {
        getActiveViewOfType: jest.fn(),
      },
    };

    mockPlugin = {
      app: mockApp,
      settings: {
        additionalInactiveKeywords: ['CUSTOM'],
        trackClosedDate: false,
        stateTransitions: {
          defaultInactive: 'TODO',
          defaultActive: 'DOING',
          defaultCompleted: 'DONE',
          transitionStatements: [],
        },
      },
    };

    const keywordManager = createTestKeywordManager({
      additionalInactiveKeywords: ['CUSTOM'],
    });
    taskWriter = new TaskWriter(mockPlugin, keywordManager);
  });

  describe('updateKeywordManager (line 39)', () => {
    it('should update the keyword manager instance', async () => {
      const newKeywordManager = createTestKeywordManager({
        additionalInactiveKeywords: ['CUSTOM'],
        additionalActiveKeywords: ['ACTIVE_TASK'],
      });

      taskWriter.updateKeywordManager(newKeywordManager);

      const task: Task = createBaseTask({
        state: 'ACTIVE_TASK',
      });
      mockApp.workspace.getActiveViewOfType = jest.fn().mockReturnValue(null);

      await taskWriter.applyLineUpdate(task, 'TODO');
      expect(mockApp.vault.process).toHaveBeenCalled();
    });
  });

  describe('generateTaskLine archived checkbox state (line 117)', () => {
    it('should preserve existing checkbox state for archived tasks', () => {
      const task: Task = createCheckboxTask({
        rawText: '- [x] DONE Task text',
        text: 'Task text',
        state: 'DONE',
      });

      const archivedKm = createTestKeywordManager({
        additionalArchivedKeywords: ['ARCHIVED'],
      });

      const result = TaskWriter.generateTaskLine(
        task,
        'ARCHIVED',
        true,
        archivedKm,
      );
      expect(result.newLine).toBe('- [x] ARCHIVED Task text');
    });

    it('should preserve unchecked state for archived tasks from unchecked original', () => {
      const task: Task = createCheckboxTask({
        rawText: '- [ ] DONE Task text',
        text: 'Task text',
        state: 'DONE',
      });

      const archivedKm = createTestKeywordManager({
        additionalArchivedKeywords: ['ARCHIVED'],
      });

      const result = TaskWriter.generateTaskLine(
        task,
        'ARCHIVED',
        true,
        archivedKm,
      );
      expect(result.newLine).toBe('- [ ] ARCHIVED Task text');
    });
  });

  describe('applyLineUpdate with trackClosedDate - vault path (lines 261, 270, 307-311)', () => {
    it('should insert CLOSED date when completing a task with trackClosedDate enabled', async () => {
      mockPlugin.settings.trackClosedDate = true;
      taskWriter.updateKeywordManager(
        createTestKeywordManager({ additionalInactiveKeywords: ['CUSTOM'] }),
      );

      const task: Task = createBaseTask({
        state: 'TODO',
        completed: false,
        closedDate: null,
      });

      mockApp.workspace.getActiveViewOfType = jest.fn().mockReturnValue(null);
      mockApp.vault.process = jest
        .fn()
        .mockImplementation(
          (_file: any, updateFn: (content: string) => string) => {
            return Promise.resolve(updateFn('TODO Task text'));
          },
        );

      const result = await taskWriter.applyLineUpdate(task, 'DONE');

      expect(mockApp.vault.process).toHaveBeenCalled();
      expect(result.closedDate).toBeInstanceOf(Date);
      expect(result.lineDelta).toBe(1);
    });

    it('should remove CLOSED date when uncompleting a task that had closedDate', async () => {
      mockPlugin.settings.trackClosedDate = true;
      taskWriter.updateKeywordManager(
        createTestKeywordManager({ additionalInactiveKeywords: ['CUSTOM'] }),
      );

      const task: Task = createBaseTask({
        state: 'DONE',
        completed: true,
        closedDate: new Date(),
      });

      mockApp.workspace.getActiveViewOfType = jest.fn().mockReturnValue(null);
      mockApp.vault.process = jest
        .fn()
        .mockImplementation(
          (_file: any, updateFn: (content: string) => string) => {
            return Promise.resolve(
              updateFn('DONE Task text\n  CLOSED: [2026-03-15 Sat 10:00]'),
            );
          },
        );

      const result = await taskWriter.applyLineUpdate(task, 'TODO');

      expect(mockApp.vault.process).toHaveBeenCalled();
      expect(result.closedDate).toBeNull();
      expect(result.lineDelta).toBe(-1);
    });

    it('should not insert CLOSED date when already has closedDate', async () => {
      mockPlugin.settings.trackClosedDate = true;
      taskWriter.updateKeywordManager(
        createTestKeywordManager({ additionalInactiveKeywords: ['CUSTOM'] }),
      );

      const task: Task = createBaseTask({
        state: 'DONE',
        completed: true,
        closedDate: new Date(),
      });

      mockApp.workspace.getActiveViewOfType = jest.fn().mockReturnValue(null);
      mockApp.vault.process = jest
        .fn()
        .mockImplementation(
          (_file: any, updateFn: (content: string) => string) => {
            return Promise.resolve(updateFn('DONE Task text'));
          },
        );

      const result = await taskWriter.applyLineUpdate(task, 'DONE');

      expect(result.lineDelta).toBeUndefined();
    });
  });

  describe('applyLineUpdate with trackClosedDate - source mode (lines 292-302)', () => {
    it('should insert CLOSED via editor when completing in source mode', async () => {
      mockPlugin.settings.trackClosedDate = true;
      taskWriter.updateKeywordManager(
        createTestKeywordManager({ additionalInactiveKeywords: ['CUSTOM'] }),
      );

      const task: Task = createBaseTask({
        state: 'TODO',
        completed: false,
        closedDate: null,
      });

      const mockEditor = {
        getLine: jest.fn().mockReturnValue('TODO Task text'),
        lineCount: jest.fn().mockReturnValue(3),
        getCursor: jest.fn().mockReturnValue({ line: 0, ch: 0 }),
        replaceRange: jest.fn(),
        setCursor: jest.fn(),
      };
      const mockMarkdownView = {
        file: { path: 'test.md' },
        editor: mockEditor,
        getViewType: jest.fn().mockReturnValue('markdown'),
        getMode: jest.fn().mockReturnValue('source'),
      };

      mockApp.workspace.getActiveViewOfType = jest
        .fn()
        .mockReturnValue(mockMarkdownView);

      const result = await taskWriter.applyLineUpdate(task, 'DONE');

      expect(mockEditor.replaceRange).toHaveBeenCalled();
      expect(result.closedDate).toBeInstanceOf(Date);
      expect(result.lineDelta).toBe(1);
    });

    it('should remove CLOSED via editor when uncompleting in source mode', async () => {
      mockPlugin.settings.trackClosedDate = true;
      taskWriter.updateKeywordManager(
        createTestKeywordManager({ additionalInactiveKeywords: ['CUSTOM'] }),
      );

      const task: Task = createBaseTask({
        state: 'DONE',
        completed: true,
        closedDate: new Date(),
      });

      const mockEditor = {
        getLine: jest.fn().mockImplementation((lineNum: number) => {
          if (lineNum === 0) return 'DONE Task text';
          if (lineNum === 1) return '  CLOSED: [2026-03-15 Sat 10:00]';
          return '';
        }),
        lineCount: jest.fn().mockReturnValue(2),
        getCursor: jest.fn().mockReturnValue({ line: 0, ch: 0 }),
        replaceRange: jest.fn(),
        setCursor: jest.fn(),
      };
      const mockMarkdownView = {
        file: { path: 'test.md' },
        editor: mockEditor,
        getViewType: jest.fn().mockReturnValue('markdown'),
        getMode: jest.fn().mockReturnValue('source'),
      };

      mockApp.workspace.getActiveViewOfType = jest
        .fn()
        .mockReturnValue(mockMarkdownView);

      const result = await taskWriter.applyLineUpdate(task, 'TODO');

      expect(mockEditor.replaceRange).toHaveBeenCalled();
      expect(result.closedDate).toBeNull();
    });
  });

  describe('updateTaskPriority file not found (line 401)', () => {
    it('should return task with new priority when file is not TFile', async () => {
      mockApp.vault.getAbstractFileByPath = jest.fn().mockReturnValue(null);

      const task: Task = createBaseTask({
        state: 'TODO',
        text: 'Task text',
      });

      const result = await taskWriter.updateTaskPriority(task, 'high');

      expect(result.priority).toBe('high');
      expect(result.rawText).toContain('[#A]');
      expect(mockApp.vault.process).not.toHaveBeenCalled();
    });
  });

  describe('updateTaskDeadlineDate (lines 608-655)', () => {
    it('should add DEADLINE date line when none exists', async () => {
      const task: Task = createBaseTask({
        state: 'TODO',
        deadlineDate: null,
      });

      mockApp.workspace.getActiveViewOfType = jest.fn().mockReturnValue(null);
      mockApp.vault.process = jest
        .fn()
        .mockImplementation(
          (_file: any, updateFn: (content: string) => string) => {
            return Promise.resolve(updateFn('TODO Task text'));
          },
        );

      const newDate = new Date(2026, 5, 15, 14, 30);
      const result = await taskWriter.updateTaskDeadlineDate(task, newDate);

      expect(mockApp.vault.process).toHaveBeenCalled();
      expect(result.deadlineDate).toEqual(newDate);
    });

    it('should add DEADLINE with repeat info', async () => {
      const task: Task = createBaseTask({
        state: 'TODO',
        deadlineDate: null,
      });

      mockApp.workspace.getActiveViewOfType = jest.fn().mockReturnValue(null);
      mockApp.vault.process = jest
        .fn()
        .mockImplementation(
          (_file: any, updateFn: (content: string) => string) => {
            return Promise.resolve(updateFn('TODO Task text'));
          },
        );

      const newDate = new Date(2026, 5, 15);
      const repeat = { raw: '+1w', type: 'weekly' as const, interval: 1 };
      const result = await taskWriter.updateTaskDeadlineDate(
        task,
        newDate,
        repeat,
      );

      expect(mockApp.vault.process).toHaveBeenCalled();
      expect(result.deadlineDate).toEqual(newDate);
      expect(result.deadlineDateRepeat).toEqual(repeat);
    });

    it('should add DEADLINE with warning period', async () => {
      const task: Task = createBaseTask({
        state: 'TODO',
        deadlineDate: null,
      });

      mockApp.workspace.getActiveViewOfType = jest.fn().mockReturnValue(null);
      mockApp.vault.process = jest
        .fn()
        .mockImplementation(
          (_file: any, updateFn: (content: string) => string) => {
            return Promise.resolve(updateFn('TODO Task text'));
          },
        );

      const newDate = new Date(2026, 5, 15);
      const result = await taskWriter.updateTaskDeadlineDate(
        task,
        newDate,
        null,
        { value: 3, unit: 'd', isFirstOnly: false },
      );

      expect(mockApp.vault.process).toHaveBeenCalled();
      expect(result.deadlineWarningPeriod).toEqual({
        value: 3,
        unit: 'd',
        isFirstOnly: false,
      });
    });

    it('should add DEADLINE with first-only warning period', async () => {
      const task: Task = createBaseTask({
        state: 'TODO',
        deadlineDate: null,
      });

      mockApp.workspace.getActiveViewOfType = jest.fn().mockReturnValue(null);
      mockApp.vault.process = jest
        .fn()
        .mockImplementation(
          (_file: any, updateFn: (content: string) => string) => {
            return Promise.resolve(updateFn('TODO Task text'));
          },
        );

      const newDate = new Date(2026, 5, 15);
      const result = await taskWriter.updateTaskDeadlineDate(
        task,
        newDate,
        null,
        { value: 1, unit: 'd', isFirstOnly: true },
      );

      expect(mockApp.vault.process).toHaveBeenCalled();
      expect(result.deadlineWarningPeriod).toEqual({
        value: 1,
        unit: 'd',
        isFirstOnly: true,
      });
    });

    it('should include time in DEADLINE when non-midnight', async () => {
      const task: Task = createBaseTask({
        state: 'TODO',
        deadlineDate: null,
      });

      mockApp.workspace.getActiveViewOfType = jest.fn().mockReturnValue(null);
      let capturedContent = '';
      mockApp.vault.process = jest
        .fn()
        .mockImplementation(
          (_file: any, updateFn: (content: string) => string) => {
            capturedContent = updateFn('TODO Task text');
            return Promise.resolve(capturedContent);
          },
        );

      const newDate = new Date(2026, 5, 15, 14, 30);
      await taskWriter.updateTaskDeadlineDate(task, newDate);

      expect(capturedContent).toContain('14:30');
    });

    it('should not include time in DEADLINE when midnight', async () => {
      const task: Task = createBaseTask({
        state: 'TODO',
        deadlineDate: null,
      });

      mockApp.workspace.getActiveViewOfType = jest.fn().mockReturnValue(null);
      let capturedContent = '';
      mockApp.vault.process = jest
        .fn()
        .mockImplementation(
          (_file: any, updateFn: (content: string) => string) => {
            capturedContent = updateFn('TODO Task text');
            return Promise.resolve(capturedContent);
          },
        );

      const newDate = new Date(2026, 5, 15, 0, 0);
      await taskWriter.updateTaskDeadlineDate(task, newDate);

      expect(capturedContent).toContain('DEADLINE:');
      expect(capturedContent).not.toContain(' 00:00');
    });

    it('should update existing DEADLINE line', async () => {
      const task: Task = createBaseTask({
        state: 'TODO',
        deadlineDate: new Date(2026, 5, 10),
      });

      mockApp.workspace.getActiveViewOfType = jest.fn().mockReturnValue(null);
      mockApp.vault.process = jest
        .fn()
        .mockImplementation(
          (_file: any, updateFn: (content: string) => string) => {
            return Promise.resolve(
              updateFn('TODO Task text\n  DEADLINE: <2026-06-10 Wed>'),
            );
          },
        );

      const newDate = new Date(2026, 5, 20);
      const result = await taskWriter.updateTaskDeadlineDate(task, newDate);

      expect(mockApp.vault.process).toHaveBeenCalled();
      expect(result.deadlineDate).toEqual(newDate);
      const processCall = mockApp.vault.process.mock.calls[0];
      const updateFn = processCall[1];
      const content = 'TODO Task text\n  DEADLINE: <2026-06-10 Wed>';
      const resultContent = updateFn(content);
      const deadlineCount = (resultContent.match(/DEADLINE:/g) || []).length;
      expect(deadlineCount).toBe(1);
    });

    it('should handle DEADLINE with existing DEADLINE and SCHEDULED lines', async () => {
      const task: Task = createBaseTask({
        state: 'TODO',
        deadlineDate: new Date(2026, 5, 10),
      });

      mockApp.workspace.getActiveViewOfType = jest.fn().mockReturnValue(null);
      mockApp.vault.process = jest
        .fn()
        .mockImplementation(
          (_file: any, updateFn: (content: string) => string) => {
            return Promise.resolve(
              updateFn(
                'TODO Task text\n  SCHEDULED: <2026-06-05 Fri>\n  DEADLINE: <2026-06-10 Wed>',
              ),
            );
          },
        );

      const newDate = new Date(2026, 5, 25);
      await taskWriter.updateTaskDeadlineDate(task, newDate);

      expect(mockApp.vault.process).toHaveBeenCalled();
    });

    it('should return lineDelta when non-zero', async () => {
      const task: Task = createBaseTask({
        state: 'TODO',
        deadlineDate: null,
      });

      mockApp.workspace.getActiveViewOfType = jest.fn().mockReturnValue(null);
      mockApp.vault.process = jest
        .fn()
        .mockImplementation(
          (_file: any, updateFn: (content: string) => string) => {
            return Promise.resolve(updateFn('TODO Task text'));
          },
        );

      const newDate = new Date(2026, 5, 15);
      const result = await taskWriter.updateTaskDeadlineDate(task, newDate);

      expect(result.lineDelta).toBeDefined();
    });

    it('should handle DEADLINE when file is not found', async () => {
      mockApp.vault.getAbstractFileByPath = jest.fn().mockReturnValue(null);

      const task: Task = createBaseTask({
        state: 'TODO',
        deadlineDate: null,
      });

      const newDate = new Date(2026, 5, 15);
      const result = await taskWriter.updateTaskDeadlineDate(task, newDate);

      expect(result.deadlineDate).toEqual(newDate);
      expect(result.lineDelta).toBeUndefined();
    });
  });

  describe('removeTaskDeadlineDate (lines 666-695)', () => {
    it('should remove DEADLINE date line when present', async () => {
      const task: Task = createBaseTask({
        state: 'TODO',
        deadlineDate: new Date(2026, 5, 10),
      });

      mockApp.workspace.getActiveViewOfType = jest.fn().mockReturnValue(null);
      mockApp.vault.process = jest
        .fn()
        .mockImplementation(
          (_file: any, updateFn: (content: string) => string) => {
            return Promise.resolve(
              updateFn('TODO Task text\n  DEADLINE: <2026-06-10 Wed>'),
            );
          },
        );

      const result = await taskWriter.removeTaskDeadlineDate(task);

      expect(result.deadlineDate).toBeNull();
      expect(mockApp.vault.process).toHaveBeenCalled();
      const processCall = mockApp.vault.process.mock.calls[0];
      const updateFn = processCall[1];
      const content = 'TODO Task text\n  DEADLINE: <2026-06-10 Wed>';
      const resultContent = updateFn(content);
      expect(resultContent).toBe('TODO Task text');
    });

    it('should handle case where no DEADLINE line exists', async () => {
      mockApp.vault.process = jest
        .fn()
        .mockImplementation(
          (_file: any, updateFn: (content: string) => string) => {
            return Promise.resolve(updateFn('TODO Task text'));
          },
        );

      const task: Task = createBaseTask({
        state: 'TODO',
        deadlineDate: null,
      });

      const result = await taskWriter.removeTaskDeadlineDate(task);

      expect(result.deadlineDate).toBeNull();
      expect(result.lineDelta).toBeUndefined();
    });

    it('should remove DEADLINE with existing SCHEDULED line', async () => {
      const task: Task = createBaseTask({
        state: 'TODO',
        deadlineDate: new Date(2026, 5, 10),
      });

      mockApp.workspace.getActiveViewOfType = jest.fn().mockReturnValue(null);
      mockApp.vault.process = jest
        .fn()
        .mockImplementation(
          (_file: any, updateFn: (content: string) => string) => {
            return Promise.resolve(
              updateFn(
                'TODO Task text\n  SCHEDULED: <2026-06-05 Fri>\n  DEADLINE: <2026-06-10 Wed>',
              ),
            );
          },
        );

      const result = await taskWriter.removeTaskDeadlineDate(task);

      expect(result.deadlineDate).toBeNull();
      expect(result.lineDelta).toBe(-1);
      const processCall = mockApp.vault.process.mock.calls[0];
      const updateFn = processCall[1];
      const content =
        'TODO Task text\n  SCHEDULED: <2026-06-05 Fri>\n  DEADLINE: <2026-06-10 Wed>';
      const resultContent = updateFn(content);
      expect(resultContent).not.toContain('DEADLINE');
      expect(resultContent).toContain('SCHEDULED');
    });

    it('should return lineDelta when DEADLINE removed', async () => {
      const task: Task = createBaseTask({
        state: 'TODO',
        deadlineDate: new Date(2026, 5, 10),
      });

      mockApp.workspace.getActiveViewOfType = jest.fn().mockReturnValue(null);
      mockApp.vault.process = jest
        .fn()
        .mockImplementation(
          (_file: any, updateFn: (content: string) => string) => {
            return Promise.resolve(
              updateFn('TODO Task text\n  DEADLINE: <2026-06-10 Wed>'),
            );
          },
        );

      const result = await taskWriter.removeTaskDeadlineDate(task);

      expect(result.lineDelta).toBe(-1);
    });

    it('should handle DEADLINE when file is not found', async () => {
      mockApp.vault.getAbstractFileByPath = jest.fn().mockReturnValue(null);

      const task: Task = createBaseTask({
        state: 'TODO',
        deadlineDate: new Date(2026, 5, 10),
      });

      const result = await taskWriter.removeTaskDeadlineDate(task);

      expect(result.deadlineDate).toBeNull();
      expect(result.lineDelta).toBeUndefined();
    });
  });

  describe('updateTaskClosedDate editor path (lines 754-798)', () => {
    it('should insert CLOSED via editor when no existing CLOSED line', async () => {
      const task: Task = createBaseTask({
        state: 'DONE',
        completed: true,
        closedDate: null,
      });

      const mockEditor = {
        getLine: jest.fn().mockReturnValue('DONE Task text'),
        lineCount: jest.fn().mockReturnValue(1),
        replaceRange: jest.fn(),
      };
      const mockMarkdownView = {
        file: { path: 'test.md' },
        editor: mockEditor,
        getViewType: jest.fn().mockReturnValue('markdown'),
        getMode: jest.fn().mockReturnValue('source'),
      };

      mockApp.workspace.getActiveViewOfType = jest
        .fn()
        .mockReturnValue(mockMarkdownView);

      const result = await taskWriter.updateTaskClosedDate(
        task,
        new Date(2026, 2, 15),
      );

      expect(mockEditor.replaceRange).toHaveBeenCalled();
      expect(result.task.closedDate).toBeInstanceOf(Date);
      expect(result.lineDelta).toBe(1);
    });

    it('should update existing CLOSED via editor', async () => {
      const task: Task = createBaseTask({
        state: 'DONE',
        completed: true,
        closedDate: new Date(),
      });

      const mockEditor = {
        getLine: jest.fn().mockImplementation((lineNum: number) => {
          if (lineNum === 0) return 'DONE Task text';
          if (lineNum === 1) return '  CLOSED: [2026-03-14 Sat 10:00]';
          return '';
        }),
        lineCount: jest.fn().mockReturnValue(2),
        replaceRange: jest.fn(),
      };
      const mockMarkdownView = {
        file: { path: 'test.md' },
        editor: mockEditor,
        getViewType: jest.fn().mockReturnValue('markdown'),
        getMode: jest.fn().mockReturnValue('source'),
      };

      mockApp.workspace.getActiveViewOfType = jest
        .fn()
        .mockReturnValue(mockMarkdownView);

      const result = await taskWriter.updateTaskClosedDate(
        task,
        new Date(2026, 2, 15),
      );

      expect(mockEditor.replaceRange).toHaveBeenCalled();
      expect(result.task.closedDate).toBeInstanceOf(Date);
      expect(result.lineDelta).toBe(0);
    });
  });

  describe('removeTaskClosedDate editor path (lines 852-881)', () => {
    it('should remove CLOSED via editor when CLOSED line exists', async () => {
      const task: Task = createBaseTask({
        state: 'DONE',
        completed: true,
        closedDate: new Date(),
      });

      const mockEditor = {
        getLine: jest.fn().mockImplementation((lineNum: number) => {
          if (lineNum === 0) return 'DONE Task text';
          if (lineNum === 1) return '  CLOSED: [2026-03-15 Sat 10:00]';
          return '';
        }),
        lineCount: jest.fn().mockReturnValue(2),
        replaceRange: jest.fn(),
      };
      const mockMarkdownView = {
        file: { path: 'test.md' },
        editor: mockEditor,
        getViewType: jest.fn().mockReturnValue('markdown'),
        getMode: jest.fn().mockReturnValue('source'),
      };

      mockApp.workspace.getActiveViewOfType = jest
        .fn()
        .mockReturnValue(mockMarkdownView);

      const result = await taskWriter.removeTaskClosedDate(task);

      expect(mockEditor.replaceRange).toHaveBeenCalled();
      expect(result.task.closedDate).toBeNull();
      expect(result.lineDelta).toBe(-1);
    });

    it('should handle no CLOSED line found in editor', async () => {
      const task: Task = createBaseTask({
        state: 'DONE',
        completed: true,
        closedDate: new Date(),
      });

      const mockEditor = {
        getLine: jest.fn().mockReturnValue('DONE Task text'),
        lineCount: jest.fn().mockReturnValue(1),
        replaceRange: jest.fn(),
      };
      const mockMarkdownView = {
        file: { path: 'test.md' },
        editor: mockEditor,
        getViewType: jest.fn().mockReturnValue('markdown'),
        getMode: jest.fn().mockReturnValue('source'),
      };

      mockApp.workspace.getActiveViewOfType = jest
        .fn()
        .mockReturnValue(mockMarkdownView);

      const result = await taskWriter.removeTaskClosedDate(task);

      expect(result.task.closedDate).toBeNull();
      expect(result.lineDelta).toBe(0);
    });
  });

  describe('applyLineUpdate lineDelta conditional (line 325)', () => {
    it('should include lineDelta in result when non-zero', async () => {
      mockPlugin.settings.trackClosedDate = true;
      taskWriter.updateKeywordManager(
        createTestKeywordManager({ additionalInactiveKeywords: ['CUSTOM'] }),
      );

      const task: Task = createBaseTask({
        state: 'TODO',
        completed: false,
        closedDate: null,
      });

      mockApp.workspace.getActiveViewOfType = jest.fn().mockReturnValue(null);
      mockApp.vault.process = jest
        .fn()
        .mockImplementation(
          (_file: any, updateFn: (content: string) => string) => {
            return Promise.resolve(updateFn('TODO Task text'));
          },
        );

      const result = await taskWriter.applyLineUpdate(task, 'DONE');

      expect(result.lineDelta).toBe(1);
    });

    it('should not include lineDelta when zero', async () => {
      const task: Task = createBaseTask({
        state: 'TODO',
        completed: false,
      });

      mockApp.workspace.getActiveViewOfType = jest.fn().mockReturnValue(null);
      mockApp.vault.process = jest
        .fn()
        .mockImplementation(
          (_file: any, updateFn: (content: string) => string) => {
            return Promise.resolve(updateFn('TODO Task text'));
          },
        );

      const result = await taskWriter.applyLineUpdate(task, 'DONE');

      expect(result.lineDelta).toBeUndefined();
    });
  });

  describe('writeLineToFile vault path (lines 722-726)', () => {
    it('should use vault process for removeTaskPriority on inactive file', async () => {
      const task: Task = createBaseTask({
        rawText: 'TODO [#A] Task text',
        text: 'Task text',
        priority: 'high',
      });
      mockApp.workspace.getActiveViewOfType = jest.fn().mockReturnValue(null);
      mockApp.vault.process = jest
        .fn()
        .mockImplementation(
          (_file: any, updateFn: (content: string) => string) => {
            return Promise.resolve(updateFn('TODO [#A] Task text'));
          },
        );

      await taskWriter.removeTaskPriority(task);

      expect(mockApp.vault.process).toHaveBeenCalled();
    });
  });

  describe('generateTaskLine with * and + list markers', () => {
    it('should preserve * list marker for checkbox task', () => {
      const task: Task = createCheckboxTask({
        rawText: '* [ ] TODO Task text',
        listMarker: '* ',
        text: 'Task text',
      });

      const result = TaskWriter.generateTaskLine(
        task,
        'DONE',
        true,
        createTestKeywordManager(),
      );
      expect(result.newLine).toBe('* [x] DONE Task text');
    });

    it('should preserve + list marker for checkbox task', () => {
      const task: Task = createCheckboxTask({
        rawText: '+ [ ] TODO Task text',
        listMarker: '+ ',
        text: 'Task text',
      });

      const result = TaskWriter.generateTaskLine(
        task,
        'DONE',
        true,
        createTestKeywordManager(),
      );
      expect(result.newLine).toBe('+ [x] DONE Task text');
    });
  });

  describe('updateTaskPriority with embed and footnote references', () => {
    it('should preserve footnoteMarker when updating priority', async () => {
      const task: Task = createBaseTask({
        rawText: '[^1]: TODO Task text',
        text: 'Task text',
        footnoteMarker: '[^1]: ',
        priority: null,
      });

      mockApp.workspace.getActiveViewOfType = jest.fn().mockReturnValue(null);

      const result = await taskWriter.updateTaskPriority(task, 'high');

      expect(result.rawText).toContain('[^1]');
      expect(result.rawText).toContain('[#A]');
    });
  });

  describe('generateTaskLine checkbox with list marker', () => {
    it('should preserve checkbox list marker character from task.rawText', () => {
      const task: Task = createCheckboxTask({
        rawText: '+ [ ] TODO Task text',
        listMarker: '+ ',
        text: 'Task text',
      });

      const result = TaskWriter.generateTaskLine(
        task,
        'TODO',
        false,
        createTestKeywordManager(),
      );
      expect(result.newLine).toMatch(/^\+ \[ \] TODO Task text$/);
    });
  });
});
