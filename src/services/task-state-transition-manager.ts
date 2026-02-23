import { KeywordManager } from '../utils/keyword-manager';

const NEXT_STATE_MAP = new Map<string, string>([
  ['TODO', 'DOING'],
  ['DOING', 'DONE'],
  ['DONE', 'TODO'],
  ['LATER', 'NOW'],
  ['NOW', 'DONE'],
  ['WAIT', 'IN-PROGRESS'],
  ['WAITING', 'IN-PROGRESS'],
  ['IN-PROGRESS', 'DONE'],
  ['CANCELED', 'TODO'],
  ['CANCELLED', 'TODO'],
]);

const CYCLE_STATE_MAP = new Map<string, string>([
  ['TODO', 'DOING'],
  ['DOING', 'DONE'],
  ['DONE', ''],
  ['LATER', 'NOW'],
  ['NOW', 'DONE'],
  ['WAIT', 'IN-PROGRESS'],
  ['WAITING', 'IN-PROGRESS'],
  ['IN-PROGRESS', 'DONE'],
  ['CANCELED', 'TODO'],
  ['CANCELLED', 'TODO'],
  ['', 'TODO'],
]);

export class TaskStateTransitionManager {
  constructor(private keywordManager: KeywordManager) {}

  private isCustomKeyword(keyword: string): boolean {
    return (
      this.keywordManager.isKnownKeyword(keyword) &&
      !KeywordManager.isBuiltin(keyword)
    );
  }

  getNextState(current: string): string {
    if (this.keywordManager.isArchived(current)) {
      return current;
    }

    if (this.isCustomKeyword(current)) {
      return 'DONE';
    }

    return NEXT_STATE_MAP.get(current) ?? 'TODO';
  }

  getCycleState(current: string): string {
    if (this.keywordManager.isArchived(current)) {
      return current;
    }

    if (current === '') {
      return 'TODO';
    }

    if (this.isCustomKeyword(current)) {
      return 'DONE';
    }

    const nextState = CYCLE_STATE_MAP.get(current);
    return nextState !== undefined ? nextState : 'TODO';
  }

  canTransition(state: string): boolean {
    return !this.keywordManager.isArchived(state);
  }

  isArchivedState(state: string): boolean {
    return this.keywordManager.isArchived(state);
  }
}
