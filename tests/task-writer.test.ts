import { TaskWriter } from '../src/services/task-writer';
import {
  createBaseTask,
  createCheckboxTask,
  createTestKeywordManager,
} from './helpers/test-helper';

describe('TaskWriter.generateTaskLine', () => {
  describe('Basic task formatting', () => {
    test('should format TODO task without priority', () => {
      const task = createBaseTask();
      const result = TaskWriter.generateTaskLine(
        task,
        'TODO',
        true,
        createTestKeywordManager(),
      );
      expect(result.newLine).toBe('TODO Task text');
      expect(result.completed).toBe(false);
    });

    test('should format TODO task with high priority', () => {
      const task = createBaseTask({ priority: 'high' });
      const result = TaskWriter.generateTaskLine(
        task,
        'TODO',
        true,
        createTestKeywordManager(),
      );
      expect(result.newLine).toBe('TODO [#A] Task text');
      expect(result.completed).toBe(false);
    });

    test('should format TODO task with medium priority', () => {
      const task = createBaseTask({ priority: 'med' });
      const result = TaskWriter.generateTaskLine(
        task,
        'TODO',
        true,
        createTestKeywordManager(),
      );
      expect(result.newLine).toBe('TODO [#B] Task text');
      expect(result.completed).toBe(false);
    });

    test('should format TODO task with low priority', () => {
      const task = createBaseTask({ priority: 'low' });
      const result = TaskWriter.generateTaskLine(
        task,
        'TODO',
        true,
        createTestKeywordManager(),
      );
      expect(result.newLine).toBe('TODO [#C] Task text');
      expect(result.completed).toBe(false);
    });

    test('should format DONE task and mark as completed', () => {
      const task = createBaseTask();
      const result = TaskWriter.generateTaskLine(
        task,
        'DONE',
        true,
        createTestKeywordManager(),
      );
      expect(result.newLine).toBe('DONE Task text');
      expect(result.completed).toBe(true);
    });

    test('should format DONE task with priority and mark as completed', () => {
      const task = createBaseTask({
        rawText: 'TODO [#A] Task text',
        priority: 'high',
      });
      const result = TaskWriter.generateTaskLine(
        task,
        'DONE',
        true,
        createTestKeywordManager(),
      );
      expect(result.newLine).toBe('DONE [#A] Task text');
      expect(result.completed).toBe(true);
    });
  });

  describe('Checkbox task formatting', () => {
    test('should format checkbox TODO task', () => {
      const task = createCheckboxTask();
      const result = TaskWriter.generateTaskLine(
        task,
        'TODO',
        true,
        createTestKeywordManager(),
      );
      expect(result.newLine).toBe('- [ ] TODO Task text');
      expect(result.completed).toBe(false);
    });

    test('should format checkbox DONE task with checked box', () => {
      const task = createCheckboxTask();
      const result = TaskWriter.generateTaskLine(
        task,
        'DONE',
        true,
        createTestKeywordManager(),
      );
      expect(result.newLine).toBe('- [x] DONE Task text');
      expect(result.completed).toBe(true);
    });

    test('should format checkbox DOING task with unchecked box', () => {
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

    test('should format checkbox task with priority', () => {
      const task = createCheckboxTask({ priority: 'high' });
      const result = TaskWriter.generateTaskLine(
        task,
        'TODO',
        true,
        createTestKeywordManager(),
      );
      expect(result.newLine).toBe('- [ ] TODO [#A] Task text');
      expect(result.completed).toBe(false);
    });
  });

  describe('Empty state handling', () => {
    test('should remove task keyword for empty state on regular task', () => {
      const task = createBaseTask();
      const result = TaskWriter.generateTaskLine(
        task,
        '',
        true,
        createTestKeywordManager(),
      );
      expect(result.newLine).toBe('Task text');
      expect(result.completed).toBe(false);
    });

    test('should keep checkbox format for empty state on checkbox task', () => {
      const task = createCheckboxTask();
      const result = TaskWriter.generateTaskLine(
        task,
        '',
        true,
        createTestKeywordManager(),
      );
      expect(result.newLine).toBe('- [ ] Task text');
      expect(result.completed).toBe(false);
    });

    test('should handle empty task text with empty state', () => {
      const task = createBaseTask({ rawText: 'TODO', text: '' });
      const result = TaskWriter.generateTaskLine(
        task,
        '',
        true,
        createTestKeywordManager(),
      );
      expect(result.newLine).toBe('');
      expect(result.completed).toBe(false);
    });
  });

  describe('Priority handling', () => {
    test('should remove priority when keepPriority is false', () => {
      const task = createBaseTask({
        rawText: 'TODO [#A] Task text',
        priority: 'high',
      });
      const result = TaskWriter.generateTaskLine(
        task,
        'TODO',
        false,
        createTestKeywordManager(),
      );
      expect(result.newLine).toBe('TODO Task text');
      expect(result.completed).toBe(false);
    });

    test('should keep priority when keepPriority is true', () => {
      const task = createBaseTask({
        rawText: 'TODO [#A] Task text',
        priority: 'high',
      });
      const result = TaskWriter.generateTaskLine(
        task,
        'TODO',
        true,
        createTestKeywordManager(),
      );
      expect(result.newLine).toBe('TODO [#A] Task text');
      expect(result.completed).toBe(false);
    });

    test('should add priority when changing state and keepPriority is true', () => {
      const task = createBaseTask({ priority: 'high' });
      const result = TaskWriter.generateTaskLine(
        task,
        'DOING',
        true,
        createTestKeywordManager(),
      );
      expect(result.newLine).toBe('DOING [#A] Task text');
      expect(result.completed).toBe(false);
    });

    test('should handle empty rawText for priority', () => {
      const task = createBaseTask({
        rawText: '',
        text: 'Task text',
        priority: 'high',
      });

      const result = TaskWriter.generateTaskLine(
        task,
        'TODO',
        true,
        createTestKeywordManager(),
      );
      expect(result.newLine).toBe('TODO [#A] Task text');
    });

    test('should handle tasks with quote prefixes in priority', () => {
      const task = createBaseTask({
        rawText: '> TODO Task text',
        text: 'Task text',
        indent: '> ',
        priority: 'med',
      });

      const result = TaskWriter.generateTaskLine(
        task,
        'DOING',
        true,
        createTestKeywordManager(),
      );
      expect(result.newLine).toBe('> DOING [#B] Task text');
    });

    test('should handle tasks without priority markers', () => {
      const task = createBaseTask({ priority: null });

      const result = TaskWriter.generateTaskLine(
        task,
        'DONE',
        true,
        createTestKeywordManager(),
      );
      expect(result.newLine).not.toContain('[#');
    });

    test('should preserve priority when keepPriority true', () => {
      const task = createBaseTask({ priority: 'high' });

      const result = TaskWriter.generateTaskLine(
        task,
        'DOING',
        true,
        createTestKeywordManager(),
      );
      expect(result.newLine).toContain('[#A]');
    });
  });

  describe('Complex task formatting', () => {
    test('should handle task with trailing comment characters', () => {
      const task = createBaseTask({
        rawText: 'TODO Task text */',
        text: 'Task text',
        tail: ' */',
      });
      const result = TaskWriter.generateTaskLine(
        task,
        'DONE',
        true,
        createTestKeywordManager(),
      );
      expect(result.newLine).toBe('DONE Task text */');
      expect(result.completed).toBe(true);
    });

    test('should handle task with footnote marker', () => {
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

    test('should handle task with embed reference', () => {
      const task = createBaseTask({
        rawText: 'TODO Task text ^abc123',
        embedReference: '^abc123',
      });
      const result = TaskWriter.generateTaskLine(
        task,
        'DONE',
        true,
        createTestKeywordManager(),
      );
      expect(result.newLine).toBe('DONE Task text ^abc123');
      expect(result.completed).toBe(true);
    });

    test('should handle task with footnote reference', () => {
      const task = createBaseTask({
        rawText: 'TODO Task text [^2]',
        footnoteReference: '[^2]',
      });
      const result = TaskWriter.generateTaskLine(
        task,
        'DONE',
        true,
        createTestKeywordManager(),
      );
      expect(result.newLine).toBe('DONE Task text [^2]');
      expect(result.completed).toBe(true);
    });

    test('should handle task with both embed reference and footnote reference', () => {
      const task = createBaseTask({
        rawText: 'TODO Task text ^abc123 [^2]',
        embedReference: '^abc123',
        footnoteReference: '[^2]',
      });
      const result = TaskWriter.generateTaskLine(
        task,
        'DONE',
        true,
        createTestKeywordManager(),
      );
      expect(result.newLine).toBe('DONE Task textxt ^abc123 ^abc123 [^2]');
      expect(result.completed).toBe(true);
    });

    test('should handle tasks with embed reference and priority', () => {
      const task = createBaseTask({
        rawText: 'TODO Task text ^12345',
        text: 'Task text',
        embedReference: '^12345',
        priority: 'high',
      });

      const result = TaskWriter.generateTaskLine(
        task,
        'DONE',
        true,
        createTestKeywordManager(),
      );
      expect(result.newLine).toContain('[#A]');
      expect(result.newLine).toContain('^12345');
    });

    test('should handle tasks with only state and embed reference', () => {
      const task = createBaseTask({
        rawText: 'TODO ^123',
        text: '',
        embedReference: '^123',
        priority: null,
      });

      const result = TaskWriter.generateTaskLine(
        task,
        'DONE',
        true,
        createTestKeywordManager(),
      );
      expect(result.newLine).toContain('DONE');
      expect(result.newLine).toContain('^123');
    });

    test('should handle tasks with footnote reference and priority', () => {
      const task = createBaseTask({
        rawText: 'TODO Task text [^1]',
        text: 'Task text',
        footnoteReference: '[^1]',
        priority: 'med',
      });

      const result = TaskWriter.generateTaskLine(
        task,
        'DOING',
        true,
        createTestKeywordManager(),
      );
      expect(result.newLine).toContain('[#B]');
      expect(result.newLine).toContain('[^1]');
    });
  });

  describe('Indented task formatting', () => {
    test('should handle indented regular task', () => {
      const task = createBaseTask({
        rawText: '  TODO Task text',
        indent: '  ',
      });
      const result = TaskWriter.generateTaskLine(
        task,
        'DONE',
        true,
        createTestKeywordManager(),
      );
      expect(result.newLine).toBe('  DONE Task text');
      expect(result.completed).toBe(true);
    });

    test('should handle indented checkbox task', () => {
      const task = createCheckboxTask({
        rawText: '  - [ ] TODO Task text',
        indent: '  ',
      });
      const result = TaskWriter.generateTaskLine(
        task,
        'DONE',
        true,
        createTestKeywordManager(),
      );
      expect(result.newLine).toBe('  - [x] DONE Task text');
      expect(result.completed).toBe(true);
    });
  });

  describe('Quoted task formatting', () => {
    test('should handle quoted regular task', () => {
      const task = createBaseTask({
        rawText: '> TODO Task text',
        indent: '> ',
      });
      const result = TaskWriter.generateTaskLine(
        task,
        'DONE',
        true,
        createTestKeywordManager(),
      );
      expect(result.newLine).toBe('> DONE Task text');
      expect(result.completed).toBe(true);
    });

    test('should handle quoted checkbox task', () => {
      const task = createCheckboxTask({
        rawText: '> - [ ] TODO Task text',
        indent: '> ',
      });
      const result = TaskWriter.generateTaskLine(
        task,
        'DONE',
        true,
        createTestKeywordManager(),
      );
      expect(result.newLine).toBe('> - [x] DONE Task text');
      expect(result.completed).toBe(true);
    });

    test('should handle nested quoted task', () => {
      const task = createBaseTask({
        rawText: '> > TODO Task text',
        indent: '> > ',
      });
      const result = TaskWriter.generateTaskLine(
        task,
        'DONE',
        true,
        createTestKeywordManager(),
      );
      expect(result.newLine).toBe('> > DONE Task text');
      expect(result.completed).toBe(true);
    });
  });

  describe('Bulleted task formatting', () => {
    test('should handle bulleted task without checkbox', () => {
      const task = createBaseTask({
        rawText: '- TODO Task text',
        listMarker: '- ',
      });
      const result = TaskWriter.generateTaskLine(
        task,
        'DONE',
        true,
        createTestKeywordManager(),
      );
      expect(result.newLine).toBe('- DONE Task text');
      expect(result.completed).toBe(true);
    });

    test('should handle numbered task', () => {
      const task = createBaseTask({
        rawText: '1. TODO Task text',
        listMarker: '1. ',
      });
      const result = TaskWriter.generateTaskLine(
        task,
        'DONE',
        true,
        createTestKeywordManager(),
      );
      expect(result.newLine).toBe('1. DONE Task text');
      expect(result.completed).toBe(true);
    });

    test('should handle letter task', () => {
      const task = createBaseTask({
        rawText: 'a. TODO Task text',
        listMarker: 'a. ',
      });
      const result = TaskWriter.generateTaskLine(
        task,
        'DONE',
        true,
        createTestKeywordManager(),
      );
      expect(result.newLine).toBe('a. DONE Task text');
      expect(result.completed).toBe(true);
    });

    test('should preserve * list marker for checkbox task', () => {
      const task = createCheckboxTask({
        rawText: '* [ ] TODO Task text',
        listMarker: '* ',
        text: 'Task text',
      });

      const result = TaskWriter.generateTaskLine(
        task,
        'DONE',
        true,
        createTestKeywordManager(),
      );
      expect(result.newLine).toBe('* [x] DONE Task text');
    });

    test('should preserve + list marker for checkbox task', () => {
      const task = createCheckboxTask({
        rawText: '+ [ ] TODO Task text',
        listMarker: '+ ',
        text: 'Task text',
      });

      const result = TaskWriter.generateTaskLine(
        task,
        'DONE',
        true,
        createTestKeywordManager(),
      );
      expect(result.newLine).toBe('+ [x] DONE Task text');
    });

    test('should preserve checkbox list marker character from task.rawText', () => {
      const task = createCheckboxTask({
        rawText: '+ [ ] TODO Task text',
        listMarker: '+ ',
        text: 'Task text',
      });

      const result = TaskWriter.generateTaskLine(
        task,
        'TODO',
        false,
        createTestKeywordManager(),
      );
      expect(result.newLine).toMatch(/^\+ \[ \] TODO Task text$/);
    });
  });

  describe('Custom state handling', () => {
    test('should handle custom non-completed state', () => {
      const task = createBaseTask();
      const result = TaskWriter.generateTaskLine(
        task,
        'CUSTOM',
        true,
        createTestKeywordManager(),
      );
      expect(result.newLine).toBe('CUSTOM Task text');
      expect(result.completed).toBe(false);
    });

    test('should handle custom completed state', () => {
      const task = createBaseTask();

      // Pass custom completed state via KeywordManager
      const result = TaskWriter.generateTaskLine(
        task,
        'CUSTOM',
        true,
        createTestKeywordManager({
          additionalCompletedKeywords: ['CUSTOM'],
        }),
      );
      expect(result.newLine).toBe('CUSTOM Task text');
      expect(result.completed).toBe(true);
    });
  });

  describe('Edge cases', () => {
    test('should handle task with only whitespace text', () => {
      const task = createBaseTask({
        rawText: 'TODO   ',
        text: '  ',
      });
      const result = TaskWriter.generateTaskLine(
        task,
        'DONE',
        true,
        createTestKeywordManager(),
      );
      expect(result.newLine).toBe('DONE   ');
      expect(result.completed).toBe(true);
    });

    test('should handle task with special characters in text', () => {
      const task = createBaseTask({
        rawText: 'TODO Task with @tags and #hashtags',
        text: 'Task with @tags and #hashtags',
      });
      const result = TaskWriter.generateTaskLine(
        task,
        'DONE',
        true,
        createTestKeywordManager(),
      );
      expect(result.newLine).toBe('DONE Task with @tags and #hashtags');
      expect(result.completed).toBe(true);
    });

    test('should handle empty task object with minimal properties', () => {
      const task = createBaseTask({
        rawText: '',
        text: '',
        state: '',
      });
      const result = TaskWriter.generateTaskLine(
        task,
        'TODO',
        true,
        createTestKeywordManager(),
      );
      expect(result.newLine).toBe('TODO ');
      expect(result.completed).toBe(false);
    });

    test('should handle task with tail when newState is empty', () => {
      const task = createBaseTask({
        rawText: 'TODO Task with tail */',
        text: 'Task with tail',
        tail: ' */',
        priority: null,
      });

      const result = TaskWriter.generateTaskLine(
        task,
        '',
        true,
        createTestKeywordManager(),
      );
      expect(result.newLine).toContain('Task with tail */');
    });

    test('should handle checkbox task with tail when newState is empty', () => {
      const task = createCheckboxTask({
        rawText: '- [ ] TODO Task with tail */',
        text: 'Task with tail',
        tail: ' */',
        priority: null,
      });

      const result = TaskWriter.generateTaskLine(
        task,
        '',
        true,
        createTestKeywordManager(),
      );
      expect(result.newLine).toContain('Task with tail */');
    });

    test('should handle task with tail and priority when newState is empty', () => {
      const task = createBaseTask({
        rawText: 'TODO [#A] Task with tail */',
        text: 'Task with tail',
        tail: ' */',
        priority: 'high',
      });

      const result = TaskWriter.generateTaskLine(
        task,
        '',
        true,
        createTestKeywordManager(),
      );
      expect(result.newLine).toContain('Task with tail */');
    });
  });

  describe('Archived checkbox state', () => {
    test('should preserve existing checkbox state for archived tasks', () => {
      const task = createCheckboxTask({
        rawText: '- [x] DONE Task text',
        text: 'Task text',
        state: 'DONE',
      });

      const archivedKm = createTestKeywordManager({
        additionalArchivedKeywords: ['ARCHIVED'],
      });

      const result = TaskWriter.generateTaskLine(
        task,
        'ARCHIVED',
        true,
        archivedKm,
      );
      expect(result.newLine).toBe('- [x] ARCHIVED Task text');
    });

    test('should preserve unchecked state for archived tasks from unchecked original', () => {
      const task = createCheckboxTask({
        rawText: '- [ ] DONE Task text',
        text: 'Task text',
        state: 'DONE',
      });

      const archivedKm = createTestKeywordManager({
        additionalArchivedKeywords: ['ARCHIVED'],
      });

      const result = TaskWriter.generateTaskLine(
        task,
        'ARCHIVED',
        true,
        archivedKm,
      );
      expect(result.newLine).toBe('- [ ] ARCHIVED Task text');
    });
  });

  describe('Extended checkbox states', () => {
    // Keyword manager configured for extended checkbox styles
    const extendedKm = () =>
      createTestKeywordManager({ useExtendedCheckboxStyles: true });

    test('should generate [ ] for inactive tasks', () => {
      const task = createCheckboxTask({
        rawText: '- [ ] TODO Task text',
        text: 'Task text',
        state: 'TODO',
        completed: false,
        priority: null,
      });

      const result = TaskWriter.generateTaskLine(
        task,
        'TODO',
        false,
        extendedKm(),
      );
      expect(result.newLine).toContain('- [ ] TODO Task text');
      expect(result.completed).toBe(false);
    });

    test('should generate [ ] for waiting tasks', () => {
      const task = createCheckboxTask({
        rawText: '- [ ] WAIT Task text',
        text: 'Task text',
        state: 'WAIT',
        completed: false,
        priority: null,
      });

      const result = TaskWriter.generateTaskLine(
        task,
        'WAIT',
        false,
        extendedKm(),
      );
      expect(result.newLine).toContain('- [ ] WAIT Task text');
      expect(result.completed).toBe(false);
    });

    test('should generate [/] for active tasks', () => {
      const task = createCheckboxTask({
        rawText: '- [ ] NOW Task text',
        text: 'Task text',
        state: 'NOW',
        completed: false,
        priority: null,
      });

      const result = TaskWriter.generateTaskLine(
        task,
        'NOW',
        false,
        extendedKm(),
      );
      expect(result.newLine).toMatch('- [/] NOW Task text');
      expect(result.completed).toBe(false);
    });

    test('should generate [-] for canceled tasks', () => {
      const task = createCheckboxTask({
        rawText: '- [ ] CANCELED Task text',
        text: 'Task text',
        state: 'CANCELED',
        completed: true,
        priority: null,
      });

      const result = TaskWriter.generateTaskLine(
        task,
        'CANCELED',
        false,
        extendedKm(),
      );
      expect(result.newLine).toContain('- [-] CANCELED Task text');
      expect(result.completed).toBe(true);
    });

    test('should generate [-] for CANCELLED tasks', () => {
      const task = createCheckboxTask({
        rawText: '- [ ] CANCELLED Task text',
        text: 'Task text',
        state: 'CANCELLED',
        completed: true,
        priority: null,
      });

      const result = TaskWriter.generateTaskLine(
        task,
        'CANCELLED',
        false,
        extendedKm(),
      );
      expect(result.newLine).toContain('- [-] CANCELLED Task text');
      expect(result.completed).toBe(true);
    });

    test('should generate [x] for completed (not canceled) tasks', () => {
      const task = createCheckboxTask({
        rawText: '- [ ] DONE Task text',
        text: 'Task text',
        state: 'DONE',
        completed: true,
        priority: null,
      });

      const result = TaskWriter.generateTaskLine(
        task,
        'DONE',
        false,
        extendedKm(),
      );
      expect(result.newLine).toContain('- [x] DONE Task text');
      expect(result.completed).toBe(true);
    });

    test('should handle checkbox with priority', () => {
      const task = createCheckboxTask({
        rawText: '- [ ] NOW [#A] Task text',
        text: 'Task text',
        state: 'NOW',
        completed: false,
        priority: 'high',
      });

      const result = TaskWriter.generateTaskLine(
        task,
        'NOW',
        false,
        extendedKm(),
      );
      expect(result.newLine).toMatch('- [/] NOW Task text');
      expect(result.completed).toBe(false);
    });

    test('should handle checkbox with indented task', () => {
      const task = createCheckboxTask({
        rawText: '  - [ ] TODO Task text',
        text: 'Task text',
        state: 'TODO',
        completed: false,
        priority: null,
        indent: '  ',
      });

      const result = TaskWriter.generateTaskLine(
        task,
        'TODO',
        false,
        extendedKm(),
      );
      expect(result.newLine).toContain('- [ ] TODO Task text');
      expect(result.completed).toBe(false);
    });
  });
});
