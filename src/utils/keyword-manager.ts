import {
  BUILTIN_ACTIVE_KEYWORDS,
  BUILTIN_INACTIVE_KEYWORDS,
  BUILTIN_WAITING_KEYWORDS,
  BUILTIN_COMPLETED_KEYWORDS,
  BUILTIN_ARCHIVED_KEYWORDS,
} from './constants';
import { KeywordGroup } from '../types/task';

type KeywordSettings = {
  additionalInactiveKeywords?: string[];
  additionalActiveKeywords?: string[];
  additionalWaitingKeywords?: string[];
  additionalCompletedKeywords?: string[];
  additionalArchivedKeywords?: string[];
};

const BUILTIN_COMPLETED_SET = new Set<string>(BUILTIN_COMPLETED_KEYWORDS);
const BUILTIN_ACTIVE_SET = new Set<string>(BUILTIN_ACTIVE_KEYWORDS);
const BUILTIN_WAITING_SET = new Set<string>(BUILTIN_WAITING_KEYWORDS);
const BUILTIN_INACTIVE_SET = new Set<string>(BUILTIN_INACTIVE_KEYWORDS);
const BUILTIN_ARCHIVED_SET = new Set<string>(BUILTIN_ARCHIVED_KEYWORDS);

export class KeywordManager {
  constructor(private settings: KeywordSettings) {}

  static getBuiltinCompletedSet(): Set<string> {
    return BUILTIN_COMPLETED_SET;
  }

  static getBuiltinActiveSet(): Set<string> {
    return BUILTIN_ACTIVE_SET;
  }

  static getBuiltinWaitingSet(): Set<string> {
    return BUILTIN_WAITING_SET;
  }

  static getBuiltinInactiveSet(): Set<string> {
    return BUILTIN_INACTIVE_SET;
  }

  static getBuiltinArchivedSet(): Set<string> {
    return BUILTIN_ARCHIVED_SET;
  }

  static filterCustomKeywords(allKeywords: string[]): string[] {
    return allKeywords.filter(
      (k) =>
        !BUILTIN_COMPLETED_SET.has(k) &&
        !BUILTIN_ACTIVE_SET.has(k) &&
        !BUILTIN_WAITING_SET.has(k) &&
        !BUILTIN_INACTIVE_SET.has(k),
    );
  }

  static isBuiltin(keyword: string): boolean {
    return (
      BUILTIN_COMPLETED_SET.has(keyword) ||
      BUILTIN_ACTIVE_SET.has(keyword) ||
      BUILTIN_WAITING_SET.has(keyword) ||
      BUILTIN_INACTIVE_SET.has(keyword) ||
      BUILTIN_ARCHIVED_SET.has(keyword)
    );
  }

  private get completedKeywords(): Set<string> {
    return new Set([
      ...BUILTIN_COMPLETED_KEYWORDS,
      ...(this.settings.additionalCompletedKeywords ?? []),
    ]);
  }

  private get activeKeywords(): Set<string> {
    return new Set([
      ...BUILTIN_ACTIVE_KEYWORDS,
      ...(this.settings.additionalActiveKeywords ?? []),
    ]);
  }

  private get waitingKeywords(): Set<string> {
    return new Set([
      ...BUILTIN_WAITING_KEYWORDS,
      ...(this.settings.additionalWaitingKeywords ?? []),
    ]);
  }

  private get inactiveKeywords(): Set<string> {
    return new Set([
      ...BUILTIN_INACTIVE_KEYWORDS,
      ...(this.settings.additionalInactiveKeywords ?? []),
    ]);
  }

  private get archivedKeywords(): Set<string> {
    return new Set([
      ...BUILTIN_ARCHIVED_KEYWORDS,
      ...(this.settings.additionalArchivedKeywords ?? []),
    ]);
  }

