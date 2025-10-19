import { registry, regexBuilder } from './test-setup';

describe('C/C++ Language Comment Task Parsing', () => {
  const cppLanguage = registry.getLanguage('cpp');
  
  if (!cppLanguage) {
    throw new Error('C++ language not found in registry');
  }

  const regexPair = regexBuilder.buildRegex(['TODO'], cppLanguage);

  describe('Single-line comments', () => {
    test('should detect TODO in single-line comment', () => {
      const line = '// TODO test task in C++ single line comment';
      expect(regexPair.test.test(line)).toBe(true);
      
      const match = regexPair.capture.exec(line);
      expect(match).toBeTruthy();
      expect(match![1]).toBe(''); // indent
      expect(match![2]).toBe('// '); // comment prefix
      expect(match![4]).toBe('TODO'); // keyword
      expect(match![5]).toBe('test task in C++ single line comment'); // text
    });

    test('should detect TODO in indented single-line comment', () => {
      const line = '        // TODO test task in C++ indented comment';
      expect(regexPair.test.test(line)).toBe(true);
      
      const match = regexPair.capture.exec(line);
      expect(match).toBeTruthy();
      expect(match![1]).toBe('        '); // indent
      expect(match![2]).toBe('// '); // comment prefix
      expect(match![4]).toBe('TODO'); // keyword
      expect(match![5]).toBe('test task in C++ indented comment'); // text
    });

    test('should detect TODO in inline single-line comment', () => {
      const line = 'void test1() {  // TODO test task in C++ inline comment';
      expect(regexPair.test.test(line)).toBe(true);
      
      const match = regexPair.capture.exec(line);
      expect(match).toBeTruthy();
      expect(match![1]).toBe(''); // indent
      expect(match![2]).toBe('void test1() {  // '); // comment prefix
      expect(match![4]).toBe('TODO'); // keyword
      expect(match![5]).toBe('test task in C++ inline comment'); // text
    });
  });

  describe('Multi-line comments', () => {
    test('should detect TODO in multi-line comment on first line', () => {
      const line = '    /* TODO test task in C++ single line comment multiline comment syntax */';
      expect(regexPair.test.test(line)).toBe(true);
      
      const match = regexPair.capture.exec(line);
      expect(match).toBeTruthy();
      expect(match![1]).toBe('    '); // indent
      expect(match![2]).toBe('/* '); // comment prefix
      expect(match![4]).toBe('TODO'); // keyword
      expect(match![5]).toBe('test task in C++ single line comment multiline comment syntax'); // text
      expect(match![6]).toBe(' */'); // trailing comment end
    });

    test('should detect TODO in multi-line comment with asterisk', () => {
      const line = '/* TODO test task in C++ multiline comment';
      expect(regexPair.test.test(line)).toBe(true);
      
      const match = regexPair.capture.exec(line);
      expect(match).toBeTruthy();
      expect(match![1]).toBe(''); // indent
      expect(match![2]).toBe('/* '); // comment prefix
      expect(match![4]).toBe('TODO'); // keyword
      expect(match![5]).toBe('test task in C++ multiline comment'); // text
    });

    test('should detect TODO in multi-line comment with additional asterisk', () => {
      const line = ' * TODO test task in C++ multiline comment';
      expect(regexPair.test.test(line)).toBe(true);
      
      const match = regexPair.capture.exec(line);
      expect(match).toBeTruthy();
      expect(match![1]).toBe(' '); // indent
      expect(match![2]).toBe('* '); // comment prefix
      expect(match![4]).toBe('TODO'); // keyword
      expect(match![5]).toBe('test task in C++ multiline comment'); // text
    });

    test('should detect TODO in Doxygen-style comment', () => {
      const line = '/** TODO test task in Doxygen-style comment';
      expect(regexPair.test.test(line)).toBe(true);
      
      const match = regexPair.capture.exec(line);
      expect(match).toBeTruthy();
      expect(match![1]).toBe(''); // indent
      expect(match![2]).toBe('/** '); // comment prefix
      expect(match![4]).toBe('TODO'); // keyword
      expect(match![5]).toBe('test task in Doxygen-style comment'); // text
    });

    test('should detect TODO in inline multi-line comment', () => {
      const line = 'void test2() { /* TODO test task in C++ inline comment */';
      expect(regexPair.test.test(line)).toBe(true);
    
      const match = regexPair.capture.exec(line);
      expect(match).toBeTruthy();
      expect(match![1]).toBe(''); // indent
      expect(match![2]).toBe('void test2() { /* '); // comment prefix (inline pattern)
      expect(match![4]).toBe('TODO'); // keyword
      expect(match![5]).toBe('test task in C++ inline comment'); // text
      expect(match![6]).toBe(' */'); // trailing comment end
    });
  });

  describe('Edge cases', () => {
    test('should not detect TODO in non-comment code', () => {
      const line = 'print("TODO test task in regular code")';
      expect(regexPair.test.test(line)).toBe(false);
    });

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