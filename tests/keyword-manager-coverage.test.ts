import { KeywordManager } from '../src/utils/keyword-manager';

describe('KeywordManager static utility methods', () => {
  it('getBuiltinCompletedSet returns DONE, CANCELED, CANCELLED', () => {
    const set = KeywordManager.getBuiltinCompletedSet();
    expect(set.has('DONE')).toBe(true);
    expect(set.has('CANCELED')).toBe(true);
    expect(set.has('CANCELLED')).toBe(true);
    expect(set.size).toBe(3);
  });

  it('getBuiltinActiveSet returns NOW, DOING, IN-PROGRESS', () => {
    const set = KeywordManager.getBuiltinActiveSet();
    expect(set.has('NOW')).toBe(true);
    expect(set.has('DOING')).toBe(true);
    expect(set.has('IN-PROGRESS')).toBe(true);
    expect(set.size).toBe(3);
  });

  it('getBuiltinWaitingSet returns WAIT, WAITING', () => {
    const set = KeywordManager.getBuiltinWaitingSet();
    expect(set.has('WAIT')).toBe(true);
    expect(set.has('WAITING')).toBe(true);
    expect(set.size).toBe(2);
  });

  it('getBuiltinInactiveSet returns TODO, LATER', () => {
    const set = KeywordManager.getBuiltinInactiveSet();
    expect(set.has('TODO')).toBe(true);
    expect(set.has('LATER')).toBe(true);
    expect(set.size).toBe(2);
  });

  it('getBuiltinArchivedSet returns ARCHIVED', () => {
    const set = KeywordManager.getBuiltinArchivedSet();
    expect(set.has('ARCHIVED')).toBe(true);
    expect(set.size).toBe(1);
  });

  describe('filterCustomKeywords', () => {
    it('filters out all builtin keywords', () => {
      const result = KeywordManager.filterCustomKeywords([
        'TODO',
        'DONE',
        'NOW',
        'WAIT',
        'ARCHIVED',
        'CUSTOM1',
        'CUSTOM2',
      ]);
      expect(result).toEqual(['CUSTOM1', 'CUSTOM2']);
    });

    it('returns all keywords when none are builtin', () => {
      const result = KeywordManager.filterCustomKeywords(['ALPHA', 'BETA']);
      expect(result).toEqual(['ALPHA', 'BETA']);
    });

    it('returns empty array when all are builtin', () => {
      const result = KeywordManager.filterCustomKeywords([
        'TODO',
        'DONE',
        'NOW',
      ]);
      expect(result).toEqual([]);
    });
  });

  describe('isBuiltin', () => {
    it('returns true for builtin keywords', () => {
      expect(KeywordManager.isBuiltin('TODO')).toBe(true);
      expect(KeywordManager.isBuiltin('DONE')).toBe(true);
      expect(KeywordManager.isBuiltin('NOW')).toBe(true);
      expect(KeywordManager.isBuiltin('WAIT')).toBe(true);
      expect(KeywordManager.isBuiltin('ARCHIVED')).toBe(true);
    });

    it('returns false for non-builtin keywords', () => {
      expect(KeywordManager.isBuiltin('CUSTOM')).toBe(false);
      expect(KeywordManager.isBuiltin('MYTASK')).toBe(false);
    });
  });
});

