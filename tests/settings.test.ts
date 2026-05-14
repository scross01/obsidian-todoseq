/**
 * @jest-environment jsdom
 */

import { TodoTrackerSettingTab } from '../src/settings/settings';
import { installObsidianDomMocks } from './helpers/obsidian-dom-mock';
import { createBaseSettings } from './helpers/test-helper';
import { DefaultSettings } from '../src/settings/settings-types';

// Mock obsidian
jest.mock('obsidian', () => ({
  PluginSettingTab: class MockPluginSettingTab {
    app: Record<string, unknown>;
    plugin: Record<string, unknown>;
    constructor(app: Record<string, unknown>, plugin: Record<string, unknown>) {
      this.app = app;
      this.plugin = plugin;
    }
  },
  Setting: class MockSetting {
    private nameText = '';
    private descText = '';
    private headingFlag = false;
    private controlCallback: ((component: unknown) => void) | null = null;

    setName(name: string): this {
      this.nameText = name;
      return this;
    }

    setDesc(desc: string): this {
      this.descText = desc;
      return this;
    }

    setHeading(): this {
      this.headingFlag = true;
      return this;
    }

    addText(callback: (component: unknown) => void): this {
      this.controlCallback = callback;
      const textComponent = {
        setValue: jest.fn().mockReturnThis(),
        setPlaceholder: jest.fn().mockReturnThis(),
        onChange: jest.fn().mockReturnThis(),
        inputEl: activeDocument.createElement('input'),
      };
      callback(textComponent);
      return this;
    }

    addTextArea(callback: (component: unknown) => void): this {
      this.controlCallback = callback;
      const textAreaComponent = {
        setValue: jest.fn().mockReturnThis(),
        setPlaceholder: jest.fn().mockReturnThis(),
        onChange: jest.fn().mockReturnThis(),
        inputEl: activeDocument.createElement('textarea'),
      };
      callback(textAreaComponent);
      return this;
    }

    addToggle(callback: (component: unknown) => void): this {
      this.controlCallback = callback;
      const toggleComponent = {
        setValue: jest.fn().mockReturnThis(),
        onChange: jest.fn().mockReturnThis(),
      };
      callback(toggleComponent);
      return this;
    }

    addDropdown(callback: (component: unknown) => void): this {
      this.controlCallback = callback;
      const dropdownComponent = {
        addOption: jest.fn().mockReturnThis(),
        setValue: jest.fn().mockReturnThis(),
        onChange: jest.fn().mockReturnThis(),
        selectEl: activeDocument.createElement('select'),
      };
      callback(dropdownComponent);
      return this;
    }

    get settingEl(): HTMLElement {
      const el = activeDocument.createElement('div');
      el.className = 'setting-item';
      const info = activeDocument.createElement('div');
      info.className = 'setting-item-info';
      el.appendChild(info);
      return el;
    }
  },
  App: jest.fn(),
  Notice: jest.fn(),
}));

jest.mock('../src/view/task-list/task-list-view', () => ({
  TaskListView: class MockTaskListView {
    static viewType = 'todoseq-view';
    updateTasks = jest.fn();
    setViewMode = jest.fn();
    updateContextMenuConfig = jest.fn();
    refreshVisibleList = jest.fn().mockResolvedValue(undefined);
  },
}));

jest.mock('../src/utils/settings-utils', () => ({
  parseKeywordInput: jest
    .fn()
    .mockImplementation((input: string) =>
      input.split(/[,\s]+/).filter((s) => s.length > 0),
    ),
  formatKeywordsForInput: jest
    .fn()
    .mockImplementation((keywords: string[]) => keywords.join(', ')),
  validateKeywordGroupsDetailed: jest.fn().mockReturnValue({
    errors: [],
    warnings: [],
  }),
}));

jest.mock('../src/parser/task-parser', () => ({
  TaskParser: {
    validateKeywords: jest.fn(),
    create: jest.fn(),
  },
}));

