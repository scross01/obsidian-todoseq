import { TaskWriter } from '../src/services/task-writer';
import {
  createBaseTask,
  createCheckboxTask,
  createTestKeywordManager,
} from './helpers/test-helper';
import { Task } from '../src/types/task';
import { TFile } from 'obsidian';

describe('TaskWriter checkbox state generation', () => {
  let mockApp: any;
  let mockPlugin: any;
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

    // Create a mock plugin with settings
    mockPlugin = {
      app: mockApp,
      settings: {
        additionalInactiveKeywords: [],
        additionalActiveKeywords: [],
        additionalWaitingKeywords: [],
        additionalCompletedKeywords: [],
        additionalArchivedKeywords: ['ARCHIVED'],
        trackClosedDate: false,
        stateTransitions: {
          defaultInactive: 'TODO',
          defaultActive: 'DOING',
          defaultCompleted: 'DONE',
          transitionStatements: [],
        },
      },
    };

    const keywordManager = createTestKeywordManager();
    taskWriter = new TaskWriter(mockPlugin, keywordManager);
  });

  describe('generateTaskLine checkbox states', () => {
    it('should generate [ ] for inactive tasks', () => {
      const task: Task = createCheckboxTask({
        rawText: '- [ ] TODO Task text',
        text: 'Task text',
        state: 'TODO',
        completed: false,
        priority: null,
      });

      const result = TaskWriter.generateTaskLine(
        task,
        'TODO',
        false,
        taskWriter['keywordManager'],
      );
      expect(result.newLine).toContain('- [ ] TODO Task text');
      expect(result.completed).toBe(false);
    });

    it('should generate [ ] for waiting tasks', () => {
      const task: Task = createCheckboxTask({
        rawText: '- [ ] WAIT Task text',
        text: 'Task text',
        state: 'WAIT',
        completed: false,
        priority: null,
      });

      const result = TaskWriter.generateTaskLine(
        task,
        'WAIT',
        false,
        taskWriter['keywordManager'],
      );
      expect(result.newLine).toContain('- [ ] WAIT Task text');
      expect(result.completed).toBe(false);
    });

    it('should generate [/] for active tasks', () => {
      const task: Task = createCheckboxTask({
        rawText: '- [ ] NOW Task text',
        text: 'Task text',
        state: 'NOW',
        completed: false,
        priority: null,
      });

      const result = TaskWriter.generateTaskLine(
        task,
        'NOW',
        false,
        taskWriter['keywordManager'],
      );
      expect(result.newLine).toMatch('- [/] NOW Task text');
      expect(result.completed).toBe(false);
    });

    it('should generate [-] for canceled tasks', () => {
      const task: Task = createCheckboxTask({
        rawText: '- [ ] CANCELED Task text',
        text: 'Task text',
        state: 'CANCELED',
        completed: true,
        priority: null,
      });

      const result = TaskWriter.generateTaskLine(
        task,
        'CANCELED',
        false,
        taskWriter['keywordManager'],
      );
      expect(result.newLine).toContain('- [-] CANCELED Task text');
      expect(result.completed).toBe(true);
    });

    it('should generate [-] for CANCELLED tasks', () => {
      const task: Task = createCheckboxTask({
        rawText: '- [ ] CANCELLED Task text',
        text: 'Task text',
        state: 'CANCELLED',
        completed: true,
        priority: null,
      });

      const result = TaskWriter.generateTaskLine(
        task,
        'CANCELLED',
        false,
        taskWriter['keywordManager'],
      );
      expect(result.newLine).toContain('- [-] CANCELLED Task text');
      expect(result.completed).toBe(true);
    });

    it('should generate [x] for completed (not canceled) tasks', () => {
      const task: Task = createCheckboxTask({
        rawText: '- [ ] DONE Task text',
        text: 'Task text',
        state: 'DONE',
        completed: true,
        priority: null,
      });

      const result = TaskWriter.generateTaskLine(
        task,
        'DONE',
        false,
        taskWriter['keywordManager'],
      );
      expect(result.newLine).toContain('- [x] DONE Task text');
      expect(result.completed).toBe(true);
    });

    it('should handle checkbox with priority', () => {
      const task: Task = createCheckboxTask({
        rawText: '- [ ] NOW [#A] Task text',
        text: 'Task text',
        state: 'NOW',
        completed: false,
        priority: 'high',
      });

      const result = TaskWriter.generateTaskLine(
        task,
        'NOW',
        false,
        taskWriter['keywordManager'],
      );
      expect(result.newLine).toMatch('- [/] NOW Task text');
      expect(result.completed).toBe(false);
    });

    it('should handle checkbox with indented task', () => {
      const task: Task = createCheckboxTask({
        rawText: '  - [ ] TODO Task text',
        text: 'Task text',
        state: 'TODO',
        completed: false,
        priority: null,
        indent: '  ',
      });

      const result = TaskWriter.generateTaskLine(
        task,
        'TODO',
        false,
        taskWriter['keywordManager'],
      );
      expect(result.newLine).toContain('- [ ] TODO Task text');
      expect(result.completed).toBe(false);
    });
  });
});
