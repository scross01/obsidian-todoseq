import { EditorController } from '../src/services/editor-controller';
import { TaskParser } from '../src/parser/task-parser';
import { TodoTrackerSettings } from '../src/settings/settings-types';
import { createBaseSettings } from './helpers/test-helper';

describe('Editor Controller - Date Line Handling', () => {
  let editorController: EditorController;
  let mockPlugin: any;
  let mockEditor: any;
  let settings: TodoTrackerSettings;

  beforeEach(() => {
    settings = createBaseSettings({
      languageCommentSupport: {
        enabled: false,
      },
    });

    mockPlugin = {
      getVaultScanner: () => ({
        getParser: () => {
          const parser = TaskParser.create(settings, null);
          return parser;
        },
      }),
    };

    editorController = new EditorController(mockPlugin);

    mockEditor = {
      getLine: (lineNumber: number) => '',
      lineCount: () => 0,
      setCursor: jest.fn(),
      setSelection: jest.fn(),
      replaceRange: jest.fn(),
    };
  });

  describe('findExistingDateLine', () => {
    it('should find existing deadline date line', () => {
      mockEditor = {
        getLine: (lineNumber: number) => {
          const lines = ['TODO Test task', 'DEADLINE: <2024-01-15>'];
          return lines[lineNumber] || '';
        },
        lineCount: () => 2,
      };

      const result = editorController['findExistingDateLine'](
        mockEditor as any,
        0,
        'DEADLINE',
      );

      expect(result).toBe(1);
    });

    it('should return null when no date lines exist', () => {
      mockEditor = {
        getLine: (lineNumber: number) => {
          const lines = ['TODO Test task', 'Some other content'];
          return lines[lineNumber] || '';
        },
        lineCount: () => 2,
      };

      const result = editorController['findExistingDateLine'](
        mockEditor as any,
        0,
        'DEADLINE',
      );

      expect(result).toBeNull();
    });
  });

  describe('insertDateLine', () => {
    it('should insert deadline date after scheduled date', () => {
      mockEditor = {
        getLine: (lineNumber: number) => {
          const lines = ['TODO Test task', 'SCHEDULED: <2023-12-31>'];
          return lines[lineNumber] || '';
        },
        lineCount: () => 2,
        setCursor: jest.fn(),
        setSelection: jest.fn(),
        replaceRange: jest.fn(),
      };

      editorController['insertDateLine'](mockEditor as any, 0, 'DEADLINE');

      expect(mockEditor.replaceRange).toHaveBeenCalled();
    });

    it('should insert scheduled date before deadline date', () => {
      mockEditor = {
        getLine: (lineNumber: number) => {
          const lines = ['TODO Test task', 'DEADLINE: <2024-01-15>'];
          return lines[lineNumber] || '';
        },
        lineCount: () => 2,
        setCursor: jest.fn(),
        setSelection: jest.fn(),
        replaceRange: jest.fn(),
      };

      editorController['insertDateLine'](mockEditor as any, 0, 'SCHEDULED');

      expect(mockEditor.replaceRange).toHaveBeenCalled();
    });

    it('should handle single task without existing dates', () => {
      mockEditor = {
        getLine: (lineNumber: number) => {
          const lines = ['TODO Test task'];
          return lines[lineNumber] || '';
        },
        lineCount: () => 1,
        setCursor: jest.fn(),
        setSelection: jest.fn(),
        replaceRange: jest.fn(),
      };

      editorController['insertDateLine'](mockEditor as any, 0, 'SCHEDULED');

      expect(mockEditor.replaceRange).toHaveBeenCalled();
    });
  });

  describe('handleAddDateAtLine', () => {
    it('should return false when vault scanner is not available', () => {
      mockPlugin.getVaultScanner = () => null;

      const result = editorController['handleAddDateAtLine'](
        false,
        0,
        mockEditor as any,
        { file: { path: 'test.md' } } as any,
        'SCHEDULED',
      );

      expect(result).toBe(false);
    });

    it('should return true when checking on valid task line', () => {
      mockEditor.getLine = () => 'TODO Test task';

      const result = editorController['handleAddDateAtLine'](
        true,
        0,
        mockEditor as any,
        { file: { path: 'test.md' } } as any,
        'SCHEDULED',
      );

      expect(result).toBe(true);
    });

    it('should move cursor to existing date line instead of inserting', () => {
      const mockMoveCursorToDateLine = jest.spyOn(
        editorController as any,
        'moveCursorToDateLine',
      );
      mockMoveCursorToDateLine.mockImplementation(() => {});

      const mockFindExistingDateLine = jest.spyOn(
        editorController as any,
        'findExistingDateLine',
      );
      mockFindExistingDateLine.mockReturnValue(1);

      mockEditor.getLine = () => 'TODO Test task';

      const result = editorController['handleAddDateAtLine'](
        false,
        0,
        mockEditor as any,
        { file: { path: 'test.md' } } as any,
        'SCHEDULED',
      );

      expect(result).toBe(true);
      expect(mockMoveCursorToDateLine).toHaveBeenCalled();
    });
  });
});
