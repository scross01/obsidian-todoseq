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

describe('TaskWriter Final Coverage', () => {
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

  describe('specific patterns for uncovered lines', () => {
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

    it('should handle tasks with only state and embed reference', async () => {
      const task: Task = createBaseTask({
        rawText: 'TODO ^123',
        text: '',
        embedReference: '^123',
        priority: null,
      });

      const result = TaskWriter.generateTaskLine(task, 'DONE', true);
      expect(result.newLine).toContain('DONE');
      expect(result.newLine).toContain('^123');
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
  });

  describe('edge cases for priority parsing', () => {
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
  });

  describe('vault process method', () => {
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
  });
});
