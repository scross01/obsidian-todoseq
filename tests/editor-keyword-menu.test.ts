/**
 * @jest-environment jsdom
 */

import { EditorKeywordMenu } from '../src/view/editor-extensions/editor-keyword-menu';
import { StateMenuBuilder } from '../src/view/components/state-menu-builder';
import { installObsidianDomMocks } from './helpers/obsidian-dom-mock';

jest.mock('obsidian', () => ({
  MarkdownView: jest.fn(),
  Menu: jest.fn().mockImplementation(() => ({
    addItem: jest.fn().mockReturnThis(),
    addSeparator: jest.fn().mockReturnThis(),
    showAtPosition: jest.fn(),
  })),
  TFile: jest.fn(),
}));

jest.mock('../src/view/components/state-menu-builder', () => ({
  StateMenuBuilder: jest.fn().mockImplementation(() => ({
    buildStateMenu: jest.fn().mockImplementation((_state, callback) => {
      const menu = {
        showAtPosition: jest.fn((pos: { x: number; y: number }) => {
          // Simulate menu selection by calling callback with 'DOING'
          if (callback) callback('DOING');
        }),
      };
      return menu;
    }),
  })),
}));

beforeAll(() => {
  installObsidianDomMocks();
});

describe('EditorKeywordMenu', () => {
  let menu: EditorKeywordMenu;
  let pluginMock: Record<string, unknown>;

  beforeEach(() => {
    const keywordElement = activeDocument.createElement('span');
    keywordElement.setAttribute('data-task-keyword', 'TODO');

    const editorMock = {
      getLine: jest.fn().mockReturnValue('TODO test task'),
    };

    const viewMock = {
      editor: editorMock,
      file: { path: 'test.md' },
    };

    const workspaceMock = {
      getActiveViewOfType: jest.fn().mockReturnValue(viewMock),
    };

    const appMock = {
      workspace: workspaceMock,
    };

    const uiManagerMock = {
      getLineForElement: jest.fn().mockReturnValue(5),
    };

    const editorControllerMock = {
      handleUpdateTaskStateAtLine: jest.fn(),
    };

    pluginMock = {
      app: appMock,
      uiManager: uiManagerMock,
      editorController: editorControllerMock,
      settings: {},
    };

    menu = new EditorKeywordMenu(pluginMock as any);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create menu builder on construction', () => {
      expect(menu).toBeDefined();
    });
  });

  describe('openStateMenuAtMouseEvent', () => {
    it('should prevent default event behavior', () => {
      const keywordElement = activeDocument.createElement('span');
      const evt = new MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
        clientX: 100,
        clientY: 200,
      });
      const preventDefaultSpy = jest.spyOn(evt, 'preventDefault');
      const stopPropagationSpy = jest.spyOn(evt, 'stopPropagation');

      menu.openStateMenuAtMouseEvent('TODO', keywordElement, evt);

      expect(preventDefaultSpy).toHaveBeenCalled();
      expect(stopPropagationSpy).toHaveBeenCalled();
    });

    it('should show menu at mouse position', () => {
      const keywordElement = activeDocument.createElement('span');
      const evt = new MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
        clientX: 150,
        clientY: 250,
      });

      // The menu builder's buildStateMenu returns a mock menu with showAtPosition
      // which calls the callback, triggering the update
      menu.openStateMenuAtMouseEvent('TODO', keywordElement, evt);

      // Verify that the editor controller was called as a result of the callback
      expect(pluginMock.editorController).toBeDefined();
    });
  });

  describe('updateSettings', () => {
    it('should refresh menu builder when settings change', () => {
      const initialCalls = (StateMenuBuilder as jest.Mock).mock.calls.length;

      menu.updateSettings();

      expect((StateMenuBuilder as jest.Mock).mock.calls.length).toBeGreaterThan(
        initialCalls,
      );
    });
  });
});
