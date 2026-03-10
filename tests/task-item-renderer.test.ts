import { TaskItemRenderer } from '../src/view/task-list/task-item-renderer';
import { KeywordManager } from '../src/utils/keyword-manager';
import { TaskStateTransitionManager } from '../src/services/task-state-transition-manager';
import { StateMenuBuilder } from '../src/view/components/state-menu-builder';
import { Task } from '../src/types/task';
import { createBaseTask } from './helpers/test-helper';

// Mock dependencies
const mockOnStateChange = jest.fn().mockResolvedValue(undefined);
const mockOnLocationOpen = jest.fn();
const mockMenuBuilder = {
  buildStateMenu: jest.fn(),
} as unknown as StateMenuBuilder;

describe('TaskItemRenderer', () => {
  let keywordManager: KeywordManager;
  let stateManager: TaskStateTransitionManager;
  let taskItemRenderer: TaskItemRenderer;

  const defaultCompleted = 'DONE';
  const defaultInactive = 'TODO';

  beforeEach(() => {
    jest.clearAllMocks();

    keywordManager = new KeywordManager({});
    stateManager = new TaskStateTransitionManager(keywordManager, undefined);

    taskItemRenderer = new TaskItemRenderer(
      () => keywordManager,
      () => stateManager,
      () => mockMenuBuilder,
      mockOnStateChange,
      mockOnLocationOpen,
      defaultCompleted,
      defaultInactive,
    );
  });

  describe('buildCheckbox', () => {
    it('should use defaultCompleted from settings when checkbox is checked', async () => {
      const task: Task = createBaseTask({
        path: 'test.md',
        line: 0,
        rawText: 'TODO Test task',
        text: 'Test task',
        state: 'TODO',
        completed: false,
      });

      // Create a mock container
      const mockCheckbox = {
        checked: false,
        classList: {
          add: jest.fn(),
          remove: jest.fn(),
          toggle: jest.fn(),
        },
        addEventListener: jest.fn(),
        addClass: jest.fn(),
      };

      const container = {
        createEl: jest.fn().mockReturnValue(mockCheckbox),
      } as unknown as HTMLElement;

      taskItemRenderer.buildCheckbox(task, container);

      // Get the event listener that was registered
      expect(mockCheckbox.addEventListener).toHaveBeenCalledWith(
        'change',
        expect.any(Function),
      );

      // Simulate checking the checkbox by calling the handler directly
      const eventHandler = mockCheckbox.addEventListener.mock.calls.find(
        (call: unknown[]) => call[0] === 'change',
      )[1] as () => Promise<void>;

      // Simulate checkbox being checked
      mockCheckbox.checked = true;
      await eventHandler();

      // Should use 'DONE' from settings (defaultCompleted)
      expect(mockOnStateChange).toHaveBeenCalledWith(task, 'DONE');
    });

    it('should use defaultInactive from settings when checkbox is unchecked', async () => {
      const task: Task = createBaseTask({
        path: 'test.md',
        line: 0,
        rawText: 'DONE Test task',
        text: 'Test task',
        state: 'DONE',
        completed: true,
      });

      const mockCheckbox = {
        checked: true,
        classList: {
          add: jest.fn(),
          remove: jest.fn(),
          toggle: jest.fn(),
        },
        addEventListener: jest.fn(),
        addClass: jest.fn(),
      };

      const container = {
        createEl: jest.fn().mockReturnValue(mockCheckbox),
      } as unknown as HTMLElement;

      taskItemRenderer.buildCheckbox(task, container);

      // Get the event listener
      const eventHandler = mockCheckbox.addEventListener.mock.calls.find(
        (call: unknown[]) => call[0] === 'change',
      )[1] as () => Promise<void>;

      // Simulate unchecking the checkbox
      mockCheckbox.checked = false;
      await eventHandler();

      // Should use 'TODO' from settings (defaultInactive)
      expect(mockOnStateChange).toHaveBeenCalledWith(task, 'TODO');
    });

    it('should use custom state values from constructor parameters', async () => {
      // Create renderer with custom state values
      const customRenderer = new TaskItemRenderer(
        () => keywordManager,
        () => stateManager,
        () => mockMenuBuilder,
        mockOnStateChange,
        mockOnLocationOpen,
        'COMPLETED',
        'BACKLOG',
      );

      const task: Task = createBaseTask({
        path: 'test.md',
        line: 0,
        rawText: 'BACKLOG Test task',
        text: 'Test task',
        state: 'BACKLOG',
        completed: false,
      });

      const mockCheckbox = {
        checked: false,
        classList: {
          add: jest.fn(),
          remove: jest.fn(),
          toggle: jest.fn(),
        },
        addEventListener: jest.fn(),
        addClass: jest.fn(),
      };

      const container = {
        createEl: jest.fn().mockReturnValue(mockCheckbox),
      } as unknown as HTMLElement;

      customRenderer.buildCheckbox(task, container);

      // Simulate checking the checkbox
      const eventHandler = mockCheckbox.addEventListener.mock.calls.find(
        (call: unknown[]) => call[0] === 'change',
      )[1] as () => Promise<void>;

      mockCheckbox.checked = true;
      await eventHandler();

      // Should use 'COMPLETED' from custom settings (defaultCompleted)
      expect(mockOnStateChange).toHaveBeenCalledWith(task, 'COMPLETED');
    });

    it('should use default values when not provided', () => {
      // Create renderer without explicit default values
      const rendererWithDefaults = new TaskItemRenderer(
        () => keywordManager,
        () => stateManager,
        () => mockMenuBuilder,
        mockOnStateChange,
        mockOnLocationOpen,
      );

      const task: Task = createBaseTask();

      const mockCheckbox = {
        checked: false,
        classList: {
          add: jest.fn(),
          remove: jest.fn(),
          toggle: jest.fn(),
        },
        addEventListener: jest.fn(),
        addClass: jest.fn(),
      };

      const container = {
        createEl: jest.fn().mockReturnValue(mockCheckbox),
      } as unknown as HTMLElement;

      // This should not throw
      expect(() => {
        rendererWithDefaults.buildCheckbox(task, container);
      }).not.toThrow();
    });
  });

  describe('buildTaskListItem', () => {
    it('should have access to required dependencies', () => {
      // Verify the renderer is properly initialized with all dependencies
      expect(taskItemRenderer).toBeDefined();
      expect(mockOnStateChange).toBeDefined();
      expect(mockOnLocationOpen).toBeDefined();
    });
  });
});
