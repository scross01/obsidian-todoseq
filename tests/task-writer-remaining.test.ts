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

describe('TaskWriter Remaining Lines', () => {
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
      additionalTaskKeywords: ['CUSTOM'],
    });

    taskWriter = new TaskWriter(mockApp);
  });

  describe('priority handling', () => {
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
  });

  describe('task cycle methods', () => {
    it('should handle custom keywords in updateTaskCycleState', async () => {
      const task: Task = createBaseTask({
        rawText: 'CUSTOM Task text',
        text: 'Task text',
        state: 'CUSTOM',
      });

      const result = await taskWriter.updateTaskCycleState(task);
      expect(result.state).toBe('DONE');
      expect(result.completed).toBe(true);
    });

    it('should fall back to TODO for unknown states in cycle', async () => {
      const task: Task = createBaseTask({
        rawText: 'UNKNOWN Task text',
        text: 'Task text',
        state: 'UNKNOWN',
      });

      const result = await taskWriter.updateTaskCycleState(task);
      expect(result.state).toBe('TODO');
      expect(result.completed).toBe(false);
    });
  });

  describe('applyLineUpdate file operations', () => {
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
  });

  describe('generateTaskLine edge cases', () => {
    it('should handle tasks with empty rawText for priority', async () => {
      const task: Task = createBaseTask({
        rawText: '',
        text: 'Task text',
        priority: 'high',
      });

      const result = TaskWriter.generateTaskLine(task, 'TODO');
      expect(result.newLine).toBe('TODO [#A] Task text');
    });

    it('should handle tasks with quote prefixes in priority', async () => {
      const task: Task = createBaseTask({
        rawText: '> TODO Task text',
        text: 'Task text',
        indent: '> ',
        priority: 'med',
      });

      const result = TaskWriter.generateTaskLine(task, 'DOING');
      expect(result.newLine).toBe('> DOING [#B] Task text');
    });
  });

  describe('priority token extraction', () => {
    it('should handle tasks without priority markers', async () => {
      const task: Task = createBaseTask({ priority: null });

      const result = TaskWriter.generateTaskLine(task, 'DONE');
      expect(result.newLine).not.toContain('[#');
    });

    it('should preserve priority when keepPriority true', async () => {
      const task: Task = createBaseTask({ priority: 'high' });

      const result = TaskWriter.generateTaskLine(task, 'DOING', true);
      expect(result.newLine).toContain('[#A]');
    });
  });

  describe('task with embed reference', () => {
    it('should handle tasks with embed reference and priority', async () => {
      const task: Task = createBaseTask({
        rawText: 'TODO Task text ^12345',
        text: 'Task text',
        embedReference: '^12345',
        priority: 'high',
      });

      const result = TaskWriter.generateTaskLine(task, 'DONE');
      expect(result.newLine).toContain('[#A]');
      expect(result.newLine).toContain('^12345');
    });
  });

  describe('task with footnote reference', () => {
    it('should handle tasks with footnote reference and priority', async () => {
      const task: Task = createBaseTask({
        rawText: 'TODO Task text [^1]',
        text: 'Task text',
        footnoteReference: '[^1]',
        priority: 'med',
      });

      const result = TaskWriter.generateTaskLine(task, 'DOING');
      expect(result.newLine).toContain('[#B]');
      expect(result.newLine).toContain('[^1]');
    });
  });
});
