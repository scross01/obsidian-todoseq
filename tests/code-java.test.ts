import { registry, regexBuilder } from './test-setup';

describe('Java Language Comment Task Parsing', () => {
  const javaLanguage = registry.getLanguage('java');
  
  if (!javaLanguage) {
    throw new Error('Java language not found in registry');
  }

  const regexPair = regexBuilder.buildRegex(['TODO'], javaLanguage);

  describe('Single-line comments', () => {
    test('should detect TODO in single-line comment', () => {
      const line = '// TODO test task in Java single line comment';
      expect(regexPair.test.test(line)).toBe(true);
      
      const match = regexPair.capture.exec(line);
      expect(match).toBeTruthy();
      expect(match![1]).toBe(''); // indent
      expect(match![2]).toBe('// '); // comment prefix
      expect(match![4]).toBe('TODO'); // keyword
      expect(match![5]).toBe('test task in Java single line comment'); // text
    });

    test('should detect TODO in indented single-line comment', () => {
      const line = '        // TODO test task in Java indented comment';
      expect(regexPair.test.test(line)).toBe(true);
      
      const match = regexPair.capture.exec(line);
      expect(match).toBeTruthy();
      expect(match![1]).toBe('        '); // indent
      expect(match![2]).toBe('// '); // comment prefix
      expect(match![4]).toBe('TODO'); // keyword
      expect(match![5]).toBe('test task in Java indented comment'); // text
    });

    test('should detect TODO in inline single-line comment', () => {
      const line = 'public static void test1() {  // TODO test task in Java inline comment';
      expect(regexPair.test.test(line)).toBe(true);
      
      const match = regexPair.capture.exec(line);
      expect(match).toBeTruthy();
      expect(match![1]).toBe(''); // indent
      expect(match![2]).toBe('public static void test1() {  // '); // comment prefix
      expect(match![4]).toBe('TODO'); // keyword
      expect(match![5]).toBe('test task in Java inline comment'); // text
    });
  });

  describe('Multi-line comments', () => {
    test('should detect TODO in multi-line comment on first line', () => {
      const line = '    /* TODO test task in Java single line comment multiline comment syntax */';
      expect(regexPair.test.test(line)).toBe(true);
      
      const match = regexPair.capture.exec(line);
      expect(match).toBeTruthy();
      expect(match![1]).toBe('    '); // indent
      expect(match![2]).toBe('/* '); // comment prefix
      expect(match![4]).toBe('TODO'); // keyword
      expect(match![5]).toBe('test task in Java single line comment multiline comment syntax'); // text
      expect(match![6]).toBe(' */'); // trailing comment end
    });

    test('should detect TODO in multi-line comment with asterisk', () => {
      const line = '    /* TODO test task in Java multiline comment';
      expect(regexPair.test.test(line)).toBe(true);
      
      const match = regexPair.capture.exec(line);
      expect(match).toBeTruthy();
      expect(match![1]).toBe('    '); // indent
      expect(match![2]).toBe('/* '); // comment prefix
      expect(match![4]).toBe('TODO'); // keyword
      expect(match![5]).toBe('test task in Java multiline comment'); // text
    });

    test('should detect TODO in multi-line comment with additional asterisk', () => {
      const line = '    * TODO test task in Java multiline comment';
      expect(regexPair.test.test(line)).toBe(true);
      
      const match = regexPair.capture.exec(line);
      expect(match).toBeTruthy();
      expect(match![1]).toBe('    '); // indent
      expect(match![2]).toBe('* '); // comment prefix
      expect(match![4]).toBe('TODO'); // keyword
      expect(match![5]).toBe('test task in Java multiline comment'); // text
    });

    test('should detect TODO in Javadoc style comment', () => {
      const line = '    /** TODO test task in Javadoc style comment';
      expect(regexPair.test.test(line)).toBe(true);
      
      const match = regexPair.capture.exec(line);
      expect(match).toBeTruthy();
      expect(match![1]).toBe('    '); // indent
      expect(match![2]).toBe('/** '); // comment prefix
      expect(match![4]).toBe('TODO'); // keyword
      expect(match![5]).toBe('test task in Javadoc style comment'); // text
    });

    test('should detect TODO in inline multi-line comment', () => {
      const line = 'public static void test2() { /* TODO test task in Java inline comment using multiline comment syntax */';
      expect(regexPair.test.test(line)).toBe(true);
    
      const match = regexPair.capture.exec(line);
      expect(match).toBeTruthy();
      expect(match![1]).toBe(''); // indent
      expect(match![2]).toBe('public static void test2() { /* '); // comment prefix
      expect(match![4]).toBe('TODO'); // keyword
      expect(match![5]).toBe('test task in Java inline comment using multiline comment syntax'); // text
      expect(match![6]).toBe(' */'); // trailing comment end
    });
  });

  describe('Edge cases', () => {
    test('should detect TODO with different spacing', () => {
      const line = '//TODO test task without space after comment';
      expect(regexPair.test.test(line)).toBe(false); // Should fail because we expect space after comment
    });

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