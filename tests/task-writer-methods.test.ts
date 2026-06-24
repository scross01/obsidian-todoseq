import { TaskWriter } from '../src/services/task-writer';
import {
  createBaseTask,
  createCheckboxTask,
  createTestKeywordManager,
} from './helpers/test-helper';
import { Task } from '../src/types/task';
import { TFile } from 'obsidian';
import { KeywordManager } from '../src/utils/keyword-manager';

// Extend the prototype of our mock file to make it an instance of TFile
class MockTFile extends TFile {
  constructor() {
    super();
  }

  // Implement any required properties
  path = 'test.md';
  stat: any = {};
  basename = 'test';
  extension = 'md';
  name = 'test.md';
}

describe('TaskWriter Instance Methods', () => {
  let mockApp: any;
  let mockPlugin: any;
  let taskWriter: TaskWriter;

  beforeEach(() => {
    // Create a deep mock of the Obsidian App
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

    // Create a mock plugin with settings
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

    // Create keyword manager for TaskWriter
    const keywordManager = new KeywordManager({
      additionalInactiveKeywords: ['CUSTOM'],
    });
    taskWriter = new TaskWriter(mockPlugin, keywordManager);
  });

  describe('applyLineUpdate', () => {
    it('should apply line update using editor API for active file in source mode', async () => {
      const task: Task = createBaseTask();
      const mockEditor = {
        getLine: jest.fn().mockReturnValue('TODO Task text'),
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
      const mockTFile = new MockTFile();
      mockApp.vault.getAbstractFileByPath = jest
        .fn()
        .mockReturnValue(mockTFile);

      await taskWriter.applyLineUpdate(task, 'DONE');

      expect(mockEditor.replaceRange).toHaveBeenCalled();
      expect(mockEditor.setCursor).toHaveBeenCalled();
    });

    it('should use vault process for inactive files', async () => {
      const task: Task = createBaseTask();
      mockApp.workspace.getActiveViewOfType = jest.fn().mockReturnValue(null);
      const mockTFile = new MockTFile();
      mockApp.vault.getAbstractFileByPath = jest
        .fn()
        .mockReturnValue(mockTFile);

      await taskWriter.applyLineUpdate(task, 'DONE');

      expect(mockApp.vault.process).toHaveBeenCalled();
    });

    it('should use vault process when forceVaultApi is true', async () => {
      const task: Task = createBaseTask();
      const mockEditor = {
        getLine: jest.fn().mockReturnValue('TODO Task text'),
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
      const mockTFile = new MockTFile();
      mockApp.vault.getAbstractFileByPath = jest
        .fn()
        .mockReturnValue(mockTFile);

      await taskWriter.applyLineUpdate(task, 'DONE', true, true);

      expect(mockApp.vault.process).toHaveBeenCalled();
      expect(mockEditor.replaceRange).not.toHaveBeenCalled();
    });

    it('should position cursor correctly on blank lines with TODO state', async () => {
      const task: Task = createBaseTask({
        line: 0,
        rawText: '',
        text: '',
      });
      const mockEditor = {
        getLine: jest.fn().mockReturnValue(''),
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
      const mockTFile = new MockTFile();
      mockApp.vault.getAbstractFileByPath = jest
        .fn()
        .mockReturnValue(mockTFile);

      await taskWriter.applyLineUpdate(task, 'TODO');

      expect(mockEditor.setCursor).toHaveBeenCalledWith({ line: 0, ch: 5 });
    });

    it('should fall back to vault API when file not found', async () => {
      mockApp.vault.getAbstractFileByPath = jest.fn().mockReturnValue(null);

      const task: Task = createBaseTask();

      const result = await taskWriter.applyLineUpdate(task, 'DONE');
      expect(result.state).toBe('DONE');
    });

    it('should handle case when file line does not exist', async () => {
      mockApp.vault.process = jest.fn().mockImplementation((file, callback) => {
        return callback('');
      });

      const task: Task = createBaseTask({ line: 10 });

      const result = await taskWriter.applyLineUpdate(task, 'DONE');
      expect(result.state).toBe('DONE');
    });

    it('should handle lines longer than expected', async () => {
      const task: Task = createBaseTask({
        rawText: 'TODO This is a very long task text with many characters...',
        text: 'This is a very long task text with many characters...',
      });

      mockApp.vault.process = jest.fn().mockImplementation((file, callback) => {
        const data = 'line 0\n' + task.rawText + '\nline 2';
        const result = callback(data);
        return result;
      });

      const result = await taskWriter.applyLineUpdate(task, 'DONE');
      expect(mockApp.vault.process).toHaveBeenCalled();
      expect(result.state).toBe('DONE');
    });

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

  describe('updateKeywordManager', () => {
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

  describe('updateTaskState', () => {
    it('should update task state using NEXT_STATE mapping', async () => {
      const task: Task = createBaseTask({ state: 'TODO' });
      mockApp.workspace.getActiveViewOfType = jest.fn().mockReturnValue(null);
      const mockTFile = new MockTFile();
      mockApp.vault.getAbstractFileByPath = jest
        .fn()
        .mockReturnValue(mockTFile);

      const applyLineUpdateSpy = jest
        .spyOn(taskWriter, 'applyLineUpdate')
        .mockResolvedValue(task);

      await taskWriter.updateTaskState(task);

      expect(applyLineUpdateSpy).toHaveBeenCalledWith(
        task,
        'DOING',
        true,
        false,
      );
    });

    it('should update task to DONE for custom keywords', async () => {
      const task: Task = createBaseTask({ state: 'CUSTOM' });
      mockApp.workspace.getActiveViewOfType = jest.fn().mockReturnValue(null);
      const mockTFile = new MockTFile();
      mockApp.vault.getAbstractFileByPath = jest
        .fn()
        .mockReturnValue(mockTFile);

      const applyLineUpdateSpy = jest
        .spyOn(taskWriter, 'applyLineUpdate')
        .mockResolvedValue(task);

      await taskWriter.updateTaskState(task);

      // CUSTOM is inactive keyword, should transition to default Active (DOING)
      expect(applyLineUpdateSpy).toHaveBeenCalledWith(
        task,
        'DOING',
        true,
        false,
      );
    });

    it('should use specified state when provided', async () => {
      const task: Task = createBaseTask({ state: 'TODO' });
      mockApp.workspace.getActiveViewOfType = jest.fn().mockReturnValue(null);
      const mockTFile = new MockTFile();
      mockApp.vault.getAbstractFileByPath = jest
        .fn()
        .mockReturnValue(mockTFile);

      const applyLineUpdateSpy = jest
        .spyOn(taskWriter, 'applyLineUpdate')
        .mockResolvedValue(task);

      await taskWriter.updateTaskState(task, 'LATER');

      expect(applyLineUpdateSpy).toHaveBeenCalledWith(
        task,
        'LATER',
        true,
        false,
      );
    });
  });

  describe('updateTaskCycleState', () => {
    it('should update task state using CYCLE_TASK_STATE mapping', async () => {
      const task: Task = createBaseTask({ state: 'TODO' });
      mockApp.workspace.getActiveViewOfType = jest.fn().mockReturnValue(null);
      const mockTFile = new MockTFile();
      mockApp.vault.getAbstractFileByPath = jest
        .fn()
        .mockReturnValue(mockTFile);

      const applyLineUpdateSpy = jest
        .spyOn(taskWriter, 'applyLineUpdate')
        .mockResolvedValue(task);

      await taskWriter.updateTaskCycleState(task);

      expect(applyLineUpdateSpy).toHaveBeenCalled();
    });

    it('should update task to DONE for custom keywords in cycle', async () => {
      const task: Task = createBaseTask({ state: 'CUSTOM' });
      mockApp.workspace.getActiveViewOfType = jest.fn().mockReturnValue(null);
      const mockTFile = new MockTFile();
      mockApp.vault.getAbstractFileByPath = jest
        .fn()
        .mockReturnValue(mockTFile);

      const applyLineUpdateSpy = jest
        .spyOn(taskWriter, 'applyLineUpdate')
        .mockResolvedValue(task);

      await taskWriter.updateTaskCycleState(task);

      // CUSTOM is inactive keyword, should transition to default Active (DOING)
      expect(applyLineUpdateSpy).toHaveBeenCalledWith(
        task,
        'DOING',
        true,
        false,
      );
    });

    it('should use specified state when provided for cycle', async () => {
      const task: Task = createBaseTask({ state: 'TODO' });
      mockApp.workspace.getActiveViewOfType = jest.fn().mockReturnValue(null);
      const mockTFile = new MockTFile();
      mockApp.vault.getAbstractFileByPath = jest
        .fn()
        .mockReturnValue(mockTFile);

      const applyLineUpdateSpy = jest
        .spyOn(taskWriter, 'applyLineUpdate')
        .mockResolvedValue(task);

      await taskWriter.updateTaskCycleState(task, 'LATER');

      expect(applyLineUpdateSpy).toHaveBeenCalledWith(
        task,
        'LATER',
        true,
        false,
      );
    });

    it('should handle custom keywords in updateTaskCycleState', async () => {
      const task: Task = createBaseTask({
        rawText: 'CUSTOM Task text',
        text: 'Task text',
        state: 'CUSTOM',
      });

      // CUSTOM is inactive keyword, should transition to default Active (DOING)
      const result = await taskWriter.updateTaskCycleState(task);
      expect(result.state).toBe('DOING');
      expect(result.completed).toBe(false);
    });

    it('should stay on same state for unknown states in cycle', async () => {
      const task: Task = createBaseTask({
        rawText: 'UNKNOWN Task text',
        text: 'Task text',
        state: 'UNKNOWN',
      });

      const result = await taskWriter.updateTaskCycleState(task);
      // Unknown states don't transition - stay on the same state
      expect(result.state).toBe('UNKNOWN');
      expect(result.completed).toBe(false);
    });
  });

  describe('updateTaskPriority', () => {
    it('should update task priority to high', async () => {
      const task: Task = createBaseTask();
      mockApp.workspace.getActiveViewOfType = jest.fn().mockReturnValue(null);
      const mockTFile = new MockTFile();
      mockApp.vault.getAbstractFileByPath = jest
        .fn()
        .mockReturnValue(mockTFile);

      await taskWriter.updateTaskPriority(task, 'high');

      expect(mockApp.vault.process).toHaveBeenCalled();
    });

    it('should update task priority using editor API for active file', async () => {
      const task: Task = createBaseTask();
      const mockEditor = {
        getLine: jest.fn().mockReturnValue('TODO Task text'),
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
      const mockTFile = new MockTFile();
      mockApp.vault.getAbstractFileByPath = jest
        .fn()
        .mockReturnValue(mockTFile);

      await taskWriter.updateTaskPriority(task, 'med');

      expect(mockApp.vault.process).not.toHaveBeenCalled();
      expect(mockEditor.replaceRange).toHaveBeenCalled();
    });

    it('should remove existing priority before adding new one', async () => {
      const task: Task = createBaseTask({
        rawText: 'TODO [#A] Task text',
        priority: 'high',
      });
      mockApp.workspace.getActiveViewOfType = jest.fn().mockReturnValue(null);
      const mockTFile = new MockTFile();
      mockApp.vault.getAbstractFileByPath = jest
        .fn()
        .mockReturnValue(mockTFile);

      await taskWriter.updateTaskPriority(task, 'low');

      expect(mockApp.vault.process).toHaveBeenCalled();
    });

    it('should add priority correctly to quote block task', async () => {
      // Before: > TODO test task
      // After: > TODO [#B] test task
      const task: Task = createBaseTask({
        rawText: '> TODO test task',
        indent: '> ',
        priority: null,
        text: 'test task',
      });
      mockApp.workspace.getActiveViewOfType = jest.fn().mockReturnValue(null);
      const mockTFile = new MockTFile();
      mockApp.vault.getAbstractFileByPath = jest
        .fn()
        .mockReturnValue(mockTFile);

      const result = await taskWriter.updateTaskPriority(task, 'med');

      expect(result.priority).toBe('med');
      expect(result.rawText).toBe('> TODO [#B] test task');
    });

    it('should add priority correctly to nested quote block task', async () => {
      // Before: > > TODO nested test
      // After: > > TODO [#A] nested test
      const task: Task = createBaseTask({
        rawText: '> > TODO nested test',
        indent: '> > ',
        priority: null,
        text: 'nested test',
      });
      mockApp.workspace.getActiveViewOfType = jest.fn().mockReturnValue(null);
      const mockTFile = new MockTFile();
      mockApp.vault.getAbstractFileByPath = jest
        .fn()
        .mockReturnValue(mockTFile);

      const result = await taskWriter.updateTaskPriority(task, 'high');

      expect(result.priority).toBe('high');
      expect(result.rawText).toBe('> > TODO [#A] nested test');
    });

    it('should preserve indent when adding priority to indented task', async () => {
      // Before: "    - TODO test 1" (4 spaces indent)
      // After:  "    - TODO [#A] test 1" (4 spaces indent preserved)
      const task: Task = createBaseTask({
        rawText: '    - TODO test 1',
        indent: '    ',
        listMarker: '- ',
        priority: null,
        text: 'test 1',
      });
      mockApp.workspace.getActiveViewOfType = jest.fn().mockReturnValue(null);
      const mockTFile = new MockTFile();
      mockApp.vault.getAbstractFileByPath = jest
        .fn()
        .mockReturnValue(mockTFile);

      const result = await taskWriter.updateTaskPriority(task, 'high');

      expect(result.priority).toBe('high');
      expect(result.rawText).toBe('    - TODO [#A] test 1');
    });

    it('should preserve indent when adding priority to indented checkbox task', async () => {
      // Before: "  - [ ] TODO test 2" (2 spaces indent)
      // After:  "  - [ ] TODO [#B] test 2" (2 spaces indent preserved)
      const task: Task = createBaseTask({
        rawText: '  - [ ] TODO test 2',
        indent: '  ',
        listMarker: '- [ ]',
        priority: null,
        text: 'test 2',
      });
      mockApp.workspace.getActiveViewOfType = jest.fn().mockReturnValue(null);
      const mockTFile = new MockTFile();
      mockApp.vault.getAbstractFileByPath = jest
        .fn()
        .mockReturnValue(mockTFile);

      const result = await taskWriter.updateTaskPriority(task, 'med');

      expect(result.priority).toBe('med');
      expect(result.rawText).toBe('  - [ ] TODO [#B] test 2');
    });

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

    it('should handle tasks with embed reference without text', async () => {
      const task: Task = createBaseTask({
        rawText: 'TODO ^12345',
        text: '',
        embedReference: '^12345',
        priority: null,
      });

      const result = await taskWriter.updateTaskPriority(task, 'high');
      expect(result.rawText).toContain('[#A]');
    });

    it('should handle tasks with both embed and footnote references', async () => {
      const task: Task = createBaseTask({
        rawText: 'TODO Task text ^123 [^1]',
        text: 'Task text',
        embedReference: '^123',
        footnoteReference: '[^1]',
        priority: 'med',
      });

      const result = await taskWriter.updateTaskPriority(task, 'low');
      expect(result.rawText).toContain('[#C]');
      expect(result.rawText).toContain('^123');
      expect(result.rawText).toContain('[^1]');
    });

    it('should handle tasks with leading whitespace and priority', async () => {
      const task: Task = createBaseTask({
        rawText: '  TODO [#B] Task text',
        text: 'Task text',
        indent: '  ',
        priority: 'med',
      });

      const result = await taskWriter.updateTaskPriority(task, 'high');
      expect(result.rawText).toContain('[#A]');
    });

    it('should handle tasks with multiple priority tokens', async () => {
      const task: Task = createBaseTask({
        rawText: 'TODO [#A] [#B] Task text',
        text: 'Task text',
        priority: 'high',
      });

      const result = await taskWriter.updateTaskPriority(task, 'low');
      expect(result.rawText).toContain('[#C]');
      expect(result.rawText).not.toContain('[#A]');
      expect(result.rawText).not.toContain('[#B]');
    });

    it('should handle tasks without text for priority', async () => {
      const task: Task = createBaseTask({
        rawText: 'TODO',
        text: '',
        priority: null,
      });

      await taskWriter.updateTaskPriority(task, 'high');
      expect(mockApp.vault.process).toHaveBeenCalled();
    });

    it('should handle tasks with malformed priority patterns', async () => {
      const task: Task = createBaseTask({
        rawText: 'TODO [invalid] Task text',
        text: 'Task text',
        priority: null,
      });

      await taskWriter.updateTaskPriority(task, 'med');
      expect(mockApp.vault.process).toHaveBeenCalled();
    });

    it('should handle tasks without state for priority', async () => {
      const task: Task = createBaseTask({
        rawText: 'Task text without state',
        text: 'Task text without state',
        state: '',
        priority: null,
      });

      await taskWriter.updateTaskPriority(task, 'low');
      expect(mockApp.vault.process).toHaveBeenCalled();
    });

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

    // Checkbox task priority handling
    it('should handle checkbox tasks without text', async () => {
      const task: Task = createCheckboxTask({
        rawText: '- [ ] TODO',
        text: '',
        priority: null,
      });

      await taskWriter.updateTaskPriority(task, 'high');
      expect(mockApp.vault.process).toHaveBeenCalled();
    });

    it('should handle checkbox tasks with existing priority', async () => {
      const task: Task = createCheckboxTask({
        rawText: '- [ ] TODO [#B] Task text',
        text: 'Task text',
        priority: 'med',
      });

      await taskWriter.updateTaskPriority(task, 'low');
      expect(mockApp.vault.process).toHaveBeenCalled();
    });

    it('should handle checkbox tasks with completed state', async () => {
      const task: Task = createCheckboxTask({
        rawText: '- [x] DONE Task text',
        text: 'Task text',
        state: 'DONE',
        completed: true,
        priority: null,
      });

      await taskWriter.updateTaskPriority(task, 'high');
      expect(mockApp.vault.process).toHaveBeenCalled();
    });

    it('should handle nested checkbox tasks', async () => {
      const task: Task = createCheckboxTask({
        rawText: '  - [ ] TODO Nested task',
        text: 'Nested task',
        indent: '  ',
        priority: null,
      });

      await taskWriter.updateTaskPriority(task, 'med');
      expect(mockApp.vault.process).toHaveBeenCalled();
    });

    it('should handle checkbox tasks with quote prefix', async () => {
      const task: Task = createCheckboxTask({
        rawText: '> - [ ] TODO Quoted task',
        text: 'Quoted task',
        indent: '> ',
        priority: null,
      });

      await taskWriter.updateTaskPriority(task, 'low');
      expect(mockApp.vault.process).toHaveBeenCalled();
    });

    // Bulleted task priority handling
    it('should handle bulleted tasks with dash marker', async () => {
      const task: Task = createBaseTask({
        rawText: '- TODO Bullet task',
        text: 'Bullet task',
        listMarker: '- ',
        priority: null,
      });

      await taskWriter.updateTaskPriority(task, 'high');
      expect(mockApp.vault.process).toHaveBeenCalled();
    });

    it('should handle bulleted tasks with asterisk marker', async () => {
      const task: Task = createBaseTask({
        rawText: '* TODO Bullet task',
        text: 'Bullet task',
        listMarker: '* ',
        priority: null,
      });

      await taskWriter.updateTaskPriority(task, 'med');
      expect(mockApp.vault.process).toHaveBeenCalled();
    });

    it('should handle bulleted tasks with plus marker', async () => {
      const task: Task = createBaseTask({
        rawText: '+ TODO Bullet task',
        text: 'Bullet task',
        listMarker: '+ ',
        priority: null,
      });

      await taskWriter.updateTaskPriority(task, 'low');
      expect(mockApp.vault.process).toHaveBeenCalled();
    });

    it('should handle malformed bulleted tasks without state', async () => {
      const task: Task = createBaseTask({
        rawText: '- Task without state',
        text: 'Task without state',
        state: '',
        listMarker: '- ',
        priority: null,
      });

      await taskWriter.updateTaskPriority(task, 'high');
      expect(mockApp.vault.process).toHaveBeenCalled();
    });

    it('should handle bulleted tasks with only state', async () => {
      const task: Task = createBaseTask({
        rawText: '- TODO',
        text: '',
        listMarker: '- ',
        priority: null,
      });

      await taskWriter.updateTaskPriority(task, 'med');
      expect(mockApp.vault.process).toHaveBeenCalled();
    });

    it('should handle bulleted tasks with embed reference', async () => {
      const task: Task = createBaseTask({
        rawText: '- TODO Task with embed ^123',
        text: 'Task with embed',
        listMarker: '- ',
        embedReference: '^123',
        priority: null,
      });

      await taskWriter.updateTaskPriority(task, 'low');
      expect(mockApp.vault.process).toHaveBeenCalled();
    });

    it('should handle bulleted tasks with footnote reference', async () => {
      const task: Task = createBaseTask({
        rawText: '- TODO Task with footnote [^1]',
        text: 'Task with footnote',
        listMarker: '- ',
        footnoteReference: '[^1]',
        priority: null,
      });

      await taskWriter.updateTaskPriority(task, 'high');
      expect(mockApp.vault.process).toHaveBeenCalled();
    });

    it('should handle task priority update when task line number exceeds file lines', async () => {
      const task: Task = createBaseTask({
        rawText: 'TODO Task text',
        text: 'Task text',
        line: 100, // Line number exceeds file lines
        priority: null,
      });

      mockApp.vault.process = jest.fn().mockImplementation((file, callback) => {
        const data = 'line 0\nline 1'; // Only 2 lines in file
        const result = callback(data);
        return result;
      });

      await taskWriter.updateTaskPriority(task, 'high');
      expect(mockApp.vault.process).toHaveBeenCalled();
    });

    it('should handle task priority update for large files', async () => {
      const task: Task = createBaseTask({
        rawText: 'TODO Large file task',
        text: 'Large file task',
        priority: null,
      });

      // Create a large file with 1000 lines
      let largeData = '';
      for (let i = 0; i < 1000; i++) {
        largeData += `line ${i}\n`;
      }
      largeData += 'TODO Large file task';

      mockApp.vault.process = jest.fn().mockImplementation((file, callback) => {
        const result = callback(largeData);
        return result;
      });

      await taskWriter.updateTaskPriority(task, 'med');
      expect(mockApp.vault.process).toHaveBeenCalled();
    });

    it('should handle task priority update with empty file', async () => {
      const task: Task = createBaseTask({
        rawText: 'TODO Empty file task',
        text: 'Empty file task',
        line: 0,
        priority: null,
      });

      mockApp.vault.process = jest.fn().mockImplementation((file, callback) => {
        const result = callback(''); // Empty file
        return result;
      });

      await taskWriter.updateTaskPriority(task, 'low');
      expect(mockApp.vault.process).toHaveBeenCalled();
    });
  });

  describe('removeTaskPriority', () => {
    it('should remove high priority from task', async () => {
      const task: Task = createBaseTask({
        rawText: 'TODO [#A] Task text',
        priority: 'high',
        text: 'Task text',
      });
      mockApp.workspace.getActiveViewOfType = jest.fn().mockReturnValue(null);
      const mockTFile = new MockTFile();
      mockApp.vault.getAbstractFileByPath = jest
        .fn()
        .mockReturnValue(mockTFile);

      const result = await taskWriter.removeTaskPriority(task);

      expect(result.priority).toBeNull();
      expect(result.rawText).not.toContain('[#A]');
      expect(mockApp.vault.process).toHaveBeenCalled();
    });

    it('should remove medium priority from task', async () => {
      const task: Task = createBaseTask({
        rawText: 'TODO [#B] Task text',
        priority: 'med',
        text: 'Task text',
      });
      mockApp.workspace.getActiveViewOfType = jest.fn().mockReturnValue(null);
      const mockTFile = new MockTFile();
      mockApp.vault.getAbstractFileByPath = jest
        .fn()
        .mockReturnValue(mockTFile);

      const result = await taskWriter.removeTaskPriority(task);

      expect(result.priority).toBeNull();
      expect(result.rawText).not.toContain('[#B]');
      expect(mockApp.vault.process).toHaveBeenCalled();
    });

    it('should remove low priority from task', async () => {
      const task: Task = createBaseTask({
        rawText: 'TODO [#C] Task text',
        priority: 'low',
        text: 'Task text',
      });
      mockApp.workspace.getActiveViewOfType = jest.fn().mockReturnValue(null);
      const mockTFile = new MockTFile();
      mockApp.vault.getAbstractFileByPath = jest
        .fn()
        .mockReturnValue(mockTFile);

      const result = await taskWriter.removeTaskPriority(task);

      expect(result.priority).toBeNull();
      expect(result.rawText).not.toContain('[#C]');
      expect(mockApp.vault.process).toHaveBeenCalled();
    });

    it('should handle task with no existing priority gracefully', async () => {
      const task: Task = createBaseTask({
        rawText: 'TODO Task text',
        priority: null,
        text: 'Task text',
      });
      mockApp.workspace.getActiveViewOfType = jest.fn().mockReturnValue(null);
      const mockTFile = new MockTFile();
      mockApp.vault.getAbstractFileByPath = jest
        .fn()
        .mockReturnValue(mockTFile);

      const result = await taskWriter.removeTaskPriority(task);

      expect(result.priority).toBeNull();
      expect(result.rawText).toBe('TODO Task text');
    });

    it('should remove priority from checkbox task', async () => {
      const task: Task = createBaseTask({
        rawText: '- [ ] TODO [#A] Task text',
        listMarker: '- ',
        priority: 'high',
        text: 'Task text',
      });
      mockApp.workspace.getActiveViewOfType = jest.fn().mockReturnValue(null);
      const mockTFile = new MockTFile();
      mockApp.vault.getAbstractFileByPath = jest
        .fn()
        .mockReturnValue(mockTFile);

      const result = await taskWriter.removeTaskPriority(task);

      expect(result.priority).toBeNull();
      expect(result.rawText).not.toContain('[#A]');
      expect(mockApp.vault.process).toHaveBeenCalled();
    });

    it('should preserve spacing when removing priority from bulleted task', async () => {
      // This is the exact case from the bug report: - TODO [#A] this is another task
      const task: Task = createBaseTask({
        rawText: '- TODO [#A] this is another task',
        listMarker: '- ',
        priority: 'high',
        text: 'this is another task',
      });
      mockApp.workspace.getActiveViewOfType = jest.fn().mockReturnValue(null);
      const mockTFile = new MockTFile();
      mockApp.vault.getAbstractFileByPath = jest
        .fn()
        .mockReturnValue(mockTFile);

      const result = await taskWriter.removeTaskPriority(task);

      expect(result.priority).toBeNull();
      expect(result.rawText).not.toContain('[#A]');
      // The key assertion: should preserve single space between TODO and task text
      expect(result.rawText).toBe('- TODO this is another task');
      expect(mockApp.vault.process).toHaveBeenCalled();
    });

    it('should preserve indent when removing priority from indented task', async () => {
      // Before: "    - TODO [#A] test 1" (4 spaces indent)
      // After:  "    - TODO test 1" (4 spaces indent preserved)
      const task: Task = createBaseTask({
        rawText: '    - TODO [#A] test 1',
        indent: '    ',
        listMarker: '- ',
        priority: 'high',
        text: 'test 1',
      });
      mockApp.workspace.getActiveViewOfType = jest.fn().mockReturnValue(null);
      const mockTFile = new MockTFile();
      mockApp.vault.getAbstractFileByPath = jest
        .fn()
        .mockReturnValue(mockTFile);

      const result = await taskWriter.removeTaskPriority(task);

      expect(result.priority).toBeNull();
      expect(result.rawText).toBe('    - TODO test 1');
      expect(mockApp.vault.process).toHaveBeenCalled();
    });

    it('should use editor API for active file', async () => {
      const task: Task = createBaseTask({
        rawText: 'TODO [#A] Task text',
        priority: 'high',
        text: 'Task text',
      });
      const mockEditor = {
        getLine: jest.fn().mockReturnValue('TODO [#A] Task text'),
        replaceRange: jest.fn(),
      };
      const mockMarkdownView = {
        file: { path: 'test.md' },
        editor: mockEditor,
      };

      mockApp.workspace.getActiveViewOfType = jest
        .fn()
        .mockReturnValue(mockMarkdownView);
      const mockTFile = new MockTFile();
      mockApp.vault.getAbstractFileByPath = jest
        .fn()
        .mockReturnValue(mockTFile);

      await taskWriter.removeTaskPriority(task);

      expect(mockEditor.replaceRange).toHaveBeenCalled();
    });

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

  describe('updateTaskScheduledDate', () => {
    it('should add SCHEDULED line when none exists', async () => {
      const task: Task = createBaseTask({
        rawText: 'TODO Task text',
        scheduledDate: null,
      });
      mockApp.workspace.getActiveViewOfType = jest.fn().mockReturnValue(null);
      const mockTFile = new MockTFile();
      mockApp.vault.getAbstractFileByPath = jest
        .fn()
        .mockReturnValue(mockTFile);

      const newDate = new Date(2026, 2, 10); // March 10, 2026
      const result = await taskWriter.updateTaskScheduledDate(task, newDate);

      expect(result.scheduledDate).toEqual(newDate);
      expect(mockApp.vault.process).toHaveBeenCalled();
    });

    it('should update existing SCHEDULED line', async () => {
      const task: Task = createBaseTask({
        rawText: 'TODO Task text',
        scheduledDate: new Date(2026, 2, 5),
      });
      mockApp.workspace.getActiveViewOfType = jest.fn().mockReturnValue(null);
      const mockTFile = new MockTFile();
      mockApp.vault.getAbstractFileByPath = jest
        .fn()
        .mockReturnValue(mockTFile);

      const newDate = new Date(2026, 2, 15);
      const result = await taskWriter.updateTaskScheduledDate(task, newDate);

      expect(result.scheduledDate).toEqual(newDate);
      expect(mockApp.vault.process).toHaveBeenCalled();
    });
  });

  describe('removeTaskScheduledDate', () => {
    it('should remove SCHEDULED line when present', async () => {
      const task: Task = createBaseTask({
        rawText: 'TODO Task text',
        scheduledDate: new Date(2026, 2, 5),
      });
      mockApp.workspace.getActiveViewOfType = jest.fn().mockReturnValue(null);
      const mockTFile = new MockTFile();
      mockApp.vault.getAbstractFileByPath = jest
        .fn()
        .mockReturnValue(mockTFile);

      const result = await taskWriter.removeTaskScheduledDate(task);

      expect(result.scheduledDate).toBeNull();
      expect(mockApp.vault.process).toHaveBeenCalled();
    });

    it('should attempt to remove SCHEDULED line even when task.scheduledDate is not set', async () => {
      // This test verifies that we always attempt to remove the SCHEDULED line,
      // regardless of whether task.scheduledDate is set. This is important for
      // the context menu "No date" action where the task.scheduledDate property
      // might not be set but there's still a SCHEDULED line in the file that needs
      // to be removed.
      const task: Task = createBaseTask({
        rawText: 'TODO Task text',
        scheduledDate: null,
      });
      mockApp.workspace.getActiveViewOfType = jest.fn().mockReturnValue(null);
      const mockTFile = new MockTFile();
      mockApp.vault.getAbstractFileByPath = jest
        .fn()
        .mockReturnValue(mockTFile);
      // Mock vault.process to return content unchanged (no SCHEDULED line to remove)
      mockApp.vault.process.mockImplementation(
        (_file: any, updateFn: (content: string) => string) => {
          return Promise.resolve(updateFn('TODO Task text'));
        },
      );

      const result = await taskWriter.removeTaskScheduledDate(task);

      expect(result.scheduledDate).toBeNull();
      // vault.process IS called now - we always attempt to find and remove SCHEDULED line
      expect(mockApp.vault.process).toHaveBeenCalled();
      // Verify the content is unchanged (no SCHEDULED line to remove)
      const processCall = mockApp.vault.process.mock.calls[0];
      const updateFn = processCall[1];
      const resultContent = updateFn('TODO Task text');
      expect(resultContent).toBe('TODO Task text');
    });
  });

  describe('updateTaskScheduledDate with various task types', () => {
    it('should add SCHEDULED with 2-space indent for bulleted task', async () => {
      const task: Task = createBaseTask({
        rawText: '- TODO Task text',
        line: 0,
        scheduledDate: null,
      });
      mockApp.workspace.getActiveViewOfType = jest.fn().mockReturnValue(null);
      const mockTFile = new MockTFile();
      mockApp.vault.getAbstractFileByPath = jest
        .fn()
        .mockReturnValue(mockTFile);
      mockApp.vault.process.mockImplementation(
        (_file: any, updateFn: (content: string) => string) => {
          return Promise.resolve(updateFn('- TODO Task text'));
        },
      );

      const newDate = new Date(2026, 2, 10);
      await taskWriter.updateTaskScheduledDate(task, newDate);

      // Verify the content
      expect(mockApp.vault.process).toHaveBeenCalled();
      const processCall = mockApp.vault.process.mock.calls[0];
      const updateFn = processCall[1];
      const result = updateFn('- TODO Task text');
      expect(result).toBe('- TODO Task text\n  SCHEDULED: <2026-03-10 Tue>');
    });

    it('should add SCHEDULED with 2-space indent for checkbox task', async () => {
      const task: Task = createBaseTask({
        rawText: '- [ ] TODO Task text',
        line: 0,
        scheduledDate: null,
      });
      mockApp.workspace.getActiveViewOfType = jest.fn().mockReturnValue(null);
      const mockTFile = new MockTFile();
      mockApp.vault.getAbstractFileByPath = jest
        .fn()
        .mockReturnValue(mockTFile);
      mockApp.vault.process.mockImplementation(
        (_file: any, updateFn: (content: string) => string) => {
          return Promise.resolve(updateFn('- [ ] TODO Task text'));
        },
      );

      const newDate = new Date(2026, 2, 10);
      await taskWriter.updateTaskScheduledDate(task, newDate);

      expect(mockApp.vault.process).toHaveBeenCalled();
      const processCall = mockApp.vault.process.mock.calls[0];
      const updateFn = processCall[1];
      const result = updateFn('- [ ] TODO Task text');
      expect(result).toBe(
        '- [ ] TODO Task text\n  SCHEDULED: <2026-03-10 Tue>',
      );
    });

    it('should add SCHEDULED with quote prefix for quote block task', async () => {
      const task: Task = createBaseTask({
        rawText: '> TODO Task text',
        line: 0,
        indent: '> ',
        scheduledDate: null,
      });
      mockApp.workspace.getActiveViewOfType = jest.fn().mockReturnValue(null);
      const mockTFile = new MockTFile();
      mockApp.vault.getAbstractFileByPath = jest
        .fn()
        .mockReturnValue(mockTFile);
      mockApp.vault.process.mockImplementation(
        (_file: any, updateFn: (content: string) => string) => {
          return Promise.resolve(updateFn('> TODO Task text'));
        },
      );

      const newDate = new Date(2026, 2, 10);
      await taskWriter.updateTaskScheduledDate(task, newDate);

      expect(mockApp.vault.process).toHaveBeenCalled();
      const processCall = mockApp.vault.process.mock.calls[0];
      const updateFn = processCall[1];
      const result = updateFn('> TODO Task text');
      expect(result).toBe('> TODO Task text\n> SCHEDULED: <2026-03-10 Tue>');
    });

    it('should add SCHEDULED with nested quote prefix for nested quote block task', async () => {
      const task: Task = createBaseTask({
        rawText: '> > TODO Task text',
        line: 0,
        indent: '> > ',
        scheduledDate: null,
      });
      mockApp.workspace.getActiveViewOfType = jest.fn().mockReturnValue(null);
      const mockTFile = new MockTFile();
      mockApp.vault.getAbstractFileByPath = jest
        .fn()
        .mockReturnValue(mockTFile);
      mockApp.vault.process.mockImplementation(
        (_file: any, updateFn: (content: string) => string) => {
          return Promise.resolve(updateFn('> > TODO Task text'));
        },
      );

      const newDate = new Date(2026, 2, 10);
      await taskWriter.updateTaskScheduledDate(task, newDate);

      expect(mockApp.vault.process).toHaveBeenCalled();
      const processCall = mockApp.vault.process.mock.calls[0];
      const updateFn = processCall[1];
      const result = updateFn('> > TODO Task text');
      expect(result).toBe(
        '> > TODO Task text\n> > SCHEDULED: <2026-03-10 Tue>',
      );
    });

    it('should update existing SCHEDULED for quote block task', async () => {
      const task: Task = createBaseTask({
        rawText: '> TODO Task text',
        line: 0,
        indent: '> ',
        scheduledDate: new Date(2026, 2, 5),
      });
      mockApp.workspace.getActiveViewOfType = jest.fn().mockReturnValue(null);
      const mockTFile = new MockTFile();
      mockApp.vault.getAbstractFileByPath = jest
        .fn()
        .mockReturnValue(mockTFile);
      mockApp.vault.process.mockImplementation(
        (_file: any, updateFn: (content: string) => string) => {
          return Promise.resolve(
            updateFn('> TODO Task text\n> SCHEDULED: <2026-03-05 Thu>'),
          );
        },
      );

      const newDate = new Date(2026, 2, 15);
      await taskWriter.updateTaskScheduledDate(task, newDate);

      expect(mockApp.vault.process).toHaveBeenCalled();
      const processCall = mockApp.vault.process.mock.calls[0];
      const updateFn = processCall[1];
      const result = updateFn(
        '> TODO Task text\n> SCHEDULED: <2026-03-05 Thu>',
      );
      expect(result).toBe('> TODO Task text\n> SCHEDULED: <2026-03-15 Sun>');
    });

    it('should update existing SCHEDULED for checkbox task', async () => {
      const task: Task = createBaseTask({
        rawText: '- [ ] TODO Task text',
        line: 0,
        scheduledDate: new Date(2026, 2, 5),
      });
      mockApp.workspace.getActiveViewOfType = jest.fn().mockReturnValue(null);
      const mockTFile = new MockTFile();
      mockApp.vault.getAbstractFileByPath = jest
        .fn()
        .mockReturnValue(mockTFile);
      mockApp.vault.process.mockImplementation(
        (_file: any, updateFn: (content: string) => string) => {
          return Promise.resolve(
            updateFn('- [ ] TODO Task text\n  SCHEDULED: <2026-03-05 Thu>'),
          );
        },
      );

      const newDate = new Date(2026, 2, 15);
      await taskWriter.updateTaskScheduledDate(task, newDate);

      expect(mockApp.vault.process).toHaveBeenCalled();
      const processCall = mockApp.vault.process.mock.calls[0];
      const updateFn = processCall[1];
      const result = updateFn(
        '- [ ] TODO Task text\n      SCHEDULED: <2026-03-05 Thu>',
      );
      expect(result).toBe(
        '- [ ] TODO Task text\n      SCHEDULED: <2026-03-15 Sun>',
      );
    });
  });

  describe('removeTaskScheduledDate with various task types', () => {
    it('should remove SCHEDULED line for quote block task', async () => {
      const task: Task = createBaseTask({
        rawText: '> TODO Task text',
        line: 0,
        indent: '> ',
        scheduledDate: new Date(2026, 2, 5),
      });
      mockApp.workspace.getActiveViewOfType = jest.fn().mockReturnValue(null);
      const mockTFile = new MockTFile();
      mockApp.vault.getAbstractFileByPath = jest
        .fn()
        .mockReturnValue(mockTFile);
      mockApp.vault.process.mockImplementation(
        (_file: any, updateFn: (content: string) => string) => {
          return Promise.resolve(
            updateFn('> TODO Task text\n> SCHEDULED: <2026-03-05 Thu>'),
          );
        },
      );

      const result = await taskWriter.removeTaskScheduledDate(task);

      expect(result.scheduledDate).toBeNull();
      expect(mockApp.vault.process).toHaveBeenCalled();
      const processCall = mockApp.vault.process.mock.calls[0];
      const updateFn = processCall[1];
      const content = '> TODO Task text\n> SCHEDULED: <2026-03-05 Thu>';
      const resultContent = updateFn(content);
      expect(resultContent).toBe('> TODO Task text');
    });

    it('should remove SCHEDULED line for nested quote block task', async () => {
      const task: Task = createBaseTask({
        rawText: '> > TODO Task text',
        line: 0,
        indent: '> > ',
        scheduledDate: new Date(2026, 2, 5),
      });
      mockApp.workspace.getActiveViewOfType = jest.fn().mockReturnValue(null);
      const mockTFile = new MockTFile();
      mockApp.vault.getAbstractFileByPath = jest
        .fn()
        .mockReturnValue(mockTFile);
      mockApp.vault.process.mockImplementation(
        (_file: any, updateFn: (content: string) => string) => {
          return Promise.resolve(
            updateFn('> > TODO Task text\n> > SCHEDULED: <2026-03-05 Thu>'),
          );
        },
      );

      const result = await taskWriter.removeTaskScheduledDate(task);

      expect(result.scheduledDate).toBeNull();
      expect(mockApp.vault.process).toHaveBeenCalled();
      const processCall = mockApp.vault.process.mock.calls[0];
      const updateFn = processCall[1];
      const content = '> > TODO Task text\n> > SCHEDULED: <2026-03-05 Thu>';
      const resultContent = updateFn(content);
      expect(resultContent).toBe('> > TODO Task text');
    });

    it('should remove SCHEDULED line for checkbox task', async () => {
      const task: Task = createBaseTask({
        rawText: '- [ ] TODO Task text',
        line: 0,
        scheduledDate: new Date(2026, 2, 5),
      });
      mockApp.workspace.getActiveViewOfType = jest.fn().mockReturnValue(null);
      const mockTFile = new MockTFile();
      mockApp.vault.getAbstractFileByPath = jest
        .fn()
        .mockReturnValue(mockTFile);
      mockApp.vault.process.mockImplementation(
        (_file: any, updateFn: (content: string) => string) => {
          return Promise.resolve(
            updateFn('- [ ] TODO Task text\n  SCHEDULED: <2026-03-05 Thu>'),
          );
        },
      );

      const result = await taskWriter.removeTaskScheduledDate(task);

      expect(result.scheduledDate).toBeNull();
      expect(mockApp.vault.process).toHaveBeenCalled();
      const processCall = mockApp.vault.process.mock.calls[0];
      const updateFn = processCall[1];
      const content = '- [ ] TODO Task text\n  SCHEDULED: <2026-03-05 Thu>';
      const resultContent = updateFn(content);
      expect(resultContent).toBe('- [ ] TODO Task text');
    });

    it('should remove SCHEDULED line for bulleted task', async () => {
      const task: Task = createBaseTask({
        rawText: '- TODO Task text',
        line: 0,
        scheduledDate: new Date(2026, 2, 5),
      });
      mockApp.workspace.getActiveViewOfType = jest.fn().mockReturnValue(null);
      const mockTFile = new MockTFile();
      mockApp.vault.getAbstractFileByPath = jest
        .fn()
        .mockReturnValue(mockTFile);
      mockApp.vault.process.mockImplementation(
        (_file: any, updateFn: (content: string) => string) => {
          return Promise.resolve(
            updateFn('- TODO Task text\n  SCHEDULED: <2026-03-05 Thu>'),
          );
        },
      );

      const result = await taskWriter.removeTaskScheduledDate(task);

      expect(result.scheduledDate).toBeNull();
      expect(mockApp.vault.process).toHaveBeenCalled();
      const processCall = mockApp.vault.process.mock.calls[0];
      const updateFn = processCall[1];
      const content = '- TODO Task text\n  SCHEDULED: <2026-03-05 Thu>';
      const resultContent = updateFn(content);
      expect(resultContent).toBe('- TODO Task text');
    });
  });

  describe('updateTaskDeadlineDate', () => {
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

  describe('removeTaskDeadlineDate', () => {
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

  describe('updateTaskClosedDate', () => {
    const mockTFile = new MockTFile();

    beforeEach(() => {
      mockApp = {
        vault: {
          getAbstractFileByPath: jest.fn().mockReturnValue(mockTFile),
          process: jest.fn().mockImplementation((_file, updateFn) => {
            const result = updateFn('- [ ] TODO Task text');
            return Promise.resolve(result);
          }),
          read: jest.fn().mockResolvedValue(''),
        },
        workspace: {
          getActiveViewOfType: jest.fn(),
        },
      };

      // Update mockPlugin to use the new mockApp
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

      // Recreate TaskWriter with updated mock
      const keywordManager = new KeywordManager({
        additionalInactiveKeywords: ['CUSTOM'],
      });
      taskWriter = new TaskWriter(mockPlugin, keywordManager);
    });

    it('should add CLOSED line when task is completed and no CLOSED line exists', async () => {
      const task: Task = createBaseTask({
        rawText: '- [ ] TODO Task text',
        path: 'test.md',
        line: 0,
        state: 'TODO',
        completed: false,
      });

      mockApp.vault.read.mockResolvedValueOnce('- [ ] TODO Task text');

      const result = await taskWriter.updateTaskClosedDate(
        task,
        new Date('2026-03-15'),
      );

      expect(mockApp.vault.process).toHaveBeenCalled();
      const processCall = mockApp.vault.process.mock.calls[0];
      const updateFn = processCall[1];
      const content = '- [ ] TODO Task text';
      const resultContent = updateFn(content);
      expect(resultContent).toContain('CLOSED:');
      expect(result.task.closedDate).toBeInstanceOf(Date);
      expect(result.lineDelta).toBe(1);
    });

    it('should update existing CLOSED line when task is re-completed', async () => {
      const task: Task = createBaseTask({
        rawText: '- [x] DONE Task text',
        path: 'test.md',
        line: 0,
        state: 'DONE',
        completed: true,
      });

      mockApp.vault.process = jest
        .fn()
        .mockImplementation((_file, updateFn) => {
          const result = updateFn(
            '- [x] DONE Task text\n  CLOSED: [2026-03-14 Sat 10:00]',
          );
          return Promise.resolve(result);
        });

      const result = await taskWriter.updateTaskClosedDate(
        task,
        new Date('2026-03-15'),
      );

      const processCall = mockApp.vault.process.mock.calls[0];
      const updateFn = processCall[1];
      const content =
        '- [x] DONE Task text\n      CLOSED: [2026-03-14 Sat 10:00]';
      const resultContent = updateFn(content);
      const closedCount = (resultContent.match(/CLOSED:/g) || []).length;
      expect(closedCount).toBe(1);
      expect(result.task.closedDate).toBeInstanceOf(Date);
      expect(result.lineDelta).toBe(0);
    });

    it('should use Vault API when forceVaultApi=true', async () => {
      const task: Task = createBaseTask({
        rawText: '- [ ] TODO Task text',
        path: 'test.md',
        line: 0,
        state: 'TODO',
        completed: false,
      });

      const mockEditor = { getLine: jest.fn() };
      const mockMarkdownView = {
        file: { path: 'test.md' },
        editor: mockEditor,
      };
      mockApp.workspace.getActiveViewOfType.mockReturnValue(mockMarkdownView);
      mockApp.vault.read.mockResolvedValueOnce('- [ ] TODO Task text');

      await taskWriter.updateTaskClosedDate(task, new Date('2026-03-15'), true);

      expect(mockApp.vault.process).toHaveBeenCalled();
    });

    it('should use correct indent for indented checkbox task CLOSED date', async () => {
      const task: Task = createBaseTask({
        rawText:
          '\t- [ ] TODO [#A] #diy #household design the basement closet door',
        indent: '\t',
        listMarker: '- ',
        path: 'test.md',
        line: 1,
        state: 'TODO',
        completed: false,
      });

      mockApp.vault.read.mockResolvedValueOnce(
        '- [ ] Framing wood\n\t- [ ] TODO [#A] #diy #household design the basement closet door\n\t  SCHEDULED: <2026-05-04>\n- [ ] Exterior paint',
      );

      await taskWriter.updateTaskClosedDate(task, new Date(2026, 2, 15));

      expect(mockApp.vault.process).toHaveBeenCalled();
      const processCall = mockApp.vault.process.mock.calls[0];
      const updateFn = processCall[1];
      const content =
        '- [ ] Framing wood\n\t- [ ] TODO [#A] #diy #household design the basement closet door\n\t  SCHEDULED: <2026-05-04>\n- [ ] Exterior paint';
      const resultContent = updateFn(content);
      const lines = resultContent.split('\n');
      expect(lines[3]).toBe('\t  CLOSED: [2026-03-15 Sun 00:00]');
    });

    it('should use correct indent for top-level checkbox task CLOSED date', async () => {
      const task: Task = createBaseTask({
        rawText: '- [ ] TODO Task text',
        indent: '',
        listMarker: '- ',
        path: 'test.md',
        line: 0,
        state: 'TODO',
        completed: false,
      });

      mockApp.vault.read.mockResolvedValueOnce('- [ ] TODO Task text');

      await taskWriter.updateTaskClosedDate(task, new Date(2026, 2, 15));

      expect(mockApp.vault.process).toHaveBeenCalled();
      const processCall = mockApp.vault.process.mock.calls[0];
      const updateFn = processCall[1];
      const content = '- [ ] TODO Task text';
      const resultContent = updateFn(content);
      const lines = resultContent.split('\n');
      expect(lines[1]).toBe('  CLOSED: [2026-03-15 Sun 00:00]');
    });

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

  describe('removeTaskClosedDate', () => {
    const mockTFile = new MockTFile();

    beforeEach(() => {
      mockApp = {
        vault: {
          getAbstractFileByPath: jest.fn().mockReturnValue(mockTFile),
          process: jest.fn().mockImplementation((file, updateFn) => {
            // Execute the update function synchronously to simulate vault.process behavior
            const result = updateFn(
              '- [ ] TODO Task text\n  CLOSED: [2026-03-15 Sat 10:00]',
            );
            return Promise.resolve(result);
          }),
          read: jest.fn().mockResolvedValue(''),
        },
        workspace: {
          getActiveViewOfType: jest.fn(),
        },
      };

      // Update mockPlugin to use the new mockApp
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

      // Recreate TaskWriter with updated mock
      const keywordManager = new KeywordManager({
        additionalInactiveKeywords: ['CUSTOM'],
      });
      taskWriter = new TaskWriter(mockPlugin, keywordManager);
    });

    it('should remove CLOSED line when task is uncompleted', async () => {
      const task: Task = createBaseTask({
        rawText: '- [ ] TODO Task text',
        path: 'test.md',
        line: 0,
        state: 'TODO',
        completed: false,
        closedDate: new Date('2026-03-15'),
      });

      const result = await taskWriter.removeTaskClosedDate(task);

      expect(mockApp.vault.process).toHaveBeenCalled();
      expect(result.task.closedDate).toBeNull();
      expect(result.lineDelta).toBe(-1);
    });

    it('should handle case where no CLOSED line exists in file', async () => {
      // Override the mock for this specific test
      mockApp.vault.process = jest.fn().mockImplementation((file, updateFn) => {
        const result = updateFn('- [ ] TODO Task text');
        return Promise.resolve(result);
      });

      const task: Task = createBaseTask({
        rawText: '- [ ] TODO Task text',
        path: 'test.md',
        line: 0,
        state: 'TODO',
        completed: false,
        closedDate: new Date('2026-03-15'),
      });

      const result = await taskWriter.removeTaskClosedDate(task);

      // Vault API is still called but won't find a line to remove
      expect(mockApp.vault.process).toHaveBeenCalled();
      expect(result.lineDelta).toBe(0);
    });

    it('should use Vault API when forceVaultApi=true', async () => {
      const task: Task = createBaseTask({
        rawText: '- [ ] TODO Task text',
        path: 'test.md',
        line: 0,
        state: 'TODO',
        completed: false,
        closedDate: new Date('2026-03-15'),
      });

      const mockEditor = { getLine: jest.fn() };
      const mockMarkdownView = {
        file: { path: 'test.md' },
        editor: mockEditor,
      };
      mockApp.workspace.getActiveViewOfType.mockReturnValue(mockMarkdownView);
      mockApp.vault.read.mockResolvedValueOnce(
        '- [ ] TODO Task text\n  CLOSED: [2026-03-15 Sat 10:00]',
      );

      await taskWriter.removeTaskClosedDate(task, true);

      expect(mockApp.vault.process).toHaveBeenCalled();
    });

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

  // ─────────────────────────────────────────────────────────────────────
  // applyRecurrenceUpdate — atomic recurrence file writes
  // ─────────────────────────────────────────────────────────────────────
  describe('applyRecurrenceUpdate', () => {
    // Helper: set up vault.process to capture the written content
    function setupVaultProcess(initialContent: string) {
      let writtenContent = '';
      mockApp.vault.process = jest
        .fn()
        .mockImplementation(
          (_file: any, updateFn: (content: string) => string) => {
            writtenContent = updateFn(initialContent);
            return Promise.resolve(writtenContent);
          },
        );
      return () => writtenContent;
    }

    it('should make exactly ONE vault.process call for all changes (state + dates)', async () => {
      const task = createBaseTask({
        rawText: 'DONE Task text',
        state: 'DONE',
        completed: true,
        scheduledDate: new Date(2026, 2, 10),
        scheduledDateRepeat: { type: '+', unit: 'w', value: 1, raw: '+1w' },
        deadlineDate: new Date(2026, 2, 10),
        deadlineDateRepeat: { type: '+', unit: 'w', value: 1, raw: '+1w' },
      });

      const getContent = setupVaultProcess(
        'DONE Task text\n  SCHEDULED: <2026-03-10 Tue +1w>\n  DEADLINE: <2026-03-10 Tue +1w>',
      );

      await taskWriter.applyRecurrenceUpdate(task, {
        newScheduledDate: new Date(2026, 2, 17),
        newDeadlineDate: new Date(2026, 2, 17),
        newState: 'TODO',
      });

      // This is THE key assertion for Bug #72: only one undo entry
      expect(mockApp.vault.process).toHaveBeenCalledTimes(1);
    });

    it('should update task state, scheduled date, and deadline in a single write', async () => {
      const task = createBaseTask({
        rawText: 'DONE Task text',
        state: 'DONE',
        completed: true,
        scheduledDate: new Date(2026, 2, 10),
        scheduledDateRepeat: { type: '+', unit: 'w', value: 1, raw: '+1w' },
        deadlineDate: new Date(2026, 2, 10),
        deadlineDateRepeat: { type: '+', unit: 'w', value: 1, raw: '+1w' },
      });

      const getContent = setupVaultProcess(
        'DONE Task text\n  SCHEDULED: <2026-03-10 Tue +1w>\n  DEADLINE: <2026-03-10 Tue +1w>',
      );

      const result = await taskWriter.applyRecurrenceUpdate(task, {
        newScheduledDate: new Date(2026, 2, 17),
        newDeadlineDate: new Date(2026, 2, 17),
        newState: 'TODO',
      });

      // State changed
      expect(result.state).toBe('TODO');
      expect(result.completed).toBe(false);

      // Dates advanced
      expect(result.scheduledDate).toEqual(new Date(2026, 2, 17));
      expect(result.deadlineDate).toEqual(new Date(2026, 2, 17));

      // rawText updated with new state
      expect(result.rawText).toContain('TODO');
      expect(result.rawText).not.toContain('DONE');

      // File content has all three changes
      const content = getContent();
      expect(content).toContain('TODO Task text');
      expect(content).toContain('SCHEDULED: <2026-03-17 Tue +1w>');
      expect(content).toContain('DEADLINE: <2026-03-17 Tue +1w>');
    });

    it('should preserve regular warning period (-Nd) through recurrence', async () => {
      // Bug #71: warning period should be carried over
      const task = createBaseTask({
        rawText: 'DONE Task text',
        state: 'DONE',
        completed: true,
        deadlineDate: new Date(2026, 5, 24),
        deadlineDateRepeat: { type: '+', unit: 'd', value: 1, raw: '+1d' },
        deadlineWarningPeriod: { value: 3, unit: 'd', isFirstOnly: false },
      });

      setupVaultProcess('DONE Task text\n  DEADLINE: <2026-06-24 Wed +1d -3d>');

      const result = await taskWriter.applyRecurrenceUpdate(task, {
        newDeadlineDate: new Date(2026, 5, 25),
        newDeadlineWarningPeriod: { value: 3, unit: 'd', isFirstOnly: false },
        newState: 'TODO',
      });

      // Warning period preserved in result
      expect(result.deadlineWarningPeriod).toEqual({
        value: 3,
        unit: 'd',
        isFirstOnly: false,
      });
    });

    it('should strip first-only warning period (--Nd) when null is passed', async () => {
      const task = createBaseTask({
        rawText: 'DONE Task text',
        state: 'DONE',
        completed: true,
        deadlineDate: new Date(2026, 5, 24),
        deadlineDateRepeat: { type: '+', unit: 'd', value: 1, raw: '+1d' },
        deadlineWarningPeriod: { value: 3, unit: 'd', isFirstOnly: true },
      });

      setupVaultProcess(
        'DONE Task text\n  DEADLINE: <2026-06-24 Wed +1d --3d>',
      );

      const result = await taskWriter.applyRecurrenceUpdate(task, {
        newDeadlineDate: new Date(2026, 5, 25),
        newDeadlineWarningPeriod: null, // strip first-only
        newState: 'TODO',
      });

      expect(result.deadlineWarningPeriod).toBeNull();
    });

    it('should update existing SCHEDULED and DEADLINE lines in place without duplicates', async () => {
      const task = createBaseTask({
        rawText: 'DONE Task text',
        state: 'DONE',
        completed: true,
        scheduledDate: new Date(2026, 2, 10),
        scheduledDateRepeat: { type: '+', unit: 'w', value: 1, raw: '+1w' },
        deadlineDate: new Date(2026, 2, 12),
        deadlineDateRepeat: { type: '+', unit: 'w', value: 1, raw: '+1w' },
      });

      const getContent = setupVaultProcess(
        'DONE Task text\n  SCHEDULED: <2026-03-10 Tue +1w>\n  DEADLINE: <2026-03-12 Thu +1w>',
      );

      await taskWriter.applyRecurrenceUpdate(task, {
        newScheduledDate: new Date(2026, 2, 17),
        newDeadlineDate: new Date(2026, 2, 19),
        newState: 'TODO',
      });

      const content = getContent();
      // No duplicate lines
      const scheduledCount = (content.match(/SCHEDULED:/g) || []).length;
      const deadlineCount = (content.match(/DEADLINE:/g) || []).length;
      expect(scheduledCount).toBe(1);
      expect(deadlineCount).toBe(1);
      // Values updated
      expect(content).toContain('SCHEDULED: <2026-03-17 Tue +1w>');
      expect(content).toContain('DEADLINE: <2026-03-19 Thu +1w>');
    });

    it('should remove SCHEDULED and DEADLINE lines when null is passed', async () => {
      const task = createBaseTask({
        rawText: 'TODO Task text',
        state: 'TODO',
        completed: false,
        scheduledDate: new Date(2026, 2, 10),
        deadlineDate: new Date(2026, 2, 12),
      });

      const getContent = setupVaultProcess(
        'TODO Task text\n  SCHEDULED: <2026-03-10 Tue>\n  DEADLINE: <2026-03-12 Thu>',
      );

      const result = await taskWriter.applyRecurrenceUpdate(task, {
        newScheduledDate: null,
        newDeadlineDate: null,
      });

      expect(result.scheduledDate).toBeNull();
      expect(result.deadlineDate).toBeNull();
      const content = getContent();
      expect(content).not.toContain('SCHEDULED');
      expect(content).not.toContain('DEADLINE');
    });

    it('should handle recurrence with only scheduled date update (no state change)', async () => {
      const task = createBaseTask({
        rawText: 'TODO Task text',
        state: 'TODO',
        completed: false,
        scheduledDate: new Date(2026, 2, 10),
        scheduledDateRepeat: { type: '+', unit: 'w', value: 1, raw: '+1w' },
      });

      setupVaultProcess('TODO Task text\n  SCHEDULED: <2026-03-10 Tue +1w>');

      const result = await taskWriter.applyRecurrenceUpdate(task, {
        newScheduledDate: new Date(2026, 2, 17),
      });

      expect(result.scheduledDate).toEqual(new Date(2026, 2, 17));
      // State unchanged
      expect(result.state).toBe('TODO');
      // rawText unchanged (no state change)
      expect(result.rawText).toBe('TODO Task text');
      // Only one vault.process call
      expect(mockApp.vault.process).toHaveBeenCalledTimes(1);
    });

    it('should handle null file gracefully', async () => {
      mockApp.vault.getAbstractFileByPath = jest.fn().mockReturnValue(null);

      const task = createBaseTask({
        rawText: 'DONE Task text',
        state: 'DONE',
        completed: true,
        deadlineDate: new Date(2026, 5, 24),
      });

      const result = await taskWriter.applyRecurrenceUpdate(task, {
        newDeadlineDate: new Date(2026, 5, 25),
        newState: 'TODO',
      });

      // Should still return correct snapshot even without file write
      expect(result.state).toBe('TODO');
      expect(result.deadlineDate).toEqual(new Date(2026, 5, 25));
      expect(mockApp.vault.process).not.toHaveBeenCalled();
    });

    it('should pass through repeat info when updating dates', async () => {
      const task = createBaseTask({
        rawText: 'DONE Task text',
        state: 'DONE',
        completed: true,
        scheduledDate: new Date(2026, 2, 10),
        deadlineDate: new Date(2026, 2, 10),
      });

      setupVaultProcess(
        'DONE Task text\n  SCHEDULED: <2026-03-10 Tue>\n  DEADLINE: <2026-03-10 Tue>',
      );

      const result = await taskWriter.applyRecurrenceUpdate(task, {
        newScheduledDate: new Date(2026, 2, 17),
        newScheduledRepeat: { type: '+', unit: 'w', value: 1, raw: '+1w' },
        newDeadlineDate: new Date(2026, 2, 17),
        newDeadlineRepeat: { type: '+', unit: 'w', value: 1, raw: '+1w' },
        newState: 'TODO',
      });

      expect(result.scheduledDateRepeat).toEqual({
        type: '+',
        unit: 'w',
        value: 1,
        raw: '+1w',
      });
      expect(result.deadlineDateRepeat).toEqual({
        type: '+',
        unit: 'w',
        value: 1,
        raw: '+1w',
      });
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // Inlined date-line helpers (formerly src/services/date-line-operator.ts).
  // Access via `as any` since they are private — these tests guard against
  // regressions in the pure helpers that back TaskWriter's public API.
  // ─────────────────────────────────────────────────────────────────────
  describe('inlined date-line helpers', () => {
    describe('getExistingDateLineIndent', () => {
      it('returns the line indent for an unquoted line', () => {
        expect(
          (taskWriter as any).getExistingDateLineIndent(
            '  SCHEDULED: <2026-01-01>',
          ),
        ).toBe('  ');
      });

      it('returns the quote prefix for a quoted line', () => {
        expect(
          (taskWriter as any).getExistingDateLineIndent(
            '> SCHEDULED: <2026-01-01>',
          ),
        ).toBe('> ');
      });

      it('returns the nested quote prefix', () => {
        expect(
          (taskWriter as any).getExistingDateLineIndent(
            '> > SCHEDULED: <2026-01-01>',
          ),
        ).toBe('> > ');
      });

      it('returns empty string for a flat line', () => {
        expect(
          (taskWriter as any).getExistingDateLineIndent(
            'SCHEDULED: <2026-01-01>',
          ),
        ).toBe('');
      });
    });

    describe('getEffectiveDateLineIndent', () => {
      it('preserves the existing line indent when a date line is present', () => {
        const lines = ['TODO task', '    SCHEDULED: <2026-01-01>'];
        const task: Task = createBaseTask({
          rawText: '- TODO task',
          line: 0,
          indent: '',
          listMarker: '- ',
        });
        // Existing line has 4-space indent; default for the task would be 2.
        expect(
          (taskWriter as any).getEffectiveDateLineIndent(lines, 1, task),
        ).toBe('    ');
      });

      it('preserves the quote prefix on a quoted existing line', () => {
        const lines = ['> TODO task', '>   SCHEDULED: <2026-01-01>'];
        const task: Task = createBaseTask({
          rawText: '> TODO task',
          line: 0,
          indent: '> ',
          listMarker: '',
        });
        expect(
          (taskWriter as any).getEffectiveDateLineIndent(lines, 1, task),
        ).toBe('>   ');
      });

      it('falls back to the task default indent when no existing date line', () => {
        const lines = ['- TODO task'];
        const task: Task = createBaseTask({
          rawText: '- TODO task',
          line: 0,
          indent: '',
          listMarker: '- ',
        });
        // For a bulleted task with no leading indent, default is 2-space indent
        expect(
          (taskWriter as any).getEffectiveDateLineIndent(lines, -1, task),
        ).toBe('  ');
      });
    });

    describe('calcDateLineInsertIndex', () => {
      const taskIndent = '';

      it('places SCHEDULED before DEADLINE when DEADLINE exists', () => {
        const lines = ['TODO task', '  DEADLINE: <2026-01-01>'];
        expect(
          (taskWriter as any).calcDateLineInsertIndex(
            lines,
            0,
            'SCHEDULED',
            taskIndent,
          ),
        ).toBe(1);
      });

      it('places SCHEDULED after task when no DEADLINE exists', () => {
        const lines = ['TODO task'];
        expect(
          (taskWriter as any).calcDateLineInsertIndex(
            lines,
            0,
            'SCHEDULED',
            taskIndent,
          ),
        ).toBe(1);
      });

      it('places DEADLINE after SCHEDULED when SCHEDULED exists', () => {
        const lines = ['TODO task', '  SCHEDULED: <2026-01-01>'];
        expect(
          (taskWriter as any).calcDateLineInsertIndex(
            lines,
            0,
            'DEADLINE',
            taskIndent,
          ),
        ).toBe(2);
      });

      it('places DEADLINE after task when no SCHEDULED exists', () => {
        const lines = ['TODO task'];
        expect(
          (taskWriter as any).calcDateLineInsertIndex(
            lines,
            0,
            'DEADLINE',
            taskIndent,
          ),
        ).toBe(1);
      });

      it('places CLOSED after DEADLINE when both SCHEDULED and DEADLINE exist (DEADLINE wins)', () => {
        const lines = [
          'TODO task',
          '  SCHEDULED: <2026-01-01>',
          '  DEADLINE: <2026-02-01>',
        ];
        expect(
          (taskWriter as any).calcDateLineInsertIndex(
            lines,
            0,
            'CLOSED',
            taskIndent,
          ),
        ).toBe(3);
      });

      it('places CLOSED after SCHEDULED when only SCHEDULED exists', () => {
        const lines = ['TODO task', '  SCHEDULED: <2026-01-01>'];
        expect(
          (taskWriter as any).calcDateLineInsertIndex(
            lines,
            0,
            'CLOSED',
            taskIndent,
          ),
        ).toBe(2);
      });

      it('places CLOSED after task when no SCHEDULED/DEADLINE exists', () => {
        const lines = ['TODO task'];
        expect(
          (taskWriter as any).calcDateLineInsertIndex(
            lines,
            0,
            'CLOSED',
            taskIndent,
          ),
        ).toBe(1);
      });
    });

    describe('updateOrInsertDateLine', () => {
      it('updates an existing SCHEDULED line in place (lineDelta: 0)', () => {
        const lines = ['TODO task', '  SCHEDULED: <2026-01-01>'];
        const task: Task = createBaseTask({
          line: 0,
          indent: '',
          listMarker: '',
        });
        const result = (taskWriter as any).updateOrInsertDateLine(
          lines,
          0,
          'SCHEDULED',
          '<2026-02-01>',
          task,
        );
        expect(result.lineDelta).toBe(0);
        expect(result.lines.join('\n')).toBe(
          'TODO task\n  SCHEDULED: <2026-02-01>',
        );
      });

      it('inserts a new SCHEDULED line after a bulleted task (lineDelta: +1)', () => {
        const lines = ['- TODO task'];
        const task: Task = createBaseTask({
          rawText: '- TODO task',
          line: 0,
          indent: '',
          listMarker: '- ',
        });
        const result = (taskWriter as any).updateOrInsertDateLine(
          lines,
          0,
          'SCHEDULED',
          '<2026-02-01>',
          task,
        );
        expect(result.lineDelta).toBe(1);
        expect(result.lines.join('\n')).toBe(
          '- TODO task\n  SCHEDULED: <2026-02-01>',
        );
      });

      it('inserts SCHEDULED before an existing DEADLINE', () => {
        const lines = ['- TODO task', '  DEADLINE: <2026-01-01>'];
        const task: Task = createBaseTask({
          rawText: '- TODO task',
          line: 0,
          indent: '',
          listMarker: '- ',
        });
        const result = (taskWriter as any).updateOrInsertDateLine(
          lines,
          0,
          'SCHEDULED',
          '<2026-02-01>',
          task,
        );
        expect(result.lineDelta).toBe(1);
        expect(result.lines.join('\n')).toBe(
          '- TODO task\n  SCHEDULED: <2026-02-01>\n  DEADLINE: <2026-01-01>',
        );
      });

      it('inserts DEADLINE after an existing SCHEDULED', () => {
        const lines = ['- TODO task', '  SCHEDULED: <2026-01-01>'];
        const task: Task = createBaseTask({
          rawText: '- TODO task',
          line: 0,
          indent: '',
          listMarker: '- ',
        });
        const result = (taskWriter as any).updateOrInsertDateLine(
          lines,
          0,
          'DEADLINE',
          '<2026-02-01>',
          task,
        );
        expect(result.lineDelta).toBe(1);
        expect(result.lines.join('\n')).toBe(
          '- TODO task\n  SCHEDULED: <2026-01-01>\n  DEADLINE: <2026-02-01>',
        );
      });

      it('preserves quote indent when updating in place', () => {
        const lines = ['> TODO task', '>   SCHEDULED: <2026-01-01>'];
        const task: Task = createBaseTask({
          rawText: '> TODO task',
          line: 0,
          indent: '> ',
          listMarker: '',
        });
        const result = (taskWriter as any).updateOrInsertDateLine(
          lines,
          0,
          'SCHEDULED',
          '<2026-02-01>',
          task,
        );
        expect(result.lineDelta).toBe(0);
        expect(result.lines.join('\n')).toBe(
          '> TODO task\n>   SCHEDULED: <2026-02-01>',
        );
      });

      it('inserts CLOSED after DEADLINE (or SCHEDULED) or task', () => {
        const task: Task = createBaseTask({
          rawText: '- TODO task',
          line: 0,
          indent: '',
          listMarker: '- ',
        });

        const rA = (taskWriter as any).updateOrInsertDateLine(
          ['- TODO task', '  DEADLINE: <2026-01-01>'],
          0,
          'CLOSED',
          '[2026-02-01]',
          task,
        );
        const rB = (taskWriter as any).updateOrInsertDateLine(
          ['- TODO task', '  SCHEDULED: <2026-01-01>'],
          0,
          'CLOSED',
          '[2026-02-01]',
          task,
        );
        const rC = (taskWriter as any).updateOrInsertDateLine(
          ['- TODO task'],
          0,
          'CLOSED',
          '[2026-02-01]',
          task,
        );

        expect(rA.lineDelta).toBe(1);
        expect(rB.lineDelta).toBe(1);
        expect(rC.lineDelta).toBe(1);
        expect(rA.lines.join('\n')).toBe(
          '- TODO task\n  DEADLINE: <2026-01-01>\n  CLOSED: [2026-02-01]',
        );
        expect(rB.lines.join('\n')).toBe(
          '- TODO task\n  SCHEDULED: <2026-01-01>\n  CLOSED: [2026-02-01]',
        );
        expect(rC.lines.join('\n')).toBe('- TODO task\n  CLOSED: [2026-02-01]');
      });
    });

    describe('removeDateLine', () => {
      it('removes an existing SCHEDULED line (lineDelta: -1)', () => {
        const lines = ['- TODO task', '  SCHEDULED: <2026-01-01>'];
        const task: Task = createBaseTask({
          rawText: '- TODO task',
          line: 0,
          indent: '',
          listMarker: '- ',
        });
        const result = (taskWriter as any).removeDateLine(
          lines,
          0,
          'SCHEDULED',
          task,
        );
        expect(result.lineDelta).toBe(-1);
        expect(result.lines).toEqual(['- TODO task']);
      });

      it('removes an existing CLOSED line (lineDelta: -1)', () => {
        const lines = ['- DONE task', '  CLOSED: [2026-01-01 Sat 10:00]'];
        const task: Task = createBaseTask({
          rawText: '- DONE task',
          state: 'DONE',
          line: 0,
          indent: '',
          listMarker: '- ',
        });
        const result = (taskWriter as any).removeDateLine(
          lines,
          0,
          'CLOSED',
          task,
        );
        expect(result.lineDelta).toBe(-1);
        expect(result.lines).toEqual(['- DONE task']);
      });

      it('is a no-op when no matching date line exists (lineDelta: 0)', () => {
        const lines = ['- TODO task', '  SCHEDULED: <2026-01-01>'];
        const task: Task = createBaseTask({
          rawText: '- TODO task',
          line: 0,
          indent: '',
          listMarker: '- ',
        });
        const result = (taskWriter as any).removeDateLine(
          [...lines],
          0,
          'DEADLINE',
          task,
        );
        expect(result.lineDelta).toBe(0);
        expect(result.lines).toEqual(lines);
      });
    });
  });
});
