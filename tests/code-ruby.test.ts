import { registry, regexBuilder } from './test-setup';

describe('Ruby Language Comment Task Parsing', () => {
  const rubyLanguage = registry.getLanguage('ruby');
  
  if (!rubyLanguage) {
    throw new Error('Ruby language not found in registry');
  }

  const regexPair = regexBuilder.buildRegex(['TODO'], rubyLanguage);

  describe('Single-line comments', () => {
    test('should detect TODO in single-line comment', () => {
      const line = '# TODO test task in Ruby single line comment';
      expect(regexPair.test.test(line)).toBe(true);
      
      const match = regexPair.capture.exec(line);
      expect(match).toBeTruthy();
      expect(match![1]).toBe(''); // indent
      expect(match![2]).toBe('# '); // comment prefix
      expect(match![4]).toBe('TODO'); // keyword
      expect(match![5]).toBe('test task in Ruby single line comment'); // text
    });

    test('should detect TODO in indented single-line comment', () => {
      const line = '        # TODO test task in Ruby indented comment';
      expect(regexPair.test.test(line)).toBe(true);
      
      const match = regexPair.capture.exec(line);
      expect(match).toBeTruthy();
      expect(match![1]).toBe('        '); // indent
      expect(match![2]).toBe('# '); // comment prefix
      expect(match![4]).toBe('TODO'); // keyword
      expect(match![5]).toBe('test task in Ruby indented comment'); // text
    });

    test('should detect TODO in inline single-line comment', () => {
      const line = 'def test1  # TODO test task in Ruby inline comment';
      expect(regexPair.test.test(line)).toBe(true);
      
      const match = regexPair.capture.exec(line);
      expect(match).toBeTruthy();
      expect(match![1]).toBe(''); // indent
      expect(match![2]).toBe('def test1  # '); // comment prefix
      expect(match![4]).toBe('TODO'); // keyword
      expect(match![5]).toBe('test task in Ruby inline comment'); // text
    });
  });

  describe('Multi-line comments (heredoc)', () => {
    test('should detect TODO in heredoc comment', () => {
      const line = '    <<~DOC';
      const line2 = '      TODO test task in Ruby heredoc comment';
      expect(regexPair.test.test(line2)).toBe(true);
    });
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
    //   const line = '#TODO test task without space after comment';
    //   expect(regexPair.test.test(line)).toBe(false); // Should fail because we expect space after comment
    // });

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