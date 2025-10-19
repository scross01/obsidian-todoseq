import { registry, regexBuilder } from './test-setup';

describe('PowerShell Language Comment Task Parsing', () => {
  const powershellLanguage = registry.getLanguage('powershell');
  
  if (!powershellLanguage) {
    throw new Error('PowerShell language not found in registry');
  }

  const regexPair = regexBuilder.buildRegex(['TODO'], powershellLanguage);

  describe('Single-line comments', () => {
    test('should detect TODO in single-line comment', () => {
      const line = '# TODO test task in PowerShell single line comment';
      expect(regexPair.test.test(line)).toBe(true);
      
      const match = regexPair.capture.exec(line);
      expect(match).toBeTruthy();
      expect(match![1]).toBe(''); // indent
      expect(match![2]).toBe('# '); // comment prefix
      expect(match![4]).toBe('TODO'); // keyword
      expect(match![5]).toBe('test task in PowerShell single line comment'); // text
    });

    test('should detect TODO in indented single-line comment', () => {
      const line = '        # TODO test task in PowerShell indented comment';
      expect(regexPair.test.test(line)).toBe(true);
      
      const match = regexPair.capture.exec(line);
      expect(match).toBeTruthy();
      expect(match![1]).toBe('        '); // indent
      expect(match![2]).toBe('# '); // comment prefix
      expect(match![4]).toBe('TODO'); // keyword
      expect(match![5]).toBe('test task in PowerShell indented comment'); // text
    });

    test('should detect TODO in inline single-line comment', () => {
      const line = 'Write-Host "hello"  # TODO test task in PowerShell inline comment';
      expect(regexPair.test.test(line)).toBe(true);
      
      const match = regexPair.capture.exec(line);
      expect(match).toBeTruthy();
      expect(match![1]).toBe(''); // indent
      expect(match![2]).toBe('Write-Host "hello"  # '); // comment prefix
      expect(match![4]).toBe('TODO'); // keyword
      expect(match![5]).toBe('test task in PowerShell inline comment'); // text
    });
  });

  describe('Multi-line comments', () => {
    test('should detect TODO in multi-line comment', () => {
      const line = '    <# TODO test task in PowerShell multi-line comment';
      expect(regexPair.test.test(line)).toBe(true);
      
      const match = regexPair.capture.exec(line);
      expect(match).toBeTruthy();
      expect(match![1]).toBe('    '); // indent
      expect(match![2]).toBe('<# '); // comment prefix
      expect(match![4]).toBe('TODO'); // keyword
      expect(match![5]).toBe('test task in PowerShell multi-line comment'); // text
    });

    test('should detect TODO in multi-line comment with content', () => {
      const line = '    # TODO test task in PowerShell multi-line comment';
      expect(regexPair.test.test(line)).toBe(true);
      
      const match = regexPair.capture.exec(line);
      expect(match).toBeTruthy();
      expect(match![1]).toBe('    '); // indent
      expect(match![2]).toBe('# '); // comment prefix
      expect(match![4]).toBe('TODO'); // keyword
      expect(match![5]).toBe('test task in PowerShell multi-line comment'); // text
    });

    test('should detect TODO in inline multi-line comment', () => {
      const line = 'Write-Host "hello" <# TODO test task in PowerShell inline comment #>';
      expect(regexPair.test.test(line)).toBe(true);
    
      const match = regexPair.capture.exec(line);
      expect(match).toBeTruthy();
      expect(match![1]).toBe(''); // indent
      expect(match![2]).toBe('Write-Host "hello" <# '); // comment prefix
      expect(match![4]).toBe('TODO'); // keyword
      expect(match![5]).toBe('test task in PowerShell inline comment'); // text
      expect(match![6]).toBe(' #>'); // trailing comment end
    });
  });

  describe('Edge cases', () => {
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