describe('KeywordManager validation', () => {
  it('reports duplicate custom keyword in same group', () => {
    const km = new KeywordManager({
      additionalActiveKeywords: ['ALPHA', 'ALPHA'],
    });
    const result = km.getValidationResult();
    expect(result.errors.length).toBeGreaterThanOrEqual(1);
    expect(result.errors.some((e) => e.code === 'duplicateCustomInGroup')).toBe(
      true,
    );
    expect(result.invalidKeywords).toContain('ALPHA');
  });

  it('reports duplicate custom keyword across groups', () => {
    const km = new KeywordManager({
      additionalActiveKeywords: ['SHARED'],
      additionalInactiveKeywords: ['SHARED'],
    });
    const result = km.getValidationResult();
    expect(
      result.errors.some((e) => e.code === 'duplicateCustomAcrossGroups'),
    ).toBe(true);
    expect(result.invalidKeywords).toContain('SHARED');
  });

  it('reports invalid builtin removal target', () => {
    const km = new KeywordManager({
      additionalActiveKeywords: ['-DONE'],
    });
    const result = km.getValidationResult();
    expect(
      result.errors.some((e) => e.code === 'invalidBuiltinRemovalTarget'),
    ).toBe(true);
    expect(result.invalidKeywords).toContain('DONE');
  });

  it('reports builtin add/remove conflict', () => {
    const km = new KeywordManager({
      additionalActiveKeywords: ['-NOW'],
      additionalInactiveKeywords: ['NOW'],
    });
    const result = km.getValidationResult();
    expect(
      result.errors.some((e) => e.code === 'builtinAddRemoveConflict'),
    ).toBe(true);
    expect(result.invalidKeywords).toContain('NOW');
  });

  it('reports builtin keyword in multiple custom groups', () => {
    const km = new KeywordManager({
      additionalActiveKeywords: ['DONE'],
      additionalInactiveKeywords: ['DONE'],
    });
    const result = km.getValidationResult();
    expect(
      result.errors.some((e) => e.code === 'builtinDuplicateAcrossGroups'),
    ).toBe(true);
    expect(result.invalidKeywords).toContain('DONE');
  });

  it('produces warnings for builtin removal', () => {
    const km = new KeywordManager({
      additionalInactiveKeywords: ['-TODO'],
    });
    const result = km.getValidationResult();
    expect(result.warnings.some((e) => e.code === 'builtinRemoval')).toBe(true);
  });

  it('produces warning for builtin sort override when re-declared in same group', () => {
    const km = new KeywordManager({
      additionalActiveKeywords: ['NOW'],
    });
    const result = km.getValidationResult();
    expect(result.warnings.some((e) => e.code === 'builtinSortOverride')).toBe(
      true,
    );
  });

  it('produces warning for builtin group override when moved to different group', () => {
    const km = new KeywordManager({
      additionalInactiveKeywords: ['NOW'],
    });
    const result = km.getValidationResult();
    expect(result.warnings.some((e) => e.code === 'builtinGroupOverride')).toBe(
      true,
    );
  });

  it('has no errors with valid settings', () => {
    const km = new KeywordManager({});
    const result = km.getValidationResult();
    expect(result.errors).toEqual([]);
    expect(result.invalidKeywords).toEqual([]);
  });
});

