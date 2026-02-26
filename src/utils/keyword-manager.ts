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

type KeywordTokenType = 'add' | 'remove';

interface ParsedKeywordToken {
  keyword: string;
  type: KeywordTokenType;
  group: KeywordGroup;
}

type ValidationSeverity = 'error' | 'warning';

type ValidationCode =
  | 'duplicateCustomInGroup'
  | 'duplicateCustomAcrossGroups'
  | 'builtinDuplicateAcrossGroups'
  | 'invalidBuiltinRemovalTarget'
  | 'builtinAddRemoveConflict'
  | 'builtinSortOverride'
  | 'builtinGroupOverride'
  | 'builtinRemoval';

export interface KeywordValidationIssue {
  severity: ValidationSeverity;
  code: ValidationCode;
  keyword: string;
  group: KeywordGroup;
  message: string;
}

export interface KeywordValidationResult {
  errors: KeywordValidationIssue[];
  warnings: KeywordValidationIssue[];
  invalidKeywords: string[];
}

interface KeywordResolution {
  orderedByGroup: Record<KeywordGroup, string[]>;
  setByGroup: Record<KeywordGroup, Set<string>>;
  validation: KeywordValidationResult;
}

const GROUP_ORDER: KeywordGroup[] = [
  'activeKeywords',
  'inactiveKeywords',
  'waitingKeywords',
  'completedKeywords',
  'archivedKeywords',
];

const BUILTIN_BY_GROUP: Record<KeywordGroup, readonly string[]> = {
  activeKeywords: BUILTIN_ACTIVE_KEYWORDS,
  inactiveKeywords: BUILTIN_INACTIVE_KEYWORDS,
  waitingKeywords: BUILTIN_WAITING_KEYWORDS,
  completedKeywords: BUILTIN_COMPLETED_KEYWORDS,
  archivedKeywords: BUILTIN_ARCHIVED_KEYWORDS,
};

const BUILTIN_SETS_BY_GROUP: Record<KeywordGroup, Set<string>> = {
  activeKeywords: BUILTIN_ACTIVE_SET,
  inactiveKeywords: BUILTIN_INACTIVE_SET,
  waitingKeywords: BUILTIN_WAITING_SET,
  completedKeywords: BUILTIN_COMPLETED_SET,
  archivedKeywords: BUILTIN_ARCHIVED_SET,
};

const mapBuiltinEntries = (
  keywords: readonly string[],
  group: KeywordGroup,
): Array<[string, KeywordGroup]> => keywords.map((k) => [k, group]);

const DEFAULT_GROUP_BY_BUILTIN = new Map<string, KeywordGroup>([
  ...mapBuiltinEntries(BUILTIN_ACTIVE_KEYWORDS, 'activeKeywords'),
  ...mapBuiltinEntries(BUILTIN_INACTIVE_KEYWORDS, 'inactiveKeywords'),
  ...mapBuiltinEntries(BUILTIN_WAITING_KEYWORDS, 'waitingKeywords'),
  ...mapBuiltinEntries(BUILTIN_COMPLETED_KEYWORDS, 'completedKeywords'),
  ...mapBuiltinEntries(BUILTIN_ARCHIVED_KEYWORDS, 'archivedKeywords'),
]);

const formatGroupLabel = (group: KeywordGroup): string =>
  group.replace(/Keywords$/, ' keywords').replace(/([a-z])([A-Z])/g, '$1 $2');

export class KeywordManager {
  private readonly resolution: KeywordResolution;

  constructor(private settings: KeywordSettings) {
    this.resolution = this.buildResolution();
  }

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
        !BUILTIN_INACTIVE_SET.has(k) &&
        !BUILTIN_ARCHIVED_SET.has(k),
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

  private static normalizeKeyword(value: string): string {
    return value.trim().toUpperCase();
  }

  private static parseGroupTokens(
    values: string[] | undefined,
    group: KeywordGroup,
  ): ParsedKeywordToken[] {
    const tokens: ParsedKeywordToken[] = [];

    for (const rawValue of values ?? []) {
      const normalized = this.normalizeKeyword(rawValue);
      if (normalized.length === 0) continue;

      if (normalized.startsWith('-')) {
        const keyword = normalized.slice(1);
        if (keyword.length === 0) continue;
        tokens.push({ keyword, type: 'remove', group });
      } else {
        tokens.push({ keyword: normalized, type: 'add', group });
      }
    }

    return tokens;
  }

