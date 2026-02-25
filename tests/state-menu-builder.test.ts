import { StateMenuBuilder } from '../src/view/components/state-menu-builder';
import { TodoTrackerSettings } from '../src/settings/settings-types';
import {
  BUILTIN_ACTIVE_KEYWORDS,
  BUILTIN_INACTIVE_KEYWORDS,
  BUILTIN_WAITING_KEYWORDS,
  BUILTIN_COMPLETED_KEYWORDS,
  BUILTIN_ARCHIVED_KEYWORDS,
} from '../src/utils/constants';
import { createBaseSettings } from './helpers/test-helper';

describe('StateMenuBuilder', () => {
  let mockSettings: TodoTrackerSettings;
  let mockPlugin: { settings: TodoTrackerSettings };

  beforeEach(() => {
    // Create default settings
    mockSettings = createBaseSettings();
    // Create mock plugin with settings
    mockPlugin = { settings: mockSettings };
  });

  describe('constructor', () => {
    test('should initialize with plugin', () => {
      const builder = new StateMenuBuilder(mockPlugin as any);
      expect(builder).toBeInstanceOf(StateMenuBuilder);
    });
  });

  describe('getKeywordGroups', () => {
    test('should return five keyword groups with correct effective keywords', () => {
      // Arrange
      const builder = new StateMenuBuilder(mockPlugin as any);

      // Act
      const result = (builder as any).getKeywordGroups();

      // Assert
      expect(result).toHaveLength(5);

      const [active, inactive, waiting, completed, archived] = result;

      expect(active.name).toBe('Active');
      expect(active.states).toEqual([...BUILTIN_ACTIVE_KEYWORDS]);

      expect(inactive.name).toBe('Inactive');
      expect(inactive.states).toEqual([...BUILTIN_INACTIVE_KEYWORDS]);

      expect(waiting.name).toBe('Waiting');
      expect(waiting.states).toEqual([...BUILTIN_WAITING_KEYWORDS]);

      expect(completed.name).toBe('Completed');
      expect(completed.states).toEqual([...BUILTIN_COMPLETED_KEYWORDS]);

      expect(archived.name).toBe('Archived');
      expect(archived.states).toEqual([...BUILTIN_ARCHIVED_KEYWORDS]);
    });

    test('should include custom keywords from settings', () => {
      // Arrange
      const settingsWithCustom = {
        ...mockSettings,
        additionalActiveKeywords: ['STARTED'],
        additionalInactiveKeywords: ['PLANNED'],
        additionalWaitingKeywords: ['BLOCKED'],
        additionalCompletedKeywords: ['ARCHIVED'],
      };
      const pluginWithCustom = { settings: settingsWithCustom };
      const builder = new StateMenuBuilder(pluginWithCustom as any);

      // Act
      const result = (builder as any).getKeywordGroups();

      // Assert
      const [active, inactive, waiting, completed] = result;

      expect(active.states).toContain('STARTED');
      expect(inactive.states).toContain('PLANNED');
      expect(waiting.states).toContain('BLOCKED');
      expect(completed.states).toContain('ARCHIVED');
    });
  });

  describe('getSelectableStatesForMenu', () => {
    test('should return five groups with all states when current state is unknown', () => {
      // Arrange
      const builder = new StateMenuBuilder(mockPlugin as any);

      // Act
      const groups = builder.getSelectableStatesForMenu('UNKNOWN');

      // Assert
      expect(groups).toHaveLength(5);

      const [
        activeGroup,
        inactiveGroup,
        waitingGroup,
        completedGroup,
        archivedGroup,
      ] = groups;

      expect(activeGroup.group).toBe('Active');
      expect(activeGroup.states).toEqual([...BUILTIN_ACTIVE_KEYWORDS]);

      expect(inactiveGroup.group).toBe('Inactive');
      expect(inactiveGroup.states).toEqual([...BUILTIN_INACTIVE_KEYWORDS]);

      expect(waitingGroup.group).toBe('Waiting');
      expect(waitingGroup.states).toEqual([...BUILTIN_WAITING_KEYWORDS]);

      expect(completedGroup.group).toBe('Completed');
      expect(completedGroup.states).toEqual([...BUILTIN_COMPLETED_KEYWORDS]);

      expect(archivedGroup.group).toBe('Archived');
      expect(archivedGroup.states).toEqual([...BUILTIN_ARCHIVED_KEYWORDS]);
    });

    test('should exclude current state from menu options', () => {
      // Arrange
      const builder = new StateMenuBuilder(mockPlugin as any);
      const currentState = 'TODO';

      // Act
      const groups = builder.getSelectableStatesForMenu(currentState);

      // Assert
      const inactiveGroup = groups.find((g) => g.group === 'Inactive');
      expect(inactiveGroup?.states).not.toContain(currentState);

      // Other groups should still have their keywords
      const activeGroup = groups.find((g) => g.group === 'Active');
      expect(activeGroup?.states).toContain('DOING');
    });

    test('should handle current state being a completed state', () => {
      // Arrange
      const builder = new StateMenuBuilder(mockPlugin as any);
      const currentState = 'DONE';

      // Act
      const groups = builder.getSelectableStatesForMenu(currentState);

      // Assert
      const completedGroup = groups.find((g) => g.group === 'Completed');
      expect(completedGroup?.states).not.toContain(currentState);
      expect(completedGroup?.states).toContain('CANCELLED');
      expect(completedGroup?.states).toContain('CANCELED');
    });

    test('should include custom keywords in correct groups', () => {
      // Arrange
      const settingsWithCustom = {
        ...mockSettings,
        additionalActiveKeywords: ['STARTED'],
        additionalInactiveKeywords: ['PLANNED'],
        additionalWaitingKeywords: ['BLOCKED'],
        additionalCompletedKeywords: ['ARCHIVED'],
      };
      const pluginWithCustom = { settings: settingsWithCustom };
      const builder = new StateMenuBuilder(pluginWithCustom as any);

      // Act
      const groups = builder.getSelectableStatesForMenu('UNKNOWN');

      // Assert
      const activeGroup = groups.find((g) => g.group === 'Active');
      expect(activeGroup?.states).toContain('STARTED');

      const inactiveGroup = groups.find((g) => g.group === 'Inactive');
      expect(inactiveGroup?.states).toContain('PLANNED');

      const waitingGroup = groups.find((g) => g.group === 'Waiting');
      expect(waitingGroup?.states).toContain('BLOCKED');

      const completedGroup = groups.find((g) => g.group === 'Completed');
      expect(completedGroup?.states).toContain('ARCHIVED');
    });

    test('should place built-in keywords before custom keywords', () => {
      // Arrange
      const settingsWithCustom = {
        ...mockSettings,
        additionalActiveKeywords: ['AAA', 'ZZZ'], // Alphabetically before/after built-ins
      };
      const pluginWithCustom = { settings: settingsWithCustom };
      const builder = new StateMenuBuilder(pluginWithCustom as any);

      // Act
      const groups = builder.getSelectableStatesForMenu('UNKNOWN');

      // Assert
      const activeGroup = groups.find((g) => g.group === 'Active');
      expect(activeGroup?.states).toBeDefined();

      // Built-in keywords should come first
      const activeStates = activeGroup?.states ?? [];
      const lastBuiltinIndex = Math.max(
        activeStates.indexOf('DOING'),
        activeStates.indexOf('NOW'),
        activeStates.indexOf('IN-PROGRESS'),
      );
      const firstCustomIndex = Math.min(
        activeStates.indexOf('AAA'),
        activeStates.indexOf('ZZZ'),
      );

      expect(lastBuiltinIndex).toBeLessThan(firstCustomIndex);
    });

    test('should deduplicate states from all sources', () => {
      // Arrange
      // Add a keyword that already exists in defaults
      const duplicateKeywords = ['TODO', 'PLANNED'];
      const settingsWithDuplicates = {
        ...mockSettings,
        additionalInactiveKeywords: duplicateKeywords,
      };
      const pluginWithDuplicates = { settings: settingsWithDuplicates };
      const builder = new StateMenuBuilder(pluginWithDuplicates as any);

      // Act
      const groups = builder.getSelectableStatesForMenu('UNKNOWN');

      // Assert
      const inactiveGroup = groups.find((g) => g.group === 'Inactive');
      // Should only have one "TODO" entry
      const todoCount = (inactiveGroup?.states ?? []).filter(
        (state) => state === 'TODO',
      ).length;
      expect(todoCount).toBe(1);
      // Should still have PLANNED
      expect(inactiveGroup?.states).toContain('PLANNED');
    });

    test('should filter out empty states', () => {
      // Arrange
      const settingsWithEmpty = {
        ...mockSettings,
        additionalInactiveKeywords: ['', 'PLANNED', ''],
      };
      const pluginWithEmpty = { settings: settingsWithEmpty };
      const builder = new StateMenuBuilder(pluginWithEmpty as any);

      // Act
      const groups = builder.getSelectableStatesForMenu('UNKNOWN');

      // Assert
      const inactiveGroup = groups.find((g) => g.group === 'Inactive');
      expect(inactiveGroup?.states).not.toContain('');
      expect(inactiveGroup?.states).toContain('PLANNED');
    });

    test('should only show groups that have available states', () => {
      // Arrange
      const builder = new StateMenuBuilder(mockPlugin as any);

      // Act - Use a state that removes all items from one group
      // If we set current to all waiting keywords, that group should not appear
      const groupsWithAllWaiting = builder.getSelectableStatesForMenu('WAIT');

      // Assert - Waiting group should only have WAITING left
      const waitingGroup = groupsWithAllWaiting.find(
        (g) => g.group === 'Waiting',
      );
      expect(waitingGroup?.states).toEqual(['WAITING']);

      // Test with single-keyword group emptied
      const settingsSingleWaiting = {
        ...mockSettings,
        additionalWaitingKeywords: ['WAIT'], // Add WAIT as custom too
      };
      const pluginSingleWaiting = { settings: settingsSingleWaiting };
      const builderSingle = new StateMenuBuilder(pluginSingleWaiting as any);
      const groupsEmpty = builderSingle.getSelectableStatesForMenu('WAIT');

      // Waiting group should only have WAITING (WAIT is excluded as current)
      const waitingGroupEmpty = groupsEmpty.find((g) => g.group === 'Waiting');
      expect(waitingGroupEmpty?.states).toEqual(['WAITING']);
    });
  });

  describe('buildStateMenu', () => {
    test('should create a menu with all state groups and items', () => {
      // Arrange
      const builder = new StateMenuBuilder(mockPlugin as any);
      const onStateSelected = jest.fn();

      // Act
      const menu = builder.buildStateMenu('UNKNOWN', onStateSelected);

      // Assert
      expect(menu).toBeDefined();
    });

    test('should call getSelectableStatesForMenu with correct parameter', () => {
      // Arrange
      const builder = new StateMenuBuilder(mockPlugin as any);
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
      const testBuilder = new StateMenuBuilder(mockPlugin as any);

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