describe('KeywordManager accessor methods', () => {
  const km = new KeywordManager({
    additionalActiveKeywords: ['CUSTOM_A'],
    additionalInactiveKeywords: ['CUSTOM_I'],
    additionalWaitingKeywords: ['CUSTOM_W'],
    additionalCompletedKeywords: ['CUSTOM_C'],
    additionalArchivedKeywords: ['CUSTOM_AR'],
  });

  it('getCompletedSet returns a Set with completed keywords', () => {
    const set = km.getCompletedSet();
    expect(set).toBeInstanceOf(Set);
    expect(set.has('DONE')).toBe(true);
    expect(set.has('CUSTOM_C')).toBe(true);
  });

  it('getActiveSet returns a Set with active keywords', () => {
    const set = km.getActiveSet();
    expect(set).toBeInstanceOf(Set);
    expect(set.has('NOW')).toBe(true);
    expect(set.has('CUSTOM_A')).toBe(true);
  });

  it('getWaitingSet returns a Set with waiting keywords', () => {
    const set = km.getWaitingSet();
    expect(set).toBeInstanceOf(Set);
    expect(set.has('WAIT')).toBe(true);
    expect(set.has('CUSTOM_W')).toBe(true);
  });

  it('getInactiveSet returns a Set with inactive keywords', () => {
    const set = km.getInactiveSet();
    expect(set).toBeInstanceOf(Set);
    expect(set.has('TODO')).toBe(true);
    expect(set.has('CUSTOM_I')).toBe(true);
  });

  it('getArchivedSet returns a Set with archived keywords', () => {
    const set = km.getArchivedSet();
    expect(set).toBeInstanceOf(Set);
    expect(set.has('ARCHIVED')).toBe(true);
    expect(set.has('CUSTOM_AR')).toBe(true);
  });

  describe('getCustom*Set methods', () => {
    it('getCustomCompletedSet excludes builtins', () => {
      const set = km.getCustomCompletedSet();
      expect(set.has('DONE')).toBe(false);
      expect(set.has('CUSTOM_C')).toBe(true);
    });

    it('getCustomActiveSet excludes builtins', () => {
      const set = km.getCustomActiveSet();
      expect(set.has('NOW')).toBe(false);
      expect(set.has('CUSTOM_A')).toBe(true);
    });

    it('getCustomWaitingSet excludes builtins', () => {
      const set = km.getCustomWaitingSet();
      expect(set.has('WAIT')).toBe(false);
      expect(set.has('CUSTOM_W')).toBe(true);
    });

    it('getCustomInactiveSet excludes builtins', () => {
      const set = km.getCustomInactiveSet();
      expect(set.has('TODO')).toBe(false);
      expect(set.has('CUSTOM_I')).toBe(true);
    });

    it('getCustomArchivedSet excludes builtins', () => {
      const set = km.getCustomArchivedSet();
      expect(set.has('ARCHIVED')).toBe(false);
      expect(set.has('CUSTOM_AR')).toBe(true);
    });
  });

  describe('getBuiltin*Keywords methods', () => {
    it('getBuiltinActiveKeywords returns builtin active array', () => {
      expect(km.getBuiltinActiveKeywords()).toEqual([
        'NOW',
        'DOING',
        'IN-PROGRESS',
      ]);
    });

    it('getBuiltinInactiveKeywords returns builtin inactive array', () => {
      expect(km.getBuiltinInactiveKeywords()).toEqual(['TODO', 'LATER']);
    });

    it('getBuiltinWaitingKeywords returns builtin waiting array', () => {
      expect(km.getBuiltinWaitingKeywords()).toEqual(['WAIT', 'WAITING']);
    });

    it('getBuiltinCompletedKeywords returns builtin completed array', () => {
      expect(km.getBuiltinCompletedKeywords()).toEqual([
        'DONE',
        'CANCELED',
        'CANCELLED',
      ]);
    });

    it('getBuiltinArchivedKeywords returns builtin archived array', () => {
      expect(km.getBuiltinArchivedKeywords()).toEqual(['ARCHIVED']);
    });
  });

  it('getBuiltinKeywordsForGroup returns builtins for each group', () => {
    expect(km.getBuiltinKeywordsForGroup('activeKeywords')).toEqual([
      'NOW',
      'DOING',
      'IN-PROGRESS',
    ]);
    expect(km.getBuiltinKeywordsForGroup('inactiveKeywords')).toEqual([
      'TODO',
      'LATER',
    ]);
    expect(km.getBuiltinKeywordsForGroup('waitingKeywords')).toEqual([
      'WAIT',
      'WAITING',
    ]);
    expect(km.getBuiltinKeywordsForGroup('completedKeywords')).toEqual([
      'DONE',
      'CANCELED',
      'CANCELLED',
    ]);
    expect(km.getBuiltinKeywordsForGroup('archivedKeywords')).toEqual([
      'ARCHIVED',
    ]);
  });
});

describe('KeywordManager getGroup', () => {
  const km = new KeywordManager({});

  it('returns inactiveKeywords for TODO', () => {
    expect(km.getGroup('TODO')).toBe('inactiveKeywords');
  });

  it('returns activeKeywords for NOW', () => {
    expect(km.getGroup('NOW')).toBe('activeKeywords');
  });

  it('returns waitingKeywords for WAIT', () => {
    expect(km.getGroup('WAIT')).toBe('waitingKeywords');
  });

  it('returns completedKeywords for DONE', () => {
    expect(km.getGroup('DONE')).toBe('completedKeywords');
  });

  it('returns archivedKeywords for ARCHIVED', () => {
    expect(km.getGroup('ARCHIVED')).toBe('archivedKeywords');
  });

  it('returns null for unknown keyword', () => {
    expect(km.getGroup('UNKNOWN')).toBeNull();
  });
});

