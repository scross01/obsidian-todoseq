import { KeywordManager } from '../src/utils/keyword-manager';
import { TaskStateTransitionManager } from '../src/services/task-state-transition-manager';
import {
  DefaultSettings,
  DefaultStateTransitionSettings,
} from '../src/settings/settings-types';

describe('TaskStateTransitionManager', () => {
  let keywordManager: KeywordManager;

  beforeEach(() => {
    keywordManager = new KeywordManager(DefaultSettings);
  });

  describe('with transition settings', () => {
    it('should use explicit transitions when defined', () => {
      const transitionSettings = {
        ...DefaultStateTransitionSettings,
        transitionStatements: ['TODO -> DOING -> DONE'],
      };
      const manager = new TaskStateTransitionManager(
        keywordManager,
        transitionSettings,
      );

      expect(manager.getNextState('TODO')).toBe('DOING');
      expect(manager.getNextState('DOING')).toBe('DONE');
    });

    it('should handle terminal states', () => {
      const transitionSettings = {
        ...DefaultStateTransitionSettings,
        transitionStatements: ['TODO -> [DONE]'],
      };
      const manager = new TaskStateTransitionManager(
        keywordManager,
        transitionSettings,
      );

      expect(manager.getNextState('TODO')).toBe('DONE');
      expect(manager.getNextState('DONE')).toBe('DONE'); // Terminal, returns itself
      expect(manager.isTerminalState('DONE')).toBe(true);
      expect(manager.isTerminalState('TODO')).toBe(false);
    });

    it('should fall back to defaults for unspecified states', () => {
      const transitionSettings = {
        ...DefaultStateTransitionSettings,
        transitionStatements: ['TODO -> DOING'],
      };
      const manager = new TaskStateTransitionManager(
        keywordManager,
        transitionSettings,
      );

      // LATER has explicit default transition (LATER -> NOW -> DONE), so uses that
      expect(manager.getNextState('LATER')).toBe('NOW');
    });

    it('should not transition archived states', () => {
      const transitionSettings = DefaultStateTransitionSettings;
      const manager = new TaskStateTransitionManager(
        keywordManager,
        transitionSettings,
      );

      expect(manager.getNextState('ARCHIVED')).toBe('ARCHIVED');
    });

    it('should handle cycle behavior - completed to blank', () => {
      const transitionSettings = DefaultStateTransitionSettings;
      const manager = new TaskStateTransitionManager(
        keywordManager,
        transitionSettings,
      );

      expect(manager.getCycleState('DONE')).toBe('');
      expect(manager.getCycleState('CANCELED')).toBe('');
    });

    it('should handle cycle behavior - blank to default inactive', () => {
      const transitionSettings = DefaultStateTransitionSettings;
      const manager = new TaskStateTransitionManager(
        keywordManager,
        transitionSettings,
      );

      expect(manager.getCycleState('')).toBe('TODO');
    });

    it('should use next state for cycle on non-completed states', () => {
      const transitionSettings = {
        ...DefaultStateTransitionSettings,
        transitionStatements: ['TODO -> DOING -> DONE'],
      };
      const manager = new TaskStateTransitionManager(
        keywordManager,
        transitionSettings,
      );

      expect(manager.getCycleState('TODO')).toBe('DOING');
      expect(manager.getCycleState('DOING')).toBe('DONE');
    });
  });

  describe('without transition settings (legacy mode)', () => {
    it('should use legacy maps for built-in keywords', () => {
      const manager = new TaskStateTransitionManager(keywordManager);

      expect(manager.getNextState('TODO')).toBe('DOING');
      expect(manager.getNextState('DOING')).toBe('DONE');
      expect(manager.getNextState('DONE')).toBe('TODO');
    });

    it('should use legacy maps for cycle', () => {
      const manager = new TaskStateTransitionManager(keywordManager);

      expect(manager.getCycleState('TODO')).toBe('DOING');
      expect(manager.getCycleState('DOING')).toBe('DONE');
      expect(manager.getCycleState('DONE')).toBe('');
      expect(manager.getCycleState('')).toBe('TODO');
    });

    it('should return same state for unknown keywords', () => {
      const manager = new TaskStateTransitionManager(keywordManager);

      // Unknown keywords don't transition - stay on the same state
      const unknownKeyword = 'UNKNOWN';
      expect(manager.getNextState(unknownKeyword)).toBe('UNKNOWN');
      expect(manager.getCycleState(unknownKeyword)).toBe('UNKNOWN');
    });

    it('should not support terminal states in legacy mode', () => {
      const manager = new TaskStateTransitionManager(keywordManager);

      expect(manager.isTerminalState('DONE')).toBe(false);
      expect(manager.isTerminalState('TODO')).toBe(false);
    });
  });

  describe('getNextState edge cases', () => {
    it('should handle waiting keywords by transitioning to defaultActive', () => {
      // Add a custom keyword to the waiting group
      const customSettings = {
        ...DefaultSettings,
        additionalWaitingKeywords: ['AWAITING'],
      };
      const customKm = new KeywordManager(customSettings);
      const manager = new TaskStateTransitionManager(customKm, {
        ...DefaultStateTransitionSettings,
        transitionStatements: [],
      });

      // AWAITING is a waiting keyword without an explicit transition
      // Default behavior: waiting -> defaultActive
      expect(manager.getNextState('AWAITING')).toBe('DOING');
    });

    it('should handle terminal state in explicit transitions', () => {
      const manager = new TaskStateTransitionManager(
        keywordManager,
        DefaultStateTransitionSettings,
      );

      // Set up transition where DONE is not terminal (it's not in the default transitions)
      // In legacy mode without custom transitions, DONE goes to TODO via default
      expect(manager.getNextState('DONE')).toBe('TODO');
    });

    it('should handle unknown keywords by returning the same state', () => {
      const manager = new TaskStateTransitionManager(keywordManager);
      expect(manager.getNextState('UNKNOWN_KEYWORD')).toBe('UNKNOWN_KEYWORD');
    });
  });

  describe('getNextCompletedOrArchivedState', () => {
    it('should return the state itself if already archived', () => {
      const manager = new TaskStateTransitionManager(keywordManager);
      expect(manager.getNextCompletedOrArchivedState('ARCHIVED')).toBe(
        'ARCHIVED',
      );
    });

    it('should return the state itself if already completed', () => {
      const manager = new TaskStateTransitionManager(keywordManager);
      expect(manager.getNextCompletedOrArchivedState('DONE')).toBe('DONE');
    });

    it('should follow transition chain from inactive to completed', () => {
      const transitionSettings = {
        ...DefaultStateTransitionSettings,
        transitionStatements: ['TODO -> DOING -> DONE'],
      };
      const manager = new TaskStateTransitionManager(
        keywordManager,
        transitionSettings,
      );

      expect(manager.getNextCompletedOrArchivedState('TODO')).toBe('DONE');
    });

    it('should return defaultCompleted when keyword is unknown', () => {
      const manager = new TaskStateTransitionManager(keywordManager);
      expect(manager.getNextCompletedOrArchivedState('UNKNOWN')).toBe('DONE');
    });

    it('should not loop infinitely on cycles', () => {
      const transitionSettings = {
        ...DefaultStateTransitionSettings,
        transitionStatements: ['A -> B -> A'],
      };
      const customKm = new KeywordManager({
        ...DefaultSettings,
        additionalActiveKeywords: ['A', 'B'],
        additionalInactiveKeywords: [],
      });
      const manager = new TaskStateTransitionManager(
        customKm,
        transitionSettings,
      );

      // A -> B -> A would loop, so it returns defaultCompleted
      expect(manager.getNextCompletedOrArchivedState('A')).toBe('DONE');
    });
  });

  describe('getRecoveredDefault', () => {
    it('should use configured defaults when provided', () => {
      const transitionSettings = {
        ...DefaultStateTransitionSettings,
        defaultInactive: 'BACKLOG',
        defaultActive: 'IN-PROGRESS',
        defaultCompleted: 'COMPLETED',
      };
      const customKm = new KeywordManager({
        ...DefaultSettings,
        additionalInactiveKeywords: ['BACKLOG'],
        additionalActiveKeywords: ['IN-PROGRESS'],
        additionalCompletedKeywords: ['COMPLETED'],
      });
      const manager = new TaskStateTransitionManager(
        customKm,
        transitionSettings,
      );

      // getCycleState('') should return defaultInactive (BACKLOG)
      expect(manager.getCycleState('')).toBe('BACKLOG');

      // BACKLOG is a custom keyword NOT in the default transition statements.
      // So getNextState falls through to getDefaultForState, which uses
      // getRecoveredDefault. Since BACKLOG is inactive, it returns defaultActive = 'IN-PROGRESS'.
      expect(manager.getNextState('BACKLOG')).toBe('IN-PROGRESS');
    });

    it('should fall back to built-in defaults when configured value is empty', () => {
      const transitionSettings = {
        ...DefaultStateTransitionSettings,
        defaultInactive: '',
      };
      const manager = new TaskStateTransitionManager(
        keywordManager,
        transitionSettings,
      );

      expect(manager.getCycleState('')).toBe('TODO');
    });
  });

  describe('isCustomKeyword', () => {
    it('should detect custom keywords', () => {
      const customSettings = {
        ...DefaultSettings,
        additionalActiveKeywords: ['CUSTOM_ACTIVE'],
      };
      const customKm = new KeywordManager(customSettings);
      const manager = new TaskStateTransitionManager(customKm);

      expect((manager as any).isCustomKeyword('CUSTOM_ACTIVE')).toBe(true);
      expect((manager as any).isCustomKeyword('TODO')).toBe(false);
    });
  });

  describe('isCompletedState', () => {
    it('should identify completed states via keyword manager', () => {
      const manager = new TaskStateTransitionManager(keywordManager);

      expect(manager.isCompletedState('DONE')).toBe(true);
      expect(manager.isCompletedState('CANCELED')).toBe(true);
      expect(manager.isCompletedState('CANCELLED')).toBe(true);
      expect(manager.isCompletedState('TODO')).toBe(false);
    });
  });

  describe('empty transition statements', () => {
    it('should handle empty transitionStatements array gracefully', () => {
      const transitionSettings = {
        ...DefaultStateTransitionSettings,
        transitionStatements: [],
      };
      const manager = new TaskStateTransitionManager(
        keywordManager,
        transitionSettings,
      );

      // Should fall back to defaults
      expect(manager.getNextState('TODO')).toBe('DOING');
      expect(manager.getNextState('DOING')).toBe('DONE');
      expect(manager.hasValidationErrors()).toBe(false);
    });
  });

  describe('validation errors', () => {
    it('should report validation errors', () => {
      const transitionSettings = {
        ...DefaultStateTransitionSettings,
        transitionStatements: ['INVALID -> DOING'],
      };
      const manager = new TaskStateTransitionManager(
        keywordManager,
        transitionSettings,
      );

      expect(manager.hasValidationErrors()).toBe(true);
      const errors = manager.getValidationErrors();
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].type).toBe('invalid-keyword');
    });

    it('should have no validation errors for valid settings', () => {
      const manager = new TaskStateTransitionManager(
        keywordManager,
        DefaultStateTransitionSettings,
      );

      expect(manager.hasValidationErrors()).toBe(false);
      expect(manager.getValidationErrors()).toHaveLength(0);
    });

    it('should have no validation errors in legacy mode', () => {
      const manager = new TaskStateTransitionManager(keywordManager);

      expect(manager.hasValidationErrors()).toBe(false);
      expect(manager.getValidationErrors()).toHaveLength(0);
    });
  });

  describe('canTransition', () => {
    it('should return false for archived states', () => {
      const manager = new TaskStateTransitionManager(keywordManager);

      expect(manager.canTransition('ARCHIVED')).toBe(false);
    });

    it('should return true for non-archived states', () => {
      const manager = new TaskStateTransitionManager(keywordManager);

      expect(manager.canTransition('TODO')).toBe(true);
      expect(manager.canTransition('DONE')).toBe(true);
      expect(manager.canTransition('DOING')).toBe(true);
    });
  });

  describe('isArchivedState', () => {
    it('should identify archived states', () => {
      const manager = new TaskStateTransitionManager(keywordManager);

      expect(manager.isArchivedState('ARCHIVED')).toBe(true);
    });

    it('should return false for non-archived states', () => {
      const manager = new TaskStateTransitionManager(keywordManager);

      expect(manager.isArchivedState('TODO')).toBe(false);
      expect(manager.isArchivedState('DONE')).toBe(false);
    });
  });
});
