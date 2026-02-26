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

      // LATER is inactive, should use default active (DOING)
      expect(manager.getNextState('LATER')).toBe('DOING');
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