describe('KeywordManager getCheckboxState', () => {
  const km = new KeywordManager({});

  it('returns " " for inactive keyword by default', () => {
    expect(km.getCheckboxState('TODO')).toBe(' ');
  });

  it('returns "x" for completed keyword by default', () => {
    expect(km.getCheckboxState('DONE')).toBe('x');
  });

  it('returns "x" for completed with extended styles', () => {
    expect(
      km.getCheckboxState('DONE', { useExtendedCheckboxStyles: true }),
    ).toBe('x');
  });

  it('returns "/" for active with extended styles', () => {
    expect(
      km.getCheckboxState('NOW', { useExtendedCheckboxStyles: true }),
    ).toBe('/');
  });

  it('returns "-" for CANCELED with extended styles', () => {
    expect(
      km.getCheckboxState('CANCELED', { useExtendedCheckboxStyles: true }),
    ).toBe('-');
  });

  it('returns "-" for CANCELLED with extended styles', () => {
    expect(
      km.getCheckboxState('CANCELLED', { useExtendedCheckboxStyles: true }),
    ).toBe('-');
  });

  it('returns " " for inactive with extended styles', () => {
    expect(
      km.getCheckboxState('TODO', { useExtendedCheckboxStyles: true }),
    ).toBe(' ');
  });

  it('static getCheckboxState works', () => {
    expect(
      KeywordManager.getCheckboxState('DONE', {
        useExtendedCheckboxStyles: true,
      }),
    ).toBe('x');
    expect(
      KeywordManager.getCheckboxState('NOW', {
        useExtendedCheckboxStyles: true,
      }),
    ).toBe('/');
    expect(
      KeywordManager.getCheckboxState('CANCELED', {
        useExtendedCheckboxStyles: true,
      }),
    ).toBe('-');
  });
});

describe('KeywordManager getSettings', () => {
  it('returns the settings object passed to constructor', () => {
    const settings = { additionalActiveKeywords: ['TEST'] };
    const km = new KeywordManager(settings);
    expect(km.getSettings()).toBe(settings);
  });
});

describe('KeywordManager isKnownKeyword', () => {
  const km = new KeywordManager({});

  it('returns true for known keywords', () => {
    expect(km.isKnownKeyword('TODO')).toBe(true);
    expect(km.isKnownKeyword('NOW')).toBe(true);
    expect(km.isKnownKeyword('DONE')).toBe(true);
    expect(km.isKnownKeyword('WAIT')).toBe(true);
    expect(km.isKnownKeyword('ARCHIVED')).toBe(true);
  });

  it('returns false for unknown keywords', () => {
    expect(km.isKnownKeyword('UNKNOWN')).toBe(false);
  });
});

describe('KeywordManager getAllKeywords', () => {
  it('returns all unique keywords across groups', () => {
    const km = new KeywordManager({
      additionalActiveKeywords: ['CUSTOM_A'],
    });
    const all = km.getAllKeywords();
    expect(all).toContain('TODO');
    expect(all).toContain('NOW');
    expect(all).toContain('DONE');
    expect(all).toContain('WAIT');
    expect(all).toContain('ARCHIVED');
    expect(all).toContain('CUSTOM_A');
  });

  it('static getAllKeywords works', () => {
    const all = KeywordManager.getAllKeywords({
      additionalInactiveKeywords: ['EXTRA'],
    });
    expect(all).toContain('EXTRA');
    expect(all).toContain('TODO');
  });
});

