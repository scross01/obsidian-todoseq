import { TaskWriter } from '../src/services/task-writer';
import { createBaseTask, createCheckboxTask } from './helpers/test-helper';
import { Task } from '../src/types/task';
import { getPluginSettings } from '../src/utils/settings-utils';
import { TFile } from 'obsidian';

// Mock the settings utility
jest.mock('../src/utils/settings-utils', () => ({
  getPluginSettings: jest.fn(),
}));

describe('TaskWriter Checkbox and Bullet Task Priority Handling', () => {
  let mockApp: any;
  let taskWriter: TaskWriter;

  beforeEach(() => {
    // Create a deep mock of the Obsidian App
    const mockTFile = new TFile('test.md', 'test.md');

    mockApp = {
      vault: {
        getAbstractFileByPath: jest.fn().mockReturnValue(mockTFile),
        process: jest.fn().mockResolvedValue(),
      },
      workspace: {
        getActiveViewOfType: jest.fn(),
      },
    };

    // Mock settings
    (getPluginSettings as jest.Mock).mockReturnValue({
      additionalTaskKeywords: ['CUSTOM'],
    });

    taskWriter = new TaskWriter(mockApp);
  });

  describe('Checkbox task priority handling (lines 294-298)', () => {
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
  });

  describe('Bulleted task without checkbox priority handling (lines 305-317)', () => {
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
  });
});
