import { TaskRenderer } from '../src/view/task-list/task-renderer';
import { StateMenuBuilder } from '../src/view/components/state-menu-builder';
import { TodoTrackerSettings } from '../src/settings/settings-types';
import { Task } from '../src/types/task';
import { createBaseSettings } from './helpers/test-helper';

// Mock the global plugin for task update coordinator
const mockTaskUpdateCoordinator = {
  updateTaskState: jest.fn().mockResolvedValue({
    rawText: 'DONE Test task',
    state: 'DONE',
    completed: true,
  }),
};

// Setup global mock before importing the module
beforeAll(() => {
  // Mock window globally for the tests - structure must match what the code expects
  global.window = {
    todoSeqPlugin: {
      taskUpdateCoordinator: mockTaskUpdateCoordinator,
    },
  } as any;
});

afterAll(() => {
  // @ts-ignore
  delete global.window;
});

describe('TaskRenderer', () => {
  let taskRenderer: TaskRenderer;
  let mockPlugin: { settings: TodoTrackerSettings | undefined };
  let mockMenuBuilder: jest.Mocked<StateMenuBuilder>;

  beforeEach(() => {
    jest.clearAllMocks();

    mockPlugin = {
      settings: createBaseSettings({
        stateTransitions: {
          defaultInactive: 'TODO',
          defaultActive: 'DOING',
          defaultCompleted: 'DONE',
          transitionStatements: [],
        },
      }),
    };

    mockMenuBuilder = {
      buildStateMenu: jest.fn(),
    } as unknown as jest.Mocked<StateMenuBuilder>;

    taskRenderer = new TaskRenderer(mockPlugin as any, mockMenuBuilder);
  });

  describe('buildCheckbox', () => {
    it('should use defaultCompleted from settings when checkbox is checked', async () => {
      const task: Task = {
        path: 'test.md',
        line: 0,
        rawText: 'TODO Test task',
        indent: '',
        listMarker: '- ',
        text: 'Test task',
        state: 'TODO',
        completed: false,
        priority: null,
        scheduledDate: null,
        deadlineDate: null,
        urgency: null,
        isDailyNote: false,
        dailyNoteDate: null,
      };

      // Create a mock container with a mock checkbox
      const mockCheckbox = {
        checked: false,
        classList: {
          add: jest.fn(),
          remove: jest.fn(),
        },
        addEventListener: jest.fn(),
        addClass: jest.fn(),
      };

      // We'll test the event listener registration directly
      const container = {
        createEl: jest.fn().mockReturnValue(mockCheckbox),
      } as any;

      taskRenderer.buildCheckbox(task, container);

      // Get the event listener that was registered
      expect(mockCheckbox.addEventListener).toHaveBeenCalledWith(
        'change',
        expect.any(Function),
      );

      // Simulate checking the checkbox by calling the handler directly
      const eventHandler = mockCheckbox.addEventListener.mock.calls.find(
        (call: any[]) => call[0] === 'change',
      )[1] as () => Promise<void>;

      // Simulate checkbox being checked
      mockCheckbox.checked = true;
      await eventHandler();

      // Should use 'DONE' from settings (defaultCompleted)
      expect(mockTaskUpdateCoordinator.updateTaskState).toHaveBeenCalledWith(
        task,
        'DONE',
        'task-list',
      );
    });

    it('should use defaultInactive from settings when checkbox is unchecked', async () => {
      const task: Task = {
        path: 'test.md',
        line: 0,
        rawText: 'DONE Test task',
        indent: '',
        listMarker: '- ',
        text: 'Test task',
        state: 'DONE',
        completed: true,
        priority: null,
        scheduledDate: null,
        deadlineDate: null,
        urgency: null,
        isDailyNote: false,
        dailyNoteDate: null,
      };

      const mockCheckbox = {
        checked: true,
        classList: {
          add: jest.fn(),
          remove: jest.fn(),
        },
        addEventListener: jest.fn(),
        addClass: jest.fn(),
      };

      const container = {
        createEl: jest.fn().mockReturnValue(mockCheckbox),
      } as any;

      taskRenderer.buildCheckbox(task, container);

      // Get the event listener
      const eventHandler = mockCheckbox.addEventListener.mock.calls.find(
        (call: any[]) => call[0] === 'change',
      )[1] as () => Promise<void>;

      // Simulate unchecking the checkbox
      mockCheckbox.checked = false;
      await eventHandler();

      // Should use 'TODO' from settings (defaultInactive)
      expect(mockTaskUpdateCoordinator.updateTaskState).toHaveBeenCalledWith(
        task,
        'TODO',
        'task-list',
      );
    });

    it('should use custom state values from settings', async () => {
      // Create settings with custom state values
      const customSettings = createBaseSettings({
        stateTransitions: {
          defaultInactive: 'BACKLOG',
          defaultActive: 'IN_PROGRESS',
          defaultCompleted: 'COMPLETED',
          transitionStatements: [],
        },
      });

      const customPlugin = {
        settings: customSettings,
      };

      const customRenderer = new TaskRenderer(
        customPlugin as any,
        mockMenuBuilder,
      );

      const task: Task = {
        path: 'test.md',
        line: 0,
        rawText: 'BACKLOG Test task',
        indent: '',
        listMarker: '- ',
        text: 'Test task',
        state: 'BACKLOG',
        completed: false,
        priority: null,
        scheduledDate: null,
        deadlineDate: null,
        urgency: null,
        isDailyNote: false,
        dailyNoteDate: null,
      };

      const mockCheckbox = {
        checked: false,
        classList: {
          add: jest.fn(),
          remove: jest.fn(),
        },
        addEventListener: jest.fn(),
        addClass: jest.fn(),
      };

      const container = {
        createEl: jest.fn().mockReturnValue(mockCheckbox),
      } as any;

      customRenderer.buildCheckbox(task, container);

      // Simulate checking the checkbox
      const eventHandler = mockCheckbox.addEventListener.mock.calls.find(
        (call: any[]) => call[0] === 'change',
      )[1] as () => Promise<void>;

      mockCheckbox.checked = true;
      await eventHandler();

      // Should use 'COMPLETED' from custom settings (defaultCompleted)
      expect(mockTaskUpdateCoordinator.updateTaskState).toHaveBeenCalledWith(
        task,
        'COMPLETED',
        'task-list',
      );
    });

    it('should handle empty settings gracefully', () => {
      const pluginWithEmptySettings = {
        settings: undefined,
      };

      const rendererWithEmptySettings = new TaskRenderer(
        pluginWithEmptySettings as any,
        mockMenuBuilder,
      );

      const task: Task = {
        path: 'test.md',
        line: 0,
        rawText: 'TODO Test task',
        indent: '',
        listMarker: '- ',
        text: 'Test task',
        state: 'TODO',
        completed: false,
        priority: null,
        scheduledDate: null,
        deadlineDate: null,
        urgency: null,
        isDailyNote: false,
        dailyNoteDate: null,
      };

      const mockCheckbox = {
        checked: false,
        classList: {
          add: jest.fn(),
          remove: jest.fn(),
        },
        addEventListener: jest.fn(),
        addClass: jest.fn(),
      };

      const container = {
        createEl: jest.fn().mockReturnValue(mockCheckbox),
      } as any;

      // This should not throw
      expect(() => {
        rendererWithEmptySettings.buildCheckbox(task, container);
      }).not.toThrow();
    });
  });
});
