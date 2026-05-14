import {
  buildOrgHeadlineRegex,
  buildOrgHeadlinePatternSource,
  ORG_PRIORITY_PATTERN,
  ORG_SCHEDULED_LINE_PATTERN,
  ORG_DEADLINE_LINE_PATTERN,
  ORG_PROPERTIES_START,
  ORG_PROPERTIES_END,
  ORG_CLOSED_PATTERN,
  ORG_FILE_DIRECTIVE,
  extractOrgPriority,
  getNestingLevel,
  isInPropertiesDrawer,
} from '../src/utils/org-patterns';
import { RegexCache } from '../src/utils/regex-cache';

describe('buildOrgHeadlineRegex', () => {
  it('should match a basic TODO headline', () => {
    const regex = buildOrgHeadlineRegex(['TODO', 'DONE']);
    const match = regex.exec('* TODO Task text');
    expect(match).not.toBeNull();
    expect(match![1]).toBe('*');
    expect(match![2]).toBe('TODO');
    expect(match![3]).toBe('Task text');
  });

  it('should match multi-level headlines', () => {
    const regex = buildOrgHeadlineRegex(['TODO']);
    const match = regex.exec('*** TODO Deep task');
    expect(match).not.toBeNull();
    expect(match![1]).toBe('***');
    expect(match![2]).toBe('TODO');
  });

  it('should not match lines without keywords', () => {
    const regex = buildOrgHeadlineRegex(['TODO', 'DONE']);
    expect(regex.exec('* Not a task')).toBeNull();
  });

  it('should not match lines without asterisks', () => {
    const regex = buildOrgHeadlineRegex(['TODO']);
    expect(regex.exec('TODO Task')).toBeNull();
  });

  it('should not match plain text', () => {
    const regex = buildOrgHeadlineRegex(['TODO']);
    expect(regex.exec('just some text')).toBeNull();
  });

  it('should escape regex special characters in keywords', () => {
    const regex = buildOrgHeadlineRegex(['TODO?', 'DONE.']);
    expect(regex.exec('* TODO? Task')).not.toBeNull();
    expect(regex.exec('* DONE. Task')).not.toBeNull();
    expect(regex.exec('* TODO Task')).toBeNull();
  });

  it('should match keywords with hyphens', () => {
    const regex = buildOrgHeadlineRegex(['IN-PROGRESS']);
    const match = regex.exec('* IN-PROGRESS Working');
    expect(match).not.toBeNull();
    expect(match![2]).toBe('IN-PROGRESS');
  });

  it('should match any of the provided keywords', () => {
    const regex = buildOrgHeadlineRegex(['TODO', 'DONE', 'WAIT', 'HOLD']);
    expect(regex.exec('* TODO a')).not.toBeNull();
    expect(regex.exec('* DONE b')).not.toBeNull();
    expect(regex.exec('* WAIT c')).not.toBeNull();
    expect(regex.exec('* HOLD d')).not.toBeNull();
  });

  it('should use regexCache when provided', () => {
    const cache = new RegexCache();
    const regex = buildOrgHeadlineRegex(['TODO'], cache);
    expect(regex).not.toBeNull();
    expect(regex.exec('* TODO Task')).not.toBeNull();
    expect(cache.size()).toBe(1);
  });

  it('should return cached regex on subsequent calls with same pattern', () => {
    const cache = new RegexCache();
    const regex1 = buildOrgHeadlineRegex(['TODO'], cache);
    const regex2 = buildOrgHeadlineRegex(['TODO'], cache);
    expect(regex1).toBe(regex2);
    expect(cache.size()).toBe(1);
  });

  it('should require whitespace between asterisks and keyword', () => {
    const regex = buildOrgHeadlineRegex(['TODO']);
    expect(regex.exec('*TODO Task')).toBeNull();
  });

  it('should require whitespace between keyword and rest', () => {
    const regex = buildOrgHeadlineRegex(['TODO']);
    expect(regex.exec('* TODOTask')).toBeNull();
  });
});

describe('buildOrgHeadlinePatternSource', () => {
  it('should return a string pattern', () => {
    const source = buildOrgHeadlinePatternSource(['TODO', 'DONE']);
    expect(typeof source).toBe('string');
    expect(source).toContain('TODO');
    expect(source).toContain('DONE');
  });

  it('should escape special characters in keywords', () => {
    const source = buildOrgHeadlinePatternSource(['TODO?']);
    expect(source).toContain('TODO\\?');
    expect(source).not.toContain('TODO?');
  });

  it('should produce a valid regex pattern', () => {
    const source = buildOrgHeadlinePatternSource(['TODO']);
    const regex = new RegExp(source);
    expect(regex.exec('* TODO Task text')).not.toBeNull();
  });
});

