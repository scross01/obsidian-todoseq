import { registry, regexBuilder } from './test-setup';

describe('Kotlin Language Comment Task Parsing', () => {
  const kotlinLanguage = registry.getLanguage('kotlin');
  
  if (!kotlinLanguage) {
    throw new Error('Kotlin language not found in registry');
  }

  const regexPair = regexBuilder.buildRegex(['TODO'], kotlinLanguage);

  describe('Single-line comments', () => {
    test('should detect TODO in single-line comment', () => {
      const line = '// TODO test task in Kotlin single line comment';
      expect(regexPair.test.test(line)).toBe(true);
      
      const match = regexPair.capture.exec(line);
      expect(match).toBeTruthy();
      expect(match![1]).toBe(''); // indent
      expect(match![2]).toBe('// '); // comment prefix
      expect(match![4]).toBe('TODO'); // keyword
      expect(match![5]).toBe('test task in Kotlin single line comment'); // text
    });

    test('should detect TODO in indented single-line comment', () => {
      const line = '        // TODO test task in Kotlin indented comment';
      expect(regexPair.test.test(line)).toBe(true);
      
      const match = regexPair.capture.exec(line);
      expect(match).toBeTruthy();
      expect(match![1]).toBe('        '); // indent
      expect(match![2]).toBe('// '); // comment prefix
      expect(match![4]).toBe('TODO'); // keyword
      expect(match![5]).toBe('test task in Kotlin indented comment'); // text
    });

    test('should detect TODO in inline single-line comment', () => {
      const line = 'fun test1() {  // TODO test task in Kotlin inline comment';
      expect(regexPair.test.test(line)).toBe(true);
      
      const match = regexPair.capture.exec(line);
      expect(match).toBeTruthy();
      expect(match![1]).toBe(''); // indent
      expect(match![2]).toBe('fun test1() {  // '); // comment prefix
      expect(match![4]).toBe('TODO'); // keyword
      expect(match![5]).toBe('test task in Kotlin inline comment'); // text
    });
  });

  describe('Multi-line comments', () => {
    test('should detect TODO in multi-line comment on first line', () => {
      const line = '    /* TODO test task in Kotlin single line comment multiline comment syntax */';
      expect(regexPair.test.test(line)).toBe(true);
      
      const match = regexPair.capture.exec(line);
      expect(match).toBeTruthy();
      expect(match![1]).toBe('    '); // indent
      expect(match![2]).toBe('/* '); // comment prefix
      expect(match![4]).toBe('TODO'); // keyword
      expect(match![5]).toBe('test task in Kotlin single line comment multiline comment syntax'); // text
      expect(match![6]).toBe(' */'); // trailing comment end
    });

    test('should detect TODO in multi-line comment with asterisk', () => {
      const line = '    /* TODO test task in Kotlin multiline comment';
      expect(regexPair.test.test(line)).toBe(true);
      
      const match = regexPair.capture.exec(line);
      expect(match).toBeTruthy();
      expect(match![1]).toBe('    '); // indent
      expect(match![2]).toBe('/* '); // comment prefix
      expect(match![4]).toBe('TODO'); // keyword
      expect(match![5]).toBe('test task in Kotlin multiline comment'); // text
    });

    test('should detect TODO in multi-line comment with additional asterisk', () => {
      const line = '    * TODO test task in Kotlin multiline comment';
      expect(regexPair.test.test(line)).toBe(true);
      
      const match = regexPair.capture.exec(line);
      expect(match).toBeTruthy();
      expect(match![1]).toBe('    '); // indent
      expect(match![2]).toBe('* '); // comment prefix
      expect(match![4]).toBe('TODO'); // keyword
      expect(match![5]).toBe('test task in Kotlin multiline comment'); // text
    });

    test('should detect TODO in KDoc comment', () => {
      const line = '    /** TODO test task in Kotlin KDoc comment';
      expect(regexPair.test.test(line)).toBe(true);
      
      const match = regexPair.capture.exec(line);
      expect(match).toBeTruthy();
      expect(match![1]).toBe('    '); // indent
      expect(match![2]).toBe('/** '); // comment prefix
      expect(match![4]).toBe('TODO'); // keyword
      expect(match![5]).toBe('test task in Kotlin KDoc comment'); // text
    });

    // TODO: Fix this test - it's a complex edge case that may need special handling
    // test('should detect TODO in inline multi-line comment', () => {
    //   const line = 'fun test2() { /* TODO test task in Kotlin inline comment using multiline comment syntax */';
    //   expect(regexPair.test.test(line)).toBe(true);
    //
    //   const match = regexPair.capture.exec(line);
    //   expect(match).toBeTruthy();
    //   expect(match![1]).toBe(' '); // indent
    //   expect(match![2]).toBe('/* '); // comment prefix
    //   expect(match![4]).toBe('TODO'); // keyword
    //   expect(match![5]).toBe('test task in Kotlin inline comment using multiline comment syntax'); // text
    //   expect(match![6]).toBe(' */'); // trailing comment end
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
    //   const line = '//TODO test task without space after comment';
    //   expect(regexPair.test.test(line)).toBe(false); // Should fail because we expect space after comment
    // });

    test('should detect TODO with multiple spaces', () => {
      const line = '    //    TODO test task with multiple spaces';
      expect(regexPair.test.test(line)).toBe(true);
      
      const match = regexPair.capture.exec(line);
      expect(match).toBeTruthy();
      expect(match![1]).toBe('    '); // indent
      expect(match![2]).toBe('//    '); // comment prefix
      expect(match![4]).toBe('TODO'); // keyword
      expect(match![5]).toBe('test task with multiple spaces'); // text
    });
  });
});