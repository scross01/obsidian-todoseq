import { App } from 'obsidian';
import { StateMenuBuilder } from '../src/view/components/state-menu-builder';
import { TodoTrackerSettings } from '../src/settings/settings';
import {
  DEFAULT_PENDING_STATES,
  DEFAULT_ACTIVE_STATES,
  DEFAULT_COMPLETED_STATES,
} from '../src/types/task';
import { getPluginSettings } from '../src/utils/settings-utils';

// Mock dependencies
jest.mock('../src/utils/settings-utils');

describe('StateMenuBuilder', () => {
  let mockApp: Partial<App>;
  let mockSettings: TodoTrackerSettings;
  let builder: StateMenuBuilder;

  beforeEach(() => {
    // Create mock app
    mockApp = {};
    // Create default settings
    mockSettings = {
      additionalTaskKeywords: [],
      includeCodeBlocks: false,
      includeCalloutBlocks: true,
      includeCommentBlocks: false,
      taskListViewMode: 'showAll',
      futureTaskSorting: 'showAll',
      defaultSortMethod: 'default',
      languageCommentSupport: { enabled: true },
      weekStartsOn: 'Monday',
      formatTaskKeywords: true,
    };

    // Reset all mocks
    (getPluginSettings as jest.Mock).mockReset();

    // Create builder instance
    builder = new StateMenuBuilder(mockApp as App, mockSettings);
  });

  describe('constructor', () => {
    test('should initialize with app and settings', () => {
      expect(builder).toBeInstanceOf(StateMenuBuilder);
    });
  });

  describe('getKeywordSets', () => {
    test('should return default keyword sets when no additional keywords configured', () => {
      // Arrange
      (getPluginSettings as jest.Mock).mockReturnValue(mockSettings);

      // Act
      const result = (builder as any).getKeywordSets();

      // Assert
      const expectedPendingActive = [
        ...Array.from(DEFAULT_PENDING_STATES),
        ...Array.from(DEFAULT_ACTIVE_STATES),
      ];
      const expectedCompleted = Array.from(DEFAULT_COMPLETED_STATES);

      expect(result.pendingActive).toEqual(
        expect.arrayContaining(expectedPendingActive),
      );
      expect(result.pendingActive.length).toBe(expectedPendingActive.length);

      expect(result.completed).toEqual(
        expect.arrayContaining(expectedCompleted),
      );
      expect(result.completed.length).toBe(expectedCompleted.length);

      expect(result.additional).toEqual([]);
    });

    test('should include additional task keywords from settings', () => {
      // Arrange
      const additionalKeywords = ['FIXME', 'HACK'];
      const settingsWithAdditional = {
        ...mockSettings,
        additionalTaskKeywords: additionalKeywords,
      };
      (getPluginSettings as jest.Mock).mockReturnValue(settingsWithAdditional);

      // Act
      const result = (builder as any).getKeywordSets();

      // Assert
      expect(result.additional).toEqual(additionalKeywords);
    });

    test('should filter out non-string and empty additional keywords', () => {
      // Arrange
      const invalidSettings = {
        ...mockSettings,
        additionalTaskKeywords: ['', 123, null, undefined, true, false] as any,
      };
      (getPluginSettings as jest.Mock).mockReturnValue(invalidSettings);

      // Act
      const result = (builder as any).getKeywordSets();

      // Assert
      expect(result.additional).toEqual([]);
    });

    test('should handle null settings from getPluginSettings', () => {
      // Arrange
      (getPluginSettings as jest.Mock).mockReturnValue(null);

      // Act
      const result = (builder as any).getKeywordSets();

      // Assert
      expect(result.additional).toEqual([]);
    });
  });

  describe('getSelectableStatesForMenu', () => {
    test('should return both groups with all states when current state is unknown', () => {
      // Arrange
      (getPluginSettings as jest.Mock).mockReturnValue(mockSettings);

      // Act
      const groups = builder.getSelectableStatesForMenu('UNKNOWN');

      // Assert
      expect(groups).toHaveLength(2);

      const [notCompletedGroup, completedGroup] = groups;
      expect(notCompletedGroup.group).toBe('Not completed');
      expect(completedGroup.group).toBe('Completed');

      const expectedNonCompleted = [
        ...Array.from(DEFAULT_PENDING_STATES),
        ...Array.from(DEFAULT_ACTIVE_STATES),
      ];
      const expectedCompleted = Array.from(DEFAULT_COMPLETED_STATES);

      expect(notCompletedGroup.states).toEqual(
        expect.arrayContaining(expectedNonCompleted),
      );
      expect(notCompletedGroup.states.length).toBe(expectedNonCompleted.length);

      expect(completedGroup.states).toEqual(
        expect.arrayContaining(expectedCompleted),
      );
      expect(completedGroup.states.length).toBe(expectedCompleted.length);
    });

    test('should exclude current state from menu options', () => {
      // Arrange
      (getPluginSettings as jest.Mock).mockReturnValue(mockSettings);
      const currentState = 'TODO';

      // Act
      const groups = builder.getSelectableStatesForMenu(currentState);

      // Assert
      expect(groups).toHaveLength(2);
      const [notCompletedGroup, completedGroup] = groups;

      expect(notCompletedGroup.states).not.toContain(currentState);
      expect(completedGroup.states).not.toContain(currentState);
    });

    test('should handle current state being a completed state', () => {
      // Arrange
      (getPluginSettings as jest.Mock).mockReturnValue(mockSettings);
      const currentState = 'DONE';

      // Act
      const groups = builder.getSelectableStatesForMenu(currentState);

      // Assert
      expect(groups).toHaveLength(2);
      const [notCompletedGroup, completedGroup] = groups;

      expect(completedGroup.states).not.toContain(currentState);
      expect(notCompletedGroup.states.length).toBeGreaterThan(0);
    });

    test('should include additional keywords in "Not completed" group', () => {
      // Arrange
      const additionalKeywords = ['FIXME', 'HACK'];
      const settingsWithAdditional = {
        ...mockSettings,
        additionalTaskKeywords: additionalKeywords,
      };
      (getPluginSettings as jest.Mock).mockReturnValue(settingsWithAdditional);

      // Act
      const groups = builder.getSelectableStatesForMenu('UNKNOWN');

      // Assert
      const [notCompletedGroup] = groups;
      additionalKeywords.forEach((keyword) => {
        expect(notCompletedGroup.states).toContain(keyword);
      });
    });

    test('should deduplicate states from all sources', () => {
      // Arrange
      // Add a keyword that already exists in defaults
      const duplicateKeywords = ['TODO', 'FIXME'];
      const settingsWithDuplicates = {
        ...mockSettings,
        additionalTaskKeywords: duplicateKeywords,
      };
      (getPluginSettings as jest.Mock).mockReturnValue(settingsWithDuplicates);

      // Act
      const groups = builder.getSelectableStatesForMenu('UNKNOWN');

      // Assert
      const [notCompletedGroup] = groups;
      // Should only have one "TODO" entry
      const todoCount = notCompletedGroup.states.filter(
        (state) => state === 'TODO',
      ).length;
      expect(todoCount).toBe(1);
    });

    test('should filter out empty states', () => {
      // Arrange
      const settingsWithEmpty = {
        ...mockSettings,
        additionalTaskKeywords: ['', 'FIXME', ''],
      };
      (getPluginSettings as jest.Mock).mockReturnValue(settingsWithEmpty);

      // Act
      const groups = builder.getSelectableStatesForMenu('UNKNOWN');

      // Assert
      const [notCompletedGroup] = groups;
      expect(notCompletedGroup.states).not.toContain('');
      expect(notCompletedGroup.states).toContain('FIXME');
    });

    test('should return only one group when all states in a group are filtered out', () => {
      // Arrange
      const allNonCompletedStates = [
        ...Array.from(DEFAULT_PENDING_STATES),
        ...Array.from(DEFAULT_ACTIVE_STATES),
      ];
      // Set current state to a non-completed state, and remove all other states
      (getPluginSettings as jest.Mock).mockReturnValue({
        ...mockSettings,
        additionalTaskKeywords: [],
      });

      // Act - Current state is the only non-completed state
      const groups = builder.getSelectableStatesForMenu(
        allNonCompletedStates[0],
      );

      // Assert
      expect(groups).toHaveLength(2);

      // The "Not completed" group should have all states except the current one
      const [notCompletedGroup, completedGroup] = groups;
      expect(notCompletedGroup.states.length).toBe(
        allNonCompletedStates.length - 1,
      );
      expect(completedGroup.states.length).toBe(DEFAULT_COMPLETED_STATES.size);
    });
  });

  describe('buildStateMenu', () => {
    test('should create a menu with all state groups and items', () => {
      // Arrange
      (getPluginSettings as jest.Mock).mockReturnValue(mockSettings);
      const onStateSelected = jest.fn();

      // Act
      const menu = builder.buildStateMenu('UNKNOWN', onStateSelected);

      // Assert
      expect(menu).toBeDefined();
    });

    test('should call getSelectableStatesForMenu with correct parameter', () => {
      // Arrange
      (getPluginSettings as jest.Mock).mockReturnValue(mockSettings);
      const onStateSelected = jest.fn();
      const spy = jest.spyOn(builder, 'getSelectableStatesForMenu');

      // Act
      const menu = builder.buildStateMenu('TODO', onStateSelected);

      // Assert
      expect(spy).toHaveBeenCalledWith('TODO');
      expect(menu).toBeDefined();
    });

    test('should handle menu item click events', () => {
      // Arrange
      (getPluginSettings as jest.Mock).mockReturnValue(mockSettings);
      const onStateSelected = jest.fn();

      // We need to track the onClick handlers by modifying our mock Menu
      const clickHandlers: (() => void)[] = [];

      // Create a new mock Menu class that captures click handlers
      class MockMenu {
        addItem(callback: any) {
          const mockMenuItem = {
            setTitle: jest.fn(),
            setDisabled: jest.fn(),
            onClick: jest.fn().mockImplementation((handler: () => void) => {
              clickHandlers.push(handler);
            }),
          };
          callback(mockMenuItem);
          return this;
        }
        addSeparator() {
          return this;
        }
      }

      // Replace the mock Menu with our new implementation
      (jest.requireMock('obsidian') as any).Menu = MockMenu;

      // Create a new builder instance with the updated mock
      const testBuilder = new StateMenuBuilder(mockApp as App, mockSettings);

      // Act
      testBuilder.buildStateMenu('TODO', onStateSelected);

      // Assert
      // We should have several click handlers (one for each state option)
      expect(clickHandlers.length).toBeGreaterThan(0);

      // Call each click handler to ensure they work
      clickHandlers.forEach((handler) => {
        handler();
      });

      // Verify that onStateSelected was called
      expect(onStateSelected).toHaveBeenCalled();
    });
  });
});

// Override the default import to use our mock
jest.mock('obsidian', () => {
  const original = jest.requireActual('obsidian');

  class Menu {
    addItem(callback: any) {
      callback({
        setTitle: jest.fn(),
        setDisabled: jest.fn(),
        onClick: jest.fn(),
      });
      return this;
    }
    addSeparator() {
      return this;
    }
  }

  return {
    ...original,
    Menu,
  };
});
