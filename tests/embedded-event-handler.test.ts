/**
 * @jest-environment jsdom
 */

import { EmbeddedTaskListEventHandler } from '../src/view/embedded-task-list/event-handler';
import { installObsidianDomMocks } from './helpers/obsidian-dom-mock';
import { createBaseSettings } from './helpers/test-helper';

describe('EmbeddedTaskListEventHandler', () => {
  let handler: EmbeddedTaskListEventHandler;
  let mockPlugin: any;
  let mockRenderer: any;
  let mockManager: any;

  beforeAll(() => {
    installObsidianDomMocks();
  });

  beforeEach(() => {
    mockPlugin = {
      registerEvent: jest.fn(),
      app: {
        workspace: {
          on: jest.fn().mockReturnValue({}),
        },
      },
      settings: createBaseSettings(),
    };
    mockRenderer = {};
    mockManager = {
      updateSettings: jest.fn(),
    };

    handler = new EmbeddedTaskListEventHandler(
      mockPlugin,
      mockRenderer,
      mockManager,
    );
  });

  describe('trackCodeBlock / untrackCodeBlock', () => {
    it('tracks a code block', () => {
      const el = document.createElement('div');
      handler.trackCodeBlock('block1', el, 'search: todo', 'note.md');

      const blocks = (handler as any).activeCodeBlocks;
      expect(blocks.has('block1')).toBe(true);
      expect(blocks.get('block1').filePath).toBe('note.md');
    });

    it('untracks a code block', () => {
      const el = document.createElement('div');
      handler.trackCodeBlock('block1', el, 'search: todo', 'note.md');
      handler.untrackCodeBlock('block1');

      const blocks = (handler as any).activeCodeBlocks;
      expect(blocks.has('block1')).toBe(false);
    });

    it('tracks multiple code blocks', () => {
      const el1 = document.createElement('div');
      const el2 = document.createElement('div');
      handler.trackCodeBlock('block1', el1, 'search: todo', 'note1.md');
      handler.trackCodeBlock('block2', el2, 'sort: priority', 'note2.md');

      const blocks = (handler as any).activeCodeBlocks;
      expect(blocks.size).toBe(2);
    });
  });

  describe('toggleCollapse', () => {
    it('toggles collapse state', () => {
      const el = document.createElement('div');
      handler.trackCodeBlock('block1', el, '', 'note.md', false);

      handler.toggleCollapse('block1');

      const blocks = (handler as any).activeCodeBlocks;
      expect(blocks.get('block1').isCollapsed).toBe(true);
    });

    it('toggles back to expanded', () => {
      const el = document.createElement('div');
      handler.trackCodeBlock('block1', el, '', 'note.md', true);

      handler.toggleCollapse('block1');

      const blocks = (handler as any).activeCodeBlocks;
      expect(blocks.get('block1').isCollapsed).toBe(false);
    });

    it('does nothing for untracked block', () => {
      // Should not throw
      handler.toggleCollapse('unknown');
    });
  });

  describe('getCollapseState', () => {
    it('returns collapse state for tracked block', () => {
      const el = document.createElement('div');
      handler.trackCodeBlock('block1', el, '', 'note.md', true);

      expect(handler.getCollapseState('block1')).toBe(true);
    });

    it('returns undefined for untracked block', () => {
      expect(handler.getCollapseState('unknown')).toBeUndefined();
    });
  });

  describe('handleFileDeleted', () => {
    it('removes code blocks from deleted file', () => {
      const el1 = document.createElement('div');
      const el2 = document.createElement('div');
      handler.trackCodeBlock('block1', el1, '', 'note.md');
      handler.trackCodeBlock('block2', el2, '', 'other.md');

      handler.handleFileDeleted('note.md');

      const blocks = (handler as any).activeCodeBlocks;
      expect(blocks.has('block1')).toBe(false);
      expect(blocks.has('block2')).toBe(true);
    });
  });

  describe('handleFileRenamed', () => {
    it('updates file path for tracked blocks', () => {
      const el = document.createElement('div');
      handler.trackCodeBlock('block1', el, '', 'old.md');

      handler.handleFileRenamed('old.md', 'new.md');

      const blocks = (handler as any).activeCodeBlocks;
      expect(blocks.get('block1').filePath).toBe('new.md');
    });
  });

  describe('clearAllCodeBlocks', () => {
    it('removes all tracked blocks', () => {
      const el1 = document.createElement('div');
      const el2 = document.createElement('div');
      handler.trackCodeBlock('block1', el1, '', 'note1.md');
      handler.trackCodeBlock('block2', el2, '', 'note2.md');

      handler.clearAllCodeBlocks();

      const blocks = (handler as any).activeCodeBlocks;
      expect(blocks.size).toBe(0);
    });
  });

  describe('setManager', () => {
    it('updates the manager reference', () => {
      const newManager = { updateSettings: jest.fn() };
      handler.setManager(newManager as any);
      expect((handler as any).manager).toBe(newManager);
    });
  });

  describe('updateSettings', () => {
    it('delegates to manager updateSettings', () => {
      handler.updateSettings(createBaseSettings({ weekStartsOn: 'Sunday' }));
      expect(mockManager.updateSettings).toHaveBeenCalled();
    });
  });
});
