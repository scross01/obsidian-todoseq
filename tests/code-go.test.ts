import { registry, regexBuilder } from './test-setup';

describe('Go Language Comment Task Parsing', () => {
  const goLanguage = registry.getLanguage('go');
  
  if (!goLanguage) {
    throw new Error('Go language not found in registry');
  }

  const regexPair = regexBuilder.buildRegex(['TODO'], goLanguage);

  describe('Single-line comments', () => {
    test('should detect TODO in single-line comment', () => {
      const line = '// TODO test task in Go single line comment';
      expect(regexPair.test.test(line)).toBe(true);
      
      const match = regexPair.capture.exec(line);
      expect(match).toBeTruthy();
      expect(match![1]).toBe(''); // indent
      expect(match![2]).toBe('// '); // comment prefix
      expect(match![4]).toBe('TODO'); // keyword
      expect(match![5]).toBe('test task in Go single line comment'); // text
    });

    test('should detect TODO in indented single-line comment', () => {
      const line = '        // TODO test task in Go indented comment';
      expect(regexPair.test.test(line)).toBe(true);
      
      const match = regexPair.capture.exec(line);
      expect(match).toBeTruthy();
      expect(match![1]).toBe('        '); // indent
      expect(match![2]).toBe('// '); // comment prefix
      expect(match![4]).toBe('TODO'); // keyword
      expect(match![5]).toBe('test task in Go indented comment'); // text
    });

    test('should detect TODO in inline single-line comment', () => {
      const line = 'func test1() {  // TODO test task in Go inline comment';
      expect(regexPair.test.test(line)).toBe(true);
      
      const match = regexPair.capture.exec(line);
      expect(match).toBeTruthy();
      expect(match![1]).toBe(''); // indent
      expect(match![2]).toBe('func test1() {  // '); // comment prefix
      expect(match![4]).toBe('TODO'); // keyword
      expect(match![5]).toBe('test task in Go inline comment'); // text
    });
  });

  describe('Multi-line comments', () => {
    test('should detect TODO in multi-line comment on first line', () => {
      const line = '    /* TODO test task in Go single line comment multiline comment syntax */';
      expect(regexPair.test.test(line)).toBe(true);
      
      const match = regexPair.capture.exec(line);
      expect(match).toBeTruthy();
      expect(match![1]).toBe('    '); // indent
      expect(match![2]).toBe('/* '); // comment prefix
      expect(match![4]).toBe('TODO'); // keyword
      expect(match![5]).toBe('test task in Go single line comment multiline comment syntax'); // text
      expect(match![6]).toBe(' */'); // trailing comment end
    });

    test('should detect TODO in multi-line comment with asterisk', () => {
      const line = '    /* TODO test task in Go multiline comment';
      expect(regexPair.test.test(line)).toBe(true);
      
      const match = regexPair.capture.exec(line);
      expect(match).toBeTruthy();
      expect(match![1]).toBe('    '); // indent
      expect(match![2]).toBe('/* '); // comment prefix
      expect(match![4]).toBe('TODO'); // keyword
      expect(match![5]).toBe('test task in Go multiline comment'); // text
    });

    test('should detect TODO in multi-line comment with additional asterisk', () => {
      const line = '    * TODO test task in Go multiline comment';
      expect(regexPair.test.test(line)).toBe(true);
      
      const match = regexPair.capture.exec(line);
      expect(match).toBeTruthy();
      expect(match![1]).toBe('    '); // indent
      expect(match![2]).toBe('* '); // comment prefix
      expect(match![4]).toBe('TODO'); // keyword
      expect(match![5]).toBe('test task in Go multiline comment'); // text
    });

    test('should detect TODO in package documentation comment', () => {
      const line = '    /* TODO test task in Go package documentation';
      expect(regexPair.test.test(line)).toBe(true);
      
      const match = regexPair.capture.exec(line);
      expect(match).toBeTruthy();
      expect(match![1]).toBe('    '); // indent
      expect(match![2]).toBe('/* '); // comment prefix
      expect(match![4]).toBe('TODO'); // keyword
      expect(match![5]).toBe('test task in Go package documentation'); // text
    });

    test('should detect TODO in inline multi-line comment', () => {
      const line = 'func test2() { /* TODO test task in Go inline comment using multiline comment syntax */';
      expect(regexPair.test.test(line)).toBe(true);
    
      const match = regexPair.capture.exec(line);
      expect(match).toBeTruthy();
      expect(match![1]).toBe(''); // indent
      expect(match![2]).toBe('func test2() { /* '); // comment prefix
      expect(match![4]).toBe('TODO'); // keyword
      expect(match![5]).toBe('test task in Go inline comment using multiline comment syntax'); // text
      expect(match![6]).toBe(' */'); // trailing comment end
    });
  });

  describe('Edge cases', () => {
    test('should not detect TODO in non-comment code', () => {
      const line = 'return("TODO test task in regular code")';
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