describe('ORG_PRIORITY_PATTERN', () => {
  it('should match [#A]', () => {
    const match = ORG_PRIORITY_PATTERN.exec('[#A] Task');
    expect(match).not.toBeNull();
    expect(match![1]).toBe('A');
  });

  it('should match [#B]', () => {
    const match = ORG_PRIORITY_PATTERN.exec('[#B] Task');
    expect(match).not.toBeNull();
    expect(match![1]).toBe('B');
  });

  it('should match [#C]', () => {
    const match = ORG_PRIORITY_PATTERN.exec('[#C] Task');
    expect(match).not.toBeNull();
    expect(match![1]).toBe('C');
  });

  it('should match #A without brackets', () => {
    const match = ORG_PRIORITY_PATTERN.exec('#A Task');
    expect(match).not.toBeNull();
    expect(match![1]).toBe('A');
  });

  it('should match #B without brackets', () => {
    const match = ORG_PRIORITY_PATTERN.exec('#B Task');
    expect(match).not.toBeNull();
    expect(match![1]).toBe('B');
  });

  it('should match #C without brackets', () => {
    const match = ORG_PRIORITY_PATTERN.exec('#C Task');
    expect(match).not.toBeNull();
    expect(match![1]).toBe('C');
  });

  it('should not match other letters', () => {
    expect(ORG_PRIORITY_PATTERN.exec('[#D] Task')).toBeNull();
    expect(ORG_PRIORITY_PATTERN.exec('[#X] Task')).toBeNull();
  });

  it('should match priority in the middle of text', () => {
    const match = ORG_PRIORITY_PATTERN.exec('Task [#A] text');
    expect(match).not.toBeNull();
    expect(match![1]).toBe('A');
  });
});

describe('ORG_SCHEDULED_LINE_PATTERN', () => {
  it('should match SCHEDULED with angle brackets', () => {
    const match = ORG_SCHEDULED_LINE_PATTERN.exec(
      '   SCHEDULED: <2026-02-12 Thu>',
    );
    expect(match).not.toBeNull();
    expect(match![1]).toBe('<2026-02-12 Thu>');
  });

  it('should match SCHEDULED with square brackets', () => {
    const match = ORG_SCHEDULED_LINE_PATTERN.exec(
      '   SCHEDULED: [2026-02-12 Thu]',
    );
    expect(match).not.toBeNull();
    expect(match![1]).toBe('[2026-02-12 Thu]');
  });

  it('should match SCHEDULED with minimal whitespace', () => {
    const match = ORG_SCHEDULED_LINE_PATTERN.exec(' SCHEDULED: <2026-02-12>');
    expect(match).not.toBeNull();
  });

  it('should not match SCHEDULED without leading whitespace', () => {
    const match = ORG_SCHEDULED_LINE_PATTERN.exec('SCHEDULED: <2026-02-12>');
    expect(match).toBeNull();
  });

  it('should not match non-SCHEDULED lines', () => {
    expect(
      ORG_SCHEDULED_LINE_PATTERN.exec('   DEADLINE: <2026-02-12>'),
    ).toBeNull();
  });

  it('should match SCHEDULED with repeater', () => {
    const match = ORG_SCHEDULED_LINE_PATTERN.exec(
      '   SCHEDULED: <2026-02-12 .+1d>',
    );
    expect(match).not.toBeNull();
    expect(match![1]).toBe('<2026-02-12 .+1d>');
  });
});

describe('ORG_DEADLINE_LINE_PATTERN', () => {
  it('should match DEADLINE with angle brackets', () => {
    const match = ORG_DEADLINE_LINE_PATTERN.exec(
      '   DEADLINE: <2026-02-15 Sun>',
    );
    expect(match).not.toBeNull();
    expect(match![1]).toBe('<2026-02-15 Sun>');
  });

  it('should match DEADLINE with square brackets', () => {
    const match = ORG_DEADLINE_LINE_PATTERN.exec(
      '   DEADLINE: [2026-02-15 Sun]',
    );
    expect(match).not.toBeNull();
    expect(match![1]).toBe('[2026-02-15 Sun]');
  });

  it('should not match DEADLINE without leading whitespace', () => {
    expect(ORG_DEADLINE_LINE_PATTERN.exec('DEADLINE: <2026-02-15>')).toBeNull();
  });

  it('should not match non-DEADLINE lines', () => {
    expect(
      ORG_DEADLINE_LINE_PATTERN.exec('   SCHEDULED: <2026-02-15>'),
    ).toBeNull();
  });
});

