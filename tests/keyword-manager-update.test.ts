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
});
