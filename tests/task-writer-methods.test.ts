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

    it('should update task priority using vault.process for all files', async () => {
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

      // Always uses vault.process() regardless of whether file is active
      expect(mockApp.vault.process).toHaveBeenCalled();
      expect(mockEditor.replaceRange).not.toHaveBeenCalled();
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
        '- [ ] TODO Task text\n  SCHEDULED: <2026-03-05 Thu>',
      );
      expect(result).toBe(
        '- [ ] TODO Task text\n  SCHEDULED: <2026-03-15 Sun>',
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
});
