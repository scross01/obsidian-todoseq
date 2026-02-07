import { TaskWriter } from '../src/services/task-writer';
import { createBaseTask, createCheckboxTask } from './helpers/test-helper';
import { Task } from '../src/types/task';
import { getPluginSettings } from '../src/utils/settings-utils';
import { TFile } from 'obsidian';

// Mock the settings utility
jest.mock('../src/utils/settings-utils', () => ({
  getPluginSettings: jest.fn(),
}));

describe('TaskWriter Final Coverage for Remaining Lines', () => {
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

  describe('Task tail handling (line 71)', () => {
    it('should handle task with tail when newState is empty', () => {
      const task: Task = createBaseTask({
        rawText: 'TODO Task with tail */',
        text: 'Task with tail',
        tail: ' */',
        priority: null,
      });

      const result = TaskWriter.generateTaskLine(task, '');
      expect(result.newLine).toContain('Task with tail */');
    });

    it('should handle checkbox task with tail when newState is empty', () => {
      const task: Task = createCheckboxTask({
        rawText: '- [ ] TODO Task with tail */',
        text: 'Task with tail',
        tail: ' */',
        priority: null,
      });

      const result = TaskWriter.generateTaskLine(task, '');
      expect(result.newLine).toContain('Task with tail */');
    });

    it('should handle task with tail and priority when newState is empty', () => {
      const task: Task = createBaseTask({
        rawText: 'TODO [#A] Task with tail */',
        text: 'Task with tail',
        tail: ' */',
        priority: 'high',
      });

      const result = TaskWriter.generateTaskLine(task, '');
      expect(result.newLine).toContain('Task with tail */');
    });
  });

  describe('Vault process method for task priority (lines 355-359)', () => {
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
});
