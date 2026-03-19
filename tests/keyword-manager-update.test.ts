import { KeywordManager } from '../src/utils/keyword-manager';
import {
  TodoTrackerSettings,
  DefaultSettings,
} from '../src/settings/settings-types';

describe('KeywordManager update when settings change', () => {
  it('should create new keyword manager with new settings', () => {
    // Initial settings
    const initialSettings: TodoTrackerSettings = {
      ...DefaultSettings,
      additionalInactiveKeywords: ['INITIAL'],
    };

    const keywordManager1 = new KeywordManager(initialSettings);
    expect(keywordManager1.getKeywordsForGroup('inactiveKeywords')).toEqual([
      'TODO',
      'LATER',
      'INITIAL',
    ]);

    // New settings with different keywords
    const newSettings: TodoTrackerSettings = {
      ...DefaultSettings,
      additionalInactiveKeywords: ['UPDATED'],
    };

    const keywordManager2 = new KeywordManager(newSettings);
    expect(keywordManager2.getKeywordsForGroup('inactiveKeywords')).toEqual([
      'TODO',
      'LATER',
      'UPDATED',
    ]);

    expect(keywordManager1.getKeywordsForGroup('inactiveKeywords')).not.toEqual(
      keywordManager2.getKeywordsForGroup('inactiveKeywords'),
    );
  });

  describe('getDefaultInactive', () => {
    it('should return TODO by default', () => {
      const keywordManager = new KeywordManager(DefaultSettings);
      expect(keywordManager.getDefaultInactive()).toBe('TODO');
    });

    it('should return TODO if it exists in the keyword set', () => {
      const keywordManager = new KeywordManager({
        additionalInactiveKeywords: ['CUSTOM'],
      });
      expect(keywordManager.getDefaultInactive()).toBe('TODO');
    });

    it('should return first keyword if TODO is removed', () => {
      const keywordManager = new KeywordManager({
        additionalInactiveKeywords: ['-TODO', 'CUSTOM'],
      });
      expect(keywordManager.getDefaultInactive()).toBe('LATER');
    });

    it('should return first keyword if all built-ins are removed', () => {
      const keywordManager = new KeywordManager({
        additionalInactiveKeywords: ['-TODO', '-LATER', 'CUSTOM'],
      });
      expect(keywordManager.getDefaultInactive()).toBe('CUSTOM');
    });

    it('should return TODO if it is moved but still in inactive group', () => {
      const keywordManager = new KeywordManager({
        additionalInactiveKeywords: ['TODO'],
      });
      expect(keywordManager.getDefaultInactive()).toBe('TODO');
    });
  });

  describe('getDefaultActive', () => {
    it('should return DOING by default', () => {
      const keywordManager = new KeywordManager(DefaultSettings);
      expect(keywordManager.getDefaultActive()).toBe('DOING');
    });

    it('should return DOING if it exists in the keyword set', () => {
      const keywordManager = new KeywordManager({
        additionalActiveKeywords: ['CUSTOM'],
      });
      expect(keywordManager.getDefaultActive()).toBe('DOING');
    });

    it('should return first keyword if DOING is removed', () => {
      const keywordManager = new KeywordManager({
        additionalActiveKeywords: ['-DOING', 'CUSTOM'],
      });
      expect(keywordManager.getDefaultActive()).toBe('NOW');
    });

    it('should return first keyword if all built-ins are removed', () => {
      const keywordManager = new KeywordManager({
        additionalActiveKeywords: ['-DOING', '-NOW', '-IN-PROGRESS', 'CUSTOM'],
      });
      expect(keywordManager.getDefaultActive()).toBe('CUSTOM');
    });
  });

  describe('getDefaultCompleted', () => {
    it('should return DONE by default', () => {
      const keywordManager = new KeywordManager(DefaultSettings);
      expect(keywordManager.getDefaultCompleted()).toBe('DONE');
    });

    it('should return DONE if it exists in the keyword set', () => {
      const keywordManager = new KeywordManager({
        additionalCompletedKeywords: ['CUSTOM'],
      });
      expect(keywordManager.getDefaultCompleted()).toBe('DONE');
    });

    it('should return first keyword if DONE is removed', () => {
      const keywordManager = new KeywordManager({
        additionalCompletedKeywords: ['-DONE', 'CUSTOM'],
      });
      expect(keywordManager.getDefaultCompleted()).toBe('CANCELED');
    });

    it('should return first keyword if all built-ins are removed', () => {
      const keywordManager = new KeywordManager({
        additionalCompletedKeywords: [
          '-DONE',
          '-CANCELED',
          '-CANCELLED',
          'CUSTOM',
        ],
      });
      expect(keywordManager.getDefaultCompleted()).toBe('CUSTOM');
    });
  });
});
