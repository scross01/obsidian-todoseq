import { buildTaskKeywords } from '../src/utils/task-utils';

describe('task-utils - buildTaskKeywords', () => {
  describe('basic functionality', () => {
    test('should return valid structure with default keywords', () => {
      const result = buildTaskKeywords([]);

      expect(result).toBeDefined();
      expect(result.allKeywords).toBeInstanceOf(Array);
      expect(result.nonCompletedKeywords).toBeInstanceOf(Array);
      expect(result.normalizedAdditional).toBeInstanceOf(Array);
    });

    test('should include default keywords', () => {
      const result = buildTaskKeywords([]);

      expect(result.allKeywords.length).toBeGreaterThan(0);
      expect(result.nonCompletedKeywords.length).toBeGreaterThan(0);
      expect(result.normalizedAdditional).toEqual([]);
    });
  });

  describe('with additional keywords', () => {
    test('should add additional keywords', () => {
      const result = buildTaskKeywords(['CUSTOM']);

      expect(result.allKeywords).toEqual(expect.arrayContaining(['CUSTOM']));
      expect(result.nonCompletedKeywords).toEqual(
        expect.arrayContaining(['CUSTOM']),
      );
      expect(result.normalizedAdditional).toEqual(['CUSTOM']);
    });

    test('should normalize additional keywords', () => {
      const result = buildTaskKeywords(['  custom  ', 'ANOTHER  ', '']);

      expect(result.normalizedAdditional).toEqual(['custom', 'ANOTHER']);
    });

    test('should handle non-string values in additional keywords', () => {
      const result = buildTaskKeywords([123, null, undefined, true, false]);

      expect(result.normalizedAdditional).toEqual([]);
    });

    test('should handle duplicate additional keywords', () => {
      const result = buildTaskKeywords(['CUSTOM', 'custom', 'CUSTOM']);

      expect(result.normalizedAdditional).toEqual([
        'CUSTOM',
        'custom',
        'CUSTOM',
      ]); // case-sensitive, preserves duplicates
    });

    test('should handle array with various types', () => {
      const result = buildTaskKeywords([
        'CUSTOM',
        123,
        '  ANOTHER  ',
        null,
        '',
      ]);

      expect(result.normalizedAdditional).toEqual(['CUSTOM', 'ANOTHER']);
    });
  });

  describe('keywords structure', () => {
    test('allKeywords should contain all keyword types', () => {
      const result = buildTaskKeywords(['CUSTOM']);

      // Should contain default states
      expect(result.allKeywords).toEqual(
        expect.arrayContaining([
          'TODO',
          'DOING',
          'DONE',
          'CANCELED',
          'CANCELLED',
        ]),
      );
      // Should contain additional keywords
      expect(result.allKeywords).toEqual(expect.arrayContaining(['CUSTOM']));
    });

    test('nonCompletedKeywords should not contain completed states', () => {
      const result = buildTaskKeywords(['CUSTOM']);

      expect(result.nonCompletedKeywords).toEqual(
        expect.arrayContaining(['TODO', 'DOING', 'CUSTOM']),
      );
      expect(result.nonCompletedKeywords).not.toEqual(
        expect.arrayContaining(['DONE', 'CANCELED', 'CANCELLED']),
      );
    });
  });

  describe('edge cases', () => {
    test('should handle null input', () => {
      const result = buildTaskKeywords(null as any);

      expect(result.allKeywords.length).toBeGreaterThan(0);
      expect(result.normalizedAdditional).toEqual([]);
    });

    test('should handle undefined input', () => {
      const result = buildTaskKeywords(undefined as any);

      expect(result.allKeywords.length).toBeGreaterThan(0);
      expect(result.normalizedAdditional).toEqual([]);
    });

    test('should handle empty array', () => {
      const result = buildTaskKeywords([]);

      expect(result.normalizedAdditional).toEqual([]);
    });
  });
});