  private parseAllTokens(): Record<KeywordGroup, ParsedKeywordToken[]> {
    return {
      activeKeywords: KeywordManager.parseGroupTokens(
        this.settings.additionalActiveKeywords,
        'activeKeywords',
      ),
      inactiveKeywords: KeywordManager.parseGroupTokens(
        this.settings.additionalInactiveKeywords,
        'inactiveKeywords',
      ),
      waitingKeywords: KeywordManager.parseGroupTokens(
        this.settings.additionalWaitingKeywords,
        'waitingKeywords',
      ),
      completedKeywords: KeywordManager.parseGroupTokens(
        this.settings.additionalCompletedKeywords,
        'completedKeywords',
      ),
      archivedKeywords: KeywordManager.parseGroupTokens(
        this.settings.additionalArchivedKeywords,
        'archivedKeywords',
      ),
    };
  }

  private createValidationIssue(
    severity: ValidationSeverity,
    code: ValidationCode,
    keyword: string,
    group: KeywordGroup,
    message: string,
  ): KeywordValidationIssue {
    return { severity, code, keyword, group, message };
  }

  private createBaseGroupOrders(): Record<KeywordGroup, string[]> {
    return {
      activeKeywords: [...BUILTIN_ACTIVE_KEYWORDS],
      inactiveKeywords: [...BUILTIN_INACTIVE_KEYWORDS],
      waitingKeywords: [...BUILTIN_WAITING_KEYWORDS],
      completedKeywords: [...BUILTIN_COMPLETED_KEYWORDS],
      archivedKeywords: [...BUILTIN_ARCHIVED_KEYWORDS],
    };
  }