describe('ORG_PROPERTIES_START', () => {
  it('should match :PROPERTIES:', () => {
    expect(ORG_PROPERTIES_START.test(':PROPERTIES:')).toBe(true);
  });

  it('should match with leading and trailing whitespace', () => {
    expect(ORG_PROPERTIES_START.test('  :PROPERTIES:  ')).toBe(true);
  });

  it('should not match with other text on the line', () => {
    expect(ORG_PROPERTIES_START.test(':PROPERTIES: extra')).toBe(false);
  });

  it('should not match :END:', () => {
    expect(ORG_PROPERTIES_START.test(':END:')).toBe(false);
  });
});

describe('ORG_PROPERTIES_END', () => {
  it('should match :END:', () => {
    expect(ORG_PROPERTIES_END.test(':END:')).toBe(true);
  });

  it('should match with leading and trailing whitespace', () => {
    expect(ORG_PROPERTIES_END.test('  :END:  ')).toBe(true);
  });

  it('should not match with other text on the line', () => {
    expect(ORG_PROPERTIES_END.test(':END: extra')).toBe(false);
  });

  it('should not match :PROPERTIES:', () => {
    expect(ORG_PROPERTIES_END.test(':PROPERTIES:')).toBe(false);
  });
});

describe('ORG_CLOSED_PATTERN', () => {
  it('should match CLOSED with date', () => {
    expect(ORG_CLOSED_PATTERN.test('   CLOSED: [2026-02-12 Thu]')).toBe(true);
  });

  it('should match CLOSED with date and time', () => {
    expect(ORG_CLOSED_PATTERN.test('   CLOSED: [2026-02-12 Thu 08:00]')).toBe(
      true,
    );
  });

  it('should match CLOSED with date only (no day-of-week)', () => {
    expect(ORG_CLOSED_PATTERN.test('   CLOSED: [2026-02-12]')).toBe(true);
  });

  it('should not match CLOSED without brackets', () => {
    expect(ORG_CLOSED_PATTERN.test('   CLOSED: 2026-02-12')).toBe(false);
  });

  it('should not match without leading whitespace', () => {
    expect(ORG_CLOSED_PATTERN.test('CLOSED: [2026-02-12]')).toBe(false);
  });
});

describe('ORG_FILE_DIRECTIVE', () => {
  it('should match #+TITLE:', () => {
    expect(ORG_FILE_DIRECTIVE.test('#+TITLE:')).toBe(true);
  });

  it('should match #+AUTHOR:', () => {
    expect(ORG_FILE_DIRECTIVE.test('#+AUTHOR:')).toBe(true);
  });

  it('should match #+OPTIONS:', () => {
    expect(ORG_FILE_DIRECTIVE.test('#+OPTIONS:')).toBe(true);
  });

  it('should not match lowercase directives', () => {
    expect(ORG_FILE_DIRECTIVE.test('#+title:')).toBe(false);
  });

  it('should not match regular text', () => {
    expect(ORG_FILE_DIRECTIVE.test('Some text')).toBe(false);
  });

  it('should not match regular comments', () => {
    expect(ORG_FILE_DIRECTIVE.test('# comment')).toBe(false);
  });
});

