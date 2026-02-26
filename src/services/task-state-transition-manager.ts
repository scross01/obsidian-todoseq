import { KeywordManager } from '../utils/keyword-manager';
import { TransitionParser, TransitionError } from './transition-parser';
import type { StateTransitionSettings } from '../settings/settings-types';

const DEFAULT_TRANSITION_STATEMENTS = [
  'TODO -> DOING -> DONE',
  '(WAIT | WAITING) -> IN-PROGRESS',
  'LATER -> NOW -> DONE',
];

export class TaskStateTransitionManager {
  private parsedTransitions: Map<string, string>;
  private transitionErrors: TransitionError[];
  private transitionSettings?: StateTransitionSettings;

  constructor(
    private keywordManager: KeywordManager,
    transitionSettings?: StateTransitionSettings,
  ) {
    this.transitionSettings = transitionSettings;
    const parser = new TransitionParser(keywordManager);

    // Check if we have valid transition statements
    const hasValidStatements =
      transitionSettings?.transitionStatements &&
      transitionSettings.transitionStatements.length > 0;

    if (hasValidStatements) {
      const result = parser.parse(transitionSettings.transitionStatements);
      this.parsedTransitions = result.transitions;
      this.transitionErrors = result.errors;
    } else {
      // Use default transition statements
      const result = parser.parse(DEFAULT_TRANSITION_STATEMENTS);
      this.parsedTransitions = result.transitions;
      this.transitionErrors = result.errors;
    }
  }

  private isCustomKeyword(keyword: string): boolean {
    return (
      this.keywordManager.isKnownKeyword(keyword) &&
      !KeywordManager.isBuiltin(keyword)
    );
  }

  private isKnownKeyword(keyword: string): boolean {
    return this.keywordManager.isKnownKeyword(keyword);
  }

  getNextState(current: string): string {
    if (this.keywordManager.isArchived(current)) {
      return current;
    }

    // Unknown keywords don't transition - stay on the same state
    if (!this.isKnownKeyword(current)) {
      return current;
    }

    // Check for explicit transition
    const explicitNextState = this.parsedTransitions.get(current);
    if (explicitNextState !== undefined) {
      // Terminal state: return current (no transition)
      if (explicitNextState === current) {
        return current;
      }

      return explicitNextState;
    }

    // Fall back to default based on group (works for both built-in and custom keywords)
    return this.getDefaultForState(current);
  }

  getCycleState(current: string): string {
    if (this.keywordManager.isArchived(current)) {
      return current;
    }

    // Empty string is not a task keyword - treat as no keyword
    if (current === '') {
      return this.getRecoveredDefault('defaultInactive');
    }

    // Unknown keywords don't transition - stay on the same state
    if (!this.isKnownKeyword(current)) {
      return current;
    }

    // Special cycle behavior - completed goes to blank (no keyword)
    if (this.keywordManager.isCompleted(current)) {
      return '';
    }

    // Use next state logic for other states (works for both built-in and custom keywords)
    return this.getNextState(current);
  }

  private getDefaultForState(current: string): string {
    const group = this.keywordManager.getGroup(current);

    // Keywords not in any group should not transition (handled earlier)
    // For defined keywords not in the transition map:
    // Inactive -> default Active
    // Active -> default Completed
    // Waiting -> default Active
    // Completed -> default Inactive
    switch (group) {
      case 'inactiveKeywords':
        return this.getRecoveredDefault('defaultActive');
      case 'activeKeywords':
        return this.getRecoveredDefault('defaultCompleted');
      case 'waitingKeywords':
        return this.getRecoveredDefault('defaultActive');
      case 'completedKeywords':
        return this.getRecoveredDefault('defaultInactive');
      default:
        // Should not reach here - unknown keywords handled earlier
        return current;
    }
  }

  private getRecoveredDefault(
    settingKey: keyof Pick<
      StateTransitionSettings,
      'defaultInactive' | 'defaultActive' | 'defaultCompleted'
    >,
  ): string {
    // First try to use the configured default value if it's not empty
    if (this.transitionSettings) {
      const configuredValue = this.transitionSettings[settingKey];
      if (configuredValue && configuredValue.trim() !== '') {
        return configuredValue.trim().toUpperCase();
      }
    }
    // Fall back to built-in defaults
    switch (settingKey) {
      case 'defaultInactive':
        return 'TODO';
      case 'defaultActive':
        return 'DOING';
      case 'defaultCompleted':
        return 'DONE';
    }
  }

  canTransition(state: string): boolean {
    return !this.keywordManager.isArchived(state);
  }

  isArchivedState(state: string): boolean {
    return this.keywordManager.isArchived(state);
  }

  /**
   * Get validation errors from parsing transition statements.
   */
  getValidationErrors(): TransitionError[] {
    return this.transitionErrors;
  }

  /**
   * Check if there are any validation errors.
   */
  hasValidationErrors(): boolean {
    return this.transitionErrors.length > 0;
  }

  /**
   * Check if a state is a terminal state (transitions to itself).
   */
  isTerminalState(state: string): boolean {
    return TransitionParser.isTerminalState(state, this.parsedTransitions);
  }
}