  private buildResolution(): KeywordResolution {
    const tokensByGroup = this.parseAllTokens();
    const errors: KeywordValidationIssue[] = [];
    const warnings: KeywordValidationIssue[] = [];
    const invalidKeywords = new Set<string>();

    // Duplicate custom keywords in the same group
    for (const group of GROUP_ORDER) {
      const seenCustom = new Set<string>();
      for (const token of tokensByGroup[group]) {
        if (token.type !== 'add' || KeywordManager.isBuiltin(token.keyword)) {
          continue;
        }
        if (seenCustom.has(token.keyword)) {
          errors.push(
            this.createValidationIssue(
              'error',
              'duplicateCustomInGroup',
              token.keyword,
              group,
              `Keyword ${token.keyword} is duplicated in ${formatGroupLabel(group)}.`,
            ),
          );
          invalidKeywords.add(token.keyword);
        } else {
          seenCustom.add(token.keyword);
        }
      }
    }

    // Duplicate custom keywords across groups
    const customKeywordGroups = new Map<string, Set<KeywordGroup>>();
    for (const group of GROUP_ORDER) {
      for (const token of tokensByGroup[group]) {
        if (token.type !== 'add' || KeywordManager.isBuiltin(token.keyword)) {
          continue;
        }
        if (!customKeywordGroups.has(token.keyword)) {
          customKeywordGroups.set(token.keyword, new Set<KeywordGroup>());
        }
        customKeywordGroups.get(token.keyword)?.add(group);
      }
    }

    for (const [keyword, groups] of Array.from(customKeywordGroups.entries())) {
      if (groups.size > 1) {
        for (const group of Array.from(groups)) {
          errors.push(
            this.createValidationIssue(
              'error',
              'duplicateCustomAcrossGroups',
              keyword,
              group,
              `Keyword ${keyword} appears in multiple groups and is ignored.`,
            ),
          );
        }
        invalidKeywords.add(keyword);
      }
    }

    const builtinAddGroups = new Map<string, Set<KeywordGroup>>();
    const builtinRemoveGroups = new Map<string, Set<KeywordGroup>>();

    // Validate removals and collect built-in add/remove participation
    for (const group of GROUP_ORDER) {
      for (const token of tokensByGroup[group]) {
        if (token.type === 'remove') {
          if (!BUILTIN_SETS_BY_GROUP[group].has(token.keyword)) {
            errors.push(
              this.createValidationIssue(
                'error',
                'invalidBuiltinRemovalTarget',
                token.keyword,
                group,
                `${token.keyword} is not a built-in keyword in ${formatGroupLabel(group)}.`,
              ),
            );
            invalidKeywords.add(token.keyword);
            continue;
          }

          if (!builtinRemoveGroups.has(token.keyword)) {
            builtinRemoveGroups.set(token.keyword, new Set<KeywordGroup>());
          }
          builtinRemoveGroups.get(token.keyword)?.add(group);

          warnings.push(
            this.createValidationIssue(
              'warning',
              'builtinRemoval',
              token.keyword,
              group,
              `Built-in keyword ${token.keyword} is removed from ${formatGroupLabel(group)}.`,
            ),
          );
          continue;
        }

        if (KeywordManager.isBuiltin(token.keyword)) {
          if (!builtinAddGroups.has(token.keyword)) {
            builtinAddGroups.set(token.keyword, new Set<KeywordGroup>());
          }
          builtinAddGroups.get(token.keyword)?.add(group);
        }
      }
    }

    // Add/remove conflict for a built-in keyword
    for (const [keyword, removeGroups] of Array.from(
      builtinRemoveGroups.entries(),
    )) {
      if (!builtinAddGroups.has(keyword)) continue;

      const addGroups =
        builtinAddGroups.get(keyword) ?? new Set<KeywordGroup>();
      const conflictGroups = new Set<KeywordGroup>([
        ...Array.from(removeGroups),
        ...Array.from(addGroups),
      ]);

      for (const group of Array.from(conflictGroups)) {
        errors.push(
          this.createValidationIssue(
            'error',
            'builtinAddRemoveConflict',
            keyword,
            group,
            `Built-in keyword ${keyword} cannot be both added and removed.`,
          ),
        );
      }
      invalidKeywords.add(keyword);
    }

    // Built-in keyword added in multiple custom groups is invalid
    for (const [keyword, groups] of Array.from(builtinAddGroups.entries())) {
      if (groups.size <= 1) continue;

      for (const group of Array.from(groups)) {
        errors.push(
          this.createValidationIssue(
            'error',
            'builtinDuplicateAcrossGroups',
            keyword,
            group,
            `Built-in keyword ${keyword} appears in multiple custom groups and must be declared in only one group.`,
          ),
        );
      }
      invalidKeywords.add(keyword);
    }

    // Built-in override warnings
    for (const [keyword, groups] of Array.from(builtinAddGroups.entries())) {
      if (invalidKeywords.has(keyword)) continue;

      const defaultGroup = DEFAULT_GROUP_BY_BUILTIN.get(keyword);
      for (const group of Array.from(groups)) {
        if (!defaultGroup) continue;
        if (group === defaultGroup) {
          warnings.push(
            this.createValidationIssue(
              'warning',
              'builtinSortOverride',
              keyword,
              defaultGroup,
              `Sort placement for built-in keyword ${keyword} is overridden.`,
            ),
          );
        } else {
          warnings.push(
            this.createValidationIssue(
              'warning',
              'builtinGroupOverride',
              keyword,
              defaultGroup,
              `Group placement for built-in keyword ${keyword} is overridden to ${formatGroupLabel(group)}.`,
            ),
          );
        }
      }
    }

    // Build effective order from valid tokens only
    const orderedByGroup = this.createBaseGroupOrders();

    // Apply removals first
    for (const group of GROUP_ORDER) {
      for (const token of tokensByGroup[group]) {
        if (token.type !== 'remove') continue;
        if (invalidKeywords.has(token.keyword)) continue;

        orderedByGroup[group] = orderedByGroup[group].filter(
          (k) => k !== token.keyword,
        );
      }
    }

    // Apply adds/redeclares in definition order
    for (const group of GROUP_ORDER) {
      for (const token of tokensByGroup[group]) {
        if (token.type !== 'add') continue;
        if (invalidKeywords.has(token.keyword)) continue;

        // Move/reposition keyword by removing from all groups first
        for (const g of GROUP_ORDER) {
          orderedByGroup[g] = orderedByGroup[g].filter(
            (k) => k !== token.keyword,
          );
        }

        orderedByGroup[group].push(token.keyword);
      }
    }

    const setByGroup: Record<KeywordGroup, Set<string>> = {
      activeKeywords: new Set(orderedByGroup.activeKeywords),
      inactiveKeywords: new Set(orderedByGroup.inactiveKeywords),
      waitingKeywords: new Set(orderedByGroup.waitingKeywords),
      completedKeywords: new Set(orderedByGroup.completedKeywords),
      archivedKeywords: new Set(orderedByGroup.archivedKeywords),
    };

    return {
      orderedByGroup,
      setByGroup,
      validation: {
        errors,
        warnings,
        invalidKeywords: Array.from(invalidKeywords),
      },
    };
  }

