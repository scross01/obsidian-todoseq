import { registry, regexBuilder } from './test-setup';

describe('Shell/Bash Language Comment Task Parsing', () => {
  const shellLanguage = registry.getLanguage('shell');
  
  if (!shellLanguage) {
    throw new Error('Shell language not found in registry');
  }

  const regexPair = regexBuilder.buildRegex(['TODO'], shellLanguage);

  describe('Single-line comments', () => {
    test('should detect TODO in single-line comment', () => {
      const line = '# TODO test task in Shell single line comment';
      expect(regexPair.test.test(line)).toBe(true);
      
      const match = regexPair.capture.exec(line);
      expect(match).toBeTruthy();
      expect(match![1]).toBe(''); // indent
      expect(match![2]).toBe('# '); // comment prefix
      expect(match![4]).toBe('TODO'); // keyword
      expect(match![5]).toBe('test task in Shell single line comment'); // text
    });

    test('should detect TODO in indented single-line comment', () => {
      const line = '        # TODO test task in Shell indented comment';
      expect(regexPair.test.test(line)).toBe(true);
      
      const match = regexPair.capture.exec(line);
      expect(match).toBeTruthy();
      expect(match![1]).toBe('        '); // indent
      expect(match![2]).toBe('# '); // comment prefix
      expect(match![4]).toBe('TODO'); // keyword
      expect(match![5]).toBe('test task in Shell indented comment'); // text
    });

    test('should detect TODO in inline single-line comment', () => {
      const line = 'echo "hello"  # TODO test task in Shell inline comment';
      expect(regexPair.test.test(line)).toBe(true);
      
      const match = regexPair.capture.exec(line);
      expect(match).toBeTruthy();
      expect(match![1]).toBe(''); // indent
      expect(match![2]).toBe('echo "hello"  # '); // comment prefix
      expect(match![4]).toBe('TODO'); // keyword
      expect(match![5]).toBe('test task in Shell inline comment'); // text
    });
  });

  describe('Edge cases', () => {
    test('should not detect TODO in non-comment code', () => {
      const line = 'echo "TODO test task in regular code"';
      expect(regexPair.test.test(line)).toBe(false);
    });

    test('should detect TODO with different spacing', () => {
      const line = '#TODO test task without space after comment';
      expect(regexPair.test.test(line)).toBe(false); // Should fail because we expect space after comment
    });

    test('should detect TODO with multiple spaces', () => {
      const line = '    #    TODO test task with multiple spaces';
      expect(regexPair.test.test(line)).toBe(true);
      
      const match = regexPair.capture.exec(line);
      expect(match).toBeTruthy();
      expect(match![1]).toBe('    '); // indent
      expect(match![2]).toBe('#    '); // comment prefix
      expect(match![4]).toBe('TODO'); // keyword
      expect(match![5]).toBe('test task with multiple spaces'); // text
    });
  });
});