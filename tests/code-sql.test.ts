import { registry, regexBuilder } from './test-setup';

describe('SQL Language Comment Task Parsing', () => {
  const sqlLanguage = registry.getLanguage('sql');
  
  if (!sqlLanguage) {
    throw new Error('SQL language not found in registry');
  }

  const regexPair = regexBuilder.buildRegex(['TODO'], sqlLanguage);

  describe('Single-line comments', () => {
    test('should detect TODO in single-line comment', () => {
      const line = '-- TODO test task in SQL single line comment';
      expect(regexPair.test.test(line)).toBe(true);
      
      const match = regexPair.capture.exec(line);
      expect(match).toBeTruthy();
      expect(match![1]).toBe(''); // indent
      expect(match![2]).toBe('-- '); // comment prefix
      expect(match![4]).toBe('TODO'); // keyword
      expect(match![5]).toBe('test task in SQL single line comment'); // text
    });

    test('should detect TODO in indented single-line comment', () => {
      const line = '        -- TODO test task in SQL indented comment';
      expect(regexPair.test.test(line)).toBe(true);
      
      const match = regexPair.capture.exec(line);
      expect(match).toBeTruthy();
      expect(match![1]).toBe('        '); // indent
      expect(match![2]).toBe('-- '); // comment prefix
      expect(match![4]).toBe('TODO'); // keyword
      expect(match![5]).toBe('test task in SQL indented comment'); // text
    });

    test('should detect TODO in inline single-line comment', () => {
      const line = 'SELECT * FROM users  -- TODO test task in SQL inline comment';
      expect(regexPair.test.test(line)).toBe(true);
      
      const match = regexPair.capture.exec(line);
      expect(match).toBeTruthy();
      expect(match![1]).toBe(''); // indent
      expect(match![2]).toBe('SELECT * FROM users  -- '); // comment prefix
      expect(match![4]).toBe('TODO'); // keyword
      expect(match![5]).toBe('test task in SQL inline comment'); // text
    });

    test('should detect TODO in MySQL-style comment', () => {
      const line = '    # TODO test task in MySQL-style comment';
      expect(regexPair.test.test(line)).toBe(true);
    
      const match = regexPair.capture.exec(line);
      expect(match).toBeTruthy();
      expect(match![1]).toBe('    '); // indent
      expect(match![2]).toBe('# '); // comment prefix
      expect(match![4]).toBe('TODO'); // keyword
      expect(match![5]).toBe('test task in MySQL-style comment'); // text
    });
  });

  describe('Multi-line comments', () => {
    test('should detect TODO in multi-line comment', () => {
      const line = '    /* TODO test task in SQL multi-line comment';
      expect(regexPair.test.test(line)).toBe(true);
      
      const match = regexPair.capture.exec(line);
      expect(match).toBeTruthy();
      expect(match![1]).toBe('    '); // indent
      expect(match![2]).toBe('/* '); // comment prefix
      expect(match![4]).toBe('TODO'); // keyword
      expect(match![5]).toBe('test task in SQL multi-line comment'); // text
    });

    test('should detect TODO in multi-line comment with asterisk', () => {
      const line = '    * TODO test task in SQL multi-line comment';
      expect(regexPair.test.test(line)).toBe(true);
      
      const match = regexPair.capture.exec(line);
      expect(match).toBeTruthy();
      expect(match![1]).toBe('    '); // indent
      expect(match![2]).toBe('* '); // comment prefix
      expect(match![4]).toBe('TODO'); // keyword
      expect(match![5]).toBe('test task in SQL multi-line comment'); // text
    });

    test('should detect TODO in inline multi-line comment', () => {
      const line = 'SELECT * FROM users /* TODO test task in SQL inline comment */';
      expect(regexPair.test.test(line)).toBe(true);
    
      const match = regexPair.capture.exec(line);
      expect(match).toBeTruthy();
      expect(match![1]).toBe(''); // indent
      expect(match![2]).toBe('SELECT * FROM users /* '); // comment prefix
      expect(match![4]).toBe('TODO'); // keyword
      expect(match![5]).toBe('test task in SQL inline comment'); // text
      expect(match![6]).toBe(' */'); // trailing comment end
    });
  });

  describe('Edge cases', () => {
    test('should not detect TODO in non-comment code', () => {
      const line = 'insert "TODO test task in regular code" into tasks;';
      expect(regexPair.test.test(line)).toBe(false);
    });

    test('should detect TODO with different spacing', () => {
      const line = '--TODO test task without space after comment';
      expect(regexPair.test.test(line)).toBe(false); // Should fail because we expect space after comment
    });

    test('should detect TODO with multiple spaces', () => {
      const line = '    --    TODO test task with multiple spaces';
      expect(regexPair.test.test(line)).toBe(true);
      
      const match = regexPair.capture.exec(line);
      expect(match).toBeTruthy();
      expect(match![1]).toBe('    '); // indent
      expect(match![2]).toBe('--    '); // comment prefix
      expect(match![4]).toBe('TODO'); // keyword
      expect(match![5]).toBe('test task with multiple spaces'); // text
    });
  });
});