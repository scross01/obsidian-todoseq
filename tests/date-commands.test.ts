import { EditorController } from '../src/services/editor-controller';
import { TaskParser } from '../src/parser/task-parser';
import { TodoTrackerSettings } from '../src/settings/settings-types';
import { Editor, MarkdownView } from 'obsidian';
import { createBaseSettings } from './helpers/test-helper';

describe('Date Commands', () => {
  let editorController: EditorController;
  let mockPlugin: any;
  let mockEditor: any;
  let mockView: any;
  let settings: TodoTrackerSettings;

  beforeEach(() => {
    // Create settings using the base settings helper with overrides
    settings = createBaseSettings({
      languageCommentSupport: {
        enabled: false,
      },
    });

    // Mock plugin with necessary properties
    mockPlugin = {
      getVaultScanner: () => ({
        getParser: () => {
          const parser = TaskParser.create(settings, null);
          return parser;
        },
      }),
      taskEditor: {},
    };

    editorController = new EditorController(mockPlugin);

    // Mock editor
    mockEditor = {
      getLine: (lineNumber: number) => {
        const lines = [
          'TODO This is a test task without any dates',
          'TODO This is another test task that needs scheduled date',
          'TODO This task needs a deadline date',
        ];
        return lines[lineNumber] || '';
      },
      lineCount: () => 3,
      getCursor: () => ({ line: 0, ch: 0 }),
      setCursor: jest.fn(),
      setSelection: jest.fn(),
      replaceRange: jest.fn(),
    };

    mockView = {
      editor: mockEditor,
    };
  });

  describe('handleAddScheduledDateAtCursor', () => {
    it('should return false when not on a task line', () => {
      // Mock editor to return a non-task line
      mockEditor.getLine = (lineNumber: number) => {
        const lines = ['This is not a task line', 'Neither is this'];
        return lines[lineNumber] || '';
      };

      const result = editorController.handleAddScheduledDateAtCursor(
        false,
        mockEditor as Editor,
        mockView as MarkdownView,
      );

      expect(result).toBe(false);
    });

    it('should return true when checking on a task line', () => {
      const result = editorController.handleAddScheduledDateAtCursor(
        true,
        mockEditor as Editor,
        mockView as MarkdownView,
      );

      expect(result).toBe(true);
    });
  });

  describe('handleAddDeadlineDateAtCursor', () => {
    it('should return false when not on a task line', () => {
      // Mock editor to return a non-task line
      mockEditor.getLine = (lineNumber: number) => {
        const lines = ['This is not a task line', 'Neither is this'];
        return lines[lineNumber] || '';
      };

      const result = editorController.handleAddDeadlineDateAtCursor(
        false,
        mockEditor as Editor,
        mockView as MarkdownView,
      );

      expect(result).toBe(false);
    });

    it('should return true when checking on a task line', () => {
      const result = editorController.handleAddDeadlineDateAtCursor(
        true,
        mockEditor as Editor,
        mockView as MarkdownView,
      );

      expect(result).toBe(true);
    });
  });

  describe('getCurrentDateString', () => {
    it('should return current date in YYYY-MM-DD format', () => {
      const dateString = editorController['getCurrentDateString']();

      // Check if it matches the expected format
      expect(dateString).toMatch(/^\d{4}-\d{2}-\d{2}$/);

      // Check if it's a valid date
      const dateParts = dateString.split('-');
      const year = parseInt(dateParts[0]);
      const month = parseInt(dateParts[1]);
      const day = parseInt(dateParts[2]);

      expect(year).toBeGreaterThan(2000);
      expect(year).toBeLessThan(3000);
      expect(month).toBeGreaterThanOrEqual(1);
      expect(month).toBeLessThanOrEqual(12);
      expect(day).toBeGreaterThanOrEqual(1);
      expect(day).toBeLessThanOrEqual(31);
    });
  });

  describe('insertDateLine', () => {
    it('should insert date immediately after task line, not after blank lines', () => {
      // Mock editor with blank lines after task
      mockEditor = {
        getLine: (lineNumber: number) => {
          const lines = [
            'TODO This is a test task',
            '',
            '',
            'Some other content',
          ];
          return lines[lineNumber] || '';
        },
        lineCount: () => 4,
        getCursor: () => ({ line: 0, ch: 0 }),
        setCursor: jest.fn(),
        setSelection: jest.fn(),
        replaceRange: jest.fn(),
      };

      // Call the private method directly
      editorController['insertDateLine'](mockEditor, 0, 'SCHEDULED');

      // Verify that replaceRange was called with the correct position
      // It should insert at line 0 (immediately after task line), not line 2 (after blank lines)
      expect(mockEditor.replaceRange).toHaveBeenCalled();
      const call = mockEditor.replaceRange.mock.calls[0];
      expect(call[1].line).toBe(0); // Should insert after line 0 (task line)
    });
  });

  describe('adding scheduled date after deadline date', () => {
    it('should not add extra blank line when adding scheduled date after existing deadline', () => {
      // Mock editor with task and existing deadline
      mockEditor = {
        getLine: (lineNumber: number) => {
          const lines = [
            'TODO This is a test task',
            'DEADLINE: <2023-12-31>',
            'Some other content',
          ];
          return lines[lineNumber] || '';
        },
        lineCount: () => 3,
        getCursor: () => ({ line: 0, ch: 0 }),
        setCursor: jest.fn(),
        setSelection: jest.fn(),
        replaceRange: jest.fn(),
      };

      // Call the private method directly to add scheduled date
      editorController['insertDateLine'](mockEditor, 0, 'SCHEDULED');

      // Verify that replaceRange was called
      expect(mockEditor.replaceRange).toHaveBeenCalled();
      const call = mockEditor.replaceRange.mock.calls[0];

      // The insertion should happen at line 0 (after task line, before deadline)
      expect(call[1].line).toBe(0);

      // Check the content being inserted - should not contain extra blank lines
      const insertedContent = call[0];

      // Should insert newline + scheduled line only (no extra blank line)
      expect(insertedContent).toBe(
        '\nSCHEDULED: <' + editorController['getCurrentDateString']() + '>',
      );
    });
  });
});
