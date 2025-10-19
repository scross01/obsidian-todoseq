import { registry, regexBuilder } from './test-setup';

describe('INI Language Comment Task Parsing', () => {
  const iniLanguage = registry.getLanguage('ini');
  
  if (!iniLanguage) {
    throw new Error('INI language not found in registry');
  }

  const regexPair = regexBuilder.buildRegex(['TODO'], iniLanguage);

  describe('Single-line comments', () => {
    test('should detect TODO in single-line comment', () => {
      const line = '; TODO test task in INI single line comment';
      expect(regexPair.test.test(line)).toBe(true);
      
      const match = regexPair.capture.exec(line);
      expect(match).toBeTruthy();
      expect(match![1]).toBe(''); // indent
      expect(match![2]).toBe('; '); // comment prefix
      expect(match![4]).toBe('TODO'); // keyword
      expect(match![5]).toBe('test task in INI single line comment'); // text
    });

    test('should detect TODO in indented single-line comment', () => {
      const line = '        ; TODO test task in INI indented comment';
      expect(regexPair.test.test(line)).toBe(true);
      
      const match = regexPair.capture.exec(line);
      expect(match).toBeTruthy();
      expect(match![1]).toBe('        '); // indent
      expect(match![2]).toBe('; '); // comment prefix
      expect(match![4]).toBe('TODO'); // keyword
      expect(match![5]).toBe('test task in INI indented comment'); // text
    });

    // TODO: Fix hash comment test - INI has multiple comment syntaxes
    // test('should detect TODO in hash comment', () => {
    //   const line = '    # TODO test task in INI hash comment';
    //   expect(regexPair.test.test(line)).toBe(true);
    //
    //   const match = regexPair.capture.exec(line);
    //   expect(match).toBeTruthy();
    //   expect(match![1]).toBe('    '); // indent
    //   expect(match![2]).toBe('# '); // comment prefix
    //   expect(match![4]).toBe('TODO'); // keyword
    //   expect(match![5]).toBe('test task in INI hash comment'); // text
    // });
  });

  describe('Edge cases', () => {
    // test('should not detect TODO without comment prefix', () => {
    //   const line = 'TODO test task without comment prefix';
    //   expect(regexPair.test.test(line)).toBe(false);
    // });

    // test('should not detect TODO in non-comment code', () => {
    //   const line = 'TODO test task in regular code';
    //   expect(regexPair.test.test(line)).toBe(false);
    // });

    // test('should detect TODO with different spacing', () => {
    //   const line = ';TODO test task without space after comment';
    //   expect(regexPair.test.test(line)).toBe(false); // Should fail because we expect space after comment
    // });

    test('should detect TODO with multiple spaces', () => {
      const line = '    ;    TODO test task with multiple spaces';
      expect(regexPair.test.test(line)).toBe(true);
      
      const match = regexPair.capture.exec(line);
      expect(match).toBeTruthy();
      expect(match![1]).toBe('    '); // indent
      expect(match![2]).toBe(';    '); // comment prefix
      expect(match![4]).toBe('TODO'); // keyword
      expect(match![5]).toBe('test task with multiple spaces'); // text
    });
  });
});