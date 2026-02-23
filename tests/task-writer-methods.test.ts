import { TaskWriter } from '../src/services/task-writer';
import { createBaseTask } from './helpers/test-helper';
import { Task } from '../src/types/task';
import { getPluginSettings } from '../src/utils/settings-utils';
import { TFile } from 'obsidian';

// Mock the settings utility
jest.mock('../src/utils/settings-utils', () => ({
  getPluginSettings: jest.fn(),
}));

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

    // Mock settings
    (getPluginSettings as jest.Mock).mockReturnValue({
      additionalInactiveKeywords: ['CUSTOM'],
    });

    taskWriter = new TaskWriter(mockApp);
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

      expect(mockEditor.setCursor).toHaveBeenCalledWith({ line: 0, ch: 4 });
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

      expect(applyLineUpdateSpy).toHaveBeenCalledWith(
        task,
        'DONE',
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

      expect(applyLineUpdateSpy).toHaveBeenCalledWith(
        task,
        'DONE',
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
      };

      mockApp.workspace.getActiveViewOfType = jest
        .fn()
        .mockReturnValue(mockMarkdownView);
      const mockTFile = new MockTFile();
      mockApp.vault.getAbstractFileByPath = jest
        .fn()
        .mockReturnValue(mockTFile);

      await taskWriter.updateTaskPriority(task, 'med');

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
  });
});