  getValidationResult(): KeywordValidationResult {
    return this.resolution.validation;
  }

  getAllKeywords(): string[] {
    const all = [
      ...this.resolution.orderedByGroup.activeKeywords,
      ...this.resolution.orderedByGroup.inactiveKeywords,
      ...this.resolution.orderedByGroup.waitingKeywords,
      ...this.resolution.orderedByGroup.completedKeywords,
      ...this.resolution.orderedByGroup.archivedKeywords,
    ];
    return Array.from(new Set(all));
  }

  isCompleted(keyword: string): boolean {
    return this.resolution.setByGroup.completedKeywords.has(keyword);
  }

  isActive(keyword: string): boolean {
    return this.resolution.setByGroup.activeKeywords.has(keyword);
  }

  isWaiting(keyword: string): boolean {
    return this.resolution.setByGroup.waitingKeywords.has(keyword);
  }

  isInactive(keyword: string): boolean {
    return this.resolution.setByGroup.inactiveKeywords.has(keyword);
  }

  isArchived(keyword: string): boolean {
    return this.resolution.setByGroup.archivedKeywords.has(keyword);
  }

  getGroup(keyword: string): KeywordGroup | 'inactiveKeywords' | null {
    if (this.resolution.setByGroup.inactiveKeywords.has(keyword)) {
      return 'inactiveKeywords';
    }

    if (this.resolution.setByGroup.activeKeywords.has(keyword)) {
      return 'activeKeywords';
    }

    if (this.resolution.setByGroup.waitingKeywords.has(keyword)) {
      return 'waitingKeywords';
    }

    if (this.resolution.setByGroup.completedKeywords.has(keyword)) {
      return 'completedKeywords';
    }

    if (this.resolution.setByGroup.archivedKeywords.has(keyword)) {
      return 'archivedKeywords';
    }

    return null;
  }

  getCompletedSet(): Set<string> {
    return new Set(this.resolution.orderedByGroup.completedKeywords);
  }

  getActiveSet(): Set<string> {
    return new Set(this.resolution.orderedByGroup.activeKeywords);
  }

  getWaitingSet(): Set<string> {
    return new Set(this.resolution.orderedByGroup.waitingKeywords);
  }

  getInactiveSet(): Set<string> {
    return new Set(this.resolution.orderedByGroup.inactiveKeywords);
  }

  getArchivedSet(): Set<string> {
    return new Set(this.resolution.orderedByGroup.archivedKeywords);
  }

  getCustomCompletedSet(): Set<string> {
    return new Set(
      this.resolution.orderedByGroup.completedKeywords.filter(
        (k) => !KeywordManager.isBuiltin(k),
      ),
    );
  }

  getCustomActiveSet(): Set<string> {
    return new Set(
      this.resolution.orderedByGroup.activeKeywords.filter(
        (k) => !KeywordManager.isBuiltin(k),
      ),
    );
  }

  getCustomWaitingSet(): Set<string> {
    return new Set(
      this.resolution.orderedByGroup.waitingKeywords.filter(
        (k) => !KeywordManager.isBuiltin(k),
      ),
    );
  }

  getCustomInactiveSet(): Set<string> {
    return new Set(
      this.resolution.orderedByGroup.inactiveKeywords.filter(
        (k) => !KeywordManager.isBuiltin(k),
      ),
    );
  }

  getCustomArchivedSet(): Set<string> {
    return new Set(
      this.resolution.orderedByGroup.archivedKeywords.filter(
        (k) => !KeywordManager.isBuiltin(k),
      ),
    );
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
        return [...this.resolution.orderedByGroup.activeKeywords];
      case 'inactiveKeywords':
        return [...this.resolution.orderedByGroup.inactiveKeywords];
      case 'waitingKeywords':
        return [...this.resolution.orderedByGroup.waitingKeywords];
      case 'completedKeywords':
        return [...this.resolution.orderedByGroup.completedKeywords];
      case 'archivedKeywords':
        return [...this.resolution.orderedByGroup.archivedKeywords];
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

  getBuiltinKeywordsForGroup(group: KeywordGroup): readonly string[] {
    return BUILTIN_BY_GROUP[group];
  }
}
