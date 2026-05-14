/**
 * Tests for src/types/task.ts - verifies that type definitions and interfaces are correctly exported.
 */

import { Task, KeywordGroup, DateRepeatInfo } from '../src/types/task';
import { TFile } from 'obsidian';

describe('Task type definitions', () => {
  it('can construct a minimal Task object', () => {
    const task: Task = {
      path: 'test.md',
      line: 0,
      rawText: '- [ ] TODO test task',
      indent: '',
      listMarker: '- ',
      text: 'test task',
      state: 'TODO',
      completed: false,
      priority: null,
      scheduledDate: null,
      scheduledDateRepeat: null,
      deadlineDate: null,
      deadlineDateRepeat: null,
      closedDate: null,
      urgency: null,
      isDailyNote: false,
      dailyNoteDate: null,
      subtaskCount: 0,
      subtaskCompletedCount: 0,
    };

    expect(task.path).toBe('test.md');
    expect(task.state).toBe('TODO');
    expect(task.completed).toBe(false);
  });

  it('supports optional fields', () => {
    const repeatInfo: DateRepeatInfo = {
      type: '+',
      unit: 'd',
      value: 1,
      raw: '+1d',
    };

    const task: Task = {
      path: 'notes/project.md',
      line: 5,
      rawText: '- [x] DONE completed task',
      indent: '  ',
      listMarker: '- ',
      text: 'completed task',
      state: 'DONE',
      completed: true,
      priority: 'high',
      scheduledDate: new Date(2026, 0, 1),
      scheduledDateRepeat: repeatInfo,
      deadlineDate: new Date(2026, 0, 15),
      deadlineDateRepeat: null,
      closedDate: new Date(2026, 0, 10),
      urgency: 5.5,
      isDailyNote: false,
      dailyNoteDate: null,
      tags: ['project', 'urgent'],
      quoteNestingLevel: 1,
      subtaskCount: 2,
      subtaskCompletedCount: 1,
    };

    expect(task.priority).toBe('high');
    expect(task.tags).toEqual(['project', 'urgent']);
    expect(task.urgency).toBe(5.5);
    expect(task.subtaskCount).toBe(2);
    expect(task.subtaskCompletedCount).toBe(1);
    expect(task.scheduledDateRepeat).toEqual(repeatInfo);
  });

  it('allows TFile reference', () => {
    const mockFile = new TFile('daily/2026-01-01.md', '2026-01-01.md', 'md');

    const task: Task = {
      path: 'daily/2026-01-01.md',
      line: 3,
      rawText: 'TODO daily task',
      indent: '',
      listMarker: '',
      text: 'daily task',
      state: 'TODO',
      completed: false,
      priority: null,
      scheduledDate: null,
      scheduledDateRepeat: null,
      deadlineDate: null,
      deadlineDateRepeat: null,
      closedDate: null,
      urgency: null,
      file: mockFile,
      isDailyNote: true,
      dailyNoteDate: new Date(2026, 0, 1),
      subtaskCount: 0,
      subtaskCompletedCount: 0,
    };

    expect(task.file).toBe(mockFile);
    expect(task.isDailyNote).toBe(true);
  });

  it('DateRepeatInfo has correct structure', () => {
    const repeat: DateRepeatInfo = {
      type: '.+',
      unit: 'w',
      value: 2,
      raw: '.+2w',
    };

    expect(repeat.type).toBe('.+');
    expect(repeat.unit).toBe('w');
    expect(repeat.value).toBe(2);
    expect(repeat.raw).toBe('.+2w');
  });

  it('supports all keyword groups', () => {
    const groups: KeywordGroup[] = [
      'activeKeywords',
      'inactiveKeywords',
      'waitingKeywords',
      'completedKeywords',
      'archivedKeywords',
    ];

    expect(groups).toHaveLength(5);
  });
});