describe('extractOrgPriority', () => {
  it('should extract high priority from [#A]', () => {
    const result = extractOrgPriority('[#A] Task text');
    expect(result.priority).toBe('high');
    expect(result.cleanedText).toBe('Task text');
  });

  it('should extract medium priority from [#B]', () => {
    const result = extractOrgPriority('[#B] Task text');
    expect(result.priority).toBe('med');
    expect(result.cleanedText).toBe('Task text');
  });

  it('should extract low priority from [#C]', () => {
    const result = extractOrgPriority('[#C] Task text');
    expect(result.priority).toBe('low');
    expect(result.cleanedText).toBe('Task text');
  });

  it('should return null priority when no priority marker', () => {
    const result = extractOrgPriority('Just a task');
    expect(result.priority).toBeNull();
    expect(result.cleanedText).toBe('Just a task');
  });

  it('should extract priority from #A without brackets', () => {
    const result = extractOrgPriority('#A Task text');
    expect(result.priority).toBe('high');
    expect(result.cleanedText).toBe('Task text');
  });

  it('should extract priority from #B without brackets', () => {
    const result = extractOrgPriority('#B Task text');
    expect(result.priority).toBe('med');
    expect(result.cleanedText).toBe('Task text');
  });

  it('should extract priority from #C without brackets', () => {
    const result = extractOrgPriority('#C Task text');
    expect(result.priority).toBe('low');
    expect(result.cleanedText).toBe('Task text');
  });

  it('should handle priority in the middle of text', () => {
    const result = extractOrgPriority('Task [#A] text');
    expect(result.priority).toBe('high');
    expect(result.cleanedText).toBe('Task text');
  });

  it('should handle empty string', () => {
    const result = extractOrgPriority('');
    expect(result.priority).toBeNull();
    expect(result.cleanedText).toBe('');
  });

  it('should trim whitespace from cleaned text', () => {
    const result = extractOrgPriority('  [#A]  Task text  ');
    expect(result.priority).toBe('high');
    expect(result.cleanedText).toBe('Task text');
  });
});

describe('getNestingLevel', () => {
  it('should return 1 for single asterisk', () => {
    expect(getNestingLevel('*')).toBe(1);
  });

  it('should return 2 for double asterisk', () => {
    expect(getNestingLevel('**')).toBe(2);
  });

  it('should return 3 for triple asterisk', () => {
    expect(getNestingLevel('***')).toBe(3);
  });

  it('should return 5 for five asterisks', () => {
    expect(getNestingLevel('*****')).toBe(5);
  });

  it('should return 0 for empty string', () => {
    expect(getNestingLevel('')).toBe(0);
  });
});

describe('isInPropertiesDrawer', () => {
  it('should return true when line is inside properties drawer', () => {
    const lines = ['* TODO Task', ':PROPERTIES:', '  KEY: value', ':END:'];
    expect(isInPropertiesDrawer(lines, 2)).toBe(true);
  });

  it('should return false when line is after :END:', () => {
    const lines = [
      '* TODO Task',
      ':PROPERTIES:',
      '  KEY: value',
      ':END:',
      '  SCHEDULED: <2026-03-05>',
    ];
    expect(isInPropertiesDrawer(lines, 4)).toBe(false);
  });

  it('should return false when line is before :PROPERTIES:', () => {
    const lines = [
      '* TODO Task',
      '  Some text',
      ':PROPERTIES:',
      '  KEY: value',
      ':END:',
    ];
    expect(isInPropertiesDrawer(lines, 1)).toBe(false);
  });

  it('should return false when no properties drawer exists', () => {
    const lines = ['* TODO Task', '  SCHEDULED: <2026-03-05>'];
    expect(isInPropertiesDrawer(lines, 1)).toBe(false);
  });

  it('should stop searching at previous headline', () => {
    const lines = [
      '* TODO Previous task',
      ':PROPERTIES:',
      '  KEY: value',
      ':END:',
      '* TODO Current task',
      '  SCHEDULED: <2026-03-05>',
    ];
    expect(isInPropertiesDrawer(lines, 5)).toBe(false);
  });

  it('should return false for line index 0', () => {
    const lines = [':PROPERTIES:', '  KEY: value'];
    expect(isInPropertiesDrawer(lines, 0)).toBe(false);
  });

  it('should handle unclosed properties drawer', () => {
    const lines = ['* TODO Task', ':PROPERTIES:', '  KEY: value'];
    expect(isInPropertiesDrawer(lines, 2)).toBe(true);
  });

  it('should handle properties drawer with whitespace', () => {
    const lines = ['  :PROPERTIES:  ', '  KEY: value', '  :END:  '];
    expect(isInPropertiesDrawer(lines, 1)).toBe(true);
  });

  it('should handle empty lines array', () => {
    expect(isInPropertiesDrawer([], 0)).toBe(false);
  });

  it('should return false for out-of-bounds line index', () => {
    const lines = ['* TODO Task'];
    expect(isInPropertiesDrawer(lines, 5)).toBe(false);
  });
});
