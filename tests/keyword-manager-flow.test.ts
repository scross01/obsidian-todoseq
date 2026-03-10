import { KeywordManager } from '../src/utils/keyword-manager';
import { TaskStateManager } from '../src/services/task-state-manager';
import { VaultScanner } from '../src/services/vault-scanner';
import {
  TodoTrackerSettings,
  DefaultSettings,
} from '../src/settings/settings-types';

// Mock dependencies
class MockApp {
  vault = {
    getFiles: jest.fn(),
    cachedRead: jest.fn(),
  };
  workspaces = {
    getActiveViewOfType: jest.fn(),
  };
}

describe('KeywordManager flow through recreateParser', () => {
  let app: any;
  let initialSettings: TodoTrackerSettings;
  let newSettings: TodoTrackerSettings;
  let taskStateManager: TaskStateManager;
  let vaultScanner: VaultScanner;

  beforeEach(() => {
    app = new MockApp();

    // Initial settings
    initialSettings = {
      ...DefaultSettings,
      additionalInactiveKeywords: ['INITIAL'],
    };

    newSettings = {
      ...DefaultSettings,
      additionalInactiveKeywords: ['UPDATED'],
    };

    taskStateManager = new TaskStateManager(
      new KeywordManager(initialSettings),
    );

    vaultScanner = new VaultScanner(
      app,
      initialSettings,
      taskStateManager,
      {},
      taskStateManager.getKeywordManager(),
    );
  });

  it('should update keyword manager through vault scanner', async () => {
    const initialKeywordManager = vaultScanner.getKeywordManager();
    expect(
      initialKeywordManager.getKeywordsForGroup('inactiveKeywords'),
    ).toEqual(['TODO', 'LATER', 'INITIAL']);

    await vaultScanner.updateSettings(newSettings);

    const updatedKeywordManager = vaultScanner.getKeywordManager();
    expect(
      updatedKeywordManager.getKeywordsForGroup('inactiveKeywords'),
    ).toEqual(['TODO', 'LATER', 'UPDATED']);

    expect(initialKeywordManager).not.toBe(updatedKeywordManager);
  });

  it('should update task state manager with new keyword manager', async () => {
    const initialTSMKeywordManager = taskStateManager.getKeywordManager();
    await vaultScanner.updateSettings(newSettings);

    // Note: taskStateManager's keyword manager is not automatically updated - you have to do it explicitly
    const currentTSMKeywordManager = taskStateManager.getKeywordManager();

    expect(initialTSMKeywordManager).toBe(currentTSMKeywordManager);
    expect(
      currentTSMKeywordManager.getKeywordsForGroup('inactiveKeywords'),
    ).toEqual(['TODO', 'LATER', 'INITIAL']);

    taskStateManager.setKeywordManager(vaultScanner.getKeywordManager());

    expect(
      taskStateManager
        .getKeywordManager()
        .getKeywordsForGroup('inactiveKeywords'),
    ).toEqual(['TODO', 'LATER', 'UPDATED']);
  });
});
