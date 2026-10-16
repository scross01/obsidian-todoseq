import { Task } from '../src/types/task';
import { TaskWriter } from '../src/services/task-writer';
import {
  createBaseTask,
  createCheckboxTask,
  createTestKeywordManager,
} from './helpers/test-helper';

/**
 * Matrix for the plain compose branch's separator rule: when the prefix
 * (indent + footnote marker) is non-empty, does not end in whitespace, and
 * there is no list marker, the keyword must stay separated from the prefix
 * (org-mode `* TODO x`). Every other shape must stay byte-identical.
 */
describe('TaskWriter.generateTaskLine — keyword separator (org-mode)', () => {
  describe('characterisation: existing shapes stay byte-identical', () => {
    test('column-0 keyword gains no leading space', () => {
      const task = createBaseTask();
      const result = TaskWriter.generateTaskLine(
        task,
        'DOING',
        true,
        createTestKeywordManager(),
      );
      expect(result.newLine).toBe('DOING Task text');
    });

    test('indent already ending in whitespace gains no extra space', () => {
      const task = createBaseTask({
        rawText: '    TODO Task text',
        indent: '    ',
      });
      const result = TaskWriter.generateTaskLine(
        task,
        'DOING',
        true,
        createTestKeywordManager(),
      );
      expect(result.newLine).toBe('    DOING Task text');
    });

    test('markdown list marker keeps its own single space', () => {
      const task = createBaseTask({
        rawText: '- TODO Task text',
        listMarker: '- ',
      });
      const result = TaskWriter.generateTaskLine(
        task,
        'DOING',
        true,
        createTestKeywordManager(),
      );
      expect(result.newLine).toBe('- DOING Task text');
    });

    test('footnote marker (parser form, trailing space) keeps one space', () => {
      const task = createBaseTask({
        rawText: '[^1]: TODO Task text',
        footnoteMarker: '[^1]: ',
      });
      const result = TaskWriter.generateTaskLine(
        task,
        'DONE',
        true,
        createTestKeywordManager(),
      );
      expect(result.newLine).toBe('[^1]: DONE Task text');
      expect(result.completed).toBe(true);
    });

    test('checkbox tasks compose through their own branch', () => {
      const task = createCheckboxTask();
      const result = TaskWriter.generateTaskLine(
        task,
        'DOING',
        true,
        createTestKeywordManager(),
      );
      expect(result.newLine).toBe('- [ ] DOING Task text');
      expect(result.completed).toBe(false);
    });
  });

  describe('org-mode heading tasks (asterisk indent, no list marker)', () => {
    test('level-1 heading keeps the keyword off the stars', () => {
      const task = createBaseTask({
        rawText: '* TODO Task text',
        indent: '*',
      });
      const result = TaskWriter.generateTaskLine(
        task,
        'DOING',
        true,
        createTestKeywordManager(),
      );
      expect(result.newLine).toBe('* DOING Task text');
      expect(result.completed).toBe(false);
    });

    test('level-2 heading keeps the keyword off the stars', () => {
      const task = createBaseTask({
        rawText: '** TODO Task text',
        indent: '**',
      });
      const result = TaskWriter.generateTaskLine(
        task,
        'DOING',
        true,
        createTestKeywordManager(),
      );
      expect(result.newLine).toBe('** DOING Task text');
    });

    test('completing an org task separates the keyword and marks completed', () => {
      const task = createBaseTask({
        rawText: '* TODO Task text',
        indent: '*',
      });
      const result = TaskWriter.generateTaskLine(
        task,
        'DONE',
        true,
        createTestKeywordManager(),
      );
      expect(result.newLine).toBe('* DONE Task text');
      expect(result.completed).toBe(true);
    });
  });

  describe('footnote marker without trailing whitespace (defensive shape)', () => {
    test('separator lands after the marker, before the keyword', () => {
      const task = createBaseTask({
        rawText: '[^1]:TODO Task text',
        footnoteMarker: '[^1]:',
      });
      const result = TaskWriter.generateTaskLine(
        task,
        'DOING',
        true,
        createTestKeywordManager(),
      );
      expect(result.newLine).toBe('[^1]: DOING Task text');
    });
  });

  describe('round-trip: repeated state cycles never accumulate spaces', () => {
    test('TODO → DOING → DONE on an org task stays single-spaced', () => {
      const keywordManager = createTestKeywordManager();
      const first = TaskWriter.generateTaskLine(
        createBaseTask({ rawText: '* TODO Task text', indent: '*' }),
        'DOING',
        true,
        keywordManager,
      );
      expect(first.newLine).toBe('* DOING Task text');

      // Recompose from the written line, the way a second cycle would see it.
      const second = TaskWriter.generateTaskLine(
        createBaseTask({
          rawText: first.newLine,
          indent: '*',
          state: 'DOING',
        }),
        'DONE',
        true,
        keywordManager,
      );
      expect(second.newLine).toBe('* DONE Task text');
      expect(second.newLine).not.toContain('  ');
    });
  });
});
