import { TodoseqCodeBlockParser } from '../src/view/embedded-task-list/code-block-parser';

describe('wrap-content dynamic option', () => {
  describe('parsing', () => {
    test('should parse wrap-content: dynamic', () => {
      const source = `search: tag:work
wrap-content: dynamic`;
      const result = TodoseqCodeBlockParser.parse(source);
      expect(result.error).toBeUndefined();
      expect(result.wrapContent).toBe('dynamic');
    });

    test('should parse wrap-content: true', () => {
      const source = `search: tag:work
wrap-content: true`;
      const result = TodoseqCodeBlockParser.parse(source);
      expect(result.error).toBeUndefined();
      expect(result.wrapContent).toBe(true);
    });

    test('should parse wrap-content: false', () => {
      const source = `search: tag:work
wrap-content: false`;
      const result = TodoseqCodeBlockParser.parse(source);
      expect(result.error).toBeUndefined();
      expect(result.wrapContent).toBe(false);
    });

    test('should parse wrap-content: wrap (alias for true)', () => {
      const source = `search: tag:work
wrap-content: wrap`;
      const result = TodoseqCodeBlockParser.parse(source);
      expect(result.error).toBeUndefined();
      expect(result.wrapContent).toBe(true);
    });

    test('should parse wrap-content: truncate (alias for false)', () => {
      const source = `search: tag:work
wrap-content: truncate`;
      const result = TodoseqCodeBlockParser.parse(source);
      expect(result.error).toBeUndefined();
      expect(result.wrapContent).toBe(false);
    });

    test('should return error for invalid wrap-content value', () => {
      const source = `search: tag:work
wrap-content: invalid`;
      const result = TodoseqCodeBlockParser.parse(source);
      expect(result.error).toContain('Invalid wrap-content option');
      expect(result.error).toContain('dynamic');
    });

    test('should default wrapContent to undefined when not specified (renderer treats as dynamic)', () => {
      const source = 'search: tag:work';
      const result = TodoseqCodeBlockParser.parse(source);
      expect(result.wrapContent).toBeUndefined();
    });

    test('should handle dynamic with other options', () => {
      const source = `search: tag:work
sort: priority
completed: hide
limit: 10
wrap-content: dynamic
collapse: true
title: My Tasks`;
      const result = TodoseqCodeBlockParser.parse(source);
      expect(result.error).toBeUndefined();
      expect(result.wrapContent).toBe('dynamic');
      expect(result.sortMethod).toBe('priority');
      expect(result.completed).toBe('hide');
      expect(result.limit).toBe(10);
      expect(result.collapse).toBe(true);
      expect(result.title).toBe('My Tasks');
    });
  });

  describe('type safety', () => {
    test('wrapContent should accept boolean or dynamic string', () => {
      // This test verifies the type signature at compile time
      // wrapContent?: boolean | 'dynamic'
      const trueResult = TodoseqCodeBlockParser.parse('wrap-content: true');
      const falseResult = TodoseqCodeBlockParser.parse('wrap-content: false');
      const dynamicResult = TodoseqCodeBlockParser.parse(
        'wrap-content: dynamic',
      );

      expect(typeof trueResult.wrapContent).toBe('boolean');
      expect(typeof falseResult.wrapContent).toBe('boolean');
      expect(dynamicResult.wrapContent).toBe('dynamic');
    });
  });
});