describe('KeywordManager static wrappers', () => {
  const settings = {};

  it('isCompletedKeyword returns true for DONE', () => {
    expect(KeywordManager.isCompletedKeyword('DONE', settings)).toBe(true);
  });

  it('isArchivedKeyword returns true for ARCHIVED', () => {
    expect(KeywordManager.isArchivedKeyword('ARCHIVED', settings)).toBe(true);
  });

  it('isActiveKeyword returns true for NOW', () => {
    expect(KeywordManager.isActiveKeyword('NOW', settings)).toBe(true);
  });

  it('isWaitingKeyword returns true for WAIT', () => {
    expect(KeywordManager.isWaitingKeyword('WAIT', settings)).toBe(true);
  });

  it('isInactiveKeyword returns true for TODO', () => {
    expect(KeywordManager.isInactiveKeyword('TODO', settings)).toBe(true);
  });

  it('getKeywordGroup returns correct group', () => {
    expect(KeywordManager.getKeywordGroup('TODO', settings)).toBe(
      'inactiveKeywords',
    );
    expect(KeywordManager.getKeywordGroup('NOW', settings)).toBe(
      'activeKeywords',
    );
    expect(KeywordManager.getKeywordGroup('UNKNOWN', settings)).toBeNull();
  });

  it('getKeywordsForGroup static works', () => {
    const keywords = KeywordManager.getKeywordsForGroup(
      'inactiveKeywords',
      settings,
    );
    expect(keywords).toContain('TODO');
    expect(keywords).toContain('LATER');
  });
});

describe('KeywordManager token parsing edge cases', () => {
  it('normalizes keywords to uppercase and trims whitespace', () => {
    const km = new KeywordManager({
      additionalActiveKeywords: ['  custom  '],
    });
    expect(km.isActive('CUSTOM')).toBe(true);
  });

  it('ignores empty and whitespace-only tokens', () => {
    const km = new KeywordManager({
      additionalActiveKeywords: ['   ', '', 'VALID'],
    });
    expect(km.isActive('VALID')).toBe(true);
    expect(km.isActive('')).toBe(false);
  });

  it('ignores remove tokens with only a dash', () => {
    const km = new KeywordManager({
      additionalActiveKeywords: ['-', 'VALID'],
    });
    expect(km.isActive('VALID')).toBe(true);
  });
});

describe('KeywordManager buildResolution removal and reordering', () => {
  it('removes a builtin keyword from its group', () => {
    const km = new KeywordManager({
      additionalInactiveKeywords: ['-TODO'],
    });
    expect(km.isInactive('TODO')).toBe(false);
    expect(km.isInactive('LATER')).toBe(true);
  });

  it('moves a builtin keyword to a different group', () => {
    const km = new KeywordManager({
      additionalInactiveKeywords: ['NOW'],
    });
    expect(km.isInactive('NOW')).toBe(true);
    expect(km.isActive('NOW')).toBe(false);
  });

  it('invalid keywords are excluded from final resolution', () => {
    const km = new KeywordManager({
      additionalActiveKeywords: ['SHARED'],
      additionalInactiveKeywords: ['SHARED'],
    });
    expect(km.isActive('SHARED')).toBe(false);
    expect(km.isInactive('SHARED')).toBe(false);
  });
});

describe('KeywordManager getDefaultForGroup empty edge case', () => {
  it('getDefaultInactive returns preferred default when all keywords removed', () => {
    const km = new KeywordManager({
      additionalInactiveKeywords: ['-TODO', '-LATER'],
    });
    expect(km.getDefaultInactive()).toBe('TODO');
  });

  it('getDefaultActive returns preferred default when all keywords removed', () => {
    const km = new KeywordManager({
      additionalActiveKeywords: ['-NOW', '-DOING', '-IN-PROGRESS'],
    });
    expect(km.getDefaultActive()).toBe('DOING');
  });

  it('getDefaultCompleted returns preferred default when all keywords removed', () => {
    const km = new KeywordManager({
      additionalCompletedKeywords: ['-DONE', '-CANCELED', '-CANCELLED'],
    });
    expect(km.getDefaultCompleted()).toBe('DONE');
  });
});