  getAllKeywords(): string[] {
    const all = [
      ...this.activeKeywords,
      ...this.inactiveKeywords,
      ...this.waitingKeywords,
      ...this.completedKeywords,
      ...this.archivedKeywords,
    ];
    return Array.from(new Set(all));
  }

  isCompleted(keyword: string): boolean {
    return this.completedKeywords.has(keyword);
  }

  isActive(keyword: string): boolean {
    return this.activeKeywords.has(keyword);
  }

  isWaiting(keyword: string): boolean {
    return this.waitingKeywords.has(keyword);
  }

  isInactive(keyword: string): boolean {
    return this.inactiveKeywords.has(keyword);
  }

  isArchived(keyword: string): boolean {
    return this.archivedKeywords.has(keyword);
  }

  getGroup(keyword: string): KeywordGroup | 'inactiveKeywords' | null {
    if (this.inactiveKeywords.has(keyword)) {
      return 'inactiveKeywords';
    }

    if (this.activeKeywords.has(keyword)) {
      return 'activeKeywords';
    }

    if (this.waitingKeywords.has(keyword)) {
      return 'waitingKeywords';
    }

    if (this.completedKeywords.has(keyword)) {
      return 'completedKeywords';
    }

    if (this.archivedKeywords.has(keyword)) {
      return 'archivedKeywords';
    }

    return null;
  }

  getCompletedSet(): Set<string> {
    return this.completedKeywords;
  }

  getActiveSet(): Set<string> {
    return this.activeKeywords;
  }

  getWaitingSet(): Set<string> {
    return this.waitingKeywords;
  }

  getInactiveSet(): Set<string> {
    return this.inactiveKeywords;
  }

  getArchivedSet(): Set<string> {
    return this.archivedKeywords;
  }

  getCustomCompletedSet(): Set<string> {
    return new Set(this.settings.additionalCompletedKeywords ?? []);
  }

  getCustomActiveSet(): Set<string> {
    return new Set(this.settings.additionalActiveKeywords ?? []);
  }

  getCustomWaitingSet(): Set<string> {
    return new Set(this.settings.additionalWaitingKeywords ?? []);
  }

  getCustomInactiveSet(): Set<string> {
    return new Set(this.settings.additionalInactiveKeywords ?? []);
  }

  getCustomArchivedSet(): Set<string> {
    return new Set(this.settings.additionalArchivedKeywords ?? []);
  }

  getBuiltinActiveKeywords(): readonly ['NOW', 'DOING', 'IN-PROGRESS'] {
    return BUILTIN_ACTIVE_KEYWORDS;
  }

  getBuiltinInactiveKeywords(): readonly ['TODO', 'LATER'] {
    return BUILTIN_INACTIVE_KEYWORDS;
  }

  getBuiltinWaitingKeywords(): readonly ['WAIT', 'WAITING'] {
    return BUILTIN_WAITING_KEYWORDS;
  }

  getBuiltinCompletedKeywords(): readonly ['DONE', 'CANCELED', 'CANCELLED'] {
    return BUILTIN_COMPLETED_KEYWORDS;
  }

  getBuiltinArchivedKeywords(): readonly ['ARCHIVED'] {
    return BUILTIN_ARCHIVED_KEYWORDS;
  }

  getKeywordsForGroup(group: KeywordGroup | 'inactiveKeywords'): string[] {
    switch (group) {
      case 'activeKeywords':
        return Array.from(this.activeKeywords);
      case 'inactiveKeywords':
        return Array.from(this.inactiveKeywords);
      case 'waitingKeywords':
        return Array.from(this.waitingKeywords);
      case 'completedKeywords':
        return Array.from(this.completedKeywords);
      case 'archivedKeywords':
        return Array.from(this.archivedKeywords);
      default:
        return [];
    }
  }

  isKnownKeyword(keyword: string): boolean {
    return (
      this.isCompleted(keyword) ||
      this.isActive(keyword) ||
      this.isWaiting(keyword) ||
      this.isInactive(keyword) ||
      this.isArchived(keyword)
    );
  }
}