jest.mock('../src/services/transition-parser', () => ({
  TransitionParser: jest.fn().mockImplementation(() => ({
    parse: jest.fn().mockReturnValue({ errors: [] }),
  })),
}));

jest.mock('../src/utils/keyword-manager', () => ({
  KeywordManager: jest.fn().mockImplementation(() => ({
    getInactiveSet: jest.fn().mockReturnValue(new Set(['TODO', 'LATER'])),
    getActiveSet: jest.fn().mockReturnValue(new Set(['DOING', 'NOW'])),
    getCompletedSet: jest.fn().mockReturnValue(new Set(['DONE', 'CANCELLED'])),
    getAllKeywords: jest.fn().mockReturnValue(['TODO', 'DOING', 'DONE']),
    getKeywordsForGroup: jest.fn().mockReturnValue(['TODO', 'LATER']),
  })),
}));

beforeAll(() => {
  installObsidianDomMocks();
});

describe('TodoTrackerSettingTab', () => {
  let settingTab: TodoTrackerSettingTab;
  let pluginMock: Record<string, unknown>;
  let appMock: Record<string, unknown>;

  beforeEach(() => {
    const settings = createBaseSettings();

    const workspaceMock = {
      getLeavesOfType: jest.fn().mockReturnValue([]),
    };

    appMock = {
      workspace: workspaceMock,
    };

    pluginMock = {
      app: appMock,
      settings: settings,
      saveSettings: jest.fn().mockResolvedValue(undefined),
      recreateParser: jest.fn().mockResolvedValue(undefined),
      scanVault: jest.fn().mockResolvedValue(undefined),
      refreshVisibleEditorDecorations: jest.fn(),
      refreshReaderViewFormatter: jest.fn(),
      updateTaskListViewSettings: jest.fn(),
      updateTaskUpdateCoordinatorSettings: jest.fn(),
      updateTaskWriterKeywordManager: jest.fn(),
      embeddedTaskListProcessor: {
        updateSettings: jest.fn(),
      },
      keywordManager: {},
    };

    settingTab = new TodoTrackerSettingTab(appMock as any, pluginMock as any);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create setting tab with plugin reference', () => {
      expect(settingTab).toBeDefined();
      expect((settingTab as any).plugin).toBe(pluginMock);
    });
  });

  describe('validateFileExtensions', () => {
    it('should validate correct file extensions', () => {
      const result = (settingTab as any).validateFileExtensions('.md, .txt');
      expect(result.valid).toEqual(['.md', '.txt']);
      expect(result.invalid).toEqual([]);
    });

    it('should reject extensions without dot prefix', () => {
      const result = (settingTab as any).validateFileExtensions('md, txt');
      expect(result.valid).toEqual([]);
      expect(result.invalid).toEqual(['md', 'txt']);
    });

    it('should reject single dot extension', () => {
      const result = (settingTab as any).validateFileExtensions('.');
      expect(result.valid).toEqual([]);
      expect(result.invalid).toEqual(['.']);
    });

    it('should reject extensions with invalid characters', () => {
      const result = (settingTab as any).validateFileExtensions('.md, .t$x');
      expect(result.valid).toEqual(['.md']);
      expect(result.invalid).toEqual(['.t$x']);
    });

    it('should allow multi-level extensions', () => {
      const result = (settingTab as any).validateFileExtensions('.txt.bak');
      expect(result.valid).toEqual(['.txt.bak']);
      expect(result.invalid).toEqual([]);
    });

    it('should handle empty input', () => {
      const result = (settingTab as any).validateFileExtensions('');
      expect(result.valid).toEqual([]);
      expect(result.invalid).toEqual([]);
    });
  });

  describe('getDefaultForGroup', () => {
    it('should return preferred default if in keyword set', () => {
      const keywordManagerMock = {
        getKeywordsForGroup: jest.fn().mockReturnValue(['TODO', 'LATER']),
      };
      const result = (settingTab as any).getDefaultForGroup(
        keywordManagerMock,
        'inactiveKeywords',
        'TODO',
      );
      expect(result).toBe('TODO');
    });

    it('should return first keyword if preferred not in set', () => {
      const keywordManagerMock = {
        getKeywordsForGroup: jest.fn().mockReturnValue(['LATER', 'SOMEDAY']),
      };
      const result = (settingTab as any).getDefaultForGroup(
        keywordManagerMock,
        'inactiveKeywords',
        'TODO',
      );
      expect(result).toBe('LATER');
    });

    it('should return preferred default for empty set', () => {
      const keywordManagerMock = {
        getKeywordsForGroup: jest.fn().mockReturnValue([]),
      };
      const result = (settingTab as any).getDefaultForGroup(
        keywordManagerMock,
        'inactiveKeywords',
        'TODO',
      );
      expect(result).toBe('TODO');
    });
  });

  describe('parseKeywordInputsFromUI', () => {
    it('should return fallback values when no bindings exist', () => {
      const result = (settingTab as any).parseKeywordInputsFromUI();
      expect(result).toBeDefined();
      expect(Array.isArray(result.additionalActiveKeywords)).toBe(true);
    });
  });

  describe('toGroupKeywordInput', () => {
    it('should map setting keys to group names', () => {
      const bySetting = {
        additionalActiveKeywords: ['STARTED'],
        additionalInactiveKeywords: ['FIXME'],
        additionalWaitingKeywords: ['ON-HOLD'],
        additionalCompletedKeywords: ['NEVER'],
        additionalArchivedKeywords: ['OLD'],
      };
      const result = (settingTab as any).toGroupKeywordInput(bySetting);
      expect(result.activeKeywords).toEqual(['STARTED']);
      expect(result.inactiveKeywords).toEqual(['FIXME']);
      expect(result.waitingKeywords).toEqual(['ON-HOLD']);
      expect(result.completedKeywords).toEqual(['NEVER']);
      expect(result.archivedKeywords).toEqual(['OLD']);
    });
  });

  describe('keywordSettingToGroup mapping', () => {
    it('should map additionalActiveKeywords to activeKeywords', () => {
      const mapping = (settingTab as any).keywordSettingToGroup;
      expect(mapping.additionalActiveKeywords).toBe('activeKeywords');
    });

    it('should map additionalInactiveKeywords to inactiveKeywords', () => {
      const mapping = (settingTab as any).keywordSettingToGroup;
      expect(mapping.additionalInactiveKeywords).toBe('inactiveKeywords');
    });

    it('should map additionalWaitingKeywords to waitingKeywords', () => {
      const mapping = (settingTab as any).keywordSettingToGroup;
      expect(mapping.additionalWaitingKeywords).toBe('waitingKeywords');
    });

    it('should map additionalCompletedKeywords to completedKeywords', () => {
      const mapping = (settingTab as any).keywordSettingToGroup;
      expect(mapping.additionalCompletedKeywords).toBe('completedKeywords');
    });

    it('should map additionalArchivedKeywords to archivedKeywords', () => {
      const mapping = (settingTab as any).keywordSettingToGroup;
      expect(mapping.additionalArchivedKeywords).toBe('archivedKeywords');
    });
  });

  describe('populateDefaultStateDropdown', () => {
    it('should populate select element with sorted options from keyword set', () => {
      const selectEl = activeDocument.createElement('select');
      const dropdown = { selectEl };
      const keywords = new Set(['DOING', 'TODO', 'NOW']);

      (settingTab as any).populateDefaultStateDropdown(dropdown, keywords);

      const options = Array.from(selectEl.children);
      expect(options.length).toBe(3);
      // Should be sorted alphabetically
      expect(options[0].textContent).toBe('DOING');
      expect(options[0].getAttribute('value')).toBe('DOING');
      expect(options[1].textContent).toBe('NOW');
      expect(options[2].textContent).toBe('TODO');
    });

    it('should handle empty keyword set', () => {
      const selectEl = activeDocument.createElement('select');
      const dropdown = { selectEl };

      (settingTab as any).populateDefaultStateDropdown(dropdown, new Set());

      expect(selectEl.children.length).toBe(0);
    });
  });

  describe('clearTransitionSettingErrors', () => {
    it('should remove error/info elements and clear textarea highlighting', () => {
      // Create transition settings with elements that have error/info children
      const inactiveEl = activeDocument.createElement('div');
      inactiveEl.className = 'setting-item';
      const inactiveInfo = activeDocument.createElement('div');
      inactiveInfo.className = 'setting-item-info';
      const inactiveError = activeDocument.createElement('div');
      inactiveError.className = 'todoseq-setting-item-error';
      inactiveEl.appendChild(inactiveInfo);
      inactiveEl.appendChild(inactiveError);

      const transitionsEl = activeDocument.createElement('div');
      transitionsEl.className = 'setting-item';
      const transitionsInfo = activeDocument.createElement('div');
      transitionsInfo.className = 'setting-item-info';
      const transitionsWarning = activeDocument.createElement('div');
      transitionsWarning.className = 'todoseq-setting-item-info';
      const textarea = activeDocument.createElement('textarea');
      textarea.classList.add('todoseq-invalid-input');
      transitionsEl.appendChild(transitionsInfo);
      transitionsEl.appendChild(transitionsWarning);
      transitionsEl.appendChild(textarea);

      (settingTab as any).transitionSettings = {
        inactive: { settingEl: inactiveEl },
        active: null,
        completed: undefined,
        transitions: { settingEl: transitionsEl },
      };

      (settingTab as any).clearTransitionSettingErrors();

      // Error/info elements should be removed
      expect(
        inactiveEl.querySelector('.todoseq-setting-item-error'),
      ).toBeFalsy();
      expect(
        transitionsEl.querySelector('.todoseq-setting-item-info'),
      ).toBeFalsy();
      // Textarea highlighting should be cleared
      expect(textarea.classList.contains('todoseq-invalid-input')).toBe(false);
    });

    it('should handle null/undefined settings gracefully', () => {
      (settingTab as any).transitionSettings = {
        inactive: null,
        active: undefined,
        completed: null,
        transitions: undefined,
      };

      expect(() =>
        (settingTab as any).clearTransitionSettingErrors(),
      ).not.toThrow();
    });
  });

  describe('attachInfoToSetting', () => {
    it('should append info message to setting info area', () => {
      const settingEl = activeDocument.createElement('div');
      const info = activeDocument.createElement('div');
      info.className = 'setting-item-info';
      settingEl.appendChild(info);
      const setting = { settingEl };

      (settingTab as any).attachInfoToSetting(setting, 'Test warning');

      const warningDiv = settingEl.querySelector(
        '.todoseq-setting-item-warning',
      );
      expect(warningDiv).toBeTruthy();
      expect(warningDiv?.textContent).toBe('Test warning');
    });

    it('should do nothing when setting is undefined', () => {
      expect(() =>
        (settingTab as any).attachInfoToSetting(undefined, 'message'),
      ).not.toThrow();
    });
  });

  describe('attachErrorsToSetting', () => {
    it('should append error messages and highlight textarea', () => {
      const settingEl = activeDocument.createElement('div');
      const info = activeDocument.createElement('div');
      info.className = 'setting-item-info';
      const textarea = activeDocument.createElement('textarea');
      settingEl.appendChild(info);
      settingEl.appendChild(textarea);
      const setting = { settingEl };

      (settingTab as any).attachErrorsToSetting(setting, [
        'Error one',
        'Error two',
      ]);

      const errorDiv = settingEl.querySelector('.todoseq-setting-item-error');
      expect(errorDiv).toBeTruthy();
      expect(errorDiv?.textContent).toContain('Error one');
      expect(errorDiv?.textContent).toContain('Error two');
      expect(textarea.classList.contains('todoseq-invalid-input')).toBe(true);
    });

    it('should do nothing with empty messages array', () => {
      const settingEl = activeDocument.createElement('div');
      const info = activeDocument.createElement('div');
      info.className = 'setting-item-info';
      settingEl.appendChild(info);
      const setting = { settingEl };

      (settingTab as any).attachErrorsToSetting(setting, []);

      expect(
        settingEl.querySelector('.todoseq-setting-item-error'),
      ).toBeFalsy();
    });
  });

  describe('validateKeywordRegexForAllGroups', () => {
    afterEach(() => {
      const { TaskParser } = jest.requireMock('../src/parser/task-parser');
      (TaskParser.validateKeywords as jest.Mock).mockReset();
    });

    it('should validate all keywords as valid when no regex errors', () => {
      const parsedBySetting = {
        additionalActiveKeywords: ['STARTED'],
        additionalInactiveKeywords: ['FIXME'],
        additionalWaitingKeywords: ['ON-HOLD'],
        additionalCompletedKeywords: ['NEVER'],
        additionalArchivedKeywords: ['OLD'],
      };

      const result = (settingTab as any).validateKeywordRegexForAllGroups(
        parsedBySetting,
      );

      expect(result.validBySetting.additionalActiveKeywords).toEqual([
        'STARTED',
      ]);
      expect(result.validBySetting.additionalInactiveKeywords).toEqual([
        'FIXME',
      ]);
      expect(result.errorsByGroup.activeKeywords).toEqual([]);
      expect(result.errorsByGroup.inactiveKeywords).toEqual([]);
    });

    it('should separate invalid keywords into errors', () => {
      const { TaskParser } = jest.requireMock('../src/parser/task-parser');
      (TaskParser.validateKeywords as jest.Mock).mockImplementation(
        (keywords: string[]) => {
          if (keywords[0] === 'INVALID!' || keywords[0] === 'BAD@KEY') {
            throw new Error('Invalid keyword syntax');
          }
        },
      );

      const parsedBySetting = {
        additionalActiveKeywords: ['STARTED'],
        additionalInactiveKeywords: ['FIXME', 'INVALID!'],
        additionalWaitingKeywords: [],
        additionalCompletedKeywords: ['BAD@KEY'],
        additionalArchivedKeywords: [],
      };

      const result = (settingTab as any).validateKeywordRegexForAllGroups(
        parsedBySetting,
      );

      // Valid keywords should pass through
      expect(result.validBySetting.additionalActiveKeywords).toEqual([
        'STARTED',
      ]);
      expect(result.validBySetting.additionalInactiveKeywords).toEqual([
        'FIXME',
      ]);
      expect(result.validBySetting.additionalCompletedKeywords).toEqual([]);

      // Invalid keywords should appear in errors
      expect(result.errorsByGroup.inactiveKeywords).toContain(
        'Invalid keyword syntax: INVALID!',
      );
      expect(result.errorsByGroup.completedKeywords).toContain(
        'Invalid keyword syntax: BAD@KEY',
      );
    });

    it('should handle negative prefix tokens', () => {
      const { TaskParser } = jest.requireMock('../src/parser/task-parser');
      (TaskParser.validateKeywords as jest.Mock).mockImplementation(
        (keywords: string[]) => {
          if (keywords[0] === 'INVALID') {
            throw new Error('Invalid');
          }
        },
      );

      const parsedBySetting = {
        additionalActiveKeywords: ['-EXCLUDE'],
        additionalInactiveKeywords: ['INVALID'],
        additionalWaitingKeywords: [],
        additionalCompletedKeywords: [],
        additionalArchivedKeywords: [],
      };

      const result = (settingTab as any).validateKeywordRegexForAllGroups(
        parsedBySetting,
      );

      // Negative prefix tokens should have the '-' stripped before validation
      expect(result.validBySetting.additionalActiveKeywords).toEqual([
        '-EXCLUDE',
      ]);
      expect(result.errorsByGroup.inactiveKeywords).toContain(
        'Invalid keyword syntax: INVALID',
      );
    });
  });

  describe('renderKeywordValidationState', () => {
    it('should render errors and warnings into keyword field DOM', () => {
      const inputEl = activeDocument.createElement('input');
      const settingEl = activeDocument.createElement('div');
      settingEl.className = 'setting-item';
      const info = activeDocument.createElement('div');
      info.className = 'setting-item-info';
      settingEl.appendChild(info);

      (settingTab as any).keywordFieldBindings.set('additionalActiveKeywords', {
        settingKey: 'additionalActiveKeywords',
        inputEl,
        settingEl,
      });

      (settingTab as any).renderKeywordValidationState(
        {
          activeKeywords: [],
          inactiveKeywords: [],
          waitingKeywords: [],
          completedKeywords: [],
          archivedKeywords: [],
        },
        [
          {
            group: 'activeKeywords',
            message: 'Duplicate keyword: STARTED',
          },
        ],
        [
          {
            group: 'activeKeywords',
            message: 'Keyword similar to built-in',
          },
        ],
      );

      const errorDiv = settingEl.querySelector('.todoseq-setting-item-error');
      expect(errorDiv).toBeTruthy();
      expect(errorDiv?.textContent).toContain('Duplicate keyword: STARTED');

      const warningDiv = settingEl.querySelector(
        '.todoseq-setting-item-warning',
      );
      expect(warningDiv).toBeTruthy();
      expect(warningDiv?.textContent).toContain('Keyword similar to built-in');

      // Input should be marked invalid due to errors
      expect(inputEl.classList.contains('todoseq-invalid-input')).toBe(true);
    });

    it('should clear previous errors before re-rendering', () => {
      const inputEl = activeDocument.createElement('input');
      const settingEl = activeDocument.createElement('div');
      settingEl.className = 'setting-item';
      const info = activeDocument.createElement('div');
      info.className = 'setting-item-info';
      // Add a pre-existing error element
      const oldError = activeDocument.createElement('div');
      oldError.className = 'todoseq-setting-item-error';
      oldError.textContent = 'Old error';
      settingEl.appendChild(info);
      settingEl.appendChild(oldError);
      inputEl.classList.add('todoseq-invalid-input');

      (settingTab as any).keywordFieldBindings.set('additionalActiveKeywords', {
        settingKey: 'additionalActiveKeywords',
        inputEl,
        settingEl,
      });

      // Render with no errors this time
      (settingTab as any).renderKeywordValidationState(
        {
          activeKeywords: [],
          inactiveKeywords: [],
          waitingKeywords: [],
          completedKeywords: [],
          archivedKeywords: [],
        },
        [],
        [],
      );

      // Old error should be removed
      expect(
        settingEl.querySelector('.todoseq-setting-item-error'),
      ).toBeFalsy();
      // Invalid class should be removed
      expect(inputEl.classList.contains('todoseq-invalid-input')).toBe(false);
    });
  });

  describe('parseKeywordInputsFromUI with bindings', () => {
    it('should read values from keyword field bindings when present', () => {
      const activeInput = activeDocument.createElement('input');
      activeInput.value = 'STARTED, IN-PROGRESS';
      const inactiveInput = activeDocument.createElement('input');
      inactiveInput.value = 'FIXME, HACK';

      (settingTab as any).keywordFieldBindings.set('additionalActiveKeywords', {
        settingKey: 'additionalActiveKeywords',
        inputEl: activeInput,
        settingEl: activeDocument.createElement('div'),
      });
      (settingTab as any).keywordFieldBindings.set(
        'additionalInactiveKeywords',
        {
          settingKey: 'additionalInactiveKeywords',
          inputEl: inactiveInput,
          settingEl: activeDocument.createElement('div'),
        },
      );

      const result = (settingTab as any).parseKeywordInputsFromUI();

      // Values from bindings should override fallbacks
      expect(result.additionalActiveKeywords).toContain('STARTED');
      expect(result.additionalActiveKeywords).toContain('IN-PROGRESS');
      expect(result.additionalInactiveKeywords).toContain('FIXME');
      // Groups without bindings should use fallback settings
      expect(Array.isArray(result.additionalWaitingKeywords)).toBe(true);
    });
  });
});
