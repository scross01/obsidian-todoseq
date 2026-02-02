import {
  detectListMarker,
  PRIORITY_TOKEN_REGEX,
  CHECKBOX_REGEX,
  BULLET_LIST_PATTERN,
  NUMBERED_LIST_PATTERN,
  LETTER_LIST_PATTERN,
  CUSTOM_LIST_PATTERN,
  CHECKBOX_PATTERN,
} from '../src/utils/patterns';

describe('patterns', () => {
  describe('detectListMarker', () => {
    test('should detect checkbox marker', () => {
      const result = detectListMarker('- [ ] Task text');
      expect(result.type).toBe('checkbox');
      expect(result.indent).toBe('');
      expect(result.marker).toBe('- [ ] ');
      expect(result.text).toBe('Task text');
    });

    test('should detect bullet marker', () => {
      const result = detectListMarker('- Task text');
      expect(result.type).toBe('bullet');
      expect(result.indent).toBe('');
      expect(result.marker).toBe('- ');
      expect(result.text).toBe('Task text');
    });

    test('should detect numbered marker', () => {
      const result = detectListMarker('1. Task text');
      expect(result.type).toBe('numbered');
      expect(result.indent).toBe('');
      expect(result.marker).toBe('1. ');
      expect(result.text).toBe('Task text');
    });

    test('should detect letter marker', () => {
      const result = detectListMarker('a) Task text');
      expect(result.type).toBe('letter');
      expect(result.indent).toBe('');
      expect(result.marker).toBe('a) ');
      expect(result.text).toBe('Task text');
    });

    test('should detect quote marker', () => {
      const result = detectListMarker('> Task text');
      expect(result.type).toBe('quote');
      expect(result.indent).toBe('');
      expect(result.marker).toBe('> ');
      expect(result.text).toBe('Task text');
    });

    test('should handle indented lines', () => {
      const result = detectListMarker('  - [ ] Indented task');
      expect(result.type).toBe('checkbox');
      expect(result.indent).toBe('  ');
      expect(result.marker).toBe('- [ ] ');
      expect(result.text).toBe('Indented task');
    });

    test('should return none for plain text', () => {
      const result = detectListMarker('Plain text line');
      expect(result.type).toBe('none');
      expect(result.indent).toBe('');
      expect(result.marker).toBe('');
      expect(result.text).toBe('Plain text line');
    });
  });

  describe('PRIORITY_TOKEN_REGEX', () => {
    test('should match priority tokens with different letters', () => {
      expect(PRIORITY_TOKEN_REGEX.test('[#A]')).toBe(true);
      expect(PRIORITY_TOKEN_REGEX.test('[#B]')).toBe(true);
      expect(PRIORITY_TOKEN_REGEX.test('[#C]')).toBe(true);
    });

    test('should not match invalid priority letters', () => {
      expect(PRIORITY_TOKEN_REGEX.test('[#D]')).toBe(false);
      expect(PRIORITY_TOKEN_REGEX.test('[#Z]')).toBe(false);
    });

    test('should match priority tokens with surrounding spaces', () => {
      expect(PRIORITY_TOKEN_REGEX.test(' [#A] ')).toBe(true);
      expect(PRIORITY_TOKEN_REGEX.test('\t[#B]\t')).toBe(true);
    });

    test('should capture priority letter in group 2', () => {
      const match = PRIORITY_TOKEN_REGEX.exec('Task [#B] here');
      expect(match?.[2]).toBe('B');
    });
  });

  describe('CHECKBOX_REGEX', () => {
    test('should match markdown checkbox patterns with required spacing', () => {
      expect(CHECKBOX_REGEX.test('- [x] some task text')).toBe(true);
      expect(CHECKBOX_REGEX.test('* [ ] another test')).toBe(true);
      expect(CHECKBOX_REGEX.test('+ [x] more words here')).toBe(true);
    });

    test('should capture checkbox components', () => {
      const match = CHECKBOX_REGEX.exec('- [x] some task text');
      expect(match?.[1]).toBe(''); // leading spaces
      expect(match?.[2]).toBe('- [x]'); // full checkbox (note: no trailing space in capture)
      expect(match?.[3]).toBe('x'); // checkbox status
      expect(match?.[4]).toBe('some'); // first word
      expect(match?.[5]).toBe('task text'); // rest of text
    });

    test('should match with leading indentation', () => {
      const match = CHECKBOX_REGEX.exec('  - [ ] indented task here');
      expect(match?.[1]).toBe('  '); // leading spaces
      expect(match?.[2]).toBe('- [ ]'); // full checkbox (note: no trailing space in capture)
    });

    test('should not match invalid checkbox patterns', () => {
      expect(CHECKBOX_REGEX.test('- [X] task')).toBe(false); // uppercase X
      expect(CHECKBOX_REGEX.test('- [] task')).toBe(false); // no space inside
      expect(CHECKBOX_REGEX.test('[] task')).toBe(false); // no list marker
    });

    test('should not match single word after checkbox', () => {
      expect(CHECKBOX_REGEX.test('- [ ] task')).toBe(false); // only one word
      expect(CHECKBOX_REGEX.test('- [x] single')).toBe(false); // only one word
    });
  });

  describe('List Pattern Detection', () => {
    test('should match bullet list patterns', () => {
      expect(BULLET_LIST_PATTERN.test('- ')).toBe(true);
      expect(BULLET_LIST_PATTERN.test('* ')).toBe(true);
      expect(BULLET_LIST_PATTERN.test('+ ')).toBe(true);
    });

    test('should match numbered list patterns', () => {
      expect(NUMBERED_LIST_PATTERN.test('1. ')).toBe(true);
      expect(NUMBERED_LIST_PATTERN.test('2) ')).toBe(true);
      expect(NUMBERED_LIST_PATTERN.test('12. ')).toBe(true);
    });

    test('should match letter list patterns', () => {
      expect(LETTER_LIST_PATTERN.test('a. ')).toBe(true);
      expect(LETTER_LIST_PATTERN.test('B) ')).toBe(true);
    });

    test('should match custom list patterns', () => {
      expect(CUSTOM_LIST_PATTERN.test('(A1) ')).toBe(true);
      expect(CUSTOM_LIST_PATTERN.test('(B2) ')).toBe(true);
    });

    test('should match checkbox patterns', () => {
      expect(CHECKBOX_PATTERN.test('[ ] ')).toBe(true);
      expect(CHECKBOX_PATTERN.test('[x] ')).toBe(true);
      expect(CHECKBOX_PATTERN.test('[*] ')).toBe(true);
    });
  });
});
