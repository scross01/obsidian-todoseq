import { KeywordManager } from '../src/utils/keyword-manager';
import { TaskStateManager } from '../src/services/task-state-manager';
import { VaultScanner } from '../src/services/vault-scanner';
import { TaskParser } from '../src/parser/task-parser';
import { ParserRegistry } from '../src/parser/parser-registry';
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

    const keywordManager = new KeywordManager(initialSettings);
    taskStateManager = new TaskStateManager(keywordManager);

    // Create parser registry and parsers
    const parserRegistry = new ParserRegistry();
    const urgencyCoefficients = {
      priorityHigh: 6,
      priorityMedium: 4,
      priorityLow: 2,
      scheduled: 8,
      scheduledTime: 1,
      deadline: 12,
      deadlineTime: 1,
      active: 4,
      age: 2,
      tags: 1,
      waiting: -3,
    };
    const taskParser = TaskParser.create(
      keywordManager,
      app,
      urgencyCoefficients,
      {
        includeCalloutBlocks: initialSettings.includeCalloutBlocks,
        includeCodeBlocks: initialSettings.includeCodeBlocks,
        includeCommentBlocks: initialSettings.includeCommentBlocks,
        languageCommentSupport: initialSettings.languageCommentSupport,
      },
    );
    parserRegistry.register(taskParser);

    vaultScanner = new VaultScanner(
      app,
      initialSettings,
      taskStateManager,
      urgencyCoefficients,
      keywordManager,
      parserRegistry,
    );
  });

  afterEach(() => {
    // Clean up VaultScanner to prevent open handles
    vaultScanner.destroy();
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
