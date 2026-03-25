import { KeywordManager } from '../src/utils/keyword-manager';
import { DefaultSettings } from '../src/settings/settings-types';

describe('KeywordManager canceled keyword methods', () => {
  describe('isCanceled', () => {
    it('should return true for CANCELED', () => {
      const keywordManager = new KeywordManager(DefaultSettings);
      expect(keywordManager.isCanceled('CANCELED')).toBe(true);
    });

    it('should return true for CANCELLED', () => {
      const keywordManager = new KeywordManager(DefaultSettings);
      expect(keywordManager.isCanceled('CANCELLED')).toBe(true);
    });

    it('should return false for DONE', () => {
      const keywordManager = new KeywordManager(DefaultSettings);
      expect(keywordManager.isCanceled('DONE')).toBe(false);
    });

    it('should return false for TODO', () => {
      const keywordManager = new KeywordManager(DefaultSettings);
      expect(keywordManager.isCanceled('TODO')).toBe(false);
    });

    it('should return false for NOW', () => {
      const keywordManager = new KeywordManager(DefaultSettings);
      expect(keywordManager.isCanceled('NOW')).toBe(false);
    });

    it('should return false for WAIT', () => {
      const keywordManager = new KeywordManager(DefaultSettings);
      expect(keywordManager.isCanceled('WAIT')).toBe(false);
    });

    it('should be case-sensitive', () => {
      const keywordManager = new KeywordManager(DefaultSettings);
      expect(keywordManager.isCanceled('canceled')).toBe(false);
      expect(keywordManager.isCanceled('Cancelled')).toBe(false);
    });
  });

  describe('getCanceledSet', () => {
    it('should return Set containing CANCELED and CANCELLED', () => {
      const keywordManager = new KeywordManager(DefaultSettings);
      const canceledSet = keywordManager.getCanceledSet();

      expect(canceledSet).toBeInstanceOf(Set);
      expect(canceledSet.size).toBe(2);
      expect(canceledSet.has('CANCELED')).toBe(true);
      expect(canceledSet.has('CANCELLED')).toBe(true);
    });

    it('should not include other completed keywords', () => {
      const keywordManager = new KeywordManager(DefaultSettings);
      const canceledSet = keywordManager.getCanceledSet();

      expect(canceledSet.has('DONE')).toBe(false);
      expect(canceledSet.has('ARCHIVED')).toBe(false);
    });
  });

  describe('isCanceledKeyword (static)', () => {
    it('should return true for CANCELED', () => {
      expect(
        KeywordManager.isCanceledKeyword('CANCELED', DefaultSettings),
      ).toBe(true);
    });

    it('should return true for CANCELLED', () => {
      expect(
        KeywordManager.isCanceledKeyword('CANCELLED', DefaultSettings),
      ).toBe(true);
    });

    it('should return false for DONE', () => {
      expect(KeywordManager.isCanceledKeyword('DONE', DefaultSettings)).toBe(
        false,
      );
    });

    it('should return false for TODO', () => {
      expect(KeywordManager.isCanceledKeyword('TODO', DefaultSettings)).toBe(
        false,
      );
    });

    it('should be case-sensitive', () => {
      expect(
        KeywordManager.isCanceledKeyword('canceled', DefaultSettings),
      ).toBe(false);
      expect(
        KeywordManager.isCanceledKeyword('Cancelled', DefaultSettings),
      ).toBe(false);
    });
  });
});
